import { gaussianBlur } from "./blur";
import { isDegeneratePolygon, rasterizeBox, rasterizePolygon } from "./polygon";
import type { NormBox, PixelBox, Point } from "./types";

/**
 * One separable pass: marks a pixel when any pixel equal to `wanted` lies within
 * `radius` along the pass direction. Pixels outside the image never match.
 */
function near(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
  wanted: 0 | 1,
): Uint8Array {
  const out = new Uint8Array(src.length);
  const lines = horizontal ? height : width;
  const len = horizontal ? width : height;
  const step = horizontal ? 1 : width;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width : line;
    let count = 0;
    for (let i = 0; i <= Math.min(radius, len - 1); i++) {
      if (src[base + i * step] === wanted) count++;
    }
    for (let i = 0; i < len; i++) {
      out[base + i * step] = count > 0 ? 1 : 0;
      const leave = i - radius;
      const enter = i + radius + 1;
      if (leave >= 0 && src[base + leave * step] === wanted) count--;
      if (enter < len && src[base + enter * step] === wanted) count++;
    }
  }
  return out;
}

/** Square dilation by `radius` pixels (separable). */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  return near(near(mask, width, height, radius, true, 1), width, height, radius, false, 1);
}

/** Square erosion by `radius` pixels. Pixels outside the image count as set. */
export function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  // A pixel survives when no zero lies in its window: spread the zeros, then invert.
  const zeroRow = near(mask, width, height, radius, true, 0);
  const inverted = new Uint8Array(mask.length);
  for (let i = 0; i < inverted.length; i++) inverted[i] = zeroRow[i] ? 0 : 1;
  const zeroBoth = near(inverted, width, height, radius, false, 0);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = zeroBoth[i] ? 0 : 1;
  return out;
}

/**
 * Morphological opening: `iterations` erosions with a 3x3 element followed by the same
 * number of dilations. Removes specks narrower than 2 * iterations + 1 pixels.
 */
export function open(mask: Uint8Array, width: number, height: number, iterations = 1): Uint8Array {
  return dilate(erode(mask, width, height, iterations), width, height, iterations);
}

export function countSet(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

export function maskBounds(mask: Uint8Array, width: number, height: number): PixelBox | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

export function toNormBox(box: PixelBox, width: number, height: number): NormBox {
  return {
    x: box.x0 / width,
    y: box.y0 / height,
    w: (box.x1 - box.x0) / width,
    h: (box.y1 - box.y0) / height,
  };
}

/** The band of `ringWidth` pixels just outside `mask`. */
export function ringAround(mask: Uint8Array, width: number, height: number, ringWidth: number): Uint8Array {
  const outer = dilate(mask, width, height, ringWidth);
  for (let i = 0; i < outer.length; i++) if (mask[i]) outer[i] = 0;
  return outer;
}

/** Soft alpha in [0, 1] from a binary mask. */
export function feather(mask: Uint8Array, width: number, height: number, sigma: number): Float32Array {
  const plane = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) plane[i] = mask[i];
  const blurred = gaussianBlur(plane, width, height, sigma);
  for (let i = 0; i < blurred.length; i++) {
    blurred[i] = blurred[i] < 0 ? 0 : blurred[i] > 1 ? 1 : blurred[i];
  }
  return blurred;
}

export interface EditMask {
  /** Target region as planned (polygon if usable, else box). */
  target: Uint8Array;
  /** Target dilated by the safety margin. */
  dilated: Uint8Array;
  /** Everything the composite may touch (alpha above zero). */
  footprint: Uint8Array;
  /** Feathered alpha used for compositing. */
  alpha: Float32Array;
  dilation: number;
  sigma: number;
}

/**
 * Builds the compositing mask: polygon if usable, else the box; dilated by
 * max(12 px, 3% of min(W, H)); feathered with a Gaussian (sigma 6 to 10 px).
 */
export function buildEditMask(
  width: number,
  height: number,
  box: PixelBox,
  polygon: readonly Point[] | null,
): EditMask {
  const usePolygon = polygon !== null && !isDegeneratePolygon(polygon);
  const target = usePolygon ? rasterizePolygon(polygon, width, height) : rasterizeBox(box, width, height);
  const minSide = Math.min(width, height);
  const dilation = Math.max(12, Math.round(minSide * 0.03));
  const sigma = Math.min(10, Math.max(6, minSide * 0.008));
  const dilated = dilate(target, width, height, dilation);
  const alpha = feather(dilated, width, height, sigma);
  const footprint = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) footprint[i] = alpha[i] > 0.004 ? 1 : 0;
  return { target, dilated, footprint, alpha, dilation, sigma };
}
