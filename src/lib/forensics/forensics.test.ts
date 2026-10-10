import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createImage, type RasterImage } from "../cv/types";
import { mulberry32 } from "../game/rng";
import { ramp, rampTable } from "./colormap";
import { errorLevel, meanBrightness } from "./ela";
import { median3, noiseMap, noiseResidual } from "./noise";
import { sobel, sobelMagnitude } from "./sobel";

const SIZE = 160;
const SQUARE = { x0: 56, y0: 56, x1: 104, y1: 104 };

async function jpegRoundTrip(image: RasterImage, quality: number): Promise<RasterImage> {
  const jpeg = await sharp(Buffer.from(image.data.buffer), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .removeAlpha()
    .jpeg({ quality })
    .toBuffer();
  const { data, info } = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

/** Flat gray image that went through JPEG once, with a freshly pasted noisy square. */
async function pastedSquare(): Promise<RasterImage> {
  const flat = createImage(SIZE, SIZE, [128, 128, 128, 255]);
  const saved = await jpegRoundTrip(flat, 95);
  const random = mulberry32(42);
  for (let y = SQUARE.y0; y < SQUARE.y1; y++) {
    for (let x = SQUARE.x0; x < SQUARE.x1; x++) {
      const i = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) saved.data[i + c] = 128 + (random() - 0.5) * 80;
    }
  }
  return saved;
}

describe("forensic lenses", () => {
  it("ELA is clearly brighter inside a pasted noisy square", async () => {
    const image = await pastedSquare();
    const ela = errorLevel(image, await jpegRoundTrip(image, 90));
    const inside = meanBrightness(ela, SQUARE.x0 + 4, SQUARE.y0 + 4, SQUARE.x1 - 4, SQUARE.y1 - 4);
    const outside = meanBrightness(ela, 0, 0, 40, 40);
    expect(inside).toBeGreaterThan(60);
    expect(inside).toBeGreaterThan(outside * 4 + 20);
    expect(ela.data[3]).toBe(255);
  });

  it("noise residual is clearly higher inside the square", async () => {
    const image = await pastedSquare();
    const map = noiseMap(image);
    expect(map.cols).toBe(SIZE / 8);
    const at = (x: number, y: number) => map.blocks[Math.floor(y / 8) * map.cols + Math.floor(x / 8)];
    const inside = (at(64, 64) + at(80, 80) + at(96, 72)) / 3;
    const outside = (at(8, 8) + at(140, 20) + at(20, 140)) / 3;
    expect(inside).toBeGreaterThan(3);
    expect(inside).toBeGreaterThan(outside * 5 + 1);

    const colored = noiseResidual(image);
    const hot = (80 * SIZE + 80) * 4;
    const cold = (8 * SIZE + 8) * 4;
    expect(colored.data[hot]).toBeGreaterThan(colored.data[cold] + 80);
  });

  it("median filter removes salt noise", () => {
    const plane = new Float32Array(25).fill(10);
    plane[12] = 255;
    expect(Array.from(median3(plane, 5, 5)).every((v) => v === 10)).toBe(true);
  });

  it("Sobel responds to edges and stays quiet on flat areas", () => {
    const image = createImage(40, 40, [20, 20, 20, 255]);
    for (let y = 0; y < 40; y++) {
      for (let x = 20; x < 40; x++) {
        const i = (y * 40 + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 220;
      }
    }
    const mag = sobelMagnitude(image);
    expect(mag[20 * 40 + 20]).toBeGreaterThan(500);
    expect(mag[20 * 40 + 5]).toBe(0);
    const edges = sobel(image);
    expect(edges.data[(20 * 40 + 20) * 4]).toBe(255);
    expect(edges.data[(20 * 40 + 5) * 4]).toBeLessThan(30);
  });

  it("color ramp runs from ink to signal red", () => {
    expect(ramp(0)).toEqual([0x12, 0x12, 0x12]);
    expect(ramp(1)).toEqual([0xe5, 0x48, 0x4d]);
    expect(ramp(-3)).toEqual(ramp(0));
    expect(ramp(Number.NaN)).toEqual(ramp(0));
    expect(rampTable()).toHaveLength(768);
  });
});
