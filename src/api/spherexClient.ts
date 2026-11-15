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
const DEFAULT_SNAPSHOT_MATCH_ARCSEC = 120;

const BACKEND_UNAVAILABLE_MSG =
  'Servidor de datos no disponible: la ruta /api no respondió con datos. Configura VITE_API_URL o inicia el backend. / Data server unavailable: /api did not return data. Set VITE_API_URL or start the backend.';
const STATIC_MODE_NOTE =
  'Modo estático: datos reales de IRSA incluidos en el sitio, sin servidor; no se actualizan solos. / Static mode: real IRSA data bundled with the site, no server; not updated automatically.';
const NO_STATIC_DATA_MSG =
  'Sin datos guardados para esta posición y no hay servidor de datos. / No stored data for this position and no data server.';
const REQUEST_CANCELLED_MSG = 'Consulta cancelada. / Request cancelled.';

function isJsonResponse(res: Response): boolean {
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.toLowerCase().includes('application/json');
}

function getStaticBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
  );
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

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
  target?: unknown;
  generated_at?: string;
  catalog_sources?: CatalogSource[];
  frames?: RawSpherexFrame[];
  notes?: string[];
}

interface SnapshotIndexEntry {
  file: string;
  target?: string;
  collection: string;
  ra: number;
  dec: number;
  size_arcsec?: number;
  generated_at?: string;
}

interface SnapshotIndex {
  version?: number;
  match_arcsec?: number;
  snapshots: SnapshotIndexEntry[];
}

let staticIndexPromise: Promise<SnapshotIndex> | null = null;
const staticSnapshotCache = new Map<string, Promise<RawFramesResponse>>();

function makeErrorResult(
  ra: number,
  dec: number,
  size: number,
  collection: string,
  extra: { errorMessage?: string; emptyMessage?: string }
): FramesQueryResult {
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
    ...extra,
  };
}

function validateRawFramesPayload(raw: unknown): RawFramesResponse {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as RawFramesResponse).frames)) {
    throw new Error('Malformed API payload: missing frames array.');
  }
  return raw as RawFramesResponse;
}

function decodeRawFrames(rawFrames: RawSpherexFrame[]): DecodedSpherexFrame[] {
  return rawFrames.map((frame) => {
    const [h, w] = frame.shape;
    const expected = h * w;
    return {
      ...frame,
      query_xy: frame.query_xy ?? frame.target_xy,
      pixels: decodeBase64Float32LE(frame.data, expected),
      flagMask: decodeBase64Uint32LE(frame.flags, expected),
    };
  });
}

function buildApiFramesResult(
  raw: RawFramesResponse,
  ra: number,
  dec: number,
  size: number,
  collection: string
): FramesQueryResult {
  const hasHeaderFlagBits = Boolean(raw.flag_bits && Object.keys(raw.flag_bits).length > 0);
  const flagBits: FlagBitsMap = hasHeaderFlagBits ? raw.flag_bits! : { ...DEFAULT_FLAG_BITS };
  const decodedFrames = decodeRawFrames(raw.frames!);
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
    ...(raw.target !== undefined ? { target: raw.target } : {}),
    catalog_sources: raw.catalog_sources ?? [],
    frames: decodedFrames,
    notes: raw.notes ?? [],
  };
}

function haversineArcsec(ra1Deg: number, dec1Deg: number, ra2Deg: number, dec2Deg: number): number {
  const degToRad = Math.PI / 180;
  const ra1 = ra1Deg * degToRad;
  const dec1 = dec1Deg * degToRad;
  const ra2 = ra2Deg * degToRad;
  const dec2 = dec2Deg * degToRad;
  const dDec = dec2 - dec1;
  const dRa = ra2 - ra1;
  const sinHalfDec = Math.sin(dDec / 2);
  const sinHalfRa = Math.sin(dRa / 2);
  const a =
    sinHalfDec * sinHalfDec + Math.cos(dec1) * Math.cos(dec2) * sinHalfRa * sinHalfRa;
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  return ((c * 180) / Math.PI) * 3600;
}

function findMatchingSnapshotEntries(
  index: SnapshotIndex,
  ra: number,
  dec: number,
  collection: string | null
): SnapshotIndexEntry[] {
  const matchArcsec =
    typeof index.match_arcsec === 'number' && Number.isFinite(index.match_arcsec)
      ? index.match_arcsec
      : DEFAULT_SNAPSHOT_MATCH_ARCSEC;

  const isBoth = collection === 'spherex_both' || collection === 'both';
  const wanted =
    collection === null
      ? null
      : isBoth
      ? new Set(['spherex_dr1', 'spherex_qr3'])
      : new Set([collection]);

  return index.snapshots.filter((entry) => {
    if (wanted !== null && !wanted.has(entry.collection)) {
      return false;
    }
    return haversineArcsec(ra, dec, entry.ra, entry.dec) <= matchArcsec;
  });
}

function sortFlagBits(flagBits: FlagBitsMap): FlagBitsMap {
  const sorted: FlagBitsMap = {};
  for (const [name, bit] of Object.entries(flagBits).sort((a, b) => a[1] - b[1])) {
    sorted[name] = bit;
  }
  return sorted;
}

async function loadStaticIndex(signal?: AbortSignal): Promise<SnapshotIndex> {
  if (signal?.aborted) {
    throw createAbortError();
  }
  if (!staticIndexPromise) {
    const indexUrl = `${getStaticBaseUrl()}snapshots/index.json`;
    staticIndexPromise = (async () => {
      const res = await fetch(indexUrl);
      if (!res.ok) {
        throw new Error(
          `No se pudo descargar el índice estático (${indexUrl}: HTTP ${res.status}). / Failed to download static index (${indexUrl}: HTTP ${res.status}).`
        );
      }
      if (!isJsonResponse(res)) {
        throw new Error(
          `El índice estático (${indexUrl}) no devolvió JSON. / Static index (${indexUrl}) did not return JSON.`
        );
      }
      const data: unknown = await res.json();
      if (!data || typeof data !== 'object' || !Array.isArray((data as SnapshotIndex).snapshots)) {
        throw new Error(
          'Índice estático de snapshots mal formado: falta el arreglo snapshots. / Malformed static snapshot index: missing snapshots array.'
        );
      }
      return data as SnapshotIndex;
    })().catch((err) => {
      staticIndexPromise = null;
      throw err;
    });
  }
  return raceWithAbort(staticIndexPromise, signal);
}

async function loadStaticSnapshot(file: string, signal?: AbortSignal): Promise<RawFramesResponse> {
  if (signal?.aborted) {
    throw createAbortError();
  }
  let cached = staticSnapshotCache.get(file);
  if (!cached) {
    const cleanFile = file.replace(/^\/+/, '');
    const snapUrl = `${getStaticBaseUrl()}snapshots/${cleanFile}`;
    cached = (async () => {
      const res = await fetch(snapUrl);
      if (!res.ok) {
        throw new Error(
          `No se pudo descargar el snapshot estático ${cleanFile} (HTTP ${res.status}). / Failed to download static snapshot ${cleanFile} (HTTP ${res.status}).`
        );
      }
      if (!isJsonResponse(res)) {
        throw new Error(
          `El snapshot estático ${cleanFile} no devolvió JSON. / Static snapshot ${cleanFile} did not return JSON.`
        );
      }
      const raw: unknown = await res.json();
      return validateRawFramesPayload(raw);
    })().catch((err) => {
      staticSnapshotCache.delete(file);
      throw err;
    });
    staticSnapshotCache.set(file, cached);
  }
  return raceWithAbort(cached, signal);
}

async function fetchStaticFrames(
  ra: number,
  dec: number,
  size: number,
  collection: string,
  signal?: AbortSignal
): Promise<FramesQueryResult> {
  const index = await loadStaticIndex(signal);
  const matchedEntries = findMatchingSnapshotEntries(index, ra, dec, collection);

  if (matchedEntries.length === 0) {
    const otherEntries = findMatchingSnapshotEntries(index, ra, dec, null);
    if (otherEntries.length > 0) {
      const available = Array.from(new Set(otherEntries.map((entry) => entry.collection))).sort();
      const list = available.join(', ');
      return makeErrorResult(ra, dec, size, collection, {
        emptyMessage: `Sin datos guardados en ${collection} para esta posición; hay datos en: ${list}. / No stored data in ${collection} for this position; data available in: ${list}.`,
      });
    }
    return makeErrorResult(ra, dec, size, collection, {
      errorMessage: NO_STATIC_DATA_MSG,
    });
  }

  const snapshots = await Promise.all(
    matchedEntries.map((entry) => loadStaticSnapshot(entry.file, signal))
  );

  const mergedRawFrames: RawSpherexFrame[] = [];
  const mergedFlagBits: FlagBitsMap = {};
  const mergedCatalogSources: CatalogSource[] = [];
  const snapshotNotes: string[] = [];

  for (const snap of snapshots) {
    if (snap.frames) {
      mergedRawFrames.push(...snap.frames);
    }
    if (snap.flag_bits) {
      Object.assign(mergedFlagBits, snap.flag_bits);
    }
    if (snap.catalog_sources) {
      mergedCatalogSources.push(...snap.catalog_sources);
    }
    if (snap.notes) {
      snapshotNotes.push(...snap.notes);
    }
  }

  mergedRawFrames.sort((a, b) => a.mjd - b.mjd);
  const decodedFrames = decodeRawFrames(mergedRawFrames);

  const firstSnap = snapshots[0];
  const storedSize = firstSnap.query?.size_arcsec ?? matchedEntries[0]?.size_arcsec ?? size;
  const hasMergedFlagBits = Object.keys(mergedFlagBits).length > 0;
  const resolvedFlagBits = sortFlagBits(
    hasMergedFlagBits ? mergedFlagBits : { ...DEFAULT_FLAG_BITS }
  );

  return {
    query: {
      ra,
      dec,
      size_arcsec: storedSize,
      collection,
    },
    pixel_scale_arcsec: firstSnap.pixel_scale_arcsec ?? 6.15,
    provenance: 'cached',
    cached: true,
    flag_bits: resolvedFlagBits,
    usingDefaultFlagBits: !hasMergedFlagBits,
    ...(firstSnap.target !== undefined ? { target: firstSnap.target } : {}),
    catalog_sources: mergedCatalogSources,
    frames: decodedFrames,
    notes: [STATIC_MODE_NOTE, ...snapshotNotes],
  };
}

export async function fetchHealth(signal?: AbortSignal): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/health`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!isJsonResponse(res)) throw new Error(BACKEND_UNAVAILABLE_MSG);
  return res.json();
}

export async function fetchTargets(signal?: AbortSignal) {
  try {
    const res = await fetch(`${API_BASE}/api/targets`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!isJsonResponse(res)) throw new Error(BACKEND_UNAVAILABLE_MSG);
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
    collection = 'spherex_dr1',
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

  if (signal?.aborted) {
    return makeErrorResult(ra, dec, size, collection, {
      errorMessage: REQUEST_CANCELLED_MSG,
    });
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

  const timeoutMs = live ? 90000 : 15000;
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
    let shouldFallback = false;
    let res: Response | null = null;

    try {
      res = await fetch(url, { signal: timeoutController.signal });
    } catch (fetchErr) {
      if (isAbortError(fetchErr) || timeoutController.signal.aborted || signal?.aborted) {
        throw fetchErr;
      }
      if (fetchErr instanceof TypeError) {
        shouldFallback = true;
      } else {
        throw fetchErr;
      }
    }

    if (res !== null) {
      const hasJsonContentType = isJsonResponse(res);

      if (res.status === 502 || res.status === 504 || !hasJsonContentType) {
        shouldFallback = true;
      } else if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        let rawDetail: string | undefined;
        try {
          const errBody = (await res.json()) as { detail?: unknown } | null;
          if (errBody?.detail) {
            rawDetail = String(errBody.detail);
            detail = `${detail}: ${rawDetail}`;
          }
        } catch {
          // ignore non-json error body
        }
        if (res.status === 404 && rawDetail) {
          return makeErrorResult(ra, dec, size, collection, { emptyMessage: rawDetail });
        }
        throw new Error(detail);
      } else {
        const raw = validateRawFramesPayload(await res.json());
        return buildApiFramesResult(raw, ra, dec, size, collection);
      }
    }

    if (shouldFallback) {
      window.clearTimeout(timeoutId);
      return await fetchStaticFrames(ra, dec, size, collection, signal);
    }

    throw new Error(BACKEND_UNAVAILABLE_MSG);
  } catch (err) {
    let message = 'Unknown backend connection error.';
    if (isAbortError(err) || signal?.aborted || timedOut) {
      message =
        signal?.aborted || !timedOut
          ? REQUEST_CANCELLED_MSG
          : `Timeout (${Math.round(timeoutMs / 1000)}s) querying SPHEREx / IRSA backend.`;
    } else if (err instanceof TypeError) {
      message = API_BASE
        ? `No se pudo conectar con el backend en ${API_BASE}. Verifica que uvicorn esté corriendo.`
        : 'No se pudo conectar con el backend (/api/frames). Configura VITE_API_URL en .env.local.';
    } else if (err instanceof Error) {
      message = err.message;
    }

    return makeErrorResult(ra, dec, size, collection, { errorMessage: message });
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
    `${getStaticBaseUrl()}fotometria/${encodeURIComponent(target)}_${encodeURIComponent(collection)}.json`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(`Sin fotometría estática para ${target} (${collection})`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.toLowerCase().includes('text/html')) {
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
    if (!res.ok || !isJsonResponse(res)) {
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
