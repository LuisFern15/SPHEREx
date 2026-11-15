import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { PixelRefreshIcon } from './PixelIcons';

const PALETTE = {
  void: '#0a0814',
  ink: '#e8e6ff',
  ink60: 'rgba(232, 230, 255, 0.6)',
  amber: '#ffb000',
  dim: '#9a95d0',
  b1: '#7aa2ff',
  bad: '#ff4d6d',
  badFill: 'rgba(255, 77, 109, 0.22)',
  warn: '#ffd23f',
  warnFill: 'rgba(255, 210, 63, 0.18)',
} as const;

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
  const zoomRef = useRef(zoom);
  const onZoomChangeRef = useRef(onZoomChange);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = Math.max(0.5, Math.min(8, Number((zoomRef.current * factor).toFixed(2))));
      zoomRef.current = next;
      onZoomChangeRef.current(next);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
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
        ctx.fillStyle = PALETTE.void;
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

    for (const src of catalogSources) {
      const px = skyToPixelLinear(src.ra, src.dec, displayedFrame.wcs);
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

  const releasePointerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      try {
        if (
          typeof e.currentTarget.hasPointerCapture !== 'function' ||
          e.currentTarget.hasPointerCapture(e.pointerId)
        ) {
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }
      } catch {
        // ignore if pointer capture was already released
      }
    }
    setDragging(false);
    dragStartRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Con la captura del puntero el "click" se reencamina al contenedor: los botones de las capas
        // (p. ej. "Probar otra colección") dejarían de funcionar. No se arrastra desde controles.
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // ignore if pointer capture is unavailable
        }
        setDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      }}
      onPointerUp={releasePointerDrag}
      onPointerCancel={releasePointerDrag}
      onLostPointerCapture={() => {
        setDragging(false);
        dragStartRef.current = null;
      }}
      onPointerLeave={() => {
        if (!dragStartRef.current) {
          onHoverPixel(null);
        }
      }}
      onPointerMove={handlePointerMove}
      className={`relative flex-1 min-h-[340px] lg:min-h-0 bg-void border-4 border-line shadow-[4px_4px_0_#000000] overflow-hidden select-none ${
        dragging ? 'cursor-grabbing' : 'cursor-crosshair'
      }`}
    >
      {/* Esquinas decorativas atornilladas y retícula de tramado en el marco */}
      <span className="pointer-events-none absolute top-1 left-1 w-[6px] h-[6px] bg-amber-lo z-20" aria-hidden="true" />
      <span className="pointer-events-none absolute top-1 right-1 w-[6px] h-[6px] bg-amber-lo z-20" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-1 left-1 w-[6px] h-[6px] bg-amber-lo z-20" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-1 right-1 w-[6px] h-[6px] bg-amber-lo z-20" aria-hidden="true" />

      <span className="pointer-events-none absolute top-0 left-0 w-5 h-5 px-dither opacity-35 z-10" aria-hidden="true" />
      <span className="pointer-events-none absolute top-0 right-0 w-5 h-5 px-dither opacity-35 z-10" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-0 left-0 w-5 h-5 px-dither opacity-35 z-10" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-0 right-0 w-5 h-5 px-dither opacity-35 z-10" aria-hidden="true" />

      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Synchronized SVG Overlay */}
      {displayedFrame && transform && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          width={canvasDims.width}
          height={canvasDims.height}
          shapeRendering="crispEdges"
        >
          {/* Quality Flags Layer */}
          {flagOverlayCells.map((cell) => {
            const x = Math.round(cell.sx);
            const y = Math.round(cell.sy);
            const sizePx = Math.max(2, Math.round(cell.size));
            if (cell.kind === 'saturation') {
              return (
                <g key={cell.key}>
                  <rect
                    x={x}
                    y={y}
                    width={sizePx}
                    height={sizePx}
                    fill={PALETTE.badFill}
                    stroke={PALETTE.bad}
                    strokeWidth={2}
                  />
                </g>
              );
            }
            if (cell.kind === 'persistence') {
              return (
                <rect
                  key={cell.key}
                  x={x}
                  y={y}
                  width={sizePx}
                  height={sizePx}
                  fill={PALETTE.warnFill}
                  stroke={PALETTE.warn}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
              );
            }
            return (
              <g key={cell.key} stroke={PALETTE.ink60} strokeWidth={2}>
                <line x1={x + 2} y1={y + 2} x2={x + sizePx - 2} y2={y + sizePx - 2} />
                <line x1={x + sizePx - 2} y1={y + 2} x2={x + 2} y2={y + sizePx - 2} />
              </g>
            );
          })}

          {/* Reference Catalog Layer (cat=1) */}
          {catalogPoints.map((pt) => {
            const sx = Math.round(pt.sx);
            const sy = Math.round(pt.sy);
            const r = Math.max(5, Math.round(transform.pixelSize * 0.65));
            const color = pt.kind === 'reference' ? PALETTE.dim : PALETTE.b1;
            return (
              <g key={pt.id}>
                {/* Círculo como antes: un aspa se confundiría con la marca de píxel defectuoso. */}
                <circle
                  cx={sx}
                  cy={sy}
                  r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={pt.kind === 'reference' ? '4 2' : undefined}
                />

                <text
                  x={sx + r + 4}
                  y={sy - 4}
                  fill={color}
                  fontSize={14}
                  fontFamily="VT323, ui-monospace, monospace"
                >
                  {pt.label}
                </text>
              </g>
            );
          })}

          {/* Fixed Query Reticle (query_xy) + Predicted Epoch Position (predicted_xy) */}
          {showReticles && reticles && (
            <>
              {reticles.queryScreen && (
                <g stroke={PALETTE.ink} strokeWidth={2}>
                  <line
                    x1={Math.round(reticles.queryScreen.x) - 16}
                    y1={Math.round(reticles.queryScreen.y)}
                    x2={Math.round(reticles.queryScreen.x) - 6}
                    y2={Math.round(reticles.queryScreen.y)}
                  />
                  <line
                    x1={Math.round(reticles.queryScreen.x) + 6}
                    y1={Math.round(reticles.queryScreen.y)}
                    x2={Math.round(reticles.queryScreen.x) + 16}
                    y2={Math.round(reticles.queryScreen.y)}
                  />
                  <line
                    x1={Math.round(reticles.queryScreen.x)}
                    y1={Math.round(reticles.queryScreen.y) - 16}
                    x2={Math.round(reticles.queryScreen.x)}
                    y2={Math.round(reticles.queryScreen.y) - 6}
                  />
                  <line
                    x1={Math.round(reticles.queryScreen.x)}
                    y1={Math.round(reticles.queryScreen.y) + 6}
                    x2={Math.round(reticles.queryScreen.x)}
                    y2={Math.round(reticles.queryScreen.y) + 16}
                  />
                </g>
              )}

              {reticles.predictedScreen && !reticles.predictedOutOfBounds && (
                <g>
                  <polygon
                    points={`${Math.round(reticles.predictedScreen.x)},${Math.round(reticles.predictedScreen.y) - 9} ${
                      Math.round(reticles.predictedScreen.x) + 9
                    },${Math.round(reticles.predictedScreen.y)} ${Math.round(reticles.predictedScreen.x)},${
                      Math.round(reticles.predictedScreen.y) + 9
                    } ${Math.round(reticles.predictedScreen.x) - 9},${Math.round(reticles.predictedScreen.y)}`}
                    fill="none"
                    stroke={PALETTE.amber}
                    strokeWidth={2}
                  />
                </g>
              )}

              {reticles.predictedOutOfBounds && reticles.outArrow && (
                <g
                  transform={`translate(${Math.round(reticles.outArrow.x)}, ${Math.round(reticles.outArrow.y)}) rotate(${Math.round(reticles.outArrow.angleDeg)})`}
                >
                  <polygon
                    points="8,0 -6,-6 -3,0 -6,6"
                    fill={PALETTE.amber}
                    stroke={PALETTE.void}
                    strokeWidth={2}
                  />
                </g>
              )}

              {/* WISE 0855 uncentered 2010.34 reference marker */}
              {reticles.ref2010Screen && activeTarget?.referencePosition && (
                <g>
                  <circle
                    cx={Math.round(reticles.ref2010Screen.x)}
                    cy={Math.round(reticles.ref2010Screen.y)}
                    r={7}
                    fill="none"
                    stroke={PALETTE.dim}
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                  <text
                    x={Math.round(reticles.ref2010Screen.x) + 10}
                    y={Math.round(reticles.ref2010Screen.y) + 4}
                    fill={PALETTE.dim}
                    fontSize={14}
                    fontFamily="VT323, ui-monospace, monospace"
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
      <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-0.5 text-[14px] font-mono tabular-nums bg-panel/95 px-notch-sm px-2.5 py-1 shadow-[2px_2px_0_#000000]">
        <div className="text-ink flex items-center gap-2">
          <span>
            FOV {Math.round(sizeArcsec)}&Prime; · {pixelScaleArcsec.toFixed(2)}&Prime;/px
          </span>
          <span className="text-dim">·</span>
          <span>{zoom.toFixed(2)}x</span>
        </div>
        {compareMode !== 'single' && (
          <div className="text-amber">
            {compareMode === 'blink'
              ? `${t.modeBlink}: ${blinkShowRef ? t.blinkRefLabel : t.blinkCurrentLabel}`
              : `${t.modeDiff}${isDifference ? '' : t.diffBlockedTag}`}
          </div>
        )}
      </div>

      {/* Bottom-Left HUD: Reticle Legend */}
      {showReticles && displayedFrame && (
        <div className="absolute bottom-3 left-3 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] bg-panel/95 px-notch-sm px-2.5 py-1 shadow-[2px_2px_0_#000000]">
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span className="font-mono font-bold">+</span>
            <span>{t.reticleFixedLegend}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber">
            <span className="font-mono font-bold">◇</span>
            <span>{t.reticlePredictedLegend}</span>
          </span>
          {activeTarget?.referencePosition && (
            <span className="inline-flex items-center gap-1.5 text-dim">
              <span className="font-mono font-bold">◌</span>
              <span>{t.reticleRef2010Legend}</span>
            </span>
          )}
        </div>
      )}

      {/* Loading Overlay (keeps previous frames dimmed underneath) */}
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center px-dither-overlay z-10"
          role="status"
          aria-live="polite"
        >
          <div className="drop-shadow-[4px_4px_0_#000000]">
            <div className="bg-panel px-notch flex flex-col">
              <div className="h-2 w-full px-dither border-b-2 border-line" aria-hidden="true" />
              <div className="inline-flex items-center gap-3 px-4 py-2.5 text-[15px] font-mono text-amber">
                <div className="border-2 border-line bg-void p-1 shrink-0" aria-hidden="true">
                  <div className="px-loading-track">
                    <div className="px-loading-fill" />
                  </div>
                  <div className="px-loading-reduced">
                    <span className="w-2 h-3 bg-amber inline-block" />
                    <span className="w-2 h-3 bg-amber inline-block" />
                    <span className="w-2 h-3 bg-amber inline-block" />
                  </div>
                </div>
                <span>{t.loadingData}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Error or Empty State (Never a blank unexplained canvas) */}
      {!loading && provenance === 'error' && !emptyMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-void/90 z-10">
          <div className="max-w-md border-2 border-dashed border-bad bg-panel shadow-[4px_4px_0_#000000] flex flex-col">
            <div className="h-2 w-full px-dither border-b-2 border-line" aria-hidden="true" />
            <div className="p-5 flex flex-col gap-3">
              <div className="font-pixel text-[9px] text-bad">
                ✖ {t.provenanceError}
              </div>
              <p className="text-[14px] text-ink leading-snug">
                {errorMessage || t.defaultErrorMessage}
              </p>
              <p className="text-[14px] text-dim leading-snug">{t.errorSimHint}</p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-btn bg-bad text-void border-bad px-3 py-1.5"
                >
                  <PixelRefreshIcon className="w-4 h-4" />
                  <span>{t.retryButton}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && provenance === 'error' && emptyMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-void/90 z-10">
          <div className="max-w-md border-2 border-dashed border-warn bg-panel shadow-[4px_4px_0_#000000] flex flex-col">
            <div className="h-2 w-full px-dither border-b-2 border-line" aria-hidden="true" />
            <div className="p-5 flex flex-col gap-3">
              <div className="font-pixel text-[9px] text-warn">
                {t.emptyCollectionTitle} ({activeCollection})
              </div>
              <p className="text-[14px] text-ink leading-snug">{emptyMessage}</p>
              {activeTarget && (
                <div className="text-[14px] font-mono tabular-nums text-dim">
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
                    className="px-btn px-btn-active px-3 py-1.5"
                  >
                    {t.tryAnotherCollectionButton}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && provenance !== 'error' && totalFramesCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-void/90 z-10">
          <div className="max-w-md border-2 border-dashed border-warn bg-panel shadow-[4px_4px_0_#000000] flex flex-col">
            <div className="h-2 w-full px-dither border-b-2 border-line" aria-hidden="true" />
            <div className="p-5 flex flex-col gap-3">
              <div className="font-pixel text-[9px] text-warn">
                ▲ {t.emptyCollectionTitle} ({activeCollection})
              </div>
              <p className="text-[14px] text-ink leading-snug">{t.emptyCollectionBody}</p>
              {activeTarget && (
                <div className="text-[14px] font-mono tabular-nums text-dim">
                  {t.irsaCoverageLabel}:{' '}
                  {formatIrsaCoverage(
                    activeTarget,
                    collectionsForTarget(activeTarget, activeCollection),
                    t
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onSwitchCollection(
                      activeCollection === 'spherex_qr3' ? 'spherex_dr1' : 'spherex_qr3'
                    )
                  }
                  className="px-btn px-btn-active px-3 py-1.5"
                >
                  {t.switchCollectionButton}{' '}
                  {activeCollection === 'spherex_qr3' ? 'spherex_dr1' : 'spherex_qr3'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && provenance !== 'error' && totalFramesCount > 0 && !displayedFrame && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none z-10">
          <div className="border-2 border-dashed border-warn bg-panel px-4 py-3 text-[14px] text-warn shadow-[4px_4px_0_#000000]">
            {t.noDataTitle}
          </div>
        </div>
      )}
    </div>
  );
};
