"""Fotometría de apertura forzada pura (sin red) sobre recortes originales de SPHEREx.

Mide el flujo en µJy sobre la imagen limpia (`IMAGE - ZODI - fondo local`) en la
posición predicha del objeto (sin recentrar y sin reproyectar), utilizando pesos
subpíxel de 10×10 y máscaras de bits leídas de la cabecera FITS (`MSKN*`).
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time

from astrometria import posicion_y_onda

ESCALA_PX: float = 6.15  # segundos de arco por píxel
ARCSEC_POR_RAD: float = 206264.806
OMEGA_PX_SR: float = (ESCALA_PX / ARCSEC_POR_RAD) ** 2  # ~8.890e-10 sr
MJY_SR_A_UJY: float = OMEGA_PX_SR * 1e12  # ~889.0 µJy por (MJy/sr)

RADIO_APERTURA_PX: float = 2.0
HALO_INT_PX: float = 2.0
HALO_EXT_PX: float = 3.5
FONDO_INT_PX: float = 6.0
FONDO_EXT_PX: float = 10.0
SUBMUESTREO: int = 10
MIN_PIXELES_FONDO: int = 20
MAX_FRACCION_PESO_PERDIDO: float = 0.10

# Banderas de exclusión de píxeles para fotometría y fondo (SOURCE se trata aparte).
BANDERAS_EXCLUSION: frozenset[str] = frozenset({
    "TRANSIENT",
    "OVERFLOW",
    "SUR_ERROR",
    "NONFUNC",
    "DICHROIC",
    "MISSING_DATA",
    "HOT",
    "COLD",
    "PHANMISS",
    "NONLINEAR",
    "PERSIST",
    "OUTLIER",
    "CROSSTALK",
    "GHOST",
    "GHOST_FPA",
    "GHOST_EXT",
    "STREAK",
    "BLOOM",
    "SNOWBALL",
    "HALO",
    "SATELLITE_HALO",
})


def construir_mascaras_banderas(bits_cabecera: dict[str, int]) -> tuple[np.uint32, np.uint32]:
    """
    Construye las máscaras de bits para exclusión general y para el bit `SOURCE`

    Parameters
    ----------
    `bits_cabecera`:dict[str, int] Mapa `NOMBRE_BANDERA -> numero_bit` leído de `MSKN*`.

    Returns
    -------
    `tuple[np.uint32, np.uint32]` Tupla `(mascara_exclusion, mascara_source)`.
    """
    mascara_exclusion = np.uint32(0)
    for nombre in BANDERAS_EXCLUSION:
        if nombre in bits_cabecera:
            mascara_exclusion |= np.uint32(1 << int(bits_cabecera[nombre]))
    mascara_source = (
        np.uint32(1 << int(bits_cabecera["SOURCE"]))
        if "SOURCE" in bits_cabecera
        else np.uint32(0)
    )
    return mascara_exclusion, mascara_source


def pesos_anillo_subpixel(
    forma: tuple[int, int],
    x: float,
    y: float,
    radio_int: float,
    radio_ext: float,
    submuestreo: int = SUBMUESTREO,
) -> np.ndarray:
    """
    Calcula la fracción de área de cada píxel dentro de un anillo `[radio_int, radio_ext]`

    Parameters
    ----------
    `forma`:tuple[int, int] Dimensiones `(alto, ancho)` de la imagen.
    `x`:float Columna del centro (origen 0).
    `y`:float Fila del centro (origen 0).
    `radio_int`:float Radio interior en píxeles (`0.0` para apertura circular).
    `radio_ext`:float Radio exterior en píxeles.
    `submuestreo`:int Divisiones por eje dentro de cada píxel (`10` equivale a 10×10).

    Returns
    -------
    `np.ndarray` Matriz 2D `float64` con pesos en `[0.0, 1.0]`.
    """
    alto, ancho = forma
    pesos = np.zeros((alto, ancho), dtype=np.float64)
    if radio_ext <= 0.0 or radio_ext <= radio_int or not (math.isfinite(x) and math.isfinite(y)):
        return pesos

    x0 = max(0, int(math.floor(x - radio_ext - 1.0)))
    x1 = min(ancho, int(math.ceil(x + radio_ext + 2.0)))
    y0 = max(0, int(math.floor(y - radio_ext - 1.0)))
    y1 = min(alto, int(math.ceil(y + radio_ext + 2.0)))
    if x1 <= x0 or y1 <= y0:
        return pesos

    desplazamientos = (np.arange(submuestreo, dtype=np.float64) + 0.5) / submuestreo - 0.5
    cols = np.arange(x0, x1, dtype=np.float64)[:, None] + desplazamientos[None, :]
    filas = np.arange(y0, y1, dtype=np.float64)[:, None] + desplazamientos[None, :]

    dx2 = (cols - x) ** 2  # (nx, sub)
    dy2 = (filas - y) ** 2  # (ny, sub)
    dist2 = dy2[:, None, :, None] + dx2[None, :, None, :]  # (ny, nx, sub, sub)

    r_int2 = radio_int * radio_int
    r_ext2 = radio_ext * radio_ext
    if radio_int <= 0.0:
        dentro = dist2 <= r_ext2
    else:
        dentro = (dist2 > r_int2) & (dist2 <= r_ext2)

    pesos[y0:y1, x0:x1] = np.mean(dentro, axis=(2, 3))
    return pesos


def region_dentro_de_recorte(
    forma: tuple[int, int],
    x: float,
    y: float,
    radio_max: float,
) -> bool:
    """
    Verifica que un círculo de radio `radio_max` centrado en `(x, y)` no se salga del recorte

    Parameters
    ----------
    `forma`:tuple[int, int] Dimensiones `(alto, ancho)` del recorte.
    `x`:float Columna del centro (origen 0).
    `y`:float Fila del centro (origen 0).
    `radio_max`:float Radio máximo requerido en píxeles.

    Returns
    -------
    `bool` `True` si toda la región cae dentro de los límites físicos del recorte.
    """
    alto, ancho = forma
    if not (math.isfinite(x) and math.isfinite(y)):
        return False
    return (
        (x - radio_max) >= -0.5
        and (x + radio_max) <= (ancho - 0.5)
        and (y - radio_max) >= -0.5
        and (y + radio_max) <= (alto - 0.5)
    )


def estimar_fondo_local(
    imagen_limpia: np.ndarray,
    banderas: np.ndarray,
    x: float,
    y: float,
    mascara_exclusion: np.uint32,
    mascara_source: np.uint32,
    radio_int: float = FONDO_INT_PX,
    radio_ext: float = FONDO_EXT_PX,
) -> tuple[float, float, int, bool]:
    """
    Estima el fondo local mediante mediana sigma-recortada con MAD (3σ, 3 iteraciones) en un anillo

    Parameters
    ----------
    `imagen_limpia`:np.ndarray Imagen `IMAGE - ZODI` en MJy/sr.
    `banderas`:np.ndarray Máscara `uint32` de banderas por píxel.
    `x`:float Columna del centro (origen 0).
    `y`:float Fila del centro (origen 0).
    `mascara_exclusion`:np.uint32 Máscara de bits malos que siempre se excluyen.
    `mascara_source`:np.uint32 Bit `SOURCE` (excluido en primera pasada, permitido en respaldo).
    `radio_int`:float Radio interior del anillo de fondo en píxeles.
    `radio_ext`:float Radio exterior del anillo de fondo en píxeles.

    Returns
    -------
    `tuple[float, float, int, bool]` `(fondo_mjysr, sigma_mad_mjysr, n_pixeles, contaminado_por_source)`.
    """
    alto, ancho = imagen_limpia.shape
    filas, cols = np.mgrid[0:alto, 0:ancho]
    dist = np.hypot(cols - x, filas - y)
    en_anillo = (dist >= radio_int) & (dist <= radio_ext)
    sin_malos = en_anillo & np.isfinite(imagen_limpia) & ((banderas & mascara_exclusion) == 0)

    def _sigma_clip(valores: np.ndarray) -> tuple[float, float, int]:
        actuales = valores.astype(np.float64, copy=True)
        for _ in range(3):
            if actuales.size == 0:
                break
            med = float(np.median(actuales))
            sigma_mad = 1.4826 * float(np.median(np.abs(actuales - med)))
            if sigma_mad <= 0.0:
                break
            filtrados = actuales[np.abs(actuales - med) <= 3.0 * sigma_mad]
            if filtrados.size == actuales.size or filtrados.size == 0:
                actuales = filtrados if filtrados.size > 0 else actuales
                break
            actuales = filtrados
        if actuales.size == 0:
            return float("nan"), float("nan"), 0
        med_final = float(np.median(actuales))
        sigma_final = 1.4826 * float(np.median(np.abs(actuales - med_final)))
        return med_final, sigma_final, int(actuales.size)

    # Primera pasada: excluyendo SOURCE y banderas malas.
    sin_source = sin_malos & ((banderas & mascara_source) == 0)
    vals_primarios = imagen_limpia[sin_source]
    if vals_primarios.size >= MIN_PIXELES_FONDO:
        med, sigma_mad, n_usados = _sigma_clip(vals_primarios)
        if n_usados >= MIN_PIXELES_FONDO and math.isfinite(med):
            return med, sigma_mad, n_usados, False

    # Segunda pasada de respaldo: incluyendo píxeles SOURCE (nunca banderas de exclusión).
    vals_respaldo = imagen_limpia[sin_malos]
    if vals_respaldo.size >= MIN_PIXELES_FONDO:
        med, sigma_mad, n_usados = _sigma_clip(vals_respaldo)
        if n_usados >= MIN_PIXELES_FONDO and math.isfinite(med):
            return med, sigma_mad, n_usados, True

    return float("nan"), float("nan"), int(vals_respaldo.size), vals_respaldo.size > 0


def medir_apertura(
    imagen: np.ndarray,
    x: float,
    y: float,
    radio: float = RADIO_APERTURA_PX,
    varianza: np.ndarray | None = None,
    banderas: np.ndarray | None = None,
    mascara_exclusion: np.uint32 = np.uint32(0),
    fondo_mjysr: float = 0.0,
    sigma_fondo_mjysr: float = 0.0,
    n_anillo: int = 1,
    radio_int: float = 0.0,
) -> dict[str, Any]:
    """
    Mide el flujo en una apertura circular o anular con submuestreo 10×10

    Parameters
    ----------
    `imagen`:np.ndarray Imagen limpia (`IMAGE - ZODI`) en MJy/sr.
    `x`:float Columna del centro (origen 0).
    `y`:float Fila del centro (origen 0).
    `radio`:float Radio exterior en píxeles.
    `varianza`:np.ndarray | None Mapa de varianza en `(MJy/sr)^2`.
    `banderas`:np.ndarray | None Máscara de bits `uint32` por píxel.
    `mascara_exclusion`:np.uint32 Máscara de bits inválidos a excluir.
    `fondo_mjysr`:float Fondo local a restar en MJy/sr.
    `sigma_fondo_mjysr`:float Dispersión MAD del fondo local en MJy/sr.
    `n_anillo`:int Número de píxeles usados para estimar el fondo local.
    `radio_int`:float Radio interior en píxeles (`0.0` para apertura circular).

    Returns
    -------
    `dict[str, Any]` Flujo en µJy, error en µJy, SNR, píxeles malos y fracción de peso perdida.
    """
    pesos = pesos_anillo_subpixel(imagen.shape, x, y, radio_int=radio_int, radio_ext=radio)
    en_region = pesos > 0.0
    peso_total = float(np.sum(pesos[en_region]))

    if banderas is None:
        banderas_arr = np.zeros(imagen.shape, dtype=np.uint32)
    else:
        banderas_arr = banderas

    varianza_mala = (
        ((~np.isfinite(varianza)) | (varianza < 0.0))
        if varianza is not None
        else np.zeros(imagen.shape, dtype=bool)
    )
    malos = en_region & ((~np.isfinite(imagen)) | varianza_mala | ((banderas_arr & mascara_exclusion) != 0))
    buenos = en_region & (~malos)

    n_bad = int(np.sum(malos))
    peso_perdido = float(np.sum(pesos[malos]))
    fraccion_perdida = (peso_perdido / peso_total) if peso_total > 0.0 else 1.0
    peso_usado = float(np.sum(pesos[buenos]))

    flags_or = int(np.bitwise_or.reduce(banderas_arr[en_region])) if np.any(en_region) else 0

    if peso_total <= 0.0 or peso_usado <= 0.0 or not math.isfinite(fondo_mjysr):
        return {
            "flux_ujy": float("nan"),
            "err_ujy": float("nan"),
            "snr": float("nan"),
            "n_bad": n_bad,
            "lost_weight_fraction": fraccion_perdida,
            "peso_usado": peso_usado,
            "flags_or": flags_or,
        }

    flujo_mjysr = float(np.sum((imagen[buenos] - fondo_mjysr) * pesos[buenos]))
    flujo_ujy = flujo_mjysr * MJY_SR_A_UJY

    if varianza is not None:
        var_fuente = float(np.sum(varianza[buenos] * (pesos[buenos] ** 2)))
    else:
        var_fuente = 0.0

    n_eff = max(1, int(n_anillo))
    # El fondo es una mediana, cuya varianza muestral asintótica para una normal es (π/2) * σ² / N.
    var_fondo = (
        (math.pi / 2.0) * (sigma_fondo_mjysr ** 2) * (peso_usado ** 2) / n_eff
        if math.isfinite(sigma_fondo_mjysr)
        else 0.0
    )
    err_ujy = math.sqrt(max(0.0, var_fuente + var_fondo)) * MJY_SR_A_UJY
    snr = (flujo_ujy / err_ujy) if err_ujy > 0.0 else float("nan")

    return {
        "flux_ujy": flujo_ujy,
        "err_ujy": err_ujy,
        "snr": snr,
        "n_bad": n_bad,
        "lost_weight_fraction": fraccion_perdida,
        "peso_usado": peso_usado,
        "flags_or": flags_or,
    }


def _limpiar_float(valor: float, decimales: int | None = 6) -> float | None:
    """
    Convierte valores no finitos (`NaN`/`Inf`) a `None` para serialización JSON válida

    Parameters
    ----------
    `valor`:float Número en coma flotante a sanear.
    `decimales`:int | None Decimales de redondeo, o `None` para conservar la precisión completa.

    Returns
    -------
    `float | None` Valor finito (redondeado si procede) o `None` si no es finito.
    """
    num = float(valor)
    if not math.isfinite(num):
        return None
    return round(num, decimales) if decimales is not None else num


def _sanear_wave_um(wave: dict[str, Any] | None) -> dict[str, float | None]:
    """
    Convierte a `None` cualquier valor no finito dentro del diccionario `wave_um`

    Parameters
    ----------
    `wave`:dict[str, Any] | None Diccionario con claves `center`, `min`, `max`.

    Returns
    -------
    `dict[str, float | None]` Diccionario saneado sin `NaN` ni `Inf`.
    """
    origen = wave if isinstance(wave, dict) else {"center": 0.0, "min": 0.0, "max": 0.0}
    salida: dict[str, float | None] = {}
    for clave in ("center", "min", "max"):
        bruto = origen.get(clave)
        salida[clave] = _limpiar_float(float(bruto), 4) if bruto is not None else None
    return salida


def _base_salida(metadatos: dict[str, Any] | None, x: float, y: float) -> dict[str, Any]:
    """
    Construye la cabecera común de una medida fotométrica con valores saneados para JSON

    Parameters
    ----------
    `metadatos`:dict[str, Any] | None Metadatos de la exposición.
    `x`:float Columna predicha (origen 0).
    `y`:float Fila predicha (origen 0).

    Returns
    -------
    `dict[str, Any]` Campos base de la medida.
    """
    meta = metadatos or {}
    mjd_bruto = meta.get("mjd", 0.0)
    mjd_sano = _limpiar_float(float(mjd_bruto), None) if mjd_bruto is not None else None
    return {
        "id": str(meta.get("id", "")),
        "obs_id": str(meta.get("obs_id", "")),
        "collection": str(meta.get("collection", "")),
        "mjd": mjd_sano,
        "date": str(meta.get("date", "")),
        "band": int(meta.get("band", 0)),
        "wave_um": _sanear_wave_um(meta.get("wave_um")),
        "x": _limpiar_float(x, 4),
        "y": _limpiar_float(y, 4),
    }


def _medida_invalida(
    base_salida: dict[str, Any],
    motivo: str,
    contaminado: bool = False,
) -> dict[str, Any]:
    """
    Construye un registro fotométrico marcado como inválido conservando el esquema completo

    Parameters
    ----------
    `base_salida`:dict[str, Any] Campos base generados por `_base_salida`.
    `motivo`:str Explicación legible para el campo `reason`.
    `contaminado`:bool Si el fondo utilizó píxeles con bandera `SOURCE`.

    Returns
    -------
    `dict[str, Any]` Medida no válida (`valid: False`, `halo_valid: False`) con flujos en `None`.
    """
    return {
        **base_salida,
        "flux_ujy": None,
        "err_ujy": None,
        "snr": None,
        "bkg_mjysr": None,
        "bkg_source_contaminated": contaminado,
        "halo_flux_ujy": None,
        "halo_err_ujy": None,
        "halo_valid": False,
        "aperture_px": RADIO_APERTURA_PX,
        "n_bad": 0,
        "lost_weight_fraction": 1.0,
        "flags_or": 0,
        "flag_names": [],
        "valid": False,
        "reason": motivo,
    }


def medir_imagen(
    imagen: np.ndarray,
    zodi: np.ndarray,
    varianza: np.ndarray,
    banderas: np.ndarray,
    bits_cabecera: dict[str, int],
    x: float,
    y: float,
    metadatos: dict[str, Any] | None = None,
    halo_px: tuple[float, float] = (HALO_INT_PX, HALO_EXT_PX),
    fondo_px: tuple[float, float] = (FONDO_INT_PX, FONDO_EXT_PX),
) -> dict[str, Any]:
    """
    Ejecuta la fotometría forzada completa (fondo local, apertura central y halo) sobre un recorte

    Parameters
    ----------
    `imagen`:np.ndarray Extensión `IMAGE` original en MJy/sr (con luz zodiacal).
    `zodi`:np.ndarray Extensión `ZODI` en MJy/sr.
    `varianza`:np.ndarray Extensión `VARIANCE` en `(MJy/sr)^2`.
    `banderas`:np.ndarray Extensión `FLAGS` como arreglo `uint32`.
    `bits_cabecera`:dict[str, int] Mapa de bits `MSKN*` de la cabecera FITS.
    `x`:float Columna predicha del objetivo (origen 0).
    `y`:float Fila predicha del objetivo (origen 0).
    `metadatos`:dict[str, Any] | None Metadatos opcionales (`id`, `obs_id`, `collection`, `mjd`, `date`, `band`, `wave_um`).
    `halo_px`:tuple[float, float] Radios interior y exterior del anillo de halo (fuentes saturadas: más afuera).
    `fondo_px`:tuple[float, float] Radios interior y exterior del anillo de fondo local.

    Returns
    -------
    `dict[str, Any]` Registro fotométrico completo conforme al contrato B2.
    """
    base_salida = _base_salida(metadatos, x, y)
    mascara_exclusion, mascara_source = construir_mascaras_banderas(bits_cabecera)
    banderas_u32 = banderas.astype(np.uint32, copy=False)

    # Verificar que ni la apertura, ni el halo ni el anillo de fondo se salgan del recorte.
    radio_max = max(RADIO_APERTURA_PX, halo_px[1], fondo_px[1])
    if not region_dentro_de_recorte(imagen.shape, x, y, radio_max):
        return _medida_invalida(base_salida, "la apertura, el halo o el anillo de fondo se sale del recorte")

    imagen_limpia = imagen.astype(np.float64) - zodi.astype(np.float64)
    fondo_mjysr, sigma_fondo, n_anillo, contaminado = estimar_fondo_local(
        imagen_limpia=imagen_limpia,
        banderas=banderas_u32,
        x=x,
        y=y,
        mascara_exclusion=mascara_exclusion,
        mascara_source=mascara_source,
        radio_int=fondo_px[0],
        radio_ext=fondo_px[1],
    )

    if not math.isfinite(fondo_mjysr) or n_anillo < MIN_PIXELES_FONDO:
        return _medida_invalida(base_salida, "fondo local sin suficientes píxeles válidos (< 20)", contaminado=contaminado)

    ap = medir_apertura(
        imagen=imagen_limpia,
        x=x,
        y=y,
        radio=RADIO_APERTURA_PX,
        varianza=varianza,
        banderas=banderas_u32,
        mascara_exclusion=mascara_exclusion,
        fondo_mjysr=fondo_mjysr,
        sigma_fondo_mjysr=sigma_fondo,
        n_anillo=n_anillo,
        radio_int=0.0,
    )
    halo = medir_apertura(
        imagen=imagen_limpia,
        x=x,
        y=y,
        radio=halo_px[1],
        varianza=varianza,
        banderas=banderas_u32,
        mascara_exclusion=mascara_exclusion,
        fondo_mjysr=fondo_mjysr,
        sigma_fondo_mjysr=sigma_fondo,
        n_anillo=n_anillo,
        radio_int=halo_px[0],
    )

    flags_or = int(ap["flags_or"])
    flag_names = [
        nombre
        for nombre, bit in sorted(bits_cabecera.items(), key=lambda kv: kv[1])
        if flags_or & (1 << int(bit))
    ]

    apertura_valida = (
        ap["lost_weight_fraction"] <= MAX_FRACCION_PESO_PERDIDO
        and math.isfinite(ap["flux_ujy"])
        and math.isfinite(ap["err_ujy"])
        and ap["err_ujy"] > 0.0
        and math.isfinite(ap["snr"])
    )
    halo_valido = (
        halo["lost_weight_fraction"] <= MAX_FRACCION_PESO_PERDIDO
        and math.isfinite(halo["flux_ujy"])
        and math.isfinite(halo["err_ujy"])
        and halo["err_ujy"] > 0.0
        and math.isfinite(halo["snr"])
    )

    if apertura_valida:
        motivo = ""
    elif ap["lost_weight_fraction"] > MAX_FRACCION_PESO_PERDIDO:
        motivo = "saturado o con píxeles malos en la apertura"
    else:
        motivo = "error nulo o SNR no finito en la apertura"

    return {
        **base_salida,
        "flux_ujy": _limpiar_float(ap["flux_ujy"]) if apertura_valida else None,
        "err_ujy": _limpiar_float(ap["err_ujy"]) if apertura_valida else None,
        "snr": _limpiar_float(ap["snr"]) if apertura_valida else None,
        "bkg_mjysr": _limpiar_float(fondo_mjysr),
        "bkg_source_contaminated": contaminado,
        "halo_flux_ujy": _limpiar_float(halo["flux_ujy"]) if halo_valido else None,
        "halo_err_ujy": _limpiar_float(halo["err_ujy"]) if halo_valido else None,
        "halo_valid": halo_valido,
        "aperture_px": RADIO_APERTURA_PX,
        "n_bad": int(ap["n_bad"]),
        "lost_weight_fraction": _limpiar_float(ap["lost_weight_fraction"]),
        "flags_or": flags_or,
        "flag_names": flag_names,
        "valid": apertura_valida,
        "reason": motivo,
    }


def medir_hdul(
    h: fits.HDUList,
    url: str,
    fila: Any,
    base: SkyCoord,
    coleccion: str,
    **anillos: tuple[float, float],
) -> dict[str, Any]:
    """
    Extrae las extensiones de un FITS SPHEREx abierto y ejecuta la fotometría forzada

    Parameters
    ----------
    `h`:fits.HDUList FITS multiextensión abierto (`IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`).
    `url`:str URL de origen del recorte.
    `fila`:Any Fila SIA asociada a la imagen.
    `base`:SkyCoord Coordenada astrométrica de referencia del objetivo.
    `coleccion`:str Nombre de la colección de IRSA.
    `anillos`:tuple[float, float] Opcional: `halo_px` y `fondo_px` (ver `medir_imagen`).

    Returns
    -------
    `dict[str, Any]` Medida fotométrica completa para esa exposición.
    """
    cab = h["IMAGE"].header
    info = posicion_y_onda(h, base, cab)
    mjd: float = info["mjd"]
    lam: float = info["lam"]
    banda_um: float = info["banda_um"]
    nombre_banda = str(fila["energy_bandpassname"])
    banda = int(nombre_banda.split("D")[-1]) if "D" in nombre_banda else int(cab.get("DETECTOR", 0))

    metadatos = {
        "id": Path(url.split("?")[0]).stem,
        "obs_id": str(cab.get("OBSID", "")),
        "collection": coleccion,
        "mjd": _limpiar_float(mjd, None),
        "date": Time(mjd, format="mjd").isot[:19] if math.isfinite(mjd) else "",
        "band": banda,
        "wave_um": {
            "center": _limpiar_float(lam, 4),
            "min": _limpiar_float(lam - banda_um / 2.0, 4),
            "max": _limpiar_float(lam + banda_um / 2.0, 4),
        },
    }

    for ext in ("ZODI", "VARIANCE", "FLAGS"):
        if ext not in h or h[ext].data is None:
            base_salida = _base_salida(metadatos, info["px"], info["py"])
            return _medida_invalida(base_salida, f"falta la extensión {ext}")

    imagen = h["IMAGE"].data.astype(np.float64)
    zodi = h["ZODI"].data.astype(np.float64)
    varianza = h["VARIANCE"].data.astype(np.float64)
    banderas = h["FLAGS"].data.astype("<i4").view("<u4")

    return medir_imagen(
        imagen=imagen,
        zodi=zodi,
        varianza=varianza,
        banderas=banderas,
        bits_cabecera=info["bits"],
        x=info["px"],
        y=info["py"],
        metadatos=metadatos,
        **anillos,
    )
