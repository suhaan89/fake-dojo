import { describe, expect, it } from "vitest";
import { mulberry32 } from "../game/rng";
import { ALIGN_TRIGGER, findAlignment, shiftImage } from "./align";
import { boxBlur3, gaussianBlur, gaussianKernel } from "./blur";
import { addGaussianNoise, composite } from "./composite";
import { changeMap, heatOverlay, imageToMask, maskToImage } from "./diff";
import { buildEditMask, countSet, dilate, erode, feather, maskBounds, open, ringAround } from "./mask";
import { isDegeneratePolygon, polygonArea, polygonToPixels, rasterizeBox, rasterizePolygon } from "./polygon";
import { matchTone } from "./tone";
import { box2dToPixels, boxesIntersect, createImage, expandBox, lumaOf, type RasterImage } from "./types";

/** Smooth, high-contrast texture so that small shifts are measurable. */
function texture(width: number, height: number, seed: number): RasterImage {
  const random = mulberry32(seed);
  const channels = [0, 1, 2].map(() => {
    const plane = new Float32Array(width * height);
    for (let i = 0; i < plane.length; i++) plane[i] = random() * 255;
    const soft = gaussianBlur(plane, width, height, 2);
    for (let i = 0; i < soft.length; i++) soft[i] = 128 + (soft[i] - 127.5) * 6;
    return soft;
  });
  const image = createImage(width, height, [0, 0, 0, 255]);
  for (let p = 0; p < width * height; p++) {
    image.data[p * 4] = channels[0][p];
    image.data[p * 4 + 1] = channels[1][p];
    image.data[p * 4 + 2] = channels[2][p];
  }
  return image;
}

function fillRect(image: RasterImage, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = rgb[0];
      image.data[i + 1] = rgb[1];
      image.data[i + 2] = rgb[2];
    }
  }
}

describe("types", () => {
  it("converts box_2d to clamped pixels in [ymin, xmin, ymax, xmax] order", () => {
    expect(box2dToPixels([100, 200, 300, 400], 1000, 500)).toEqual({ x0: 200, y0: 50, x1: 400, y1: 150 });
    expect(box2dToPixels([-50, 900, 2000, 1200], 100, 100)).toEqual({ x0: 90, y0: 0, x1: 100, y1: 100 });
    // Swapped corners are normalized.
    expect(box2dToPixels([300, 400, 100, 200], 1000, 500)).toEqual({ x0: 200, y0: 50, x1: 400, y1: 150 });
  });

  it("detects intersections and expands boxes inside the image", () => {
    const a = { x0: 10, y0: 10, x1: 20, y1: 20 };
    expect(boxesIntersect(a, { x0: 19, y0: 19, x1: 30, y1: 30 })).toBe(true);
    expect(boxesIntersect(a, { x0: 20, y0: 10, x1: 30, y1: 20 })).toBe(false);
    expect(expandBox(a, 15, 100, 100)).toEqual({ x0: 0, y0: 0, x1: 35, y1: 35 });
  });

  it("computes luma", () => {
    const image = createImage(1, 1, [255, 255, 255, 255]);
    expect(lumaOf(image)[0]).toBeCloseTo(255, 3);
  });
});

describe("polygon", () => {
  it("rasterizes a square exactly", () => {
    const mask = rasterizePolygon([[10, 10], [30, 10], [30, 30], [10, 30]], 50, 50);
    expect(countSet(mask)).toBe(400);
    expect(mask[10 * 50 + 10]).toBe(1);
    expect(mask[9 * 50 + 10]).toBe(0);
    expect(mask[30 * 50 + 30]).toBe(0);
  });

  it("rasterizes a triangle to about half of its bounding square", () => {
    const mask = rasterizePolygon([[0, 0], [40, 0], [0, 40]], 50, 50);
    expect(countSet(mask)).toBeGreaterThan(760);
    expect(countSet(mask)).toBeLessThan(840);
  });

  it("handles polygons that leave the image", () => {
    const mask = rasterizePolygon([[-20, -20], [20, -20], [20, 20], [-20, 20]], 30, 30);
    expect(countSet(mask)).toBe(400);
  });

  it("measures area and flags degenerate polygons", () => {
    expect(polygonArea([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(100);
    expect(isDegeneratePolygon([[0, 0], [10, 0]])).toBe(true);
    expect(isDegeneratePolygon([[0, 0], [10, 0], [20, 0]])).toBe(true);
    expect(isDegeneratePolygon([[0, 0], [10, 0], [10, 10]])).toBe(false);
  });

  it("converts normalized points and skips malformed ones", () => {
    const points = polygonToPixels([[500, 250], [1000, 1000], [3] as unknown as number[]], 200, 100);
    expect(points).toEqual([[100, 25], [200, 100]]);
  });

  it("rasterizes boxes", () => {
    expect(countSet(rasterizeBox({ x0: 5, y0: 5, x1: 15, y1: 10 }, 20, 20))).toBe(50);
  });
});

describe("blur", () => {
  it("builds a normalized symmetric kernel", () => {
    const k = gaussianKernel(2);
    expect(k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(k[0]).toBeCloseTo(k[k.length - 1], 6);
  });

  it("keeps flat planes flat and preserves the mean", () => {
    const flat = new Float32Array(100).fill(7);
    expect(Array.from(gaussianBlur(flat, 10, 10, 3)).every((v) => Math.abs(v - 7) < 1e-3)).toBe(true);
    expect(Array.from(boxBlur3(flat, 10, 10)).every((v) => Math.abs(v - 7) < 1e-4)).toBe(true);
    const spike = new Float32Array(31 * 31);
    spike[15 * 31 + 15] = 100;
    const blurred = gaussianBlur(spike, 31, 31, 2);
    expect(blurred.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
    expect(blurred[15 * 31 + 15]).toBeLessThan(10);
  });
});

describe("mask", () => {
  it("dilates and erodes with a square element", () => {
    const m = new Uint8Array(21 * 21);
    m[10 * 21 + 10] = 1;
    const grown = dilate(m, 21, 21, 3);
    expect(countSet(grown)).toBe(49);
    expect(countSet(erode(grown, 21, 21, 3))).toBe(1);
    expect(countSet(erode(m, 21, 21, 1))).toBe(0);
  });

  it("treats the outside as set when eroding", () => {
    const full = new Uint8Array(100).fill(1);
    expect(countSet(erode(full, 10, 10, 2))).toBe(100);
  });

  it("opening removes specks and keeps blobs", () => {
    const m = rasterizeBox({ x0: 10, y0: 10, x1: 20, y1: 20 }, 40, 40);
    m[30 * 40 + 30] = 1;
    m[2 * 40 + 35] = 1;
    const opened = open(m, 40, 40, 2);
    expect(countSet(opened)).toBe(100);
    expect(maskBounds(opened, 40, 40)).toEqual({ x0: 10, y0: 10, x1: 20, y1: 20 });
  });

  it("builds a ring that excludes the mask", () => {
    const m = rasterizeBox({ x0: 20, y0: 20, x1: 30, y1: 30 }, 60, 60);
    const ring = ringAround(m, 60, 60, 5);
    expect(countSet(ring)).toBe(20 * 20 - 100);
    expect(ring[25 * 60 + 25]).toBe(0);
    expect(ring[17 * 60 + 25]).toBe(1);
  });

  it("feathers into alpha within [0, 1]", () => {
    const m = rasterizeBox({ x0: 30, y0: 30, x1: 70, y1: 70 }, 100, 100);
    const alpha = feather(m, 100, 100, 6);
    expect(alpha[50 * 100 + 50]).toBeGreaterThan(0.99);
    expect(alpha[5 * 100 + 5]).toBeLessThan(0.001);
    const edge = alpha[50 * 100 + 30];
    expect(edge).toBeGreaterThan(0.3);
    expect(edge).toBeLessThan(0.7);
    expect(Array.from(alpha).every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("builds an edit mask from a box or a polygon", () => {
    const box = { x0: 100, y0: 100, x1: 160, y1: 150 };
    const fromBox = buildEditMask(400, 300, box, null);
    expect(fromBox.dilation).toBe(12);
    expect(fromBox.alpha[125 * 400 + 130]).toBeGreaterThan(0.99);
    expect(fromBox.alpha[10 * 400 + 10]).toBe(0);
    expect(countSet(fromBox.dilated)).toBe((60 + 24) * (50 + 24));
    expect(countSet(fromBox.footprint)).toBeGreaterThan(countSet(fromBox.dilated));

    const triangle: [number, number][] = [[100, 100], [160, 100], [100, 150]];
    const fromPoly = buildEditMask(400, 300, box, triangle);
    expect(countSet(fromPoly.target)).toBeLessThan(countSet(fromBox.target));
    // A degenerate polygon falls back to the box.
    const fallback = buildEditMask(400, 300, box, [[1, 1], [2, 2]]);
    expect(countSet(fallback.target)).toBe(60 * 50);
  });
});

describe("composite", () => {
  it("blends by alpha", () => {
    const a = createImage(3, 1, [100, 100, 100, 255]);
    const b = createImage(3, 1, [200, 0, 50, 255]);
    const out = composite(a, b, new Float32Array([0, 0.5, 1]));
    expect(Array.from(out.data.slice(0, 4))).toEqual([100, 100, 100, 255]);
    expect(Array.from(out.data.slice(4, 8))).toEqual([150, 50, 75, 255]);
    expect(Array.from(out.data.slice(8, 12))).toEqual([200, 0, 50, 255]);
  });

  it("rejects mismatched sizes", () => {
    expect(() => composite(createImage(2, 2), createImage(3, 2), new Float32Array(4))).toThrow();
  });

  it("adds reproducible noise with the requested strength", () => {
    const base = createImage(64, 64, [128, 128, 128, 255]);
    const noisy = addGaussianNoise(base, 4, mulberry32(7));
    const again = addGaussianNoise(base, 4, mulberry32(7));
    expect(Array.from(noisy.data)).toEqual(Array.from(again.data));
    let sq = 0;
    for (let i = 0; i < noisy.data.length; i += 4) sq += (noisy.data[i] - 128) ** 2;
    const std = Math.sqrt(sq / (64 * 64));
    expect(std).toBeGreaterThan(3);
    expect(std).toBeLessThan(5);
  });
});

describe("diff", () => {
  it("finds the changed region and ignores specks", () => {
    const orig = createImage(200, 150, [120, 120, 120, 255]);
    const forged = createImage(200, 150, [120, 120, 120, 255]);
    fillRect(forged, 60, 40, 100, 80, [190, 190, 190]);
    fillRect(forged, 150, 120, 151, 121, [255, 255, 255]);
    const change = changeMap(orig, forged);
    expect(change.changedPct).toBeGreaterThan(4.8);
    expect(change.changedPct).toBeLessThan(6.2);
    expect(change.mask[60 * 200 + 80]).toBe(1);
    expect(change.mask[120 * 200 + 150]).toBe(0);
    expect(change.meanDelta).toBeGreaterThan(50);
    const box = change.changeBox!;
    expect(box.x).toBeCloseTo(60 / 200, 1);
    expect(box.y).toBeCloseTo(40 / 150, 1);
    expect(box.w).toBeCloseTo(40 / 200, 1);
    expect(box.h).toBeCloseTo(40 / 150, 1);
  });

  it("reports nothing for identical images", () => {
    const image = texture(64, 64, 3);
    const change = changeMap(image, image);
    expect(change.changedPct).toBe(0);
    expect(change.changeBox).toBeNull();
    expect(heatOverlay(change).data.every((v) => v === 0)).toBe(true);
  });

  it("renders a red heat overlay that is transparent elsewhere", () => {
    const orig = createImage(120, 120, [100, 100, 100, 255]);
    const forged = createImage(120, 120, [100, 100, 100, 255]);
    fillRect(forged, 40, 40, 80, 80, [180, 180, 180]);
    const heat = heatOverlay(changeMap(orig, forged));
    const center = (60 * 120 + 60) * 4;
    expect(Array.from(heat.data.slice(center, center + 3))).toEqual([0xe5, 0x48, 0x4d]);
    expect(heat.data[center + 3]).toBeGreaterThan(120);
    expect(heat.data[(5 * 120 + 5) * 4 + 3]).toBe(0);
  });

  it("round-trips masks through images", () => {
    const m = rasterizeBox({ x0: 2, y0: 2, x1: 6, y1: 5 }, 10, 10);
    expect(Array.from(imageToMask(maskToImage(m, 10, 10)))).toEqual(Array.from(m));
  });
});

describe("align", () => {
  const width = 160;
  const height = 120;
  const region = rasterizeBox({ x0: 60, y0: 40, x1: 100, y1: 80 }, width, height);
  const ring = ringAround(region, width, height, 24);

  it("leaves an aligned edit alone", () => {
    const orig = texture(width, height, 11);
    const edit = shiftImage(orig, 0, 0);
    const result = findAlignment(orig, edit, ring);
    expect(result).toMatchObject({ dx: 0, dy: 0, searched: false, poor: false });
    expect(result.before).toBeLessThan(ALIGN_TRIGGER);
  });

  it("recovers the shift of a displaced edit", () => {
    const orig = texture(width, height, 11);
    const edit = shiftImage(orig, 3, -2);
    fillRect(edit, 65, 45, 95, 75, [250, 10, 10]);
    const result = findAlignment(orig, edit, ring);
    expect(result.before).toBeGreaterThan(ALIGN_TRIGGER);
    expect(result.searched).toBe(true);
    expect([result.dx, result.dy]).toEqual([-3, 2]);
    expect(result.after).toBeLessThan(2);
    expect(result.poor).toBe(false);
    const fixed = shiftImage(edit, result.dx, result.dy);
    const probe = (20 * width + 30) * 4;
    expect(fixed.data[probe]).toBe(orig.data[probe]);
  });

  it("ignores a global brightness drift", () => {
    const orig = texture(width, height, 5);
    const edit = createImage(width, height, [0, 0, 0, 255]);
    for (let i = 0; i < orig.data.length; i += 4) {
      edit.data[i] = orig.data[i] * 0.5 + 60;
      edit.data[i + 1] = orig.data[i + 1] * 0.5 + 60;
      edit.data[i + 2] = orig.data[i + 2] * 0.5 + 60;
    }
    const drift = findAlignment(orig, edit, ring);
    expect([drift.dx, drift.dy]).toEqual([0, 0]);
  });

  it("flags an edit that cannot be registered", () => {
    const result = findAlignment(texture(width, height, 1), texture(width, height, 2), ring);
    expect(result.searched).toBe(true);
    expect(result.poor).toBe(true);
  });
});

describe("tone", () => {
  it("removes global color drift inside the region and keeps the edit content", () => {
    const width = 160;
    const height = 120;
    const orig = texture(width, height, 21);
    const edit = createImage(width, height, [0, 0, 0, 255]);
    for (let i = 0; i < orig.data.length; i += 4) {
      edit.data[i] = orig.data[i] * 0.9 + 14;
      edit.data[i + 1] = orig.data[i + 1] * 0.92 + 4;
      edit.data[i + 2] = orig.data[i + 2] * 0.88 + 20;
    }
    fillRect(edit, 75, 55, 85, 65, [240, 240, 20]);
    const region = rasterizeBox({ x0: 60, y0: 40, x1: 100, y1: 80 }, width, height);
    const ring = ringAround(region, width, height, 24);
    const { image, stats } = matchTone(edit, orig, region, ring);
    expect(stats.gain[0]).toBeGreaterThan(1.05);
    expect(stats.gain[0]).toBeLessThan(1.17);

    // Unedited pixel inside the region: drift is gone.
    let worst = 0;
    for (let y = 42; y < 52; y++) {
      for (let x = 62; x < 98; x++) {
        const i = (y * width + x) * 4;
        // Skip pixels that clipped in the source texture.
        if (orig.data[i] < 8 || orig.data[i] > 247) continue;
        worst = Math.max(worst, Math.abs(image.data[i] - orig.data[i]));
      }
    }
    expect(worst).toBeLessThanOrEqual(6);
    // The edit itself is still clearly different from the original.
    const editPixel = (60 * width + 80) * 4;
    expect(image.data[editPixel + 2]).toBeLessThan(60);
    // Pixels outside the region are untouched.
    expect(image.data[0]).toBe(edit.data[0]);
  });

  it("does nothing without enough ring samples", () => {
    const a = createImage(10, 10, [50, 50, 50, 255]);
    const b = createImage(10, 10, [90, 90, 90, 255]);
    const { image, stats } = matchTone(a, b, new Uint8Array(100).fill(1), new Uint8Array(100));
    expect(image).toBe(a);
    expect(stats.samples).toBe(0);
  });
});
