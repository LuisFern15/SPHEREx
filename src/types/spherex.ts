export type ProvenanceState = 'live' | 'cached' | 'error' | 'simulated';

export type Language = 'es' | 'en';

export type ColormapName = 'grayscale' | 'grayscale_inv' | 'inferno' | 'viridis' | 'cividis';

export type CompareMode = 'single' | 'blink' | 'diff';

export type FlagBitsMap = Record<string, number>;

export interface SpherexWcs {
  crval: [number, number];
  crpix: [number, number];
  cd: [[number, number], [number, number]];
}

export interface WaveRangeUm {
  center: number;
  min: number;
  max: number;
}

export interface RawSpherexFrame {
  id: string;
  mjd: number;
  date: string;
  epoch?: string | number;
  band: number;
  detector: number;
  wave_um: WaveRangeUm;
  shape: [number, number];
  data: string;
  flags: string;
  query_xy?: [number, number];
  predicted_xy?: [number, number];
  target_xy?: [number, number];
  wcs: SpherexWcs;
}

export interface DecodedSpherexFrame extends RawSpherexFrame {
  pixels: Float32Array;
  flagMask: Uint32Array;
  isCoadd?: boolean;
  coaddCount?: number;
  sourceFrameIds?: string[];
}

export interface CatalogSource {
  id: string;
  label: string;
  ra: number;
  dec: number;
  epoch?: number;
  note?: string;
  kind: 'target' | 'reference' | 'field';
}

export interface FramesQueryResult {
  query: {
    ra: number;
    dec: number;
    size_arcsec: number;
    collection: string;
  };
  pixel_scale_arcsec: number;
  provenance: ProvenanceState;
  cached: boolean;
  flag_bits: FlagBitsMap;
  usingDefaultFlagBits: boolean;
  catalog_sources: CatalogSource[];
  frames: DecodedSpherexFrame[];
  notes: string[];
  errorMessage?: string;
}

export interface TargetReferencePosition {
  ra: number;
  dec: number;
  epoch: number;
  labelEs: string;
  labelEn: string;
}

export interface TargetPreset {
  id: string;
  nameEs: string;
  nameEn: string;
  source: string;
  ra: number;
  dec: number;
  epoch: number;
  pmra: number; // mas/yr (includes cos(dec))
  pmdec: number; // mas/yr
  defaultBand: number;
  defaultSize: number;
  collections: string[]; // IRSA collections with data for this target
  defaultCollection: string; // default collection selected when choosing this target
  irsaCoverage: { dr1: number; qr3: number };
  changeType: 'proper_motion' | 'variability' | 'unresolved_pair';
  referencePosition?: TargetReferencePosition;
  notesEs: string;
  notesEn: string;
}

export interface EpochGroup {
  key: string;
  index: number;
  label: string;
  meanMjd: number;
  startDate: string;
  endDate: string;
  frames: DecodedSpherexFrame[];
  coaddsByBand: Record<number, DecodedSpherexFrame>;
}

export type CollectionShortCode = 'qr3' | 'dr1';

export interface UrlViewerState {
  ra: number;
  dec: number;
  size: number;
  band: number;
  col: CollectionShortCode;
  speed: number;
  min: number;
  max: number;
  i: number;
  flags: 0 | 1;
  cat: 0 | 1;
  sim: 0 | 1;
}

export interface BandContrast {
  min: number;
  max: number;
  softening: number;
}
