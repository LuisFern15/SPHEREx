import { getColormapLut } from './colormaps';
import {
  CutoutRenderer,
  RenderOptions,
  ViewportTransform,
  computeViewportTransform,
} from './cutoutRenderer';

export class Canvas2DRenderer implements CutoutRenderer {
  private offscreen: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;
  private imgData: ImageData | null = null;

  constructor() {
    this.offscreen = document.createElement('canvas');
    this.offscreenCtx = this.offscreen.getContext('2d');
  }

  render(canvas: HTMLCanvasElement, options: RenderOptions): ViewportTransform | null {
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.offscreenCtx) return null;

    const {
      pixels,
      refPixels,
      width,
      height,
      min,
      max,
      softening,
      colormap,
      isDifference,
      zoom,
      panX,
      panY,
      showSimulatedWatermark,
    } = options;

    if (width <= 0 || height <= 0) return null;

    if (this.offscreen.width !== width || this.offscreen.height !== height || !this.imgData) {
      this.offscreen.width = width;
      this.offscreen.height = height;
      this.imgData = this.offscreenCtx.createImageData(width, height);
    }

    const lut = getColormapLut(colormap);
    const out = this.imgData.data;
    const s = Math.max(1e-5, softening);
    const span = Math.max(1e-5, max - min);
    const denom = Math.asinh(span / s);
    const halfSpan = Math.max(1e-5, span * 0.5);
    const diffDenom = Math.asinh(halfSpan / s);
    const total = width * height;

    // FITS / astronomical row 0 is at the bottom (North up): flip Y when mapping to canvas top-down rows
    for (let y = 0; y < height; y++) {
      const srcRow = height - 1 - y;
      for (let x = 0; x < width; x++) {
        const srcIdx = srcRow * width + x;
        const dstIdx = (y * width + x) * 4;

        let val = pixels[srcIdx];
        if (isDifference && refPixels) {
          val = val - refPixels[srcIdx];
        }

        if (!Number.isFinite(val)) {
          out[dstIdx] = 15;
          out[dstIdx + 1] = 23;
          out[dstIdx + 2] = 42;
          out[dstIdx + 3] = 255;
          continue;
        }

        let norm: number;
        if (isDifference && refPixels) {
          norm = 0.5 + 0.5 * (Math.asinh(val / s) / diffDenom);
        } else {
          norm = Math.asinh((val - min) / s) / denom;
        }

        const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm;
        const lutIdx = Math.round(clamped * 255) * 3;
        out[dstIdx] = lut[lutIdx];
        out[dstIdx + 1] = lut[lutIdx + 1];
        out[dstIdx + 2] = lut[lutIdx + 2];
        out[dstIdx + 3] = 255;
      }
    }

    this.offscreenCtx.putImageData(this.imgData, 0, 0);

    // Clear main canvas
    ctx.save();
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const transform = computeViewportTransform(
      canvas.width,
      canvas.height,
      width,
      height,
      zoom,
      panX,
      panY
    );

    // Nearest-neighbor pixel rendering (no smoothing)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.offscreen,
      transform.drawX,
      transform.drawY,
      transform.drawW,
      transform.drawH
    );

    // Subtle cutout boundary frame
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(transform.drawX) + 0.5,
      Math.round(transform.drawY) + 0.5,
      Math.round(transform.drawW),
      Math.round(transform.drawH)
    );

    // Explicit watermark directly over the image whenever dev simulator is active
    if (showSimulatedWatermark) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(transform.drawX, transform.drawY, transform.drawW, transform.drawH);
      ctx.clip();

      const cx = transform.drawX + transform.drawW * 0.5;
      const cy = transform.drawY + transform.drawH * 0.5;
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 7);

      const fontSize = Math.max(13, Math.round(Math.min(transform.drawW, transform.drawH) * 0.085));
      ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = 'rgba(7, 9, 14, 0.52)';
      const boxW = fontSize * 12.5;
      const boxH = fontSize * 1.9;
      ctx.fillRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH);

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH);

      ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
      ctx.fillText('SIMULADO / SIMULATED', 0, 0);
      ctx.restore();
    }

    ctx.restore();
    return transform;
  }

  dispose() {
    this.imgData = null;
    this.offscreenCtx = null;
  }
}
