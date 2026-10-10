import type { Difficulty } from "./types";

/** Share of the image area (in percent) the edit region should cover, per difficulty. */
export const AREA_RANGES: Record<Difficulty, readonly [number, number]> = {
  1: [8, 15],
  2: [5, 10],
  3: [3, 8],
  4: [1, 4],
  5: [0.5, 3],
};

export const AREA_TOLERANCE = 0.3;
export const START_DIFFICULTY: Difficulty = 2;
/** Lab tools are offered during the hunt from this difficulty upward. */
export const LAB_TOOLS_FROM: Difficulty = 3;

export function toDifficulty(value: number): Difficulty {
  const n = Math.round(Number.isFinite(value) ? value : START_DIFFICULTY);
  return Math.min(5, Math.max(1, n)) as Difficulty;
}

export function areaRange(difficulty: number): readonly [number, number] {
  return AREA_RANGES[toDifficulty(difficulty)];
}

/** True when `areaPct` lies inside the difficulty range widened by the tolerance. */
export function areaFits(areaPct: number, difficulty: number, tolerance = AREA_TOLERANCE): boolean {
  const [min, max] = areaRange(difficulty);
  return areaPct >= min * (1 - tolerance) && areaPct <= max * (1 + tolerance);
}

export interface DifficultyState {
  difficulty: Difficulty;
  streak: number;
}

/** Plus one after two hits in a row, minus one after a miss, clamped to 1..5. */
export function nextDifficulty(state: DifficultyState, hit: boolean): DifficultyState {
  if (!hit) {
    return { difficulty: toDifficulty(state.difficulty - 1), streak: 0 };
  }
  const streak = state.streak + 1;
  if (streak >= 2) {
    return { difficulty: toDifficulty(state.difficulty + 1), streak: 0 };
  }
  return { difficulty: state.difficulty, streak };
}

export interface PostProcess {
  jpegQuality: number;
  noiseSigma: number;
  /** Plain-language explanation shown on the reveal. */
  note: string;
}

/** How the forged image is encoded: low levels leave forensic traces in, high levels hide them. */
export function postProcessFor(difficulty: number): PostProcess {
  const d = toDifficulty(difficulty);
  if (d <= 2) {
    return {
      jpegQuality: 95,
      noiseSigma: 0,
      note: "Saved without extra compression, so the pasted region still compresses differently. ELA can pick that up.",
    };
  }
  if (d === 3) {
    return {
      jpegQuality: 90,
      noiseSigma: 0,
      note: "Saved with mild re-compression, which weakens the ELA trace but does not erase it.",
    };
  }
  return {
    jpegQuality: 85,
    noiseSigma: 1.2,
    note: "A thin layer of noise and stronger re-compression were added to the whole image. That hides most forensic traces, exactly what a careful forger would do.",
  };
}

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  1: "Obvious",
  2: "Easy",
  3: "Fair",
  4: "Subtle",
  5: "Very subtle",
};
