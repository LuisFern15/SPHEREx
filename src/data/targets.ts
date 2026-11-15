import type { TranslationStrings } from '../i18n/translations';
import { BandContrast, RawSpherexFrame, TargetPreset } from '../types/spherex';

export const DEFAULT_TARGET_ID = 'barnard';

export const AVAILABLE_COLLECTIONS = ['spherex_dr1', 'spherex_qr3', 'spherex_both'] as const;

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
    collections: ['spherex_dr1', 'spherex_qr3', 'spherex_both'],
    defaultCollection: 'spherex_both',
    irsaCoverage: { dr1: 239, qr3: 121 },
    changeType: 'proper_motion',
    notesEs:
      'Estrella con el mayor movimiento propio conocido: ~10.4″/año (1.69 px/año) hacia el norte. Con "Ambas" (DR1 + QR3, de agosto de 2025 a septiembre de 2026) el desplazamiento acumulado es de ~1.9 px; medido con estos datos de SPHEREx: +10.6″/año. El núcleo aparece saturado: activa la capa de banderas para distinguir saturación y persistencia.',
    notesEn:
      'The star with the largest known proper motion: ~10.4″/yr (1.69 px/yr) northward. With "Both" (DR1 + QR3, August 2025 to September 2026) the accumulated shift is ~1.9 px; measured from these SPHEREx data: +10.6″/yr. The core is saturated: turn on the flag layer to tell saturation from persistence.',
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
      'Enana marrón tipo Y, la más fría conocida, sin entrada en Gaia; posición de Kirkpatrick et al. 2021 propagada a la fecha de cada cuadro (±0.5″ en 2026). Se mueve ~8.2″/año (1.33 px/año) hacia el oeste. Solo hay datos en DR1 (mayo de 2025 a mayo de 2026). Es muy débil: en estos datos la detección es marginal (z entre 0.5 y 3.4 según la banda; en B6, z ≈ 2.1), coherente con Rustamkulov et al. 2026 (arXiv:2607.00543), que la detecta con fiabilidad solo por encima de 3.9 µm. Las coordenadas del enunciado (133.7951292, −7.2451472) se muestran solo como referencia (~2010, época inferida).',
    notesEn:
      'Y-type brown dwarf, the coldest known, with no Gaia entry; position from Kirkpatrick et al. 2021 propagated to each frame\'s date (±0.5″ in 2026). Moves ~8.2″/yr (1.33 px/yr) westward. Data exist only in DR1 (May 2025 to May 2026). It is very faint: in these data the detection is marginal (z between 0.5 and 3.4 depending on band; in B6, z ≈ 2.1), consistent with Rustamkulov et al. 2026 (arXiv:2607.00543), who detect it reliably only above 3.9 µm. The challenge coordinates (133.7951292, −7.2451472) are shown only as a reference (~2010, inferred epoch).',
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
    collections: ['spherex_dr1', 'spherex_qr3', 'spherex_both'],
    defaultCollection: 'spherex_both',
    irsaCoverage: { dr1: 343, qr3: 120 },
    changeType: 'unresolved_pair',
    notesEs:
      'Par de enanas marrones T1 + T6 separadas menos de 1.1″: SPHEREx las ve como un solo punto (6.15″/px). Se mueve ~4.7″/año (0.76 px/año) hacia el sureste. Detección clara en las bandas 2 a 6 (z entre 34 y 104 en estos datos). En QR3 solo hay datos en las bandas 2, 3, 5 y 6. La estrella ε Indi A está a 402″, fuera del recorte de 200″. En SIMBAD se busca como "eps Ind B".',
    notesEn:
      'T1 + T6 brown-dwarf pair separated by less than 1.1″: SPHEREx sees them as a single point (6.15″/px). Moves ~4.7″/yr (0.76 px/yr) to the southeast. Clear detection in Bands 2 to 6 (z between 34 and 104 in these data). QR3 has data only in Bands 2, 3, 5 and 6. The star ε Indi A lies 402″ away, outside the 200″ cutout. Search SIMBAD for "eps Ind B".',
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
    collections: ['spherex_dr1', 'spherex_qr3', 'spherex_both'],
    defaultCollection: 'spherex_both',
    irsaCoverage: { dr1: 226, qr3: 110 },
    changeType: 'variability',
    notesEs:
      'Sistema joven A + B con disco, separado ~1.45″ (0.24 px): SPHEREx no lo resuelve, por eso se centra en el punto medio de las dos fuentes de Gaia DR3 (que invierten las etiquetas A y B respecto a la literatura; aquí A = noreste, la del chorro y los eclipses). Aquí el cambio es de brillo, no de posición. Una caída profunda del brillo de A comenzó en febrero de 2025; los reportes publicados llegan a octubre de 2025 y no sabemos si continúa. Cerca del plano galáctico (b ≈ −6°): compara cuadros con wave_um parecido.',
    notesEn:
      'Young A + B system with a disk, separated by ~1.45″ (0.24 px): SPHEREx does not resolve it, so the view is centered on the midpoint of the two Gaia DR3 sources (which swap the A and B labels relative to the literature; here A = northeast, the one with the jet and eclipses). The change here is in brightness, not position. A deep dimming of A began in February 2025; published reports reach October 2025 and we do not know whether it continues. Near the galactic plane (b ≈ −6°): compare frames with similar wave_um.',
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
    collections: ['spherex_dr1', 'spherex_qr3', 'spherex_both'],
    defaultCollection: 'spherex_both',
    irsaCoverage: { dr1: 417, qr3: 126 },
    changeType: 'variability',
    notesEs:
      'Variable Mira (M5e–M9IIIe) inmóvil a escala de píxel (0.0035 px/año): aquí el cambio es de brillo, no de posición. Período de 245.6 días (GCVS) o 246.12 días (AAVSO VSX); las fechas de máximo de ambas fuentes difieren ~73 días y no están comprobadas con una curva de luz. El núcleo satura en todas las bandas durante todo el período de los datos: compara el halo, no el pico.',
    notesEn:
      'Mira variable (M5e–M9IIIe), stationary at pixel scale (0.0035 px/yr): the change here is in brightness, not position. Period of 245.6 days (GCVS) or 246.12 days (AAVSO VSX); the predicted maxima from the two sources differ by ~73 days and are not checked against a light curve. The core saturates in every band throughout the data: compare the halo, not the peak.',
  },
];

export function collectionsForTarget(
  target: TargetPreset | null,
  activeCollection?: string
): string[] {
  const ordered: string[] = target
    ? AVAILABLE_COLLECTIONS.filter((col) => target.collections.includes(col))
    : [...AVAILABLE_COLLECTIONS];

  if (activeCollection && !ordered.includes(activeCollection)) {
    return [activeCollection, ...ordered];
  }
  return ordered;
}

export function formatIrsaCoverage(
  target: TargetPreset,
  collections: readonly string[],
  t: Pick<TranslationStrings, 'collectionBoth'>
): string {
  const parts: string[] = [];
  if (collections.includes('spherex_dr1') && target.collections.includes('spherex_dr1')) {
    parts.push(`DR1 ${target.irsaCoverage.dr1}`);
  }
  if (collections.includes('spherex_qr3') && target.collections.includes('spherex_qr3')) {
    parts.push(`QR3 ${target.irsaCoverage.qr3}`);
  }
  if (collections.includes('spherex_both') && target.collections.includes('spherex_both')) {
    parts.push(`${t.collectionBoth} ${target.irsaCoverage.dr1 + target.irsaCoverage.qr3}`);
  }
  return parts.join(' · ');
}

export function formatLoadedFramesByCollection(
  frames: readonly Pick<RawSpherexFrame, 'collection'>[]
): string | null {
  const counts = new Map<string, number>();
  for (const frame of frames) {
    const raw = frame.collection?.trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    const key =
      lower === 'spherex_dr1' || lower === 'dr1'
        ? 'spherex_dr1'
        : lower === 'spherex_qr3' || lower === 'qr3'
        ? 'spherex_qr3'
        : raw;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  const orderedKeys: string[] = [];
  for (const col of AVAILABLE_COLLECTIONS) {
    if (col !== 'spherex_both' && counts.has(col)) {
      orderedKeys.push(col);
    }
  }
  for (const key of counts.keys()) {
    if (!orderedKeys.includes(key)) {
      orderedKeys.push(key);
    }
  }

  return orderedKeys
    .map((key) => {
      const label = key === 'spherex_dr1' ? 'DR1' : key === 'spherex_qr3' ? 'QR3' : key;
      return `${label} ${counts.get(key)}`;
    })
    .join(' · ');
}

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
