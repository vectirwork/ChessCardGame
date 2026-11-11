// Cases de l'échiquier dans les tests : « e4 » ↔ 28 (a1 = 0, h1 = 7, a8 = 56), comme src/shared/chess.ts (sqIndex,
// sqName). Recopié jusqu'ici dans integration.mjs, ranked.mjs, premoves.test.ts, rois.mjs… (test/lib/client.mjs a le
// même pour les scripts .mjs).

/** Indice d'une case nommée (« e4 » → 28). */
export function sq(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) throw new Error(`Case inconnue : ${name}`);
  return (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
}

/** Plusieurs cases : sqs('e2', 'e4') ou sqs('e2 e4'). */
export function sqs(...names: string[]): number[] {
  return names.flatMap(n => n.split(/\s+/)).filter(Boolean).map(sq);
}

/** Nom d'une case (28 → « e4 »). */
export function sqName(i: number): string {
  if (!Number.isInteger(i) || i < 0 || i > 63) throw new Error(`Indice de case invalide : ${i}`);
  return String.fromCharCode(97 + (i % 8)) + String(Math.floor(i / 8) + 1);
}

/** Les 8 cases d'une rangée (1 à 8), de a à h. */
export function rank(r: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map(f => (r - 1) * 8 + f);
}
