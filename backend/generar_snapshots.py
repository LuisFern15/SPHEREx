"""Genera archivos JSON con recortes reales de SPHEREx para un objetivo, en el formato del contrato.

Uso:
    python generar_snapshots.py barnard spherex_qr3 [--max 60] [--size 200]

Pasos:
1. Calcula la posición del objetivo hoy (centro fijo del recorte).
2. Busca en el SIA de IRSA las imágenes cuya huella contiene esa posición.
3. Elige candidatas repartidas entre bandas y fechas.
4. Baja cada recorte, calcula dónde debe estar el objeto en la fecha de ESA imagen y
   descarta las imágenes donde cae fuera del recorte.
5. Escribe snapshots/<objetivo>_<colección>.json con provenance "cached".
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import math
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

# Solo se silencian los avisos de astropy que no aportan (WCS/FITS de SPHEREx); el resto se muestra.
from astropy.utils.exceptions import AstropyWarning

warnings.simplefilter("ignore", category=AstropyWarning)

import numpy as np
import requests
import astropy.units as u
from astropy.coordinates import Distance, SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astroquery.ipac.irsa import Irsa

ESCALA_PX = 6.15  # segundos de arco por píxel
SALIDA = Path(__file__).parent / "snapshots"

# Valores auditados (investigacion/auditoria.md, sección 9.1).
OBJETIVOS = {
    "barnard": dict(ra=269.44850252543836, dec=4.739420051112412, epoca="J2016.0",
                    pmra=-801.5509783684709, pmdec=10362.394206546573,
                    paralaje=546.975939730948, vr=-110.46822,
                    fuente="Gaia DR3 4472832130942575872"),
    "epsindib": dict(ra=331.07645259656, dec=-56.79381206688, epoca="J2016.0",
                     pmra=3981.9767, pmdec=-2466.8318, paralaje=270.658, vr=0.0,
                     fuente="Gaia DR3 6412596012146801152"),
    "wise0855": dict(ra=133.780984, dec=-7.243932, epoca="MJD57633.39",
                     pmra=-8123.7, pmdec=673.2, paralaje=439.0, vr=0.0,
                     fuente="Kirkpatrick et al. 2021"),
    "rwaur": dict(ra=76.95631275, dec=30.40126037, epoca="J2016.0",
                  pmra=3.77, pmdec=-25.99, paralaje=6.41, vr=0.0,
                  fuente="Punto medio de Gaia DR3 156430817820015232 y 156430822114424576"),
    "rdra": dict(ra=248.16737836729, dec=66.75500674547, epoca="J2016.0",
                 pmra=-20.6428, pmdec=6.1488, paralaje=1.2509, vr=0.0,
                 fuente="Gaia DR3 1648328016354496384"),
}


def coordenada_base(obj: dict) -> SkyCoord:
    epoca = obj["epoca"]
    t = Time(float(epoca[3:]), format="mjd") if epoca.startswith("MJD") else Time(float(epoca[1:]), format="jyear")
    return SkyCoord(ra=obj["ra"] * u.deg, dec=obj["dec"] * u.deg,
                    pm_ra_cosdec=obj["pmra"] * u.mas / u.yr, pm_dec=obj["pmdec"] * u.mas / u.yr,
                    distance=Distance(parallax=obj["paralaje"] * u.mas),
                    radial_velocity=obj["vr"] * u.km / u.s, obstime=t, frame="icrs")


def con_reintentos(funcion, intentos=5, espera=15, nombre="IRSA"):
    for i in range(intentos):
        try:
            return funcion()
        except Exception as error:  # IRSA devuelve 502 de forma intermitente
            if i == intentos - 1:
                raise
            print(f"  {nombre}: fallo ({str(error)[:70]}); reintento en {espera * (i + 1)} s")
            time.sleep(espera * (i + 1))


def elegir_candidatas(tabla, maximo: int) -> list:
    """Reparte las candidatas entre bandas y, dentro de cada banda, a lo largo del tiempo."""
    por_banda: dict[str, list] = {}
    for fila in tabla:
        por_banda.setdefault(str(fila["energy_bandpassname"]), []).append(fila)
    por_banda_n = max(1, math.ceil(maximo * 1.8 / max(1, len(por_banda))))
    elegidas = []
    for filas in por_banda.values():
        filas.sort(key=lambda f: float(f["t_min"]))
        if len(filas) <= por_banda_n:
            elegidas += filas
        else:
            pasos = np.linspace(0, len(filas) - 1, por_banda_n).round().astype(int)
            elegidas += [filas[i] for i in sorted(set(pasos))]
    return elegidas


def b64(arreglo: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(arreglo).tobytes()).decode("ascii")


CACHE = Path(__file__).parent / "cache"


def bajar_recorte(url: str, centro: SkyCoord, tamano_grados: float) -> bytes:
    """Baja el recorte, o lo lee de la caché local si ya se bajó con el mismo centro y tamaño."""
    CACHE.mkdir(exist_ok=True)
    clave = f"{Path(url.split('?')[0]).stem}__{centro.ra.deg:.5f}_{centro.dec.deg:+.5f}_{tamano_grados:.4f}.fits"
    archivo = CACHE / clave
    if archivo.exists():
        return archivo.read_bytes()

    def pedir():
        r = requests.get(url, params={"center": f"{centro.ra.deg},{centro.dec.deg}d", "size": f"{tamano_grados}"}, timeout=120)
        r.raise_for_status()  # dentro del reintento: IRSA devuelve 502/503 cuando está saturado
        return r

    contenido = con_reintentos(pedir, intentos=4, espera=10, nombre="recorte").content
    archivo.write_bytes(contenido)
    return contenido


def rejilla_comun(centro: SkyCoord, n: int) -> WCS:
    """Cuadrícula de salida igual para todos los cuadros, en la convención estándar de FITS:
    TAN, 6.15"/px, la fila 0 es el borde SUR (Dec crece con la fila) y la columna 0 el borde ESTE
    (RA decrece con la columna). Al dibujar con la fila 0 abajo queda el norte arriba y el este a la izquierda."""
    s = ESCALA_PX / 3600.0
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [centro.ra.deg, centro.dec.deg]
    w.wcs.crpix = [(n - 1) / 2 + 1, (n - 1) / 2 + 1]  # FITS, origen 1
    w.wcs.cd = [[-s, 0.0], [0.0, s]]
    return w


def procesar(fila, centro: SkyCoord, base: SkyCoord, tamano_grados: float, coleccion: str):
    """Baja y procesa un recorte; cierra el archivo FITS al terminar (los hilos abren decenas)."""
    url = str(fila["access_url"])
    with fits.open(io.BytesIO(bajar_recorte(url, centro, tamano_grados))) as h:
        return _procesar_hdul(h, url, fila, centro, base, tamano_grados, coleccion)


def _procesar_hdul(h, url: str, fila, centro: SkyCoord, base: SkyCoord, tamano_grados: float, coleccion: str):
    imagen = h["IMAGE"].data.astype("<f4")
    banderas = h["FLAGS"].data.astype("<i4").view("<u4")
    cab = h["IMAGE"].header
    wcs = WCS(cab)
    mjd = float(cab["MJD-AVG"])
    predicha = base.apply_space_motion(new_obstime=Time(mjd, format="mjd"))
    predicha = SkyCoord(ra=predicha.ra, dec=predicha.dec, frame="icrs")
    px, py = (float(v) for v in wcs.world_to_pixel(predicha))
    alto, ancho = imagen.shape
    if not (0.5 <= px < ancho - 1.5 and 0.5 <= py < alto - 1.5):
        return None, f"fuera del recorte (predicha x={px:.1f}, y={py:.1f}; forma {alto}x{ancho})"

    # Longitud de onda en el píxel del objeto, en la imagen original.
    ix, iy = int(round(px)), int(round(py))
    ondas = WCS(cab, fobj=h, key="W")
    ondas.sip = None
    centro_onda, ancho_banda = ondas.pixel_to_world(float(ix), float(iy))
    lam = float(centro_onda.to_value(u.um)) if hasattr(centro_onda, "to_value") else float(centro_onda)
    banda_um = float(ancho_banda.to_value(u.um)) if hasattr(ancho_banda, "to_value") else float(ancho_banda)

    # Reproyección por vecino más cercano a la cuadrícula común.
    n = int(round(tamano_grados * 3600 / ESCALA_PX)) | 1  # impar, para que el centro caiga en un píxel
    salida = rejilla_comun(centro, n)
    filas, columnas = np.mgrid[0:n, 0:n]
    cielo = salida.pixel_to_world(columnas.ravel(), filas.ravel())
    ox, oy = wcs.world_to_pixel(cielo)
    ox, oy = np.round(ox).astype(int), np.round(oy).astype(int)
    validos = (ox >= 0) & (ox < ancho) & (oy >= 0) & (oy < alto)
    datos = np.full(n * n, np.nan, dtype="<f4")
    marcas = np.zeros(n * n, dtype="<u4")
    datos[validos] = imagen[oy[validos], ox[validos]]
    marcas[validos] = banderas[oy[validos], ox[validos]]
    datos, marcas = datos.reshape(n, n), marcas.reshape(n, n)
    npx, npy = (float(v) for v in salida.world_to_pixel(predicha))
    nqx, nqy = (float(v) for v in salida.world_to_pixel(centro))

    bits = {}
    for clave in h["FLAGS"].header:
        if clave.startswith("MSKN"):
            bits[str(h["FLAGS"].header[clave]).strip()] = int(clave[4:])
    nombre_banda = str(fila["energy_bandpassname"])
    banda = int(nombre_banda.split("D")[-1]) if "D" in nombre_banda else int(cab.get("DETECTOR", 0))
    vecindad = imagen[max(0, iy - 1):iy + 2, max(0, ix - 1):ix + 2]
    cuadro = {
        "id": Path(url.split("?")[0]).stem,
        "obs_id": str(cab.get("OBSID", "")),
        "collection": coleccion,
        "mjd": mjd,
        "date": Time(mjd, format="mjd").isot[:19],
        "band": banda,
        "detector": int(cab.get("DETECTOR", banda)),
        "wave_um": {"center": round(lam, 4), "min": round(lam - banda_um / 2, 4), "max": round(lam + banda_um / 2, 4)},
        "shape": [n, n],
        "data": b64(datos),
        "flags": b64(marcas),
        "query_xy": [round(nqx, 3), round(nqy, 3)],
        "predicted_xy": [round(npx, 3), round(npy, 3)],
        "target_xy": [round(npx, 3), round(npy, 3)],
        "wcs": {"crval": [centro.ra.deg, centro.dec.deg], "crpix": [(n - 1) / 2 + 1, (n - 1) / 2 + 1],
                "cd": [[-ESCALA_PX / 3600.0, 0.0], [0.0, ESCALA_PX / 3600.0]]},
        "valid_fraction": round(float(validos.mean()), 3),
        "source_url": url,
    }
    diagnostico = {
        "flujo_predicho": float(np.nanmax(vecindad)) if np.isfinite(vecindad).any() else None,
        "fondo": float(np.nanmedian(imagen)),
        "bits_predicho": int(banderas[iy, ix]),
    }
    return (cuadro, bits, diagnostico), None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("objetivo", choices=sorted(OBJETIVOS))
    p.add_argument("coleccion")
    p.add_argument("--max", type=int, default=60)
    p.add_argument("--size", type=float, default=200.0, help="campo en segundos de arco")
    p.add_argument("--hilos", type=int, default=6)
    a = p.parse_args()

    obj = OBJETIVOS[a.objetivo]
    base = coordenada_base(obj)
    hoy = Time(datetime.now(timezone.utc))
    centro = base.apply_space_motion(new_obstime=hoy)
    centro = SkyCoord(ra=centro.ra, dec=centro.dec, frame="icrs")
    tamano = a.size / 3600.0
    print(f"{a.objetivo} · {a.coleccion} · centro fijo {centro.ra.deg:.6f} {centro.dec.deg:+.6f} ({hoy.isot[:10]})")

    tabla = con_reintentos(lambda: Irsa.query_sia(pos=(centro, 0.003 * u.deg), collection=a.coleccion, maxrec=5000), nombre="SIA")
    print(f"  imágenes cuya huella contiene la posición: {len(tabla)}")
    candidatas = elegir_candidatas(list(tabla), a.max)
    print(f"  candidatas elegidas: {len(candidatas)}")

    cuadros, bits, diagnosticos, descartes = [], {}, [], []
    with ThreadPoolExecutor(max_workers=a.hilos) as grupo:
        futuros = {grupo.submit(procesar, f, centro, base, tamano, a.coleccion): f for f in candidatas}
        for futuro in as_completed(futuros):
            try:
                resultado, motivo = futuro.result()
            except Exception as error:
                descartes.append(f"error: {str(error)[:80]}")
                continue
            if resultado is None:
                descartes.append(motivo)
                continue
            cuadro, bits_cuadro, diag = resultado
            cuadros.append(cuadro)
            bits.update(bits_cuadro)
            diagnosticos.append((cuadro["date"], cuadro["band"], diag))

    cuadros.sort(key=lambda c: c["mjd"])
    if len(cuadros) > a.max:
        indices = np.linspace(0, len(cuadros) - 1, a.max).round().astype(int)
        cuadros = [cuadros[i] for i in sorted(set(indices))]

    SALIDA.mkdir(exist_ok=True)
    salida = {
        "query": {"ra": round(centro.ra.deg, 7), "dec": round(centro.dec.deg, 7), "size_arcsec": a.size, "collection": a.coleccion},
        "pixel_scale_arcsec": ESCALA_PX,
        "provenance": "cached",
        "cached": True,
        "grid_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "target": {"id": a.objetivo, "reference": obj["fuente"], "epoch": obj["epoca"], "pmra": obj["pmra"], "pmdec": obj["pmdec"]},
        "flag_bits": dict(sorted(bits.items(), key=lambda kv: kv[1])),
        "catalog_sources": [],
        "frames": cuadros,
        "notes": [
            f"Datos reales de IRSA ({a.coleccion}) guardados el {datetime.now(timezone.utc).date()}; no se actualizan solos.",
            f"{len(tabla)} imágenes contienen la posición en su huella; se probaron {len(candidatas)} y se descartaron {len(descartes)} porque el objeto cae fuera del recorte o hubo error.",
            "Todos los cuadros están reproyectados (vecino más cercano) a una misma cuadrícula TAN de 6.15\"/px centrada en query, en la convención estándar de FITS: fila 0 = borde SUR, columna 0 = borde ESTE; al dibujar con la fila 0 abajo queda el norte arriba y el este a la izquierda.",
            "query_xy y predicted_xy usan píxeles con origen 0 (x = columna, y = fila); wcs.crpix usa origen 1 como FITS; wcs.cd es exacto para esta cuadrícula.",
            "NaN en data = sin datos (fuera del detector en esa imagen); sus banderas valen 0.",
        ],
    }
    destino = SALIDA / f"{a.objetivo}_{a.coleccion}.json"
    destino.write_text(json.dumps(salida, separators=(",", ":")), encoding="utf-8")

    print(f"  cuadros válidos guardados: {len(cuadros)} · descartados: {len(descartes)}")
    print(f"  bandas: {sorted({c['band'] for c in cuadros})} · fechas: {cuadros[0]['date'][:10] if cuadros else '-'} a {cuadros[-1]['date'][:10] if cuadros else '-'}")
    print(f"  banderas de la cabecera: {salida['flag_bits']}")
    print(f"  archivo: {destino} ({destino.stat().st_size / 1e6:.2f} MB)")
    motivos = {}
    for d in descartes:
        motivos[d.split(" (")[0]] = motivos.get(d.split(" (")[0], 0) + 1
    print(f"  motivos de descarte: {motivos}")
    print("  diagnóstico (fecha, banda, flujo en la posición predicha / fondo, bits):")
    for fecha, banda, d in sorted(diagnosticos)[:12]:
        print(f"    {fecha[:10]} B{banda}  {d['flujo_predicho']!s:>10.10} / {d['fondo']:.2f}  bits={d['bits_predicho']}")


if __name__ == "__main__":
    main()
