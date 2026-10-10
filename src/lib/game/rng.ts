export type Random = () => number;

/** Mulberry32: small, fast, deterministic generator returning values in [0, 1). */
export function mulberry32(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seededRandom(seed: string): Random {
  return mulberry32(hashString(seed));
}

/** Fisher-Yates shuffle that returns a new array. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/** Picks a key with probability proportional to its weight. */
export function pickWeighted<K extends string>(weights: Record<K, number>, random: Random): K {
  const keys = Object.keys(weights) as K[];
  let total = 0;
  for (const key of keys) total += Math.max(0, weights[key]);
  if (total <= 0) return keys[Math.floor(random() * keys.length)];
  let roll = random() * total;
  for (const key of keys) {
    roll -= Math.max(0, weights[key]);
    if (roll < 0) return key;
  }
  return keys[keys.length - 1];
}
