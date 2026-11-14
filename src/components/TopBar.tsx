import React, { useEffect, useState } from 'react';
import { Compass, Search, Terminal } from 'lucide-react';
import { TARGET_PRESETS } from '../data/targets';
import { TranslationStrings } from '../i18n/translations';
import { Language, TargetPreset } from '../types/spherex';
import { parseCoordinates } from '../utils/coordinates';

interface TopBarProps {
  t: TranslationStrings;
  lang: Language;
  onToggleLang: () => void;
  ra: number;
  dec: number;
  size: number;
  collection: string;
  availableCollections: string[];
  activeTargetId: string | null;
  simMode: boolean;
  onToggleSimMode: () => void;
  onSelectTarget: (target: TargetPreset) => void;
  onSearchCoords: (ra: number, dec: number, size: number) => void;
  onChangeSize: (size: number) => void;
  onChangeCollection: (collection: string) => void;
}

const SIZE_OPTIONS = [100, 150, 200, 250, 300];

export const TopBar: React.FC<TopBarProps> = ({
  t,
  lang,
  onToggleLang,
  ra,
  dec,
  size,
  collection,
  availableCollections,
  activeTargetId,
  simMode,
  onToggleSimMode,
  onSelectTarget,
  onSearchCoords,
  onChangeSize,
  onChangeCollection,
}) => {
  const [coordInput, setCoordInput] = useState(`${ra.toFixed(5)}, ${dec.toFixed(5)}`);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setCoordInput(`${ra.toFixed(5)}, ${dec.toFixed(5)}`);
    setErrorMsg(null);
  }, [ra, dec]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCoordinates(coordInput);
    if (!parsed) {
      setErrorMsg(t.invalidCoords);
      return;
    }
    setErrorMsg(null);
    onSearchCoords(parsed.ra, parsed.dec, size);
  };

  return (
    <header className="bg-[#0B0F17] border-b border-slate-800 px-4 py-2.5 flex flex-col gap-2 shrink-0">
      {/* Row 1: Brand, Coordinate Search, FOV Size, Dev Sim Toggle, Language */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <Compass className="w-5 h-5 text-cyan-400" aria-hidden="true" />
          <h1 className="text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap">
            {t.brandTitle}
          </h1>
          <span className="text-xs font-mono text-slate-400 hidden sm:inline whitespace-nowrap">
            · 6.15&Prime;/px · MJy/sr
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 max-w-2xl items-center gap-2 min-w-[280px]">
          <div className="relative flex-1">
            <input
              type="text"
              value={coordInput}
              onChange={(e) => {
                setCoordInput(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              className="w-full bg-[#07090E] border border-slate-700 focus:border-cyan-500 rounded px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            <span className="hidden md:inline">{t.fieldSizeLabel}</span>
            <select
              value={size}
              onChange={(e) => onChangeSize(Number(e.target.value))}
              aria-label={t.fieldSizeLabel}
              className="bg-[#07090E] border border-slate-700 focus:border-cyan-500 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 outline-none"
            >
              {SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}&Prime;
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            <span className="hidden xl:inline">{t.collectionLabel}</span>
            <select
              value={collection}
              onChange={(e) => onChangeCollection(e.target.value)}
              aria-label={t.collectionLabel}
              className="bg-[#07090E] border border-slate-700 focus:border-cyan-500 rounded px-2 py-1.5 text-xs font-mono text-slate-100 outline-none max-w-[150px]"
            >
              {availableCollections.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.searchButton}</span>
          </button>
        </form>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleSimMode}
            title={t.devSimWarning}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              simMode
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                : 'bg-[#07090E] border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.devSimToggle}</span>
          </button>

          <button
            type="button"
            onClick={onToggleLang}
            className="px-2.5 py-1.5 rounded text-xs font-mono border border-slate-700 bg-[#07090E] text-slate-200 hover:border-cyan-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Switch language ES/EN"
          >
            {lang === 'es' ? 'ES / EN' : 'EN / ES'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-xs text-rose-400 font-medium" role="alert">
          {errorMsg}
        </div>
      )}

      {/* Row 2: 5 Mandatory Benchmark Targets */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="text-xs text-slate-400 mr-1 whitespace-nowrap">{t.targetsLabel}:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {TARGET_PRESETS.map((target) => {
            const isActive = activeTargetId === target.id;
            const label = lang === 'es' ? target.nameEs : target.nameEn;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => onSelectTarget(target)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-200'
                    : 'bg-[#0F141F] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] font-mono text-slate-500 ml-auto hidden lg:inline whitespace-nowrap tabular-nums">
          {t.propagatedLabel} · RA {ra.toFixed(4)}° · Dec {dec >= 0 ? '+' : ''}
          {dec.toFixed(4)}°
        </span>
      </div>
    </header>
  );
};
