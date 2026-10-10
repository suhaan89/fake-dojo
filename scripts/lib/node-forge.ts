import { existsSync } from "node:fs";
import sharp from "sharp";
import type { AIProvider } from "../../src/lib/ai/provider";
import { AiError } from "../../src/lib/ai/retry";
import { ForgeFailure, type ForgeTransport } from "../../src/lib/forge/run";
import { IMAGE_COST_USD } from "../../src/lib/forge/types";
import { mulberry32 } from "../../src/lib/game/rng";
import { ApiError, toApiError } from "../../src/lib/server/errors";
import { planStep, renderStep, verifyStep } from "../../src/lib/server/pipeline";

/** Loads .env.local and .env into process.env without overriding what is already set. */
export function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

function wrap<T>(work: Promise<T>): Promise<T> {
  return work.catch((error: unknown) => {
    const api = error instanceof ApiError || error instanceof AiError ? toApiError(error) : null;
    if (api) throw new ForgeFailure(api.code, api.message);
    throw error;
  });
}

/** Runs the forge loop against the server pipeline directly, without HTTP. */
export function directTransport(provider: AIProvider): ForgeTransport {
  return {
    plan: async (body) => {
      const { candidates, ...plan } = await wrap(
        planStep(provider, { image: body.image, difficulty: body.difficulty, weights: body.weights, avoid: body.avoid ?? [] }),
      );
      return { ...plan, ticket: "direct", candidate: candidates[0], alternates: candidates.slice(1) };
    },
    render: (body) => wrap(renderStep(provider, body)),
    verify: (body) => wrap(verifyStep(provider, body)),
  };
}

/** Rough cost of a forge: every render is one image output; the vision calls add about a cent in total. */
export function estimateCost(renders: number, mock: boolean): number {
  return mock ? 0 : renders * IMAGE_COST_USD;
}

/** One line describing what the image calls cost with the configured provider. */
export function costLine(renders: number, mock: boolean, imageProvider: "gemini" | "seedream"): string {
  if (mock) return "nothing, the mock provider makes no model calls";
  if (imageProvider === "seedream") {
    return `${renders} Seedream image call(s) on BytePlus ModelArk: free while the free quota lasts, check the console for the price after that`;
  }
  return `${usd(estimateCost(renders, false))} for ${renders} image call(s) at about ${IMAGE_COST_USD} USD each`;
}

export function usd(value: number): string {
  return `${value.toFixed(3)} USD`;
}

/** A synthetic test photo (soft color fields with grain) for trying the pipeline without a real picture. */
export async function syntheticPhoto(width = 1280, height = 960): Promise<Buffer> {
  const random = mulberry32(2026);
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const band = Math.floor((x / width) * 6) + Math.floor((y / height) * 4);
      const grain = (random() - 0.5) * 18;
      raw[i] = Math.max(0, Math.min(255, 70 + band * 17 + (x / width) * 60 + grain));
      raw[i + 1] = Math.max(0, Math.min(255, 110 + (band % 3) * 30 + (y / height) * 50 + grain));
      raw[i + 2] = Math.max(0, Math.min(255, 160 - band * 9 + grain));
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 93 }).toBuffer();
}
