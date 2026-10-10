// Shared crop math for the browser (canvas) and Node (sharp) versions of image preparation.

export const ASPECT_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const LONG_EDGE = 1024;
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const JPEG_QUALITY = 0.92;

export function ratioValue(aspect: AspectRatio): number {
  const [w, h] = aspect.split(":").map(Number);
  return w / h;
}

/** The supported aspect ratio closest to width / height (smallest relative error). */
export function nearestAspect(width: number, height: number): AspectRatio {
  const actual = Math.log(width / height);
  let best: AspectRatio = ASPECT_RATIOS[0];
  let bestError = Infinity;
  for (const aspect of ASPECT_RATIOS) {
    const error = Math.abs(Math.log(ratioValue(aspect)) - actual);
    if (error < bestError) {
      bestError = error;
      best = aspect;
    }
  }
  return best;
}

export interface CropPlan {
  aspectRatio: AspectRatio;
  /** Source rectangle to keep, in source pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Output size after resizing. */
  width: number;
  height: number;
}

/** Output size for an aspect ratio with the long edge at `longEdge` pixels. */
export function targetSize(aspect: AspectRatio, longEdge = LONG_EDGE): { width: number; height: number } {
  const ratio = ratioValue(aspect);
  return ratio >= 1
    ? { width: longEdge, height: Math.round(longEdge / ratio) }
    : { width: Math.round(longEdge * ratio), height: longEdge };
}

/**
 * Center-crops to the nearest supported aspect ratio and resizes so the long edge is
 * `longEdge` pixels. Small images are scaled up so every forge works at the same resolution.
 */
export function planCrop(sourceWidth: number, sourceHeight: number, longEdge = LONG_EDGE): CropPlan {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error("Image has no pixels");
  }
  const aspectRatio = nearestAspect(sourceWidth, sourceHeight);
  const ratio = ratioValue(aspectRatio);
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceWidth / sourceHeight > ratio) {
    sw = Math.min(sourceWidth, Math.max(1, Math.round(sourceHeight * ratio)));
  } else {
    sh = Math.min(sourceHeight, Math.max(1, Math.round(sourceWidth / ratio)));
  }
  const sx = Math.floor((sourceWidth - sw) / 2);
  const sy = Math.floor((sourceHeight - sh) / 2);
  return { aspectRatio, sx, sy, sw, sh, ...targetSize(aspectRatio, longEdge) };
}

export interface PreparedImage {
  /** Base64 JPEG without a data URL prefix. */
  data: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  aspectRatio: AspectRatio;
}
