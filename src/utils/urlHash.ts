import {
  DEFAULT_BAND_CONTRAST,
  dateToJulianYear,
  getDefaultTarget,
  propagatePosition,
} from '../data/targets';
import { UrlViewerState } from '../types/spherex';

export function clampFieldSize(size: number): number {
  if (!Number.isFinite(size)) return 200;
  return Math.max(100, Math.min(300, Math.round(size)));
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

  const bandVal = Math.max(0, Math.min(6, Math.round(parseNum('band', defaults.band))));
  const bandContrast = DEFAULT_BAND_CONTRAST[bandVal] ?? defaultContrast;

  return {
    ra: ((parseNum('ra', defaults.ra) % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, parseNum('dec', defaults.dec))),
    size: clampFieldSize(parseNum('size', defaults.size)),
    band: bandVal,
    speed: Math.max(100, Math.min(2000, Math.round(parseNum('speed', defaults.speed)))),
    min: parseNum('min', bandContrast.min),
    max: parseNum('max', bandContrast.max),
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
