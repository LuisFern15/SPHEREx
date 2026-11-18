"""Resuelve nombres de objetos astronómicos a coordenadas con el servicio Sesame del CDS.

Sesame consulta SIMBAD, NED y VizieR. Si el objeto tiene movimiento propio, la posición
J2000 se lleva a la fecha actual para que la búsqueda apunte a donde está hoy.
"""
from __future__ import annotations

import logging
import math
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Optional
from urllib.parse import quote

import requests

registro = logging.getLogger("spherex.resolver")

ESPEJOS_SESAME: tuple[str, ...] = (
    "https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oxF/SNV?",
    "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxF/SNV?",
)
TIEMPO_ESPERA: tuple[float, float] = (4.0, 10.0)
LONGITUD_MAXIMA_NOMBRE = 100
EPOCA_REFERENCIA = 2000.0
MAS_POR_GRADO = 3_600_000.0

# Códigos de tipo de objeto de SIMBAD más comunes, con su descripción en español e inglés.
TIPOS_OBJETO: dict[str, tuple[str, str]] = {
    "*": ("Estrella", "Star"),
    "s*r": ("Supergigante roja", "Red supergiant"),
    "s*b": ("Supergigante azul", "Blue supergiant"),
    "s*y": ("Supergigante amarilla", "Yellow supergiant"),
    "RG*": ("Gigante roja", "Red giant"),
    "PM*": ("Estrella de alto movimiento propio", "High proper-motion star"),
    "BY*": ("Variable BY Draconis", "BY Draconis variable"),
    "BD*": ("Enana marrón", "Brown dwarf"),
    "WD*": ("Enana blanca", "White dwarf"),
    "LM*": ("Estrella de baja masa", "Low-mass star"),
    "V*": ("Estrella variable", "Variable star"),
    "Mi*": ("Variable tipo Mira", "Mira variable"),
    "LP*": ("Variable de periodo largo", "Long-period variable"),
    "C*": ("Estrella de carbono", "Carbon star"),
    "Or*": ("Variable tipo Orión", "Orion-type variable"),
    "TT*": ("Estrella T Tauri", "T Tauri star"),
    "Y*O": ("Objeto estelar joven", "Young stellar object"),
    "Em*": ("Estrella con líneas de emisión", "Emission-line star"),
    "Be*": ("Estrella Be", "Be star"),
    "EB*": ("Binaria eclipsante", "Eclipsing binary"),
    "SB*": ("Binaria espectroscópica", "Spectroscopic binary"),
    "**": ("Estrella doble o múltiple", "Double or multiple star"),
    "Ce*": ("Cefeida", "Cepheid"),
    "RR*": ("Variable RR Lyrae", "RR Lyrae variable"),
    "dS*": ("Variable Delta Scuti", "Delta Scuti variable"),
    "Pu*": ("Estrella pulsante", "Pulsating star"),
    "Er*": ("Estrella eruptiva", "Eruptive variable"),
    "Ro*": ("Variable por rotación", "Rotating variable"),
    "Ae*": ("Estrella Herbig Ae/Be", "Herbig Ae/Be star"),
    "HB*": ("Estrella de la rama horizontal", "Horizontal-branch star"),
    "AB*": ("Estrella de la rama asintótica", "Asymptotic giant branch star"),
    "WR*": ("Estrella Wolf-Rayet", "Wolf-Rayet star"),
    "No*": ("Nova", "Nova"),
    "SN*": ("Supernova", "Supernova"),
    "Pl": ("Exoplaneta", "Exoplanet"),
    "ISM": ("Medio interestelar", "Interstellar medium"),
    "Neb": ("Nebulosa", "Nebula"),
    "IG": ("Galaxias en interacción", "Interacting galaxies"),
    "LIN": ("Galaxia LINER", "LINER galaxy"),
    "Psr": ("Púlsar", "Pulsar"),
    "PN": ("Nebulosa planetaria", "Planetary nebula"),
    "HII": ("Región HII", "HII region"),
    "SNR": ("Remanente de supernova", "Supernova remnant"),
    "MoC": ("Nube molecular", "Molecular cloud"),
    "DNe": ("Nebulosa oscura", "Dark nebula"),
    "RNe": ("Nebulosa de reflexión", "Reflection nebula"),
    "GlC": ("Cúmulo globular", "Globular cluster"),
    "OpC": ("Cúmulo abierto", "Open cluster"),
    "Cl*": ("Cúmulo estelar", "Star cluster"),
    "G": ("Galaxia", "Galaxy"),
    "GiG": ("Galaxia en grupo", "Galaxy in group"),
    "GiC": ("Galaxia en cúmulo", "Galaxy in cluster"),
    "BiC": ("Galaxia más brillante de un cúmulo", "Brightest cluster galaxy"),
    "SBG": ("Galaxia con brote estelar", "Starburst galaxy"),
    "AGN": ("Núcleo galáctico activo", "Active galactic nucleus"),
    "Sy1": ("Galaxia Seyfert 1", "Seyfert 1 galaxy"),
    "Sy2": ("Galaxia Seyfert 2", "Seyfert 2 galaxy"),
    "QSO": ("Cuásar", "Quasar"),
    "ClG": ("Cúmulo de galaxias", "Galaxy cluster"),
}


class ErrorResolucion(Exception):
    """Ningún espejo de Sesame respondió (falla de red, no de nombre)."""


def _texto(nodo: Optional[ET.Element], ruta: str) -> Optional[str]:
    """
    Devuelve el texto limpio de un subnodo, o `None` si no existe

    Parameters
    ----------
    `nodo`:Optional[ET.Element] Nodo XML donde buscar.
    `ruta`:str Ruta relativa del subnodo.

    Returns
    -------
    `Optional[str]` Texto sin espacios sobrantes, o `None`.
    """
    if nodo is None:
        return None
    hijo = nodo.find(ruta)
    if hijo is None or hijo.text is None:
        return None
    valor = hijo.text.strip()
    return valor or None


def _numero(nodo: Optional[ET.Element], ruta: str) -> Optional[float]:
    """
    Devuelve el valor numérico de un subnodo, o `None` si no existe o no es número

    Parameters
    ----------
    `nodo`:Optional[ET.Element] Nodo XML donde buscar.
    `ruta`:str Ruta relativa del subnodo.

    Returns
    -------
    `Optional[float]` Número finito, o `None`.
    """
    texto = _texto(nodo, ruta)
    if texto is None:
        return None
    try:
        valor = float(texto)
    except ValueError:
        return None
    return valor if math.isfinite(valor) else None


def _anio_decimal(fecha: datetime) -> float:
    """
    Convierte una fecha a año decimal (por ejemplo 2026.88)

    Parameters
    ----------
    `fecha`:datetime Fecha con zona horaria.

    Returns
    -------
    `float` Año decimal.
    """
    inicio = datetime(fecha.year, 1, 1, tzinfo=timezone.utc)
    fin = datetime(fecha.year + 1, 1, 1, tzinfo=timezone.utc)
    return fecha.year + (fecha - inicio).total_seconds() / (fin - inicio).total_seconds()


def propagar_posicion(
    ra: float, dec: float, pmra: float, pmdec: float, anios: float
) -> tuple[float, float]:
    """
    Lleva una posición a otra fecha con movimiento propio lineal

    Basta para estrellas cercanas en pocas décadas; cerca de los polos el término en RA se acota.

    Parameters
    ----------
    `ra`:float Ascensión recta en grados.
    `dec`:float Declinación en grados.
    `pmra`:float Movimiento propio en RA (incluye cos δ), en mas/año.
    `pmdec`:float Movimiento propio en Dec, en mas/año.
    `anios`:float Años transcurridos desde la época de referencia.

    Returns
    -------
    `tuple[float, float]` Ascensión recta y declinación propagadas, en grados.
    """
    COS_MINIMO = 1e-6
    cos_dec = max(math.cos(math.radians(dec)), COS_MINIMO)
    nueva_dec = max(-90.0, min(90.0, dec + pmdec * anios / MAS_POR_GRADO))
    nueva_ra = (ra + pmra * anios / (MAS_POR_GRADO * cos_dec)) % 360.0
    return nueva_ra, nueva_dec


def interpretar_sesame(xml_texto: str, consulta: str, ahora: datetime) -> Optional[dict[str, Any]]:
    """
    Convierte la respuesta XML de Sesame en el diccionario que entrega la API

    Parameters
    ----------
    `xml_texto`:str Respuesta XML de Sesame.
    `consulta`:str Nombre que escribió el usuario.
    `ahora`:datetime Fecha a la que se propaga el movimiento propio.

    Returns
    -------
    `Optional[dict[str, Any]]` Datos del objeto, o `None` si ningún catálogo lo encontró.
    """
    raiz = ET.fromstring(xml_texto)
    for resolutor in raiz.iter("Resolver"):
        ra = _numero(resolutor, "jradeg")
        dec = _numero(resolutor, "jdedeg")
        if ra is None or dec is None:
            continue

        nombre_catalogo = (resolutor.get("name") or "").split("=", 1)[-1].split("(")[0].strip()
        nombre = _texto(resolutor, "oname") or consulta
        if nombre.startswith("NAME "):
            nombre = nombre[5:]
        nombre = " ".join(nombre.split())

        tipo = _texto(resolutor, "otype")
        descripcion = TIPOS_OBJETO.get(tipo or "")

        pm = resolutor.find("pm")
        pmra = _numero(pm, "pmRA")
        pmdec = _numero(pm, "pmDE")

        magnitudes: dict[str, float] = {}
        for mag in resolutor.findall("mag"):
            banda = mag.get("band")
            valor = _numero(mag, "v")
            if banda and valor is not None:
                magnitudes[banda] = valor

        anio_actual = _anio_decimal(ahora)
        propagada = pmra is not None and pmdec is not None and (pmra != 0.0 or pmdec != 0.0)
        if propagada:
            ra_hoy, dec_hoy = propagar_posicion(ra, dec, pmra, pmdec, anio_actual - EPOCA_REFERENCIA)
        else:
            ra_hoy, dec_hoy = ra, dec

        return {
            "query": consulta,
            "name": nombre,
            "resolver": nombre_catalogo or "Sesame",
            "object_type": tipo,
            "object_type_es": descripcion[0] if descripcion else None,
            "object_type_en": descripcion[1] if descripcion else None,
            "spectral_type": _texto(resolutor, "spType"),
            "ra_j2000": ra,
            "dec_j2000": dec,
            "pmra_mas_yr": pmra,
            "pmdec_mas_yr": pmdec,
            "parallax_mas": _numero(resolutor.find("plx"), "v"),
            "magnitudes": magnitudes,
            "ra": round(ra_hoy, 7),
            "dec": round(dec_hoy, 7),
            "propagated": propagada,
            "epoch": round(anio_actual, 3) if propagada else EPOCA_REFERENCIA,
            "simbad_url": "https://simbad.cds.unistra.fr/simbad/sim-id?Ident=" + quote(nombre),
        }
    return None


@lru_cache(maxsize=512)
def _consultar_sesame(nombre_normalizado: str) -> str:
    """
    Descarga la respuesta XML de Sesame probando cada espejo en orden

    Parameters
    ----------
    `nombre_normalizado`:str Nombre sin espacios sobrantes.

    Returns
    -------
    `str` Respuesta XML del primer espejo que contestó.
    """
    ultimo_error: Optional[Exception] = None
    for espejo in ESPEJOS_SESAME:
        try:
            respuesta = requests.get(espejo + quote(nombre_normalizado), timeout=TIEMPO_ESPERA)
            respuesta.raise_for_status()
            respuesta.encoding = "utf-8"
            if "<Sesame" in respuesta.text:
                return respuesta.text
            ultimo_error = ValueError("respuesta sin XML de Sesame")
        except requests.RequestException as error:
            ultimo_error = error
        registro.warning("Sesame no respondió en %s: %s", espejo, ultimo_error)
    raise ErrorResolucion(str(ultimo_error))


def resolver_nombre(nombre: str, ahora: Optional[datetime] = None) -> Optional[dict[str, Any]]:
    """
    Resuelve el nombre de un objeto a coordenadas actuales

    Parameters
    ----------
    `nombre`:str Nombre del objeto (Betelgeuse, M31, HD 39801...).
    `ahora`:Optional[datetime] Fecha de propagación; por defecto, el momento actual.

    Returns
    -------
    `Optional[dict[str, Any]]` Datos del objeto, o `None` si no se encontró.
    """
    normalizado = " ".join(nombre.split())
    if not normalizado or len(normalizado) > LONGITUD_MAXIMA_NOMBRE:
        return None
    xml_texto = _consultar_sesame(normalizado)
    return interpretar_sesame(xml_texto, normalizado, ahora or datetime.now(timezone.utc))
