"""Utilidades astrométricas ligeras (sin red) para SPHEREx.

Calcula coordenadas de referencia con movimiento propio y proyecta la posición
predicha, la longitud de onda del detector y las banderas FITS sobre un recorte.
"""
from __future__ import annotations

import math
from typing import Any

import astropy.units as u
import numpy as np
from astropy.coordinates import Distance, SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS


def coordenada_base(obj: dict[str, Any]) -> SkyCoord:
    """
    Construye la coordenada astrométrica de referencia con movimiento propio del objetivo

    Parameters
    ----------
    `obj`:dict[str, Any] Diccionario de parámetros astrométricos del objetivo.

    Returns
    -------
    `SkyCoord` Coordenada ICRS en su época de referencia.
    """
    epoca = str(obj["epoca"])
    t = Time(float(epoca[3:]), format="mjd") if epoca.startswith("MJD") else Time(float(epoca[1:]), format="jyear")
    return SkyCoord(
        ra=obj["ra"] * u.deg,
        dec=obj["dec"] * u.deg,
        pm_ra_cosdec=obj["pmra"] * u.mas / u.yr,
        pm_dec=obj["pmdec"] * u.mas / u.yr,
        distance=Distance(parallax=obj["paralaje"] * u.mas),
        radial_velocity=obj["vr"] * u.km / u.s,
        obstime=t,
        frame="icrs",
    )


def posicion_y_onda(
    h: fits.HDUList,
    base: SkyCoord,
    cabecera: fits.Header,
) -> dict[str, Any]:
    """
    Calcula la posición predicha del objetivo, la longitud de onda y los bits de banderas de la cabecera

    Parameters
    ----------
    `h`:fits.HDUList Archivo FITS multiextensión abierto de SPHEREx.
    `base`:SkyCoord Coordenada astrométrica de referencia con movimiento propio del objetivo.
    `cabecera`:fits.Header Cabecera de la extensión `IMAGE`.

    Returns
    -------
    `dict[str, Any]` Diccionario con `wcs`, `mjd`, `predicha`, `px`, `py`, `ix`, `iy`, `dentro`, `lam`, `banda_um` y `bits`.
    """
    wcs = WCS(cabecera)
    mjd = float(cabecera["MJD-AVG"])
    predicha = base.apply_space_motion(new_obstime=Time(mjd, format="mjd"))
    predicha = SkyCoord(ra=predicha.ra, dec=predicha.dec, frame="icrs")
    px, py = (float(v) for v in wcs.world_to_pixel(predicha))

    alto, ancho = h["IMAGE"].data.shape
    if math.isfinite(px) and math.isfinite(py):
        dentro = 0.5 <= px < ancho - 1.5 and 0.5 <= py < alto - 1.5
        ix = int(np.clip(round(px), 0, max(0, ancho - 1)))
        iy = int(np.clip(round(py), 0, max(0, alto - 1)))
    else:
        dentro = False
        ix = 0
        iy = 0

    ondas = WCS(cabecera, fobj=h, key="W")
    ondas.sip = None
    centro_onda, ancho_banda = ondas.pixel_to_world(float(ix), float(iy))
    lam = float(centro_onda.to_value(u.um)) if hasattr(centro_onda, "to_value") else float(centro_onda)
    banda_um = float(ancho_banda.to_value(u.um)) if hasattr(ancho_banda, "to_value") else float(ancho_banda)

    bits: dict[str, int] = {}
    if "FLAGS" in h:
        for clave, valor in h["FLAGS"].header.items():
            if clave.startswith("MSKN"):
                bits[str(valor).strip()] = int(clave[4:])

    return {
        "wcs": wcs,
        "mjd": mjd,
        "predicha": predicha,
        "px": px,
        "py": py,
        "ix": ix,
        "iy": iy,
        "dentro": dentro,
        "lam": lam,
        "banda_um": banda_um,
        "bits": bits,
    }
