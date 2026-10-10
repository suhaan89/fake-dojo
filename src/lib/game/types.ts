export const MANIPULATION_TYPES = [
  "remove_object",
  "add_object",
  "replace_object",
  "alter_text",
  "change_attribute",
  "lighting_shadow",
] as const;

export type ManipulationType = (typeof MANIPULATION_TYPES)[number];

export const TYPE_LABELS: Record<ManipulationType, string> = {
  remove_object: "Removed object",
  add_object: "Added object",
  replace_object: "Replaced object",
  alter_text: "Altered text",
  change_attribute: "Changed attribute",
  lighting_shadow: "Lighting or shadow",
};

export const TYPE_SHORT: Record<ManipulationType, string> = {
  remove_object: "Remove",
  add_object: "Add",
  replace_object: "Replace",
  alter_text: "Text",
  change_attribute: "Attribute",
  lighting_shadow: "Light",
};

export function isManipulationType(value: unknown): value is ManipulationType {
  return typeof value === "string" && (MANIPULATION_TYPES as readonly string[]).includes(value);
}

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface TypeSkill {
  hits: number;
  misses: number;
}

export type RoundMode = "forge" | "dojo";

export interface RoundRecord {
  /** Milliseconds since the epoch. */
  at: number;
  mode: RoundMode;
  /** Null for an untouched real photo in the deck. */
  type: ManipulationType | null;
  difficulty: number;
  /** For edited images: the edit was located. For real photos: the call was correct. */
  hit: boolean;
  points: number;
  guesses: number;
  hints: number;
  labUses: number;
}

export interface Profile {
  version: 1;
  points: number;
  skills: Record<ManipulationType, TypeSkill>;
  /** Current forge difficulty, 1..5. */
  difficulty: Difficulty;
  /** Consecutive forge hits since the last difficulty change. */
  streak: number;
  /** Most recent first, capped. */
  rounds: RoundRecord[];
}

export type TapResult = "hit" | "close" | "miss";
