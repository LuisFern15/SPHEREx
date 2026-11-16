import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCatalog, fetchFrames } from './api/spherexClient';
import { BottomDock } from './components/BottomDock';
import { CutoutViewport, HoveredPixelInfo } from './components/CutoutViewport';
import { ProvenanceBanner } from './components/ProvenanceBanner';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import {
  DEFAULT_BAND_CONTRAST,
  TARGET_PRESETS,
  collectionsForTarget,
  dateToJulianYear,
  mjdToJulianYear,
  propagatePosition,
} from './data/targets';
import { resolvePredictedPixel } from './utils/coordinates';
import { DEFAULT_FLAG_BITS } from './utils/flags';
import { TRANSLATIONS } from './i18n/translations';
import {
  BandContrast,
  CatalogSource,
  ColormapName,
  CompareMode,
  DecodedSpherexFrame,
  FramesQueryResult,
  Language,
  TargetPreset,
  UrlViewerState,
} from './types/spherex';
import {
  buildTimelineFrames,
  computeDeltaLambdaCheck,
  groupFramesIntoEpochs,
  hasWavelengthSpread,
} from './utils/epochs';
import {
  clampFieldSize,
  colToCollection,
  collectionToCol,
  getInitialUrlState,
  syncUrlHash,
} from './utils/urlHash';

function angularSepArcsec(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const cosDec = Math.cos(((dec1 + dec2) * 0.5 * Math.PI) / 180);
  const dRa = (((ra1 - ra2 + 540) % 360) - 180) * cosDec;
  const dDec = dec1 - dec2;
  return Math.hypot(dRa, dDec) * 3600;
}

function findMatchingTarget(ra: number, dec: number): TargetPreset | null {
  const nowYear = dateToJulianYear(new Date());
  let best: TargetPreset | null = null;
  let bestDist = Infinity;
  for (const t of TARGET_PRESETS) {
    const prop = propagatePosition(t, nowYear);
    const dProp = angularSepArcsec(ra, dec, prop.ra, prop.dec);
    const dRef = angularSepArcsec(ra, dec, t.ra, t.dec);
    const d = Math.min(dProp, dRef);
    if (d < 120 && d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

export default function App() {
  const [urlState, setUrlState] = useState<UrlViewerState>(() => getInitialUrlState());
  const [lang, setLang] = useState<Language>('es');
  const t = TRANSLATIONS[lang];

  // Shared per-band contrast parameters
  const [bandContrasts, setBandContrasts] = useState<Record<number, BandContrast>>(() => {
    const init = getInitialUrlState();
    return {
      ...DEFAULT_BAND_CONTRAST,
      [init.band]: {
        min: init.min,
        max: init.max,
        softening: DEFAULT_BAND_CONTRAST[init.band]?.softening ?? 4,
      },
    };
  });

  const [colormap, setColormap] = useState<ColormapName>('grayscale');
  const [showReticles, setShowReticles] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredPixel, setHoveredPixel] = useState<HoveredPixelInfo | null>(null);

  // Temporal & Epoch state
  const [coaddMode, setCoaddMode] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);

  // A/B Blink & Difference state
  const [compareMode, setCompareMode] = useState<CompareMode>('single');
  const [refFrame, setRefFrame] = useState<DecodedSpherexFrame | null>(null);
  const [blinkShowRef, setBlinkShowRef] = useState(false);
  const [allowUnsafeDiff, setAllowUnsafeDiff] = useState(false);

  const activeCollection = colToCollection(urlState.col);

  // API / Query result state
  const [loading, setLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [queryResult, setQueryResult] = useState<FramesQueryResult>({
    query: {
      ra: urlState.ra,
      dec: urlState.dec,
      size_arcsec: urlState.size,
      collection: activeCollection,
    },
    pixel_scale_arcsec: 6.15,
    provenance: urlState.sim === 1 ? 'simulated' : 'live',
    cached: false,
    flag_bits: { ...DEFAULT_FLAG_BITS },
    usingDefaultFlagBits: true,
    catalog_sources: [],
    frames: [],
    notes: [],
  });

  const abortRef = useRef<AbortController | null>(null);

  // Keep URL hash synchronized on every state change
  useEffect(() => {
    syncUrlHash(urlState);
  }, [urlState]);

  // Listen to external browser hash changes
  useEffect(() => {
    const onHashChange = () => {
      const next = getInitialUrlState();
      setUrlState(next);
      setBandContrasts((prev) => ({
        ...prev,
        [next.band]: {
          ...(prev[next.band] ?? DEFAULT_BAND_CONTRAST[next.band] ?? DEFAULT_BAND_CONTRAST[0]),
          min: next.min,
          max: next.max,
        },
      }));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Fetch frames when (ra, dec, size, sim, retryNonce) changes
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setHoveredPixel(null);
    setRefFrame(null);
    setCompareMode('single');
    setAllowUnsafeDiff(false);

    fetchFrames({
      ra: urlState.ra,
      dec: urlState.dec,
      size: urlState.size,
      collection: activeCollection,
      simMode: urlState.sim === 1,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      setQueryResult(result);
      setLoading(false);
    }).catch((err) => {
      if (controller.signal.aborted) return;
      console.error('fetchFrames failed', err);
      setLoading(false);
    });

    return () => controller.abort();
  }, [urlState.ra, urlState.dec, urlState.size, activeCollection, urlState.sim, retryNonce]);

  const activeTarget = useMemo(
    () => findMatchingTarget(urlState.ra, urlState.dec),
    [urlState.ra, urlState.dec]
  );

  const isLiveQuery = !activeTarget && urlState.sim !== 1;

  // Gaia DR3 reference catalog (cat=1): fetched only when the layer is on, cached per field.
  const [gaiaCatalog, setGaiaCatalog] = useState<CatalogSource[]>([]);
  const catalogCacheRef = useRef(new Map<string, CatalogSource[]>());
  useEffect(() => {
    if (urlState.cat !== 1 || urlState.sim === 1) return;
    const key = activeTarget
      ? `target:${activeTarget.id}`
      : `${urlState.ra.toFixed(4)},${urlState.dec.toFixed(4)},${urlState.size}`;
    const cached = catalogCacheRef.current.get(key);
    if (cached) {
      setGaiaCatalog(cached);
      return;
    }
    setGaiaCatalog([]);
    const controller = new AbortController();
    fetchCatalog({
      ra: urlState.ra,
      dec: urlState.dec,
      size: urlState.size,
      targetId: activeTarget?.id ?? null,
      signal: controller.signal,
    })
      .then((sources) => {
        catalogCacheRef.current.set(key, sources);
        setGaiaCatalog(sources);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn('Gaia DR3 catalog unavailable:', err);
      });
    return () => controller.abort();
  }, [urlState.cat, urlState.sim, urlState.ra, urlState.dec, urlState.size, activeTarget]);

  const availableCollections = useMemo(
    () => collectionsForTarget(activeTarget, activeCollection),
    [activeTarget, activeCollection]
  );

  const epochs = useMemo(
    () => groupFramesIntoEpochs(queryResult.frames, queryResult.flag_bits),
    [queryResult.frames, queryResult.flag_bits]
  );

  const timelineFrames = useMemo(
    () => buildTimelineFrames(epochs, urlState.band, coaddMode),
    [epochs, urlState.band, coaddMode]
  );

  const safeIndex =
    timelineFrames.length > 0
      ? Math.max(0, Math.min(urlState.i, timelineFrames.length - 1))
      : 0;

  const currentFrame = timelineFrames[safeIndex] ?? null;

  const pendingFrameIdRef = useRef<string | null>(null);

  const selectedFrameId = useMemo(
    () => currentFrame?.sourceFrameIds?.[0] ?? currentFrame?.id ?? null,
    [currentFrame]
  );

  const handleSelectFrameById = useCallback(
    (frameId: string) => {
      setPlaying(false);
      const directIdx = timelineFrames.findIndex(
        (f) => f.id === frameId || f.sourceFrameIds?.includes(frameId)
      );
      if (directIdx >= 0) {
        setUrlState((prev) => ({ ...prev, i: directIdx }));
        return;
      }
      const rawMatch = queryResult.frames.find((f) => f.id === frameId);
      if (rawMatch) {
        pendingFrameIdRef.current = frameId;
        setCoaddMode(false);
        setUrlState((prev) => ({
          ...prev,
          band: prev.band !== 0 && prev.band !== rawMatch.band ? rawMatch.band : prev.band,
          i: 0,
        }));
      }
    },
    [timelineFrames, queryResult.frames]
  );

  useEffect(() => {
    const targetId = pendingFrameIdRef.current;
    if (!targetId) return;
    const idx = timelineFrames.findIndex(
      (f) => f.id === targetId || f.sourceFrameIds?.includes(targetId)
    );
    if (idx >= 0) {
      pendingFrameIdRef.current = null;
      setUrlState((prev) => ({ ...prev, i: idx }));
    }
  }, [timelineFrames]);

  useEffect(() => {
    if (timelineFrames.length > 0 && urlState.i >= timelineFrames.length) {
      setUrlState((prev) => ({ ...prev, i: 0 }));
    }
  }, [timelineFrames.length, urlState.i]);

  // Playback timer
  useEffect(() => {
    if (!playing || timelineFrames.length <= 1) return;
    const id = window.setInterval(() => {
      setUrlState((prev) => {
        const nextIdx = prev.i + 1;
        if (nextIdx >= timelineFrames.length) {
          if (!loop) {
            setPlaying(false);
            return prev;
          }
          return { ...prev, i: 0 };
        }
        return { ...prev, i: nextIdx };
      });
    }, urlState.speed);
    return () => window.clearInterval(id);
  }, [playing, timelineFrames.length, loop, urlState.speed]);

  // Blink A/B timer
  useEffect(() => {
    if (compareMode !== 'blink' || !refFrame) {
      setBlinkShowRef(false);
      return;
    }
    const id = window.setInterval(() => {
      setBlinkShowRef((b) => !b);
    }, urlState.speed);
    return () => window.clearInterval(id);
  }, [compareMode, refFrame, urlState.speed]);

  const deltaLambdaInfo = useMemo(
    () => computeDeltaLambdaCheck(refFrame, currentFrame),
    [refFrame, currentFrame]
  );

  useEffect(() => {
    if (compareMode === 'diff' && deltaLambdaInfo?.exceedsHalfChannel && !allowUnsafeDiff) {
      setCompareMode('single');
    }
  }, [compareMode, deltaLambdaInfo, allowUnsafeDiff]);

  const activeContrast =
    bandContrasts[urlState.band] ?? DEFAULT_BAND_CONTRAST[urlState.band] ?? DEFAULT_BAND_CONTRAST[0];

  const handleSelectTarget = useCallback((target: TargetPreset) => {
    const propagated = propagatePosition(target, dateToJulianYear(new Date()));
    const targetBand = target.defaultBand;
    const targetContrast =
      bandContrasts[targetBand] ?? DEFAULT_BAND_CONTRAST[targetBand] ?? DEFAULT_BAND_CONTRAST[0];
    setPlaying(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setUrlState((prev) => ({
      ...prev,
      ra: Number(propagated.ra.toFixed(6)),
      dec: Number(propagated.dec.toFixed(6)),
      size: clampFieldSize(target.defaultSize),
      band: targetBand,
      col: collectionToCol(target.defaultCollection),
      min: targetContrast.min,
      max: targetContrast.max,
      i: 0,
    }));
  }, [bandContrasts]);

  const handleSearchCoords = useCallback(
    (ra: number, dec: number, size: number) => {
      const prevTarget = findMatchingTarget(urlState.ra, urlState.dec);
      const nextTarget = findMatchingTarget(ra, dec);
      setPlaying(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      // Same coordinates again: the load effect would not re-run, so force a reload.
      if (
        Number(ra.toFixed(6)) === urlState.ra &&
        Number(dec.toFixed(6)) === urlState.dec &&
        clampFieldSize(size) === urlState.size
      ) {
        setRetryNonce((n) => n + 1);
      }
      setUrlState((prev) => {
        let nextCol = prev.col;
        if (nextTarget) {
          const currentColName = colToCollection(prev.col);
          if (
            nextTarget.id !== prevTarget?.id ||
            !nextTarget.collections.includes(currentColName)
          ) {
            nextCol = collectionToCol(nextTarget.defaultCollection);
          }
        } else {
          // Manual coordinates always start on DR1 (team decision): it has the most epochs.
          nextCol = 'dr1';
        }
        return {
          ...prev,
          ra: Number(ra.toFixed(6)),
          dec: Number(dec.toFixed(6)),
          size: clampFieldSize(size),
          col: nextCol,
          i: 0,
        };
      });
    },
    [urlState.ra, urlState.dec, urlState.size]
  );

  const handleSelectBand = useCallback(
    (nextBand: number) => {
      const nextContrast =
        bandContrasts[nextBand] ?? DEFAULT_BAND_CONTRAST[nextBand] ?? DEFAULT_BAND_CONTRAST[0];
      setUrlState((prev) => ({
        ...prev,
        band: nextBand,
        min: nextContrast.min,
        max: nextContrast.max,
        i: 0,
      }));
    },
    [bandContrasts]
  );

  const handleMinChange = useCallback(
    (val: number) => {
      const clampedMin = Math.min(val, activeContrast.max - 0.1);
      setBandContrasts((prev) => ({
        ...prev,
        [urlState.band]: { ...activeContrast, min: clampedMin },
      }));
      setUrlState((prev) => ({ ...prev, min: clampedMin }));
    },
    [urlState.band, activeContrast]
  );

  const handleMaxChange = useCallback(
    (val: number) => {
      const clampedMax = Math.max(val, activeContrast.min + 0.1);
      setBandContrasts((prev) => ({
        ...prev,
        [urlState.band]: { ...activeContrast, max: clampedMax },
      }));
      setUrlState((prev) => ({ ...prev, max: clampedMax }));
    },
    [urlState.band, activeContrast]
  );

  const handleSofteningChange = useCallback(
    (val: number) => {
      setBandContrasts((prev) => ({
        ...prev,
        [urlState.band]: { ...activeContrast, softening: val },
      }));
    },
    [urlState.band, activeContrast]
  );

  const handleAutoContrast = useCallback(() => {
    if (!currentFrame) return;
    const finite: number[] = [];
    for (let i = 0; i < currentFrame.pixels.length; i++) {
      const v = currentFrame.pixels[i];
      if (Number.isFinite(v)) finite.push(v);
    }
    if (finite.length < 4) return;
    finite.sort((a, b) => a - b);
    const pLow = finite[Math.floor(finite.length * 0.05)];
    const pHigh = finite[Math.min(finite.length - 1, Math.floor(finite.length * 0.992))];
    const nextMin = Number(pLow.toFixed(2));
    const nextMax = Number(Math.max(nextMin + 1, pHigh).toFixed(2));
    const nextSoft = Number(Math.max(0.5, (nextMax - nextMin) * 0.12).toFixed(2));

    setBandContrasts((prev) => ({
      ...prev,
      [urlState.band]: { min: nextMin, max: nextMax, softening: nextSoft },
    }));
    setUrlState((prev) => ({ ...prev, min: nextMin, max: nextMax }));
  }, [currentFrame, urlState.band]);

  const wavelengthSpreadWarning = useMemo(
    () => hasWavelengthSpread(timelineFrames),
    [timelineFrames]
  );

  const predictedResolution = useMemo(
    () =>
      resolvePredictedPixel(
        currentFrame,
        activeTarget,
        mjdToJulianYear,
        propagatePosition
      ),
    [currentFrame, activeTarget]
  );

  const handleChangeCollection = useCallback((nextColName: string) => {
    setPlaying(false);
    setUrlState((prev) => ({ ...prev, col: collectionToCol(nextColName), i: 0 }));
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0A0A0A] text-slate-100">
      <TopBar
        t={t}
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'es' ? 'en' : 'es'))}
        ra={urlState.ra}
        dec={urlState.dec}
        size={urlState.size}
        collection={activeCollection}
        availableCollections={availableCollections}
        activeTargetId={activeTarget?.id ?? null}
        simMode={urlState.sim === 1}
        onToggleSimMode={() =>
          setUrlState((prev) => ({ ...prev, sim: prev.sim === 1 ? 0 : 1, i: 0 }))
        }
        onSelectTarget={handleSelectTarget}
        onSearchCoords={handleSearchCoords}
        onChangeSize={(nextSize) =>
          setUrlState((prev) => ({ ...prev, size: clampFieldSize(nextSize), i: 0 }))
        }
        onChangeCollection={handleChangeCollection}
      />

      <ProvenanceBanner
        t={t}
        provenance={queryResult.provenance}
        loading={loading}
        errorMessage={queryResult.errorMessage}
        emptyMessage={queryResult.emptyMessage}
        notes={queryResult.notes}
        onRetry={() => setRetryNonce((n) => n + 1)}
        requestedSize={urlState.size}
        actualSize={queryResult.query.size_arcsec}
      />

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <CutoutViewport
          t={t}
          lang={lang}
          frame={currentFrame}
          refFrame={refFrame}
          provenance={queryResult.provenance}
          loading={loading}
          isLiveQuery={isLiveQuery}
          errorMessage={queryResult.errorMessage}
          emptyMessage={queryResult.emptyMessage}
          onRetry={() => setRetryNonce((n) => n + 1)}
          min={activeContrast.min}
          max={activeContrast.max}
          softening={activeContrast.softening}
          colormap={colormap}
          compareMode={compareMode}
          blinkShowRef={blinkShowRef}
          allowUnsafeDiff={allowUnsafeDiff}
          deltaLambdaBlocked={Boolean(deltaLambdaInfo?.exceedsHalfChannel)}
          showFlags={urlState.flags === 1}
          showCatalog={urlState.cat === 1}
          showReticles={showReticles}
          simMode={urlState.sim === 1}
          zoom={zoom}
          panX={pan.x}
          panY={pan.y}
          onZoomChange={setZoom}
          onPanChange={(x, y) => setPan({ x, y })}
          flagBits={queryResult.flag_bits}
          catalogSources={
            queryResult.catalog_sources.length > 0 ? queryResult.catalog_sources : gaiaCatalog
          }
          activeTarget={activeTarget}
          pixelScaleArcsec={queryResult.pixel_scale_arcsec}
          sizeArcsec={urlState.size}
          activeCollection={activeCollection}
          totalFramesCount={queryResult.frames.length}
          onSwitchCollection={handleChangeCollection}
          onHoverPixel={setHoveredPixel}
        />

        <RightPanel
          t={t}
          lang={lang}
          collection={activeCollection}
          onChangeCollection={handleChangeCollection}
          activeTarget={activeTarget}
          band={urlState.band}
          min={activeContrast.min}
          max={activeContrast.max}
          softening={activeContrast.softening}
          onMinChange={handleMinChange}
          onMaxChange={handleMaxChange}
          onSofteningChange={handleSofteningChange}
          onAutoContrast={handleAutoContrast}
          colormap={colormap}
          onColormapChange={setColormap}
          zoom={zoom}
          onZoomChange={setZoom}
          onResetView={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          showFlags={urlState.flags === 1}
          onToggleFlags={() =>
            setUrlState((prev) => ({ ...prev, flags: prev.flags === 1 ? 0 : 1 }))
          }
          showCatalog={urlState.cat === 1}
          onToggleCatalog={() =>
            setUrlState((prev) => ({ ...prev, cat: prev.cat === 1 ? 0 : 1 }))
          }
          showReticles={showReticles}
          onToggleReticles={() => setShowReticles((r) => !r)}
          compareMode={compareMode}
          onCompareModeChange={setCompareMode}
          refFrame={refFrame}
          onPinRefFrame={() => {
            if (currentFrame) {
              setRefFrame(currentFrame);
              setAllowUnsafeDiff(false);
            }
          }}
          deltaLambdaInfo={deltaLambdaInfo}
          allowUnsafeDiff={allowUnsafeDiff}
          onToggleAllowUnsafeDiff={() => setAllowUnsafeDiff((a) => !a)}
          hoveredPixel={hoveredPixel}
          selectedFrameId={selectedFrameId}
          onSelectFrameId={handleSelectFrameById}
          ra={urlState.ra}
          dec={urlState.dec}
          sizeArcsec={urlState.size}
          frames={queryResult.frames}
        />
      </main>

      <BottomDock
        t={t}
        lang={lang}
        band={urlState.band}
        onSelectBand={handleSelectBand}
        wavelengthSpreadWarning={wavelengthSpreadWarning}
        coaddMode={coaddMode}
        onToggleCoaddMode={() => {
          setCoaddMode((m) => !m);
          setUrlState((prev) => ({ ...prev, i: 0 }));
        }}
        epochs={epochs}
        timelineFrames={timelineFrames}
        currentIndex={safeIndex}
        onSelectIndex={(idx) => {
          setPlaying(false);
          setUrlState((prev) => ({ ...prev, i: idx }));
        }}
        playing={playing}
        onTogglePlay={() => {
          // Loop off and parked on the last frame: restart from the beginning.
          if (!playing && !loop && safeIndex >= timelineFrames.length - 1) {
            setUrlState((prev) => ({ ...prev, i: 0 }));
          }
          setPlaying((p) => !p);
        }}
        loop={loop}
        onToggleLoop={() => setLoop((l) => !l)}
        speed={urlState.speed}
        onSpeedChange={(s) => setUrlState((prev) => ({ ...prev, speed: s }))}
        currentFrame={currentFrame}
        flagBits={queryResult.flag_bits}
        usingDefaultFlagBits={queryResult.usingDefaultFlagBits}
        predictedOutOfBounds={predictedResolution.outOfBounds}
        activeTarget={activeTarget}
      />
    </div>
  );
}
