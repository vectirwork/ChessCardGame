// Seuil du banc d'identité pour les images bruitées des scripts existants (test/identite.mjs, bruitAuDela) : au-delà du
// bruit mesuré (test/fixtures/v1/existantes.json), l'image est un écart.
import { describe, expect, it } from 'vitest';
// @ts-expect-error module .mjs sans déclaration de types
import { bruitAuDela } from './identite.mjs';

describe('banc d’identité : images bruitées', () => {
  it('bruit ordinaire : deux fois les pixels forts, ou un écart maximal plus grand de 32', () => {
    const bruit = { pixels: 6456, forts: 12, max: 52 };
    expect(bruitAuDela({ pixels: 6000, forts: 24, max: 84 }, bruit)).toBe(false);
    expect(bruitAuDela({ pixels: 6000, forts: 25, max: 52 }, bruit)).toBe(true);
    expect(bruitAuDela({ pixels: 6000, forts: 0, max: 85 }, bruit)).toBe(true);
    expect(bruitAuDela({ taille: '1440×900 contre 1280×720' }, bruit)).toBe(true);
  });
  it('bruit d’un seul niveau (écart maximal 1) : un écart plus fort ou plus de quatre fois les pixels en est un', () => {
    const bruit = { pixels: 5, forts: 0, max: 1 };
    expect(bruitAuDela({ pixels: 5, forts: 0, max: 1 }, bruit)).toBe(false);
    expect(bruitAuDela({ pixels: 20, forts: 0, max: 1 }, bruit)).toBe(false);
    expect(bruitAuDela({ pixels: 21, forts: 0, max: 1 }, bruit)).toBe(true);
    // Avant : un écart de 2 à 33 sur un seul pixel passait sous la marge de 32
    expect(bruitAuDela({ pixels: 1, forts: 0, max: 2 }, bruit)).toBe(true);
    expect(bruitAuDela({ pixels: 3, forts: 1, max: 30 }, bruit)).toBe(true);
  });
});
