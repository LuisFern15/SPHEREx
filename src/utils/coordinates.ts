import { SpherexWcs } from '../types/spherex';

export interface ParsedCoordinates {
  ra: number;
  dec: number;
  format: 'decimal' | 'sexagesimal';
}

function parseSexagesimalTriplet(
  part: string,
  isRa: boolean
): { value: number; valid: boolean } {
  const cleaned = part.trim();
  const signMatch = cleaned.match(/^([+-])/);
  const sign = signMatch && signMatch[1] === '-' ? -1 : 1;
  const body = cleaned.replace(/^[+-]/, '');

  // Match h/d m s, colon-separated, or space-separated triplets
  const hmsDms = body.match(
    /^(\d+(?:\.\d+)?)\s*[hd°:]\s*(\d+(?:\.\d+)?)?\s*[m'′:]?\s*(\d+(?:\.\d+)?)?\s*[s"″]?$/i
  );
  const spaced = body.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
  const m = spaced ?? hmsDms;

  if (!m) return { value: NaN, valid: false };

  const d1 = parseFloat(m[1]);
  const d2 = m[2] !== undefined ? parseFloat(m[2]) : 0;
  const d3 = m[3] !== undefined ? parseFloat(m[3]) : 0;

  if (!Number.isFinite(d1) || !Number.isFinite(d2) || !Number.isFinite(d3)) {
    return { value: NaN, valid: false };
  }
  if (d2 >= 60 || d3 >= 60 || d2 < 0 || d3 < 0) {
    return { value: NaN, valid: false };
  }

  const absVal = d1 + d2 / 60 + d3 / 3600;
  if (isRa) {
    if (sign < 0) return { value: NaN, valid: false };
    const deg = absVal * 15;
    return { value: deg, valid: deg >= 0 && deg < 360 };
  }
  const signedDec = sign * absVal;
  return { value: signedDec, valid: signedDec >= -90 && signedDec <= 90 };
}

/**
 * Parses coordinate strings in:
 * 1) Decimal degrees: "133.7951, -7.2451" or "133.7951 -7.2451"
 * 2) Tagged sexagesimal: "08h55m10.831s -07d14m42.53s"
 * 3) Space-separated sexagesimal: "08 55 10.831 -07 14 42.53"
 * 4) Colon-separated sexagesimal: "08:55:10.831 -07:14:42.53"
 */
export function parseCoordinates(input: string): ParsedCoordinates | null {
  const raw = input.trim().replace(/[°]/g, '');
  if (!raw) return null;

  // 1) Try decimal pair (comma or whitespace separated, two plain numbers)
  const decPairMatch = raw.match(
    /^([+-]?\d+(?:\.\d+)?)\s*[,\s]+\s*([+-]?\d+(?:\.\d+)?)$/
  );
  if (decPairMatch) {
    const ra = parseFloat(decPairMatch[1]);
    const dec = parseFloat(decPairMatch[2]);
    if (
      Number.isFinite(ra) &&
      Number.isFinite(dec) &&
      ra >= 0 &&
      ra <= 360 &&
      dec >= -90 &&
      dec <= 90
    ) {
      return { ra: ra === 360 ? 0 : ra, dec, format: 'decimal' };
    }
  }

  // 2) Comma-separated sexagesimal pair
  if (raw.includes(',')) {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 2) {
      const raRes = parseSexagesimalTriplet(parts[0], true);
      const decRes = parseSexagesimalTriplet(parts[1], false);
      if (raRes.valid && decRes.valid) {
        return { ra: raRes.value, dec: decRes.value, format: 'sexagesimal' };
      }
    }
  }

  // 3) Tagged sexagesimal pair (e.g., 08h55m10.831s -07d14m42.53s)
  const taggedPair = raw.match(
    /^(\d+\s*h\s*\d+\s*m\s*\d+(?:\.\d+)?\s*s?)\s+([+-]?\d+\s*[d°]\s*\d+\s*[m'′]\s*\d+(?:\.\d+)?\s*[s"″]?)$/i
  );
  if (taggedPair) {
    const raRes = parseSexagesimalTriplet(taggedPair[1], true);
    const decRes = parseSexagesimalTriplet(taggedPair[2], false);
    if (raRes.valid && decRes.valid) {
      return { ra: raRes.value, dec: decRes.value, format: 'sexagesimal' };
    }
  }

  // 4) Colon-separated pair: "08:55:10.831 -07:14:42.53"
  const colonPair = raw.match(
    /^(\d+:\d+:\d+(?:\.\d+)?)\s+([+-]?\d+:\d+:\d+(?:\.\d+)?)$/
  );
  if (colonPair) {
    const raRes = parseSexagesimalTriplet(colonPair[1], true);
    const decRes = parseSexagesimalTriplet(colonPair[2], false);
    if (raRes.valid && decRes.valid) {
      return { ra: raRes.value, dec: decRes.value, format: 'sexagesimal' };
    }
  }

  // 5) 6 space-separated tokens: "08 55 10.831 -07 14 42.53"
  const tokens = raw.split(/\s+/);
  if (tokens.length === 6) {
    const raRes = parseSexagesimalTriplet(tokens.slice(0, 3).join(' '), true);
    const decRes = parseSexagesimalTriplet(tokens.slice(3, 6).join(' '), false);
    if (raRes.valid && decRes.valid) {
      return { ra: raRes.value, dec: decRes.value, format: 'sexagesimal' };
    }
  }

  return null;
}

export function formatRaSexagesimal(raDeg: number): string {
  const norm = ((raDeg % 360) + 360) % 360;
  const totalHours = norm / 15;
  const h = Math.floor(totalHours);
  const remM = (totalHours - h) * 60;
  const m = Math.floor(remM);
  const s = (remM - m) * 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${s.toFixed(2).padStart(5, '0')}s`;
}

export function formatDecSexagesimal(decDeg: number): string {
  const sign = decDeg < 0 ? '-' : '+';
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  const remM = (abs - d) * 60;
  const m = Math.floor(remM);
  const s = (remM - m) * 60;
  return `${sign}${String(d).padStart(2, '0')}d${String(m).padStart(2, '0')}m${s.toFixed(2).padStart(5, '0')}s`;
}

/**
 * Approximate linear WCS pixel -> sky (J2000/ICRS deg).
 * Uses FITS 1-based crpix convention: pixel index (0..N-1) maps to (x + 1 - crpix[0]).
 */
export function pixelToSkyLinear(
  x: number,
  y: number,
  wcs: SpherexWcs
): { ra: number; dec: number } {
  const dx = x + 1 - wcs.crpix[0];
  const dy = y + 1 - wcs.crpix[1];
  const dXi = wcs.cd[0][0] * dx + wcs.cd[0][1] * dy;
  const dEta = wcs.cd[1][0] * dx + wcs.cd[1][1] * dy;
  const cosDec = Math.cos((wcs.crval[1] * Math.PI) / 180);
  const safeCos = Math.abs(cosDec) < 1e-6 ? 1e-6 : cosDec;
  const ra = ((wcs.crval[0] + dXi / safeCos) % 360 + 360) % 360;
  const dec = Math.max(-90, Math.min(90, wcs.crval[1] + dEta));
  return { ra, dec };
}

/**
 * Approximate linear WCS sky -> 0-based pixel coordinates (x, y).
 */
export function skyToPixelLinear(
  ra: number,
  dec: number,
  wcs: SpherexWcs
): [number, number] | null {
  const [[cd00, cd01], [cd10, cd11]] = wcs.cd;
  const det = cd00 * cd11 - cd01 * cd10;
  if (Math.abs(det) < 1e-18) return null;

  const cosDec = Math.cos((wcs.crval[1] * Math.PI) / 180);
  const safeCos = Math.abs(cosDec) < 1e-6 ? 1e-6 : cosDec;
  // Wrap-safe delta RA
  const deltaRa = (((ra - wcs.crval[0] + 540) % 360) - 180) * safeCos;
  const deltaDec = dec - wcs.crval[1];

  const dx = (cd11 * deltaRa - cd01 * deltaDec) / det;
  const dy = (-cd10 * deltaRa + cd00 * deltaDec) / det;

  return [dx + wcs.crpix[0] - 1, dy + wcs.crpix[1] - 1];
}

export interface PredictedPixelResolution {
  px: [number, number] | null;
  outOfBounds: boolean;
}

/**
 * Resolves predicted_xy at the observation epoch of the individual frame (`frame.mjd`),
 * NEVER today's date. Uses backend `predicted_xy` if present, otherwise propagates
 * target coordinates to `mjdToJulianYear(frame.mjd)` and projects through frame WCS.
 */
export function resolvePredictedPixel(
  frame: { mjd: number; shape: [number, number]; wcs: SpherexWcs; predicted_xy?: [number, number] } | null,
  target: { ra: number; dec: number; epoch: number; pmra: number; pmdec: number } | null,
  mjdToYearFn: (mjd: number) => number,
  propagateFn: (
    pos: { ra: number; dec: number; epoch: number; pmra: number; pmdec: number },
    year: number
  ) => { ra: number; dec: number }
): PredictedPixelResolution {
  if (!frame) return { px: null, outOfBounds: false };
  const [imgH, imgW] = frame.shape;
  let px: [number, number] | null = frame.predicted_xy ?? null;

  if (!px && target) {
    const frameYear = mjdToYearFn(frame.mjd);
    const prop = propagateFn(target, frameYear);
    px = skyToPixelLinear(prop.ra, prop.dec, frame.wcs);
  }

  if (!px) return { px: null, outOfBounds: false };
  const outOfBounds = px[0] < 0 || px[0] >= imgW || px[1] < 0 || px[1] >= imgH;
  return { px, outOfBounds };
}

