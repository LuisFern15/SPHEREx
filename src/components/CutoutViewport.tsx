import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  collectionsForTarget,
  formatIrsaCoverage,
  mjdToJulianYear,
  propagatePosition,
} from '../data/targets';
import { TranslationStrings } from '../i18n/translations';
import { Canvas2DRenderer } from '../rendering/canvas2dRenderer';
import { CutoutRenderer, ViewportTransform } from '../rendering/cutoutRenderer';
import {
  CatalogSource,
  ColormapName,
  CompareMode,
  DecodedSpherexFrame,
  FlagBitsMap,
  Language,
  ProvenanceState,
  TargetPreset,
} from '../types/spherex';
import { pixelToSkyLinear, resolvePredictedPixel, skyToPixelLinear } from '../utils/coordinates';
import { DecodedFlagEntry, decodePixelFlags } from '../utils/flags';

export interface HoveredPixelInfo {
  x: number;
  y: number;
  flux: number;
  ra: number;
  dec: number;
  flags: DecodedFlagEntry[];
}

interface CutoutViewportProps {
  t: TranslationStrings;
  lang: Language;
  frame: DecodedSpherexFrame | null;
  refFrame: DecodedSpherexFrame | null;
  provenance: ProvenanceState;
  loading: boolean;
  isLiveQuery?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  onRetry: () => void;
  min: number;
  max: number;
  softening: number;
  colormap: ColormapName;
  compareMode: CompareMode;
  blinkShowRef: boolean;
  allowUnsafeDiff: boolean;
  deltaLambdaBlocked: boolean;
  showFlags: boolean;
  showCatalog: boolean;
  showReticles: boolean;
  simMode: boolean;
  zoom: number;
  panX: number;
  panY: number;
  onZoomChange: (nextZoom: number) => void;
  onPanChange: (nextX: number, nextY: number) => void;
  flagBits: FlagBitsMap;
  catalogSources: CatalogSource[];
  activeTarget: TargetPreset | null;
  pixelScaleArcsec: number;
  sizeArcsec: number;
  activeCollection: string;
  totalFramesCount: number;
  onSwitchCollection: (col: string) => void;
  onHoverPixel: (info: HoveredPixelInfo | null) => void;
}

export const CutoutViewport: React.FC<CutoutViewportProps> = ({
  t,
  lang,
  frame,
  refFrame,
  provenance,
  loading,
  isLiveQuery = false,
  errorMessage,
  emptyMessage,
  onRetry,
  min,
  max,
  softening,
  colormap,
  compareMode,
  blinkShowRef,
  allowUnsafeDiff,
  deltaLambdaBlocked,
  showFlags,
  showCatalog,
  showReticles,
  simMode,
  zoom,
  panX,
  panY,
  onZoomChange,
  onPanChange,
  flagBits,
  catalogSources,
  activeTarget,
  pixelScaleArcsec,
  sizeArcsec,
  activeCollection,
  totalFramesCount,
  onSwitchCollection,
  onHoverPixel,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CutoutRenderer | null>(null);

  const [canvasDims, setCanvasDims] = useState({ width: 640, height: 480 });
  const [transform, setTransform] = useState<ViewportTransform | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const renderer = new Canvas2DRenderer();
    rendererRef.current = renderer;
    return () => {
      renderer.dispose?.();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width));
        const h = Math.max(200, Math.floor(entry.contentRect.height));
        setCanvasDims({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayedFrame =
    compareMode === 'blink' && blinkShowRef && refFrame ? refFrame : frame;
  const isDifference =
    compareMode === 'diff' && Boolean(refFrame) && (!deltaLambdaBlocked || allowUnsafeDiff);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    canvas.width = canvasDims.width;
    canvas.height = canvasDims.height;

    if (!displayedFrame) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#07090E';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      setTransform(null);
      return;
    }

    const [imgH, imgW] = displayedFrame.shape;
    const nextTransform = renderer.render(canvas, {
      pixels: displayedFrame.pixels,
      refPixels: isDifference && refFrame ? refFrame.pixels : null,
      width: imgW,
      height: imgH,
      min,
      max,
      softening,
      colormap,
      isDifference,
      zoom,
      panX,
      panY,
      showSimulatedWatermark: simMode,
    });
    setTransform(nextTransform);
  }, [
    canvasDims,
    displayedFrame,
    refFrame,
    isDifference,
    min,
    max,
    softening,
    colormap,
    zoom,
    panX,
    panY,
    simMode,
  ]);

  const toScreenCoords = (px: number, py: number, imgHeight: number) => {
    if (!transform) return null;
    const sx = transform.drawX + (px + 0.5) * transform.pixelSize;
    const sy = transform.drawY + (imgHeight - 1 - py + 0.5) * transform.pixelSize;
    return { x: sx, y: sy };
  };

  // Compute query_xy (fixed center) and predicted_xy (at individual frame.mjd, with out-of-bounds edge arrow)
  const reticles = useMemo(() => {
    if (!displayedFrame || !transform) return null;
    const [imgH, imgW] = displayedFrame.shape;
    const fallbackCenter: [number, number] = [(imgW - 1) / 2, (imgH - 1) / 2];

    const queryPx = displayedFrame.query_xy ?? displayedFrame.target_xy ?? fallbackCenter;
    const { px: predictedPx, outOfBounds: predictedOutOfBounds } = resolvePredictedPixel(
      displayedFrame,
      activeTarget,
      mjdToJulianYear,
      propagatePosition
    );

    let ref2010Px: [number, number] | null = null;
    if (activeTarget?.referencePosition) {
      ref2010Px = skyToPixelLinear(
        activeTarget.referencePosition.ra,
        activeTarget.referencePosition.dec,
        displayedFrame.wcs
      );
    }

    const queryScreen = toScreenCoords(queryPx[0], queryPx[1], imgH);
    const predictedScreen = predictedPx
      ? toScreenCoords(predictedPx[0], predictedPx[1], imgH)
      : null;

    let outArrow: { x: number; y: number; angleDeg: number } | null = null;
    if (predictedOutOfBounds && predictedScreen) {
      const cx = transform.drawX + transform.drawW * 0.5;
      const cy = transform.drawY + transform.drawH * 0.5;
      const dx = predictedScreen.x - cx;
      const dy = predictedScreen.y - cy;
      const halfW = Math.max(8, transform.drawW * 0.5 - 6);
      const halfH = Math.max(8, transform.drawH * 0.5 - 6);
      const scaleX = Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity;
      const scaleY = Math.abs(dy) > 1e-6 ? halfH / Math.abs(dy) : Infinity;
      const tEdge = Math.min(scaleX, scaleY, 1);
      outArrow = {
        x: cx + dx * tEdge,
        y: cy + dy * tEdge,
        angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    }

    return {
      queryScreen,
      predictedScreen,
      predictedOutOfBounds,
      outArrow,
      ref2010Screen: ref2010Px ? toScreenCoords(ref2010Px[0], ref2010Px[1], imgH) : null,
      imgH,
      imgW,
    };
  }, [displayedFrame, transform, activeTarget]);

  // Flagged pixel overlay elements (only saturation, persistence, and bad; omit source/other)
  const flagOverlayCells = useMemo(() => {
    if (!showFlags || !displayedFrame || !transform) return [];
    const [imgH, imgW] = displayedFrame.shape;
    const cells: {
      key: string;
      sx: number;
      sy: number;
      size: number;
      kind: 'saturation' | 'persistence' | 'bad';
    }[] = [];

    for (let y = 0; y < imgH; y++) {
      for (let x = 0; x < imgW; x++) {
        const mask = displayedFrame.flagMask[y * imgW + x];
        if (!mask) continue;
        const active = decodePixelFlags(mask, flagBits);
        if (active.length === 0) continue;

        let chosenKind: 'saturation' | 'persistence' | 'bad' | null = null;
        if (active.some((f) => f.category === 'saturation')) chosenKind = 'saturation';
        else if (active.some((f) => f.category === 'persistence')) chosenKind = 'persistence';
        else if (active.some((f) => f.category === 'bad')) chosenKind = 'bad';

        if (!chosenKind) continue;

        const sx = transform.drawX + x * transform.pixelSize;
        const sy = transform.drawY + (imgH - 1 - y) * transform.pixelSize;
        cells.push({
          key: `${x}_${y}`,
          sx,
          sy,
          size: transform.pixelSize,
          kind: chosenKind,
        });
      }
    }
    return cells;
  }, [showFlags, displayedFrame, transform, flagBits]);

  // Reference catalog overlay points
  const catalogPoints = useMemo(() => {
    if (!showCatalog || !displayedFrame || !transform) return [];
    const [imgH, imgW] = displayedFrame.shape;
    const pts: { id: string; label: string; sx: number; sy: number; kind: CatalogSource['kind'] }[] = [];

    // Carry catalog positions (Gaia DR3: J2016.0) to this frame's date with their proper motion.
    const frameYear = 2000 + (displayedFrame.mjd - 51544.5) / 365.25;
    for (const src of catalogSources) {
      let ra = src.ra;
      let dec = src.dec;
      if (src.epoch !== undefined && Number.isFinite(frameYear)) {
        const dtYears = frameYear - src.epoch;
        const cosDec = Math.cos((src.dec * Math.PI) / 180);
        if (src.pmra != null && Math.abs(cosDec) > 1e-6) {
          ra += (src.pmra * dtYears) / 3.6e6 / cosDec;
        }
        if (src.pmdec != null) {
          dec += (src.pmdec * dtYears) / 3.6e6;
        }
      }
      const px = skyToPixelLinear(ra, dec, displayedFrame.wcs);
      if (!px) continue;
      if (px[0] < -1 || px[0] > imgW || px[1] < -1 || px[1] > imgH) continue;
      const scr = toScreenCoords(px[0], px[1], imgH);
      if (scr) {
        pts.push({ id: src.id, label: src.label, sx: scr.x, sy: scr.y, kind: src.kind });
      }
    }
    return pts;
  }, [showCatalog, displayedFrame, transform, catalogSources]);

  const fallbackCollection = useMemo(() => {
    if (activeTarget) {
      if (
        activeCollection !== 'spherex_both' &&
        activeTarget.collections.includes('spherex_both')
      ) {
        return 'spherex_both';
      }
      return activeTarget.collections.find((c) => c !== activeCollection) ?? null;
    }
    return activeCollection === 'spherex_both' ? 'spherex_dr1' : 'spherex_both';
  }, [activeTarget, activeCollection]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      onPanChange(dragStartRef.current.panX + dx, dragStartRef.current.panY + dy);
      return;
    }

    if (!displayedFrame || !transform || !containerRef.current) {
      onHoverPixel(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const [imgH, imgW] = displayedFrame.shape;

    const px = Math.floor((cx - transform.drawX) / transform.pixelSize);
    const canvasRow = Math.floor((cy - transform.drawY) / transform.pixelSize);
    const py = imgH - 1 - canvasRow;

    if (px < 0 || px >= imgW || py < 0 || py >= imgH) {
      onHoverPixel(null);
      return;
    }

    const idx = py * imgW + px;
    let flux = displayedFrame.pixels[idx];
    if (isDifference && refFrame) {
      flux = flux - refFrame.pixels[idx];
    }
    const mask = displayedFrame.flagMask[idx] ?? 0;
    const sky = pixelToSkyLinear(px, py, displayedFrame.wcs);
    const flags = decodePixelFlags(mask, flagBits);

    onHoverPixel({ x: px, y: py, flux, ra: sky.ra, dec: sky.dec, flags });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.max(0.5, Math.min(8, Number((zoom * factor).toFixed(2))));
    onZoomChange(next);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        setDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      }}
      onPointerUp={() => {
        setDragging(false);
        dragStartRef.current = null;
      }}
      onPointerLeave={() => {
        setDragging(false);
        dragStartRef.current = null;
        onHoverPixel(null);
      }}
      onPointerMove={handlePointerMove}
      onWheel={handleWheel}
      className={`relative flex-1 bg-[#07090E] overflow-hidden select-none ${
        dragging ? 'cursor-grabbing' : 'cursor-crosshair'
      }`}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Synchronized SVG Overlay */}
      {displayedFrame && transform && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          width={canvasDims.width}
          height={canvasDims.height}
        >
          {/* Quality Flags Layer */}
          {flagOverlayCells.map((cell) => {
            if (cell.kind === 'saturation') {
              return (
                <g key={cell.key}>
                  <rect
                    x={cell.sx + 0.5}
                    y={cell.sy + 0.5}
                    width={Math.max(2, cell.size - 1)}
                    height={Math.max(2, cell.size - 1)}
                    fill="rgba(244, 63, 94, 0.22)"
                    stroke="#F43F5E"
                    strokeWidth={1.5}
                  />
                </g>
              );
            }
            if (cell.kind === 'persistence') {
              return (
                <rect
                  key={cell.key}
                  x={cell.sx + 0.5}
                  y={cell.sy + 0.5}
                  width={Math.max(2, cell.size - 1)}
                  height={Math.max(2, cell.size - 1)}
                  fill="rgba(245, 158, 11, 0.18)"
                  stroke="#F59E0B"
                  strokeWidth={1.3}
                  strokeDasharray="2 1.5"
                />
              );
            }
            return (
              <g key={cell.key} stroke="#E879F9" strokeWidth={1.2}>
                <line x1={cell.sx + 2} y1={cell.sy + 2} x2={cell.sx + cell.size - 2} y2={cell.sy + cell.size - 2} />
                <line x1={cell.sx + cell.size - 2} y1={cell.sy + 2} x2={cell.sx + 2} y2={cell.sy + cell.size - 2} />
              </g>
            );
          })}

          {/* Reference Catalog Layer (cat=1) */}
          {catalogPoints.map((pt) => (
            <g key={pt.id}>
              <circle
                cx={pt.sx}
                cy={pt.sy}
                r={Math.max(5, transform.pixelSize * 0.7)}
                fill="none"
                stroke={pt.kind === 'reference' ? '#A78BFA' : '#38BDF8'}
                strokeWidth={1.2}
                strokeDasharray={pt.kind === 'reference' ? '3 2' : undefined}
              />
              <text
                x={pt.sx + Math.max(7, transform.pixelSize * 0.85)}
                y={pt.sy - 4}
                fill={pt.kind === 'reference' ? '#C4B5FD' : '#7DD3FC'}
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
              >
                {pt.label}
              </text>
            </g>
          ))}

          {/* Fixed Query Reticle (query_xy) + Predicted Epoch Position (predicted_xy) */}
          {showReticles && reticles && (
            <>
              {reticles.queryScreen && (
                <g stroke="#06B6D4" strokeWidth={1.5}>
                  <line
                    x1={reticles.queryScreen.x - 16}
                    y1={reticles.queryScreen.y}
                    x2={reticles.queryScreen.x - 6}
                    y2={reticles.queryScreen.y}
                  />
                  <line
                    x1={reticles.queryScreen.x + 6}
                    y1={reticles.queryScreen.y}
                    x2={reticles.queryScreen.x + 16}
                    y2={reticles.queryScreen.y}
                  />
                  <line
                    x1={reticles.queryScreen.x}
                    y1={reticles.queryScreen.y - 16}
                    x2={reticles.queryScreen.x}
                    y2={reticles.queryScreen.y - 6}
                  />
                  <line
                    x1={reticles.queryScreen.x}
                    y1={reticles.queryScreen.y + 6}
                    x2={reticles.queryScreen.x}
                    y2={reticles.queryScreen.y + 16}
                  />
                </g>
              )}

              {reticles.predictedScreen && !reticles.predictedOutOfBounds && (
                <g>
                  <polygon
                    points={`${reticles.predictedScreen.x},${reticles.predictedScreen.y - 9} ${
                      reticles.predictedScreen.x + 9
                    },${reticles.predictedScreen.y} ${reticles.predictedScreen.x},${
                      reticles.predictedScreen.y + 9
                    } ${reticles.predictedScreen.x - 9},${reticles.predictedScreen.y}`}
                    fill="none"
                    stroke="#FBBF24"
                    strokeWidth={1.5}
                  />
                </g>
              )}

              {reticles.predictedOutOfBounds && reticles.outArrow && (
                <g
                  transform={`translate(${reticles.outArrow.x}, ${reticles.outArrow.y}) rotate(${reticles.outArrow.angleDeg})`}
                >
                  <polygon
                    points="8,0 -6,-6 -3,0 -6,6"
                    fill="#FBBF24"
                    stroke="#07090E"
                    strokeWidth={0.8}
                  />
                </g>
              )}

              {/* WISE 0855 uncentered 2010.34 reference marker */}
              {reticles.ref2010Screen && activeTarget?.referencePosition && (
                <g>
                  <circle
                    cx={reticles.ref2010Screen.x}
                    cy={reticles.ref2010Screen.y}
                    r={7}
                    fill="none"
                    stroke="#A78BFA"
                    strokeWidth={1.3}
                    strokeDasharray="2 2"
                  />
                  <text
                    x={reticles.ref2010Screen.x + 10}
                    y={reticles.ref2010Screen.y + 3}
                    fill="#C4B5FD"
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {lang === 'es'
                      ? activeTarget.referencePosition.labelEs
                      : activeTarget.referencePosition.labelEn}
                  </text>
                </g>
              )}
            </>
          )}
        </svg>
      )}

      {/* Top-Left HUD: Scale & Active Mode */}
      <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1 text-[11px] font-mono tabular-nums bg-[#0B0F17]/85 border border-slate-800 px-2.5 py-1.5 rounded">
        <div className="text-slate-200 flex items-center gap-2">
          <span>
            FOV {sizeArcsec}&Prime; · {pixelScaleArcsec.toFixed(2)}&Prime;/px
          </span>
          <span className="text-slate-500">·</span>
          <span>{zoom.toFixed(2)}x</span>
        </div>
        {compareMode !== 'single' && (
          <div className="text-cyan-300">
            {compareMode === 'blink'
              ? `${t.modeBlink}: ${blinkShowRef ? 'A (Ref)' : 'B (Actual)'}`
              : `${t.modeDiff}${isDifference ? '' : ' (Bloqueado Δλ)'}`}
          </div>
        )}
      </div>

      {/* Bottom-Left HUD: Reticle Legend */}
      {showReticles && displayedFrame && (
        <div className="absolute bottom-3 left-3 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] bg-[#0B0F17]/85 border border-slate-800 px-2.5 py-1.5 rounded">
          <span className="inline-flex items-center gap-1.5 text-cyan-300">
            <span className="font-mono font-bold">+</span>
            <span>{t.reticleFixedLegend}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <span className="font-mono font-bold">◇</span>
            <span>{t.reticlePredictedLegend}</span>
          </span>
          {activeTarget?.referencePosition && (
            <span className="inline-flex items-center gap-1.5 text-violet-300">
              <span className="font-mono font-bold">◌</span>
              <span>{t.reticleRef2010Legend}</span>
            </span>
          )}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center p-6 bg-[#07090E]/75 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="border border-slate-700 bg-[#0F141F]/95 rounded px-4 py-2.5 flex items-center gap-2.5 text-xs text-cyan-300 font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
            <span>{isLiveQuery ? t.queryingLiveIrsa : t.loadingData}</span>
          </div>
        </div>
      )}

      {/* Explicit Error or Empty State (Never a blank unexplained canvas) */}
      {!loading && provenance === 'error' && !emptyMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#07090E]/90">
          <div className="max-w-md border border-rose-800/70 bg-[#0F141F] rounded p-5 flex flex-col gap-3">
            <div className="text-sm font-semibold text-rose-300">
              ✖ {t.provenanceError}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {errorMessage || 'No se pudo obtener respuesta del servidor SPHEREx / IRSA.'}
            </p>
            <p className="text-[11px] text-slate-400">
              {lang === 'es'
                ? 'Por rigor científico, el modo simulado no se activa automáticamente ante un fallo real. Puedes reintentar la consulta o activar el interruptor de desarrollo.'
                : 'For scientific integrity, simulated data never replaces failed queries automatically. Retry the request or enable the dev simulator toggle explicitly.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.retryButton}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && provenance === 'error' && emptyMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#07090E]/90">
          <div className="max-w-md border border-slate-700 bg-[#0F141F] rounded p-5 flex flex-col gap-3">
            <div className="text-sm font-semibold text-slate-200">
              {t.emptyCollectionTitle} ({activeCollection})
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{emptyMessage}</p>
            {activeTarget && (
              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                {t.irsaCoverageLabel}:{' '}
                {formatIrsaCoverage(
                  activeTarget,
                  collectionsForTarget(activeTarget, activeCollection),
                  t
                )}
              </div>
            )}
            {fallbackCollection && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onSwitchCollection(fallbackCollection)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-semibold rounded transition-colors cursor-pointer"
                >
                  {t.tryAnotherCollectionButton}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && provenance !== 'error' && totalFramesCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#07090E]/90">
          <div className="max-w-md border border-slate-700 bg-[#0F141F] rounded p-5 flex flex-col gap-3">
            <div className="text-sm font-semibold text-slate-200">
              {t.emptyCollectionTitle} ({activeCollection})
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{t.emptyCollectionBody}</p>
            {activeTarget && (
              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                {t.irsaCoverageLabel}:{' '}
                {formatIrsaCoverage(
                  activeTarget,
                  collectionsForTarget(activeTarget, activeCollection),
                  t
                )}
              </div>
            )}
            {fallbackCollection && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onSwitchCollection(fallbackCollection)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-semibold rounded transition-colors cursor-pointer"
                >
                  {t.tryAnotherCollectionButton}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && provenance !== 'error' && totalFramesCount > 0 && !displayedFrame && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
          <div className="border border-slate-800 bg-[#0F141F]/95 rounded px-4 py-3 text-xs text-slate-300">
            {t.noDataTitle}
          </div>
        </div>
      )}
    </div>
  );
};
