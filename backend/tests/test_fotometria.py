"""Pruebas unitarias sin red para el módulo de fotometría y la validación de endpoints."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fotometria import (  # noqa: E402
    MJY_SR_A_UJY,
    medir_apertura,
    medir_imagen,
    pesos_anillo_subpixel,
)
from main import app, validate_photometry_params  # noqa: E402

BITS_TEST: dict[str, int] = {
    "TRANSIENT": 0,
    "OVERFLOW": 1,
    "MISSING_DATA": 9,
    "NONLINEAR": 15,
    "PERSIST": 17,
    "SOURCE": 21,
}


def _crear_escena_gaussiana(
    forma: tuple[int, int] = (33, 33),
    x0: float = 16.0,
    y0: float = 16.0,
    sigma_px: float = 0.6,
    flujo_total_mjysr_px: float = 10.0,
    fondo_cielo: float = 2.5,
    zodi_val: float = 1.2,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Construye mapas sintéticos IMAGE, ZODI, VARIANCE y FLAGS con una gaussiana 2D."""
    alto, ancho = forma
    filas, cols = np.mgrid[0:alto, 0:ancho].astype(np.float64)
    amplitud = flujo_total_mjysr_px / (2.0 * np.pi * (sigma_px ** 2))
    fuente = amplitud * np.exp(-(((cols - x0) ** 2 + (filas - y0) ** 2) / (2.0 * (sigma_px ** 2))))
    imagen = fuente + fondo_cielo + zodi_val
    zodi = np.full(forma, zodi_val, dtype=np.float64)
    varianza = np.full(forma, 0.01, dtype=np.float64)
    banderas = np.zeros(forma, dtype=np.uint32)
    return imagen, zodi, varianza, banderas


def test_fuente_gaussiana_flujo_conocido() -> None:
    """Apertura de 5 px recupera el flujo gaussiano dentro del 2%; la de 2 px es menor pero positiva."""
    flujo_total_mjysr = 12.0
    flujo_esperado_ujy = flujo_total_mjysr * MJY_SR_A_UJY
    imagen, zodi, varianza, banderas = _crear_escena_gaussiana(
        forma=(33, 33),
        x0=16.0,
        y0=16.0,
        sigma_px=0.6,
        flujo_total_mjysr_px=flujo_total_mjysr,
        fondo_cielo=3.0,
        zodi_val=1.5,
    )
    imagen_limpia = imagen - zodi

    ap_5 = medir_apertura(imagen_limpia, x=16.0, y=16.0, radio=5.0, varianza=varianza, fondo_mjysr=3.0)
    res_2 = medir_imagen(imagen, zodi, varianza, banderas, BITS_TEST, x=16.0, y=16.0)

    assert res_2["valid"] is True
    assert ap_5["flux_ujy"] == pytest.approx(flujo_esperado_ujy, rel=0.02)
    assert 0.0 < res_2["flux_ujy"] < ap_5["flux_ujy"]


def test_nucleo_saturado_invalida_apertura_pero_halo_valido() -> None:
    """Píxeles centrales con OVERFLOW invalidan la apertura central pero mantienen el halo positivo."""
    imagen, zodi, varianza, banderas = _crear_escena_gaussiana(sigma_px=1.2, flujo_total_mjysr_px=50.0)
    banderas[15:18, 15:18] |= np.uint32(1 << BITS_TEST["OVERFLOW"])

    res = medir_imagen(imagen, zodi, varianza, banderas, BITS_TEST, x=16.0, y=16.0)

    assert res["valid"] is False
    assert "saturado" in res["reason"]
    assert res["halo_valid"] is True
    assert res["halo_flux_ujy"] is not None and res["halo_flux_ujy"] > 0.0


def test_source_en_todo_el_anillo_usa_respaldo() -> None:
    """Si todo el anillo de fondo tiene SOURCE, activa el respaldo y marca bkg_source_contaminated."""
    imagen, zodi, varianza, banderas = _crear_escena_gaussiana()
    banderas[:, :] |= np.uint32(1 << BITS_TEST["SOURCE"])

    res = medir_imagen(imagen, zodi, varianza, banderas, BITS_TEST, x=16.0, y=16.0)

    assert res["valid"] is True
    assert res["bkg_source_contaminated"] is True


def test_pixel_persist_en_apertura_excluido() -> None:
    """Un píxel con PERSIST dentro de la apertura no se suma, n_bad == 1 y lost_weight_fraction es exacta."""
    imagen, zodi, varianza, banderas = _crear_escena_gaussiana(flujo_total_mjysr_px=10.0)
    # Contaminamos el píxel (y=16, x=17) con un valor enorme y bit PERSIST.
    imagen[16, 17] = 9999.0
    banderas[16, 17] |= np.uint32(1 << BITS_TEST["PERSIST"])

    pesos = pesos_anillo_subpixel(imagen.shape, x=16.0, y=16.0, radio_int=0.0, radio_ext=2.0)
    fraccion_esperada = float(pesos[16, 17] / np.sum(pesos))

    res = medir_imagen(imagen, zodi, varianza, banderas, BITS_TEST, x=16.0, y=16.0)

    assert res["valid"] is True
    assert res["n_bad"] == 1
    assert res["lost_weight_fraction"] == pytest.approx(fraccion_esperada, abs=1e-5)
    assert res["flux_ujy"] is not None and res["flux_ujy"] < 20.0 * MJY_SR_A_UJY


def test_source_en_apertura_valido_y_source_en_anillo_excluido() -> None:
    """SOURCE en apertura no invalida; SOURCE parcial en anillo se excluye del fondo sin respaldo."""
    imagen, zodi, varianza, banderas = _crear_escena_gaussiana(fondo_cielo=2.0, zodi_val=1.0)
    # SOURCE en la apertura central.
    banderas[15:18, 15:18] |= np.uint32(1 << BITS_TEST["SOURCE"])
    # Algunos píxeles con flujo artificial alto marcados con SOURCE en el anillo exterior (r ~ 8 px).
    imagen[8, 14:19] = 500.0
    banderas[8, 14:19] |= np.uint32(1 << BITS_TEST["SOURCE"])

    res = medir_imagen(imagen, zodi, varianza, banderas, BITS_TEST, x=16.0, y=16.0)

    assert res["valid"] is True
    assert res["bkg_source_contaminated"] is False
    assert res["bkg_mjysr"] == pytest.approx(2.0, abs=0.05)


def test_fondo_insuficiente_invalida_medida() -> None:
    """Si quedan menos de 20 píxeles válidos en el anillo incluso con respaldo, valid == False con reason."""
    imagen, zodi, varianza, banderas = _crear_escena_gaussiana()
    banderas[:, :] |= np.uint32(1 << BITS_TEST["MISSING_DATA"])
    # Dejamos solo 10 píxeles válidos en el anillo.
    banderas[8, 12:22] = np.uint32(0)

    res = medir_imagen(imagen, zodi, varianza, banderas, BITS_TEST, x=16.0, y=16.0)

    assert res["valid"] is False
    assert "20" in res["reason"]


def test_posicion_cerca_del_borde_sin_excepcion() -> None:
    """Una posición cuyo anillo de 10 px sale del recorte devuelve valid == False con reason sin lanzar excepción."""
    imagen, zodi, varianza, banderas = _crear_escena_gaussiana(forma=(33, 33))

    res = medir_imagen(imagen, zodi, varianza, banderas, BITS_TEST, x=4.0, y=16.0)

    assert res["valid"] is False
    assert res["halo_valid"] is False
    assert "borde" in res["reason"] or "sale" in res["reason"]


def test_lista_blanca_photometry_rechaza_traversal() -> None:
    """La validación de /api/photometry rechaza target=../main con HTTPException 400."""
    with pytest.raises(HTTPException) as exc_info:
        validate_photometry_params("../main", "spherex_dr1")
    assert exc_info.value.status_code == 400

    try:
        from fastapi.testclient import TestClient  # noqa: PLC0415

        cliente = TestClient(app)
        resp = cliente.get("/api/photometry", params={"target": "../main", "collection": "spherex_dr1"})
        assert resp.status_code == 400
    except RuntimeError:
        # Si httpx no está instalado en el entorno, la prueba directa de validate_photometry_params ya verificó el rechazo.
        pass