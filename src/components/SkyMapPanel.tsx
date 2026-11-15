import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Globe, Loader2 } from 'lucide-react';
import { TranslationStrings } from '../i18n/translations';

const FIREFLY_LOADER_URL = 'https://irsa.ipac.caltech.edu/irsaviewer/firefly_loader.js';
const HIPS_ROOT_URL = 'https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color';
const IRSA_SPHEREX_URL = 'https://irsa.ipac.caltech.edu/applications/spherex/';
const LOAD_TIMEOUT_MS = 15000;
const SPHERE_FOV_DEG = 75;
const TARGET_FOV_DEG = 3;
const LOCATOR_CIRCLE_DEG = 1.5;
const PLOT_ID = 'spherex-sky-hips';
const REGION_LAYER_ID = 'spherex-sky-target-marker';

interface FireflyHipsRequest {
  plotId: string;
  hipsRootUrl: string;
  WorldPt: string;
  SizeInDeg: number;
  Title?: string;
}

interface FireflyActions {
  dispatchCreateRegionLayer?: (
    regionId: string,
    layerTitle: string,
    fileOnServer: string | null,
    regionAry: string[],
    plotId?: string | string[],
    selectMode?: Record<string, unknown>
  ) => void;
  dispatchDeleteRegionLayer?: (regionId: string, plotId?: string | string[]) => void;
}

interface FireflyApi {
  showImage: (targetDiv: string, request: Record<string, unknown>) => void;
  // HiPS needs showHiPS: showImage with Type 'HiPS' fails with "Could not create plot".
  showHiPS: (targetDiv: string, request: FireflyHipsRequest) => void;
  action?: FireflyActions;
}

declare global {
  interface Window {
    firefly?: FireflyApi;
    onFireflyLoaded?: () => void;
  }
}

let fireflyPromise: Promise<FireflyApi> | null = null;

function loadFireflyOnce(): Promise<FireflyApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'));
  }
  if (window.firefly && typeof window.firefly.showImage === 'function') {
    return Promise.resolve(window.firefly);
  }
  if (fireflyPromise) {
    return fireflyPromise;
  }

  fireflyPromise = new Promise<FireflyApi>((resolve, reject) => {
    let settled = false;

    const fail = (err: Error, timerId: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timerId);
      fireflyPromise = null;
      reject(err);
    };

    const succeed = (timerId: number) => {
      if (settled) return;
      if (window.firefly && typeof window.firefly.showImage === 'function') {
        settled = true;
        window.clearTimeout(timerId);
        resolve(window.firefly);
      } else {
        fail(new Error('Firefly API unavailable after load'), timerId);
      }
    };

    const timerId = window.setTimeout(() => {
      fail(new Error('Timed out loading Firefly loader script'), timerId);
    }, LOAD_TIMEOUT_MS);

    const prevOnFireflyLoaded = window.onFireflyLoaded;
    window.onFireflyLoaded = () => {
      try {
        prevOnFireflyLoaded?.();
      } catch {
        // Ignore errors from unrelated pre-existing handlers
      }
      succeed(timerId);
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${FIREFLY_LOADER_URL}"]`
    );
    if (existingScript) {
      existingScript.addEventListener(
        'error',
        () => fail(new Error('Failed to load Firefly loader script'), timerId),
        { once: true }
      );
      if (window.firefly && typeof window.firefly.showImage === 'function') {
        succeed(timerId);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = FIREFLY_LOADER_URL;
    script.async = true;
    script.onerror = () => fail(new Error('Failed to load Firefly loader script'), timerId);
    document.head.appendChild(script);
  });

  return fireflyPromise;
}

interface SkyMapPanelProps {
  t: TranslationStrings;
  ra: number;
  dec: number;
  targetName: string | null;
  sizeArcsec?: number;
}

type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error';

export const SkyMapPanel: React.FC<SkyMapPanelProps> = ({
  t,
  ra,
  dec,
  targetName,
  sizeArcsec = 200,
}) => {
  const rawId = useId();
  const viewerId = `sky-hips-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const bodyId = `${viewerId}-body`;

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [fovMode, setFovMode] = useState<'sphere' | 'target'>('sphere');
  const [status, setStatus] = useState<ViewerStatus>(() => (isOpen ? 'loading' : 'idle'));
  const fireflyRef = useRef<FireflyApi | null>(null);
  const regionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (fireflyRef.current) {
      setStatus('ready');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    loadFireflyOnce()
      .then((api) => {
        if (cancelled) return;
        fireflyRef.current = api;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (status !== 'ready' || !isOpen) return;
    const api = fireflyRef.current;
    if (!api) return;

    const fovDeg = fovMode === 'sphere' ? SPHERE_FOV_DEG : TARGET_FOV_DEG;
    const displayLabel = targetName ?? t.skyCustomTarget;
    const raStr = ra.toFixed(6);
    const decStr = dec.toFixed(6);

    try {
      api.showHiPS(viewerId, {
        plotId: PLOT_ID,
        hipsRootUrl: HIPS_ROOT_URL,
        WorldPt: `${raStr};${decStr};EQ_J2000`,
        SizeInDeg: fovDeg,
        Title: displayLabel,
      });

      const applyRegions = () => {
        const actions = api.action;
        if (!actions?.dispatchCreateRegionLayer) return;
        const cutoutRadiusArcsec = Math.max(10, Math.round(sizeArcsec * 0.5));
        const regions = [
          // Locator ring and cutout field in the panel accent (cyan).
          `j2000; circle ${raStr} ${decStr} ${LOCATOR_CIRCLE_DEG}d # color=cyan width=1`,
          `j2000; circle ${raStr} ${decStr} ${cutoutRadiusArcsec}" # color=cyan width=2`,
          // Green dot on the target: screen-sized, so it stays visible in the sphere view.
          `j2000; point ${raStr} ${decStr} # color=#22c55e point=circle 5 width=5`,
        ];
        actions.dispatchDeleteRegionLayer?.(REGION_LAYER_ID, PLOT_ID);
        actions.dispatchCreateRegionLayer(REGION_LAYER_ID, displayLabel, null, regions, PLOT_ID);
      };

      applyRegions();
      if (regionTimerRef.current !== null) {
        window.clearTimeout(regionTimerRef.current);
      }
      // The HiPS plot takes a few seconds to register: retry the region layer.
      regionTimerRef.current = window.setTimeout(() => {
        applyRegions();
        regionTimerRef.current = window.setTimeout(applyRegions, 4000);
      }, 2500);
    } catch {
      setStatus('error');
    }

    return () => {
      if (regionTimerRef.current !== null) {
        window.clearTimeout(regionTimerRef.current);
        regionTimerRef.current = null;
      }
    };
  }, [status, isOpen, ra, dec, targetName, sizeArcsec, fovMode, viewerId, t.skyCustomTarget]);

  const headerLabel = targetName ? `${t.skyPanelTitle} · ${targetName}` : t.skyPanelTitle;
  const buttonCls = (active: boolean) =>
    `px-2 py-0.5 rounded border text-[11px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
      active
        ? 'bg-cyan-600 border-cyan-600 text-slate-950 font-semibold'
        : 'border-slate-700 bg-[#07090E] text-cyan-300 hover:border-cyan-500'
    }`;

  return (
    <section className="flex flex-col gap-2 border-b border-slate-800/80 pb-3.5">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
      >
        <span className="inline-flex items-center gap-2 font-semibold text-slate-200 min-w-0">
          <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="truncate">{headerLabel}</span>
        </span>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
        )}
      </button>

      <div id={bodyId} className={isOpen ? 'flex flex-col gap-2' : 'hidden'}>
        <div className="relative h-[220px] w-full bg-[#07090E] border border-slate-800 rounded overflow-hidden">
          <div id={viewerId} className="w-full h-full" />

          {status === 'loading' && (
            <div
              className="absolute inset-0 flex items-center justify-center gap-2 bg-[#07090E]/90 text-slate-300"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" aria-hidden="true" />
              <span>{t.skyLoading}</span>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#0B0F17] p-3 text-center">
              <span className="text-slate-300 leading-snug">{t.skyLoadError}</span>
              <a
                href={IRSA_SPHEREX_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonCls(false)} inline-flex items-center gap-1`}
              >
                {t.skyOpenIrsa}
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
          <span>{t.skyTargetMarkerNote}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={status !== 'ready'}
            onClick={() => setFovMode('target')}
            className={buttonCls(fovMode === 'target')}
          >
            {t.skyZoomTarget}
          </button>
          <button
            type="button"
            disabled={status !== 'ready'}
            onClick={() => setFovMode('sphere')}
            className={buttonCls(fovMode === 'sphere')}
          >
            {t.skySphereView}
          </button>
          <a
            href={IRSA_SPHEREX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonCls(false)} inline-flex items-center gap-1 ml-auto`}
          >
            {t.skyOpenIrsa}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
};
