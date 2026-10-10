import { assertSameSize, lumaOf, type RasterImage } from "./types";

/** Above this mean luma difference in the ring the edit is treated as misaligned. */
export const ALIGN_TRIGGER = 12;
/** Still above this after the search: the route should retry the edit. */
export const ALIGN_POOR = 20;
const MAX_SHIFT = 8;

export interface Alignment {
  dx: number;
  dy: number;
  /** Mean absolute luma difference in the ring before the search. */
  before: number;
  /** Same measure after applying (dx, dy). */
  after: number;
  searched: boolean;
  poor: boolean;
}

/**
 * Mean |orig(x, y) - edit(x - dx, y - dy)| over the ring pixels, with each plane's
 * ring mean removed so a global brightness drift does not look like a misalignment.
 */
export function ringDifference(
  origLuma: Float32Array,
  editLuma: Float32Array,
  ringIndex: Int32Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
): number {
  let sumO = 0;
  let sumE = 0;
  let n = 0;
  for (let k = 0; k < ringIndex.length; k++) {
    const i = ringIndex[k];
    const x = (i % width) - dx;
    const y = ((i / width) | 0) - dy;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    sumO += origLuma[i];
    sumE += editLuma[y * width + x];
    n++;
  }
  if (n === 0) return 0;
  const bias = (sumE - sumO) / n;
  let acc = 0;
  for (let k = 0; k < ringIndex.length; k++) {
    const i = ringIndex[k];
    const x = (i % width) - dx;
    const y = ((i / width) | 0) - dy;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    acc += Math.abs(origLuma[i] - (editLuma[y * width + x] - bias));
  }
  return acc / n;
}

function indicesOf(mask: Uint8Array, stride: number): Int32Array {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  const all = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) all[k++] = i;
  if (stride <= 1) return all;
  return all.filter((_, idx) => idx % stride === 0);
}

/**
 * Finds the integer shift (dx, dy) in [-8, 8] that best registers the edited image to the
 * original inside the ring around the edit region. Coarse step 2, then a step 1 refinement.
 */
export function findAlignment(orig: RasterImage, edit: RasterImage, ring: Uint8Array): Alignment {
  assertSameSize(orig, edit);
  const { width, height } = orig;
  const origLuma = lumaOf(orig);
  const editLuma = lumaOf(edit);
  // Sub-sample very large rings to keep the search fast; the measure is a mean anyway.
  const total = indicesOf(ring, 1);
  const ringIndex = total.length > 60000 ? indicesOf(ring, Math.ceil(total.length / 60000)) : total;
  const cost = (dx: number, dy: number) =>
    ringDifference(origLuma, editLuma, ringIndex, width, height, dx, dy);

  const before = cost(0, 0);
  if (ringIndex.length === 0 || before <= ALIGN_TRIGGER) {
    return { dx: 0, dy: 0, before, after: before, searched: false, poor: false };
  }

  let best = { dx: 0, dy: 0, value: before };
  for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy += 2) {
    for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx += 2) {
      const value = cost(dx, dy);
      if (value < best.value) best = { dx, dy, value };
    }
  }
  const center = { ...best };
  for (let dy = center.dy - 1; dy <= center.dy + 1; dy++) {
    for (let dx = center.dx - 1; dx <= center.dx + 1; dx++) {
      if (Math.abs(dx) > MAX_SHIFT || Math.abs(dy) > MAX_SHIFT) continue;
      const value = cost(dx, dy);
      if (value < best.value) best = { dx, dy, value };
    }
  }
  return {
    dx: best.dx,
    dy: best.dy,
    before,
    after: best.value,
    searched: true,
    poor: best.value > ALIGN_POOR,
  };
}

/** Moves image content by (dx, dy) pixels; uncovered borders repeat the nearest edge pixel. */
export function shiftImage(image: RasterImage, dx: number, dy: number): RasterImage {
  if (dx === 0 && dy === 0) return image;
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    const sy = y - dy < 0 ? 0 : y - dy >= height ? height - 1 : y - dy;
    for (let x = 0; x < width; x++) {
      const sx = x - dx < 0 ? 0 : x - dx >= width ? width - 1 : x - dx;
      const s = (sy * width + sx) * 4;
      const d = (y * width + x) * 4;
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = data[s + 3];
    }
  }
  return { width, height, data: out };
}
