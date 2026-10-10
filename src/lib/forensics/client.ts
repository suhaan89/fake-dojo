import type { RasterImage } from "../cv/types";
import { loadPixels, pixelsToObjectUrl } from "../image/prepare";
import { computeLens, type LensReply, type LensRequest, type Recompress } from "./compute";
import type { ForensicLens } from "./index";

/** JPEG round trip on the main thread, used when no worker is available. */
const recompressOnMainThread: Recompress = async (image, quality) => {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  const pixels = new Uint8ClampedArray(image.data.length);
  pixels.set(image.data);
  ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("JPEG encoding failed");
  const url = URL.createObjectURL(blob);
  try {
    return await loadPixels(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Computes forensic lenses for one image. Each lens is computed once and cached.
 * The work runs in a Web Worker; if the worker cannot start or fails, the same
 * functions run on the main thread.
 */
export class LensRunner {
  private readonly cache = new Map<ForensicLens, Promise<string>>();
  private readonly urls: string[] = [];
  private pixels: Promise<RasterImage> | null = null;
  private worker: Worker | null = null;
  private workerBroken = false;
  private nextId = 1;
  private disposed = false;

  constructor(private readonly imageUrl: string) {}

  /** Object URL of the rendered lens. Valid until dispose(). */
  get(lens: ForensicLens): Promise<string> {
    let pending = this.cache.get(lens);
    if (!pending) {
      pending = this.compute(lens).then(async (image) => {
        const url = await pixelsToObjectUrl(image);
        if (this.disposed) URL.revokeObjectURL(url);
        else this.urls.push(url);
        return url;
      });
      // A failed lens may be requested again later.
      pending.catch(() => this.cache.delete(lens));
      this.cache.set(lens, pending);
    }
    return pending;
  }

  private source(): Promise<RasterImage> {
    this.pixels ??= loadPixels(this.imageUrl);
    return this.pixels;
  }

  private async compute(lens: ForensicLens): Promise<RasterImage> {
    const image = await this.source();
    if (!this.workerBroken && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      try {
        return await this.viaWorker(lens, image);
      } catch {
        this.workerBroken = true;
        this.worker?.terminate();
        this.worker = null;
      }
    }
    return computeLens(lens, image, recompressOnMainThread);
  }

  private viaWorker(lens: ForensicLens, image: RasterImage): Promise<RasterImage> {
    this.worker ??= new Worker(new URL("../../workers/forensics.worker.ts", import.meta.url), { type: "module" });
    const worker = this.worker;
    const id = this.nextId++;
    return new Promise<RasterImage>((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      const onMessage = (event: MessageEvent<LensReply>) => {
        if (event.data.id !== id) return;
        cleanup();
        if (event.data.ok) {
          resolve({
            width: event.data.width,
            height: event.data.height,
            data: new Uint8ClampedArray(event.data.buffer),
          });
        } else {
          reject(new Error(event.data.message));
        }
      };
      const onError = () => {
        cleanup();
        reject(new Error("The forensics worker failed"));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      // The worker gets its own copy so the source pixels stay usable for other lenses.
      const copy = image.data.slice().buffer;
      const request: LensRequest = { id, lens, width: image.width, height: image.height, buffer: copy };
      worker.postMessage(request, [copy]);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.length = 0;
    this.cache.clear();
  }
}
