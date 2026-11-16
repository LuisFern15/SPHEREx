import React, { useRef, useState } from 'react';
import { Eye, Layers, Pin, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  collectionsForTarget,
  formatIrsaCoverage,
  formatLoadedFramesByCollection,
} from '../data/targets';
import { TranslationStrings } from '../i18n/translations';
import { getColormapPreviewGradient } from '../rendering/colormaps';
import {
  ColormapName,
  CompareMode,
  DecodedSpherexFrame,
  Language,
  TargetPreset,
} from '../types/spherex';
import { HoveredPixelInfo } from './CutoutViewport';
import { LightCurvePanel } from './LightCurvePanel';
import { SkyMapPanel } from './SkyMapPanel';

interface RightPanelProps {
  t: TranslationStrings;
  lang: Language;
  collection: string;
  onChangeCollection: (col: string) => void;
  activeTarget: TargetPreset | null;
  band: number;
  min: number;
  max: number;
  softening: number;
  onMinChange: (val: number) => void;
  onMaxChange: (val: number) => void;
  onSofteningChange: (val: number) => void;
  onAutoContrast: () => void;
  colormap: ColormapName;
  onColormapChange: (cm: ColormapName) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  onResetView: () => void;
  showFlags: boolean;
  onToggleFlags: () => void;
  showCatalog: boolean;
  onToggleCatalog: () => void;
  showReticles: boolean;
  onToggleReticles: () => void;
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
  refFrame: DecodedSpherexFrame | null;
  onPinRefFrame: () => void;
  deltaLambdaInfo: {
    deltaUm: number;
    halfChannelWidthUm: number;
    exceedsHalfChannel: boolean;
  } | null;
  allowUnsafeDiff: boolean;
  onToggleAllowUnsafeDiff: () => void;
  hoveredPixel: HoveredPixelInfo | null;
  selectedFrameId?: string | null;
  onSelectFrameId?: (frameId: string) => void;
  ra: number;
  dec: number;
  sizeArcsec: number;
  frames: readonly { collection?: string }[];
}

const COLORMAPS: { id: ColormapName; labelEs: string; labelEn: string }[] = [
  { id: 'grayscale', labelEs: 'Gris lineal', labelEn: 'Grayscale' },
  { id: 'grayscale_inv', labelEs: 'Gris invertido', labelEn: 'Inverted Gray' },
  { id: 'inferno', labelEs: 'Inferno', labelEn: 'Inferno' },
  { id: 'viridis', labelEs: 'Viridis', labelEn: 'Viridis' },
  { id: 'cividis', labelEs: 'Cividis', labelEn: 'Cividis' },
];

export const RightPanel: React.FC<RightPanelProps> = ({
  t,
  lang,
  collection,
  onChangeCollection,
  activeTarget,
  band,
  min,
  max,
  softening,
  onMinChange,
  onMaxChange,
  onSofteningChange,
  onAutoContrast,
  colormap,
  onColormapChange,
  zoom,
  onZoomChange,
  onResetView,
  showFlags,
  onToggleFlags,
  showCatalog,
  onToggleCatalog,
  showReticles,
  onToggleReticles,
  compareMode,
  onCompareModeChange,
  refFrame,
  onPinRefFrame,
  deltaLambdaInfo,
  allowUnsafeDiff,
  onToggleAllowUnsafeDiff,
  hoveredPixel,
  selectedFrameId,
  onSelectFrameId,
  ra,
  dec,
  sizeArcsec,
  frames,
}) => {
  const [activeTab, setActiveTab] = useState<'calibration' | 'spectrum' | 'assistant'>('calibration');

  // Stable slider bounds: they only widen when the value leaves the current range,
  // so the thumb can reach the end instead of the track growing on every change.
  const sliderMinBoundRef = useRef(-50);
  const sliderMaxBoundRef = useRef(200);
  if (min < sliderMinBoundRef.current) sliderMinBoundRef.current = Math.floor(min - 20);
  if (max > sliderMaxBoundRef.current) sliderMaxBoundRef.current = Math.ceil(max + 50);
  const sliderMinBound = sliderMinBoundRef.current;
  const sliderMaxBound = sliderMaxBoundRef.current;

  const diffBlocked = Boolean(deltaLambdaInfo?.exceedsHalfChannel && !allowUnsafeDiff);
  const availableCollections = collectionsForTarget(activeTarget, collection);
  const loadedFramesSummary = formatLoadedFramesByCollection(frames);
  const targetName = activeTarget
    ? lang === 'es'
      ? activeTarget.nameEs
      : activeTarget.nameEn
    : null;

  return (
    <aside className="w-full lg:w-[340px] bg-[#121212] border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col shrink-0 overflow-hidden">
      {/* Tabs: Calibración + Espectro (Capa 2) + Asistente (Capa 4) */}
      <div className="grid grid-cols-3 border-b border-slate-800 bg-[#0A0A0A] text-[11px] shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('calibration')}
          className={`px-2 py-2.5 font-medium border-b-2 transition-colors truncate cursor-pointer ${
            activeTab === 'calibration'
              ? 'border-cyan-500 text-cyan-200 bg-[#1A1A1A]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {t.tabCalibration}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('spectrum')}
          className={`px-2 py-2.5 font-medium border-b-2 transition-colors truncate cursor-pointer ${
            activeTab === 'spectrum'
              ? 'border-cyan-500 text-cyan-200 bg-[#1A1A1A]'
              : 'border-transparent text-slate-300 hover:text-white'
          }`}
        >
          {t.tabSpectrumFuture}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assistant')}
          title={t.futureLayerNote}
          className={`px-2 py-2.5 font-medium border-b-2 transition-colors truncate cursor-pointer ${
            activeTab === 'assistant'
              ? 'border-slate-500 text-slate-200 bg-[#1A1A1A]'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          {t.tabAssistantFuture}
        </button>
      </div>

      {activeTab === 'spectrum' ? (
        <div className="flex-1 overflow-y-auto p-3.5">
          <LightCurvePanel
            targetId={activeTarget?.id ?? null}
            targetName={
              activeTarget ? (lang === 'es' ? activeTarget.nameEs : activeTarget.nameEn) : undefined
            }
            collection={collection}
            activeBand={band}
            selectedFrameId={selectedFrameId}
            onSelectFrameId={onSelectFrameId}
            lang={lang}
          />
        </div>
      ) : activeTab === 'assistant' ? (
        <div className="p-5 flex flex-col gap-2 text-xs text-slate-400">
          <div className="font-semibold text-slate-200">{t.tabAssistantFuture}</div>
          <p className="leading-relaxed">{t.futureLayerNote}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4 text-xs">
          <SkyMapPanel t={t} ra={ra} dec={dec} targetName={targetName} sizeArcsec={sizeArcsec} />

          {/* IRSA Collection Selector & Verified Coverage */}
          <section className="flex flex-col gap-2 border-b border-slate-800/80 pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">{t.collectionLabel}</span>
              <div className="flex flex-wrap items-center gap-1 bg-[#0A0A0A] p-0.5 rounded border border-slate-800">
                {availableCollections.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => onChangeCollection(col)}
                    className={`px-2 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer ${
                      collection === col
                        ? 'bg-cyan-600 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {col === 'spherex_both' ? t.collectionBoth : col}
                  </button>
                ))}
              </div>
            </div>
            {activeTarget && (
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400 bg-[#0A0A0A] border border-slate-800/80 rounded px-2.5 py-1">
                <span>{t.irsaCoverageLabel}</span>
                <span className="text-slate-200">
                  {formatIrsaCoverage(activeTarget, availableCollections, t)}
                </span>
              </div>
            )}
            {loadedFramesSummary && (
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400 bg-[#0A0A0A] border border-slate-800/80 rounded px-2.5 py-1">
                <span>{t.framesLoadedLabel}</span>
                <span className="text-slate-200">{loadedFramesSummary}</span>
              </div>
            )}
          </section>

          {/* Shared Per-Band asinh Contrast */}
          <section className="flex flex-col gap-2.5 border-b border-slate-800/80 pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">
                {t.contrastPerBand} ({band === 0 ? t.allBands : `B${band}`})
              </span>
              <button
                type="button"
                onClick={onAutoContrast}
                className="px-2 py-0.5 rounded border border-slate-700 bg-[#0A0A0A] text-[11px] text-cyan-300 hover:border-cyan-500 transition-colors cursor-pointer"
              >
                {t.autoContrast}
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>{t.blackPoint}</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {min.toFixed(2)} MJy/sr
                </span>
              </div>
              <input
                type="range"
                min={sliderMinBound}
                max={max - 0.1}
                step={0.25}
                value={min}
                onChange={(e) => onMinChange(parseFloat(e.target.value))}
                className="sci-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>{t.whitePoint}</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {max.toFixed(2)} MJy/sr
                </span>
              </div>
              <input
                type="range"
                min={min + 0.1}
                max={sliderMaxBound}
                step={0.5}
                value={max}
                onChange={(e) => onMaxChange(parseFloat(e.target.value))}
                className="sci-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>{t.softeningAsinh}</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {softening.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={25}
                step={0.1}
                value={softening}
                onChange={(e) => onSofteningChange(parseFloat(e.target.value))}
                className="sci-slider w-full"
              />
            </div>
          </section>

          {/* Scientific Colormap + Zoom */}
          <section className="flex flex-col gap-2.5 border-b border-slate-800/80 pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="cmap-select" className="font-semibold text-slate-200">
                {t.paletteLabel}
              </label>
              <select
                id="cmap-select"
                value={colormap}
                onChange={(e) => onColormapChange(e.target.value as ColormapName)}
                className="bg-[#0A0A0A] border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500"
              >
                {COLORMAPS.map((cm) => (
                  <option key={cm.id} value={cm.id}>
                    {lang === 'es' ? cm.labelEs : cm.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="h-2 w-full rounded-sm border border-slate-700"
              style={{ background: getColormapPreviewGradient(colormap) }}
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-300 font-medium">{t.zoomPanLabel}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.max(0.5, Number((zoom / 1.25).toFixed(2))))}
                  aria-label={t.zoomOutLabel}
                  className="p-1.5 rounded border border-slate-700 bg-[#0A0A0A] text-slate-300 hover:border-cyan-500 cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="font-mono tabular-nums text-[11px] px-1.5 text-slate-200">
                  {zoom.toFixed(1)}x
                </span>
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.min(8, Number((zoom * 1.25).toFixed(2))))}
                  aria-label={t.zoomInLabel}
                  className="p-1.5 rounded border border-slate-700 bg-[#0A0A0A] text-slate-300 hover:border-cyan-500 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onResetView}
                  title={t.resetView}
                  className="px-2 py-1 rounded border border-slate-700 bg-[#0A0A0A] text-[11px] text-slate-300 hover:border-cyan-500 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>{t.resetView}</span>
                </button>
              </div>
            </div>
          </section>

          {/* Overlays */}
          <section className="flex flex-col gap-2 border-b border-slate-800/80 pb-3.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Layers className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>{t.overlaysLabel}</span>
            </div>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-300">
              <span>{t.toggleFlags}</span>
              <input
                type="checkbox"
                checked={showFlags}
                onChange={onToggleFlags}
                className="accent-cyan-500"
              />
            </label>

            {showFlags && (
              <div className="flex flex-col gap-1 text-[11px] pl-1 pb-1">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-rose-400 font-mono">■ OVERFLOW/NONLINEAR</span>
                  <span className="text-amber-400 font-mono">□ PERSIST</span>
                  <span className="text-fuchsia-400 font-mono">× NONFUNC/BAD</span>
                </div>
                <div className="text-[10px] text-slate-400 leading-snug">
                  <div>{t.transientFlagHelp}</div>
                  <div>{t.infoFlagsOverlayNote}</div>
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-300">
              <span>{t.toggleCatalog}</span>
              <input
                type="checkbox"
                checked={showCatalog}
                onChange={onToggleCatalog}
                className="accent-cyan-500"
              />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-300">
              <span>{t.toggleReticles}</span>
              <input
                type="checkbox"
                checked={showReticles}
                onChange={onToggleReticles}
                className="accent-cyan-500"
              />
            </label>
          </section>

          {/* A/B Blink & Difference with Δλ Guard */}
          <section className="flex flex-col gap-2 border-b border-slate-800/80 pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">{t.compareSection}</span>
              <button
                type="button"
                onClick={onPinRefFrame}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 bg-[#0A0A0A] text-[11px] text-cyan-300 hover:border-cyan-500 cursor-pointer"
              >
                <Pin className="w-3 h-3" aria-hidden="true" />
                <span>{t.pinRefEpoch}</span>
              </button>
            </div>

            {refFrame ? (
              <div className="text-[11px] font-mono tabular-nums text-slate-300 bg-[#0A0A0A] border border-slate-800 rounded px-2 py-1.5">
                {t.refEpochPinned} {refFrame.id} · B{refFrame.band} · λ={refFrame.wave_um.center.toFixed(3)} µm
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">{t.noRefPinned}</div>
            )}

            <div className="grid grid-cols-3 gap-1 bg-[#0A0A0A] p-1 rounded border border-slate-800">
              <button
                type="button"
                onClick={() => onCompareModeChange('single')}
                className={`py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  compareMode === 'single'
                    ? 'bg-cyan-600 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.modeSingle}
              </button>
              <button
                type="button"
                disabled={!refFrame}
                onClick={() => onCompareModeChange('blink')}
                className={`py-1 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  compareMode === 'blink'
                    ? 'bg-cyan-600 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.modeBlink}
              </button>
              <button
                type="button"
                disabled={!refFrame || diffBlocked}
                onClick={() => onCompareModeChange('diff')}
                className={`py-1 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  compareMode === 'diff'
                    ? 'bg-cyan-600 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.modeDiff}
              </button>
            </div>

            {refFrame && deltaLambdaInfo && (
              <div className="flex flex-col gap-1.5 text-[11px] font-mono tabular-nums">
                <div className="flex justify-between text-slate-300">
                  <span>{t.deltaLambdaLabel}:</span>
                  <span
                    className={
                      deltaLambdaInfo.exceedsHalfChannel ? 'text-amber-400 font-semibold' : 'text-emerald-400'
                    }
                  >
                    {deltaLambdaInfo.deltaUm.toFixed(4)} µm
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{t.halfChannelLabel}:</span>
                  <span>{deltaLambdaInfo.halfChannelWidthUm.toFixed(4)} µm</span>
                </div>
                {deltaLambdaInfo.exceedsHalfChannel && (
                  <div className="bg-amber-950/40 border border-amber-700/70 rounded p-2 text-amber-200 font-sans leading-snug flex flex-col gap-1.5">
                    <span>▲ {t.deltaLambdaBlocked}</span>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-amber-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowUnsafeDiff}
                        onChange={onToggleAllowUnsafeDiff}
                        className="accent-amber-500"
                      />
                      <span>{t.confirmUnsafeDiff}</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Hover Pixel Inspector */}
          <section className="flex flex-col gap-2 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Eye className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>{t.pixelInspectorTitle}</span>
            </div>

            {!hoveredPixel ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">{t.hoverPrompt}</p>
            ) : (
              <div className="bg-[#0A0A0A] border border-slate-800 rounded p-2.5 flex flex-col gap-1.5 font-mono tabular-nums text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Pixel (x, y)</span>
                  <span className="text-slate-100">
                    ({hoveredPixel.x}, {hoveredPixel.y})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Flux</span>
                  <span className="text-cyan-300 font-semibold">
                    {Number.isFinite(hoveredPixel.flux)
                      ? `${hoveredPixel.flux.toFixed(4)} MJy/sr`
                      : 'NaN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t.linearWcsApprox}</span>
                  <span className="text-slate-200">
                    {hoveredPixel.ra.toFixed(5)}°, {hoveredPixel.dec >= 0 ? '+' : ''}
                    {hoveredPixel.dec.toFixed(5)}°
                  </span>
                </div>

                <div className="pt-1 border-t border-slate-800/80 font-sans">
                  <div className="text-slate-400 mb-1">{t.activeFlagsPixel}</div>
                  {hoveredPixel.flags.length === 0 ? (
                    <span className="text-slate-500">{t.noFlagsPixel}</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {hoveredPixel.flags.map((fl) => {
                        const cls =
                          fl.category === 'saturation'
                            ? 'text-rose-300 bg-rose-950/60 border-rose-700'
                            : fl.category === 'persistence'
                            ? 'text-amber-300 bg-amber-950/60 border-amber-700'
                            : fl.category === 'bad'
                            ? 'text-fuchsia-300 bg-fuchsia-950/50 border-fuchsia-700'
                            : 'text-cyan-300 bg-cyan-950/50 border-cyan-800';
                        return (
                          <span
                            key={fl.name}
                            className={`px-1.5 py-0.5 rounded border font-mono text-[10px] ${cls}`}
                          >
                            {fl.category === 'saturation' && `${t.saturationTag}: `}
                            {fl.category === 'persistence' && `${t.persistenceTag}: `}
                            {fl.name} (b{fl.bit})
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  );
};
