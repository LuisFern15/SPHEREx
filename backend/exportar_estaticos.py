"""Publica snapshots, fotometría e inventario como archivos estáticos para el sitio sin backend.

Copia `backend/snapshots/*.json` a `public/snapshots/`, copia `backend/fotometria/*.json` a
`public/fotometria/`, genera `public/inventario/<objetivo>.json` y escribe `public/snapshots/index.json`.

Uso:
    python exportar_estaticos.py
"""
from __future__ import annotations

import json
import shutil
import warnings
from pathlib import Path
from typing import Any

from inventario_resumen import resumen_inventario_objetivo

RAIZ: Path = Path(__file__).resolve().parent.parent
BACKEND_DIR: Path = Path(__file__).resolve().parent
ORIGEN_SNAPSHOTS: Path = BACKEND_DIR / "snapshots"
ORIGEN_FOTOMETRIA: Path = BACKEND_DIR / "fotometria"
ORIGEN_INVENTARIO: Path = BACKEND_DIR / "inventario"

PUBLIC_DIR: Path = RAIZ / "public"
DESTINO_SNAPSHOTS: Path = PUBLIC_DIR / "snapshots"
DESTINO_FOTOMETRIA: Path = PUBLIC_DIR / "fotometria"
DESTINO_INVENTARIO: Path = PUBLIC_DIR / "inventario"

# Misma distancia máxima que usa el backend (SNAPSHOT_MATCH_ARCSEC en main.py).
DISTANCIA_COINCIDENCIA_ARCSEC: float = 120.0
UMBRAL_AVISO_PUBLIC_MB: float = 20.0


def entrada_indice(archivo: Path) -> dict[str, Any]:
    """
    Resume un snapshot para el índice

    Parameters
    ----------
    `archivo`:Path Ruta del JSON de snapshot.

    Returns
    -------
    `dict[str, Any]` Entrada con archivo, objetivo, colección, posición, tamaño y fecha de generación.
    """
    with archivo.open(encoding="utf-8") as fh:
        datos = json.load(fh)
    consulta = datos["query"]
    return {
        "file": archivo.name,
        "target": datos.get("target", {}).get("id", archivo.stem),
        "collection": consulta["collection"],
        "ra": float(consulta["ra"]),
        "dec": float(consulta["dec"]),
        "size_arcsec": float(consulta.get("size_arcsec", 200.0)),
        "generated_at": datos.get("generated_at", ""),
        "frames": len(datos["frames"]),
    }


def _limpiar_jsons(directorio: Path) -> None:
    """
    Crea el directorio si no existe y elimina archivos `.json` previos

    Parameters
    ----------
    `directorio`:Path Carpeta destino a preparar.

    Returns
    -------
    `None`
    """
    directorio.mkdir(parents=True, exist_ok=True)
    for viejo in directorio.glob("*.json"):
        viejo.unlink()


def exportar_fotometria() -> dict[str, list[str]]:
    """
    Copia los archivos JSON de fotometría a `public/fotometria/` y los agrupa por objetivo

    Parameters
    ----------
    Ninguno.

    Returns
    -------
    `dict[str, list[str]]` Mapa `objetivo -> lista de archivos JSON copiados`.
    """
    _limpiar_jsons(DESTINO_FOTOMETRIA)
    por_objetivo: dict[str, list[str]] = {}
    if not ORIGEN_FOTOMETRIA.exists():
        return por_objetivo

    for archivo in sorted(ORIGEN_FOTOMETRIA.glob("*.json")):
        shutil.copyfile(archivo, DESTINO_FOTOMETRIA / archivo.name)
        with archivo.open(encoding="utf-8") as fh:
            datos = json.load(fh)
        objetivo = str(datos.get("target", archivo.stem.split("_")[0]))
        por_objetivo.setdefault(objetivo, []).append(archivo.name)

    for lista in por_objetivo.values():
        lista.sort()
    return por_objetivo


def exportar_inventarios() -> list[str]:
    """
    Genera `public/inventario/<objetivo>.json` a partir de los CSV en `backend/inventario/`

    Parameters
    ----------
    Ninguno.

    Returns
    -------
    `list[str]` Lista de objetivos exportados.
    """
    _limpiar_jsons(DESTINO_INVENTARIO)
    if not ORIGEN_INVENTARIO.exists():
        return []

    objetivos = sorted({p.name.split("_")[0] for p in ORIGEN_INVENTARIO.glob("*_*.csv")})
    exportados: list[str] = []
    for objetivo in objetivos:
        resumen = resumen_inventario_objetivo(objetivo, ORIGEN_INVENTARIO)
        if resumen is None:
            continue
        destino = DESTINO_INVENTARIO / f"{objetivo}.json"
        destino.write_text(json.dumps(resumen, indent=2, ensure_ascii=False), encoding="utf-8")
        exportados.append(objetivo)
    return exportados


def tamano_total_mb(directorio: Path) -> float:
    """
    Calcula el tamaño acumulado en megabytes decimales de todos los archivos dentro de `directorio`

    Parameters
    ----------
    `directorio`:Path Carpeta raíz a medir.

    Returns
    -------
    `float` Tamaño total en MB (`bytes / 1e6`).
    """
    if not directorio.exists():
        return 0.0
    total_bytes = sum(p.stat().st_size for p in directorio.rglob("*") if p.is_file())
    return total_bytes / 1e6


def main() -> None:
    """
    Copia snapshots, fotometría e inventarios a `public/` y escribe el índice estático

    Parameters
    ----------
    Ninguno.

    Returns
    -------
    `None`
    """
    _limpiar_jsons(DESTINO_SNAPSHOTS)
    entradas: list[dict[str, Any]] = []
    if ORIGEN_SNAPSHOTS.exists():
        for archivo in sorted(ORIGEN_SNAPSHOTS.glob("*.json")):
            shutil.copyfile(archivo, DESTINO_SNAPSHOTS / archivo.name)
            entradas.append(entrada_indice(archivo))

    fotometria_por_objetivo = exportar_fotometria()
    inventarios_exportados = exportar_inventarios()

    indice = {
        "version": 1,
        "match_arcsec": DISTANCIA_COINCIDENCIA_ARCSEC,
        "snapshots": entradas,
        "photometry": fotometria_por_objetivo,
    }
    (DESTINO_SNAPSHOTS / "index.json").write_text(
        json.dumps(indice, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    mb_snapshots = sum((DESTINO_SNAPSHOTS / e["file"]).stat().st_size for e in entradas) / 1e6
    mb_public = tamano_total_mb(PUBLIC_DIR)

    print(f"{len(entradas)} snapshots copiados a {DESTINO_SNAPSHOTS} ({mb_snapshots:.1f} MB)")
    for e in entradas:
        print(f"  {e['file']}: {e['target']} · {e['collection']} · {e['frames']} cuadros")
    print(f"Fotometría exportada a {DESTINO_FOTOMETRIA}: {fotometria_por_objetivo}")
    print(f"Inventarios exportados a {DESTINO_INVENTARIO}: {inventarios_exportados}")
    print(f"Tamaño total de {PUBLIC_DIR}: {mb_public:.1f} MB")

    if mb_public > UMBRAL_AVISO_PUBLIC_MB:
        aviso = (
            f"AVISO: el directorio public/ ocupa {mb_public:.1f} MB "
            f"(supera el umbral recomendado de {UMBRAL_AVISO_PUBLIC_MB:.0f} MB)."
        )
        print(aviso)
        warnings.warn(aviso, stacklevel=2)


if __name__ == "__main__":
    main()