import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import { TranslationStrings } from '../i18n/translations';
import { Language, ResolvedObject } from '../types/spherex';

interface ObjectCardProps {
  object: ResolvedObject;
  lang: Language;
  t: TranslationStrings;
  onClose: () => void;
}

const DISPLAY_MAG_BANDS = ['V', 'J', 'H', 'K'] as const;

export const ObjectCard: React.FC<ObjectCardProps> = ({
  object,
  lang,
  t,
  onClose,
}) => {
  const typeLabel =
    (lang === 'es' ? object.object_type_es : object.object_type_en) ||
    object.object_type;

  // Show what the user typed ("Vega") next to the catalog id ("* alf Lyr") when they differ.
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const showQuery = Boolean(object.query) && normalize(object.query) !== normalize(object.name);

  const availableMags =DISPLAY_MAG_BANDS.filter((band) => {
    const val = object.magnitudes?.[band];
    return typeof val === 'number' && Number.isFinite(val);
  });

  const mu = Math.round(
    Math.hypot(object.pmra_mas_yr ?? 0, object.pmdec_mas_yr ?? 0)
  );

  const propagatedText = t.objectPropagatedNote
    .replace('{epoch}', object.epoch.toFixed(2))
    .replace('{mu}', String(mu));

  return (
    <div
      aria-live="polite"
      className="bg-[#0A0A0A] border border-slate-800 rounded px-3 py-1.5 text-xs flex flex-col gap-0.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="font-semibold text-slate-100 whitespace-nowrap">
            {showQuery ? object.query : object.name}
          </span>
          {showQuery && (
            <span className="font-mono text-slate-500 whitespace-nowrap">{object.name}</span>
          )}
          {typeLabel && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 whitespace-nowrap">
              {typeLabel}
            </span>
          )}
          {object.spectral_type && (
            <span className="font-mono text-slate-400 whitespace-nowrap">
              {object.spectral_type}
            </span>
          )}
          {availableMags.length > 0 && (
            <span className="font-mono tabular-nums text-slate-300 flex flex-wrap items-center gap-x-2">
              {availableMags.map((band) => (
                <span key={band} className="whitespace-nowrap">
                  <span className="text-slate-500">{band}</span>{' '}
                  {object.magnitudes[band].toFixed(2)}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {object.simbad_url && (
            <a
              href={object.simbad_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline underline-offset-2 whitespace-nowrap"
            >
              <span>{t.viewInSimbad}</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeObjectCard}
            title={t.closeObjectCard}
            className="p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1A1A1A] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {object.propagated && (
        <div className="text-[11px] font-mono tabular-nums text-slate-400">
          {propagatedText}
        </div>
      )}
    </div>
  );
};
