import { nextDifficulty, START_DIFFICULTY, toDifficulty } from "./difficulty";
import {
  MANIPULATION_TYPES,
  type ManipulationType,
  type Profile,
  type RoundRecord,
  type TypeSkill,
} from "./types";

export const PROFILE_KEY = "fakedojo.profile.v1";
export const MAX_ROUNDS = 30;

export interface Belt {
  name: string;
  points: number;
  color: string;
}

export const BELTS: readonly Belt[] = [
  { name: "White", points: 0, color: "#ffffff" },
  { name: "Yellow", points: 500, color: "#e8c53a" },
  { name: "Orange", points: 1500, color: "#e07b28" },
  { name: "Green", points: 3000, color: "#1f7a5a" },
  { name: "Blue", points: 5000, color: "#2f5f9e" },
  { name: "Brown", points: 8000, color: "#6b4a2f" },
  { name: "Black", points: 12000, color: "#121212" },
];

export function beltFor(points: number): Belt {
  let current = BELTS[0];
  for (const belt of BELTS) if (points >= belt.points) current = belt;
  return current;
}

export interface BeltProgress {
  belt: Belt;
  next: Belt | null;
  /** 0..1 progress from the current belt to the next one. */
  fraction: number;
  pointsToNext: number;
}

export function beltProgress(points: number): BeltProgress {
  const belt = beltFor(points);
  const next = BELTS[BELTS.indexOf(belt) + 1] ?? null;
  if (!next) return { belt, next: null, fraction: 1, pointsToNext: 0 };
  const span = next.points - belt.points;
  return {
    belt,
    next,
    fraction: Math.min(1, Math.max(0, (points - belt.points) / span)),
    pointsToNext: Math.max(0, next.points - points),
  };
}

/** Mean of Beta(1 + hits, 1 + misses): 0.5 with no data, moving toward the observed rate. */
export function skillMean(skill: TypeSkill): number {
  return (1 + skill.hits) / (2 + skill.hits + skill.misses);
}

/** Weakness per type (1 minus the skill mean), normalized to sum to 1. Sent to the planner. */
export function weaknessWeights(profile: Profile): Record<ManipulationType, number> {
  const raw = {} as Record<ManipulationType, number>;
  let total = 0;
  for (const type of MANIPULATION_TYPES) {
    raw[type] = 1 - skillMean(profile.skills[type]);
    total += raw[type];
  }
  for (const type of MANIPULATION_TYPES) raw[type] = raw[type] / total;
  return raw;
}

/** The type with the lowest skill mean among those the player has actually met. */
export function weakestType(profile: Profile): ManipulationType | null {
  let weakest: ManipulationType | null = null;
  let lowest = Infinity;
  for (const type of MANIPULATION_TYPES) {
    const skill = profile.skills[type];
    if (skill.hits + skill.misses === 0) continue;
    const mean = skillMean(skill);
    if (mean < lowest) {
      lowest = mean;
      weakest = type;
    }
  }
  return weakest;
}

export function emptyProfile(): Profile {
  const skills = {} as Record<ManipulationType, TypeSkill>;
  for (const type of MANIPULATION_TYPES) skills[type] = { hits: 0, misses: 0 };
  return { version: 1, points: 0, skills, difficulty: START_DIFFICULTY, streak: 0, rounds: [] };
}

/** Returns a new profile with the round applied: points, skill, difficulty and history. */
export function applyRound(profile: Profile, round: RoundRecord): Profile {
  const skills = { ...profile.skills };
  if (round.type) {
    const prev = skills[round.type];
    skills[round.type] = round.hit
      ? { hits: prev.hits + 1, misses: prev.misses }
      : { hits: prev.hits, misses: prev.misses + 1 };
  }
  // Only live forge rounds drive the adaptive difficulty; deck cards have a fixed one.
  const state =
    round.mode === "forge"
      ? nextDifficulty({ difficulty: profile.difficulty, streak: profile.streak }, round.hit)
      : { difficulty: profile.difficulty, streak: profile.streak };
  return {
    version: 1,
    points: profile.points + Math.max(0, round.points),
    skills,
    difficulty: state.difficulty,
    streak: state.streak,
    rounds: [round, ...profile.rounds].slice(0, MAX_ROUNDS),
  };
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** Rebuilds a valid profile from untrusted stored JSON. Unknown shapes fall back to defaults. */
export function sanitizeProfile(value: unknown): Profile {
  const base = emptyProfile();
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return base;
  base.points = count(raw.points);
  base.difficulty = toDifficulty(typeof raw.difficulty === "number" ? raw.difficulty : START_DIFFICULTY);
  base.streak = Math.min(1, count(raw.streak));
  const skills = (raw.skills ?? {}) as Record<string, unknown>;
  for (const type of MANIPULATION_TYPES) {
    const s = (skills[type] ?? {}) as Record<string, unknown>;
    base.skills[type] = { hits: count(s.hits), misses: count(s.misses) };
  }
  if (Array.isArray(raw.rounds)) {
    for (const entry of raw.rounds.slice(0, MAX_ROUNDS)) {
      if (!entry || typeof entry !== "object") continue;
      const r = entry as Record<string, unknown>;
      const type = MANIPULATION_TYPES.find((t) => t === r.type) ?? null;
      base.rounds.push({
        at: count(r.at),
        mode: r.mode === "dojo" ? "dojo" : "forge",
        type,
        difficulty: toDifficulty(count(r.difficulty) || 1),
        hit: r.hit === true,
        points: count(r.points),
        guesses: count(r.guesses),
        hints: count(r.hints),
        labUses: count(r.labUses),
      });
    }
  }
  return base;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Never throws: a missing or broken storage yields a fresh profile. */
export function loadProfile(storage: StorageLike | null = browserStorage()): Profile {
  try {
    const text = storage?.getItem(PROFILE_KEY);
    return text ? sanitizeProfile(JSON.parse(text)) : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

/** Returns false when the profile could not be stored (private mode, quota, disabled). */
export function saveProfile(profile: Profile, storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile(storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(PROFILE_KEY);
    return true;
  } catch {
    return false;
  }
}
