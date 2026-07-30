/**
 * Small deterministic RNG (mulberry32): same seed, same sequence, every
 * platform. One implementation for every seeded system — the scenery's
 * boot-stable night, the music's per-run patterns, the Daily Moon's shared
 * forest — so "seeded" always means the same thing.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** djb2 over a string, for turning names and dates into seeds. */
export function hashSeed(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h;
}
