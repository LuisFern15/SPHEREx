"""Genera archivos JSON con recortes reales de SPHEREx para un objetivo, en el formato del contrato.

Uso:
    python generar_snapshots.py barnard spherex_dr1 [--max 0] [--size 200] [--centro snapshot]

Pasos:
1. Resuelve el centro fijo del recorte (reutilizando un snapshot previo o la posición de hoy).
2. Busca en el SIA de IRSA las imágenes cuya huella contiene esa posición.
3. Si `--max` > 0, reparte candidatas entre visitas y bandas; si `--max` == 0, procesa todas.
4. Baja cada recorte, calcula dónde debe estar el objeto en la fecha de ESA imagen y
   descarta las imágenes donde cae fuera del recorte.
5. Escribe snapshots/<objetivo>_<colección>.json con provenance "cached".
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import logging
import math
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, TypeVar

# Solo se silencian los avisos de astropy que no aportan (WCS/FITS de SPHEREx); el resto se muestra.
from astropy.utils.exceptions import AstropyWarning

warnings.simplefilter("ignore", category=AstropyWarning)

import numpy as np
import requests
import astropy.units as u
from astropy.coordinates import Distance, SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astroquery.ipac.irsa import Irsa
from pyvo.dal.exceptions import DALQueryError, DALServiceError

from inventario_resumen import agrupar_visitas

logger = logging.getLogger("spherex.snapshots")

T = TypeVar("T")

ESCALA_PX: float = 6.15  # segundos de arco por píxel
SALIDA: Path = Path(__file__).parent / "snapshots"
CACHE: Path = Path(__file__).parent / "cache"

# Valores auditados (investigacion/auditoria.md, sección 9.1).
OBJETIVOS: dict[str, dict[str, Any]] = {
    "barnard": dict(ra=269.44850252543836, dec=4.739420051112412, epoca="J2016.0",
                    pmra=-801.5509783684709, pmdec=10362.394206546573,
                    paralaje=546.975939730948, vr=-110.46822,
                    fuente="Gaia DR3 4472832130942575872"),
    "epsindib": dict(ra=331.07645259656, dec=-56.79381206688, epoca="J2016.0",
                     pmra=3981.9767, pmdec=-2466.8318, paralaje=270.658, vr=0.0,
                     fuente="Gaia DR3 6412596012146801152"),
    "wise0855": dict(ra=133.780984, dec=-7.243932, epoca="MJD57633.39",
                     pmra=-8123.7, pmdec=673.2, paralaje=439.0, vr=0.0,
                     fuente="Kirkpatrick et al. 2021"),
    "rwaur": dict(ra=76.95631275, dec=30.40126037, epoca="J2016.0",
                  pmra=3.77, pmdec=-25.99, paralaje=6.41, vr=0.0,
                  fuente="Punto medio de Gaia DR3 156430817820015232 y 156430822114424576"),
    "rdra": dict(ra=248.16737836729, dec=66.75500674547, epoca="J2016.0",
                 pmra=-20.6428, pmdec=6.1488, paralaje=1.2509, vr=0.0,
                 fuente="Gaia DR3 1648328016354496384"),
}


def coordenada_base(obj: dict[str, Any]) -> SkyCoord:
    """
    Construye la coordenada astrométrica de referencia con movimiento propio del objetivo

    Parameters
    ----------
    `obj`:dict[str, Any] Diccionario de parámetros astrométricos del objetivo.

    Returns
    -------
    `SkyCoord` Coordenada ICRS en su época de referencia.
    """
    epoca = str(obj["epoca"])
    t = Time(float(epoca[3:]), format="mjd") if epoca.startswith("MJD") else Time(float(epoca[1:]), format="jyear")
    return SkyCoord(ra=obj["ra"] * u.deg, dec=obj["dec"] * u.deg,
                    pm_ra_cosdec=obj["pmra"] * u.mas / u.yr, pm_dec=obj["pmdec"] * u.mas / u.yr,
                    distance=Distance(parallax=obj["paralaje"] * u.mas),
                    radial_velocity=obj["vr"] * u.km / u.s, obstime=t, frame="icrs")


def resolver_centro(
    objetivo: str,
    modo: str = "snapshot",
    directorio_snapshots: Path = SALIDA,
) -> tuple[SkyCoord, str]:
    """
    Determina el centro fijo del recorte para consultar IRSA y reutilizar la caché en disco

    Parameters
    ----------
    `objetivo`:str Identificador del objetivo en `OBJETIVOS`.
    `modo`:str Modo de resolución (`snapshot` reutiliza `query.ra`/`query.dec` existente; `hoy` calcula hoy).
    `directorio_snapshots`:Path Carpeta donde buscar snapshots previos del objetivo.

    Returns
    -------
    `tuple[SkyCoord, str]` Coordenada ICRS del centro fijo y descripción de su procedencia.
    """
    if modo == "snapshot" and directorio_snapshots.exists():
        for ruta in sorted(directorio_snapshots.glob(f"{objetivo}_*.json")):
            try:
                datos = json.loads(ruta.read_text(encoding="utf-8"))
                consulta = datos["query"]
                centro = SkyCoord(
                    ra=float(consulta["ra"]) * u.deg,
                    dec=float(consulta["dec"]) * u.deg,
                    frame="icrs",
                )
                return centro, f"reutilizado de {ruta.name}"
            except (OSError, KeyError, ValueError, TypeError) as error:
                logger.warning("No se pudo leer centro de %s: %s", ruta.name, error)

    base = coordenada_base(OBJETIVOS[objetivo])
    hoy = Time(datetime.now(timezone.utc))
    pos = base.apply_space_motion(new_obstime=hoy)
    centro = SkyCoord(ra=pos.ra, dec=pos.dec, frame="icrs")
    origen = f"calculado hoy ({hoy.isot[:10]})" if modo == "hoy" else f"sin snapshot previo; calculado hoy ({hoy.isot[:10]})"
    return centro, origen


def con_reintentos(
    funcion: Callable[[], T],
    intentos: int = 5,
    espera: int = 15,
    nombre: str = "IRSA",
) -> T:
    """
    Ejecuta una operación de red reintentando ante errores transitorios de IRSA

    Parameters
    ----------
    `funcion`:Callable[[], T] Función sin argumentos que ejecuta la petición.
    `intentos`:int Número máximo de intentos.
    `espera`:int Segundos base de espera progresiva entre intentos.
    `nombre`:str Etiqueta descriptiva para los mensajes de reintento.

    Returns
    -------
    `T` Resultado devuelto por `funcion`.
    """
    excepciones_red = (
        DALServiceError,
        DALQueryError,
        requests.RequestException,
        ConnectionError,
        TimeoutError,
        OSError,
    )
    for i in range(intentos):
        try:
            return funcion()
        except excepciones_red as error:  # IRSA devuelve 502/503 de forma intermitente
            if i == intentos - 1:
                raise
            print(f"  {nombre}: fallo ({str(error)[:70]}); reintento en {espera * (i + 1)} s")
            time.sleep(espera * (i + 1))
    raise RuntimeError("inalcanzable")


def _banda_de_fila_sia(fila: Any) -> int:
    """
    Extrae el número de banda/detector (1 a 6) de una fila devuelta por el SIA de IRSA

    Parameters
    ----------
    `fila`:Any Fila de la tabla SIA de IRSA.

    Returns
    -------
    `int` Entero de banda (1 a 6) o 0 si no se identifica.
    """
    nombre = str(fila["energy_bandpassname"])
    return int(nombre.split("D")[-1]) if "D" in nombre else 0


def _repartir_por_visitas_y_bandas(
    elementos: list[Any],
    maximo: int,
    obtener_mjd: Callable[[Any], float],
    obtener_banda: Callable[[Any], int],
) -> list[Any]:
    """
    Selecciona hasta `maximo` elementos repartidos de forma equilibrada entre visitas y bandas

    Parameters
    ----------
    `elementos`:list[Any] Lista completa de elementos candidatos o cuadros.
    `maximo`:int Número máximo deseado (si `<= 0`, devuelve todos sin recortar).
    `obtener_mjd`:Callable[[Any], float] Extractor de instante MJD por elemento.
    `obtener_banda`:Callable[[Any], int] Extractor de número de banda por elemento.

    Returns
    -------
    `list[Any]` Subconjunto repartido entre visitas (>3 días) y bandas.
    """
    if maximo <= 0 or len(elementos) <= maximo:
        return list(elementos)

    envolturas = [
        {"mjd_inicio": obtener_mjd(el), "banda": obtener_banda(el), "item": el}
        for el in elementos
    ]
    grupos_visita = agrupar_visitas(envolturas, clave_mjd="mjd_inicio")

    # Para cada visita, creamos iteradores por banda con muestras espaciadas en tiempo dentro de esa visita/banda.
    colas_visitas: list[list[list[Any]]] = []
    for grupo in grupos_visita:
        por_banda: dict[int, list[Any]] = {}
        for env in grupo:
            por_banda.setdefault(env["banda"], []).append(env["item"])
        colas_bandas = [por_banda[b] for b in sorted(por_banda)]
        colas_visitas.append(colas_bandas)

    seleccionados: list[Any] = []
    puntero_banda_por_visita = [0] * len(colas_visitas)

    while len(seleccionados) < maximo:
        hubo_avance = False
        for idx_v, colas_bandas in enumerate(colas_visitas):
            if len(seleccionados) >= maximo:
                break
            if not colas_bandas:
                continue
            intentos_banda = 0
            while intentos_banda < len(colas_bandas):
                idx_b = puntero_banda_por_visita[idx_v] % len(colas_bandas)
                puntero_banda_por_visita[idx_v] += 1
                intentos_banda += 1
                if colas_bandas[idx_b]:
                    # Toma alternando extremos/centro para cubrir toda la duración de la visita.
                    cola = colas_bandas[idx_b]
                    pos = 0 if len(cola) % 2 == 1 else len(cola) // 2
                    seleccionados.append(cola.pop(pos))
                    hubo_avance = True
                    break
        if not hubo_avance:
            break

    return seleccionados


def elegir_candidatas(tabla: list[Any], maximo: int) -> list[Any]:
    """
    Reparte las candidatas entre visitas (>3 días) y bandas cuando hay un límite `maximo` > 0

    Parameters
    ----------
    `tabla`:list[Any] Filas devueltas por el SIA de IRSA.
    `maximo`:int Número objetivo de cuadros (`0` devuelve todas las filas).

    Returns
    -------
    `list[Any]` Lista de filas candidatas seleccionadas.
    """
    filas = list(tabla)
    if maximo <= 0:
        return filas
    objetivo_candidatas = math.ceil(maximo * 1.6)
    return _repartir_por_visitas_y_bandas(
        filas,
        objetivo_candidatas,
        obtener_mjd=lambda f: float(f["t_min"]),
        obtener_banda=_banda_de_fila_sia,
    )


def b64(arreglo: np.ndarray) -> str:
    """
    Codifica un arreglo NumPy contiguo en Base64 ASCII

    Parameters
    ----------
    `arreglo`:np.ndarray Arreglo de datos o banderas.

    Returns
    -------
    `str` Cadena Base64.
    """
    return base64.b64encode(np.ascontiguousarray(arreglo).tobytes()).decode("ascii")


def bajar_recorte(url: str, centro: SkyCoord, tamano_grados: float) -> bytes:
    """
    Baja el recorte FITS de IRSA o lo lee de la caché local si ya existe con el mismo centro y tamaño

    Parameters
    ----------
    `url`:str URL base de acceso al recorte en IRSA (`access_url`).
    `centro`:SkyCoord Centro fijo de recorte en ICRS.
    `tamano_grados`:float Tamaño angular del lado del recorte en grados.

    Returns
    -------
    `bytes` Contenido binario del archivo FITS.
    """
    CACHE.mkdir(exist_ok=True)
    clave = f"{Path(url.split('?')[0]).stem}__{centro.ra.deg:.5f}_{centro.dec.deg:+.5f}_{tamano_grados:.4f}.fits"
    archivo = CACHE / clave
    if archivo.exists():
        return archivo.read_bytes()

    def pedir() -> requests.Response:
        r = requests.get(
            url,
            params={"center": f"{centro.ra.deg},{centro.dec.deg}d", "size": f"{tamano_grados}"},
            timeout=120,
        )
        r.raise_for_status()  # dentro del reintento: IRSA devuelve 502/503 cuando está saturado
        return r

    contenido = con_reintentos(pedir, intentos=4, espera=10, nombre="recorte").content
    archivo.write_bytes(contenido)
    return contenido


def rejilla_comun(centro: SkyCoord, n: int) -> WCS:
    """
    Construye una cuadrícula TAN común de 6.15″/px centrada en `centro`

    Parameters
    ----------
    `centro`:SkyCoord Posición central de referencia en ICRS.
    `n`:int Dimensión impar en píxeles de la cuadrícula `[n, n]`.

    Returns
    -------
    `WCS` Objeto WCS en la convención estándar de FITS (fila 0 al sur, columna 0 al este).
    """
    s = ESCALA_PX / 3600.0
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [centro.ra.deg, centro.dec.deg]
    w.wcs.crpix = [(n - 1) / 2 + 1, (n - 1) / 2 + 1]  # FITS, origen 1
    w.wcs.cd = [[-s, 0.0], [0.0, s]]
    return w


def posicion_y_onda(
    h: fits.HDUList,
    base: SkyCoord,
    cabecera: fits.Header,
) -> dict[str, Any]:
    """
    Calcula la posición predicha del objetivo, la longitud de onda y los bits de banderas de la cabecera

    Parameters
    ----------
    `h`:fits.HDUList Archivo FITS multiextensión abierto de SPHEREx.
    `base`:SkyCoord Coordenada astrométrica de referencia con movimiento propio del objetivo.
    `cabecera`:fits.Header Cabecera de la extensión `IMAGE`.

    Returns
    -------
    `dict[str, Any]` Diccionario con `wcs`, `mjd`, `predicha`, `px`, `py`, `ix`, `iy`, `dentro`, `lam`, `banda_um` y `bits`.
    """
    wcs = WCS(cabecera)
    mjd = float(cabecera["MJD-AVG"])
    predicha = base.apply_space_motion(new_obstime=Time(mjd, format="mjd"))
    predicha = SkyCoord(ra=predicha.ra, dec=predicha.dec, frame="icrs")
    px, py = (float(v) for v in wcs.world_to_pixel(predicha))

    alto, ancho = h["IMAGE"].data.shape
    dentro = 0.5 <= px < ancho - 1.5 and 0.5 <= py < alto - 1.5
    ix = int(np.clip(round(px), 0, max(0, ancho - 1)))
    iy = int(np.clip(round(py), 0, max(0, alto - 1)))

    ondas = WCS(cabecera, fobj=h, key="W")
    ondas.sip = None
    centro_onda, ancho_banda = ondas.pixel_to_world(float(ix), float(iy))
    lam = float(centro_onda.to_value(u.um)) if hasattr(centro_onda, "to_value") else float(centro_onda)
    banda_um = float(ancho_banda.to_value(u.um)) if hasattr(ancho_banda, "to_value") else float(ancho_banda)

    bits: dict[str, int] = {}
    if "FLAGS" in h:
        for clave, valor in h["FLAGS"].header.items():
            if clave.startswith("MSKN"):
                bits[str(valor).strip()] = int(clave[4:])

    return {
        "wcs": wcs,
        "mjd": mjd,
        "predicha": predicha,
        "px": px,
        "py": py,
        "ix": ix,
        "iy": iy,
        "dentro": dentro,
        "lam": lam,
        "banda_um": banda_um,
        "bits": bits,
    }


def procesar(
    fila: Any,
    centro: SkyCoord,
    base: SkyCoord,
    tamano_grados: float,
    coleccion: str,
) -> tuple[tuple[dict[str, Any], dict[str, int], dict[str, Any]] | None, str | None]:
    """
    Baja y procesa un recorte cerrando el archivo FITS al terminar

    Parameters
    ----------
    `fila`:Any Fila del inventario SIA de IRSA.
    `centro`:SkyCoord Centro fijo de recorte.
    `base`:SkyCoord Coordenada astrométrica base del objetivo.
    `tamano_grados`:float Tamaño angular del recorte en grados.
    `coleccion`:str Nombre de la colección de IRSA.

    Returns
    -------
    `tuple[tuple[dict[str, Any], dict[str, int], dict[str, Any]] | None, str | None]` Resultado `(cuadro, bits, diagnostico)` o `(None, motivo_descarte)`.
    """
    url = str(fila["access_url"])
    with fits.open(io.BytesIO(bajar_recorte(url, centro, tamano_grados))) as h:
        return _procesar_hdul(h, url, fila, centro, base, tamano_grados, coleccion)


def _procesar_hdul(
    h: fits.HDUList,
    url: str,
    fila: Any,
    centro: SkyCoord,
    base: SkyCoord,
    tamano_grados: float,
    coleccion: str,
) -> tuple[tuple[dict[str, Any], dict[str, int], dict[str, Any]] | None, str | None]:
    """
    Reproyecta un FITS SPHEREx abierto a la cuadrícula común y construye el cuadro JSON

    Parameters
    ----------
    `h`:fits.HDUList FITS multiextensión abierto.
    `url`:str URL de origen del recorte.
    `fila`:Any Fila SIA asociada a la exposición.
    `centro`:SkyCoord Centro fijo de la cuadrícula de salida.
    `base`:SkyCoord Coordenada astrométrica base del objetivo.
    `tamano_grados`:float Tamaño angular del recorte en grados.
    `coleccion`:str Nombre de la colección de IRSA.

    Returns
    -------
    `tuple[tuple[dict[str, Any], dict[str, int], dict[str, Any]] | None, str | None]` Tupla con datos procesados o motivo de descarte.
    """
    imagen = h["IMAGE"].data.astype("<f4")
    banderas = h["FLAGS"].data.astype("<i4").view("<u4")
    cab = h["IMAGE"].header
    info = posicion_y_onda(h, base, cab)
    wcs: WCS = info["wcs"]
    mjd: float = info["mjd"]
    predicha: SkyCoord = info["predicha"]
    px: float = info["px"]
    py: float = info["py"]
    ix: int = info["ix"]
    iy: int = info["iy"]
    lam: float = info["lam"]
    banda_um: float = info["banda_um"]
    bits: dict[str, int] = info["bits"]

    alto, ancho = imagen.shape
    if not info["dentro"]:
        return None, f"fuera del recorte (predicha x={px:.1f}, y={py:.1f}; forma {alto}x{ancho})"

    # Reproyección por vecino más cercano a la cuadrícula común.
    n = int(round(tamano_grados * 3600 / ESCALA_PX)) | 1  # impar, para que el centro caiga en un píxel
    salida = rejilla_comun(centro, n)
    filas, columnas = np.mgrid[0:n, 0:n]
    cielo = salida.pixel_to_world(columnas.ravel(), filas.ravel())
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
    vecindad = imagen[max(0, iy - 1):iy + 2, max(0, ix - 1):ix + 2]
    cuadro = {
        "id": Path(url.split("?")[0]).stem,
        "obs_id": str(cab.get("OBSID", "")),
        "collection": coleccion,
        "mjd": mjd,
        "date": Time(mjd, format="mjd").isot[:19],
        "band": banda,
        "detector": int(cab.get("DETECTOR", banda)),
        "wave_um": {"center": round(lam, 4), "min": round(lam - banda_um / 2, 4), "max": round(lam + banda_um / 2, 4)},
        "shape": [n, n],
        "data": b64(datos),
        "flags": b64(marcas),
        "query_xy": [round(nqx, 3), round(nqy, 3)],
        "predicted_xy": [round(npx, 3), round(npy, 3)],
        "target_xy": [round(npx, 3), round(npy, 3)],
        "wcs": {"crval": [centro.ra.deg, centro.dec.deg], "crpix": [(n - 1) / 2 + 1, (n - 1) / 2 + 1],
                "cd": [[-ESCALA_PX / 3600.0, 0.0], [0.0, ESCALA_PX / 3600.0]]},
        "valid_fraction": round(float(validos.mean()), 3),
        "source_url": url,
    }
    diagnostico = {
        "flujo_predicho": float(np.nanmax(vecindad)) if np.isfinite(vecindad).any() else None,
        "fondo": float(np.nanmedian(imagen)),
        "bits_predicho": int(banderas[iy, ix]),
    }
    return (cuadro, bits, diagnostico), None


def main() -> None:
    """
    Punto de entrada CLI para generar snapshots JSON de recortes reales de SPHEREx

    Parameters
    ----------
    Ninguno.

    Returns
    -------
    `None`
    """
    p = argparse.ArgumentParser()
    p.add_argument("objetivo", choices=sorted(OBJETIVOS))
    p.add_argument("coleccion")
    p.add_argument("--max", type=int, default=0, help="máximo de cuadros (0 = todas las imágenes)")
    p.add_argument("--size", type=float, default=200.0, help="campo en segundos de arco")
    p.add_argument("--hilos", type=int, default=6)
    p.add_argument("--centro", choices=["snapshot", "hoy"], default="snapshot",
                   help="centro fijo: 'snapshot' reutiliza query.ra/dec existente; 'hoy' calcula la posición actual")
    a = p.parse_args()

    obj = OBJETIVOS[a.objetivo]
    base = coordenada_base(obj)
    centro, origen_centro = resolver_centro(a.objetivo, modo=a.centro, directorio_snapshots=SALIDA)
    tamano = a.size / 3600.0
    print(f"{a.objetivo} · {a.coleccion} · centro fijo {centro.ra.deg:.6f} {centro.dec.deg:+.6f} ({origen_centro})")

    tabla = con_reintentos(
        lambda: Irsa.query_sia(pos=(centro, 0.003 * u.deg), collection=a.coleccion, maxrec=10000),
        nombre="SIA",
    )
    print(f"  imágenes cuya huella contiene la posición: {len(tabla)}")
    if a.max == 0:
        candidatas = list(tabla)
    else:
        candidatas = elegir_candidatas(list(tabla), a.max)
    print(f"  candidatas a procesar: {len(candidatas)} (max={a.max if a.max > 0 else 'todas'})")

    cuadros: list[dict[str, Any]] = []
    bits: dict[str, int] = {}
    diagnosticos: list[tuple[str, int, dict[str, Any]]] = []
    descartes: list[str] = []
    total_candidatas = len(candidatas)

    with ThreadPoolExecutor(max_workers=a.hilos) as grupo:
        futuros = {grupo.submit(procesar, f, centro, base, tamano, a.coleccion): f for f in candidatas}
        for hechos, futuro in enumerate(as_completed(futuros), start=1):
            try:
                resultado, motivo = futuro.result()
            except (requests.RequestException, OSError, KeyError, ValueError, RuntimeError) as error:
                descartes.append(f"error ({error.__class__.__name__}): {str(error)[:80]}")
                resultado = None
                motivo = None
            if resultado is not None:
                cuadro, bits_cuadro, diag = resultado
                cuadros.append(cuadro)
                bits.update(bits_cuadro)
                diagnosticos.append((cuadro["date"], cuadro["band"], diag))
            elif motivo is not None:
                descartes.append(motivo)

            if hechos % 25 == 0 or hechos == total_candidatas:
                print(f"  progreso: {hechos}/{total_candidatas} · válidos: {len(cuadros)} · descartes: {len(descartes)}")

    if a.max > 0 and len(cuadros) > a.max:
        cuadros = _repartir_por_visitas_y_bandas(
            cuadros,
            a.max,
            obtener_mjd=lambda c: float(c["mjd"]),
            obtener_banda=lambda c: int(c["band"]),
        )
    cuadros.sort(key=lambda c: c["mjd"])

    SALIDA.mkdir(exist_ok=True)
    salida = {
        "query": {"ra": round(centro.ra.deg, 7), "dec": round(centro.dec.deg, 7), "size_arcsec": a.size, "collection": a.coleccion},
        "pixel_scale_arcsec": ESCALA_PX,
        "provenance": "cached",
        "cached": True,
        "grid_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "target": {"id": a.objetivo, "reference": obj["fuente"], "epoch": obj["epoca"], "pmra": obj["pmra"], "pmdec": obj["pmdec"]},
        "flag_bits": dict(sorted(bits.items(), key=lambda kv: kv[1])),
        "catalog_sources": [],
        "frames": cuadros,
        "notes": [
            f"Datos reales de IRSA ({a.coleccion}) guardados el {datetime.now(timezone.utc).date()}; no se actualizan solos.",
            f"{len(tabla)} imágenes contienen la posición en su huella; se probaron {len(candidatas)} y se descartaron {len(descartes)} porque el objeto cae fuera del recorte o hubo error.",
            "Todos los cuadros están reproyectados (vecino más cercano) a una misma cuadrícula TAN de 6.15\"/px centrada en query, en la convención estándar de FITS: fila 0 = borde SUR, columna 0 = borde ESTE; al dibujar con la fila 0 abajo queda el norte arriba y el este a la izquierda.",
            "query_xy y predicted_xy usan píxeles con origen 0 (x = columna, y = fila); wcs.crpix usa origen 1 como FITS; wcs.cd es exacto para esta cuadrícula.",
            "NaN en data = sin datos (fuera del detector en esa imagen); sus banderas valen 0.",
        ],
    }
    destino = SALIDA / f"{a.objetivo}_{a.coleccion}.json"
    destino.write_text(json.dumps(salida, separators=(",", ":")), encoding="utf-8")

    print(f"  cuadros válidos guardados: {len(cuadros)} · descartados: {len(descartes)}")
    print(f"  bandas: {sorted({c['band'] for c in cuadros})} · fechas: {cuadros[0]['date'][:10] if cuadros else '-'} a {cuadros[-1]['date'][:10] if cuadros else '-'}")
    print(f"  banderas de la cabecera: {salida['flag_bits']}")
    print(f"  archivo: {destino} ({destino.stat().st_size / 1e6:.2f} MB)")
    motivos: dict[str, int] = {}
    for d in descartes:
        clave_motivo = d.split(" (")[0]
        motivos[clave_motivo] = motivos.get(clave_motivo, 0) + 1
    print(f"  motivos de descarte: {motivos}")
    print("  diagnóstico (fecha, banda, flujo en la posición predicha / fondo, bits):")
    for fecha, banda, d in sorted(diagnosticos)[:12]:
        print(f"    {fecha[:10]} B{banda}  {d['flujo_predicho']!s:>10.10} / {d['fondo']:.2f}  bits={d['bits_predicho']}")


if __name__ == "__main__":
    main()