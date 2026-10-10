/** Normalized 1D Gaussian kernel with radius ceil(3 * sigma). */
export function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return kernel;
}

/** Separable Gaussian blur on a single-channel float plane, edges clamped. */
export function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0) return new Float32Array(src);
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        acc += src[row + xx] * kernel[k + radius];
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        acc += tmp[yy * width + x] * kernel[k + radius];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

/** 3x3 box blur, edges clamped. */
export function boxBlur3(src: Float32Array, width: number, height: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const l = x > 0 ? x - 1 : x;
      const r = x < width - 1 ? x + 1 : x;
      tmp[row + x] = (src[row + l] + src[row + x] + src[row + r]) / 3;
    }
  }
  for (let y = 0; y < height; y++) {
    const u = (y > 0 ? y - 1 : y) * width;
    const d = (y < height - 1 ? y + 1 : y) * width;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      out[row + x] = (tmp[u + x] + tmp[row + x] + tmp[d + x]) / 3;
    }
  }
  return out;
}
