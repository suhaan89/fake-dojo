import type { TapResult } from "./types";

export const MAX_GUESSES = 2;
export const FIRST_GUESS_FACTOR = 100;
export const SECOND_GUESS_FACTOR = 60;
export const HINT_COST = 30;
export const LAB_TOOL_COST = 20;
export const CALL_POINTS = 50;

/** A tap counts as a hit inside the change mask grown by this share of min(W, H). */
export const HIT_MARGIN = 0.04;
/** Within this share it is reported as "close". */
export const CLOSE_MARGIN = 0.08;

export interface HuntOutcome {
  difficulty: number;
  /** Which guess found the edit, or null if it was never found. */
  hitOnGuess: 1 | 2 | null;
  hints: number;
  labUses: number;
}

/** 100 x difficulty on the first guess, 60 x on the second, minus hint and lab tool costs. */
export function huntPoints(outcome: HuntOutcome): number {
  if (outcome.hitOnGuess === null) return 0;
  const factor = outcome.hitOnGuess === 1 ? FIRST_GUESS_FACTOR : SECOND_GUESS_FACTOR;
  const raw = factor * outcome.difficulty - HINT_COST * outcome.hints - LAB_TOOL_COST * outcome.labUses;
  return Math.max(0, Math.round(raw));
}

/** Points for a Real or Edited call in the deck modes. */
export function callPoints(correct: boolean): number {
  return correct ? CALL_POINTS : 0;
}

/**
 * Classifies a tap at (x, y) in natural image pixels against the 0/1 change mask.
 * Equivalent to testing the mask dilated by 4% (hit) and 8% (close) of min(W, H),
 * done as a nearest-set-pixel search so no large dilation is needed in the browser.
 */
export function classifyTap(mask: Uint8Array, width: number, height: number, x: number, y: number): TapResult {
  const minSide = Math.min(width, height);
  const hitRadius = Math.max(1, Math.round(minSide * HIT_MARGIN));
  const closeRadius = Math.max(hitRadius, Math.round(minSide * CLOSE_MARGIN));
  const cx = Math.round(x);
  const cy = Math.round(y);
  let best = Infinity;
  const y0 = Math.max(0, cy - closeRadius);
  const y1 = Math.min(height - 1, cy + closeRadius);
  const x0 = Math.max(0, cx - closeRadius);
  const x1 = Math.min(width - 1, cx + closeRadius);
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * width;
    const dy = yy - cy;
    for (let xx = x0; xx <= x1; xx++) {
      if (!mask[row + xx]) continue;
      const dx = xx - cx;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  if (best <= hitRadius * hitRadius) return "hit";
  if (best <= closeRadius * closeRadius) return "close";
  return "miss";
}
