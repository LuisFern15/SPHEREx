import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

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

app = FastAPI(title="SPHEREx Visor API", version="0.2.1")

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://spherex.nls9.workers.dev",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
PIXEL_SCALE_ARCSEC = 6.15

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
    "SOURCE": 21,
}


def encode_array_b64(arr: np.ndarray, dtype: str) -> str:
    contiguous = np.ascontiguousarray(arr, dtype=dtype)
    return base64.b64encode(contiguous.tobytes()).decode("ascii")


def mjd_to_iso_date(mjd: float) -> str:
    try:
        t = Time(mjd, format="mjd", scale="utc")
        return t.isot[:10]
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


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

        q_x, q_y = cutout.wcs.world_to_pixel(coord)
        mjd = float(header.get("MJD-OBS", header.get("MJD", 60900.5)))
        date_str = str(header.get("DATE-OBS", mjd_to_iso_date(mjd)))[:10]
        band = int(header.get("BAND", 1))
        detector = int(header.get("DETECTOR", band))

        wave_center = float(header.get("WAVELEN", header.get("WAVE", 1.0)))
        wave_min = float(header.get("WAVEMIN", wave_center * 0.98))
        wave_max = float(header.get("WAVEMAX", wave_center * 1.02))

        h, w = cutout.data.shape
        cd_mat = cutout.wcs.pixel_scale_matrix

        return {
            "id": fits_path.stem,
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
            "predicted_xy": [float(q_x), float(q_y)],
            "wcs": {
                "crval": [float(cutout.wcs.wcs.crval[0]), float(cutout.wcs.wcs.crval[1])],
                "crpix": [float(cutout.wcs.wcs.crpix[0]), float(cutout.wcs.wcs.crpix[1])],
                "cd": [
                    [float(cd_mat[0, 0]), float(cd_mat[0, 1])],
                    [float(cd_mat[1, 0]), float(cd_mat[1, 1])],
                ],
            },
        }


@app.get("/api/health")
def health():
    fits_files = list(DATA_DIR.glob("*.fits")) + list(DATA_DIR.glob("*.fits.gz"))
    return {"status": "ok", "cached_fits": len(fits_files)}


@app.get("/api/frames")
def get_frames(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    size: float = Query(180.0, ge=30.0, le=300.0),
    band: Optional[int] = Query(None, ge=1, le=6),
    collection: str = Query("spherex_qr3"),
):
    frames = []
    for fits_file in sorted(DATA_DIR.glob("*.fits*")):
        try:
            frame = extract_cutout_from_fits(fits_file, ra, dec, size)
            if band is None or band == 0 or frame["band"] == band:
                frames.append(frame)
        except Exception:
            continue

    if frames:
        frames.sort(key=lambda f: f["mjd"])
        return {
            "query": {
                "ra": ra,
                "dec": dec,
                "size_arcsec": size,
                "collection": collection,
            },
            "pixel_scale_arcsec": PIXEL_SCALE_ARCSEC,
            "provenance": "cached",
            "cached": True,
            "flag_bits": DEFAULT_FLAG_BITS,
            "usingDefaultFlagBits": True,
            "catalog_sources": [],
            "frames": frames,
            "notes": [
                "Plan B activo (D10): recortes reales servidos desde caché local backend/data/."
            ],
        }

    raise HTTPException(
        status_code=503,
        detail=(
            "Backend operativo en http://127.0.0.1:8000, pero backend/data/ aún no tiene "
            "recortes .fits reales. Coloca recortes en backend/data/ o usa #sim=1."
        ),
    )