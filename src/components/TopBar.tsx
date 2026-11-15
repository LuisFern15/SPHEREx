import React, { useEffect, useState } from 'react';
import { TARGET_PRESETS } from '../data/targets';
import { TranslationStrings } from '../i18n/translations';
import { Language, TargetPreset } from '../types/spherex';
import { parseCoordinates } from '../utils/coordinates';
import { PixelSearchIcon, PixelTerminalIcon, SpherexLogo } from './PixelIcons';

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
    <header className="px-panel flex flex-col shrink-0">
      <div className="h-2 w-full px-dither border-b-2 border-line shrink-0" aria-hidden="true" />
      <div className="px-3 sm:px-4 py-2 flex flex-col gap-2">
        {/* Row 1: Brand, Coordinate Search, FOV Size, Dev Sim Toggle, Language */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <SpherexLogo className="shrink-0" />
            <h1 className="font-pixel text-[10px] text-ink whitespace-nowrap [text-shadow:2px_2px_0_var(--color-amber-lo)]">
              {t.brandTitle}
            </h1>
            <span className="text-[14px] font-mono text-dim hidden sm:inline whitespace-nowrap">
              · 6.15&Prime;/px · MJy/sr
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-wrap sm:flex-nowrap basis-full sm:basis-auto max-w-2xl items-center gap-2 min-w-[260px]">
            <div className="relative flex-1 min-w-[180px] basis-full sm:basis-auto">
              <input
                type="text"
                value={coordInput}
                onChange={(e) => {
                  setCoordInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchPlaceholder}
                className="px-input w-full px-2.5 py-1 tabular-nums"
              />
            </div>

            <label className="flex items-center gap-1.5 text-[14px] text-dim shrink-0">
              <span className="hidden md:inline">{t.fieldSizeLabel}</span>
              <select
                value={size}
                onChange={(e) => onChangeSize(Number(e.target.value))}
                aria-label={t.fieldSizeLabel}
                className="px-select px-2 py-1 tabular-nums"
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}&Prime;
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-[14px] text-dim shrink-0">
              <span className="hidden xl:inline">{t.collectionLabel}</span>
              <select
                value={collection}
                onChange={(e) => onChangeCollection(e.target.value)}
                aria-label={t.collectionLabel}
                className="px-select px-2 py-1 max-w-[180px]"
              >
                {availableCollections.map((col) => (
                  <option key={col} value={col}>
                    {col === 'spherex_both' ? t.collectionBoth : col}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="px-btn px-btn-active px-3 py-1.5 whitespace-nowrap shrink-0"
            >
              <PixelSearchIcon className="w-4 h-4" />
              <span>{t.searchButton}</span>
            </button>
          </form>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleSimMode}
              title={t.devSimWarning}
              className={`px-btn px-2.5 py-1.5 whitespace-nowrap shrink-0 ${
                simMode ? 'px-btn-active' : ''
              }`}
            >
              <PixelTerminalIcon className="w-4 h-4" />
              <span>{t.devSimToggle}</span>
            </button>

            <button
              type="button"
              onClick={onToggleLang}
              className="px-btn px-2.5 py-1.5 whitespace-nowrap shrink-0"
              aria-label={t.switchLangLabel}
            >
              {lang === 'es' ? 'ES / EN' : 'EN / ES'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="text-[14px] text-bad font-mono" role="alert">
            {errorMsg}
          </div>
        )}

        {/* Row 2: 5 Mandatory Benchmark Targets */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="font-pixel text-[8px] text-dim mr-1 whitespace-nowrap">
            {t.targetsLabel}:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {TARGET_PRESETS.map((target) => {
              const isActive = activeTargetId === target.id;
              const label = lang === 'es' ? target.nameEs : target.nameEn;
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => onSelectTarget(target)}
                  className={`px-btn px-btn-vt px-2.5 py-1 whitespace-nowrap shrink-0 ${
                    isActive ? 'px-btn-active' : ''
                  }`}
                >
                  {isActive && <span aria-hidden="true">▶</span>}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          <span className="text-[14px] font-mono text-dim ml-auto hidden lg:inline whitespace-nowrap tabular-nums">
            {activeTargetId !== null ? `${t.propagatedLabel} · ` : ''}
            RA {ra.toFixed(4)}° · Dec {dec >= 0 ? '+' : ''}
            {dec.toFixed(4)}°
          </span>
        </div>
      </div>
    </header>
  );
};