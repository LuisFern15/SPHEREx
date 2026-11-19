"""Pruebas sin red del resolutor de nombres (Sesame) y de `/api/resolve`."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import resolver_nombres  # noqa: E402
from resolver_nombres import ErrorResolucion, interpretar_sesame, propagar_posicion  # noqa: E402

XML_BETELGEUSE = """<?xml version="1.0" encoding="UTF-8"?>
<Sesame><Target option="SNV"><name>Betelgeuse</name>
<Resolver name="Sc=Simbad (CDS, via client/server)">
<otype>s*r</otype><jradeg>88.79293899</jradeg><jdedeg>7.407064</jdedeg>
<pm><v>29.77</v><pmRA>27.54</pmRA><pmDE>11.30</pmDE></pm>
<plx><v>6.55</v></plx><spType>M1-M2Ia-Iab</spType>
<mag band="V"><v>0.42</v></mag><mag band="K"><v>-4.05</v></mag>
<oname>* alf Ori</oname></Resolver></Target></Sesame>"""

XML_M31 = """<?xml version="1.0" encoding="UTF-8"?>
<Sesame><Target option="SNV"><name>M31</name>
<Resolver name="Sc=Simbad (CDS, via client/server)">
<otype>AGN</otype><jradeg>10.68470833</jradeg><jdedeg>41.26875</jdedeg>
<oname>M  31</oname></Resolver></Target></Sesame>"""

XML_NADA = """<?xml version="1.0" encoding="UTF-8"?>
<Sesame><Target option="SNV"><name>zzz</name>
<INFO> *** Nothing found *** </INFO></Target></Sesame>"""

FECHA = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_betelgeuse_trae_tipo_magnitudes_y_propagacion() -> None:
    """Una estrella con movimiento propio se propaga 26 años desde J2000."""
    obj = interpretar_sesame(XML_BETELGEUSE, "Betelgeuse", FECHA)
    assert obj is not None
    assert obj["name"] == "* alf Ori"
    assert obj["resolver"] == "Simbad"
    assert obj["object_type_es"] == "Supergigante roja"
    assert obj["magnitudes"] == {"V": 0.42, "K": -4.05}
    assert obj["propagated"] is True
    assert obj["epoch"] == pytest.approx(2026.0)
    # 11.30 mas/año × 26 años = 293.8 mas en Dec.
    assert (obj["dec"] - 7.407064) * 3_600_000 == pytest.approx(293.8, abs=0.5)
    assert obj["ra"] > 88.79293899


def test_galaxia_sin_movimiento_propio_no_se_propaga() -> None:
    """Sin movimiento propio la posición queda en J2000 y el nombre se limpia."""
    obj = interpretar_sesame(XML_M31, "M31", FECHA)
    assert obj is not None
    assert obj["name"] == "M 31"
    assert obj["propagated"] is False
    assert obj["epoch"] == 2000.0
    assert obj["ra"] == pytest.approx(10.68470833)
    assert obj["object_type_en"] == "Active galactic nucleus"


def test_nombre_inexistente_devuelve_none() -> None:
    """Sesame sin resolutores con coordenadas significa objeto no encontrado."""
    assert interpretar_sesame(XML_NADA, "zzz", FECHA) is None


def test_propagacion_acota_cerca_del_polo() -> None:
    """Cerca del polo la declinación no pasa de 90° y la RA queda en [0, 360)."""
    ra, dec = propagar_posicion(359.9999, 89.99999, 50_000.0, 50_000.0, 100.0)
    assert 0.0 <= ra < 360.0
    assert dec <= 90.0


def test_endpoint_resolve_responde_404_y_502(monkeypatch: pytest.MonkeyPatch) -> None:
    """`/api/resolve` traduce "no encontrado" a 404 y la caída de Sesame a 502."""
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    import main

    cliente = TestClient(main.app)

    monkeypatch.setattr(main, "resolver_nombre", lambda nombre: None)
    assert cliente.get("/api/resolve", params={"name": "zzz"}).status_code == 404

    def caido(nombre: str) -> None:
        raise ErrorResolucion("timeout")

    monkeypatch.setattr(main, "resolver_nombre", caido)
    assert cliente.get("/api/resolve", params={"name": "Vega"}).status_code == 502

    monkeypatch.setattr(
        resolver_nombres, "_consultar_sesame", lambda nombre: XML_BETELGEUSE
    )
    monkeypatch.setattr(main, "resolver_nombre", resolver_nombres.resolver_nombre)
    resp = cliente.get("/api/resolve", params={"name": "Betelgeuse"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "* alf Ori"
