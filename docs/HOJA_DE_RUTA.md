# Hoja de ruta de SPHEREx Explorer

Plan acordado el 2026-11-18, después de la entrega de NASA Space Apps 2026.
Los avances, pruebas y soluciones de cada paso se registran en [BITACORA.md](BITACORA.md).

## Estado de las capas

| Capa | Qué hace | Estado |
|---|---|---|
| 1 | Consulta y muestra los cuadros de SPHEREx desde IRSA (guardados y en vivo) | Hecha |
| 2 | Fotometría y espectro del objetivo | Hecha para los 5 objetivos del reto |
| 3 | Identificar lo que se ve: conocido, asteroide, artefacto o desconocido | Pendiente |
| 4 | Asistente: alertas por reglas y chat con fuentes citadas | Pendiente |

## Orden de trabajo

### 1. Búsqueda por nombre
- Escribir el nombre de un objeto (Betelgeuse, M31, Barnard's star) en el campo de coordenadas.
- El backend lo resuelve con el servicio Sesame del CDS (SIMBAD, NED, VizieR).
- Si el objeto tiene movimiento propio, la posición se lleva a la fecha actual.
- La interfaz muestra una ficha corta: nombre, tipo de objeto, magnitudes y fuente.
- Es la base de todo lo demás: saber qué objeto es.

### 2. Capa 3: identificación de fuentes
1. Detectar fuentes en el recorte (photutils).
2. Cruzar con catálogos de misiones pasadas: Gaia DR3 (posición propagada a la fecha del cuadro), 2MASS, AllWISE y SIMBAD.
3. Buscar asteroides y cometas conocidos (JPL Small-Body Identification o SkyBoT).
4. Descartar artefactos:
   - Rayo cósmico: aparece en un solo cuadro.
   - Persistencia ("memoria del píxel"): aparece en el mismo píxel del detector donde antes hubo una fuente brillante.
   - Píxel caliente o defectuoso: banderas de calidad.
5. Lo que queda se marca como "desconocido por revisar".
- En la imagen: círculos por categoría, leyenda y filtro para ocultar lo conocido ("modo cazador").

### 3. Capa 4: asistente
1. Alertas por reglas (no inventan datos), por ejemplo: el brillo del objeto frente a los límites de saturación de cada banda, y las banderas de saturación y persistencia de los cuadros.
   - Ejemplo: "Betelgeuse es demasiado brillante para estas bandas; el centro aparecerá saturado".
2. Chat con un modelo de lenguaje que explica las alertas y responde preguntas. Usa herramientas reales (Sesame/SIMBAD, IRSA, MAST, NASA Exoplanet Archive, NASA ADS) y cita cada fuente.
- El modelo corre por API desde el backend: la clave nunca va al navegador y hay un límite de consultas por visitante.
- Más adelante: una red neuronal para clasificar artefactos y cuadros malos, entrenada con las banderas de calidad.

### 4. Órbitas y zona observada (GMAT)
- Un script de GMAT por misión propaga la órbita y exporta efemérides, partiendo de estados reales de JPL Horizons o de TLE públicos.
- En la interfaz, una escena 3D ligera (Three.js) bajo el mapa galáctico muestra la Tierra, la órbita y la franja del cielo observada. Se sincroniza con la hora del cuadro seleccionado.
- SPHEREx: órbita baja polar sincronizada con el Sol; barre franjas del cielo perpendiculares al Sol.
- Hubble: órbita baja de 28.5°; apuntados reales sacados del registro de MAST.
- Webb: órbita de halo en L2; zona del cielo permitida por el parasol.
- Los clips en bucle para presentaciones se graban desde la misma escena.

### 5. Más misiones
- IRSA (mismo protocolo SIA v2): Spitzer, WISE/NEOWISE, 2MASS, Herschel, Euclid.
- MAST (conector aparte): Webb, Hubble, TESS, Kepler, GALEX, Pan-STARRS.
- Imagen de vista previa uniforme con CDS hips2fits.
- Selector de misiones con vista lado a lado. Cuando una misión no observó la zona, se dice explícitamente.

### Ideas para darle alcance (sin fecha)
- Capa del NASA Exoplanet Archive: estrellas con planetas confirmados y candidatos de TESS.
- Curvas de luz de TESS del objeto buscado.
- Enlaces a ciencia ciudadana: Planet Hunters TESS y Exoplanet Watch (JPL).
- Más idiomas (portugués, francés).
