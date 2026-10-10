import type { ManipulationType } from "../game/types";
import type { AspectRatio } from "../image/crop";
import type { Candidate, Plan, Verify } from "./schemas";

export interface PlanInput {
  /** Base64 JPEG of the prepared photo. */
  image: string;
  width: number;
  height: number;
  difficulty: number;
  weights: Partial<Record<ManipulationType, number>>;
  avoid: readonly string[];
}

export type PlanOutput = Plan;

export interface EditInput {
  image: string;
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  candidate: Candidate;
  /** Starts at 1; later attempts use a more explicit instruction. */
  attempt: number;
}

export interface EditOutput {
  /** Base64 image in any format sharp can decode. */
  image: string;
  mimeType: string;
}

export interface VerifyInput {
  original: string;
  forged: string;
  candidate: Pick<Candidate, "type" | "edit_instruction" | "tell" | "hint">;
}

export type VerifyOutput = Verify;

export interface AIProvider {
  /** "gemini" for live calls, "mock" for the deterministic offline provider. */
  readonly name: "gemini" | "mock";
  plan(input: PlanInput): Promise<PlanOutput>;
  edit(input: EditInput): Promise<EditOutput>;
  verify(input: VerifyInput): Promise<VerifyOutput>;
}
