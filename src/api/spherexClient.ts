import { TARGET_PRESETS } from '../data/targets';
import {
  CatalogSource,
  DecodedSpherexFrame,
  FlagBitsMap,
  FramesQueryResult,
  RawSpherexFrame,
} from '../types/spherex';
import { decodeBase64Float32LE, decodeBase64Uint32LE } from '../utils/binaryDecode';
import { DEFAULT_FLAG_BITS } from '../utils/flags';
import { generateSimulatedCutouts } from './devSimulator';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

interface RawFramesResponse {
  query?: {
    ra: number;
    dec: number;
    size_arcsec: number;
    collection: string;
  };
  pixel_scale_arcsec?: number;
  cached?: boolean;
  provenance?: 'live' | 'cached';
  flag_bits?: FlagBitsMap;
  catalog_sources?: CatalogSource[];
  frames?: RawSpherexFrame[];
  notes?: string[];
}

export async function fetchHealth(signal?: AbortSignal): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/health`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTargets(signal?: AbortSignal) {
  try {
    const res = await fetch(`${API_BASE}/api/targets`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return TARGET_PRESETS;
  }
}

export async function fetchFrames(params: {
  ra: number;
  dec: number;
  size: number;
  simMode: boolean;
  collection?: string;
  signal?: AbortSignal;
}): Promise<FramesQueryResult> {
  const { ra, dec, size, simMode, collection = 'spherex_qr3', signal } = params;

  if (simMode) {
    return generateSimulatedCutouts(ra, dec, size, collection);
  }

  const url = `${API_BASE}/api/frames?ra=${encodeURIComponent(ra.toFixed(6))}&dec=${encodeURIComponent(
    dec.toFixed(6)
  )}&size=${encodeURIComponent(size)}&collection=${encodeURIComponent(collection)}`;

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 15000);
  if (signal) {
    signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  try {
    const res = await fetch(url, { signal: timeoutController.signal });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        if (errBody?.detail) detail = `${detail}: ${String(errBody.detail)}`;
      } catch {
        // ignore non-json error body
      }
      throw new Error(detail);
    }

    const raw: RawFramesResponse = await res.json();
    if (!raw || !Array.isArray(raw.frames)) {
      throw new Error('Malformed API payload: missing frames array.');
    }

    const hasHeaderFlagBits = Boolean(raw.flag_bits && Object.keys(raw.flag_bits).length > 0);
    const flagBits: FlagBitsMap = hasHeaderFlagBits
      ? raw.flag_bits!
      : { ...DEFAULT_FLAG_BITS };

    const decodedFrames: DecodedSpherexFrame[] = raw.frames.map((frame) => {
      const [h, w] = frame.shape;
      const expected = h * w;
      return {
        ...frame,
        query_xy: frame.query_xy ?? frame.target_xy,
        pixels: decodeBase64Float32LE(frame.data, expected),
        flagMask: decodeBase64Uint32LE(frame.flags, expected),
      };
    });

    const isCached = raw.provenance === 'cached' || Boolean(raw.cached);

    return {
      query: raw.query ?? {
        ra,
        dec,
        size_arcsec: size,
        collection,
      },
      pixel_scale_arcsec: raw.pixel_scale_arcsec ?? 6.15,
      provenance: isCached ? 'cached' : 'live',
      cached: isCached,
      flag_bits: flagBits,
      usingDefaultFlagBits: !hasHeaderFlagBits,
      catalog_sources: raw.catalog_sources ?? [],
      frames: decodedFrames,
      notes: raw.notes ?? [],
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Timeout (15s) querying SPHEREx / IRSA backend.'
          : err.message
        : 'Unknown backend connection error.';

    return {
      query: { ra, dec, size_arcsec: size, collection },
      pixel_scale_arcsec: 6.15,
      provenance: 'error',
      cached: false,
      flag_bits: { ...DEFAULT_FLAG_BITS },
      usingDefaultFlagBits: true,
      catalog_sources: [],
      frames: [],
      notes: [],
      errorMessage: message,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
