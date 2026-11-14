import { BandContrast, FlagBitsMap, TargetPreset } from '../types/spherex';

export const DEFAULT_TARGET_ID = 'barnard';

export const DEFAULT_FLAG_BITS: FlagBitsMap = {
  OVERFLOW: 0,
  SATURATED: 2,
  PERSIST: 5,
  DISCON: 7,
  NONFUNC: 10,
  SOURCE: 21,
};

export const SPHEREX_BANDS: Record<
  number,
  { band: number; detector: number; minUm: number; maxUm: number; channelLabel: string }
> = {
  1: { band: 1, detector: 1, minUm: 0.744, maxUm: 1.116, channelLabel: 'SWIR-1' },
  2: { band: 2, detector: 2, minUm: 1.099, maxUm: 1.651, channelLabel: 'SWIR-2' },
  3: { band: 3, detector: 3, minUm: 1.636, maxUm: 2.421, channelLabel: 'SWIR-3' },
  4: { band: 4, detector: 4, minUm: 2.423, maxUm: 3.822, channelLabel: 'MWIR-4' },
  5: { band: 5, detector: 5, minUm: 3.809, maxUm: 4.420, channelLabel: 'MWIR-5' },
  6: { band: 6, detector: 6, minUm: 4.412, maxUm: 5.002, channelLabel: 'MWIR-6' },
};

export const DEFAULT_BAND_CONTRAST: Record<number, BandContrast> = {
  0: { min: -2, max: 60, softening: 4 },
  1: { min: -2, max: 80, softening: 5 },
  2: { min: -2, max: 80, softening: 5 },
  3: { min: -2, max: 60, softening: 4 },
  4: { min: -3, max: 35, softening: 3 },
  5: { min: -5, max: 18, softening: 2.5 },
  6: { min: -5, max: 15, softening: 2.0 },
};

/**
 * Mandatory Challenge 12 benchmark targets with reference astrometry (Gaia DR3 / SIMBAD).
 * Keep all astrometric constants centralized here for rapid auditing updates.
 */
export const TARGET_PRESETS: TargetPreset[] = [
  {
    id: 'barnard',
    nameEs: 'Estrella de Barnard',
    nameEn: "Barnard's Star",
    source: 'Gaia DR3 4472832130942575872',
    ra: 269.44850252543836,
    dec: 4.739420051112412,
    epoch: 2016.0,
    pmra: -801.551,
    pmdec: 10362.394,
    defaultBand: 0,
    defaultSize: 200,
    changeType: 'proper_motion',
    notesEs:
      'Se mueve ~10.4"/año (1.69 px/año) hacia el norte. Probable saturación del núcleo (J ≈ 5.2): activar capa de banderas para distinguir saturación y persistencia.',
    notesEn:
      'Moves ~10.4"/yr (1.69 px/yr) northward. Probable core saturation (J ≈ 5.2): inspect quality flags to separate saturation and persistence artifacts.',
  },
  {
    id: 'wise0855',
    nameEs: 'WISE 0855',
    nameEn: 'WISE 0855',
    source: 'SIMBAD (Kirkpatrick 2021)',
    ra: 133.81890825,
    dec: -7.247048,
    epoch: 2000.0,
    pmra: -8123.7,
    pmdec: 673.2,
    defaultBand: 6,
    defaultSize: 300,
    changeType: 'proper_motion',
    referencePosition: {
      ra: 133.7951292,
      dec: -7.2451472,
      epoch: 2010.34,
      labelEs: 'Ref. enunciado (~2010.34)',
      labelEn: 'Prompt ref. (~2010.34)',
    },
    notesEs:
      'Enana marrón tipo Y, la más fría conocida. Se mueve ~8.15"/año (1.33 px/año) al oeste. Probablemente no se ve en una sola imagen de SPHEREx; solo, débil, en bandas 5 y 6 (usar suma por época). Sin entrada en Gaia. Coordenadas del enunciado (133.7951292, −7.2451472, época ~2010.34) mostradas solo como referencia sin centrar en ellas.',
    notesEn:
      'Coldest known Y-type brown dwarf. Moves ~8.15"/yr (1.33 px/yr) westward. Likely undetected in single SPHEREx frames; faint only in Bands 5 & 6 (use epoch co-addition). No Gaia entry. Prompt coordinates (133.7951292, −7.2451472, epoch ~2010.34) are overlaid solely as an uncentered reference.',
  },
  {
    id: 'epsindib',
    nameEs: 'Epsilon Indi B',
    nameEn: 'Epsilon Indi B',
    source: 'Gaia DR3',
    ra: 331.07645,
    dec: -56.79381,
    epoch: 2016.0,
    pmra: 3981.98,
    pmdec: -2466.83,
    defaultBand: 0,
    defaultSize: 200,
    changeType: 'unresolved_pair',
    notesEs:
      'Par de enanas marrones T1 + T6 separadas menos de 1.1": se ven como un único punto sin resolver a 6.15"/px. La estrella brillante ε Indi A está a 402", fuera de un campo de 300".',
    notesEn:
      'T1 + T6 brown dwarf binary separated by < 1.1": appears as a single unresolved point source at 6.15"/px. Bright host ε Indi A lies 402" away, outside a 300" cutout.',
  },
  {
    id: 'rwaur',
    nameEs: 'RW Aurigae',
    nameEn: 'RW Aurigae',
    source: 'Gaia DR3 156430822114424576 (A)',
    ra: 76.9560812,
    dec: 30.40120459,
    epoch: 2016.0,
    pmra: 2.641,
    pmdec: -27.398,
    defaultBand: 0,
    defaultSize: 200,
    changeType: 'variability',
    notesEs:
      'Estrella T Tauri binaria; A y B separadas 1.49" (0.24 px): una sola fuente en SPHEREx. Lo que cambia es el brillo (oscurecimientos irregulares). Cerca del plano galáctico (b ≈ −6°). Comparar solo cuadros con wave_um similar.',
    notesEn:
      'Binary T Tauri star; A & B separated by 1.49" (0.24 px), seen as one blended source. Exhibits irregular brightness dimmings near the galactic plane (b ≈ −6°). Compare frames at matching wave_um.',
  },
  {
    id: 'rdra',
    nameEs: 'R Draconis',
    nameEn: 'R Draconis',
    source: 'Gaia DR3 1648328016354496384',
    ra: 248.16737837,
    dec: 66.75500675,
    epoch: 2016.0,
    pmra: -20.643,
    pmdec: 6.149,
    defaultBand: 0,
    defaultSize: 200,
    changeType: 'variability',
    notesEs:
      'Variable Mira, período 246.12 días (AAVSO VSX). Cambia de brillo entre épocas. Muy brillante en el infrarrojo: saturará el detector, por lo que es clave inspeccionar banderas de saturación y persistencia.',
    notesEn:
      'Mira variable with 246.12-day period (AAVSO VSX). Exhibits strong IR brightness changes and detector saturation; inspect saturation and persistence flags carefully.',
  },
];

export function dateToJulianYear(date: Date): number {
  const msPerJulianYear = 365.25 * 86400 * 1000;
  return 2000.0 + (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / msPerJulianYear;
}

export function mjdToJulianYear(mjd: number): number {
  return 2000.0 + (mjd - 51544.5) / 365.25;
}

export function propagatePosition(
  target: Pick<TargetPreset, 'ra' | 'dec' | 'epoch' | 'pmra' | 'pmdec'>,
  targetJulianYear: number
): { ra: number; dec: number; dtYears: number } {
  const dt = targetJulianYear - target.epoch;
  const cosDec = Math.cos((target.dec * Math.PI) / 180);
  const safeCos = Math.abs(cosDec) < 1e-6 ? 1e-6 : cosDec;
  const dec = Math.max(-90, Math.min(90, target.dec + (target.pmdec * dt) / 3.6e6));
  const rawRa = target.ra + (target.pmra * dt) / (3.6e6 * safeCos);
  const ra = ((rawRa % 360) + 360) % 360;
  return { ra, dec, dtYears: dt };
}

export function getDefaultTarget(): TargetPreset {
  return TARGET_PRESETS.find((t) => t.id === DEFAULT_TARGET_ID) ?? TARGET_PRESETS[0];
}
