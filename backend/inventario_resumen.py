"""Funciones comunes para agrupar visitas y resumir el inventario CSV de SPHEREx.

Este módulo no importa `generar_snapshots` ni `astroquery`, de modo que `main.py` y
`exportar_estaticos.py` pueden utilizarlo sin cargar dependencias de red.
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("spherex.inventario")

# Dos imágenes separadas por más de este tiempo pertenecen a visitas distintas.
SEPARACION_VISITAS_DIAS: float = 3.0


def agrupar_visitas(
    filas: list[dict[str, Any]],
    clave_mjd: str = "mjd_inicio",
    separacion_dias: float = SEPARACION_VISITAS_DIAS,
) -> list[list[dict[str, Any]]]:
    """
    Agrupa una lista de registros ordenados por tiempo en visitas consecutivas

    Parameters
    ----------
    `filas`:list[dict[str, Any]] Registros con marca de tiempo MJD.
    `clave_mjd`:str Nombre de la clave numérica MJD dentro de cada registro.
    `separacion_dias`:float Umbral máximo en días entre exposiciones de una misma visita.

    Returns
    -------
    `list[list[dict[str, Any]]]` Lista de visitas, cada una con sus registros ordenados por MJD.
    """
    ordenadas = sorted(filas, key=lambda r: float(r[clave_mjd]))
    grupos: list[list[dict[str, Any]]] = []
    for fila in ordenadas:
        mjd_actual = float(fila[clave_mjd])
        if grupos and (mjd_actual - float(grupos[-1][-1][clave_mjd])) <= separacion_dias:
            grupos[-1].append(fila)
        else:
            grupos.append([fila])
    return grupos


def visitas(filas: list[dict[str, Any]]) -> list[tuple[str, str, int]]:
    """
    Agrupa las imágenes en visitas (rachas separadas por más de SEPARACION_VISITAS_DIAS)

    Parameters
    ----------
    `filas`:list[dict[str, Any]] Filas ordenadas por fecha.

    Returns
    -------
    `list[tuple[str, str, int]]` Fecha de inicio, fecha de fin y número de imágenes de cada visita.
    """
    grupos = agrupar_visitas(filas, clave_mjd="mjd_inicio", separacion_dias=SEPARACION_VISITAS_DIAS)
    return [(g[0]["fecha"][:10], g[-1]["fecha"][:10], len(g)) for g in grupos]


def leer_csv_inventario(ruta_csv: Path) -> list[dict[str, Any]]:
    """
    Lee un archivo CSV de inventario de IRSA y convierte sus campos numéricos

    Parameters
    ----------
    `ruta_csv`:Path Ruta al archivo `<objetivo>_<coleccion>.csv`.

    Returns
    -------
    `list[dict[str, Any]]` Filas tipadas ordenadas por `mjd_inicio`.
    """
    filas: list[dict[str, Any]] = []
    with ruta_csv.open("r", encoding="utf-8", newline="") as fh:
        lector = csv.DictReader(fh)
        for fila in lector:
            filas.append({
                "obs_id": str(fila.get("obs_id", "")),
                "banda": int(fila.get("banda", 0)),
                "mjd_inicio": float(fila.get("mjd_inicio", 0.0)),
                "fecha": str(fila.get("fecha", "")),
                "exposicion_s": float(fila.get("exposicion_s", 0.0)),
                "lambda_min_um": float(fila.get("lambda_min_um", 0.0)),
                "lambda_max_um": float(fila.get("lambda_max_um", 0.0)),
                "publicado": str(fila.get("publicado", "")),
                "objetivo_campo": str(fila.get("objetivo_campo", "")),
                "access_url": str(fila.get("access_url", "")),
            })
    filas.sort(key=lambda f: f["mjd_inicio"])
    return filas


def resumir_coleccion_csv(coleccion: str, filas: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Construye el diccionario resumen de una colección a partir de sus filas de inventario

    Parameters
    ----------
    `coleccion`:str Nombre de la colección de IRSA (por ejemplo `spherex_dr1`).
    `filas`:list[dict[str, Any]] Filas del inventario ordenadas por fecha.

    Returns
    -------
    `dict[str, Any]` Conteo total, rango de fechas, número de visitas y conteo por banda.
    """
    conteo_bandas: dict[str, int] = {str(b): 0 for b in range(1, 7)}
    for fila in filas:
        b = int(fila.get("banda", 0))
        if 1 <= b <= 6:
            conteo_bandas[str(b)] += 1

    lista_visitas = visitas(filas) if filas else []
    fecha_inicio = filas[0]["fecha"][:10] if filas else None
    fecha_fin = filas[-1]["fecha"][:10] if filas else None

    return {
        "collection": coleccion,
        "images": len(filas),
        "date_range": {"start": fecha_inicio, "end": fecha_fin},
        "visits": len(lista_visitas),
        "by_band": conteo_bandas,
    }


def resumen_inventario_objetivo(
    objetivo: str,
    directorio_inventario: Path,
) -> dict[str, Any] | None:
    """
    Resume todos los CSV de inventario disponibles para un objetivo dado

    Parameters
    ----------
    `objetivo`:str Identificador del objetivo (por ejemplo `barnard`).
    `directorio_inventario`:Path Carpeta donde residen los archivos `<objetivo>_<coleccion>.csv`.

    Returns
    -------
    `dict[str, Any] | None` Resumen estructurado por colección o `None` si no hay CSV para el objetivo.
    """
    if not directorio_inventario.exists():
        return None

    prefijo = f"{objetivo}_"
    archivos = sorted(directorio_inventario.glob(f"{prefijo}*.csv"))
    if not archivos:
        return None

    colecciones: dict[str, dict[str, Any]] = {}
    total_imagenes = 0
    for ruta in archivos:
        coleccion = ruta.stem[len(prefijo):]
        try:
            filas = leer_csv_inventario(ruta)
        except (OSError, ValueError, KeyError) as error:
            logger.warning("CSV de inventario ignorado (%s): %s", ruta.name, error)
            continue
        resumen_col = resumir_coleccion_csv(coleccion, filas)
        colecciones[coleccion] = resumen_col
        total_imagenes += resumen_col["images"]

    if not colecciones:
        return None

    return {
        "target": objetivo,
        "total_images": total_imagenes,
        "collections": colecciones,
    }