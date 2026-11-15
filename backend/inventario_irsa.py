"""Inventario completo de imágenes de SPHEREx en IRSA para los cinco objetivos.

Para cada objetivo y colección consulta el SIA de IRSA con la posición de hoy y guarda:
- inventario/<objetivo>_<colección>.csv: una fila por imagen (obs_id, banda, fecha, longitudes de onda, exposición...);
- inventario/resumen.md: totales por banda, fechas, visitas y volumen estimado de descarga.

Uso:
    python inventario_irsa.py [--colecciones spherex_dr1 spherex_qr3]
"""
from __future__ import annotations

import argparse
import csv
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time
from astropy.utils.exceptions import AstropyWarning
from astroquery.ipac.irsa import Irsa
from pyvo.dal.exceptions import DALQueryError, DALServiceError

from generar_snapshots import OBJETIVOS, coordenada_base
from inventario_resumen import visitas

warnings.simplefilter("ignore", category=AstropyWarning)

SALIDA = Path(__file__).parent / "inventario"
CACHE_RECORTES = Path(__file__).parent / "cache"
# Tamaño medio de un recorte de 200″ bajado con el servicio de recortes (medido en backend/cache).
MB_POR_RECORTE = 3.9
COLUMNAS = ["obs_id", "banda", "mjd_inicio", "fecha", "exposicion_s", "lambda_min_um", "lambda_max_um",
            "publicado", "objetivo_campo", "access_url"]


def consultar(centro: SkyCoord, coleccion: str, intentos: int = 6) -> Any:
    """
    Consulta el SIA de IRSA con reintentos (IRSA devuelve 502/503 cuando está saturado)

    Parameters
    ----------
    `centro`:SkyCoord Posición del objetivo.
    `coleccion`:str Colección de IRSA.
    `intentos`:int Número máximo de intentos.

    Returns
    -------
    `Any` Tabla de astropy con una fila por imagen.
    """
    for intento in range(1, intentos + 1):
        try:
            return Irsa.query_sia(pos=(centro, 0.003 * u.deg), collection=coleccion, maxrec=10000)
        except (DALServiceError, DALQueryError, ConnectionError, OSError, ValueError) as error:
            if intento == intentos:
                raise
            print(f"    SIA falló ({error.__class__.__name__}); reintento {intento} en {10 * intento} s")
            time.sleep(10 * intento)
    raise RuntimeError("inalcanzable")


def filas_de_tabla(tabla: Any) -> list[dict[str, Any]]:
    """
    Convierte la tabla del SIA en filas simples

    Parameters
    ----------
    `tabla`:Any Tabla devuelta por `Irsa.query_sia`.

    Returns
    -------
    `list[dict[str, Any]]` Filas ordenadas por fecha.
    """
    filas = []
    for r in tabla:
        nombre = str(r["energy_bandpassname"])
        filas.append({
            "obs_id": str(r["obs_id"]),
            "banda": int(nombre.split("D")[-1]) if "D" in nombre else 0,
            "mjd_inicio": float(r["t_min"]),
            "fecha": Time(float(r["t_min"]), format="mjd").isot[:19],
            "exposicion_s": round(float(r["t_exptime"]), 1),
            "lambda_min_um": round(float(r["em_min"]) * 1e6, 4),
            "lambda_max_um": round(float(r["em_max"]) * 1e6, 4),
            "publicado": str(r["obs_release_date"])[:10],
            "objetivo_campo": str(r["target_name"]),
            "access_url": str(r["access_url"]),
        })
    filas.sort(key=lambda f: f["mjd_inicio"])
    return filas


def en_cache(filas: list[dict[str, Any]]) -> int:
    """
    Cuenta cuántas imágenes ya tienen un recorte bajado en backend/cache

    Parameters
    ----------
    `filas`:list[dict[str, Any]] Filas del inventario.

    Returns
    -------
    `int` Número de imágenes con al menos un recorte en caché.
    """
    if not CACHE_RECORTES.exists():
        return 0
    nombres = {p.name.split("__")[0] for p in CACHE_RECORTES.glob("*.fits")}
    return sum(1 for f in filas if Path(f["access_url"].split("?")[0]).stem in nombres)


def resumen_markdown(obj: str, coleccion: str, filas: list[dict[str, Any]]) -> str:
    """
    Escribe el resumen de un objetivo y colección en Markdown

    Parameters
    ----------
    `obj`:str Identificador del objetivo.
    `coleccion`:str Colección de IRSA.
    `filas`:list[dict[str, Any]] Filas del inventario.

    Returns
    -------
    `str` Bloque de Markdown.
    """
    if not filas:
        return f"### {obj} · {coleccion}\n\nSin imágenes.\n"
    por_banda = {b: [f for f in filas if f["banda"] == b] for b in range(1, 7)}
    vis = visitas(filas)
    lineas = [
        f"### {obj} · {coleccion}",
        "",
        f"- Imágenes: **{len(filas)}** · de {filas[0]['fecha'][:10]} a {filas[-1]['fecha'][:10]} · "
        f"{len(vis)} visitas · ya en caché: {en_cache(filas)}",
        f"- Descarga estimada de recortes de 200″: {len(filas) * MB_POR_RECORTE / 1000:.1f} GB "
        f"(JSON resultante ≈ {len(filas) * 12 / 1000:.1f} MB)",
        f"- Publicadas entre {min(f['publicado'] for f in filas)} y {max(f['publicado'] for f in filas)}",
        "",
        "| Banda | Imágenes | λ cubierta (µm) | Exposición típica (s) |",
        "| --- | --- | --- | --- |",
    ]
    for b, fs in por_banda.items():
        if fs:
            lam = f"{min(f['lambda_min_um'] for f in fs):.3f} a {max(f['lambda_max_um'] for f in fs):.3f}"
            expo = sorted(f["exposicion_s"] for f in fs)[len(fs) // 2]
            lineas.append(f"| D{b} | {len(fs)} | {lam} | {expo} |")
        else:
            lineas.append(f"| D{b} | 0 | - | - |")
    lineas += ["", "Visitas (inicio a fin: imágenes): " + "; ".join(f"{a} a {z}: {n}" for a, z, n in vis), ""]
    return "\n".join(lineas)


def main() -> None:
    """
    Recorre objetivos y colecciones, guarda los CSV y el resumen

    Parameters
    ----------
    Ninguno.

    Returns
    -------
    `None`
    """
    p = argparse.ArgumentParser()
    p.add_argument("--colecciones", nargs="+", default=["spherex_dr1", "spherex_qr3"])
    a = p.parse_args()

    SALIDA.mkdir(exist_ok=True)
    hoy = Time(datetime.now(timezone.utc))
    bloques = [f"# Inventario de imágenes de SPHEREx en IRSA\n\nGenerado el {hoy.isot[:16]} UTC con el SIA de IRSA "
               f"(huella que contiene la posición de hoy de cada objetivo).\n"]
    for obj, datos in OBJETIVOS.items():
        centro = coordenada_base(datos).apply_space_motion(new_obstime=hoy)
        centro = SkyCoord(ra=centro.ra, dec=centro.dec, frame="icrs")
        for coleccion in a.colecciones:
            print(f"{obj} · {coleccion}")
            try:
                filas = filas_de_tabla(consultar(centro, coleccion))
            except (DALServiceError, DALQueryError, ConnectionError, OSError, ValueError) as error:
                print(f"    error: {str(error)[:120]}")
                bloques.append(f"### {obj} · {coleccion}\n\nError al consultar IRSA: {error}\n")
                continue
            with (SALIDA / f"{obj}_{coleccion}.csv").open("w", newline="", encoding="utf-8") as fh:
                escritor = csv.DictWriter(fh, fieldnames=COLUMNAS)
                escritor.writeheader()
                escritor.writerows(filas)
            print(f"    {len(filas)} imágenes")
            bloques.append(resumen_markdown(obj, coleccion, filas))
    (SALIDA / "resumen.md").write_text("\n".join(bloques), encoding="utf-8")
    print(f"Resumen en {SALIDA / 'resumen.md'}")


if __name__ == "__main__":
    main()