"""Pruebas unitarias (sin red) para la consulta en vivo de Capa 1."""
from __future__ import annotations

import io
import sys
from pathlib import Path
from unittest.mock import patch

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import consulta_viva  # noqa: E402
from main import app  # noqa: E402


def _crear_fits_sintetico_bytes(ra: float = 180.0, dec: float = 25.0) -> bytes:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [16.0, 16.0]
    s = 6.15 / 3600.0
    w.wcs.cd = [[-s, 0.0], [0.0, s]]

    cab = w.to_header()
    cab["MJD-AVG"] = 60850.5
    cab["DETECTOR"] = 3
    cab["OBSID"] = "TEST_OBS_001"
    cab["WAVELEN"] = 2.15
    cab["WAVEMIN"] = 2.10
    cab["WAVEMAX"] = 2.20

    img = np.ones((32, 32), dtype=np.float32) * 12.5
    flags = np.zeros((32, 32), dtype=np.int32)
    cab_flags = fits.Header()
    cab_flags["MSKN1"] = "OVERFLOW"
    cab_flags["MSKN21"] = "SOURCE"

    hdul = fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(data=img, header=cab, name="IMAGE"),
        fits.ImageHDU(data=flags, header=cab_flags, name="FLAGS"),
    ])
    buf = io.BytesIO()
    hdul.writeto(buf)
    return buf.getvalue()


def test_consulta_viva_coordenada_arbitraria_reproyecta_y_cachea():
    consulta_viva._CACHE_RESPUESTAS_VIVAS.clear()
    fits_bytes = _crear_fits_sintetico_bytes(ra=180.0, dec=25.0)
    fila_sia = [{
        "access_url": "https://irsa.example.org/test_frame_d3.fits",
        "energy_bandpassname": "SPHEREx-D3",
        "t_min": 60850.5,
    }]

    client = TestClient(app)
    with patch.object(consulta_viva.Irsa, "query_sia", return_value=fila_sia), \
         patch.object(consulta_viva, "bajar_recorte", return_value=fits_bytes):
        r1 = client.get("/api/frames", params={"ra": 180.0, "dec": 25.0, "collection": "spherex_dr1", "live": "true"})
        assert r1.status_code == 200
        body = r1.json()
        assert body["provenance"] == "live"
        assert body["target"] is None
        assert len(body["frames"]) == 1
        assert body["frames"][0]["band"] == 3
        assert body["flag_bits"] == {"OVERFLOW": 1, "SOURCE": 21}
        # Segunda llamada en la misma posición usa la caché en memoria.
        r2 = client.get("/api/frames", params={"ra": 180.0, "dec": 25.0, "collection": "spherex_dr1", "live": "true"})
        assert r2.status_code == 200
        assert r2.json()["provenance"] == "cached"


def test_consulta_viva_sin_cobertura_devuelve_404():
    consulta_viva._CACHE_RESPUESTAS_VIVAS.clear()
    client = TestClient(app)
    with patch.object(consulta_viva.Irsa, "query_sia", return_value=[]):
        r = client.get("/api/frames", params={"ra": 12.34, "dec": -45.67, "collection": "spherex_dr1", "live": "true"})
        assert r.status_code == 404