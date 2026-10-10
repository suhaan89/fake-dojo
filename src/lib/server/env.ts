// The only place that reads model ids and server configuration from the environment.

export type ThinkingLevel = "minimal" | "medium" | "high";
export type ImageProviderName = "gemini" | "seedream";

export interface ServerEnv {
  apiKey: string | null;
  visionModel: string;
  /** Gemini image model, used when imageProvider is "gemini". */
  geminiImageModel: string;
  imageThinking: ThinkingLevel;
  /** Which service performs the image edit. Reading, planning and verifying always use Gemini. */
  imageProvider: ImageProviderName;
  arkApiKey: string | null;
  arkBaseUrl: string;
  seedreamModel: string;
  /** The image model that is actually in use. */
  imageModel: string;
  liveForgeEnabled: boolean;
  dailyCap: number;
  perIpPerHour: number;
  /** True when the deterministic MockProvider answers instead of real models. */
  mock: boolean;
  isProduction: boolean;
}

export const DEFAULT_VISION_MODEL = "gemini-3.8-flash";
export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const DEFAULT_SEEDREAM_MODEL = "seedream-4-0-250828";
export const DEFAULT_ARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

type EnvSource = Record<string, string | undefined>;

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  const v = text(value)?.toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(text(value) ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function thinking(value: string | undefined): ThinkingLevel {
  const v = text(value)?.toLowerCase();
  return v === "minimal" || v === "high" ? v : "medium";
}

/** Names of the keys that are still missing for live forging. */
export function missingKeys(env: Pick<ServerEnv, "apiKey" | "arkApiKey" | "imageProvider">): string[] {
  const missing: string[] = [];
  if (!env.apiKey) missing.push("GEMINI_API_KEY");
  if (env.imageProvider === "seedream" && !env.arkApiKey) missing.push("ARK_API_KEY");
  return missing;
}

export function readEnv(source: EnvSource = process.env): ServerEnv {
  const apiKey = text(source.GEMINI_API_KEY);
  const arkApiKey = text(source.ARK_API_KEY);
  const isProduction = source.NODE_ENV === "production";
  const mockRequested = flag(source.MOCK_AI, false);
  const imageProvider: ImageProviderName =
    text(source.IMAGE_PROVIDER)?.toLowerCase() === "seedream" ? "seedream" : "gemini";
  const geminiImageModel = text(source.GEMINI_IMAGE_MODEL) ?? DEFAULT_IMAGE_MODEL;
  const seedreamModel = text(source.SEEDREAM_MODEL) ?? DEFAULT_SEEDREAM_MODEL;
  const keysMissing = missingKeys({ apiKey, arkApiKey, imageProvider }).length > 0;
  return {
    apiKey,
    visionModel: text(source.GEMINI_VISION_MODEL) ?? DEFAULT_VISION_MODEL,
    geminiImageModel,
    imageThinking: thinking(source.GEMINI_IMAGE_THINKING),
    imageProvider,
    arkApiKey,
    arkBaseUrl: (text(source.ARK_BASE_URL) ?? DEFAULT_ARK_BASE_URL).replace(/\/+$/, ""),
    seedreamModel,
    imageModel: imageProvider === "seedream" ? seedreamModel : geminiImageModel,
    liveForgeEnabled: flag(source.LIVE_FORGE_ENABLED, true),
    dailyCap: positiveInt(source.LIVE_FORGE_DAILY_CAP, 150),
    perIpPerHour: positiveInt(source.LIVE_FORGE_PER_IP_PER_HOUR, 8),
    // Without the needed keys, development falls back to the mock so the pipeline stays testable for free.
    mock: mockRequested || (keysMissing && !isProduction),
    isProduction,
  };
}

export interface LiveStatus {
  liveForge: boolean;
  reason?: string;
  mock: boolean;
  models: { vision: string; image: string };
}

export function liveStatus(env: ServerEnv = readEnv()): LiveStatus {
  const models = { vision: env.visionModel, image: env.imageModel };
  if (!env.liveForgeEnabled) {
    return { liveForge: false, reason: "Live forging is switched off.", mock: env.mock, models };
  }
  if (!env.mock && missingKeys(env).length > 0) {
    return { liveForge: false, reason: "No API key is configured.", mock: false, models };
  }
  return { liveForge: true, mock: env.mock, models };
}
