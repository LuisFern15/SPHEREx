"""Publica los snapshots como archivos estáticos para el sitio sin backend.

Copia backend/snapshots/*.json a public/snapshots/ y escribe public/snapshots/index.json, el índice que
lee el cliente (src/api/spherexClient.ts) cuando /api no responde.

Uso:
    python exportar_estaticos.py
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = Path(__file__).resolve().parent / "snapshots"
DESTINO = RAIZ / "public" / "snapshots"
# Misma distancia máxima que usa el backend (SNAPSHOT_MATCH_ARCSEC en main.py).
DISTANCIA_COINCIDENCIA_ARCSEC = 120.0


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


def main() -> None:
    """Copia los snapshots y escribe el índice."""
    DESTINO.mkdir(parents=True, exist_ok=True)
    for viejo in DESTINO.glob("*.json"):
        viejo.unlink()  # evita que quede un snapshot retirado sin avisar
    entradas = []
    for archivo in sorted(ORIGEN.glob("*.json")):
        shutil.copyfile(archivo, DESTINO / archivo.name)
        entradas.append(entrada_indice(archivo))
    indice = {"version": 1, "match_arcsec": DISTANCIA_COINCIDENCIA_ARCSEC, "snapshots": entradas}
    (DESTINO / "index.json").write_text(json.dumps(indice, indent=2, ensure_ascii=False), encoding="utf-8")
    total = sum((DESTINO / e["file"]).stat().st_size for e in entradas) / 1e6
    print(f"{len(entradas)} snapshots copiados a {DESTINO} ({total:.1f} MB)")
    for e in entradas:
        print(f"  {e['file']}: {e['target']} · {e['collection']} · {e['frames']} cuadros")


if __name__ == "__main__":
    main()
