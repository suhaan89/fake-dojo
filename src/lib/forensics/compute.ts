import type { RasterImage } from "../cv/types";
import { ELA_QUALITY, errorLevel } from "./ela";
import type { ForensicLens } from "./index";
import { noiseResidual } from "./noise";
import { sobel } from "./sobel";

/** One more JPEG round trip of the image. Platform specific, so it is injected. */
export type Recompress = (image: RasterImage, quality: number) => Promise<RasterImage>;

/** Computes one lens. Shared by the Web Worker and the main-thread fallback. */
export async function computeLens(lens: ForensicLens, image: RasterImage, recompress: Recompress): Promise<RasterImage> {
  switch (lens) {
    case "ela":
      return errorLevel(image, await recompress(image, ELA_QUALITY));
    case "noise":
      return noiseResidual(image);
    case "edges":
      return sobel(image);
  }
}

export interface LensRequest {
  id: number;
  lens: ForensicLens;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export type LensReply =
  | { id: number; ok: true; width: number; height: number; buffer: ArrayBuffer }
  | { id: number; ok: false; message: string };
