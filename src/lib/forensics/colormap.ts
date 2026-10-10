// Hand-written color ramp for forensic maps: ink, deep teal, green, amber, signal red.

const STOPS: readonly (readonly [number, number, number, number])[] = [
  [0.0, 0x12, 0x12, 0x12],
  [0.3, 0x17, 0x50, 0x6b],
  [0.55, 0x1f, 0x9a, 0x7a],
  [0.8, 0xf0, 0xb4, 0x29],
  [1.0, 0xe5, 0x48, 0x4d],
];

/** Maps t in [0, 1] to an RGB triple by linear interpolation between the stops. */
export function ramp(t: number): [number, number, number] {
  const v = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (v <= b[0]) {
      const f = (v - a[0]) / (b[0] - a[0]);
      return [
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        Math.round(a[3] + (b[3] - a[3]) * f),
      ];
    }
  }
  const last = STOPS[STOPS.length - 1];
  return [last[1], last[2], last[3]];
}

/** Precomputed 256-entry lookup table (RGB triplets) for fast per-pixel coloring. */
export function rampTable(): Uint8Array {
  const table = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = ramp(i / 255);
    table[i * 3] = r;
    table[i * 3 + 1] = g;
    table[i * 3 + 2] = b;
  }
  return table;
}
