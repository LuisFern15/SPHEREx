"""Guarda el catálogo de referencia Gaia DR3 de cada objetivo en `backend/catalogo/<objetivo>.json`.

El backend sirve estos archivos en `/api/catalog?target=<objetivo>` y `exportar_estaticos.py`
los copia a `public/catalogo/` para el sitio sin backend.

Uso:
    python generar_catalogo.py            # los cinco objetivos
    python generar_catalogo.py barnard    # uno solo
"""
from __future__ import annotations

import argparse
import json
import re
from typing import Optional

from catalogo_gaia import DIR_CATALOGO, catalogo_gaia
from generar_snapshots import OBJETIVOS

# Campo grande para cubrir el desplazamiento de los objetivos rápidos (Barnard ~100″ en 10 años).
TAMANO_CAMPO_ARCSEC = 400.0


def id_gaia_objetivo(objetivo: str) -> Optional[str]:
    """
    `source_id` de Gaia DR3 del objetivo, si su fuente de referencia es Gaia DR3

    Parameters
    ----------
    `objetivo`:str Identificador en `OBJETIVOS`.

    Returns
    -------
    `str | None` Identificador de Gaia DR3 o `None`.
    """
    coincidencia = re.fullmatch(r"Gaia DR3 (\d+)", OBJETIVOS[objetivo]["fuente"])
    return coincidencia.group(1) if coincidencia else None


def generar(objetivo: str) -> int:
    """
    Consulta Gaia DR3 para un objetivo y guarda el archivo del catálogo

    Parameters
    ----------
    `objetivo`:str Identificador en `OBJETIVOS`.

    Returns
    -------
    `int` Número de fuentes guardadas.
    """
    obj = OBJETIVOS[objetivo]
    respuesta = catalogo_gaia(obj["ra"], obj["dec"], TAMANO_CAMPO_ARCSEC, id_gaia_objetivo(objetivo))
    respuesta["target"] = objetivo
    DIR_CATALOGO.mkdir(parents=True, exist_ok=True)
    (DIR_CATALOGO / f"{objetivo}.json").write_text(
        json.dumps(respuesta, ensure_ascii=False), encoding="utf-8"
    )
    return len(respuesta["catalog_sources"])


def main() -> None:
    """
    Genera los catálogos pedidos en la línea de comandos

    Returns
    -------
    `None`
    """
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("objetivos", nargs="*", help=f"Objetivos ({', '.join(sorted(OBJETIVOS))}); por defecto, todos.")
    pedidos = p.parse_args().objetivos or sorted(OBJETIVOS)
    desconocidos = [o for o in pedidos if o not in OBJETIVOS]
    if desconocidos:
        p.error(f"objetivos desconocidos: {', '.join(desconocidos)}")
    for objetivo in pedidos:
        print(f"{objetivo}: {generar(objetivo)} fuentes Gaia DR3")


if __name__ == "__main__":
    main()
