import sharp, { type Sharp } from "sharp";
import type { RasterImage } from "../cv/types";
import { ApiError } from "./errors";

/** Largest decoded upload the server accepts. Prepared images are about 200 to 400 KB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1100;
const MIN_EDGE = 200;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Decodes base64 into bytes, rejecting data URLs, junk and oversized payloads. */
export function base64ToBuffer(data: unknown, label = "image"): Buffer {
  if (typeof data !== "string" || data.length < 64) {
    throw new ApiError("BAD_INPUT", `The ${label} is missing.`);
  }
  if (data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) {
    throw new ApiError("BAD_INPUT", `The ${label} is larger than 5 MB.`);
  }
  if (!BASE64.test(data)) {
    throw new ApiError("BAD_INPUT", `The ${label} is not valid base64.`);
  }
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError("BAD_INPUT", `The ${label} is larger than 5 MB.`);
  }
  return buffer;
}

async function toRaster(pipeline: Sharp): Promise<RasterImage> {
  const { data, info } = await pipeline.removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  };
}

/** Decodes a prepared upload into RGBA pixels and checks that its size is sane. */
export async function decodeUpload(data: unknown, label = "image"): Promise<RasterImage> {
  const buffer = base64ToBuffer(data, label);
  let image: RasterImage;
  try {
    image = await toRaster(sharp(buffer, { limitInputPixels: 4_000_000 }));
  } catch {
    throw new ApiError("BAD_INPUT", `The ${label} could not be decoded.`);
  }
  const long = Math.max(image.width, image.height);
  const short = Math.min(image.width, image.height);
  if (long > MAX_EDGE || short < MIN_EDGE) {
    throw new ApiError("BAD_INPUT", `The ${label} must be prepared to a long edge of 1024 px.`);
  }
  return image;
}

/** Decodes model output and stretches it to exactly width x height. */
export async function decodeToSize(base64: string, width: number, height: number): Promise<RasterImage> {
  return toRaster(
    sharp(Buffer.from(base64, "base64"), { limitInputPixels: 40_000_000 }).resize(width, height, {
      fit: "fill",
      kernel: "lanczos3",
    }),
  );
}

function fromRaster(image: RasterImage): Sharp {
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });
}

export async function encodeJpeg(image: RasterImage, quality: number): Promise<Buffer> {
  return fromRaster(image).removeAlpha().jpeg({ quality, chromaSubsampling: "4:2:0", mozjpeg: false }).toBuffer();
}

/** RGBA PNG, used for the transparent heat overlay. */
export async function encodePng(image: RasterImage): Promise<Buffer> {
  return fromRaster(image).png({ compressionLevel: 9 }).toBuffer();
}

/** Single-channel PNG of a 0/1 mask (white means changed). */
export async function encodeMaskPng(mask: Uint8Array, width: number, height: number): Promise<Buffer> {
  const gray = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i++) gray[i] = mask[i] ? 255 : 0;
  return sharp(gray, { raw: { width, height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
}
