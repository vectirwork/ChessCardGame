// Hasard reproductible des tests : un seul générateur, mulberry32 (le même que climats-random, climats-adverse et
// pouvoirs-adverse, recopié dans chacun avant la polymorphie). À graine égale, la même suite, sur toute machine.

/** Générateur pseudo-aléatoire reproductible (mulberry32) : nombres de [0, 1). Graine entière quelconque. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alias court, comme dans les suites existantes (`rng(seed)`). */
export const rng = mulberry32;

/** Entier de [0, n) tiré avec `rand`. */
export function randInt(rand: () => number, n: number): number {
  return Math.min(n - 1, Math.floor(rand() * n));
}

/** Élément tiré avec `rand` (undefined pour une liste vide). */
export function pick<T>(rand: () => number, list: readonly T[]): T | undefined {
  return list.length ? list[randInt(rand, list.length)] : undefined;
}

/** Copie mélangée (Fisher-Yates) avec `rand`. */
export function shuffle<T>(rand: () => number, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
