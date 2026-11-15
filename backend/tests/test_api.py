"""Pruebas de integración de los endpoints HTTP usando los datos reales del repositorio."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

pytest.importorskip("httpx", reason="httpx es necesario para ejecutar TestClient de FastAPI")
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402


@pytest.fixture(scope="module")
def cliente() -> TestClient:
    """Cliente HTTP en memoria sobre la aplicación FastAPI real."""
    return TestClient(app)


def test_health_y_targets_devuelven_datos_reales(cliente: TestClient) -> None:
    """`/api/health` y `/api/targets` reflejan los snapshots y fotometrías guardados en disco."""
    resp_health = cliente.get("/api/health")
    assert resp_health.status_code == 200
    datos_health = resp_health.json()
    assert datos_health["status"] == "ok"
    assert "wise0855:spherex_dr1" in datos_health["snapshots"]

    resp_targets = cliente.get("/api/targets")
    assert resp_targets.status_code == 200
    objetivos = {t["id"]: t for t in resp_targets.json()["targets"]}
    assert "wise0855" in objetivos
    assert "spherex_dr1" in objetivos["wise0855"]["snapshot_collections"]
    assert "spherex_dr1" in objetivos["wise0855"]["photometry_collections"]


def test_frames_datos_reales_y_errores(cliente: TestClient) -> None:
    """`/api/frames` sirve posición real, devuelve 404 sin datos y 400 si la colección es inválida."""
    resp_ok = cliente.get(
        "/api/frames",
        params={"ra": 133.7577808, "dec": -7.2420239, "collection": "spherex_dr1"},
    )
    assert resp_ok.status_code == 200
    cuerpo = resp_ok.json()
    assert len(cuerpo["frames"]) > 0
    assert cuerpo["query"]["collection"] == "spherex_dr1"

    resp_vacio = cliente.get(
        "/api/frames",
        params={"ra": 0.0, "dec": 0.0, "collection": "spherex_dr1"},
    )
    assert resp_vacio.status_code == 404
    assert "detail" in resp_vacio.json()

    resp_col_invalida = cliente.get(
        "/api/frames",
        params={"ra": 133.7577808, "dec": -7.2420239, "collection": "no_existe"},
    )
    assert resp_col_invalida.status_code == 400
    assert "detail" in resp_col_invalida.json()


def test_inventory_valido_e_invalido(cliente: TestClient) -> None:
    """`/api/inventory` incluye `collection` en cada colección y devuelve 404 para objetivo desconocido."""
    resp_ok = cliente.get("/api/inventory", params={"target": "wise0855"})
    assert resp_ok.status_code == 200
    inv = resp_ok.json()
    assert inv["target"] == "wise0855"
    assert inv["collections"]["spherex_dr1"]["collection"] == "spherex_dr1"

    resp_404 = cliente.get("/api/inventory", params={"target": "desconocido"})
    assert resp_404.status_code == 404
    assert "detail" in resp_404.json()


def test_photometry_spherex_both_y_traversal(cliente: TestClient) -> None:
    """`/api/photometry` con `spherex_both` no muta caché con 1 colección y rechaza traversal."""
    resp_both_uno = cliente.get(
        "/api/photometry",
        params={"target": "wise0855", "collection": "spherex_both"},
    )
    assert resp_both_uno.status_code == 200
    datos_both = resp_both_uno.json()
    assert datos_both["collection"] == "spherex_both"
    assert "spherex_dr1" in datos_both["notes"][0]

    # Verificar que la copia en caché de spherex_dr1 no fue modificada.
    resp_dr1 = cliente.get(
        "/api/photometry",
        params={"target": "wise0855", "collection": "spherex_dr1"},
    )
    assert resp_dr1.status_code == 200
    assert resp_dr1.json()["collection"] == "spherex_dr1"

    resp_traversal = cliente.get(
        "/api/photometry",
        params={"target": "../main", "collection": "spherex_dr1"},
    )
    assert resp_traversal.status_code == 400
    assert "detail" in resp_traversal.json()
