// Shapes shared by the API routes, the browser client and the Node scripts.

import type { Candidate, Verify } from "../ai/schemas";
import type { NormBox } from "../cv/types";
import type { ManipulationType } from "../game/types";
import type { AspectRatio } from "../image/crop";

export type ApiErrorCode =
  | "RATE_LIMITED"
  | "LIVE_DISABLED"
  | "UPSTREAM"
  | "TIMEOUT"
  | "UNSAFE"
  | "NO_CANDIDATE"
  | "BAD_INPUT";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

export interface HealthResponse {
  liveForge: boolean;
  reason?: string;
  mock: boolean;
  models: { vision: string; image: string };
}

export interface PlanRequest {
  image: string;
  difficulty: number;
  weights: Partial<Record<ManipulationType, number>>;
  avoid?: string[];
}

export interface PlanResponse {
  /** Signed token that authorizes render and verify calls for this photo and these candidates. */
  ticket: string;
  scene: string;
  objectCount: number;
  containsPeople: boolean;
  /** The validated candidate to forge. */
  candidate: Candidate;
  /** Other valid candidates, used when the first one cannot be rendered cleanly. */
  alternates: Candidate[];
  /** How many of the planner's candidates passed server validation, and out of how many. */
  validCount: number;
  plannedCount: number;
  replanned: boolean;
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  mock: boolean;
  timings: { modelMs: number; validateMs: number };
}

export interface RenderRequest {
  image: string;
  candidate: Candidate;
  difficulty: number;
  attempt: number;
  ticket: string;
}

export interface RenderStats {
  /** Share of pixels that really changed, in percent. */
  changedPct: number;
  /** Mean luma difference over the changed pixels, 0..255. */
  meanDelta: number;
  /** Shift applied to register the model output with the original, in pixels. */
  shift: [number, number];
  alignBefore: number;
  alignAfter: number;
  attempt: number;
  jpegQuality: number;
  noiseSigma: number;
  timings: { modelMs: number; cvMs: number };
}

export interface RenderSuccess {
  ok: true;
  /** Base64 JPEG of the composited forgery. */
  forged: string;
  /** Base64 PNG, white where pixels changed. */
  mask: string;
  /** Base64 RGBA PNG, the red heat overlay. */
  heat: string;
  changeBox: NormBox;
  stats: RenderStats;
}

export type RenderRejectReason = "not_applied" | "misaligned";

export interface RenderRejected {
  ok: false;
  reason: RenderRejectReason;
  message: string;
  timings: { modelMs: number; cvMs: number };
}

export type RenderResponse = RenderSuccess | RenderRejected;

export interface VerifyRequest {
  original: string;
  forged: string;
  candidate: Candidate;
  difficulty: number;
  ticket: string;
}

export interface VerifyResponse {
  verdict: Verify;
  accepted: boolean;
  /** True when the rejection is a safety matter; such an image is never shown. */
  safety: boolean;
  reason: string | null;
  timings: { modelMs: number };
}

export interface Judgement {
  accepted: boolean;
  safety: boolean;
  reason: string | null;
}

/** Approximate price of one 1K image output from the image model, in USD. */
export const IMAGE_COST_USD = 0.034;

/** Rejection reasons that say nothing about where the edit is, so they are never redacted. */
export const GENERIC_REASONS: readonly string[] = [
  "a person was altered",
  "the result is inappropriate",
  "the edit is not visible",
  "the edit does not match the plan",
  "the result is not plausible",
  "visible artifacts",
];

/**
 * Turns the verifier's fields into a decision. Safety flags always reject. Quality flags
 * reject when the edit is missing, off target or implausible; visible artifacts are only
 * tolerated at the easy levels, where an obvious edit is the point.
 */
export function judge(verdict: Verify, difficulty: number): Judgement {
  if (verdict.people_altered) return { accepted: false, safety: true, reason: "a person was altered" };
  if (verdict.inappropriate) return { accepted: false, safety: true, reason: "the result is inappropriate" };
  if (!verdict.edit_applied) return { accepted: false, safety: false, reason: "the edit is not visible" };
  if (!verdict.matches_intent) return { accepted: false, safety: false, reason: "the edit does not match the plan" };
  if (verdict.plausibility <= 2) {
    const notes = verdict.artifact_notes.trim();
    return { accepted: false, safety: false, reason: notes ? shorten(notes) : "the result is not plausible" };
  }
  if (verdict.artifacts_visible && difficulty >= 3 && verdict.plausibility <= 3) {
    const notes = verdict.artifact_notes.trim();
    return { accepted: false, safety: false, reason: notes ? shorten(notes) : "visible artifacts" };
  }
  return { accepted: true, safety: false, reason: null };
}

function shorten(text: string): string {
  const clean = text.replace(/\s+/g, " ").replace(/[.]+$/, "");
  const lower = clean.charAt(0).toLowerCase() + clean.slice(1);
  return lower.length > 90 ? `${lower.slice(0, 87)}...` : lower;
}
