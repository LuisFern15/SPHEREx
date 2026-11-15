import { Language } from '../types/spherex';

export interface TranslationStrings {
  brandTitle: string;
  searchPlaceholder: string;
  searchButton: string;
  invalidCoords: string;
  fieldSizeLabel: string;
  collectionLabel: string;
  collectionBoth: string;
  targetsLabel: string;
  propagatedLabel: string;
  switchLangLabel: string;
  provenanceLive: string;
  provenanceCached: string;
  provenanceError: string;
  provenanceEmpty: string;
  provenanceSimulated: string;
  provenanceLiveDesc: string;
  provenanceCachedDesc: string;
  provenanceSimulatedDesc: string;
  cachedSizeMismatchNote: string;
  queryingBackend: string;
  backendQueryFailed: string;
  defaultErrorMessage: string;
  errorSimHint: string;
  retryButton: string;
  loadingData: string;
  devSimToggle: string;
  devSimWarning: string;
  tabCalibration: string;
  tabSpectrumFuture: string;
  tabAssistantFuture: string;
  futureLayerNote: string;
  contrastPerBand: string;
  blackPoint: string;
  whitePoint: string;
  softeningAsinh: string;
  paletteLabel: string;
  zoomPanLabel: string;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetView: string;
  overlaysLabel: string;
  toggleFlags: string;
  toggleCatalog: string;
  toggleReticles: string;
  reticleFixedLegend: string;
  reticlePredictedLegend: string;
  reticleRef2010Legend: string;
  compareSection: string;
  modeSingle: string;
  modeBlink: string;
  modeDiff: string;
  blinkRefLabel: string;
  blinkCurrentLabel: string;
  diffBlockedTag: string;
  pinRefEpoch: string;
  refEpochPinned: string;
  noRefPinned: string;
  deltaLambdaLabel: string;
  halfChannelLabel: string;
  deltaLambdaBlocked: string;
  confirmUnsafeDiff: string;
  pixelInspectorTitle: string;
  hoverPrompt: string;
  pixelCoordLabel: string;
  fluxLabel: string;
  linearWcsApprox: string;
  activeFlagsPixel: string;
  noFlagsPixel: string;
  saturationTag: string;
  persistenceTag: string;
  bandsLabel: string;
  allBands: string;
  bandPrefix: string;
  wavelengthSpreadAlert: string;
  epochModeLabel: string;
  epochCoaddMode: string;
  singleFramesMode: string;
  play: string;
  pause: string;
  prev: string;
  next: string;
  loop: string;
  speedLabel: string;
  epochTimelineLabel: string;
  framesInEpoch: string;
  frameSheetTitle: string;
  bandDetLabel: string;
  targetNotesTitle: string;
  customCoordsNote: string;
  noDataTitle: string;
  coaddedBadge: string;
  rawFrameBadge: string;
  saturationAlertLabel: string;
  persistenceAlertLabel: string;
  wiseInvisibleNote: string;
  defaultFlagBitsWarning: string;
  transientFlagHelp: string;
  sourceFlagHelp: string;
  infoFlagsOverlayNote: string;
  predictedOutOfBoundsLabel: string;
  emptyCollectionTitle: string;
  emptyCollectionBody: string;
  switchCollectionButton: string;
  tryAnotherCollectionButton: string;
  irsaCoverageLabel: string;
  framesLoadedLabel: string;
}

export const TRANSLATIONS: Record<Language, TranslationStrings> = {
  es: {
    brandTitle: 'Explorador SPHEREx',
    searchPlaceholder: 'RA Dec (decimal, 08h55m... o 08:55:...)',
    searchButton: 'Buscar',
    invalidCoords: 'Formato inválido. Usa grados decimales o sexagesimal (h/d, espacios o :).',
    fieldSizeLabel: 'Campo',
    collectionLabel: 'Colección',
    collectionBoth: 'Ambas',
    targetsLabel: 'Objetivos',
    propagatedLabel: 'Propagado a fecha actual',
    switchLangLabel: 'Cambiar idioma ES/EN',
    provenanceLive: 'En vivo',
    provenanceCached: 'Guardado',
    provenanceError: 'Error',
    provenanceEmpty: 'Sin datos',
    provenanceSimulated: 'Simulado (dev)',
    provenanceLiveDesc: 'Datos servidos en directo desde el backend SPHEREx / IRSA.',
    provenanceCachedDesc: 'Mostrando datos reales guardados en caché local del backend.',
    provenanceSimulatedDesc: 'Modo de desarrollo activo: datos sintéticos (no son observaciones reales).',
    cachedSizeMismatchNote: 'Datos guardados de {n}″: el campo no cambia',
    queryingBackend: 'Consultando datos SPHEREx…',
    backendQueryFailed: 'Error en la consulta al servidor de datos.',
    defaultErrorMessage: 'No se pudo obtener respuesta del servidor local de datos SPHEREx.',
    errorSimHint:
      'Por rigor científico, el modo simulado no se activa automáticamente ante un fallo real. Puedes reintentar la consulta o activar el interruptor de desarrollo.',
    retryButton: 'Reintentar',
    loadingData: 'Cargando datos…',
    devSimToggle: 'Simulador (dev)',
    devSimWarning: 'Solo desarrollo: dibuja marca SIMULADO sobre la imagen.',
    tabCalibration: 'Calibración',
    tabSpectrumFuture: 'Espectro (Capa 2)',
    tabAssistantFuture: 'Asistente (Capa 4)',
    futureLayerNote: 'Espacio reservado para futura capa científica.',
    contrastPerBand: 'Contraste asinh compartido por banda',
    blackPoint: 'Punto negro (min)',
    whitePoint: 'Punto blanco (max)',
    softeningAsinh: 'Suavizado asinh (s)',
    paletteLabel: 'Paleta científica',
    zoomPanLabel: 'Zoom y encuadre',
    zoomOutLabel: 'Alejar',
    zoomInLabel: 'Acercar',
    resetView: 'Restablecer',
    overlaysLabel: 'Capas superpuestas',
    toggleFlags: 'Banderas de calidad (flags)',
    toggleCatalog: 'Catálogo de referencia (cat)',
    toggleReticles: 'Retícula fija + posición predicha',
    reticleFixedLegend: 'Posición pedida (query_xy)',
    reticlePredictedLegend: 'Posición predicha en época (predicted_xy)',
    reticleRef2010Legend: 'Ref. enunciado ~2010.34 (sin centrar)',
    compareSection: 'Comparación A/B y resta',
    modeSingle: 'Cuadro',
    modeBlink: 'Parpadeo A/B',
    modeDiff: 'Resta B − A',
    blinkRefLabel: 'A (Ref)',
    blinkCurrentLabel: 'B (Actual)',
    diffBlockedTag: ' (Bloqueado Δλ)',
    pinRefEpoch: 'Fijar época actual como A',
    refEpochPinned: 'Referencia A:',
    noRefPinned: 'Fija una referencia A para comparar.',
    deltaLambdaLabel: 'Δλ = |λ_B − λ_A|',
    halfChannelLabel: '½ ancho canal',
    deltaLambdaBlocked:
      'Δλ supera medio ancho de canal: las estrellas dejarán residuo por diferencia de longitud de onda.',
    confirmUnsafeDiff: 'Permitir resta bajo mi riesgo',
    pixelInspectorTitle: 'Inspector de píxel',
    hoverPrompt: 'Pasa el cursor sobre el recorte para inspeccionar flujo MJy/sr y banderas.',
    pixelCoordLabel: 'Píxel (x, y)',
    fluxLabel: 'Flujo',
    linearWcsApprox: 'WCS lineal aprox.',
    activeFlagsPixel: 'Banderas en píxel:',
    noFlagsPixel: 'Sin banderas activas en este píxel.',
    saturationTag: 'SATURACIÓN',
    persistenceTag: 'PERSISTENCIA',
    bandsLabel: 'Banda espectral',
    allBands: 'Todas (0)',
    bandPrefix: 'B',
    wavelengthSpreadAlert:
      'Varias longitudes de onda (wave_um.center) mezcladas: un cambio aparente de brillo puede deberse al color del objeto, no a variabilidad temporal.',
    epochModeLabel: 'Agrupación temporal',
    epochCoaddMode: 'Épocas (suma por detector)',
    singleFramesMode: 'Cuadros sueltos en época',
    play: 'Reproducir',
    pause: 'Pausar',
    prev: 'Anterior',
    next: 'Siguiente',
    loop: 'Bucle',
    speedLabel: 'Velocidad',
    epochTimelineLabel: 'Línea temporal de épocas',
    framesInEpoch: 'Cuadros en esta época',
    frameSheetTitle: 'Ficha técnica del cuadro',
    bandDetLabel: 'Banda/Det',
    targetNotesTitle: 'Notas científicas del objetivo',
    customCoordsNote: 'Consulta personalizada de coordenadas J2000/ICRS en datos guardados locales de SPHEREx.',
    noDataTitle: 'Sin cuadros disponibles',
    coaddedBadge: 'Suma por detector',
    rawFrameBadge: 'Exposición individual',
    saturationAlertLabel: 'Saturación detectada',
    persistenceAlertLabel: 'Persistencia detectada',
    wiseInvisibleNote:
      'Si no ves el objeto sobre el fondo (lo normal en una sola exposición), activa "Épocas (suma por detector)" y prueba la banda 6.',
    defaultFlagBitsWarning: 'Bits de banderas por defecto, sin confirmar con la cabecera',
    transientFlagHelp: 'TRANSIENT: rayo cósmico o derrame de carga de una estrella saturada.',
    sourceFlagHelp: 'SOURCE: píxeles de fuentes catalogadas conocidas (no es un defecto del detector).',
    infoFlagsOverlayNote: 'SOURCE y otras banderas informativas se listan en la ficha, no en la capa.',
    predictedOutOfBoundsLabel: 'Posición predicha fuera del recorte',
    emptyCollectionTitle: 'Sin imágenes en esta colección',
    emptyCollectionBody: 'No hay exposiciones disponibles en la colección seleccionada para esta coordenada.',
    switchCollectionButton: 'Cambiar a',
    tryAnotherCollectionButton: 'Probar otra colección',
    irsaCoverageLabel: 'Imágenes en IRSA',
    framesLoadedLabel: 'Cuadros cargados',
  },
  en: {
    brandTitle: 'SPHEREx Explorer',
    searchPlaceholder: 'RA Dec (decimal, 08h55m... or 08:55:...)',
    searchButton: 'Search',
    invalidCoords: 'Invalid coordinate format. Use decimal degrees or sexagesimal (h/d, spaces, or :).',
    fieldSizeLabel: 'FOV',
    collectionLabel: 'Collection',
    collectionBoth: 'Both',
    targetsLabel: 'Targets',
    propagatedLabel: 'Propagated to current date',
    switchLangLabel: 'Switch language ES/EN',
    provenanceLive: 'Live',
    provenanceCached: 'Cached',
    provenanceError: 'Error',
    provenanceEmpty: 'No data',
    provenanceSimulated: 'Simulated (dev)',
    provenanceLiveDesc: 'Live cutout data served from SPHEREx / IRSA backend.',
    provenanceCachedDesc: 'Displaying real cutout data from local backend cache.',
    provenanceSimulatedDesc: 'Developer simulation mode active: synthetic data (not real observations).',
    cachedSizeMismatchNote: 'Stored data of {n}″: field size does not change',
    queryingBackend: 'Querying SPHEREx data…',
    backendQueryFailed: 'Data server query failed.',
    defaultErrorMessage: 'Could not get a response from the local SPHEREx data server.',
    errorSimHint:
      'For scientific integrity, simulated data never replaces failed queries automatically. Retry the request or enable the dev simulator toggle explicitly.',
    retryButton: 'Retry',
    loadingData: 'Loading data…',
    devSimToggle: 'Simulator (dev)',
    devSimWarning: 'Dev only: renders SIMULATED watermark directly over cutout.',
    tabCalibration: 'Calibration',
    tabSpectrumFuture: 'Spectrum (Layer 2)',
    tabAssistantFuture: 'Assistant (Layer 4)',
    futureLayerNote: 'Reserved slot for upcoming scientific layer.',
    contrastPerBand: 'Shared per-band asinh stretch',
    blackPoint: 'Black point (min)',
    whitePoint: 'White point (max)',
    softeningAsinh: 'asinh softening (s)',
    paletteLabel: 'Scientific colormap',
    zoomPanLabel: 'Zoom & pan',
    zoomOutLabel: 'Zoom out',
    zoomInLabel: 'Zoom in',
    resetView: 'Reset',
    overlaysLabel: 'Overlays',
    toggleFlags: 'Quality flags layer',
    toggleCatalog: 'Reference catalog (cat)',
    toggleReticles: 'Fixed reticle + predicted position',
    reticleFixedLegend: 'Requested query (query_xy)',
    reticlePredictedLegend: 'Predicted epoch position (predicted_xy)',
    reticleRef2010Legend: 'Prompt ref. ~2010.34 (uncentered)',
    compareSection: 'A/B Blink & Difference',
    modeSingle: 'Frame',
    modeBlink: 'Blink A/B',
    modeDiff: 'Diff B − A',
    blinkRefLabel: 'A (Ref)',
    blinkCurrentLabel: 'B (Current)',
    diffBlockedTag: ' (Blocked Δλ)',
    pinRefEpoch: 'Pin current as Reference A',
    refEpochPinned: 'Reference A:',
    noRefPinned: 'Pin a Reference A epoch to compare.',
    deltaLambdaLabel: 'Δλ = |λ_B − λ_A|',
    halfChannelLabel: '½ channel width',
    deltaLambdaBlocked:
      'Δλ exceeds half the channel width: subtraction will leave false star residuals.',
    confirmUnsafeDiff: 'Allow diff despite Δλ mismatch',
    pixelInspectorTitle: 'Pixel inspector',
    hoverPrompt: 'Hover over the cutout to read MJy/sr flux and quality flags.',
    pixelCoordLabel: 'Pixel (x, y)',
    fluxLabel: 'Flux',
    linearWcsApprox: 'Approx. linear WCS',
    activeFlagsPixel: 'Pixel flags:',
    noFlagsPixel: 'No active flags on this pixel.',
    saturationTag: 'SATURATION',
    persistenceTag: 'PERSISTENCE',
    bandsLabel: 'Spectral band',
    allBands: 'All (0)',
    bandPrefix: 'B',
    wavelengthSpreadAlert:
      'Multiple wavelengths (wave_um.center) mixed: brightness changes may reflect spectral color rather than true variability.',
    epochModeLabel: 'Temporal grouping',
    epochCoaddMode: 'Epochs (detector co-add)',
    singleFramesMode: 'Individual exposures in epoch',
    play: 'Play',
    pause: 'Pause',
    prev: 'Prev',
    next: 'Next',
    loop: 'Loop',
    speedLabel: 'Speed',
    epochTimelineLabel: 'Epoch timeline',
    framesInEpoch: 'Frames in epoch',
    frameSheetTitle: 'Frame technical sheet',
    bandDetLabel: 'Band/Det',
    targetNotesTitle: 'Target scientific notes',
    customCoordsNote: 'Custom J2000/ICRS coordinate query on locally stored SPHEREx data.',
    noDataTitle: 'No frames available',
    coaddedBadge: 'Detector co-add',
    rawFrameBadge: 'Single exposure',
    saturationAlertLabel: 'Saturation flagged',
    persistenceAlertLabel: 'Persistence flagged',
    wiseInvisibleNote:
      'If the object does not stand out from the background (normal in a single exposure), turn on "Epochs (detector co-add)" and try Band 6.',
    defaultFlagBitsWarning: 'Default flag bits, unconfirmed against FITS header',
    transientFlagHelp: 'TRANSIENT: cosmic ray hit or charge spillover from a saturated star.',
    sourceFlagHelp: 'SOURCE: pixels belonging to known cataloged sources (not a detector defect).',
    infoFlagsOverlayNote: 'SOURCE and other informational flags are listed in the frame sheet, not drawn on the overlay.',
    predictedOutOfBoundsLabel: 'Predicted position outside cutout',
    emptyCollectionTitle: 'No images in this collection',
    emptyCollectionBody: 'No exposures are available in the selected collection for this sky position.',
    switchCollectionButton: 'Switch to',
    tryAnotherCollectionButton: 'Try another collection',
    irsaCoverageLabel: 'Images in IRSA',
    framesLoadedLabel: 'Frames loaded',
  },
};
