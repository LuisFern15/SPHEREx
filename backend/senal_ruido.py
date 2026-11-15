"""Mide si hay señal en la posición predicha frente a posiciones de control del mismo recorte.

Por cuadro: flujo en una apertura de 3x3 píxeles menos el fondo mediano del recorte. Se compara la media por banda
en la posición predicha con la misma medida en 60 posiciones de control (a más de 6 px de la predicha).
"""
import base64, json, sys
import numpy as np

rng = np.random.default_rng(1)

def apertura(img, x, y):
    ix, iy = int(round(x)), int(round(y))
    sub = img[iy - 1:iy + 2, ix - 1:ix + 2]
    return np.nanmean(sub) if sub.size == 9 and np.isfinite(sub).sum() >= 6 else np.nan

for archivo in sys.argv[1:]:
    d = json.load(open(archivo, encoding="utf-8"))
    print(f"\n{d['target']['id']} · {d['query']['collection']}")
    por_banda = {}
    for c in d["frames"]:
        h, w = c["shape"]
        img = np.frombuffer(base64.b64decode(c["data"]), dtype="<f4").reshape(h, w).astype(float)
        fondo = np.nanmedian(img)
        px, py = c["predicted_xy"]
        if not (2 <= px < w - 2 and 2 <= py < h - 2):
            continue
        senal = apertura(img, px, py) - fondo
        controles = []
        for _ in range(60):
            x, y = rng.uniform(2, w - 3), rng.uniform(2, h - 3)
            if np.hypot(x - px, y - py) > 6:
                v = apertura(img, x, y)
                if np.isfinite(v): controles.append(v - fondo)
        if np.isfinite(senal) and len(controles) > 10:
            por_banda.setdefault(c["band"], []).append((senal, np.mean(controles), np.std(controles)))
    for banda in sorted(por_banda):
        a = np.array(por_banda[banda])
        z = (a[:, 0] - a[:, 1]) / a[:, 2]
        print(f"  banda {banda}: {len(a):2d} cuadros · señal media {a[:,0].mean():8.3f} MJy/sr · control {a[:,1].mean():7.3f} ± {a[:,2].mean():.3f} · z mediana {np.median(z):6.1f} · cuadros con z>3: {np.mean(z > 3)*100:3.0f}%")
