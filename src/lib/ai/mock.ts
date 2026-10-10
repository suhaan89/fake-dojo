import { areaRange } from "../game/difficulty";
import { KEEP_IDENTICAL } from "./prompts";
import type { AIProvider, EditInput, EditOutput, PlanInput, PlanOutput, VerifyInput, VerifyOutput } from "./provider";
import type { Candidate } from "./schemas";

/** Region centers in normalized 0..1000 coordinates. The first one sits left of center. */
const CENTERS: readonly (readonly [number, number, string])[] = [
  [330, 500, "left of center"],
  [690, 400, "right of center"],
  [500, 730, "lower middle"],
];

function candidateAt(cx: number, cy: number, where: string, side: number, subtlety: number): Candidate {
  const half = side / 2;
  const x0 = Math.max(0, Math.min(1000 - side, cx - half));
  const y0 = Math.max(0, Math.min(1000 - side, cy - half));
  return {
    type: "change_attribute",
    target_label: "mock region",
    target_description: `the area ${where}`,
    box_2d: [Math.round(y0), Math.round(x0), Math.round(y0 + side), Math.round(x0 + side)],
    polygon: [],
    edit_instruction: `Shift the hue of the area ${where} and darken it slightly. ${KEEP_IDENTICAL}`,
    plausibility_rationale: "Deterministic mock edit used to test the pipeline without a model.",
    tell: `The colors ${where} do not match the rest of the scene.`,
    hint: `Look ${where}.`,
    subtlety,
  };
}

/**
 * Offline stand-in for Gemini. Deterministic and free, so the complete pipeline
 * (composite, diff, heat, scoring, reveal) can be exercised without an API key.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock" as const;

  async plan(input: PlanInput): Promise<PlanOutput> {
    const [minPct, maxPct] = areaRange(input.difficulty);
    // A box with the same proportions as the image, sized to the middle of the area range.
    const side = Math.sqrt((minPct + maxPct) / 2 / 100) * 1000;
    return {
      scene_summary: "Mock scene: no model looked at this photo.",
      safety: {
        contains_people: false,
        people_boxes: [],
        is_sensitive_document: false,
        refuse: false,
        refuse_reason: "",
      },
      objects: [],
      candidates: CENTERS.map(([cx, cy, where]) => candidateAt(cx, cy, where, side, Math.round(input.difficulty))),
      chosen_index: 0,
    };
  }

  async edit(input: EditInput): Promise<EditOutput> {
    const { default: sharp } = await import("sharp");
    const [ymin, xmin, ymax, xmax] = input.candidate.box_2d;
    const left = Math.max(0, Math.floor((xmin / 1000) * input.width));
    const top = Math.max(0, Math.floor((ymin / 1000) * input.height));
    const width = Math.max(1, Math.min(input.width - left, Math.ceil(((xmax - xmin) / 1000) * input.width)));
    const height = Math.max(1, Math.min(input.height - top, Math.ceil(((ymax - ymin) / 1000) * input.height)));
    const source = Buffer.from(input.image, "base64");
    const patch = await sharp(source)
      .extract({ left, top, width, height })
      .modulate({ hue: 140, brightness: 0.72 })
      .png()
      .toBuffer();
    const out = await sharp(source).composite([{ input: patch, left, top }]).png().toBuffer();
    return { image: out.toString("base64"), mimeType: "image/png" };
  }

  async verify(input: VerifyInput): Promise<VerifyOutput> {
    return {
      edit_applied: true,
      matches_intent: true,
      artifacts_visible: false,
      artifact_notes: "",
      people_altered: false,
      inappropriate: false,
      plausibility: 4,
      obviousness: 3,
      tell: input.candidate.tell,
      hint: input.candidate.hint,
    };
  }
}
