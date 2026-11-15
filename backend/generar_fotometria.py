"""Fotometría forzada por imagen de SPHEREx para un objetivo y una o varias colecciones.

Mide cada imagen en la posición predicha del objeto (movimiento propio, sin recentrar) con
`fotometria.medir_hdul` y escribe `backend/fotometria/<objetivo>_<colección>.json`. No genera
snapshots de imágenes: sirve también para colecciones que no se muestran en el visor
(por ejemplo, el campo profundo de R Draconis).

Uso:
    python generar_fotometria.py rdra spherex_dr1 spherex_qr3 [--solo-snapshot] [--size 200] [--hilos 6]
    python generar_fotometria.py rdra spherex_dr1_deep --hilos 8
    python generar_fotometria.py wise0855 spherex_dr1 --solo-snapshot --desde-inventario   # sin consultar IRSA

`--solo-snapshot` mide solo las imágenes que ya están en el snapshot de esa colección (rápido, usa la caché
y deja la curva de luz alineada con lo que muestra el visor). La caché de recortes es la misma del generador
(`backend/cache/` o la carpeta de `SPHEREX_CACHE_DIR`).
"""
from __future__ import annotations

import argparse
import io
import json
import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from astropy.coordinates import SkyCoord
from astropy.io import fits

from astrometria import coordenada_base
from fotometria import (
    FONDO_EXT_PX,
    FONDO_INT_PX,
    HALO_EXT_PX,
    HALO_INT_PX,
    RADIO_APERTURA_PX,
    medir_hdul,
)
from generar_snapshots import (
    OBJETIVOS,
    SALIDA as DIR_SNAPSHOTS,
    bajar_recorte,
    clave_de_url,
    consultar_imagenes,
    leer_lista,
    resolver_centro,
)

logger = logging.getLogger("spherex.fotometria")

DIR_FOTOMETRIA: Path = Path(__file__).parent / "fotometria"

# Anillos por objetivo saturado (medido en los snapshots: fracción de píxeles con banderas de daño por radio).
# R Draconis: 100% dañados hasta 5 px y 53% entre 5 y 7 px; 3% entre 7 y 10 px.
# Barnard: 80% dañados entre 2 y 3.5 px; 11% entre 3.5 y 5 px; ~1% más afuera.
ANILLOS_POR_OBJETIVO: dict[str, dict[str, tuple[float, float]]] = {
    "rdra": {"halo_px": (7.0, 10.0), "fondo_px": (11.0, 15.0)},
    "barnard": {"halo_px": (3.5, 5.0), "fondo_px": (7.0, 10.0)},
}


def _sanear_json(valor: Any) -> Any:
    """
    Reemplaza recursivamente flotantes no finitos (`NaN`/`Inf`) por `None` antes de serializar JSON

    Parameters
    ----------
    `valor`:Any Estructura Python arbitraria a serializar en JSON.

    Returns
    -------
    `Any` Estructura equivalente con todos los flotantes no finitos convertidos en `None`.
    """
    if isinstance(valor, float):
        return valor if math.isfinite(valor) else None
    if isinstance(valor, dict):
        return {k: _sanear_json(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [_sanear_json(v) for v in valor]
    return valor


def claves_de_snapshot(objetivo: str, coleccion: str) -> set[str] | None:
    """
    Lee las claves de las imágenes de un snapshot existente

    Parameters
    ----------
    `objetivo`:str Identificador del objetivo.
    `coleccion`:str Colección de IRSA.

    Returns
    -------
    `set[str] | None` Claves (`id` de cada cuadro), o None si no hay snapshot de esa colección.
    """
    ruta = DIR_SNAPSHOTS / f"{objetivo}_{coleccion}.json"
    if not ruta.exists():
        return None
    with ruta.open(encoding="utf-8") as fh:
        return {str(c["id"]) for c in json.load(fh)["frames"]}


def medir_fila(fila: Any, centro: SkyCoord, base: SkyCoord, tamano_grados: float, coleccion: str,
               anillos: dict[str, tuple[float, float]]) -> dict[str, Any]:
    """
    Baja (o lee de la caché) el recorte de una imagen y mide su fotometría

    Parameters
    ----------
    `fila`:Any Fila de la consulta SIA.
    `centro`:SkyCoord Centro fijo del recorte.
    `base`:SkyCoord Coordenada de referencia del objetivo con movimiento propio.
    `tamano_grados`:float Lado del recorte en grados.
    `coleccion`:str Colección de IRSA.
    `anillos`:dict[str, tuple[float, float]] Radios de halo y fondo (`halo_px`, `fondo_px`).

    Returns
    -------
    `dict[str, Any]` Medida de `fotometria.medir_imagen`.
    """
    url = str(fila["access_url"])
    contenido = bajar_recorte(url, centro, tamano_grados)
    with fits.open(io.BytesIO(contenido)) as h:
        return medir_hdul(h, url, fila, base, coleccion, **anillos)


def generar(objetivo: str, coleccion: str, centro: SkyCoord, origen_centro: str, a: argparse.Namespace) -> Path | None:
    """
    Mide todas las imágenes elegidas de una colección y escribe su archivo de fotometría

    Parameters
    ----------
    `objetivo`:str Identificador del objetivo.
    `coleccion`:str Colección de IRSA.
    `centro`:SkyCoord Centro fijo del recorte.
    `origen_centro`:str De dónde salió el centro (para las notas).
    `a`:argparse.Namespace Argumentos de la línea de comandos.

    Returns
    -------
    `Path | None` Archivo escrito, o None si no había imágenes.
    """
    base = coordenada_base(OBJETIVOS[objetivo])
    tabla = consultar_imagenes(objetivo, centro, coleccion, a.desde_inventario)
    filas = list(tabla)
    criterio = "todas las imágenes cuya huella contiene la posición"
    if a.lista:
        claves = leer_lista(a.lista)
        filas = [f for f in filas if clave_de_url(str(f["access_url"])) in claves]
        criterio = f"las imágenes de {a.lista.name}"
    elif a.solo_snapshot:
        claves = claves_de_snapshot(objetivo, coleccion)
        if claves is None:
            print(f"  {coleccion}: no hay snapshot; se miden todas las imágenes")
        else:
            filas = [f for f in filas if clave_de_url(str(f["access_url"])) in claves]
            criterio = "las mismas imágenes del snapshot del visor"
    print(f"{objetivo} · {coleccion}: {len(tabla)} imágenes en IRSA, se miden {len(filas)} ({criterio})")
    if not filas:
        return None

    anillos = ANILLOS_POR_OBJETIVO.get(objetivo, {"halo_px": (HALO_INT_PX, HALO_EXT_PX),
                                                  "fondo_px": (FONDO_INT_PX, FONDO_EXT_PX)})
    medidas: list[dict[str, Any]] = []
    errores: list[str] = []
    with ThreadPoolExecutor(max_workers=a.hilos) as grupo:
        futuros = {grupo.submit(medir_fila, f, centro, base, a.size / 3600.0, coleccion, anillos): f for f in filas}
        for hechas, futuro in enumerate(as_completed(futuros), start=1):
            try:
                medidas.append(futuro.result())
            except (requests.RequestException, OSError, KeyError, ValueError, RuntimeError) as error:
                errores.append(f"{error.__class__.__name__}: {str(error)[:80]}")
                logger.warning("Imagen no medida: %s", error)
            if hechas % 25 == 0 or hechas == len(filas):
                print(f"  progreso: {hechas}/{len(filas)} · medidas: {len(medidas)} · errores: {len(errores)}")

    medidas.sort(key=lambda m: float(m["mjd"]) if m.get("mjd") is not None else float("inf"))
    validas = sum(1 for m in medidas if m["valid"])
    halo = sum(1 for m in medidas if m["halo_valid"])
    salida = _sanear_json({
        "target": objetivo,
        "collection": coleccion,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "method": "aperture_forced",
        "aperture_px": RADIO_APERTURA_PX,
        "halo_px": list(anillos["halo_px"]),
        "annulus_px": list(anillos["fondo_px"]),
        "units": "µJy",
        "center": {"ra": round(centro.ra.deg, 7), "dec": round(centro.dec.deg, 7), "source": origen_centro},
        "notes": [
            "Fotometría de apertura forzada (radio 2 px) sin corrección de apertura ni de PSF: la PSF está "
            "submuestreada a 6.15″/px, así que el flujo es relativo, útil para comparar épocas de una misma banda.",
            f"El flujo se mide sobre IMAGE − ZODI − fondo local (anillo de {anillos['fondo_px'][0]:g} a "
            f"{anillos['fondo_px'][1]:g} px) en la posición predicha "
            "por movimiento propio, sin recentrar, en el recorte original (sin reproyectar).",
            "Píxeles con banderas de daño o artefacto no se suman; si se pierde más del 10% del peso de la "
            f"apertura, la medida no es válida (núcleos saturados). El halo ({anillos['halo_px'][0]:g} a "
            f"{anillos['halo_px'][1]:g} px) es un indicador relativo para fuentes saturadas, no un flujo total"
            + (": en este objetivo se mide más afuera porque la saturación se extiende varios píxeles."
               if objetivo in ANILLOS_POR_OBJETIVO else "."),
            f"Se midieron {criterio}: {len(medidas)} imágenes, {validas} con apertura válida y {halo} con halo "
            f"válido; {len(errores)} no se pudieron medir.",
        ],
        "measurements": medidas,
    })
    DIR_FOTOMETRIA.mkdir(exist_ok=True)
    destino = DIR_FOTOMETRIA / f"{objetivo}_{coleccion}.json"
    destino.write_text(
        json.dumps(salida, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )
    print(f"  {destino.name}: {len(medidas)} medidas · apertura válida {validas} · halo válido {halo} · "
          f"{destino.stat().st_size / 1e3:.0f} kB")
    return destino


def main() -> None:
    """Punto de entrada de la línea de comandos."""
    p = argparse.ArgumentParser()
    p.add_argument("objetivo", choices=sorted(OBJETIVOS))
    p.add_argument("colecciones", nargs="+")
    p.add_argument("--size", type=float, default=200.0, help="lado del recorte en segundos de arco (mismo que la caché)")
    p.add_argument("--hilos", type=int, default=6)
    p.add_argument("--centro", choices=["snapshot", "hoy"], default="snapshot")
    p.add_argument("--lista", type=Path, default=None, help="CSV con columna 'clave': mide solo esas imágenes")
    p.add_argument("--desde-inventario", action="store_true",
                   help="toma la lista de imágenes de backend/inventario/ en vez de consultar el SIA de IRSA")
    p.add_argument("--solo-snapshot", action="store_true",
                   help="mide solo las imágenes del snapshot existente de cada colección")
    a = p.parse_args()

    centro, origen = resolver_centro(a.objetivo, modo=a.centro, directorio_snapshots=DIR_SNAPSHOTS)
    print(f"centro fijo {centro.ra.deg:.6f} {centro.dec.deg:+.6f} ({origen})")
    for coleccion in a.colecciones:
        generar(a.objetivo, coleccion, centro, origen, a)


if __name__ == "__main__":
    main()
