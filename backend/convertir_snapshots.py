"""Convierte los snapshots generados con la cuadrícula versión 1 a la versión 2.

Versión 1: fila 0 = norte, crpix con origen 0.
Versión 2: fila 0 = sur (convención estándar de FITS), crpix con origen 1.
La cuadrícula es simétrica respecto al píxel central, así que la conversión es exacta.

Uso: python convertir_snapshots.py [archivo.json ...]   (sin argumentos: todos los de snapshots/)
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np


def convertir_cuadro(cuadro: dict) -> None:
    """
    Voltea las filas de un cuadro y ajusta posiciones y WCS a la versión 2

    Parameters
    ----------
    `cuadro`:dict Cuadro del snapshot, modificado en el sitio.
    """
    alto, ancho = cuadro["shape"]
    for clave, tipo in (("data", "<f4"), ("flags", "<u4")):
        matriz = np.frombuffer(base64.b64decode(cuadro[clave]), dtype=tipo).reshape(alto, ancho)
        cuadro[clave] = base64.b64encode(np.ascontiguousarray(matriz[::-1]).tobytes()).decode("ascii")
    for clave in ("query_xy", "predicted_xy", "target_xy"):
        if clave in cuadro:
            cuadro[clave][1] = round(alto - 1 - cuadro[clave][1], 3)
    wcs = cuadro["wcs"]
    wcs["crpix"] = [wcs["crpix"][0] + 1, wcs["crpix"][1] + 1]
    wcs["cd"][1][1] = abs(wcs["cd"][1][1])


def convertir(ruta: Path) -> bool:
    """
    Convierte un archivo a la versión 2 si aún no lo está

    Parameters
    ----------
    `ruta`:Path Archivo JSON del snapshot.

    Returns
    -------
    `bool` True si se convirtió, False si ya estaba en la versión 2.
    """
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    if datos.get("grid_version", 1) >= 2:
        return False
    for cuadro in datos["frames"]:
        convertir_cuadro(cuadro)
    datos["grid_version"] = 2
    datos["notes"] = [
        n.replace("fila 0 = borde norte", "fila 0 = borde SUR")
        .replace("dibujar el arreglo tal cual deja el norte arriba", "al dibujar con la fila 0 abajo queda el norte arriba")
        .replace("wcs.crpix usan píxeles con origen 0", "wcs.crpix usa origen 1 como FITS; y los demás usan píxeles con origen 0")
        for n in datos["notes"]
    ]
    ruta.write_text(json.dumps(datos, separators=(",", ":")), encoding="utf-8")
    return True


if __name__ == "__main__":
    carpeta = Path(__file__).parent / "snapshots"
    archivos = [Path(a) for a in sys.argv[1:]] or sorted(carpeta.glob("*.json"))
    for archivo in archivos:
        print(("convertido " if convertir(archivo) else "ya en v2   "), archivo.name)
