import { lumaOf, type RasterImage } from "../cv/types";
import { rampTable } from "./colormap";

export const NOISE_BLOCK = 8;

export const NOISE_CAPTION =
  "Every camera leaves a noise fingerprint. Generated patches are often smoother or noisier than their surroundings.";

/** 3x3 median of a single-channel plane, edges clamped. */
export function median3(src: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(src.length);
  const w = new Float32Array(9);
  for (let y = 0; y < height; y++) {
    const ya = y > 0 ? y - 1 : y;
    const yb = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x++) {
      const xa = x > 0 ? x - 1 : x;
      const xb = x < width - 1 ? x + 1 : x;
      w[0] = src[ya * width + xa];
      w[1] = src[ya * width + x];
      w[2] = src[ya * width + xb];
      w[3] = src[y * width + xa];
      w[4] = src[y * width + x];
      w[5] = src[y * width + xb];
      w[6] = src[yb * width + xa];
      w[7] = src[yb * width + x];
      w[8] = src[yb * width + xb];
      // Partial selection sort up to the middle element.
      for (let i = 0; i <= 4; i++) {
        let m = i;
        for (let j = i + 1; j < 9; j++) if (w[j] < w[m]) m = j;
        const t = w[i];
        w[i] = w[m];
        w[m] = t;
      }
      out[y * width + x] = w[4];
    }
  }
  return out;
}

export interface NoiseMap {
  cols: number;
  rows: number;
  block: number;
  /** Standard deviation of the noise residual per block. */
  blocks: Float32Array;
  /** Value used as the top of the color scale (98th percentile). */
  scale: number;
}

/**
 * Noise residual map: luma minus its 3x3 median, absolute value, then the local
 * standard deviation over 8x8 blocks.
 */
export function noiseMap(image: RasterImage, block = NOISE_BLOCK): NoiseMap {
  const { width, height } = image;
  const luma = lumaOf(image);
  const med = median3(luma, width, height);
  const residual = new Float32Array(luma.length);
  for (let i = 0; i < residual.length; i++) residual[i] = Math.abs(luma[i] - med[i]);

  const cols = Math.ceil(width / block);
  const rows = Math.ceil(height / block);
  const blocks = new Float32Array(cols * rows);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0;
      let sq = 0;
      let n = 0;
      const yEnd = Math.min(height, (by + 1) * block);
      const xEnd = Math.min(width, (bx + 1) * block);
      for (let y = by * block; y < yEnd; y++) {
        for (let x = bx * block; x < xEnd; x++) {
          const v = residual[y * width + x];
          sum += v;
          sq += v * v;
          n++;
        }
      }
      const mean = sum / n;
      blocks[by * cols + bx] = Math.sqrt(Math.max(0, sq / n - mean * mean));
    }
  }
  const sorted = Float32Array.from(blocks).sort();
  const scale = Math.max(0.5, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))]);
  return { cols, rows, block, blocks, scale };
}

/** Colorizes a noise map back to the full image size. */
export function noiseImage(map: NoiseMap, width: number, height: number): RasterImage {
  const table = rampTable();
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const by = Math.min(map.rows - 1, (y / map.block) | 0);
    for (let x = 0; x < width; x++) {
      const bx = Math.min(map.cols - 1, (x / map.block) | 0);
      const t = Math.min(1, map.blocks[by * map.cols + bx] / map.scale);
      const k = Math.round(t * 255) * 3;
      const i = (y * width + x) * 4;
      data[i] = table[k];
      data[i + 1] = table[k + 1];
      data[i + 2] = table[k + 2];
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function noiseResidual(image: RasterImage): RasterImage {
  return noiseImage(noiseMap(image), image.width, image.height);
}
