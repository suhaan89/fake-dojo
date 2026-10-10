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

  // Masks and change maps are mostly zero. Only the bounding box of the non-zero input,
  // grown by the kernel radius, can receive a non-zero result, so only that part is computed.
  let bx0 = width;
  let by0 = height;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (src[row + x] !== 0) {
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  if (bx1 < 0) return out;
  // Edge clamping repeats border values, so a box touching a border must keep its full extent.
  const x0 = Math.max(0, bx0 - radius);
  const x1 = Math.min(width - 1, bx1 + radius);
  const y0 = Math.max(0, by0 - radius);
  const y1 = Math.min(height - 1, by1 + radius);

  for (let y = by0; y <= by1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      let acc = 0;
      if (x - radius >= 0 && x + radius < width) {
        const base = row + x - radius;
        for (let k = 0; k < kernel.length; k++) acc += src[base + k] * kernel[k];
      } else {
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
          acc += src[row + xx] * kernel[k + radius];
        }
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    const interior = y - radius >= 0 && y + radius < height;
    for (let x = x0; x <= x1; x++) {
      let acc = 0;
      if (interior) {
        let idx = (y - radius) * width + x;
        for (let k = 0; k < kernel.length; k++, idx += width) acc += tmp[idx] * kernel[k];
      } else {
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
          acc += tmp[yy * width + x] * kernel[k + radius];
        }
      }
      out[row + x] = acc;
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
