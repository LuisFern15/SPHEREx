import { FlagBitsMap } from '../types/spherex';

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
  if (upper.includes('SAT') || upper.includes('OVERFLOW') || upper.includes('NONLIN')) {
    return 'saturation';
  }
  if (upper.includes('PERSIST')) {
    return 'persistence';
  }
  if (
    upper.includes('NONFUNC') ||
    upper.includes('DEAD') ||
    upper.includes('HOT') ||
    upper.includes('BAD') ||
    upper.includes('DISCON') ||
    upper.includes('MISSING')
  ) {
    return 'bad';
  }
  if (upper === 'SOURCE' || upper.includes('SRC')) {
    return 'source';
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

export function isBitSet(maskValue: number, flagBits: FlagBitsMap, matcher: (cat: FlagCategory) => boolean): boolean {
  if (!maskValue) return false;
  for (const [name, bit] of Object.entries(flagBits)) {
    if (bit >= 0 && bit < 32 && ((maskValue >>> bit) & 1) === 1) {
      if (matcher(classifyFlagName(name))) return true;
    }
  }
  return false;
}
