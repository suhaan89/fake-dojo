import { boxBlur3, gaussianBlur } from "./blur";
import { countSet, maskBounds, open, toNormBox } from "./mask";
import { assertSameSize, lumaOf, type NormBox, type RasterImage } from "./types";

export const CHANGE_THRESHOLD = 10;
/** Below this share of changed pixels the edit counts as not applied. */
export const MIN_CHANGED_PCT = 0.1;

export interface ChangeMap {
  width: number;
  height: number;
  /** 0/1 answer key: pixels that really changed. */
  mask: Uint8Array;
  /** Blurred luma difference per pixel, 0..255. */
  magnitude: Float32Array;
  changedPct: number;
  /** Mean luma delta over the changed pixels. */
  meanDelta: number;
  changeBox: NormBox | null;
}

/**
 * Ground-truth change map between the original and the composited forgery:
 * per-pixel luma difference, 3x3 box blur, threshold at 10/255, two iterations of
 * morphological opening to remove specks. Exact because we composited the image ourselves.
 */
export function changeMap(orig: RasterImage, forged: RasterImage): ChangeMap {
  assertSameSize(orig, forged);
  const { width, height } = orig;
  const a = lumaOf(orig);
  const b = lumaOf(forged);
  const delta = new Float32Array(a.length);
  for (let i = 0; i < delta.length; i++) delta[i] = Math.abs(a[i] - b[i]);
  const magnitude = boxBlur3(delta, width, height);
  const raw = new Uint8Array(delta.length);
  for (let i = 0; i < raw.length; i++) raw[i] = magnitude[i] >= CHANGE_THRESHOLD ? 1 : 0;
  const mask = open(raw, width, height, 2);
  const changed = countSet(mask);
  let sum = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) sum += delta[i];
  const bounds = maskBounds(mask, width, height);
  return {
    width,
    height,
    mask,
    magnitude,
    changedPct: (changed / mask.length) * 100,
    meanDelta: changed ? sum / changed : 0,
    changeBox: bounds ? toNormBox(bounds, width, height) : null,
  };
}

/** Binary mask as an opaque black and white RGBA image. */
export function maskToImage(mask: Uint8Array, width: number, height: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const v = mask[p] ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** Reads a mask image back into 0/1 (any channel above mid gray counts as set). */
export function imageToMask(image: RasterImage): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) mask[p] = image.data[i] > 127 ? 1 : 0;
  return mask;
}

export const HEAT_COLOR: readonly [number, number, number] = [0xe5, 0x48, 0x4d];

/**
 * Heat overlay: signal red with alpha proportional to the blurred change magnitude,
 * fully transparent where nothing changed.
 */
export function heatOverlay(change: ChangeMap): RasterImage {
  const { width, height, mask, magnitude } = change;
  const gated = new Float32Array(magnitude.length);
  for (let i = 0; i < gated.length; i++) gated[i] = mask[i] ? magnitude[i] : 0;
  const soft = gaussianBlur(gated, width, height, 2.5);
  let peak = 0;
  for (let i = 0; i < soft.length; i++) if (soft[i] > peak) peak = soft[i];
  const data = new Uint8ClampedArray(width * height * 4);
  if (peak <= 0) return { width, height, data };
  // Normalize against the peak but keep faint changes readable.
  const scale = 1 / Math.max(24, Math.min(peak, 90));
  for (let p = 0, i = 0; p < soft.length; p++, i += 4) {
    const t = Math.min(1, soft[p] * scale);
    if (t <= 0.02) continue;
    data[i] = HEAT_COLOR[0];
    data[i + 1] = HEAT_COLOR[1];
    data[i + 2] = HEAT_COLOR[2];
    data[i + 3] = Math.round(Math.min(1, 0.25 + 0.6 * t) * 255 * Math.min(1, t * 6));
  }
  return { width, height, data };
}
