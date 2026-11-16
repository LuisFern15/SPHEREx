import React from 'react';
import { RefreshCw } from 'lucide-react';
import { TranslationStrings } from '../i18n/translations';
import { ProvenanceState } from '../types/spherex';

interface ProvenanceBannerProps {
  t: TranslationStrings;
  provenance: ProvenanceState;
  loading: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  notes: string[];
  onRetry: () => void;
  requestedSize?: number;
  actualSize?: number;
}

export const ProvenanceBanner: React.FC<ProvenanceBannerProps> = ({
  t,
  provenance,
  loading,
  errorMessage,
  emptyMessage,
  notes,
  onRetry,
  requestedSize,
  actualSize,
}) => {
  let glyph = '●';
  let label = t.provenanceLive;
  let description = t.provenanceLiveDesc;
  let containerCls = 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200';
  let badgeCls = 'text-emerald-400';

  if (provenance === 'cached') {
    glyph = '◆';
    label = t.provenanceCached;
    description = t.provenanceCachedDesc;
    containerCls = 'bg-amber-950/30 border-amber-800/60 text-amber-100';
    badgeCls = 'text-amber-400';
  } else if (provenance === 'error' && emptyMessage) {
    glyph = '○';
    label = t.provenanceEmpty;
    description = emptyMessage;
    containerCls = 'bg-slate-900/80 border-slate-700 text-slate-200';
    badgeCls = 'text-slate-300';
  } else if (provenance === 'error') {
    glyph = '✖';
    label = t.provenanceError;
    description = errorMessage || 'Backend query failed.';
    containerCls = 'bg-rose-950/40 border-rose-800/70 text-rose-100';
    badgeCls = 'text-rose-400';
  } else if (provenance === 'simulated') {
    glyph = '▲';
    label = t.provenanceSimulated;
    description = t.provenanceSimulatedDesc;
    containerCls = 'bg-amber-950/40 border-amber-700/70 text-amber-100';
    badgeCls = 'text-amber-300';
  }

  // Stored snapshots have a fixed field: tell the user when the requested size does not apply.
  const showSizeMismatchNote =
    !loading &&
    provenance === 'cached' &&
    requestedSize !== undefined &&
    actualSize !== undefined &&
    Math.abs(requestedSize - actualSize) > 1;

  return (
    <div
      className={`border-b px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${containerCls}`}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className={`font-mono font-semibold whitespace-nowrap ${badgeCls}`}>
          {glyph} {label}
        </span>
        <span className="text-slate-400" aria-hidden="true">
          ·
        </span>
        <span className="truncate">
          {loading ? t.queryingBackend : description}
        </span>
        {showSizeMismatchNote && actualSize !== undefined && (
          <>
            <span className="text-slate-500" aria-hidden="true">
              ·
            </span>
            <span className="text-slate-300 whitespace-nowrap">
              {t.cachedSizeMismatchNote.replace('{n}', String(Math.round(actualSize)))}
            </span>
          </>
        )}
        {!loading && notes.length > 0 && (
          <>
            <span className="text-slate-500" aria-hidden="true">
              ·
            </span>
            <span className="text-slate-300 truncate">{notes[0]}</span>
          </>
        )}
      </div>

      {provenance === 'error' && !emptyMessage && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          <span>{t.retryButton}</span>
        </button>
      )}
    </div>
  );
};
