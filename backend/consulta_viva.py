"""Consulta en vivo al SIA de IRSA para cualquier coordenada (Capa 1).

Reutiliza la descarga con caché atómica y la reproyección a cuadrícula TAN común
de `generar_snapshots.py` sin alterar los snapshots curados ni romper pruebas offline.
"""
from __future__ import annotations

import io
import logging
import math
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import astropy.units as u
import numpy as np
import requests
from astropy.coordinates import Distance, SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astroquery.ipac.irsa import Irsa
from fastapi import HTTPException
from pyvo.dal.exceptions import DALQueryError, DALServiceError

from generar_snapshots import (
    ESCALA_PX,
    _limpiar_num,
    _repartir_por_visitas_y_bandas,
    b64,
    bajar_recorte,
    con_reintentos,
    elegir_candidatas,
    rejilla_comun,
)

logger = logging.getLogger("spherex.live")

URL_SIA_IRSA = "https://irsa.ipac.caltech.edu/SIA"
RADIO_SIA_GRADOS = 0.003


def _consultar_sia_directo(centro: SkyCoord, coleccion: str) -> Any:
    """
    Consulta el SIA v2 de IRSA con un GET directo y devuelve la tabla de imágenes

    No pasa por /SIA/capabilities, que IRSA a veces tiene caído aunque la consulta funcione.

    Parameters
    ----------
    `centro`:SkyCoord Posición ICRS a consultar.
    `coleccion`:str Colección de IRSA (spherex_dr1 o spherex_qr3).

    Returns
    -------
    `astropy.table.Table` Las mismas columnas que devuelve Irsa.query_sia.
    """
    from astropy.io.votable import parse_single_table

    parametros = {
        "COLLECTION": coleccion,
        "POS": f"CIRCLE {centro.ra.deg:.6f} {centro.dec.deg:.6f} {RADIO_SIA_GRADOS}",
        "MAXREC": "5000",
        "RESPONSEFORMAT": "VOTABLE",
    }
    respuesta = requests.get(URL_SIA_IRSA, params=parametros, timeout=90)
    respuesta.raise_for_status()
    # use_names_over_ids: columnas por nombre (access_url, t_min...), como Irsa.query_sia
    return parse_single_table(io.BytesIO(respuesta.content)).to_table(use_names_over_ids=True)


def _consultar_sia(centro: SkyCoord, coleccion: str) -> Any:
    """
    Consulta SIA con astroquery y, si falla el endpoint de capabilities, con un GET directo

    Parameters
    ----------
    `centro`:SkyCoord Posición ICRS a consultar.
    `coleccion`:str Colección de IRSA.

    Returns
    -------
    `astropy.table.Table` Tabla de imágenes que cubren la posición.
    """
    try:
        return Irsa.query_sia(pos=(centro, RADIO_SIA_GRADOS * u.deg), collection=coleccion, maxrec=5000)
    except DALServiceError as error:
        logger.warning("SIA vía astroquery falló (%s); se intenta GET directo a %s", error.__class__.__name__, URL_SIA_IRSA)
        return _consultar_sia_directo(centro, coleccion)

# Caché en memoria de respuestas ya ensambladas para que filtrar por banda D1-D6 sea instantáneo.
_CACHE_RESPUESTAS_VIVAS: dict[tuple[Any, ...], dict[str, Any]] = {}
MAX_ENTRADAS_CACHE_VIVA = 24
PRESUPUESTO_VIVO_SEGUNDOS: float = 45.0
INTENTOS_RECORTE_VIVO: int = 2
ESPERA_RECORTE_VIVO: int = 2


def _construir_coordenada_objetivo(
    ra: float,
    dec: float,
    pmra: float = 0.0,
    pmdec: float = 0.0,
    epoch: str = "J2016.0",
    parallax: float = 0.0,
) -> tuple[SkyCoord, bool]:
    """Devuelve la coordenada base y si tiene movimiento propio no nulo."""
    tiene_movimiento = abs(pmra) > 0.0 or abs(pmdec) > 0.0
    if not tiene_movimiento:
        return SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs"), False

    ep = str(epoch).strip()
    t = Time(float(ep[3:]), format="mjd") if ep.upper().startswith("MJD") else Time(float(ep.lstrip("Jj")), format="jyear")
    kwargs: dict[str, Any] = {
        "ra": ra * u.deg,
        "dec": dec * u.deg,
        "pm_ra_cosdec": pmra * u.mas / u.yr,
        "pm_dec": pmdec * u.mas / u.yr,
        "obstime": t,
        "frame": "icrs",
    }
    if parallax > 0.0:
        kwargs["distance"] = Distance(parallax=parallax * u.mas)
    return SkyCoord(**kwargs), True


def _calcular_onda_y_bits(h: fits.HDUList, cab: fits.Header, ix: int, iy: int) -> tuple[float, float, dict[str, int]]:
    """Extrae longitud de onda del WCS alterno ('W') con respaldo a cabecera y tabla MSKN*."""
    try:
        ondas = WCS(cab, fobj=h, key="W")
        ondas.sip = None
        centro_onda, ancho_banda = ondas.pixel_to_world(float(ix), float(iy))
        lam = float(centro_onda.to_value(u.um)) if hasattr(centro_onda, "to_value") else float(centro_onda)
        banda_um = float(ancho_banda.to_value(u.um)) if hasattr(ancho_banda, "to_value") else float(ancho_banda)
    except Exception:
        lam = float(cab.get("WAVELEN", cab.get("WAVE", 1.0)))
        wmin = float(cab.get("WAVEMIN", lam * 0.98))
        wmax = float(cab.get("WAVEMAX", lam * 1.02))
        banda_um = max(0.0, wmax - wmin)

    bits: dict[str, int] = {}
    if "FLAGS" in h:
        for clave, valor in h["FLAGS"].header.items():
            if clave.startswith("MSKN"):
                bits[str(valor).strip()] = int(clave[4:])
    return lam, banda_um, bits


def _procesar_recorte_vivo(
    fila: Any,
    centro: SkyCoord,
    base: SkyCoord,
    tiene_movimiento: bool,
    tamano_grados: float,
    coleccion: str,
) -> tuple[dict[str, Any], dict[str, int]] | None:
    """Descarga (usando backend/cache/) y reproyecta un recorte FITS a la cuadrícula común."""
    url = str(fila["access_url"])
    contenido = bajar_recorte(
        url,
        centro,
        tamano_grados,
        intentos=INTENTOS_RECORTE_VIVO,
        espera=ESPERA_RECORTE_VIVO,
    )
    with fits.open(io.BytesIO(contenido)) as h:
        imagen = h["IMAGE"].data.astype("<f4")
        if "FLAGS" in h:
            banderas = h["FLAGS"].data.astype("<i4").view("<u4")
        else:
            banderas = np.zeros(imagen.shape, dtype="<u4")

        cab = h["IMAGE"].header
        wcs = WCS(cab)
        mjd = float(cab.get("MJD-AVG", cab.get("MJD-OBS", float(fila["t_min"]))))

        if tiene_movimiento and math.isfinite(mjd):
            movida = base.apply_space_motion(new_obstime=Time(mjd, format="mjd"))
            predicha = SkyCoord(ra=movida.ra, dec=movida.dec, frame="icrs")
        else:
            predicha = centro

        px, py = (float(v) for v in wcs.world_to_pixel(predicha))
        alto, ancho = imagen.shape
        if not (math.isfinite(px) and math.isfinite(py) and 0.5 <= px < ancho - 1.5 and 0.5 <= py < alto - 1.5):
            return None

        ix = int(np.clip(round(px), 0, max(0, ancho - 1)))
        iy = int(np.clip(round(py), 0, max(0, alto - 1)))
        lam, banda_um, bits = _calcular_onda_y_bits(h, cab, ix, iy)

        n = int(round(tamano_grados * 3600.0 / ESCALA_PX)) | 1
        salida = rejilla_comun(centro, n)
        filas_grid, cols_grid = np.mgrid[0:n, 0:n]
        cielo = salida.pixel_to_world(cols_grid.ravel(), filas_grid.ravel())
        ox, oy = wcs.world_to_pixel(cielo)
        ox, oy = np.round(ox).astype(int), np.round(oy).astype(int)
        validos = (ox >= 0) & (ox < ancho) & (oy >= 0) & (oy < alto)

        datos = np.full(n * n, np.nan, dtype="<f4")
        marcas = np.zeros(n * n, dtype="<u4")
        datos[validos] = imagen[oy[validos], ox[validos]]
        marcas[validos] = banderas[oy[validos], ox[validos]]
        datos, marcas = datos.reshape(n, n), marcas.reshape(n, n)

        npx, npy = (float(v) for v in salida.world_to_pixel(predicha))
        nqx, nqy = (float(v) for v in salida.world_to_pixel(centro))

        nombre_banda = str(fila["energy_bandpassname"])
        banda = int(nombre_banda.split("D")[-1]) if "D" in nombre_banda else int(cab.get("DETECTOR", 0))

        cuadro = {
            "id": Path(url.split("?")[0]).stem,
            "obs_id": str(cab.get("OBSID", "")),
            "collection": coleccion,
            "mjd": _limpiar_num(mjd),
            "date": Time(mjd, format="mjd").isot[:19] if math.isfinite(mjd) else "",
            "band": banda,
            "detector": int(cab.get("DETECTOR", banda)),
            "wave_um": {
                "center": _limpiar_num(lam, 4),
                "min": _limpiar_num(lam - banda_um / 2.0, 4),
                "max": _limpiar_num(lam + banda_um / 2.0, 4),
            },
            "shape": [n, n],
            "data": b64(datos),
            "flags": b64(marcas),
            "query_xy": [_limpiar_num(nqx, 3), _limpiar_num(nqy, 3)],
            "predicted_xy": [_limpiar_num(npx, 3), _limpiar_num(npy, 3)],
            "target_xy": [_limpiar_num(npx, 3), _limpiar_num(npy, 3)],
            "wcs": {
                "crval": [centro.ra.deg, centro.dec.deg],
                "crpix": [(n - 1) / 2 + 1, (n - 1) / 2 + 1],
                "cd": [[-ESCALA_PX / 3600.0, 0.0], [0.0, ESCALA_PX / 3600.0]],
            },
            "valid_fraction": _limpiar_num(float(validos.mean()), 3),
            "source_url": url,
        }
        return cuadro, bits


def consultar_irsa_en_vivo(
    ra: float,
    dec: float,
    size_arcsec: float,
    collection: str,
    max_frames: int = 10,
    pmra: float = 0.0,
    pmdec: float = 0.0,
    epoch: str = "J2016.0",
) -> dict[str, Any]:
    """Consulta IRSA SIA en vivo para una posición arbitraria y devuelve respuesta compatible con RawSpherexResponse."""
    clave_cache = (
        round(ra, 6),
        round(dec, 6),
        round(size_arcsec, 1),
        collection,
        max_frames,
        round(pmra, 4),
        round(pmdec, 4),
        epoch.strip(),
    )
    if clave_cache in _CACHE_RESPUESTAS_VIVAS:
        cached_resp = dict(_CACHE_RESPUESTAS_VIVAS[clave_cache])
        cached_resp["provenance"] = "cached"
        cached_resp["cached"] = True
        return cached_resp

    inicio = time.monotonic()
    colecciones = ["spherex_dr1", "spherex_qr3"] if collection in ("both", "spherex_both") else [collection]
    centro = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
    base, tiene_movimiento = _construir_coordenada_objetivo(ra, dec, pmra=pmra, pmdec=pmdec, epoch=epoch)
    tamano_grados = size_arcsec / 3600.0

    candidatas_por_col: list[tuple[str, Any]] = []
    total_en_irsa = 0
    limite_por_col = max(1, math.ceil(max_frames / len(colecciones)))

    for col in colecciones:
        try:
            tabla = list(
                con_reintentos(
                    lambda c=col: _consultar_sia(centro, c),
                    intentos=2,
                    espera=3,
                    nombre=f"SIA {col}",
                )
            )
        except (DALServiceError, DALQueryError, requests.RequestException, TimeoutError, OSError) as error:
            logger.warning("Fallo consultando SIA IRSA (%s) en %.5f, %.5f: %s", col, ra, dec, error)
            raise HTTPException(
                status_code=503,
                detail=f"IRSA SIA no respondió al consultar {col} ({error.__class__.__name__}). Intenta de nuevo en unos segundos.",
            ) from error

        total_en_irsa += len(tabla)
        for fila in elegir_candidatas(tabla, limite_por_col):
            candidatas_por_col.append((col, fila))

    if total_en_irsa == 0:
        raise HTTPException(
            status_code=404,
            detail=f"IRSA no reporta imágenes de SPHEREx cubriendo RA={ra:.5f}°, Dec={dec:+.5f}° en {collection}.",
        )

    cuadros: list[dict[str, Any]] = []
    bits: dict[str, int] = {}
    errores_descarga = 0
    consulta_parcial = False

    pool = ThreadPoolExecutor(max_workers=6)
    try:
        futuros = {
            pool.submit(_procesar_recorte_vivo, fila, centro, base, tiene_movimiento, tamano_grados, col): (col, fila)
            for col, fila in candidatas_por_col
        }
        restante = max(1.0, PRESUPUESTO_VIVO_SEGUNDOS - (time.monotonic() - inicio))
        try:
            for futuro in as_completed(futuros, timeout=restante):
                try:
                    res = futuro.result()
                    if res is not None:
                        cuadro, bits_cuadro = res
                        cuadros.append(cuadro)
                        bits.update(bits_cuadro)
                except (requests.RequestException, OSError, KeyError, ValueError) as error:
                    errores_descarga += 1
                    logger.warning("Recorte vivo descartado: %s", error)
        except FuturesTimeoutError:
            consulta_parcial = True
            logger.warning(
                "Presupuesto de tiempo (%.0f s) agotado en consulta viva; cuadros procesados: %d/%d",
                PRESUPUESTO_VIVO_SEGUNDOS,
                len(cuadros),
                len(futuros),
            )
            for futuro in futuros:
                if not futuro.done():
                    futuro.cancel()
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    if not cuadros:
        if consulta_parcial:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Se agotó el tiempo máximo ({int(PRESUPUESTO_VIVO_SEGUNDOS)} s) consultando IRSA "
                    "sin poder procesar ningún cuadro. Intenta de nuevo en unos segundos."
                ),
            )
        if errores_descarga > 0:
            raise HTTPException(
                status_code=503,
                detail="IRSA encontró imágenes en esta coordenada pero falló la descarga de recortes FITS. Reintenta.",
            )
        raise HTTPException(
            status_code=404,
            detail=f"Las imágenes encontradas en RA={ra:.5f}°, Dec={dec:+.5f}° quedaron fuera del recorte válido.",
        )

    if len(cuadros) > max_frames:
        cuadros = _repartir_por_visitas_y_bandas(
            cuadros,
            max_frames,
            obtener_mjd=lambda c: float(c["mjd"]),
            obtener_banda=lambda c: int(c["band"]),
        )
    cuadros.sort(key=lambda c: float(c["mjd"]) if c.get("mjd") is not None else float("inf"))

    if consulta_parcial:
        nota_resumen = (
            f"Consulta parcial en vivo a IRSA ({', '.join(colecciones)}): "
            f"se cargaron {len(cuadros)} cuadros de {total_en_irsa} exposiciones disponibles "
            f"antes de agotar el límite de {int(PRESUPUESTO_VIVO_SEGUNDOS)} s."
        )
    else:
        nota_resumen = (
            f"Consulta en vivo a IRSA ({', '.join(colecciones)}): "
            f"{len(cuadros)} cuadros cargados de {total_en_irsa} exposiciones disponibles en esta posición."
        )

    respuesta: dict[str, Any] = {
        "query": {"ra": ra, "dec": dec, "size_arcsec": size_arcsec, "collection": collection},
        "pixel_scale_arcsec": ESCALA_PX,
        "provenance": "live",
        "cached": False,
        "flag_bits": dict(sorted(bits.items(), key=lambda kv: kv[1])),
        "usingDefaultFlagBits": not bits,
        "target": None,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "catalog_sources": [],
        "frames": cuadros,
        "notes": [
            nota_resumen,
            "Cuadros reproyectados (vecino más cercano) a cuadrícula TAN común de 6.15″/px (norte arriba, este a la izquierda).",
        ],
    }

    # También se guardan las respuestas parciales (decisión del equipo): repetir la misma
    # posición responde al instante con los cuadros ya cargados; la nota sigue indicando
    # que la consulta fue parcial.
    if len(_CACHE_RESPUESTAS_VIVAS) >= MAX_ENTRADAS_CACHE_VIVA:
        _CACHE_RESPUESTAS_VIVAS.pop(next(iter(_CACHE_RESPUESTAS_VIVAS)))
    _CACHE_RESPUESTAS_VIVAS[clave_cache] = respuesta
    return respuesta
