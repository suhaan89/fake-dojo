import * as z from "zod";
import { KEEP_IDENTICAL } from "../ai/prompts";
import { CandidateSchema, type Candidate, type Plan } from "../ai/schemas";
import { isDegeneratePolygon, polygonToPixels, rasterizeBox, rasterizePolygon } from "../cv/polygon";
import { box2dToPixels, boxArea, boxesIntersect, expandBox, type PixelBox } from "../cv/types";
import { areaAllowed, areaRange, MIN_AREA_PCT } from "../game/difficulty";
import { MANIPULATION_TYPES } from "../game/types";

const Difficulty = z.number().int().min(1).max(5);
const Image = z.string().min(64);
const Ticket = z.string().min(16).max(2048);

export const PlanBodySchema = z.object({
  image: Image,
  difficulty: Difficulty,
  weights: z.partialRecord(z.enum(MANIPULATION_TYPES), z.number().min(0).max(1)).default({}),
  avoid: z.array(z.string().max(200)).max(6).default([]),
});

export const RenderBodySchema = z.object({
  image: Image,
  candidate: CandidateSchema,
  difficulty: Difficulty,
  attempt: z.number().int().min(1).max(4),
  ticket: Ticket,
});

export const VerifyBodySchema = z.object({
  original: Image,
  forged: Image,
  candidate: CandidateSchema,
  difficulty: Difficulty,
  ticket: Ticket,
});

export type PlanBody = z.infer<typeof PlanBodySchema>;
export type RenderBody = z.infer<typeof RenderBodySchema>;
export type VerifyBody = z.infer<typeof VerifyBodySchema>;

/** People boxes are widened by this share of the image width before the overlap test. */
export const PEOPLE_MARGIN = 0.05;
/** A photo where people fill more than this share of the frame is refused. */
export const MOSTLY_PEOPLE = 0.5;

export interface CandidateRejection {
  index: number;
  reason: string;
}

export interface CandidateValidation {
  /** Valid candidates, the planner's choice first. Boxes are clamped, polygons cleaned. */
  valid: Candidate[];
  rejected: CandidateRejection[];
}

/** Clamps a model box to 0..1000 and orders its corners, staying in normalized units. */
function normalizeBox(box2d: readonly number[]): number[] {
  const v = [0, 1, 2, 3].map((i) => Math.round(Math.min(1000, Math.max(0, Number(box2d[i]) || 0))));
  return [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
}

export function peopleBoxes(plan: Plan, width: number, height: number): PixelBox[] {
  return plan.safety.people_boxes
    .filter((box) => Array.isArray(box) && box.length === 4)
    .map((box) => box2dToPixels(box, width, height))
    .filter((box) => boxArea(box) > 0);
}

/** Share of the frame covered by people boxes (overlaps counted once). */
export function peopleCoverage(plan: Plan, width: number, height: number): number {
  const boxes = peopleBoxes(plan, width, height);
  if (!boxes.length) return 0;
  // Coverage is measured on a coarse grid, which is plenty for a threshold test.
  const scale = 8;
  const w = Math.ceil(width / scale);
  const h = Math.ceil(height / scale);
  const grid = new Uint8Array(w * h);
  for (const box of boxes) {
    const cell = rasterizeBox(
      { x0: box.x0 / scale, y0: box.y0 / scale, x1: box.x1 / scale, y1: box.y1 / scale },
      w,
      h,
    );
    for (let i = 0; i < grid.length; i++) if (cell[i]) grid[i] = 1;
  }
  let covered = 0;
  for (let i = 0; i < grid.length; i++) covered += grid[i];
  return covered / grid.length;
}

/**
 * Server-side validation of the planner's candidates: boxes are clamped and converted,
 * the area must not exceed the difficulty range (30% tolerance) and must be large enough to find, the region must stay clear of
 * people (boxes widened by 5% of the image width) and polygons must not be degenerate.
 */
export function validateCandidates(plan: Plan, width: number, height: number, difficulty: number): CandidateValidation {
  const people = peopleBoxes(plan, width, height).map((box) =>
    expandBox(box, Math.round(width * PEOPLE_MARGIN), width, height),
  );
  const maxPct = areaRange(difficulty)[1];
  const order = plan.candidates.map((_, index) => index);
  const chosen = Math.round(plan.chosen_index);
  if (chosen > 0 && chosen < order.length) {
    order.splice(chosen, 1);
    order.unshift(chosen);
  }

  const valid: Candidate[] = [];
  const rejected: CandidateRejection[] = [];
  for (const index of order) {
    const candidate = plan.candidates[index];
    const box = box2dToPixels(candidate.box_2d, width, height);
    const areaPct = (boxArea(box) / (width * height)) * 100;
    const instruction = candidate.edit_instruction.trim();

    if (instruction.length < 12) {
      rejected.push({ index, reason: "the edit instruction is missing" });
      continue;
    }
    if (boxArea(box) === 0) {
      rejected.push({ index, reason: "the region is empty" });
      continue;
    }
    if (!areaAllowed(areaPct, difficulty)) {
      rejected.push({
        index,
        reason:
          areaPct < MIN_AREA_PCT
            ? `the region covers only ${areaPct.toFixed(2)}% of the image, which is too small to find`
            : `the region covers ${areaPct.toFixed(1)}% of the image but may cover at most ${maxPct}%`,
      });
      continue;
    }
    if (people.some((person) => boxesIntersect(person, box))) {
      rejected.push({ index, reason: "the region is too close to a person" });
      continue;
    }

    let polygon = candidate.type === "add_object" ? [] : candidate.polygon;
    if (polygon.length) {
      const points = polygonToPixels(polygon, width, height);
      if (isDegeneratePolygon(points)) {
        rejected.push({ index, reason: "the polygon is degenerate" });
        continue;
      }
      // A polygon that barely overlaps its own box is unreliable; the box is used instead.
      const raster = rasterizePolygon(points, width, height);
      let total = 0;
      let inside = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!raster[y * width + x]) continue;
          total++;
          if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) inside++;
        }
      }
      if (total === 0 || inside / total < 0.6 || inside < boxArea(box) * 0.1) polygon = [];
    }

    valid.push({
      ...candidate,
      box_2d: normalizeBox(candidate.box_2d),
      polygon,
      edit_instruction: instruction.includes("exactly identical") ? instruction : `${instruction} ${KEEP_IDENTICAL}`,
      target_label: candidate.target_label.slice(0, 80),
      target_description: candidate.target_description.slice(0, 240),
      tell: candidate.tell.slice(0, 300),
      hint: candidate.hint.slice(0, 200),
      plausibility_rationale: candidate.plausibility_rationale.slice(0, 300),
    });
  }
  return { valid, rejected };
}

/** Feedback for a second planning round, phrased as things to avoid. */
export function avoidFromRejections(rejected: readonly CandidateRejection[]): string[] {
  const unique = Array.from(new Set(rejected.map((r) => r.reason)));
  return unique.slice(0, 4).map((reason) => `a candidate where ${reason}`.slice(0, 200));
}
