import { ELA_CAPTION } from "./ela";
import { NOISE_CAPTION } from "./noise";
import { SOBEL_CAPTION } from "./sobel";

export type LensId = "photo" | "ela" | "noise" | "edges";
export type ForensicLens = Exclude<LensId, "photo">;

export const LENSES: readonly { id: LensId; label: string; caption: string }[] = [
  { id: "photo", label: "Photo", caption: "The image as the player sees it." },
  { id: "ela", label: "ELA", caption: ELA_CAPTION },
  { id: "noise", label: "Noise", caption: NOISE_CAPTION },
  { id: "edges", label: "Edges", caption: SOBEL_CAPTION },
];

export const FORENSICS_DISCLAIMER = "Forensics give clues, not proof.";

export function lensCaption(id: LensId): string {
  return LENSES.find((lens) => lens.id === id)?.caption ?? "";
}
