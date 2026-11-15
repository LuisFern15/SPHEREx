# Cambios en el backend

Documento técnico para Fernando sobre los cambios entre el commit inicial `9723294` y `c7e61fe` en `SPHEREx/backend/`.

## 1. Resumen

El backend ahora responde `/api/frames` con snapshots JSON de recortes reales descargados de IRSA en `backend/snapshots/`.
Los cuadros de cada snapshot están reproyectados a una cuadrícula común y traen `predicted_xy` calculado con el movimiento propio para la época de cada exposición (`apply_space_motion` de astropy; el desplazamiento anual por paralaje no se aplica; entre dos épocas suma como máximo ~0.2 px, en Barnard, y menos en los demás).
El camino original que recortaba FITS locales de `backend/data/` no reproyectaba ni propagaba el movimiento propio, y dependía de archivos de ~70 MB fuera del repositorio.
Además, el cliente puede operar sin servidor leyendo los mismos snapshots exportados a `public/snapshots/` mediante `public/snapshots/index.json`.
La ruta de FITS locales permanece en `main.py` solo como modo de depuración bajo `SPHEREX_FITS_LOCAL=1`.

## 2. Cambios en `main.py`

La versión de la aplicación FastAPI pasó de `0.2.1` a `0.2.2`. Cada cambio en `main.py` responde a una necesidad concreta:

- **Snapshots reales con caché por fecha de modificación** (`load_snapshots()`, `find_snapshots()`, `snapshot_response()`, `health()`, `get_frames()`):
  - `load_snapshots()` lee `SNAPSHOT_DIR` (`backend/snapshots/*.json`) y guarda cada entrada en `_CACHE_SNAPSHOTS` junto con su `st_mtime`. Si el archivo no cambió en disco, evita volver a leer y parsear ~0.7 MB por petición.
  - `find_snapshots()` busca los snapshots cuyo centro está a una distancia menor o igual a `SNAPSHOT_MATCH_ARCSEC` (`120.0` segundos de arco) de la coordenada `(ra, dec)` pedida.
  - `health()` conserva `cached_fits` y agrega `"snapshots"` con la lista `f"{s['target']}:{s['collection']}"`.
  - Motivo: servir datos reales verificados de IRSA sin relanzar `json.load` en cada llamada.

- **Colección `spherex_both` / `both`** (`find_snapshots()`, `snapshot_response()`, `get_frames()`):
  - Cuando `collection` es `"both"` o `"spherex_both"`, `find_snapshots()` pone `wanted = None` y devuelve todos los snapshots cercanos sin filtrar por colección.
  - `snapshot_response()` une las listas `frames` y las ordena por `mjd`, combina `flag_bits`, concatena las notas de cada archivo y antepone una nota con las colecciones juntadas (`" + "`).
  - Motivo: devolver DR1 y QR3 juntos en una sola consulta.

- **HTTP 404 con `detail` cuando hay datos en otra colección** (`get_frames()`):
  - Si `find_snapshots(ra, dec, collection)` no encuentra resultados, `get_frames()` llama a `find_snapshots(ra, dec, "both")`.
  - Si existen snapshots en otra colección (y no hay FITS locales activos), lanza `HTTPException` con estado `404` y `detail`: `"Sin datos guardados en {collection} para esta posición; hay datos en: ..."`.
  - Motivo: informar al frontend qué colección sí tiene datos para esa posición en lugar de devolver un error `503` genérico.

- **Ruta de FITS locales apagada salvo `SPHEREX_FITS_LOCAL=1`** (`FITS_LOCAL_ACTIVO`, `get_frames()`, `extract_cutout_from_fits()`):
  - `get_frames()` solo recorre `DATA_DIR` (`backend/data/*.fits*`) si `FITS_LOCAL_ACTIVO` (`os.environ.get("SPHEREX_FITS_LOCAL", "") == "1"`) es verdadero.
  - En `extract_cutout_from_fits()`, se eliminó `predicted_xy` del diccionario devuelto, se da prioridad a `MJD-AVG` sobre `MJD-OBS` y `MJD`, y se usa `DETECTOR` cuando falta `BAND`.
  - Motivo: recortar FITS locales deja cada cuadro en su propia cuadrícula sin reproyección común ni propagación del movimiento propio; solo sirve para depuración.

- **Banderas leídas de la cabecera** (`extract_cutout_from_fits()`, `get_frames()`, `snapshot_response()`):
  - `extract_cutout_from_fits()` extrae los bits leyendo las claves `MSKN*` de `hdul["FLAGS"].header`.
  - `get_frames()` junta esas claves en `bits_cabecera` y deja `DEFAULT_FLAG_BITS` solo como respaldo cuando la cabecera no trae ninguna (`usingDefaultFlagBits: not bits_cabecera`).
  - `snapshot_response()` devuelve `flag_bits` reales de los snapshots con `usingDefaultFlagBits: False`.
  - Motivo: usar las definiciones reales de la cabecera FITS en vez de depender únicamente de la tabla escrita a mano.

- **Parámetro `band=0`** (`get_frames()`):
  - El validador de `band` cambió de `ge=1, le=6` a `ge=0, le=6`.
  - En la ruta de snapshots filtra con `if band:`, y en la ruta de FITS locales con `if band is None or band == 0 or frame["band"] == band:`.
  - Motivo: aceptar `band=0` para pedir todas las bandas sin error de validación.

- **Mensajes, fechas y registro de errores** (`mjd_to_iso_date()`, `snapshot_response()`, `get_frames()`):
  - `mjd_to_iso_date()` captura `ValueError`, registra `logger.warning(...)` y devuelve `""` en lugar de la fecha actual del sistema.
  - `get_frames()` captura `(OSError, KeyError, ValueError)` con `logger.warning(...)` al saltar un FITS local inválido.
  - `snapshot_response()` añade una nota si el parámetro `size` difiere en más de `1` segundo de arco del `size_arcsec` guardado.
  - En el HTTP `503` final de `get_frames()`, el `detail` explica que los datos reales salen de `backend/snapshots/` (generados con `generar_snapshots.py`) y que `#sim=1` es solo el simulador de desarrollo, quitando la referencia al puerto `8000` y a `backend/data/`.
  - Motivo: evitar fechas inventadas, no silenciar errores de lectura y alinear los avisos con el flujo actual de snapshots.

- **CORS para el puerto 3000** (`app.add_middleware(CORSMiddleware, ...)`):
  - Se añadieron `"http://localhost:3000"` y `"http://127.0.0.1:3000"` a `allow_origins`.
  - Motivo: `npm run dev` en `package.json` ejecuta `vite --port=3000 --host=0.0.0.0`.

## 3. Archivos nuevos

- `generar_snapshots.py`:
  - Para qué sirve: consulta el SIA de IRSA para un objetivo de `OBJETIVOS` y una colección, selecciona candidatas repartidas por banda y tiempo (`elegir_candidatas()`), descarga recortes con caché en `backend/cache/` (`bajar_recorte()`), calcula la posición del objeto en `MJD-AVG` con su movimiento propio, descarta imágenes donde el objeto cae fuera del recorte, obtiene `wave_um` con el WCS espectral (`key="W"`), reproyecta por vecino más cercano a `rejilla_comun()` y guarda `backend/snapshots/<objetivo>_<coleccion>.json`.
  - Comando: `python generar_snapshots.py <objetivo> <coleccion> [--max 60] [--size 200] [--hilos 6]` (ejemplo: `python generar_snapshots.py barnard spherex_qr3 --max 60 --size 200`).

- `exportar_estaticos.py`:
  - Para qué sirve: borra los `.json` previos en `public/snapshots/`, copia todos los archivos de `backend/snapshots/*.json` a `public/snapshots/` y genera `public/snapshots/index.json` con `match_arcsec` (`120.0`) y los metadatos de cada snapshot.
  - Comando: `python exportar_estaticos.py`.

- `inventario_irsa.py`:
  - Para qué sirve: consulta el SIA de IRSA para los cinco objetivos de `OBJETIVOS` y las colecciones indicadas, guarda un CSV por combinación en `backend/inventario/<objetivo>_<coleccion>.csv` y genera `backend/inventario/resumen.md` con conteos por banda, rangos de longitud de onda, visitas, recortes en `backend/cache/` y volumen estimado de descarga.
  - Comando: `python inventario_irsa.py [--colecciones spherex_dr1 spherex_qr3]`.

- `convertir_snapshots.py`:
  - Para qué sirve: migra archivos JSON de `grid_version` 1 (fila `0` al norte, `crpix` con origen `0`) a `grid_version` 2 (fila `0` al sur, `crpix` con origen `1`), invirtiendo las filas de `data` y `flags`, ajustando la coordenada `y` de `query_xy`, `predicted_xy` y `target_xy`, sumando `1` a `crpix` y dejando positivo `cd[1][1]`.
  - Comando: `python convertir_snapshots.py [archivo.json ...]` (sin argumentos procesa todos los archivos de `backend/snapshots/`).

- `senal_ruido.py`:
  - Para qué sirve: verifica la detección en los snapshots midiendo la señal en una apertura de `3x3` píxeles centrada en `predicted_xy` menos el fondo mediano del recorte, y comparándola con `60` posiciones de control aleatorias separadas más de `6` píxeles.
  - Comando: `python senal_ruido.py <archivo.json ...>`.

- `verificar_wcs_frontend.py`:
  - Para qué sirve: replica `pixelToSkyLinear` (`src/utils/coordinates.ts`) en `pixel_a_cielo()`, compara la coordenada cielo resultante contra la propagación de `astropy` y verifica el porcentaje de cuadros donde el píxel máximo queda a menos de `3` píxeles de `predicted_xy`.
  - Comando: `python verificar_wcs_frontend.py <archivo.json ...>`.

- `requirements.txt` (sustituye a `requierments.txt`):
  - Para qué sirve: corrige el nombre del archivo eliminado `requierments.txt`, cambia versiones exactas por cotas mínimas (`fastapi>=0.115`, `uvicorn[standard]>=0.34`, `astropy>=6.1`, `numpy>=1.26`), retira `fsspec` y `s3fs`, y añade `astroquery>=0.4.11` y `requests>=2.32` para consultar IRSA y descargar recortes.
  - Comando: `pip install -r requirements.txt`.

Además, `backend/.gitignore` añade `cache/` para no subir los recortes FITS descargados por `generar_snapshots.py`.

## 4. Datos

### Los 9 snapshots

Todos están en `backend/snapshots/` (y copiados en `public/snapshots/`), cada uno con `60` cuadros y `size_arcsec: 200.0`:

| Archivo | Objetivo | Colección | Cuadros |
| --- | --- | --- | --- |
| `barnard_spherex_dr1.json` | `barnard` | `spherex_dr1` | 60 |
| `barnard_spherex_qr3.json` | `barnard` | `spherex_qr3` | 60 |
| `epsindib_spherex_dr1.json` | `epsindib` | `spherex_dr1` | 60 |
| `epsindib_spherex_qr3.json` | `epsindib` | `spherex_qr3` | 60 |
| `rdra_spherex_dr1.json` | `rdra` | `spherex_dr1` | 60 |
| `rdra_spherex_qr3.json` | `rdra` | `spherex_qr3` | 60 |
| `rwaur_spherex_dr1.json` | `rwaur` | `spherex_dr1` | 60 |
| `rwaur_spherex_qr3.json` | `rwaur` | `spherex_qr3` | 60 |
| `wise0855_spherex_dr1.json` | `wise0855` | `spherex_dr1` | 60 |

`wise0855` no tiene snapshot de `spherex_qr3` porque el inventario no encontró imágenes en esa colección.

### Contrato de cada cuadro

Cada elemento de `frames` generado por `generar_snapshots.py` contiene:

- `id`: nombre base de la URL del recorte.
- `obs_id`: valor de la cabecera `OBSID`.
- `collection`: colección de IRSA (`spherex_dr1` o `spherex_qr3`).
- `mjd`: instante medio de exposición (`MJD-AVG`).
- `date`: fecha ISO `YYYY-MM-DDTHH:MM:SS` (`Time(mjd, format="mjd").isot[:19]`).
- `band`: entero de banda (`1` a `6`).
- `detector`: entero de detector (`DETECTOR`).
- `wave_um`: diccionario `{"center", "min", "max"}` en micrómetros.
- `shape`: `[n, n]` (`n` impar).
- `data`: matriz `float32` little-endian (`<f4`) en base64 (`NaN` fuera del detector).
- `flags`: matriz `uint32` little-endian (`<u4`) en base64 (`0` fuera del detector).
- `query_xy`: `[x, y]` del centro de consulta en la cuadrícula común (origen `0`).
- `predicted_xy`: `[x, y]` de la posición predicha del objetivo en `mjd` (origen `0`).
- `target_xy`: `[x, y]` igual a `predicted_xy` (origen `0`).
- `wcs`: `{"crval": [ra, dec], "crpix": [(n - 1) / 2 + 1, (n - 1) / 2 + 1], "cd": [[-6.15/3600, 0.0], [0.0, 6.15/3600]]}`.
- `valid_fraction`: fracción de píxeles válidos en el recorte.
- `source_url`: URL original del servicio de recortes en IRSA.

### Convención de la cuadrícula

- `grid_version`: `2`.
- Proyección `RA---TAN` / `DEC--TAN` a `6.15"`/px, con tamaño `[n, n]` impar para que el centro caiga en un píxel.
- Convención FITS estándar: la fila `0` corresponde al borde sur (`Dec` crece con la fila, `cd[1][1] = +6.15 / 3600`) y la columna `0` al borde este (`RA` decrece con la columna, `cd[0][0] = -6.15 / 3600`). Al dibujar con la fila `0` abajo, el norte queda arriba y el este a la izquierda.
- `wcs.crpix` usa origen `1` (`[(n - 1) / 2 + 1, (n - 1) / 2 + 1]`).
- `query_xy`, `predicted_xy` y `target_xy` usan píxeles con origen `0` (`x` = columna, `y` = fila).

### Inventario de IRSA (`backend/inventario/resumen.md`)

Totales registrados el `2026-11-15T06:25 UTC` mediante el SIA de IRSA:

| Objetivo | Colección | Imágenes | Visitas | Rango de fechas |
| --- | --- | --- | --- | --- |
| `barnard` | `spherex_dr1` | 239 | 7 | 2025-08-15 a 2026-05-05 |
| `barnard` | `spherex_qr3` | 121 | 3 | 2026-08-16 a 2026-09-22 |
| `epsindib` | `spherex_dr1` | 343 | 8 | 2025-04-24 a 2026-05-04 |
| `epsindib` | `spherex_qr3` | 120 | 1 | 2026-09-22 a 2026-10-02 |
| `wise0855` | `spherex_dr1` | 258 | 8 | 2025-05-05 a 2026-05-14 |
| `wise0855` | `spherex_qr3` | 0 | 0 | Sin imágenes |
| `rwaur` | `spherex_dr1` | 226 | 5 | 2025-09-01 a 2026-03-12 |
| `rwaur` | `spherex_qr3` | 110 | 2 | 2026-09-02 a 2026-09-16 |
| `rdra` | `spherex_dr1` | 417 | 19 | 2025-05-16 a 2026-05-13 |
| `rdra` | `spherex_qr3` | 126 | 6 | 2026-05-16 a 2026-07-16 |
| `rdra` | `spherex_dr1_deep` | 1225 | 13 | 2025-04-24 a 2026-05-06 (solo D1, D3, D4, D6) |
| `rdra` | `spherex_qr3_deep` | 729 | 6 | 2026-07-10 a 2026-09-27 (solo D1 y D4) |

## 5. Ejecución local y modo estático

### Cómo correrlo localmente

1. Instalar dependencias desde `backend/`:
   ```bash
   pip install -r requirements.txt
   ```
2. Iniciar el servidor FastAPI en el puerto `8010`:
   ```bash
   uvicorn main:app --port 8010
   ```
   (Para habilitar la ruta de depuración con FITS en `backend/data/`, definir `SPHEREX_FITS_LOCAL=1`.)
3. Levantar el frontend apuntando al backend local, desde la raíz del repositorio (o poniendo `VITE_API_URL` en `.env.local`):
   ```bash
   VITE_API_URL=http://127.0.0.1:8010 npm run dev
   ```
   `npm run dev` sirve el frontend en el puerto `3000`, que ya está autorizado en `CORSMiddleware` de `main.py`.

### Cómo funciona el modo estático

- `exportar_estaticos.py` copia `backend/snapshots/*.json` a `public/snapshots/` y genera `public/snapshots/index.json` con `version: 1`, `match_arcsec: 120.0` y las entradas por archivo (`file`, `target`, `collection`, `ra`, `dec`, `size_arcsec`, `generated_at`, `frames`).
- En el sitio desplegado en Cloudflare sin backend, `fetchFrames()` en `src/api/spherexClient.ts` consulta `${API_BASE}/api/frames`. Al recibir un error de red (`TypeError`), HTTP `502`/`504` o una respuesta que no es `application/json`, cambia a `fetchStaticFrames()`.
- `fetchStaticFrames()` descarga `snapshots/index.json` mediante `loadStaticIndex()`, filtra con `findMatchingSnapshotEntries()` las entradas a `<= 120"` de `(ra, dec)` para la colección solicitada (uniendo `spherex_dr1` y `spherex_qr3` si es `both` o `spherex_both`), descarga los JSON necesarios con `loadStaticSnapshot()`, ordena los cuadros por `mjd` y los entrega con `provenance: "cached"`.
- Si la posición solo existe en otra colección dentro de `index.json`, devuelve `emptyMessage` indicando en cuáles colecciones hay datos.

## 6. Pendientes conocidos

- **Fotometría por imagen**: no existe cálculo ni endpoint de fotometría por cuadro en el backend (solo está el script de verificación `senal_ruido.py` con apertura de `3x3` píxeles).
- **Generar todo DR1**: los snapshots actuales se generaron con `--max 60` cuadros por colección, mientras que el inventario completo de `spherex_dr1` tiene entre `226` y `417` imágenes según el objetivo.
- **Campo profundo de R Draconis (`spherex_dr1_deep`)**: está inventariado en `backend/inventario/rdra_spherex_dr1_deep.csv` (`1225` imágenes) y en `resumen.md` (junto con `rdra_spherex_qr3_deep`, `729` imágenes), pero no tiene snapshot generado en `backend/snapshots/`.
- **Endpoints faltantes**: `main.py` solo expone `/api/health` y `/api/frames`. Faltan `/api/targets` (`src/api/spherexClient.ts` tiene `fetchTargets()` con `TARGET_PRESETS` como respaldo, pero hoy la app no la llama), `/api/inventory` y `/api/photometry`. El prompt para cubrirlos está listo en el kit de trabajo (`prompt_backend_pendiente.md`).
