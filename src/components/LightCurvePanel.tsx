import React, { useEffect, useMemo, useState } from 'react';
import { fetchPhotometry } from '../api/spherexClient';
import {
  Language,
  PhotometryMeasurement,
  PhotometryMode,
  PhotometryResponse,
} from '../types/spherex';

interface LightCurvePanelProps {
  targetId: string | null;
  targetName?: string;
  collection: string;
  activeBand: number; // 0 = Todas, 1..6 = D1..D6
  selectedFrameId?: string | null;
  onSelectFrameId?: (frameId: string) => void;
  lang?: Language;
}

const BAND_COLORS: Record<number, string> = {
  1: '#38bdf8', // D1 cyan
  2: '#34d399', // D2 emerald
  3: '#a3e635', // D3 lime
  4: '#facc15', // D4 yellow
  5: '#fb923c', // D5 orange
  6: '#f87171', // D6 red
};

export const LightCurvePanel: React.FC<LightCurvePanelProps> = ({
  targetId,
  targetName,
  collection,
  activeBand,
  selectedFrameId,
  onSelectFrameId,
  lang = 'es',
}) => {
  const [data, setData] = useState<PhotometryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chartType, setChartType] = useState<'lightcurve' | 'spectrum'>('lightcurve');
  const [mode, setMode] = useState<PhotometryMode>('aperture');
  const [bandFilter, setBandFilter] = useState<number>(activeBand > 0 ? activeBand : 0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (activeBand > 0) {
      setBandFilter(activeBand);
    }
  }, [activeBand]);

  useEffect(() => {
    if (!targetId) {
      setData(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchPhotometry({ target: targetId, collection, signal: controller.signal })
      .then((res) => {
        setData(res);
        const apValid = res.measurements.filter((m) => m.valid && m.flux_ujy !== null).length;
        const haloValid = res.measurements.filter((m) => m.halo_valid && m.halo_flux_ujy !== null).length;
        // Cambiar automáticamente a halo si el núcleo está saturado (ej. Barnard, R Draconis)
        setMode(apValid === 0 && haloValid > 0 ? 'halo' : 'aperture');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(err instanceof Error ? err.message : 'Error cargando fotometría');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [targetId, collection]);

  const counts = useMemo(() => {
    if (!data) return { ap: 0, halo: 0, total: 0 };
    return {
      ap: data.measurements.filter((m) => m.valid && m.flux_ujy !== null).length,
      halo: data.measurements.filter((m) => m.halo_valid && m.halo_flux_ujy !== null).length,
      total: data.measurements.length,
    };
  }, [data]);

  const points = useMemo(() => {
    if (!data) return [];
    return data.measurements
      .filter((m) => (bandFilter === 0 ? true : m.band === bandFilter))
      .map((m) => {
        const isValid = mode === 'aperture' ? m.valid && m.flux_ujy !== null : m.halo_valid && m.halo_flux_ujy !== null;
        const flux = mode === 'aperture' ? m.flux_ujy : m.halo_flux_ujy;
        const err = mode === 'aperture' ? m.err_ujy : m.halo_err_ujy;
        return {
          m,
          isValid,
          flux: flux ?? 0,
          err: err ?? 0,
          xVal: chartType === 'lightcurve' ? m.mjd : m.wave_um.center,
        };
      })
      .filter((p) => p.isValid && Number.isFinite(p.flux) && Number.isFinite(p.xVal));
  }, [data, bandFilter, mode, chartType]);

  const activePoint = useMemo(() => {
    const idToFind = hoveredId ?? selectedFrameId;
    if (!idToFind) return points[0] ?? null;
    return points.find((p) => p.m.id === idToFind) ?? points[0] ?? null;
  }, [points, hoveredId, selectedFrameId]);

  if (!targetId) {
    return (
      <div className="p-3 text-xs text-slate-400 border border-slate-800 rounded bg-slate-900/60">
        {lang === 'es'
          ? 'La fotometría de Capa 2 está disponible para los 5 objetivos calibrados (Barnard, WISE 0855, Epsilon Indi B, RW Aurigae y R Draconis).'
          : 'Layer 2 photometry is available for the 5 calibrated targets.'}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 text-xs text-cyan-300 border border-slate-800 rounded bg-slate-900/60 animate-pulse">
        {lang === 'es' ? `Cargando fotometría de ${targetName ?? targetId}…` : `Loading photometry…`}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-3 text-xs text-red-300 border border-red-900/60 rounded bg-red-950/30">
        {error ?? (lang === 'es' ? 'Sin datos de fotometría.' : 'No photometry data.')}
      </div>
    );
  }

  // Geometría SVG
  const W = 360;
  const H = 205;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xs = points.map((p) => p.xVal);
  const yLows = points.map((p) => p.flux - p.err);
  const yHighs = points.map((p) => p.flux + p.err);

  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const spanX = maxX - minX || 1;

  const rawMinY = yLows.length ? Math.min(0, ...yLows) : -1;
  const rawMaxY = yHighs.length ? Math.max(0, ...yHighs) : 1;
  const padY = (rawMaxY - rawMinY || 1) * 0.08;
  const minY = rawMinY - padY;
  const maxY = rawMaxY + padY;
  const spanY = maxY - minY || 1;

  const toSvgX = (x: number) => padL + ((x - minX) / spanX) * plotW;
  const toSvgY = (y: number) => padT + plotH - ((y - minY) / spanY) * plotH;
  const zeroY = toSvgY(0);

  return (
    <div className="space-y-3 text-xs text-slate-200">
      {/* Encabezado y conmutador Curva de Luz / Espectro */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded overflow-hidden border border-slate-700">
          <button
            type="button"
            onClick={() => setChartType('lightcurve')}
            className={`px-2.5 py-1 font-medium transition ${
              chartType === 'lightcurve'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {lang === 'es' ? 'Curva de luz' : 'Light curve'}
          </button>
          <button
            type="button"
            onClick={() => setChartType('spectrum')}
            className={`px-2.5 py-1 font-medium transition ${
              chartType === 'spectrum'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {lang === 'es' ? 'Espectro (λ)' : 'Spectrum (λ)'}
          </button>
        </div>

        <span className="text-[11px] text-slate-400">
          {points.length}/{counts.total} {lang === 'es' ? 'válidas' : 'valid'}
        </span>
      </div>

      {/* Selector Apertura vs Halo */}
      <div className="flex items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded p-2">
        <span className="text-[11px] text-slate-400">
          {lang === 'es' ? 'Extracción:' : 'Extraction:'}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('aperture')}
            className={`px-2 py-0.5 rounded text-[11px] border ${
              mode === 'aperture'
                ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'es' ? `Apertura (${counts.ap})` : `Aperture (${counts.ap})`}
          </button>
          <button
            type="button"
            onClick={() => setMode('halo')}
            className={`px-2 py-0.5 rounded text-[11px] border ${
              mode === 'halo'
                ? 'border-amber-400 bg-amber-950/50 text-amber-200'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {lang === 'es' ? `Halo (${counts.halo})` : `Halo (${counts.halo})`}
          </button>
        </div>
      </div>

      {mode === 'halo' && (
        <div className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/60 rounded px-2.5 py-1.5">
          {lang === 'es'
            ? `Modo halo relativo (${data.halo_px[0]}–${data.halo_px[1]} px): indicador de variación cuando el núcleo satura, no flujo total.`
            : `Relative halo mode (${data.halo_px[0]}–${data.halo_px[1]} px): relative indicator for saturated cores, not total flux.`}
        </div>
      )}

      {/* Filtro de banda D1-D6 */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setBandFilter(0)}
          className={`px-2 py-0.5 rounded text-[11px] border ${
            bandFilter === 0
              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
              : 'border-slate-800 bg-slate-900 text-slate-400'
          }`}
        >
          {lang === 'es' ? 'Todas' : 'All'}
        </button>
        {[1, 2, 3, 4, 5, 6].map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBandFilter(b)}
            className={`px-2 py-0.5 rounded text-[11px] border flex items-center gap-1 ${
              bandFilter === b
                ? 'border-slate-400 bg-slate-800 text-white'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: BAND_COLORS[b] }}
            />
            D{b}
          </button>
        ))}
      </div>

      {chartType === 'lightcurve' && bandFilter === 0 && points.length > 0 && (
        <div className="text-[11px] text-amber-300/90 bg-slate-900 border border-amber-900/50 rounded px-2 py-1">
          {lang === 'es'
            ? 'Selecciona una sola banda (D1–D6) para comparar brillo entre épocas sin mezclar longitudes de onda.'
            : 'Select a single band (D1–D6) to compare brightness across epochs without mixing wavelengths.'}
        </div>
      )}

      {/* Gráfica SVG */}
      <div className="bg-slate-950 border border-slate-800 rounded p-2">
        {points.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-slate-400 text-center px-4">
            {mode === 'aperture' && counts.halo > 0
              ? lang === 'es'
                ? 'Núcleo saturado en apertura. Cambia a modo "Halo" arriba para ver la serie.'
                : 'Core saturated in aperture. Switch to "Halo" mode above.'
              : lang === 'es'
              ? 'No hay medidas válidas para esta banda/extracción.'
              : 'No valid measurements for this band/extraction.'}
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none overflow-visible">
            {/* Línea de flujo cero */}
            {zeroY >= padT && zeroY <= padT + plotH && (
              <line
                x1={padL}
                x2={W - padR}
                y1={zeroY}
                y2={zeroY}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            )}

            {/* Ejes */}
            <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#475569" strokeWidth="1" />
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + plotH}
              y2={padT + plotH}
              stroke="#475569"
              strokeWidth="1"
            />

            {/* Etiquetas eje Y */}
            <text x={padL - 4} y={padT + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
              {maxY.toFixed(0)}
            </text>
            <text x={padL - 4} y={padT + plotH} textAnchor="end" fill="#94a3b8" fontSize="9">
              {minY.toFixed(0)}
            </text>
            <text
              x={10}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9"
              transform={`rotate(-90 10 ${padT + plotH / 2})`}
            >
              {data.units}
            </text>

            {/* Etiquetas eje X */}
            <text x={padL} y={H - 6} textAnchor="start" fill="#94a3b8" fontSize="9">
              {chartType === 'lightcurve' ? `MJD ${minX.toFixed(1)}` : `${minX.toFixed(2)} µm`}
            </text>
            <text x={W - padR} y={H - 6} textAnchor="end" fill="#94a3b8" fontSize="9">
              {chartType === 'lightcurve' ? `${maxX.toFixed(1)}` : `${maxX.toFixed(2)} µm`}
            </text>

            {/* Puntos y barras de error */}
            {points.map(({ m, flux, err, xVal }) => {
              const cx = toSvgX(xVal);
              const cy = toSvgY(flux);
              const y1 = Math.max(padT, Math.min(padT + plotH, toSvgY(flux + err)));
              const y2 = Math.max(padT, Math.min(padT + plotH, toSvgY(flux - err)));
              const isSelected = m.id === selectedFrameId;
              const isHovered = m.id === hoveredId;
              const color = BAND_COLORS[m.band] ?? '#38bdf8';

              return (
                <g
                  key={m.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredId(m.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelectFrameId?.(m.id)}
                >
                  <line
                    x1={cx}
                    x2={cx}
                    y1={y1}
                    y2={y2}
                    stroke={color}
                    strokeOpacity={0.55}
                    strokeWidth={isSelected ? 1.8 : 1}
                  />
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6.5}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected || isHovered ? 4 : 2.8}
                    fill={m.bkg_source_contaminated ? '#f59e0b' : color}
                    stroke="#020617"
                    strokeWidth="0.8"
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Detalle del punto seleccionado / bajo cursor */}
      {activePoint && (
        <div className="bg-slate-900/90 border border-slate-800 rounded p-2.5 space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-cyan-300">
              D{activePoint.m.band} · {activePoint.m.wave_um.center.toFixed(3)} µm
            </span>
            <span className="text-slate-400">{activePoint.m.date.replace('T', ' ')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>
              {lang === 'es' ? 'Flujo:' : 'Flux:'}{' '}
              <strong className="text-white">
                {activePoint.flux.toFixed(1)} ± {activePoint.err.toFixed(1)} {data.units}
              </strong>
            </span>
            {activePoint.m.snr !== null && mode === 'aperture' && (
              <span className="text-slate-400">SNR: {activePoint.m.snr.toFixed(2)}</span>
            )}
          </div>
          {activePoint.m.bkg_source_contaminated && (
            <div className="text-amber-300">
              {lang === 'es'
                ? '⚠ Anillo de fondo contaminado por fuente vecina.'
                : '⚠ Background annulus contaminated by nearby source.'}
            </div>
          )}
          {onSelectFrameId && (
            <div className="text-[10px] text-slate-400 pt-0.5">
              {lang === 'es'
                ? 'Haz clic en cualquier punto para saltar a esa imagen en el visor.'
                : 'Click any point to jump to that exposure in the viewer.'}
            </div>
          )}
        </div>
      )}

      {/* Notas metodológicas */}
      {data.notes.length > 0 && (
        <details className="text-[11px] text-slate-400 border border-slate-800/80 rounded px-2.5 py-1.5">
          <summary className="cursor-pointer text-slate-300">
            {lang === 'es' ? 'Notas metodológicas' : 'Methodological notes'}
          </summary>
          <ul className="list-disc pl-4 mt-1.5 space-y-1">
            {data.notes.map((n, idx) => (
              <li key={idx}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};