import React, { useState } from 'react';
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
import {
  PixelEyeIcon,
  PixelLayersIcon,
  PixelPinIcon,
  PixelRotateCcwIcon,
  PixelZoomInIcon,
  PixelZoomOutIcon,
} from './PixelIcons';

const BAND_SWATCH_CLASSES: Record<number, string> = {
  1: 'bg-b1',
  2: 'bg-b2',
  3: 'bg-b3',
  4: 'bg-b4',
  5: 'bg-b5',
  6: 'bg-b6',
};

interface RightPanelProps {
  t: TranslationStrings;
  lang: Language;
  collection: string;
  onChangeCollection: (col: string) => void;
  activeTarget: TargetPreset | null;
  frames?: DecodedSpherexFrame[];
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
  frames = [],
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
}) => {
  const [activeTab, setActiveTab] = useState<'calibration' | 'spectrum' | 'assistant'>('calibration');

  const sliderMinBound = Math.min(-50, Math.floor(min - 20));
  const sliderMaxBound = Math.max(200, Math.ceil(max + 50));

  const diffBlocked = Boolean(deltaLambdaInfo?.exceedsHalfChannel && !allowUnsafeDiff);
  const availableCollections = collectionsForTarget(activeTarget, collection);
  const loadedFramesSummary = formatLoadedFramesByCollection(frames);

  return (
    <aside className="w-full lg:w-[300px] px-panel flex flex-col shrink-0 overflow-hidden">
      <div className="h-2 w-full px-dither border-b-2 border-line shrink-0" aria-hidden="true" />
      {/* Reserved Tabs: Calibración (Active) + Espectro (Capa 2) + Asistente (Capa 4) */}
      <div className="grid grid-cols-3 border-b-2 border-line bg-void text-[14px] shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('calibration')}
          className={`px-1 py-2 border-b-2 text-center leading-tight cursor-pointer focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-amber focus-visible:-outline-offset-2 ${
            activeTab === 'calibration'
              ? 'border-amber text-amber bg-panel-hi'
              : 'border-transparent text-dim hover:text-ink hover:bg-panel'
          }`}
        >
          {t.tabCalibration}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('spectrum')}
          title={t.futureLayerNote}
          className={`px-1 py-2 border-b-2 border-l-2 border-l-line text-center leading-tight cursor-pointer focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-amber focus-visible:-outline-offset-2 ${
            activeTab === 'spectrum'
              ? 'border-b-amber text-amber bg-panel-hi'
              : 'border-b-transparent text-dim hover:text-ink hover:bg-panel'
          }`}
        >
          {t.tabSpectrumFuture}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assistant')}
          title={t.futureLayerNote}
          className={`px-1 py-2 border-b-2 border-l-2 border-l-line text-center leading-tight cursor-pointer focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-amber focus-visible:-outline-offset-2 ${
            activeTab === 'assistant'
              ? 'border-b-amber text-amber bg-panel-hi'
              : 'border-b-transparent text-dim hover:text-ink hover:bg-panel'
          }`}
        >
          {t.tabAssistantFuture}
        </button>
      </div>

      {activeTab !== 'calibration' ? (
        <div className="p-5 flex flex-col gap-2 text-[14px] text-dim">
          <div className="font-pixel text-[9px] text-ink">
            {activeTab === 'spectrum' ? t.tabSpectrumFuture : t.tabAssistantFuture}
          </div>
          <p className="leading-snug">{t.futureLayerNote}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4 text-[14px]">
          {/* IRSA Collection Selector & Verified Coverage */}
          <section className="flex flex-col gap-2 border-b-2 border-line pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-pixel text-[8px] text-ink">{t.collectionLabel}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {availableCollections.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => onChangeCollection(col)}
                    className={`px-btn px-btn-vt px-2 py-0.5 ${
                      collection === col ? 'px-btn-active' : ''
                    }`}
                  >
                    {col === 'spherex_both' ? t.collectionBoth : col}
                  </button>
                ))}
              </div>
            </div>
            {activeTarget && (
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[14px] font-mono tabular-nums text-dim bg-void px-notch-sm px-2.5 py-1">
                <span>{t.irsaCoverageLabel}</span>
                <span className="text-ink">
                  {formatIrsaCoverage(activeTarget, availableCollections, t)}
                </span>
              </div>
            )}
            {loadedFramesSummary && (
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[14px] font-mono tabular-nums text-dim bg-void px-notch-sm px-2.5 py-1">
                <span>{t.framesLoadedLabel}:</span>{' '}
                <span className="text-ink">{loadedFramesSummary}</span>
              </div>
            )}
          </section>

          {/* Shared Per-Band asinh Contrast */}
          <section className="flex flex-col gap-2.5 border-b-2 border-line pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 font-pixel text-[8px] text-ink">
                {band >= 1 && band <= 6 && (
                  <span
                    className={`w-[10px] h-[10px] inline-block shrink-0 border border-void ${BAND_SWATCH_CLASSES[band]}`}
                    aria-hidden="true"
                  />
                )}
                <span>
                  <span>{t.contrastPerBand}</span> ({band === 0 ? t.allBands : `B${band}`})
                </span>
              </span>
              <button
                type="button"
                onClick={onAutoContrast}
                className="px-btn px-2 py-1 shrink-0"
              >
                Auto
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[14px] text-dim">
                <span>{t.blackPoint}</span>
                <span className="font-mono tabular-nums text-ink">
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
                className="px-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[14px] text-dim">
                <span>{t.whitePoint}</span>
                <span className="font-mono tabular-nums text-ink">
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
                className="px-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[14px] text-dim">
                <span>{t.softeningAsinh}</span>
                <span className="font-mono tabular-nums text-ink">
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
                className="px-slider w-full"
              />
            </div>
          </section>

          {/* Scientific Colormap + Zoom */}
          <section className="flex flex-col gap-2.5 border-b-2 border-line pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="cmap-select" className="font-pixel text-[8px] text-ink">
                {t.paletteLabel}
              </label>
              <select
                id="cmap-select"
                value={colormap}
                onChange={(e) => onColormapChange(e.target.value as ColormapName)}
                className="px-select px-2 py-0.5"
              >
                {COLORMAPS.map((cm) => (
                  <option key={cm.id} value={cm.id}>
                    {lang === 'es' ? cm.labelEs : cm.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="h-2.5 w-full border-2 border-line"
              style={{ background: getColormapPreviewGradient(colormap) }}
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-ink">{t.zoomPanLabel}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.max(0.5, Number((zoom / 1.25).toFixed(2))))}
                  aria-label={t.zoomOutLabel}
                  className="px-btn p-1.5"
                >
                  <PixelZoomOutIcon className="w-4 h-4" />
                </button>
                <span className="font-mono tabular-nums text-[14px] px-1 text-ink">
                  {zoom.toFixed(1)}x
                </span>
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.min(8, Number((zoom * 1.25).toFixed(2))))}
                  aria-label={t.zoomInLabel}
                  className="px-btn p-1.5"
                >
                  <PixelZoomInIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onResetView}
                  title={t.resetView}
                  className="px-btn px-2 py-1"
                >
                  <PixelRotateCcwIcon className="w-4 h-4" />
                  <span>{t.resetView}</span>
                </button>
              </div>
            </div>
          </section>

          {/* Overlays */}
          <section className="flex flex-col gap-2 border-b-2 border-line pb-3.5">
            <div className="flex items-center gap-2 font-pixel text-[8px] text-ink">
              <PixelLayersIcon className="w-4 h-4 text-amber" />
              <span>{t.overlaysLabel}</span>
            </div>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-ink">
              <span>{t.toggleFlags}</span>
              <input
                type="checkbox"
                checked={showFlags}
                onChange={onToggleFlags}
                className="px-check"
              />
            </label>

            {showFlags && (
              <div className="flex flex-col gap-1 text-[14px] pl-1 pb-1">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-bad font-mono">■ OVERFLOW/NONLINEAR</span>
                  <span className="text-warn font-mono">□ PERSIST</span>
                  <span className="text-ink/60 font-mono">× NONFUNC/BAD</span>
                </div>
                <div className="text-[14px] text-dim leading-snug">
                  <div>{t.transientFlagHelp}</div>
                  <div>{t.infoFlagsOverlayNote}</div>
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 cursor-pointer text-ink">
              <span>{t.toggleCatalog}</span>
              <input
                type="checkbox"
                checked={showCatalog}
                onChange={onToggleCatalog}
                className="px-check"
              />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-ink">
              <span>{t.toggleReticles}</span>
              <input
                type="checkbox"
                checked={showReticles}
                onChange={onToggleReticles}
                className="px-check"
              />
            </label>
          </section>

          {/* A/B Blink & Difference with Δλ Guard */}
          <section className="flex flex-col gap-2 border-b-2 border-line pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-pixel text-[8px] text-ink">{t.compareSection}</span>
              <button
                type="button"
                onClick={onPinRefFrame}
                className="px-btn px-btn-vt px-2 py-0.5"
              >
                <PixelPinIcon className="w-4 h-4" />
                <span>{t.pinRefEpoch}</span>
              </button>
            </div>

            {refFrame ? (
              <div className="text-[14px] font-mono tabular-nums text-ink bg-void px-notch-sm px-2.5 py-1 flex items-center gap-2 flex-wrap">
                {refFrame.band >= 1 && refFrame.band <= 6 && (
                  <span
                    className={`w-[10px] h-[10px] inline-block shrink-0 border border-void ${BAND_SWATCH_CLASSES[refFrame.band]}`}
                    aria-hidden="true"
                  />
                )}
                <span>
                  {t.refEpochPinned} {refFrame.id} · B{refFrame.band} · λ={refFrame.wave_um.center.toFixed(3)} µm
                </span>
              </div>
            ) : (
              <div className="text-[14px] text-dim">{t.noRefPinned}</div>
            )}

            <div className="grid grid-cols-3 gap-1.5 bg-void p-1.5 border-2 border-line">
              <button
                type="button"
                onClick={() => onCompareModeChange('single')}
                className={`px-btn px-btn-vt py-1 ${
                  compareMode === 'single' ? 'px-btn-active' : ''
                }`}
              >
                {t.modeSingle}
              </button>
              <button
                type="button"
                disabled={!refFrame}
                onClick={() => onCompareModeChange('blink')}
                className={`px-btn px-btn-vt py-1 ${
                  compareMode === 'blink' ? 'px-btn-active' : ''
                }`}
              >
                {t.modeBlink}
              </button>
              <button
                type="button"
                disabled={!refFrame || diffBlocked}
                onClick={() => onCompareModeChange('diff')}
                className={`px-btn px-btn-vt py-1 ${
                  compareMode === 'diff' ? 'px-btn-active' : ''
                }`}
              >
                {t.modeDiff}
              </button>
            </div>

            {refFrame && deltaLambdaInfo && (
              <div className="flex flex-col gap-1.5 text-[14px] font-mono tabular-nums">
                <div className="flex justify-between text-ink">
                  <span>{t.deltaLambdaLabel}:</span>
                  <span
                    className={
                      deltaLambdaInfo.exceedsHalfChannel ? 'text-warn font-semibold' : 'text-ok'
                    }
                  >
                    {deltaLambdaInfo.deltaUm.toFixed(4)} µm
                  </span>
                </div>
                <div className="flex justify-between text-dim">
                  <span>{t.halfChannelLabel}:</span>
                  <span>{deltaLambdaInfo.halfChannelWidthUm.toFixed(4)} µm</span>
                </div>
                {deltaLambdaInfo.exceedsHalfChannel && (
                  <div className="bg-panel-hi border-2 border-warn p-2 text-warn font-sans leading-snug flex flex-col gap-1.5">
                    <span>▲ {t.deltaLambdaBlocked}</span>
                    <label className="inline-flex items-center gap-2 text-[14px] text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowUnsafeDiff}
                        onChange={onToggleAllowUnsafeDiff}
                        className="px-check"
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
            <div className="flex items-center gap-2 font-pixel text-[8px] text-ink">
              <PixelEyeIcon className="w-4 h-4 text-amber" />
              <span>{t.pixelInspectorTitle}</span>
            </div>

            {!hoveredPixel ? (
              <p className="text-[14px] text-dim leading-snug">{t.hoverPrompt}</p>
            ) : (
              <div className="bg-void px-notch-sm p-2.5 flex flex-col gap-1.5 font-mono tabular-nums text-[14px]">
                <div className="flex justify-between">
                  <span className="text-dim">{t.pixelCoordLabel}</span>
                  <span className="text-ink">
                    ({hoveredPixel.x}, {hoveredPixel.y})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">{t.fluxLabel}</span>
                  <span className="text-amber font-semibold">
                    {Number.isFinite(hoveredPixel.flux)
                      ? `${hoveredPixel.flux.toFixed(4)} MJy/sr`
                      : 'NaN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">{t.linearWcsApprox}</span>
                  <span className="text-ink">
                    {hoveredPixel.ra.toFixed(5)}°, {hoveredPixel.dec >= 0 ? '+' : ''}
                    {hoveredPixel.dec.toFixed(5)}°
                  </span>
                </div>

                <div className="pt-1.5 border-t-2 border-line font-sans">
                  <div className="text-dim mb-1">{t.activeFlagsPixel}</div>
                  {hoveredPixel.flags.length === 0 ? (
                    <span className="text-dim">{t.noFlagsPixel}</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {hoveredPixel.flags.map((fl) => {
                        const cls =
                          fl.category === 'saturation'
                            ? 'text-bad border-bad bg-panel'
                            : fl.category === 'persistence'
                            ? 'text-warn border-warn bg-panel'
                            : fl.category === 'bad'
                            ? 'text-ink/80 border-dim bg-panel'
                            : 'text-b1 border-b1 bg-panel';
                        return (
                          <span
                            key={fl.name}
                            className={`px-chip ${cls}`}
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
