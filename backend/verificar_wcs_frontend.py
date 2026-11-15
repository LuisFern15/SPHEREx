"""Replica pixelToSkyLinear del frontend y compara con la posición predicha calculada con astropy."""
import base64, json, math, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np, astropy.units as u
from astropy.coordinates import SkyCoord, Distance
from astropy.time import Time
sys.path.insert(0, ".")
from generar_snapshots import OBJETIVOS, coordenada_base

def pixel_a_cielo(x, y, w):  # idéntico a src/utils/coordinates.ts:pixelToSkyLinear
    dx, dy = x + 1 - w["crpix"][0], y + 1 - w["crpix"][1]
    dxi = w["cd"][0][0] * dx + w["cd"][0][1] * dy
    deta = w["cd"][1][0] * dx + w["cd"][1][1] * dy
    cosd = math.cos(math.radians(w["crval"][1]))
    return w["crval"][0] + dxi / cosd, w["crval"][1] + deta

for archivo in sys.argv[1:]:
    d = json.load(open(archivo, encoding="utf-8"))
    base = coordenada_base(OBJETIVOS[d["target"]["id"]])
    res, dist, norte = [], [], []
    for c in d["frames"]:
        h, w = c["shape"]
        ra, dec = pixel_a_cielo(*c["predicted_xy"], c["wcs"])
        p = base.apply_space_motion(new_obstime=Time(c["mjd"], format="mjd"))
        dra = (ra - p.ra.deg) * math.cos(math.radians(p.dec.deg)) * 3600
        res.append(math.hypot(dra, (dec - p.dec.deg) * 3600))
        img = np.frombuffer(base64.b64decode(c["data"]), dtype="<f4").reshape(h, w)
        px, py = c["predicted_xy"]; ix, iy = int(round(px)), int(round(py))
        ven = img[max(0, iy - 3):iy + 4, max(0, ix - 3):ix + 4]
        if np.isfinite(ven).any():
            j, i = np.unravel_index(np.nanargmax(ven), ven.shape)
            dist.append(math.hypot(i + max(0, ix - 3) - px, j + max(0, iy - 3) - py))
    print(f"{d['target']['id']}:{d['query']['collection']}  grid_version={d.get('grid_version')}  cuadros={len(res)}")
    print(f"  posición predicha -> cielo (fórmula del frontend) vs astropy: máx {max(res):.3f}\"  media {np.mean(res):.3f}\"")
    print(f"  píxel máximo a menos de 3 px de predicted_xy en {np.mean(np.array(dist) <= 3)*100:.0f}% de los cuadros (mediana {np.median(dist):.2f} px)")
