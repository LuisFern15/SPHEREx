import React, { useEffect, useRef, useState } from 'react';
import { Compass, Loader2, Search, Terminal } from 'lucide-react';
import { ResolveNameError, resolveName } from '../api/spherexClient';
import { TARGET_PRESETS } from '../data/targets';
import { TranslationStrings } from '../i18n/translations';
import { Language, ResolvedObject, TargetPreset } from '../types/spherex';
import { parseCoordinates } from '../utils/coordinates';
import { SIZE_OPTIONS } from '../utils/urlHash';
import { ObjectCard } from './ObjectCard';

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
  resolvedObject: ResolvedObject | null;
  simMode: boolean;
  onToggleSimMode: () => void;
  onSelectTarget: (target: TargetPreset) => void;
  onSearchCoords: (ra: number, dec: number, size: number) => void;
  onResolvedObject: (obj: ResolvedObject, size: number) => void;
  onClearObject: () => void;
  onChangeSize: (size: number) => void;
  onChangeCollection: (collection: string) => void;
}

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
  resolvedObject,
  simMode,
  onToggleSimMode,
  onSelectTarget,
  onSearchCoords,
  onResolvedObject,
  onClearObject,
  onChangeSize,
  onChangeCollection,
}) => {
  const [coordInput, setCoordInput] = useState(`${ra.toFixed(5)}, ${dec.toFixed(5)}`);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const lastResolvedCoordRef = useRef<{ ra: number; dec: number } | null>(null);

  useEffect(() => {
    return () => {
      resolveAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const last = lastResolvedCoordRef.current;
    if (
      last &&
      Math.abs(ra - last.ra) < 1e-5 &&
      Math.abs(dec - last.dec) < 1e-5
    ) {
      lastResolvedCoordRef.current = null;
      setErrorMsg(null);
      return;
    }
    lastResolvedCoordRef.current = null;
    setCoordInput(`${ra.toFixed(5)}, ${dec.toFixed(5)}`);
    setErrorMsg(null);
  }, [ra, dec]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = coordInput.trim();
    if (!trimmed) {
      resolveAbortRef.current?.abort();
      resolveAbortRef.current = null;
      setResolving(false);
      setErrorMsg(t.invalidCoords);
      return;
    }

    const parsed = parseCoordinates(trimmed);
    if (parsed) {
      resolveAbortRef.current?.abort();
      resolveAbortRef.current = null;
      setResolving(false);
      lastResolvedCoordRef.current = null;
      setErrorMsg(null);
      onSearchCoords(parsed.ra, parsed.dec, size);
      return;
    }

    resolveAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    setResolving(true);
    setErrorMsg(null);

    try {
      const obj = await resolveName(trimmed, controller.signal);
      if (controller.signal.aborted || resolveAbortRef.current !== controller) {
        return;
      }
      resolveAbortRef.current = null;
      setResolving(false);
      const targetRa = Number(obj.ra.toFixed(6));
      const targetDec = Number(obj.dec.toFixed(6));
      if (targetRa !== ra || targetDec !== dec) {
        lastResolvedCoordRef.current = { ra: targetRa, dec: targetDec };
      }
      onResolvedObject(obj, size);
    } catch (err: unknown) {
      if (controller.signal.aborted || resolveAbortRef.current !== controller) {
        return;
      }
      resolveAbortRef.current = null;
      setResolving(false);
      if (err instanceof ResolveNameError) {
        if (err.kind === 'not_found') {
          setErrorMsg(t.resolveNotFound);
        } else if (err.kind === 'resolver_down') {
          setErrorMsg(t.resolveServiceDown);
        } else {
          setErrorMsg(t.resolveBackendUnreachable);
        }
      } else {
        setErrorMsg(t.resolveBackendUnreachable);
      }
    }
  };

  return (
    <header className="bg-[#121212] border-b border-slate-800 px-4 py-2.5 flex flex-col gap-2 shrink-0">
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
              className="w-full bg-[#0A0A0A] border border-slate-700 focus:border-cyan-500 rounded px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            <span className="hidden md:inline">{t.fieldSizeLabel}</span>
            <select
              value={size}
              onChange={(e) => onChangeSize(Number(e.target.value))}
              aria-label={t.fieldSizeLabel}
              className="bg-[#0A0A0A] border border-slate-700 focus:border-cyan-500 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 outline-none"
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
              className="bg-[#0A0A0A] border border-slate-700 focus:border-cyan-500 rounded px-2 py-1.5 text-xs font-mono text-slate-100 outline-none max-w-[175px]"
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
            disabled={resolving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-medium text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {resolving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{resolving ? t.searchingButton : t.searchButton}</span>
          </button>
        </form>

        <div className="flex items-center gap-2 shrink-0">
          {/* Simulated data is a development tool only: hidden on the public build */}
          {import.meta.env.DEV && (
          <button
            type="button"
            onClick={onToggleSimMode}
            title={t.devSimWarning}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              simMode
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                : 'bg-[#0A0A0A] border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.devSimToggle}</span>
          </button>
          )}

          <button
            type="button"
            onClick={onToggleLang}
            className="px-2.5 py-1.5 rounded text-xs font-mono border border-slate-700 bg-[#0A0A0A] text-slate-200 hover:border-cyan-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

      {resolvedObject && (
        <ObjectCard
          object={resolvedObject}
          lang={lang}
          t={t}
          onClose={onClearObject}
        />
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
                onClick={() => {
                  resolveAbortRef.current?.abort();
                  resolveAbortRef.current = null;
                  setResolving(false);
                  lastResolvedCoordRef.current = null;
                  onSelectTarget(target);
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-200'
                    : 'bg-[#1A1A1A] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
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
