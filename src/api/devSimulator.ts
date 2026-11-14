import {
  DEFAULT_FLAG_BITS,
  SPHEREX_BANDS,
  TARGET_PRESETS,
  mjdToJulianYear,
  propagatePosition,
} from '../data/targets';
import {
  CatalogSource,
  DecodedSpherexFrame,
  FramesQueryResult,
  TargetPreset,
} from '../types/spherex';
import { encodeFloat32LEBase64, encodeUint32LEBase64 } from '../utils/binaryDecode';
import { skyToPixelLinear } from '../utils/coordinates';

const PIXEL_SCALE_ARCSEC = 6.15;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianRand(rng: () => number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function angularSeparationArcsec(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const cosDec = Math.cos(((dec1 + dec2) * 0.5 * Math.PI) / 180);
  const dRa = (((ra1 - ra2 + 540) % 360) - 180) * cosDec;
  const dDec = dec1 - dec2;
  return Math.hypot(dRa, dDec) * 3600;
}

function matchPresetNear(ra: number, dec: number): TargetPreset | null {
  let best: TargetPreset | null = null;
  let bestSep = Infinity;
  for (const t of TARGET_PRESETS) {
    const prop = propagatePosition(t, 2026.5);
    const sep = Math.min(
      angularSeparationArcsec(ra, dec, prop.ra, prop.dec),
      angularSeparationArcsec(ra, dec, t.ra, t.dec)
    );
    if (sep < 180 && sep < bestSep) {
      bestSep = sep;
      best = t;
    }
  }
  return best;
}

function addGaussianPsf(
  buf: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  peak: number,
  sigma: number
) {
  const r = Math.ceil(sigma * 4.5);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));
  const inv2s2 = 1 / (2 * sigma * sigma);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      buf[y * width + x] += peak * Math.exp(-(dx * dx + dy * dy) * inv2s2);
    }
  }
}

function mjdToIsoUtc(mjd: number): string {
  const unixMs = (mjd - 40587) * 86400 * 1000;
  return new Date(unixMs).toISOString().slice(0, 19);
}

/**
 * Explicit development-only simulator (`sim=1`).
 * Never invoked silently on API failures in production.
 */
export function generateSimulatedCutouts(
  queryRa: number,
  queryDec: number,
  sizeArcsec: number
): FramesQueryResult {
  const oddDim = Math.max(17, Math.min(51, Math.round(sizeArcsec / PIXEL_SCALE_ARCSEC) | 1));
  const width = oddDim;
  const height = oddDim;
  const centerPx = (oddDim - 1) / 2;
  const crpixVal = centerPx + 1; // FITS 1-based center pixel
  const cdDegPerPx = PIXEL_SCALE_ARCSEC / 3600;

  const matched = matchPresetNear(queryRa, queryDec);
  const epochMjds = [60780.2, 60962.4, 61144.6, 61326.8]; // ~6 month SPHEREx survey cycles (2025-2026)

  const fieldStars = Array.from({ length: 7 }, (_, idx) => {
    const rng = mulberry32(Math.round(queryRa * 1000 + queryDec * 777 + idx * 97));
    const offsetX = (rng() - 0.5) * (width - 6);
    const offsetY = (rng() - 0.5) * (height - 6);
    const cosDec = Math.max(0.1, Math.cos((queryDec * Math.PI) / 180));
    const starRa = queryRa + (-offsetX * cdDegPerPx) / cosDec;
    const starDec = queryDec + offsetY * cdDegPerPx;
    return {
      id: `sim_field_${idx + 1}`,
      label: `Field Star #${idx + 1}`,
      ra: ((starRa % 360) + 360) % 360,
      dec: starDec,
      fluxBase: 6 + rng() * 28,
    };
  });

  const frames: DecodedSpherexFrame[] = [];
  const satBit = DEFAULT_FLAG_BITS.SATURATED;
  const persistBit = DEFAULT_FLAG_BITS.PERSIST;
  const sourceBit = DEFAULT_FLAG_BITS.SOURCE;
  const disconBit = DEFAULT_FLAG_BITS.DISCON;

  epochMjds.forEach((baseMjd, epIdx) => {
    // Include 3 exposures per band in epochs so intra-epoch co-add boosts faint SNR realistically
    const bandsToSim = [1, 2, 3, 4, 5, 6];
    for (const band of bandsToSim) {
      const bandSpec = SPHEREX_BANDS[band];
      const exposuresInBand = 3;

      for (let sub = 0; sub < exposuresInBand; sub++) {
        const mjd = Number((baseMjd + (band - 1) * 0.14 + sub * 0.025).toFixed(5));
        const obsYear = mjdToJulianYear(mjd);

        // Slight LVF wavelength jitter across exposures within the same band
        const frac = (0.35 + 0.3 * (sub / Math.max(1, exposuresInBand - 1)) + (epIdx % 2) * 0.08);
        const lambdaCenter = Number(
          (bandSpec.minUm + (bandSpec.maxUm - bandSpec.minUm) * frac).toFixed(4)
        );
        const chanWidth = Number(((bandSpec.maxUm - bandSpec.minUm) / 17).toFixed(4));

        const wcs = {
          crval: [queryRa, queryDec] as [number, number],
          crpix: [crpixVal, crpixVal] as [number, number],
          cd: [
            [-cdDegPerPx, 0] as [number, number],
            [0, cdDegPerPx] as [number, number],
          ] as [[number, number], [number, number]],
        };

        const pixels = new Float32Array(width * height);
        const flagMask = new Uint32Array(width * height);
        const rng = mulberry32(Math.round(mjd * 100) + band * 131 + sub * 17);

        // Background sky + zodiacal IR continuum (stronger in bands 4-6)
        const bgLevel = band <= 3 ? 0.6 : 1.8 + (band - 4) * 1.1;
        const noiseSigma = band >= 5 ? 1.55 : 0.75;
        for (let i = 0; i < pixels.length; i++) {
          pixels[i] = bgLevel + gaussianRand(rng) * noiseSigma;
        }

        // Fixed background field stars
        for (const star of fieldStars) {
          const px = skyToPixelLinear(star.ra, star.dec, wcs);
          if (px) {
            const bandFactor = band <= 3 ? 1.0 : 0.65;
            addGaussianPsf(pixels, width, height, px[0], px[1], star.fluxBase * bandFactor, 0.88);
            const ix = Math.round(px[0]);
            const iy = Math.round(px[1]);
            if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
              flagMask[iy * width + ix] |= 1 << sourceBit;
            }
          }
        }

        // Propagated target position at this epoch
        let predictedRa = queryRa;
        let predictedDec = queryDec;
        if (matched) {
          const prop = propagatePosition(matched, obsYear);
          predictedRa = prop.ra;
          predictedDec = prop.dec;
        } else {
          // Generic moving test source if custom coords queried in dev simulator
          const dt = epIdx * 0.5;
          predictedRa = queryRa - (1.8 * dt) / 3600;
          predictedDec = queryDec + (1.2 * dt) / 3600;
        }

        const predPx = skyToPixelLinear(predictedRa, predictedDec, wcs) ?? [centerPx, centerPx];

        // Target-specific flux & detector artifact signatures
        let peakFlux = 42;
        let saturateCore = false;
        let addPersistence = false;

        if (matched?.id === 'barnard') {
          peakFlux = band <= 4 ? 145 : 75;
          saturateCore = band <= 3;
          addPersistence = epIdx > 0 && band <= 3;
        } else if (matched?.id === 'wise0855') {
          // Cold Y dwarf: undetectable in B1-B4, very faint (~SNR 1.4 single frame, ~2.4 coadd) in B5-B6
          peakFlux = band <= 4 ? 0.05 : band === 5 ? 2.1 : 3.2;
        } else if (matched?.id === 'epsindib') {
          peakFlux = band >= 3 ? 52 : 24;
        } else if (matched?.id === 'rwaur') {
          const dimPhase = epIdx === 1 ? 0.32 : epIdx === 2 ? 0.55 : 1.0;
          peakFlux = (36 + band * 5) * dimPhase;
        } else if (matched?.id === 'rdra') {
          const phase = Math.sin(((mjd - 60750) / 246.12) * Math.PI * 2);
          peakFlux = 115 + 55 * phase;
          saturateCore = peakFlux > 105;
          addPersistence = true;
        }

        addGaussianPsf(pixels, width, height, predPx[0], predPx[1], peakFlux, 0.92);

        const tx = Math.round(predPx[0]);
        const ty = Math.round(predPx[1]);
        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
          if (matched?.id !== 'wise0855') {
            flagMask[ty * width + tx] |= 1 << sourceBit;
          }
          if (saturateCore) {
            flagMask[ty * width + tx] |= 1 << satBit;
            if (tx + 1 < width) flagMask[ty * width + (tx + 1)] |= 1 << satBit;
          }
          if (addPersistence) {
            const pX = Math.max(0, Math.min(width - 1, tx - 3));
            const pY = Math.max(0, Math.min(height - 1, ty - 2));
            flagMask[pY * width + pX] |= 1 << persistBit;
            pixels[pY * width + pX] += 4.5;
          }
        }

        // Occasional cosmic ray discontinuity pixel
        if (sub === 1) {
          const crX = Math.floor(rng() * width);
          const crY = Math.floor(rng() * height);
          flagMask[crY * width + crX] |= 1 << disconBit;
          pixels[crY * width + crX] += 18;
        }

        // Verify base64 round-trip matches real backend contract
        const b64Data = encodeFloat32LEBase64(pixels);
        const b64Flags = encodeUint32LEBase64(flagMask);

        frames.push({
          id: `sim_ep${epIdx + 1}_b${band}_f${sub + 1}`,
          mjd,
          date: mjdToIsoUtc(mjd),
          epoch: `E${epIdx + 1}`,
          band,
          detector: bandSpec.detector,
          wave_um: {
            center: lambdaCenter,
            min: Number((lambdaCenter - chanWidth / 2).toFixed(4)),
            max: Number((lambdaCenter + chanWidth / 2).toFixed(4)),
          },
          shape: [height, width],
          data: b64Data,
          flags: b64Flags,
          query_xy: [centerPx, centerPx],
          predicted_xy: [Number(predPx[0].toFixed(2)), Number(predPx[1].toFixed(2))],
          wcs,
          pixels,
          flagMask,
        });
      }
    }
  });

  const catalogSources: CatalogSource[] = fieldStars.map((s) => ({
    id: s.id,
    label: s.label,
    ra: s.ra,
    dec: s.dec,
    kind: 'field',
  }));

  if (matched) {
    catalogSources.unshift({
      id: matched.id,
      label: `${matched.nameEn} (${matched.source}, Ep.${matched.epoch})`,
      ra: matched.ra,
      dec: matched.dec,
      epoch: matched.epoch,
      kind: 'target',
    });
    if (matched.referencePosition) {
      catalogSources.push({
        id: `${matched.id}_ref2010`,
        label: matched.referencePosition.labelEn,
        ra: matched.referencePosition.ra,
        dec: matched.referencePosition.dec,
        epoch: matched.referencePosition.epoch,
        kind: 'reference',
      });
    }
  }

  return {
    query: {
      ra: queryRa,
      dec: queryDec,
      size_arcsec: sizeArcsec,
      collection: 'spherex_qr3_dev_sim',
    },
    pixel_scale_arcsec: PIXEL_SCALE_ARCSEC,
    provenance: 'simulated',
    cached: false,
    flag_bits: { ...DEFAULT_FLAG_BITS },
    catalog_sources: catalogSources,
    frames,
    notes: [
      'DEV SIMULATOR ACTIVE (sim=1): Synthetic float32/uint32 cutouts generated locally for interface testing.',
    ],
  };
}
