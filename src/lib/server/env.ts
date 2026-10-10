// The only place that reads model ids and server configuration from the environment.

export type ThinkingLevel = "minimal" | "medium" | "high";

export interface ServerEnv {
  apiKey: string | null;
  visionModel: string;
  imageModel: string;
  imageThinking: ThinkingLevel;
  liveForgeEnabled: boolean;
  dailyCap: number;
  perIpPerHour: number;
  /** True when the deterministic MockProvider answers instead of Gemini. */
  mock: boolean;
  isProduction: boolean;
}

export const DEFAULT_VISION_MODEL = "gemini-3.8-flash";
export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";

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

export function readEnv(source: EnvSource = process.env): ServerEnv {
  const apiKey = text(source.GEMINI_API_KEY);
  const isProduction = source.NODE_ENV === "production";
  const mockRequested = flag(source.MOCK_AI, false);
  return {
    apiKey,
    visionModel: text(source.GEMINI_VISION_MODEL) ?? DEFAULT_VISION_MODEL,
    imageModel: text(source.GEMINI_IMAGE_MODEL) ?? DEFAULT_IMAGE_MODEL,
    imageThinking: thinking(source.GEMINI_IMAGE_THINKING),
    liveForgeEnabled: flag(source.LIVE_FORGE_ENABLED, true),
    dailyCap: positiveInt(source.LIVE_FORGE_DAILY_CAP, 150),
    perIpPerHour: positiveInt(source.LIVE_FORGE_PER_IP_PER_HOUR, 8),
    // Without a key, development falls back to the mock so the pipeline stays testable for free.
    mock: mockRequested || (!apiKey && !isProduction),
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
  if (!env.mock && !env.apiKey) {
    return { liveForge: false, reason: "No API key is configured.", mock: false, models };
  }
  return { liveForge: true, mock: env.mock, models };
}
