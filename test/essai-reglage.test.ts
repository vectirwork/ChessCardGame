// scripts/essai-reglage.mjs (lot 9e) : les essais prêts à l'emploi visent toujours le bon bloc (GAME_RULES, DEAL, une
// carte de CARDS), les remplacements sont exacts, --regle, --deal et --carte changent la seule ligne de leur clé dans
// son bloc, et chaque garde attendu désigne un fichier et un test qui existent (jamais un fichier qui ne se charge pas).
// Ce test ne dépend pas des valeurs par défaut : il vérifie les repères des blocs, pas les valeurs qu'ils contiennent.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error module .mjs sans déclaration de types
import { ESSAIS, ErreurUsage, GARDES, changementDeValeur, gardeDe, remplacer } from '../scripts/essai-reglage.mjs';

interface Changement {
  fichier: string;
  dans?: string;
  fin?: string;
  avant?: string;
  apres?: string;
  cle?: string;
  valeur?: string;
  titre?: string;
}
const ROOT = path.resolve(__dirname, '..');
const lire = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const remplace = remplacer as (texte: string, c: Changement) => { texte: string; ligne: number; avant?: string; apres?: string };
const valeur = changementDeValeur as (option: 'regle' | 'deal' | 'carte', brut: string) => Changement;
const garde = gardeDe as (e: { fichier: string; test: string }) => unknown;
const essais = ESSAIS as Record<string, { titre: string; changements: Changement[] }>;
const gardes = GARDES as { fichier: string; test?: RegExp; quoi: string }[];

describe('outil d’essai d’un réglage', () => {
  it('les 7 essais du lot 9c et les 3 de la relecture du lot 9e, chacun dans un bloc repéré une seule fois', () => {
    expect(Object.keys(essais)).toEqual(['cinq', 'deuxParTour', 'remplaceCoup', 'presage4', 'trente', 'mur', 'six', 'un', 'tirage', 'faille']);
    for (const [nom, e] of Object.entries(essais)) {
      for (const c of e.changements) {
        const texte = lire(c.fichier);
        expect(texte.split(c.dans!).length - 1, `${nom} : repère ${c.dans}`).toBe(1);
        expect(texte.indexOf(c.fin!, texte.indexOf(c.dans!)), `${nom} : fin du bloc`).toBeGreaterThan(texte.indexOf(c.dans!));
      }
    }
  });

  it('remplacement exact : une seule occurrence, sinon refus ; dans un bloc, jamais hors du bloc', () => {
    const texte = 'const A = {\n  n: 3,\n} as X;\nconst B = {\n  n: 3,\n} as Y;\n';
    expect(() => remplace(texte, { fichier: 'f', avant: '  n: 3,', apres: '  n: 5,' })).toThrow(ErreurUsage);
    expect(() => remplace(texte, { fichier: 'f', avant: '  n: 4,', apres: '  n: 5,' })).toThrow(/apparaît 0 fois/);
    const b = remplace(texte, { fichier: 'f', dans: 'const B', fin: '} as Y;', avant: '  n: 3,', apres: '  n: 5,' });
    expect(b).toEqual({ texte: 'const A = {\n  n: 3,\n} as X;\nconst B = {\n  n: 5,\n} as Y;\n', ligne: 5 });
    // Valeur absente du bloc (déjà changée) : refus, même si elle apparaît plus loin dans le fichier.
    const apres = 'const A = {\n  n: 5,\n} as X;\nconst B = {\n  n: 3,\n} as Y;\n';
    expect(() => remplace(apres, { fichier: 'f', dans: 'const A', fin: '} as X;', avant: '  n: 3,', apres: '  n: 4,' })).toThrow(/déjà changé/);
    expect(() => remplace(texte, { fichier: 'f', dans: 'const', fin: '}', avant: '  n: 3,', apres: '' })).toThrow(/apparaît 2 fois/);
  });

  it('--regle, --deal, --carte : la seule ligne de la clé dans son bloc, valeur écrite en JSON ; sinon refus', () => {
    // Valeurs choisies hors de tout défaut possible (99, 12345) : le test ne dépend pas des valeurs du jour.
    const regles = lire('src/shared/config/rules.ts');
    const change = (avant: string, apres: string) => apres.split('\n').filter((l, i) => l !== avant.split('\n')[i]);
    // « cardsPerPlayer: 3, » est aussi dans RULES_V1 : seule la ligne de GAME_RULES change.
    const cartes99 = remplace(regles, valeur('regle', 'cardsPerPlayer=99'));
    expect(change(regles, cartes99.texte)).toEqual(['  cardsPerPlayer: 99,']);
    expect(cartes99.texte.indexOf('  cardsPerPlayer: 99,')).toBeGreaterThan(regles.indexOf('export const GAME_RULES'));
    expect(cartes99.texte.indexOf('  cardsPerPlayer: 99,')).toBeLessThan(regles.indexOf('export const RULES_BY_CONTEXT'));
    expect(remplace(regles, valeur('regle', 'startFen=null')).apres).toBe('  startFen: null,');
    const duree = remplace(regles, valeur('deal', 'draftMs=12345'));
    expect(change(regles, duree.texte)).toEqual(['  draftMs: 12345,']);
    expect(duree.texte.indexOf('  draftMs: 12345,')).toBeGreaterThan(regles.indexOf('export const DEAL'));
    expect(remplace(regles, valeur('deal', 'draft=false')).apres).toBe('  draft: false,');
    expect(remplace(regles, valeur('deal', 'handLimits={"maxPerFamily":{"climat":3}}')).apres).toBe('  handLimits: {"maxPerFamily":{"climat":3}},');
    const cartes = lire('src/shared/cards.ts');
    const faille = remplace(cartes, valeur('carte', 'rift.coups=99'));
    expect(faille.apres).toBe('    coups: 99,');
    // Une seule ligne change, dans le bloc de la Faille (d'autres cartes ont aussi une ligne « coups: »).
    const debutFaille = cartes.indexOf("  rift: {\n    id: 'rift',");
    const ligneFaille = cartes.slice(0, debutFaille).split('\n').length;
    const finFaille = cartes.slice(0, cartes.indexOf('\n  },', debutFaille)).split('\n').length;
    expect(change(cartes, faille.texte)).toEqual(['    coups: 99,']);
    expect(faille.ligne).toBeGreaterThan(ligneFaille);
    expect(faille.ligne).toBeLessThanOrEqual(finFaille);
    expect(remplace(cartes, valeur('carte', 'ice_wall.ranks=[2,3,4]')).apres).toBe('    ranks: [2,3,4],');
    // Clé inconnue, absente de la carte, ou option mal formée : refus (code 2).
    expect(() => remplace(regles, valeur('regle', 'cardPerPlayer=4'))).toThrow(/apparaît 0 fois/);
    expect(() => remplace(cartes, valeur('carte', 'truce.ranks=[1]'))).toThrow(/apparaît 0 fois/);
    expect(() => valeur('carte', 'coups=6')).toThrow(ErreurUsage);
    expect(() => valeur('regle', 'cardsPerPlayer')).toThrow(ErreurUsage);
  });

  it('gardes attendus : jamais un fichier qui ne se charge pas ; dans reglages-doc, seulement les valeurs et les listes « Masqués »', () => {
    expect(garde({ fichier: 'test/garde-fous/defauts.test.ts', test: 'garde des valeurs par défaut regles (src/shared/config/rules.ts)' })).toBeDefined();
    expect(garde({ fichier: 'test/garde-fous/defauts.test.ts', test: '(fichier entier : erreur au chargement)' })).toBeUndefined();
    expect(garde({ fichier: 'test/reglages-doc.test.ts', test: 'docs/REGLAGES.md : tables des réglages valeurs par défaut écrites en code : celles du code' })).toBeDefined();
    expect(garde({ fichier: 'test/reglages-doc.test.ts', test: 'docs/REGLAGES.md : affirmations vérifiées dans le code 3.6 : leçons et problèmes masqués par « la carte remplace le coup »' })).toBeDefined();
    expect(garde({ fichier: 'test/reglages-doc.test.ts', test: 'docs/REGLAGES.md : affirmations vérifiées dans le code 3.4 : six cartes refusées avec le message cité ; réserve de l’accueil et deux sorties acceptées' })).toBeUndefined();
    expect(garde({ fichier: 'test/reglages-doc.test.ts', test: 'docs/REGLAGES.md : affirmations vérifiées dans le code au défaut, la configuration est jouable' })).toBeDefined();
    expect(garde({ fichier: 'test/accueil.test.ts', test: 'n’importe quoi' })).toBeUndefined();
  });

  it('gardes attendus : fichiers et tests existants, avec ce qu’il faut mettre à jour', () => {
    for (const g of gardes) {
      expect(existsSync(path.join(ROOT, g.fichier)), g.fichier).toBe(true);
      expect(g.quoi.length).toBeGreaterThan(20);
      if (g.test) {
        const noms = [...lire(g.fichier).matchAll(/\bit\(\s*'([^']+)'/g)].map(m => m[1]);
        expect(noms.some(n => g.test!.test(n)), `${g.fichier} : ${g.test}`).toBe(true);
      }
    }
  });
});
