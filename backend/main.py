import base64
import copy
import json
import logging
import os
from pathlib import Path
from typing import Optional
from consulta_viva import consultar_irsa_en_vivo
from catalogo_gaia import DIR_CATALOGO, catalogo_gaia

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.nddata import Cutout2D
from astropy.time import Time
from astropy.wcs import WCS
import astropy.units as u
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from inventario_resumen import resumen_inventario_objetivo

logger = logging.getLogger("spherex")

app = FastAPI(title="SPHEREx Visor API", version="0.3.0")

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # `npm run dev` usa el puerto 3000 (package.json).
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://spherex.nls9.workers.dev",
    ],
    # Despliegues de vista previa de Cloudflare (<hash>-spherex.nls9.workers.dev)
    allow_origin_regex=r"https://([a-z0-9-]+-)?spherex\.nls9\.workers\.dev",
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
# La ruta de FITS locales (backend/data/) recorta cada archivo con su propia cuadrícula, sin reproyectar ni
# propagar el movimiento propio: solo es útil para depurar. Está apagada salvo que se pida con SPHEREX_FITS_LOCAL=1.
FITS_LOCAL_ACTIVO = os.environ.get("SPHEREX_FITS_LOCAL", "") == "1"
LIVE_IRSA_DEFAULT = os.environ.get("SPHEREX_LIVE_IRSA", "0") == "1"
MAX_CUADROS_VIVOS = int(os.environ.get("SPHEREX_MAX_LIVE_FRAMES", "30"))
SNAPSHOT_DIR = Path(__file__).parent / "snapshots"
FOTOMETRIA_DIR = Path(__file__).parent / "fotometria"
INVENTARIO_DIR = Path(__file__).parent / "inventario"
PIXEL_SCALE_ARCSEC = 6.15
# Distancia máxima entre la posición pedida y el centro de un snapshot para usarlo.
SNAPSHOT_MATCH_ARCSEC = 120.0

VALID_TARGETS: frozenset[str] = frozenset({"barnard", "epsindib", "wise0855", "rwaur", "rdra"})
VALID_COLLECTIONS: frozenset[str] = frozenset({
    "spherex_dr1",
    "spherex_qr3",
    "spherex_dr1_deep",
    "spherex_qr3_deep",
    "spherex_both",
    "both",
})

# Tabla 9 del suplemento oficial SPHEREx v1.0
DEFAULT_FLAG_BITS = {
    "TRANSIENT": 0,
    "OVERFLOW": 1,
    "SUR_ERROR": 2,
    "NONFUNC": 6,
    "DICHROIC": 7,
    "MISSING_DATA": 9,
    "HOT": 10,
    "COLD": 11,
    "FULLSAMPLE": 12,
    "PHANMISS": 14,
    "NONLINEAR": 15,
    "PERSIST": 17,
    "OUTLIER": 19,
    "CROSSTALK": 20,
    "SOURCE": 21,
    "GHOST": 22,
    "GHOST_FPA": 23,
    "GHOST_EXT": 24,
    "STREAK": 25,
    "BLOOM": 26,
    "SNOWBALL": 27,
    "HALO": 28,
    "SATELLITE_HALO": 29,
}


def encode_array_b64(arr: np.ndarray, dtype: str) -> str:
    contiguous = np.ascontiguousarray(arr, dtype=dtype)
    return base64.b64encode(contiguous.tobytes()).decode("ascii")


def mjd_to_iso_date(mjd: float) -> str:
    """Fecha ISO de un MJD; cadena vacía si no es válido (nunca se inventa la fecha de hoy)."""
    try:
        return Time(mjd, format="mjd", scale="utc").isot[:19]
    except ValueError as error:
        logger.warning("MJD inválido (%s): %s", mjd, error)
        return ""


def extract_cutout_from_fits(
    fits_path: Path, ra: float, dec: float, size_arcsec: float
) -> dict:
    """Extrae recorte cumpliendo exactamente RawSpherexFrame de spherex.ts."""
    with fits.open(fits_path, memmap=True) as hdul:
        img_hdu = hdul["IMAGE"] if "IMAGE" in hdul else (hdul[1] if len(hdul) > 1 else hdul[0])
        header = img_hdu.header
        wcs = WCS(header)

        coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
        size_px = max(8, int(round(size_arcsec / PIXEL_SCALE_ARCSEC)))

        cutout = Cutout2D(
            img_hdu.data,
            position=coord,
            size=(size_px, size_px),
            wcs=wcs,
            mode="partial",
            fill_value=np.nan,
        )

        if "FLAGS" in hdul:
            flags_cut = Cutout2D(
                hdul["FLAGS"].data,
                position=coord,
                size=(size_px, size_px),
                wcs=wcs,
                mode="partial",
                fill_value=0,
            ).data.astype(np.uint32)
        else:
            flags_cut = np.zeros(cutout.data.shape, dtype=np.uint32)

        # Los números de bit vienen de la cabecera real (MSKN*), no de una tabla escrita a mano.
        bits = {}
        if "FLAGS" in hdul:
            for clave, valor in hdul["FLAGS"].header.items():
                if clave.startswith("MSKN"):
                    bits[str(valor).strip()] = int(clave[4:])

        q_x, q_y = cutout.wcs.world_to_pixel(coord)
        # MJD-AVG es el instante medio de la exposición en los FITS de SPHEREx.
        mjd = float(header.get("MJD-AVG", header.get("MJD-OBS", header.get("MJD", 60900.5))))
        date_str = str(header.get("DATE-OBS", mjd_to_iso_date(mjd)))[:19]
        # Los FITS de SPHEREx no traen BAND: la banda es el número de detector (1 a 6).
        band = int(header.get("BAND", header.get("DETECTOR", 1)))
        detector = int(header.get("DETECTOR", band))

        wave_center = float(header.get("WAVELEN", header.get("WAVE", 1.0)))
        wave_min = float(header.get("WAVEMIN", wave_center * 0.98))
        wave_max = float(header.get("WAVEMAX", wave_center * 1.02))

        h, w = cutout.data.shape
        cd_mat = cutout.wcs.pixel_scale_matrix

        return {
            "id": fits_path.stem,
            "collection": "fits_local",
            "mjd": mjd,
            "date": date_str,
            "band": band,
            "detector": detector,
            "wave_um": {
                "center": wave_center,
                "min": wave_min,
                "max": wave_max,
            },
            "shape": [int(h), int(w)],
            "data": encode_array_b64(cutout.data, "<f4"),
            "flags": encode_array_b64(flags_cut, "<u4"),
            "query_xy": [float(q_x), float(q_y)],
            # Sin predicted_xy: este camino no propaga el movimiento propio; el cliente lo calcula desde el objetivo.
            "flag_bits": bits,
            "wcs": {
                "crval": [float(cutout.wcs.wcs.crval[0]), float(cutout.wcs.wcs.crval[1])],
                "crpix": [float(cutout.wcs.wcs.crpix[0]), float(cutout.wcs.wcs.crpix[1])],
                "cd": [
                    [float(cd_mat[0, 0]), float(cd_mat[0, 1])],
                    [float(cd_mat[1, 0]), float(cd_mat[1, 1])],
                ],
            },
        }


# Cachés en memoria por fecha de modificación (st_mtime).
_CACHE_SNAPSHOTS: dict[Path, tuple[float, dict]] = {}
_CACHE_FOTOMETRIA: dict[Path, tuple[float, dict]] = {}
_CACHE_INVENTARIO: dict[str, tuple[tuple[tuple[str, float], ...], dict]] = {}


def load_snapshots() -> list[dict]:
    """Índice de los JSON generados por generar_snapshots.py (datos reales de IRSA ya verificados)."""
    index = []
    for path in sorted(SNAPSHOT_DIR.glob("*.json")):
        try:
            modificado = path.stat().st_mtime
            en_cache = _CACHE_SNAPSHOTS.get(path)
            if en_cache and en_cache[0] == modificado:
                index.append(en_cache[1])
                continue
            with path.open(encoding="utf-8") as fh:
                data = json.load(fh)
            if not isinstance(data, dict):
                raise TypeError(f"Se esperaba objeto JSON y se recibió {type(data).__name__}")
            q = data["query"]
            if not isinstance(q, dict):
                raise TypeError(f"Se esperaba 'query' como objeto JSON y se recibió {type(q).__name__}")
            target_obj = data.get("target")
            target_id = target_obj.get("id", path.stem) if isinstance(target_obj, dict) else path.stem
            entrada = {
                "path": path,
                "collection": q["collection"],
                "ra": float(q["ra"]),
                "dec": float(q["dec"]),
                "target": target_id,
                "data": data,
            }
            _CACHE_SNAPSHOTS[path] = (modificado, entrada)
            index.append(entrada)
        except (OSError, KeyError, ValueError, TypeError) as error:
            logger.warning("Snapshot ignorado (%s): %s", path.name, error)
    return index


def load_photometry_files() -> list[dict]:
    """Índice de los JSON de fotometría generados por generar_fotometria.py con caché por st_mtime."""
    if not FOTOMETRIA_DIR.exists():
        return []
    entries = []
    for path in sorted(FOTOMETRIA_DIR.glob("*.json")):
        try:
            modificado = path.stat().st_mtime
            en_cache = _CACHE_FOTOMETRIA.get(path)
            if en_cache and en_cache[0] == modificado:
                entries.append(en_cache[1])
                continue
            with path.open(encoding="utf-8") as fh:
                data = json.load(fh)
            if not isinstance(data, dict):
                raise TypeError(f"Se esperaba objeto JSON y se recibió {type(data).__name__}")
            entrada = {
                "path": path,
                "target": str(data.get("target", "")),
                "collection": str(data.get("collection", "")),
                "generated_at": str(data.get("generated_at", "")),
                "data": data,
            }
            _CACHE_FOTOMETRIA[path] = (modificado, entrada)
            entries.append(entrada)
        except (OSError, KeyError, ValueError, TypeError) as error:
            logger.warning("Fotometría ignorada (%s): %s", path.name, error)
    return entries


def validate_collection_param(collection: str) -> str:
    """Valida collection contra la lista blanca estricta."""
    clean_collection = collection.strip()
    if clean_collection not in VALID_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Colección no permitida: '{collection}'. Valores válidos: {', '.join(sorted(VALID_COLLECTIONS))}.",
        )
    return clean_collection


def validate_photometry_params(target: str, collection: str) -> tuple[str, str]:
    """Valida target y collection contra listas blancas estrictas antes de construir rutas."""
    clean_target = target.strip()
    if clean_target not in VALID_TARGETS:
        raise HTTPException(
            status_code=400,
            detail=f"Objetivo no permitido: '{target}'. Valores válidos: {', '.join(sorted(VALID_TARGETS))}.",
        )
    return clean_target, validate_collection_param(collection)


def find_snapshots(ra: float, dec: float, collection: str) -> list[dict]:
    """Snapshots cercanos a la posición pedida; 'spherex_both' o 'both' junta SOLO DR1 y QR3."""
    wanted = {"spherex_dr1", "spherex_qr3"} if collection in ("both", "spherex_both") else {collection}
    pedido = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
    found = []
    for snap in load_snapshots():
        if snap["collection"] not in wanted:
            continue
        centro = SkyCoord(ra=snap["ra"] * u.deg, dec=snap["dec"] * u.deg, frame="icrs")
        if pedido.separation(centro).arcsec <= SNAPSHOT_MATCH_ARCSEC:
            found.append(snap)
    return found


def snapshot_response(snaps: list[dict], ra: float, dec: float, size: float, collection: str) -> dict:
    frames, flag_bits, notes = [], {}, []
    for snap in snaps:
        data = snap["data"]
        frames.extend(data["frames"])
        flag_bits.update(data.get("flag_bits", {}))
        notes.extend(data.get("notes", []))
        notes.append(f"Archivo {snap['path'].name}, generado el {data.get('generated_at', '?')}.")
    frames.sort(key=lambda f: f["mjd"])
    if len(snaps) > 1:
        # La franja de procedencia muestra la primera nota: que nombre todas las colecciones juntadas.
        colecciones = " + ".join(sorted(s["collection"] for s in snaps))
        fecha = max(s["data"].get("generated_at", "") for s in snaps)[:10]
        notes.insert(0, f"Datos reales de IRSA ({colecciones}) guardados el {fecha}; no se actualizan solos.")
    stored_size = snaps[0]["data"]["query"].get("size_arcsec", size)
    if abs(stored_size - size) > 1:
        notes.append(f"El recorte guardado es de {stored_size:.0f}″; el tamaño pedido ({size:.0f}″) no cambia los datos guardados.")
    return {
        "query": {"ra": ra, "dec": dec, "size_arcsec": stored_size, "collection": collection},
        "pixel_scale_arcsec": PIXEL_SCALE_ARCSEC,
        "provenance": "cached",
        "cached": True,
        "flag_bits": dict(sorted(flag_bits.items(), key=lambda kv: kv[1])),
        "usingDefaultFlagBits": False,
        "target": snaps[0]["data"].get("target"),
        "generated_at": max(s["data"].get("generated_at", "") for s in snaps),
        "catalog_sources": [],
        "frames": frames,
        "notes": notes,
    }


@app.get("/api/health")
def health():
    fits_files = list(DATA_DIR.glob("*.fits")) + list(DATA_DIR.glob("*.fits.gz"))
    snaps = load_snapshots()
    return {
        "status": "ok",
        "cached_fits": len(fits_files),
        "snapshots": [f"{s['target']}:{s['collection']}" for s in snaps],
    }


@app.get("/api/targets")
def get_targets():
    """Lista de objetivos con snapshots o fotometría guardados en disco."""
    snaps = load_snapshots()
    phots = load_photometry_files()

    por_objetivo: dict[str, dict] = {}
    for snap in snaps:
        tid = snap["target"]
        info = por_objetivo.setdefault(
            tid,
            {
                "id": tid,
                "snapshot_collections": [],
                "frame_counts": {},
                "photometry_collections": [],
                "latest_generated_at": "",
            },
        )
        col = snap["collection"]
        if col not in info["snapshot_collections"]:
            info["snapshot_collections"].append(col)
        info["frame_counts"][col] = len(snap["data"].get("frames", []))
        gen = str(snap["data"].get("generated_at", ""))
        if gen > info["latest_generated_at"]:
            info["latest_generated_at"] = gen

    for phot in phots:
        tid = phot["target"]
        if not tid:
            continue
        info = por_objetivo.setdefault(
            tid,
            {
                "id": tid,
                "snapshot_collections": [],
                "frame_counts": {},
                "photometry_collections": [],
                "latest_generated_at": "",
            },
        )
        col = phot["collection"]
        if col and col not in info["photometry_collections"]:
            info["photometry_collections"].append(col)
        gen = phot["generated_at"]
        if gen > info["latest_generated_at"]:
            info["latest_generated_at"] = gen

    targets = []
    for tid in sorted(por_objetivo):
        item = por_objetivo[tid]
        item["snapshot_collections"].sort()
        item["photometry_collections"].sort()
        targets.append(item)

    return {"targets": targets}


@app.get("/api/inventory")
def get_inventory(target: str = Query(..., min_length=1)):
    """Inventario CSV de IRSA para un objetivo validado contra la lista blanca."""
    clean_target = target.strip()
    if clean_target not in VALID_TARGETS:
        raise HTTPException(
            status_code=404,
            detail=f"Objetivo no reconocido: '{target}'. Objetivos disponibles: {', '.join(sorted(VALID_TARGETS))}.",
        )

    csvs = sorted(INVENTARIO_DIR.glob(f"{clean_target}_*.csv")) if INVENTARIO_DIR.exists() else []
    if not csvs:
        raise HTTPException(
            status_code=404,
            detail=f"Sin inventario guardado para '{clean_target}' en backend/inventario/.",
        )

    firma = tuple((p.name, p.stat().st_mtime) for p in csvs)
    en_cache = _CACHE_INVENTARIO.get(clean_target)
    if en_cache and en_cache[0] == firma:
        return en_cache[1]

    resumen = resumen_inventario_objetivo(clean_target, INVENTARIO_DIR)
    if resumen is None:
        raise HTTPException(
            status_code=404,
            detail=f"No se pudo leer el inventario de '{clean_target}'.",
        )

    _CACHE_INVENTARIO[clean_target] = (firma, resumen)
    return resumen


@app.get("/api/catalog")
def get_catalog(
    ra: Optional[float] = Query(None, ge=0.0, lt=360.0),
    dec: Optional[float] = Query(None, ge=-90.0, le=90.0),
    size_arcsec: float = Query(200.0, gt=0.0, le=1200.0),
    target: Optional[str] = Query(None),
):
    """Catálogo de referencia Gaia DR3 del campo (capa cat=1).

    Con `target` se sirve el archivo guardado por `generar_catalogo.py`; con `ra`/`dec` se consulta
    VizieR (con caché en disco).
    """
    if target:
        archivo = DIR_CATALOGO / f"{Path(target).name}.json"
        if archivo.exists():
            return json.loads(archivo.read_text(encoding="utf-8"))
    if ra is None or dec is None:
        raise HTTPException(status_code=404, detail="No hay catálogo guardado para ese objetivo; envía ra y dec.")
    try:
        return catalogo_gaia(ra, dec, size_arcsec)
    except ConnectionError as error:
        logger.warning("Catálogo Gaia no disponible en %.5f, %.5f: %s", ra, dec, error)
        raise HTTPException(
            status_code=503, detail="El catálogo Gaia DR3 (VizieR) no respondió. Intenta de nuevo en unos segundos."
        ) from error


@app.get("/api/photometry")
def get_photometry(
    target: str = Query(..., min_length=1),
    collection: str = Query("spherex_dr1"),
):
    """Fotometría de apertura forzada guardada en backend/fotometria/."""
    clean_target, clean_collection = validate_photometry_params(target, collection)
    entries = [e for e in load_photometry_files() if e["target"] == clean_target]

    if clean_collection in ("spherex_both", "both"):
        seleccionadas = [e for e in entries if e["collection"] in ("spherex_dr1", "spherex_qr3")]
        if not seleccionadas:
            raise HTTPException(
                status_code=404,
                detail=f"Sin datos de fotometría para '{clean_target}' en spherex_dr1 ni spherex_qr3.",
            )
        if len(seleccionadas) == 1:
            copia = copy.deepcopy(seleccionadas[0]["data"])
            col_incluida = seleccionadas[0]["collection"]
            copia["collection"] = "spherex_both"
            notas = list(copia.get("notes", []))
            notas.insert(
                0,
                f"Combinación de fotometría ({col_incluida}) ordenada por MJD; no hay datos en la otra colección.",
            )
            copia["notes"] = notas
            return copia

        radios_iguales = (
            len({tuple(item["data"].get("halo_px", [])) for item in seleccionadas}) == 1
            and len({tuple(item["data"].get("annulus_px", [])) for item in seleccionadas}) == 1
            and len({item["data"].get("aperture_px") for item in seleccionadas}) == 1
        )
        base = copy.deepcopy(seleccionadas[0]["data"])
        medidas = []
        notas = []
        for item in seleccionadas:
            datos_item = item["data"]
            notas.extend(copy.deepcopy(datos_item.get("notes", [])))
            for m in datos_item.get("measurements", []):
                medida = copy.deepcopy(m)
                if not radios_iguales:
                    if "halo_px" in datos_item:
                        medida["halo_px"] = list(datos_item["halo_px"])
                    if "annulus_px" in datos_item:
                        medida["annulus_px"] = list(datos_item["annulus_px"])
                medidas.append(medida)

        medidas.sort(key=lambda m: float(m["mjd"]) if m.get("mjd") is not None else 0.0)
        colecciones_unidas = " + ".join(sorted(item["collection"] for item in seleccionadas))
        if not radios_iguales:
            notas.insert(
                0,
                "Los archivos combinados usan radios distintos (aperture_px/halo_px/annulus_px); "
                "cada medida incluye sus propios campos halo_px y annulus_px.",
            )
        notas.insert(0, f"Combinación de fotometría ({colecciones_unidas}) ordenada por MJD.")
        base["collection"] = "spherex_both"
        base["generated_at"] = max(item["generated_at"] for item in seleccionadas)
        base["notes"] = notas
        base["measurements"] = medidas
        return base

    for item in entries:
        if item["collection"] == clean_collection:
            return item["data"]

    disponibles = sorted(e["collection"] for e in entries)
    extra = f" Colecciones disponibles: {', '.join(disponibles)}." if disponibles else ""
    raise HTTPException(
        status_code=404,
        detail=f"Sin fotometría guardada para '{clean_target}' en '{clean_collection}'.{extra}",
    )


@app.get("/api/frames")
def get_frames(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    size: float = Query(180.0, ge=30.0, le=300.0),
    band: Optional[int] = Query(None, ge=0, le=6),
    collection: str = Query("spherex_dr1"),
    live: Optional[bool] = Query(None),
    max_frames: int = Query(10, ge=1, le=150),
    pmra: float = Query(0.0),
    pmdec: float = Query(0.0),
    epoch: str = Query("J2016.0"),
):
    clean_collection = validate_collection_param(collection)

    # 1) Datos reales ya verificados (snapshots) si la posición coincide con un objetivo guardado.
    snaps = find_snapshots(ra, dec, clean_collection)
    if snaps:
        response = snapshot_response(snaps, ra, dec, size, clean_collection)
        if band:
            response["frames"] = [f for f in response["frames"] if f["band"] == band]
        return response

    # 1b) La posición sí tiene datos guardados, pero en otra colección: decirlo en vez de un error genérico.
    otras = find_snapshots(ra, dec, "both")
    if otras and not (FITS_LOCAL_ACTIVO and list(DATA_DIR.glob("*.fits*"))):
        disponibles = sorted({s["collection"] for s in otras})
        raise HTTPException(
            status_code=404,
            detail=(
                f"Sin datos guardados en {clean_collection} para esta posición; "
                f"hay datos en: {', '.join(disponibles)}."
            ),
        )

    # 2) Recortes de FITS locales en backend/data/ (solo depuración, ver FITS_LOCAL_ACTIVO).
    frames = []
    for fits_file in sorted(DATA_DIR.glob("*.fits*")) if FITS_LOCAL_ACTIVO else []:
        try:
            frame = extract_cutout_from_fits(fits_file, ra, dec, size)
            if band is None or band == 0 or frame["band"] == band:
                frames.append(frame)
        except (OSError, KeyError, ValueError) as error:
            logger.warning("FITS local ignorado (%s): %s", fits_file.name, error)

    if frames:
        frames.sort(key=lambda f: f["mjd"])
        bits_cabecera: dict[str, int] = {}
        for frame in frames:
            bits_cabecera.update(frame.pop("flag_bits", {}))
        return {
            "query": {
                "ra": ra,
                "dec": dec,
                "size_arcsec": size,
                "collection": clean_collection,
            },
            "pixel_scale_arcsec": PIXEL_SCALE_ARCSEC,
            "provenance": "cached",
            "cached": True,
            "flag_bits": bits_cabecera or DEFAULT_FLAG_BITS,
            "usingDefaultFlagBits": not bits_cabecera,
            "catalog_sources": [],
            "frames": frames,
            "notes": [
                "Modo de depuración: recortes de FITS locales (backend/data/), sin reproyección común ni propagación del movimiento propio."
            ],
        }

    # 3) Consulta en vivo al SIA de IRSA para cualquier coordenada arbitraria (Capa 1).
    usar_vivo = LIVE_IRSA_DEFAULT if live is None else live
    if usar_vivo:
        response = consultar_irsa_en_vivo(
            ra=ra,
            dec=dec,
            size_arcsec=size,
            collection=clean_collection,
            # Tope para el servidor público (Render, 512 MB): como mucho 30 cuadros en vivo
            max_frames=min(max_frames, MAX_CUADROS_VIVOS),
            pmra=pmra,
            pmdec=pmdec,
            epoch=epoch,
        )
        if band:
            response = dict(response)
            response["frames"] = [f for f in response["frames"] if f["band"] == band]
        return response

    raise HTTPException(
        status_code=404,
        detail=(
            "Sin datos guardados para esta posición en ninguna colección; los datos reales "
            "salen de backend/snapshots/ (se generan con generar_snapshots.py); #sim=1 es solo el simulador de desarrollo."
        ),
    )
