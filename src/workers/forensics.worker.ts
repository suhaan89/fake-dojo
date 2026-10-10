/// <reference lib="webworker" />

import type { RasterImage } from "../lib/cv/types";
import { computeLens, type LensReply, type LensRequest, type Recompress } from "../lib/forensics/compute";

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** JPEG round trip inside the worker through an OffscreenCanvas. */
const recompress: Recompress = async (image, quality) => {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D is not available");
  const pixels = new Uint8ClampedArray(image.data.length);
  pixels.set(image.data);
  ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  const bitmap = await createImageBitmap(blob);
  ctx.clearRect(0, 0, image.width, image.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = ctx.getImageData(0, 0, image.width, image.height);
  return { width: out.width, height: out.height, data: out.data };
};

scope.onmessage = async (event: MessageEvent<LensRequest>) => {
  const { id, lens, width, height, buffer } = event.data;
  try {
    const image: RasterImage = { width, height, data: new Uint8ClampedArray(buffer) };
    const result = await computeLens(lens, image, recompress);
    const out = result.data.buffer.slice(
      result.data.byteOffset,
      result.data.byteOffset + result.data.byteLength,
    ) as ArrayBuffer;
    const reply: LensReply = { id, ok: true, width: result.width, height: result.height, buffer: out };
    scope.postMessage(reply, [out]);
  } catch (error) {
    const reply: LensReply = { id, ok: false, message: error instanceof Error ? error.message : "Lens failed" };
    scope.postMessage(reply);
  }
};
