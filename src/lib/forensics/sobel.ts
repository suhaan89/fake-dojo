import { lumaOf, type RasterImage } from "../cv/types";

export const SOBEL_CAPTION = "Seams and unnaturally clean edges around inserted objects.";

/** Sobel gradient magnitude per pixel (unscaled), edges clamped. */
export function sobelMagnitude(image: RasterImage): Float32Array {
  const { width, height } = image;
  const l = lumaOf(image);
  const out = new Float32Array(l.length);
  for (let y = 0; y < height; y++) {
    const ya = (y > 0 ? y - 1 : y) * width;
    const yc = y * width;
    const yb = (y < height - 1 ? y + 1 : y) * width;
    for (let x = 0; x < width; x++) {
      const xa = x > 0 ? x - 1 : x;
      const xb = x < width - 1 ? x + 1 : x;
      const gx =
        l[ya + xb] + 2 * l[yc + xb] + l[yb + xb] - l[ya + xa] - 2 * l[yc + xa] - l[yb + xa];
      const gy =
        l[yb + xa] + 2 * l[yb + x] + l[yb + xb] - l[ya + xa] - 2 * l[ya + x] - l[ya + xb];
      out[yc + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/** Edge map as a grayscale image: bright lines on ink. */
export function sobel(image: RasterImage): RasterImage {
  const mag = sobelMagnitude(image);
  const data = new Uint8ClampedArray(image.width * image.height * 4);
  for (let p = 0, i = 0; p < mag.length; p++, i += 4) {
    const v = Math.min(255, 18 + mag[p] * 0.75);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { width: image.width, height: image.height, data };
}
