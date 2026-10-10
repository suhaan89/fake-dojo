import * as z from "zod";
import { MANIPULATION_TYPES } from "../game/types";

const Box2d = z.array(z.number()).length(4);

export const CandidateSchema = z.object({
  type: z.enum(MANIPULATION_TYPES),
  target_label: z.string(),
  target_description: z.string(),
  box_2d: Box2d,
  polygon: z.array(z.array(z.number())),
  edit_instruction: z.string(),
  plausibility_rationale: z.string(),
  tell: z.string(),
  hint: z.string(),
  subtlety: z.number(),
});

export const PlanSchema = z.object({
  scene_summary: z.string(),
  safety: z.object({
    contains_people: z.boolean(),
    people_boxes: z.array(z.array(z.number())),
    is_sensitive_document: z.boolean(),
    refuse: z.boolean(),
    refuse_reason: z.string(),
  }),
  objects: z.array(z.object({ label: z.string(), box_2d: z.array(z.number()) })),
  candidates: z.array(CandidateSchema),
  chosen_index: z.number(),
});

export const VerifySchema = z.object({
  edit_applied: z.boolean(),
  matches_intent: z.boolean(),
  artifacts_visible: z.boolean(),
  artifact_notes: z.string(),
  people_altered: z.boolean(),
  inappropriate: z.boolean(),
  plausibility: z.number(),
  obviousness: z.number(),
  tell: z.string(),
  hint: z.string(),
});

export type Candidate = z.infer<typeof CandidateSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Verify = z.infer<typeof VerifySchema>;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function strip(node: Json): Json {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    const out: { [key: string]: Json } = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$schema" || key === "additionalProperties") continue;
      out[key] = strip(value);
    }
    return out;
  }
  return node;
}

/**
 * JSON Schema for the model's structured output. `$schema` and `additionalProperties`
 * are removed because the API accepts only a subset of JSON Schema.
 */
export function modelSchema(schema: z.ZodType): Json {
  return strip(z.toJSONSchema(schema) as Json);
}

/** Extracts a JSON object from model text that may be wrapped in a code fence. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("Model output is not valid JSON");
  }
}

function clampScore(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function parsePlan(text: string): Plan {
  const plan = PlanSchema.parse(parseModelJson(text));
  return {
    ...plan,
    scene_summary: plan.scene_summary.slice(0, 240),
    objects: plan.objects.slice(0, 20),
    candidates: plan.candidates.map((c) => ({ ...c, subtlety: clampScore(c.subtlety) })),
  };
}

export function parseVerify(text: string): Verify {
  const verify = VerifySchema.parse(parseModelJson(text));
  return {
    ...verify,
    plausibility: clampScore(verify.plausibility),
    obviousness: clampScore(verify.obviousness),
  };
}
