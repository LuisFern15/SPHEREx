# API del backend SPHEREx (para conectar el frontend)

Backend FastAPI (`backend/main.py`, versión 0.3.0). Solo lectura (`GET`), sin autenticación, respuestas JSON con gzip.

## Arranque local

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8010
```

Frontend: `VITE_API_URL=http://127.0.0.1:8010` (en `.env.local`). CORS permite `localhost`/`127.0.0.1` en los puertos 3000 y 5173 y `https://spherex.nls9.workers.dev`.

## Endpoints

| Ruta | Parámetros | Devuelve | Errores |
| --- | --- | --- | --- |
| `/api/health` | – | `{status, cached_fits, snapshots: ["objetivo:colección", ...]}` | – |
| `/api/targets` | – | `{targets: [{id, snapshot_collections, frame_counts, photometry_collections, latest_generated_at}]}` | – |
| `/api/frames` | `ra`, `dec`, `size` (30–300), `collection` (`spherex_dr1`, `spherex_qr3`, `spherex_dr1_deep`, `spherex_qr3_deep`, `spherex_both`/`both`), `band` (0–6, opcional) | Cuadros del snapshot más cercano (≤120″): contrato de `src/types/spherex.ts`; `spherex_both`/`both` junta solo `spherex_dr1` y `spherex_qr3` | 400 si `collection` no es válida; 404 con `detail` si la posición tiene datos en otra colección o si no hay datos guardados en ninguna colección |
| `/api/inventory` | `target` | `{target, total_images, collections: {col: {collection, images, date_range, visits, by_band}}}` (todas las imágenes de IRSA, no solo las cargadas) | 404 si el objetivo no existe o no tiene inventario |
| `/api/photometry` | `target`, `collection` (también `spherex_both`/`both`, `spherex_dr1_deep`, `spherex_qr3_deep`) | Archivo de fotometría (ver abajo); con `spherex_both` junta DR1 y QR3 ordenado por MJD (si solo existe una colección devuelve copia con `collection: "spherex_both"` y nota; si difieren radios de anillo añade `halo_px` y `annulus_px` por medida y nota explicativa) | 400 si `target`/`collection` no están en la lista blanca; 404 si no hay archivo |
| `/api/resolve` | `name` (1–100 caracteres) | `{query, name, resolver, object_type, object_type_es, object_type_en, spectral_type, ra_j2000, dec_j2000, pmra_mas_yr, pmdec_mas_yr, parallax_mas, magnitudes: {banda: mag}, ra, dec, propagated, epoch, simbad_url}`. `ra`/`dec` están llevadas a la fecha actual si hay movimiento propio (`propagated: true`). Usa CDS Sesame (SIMBAD, NED, VizieR) con dos espejos y caché en memoria | 404 si ningún catálogo conoce el nombre; 502 si Sesame no respondió |

Objetivos válidos: `barnard`, `epsindib`, `wise0855`, `rwaur`, `rdra`.

## Datos guardados

| Objetivo | Snapshot DR1 (cuadros) | Snapshot QR3 | Fotometría DR1 / QR3 (válidas) |
| --- | --- | --- | --- |
| `barnard` | 150 (selección curada) | 60 | apertura 0 / 0 (núcleo saturado) · halo 71 / 31 |
| `epsindib` | 149 | 60 | apertura 128 / 51 |
| `wise0855` | 100 | – | apertura 89 (solo DR1) |
| `rwaur` | 149 | 60 | apertura 29 / 8 · halo 119 / 45 |
| `rdra` | 148 | 60 | apertura 0 / 0 (satura) · halo 108 / 50 |

Las selecciones curadas de DR1 (150 imágenes por objetivo y 100 para WISE 0855, elegidas por criterio científico; algunas se descartan si el objeto cae fuera del recorte) están en `backend/selecciones/`. La fotometría mide exactamente las imágenes de cada snapshot (`--solo-snapshot`), así que la curva de luz y el visor muestran las mismas fechas. Una medida deja de ser válida si se pierde más del 10% del peso de la apertura por píxeles con banderas de daño.

## Fotometría: forma del archivo

```json
{
  "target": "wise0855", "collection": "spherex_dr1", "generated_at": "...", "method": "aperture_forced",
  "aperture_px": 2.0, "halo_px": [2.0, 3.5], "annulus_px": [6.0, 10.0], "units": "µJy",
  "center": {"ra": 133.7577808, "dec": -7.2420239, "source": "..."},
  "notes": ["..."],
  "measurements": [{
    "id": "level2_2025W19_1B_0116_1D6_spx_l2b-v27-2026-197", "obs_id": "2025W19_1B_0116_1",
    "collection": "spherex_dr1", "mjd": 60800.70069, "date": "2025-05-05T16:49:00", "band": 6,
    "wave_um": {"center": 4.9674, "min": 4.9488, "max": 4.986}, "x": 18.30, "y": 15.94,
    "flux_ujy": 35.6, "err_ujy": 206.0, "snr": 0.17, "bkg_mjysr": 0.039, "bkg_source_contaminated": false,
    "halo_flux_ujy": -61.8, "halo_err_ujy": 306.2, "halo_valid": true,
    "aperture_px": 2.0, "n_bad": 0, "lost_weight_fraction": 0.0, "flags_or": 2097152, "flag_names": ["SOURCE"],
    "valid": true, "reason": ""
  }]
}
```

- `id` coincide con el `id` de cada cuadro de `/api/frames`: sirve para enlazar un punto de la curva con su imagen.
- `flux_ujy`/`err_ujy` son `null` cuando `valid` es falso; el motivo está en `reason`.
- Para fuentes saturadas (Barnard, R Draconis) usar `halo_flux_ujy`: es un indicador relativo, no un flujo total. Sus radios están en `halo_px` y cambian por objetivo.
- Comparar brillo solo dentro de una misma banda y con `wave_um.center` parecido (cada píxel de SPHEREx mide una longitud de onda distinta).

## Modo estático (sitio sin backend)

`python exportar_estaticos.py` escribe en `public/` de la raíz del repositorio donde se ejecuta, que es la carpeta que el frontend publica, copiando los mismos datos:

| Archivo estático | Equivale a |
| --- | --- |
| `public/snapshots/index.json` + `public/snapshots/<objetivo>_<col>.json` | `/api/frames` (el cliente elige por posición, ≤120″) |
| `public/fotometria/<objetivo>_<col>.json` | `/api/photometry` (el índice trae `photometry: {objetivo: [archivos]}`) |
| `public/inventario/<objetivo>.json` | `/api/inventory` |

## Regenerar datos

```bash
# Snapshot con la selección curada (sin consultar el SIA si IRSA falla: --desde-inventario)
python generar_snapshots.py wise0855 spherex_dr1 --lista selecciones/wise0855_spherex_dr1.csv --desde-inventario
# Fotometría de las mismas imágenes del visor
python generar_fotometria.py wise0855 spherex_dr1 --solo-snapshot --desde-inventario
# Inventario completo de IRSA y exportación estática
python inventario_irsa.py
python exportar_estaticos.py
```

La caché de recortes vive en `backend/cache/` (o en la carpeta de `SPHEREX_CACHE_DIR`). El centro de cada recorte se reutiliza del snapshot existente (`--centro snapshot`), así que la caché sigue sirviendo.

## Avisos científicos

- WISE 0855: a menos de 2 px hay una estrella de fondo fija (Gaia DR3 5756956644387831296; G 16.3, W2 15.05). En B1–B4 domina la estrella; en B6 aporta ~1/4 de la luz cuando se mezclan (2026).
- La fotometría de apertura no tiene corrección de apertura ni de PSF: sirve para comparar épocas, no como flujo absoluto.
