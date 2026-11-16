"""Catálogo de referencia Gaia DR3 para superponer en los recortes (capa `cat=1`).

Consulta Gaia DR3 en VizieR (I/355/gaiadr3) alrededor de una posición y devuelve fuentes con
posición en la época J2016.0 y movimiento propio, para que el frontend las lleve a la fecha de
cada imagen. Las respuestas se guardan en `backend/catalogo/cache/` para no repetir consultas, y
`generar_catalogo.py` deja un archivo por objetivo en `backend/catalogo/` para el sitio estático.
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Optional

import astropy.units as u
import requests
from astropy.coordinates import SkyCoord
from astroquery.vizier import Vizier

logger = logging.getLogger("spherex.catalogo")

DIR_CATALOGO: Path = Path(__file__).resolve().parent / "catalogo"
DIR_CACHE: Path = DIR_CATALOGO / "cache"
CATALOGO_VIZIER = "I/355/gaiadr3"
# El espejo de Harvard responde cuando el de Estrasburgo falla (y viceversa).
SERVIDORES_VIZIER = ("vizier.cfa.harvard.edu", "vizier.cds.unistra.fr")
EPOCA_GAIA = 2016.0
MAX_FUENTES = 300
FUENTES_CON_ETIQUETA = 8
TIEMPO_ESPERA_S = 30


def radio_para_campo(tamano_arcsec: float) -> float:
    """
    Radio de búsqueda que cubre las esquinas de un recorte cuadrado, con margen

    Parameters
    ----------
    `tamano_arcsec`:float Lado del recorte en segundos de arco.

    Returns
    -------
    `float` Radio en segundos de arco.
    """
    return tamano_arcsec * 0.75


def _num(valor: Any) -> Optional[float]:
    """
    Convierte un valor de tabla a float finito, o `None` si está enmascarado o no es finito

    Parameters
    ----------
    `valor`:Any Valor leído de una tabla de astropy.

    Returns
    -------
    `float | None` Número finito o `None`.
    """
    try:
        num = float(valor)
    except (TypeError, ValueError):
        return None
    return num if math.isfinite(num) else None


def _ruta_cache(ra: float, dec: float, radio_arcsec: float) -> Path:
    """
    Ruta del archivo de caché para una consulta

    Parameters
    ----------
    `ra`:float Ascensión recta del centro en grados.
    `dec`:float Declinación del centro en grados.
    `radio_arcsec`:float Radio de búsqueda en segundos de arco.

    Returns
    -------
    `Path` Archivo JSON de la caché.
    """
    return DIR_CACHE / f"gaia_{ra:.4f}_{dec:+.4f}_{radio_arcsec:.0f}.json"


def _consultar_vizier(centro: SkyCoord, radio_arcsec: float) -> list[dict[str, Any]]:
    """
    Pide a VizieR las fuentes Gaia DR3 del cono, probando los espejos en orden

    Parameters
    ----------
    `centro`:SkyCoord Centro del cono.
    `radio_arcsec`:float Radio del cono en segundos de arco.

    Returns
    -------
    `list[dict]` Filas con `source_id`, `ra`, `dec`, `pmra`, `pmdec` y `gmag`.
    """
    ultimo_error: Optional[Exception] = None
    for servidor in SERVIDORES_VIZIER:
        try:
            vizier = Vizier(
                columns=["Source", "RA_ICRS", "DE_ICRS", "pmRA", "pmDE", "Gmag"],
                row_limit=5000,
                timeout=TIEMPO_ESPERA_S,
                vizier_server=servidor,
            )
            tablas = vizier.query_region(centro, radius=radio_arcsec * u.arcsec, catalog=CATALOGO_VIZIER)
        except (requests.RequestException, OSError, ValueError) as error:
            logger.warning("VizieR %s no respondió: %s", servidor, error)
            ultimo_error = error
            continue
        if not tablas:
            return []
        filas = []
        for fila in tablas[0]:
            ra, dec = _num(fila["RA_ICRS"]), _num(fila["DE_ICRS"])
            if ra is None or dec is None:
                continue
            filas.append({
                "source_id": str(fila["Source"]),
                "ra": ra,
                "dec": dec,
                "pmra": _num(fila["pmRA"]),
                "pmdec": _num(fila["pmDE"]),
                "gmag": _num(fila["Gmag"]),
            })
        return filas
    raise ConnectionError(f"Ningún espejo de VizieR respondió ({ultimo_error})")


def a_fuentes_catalogo(filas: list[dict[str, Any]], id_objetivo: Optional[str] = None) -> list[dict[str, Any]]:
    """
    Convierte filas de Gaia al formato `CatalogSource` del frontend

    Ordena por brillo, se queda con las `MAX_FUENTES` más brillantes y etiqueta solo las
    `FUENTES_CON_ETIQUETA` más brillantes para no saturar el recorte. La fuente cuyo
    `source_id` coincide con el objetivo se marca como `target`.

    Parameters
    ----------
    `filas`:list[dict] Filas de `_consultar_vizier`.
    `id_objetivo`:str | None `source_id` de Gaia DR3 del objetivo, si se conoce.

    Returns
    -------
    `list[dict]` Fuentes con `id`, `label`, `ra`, `dec`, `epoch`, `pmra`, `pmdec`, `note` y `kind`.
    """
    ordenadas = sorted(filas, key=lambda f: f["gmag"] if f["gmag"] is not None else 99.0)[:MAX_FUENTES]
    fuentes = []
    for i, fila in enumerate(ordenadas):
        es_objetivo = id_objetivo is not None and fila["source_id"] == id_objetivo
        g = fila["gmag"]
        etiqueta = f"G {g:.1f}" if g is not None and (i < FUENTES_CON_ETIQUETA or es_objetivo) else ""
        fuentes.append({
            "id": f"gaia-{fila['source_id']}",
            "label": etiqueta,
            "ra": fila["ra"],
            "dec": fila["dec"],
            "epoch": EPOCA_GAIA,
            "pmra": fila["pmra"],
            "pmdec": fila["pmdec"],
            "note": f"Gaia DR3 {fila['source_id']}",
            "kind": "target" if es_objetivo else "reference",
        })
    return fuentes


def catalogo_gaia(
    ra: float,
    dec: float,
    tamano_arcsec: float,
    id_objetivo: Optional[str] = None,
) -> dict[str, Any]:
    """
    Fuentes Gaia DR3 que caen en un recorte, usando la caché en disco si existe

    Parameters
    ----------
    `ra`:float Ascensión recta del centro en grados.
    `dec`:float Declinación del centro en grados.
    `tamano_arcsec`:float Lado del recorte en segundos de arco.
    `id_objetivo`:str | None `source_id` de Gaia DR3 del objetivo, para marcarlo.

    Returns
    -------
    `dict` Respuesta con `catalog_sources`, `source`, `epoch`, `cached` y `notes`.
    """
    radio = radio_para_campo(tamano_arcsec)
    ruta = _ruta_cache(ra, dec, radio)
    if ruta.exists():
        filas = json.loads(ruta.read_text(encoding="utf-8"))
        en_cache = True
    else:
        filas = _consultar_vizier(SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs"), radio)
        DIR_CACHE.mkdir(parents=True, exist_ok=True)
        temporal = ruta.with_suffix(".tmp")
        temporal.write_text(json.dumps(filas), encoding="utf-8")
        temporal.replace(ruta)
        en_cache = False

    fuentes = a_fuentes_catalogo(filas, id_objetivo)
    return {
        "source": f"Gaia DR3 (VizieR {CATALOGO_VIZIER})",
        "epoch": EPOCA_GAIA,
        "cached": en_cache,
        "catalog_sources": fuentes,
        "notes": [
            f"{len(fuentes)} fuentes Gaia DR3 en {radio:.0f}″ alrededor del centro; posiciones J2016.0 "
            "llevadas a la fecha de cada imagen con su movimiento propio."
        ],
    }
