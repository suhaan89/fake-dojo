import { clamp, type PixelBox, type Point } from "./types";

/** Converts model polygon points ([[x, y], ...], 0..1000) into pixel coordinates. */
export function polygonToPixels(
  polygon: readonly (readonly number[])[],
  width: number,
  height: number,
): Point[] {
  const points: Point[] = [];
  for (const p of polygon) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push([(clamp(x, 0, 1000) / 1000) * width, (clamp(y, 0, 1000) / 1000) * height]);
  }
  return points;
}

/** Shoelace area in square pixels. */
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
}

/** A polygon is degenerate when it cannot enclose a meaningful area. */
export function isDegeneratePolygon(points: readonly Point[], minArea = 16): boolean {
  return points.length < 3 || polygonArea(points) < minArea;
}

/** Even-odd scanline fill, sampling at pixel centers. Returns a 0/1 mask. */
export function rasterizePolygon(points: readonly Point[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (points.length < 3) return mask;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yStart = clamp(Math.floor(minY), 0, height - 1);
  const yEnd = clamp(Math.ceil(maxY), 0, height - 1);
  const crossings: number[] = [];
  for (let y = yStart; y <= yEnd; y++) {
    const cy = y + 0.5;
    crossings.length = 0;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) {
        crossings.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const xa = clamp(Math.ceil(crossings[i] - 0.5), 0, width);
      const xb = clamp(Math.floor(crossings[i + 1] - 0.5), -1, width - 1);
      for (let x = xa; x <= xb; x++) mask[y * width + x] = 1;
    }
  }
  return mask;
}

export function rasterizeBox(box: PixelBox, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const x0 = clamp(Math.round(box.x0), 0, width);
  const x1 = clamp(Math.round(box.x1), 0, width);
  const y0 = clamp(Math.round(box.y0), 0, height);
  const y1 = clamp(Math.round(box.y1), 0, height);
  for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
  return mask;
}
