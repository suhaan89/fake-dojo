import { areaRange } from "../game/difficulty";
import { MANIPULATION_TYPES, type ManipulationType } from "../game/types";

export const KEEP_IDENTICAL =
  "Keep everything else in the image exactly identical: framing, perspective, lighting, colors, sharpness, grain and all other objects.";

export interface PlannerPromptInput {
  difficulty: number;
  weights: Partial<Record<ManipulationType, number>>;
  avoid: readonly string[];
}

export function formatWeights(weights: Partial<Record<ManipulationType, number>>): string {
  return MANIPULATION_TYPES.map((type) => {
    const w = weights[type];
    const value = typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : 1 / MANIPULATION_TYPES.length;
    return `${type} ${value.toFixed(2)}`;
  }).join(", ");
}

export function plannerPrompt({ difficulty, weights, avoid }: PlannerPromptInput): string {
  const [minPct, maxPct] = areaRange(difficulty);
  const avoidText = avoid.length ? avoid.join("; ") : "nothing specific";
  return `You are the Forger in Fake Dojo, a media-literacy training game. A player will try to find a single edit in this photo. Plan ONE realistic, localized manipulation that a careful player could still find.

Rules:
- Never involve people. Do not edit, add, remove or touch any person, face, body, clothing or anything a person holds. Keep the edit region at least 5% of the image width away from any person.
- Never create harmful, sexual, violent, political, defamatory or hateful content. Text edits only with neutral content such as numbers, opening hours, prices or generic words.
- If the image is a sensitive document (ID, receipt, chat screenshot, news article, medical or legal document) or is mostly a person, set refuse to true and explain briefly in refuse_reason. Otherwise set refuse to false and refuse_reason to an empty string.
- List every person you can see in safety.people_boxes, even small or partly hidden ones. Use an empty list if there are none.
- The edit must be photorealistic and physically plausible: scale, perspective, lighting direction and shadows must fit the scene.
- Difficulty ${difficulty} of 5: the edit region (box_2d) should cover ${minPct}% to ${maxPct}% of the image area. It must never cover more than ${maxPct}% or less than 0.2%. Prefer targets near that size, but a smaller real object is fine if nothing bigger fits. Size the box to the region that will change, including any shadow or reflection that has to change with it.
- Higher difficulty means a subtler change. At difficulty 4 and 5 prefer small text, shadow or attribute changes.
- Allowed manipulation types: remove_object, add_object, replace_object, alter_text (only if legible text exists), change_attribute (color, material or state), lighting_shadow (a shadow or reflection).
- Preferred manipulation types with weights (higher means the player needs more practice): ${formatWeights(weights)}.
- Avoid: ${avoidText}.
- List up to 20 prominent objects in objects.
- Return exactly 3 diverse candidates (different types and different places if the scene allows) and put the index of the best one in chosen_index.
- edit_instruction must be a precise, self-contained instruction for an image-editing model: state exactly what to change and where (relative position plus a description of the target), and end with: "${KEEP_IDENTICAL}"
- tell: what gives the edit away to a careful viewer, one sentence.
- hint: a vague location hint that does not spoil the answer, for example "Look near the lower left".
- polygon: a tight outline of the target for existing objects, empty for add_object.
- Bounding boxes as [ymin, xmin, ymax, xmax] normalized to 0-1000. Polygons as [[x, y], ...] normalized to 0-1000.
- scene_summary: at most 200 characters, neutral, without mentioning the planned edit.`;
}

/** `attempt` starts at 1. Later attempts get a more explicit instruction. */
export function editorPrompt(editInstruction: string, attempt = 1): string {
  const base = `Edit this photograph. ${editInstruction}
The change must look as if it was captured by the same camera: match perspective, scale, lighting direction, color temperature, depth of field, motion blur, sensor noise and JPEG texture. Do not modify any person. Do not change anything outside the described region. Do not add text overlays, borders, captions, logos or watermarks. Return the full image with identical framing.`;
  if (attempt <= 1) return base;
  return `${base}
Important: a previous attempt came back without a clearly visible change or with shifted framing. Make the described change definitely happen and keep it confined to the described region. Do not crop, zoom, rotate or shift the image. Every pixel outside the region must stay where it is.`;
}

export function verifierPrompt(type: ManipulationType, editInstruction: string): string {
  return `Image 1 is an original photo. Image 2 is an edited version of it. The intended edit was: ${type}: ${editInstruction}
Judge strictly and fill every field: was the edit applied, does it match the intent, are artifacts visible (seams, smudges, warped lines, mismatched lighting), was any person altered, is anything inappropriate, plausibility 1-5, obviousness 1-5, the single best tell for a careful viewer in one sentence, and a vague hint that does not reveal the location precisely. Leave artifact_notes empty if there are no artifacts.`;
}

/** The edit instruction as one readable sentence for the reveal, without the boilerplate ending. */
export function editSummary(editInstruction: string): string {
  const cut = editInstruction.indexOf("Keep everything else");
  const core = (cut >= 0 ? editInstruction.slice(0, cut) : editInstruction).replace(/\s+/g, " ").trim();
  if (!core) return "";
  return /[.!?]$/.test(core) ? core : `${core}.`;
}
