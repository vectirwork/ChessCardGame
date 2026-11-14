// scripts/verifier-lot.mjs (lot 9e) : la fin d'un gel se calcule d'après les vagues de la carte. Un fichier gelé
// « après le lot A, jusqu'au lot B » l'est pour un lot dont la vague vient strictement après celle de A et strictement
// avant celle de B ; un lot de la vague de B, ou d'une vague suivante, ne l'est plus.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error module .mjs sans déclaration de types
import { gelEnCours, motifRegex, rangsDesLots } from '../scripts/verifier-lot.mjs';

interface Carte {
  vagues: string[][];
  geles: { motif: string; apres: string; jusqua: string; sauf?: string[] }[];
}
const gele = gelEnCours as (carte: Pick<Carte, 'vagues'>, lot: string, gel: { apres: string; jusqua: string }) => boolean;
const rangs = rangsDesLots as (carte: Pick<Carte, 'vagues'>) => Map<string, number>;
const motif = motifRegex as (m: string) => RegExp;

describe('verifier-lot : gels calculés d’après les vagues', () => {
  const carte = { vagues: [['0a', '0b'], ['1', '2'], ['3'], ['9a', '9b'], ['9c'], ['9e'], ['9']] };
  const gel = { apres: '0b', jusqua: '9b' };

  it('rang d’un lot : l’indice de sa vague', () => {
    expect(rangs(carte).get('0a')).toBe(0);
    expect(rangs(carte).get('2')).toBe(1);
    expect(rangs(carte).get('9b')).toBe(3);
    expect(rangs(carte).get('9')).toBe(6);
  });

  it('gelé strictement entre la vague de `apres` et celle de `jusqua`', () => {
    for (const lot of ['1', '2', '3']) expect(gele(carte, lot, gel), lot).toBe(true);
    // La vague de `apres` (0a, posé en parallèle de 0b) et `apres` lui-même : pas encore gelé
    expect(gele(carte, '0a', gel)).toBe(false);
    expect(gele(carte, '0b', gel)).toBe(false);
    // La vague de `jusqua` (9a avec 9b) et toute vague suivante : plus gelé (défaut corrigé : l'égalité refusait 9c et 9)
    for (const lot of ['9a', '9b', '9c', '9e', '9']) expect(gele(carte, lot, gel), lot).toBe(false);
  });

  it('lot absent des vagues (carte incomplète) : gelé, sauf `apres` et `jusqua` eux-mêmes', () => {
    expect(gele(carte, 'x', gel)).toBe(true);
    expect(gele({ vagues: [] }, '0b', gel)).toBe(false);
    expect(gele({ vagues: [] }, '9b', gel)).toBe(false);
    expect(gele({ vagues: [] }, '3', gel)).toBe(true);
  });

  it('carte du dépôt : config/ et protocol.ts gelés pour les lots 1 à 8, libres pour 9c, 9e et 9 ; regles.ts libre dès 9a', () => {
    const vraie = JSON.parse(readFileSync(new URL('../docs/polymorphie/LOTS.json', import.meta.url), 'utf8')) as Carte;
    const config = vraie.geles.find(g => g.motif === 'src/shared/config/**')!;
    const regles = vraie.geles.find(g => g.motif === 'src/shared/text/regles.ts')!;
    expect(motif(config.motif).test('src/shared/config/rules.ts')).toBe(true);
    for (const lot of ['1', '3', '5', '8']) expect(gele(vraie, lot, config), lot).toBe(true);
    for (const lot of ['9b', '9c', '9e', '9']) expect(gele(vraie, lot, config), lot).toBe(false);
    for (const lot of ['8']) expect(gele(vraie, lot, regles), lot).toBe(true);
    for (const lot of ['9a', '9b', '9c', '9e', '9']) expect(gele(vraie, lot, regles), lot).toBe(false);
  });
});
