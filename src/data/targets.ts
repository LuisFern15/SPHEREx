import { BandContrast, TargetPreset } from '../types/spherex';

export const DEFAULT_TARGET_ID = 'barnard';

export const AVAILABLE_COLLECTIONS = ['spherex_qr3', 'spherex_dr1'] as const;

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
 * Mandatory Challenge 12 benchmark targets with reference astrometry.
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
    collections: ['spherex_qr3', 'spherex_dr1'],
    defaultCollection: 'spherex_qr3',
    irsaCoverage: { dr1: 239, qr3: 119 },
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
    source: 'Kirkpatrick et al. 2021 (arXiv:2011.11616), MJD 57633.39',
    ra: 133.780984,
    dec: -7.243932,
    epoch: 2016.67,
    pmra: -8123.7,
    pmdec: 673.2,
    defaultBand: 6,
    defaultSize: 300,
    collections: ['spherex_dr1'],
    defaultCollection: 'spherex_dr1',
    irsaCoverage: { dr1: 258, qr3: 0 },
    changeType: 'proper_motion',
    referencePosition: {
      ra: 133.7951292,
      dec: -7.2451472,
      epoch: 2010.34,
      labelEs: 'Ref. enunciado (~2010, época inferida)',
      labelEn: 'Prompt ref. (~2010, inferred epoch)',
    },
    notesEs:
      'Enana marrón tipo Y sin entrada en Gaia. La predicción de su posición para 2026 tiene una incertidumbre de ±0.5″. Una publicación de 2026 (Rustamkulov et al., arXiv:2607.00543, pendiente de verificación por nuestro equipo) la reporta con SPHEREx siendo fiable únicamente por encima de 3.9 µm (bandas 5 y 6). Solo tiene datos en DR1 (258 exposiciones) y ninguno en QR3 (0). Coordenadas del enunciado (133.7951292, −7.2451472) mostradas solo como referencia (~2010, época inferida).',
    notesEn:
      'Y-type brown dwarf with no Gaia entry. Predicted 2026 position has ±0.5″ uncertainty. A 2026 paper (Rustamkulov et al., arXiv:2607.00543, pending verification by our team) reports SPHEREx detection as reliable only above 3.9 µm (Bands 5 and 6). Available only in DR1 (258 exposures) with 0 in QR3. Prompt coordinates (133.7951292, −7.2451472) shown solely as an uncentered reference (~2010, inferred epoch).',
  },
  {
    id: 'epsindib',
    nameEs: 'Epsilon Indi B',
    nameEn: 'Epsilon Indi B',
    source: 'Gaia DR3 6412596012146801152 (par Ba+Bb)',
    ra: 331.0764526,
    dec: -56.79381207,
    epoch: 2016.0,
    pmra: 3981.977,
    pmdec: -2466.832,
    defaultBand: 0,
    defaultSize: 200,
    collections: ['spherex_qr3', 'spherex_dr1'],
    defaultCollection: 'spherex_qr3',
    irsaCoverage: { dr1: 343, qr3: 120 },
    changeType: 'unresolved_pair',
    notesEs:
      'Par de enanas marrones T1 + T6 separadas menos de 1.1": se ven como un único punto sin resolver a 6.15"/px. La estrella brillante ε Indi A está a 402", fuera de un campo de 300". En QR3 solo existen datos en las bandas 2, 3, 5 y 6. En SIMBAD debe buscarse como "eps Ind B" con B mayúscula (ya que "eps Ind" devuelve la primaria A).',
    notesEn:
      'T1 + T6 brown dwarf binary separated by < 1.1": appears as a single unresolved point source at 6.15"/px. Bright host ε Indi A lies 402" away, outside a 300" cutout. QR3 contains data only in Bands 2, 3, 5, and 6. Search SIMBAD as "eps Ind B" with uppercase B ("eps Ind" returns primary star A).',
  },
  {
    id: 'rwaur',
    nameEs: 'RW Aurigae',
    nameEn: 'RW Aurigae',
    source: 'Punto medio de Gaia DR3 156430817820015232 y 156430822114424576',
    ra: 76.95631275,
    dec: 30.40126037,
    epoch: 2016.0,
    pmra: 3.77,
    pmdec: -25.99,
    defaultBand: 0,
    defaultSize: 200,
    collections: ['spherex_qr3', 'spherex_dr1'],
    defaultCollection: 'spherex_qr3',
    irsaCoverage: { dr1: 226, qr3: 110 },
    changeType: 'variability',
    notesEs:
      'Se usa el punto medio de ambas fuentes Gaia DR3 porque SPHEREx no resuelve el par (0.24 px) y en SIMBAD/Gaia las etiquetas A y B están invertidas respecto a la literatura; aquí seguimos la convención de la literatura (A = noreste, con el jet y los eclipses). Un eclipse profundo de A comenzó en febrero de 2025 y no sabemos si continúa en 2026. Cerca del plano galáctico (b ≈ −6°). Comparar cuadros con wave_um similar.',
    notesEn:
      'Centered on the Gaia DR3 midpoint because SPHEREx does not resolve the pair (0.24 px) and SIMBAD/Gaia invert the A/B labels relative to literature; here A = northeast (with jet and eclipses) per literature convention. A deep eclipse of A began in Feb 2025 and may still be ongoing in 2026. Near the galactic plane (b ≈ −6°). Compare frames at matching wave_um.',
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
    collections: ['spherex_qr3', 'spherex_dr1'],
    defaultCollection: 'spherex_qr3',
    irsaCoverage: { dr1: 414, qr3: 126 },
    changeType: 'variability',
    notesEs:
      'Inmóvil a escala de píxel (0.0035 px/año). Su período es 246.12 días según AAVSO VSX y 245.6 días según GCVS, y sus fechas de máximo difieren unos 73 días sin comprobar con una curva de luz. El núcleo saturará en todas las bandas.',
    notesEn:
      'Stationary at pixel scale (0.0035 px/yr). Period is 246.12 days per AAVSO VSX and 245.6 days per GCVS, with predicted maxima differing by ~73 days (unverified against a light curve). Core will saturate across all bands.',
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
