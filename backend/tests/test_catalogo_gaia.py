"""Pruebas (sin red) del catálogo de referencia Gaia DR3."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import catalogo_gaia  # noqa: E402
from main import app  # noqa: E402

FILAS = [
    {"source_id": "2", "ra": 10.001, "dec": 20.0, "pmra": 5.0, "pmdec": -3.0, "gmag": 15.0},
    {"source_id": "1", "ra": 10.0, "dec": 20.0, "pmra": 1000.0, "pmdec": 2000.0, "gmag": 9.0},
    {"source_id": "3", "ra": 10.002, "dec": 20.001, "pmra": None, "pmdec": None, "gmag": None},
]


def test_fuentes_ordenadas_por_brillo_y_objetivo_marcado():
    """La más brillante va primero, el objetivo se marca y la fuente sin magnitud no lleva etiqueta."""
    fuentes = catalogo_gaia.a_fuentes_catalogo(FILAS, id_objetivo="1")
    assert [f["id"] for f in fuentes] == ["gaia-1", "gaia-2", "gaia-3"]
    assert fuentes[0]["kind"] == "target" and fuentes[1]["kind"] == "reference"
    assert fuentes[0]["label"] == "G 9.0" and fuentes[2]["label"] == ""
    assert fuentes[0]["epoch"] == 2016.0 and fuentes[0]["pmdec"] == 2000.0


def test_catalogo_usa_cache_en_disco(tmp_path):
    """La segunda consulta de la misma posición sale de la caché sin llamar a VizieR."""
    with patch.object(catalogo_gaia, "DIR_CACHE", tmp_path), \
         patch.object(catalogo_gaia, "_consultar_vizier", return_value=FILAS) as consulta:
        r1 = catalogo_gaia.catalogo_gaia(10.0, 20.0, 200.0)
        r2 = catalogo_gaia.catalogo_gaia(10.0, 20.0, 200.0)
    assert consulta.call_count == 1
    assert r1["cached"] is False and r2["cached"] is True
    assert len(r2["catalog_sources"]) == 3


def test_endpoint_catalogo_por_objetivo_y_error_de_vizier(tmp_path):
    """Con `target` se sirve el archivo guardado; si VizieR falla, 503 con detalle."""
    (tmp_path / "barnard.json").write_text('{"catalog_sources": [{"id": "gaia-1"}]}', encoding="utf-8")
    client = TestClient(app)
    with patch("main.DIR_CATALOGO", tmp_path):
        r = client.get("/api/catalog", params={"target": "barnard"})
        assert r.status_code == 200 and r.json()["catalog_sources"][0]["id"] == "gaia-1"
    with patch.object(catalogo_gaia, "DIR_CACHE", tmp_path / "cache"), \
         patch.object(catalogo_gaia, "_consultar_vizier", side_effect=ConnectionError("sin red")):
        r = client.get("/api/catalog", params={"ra": 50.0, "dec": 10.0})
        assert r.status_code == 503
