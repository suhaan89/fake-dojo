// The only place that reads model ids and server configuration from the environment.

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
export type ImageProviderName = "gemini" | "seedream";
export type VisionProviderName = "gemini" | "ark";
export type ArkThinking = "disabled" | "enabled" | "auto" | "off";

export interface ServerEnv {
  apiKey: string | null;
  /** Which service reads, plans and verifies. */
  visionProvider: VisionProviderName;
  /** The vision model that is actually in use. */
  visionModel: string;
  /** Gemini vision model, used when visionProvider is "gemini". */
  geminiVisionModel: string;
  /** Vision model on BytePlus ModelArk, used when visionProvider is "ark". */
  arkVisionModel: string;
  /** Sent as the thinking type to the Ark vision model. "off" leaves the field out. */
  arkVisionThinking: ArkThinking;
  /** Tried in order for a vision call after the main vision model failed (overload, slow answer, quota). */
  visionFallbackModels: string[];
  /** Gemini image model, used when imageProvider is "gemini". */
  geminiImageModel: string;
  /** Thinking level for planning and verifying. The vision model rejects "minimal". */
  visionThinking: ThinkingLevel;
  imageThinking: ThinkingLevel;
  /** Which service performs the image edit. */
  imageProvider: ImageProviderName;
  arkApiKey: string | null;
  /** Key material for signing forge tickets: whichever provider key is present. */
  signingKey: string | null;
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
export const DEFAULT_VISION_FALLBACK_MODELS = "gemini-3.5-flash,gemini-3.7-flash";
export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const DEFAULT_SEEDREAM_MODEL = "seedream-4-0-250828";
export const DEFAULT_ARK_VISION_MODEL = "seed-2-0-lite-260428";
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

function thinking(value: string | undefined, fallback: ThinkingLevel = "medium"): ThinkingLevel {
  const v = text(value)?.toLowerCase();
  return v === "minimal" || v === "low" || v === "medium" || v === "high" ? v : fallback;
}

/** Names of the keys that are still missing for live forging. */
export function missingKeys(
  env: Pick<ServerEnv, "apiKey" | "arkApiKey" | "imageProvider" | "visionProvider">,
): string[] {
  const missing: string[] = [];
  const needsGemini = env.visionProvider === "gemini" || env.imageProvider === "gemini";
  const needsArk = env.visionProvider === "ark" || env.imageProvider === "seedream";
  if (needsGemini && !env.apiKey) missing.push("GEMINI_API_KEY");
  if (needsArk && !env.arkApiKey) missing.push("ARK_API_KEY");
  return missing;
}

function arkThinking(value: string | undefined): ArkThinking {
  const v = text(value)?.toLowerCase();
  return v === "enabled" || v === "auto" || v === "off" ? v : "disabled";
}

export function readEnv(source: EnvSource = process.env): ServerEnv {
  const apiKey = text(source.GEMINI_API_KEY);
  const arkApiKey = text(source.ARK_API_KEY);
  const isProduction = source.NODE_ENV === "production";
  const mockRequested = flag(source.MOCK_AI, false);
  const imageProvider: ImageProviderName =
    text(source.IMAGE_PROVIDER)?.toLowerCase() === "seedream" ? "seedream" : "gemini";
  const visionProvider: VisionProviderName = text(source.VISION_PROVIDER)?.toLowerCase() === "ark" ? "ark" : "gemini";
  const geminiVisionModel = text(source.GEMINI_VISION_MODEL) ?? DEFAULT_VISION_MODEL;
  const arkVisionModel = text(source.ARK_VISION_MODEL) ?? DEFAULT_ARK_VISION_MODEL;
  const geminiImageModel = text(source.GEMINI_IMAGE_MODEL) ?? DEFAULT_IMAGE_MODEL;
  const seedreamModel = text(source.SEEDREAM_MODEL) ?? DEFAULT_SEEDREAM_MODEL;
  const keysMissing = missingKeys({ apiKey, arkApiKey, imageProvider, visionProvider }).length > 0;
  return {
    apiKey,
    visionProvider,
    visionModel: visionProvider === "ark" ? arkVisionModel : geminiVisionModel,
    geminiVisionModel,
    arkVisionModel,
    arkVisionThinking: arkThinking(source.ARK_VISION_THINKING),
    visionFallbackModels: (text(source.GEMINI_VISION_FALLBACK_MODELS) ?? DEFAULT_VISION_FALLBACK_MODELS)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    geminiImageModel,
    visionThinking: thinking(source.GEMINI_VISION_THINKING, "low"),
    imageThinking: thinking(source.GEMINI_IMAGE_THINKING),
    imageProvider,
    arkApiKey,
    signingKey: apiKey ?? arkApiKey,
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
