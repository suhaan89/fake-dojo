import { assertSameSize, type RasterImage } from "./types";

/** out = orig * (1 - alpha) + edit * alpha, per channel. Alpha channel stays opaque. */
export function composite(orig: RasterImage, edit: RasterImage, alpha: Float32Array): RasterImage {
  assertSameSize(orig, edit);
  if (alpha.length !== orig.width * orig.height) {
    throw new Error("Alpha plane does not match the image size");
  }
  const out = new Uint8ClampedArray(orig.data.length);
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    const a = alpha[p];
    if (a <= 0) {
      out[i] = orig.data[i];
      out[i + 1] = orig.data[i + 1];
      out[i + 2] = orig.data[i + 2];
    } else {
      const b = 1 - a;
      out[i] = orig.data[i] * b + edit.data[i] * a;
      out[i + 1] = orig.data[i + 1] * b + edit.data[i + 1] * a;
      out[i + 2] = orig.data[i + 2] * b + edit.data[i + 2] * a;
    }
    out[i + 3] = 255;
  }
  return { width: orig.width, height: orig.height, data: out };
}

/**
 * Adds zero-mean Gaussian noise to every channel. `random` must return uniform values
 * in [0, 1); passing a seeded generator keeps the result reproducible.
 */
export function addGaussianNoise(image: RasterImage, sigma: number, random: () => number): RasterImage {
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < out.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      // Box-Muller transform.
      const u = Math.max(random(), 1e-9);
      const v = random();
      const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      out[i + c] = image.data[i + c] + n * sigma;
    }
  }
  return { width: image.width, height: image.height, data: out };
}
