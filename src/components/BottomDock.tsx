import React from 'react';
import { SPHEREX_BANDS, collectionsForTarget, formatIrsaCoverage } from '../data/targets';
import { TranslationStrings } from '../i18n/translations';
import {
  DecodedSpherexFrame,
  EpochGroup,
  FlagBitsMap,
  Language,
  TargetPreset,
} from '../types/spherex';
import { summarizeFrameFlags } from '../utils/flags';
import {
  PixelChevronLeftIcon,
  PixelChevronRightIcon,
  PixelPauseIcon,
  PixelPlayIcon,
  PixelRepeatIcon,
} from './PixelIcons';

const BAND_SWATCH_CLASSES: Record<number, string> = {
  1: 'bg-b1',
  2: 'bg-b2',
  3: 'bg-b3',
  4: 'bg-b4',
  5: 'bg-b5',
  6: 'bg-b6',
};

const BAND_ACTIVE_CLASSES: Record<number, string> = {
  1: 'bg-b1 border-b1 text-void',
  2: 'bg-b2 border-b2 text-void',
  3: 'bg-b3 border-b3 text-void',
  4: 'bg-b4 border-b4 text-void',
  5: 'bg-b5 border-b5 text-void',
  6: 'bg-b6 border-b6 text-void',
};

const BAND_TEXT_CLASSES: Record<number, string> = {
  1: 'text-b1',
  2: 'text-b2',
  3: 'text-b3',
  4: 'text-b4',
  5: 'text-b5',
  6: 'text-b6',
};

interface BottomDockProps {
  t: TranslationStrings;
  lang: Language;
  band: number;
  onSelectBand: (band: number) => void;
  wavelengthSpreadWarning: boolean;
  coaddMode: boolean;
  onToggleCoaddMode: () => void;
  epochs: EpochGroup[];
  timelineFrames: DecodedSpherexFrame[];
  currentIndex: number;
  onSelectIndex: (idx: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  loop: boolean;
  onToggleLoop: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  currentFrame: DecodedSpherexFrame | null;
  flagBits: FlagBitsMap;
  usingDefaultFlagBits: boolean;
  predictedOutOfBounds: boolean;
  activeTarget: TargetPreset | null;
}

const SPEEDS = [200, 400, 800];

export const BottomDock: React.FC<BottomDockProps> = ({
  t,
  lang,
  band,
  onSelectBand,
  wavelengthSpreadWarning,
  coaddMode,
  onToggleCoaddMode,
  epochs,
  timelineFrames,
  currentIndex,
  onSelectIndex,
  playing,
  onTogglePlay,
  loop,
  onToggleLoop,
  speed,
  onSpeedChange,
  currentFrame,
  flagBits,
  usingDefaultFlagBits,
  predictedOutOfBounds,
  activeTarget,
}) => {
  const frameFlagsSummary = currentFrame
    ? summarizeFrameFlags(currentFrame.flagMask, flagBits)
    : [];

  const hasSat = frameFlagsSummary.some((f) => f.category === 'saturation');
  const hasPersist = frameFlagsSummary.some((f) => f.category === 'persistence');

  return (
    <footer className="px-panel flex flex-col shrink-0">
      <div className="h-2 w-full px-dither border-b-2 border-line shrink-0" aria-hidden="true" />
      <div className="px-3 sm:px-4 py-1.5 flex flex-col gap-1.5">
        {/* Row 1: Temporal Player + Epoch Grouping + Spectral Band Selector */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          {/* Player Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={timelineFrames.length <= 1}
                onClick={() =>
                  onSelectIndex(
                    (currentIndex - 1 + Math.max(1, timelineFrames.length)) %
                      Math.max(1, timelineFrames.length)
                  )
                }
                title={t.prev}
                aria-label={t.prev}
                className="px-btn p-1"
              >
                <PixelChevronLeftIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={timelineFrames.length <= 1}
                onClick={onTogglePlay}
                className="px-btn px-btn-active px-3 py-1"
              >
                {playing ? (
                  <PixelPauseIcon className="w-4 h-4" />
                ) : (
                  <PixelPlayIcon className="w-4 h-4" />
                )}
                <span>{playing ? t.pause : t.play}</span>
              </button>
              <button
                type="button"
                disabled={timelineFrames.length <= 1}
                onClick={() =>
                  onSelectIndex((currentIndex + 1) % Math.max(1, timelineFrames.length))
                }
                title={t.next}
                aria-label={t.next}
                className="px-btn p-1"
              >
                <PixelChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleLoop}
              className={`px-btn px-2.5 py-1.5 ${loop ? 'px-btn-active' : ''}`}
            >
              <PixelRepeatIcon className="w-4 h-4" />
              <span>{t.loop}</span>
            </button>

            <label className="inline-flex items-center gap-1.5 text-[14px] text-dim">
              <span>{t.speedLabel}</span>
              <select
                value={speed}
                onChange={(e) => onSpeedChange(Number(e.target.value))}
                className="px-select px-2 py-0.5 tabular-nums"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s} ms
                  </option>
                ))}
              </select>
            </label>

            {/* Epoch Co-add vs Raw Exposures Switch */}
            <div className="flex items-center gap-1.5 bg-void p-1 border-2 border-line">
              <button
                type="button"
                onClick={() => {
                  if (!coaddMode) onToggleCoaddMode();
                }}
                className={`px-btn px-btn-vt px-2 py-0.5 ${
                  coaddMode ? 'px-btn-active' : ''
                }`}
              >
                {t.epochCoaddMode} ({epochs.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (coaddMode) onToggleCoaddMode();
                }}
                className={`px-btn px-btn-vt px-2 py-0.5 ${
                  !coaddMode ? 'px-btn-active' : ''
                }`}
              >
                {t.singleFramesMode}
              </button>
            </div>
          </div>

          {/* Band Selector (0 = All, 1..6) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-pixel text-[8px] text-dim mr-1">
              {t.bandsLabel}:
            </span>
            <button
              type="button"
              onClick={() => onSelectBand(0)}
              className={`px-btn px-2.5 py-1 ${band === 0 ? 'px-btn-active' : ''}`}
            >
              {t.allBands}
            </button>
            {[1, 2, 3, 4, 5, 6].map((b) => {
              const spec = SPHEREX_BANDS[b];
              const isSelected = band === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => onSelectBand(b)}
                  title={`${spec.minUm}–${spec.maxUm} µm`}
                  className={`px-btn px-2 py-1 tabular-nums ${
                    isSelected ? BAND_ACTIVE_CLASSES[b] : ''
                  }`}
                >
                  <span
                    className={`w-[10px] h-[10px] inline-block shrink-0 border border-void ${
                      isSelected ? 'bg-void' : BAND_SWATCH_CLASSES[b]
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {t.bandPrefix}
                    {b}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Timeline Scrubber */}
        {timelineFrames.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-mono tabular-nums text-dim whitespace-nowrap">
              {currentIndex + 1} / {timelineFrames.length}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, timelineFrames.length - 1)}
              step={1}
              value={Math.min(currentIndex, Math.max(0, timelineFrames.length - 1))}
              onChange={(e) => onSelectIndex(Number(e.target.value))}
              aria-label={t.epochTimelineLabel}
              className="px-slider flex-1"
            />
            <div className="hidden md:flex items-center gap-1.5 overflow-x-auto max-w-md py-0.5">
              {timelineFrames.slice(0, 12).map((f, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={`${f.id}_${idx}`}
                    type="button"
                    onClick={() => onSelectIndex(idx)}
                    className={`px-btn px-btn-vt px-2 py-0.5 text-[15px] tabular-nums whitespace-nowrap ${
                      isCurrent ? 'px-btn-active' : ''
                    }`}
                  >
                    <span
                      className={`w-[10px] h-[10px] inline-block shrink-0 border border-void ${
                        isCurrent ? 'bg-void' : BAND_SWATCH_CLASSES[f.band] ?? 'bg-dim'
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      {f.epoch ? `${f.epoch}` : `MJD ${Math.round(f.mjd)}`}·B{f.band}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Wavelength Spread Warning */}
        {wavelengthSpreadWarning && (
          <div className="bg-panel-hi border-2 border-warn px-3 py-1 text-[14px] text-warn">
            ▲ {t.wavelengthSpreadAlert}
          </div>
        )}

        {/* Row 2: Frame Technical Sheet + Target Scientific Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 pt-1.5 border-t-2 border-line text-[14px]">
          <div className="lg:col-span-7 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-pixel text-[8px] text-ink">
                {t.frameSheetTitle}
              </span>
              {currentFrame && (
                <span className="px-chip text-amber border-amber-lo">
                  {currentFrame.isCoadd
                    ? `${t.coaddedBadge} (${currentFrame.coaddCount}×)`
                    : t.rawFrameBadge}
                </span>
              )}
              {hasSat && (
                <span className="px-chip text-bad border-bad">
                  ✖ {t.saturationAlertLabel}
                </span>
              )}
              {hasPersist && (
                <span className="px-chip text-warn border-warn">
                  ▲ {t.persistenceAlertLabel}
                </span>
              )}
              {predictedOutOfBounds && (
                <span className="px-chip text-warn border-warn">
                  ↗ {t.predictedOutOfBoundsLabel}
                </span>
              )}
            </div>

            {usingDefaultFlagBits && currentFrame && (
              <div className="bg-panel-hi border-2 border-warn px-2.5 py-0.5 text-[14px] text-warn">
                ▲ {t.defaultFlagBitsWarning}
              </div>
            )}

            {currentFrame ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 font-mono tabular-nums text-[14px] bg-void px-notch-sm px-3 py-1">
                <div className="truncate">
                  <span className="text-dim">ID: </span>
                  <span className="text-ink">{currentFrame.id}</span>
                </div>
                <div>
                  <span className="text-dim">UTC: </span>
                  <span className="text-ink">{currentFrame.date.replace('T', ' ')}</span>
                </div>
                <div>
                  <span className="text-dim">MJD: </span>
                  <span className="text-ink">{currentFrame.mjd.toFixed(5)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-dim">{t.bandDetLabel}: </span>
                  <span
                    className={`w-[10px] h-[10px] inline-block shrink-0 border border-void ${
                      BAND_SWATCH_CLASSES[currentFrame.band] ?? 'bg-dim'
                    }`}
                    aria-hidden="true"
                  />
                  <span className={BAND_TEXT_CLASSES[currentFrame.band] ?? 'text-amber'}>
                    B{currentFrame.band} / D{currentFrame.detector}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-dim">wave_um: </span>
                  <span className="text-ink">
                    {currentFrame.wave_um.center.toFixed(3)} µm [
                    {currentFrame.wave_um.min.toFixed(3)}–{currentFrame.wave_um.max.toFixed(3)}]
                  </span>
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-1.5 font-sans">
                  <span className="text-dim font-mono">flags:</span>
                  {frameFlagsSummary.length === 0 ? (
                    <span className="text-dim">0</span>
                  ) : (
                    frameFlagsSummary.map((fs) => {
                      const cls =
                        fs.category === 'saturation'
                          ? 'text-bad'
                          : fs.category === 'persistence'
                          ? 'text-warn'
                          : fs.category === 'bad'
                          ? 'text-ink/80'
                          : 'text-b1';
                      return (
                        <span key={fs.name} className={`font-mono ${cls}`}>
                          {fs.name}({fs.pixelCount})
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="text-dim text-[14px]">{t.noDataTitle}</div>
            )}
          </div>

          <div className="lg:col-span-5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink">
                <span className="font-pixel text-[8px]">{t.targetNotesTitle}</span>
                {activeTarget ? ` · ${lang === 'es' ? activeTarget.nameEs : activeTarget.nameEn}` : ''}
              </span>
              {activeTarget && (
                <span className="text-[14px] font-mono tabular-nums text-dim">
                  {formatIrsaCoverage(
                    activeTarget,
                    collectionsForTarget(activeTarget),
                    t
                  )}
                </span>
              )}
            </div>
            <div className="bg-void px-notch-sm px-3 py-1 text-[14px] text-ink leading-[1.25]">
              {activeTarget ? (
                <div className="flex flex-col gap-1">
                  <span>{lang === 'es' ? activeTarget.notesEs : activeTarget.notesEn}</span>
                  {activeTarget.id === 'wise0855' && (
                    <span className="text-warn">{t.wiseInvisibleNote}</span>
                  )}
                </div>
              ) : (
                <span>{t.customCoordsNote}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
