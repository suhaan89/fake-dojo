import { assertSameSize, clamp, type RasterImage } from "./types";

export interface ToneStats {
  /** Per channel gain applied to the edited pixels. */
  gain: [number, number, number];
  /** Per channel offset applied after the gain. */
  offset: [number, number, number];
  samples: number;
}

const MIN_GAIN = 0.8;
const MAX_GAIN = 1.25;

/**
 * Local color transfer. The ring just outside the edit region should be identical in both
 * images, so any difference there is global drift of the image model (slightly warmer,
 * darker, flatter). We measure per-channel mean and standard deviation of the ring in both
 * images and apply the transform that maps edit-ring statistics onto original-ring statistics
 * to every pixel inside `region`. The edit itself keeps its content; only the drift goes away,
 * which removes the visible seam at the composite border.
 */
export function matchTone(
  edit: RasterImage,
  orig: RasterImage,
  region: Uint8Array,
  ring: Uint8Array,
): { image: RasterImage; stats: ToneStats } {
  assertSameSize(edit, orig);
  const sumE = [0, 0, 0];
  const sumO = [0, 0, 0];
  const sqE = [0, 0, 0];
  const sqO = [0, 0, 0];
  let n = 0;
  for (let p = 0; p < ring.length; p++) {
    if (!ring[p]) continue;
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      const e = edit.data[i + c];
      const o = orig.data[i + c];
      sumE[c] += e;
      sumO[c] += o;
      sqE[c] += e * e;
      sqO[c] += o * o;
    }
    n++;
  }
  const gain: [number, number, number] = [1, 1, 1];
  const offset: [number, number, number] = [0, 0, 0];
  if (n < 64) return { image: edit, stats: { gain, offset, samples: n } };

  for (let c = 0; c < 3; c++) {
    const meanE = sumE[c] / n;
    const meanO = sumO[c] / n;
    const stdE = Math.sqrt(Math.max(0, sqE[c] / n - meanE * meanE));
    const stdO = Math.sqrt(Math.max(0, sqO[c] / n - meanO * meanO));
    // Flat rings carry no contrast information, so only the mean is corrected there.
    const g = stdE > 2 && stdO > 2 ? clamp(stdO / stdE, MIN_GAIN, MAX_GAIN) : 1;
    gain[c] = g;
    offset[c] = meanO - meanE * g;
  }

  const out = new Uint8ClampedArray(edit.data);
  for (let p = 0; p < region.length; p++) {
    if (!region[p]) continue;
    const i = p * 4;
    out[i] = edit.data[i] * gain[0] + offset[0];
    out[i + 1] = edit.data[i + 1] * gain[1] + offset[1];
    out[i + 2] = edit.data[i + 2] * gain[2] + offset[2];
  }
  return {
    image: { width: edit.width, height: edit.height, data: out },
    stats: { gain, offset, samples: n },
  };
}
