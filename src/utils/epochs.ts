import { DecodedSpherexFrame, EpochGroup, FlagBitsMap } from '../types/spherex';
import { classifyFlagName } from './flags';

function getFatalBitMask(flagBits: FlagBitsMap): number {
  let mask = 0;
  for (const [name, bit] of Object.entries(flagBits)) {
    const cat = classifyFlagName(name);
    if (cat === 'bad' && bit >= 0 && bit < 32) {
      mask |= 1 << bit;
    }
  }
  return mask;
}

/**
 * Co-adds frames of the same band within the same epoch to boost SNR
 * (essential for faint targets like WISE 0855 in Bands 5-6).
 */
export function coaddBandFrames(
  frames: DecodedSpherexFrame[],
  epochLabel: string,
  flagBits: FlagBitsMap
): DecodedSpherexFrame {
  if (frames.length === 1) {
    return {
      ...frames[0],
      isCoadd: false,
      coaddCount: 1,
      sourceFrameIds: [frames[0].id],
    };
  }

  const ref = frames[0];
  const [height, width] = ref.shape;
  const totalPixels = height * width;
  const sum = new Float64Array(totalPixels);
  const weightCount = new Uint16Array(totalPixels);
  const combinedFlags = new Uint32Array(totalPixels);
  const fatalMask = getFatalBitMask(flagBits);

  let mjdSum = 0;
  let waveCenterSum = 0;
  let waveMin = Infinity;
  let waveMax = -Infinity;

  for (const f of frames) {
    mjdSum += f.mjd;
    waveCenterSum += f.wave_um.center;
    if (f.wave_um.min < waveMin) waveMin = f.wave_um.min;
    if (f.wave_um.max > waveMax) waveMax = f.wave_um.max;

    const len = Math.min(totalPixels, f.pixels.length);
    for (let i = 0; i < len; i++) {
      const val = f.pixels[i];
      const flag = f.flagMask[i] ?? 0;
      combinedFlags[i] |= flag;
      const isFatal = (flag & fatalMask) !== 0;
      if (Number.isFinite(val) && !isFatal) {
        sum[i] += val;
        weightCount[i]++;
      }
    }
  }

  const outPixels = new Float32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    if (weightCount[i] > 0) {
      outPixels[i] = sum[i] / weightCount[i];
    } else {
      // Fallback to simple finite average if all exposures were flagged bad
      let fallbackSum = 0;
      let fallbackN = 0;
      for (const f of frames) {
        const val = f.pixels[i];
        if (Number.isFinite(val)) {
          fallbackSum += val;
          fallbackN++;
        }
      }
      outPixels[i] = fallbackN > 0 ? fallbackSum / fallbackN : NaN;
    }
  }

  const meanMjd = mjdSum / frames.length;
  // Pick frame closest to meanMjd for representative date/wcs/predicted_xy
  let midFrame = ref;
  let bestDist = Infinity;
  for (const f of frames) {
    const d = Math.abs(f.mjd - meanMjd);
    if (d < bestDist) {
      bestDist = d;
      midFrame = f;
    }
  }

  return {
    ...midFrame,
    id: `coadd_${epochLabel}_B${ref.band}`,
    mjd: Number(meanMjd.toFixed(5)),
    wave_um: {
      center: Number((waveCenterSum / frames.length).toFixed(4)),
      min: Number(waveMin.toFixed(4)),
      max: Number(waveMax.toFixed(4)),
    },
    pixels: outPixels,
    flagMask: combinedFlags,
    isCoadd: true,
    coaddCount: frames.length,
    sourceFrameIds: frames.map((f) => f.id),
  };
}

/**
 * Groups chronologically sorted frames into epochs:
 * Uses `frame.epoch` if supplied by backend; otherwise starts a new epoch
 * whenever consecutive MJDs differ by > 30 days.
 */
export function groupFramesIntoEpochs(
  frames: DecodedSpherexFrame[],
  flagBits: FlagBitsMap
): EpochGroup[] {
  if (frames.length === 0) return [];
  const sorted = [...frames].sort((a, b) => a.mjd - b.mjd);

  const buckets: { key: string; frames: DecodedSpherexFrame[] }[] = [];
  const hasExplicitEpoch = sorted.every((f) => f.epoch !== undefined && f.epoch !== null);

  if (hasExplicitEpoch) {
    const map = new Map<string, DecodedSpherexFrame[]>();
    for (const f of sorted) {
      const key = String(f.epoch);
      const list = map.get(key);
      if (list) list.push(f);
      else map.set(key, [f]);
    }
    for (const [key, groupFrames] of map.entries()) {
      buckets.push({ key, frames: groupFrames });
    }
    buckets.sort((a, b) => a.frames[0].mjd - b.frames[0].mjd);
  } else {
    let currentBucket: DecodedSpherexFrame[] = [sorted[0]];
    let epochIdx = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].mjd - sorted[i - 1].mjd > 30) {
        buckets.push({ key: `E${epochIdx}`, frames: currentBucket });
        epochIdx++;
        currentBucket = [sorted[i]];
      } else {
        currentBucket.push(sorted[i]);
      }
    }
    buckets.push({ key: `E${epochIdx}`, frames: currentBucket });
  }

  return buckets.map((bucket, idx) => {
    const fList = bucket.frames;
    const meanMjd = fList.reduce((acc, f) => acc + f.mjd, 0) / fList.length;
    const byBand = new Map<number, DecodedSpherexFrame[]>();
    for (const f of fList) {
      const arr = byBand.get(f.band);
      if (arr) arr.push(f);
      else byBand.set(f.band, [f]);
    }

    const coaddsByBand: Record<number, DecodedSpherexFrame> = {};
    for (const [band, bandFrames] of byBand.entries()) {
      coaddsByBand[band] = coaddBandFrames(bandFrames, bucket.key, flagBits);
    }

    const startDate = fList[0].date.slice(0, 10);
    const endDate = fList[fList.length - 1].date.slice(0, 10);

    return {
      key: bucket.key,
      index: idx,
      label: `Ep.${idx + 1} (${startDate.slice(0, 7)})`,
      meanMjd,
      startDate,
      endDate,
      frames: fList,
      coaddsByBand,
    };
  });
}

export function buildTimelineFrames(
  epochs: EpochGroup[],
  selectedBand: number,
  coaddMode: boolean
): DecodedSpherexFrame[] {
  const result: DecodedSpherexFrame[] = [];
  for (const ep of epochs) {
    if (coaddMode) {
      if (selectedBand === 0) {
        const bands = Object.keys(ep.coaddsByBand)
          .map(Number)
          .sort((a, b) => a - b);
        for (const b of bands) {
          result.push(ep.coaddsByBand[b]);
        }
      } else if (ep.coaddsByBand[selectedBand]) {
        result.push(ep.coaddsByBand[selectedBand]);
      }
    } else {
      for (const f of ep.frames) {
        if (selectedBand === 0 || f.band === selectedBand) {
          result.push(f);
        }
      }
    }
  }
  return result.sort((a, b) => a.mjd - b.mjd || a.band - b.band);
}

export function hasWavelengthSpread(frames: DecodedSpherexFrame[]): boolean {
  if (frames.length <= 1) return false;
  let minLambda = Infinity;
  let maxLambda = -Infinity;
  for (const f of frames) {
    if (f.wave_um.center < minLambda) minLambda = f.wave_um.center;
    if (f.wave_um.center > maxLambda) maxLambda = f.wave_um.center;
  }
  return maxLambda - minLambda > 0.05;
}

export function computeDeltaLambdaCheck(
  frameA: DecodedSpherexFrame | null,
  frameB: DecodedSpherexFrame | null
): { deltaUm: number; halfChannelWidthUm: number; exceedsHalfChannel: boolean } | null {
  if (!frameA || !frameB) return null;
  const deltaUm = Math.abs(frameB.wave_um.center - frameA.wave_um.center);
  const channelWidth = Math.max(0.01, frameB.wave_um.max - frameB.wave_um.min);
  const halfChannelWidthUm = channelWidth * 0.5;
  return {
    deltaUm,
    halfChannelWidthUm,
    exceedsHalfChannel: deltaUm > halfChannelWidthUm,
  };
}
