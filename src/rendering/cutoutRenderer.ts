import { ColormapName } from '../types/spherex';

export interface RenderOptions {
  pixels: Float32Array;
  refPixels?: Float32Array | null;
  width: number;
  height: number;
  min: number;
  max: number;
  softening: number;
  colormap: ColormapName;
  isDifference: boolean;
  zoom: number;
  panX: number;
  panY: number;
  showSimulatedWatermark: boolean;
}

export interface ViewportTransform {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  pixelSize: number;
}

/**
 * Swappable renderer interface: Canvas 2D implementation is used first;
 * WebGL2 can be plugged in behind this contract later if large mosaics are introduced.
 */
export interface CutoutRenderer {
  render(canvas: HTMLCanvasElement, options: RenderOptions): ViewportTransform | null;
  dispose?(): void;
}

export function computeViewportTransform(
  canvasWidth: number,
  canvasHeight: number,
  imgWidth: number,
  imgHeight: number,
  zoom: number,
  panX: number,
  panY: number
): ViewportTransform {
  const baseSize = Math.min(canvasWidth, canvasHeight) * 0.92;
  const aspect = imgWidth / Math.max(1, imgHeight);
  const fitW = aspect >= 1 ? baseSize : baseSize * aspect;
  const fitH = aspect >= 1 ? baseSize / aspect : baseSize;
  const drawW = fitW * zoom;
  const drawH = fitH * zoom;
  const drawX = (canvasWidth - drawW) * 0.5 + panX;
  const drawY = (canvasHeight - drawH) * 0.5 + panY;
  return {
    drawX,
    drawY,
    drawW,
    drawH,
    pixelSize: drawW / Math.max(1, imgWidth),
  };
}
