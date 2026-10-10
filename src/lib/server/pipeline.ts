import { ArkVision } from "../ai/ark-vision";
import { GeminiProvider } from "../ai/gemini";
import { MockProvider } from "../ai/mock";
import { SeedreamEditor, SeedreamForgeProvider } from "../ai/seedream";
import type { AIProvider } from "../ai/provider";
import type { Candidate } from "../ai/schemas";
import { findAlignment, shiftImage } from "../cv/align";
import { addGaussianNoise, composite } from "../cv/composite";
import { changeMap, heatOverlay, MIN_CHANGED_PCT } from "../cv/diff";
import { buildEditMask, ringAround } from "../cv/mask";
import { polygonToPixels } from "../cv/polygon";
import { matchTone } from "../cv/tone";
import { box2dToPixels } from "../cv/types";
import { judge, type PlanResponse, type RenderResponse, type VerifyResponse } from "../forge/types";
import { postProcessFor } from "../game/difficulty";
import { hashString, mulberry32 } from "../game/rng";
import type { ManipulationType } from "../game/types";
import { nearestAspect } from "../image/crop";
import { decodeToSize, decodeUpload, encodeJpeg, encodeMaskPng, encodePng } from "./codec";
import { readEnv, type ServerEnv } from "./env";
import { ApiError, UNSAFE_MESSAGE } from "./errors";
import { avoidFromRejections, MOSTLY_PEOPLE, peopleCoverage, validateCandidates } from "./validate";

export const RING_WIDTH = 24;

export function getProvider(env: ServerEnv = readEnv()): AIProvider {
  if (env.mock) return new MockProvider();
  if (env.visionProvider === "gemini" && env.imageProvider === "gemini") return new GeminiProvider(env);
  const vision = env.visionProvider === "ark" ? new ArkVision(env) : new GeminiProvider(env);
  const editor = env.imageProvider === "seedream" ? new SeedreamEditor(env) : new GeminiProvider(env);
  return new SeedreamForgeProvider(vision, editor);
}

export interface PlanStepInput {
  image: string;
  difficulty: number;
  weights: Partial<Record<ManipulationType, number>>;
  avoid: readonly string[];
}

export type PlanStepResult = Omit<PlanResponse, "ticket" | "candidate" | "alternates"> & {
  candidates: Candidate[];
};

/** Plan: one vision call, then server-side validation, with a single re-plan if nothing is usable. */
export async function planStep(provider: AIProvider, input: PlanStepInput): Promise<PlanStepResult> {
  const original = await decodeUpload(input.image);
  const { width, height } = original;
  let modelMs = 0;
  let validateMs = 0;
  let avoid = [...input.avoid];
  let replanned = false;

  for (let round = 0; round < 2; round++) {
    const t0 = Date.now();
    const plan = await provider.plan({
      image: input.image,
      width,
      height,
      difficulty: input.difficulty,
      weights: input.weights,
      avoid,
    });
    const t1 = Date.now();
    modelMs += t1 - t0;

    if (
      plan.safety.refuse ||
      plan.safety.is_sensitive_document ||
      peopleCoverage(plan, width, height) > MOSTLY_PEOPLE
    ) {
      throw new ApiError("UNSAFE", UNSAFE_MESSAGE);
    }

    const { valid, rejected } = validateCandidates(plan, width, height, input.difficulty);
    validateMs += Date.now() - t1;
    if (valid.length) {
      return {
        scene: plan.scene_summary,
        objectCount: plan.objects.length,
        containsPeople: plan.safety.contains_people || plan.safety.people_boxes.length > 0,
        candidates: valid,
        validCount: valid.length,
        plannedCount: plan.candidates.length,
        replanned,
        width,
        height,
        aspectRatio: nearestAspect(width, height),
        mock: provider.name === "mock",
        timings: { modelMs, validateMs },
      };
    }
    avoid = [...input.avoid, ...avoidFromRejections(rejected)].slice(0, 6);
    replanned = true;
  }
  throw new ApiError("NO_CANDIDATE", "The forger found no safe, well-sized edit for this photo.");
}

export interface RenderStepInput {
  image: string;
  candidate: Candidate;
  difficulty: number;
  attempt: number;
}

/**
 * Render: one image-model call, then our own compositing so the answer key is exact.
 * Resize, register, tone-match, feathered composite, change map, difficulty post-processing.
 */
export async function renderStep(provider: AIProvider, input: RenderStepInput): Promise<RenderResponse> {
  const original = await decodeUpload(input.image);
  const { width, height } = original;
  const { candidate, difficulty, attempt } = input;

  const t0 = Date.now();
  const edited = await provider.edit({
    image: input.image,
    width,
    height,
    aspectRatio: nearestAspect(width, height),
    candidate,
    attempt,
  });
  const t1 = Date.now();
  const timings = () => ({ modelMs: t1 - t0, cvMs: Date.now() - t1 });

  let edit;
  try {
    edit = await decodeToSize(edited.image, width, height);
  } catch {
    throw new ApiError("UPSTREAM", "The image model returned an image that could not be decoded.");
  }

  const box = box2dToPixels(candidate.box_2d, width, height);
  const polygon = candidate.polygon.length ? polygonToPixels(candidate.polygon, width, height) : null;
  const mask = buildEditMask(width, height, box, polygon);
  const ring = ringAround(mask.dilated, width, height, RING_WIDTH);

  const alignment = findAlignment(original, edit, ring);
  if (alignment.poor && attempt === 1) {
    return {
      ok: false,
      reason: "misaligned",
      message: "the framing shifted and could not be registered",
      timings: timings(),
    };
  }
  const registered = shiftImage(edit, alignment.dx, alignment.dy);
  const toned = matchTone(registered, original, mask.footprint, ring).image;
  const blended = composite(original, toned, mask.alpha);

  const change = changeMap(original, blended);
  if (change.changedPct < MIN_CHANGED_PCT || !change.changeBox) {
    return { ok: false, reason: "not_applied", message: "no visible change came back", timings: timings() };
  }

  const post = postProcessFor(difficulty);
  const seed = hashString(`${candidate.edit_instruction}:${attempt}:${width}x${height}`);
  const finished = post.noiseSigma > 0 ? addGaussianNoise(blended, post.noiseSigma, mulberry32(seed)) : blended;

  const [forged, maskPng, heatPng] = await Promise.all([
    encodeJpeg(finished, post.jpegQuality),
    encodeMaskPng(change.mask, width, height),
    encodePng(heatOverlay(change)),
  ]);

  return {
    ok: true,
    forged: forged.toString("base64"),
    mask: maskPng.toString("base64"),
    heat: heatPng.toString("base64"),
    changeBox: change.changeBox,
    stats: {
      changedPct: Math.round(change.changedPct * 100) / 100,
      meanDelta: Math.round(change.meanDelta * 10) / 10,
      shift: [alignment.dx, alignment.dy],
      alignBefore: Math.round(alignment.before * 10) / 10,
      alignAfter: Math.round(alignment.after * 10) / 10,
      attempt,
      jpegQuality: post.jpegQuality,
      noiseSigma: post.noiseSigma,
      timings: timings(),
    },
  };
}

export interface VerifyStepInput {
  original: string;
  forged: string;
  candidate: Candidate;
  difficulty: number;
}

/** Verify: a second vision call compares original and forgery and fills the verdict. */
export async function verifyStep(provider: AIProvider, input: VerifyStepInput): Promise<VerifyResponse> {
  const [a, b] = await Promise.all([decodeUpload(input.original, "original"), decodeUpload(input.forged, "forgery")]);
  if (a.width !== b.width || a.height !== b.height) {
    throw new ApiError("BAD_INPUT", "The original and the forgery must have the same size.");
  }
  const t0 = Date.now();
  const verdict = await provider.verify({
    original: input.original,
    forged: input.forged,
    candidate: input.candidate,
  });
  return { verdict, ...judge(verdict, input.difficulty), timings: { modelMs: Date.now() - t0 } };
}
