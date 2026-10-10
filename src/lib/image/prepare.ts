import type { RasterImage } from "../cv/types";
import { JPEG_QUALITY, MAX_INPUT_BYTES, planCrop, type PreparedImage } from "./crop";

export class PrepareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrepareError";
  }
}

const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif)$/i;

export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,image/heic,image/heif";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new PrepareError("The photo could not be read."));
    reader.onload = () => {
      const text = String(reader.result);
      resolve(text.slice(text.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PrepareError("The photo could not be encoded."))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Prepares a photo in the browser before anything is uploaded: applies the EXIF orientation,
 * center-crops to the nearest supported aspect ratio, resizes to a 1024 px long edge and
 * re-encodes as JPEG through a canvas. The re-encode drops all metadata, including GPS.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new PrepareError("That photo is larger than 15 MB. Please choose a smaller one.");
  }
  if (file.type && !ACCEPTED.test(file.type)) {
    throw new PrepareError("Please choose a JPEG, PNG or WebP photo.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PrepareError("This browser cannot open that photo. Try a JPEG or PNG.");
  }
  try {
    const plan = planCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PrepareError("This browser cannot process images.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.width, plan.height);
    const blob = await canvasToJpeg(canvas, JPEG_QUALITY);
    return {
      data: await blobToBase64(blob),
      mimeType: "image/jpeg",
      width: plan.width,
      height: plan.height,
      aspectRatio: plan.aspectRatio,
    };
  } finally {
    bitmap.close();
  }
}

export function jpegUrl(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

export function pngUrl(base64: string): string {
  return `data:image/png;base64,${base64}`;
}

/** Decodes any image URL into RGBA pixels through a canvas. */
export async function loadPixels(url: string): Promise<RasterImage> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new PrepareError("An image could not be loaded.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PrepareError("This browser cannot process images.");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: data.width, height: data.height, data: data.data };
}

/** Loads a mask image (white means changed) as a 0/1 array. */
export async function loadMask(url: string): Promise<{ mask: Uint8Array; width: number; height: number }> {
  const pixels = await loadPixels(url);
  const mask = new Uint8Array(pixels.width * pixels.height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) mask[p] = pixels.data[i] > 127 ? 1 : 0;
  return { mask, width: pixels.width, height: pixels.height };
}

/** Encodes RGBA pixels as a PNG object URL. The caller revokes it when done. */
export async function pixelsToObjectUrl(image: RasterImage): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PrepareError("This browser cannot process images.");
  const clamped = new Uint8ClampedArray(image.data.length);
  clamped.set(image.data);
  ctx.putImageData(new ImageData(clamped, image.width, image.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new PrepareError("An image could not be encoded.");
  return URL.createObjectURL(blob);
}
