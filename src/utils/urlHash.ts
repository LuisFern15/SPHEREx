import {
  DEFAULT_BAND_CONTRAST,
  TARGET_PRESETS,
  dateToJulianYear,
  getDefaultTarget,
  propagatePosition,
} from '../data/targets';
import { CollectionName, CollectionShortCode, UrlViewerState } from '../types/spherex';

export function clampFieldSize(size: number): number {
  if (!Number.isFinite(size)) return 200;
  return Math.max(100, Math.min(300, Math.round(size)));
}

export function colToCollection(col: CollectionShortCode): CollectionName {
  if (col === 'dr1') return 'spherex_dr1';
  if (col === 'both') return 'spherex_both';
  return 'spherex_qr3';
}

export function collectionToCol(collection: string): CollectionShortCode {
  const normalized = collection.trim().toLowerCase();
  if (normalized === 'spherex_dr1' || normalized === 'dr1') return 'dr1';
  if (normalized === 'spherex_both' || normalized === 'both') return 'both';
  return 'qr3';
}

function angularSepArcsec(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const cosDec = Math.cos(((dec1 + dec2) * 0.5 * Math.PI) / 180);
  const dRa = (((ra1 - ra2 + 540) % 360) - 180) * cosDec;
  const dDec = dec1 - dec2;
  return Math.hypot(dRa, dDec) * 3600;
}

function inferDefaultColForCoords(ra: number, dec: number): CollectionShortCode {
  const nowYear = dateToJulianYear(new Date());
  for (const target of TARGET_PRESETS) {
    const prop = propagatePosition(target, nowYear);
    if (
      angularSepArcsec(ra, dec, prop.ra, prop.dec) < 120 ||
      angularSepArcsec(ra, dec, target.ra, target.dec) < 120
    ) {
      return collectionToCol(target.defaultCollection);
    }
  }
  return collectionToCol(getDefaultTarget().defaultCollection);
}

export function getInitialUrlState(): UrlViewerState {
  const defaultTarget = getDefaultTarget();
  const propagated = propagatePosition(defaultTarget, dateToJulianYear(new Date()));
  const defaultBand = defaultTarget.defaultBand;
  const defaultContrast = DEFAULT_BAND_CONTRAST[defaultBand] ?? DEFAULT_BAND_CONTRAST[0];

  const defaults: UrlViewerState = {
    ra: Number(propagated.ra.toFixed(6)),
    dec: Number(propagated.dec.toFixed(6)),
    size: defaultTarget.defaultSize,
    band: defaultBand,
    col: collectionToCol(defaultTarget.defaultCollection),
    speed: 400,
    min: defaultContrast.min,
    max: defaultContrast.max,
    i: 0,
    flags: 1,
    cat: 0,
    sim: 0,
  };

  if (typeof window === 'undefined') return defaults;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return defaults;

  const params = new URLSearchParams(hash);
  const parseNum = (key: string, fallback: number) => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  const ra = ((parseNum('ra', defaults.ra) % 360) + 360) % 360;
  const dec = Math.max(-90, Math.min(90, parseNum('dec', defaults.dec)));
  const bandVal = Math.max(0, Math.min(6, Math.round(parseNum('band', defaults.band))));
  const bandContrast = DEFAULT_BAND_CONTRAST[bandVal] ?? defaultContrast;

  const rawMin = parseNum('min', bandContrast.min);
  const rawMax = parseNum('max', bandContrast.max);
  const validContrast = rawMin < rawMax;
  const min = validContrast ? rawMin : bandContrast.min;
  const max = validContrast ? rawMax : bandContrast.max;

  const rawCol = (params.get('col') ?? params.get('collection'))?.trim().toLowerCase();
  const col: CollectionShortCode =
    rawCol === 'dr1' || rawCol === 'spherex_dr1'
      ? 'dr1'
      : rawCol === 'qr3' || rawCol === 'spherex_qr3'
      ? 'qr3'
      : rawCol === 'both' || rawCol === 'spherex_both'
      ? 'both'
      : inferDefaultColForCoords(ra, dec);

  return {
    ra,
    dec,
    size: clampFieldSize(parseNum('size', defaults.size)),
    band: bandVal,
    col,
    speed: Math.max(100, Math.min(2000, Math.round(parseNum('speed', defaults.speed)))),
    min,
    max,
    i: Math.max(0, Math.floor(parseNum('i', 0))),
    flags: params.get('flags') === '0' ? 0 : 1,
    cat: params.get('cat') === '1' ? 1 : 0,
    sim: params.get('sim') === '1' ? 1 : 0,
  };
}

export function serializeUrlHash(state: UrlViewerState): string {
  const parts = [
    `ra=${Number(state.ra.toFixed(6))}`,
    `dec=${Number(state.dec.toFixed(6))}`,
    `size=${clampFieldSize(state.size)}`,
    `band=${state.band}`,
    `col=${state.col}`,
    `speed=${state.speed}`,
    `min=${Number(state.min.toFixed(3))}`,
    `max=${Number(state.max.toFixed(3))}`,
    `i=${state.i}`,
    `flags=${state.flags}`,
    `cat=${state.cat}`,
  ];
  if (state.sim === 1) {
    parts.push('sim=1');
  }
  return `#${parts.join('&')}`;
}

export function syncUrlHash(state: UrlViewerState): void {
  if (typeof window === 'undefined') return;
  const nextHash = serializeUrlHash(state);
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', nextHash);
  }
}
