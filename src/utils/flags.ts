import { FlagBitsMap } from '../types/spherex';

/**
 * SPHEREx Explanatory Supplement v1.0, Table 9 symbolic bitmask names.
 * Only used as fallback when an API response omits `flag_bits`.
 */
export const DEFAULT_FLAG_BITS: FlagBitsMap = {
  TRANSIENT: 0,
  OVERFLOW: 1,
  SUR_ERROR: 2,
  NONFUNC: 6,
  DICHROIC: 7,
  MISSING_DATA: 9,
  HOT: 10,
  COLD: 11,
  FULLSAMPLE: 12,
  PHANMISS: 14,
  NONLINEAR: 15,
  PERSIST: 17,
  OUTLIER: 19,
  CROSSTALK: 20,
  SOURCE: 21,
  GHOST: 22,
  GHOST_FPA: 23,
  GHOST_EXT: 24,
  STREAK: 25,
  BLOOM: 26,
  SNOWBALL: 27,
  HALO: 28,
  SATELLITE_HALO: 29,
};

export type FlagCategory = 'saturation' | 'persistence' | 'bad' | 'source' | 'other';

export interface DecodedFlagEntry {
  name: string;
  bit: number;
  category: FlagCategory;
}

export interface FrameFlagSummary {
  name: string;
  bit: number;
  category: FlagCategory;
  pixelCount: number;
}

export function classifyFlagName(name: string): FlagCategory {
  const upper = name.toUpperCase();
  if (upper === 'OVERFLOW' || upper === 'NONLINEAR') {
    return 'saturation';
  }
  if (upper === 'PERSIST') {
    return 'persistence';
  }
  if (
    upper === 'NONFUNC' ||
    upper === 'DICHROIC' ||
    upper === 'COLD' ||
    upper === 'HOT' ||
    upper === 'PHANMISS' ||
    upper === 'MISSING_DATA'
  ) {
    return 'bad';
  }
  if (upper === 'SOURCE') {
    return 'source';
  }
  if (
    upper === 'TRANSIENT' ||
    upper === 'SUR_ERROR' ||
    upper === 'FULLSAMPLE' ||
    upper === 'OUTLIER' ||
    upper === 'CROSSTALK' ||
    upper === 'GHOST' ||
    upper === 'GHOST_FPA' ||
    upper === 'GHOST_EXT' ||
    upper === 'STREAK' ||
    upper === 'BLOOM' ||
    upper === 'SNOWBALL' ||
    upper === 'HALO' ||
    upper === 'SATELLITE_HALO'
  ) {
    return 'other';
  }
  return 'other';
}

export function decodePixelFlags(maskValue: number, flagBits: FlagBitsMap): DecodedFlagEntry[] {
  if (!maskValue) return [];
  const active: DecodedFlagEntry[] = [];
  for (const [name, bit] of Object.entries(flagBits)) {
    if (bit >= 0 && bit < 32 && ((maskValue >>> bit) & 1) === 1) {
      active.push({
        name,
        bit,
        category: classifyFlagName(name),
      });
    }
  }
  return active;
}

export function summarizeFrameFlags(
  flagMask: Uint32Array,
  flagBits: FlagBitsMap
): FrameFlagSummary[] {
  const entries = Object.entries(flagBits).filter(([, bit]) => bit >= 0 && bit < 32);
  const counts = new Int32Array(entries.length);

  for (let p = 0; p < flagMask.length; p++) {
    const val = flagMask[p];
    if (val === 0) continue;
    for (let e = 0; e < entries.length; e++) {
      const bit = entries[e][1];
      if (((val >>> bit) & 1) === 1) {
        counts[e]++;
      }
    }
  }

  const summaries: FrameFlagSummary[] = [];
  for (let e = 0; e < entries.length; e++) {
    if (counts[e] > 0) {
      const [name, bit] = entries[e];
      summaries.push({
        name,
        bit,
        category: classifyFlagName(name),
        pixelCount: counts[e],
      });
    }
  }

  const order: Record<FlagCategory, number> = {
    saturation: 0,
    persistence: 1,
    bad: 2,
    source: 3,
    other: 4,
  };
  summaries.sort((a, b) => order[a.category] - order[b.category] || b.pixelCount - a.pixelCount);
  return summaries;
}

export function isBitSet(
  maskValue: number,
  flagBits: FlagBitsMap,
  matcher: (cat: FlagCategory) => boolean
): boolean {
  if (!maskValue) return false;
  for (const [name, bit] of Object.entries(flagBits)) {
    if (bit >= 0 && bit < 32 && ((maskValue >>> bit) & 1) === 1) {
      if (matcher(classifyFlagName(name))) return true;
    }
  }
  return false;
}
