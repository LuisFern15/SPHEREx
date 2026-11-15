import { TARGET_PRESETS } from '../data/targets';
import {
  CatalogSource,
  DecodedSpherexFrame,
  FlagBitsMap,
  FramesQueryResult,
  PhotometryResponse,
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
  live?: boolean;
  maxFrames?: number;
  pmra?: number;
  pmdec?: number;
  epoch?: string;
  signal?: AbortSignal;
}): Promise<FramesQueryResult> {
  const {
    ra,
    dec,
    size,
    simMode,
    collection = 'spherex_qr3',
    live = true,
    maxFrames,
    pmra,
    pmdec,
    epoch,
    signal,
  } = params;

  if (simMode) {
    return generateSimulatedCutouts(ra, dec, size, collection);
  }

  const searchParams = new URLSearchParams({
    ra: ra.toFixed(6),
    dec: dec.toFixed(6),
    size: String(size),
    collection,
    live: live ? 'true' : 'false',
  });
  if (typeof maxFrames === 'number' && maxFrames > 0) {
    searchParams.set('max_frames', String(Math.round(maxFrames)));
  }
  if (typeof pmra === 'number' && Number.isFinite(pmra) && pmra !== 0) {
    searchParams.set('pmra', String(pmra));
  }
  if (typeof pmdec === 'number' && Number.isFinite(pmdec) && pmdec !== 0) {
    searchParams.set('pmdec', String(pmdec));
  }
  if (epoch) {
    searchParams.set('epoch', epoch);
  }

  const url = `${API_BASE}/api/frames?${searchParams.toString()}`;

  const timeoutMs = live ? 60000 : 15000;
  let timedOut = false;
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  const onExternalAbort = () => timeoutController.abort();
  if (signal) {
    signal.addEventListener('abort', onExternalAbort, { once: true });
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
    let message = 'Unknown backend connection error.';
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        message = timedOut
          ? `Timeout (${Math.round(timeoutMs / 1000)}s) querying SPHEREx / IRSA backend.`
          : 'Request cancelled.';
      } else if (err instanceof TypeError) {
        message = API_BASE
          ? `No se pudo conectar con el backend en ${API_BASE}. Verifica que uvicorn esté corriendo.`
          : 'No se pudo conectar con el backend (/api/frames). Configura VITE_API_URL en .env.local.';
      } else {
        message = err.message;
      }
    }

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
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function fetchStaticPhotometryFile(
  target: string,
  collection: string,
  signal?: AbortSignal
): Promise<PhotometryResponse> {
  const res = await fetch(
    `/fotometria/${encodeURIComponent(target)}_${encodeURIComponent(collection)}.json`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(`Sin fotometría estática para ${target} (${collection})`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(`Archivo estático no encontrado para ${target} (${collection})`);
  }
  const data: PhotometryResponse = await res.json();
  return { ...data, provenance: 'static' };
}

export async function fetchPhotometry(params: {
  target: string;
  collection?: string;
  signal?: AbortSignal;
}): Promise<PhotometryResponse> {
  const { target, collection = 'spherex_dr1', signal } = params;
  const url = `${API_BASE}/api/photometry?target=${encodeURIComponent(
    target
  )}&collection=${encodeURIComponent(collection)}`;

  try {
    const res = await fetch(url, { signal });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || contentType.includes('text/html')) {
      let detail = `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 404) {
        try {
          const errBody = await res.json();
          if (errBody?.detail) detail = String(errBody.detail);
        } catch {
          // ignore
        }
      }
      throw new Error(detail);
    }
    const data: PhotometryResponse = await res.json();
    return { ...data, provenance: 'cached' };
  } catch (apiErr) {
    if (signal?.aborted) throw apiErr;

    if (collection === 'spherex_both' || collection === 'both') {
      const [dr1Res, qr3Res] = await Promise.allSettled([
        fetchStaticPhotometryFile(target, 'spherex_dr1', signal),
        fetchStaticPhotometryFile(target, 'spherex_qr3', signal),
      ]);
      const disponibles = [dr1Res, qr3Res]
        .filter((r): r is PromiseFulfilledResult<PhotometryResponse> => r.status === 'fulfilled')
        .map((r) => r.value);

      if (disponibles.length === 0) {
        throw apiErr instanceof Error ? apiErr : new Error('Sin datos de fotometría disponibles.');
      }
      if (disponibles.length === 1) {
        return { ...disponibles[0], collection: 'spherex_both' };
      }
      const measurements = disponibles
        .flatMap((d) => d.measurements)
        .sort((a, b) => (a.mjd ?? 0) - (b.mjd ?? 0));
      return {
        ...disponibles[0],
        collection: 'spherex_both',
        measurements,
        notes: [
          'Combinación estática de fotometría (DR1 + QR3) ordenada por MJD.',
          ...disponibles[0].notes,
        ],
        provenance: 'static',
      };
    }

    return fetchStaticPhotometryFile(target, collection, signal);
  }
}