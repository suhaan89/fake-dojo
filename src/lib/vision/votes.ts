// Turns detected hands into a class vote. Pure functions, no camera or model in here.

export type VoteSide = "real" | "edited";

export interface Point {
  x: number;
  y: number;
}

/** Hands closer to the middle than this (in share of the frame width) count for neither side. */
export const DEAD_ZONE = 0.06;
/** A side needs this share of all counted hand sightings to win the vote. */
export const MIN_SHARE = 0.55;
/** Fewer sightings than this over the whole countdown is treated as "nobody voted". */
export const MIN_SIGHTINGS = 4;

/** Centre of a hand: the mean of its landmarks, in normalized camera coordinates. */
export function handCentre(landmarks: readonly Point[]): Point | null {
  if (!landmarks.length) return null;
  let x = 0;
  let y = 0;
  for (const point of landmarks) {
    x += point.x;
    y += point.y;
  }
  return { x: x / landmarks.length, y: y / landmarks.length };
}

/**
 * Which side a hand votes for. `x` is in raw camera coordinates, where a person's left hand
 * shows up on the right of the frame. The preview is mirrored, so on screen the left hand
 * is on the left, under "Real".
 */
export function sideOf(x: number): VoteSide | null {
  if (Math.abs(x - 0.5) < DEAD_ZONE) return null;
  return x > 0.5 ? "real" : "edited";
}

export interface Tally {
  real: number;
  edited: number;
}

/** Hands per side in one camera frame. */
export function countHands(hands: readonly (readonly Point[])[]): Tally {
  const tally: Tally = { real: 0, edited: 0 };
  for (const hand of hands) {
    const centre = handCentre(hand);
    const side = centre ? sideOf(centre.x) : null;
    if (side) tally[side]++;
  }
  return tally;
}

export function addTally(total: Tally, frame: Tally): Tally {
  return { real: total.real + frame.real, edited: total.edited + frame.edited };
}

/** The vote after the countdown, or null when too few hands were seen or the sides are tied. */
export function decide(total: Tally): VoteSide | null {
  const all = total.real + total.edited;
  if (all < MIN_SIGHTINGS) return null;
  if (total.real / all >= MIN_SHARE) return "real";
  if (total.edited / all >= MIN_SHARE) return "edited";
  return null;
}
