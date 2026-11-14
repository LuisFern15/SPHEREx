import { ColormapName } from '../types/spherex';

type RgbStop = [number, number, number];

const INFERNO_STOPS: RgbStop[] = [
  [0, 0, 4],
  [27, 12, 65],
  [74, 12, 107],
  [120, 28, 109],
  [165, 44, 96],
  [207, 68, 70],
  [237, 105, 37],
  [251, 155, 6],
  [247, 209, 61],
  [252, 255, 164],
];

const VIRIDIS_STOPS: RgbStop[] = [
  [68, 1, 84],
  [72, 36, 117],
  [65, 68, 135],
  [53, 95, 141],
  [42, 120, 142],
  [33, 145, 140],
  [34, 168, 132],
  [68, 191, 112],
  [122, 209, 81],
  [189, 223, 38],
  [253, 231, 37],
];

const CIVIDIS_STOPS: RgbStop[] = [
  [0, 32, 76],
  [0, 50, 110],
  [44, 67, 108],
  [78, 86, 107],
  [107, 106, 110],
  [136, 127, 113],
  [167, 150, 112],
  [198, 175, 105],
  [230, 202, 87],
  [255, 234, 70],
];

function buildLutFromStops(stops: RgbStop[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  const segments = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * segments;
    const idx = Math.min(segments - 1, Math.floor(t));
    const frac = t - idx;
    const c0 = stops[idx];
    const c1 = stops[idx + 1];
    lut[i * 3] = Math.round(c0[0] + (c1[0] - c0[0]) * frac);
    lut[i * 3 + 1] = Math.round(c0[1] + (c1[1] - c0[1]) * frac);
    lut[i * 3 + 2] = Math.round(c0[2] + (c1[2] - c0[2]) * frac);
  }
  return lut;
}

function buildGrayscaleLut(inverted: boolean): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = inverted ? 255 - i : i;
    lut[i * 3] = v;
    lut[i * 3 + 1] = v;
    lut[i * 3 + 2] = v;
  }
  return lut;
}

const LUT_CACHE: Record<ColormapName, Uint8ClampedArray> = {
  grayscale: buildGrayscaleLut(false),
  grayscale_inv: buildGrayscaleLut(true),
  inferno: buildLutFromStops(INFERNO_STOPS),
  viridis: buildLutFromStops(VIRIDIS_STOPS),
  cividis: buildLutFromStops(CIVIDIS_STOPS),
};

export function getColormapLut(name: ColormapName): Uint8ClampedArray {
  return LUT_CACHE[name] ?? LUT_CACHE.grayscale;
}

export function getColormapPreviewGradient(name: ColormapName): string {
  const lut = getColormapLut(name);
  const steps = [0, 64, 128, 192, 255].map((i) => {
    const r = lut[i * 3];
    const g = lut[i * 3 + 1];
    const b = lut[i * 3 + 2];
    return `rgb(${r},${g},${b})`;
  });
  return `linear-gradient(90deg, ${steps.join(', ')})`;
}
