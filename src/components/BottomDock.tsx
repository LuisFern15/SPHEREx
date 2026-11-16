import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
} from 'lucide-react';
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
    <footer className="bg-[#121212] border-t border-slate-800 px-4 py-3 flex flex-col gap-2.5 shrink-0">
      {/* Row 1: Temporal Player + Epoch Grouping + Spectral Band Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Player Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
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
              className="p-1.5 rounded border border-slate-700 bg-[#0A0A0A] text-slate-200 hover:border-cyan-500 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={timelineFrames.length <= 1}
              onClick={onTogglePlay}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs disabled:opacity-40 cursor-pointer"
            >
              {playing ? (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
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
              className="p-1.5 rounded border border-slate-700 bg-[#0A0A0A] text-slate-200 hover:border-cyan-500 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleLoop}
            className={`inline-flex items-center gap-1 px-2 py-1.5 rounded border text-xs transition-colors cursor-pointer ${
              loop
                ? 'bg-cyan-500/15 border-cyan-500 text-cyan-200'
                : 'bg-[#0A0A0A] border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.loop}</span>
          </button>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span>{t.speedLabel}</span>
            <select
              value={speed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              className="bg-[#0A0A0A] border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-slate-100 outline-none focus:border-cyan-500"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s} ms
                </option>
              ))}
            </select>
          </label>

          {/* Epoch Co-add vs Raw Exposures Switch */}
          <div className="flex items-center gap-1 bg-[#0A0A0A] p-0.5 rounded border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                if (!coaddMode) onToggleCoaddMode();
              }}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                coaddMode
                  ? 'bg-cyan-600/90 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.epochCoaddMode} ({epochs.length})
            </button>
            <button
              type="button"
              onClick={() => {
                if (coaddMode) onToggleCoaddMode();
              }}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                !coaddMode
                  ? 'bg-cyan-600/90 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.singleFramesMode}
            </button>
          </div>
        </div>

        {/* Band Selector (0 = All, 1..6) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1">{t.bandsLabel}:</span>
          <button
            type="button"
            onClick={() => onSelectBand(0)}
            className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer ${
              band === 0
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                : 'bg-[#0A0A0A] border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {t.allBands}
          </button>
          {[1, 2, 3, 4, 5, 6].map((b) => {
            const spec = SPHEREX_BANDS[b];
            return (
              <button
                key={b}
                type="button"
                onClick={() => onSelectBand(b)}
                title={`${spec.minUm}–${spec.maxUm} µm`}
                className={`px-2 py-1 rounded border text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                  band === b
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200 font-semibold'
                    : 'bg-[#0A0A0A] border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {t.bandPrefix}
                {b}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Timeline Scrubber */}
      {timelineFrames.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
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
            className="sci-slider flex-1"
          />
          <div className="hidden md:flex items-center gap-1 overflow-x-auto max-w-md">
            {timelineFrames.slice(0, 12).map((f, idx) => (
              <button
                key={`${f.id}_${idx}`}
                type="button"
                onClick={() => onSelectIndex(idx)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums border whitespace-nowrap cursor-pointer ${
                  idx === currentIndex
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                    : 'bg-[#0A0A0A] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.epoch ? `${f.epoch}` : `MJD ${Math.round(f.mjd)}`}·B{f.band}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Wavelength Spread Warning */}
      {wavelengthSpreadWarning && (
        <div className="bg-amber-950/35 border border-amber-700/60 rounded px-3 py-1.5 text-xs text-amber-200">
          ▲ {t.wavelengthSpreadAlert}
        </div>
      )}

      {/* Row 2: Frame Technical Sheet + Target Scientific Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1 border-t border-slate-800/80 text-xs">
        <div className="lg:col-span-7 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-200">{t.frameSheetTitle}</span>
            {currentFrame && (
              <span className="text-[11px] font-mono text-cyan-300">
                {currentFrame.isCoadd
                  ? `${t.coaddedBadge} (${currentFrame.coaddCount}×)`
                  : t.rawFrameBadge}
              </span>
            )}
            {hasSat && (
              <span className="text-[11px] font-mono text-rose-400 font-semibold">
                ✖ {t.saturationAlertLabel}
              </span>
            )}
            {hasPersist && (
              <span className="text-[11px] font-mono text-amber-400 font-semibold">
                ▲ {t.persistenceAlertLabel}
              </span>
            )}
            {predictedOutOfBounds && (
              <span className="text-[11px] font-mono text-amber-300 font-semibold">
                ↗ {t.predictedOutOfBoundsLabel}
              </span>
            )}
          </div>

          {usingDefaultFlagBits && currentFrame && (
            <div className="bg-amber-950/30 border border-amber-800/60 rounded px-2.5 py-1 text-[11px] text-amber-200">
              ▲ {t.defaultFlagBitsWarning}
            </div>
          )}

          {currentFrame ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 font-mono tabular-nums text-[11px] bg-[#0A0A0A] border border-slate-800 rounded px-3 py-2">
              <div className="truncate">
                <span className="text-slate-500">ID: </span>
                <span className="text-slate-200">{currentFrame.id}</span>
              </div>
              <div>
                <span className="text-slate-500">UTC: </span>
                <span className="text-slate-200">{currentFrame.date.replace('T', ' ')}</span>
              </div>
              <div>
                <span className="text-slate-500">MJD: </span>
                <span className="text-slate-200">{currentFrame.mjd.toFixed(5)}</span>
              </div>
              <div>
                <span className="text-slate-500">Band/Det: </span>
                <span className="text-cyan-300">
                  B{currentFrame.band} / D{currentFrame.detector}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">wave_um: </span>
                <span className="text-slate-200">
                  {currentFrame.wave_um.center.toFixed(3)} µm [
                  {currentFrame.wave_um.min.toFixed(3)}–{currentFrame.wave_um.max.toFixed(3)}]
                </span>
              </div>
              <div className="col-span-2 flex flex-wrap items-center gap-1.5 font-sans">
                <span className="text-slate-500 font-mono">flags:</span>
                {frameFlagsSummary.length === 0 ? (
                  <span className="text-slate-400">0</span>
                ) : (
                  frameFlagsSummary.map((fs) => {
                    const cls =
                      fs.category === 'saturation'
                        ? 'text-rose-300'
                        : fs.category === 'persistence'
                        ? 'text-amber-300'
                        : fs.category === 'bad'
                        ? 'text-fuchsia-300'
                        : 'text-cyan-300';
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
            <div className="text-slate-500 text-[11px]">{t.noDataTitle}</div>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-200">
              {t.targetNotesTitle}
              {activeTarget ? ` · ${lang === 'es' ? activeTarget.nameEs : activeTarget.nameEn}` : ''}
            </span>
            {activeTarget && (
              <span className="text-[10px] font-mono tabular-nums text-slate-400">
                {formatIrsaCoverage(activeTarget, collectionsForTarget(activeTarget), t)}
              </span>
            )}
          </div>
          <div className="bg-[#0A0A0A] border border-slate-800 rounded px-3 py-2 text-[11px] text-slate-300 leading-relaxed">
            {activeTarget ? (
              <div className="flex flex-col gap-1">
                <span>{lang === 'es' ? activeTarget.notesEs : activeTarget.notesEn}</span>
                {activeTarget.id === 'wise0855' && (
                  <span className="text-amber-300">{t.wiseInvisibleNote}</span>
                )}
              </div>
            ) : (
              <span>
                {lang === 'es'
                  ? 'Consulta personalizada de coordenadas J2000/ICRS en recortes SPHEREx.'
                  : 'Custom coordinate cutout inspection in SPHEREx time-series frames.'}
              </span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
