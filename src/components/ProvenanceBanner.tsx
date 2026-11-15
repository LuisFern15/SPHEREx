import React from 'react';
import { TranslationStrings } from '../i18n/translations';
import { ProvenanceState } from '../types/spherex';
import { PixelRefreshIcon } from './PixelIcons';

interface ProvenanceBannerProps {
  t: TranslationStrings;
  provenance: ProvenanceState;
  loading: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  requestedSize?: number;
  actualSize?: number;
  notes: string[];
  onRetry: () => void;
}

export const ProvenanceBanner: React.FC<ProvenanceBannerProps> = ({
  t,
  provenance,
  loading,
  errorMessage,
  emptyMessage,
  requestedSize,
  actualSize,
  notes,
  onRetry,
}) => {
  let glyph = '●';
  let label = t.provenanceLive;
  let description = t.provenanceLiveDesc;
  let containerCls = 'bg-panel border-ok text-ink';
  let badgeCls = 'text-ok';
  let squareCls = 'bg-ok';

  if (provenance === 'cached') {
    glyph = '◆';
    label = t.provenanceCached;
    description = t.provenanceCachedDesc;
    containerCls = 'bg-panel border-ok text-ink';
    badgeCls = 'text-ok';
    squareCls = 'bg-ok';
  } else if (provenance === 'error' && emptyMessage) {
    glyph = '○';
    label = t.provenanceEmpty;
    description = emptyMessage;
    containerCls = 'bg-panel border-warn text-ink';
    badgeCls = 'text-warn';
    squareCls = 'bg-warn';
  } else if (provenance === 'error') {
    glyph = '✖';
    label = t.provenanceError;
    description = errorMessage || t.backendQueryFailed;
    containerCls = 'bg-panel border-bad text-ink';
    badgeCls = 'text-bad';
    squareCls = 'bg-bad';
  } else if (provenance === 'simulated') {
    glyph = '▲';
    label = t.provenanceSimulated;
    description = t.provenanceSimulatedDesc;
    containerCls = 'bg-panel border-amber text-ink';
    badgeCls = 'text-amber';
    squareCls = 'bg-amber';
  }

  const showSizeMismatchNote =
    !loading &&
    provenance === 'cached' &&
    requestedSize !== undefined &&
    actualSize !== undefined &&
    Math.abs(requestedSize - actualSize) > 1;

  return (
    <div
      className={`border-2 flex flex-col shrink-0 shadow-[4px_4px_0_#000000] ${containerCls}`}
      role="status"
    >
      <div className="h-[2px] w-full px-dither shrink-0" aria-hidden="true" />
      <div className="px-3 sm:px-4 py-1 flex flex-wrap items-center justify-between gap-3 text-[14px]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`w-3 h-3 shrink-0 border border-void ${squareCls}`}
            aria-hidden="true"
          />
          <span className={`font-mono whitespace-nowrap ${badgeCls}`}>
            {glyph} {label}
          </span>
          <span className="text-dim" aria-hidden="true">
            ·
          </span>
          <span className="truncate">{loading ? t.queryingBackend : description}</span>
          {showSizeMismatchNote && (
            <>
              <span className="text-dim" aria-hidden="true">
                ·
              </span>
              <span className="text-warn whitespace-nowrap">
                {t.cachedSizeMismatchNote.replace('{n}', String(Math.round(actualSize)))}
              </span>
            </>
          )}
          {notes.length > 0 && (
            <>
              <span className="text-dim" aria-hidden="true">
                ·
              </span>
              <span className="text-dim truncate">{notes[0]}</span>
            </>
          )}
        </div>

        {provenance === 'error' && !emptyMessage && (
          <button
            type="button"
            onClick={onRetry}
            className="px-btn bg-bad text-void border-bad px-2.5 py-1 whitespace-nowrap shrink-0"
          >
            <PixelRefreshIcon className="w-4 h-4" />
            <span>{t.retryButton}</span>
          </button>
        )}
      </div>
    </div>
  );
};