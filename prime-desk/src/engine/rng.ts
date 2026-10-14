// Deterministic seeded RNG (mulberry32). The RNG state lives inside GameState so that
// a saved game replays identically and scenarios are reproducible from a seed.

export interface RngHolder {
  rng: number;
}

export function nextU32(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

export function rand(h: RngHolder): number {
  return nextU32(h) / 4294967296;
}

export function randRange(h: RngHolder, lo: number, hi: number): number {
  return lo + (hi - lo) * rand(h);
}

/** Standard normal via Box-Muller. */
export function randNormal(h: RngHolder): number {
  let u = 0;
  while (u === 0) u = rand(h);
  const v = rand(h);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function chance(h: RngHolder, p: number): boolean {
  return rand(h) < p;
}

export function pick<T>(h: RngHolder, arr: readonly T[]): T {
  return arr[Math.floor(rand(h) * arr.length) % arr.length];
}

/** Hash a string to a 32-bit seed (for deterministic per-entity variation). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
