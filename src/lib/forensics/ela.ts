import { assertSameSize, type RasterImage } from "../cv/types";

export const ELA_QUALITY = 0.9;
export const ELA_GAIN = 20;

export const ELA_CAPTION =
  "Areas saved a different number of times compress differently. Bright patches can hint at pasted content. Edges and fine textures are naturally brighter, so this is a clue, not proof.";

/**
 * Error Level Analysis. `recompressed` is the same image after one more JPEG round trip
 * at quality 0.90 (done by the caller, since encoding is platform specific). The result is
 * the per-channel absolute difference, amplified and clamped.
 */
export function errorLevel(image: RasterImage, recompressed: RasterImage, gain = ELA_GAIN): RasterImage {
  assertSameSize(image, recompressed);
  const out = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.abs(image.data[i] - recompressed.data[i]) * gain;
    out[i + 1] = Math.abs(image.data[i + 1] - recompressed.data[i + 1]) * gain;
    out[i + 2] = Math.abs(image.data[i + 2] - recompressed.data[i + 2]) * gain;
    out[i + 3] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}

/** Mean brightness (0..255) of an RGBA image inside a pixel rectangle. */
export function meanBrightness(
  image: RasterImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(image.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(image.width, x1); x++) {
      const i = (y * image.width + x) * 4;
      sum += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
      n++;
    }
  }
  return n ? sum / n : 0;
}
