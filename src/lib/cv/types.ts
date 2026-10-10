// Shared raster types for the pure image math. Works on the server (sharp raw buffers)
// and in the browser (canvas ImageData) without any platform dependency.

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

/** Pixel rectangle, x1 and y1 exclusive. */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Rectangle normalized to 0..1 of the image size. */
export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Point = [number, number];

export function createImage(
  width: number,
  height: number,
  fill?: readonly [number, number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { width, height, data };
}

export function cloneImage(image: RasterImage): RasterImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

export function assertSameSize(
  a: { width: number; height: number },
  b: { width: number; height: number },
): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Image size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
}

/** Rec. 601 luma per pixel, 0..255. */
export function lumaOf(image: RasterImage): Float32Array {
  const { data } = image;
  const out = new Float32Array(image.width * image.height);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Converts a model box_2d ([ymin, xmin, ymax, xmax], 0..1000) into a clamped pixel box. */
export function box2dToPixels(box2d: readonly number[], width: number, height: number): PixelBox {
  const [ya, xa, yb, xb] = [0, 1, 2, 3].map((i) => clamp(Number(box2d[i]) || 0, 0, 1000));
  const ymin = Math.min(ya, yb);
  const ymax = Math.max(ya, yb);
  const xmin = Math.min(xa, xb);
  const xmax = Math.max(xa, xb);
  return {
    x0: Math.floor((xmin / 1000) * width),
    y0: Math.floor((ymin / 1000) * height),
    x1: Math.ceil((xmax / 1000) * width),
    y1: Math.ceil((ymax / 1000) * height),
  };
}

export function boxArea(box: PixelBox): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

export function boxesIntersect(a: PixelBox, b: PixelBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export function expandBox(box: PixelBox, by: number, width: number, height: number): PixelBox {
  return {
    x0: clamp(box.x0 - by, 0, width),
    y0: clamp(box.y0 - by, 0, height),
    x1: clamp(box.x1 + by, 0, width),
    y1: clamp(box.y1 + by, 0, height),
  };
}
