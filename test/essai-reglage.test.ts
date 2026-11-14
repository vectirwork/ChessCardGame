// scripts/essai-reglage.mjs (lot 9e) : les essais prêts à l'emploi visent toujours le bon bloc (GAME_RULES, DEAL, le Mur
// de glace), les remplacements sont exacts, et chaque garde attendu désigne un fichier et un test qui existent. Ce test
// ne dépend pas des valeurs par défaut : il vérifie les repères des blocs, pas les valeurs qu'ils contiennent.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error module .mjs sans déclaration de types
import { ESSAIS, ErreurUsage, GARDES, remplacer } from '../scripts/essai-reglage.mjs';

interface Changement {
  fichier: string;
  dans?: string;
  fin?: string;
  avant: string;
  apres: string;
}
const ROOT = path.resolve(__dirname, '..');
const lire = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const remplace = remplacer as (texte: string, c: Changement) => { texte: string; ligne: number };
const essais = ESSAIS as Record<string, { titre: string; changements: Changement[] }>;
const gardes = GARDES as { fichier: string; test?: RegExp; quoi: string }[];

describe('outil d’essai d’un réglage', () => {
  it('les 7 essais du lot 9c, chacun dans un bloc repéré une seule fois', () => {
    expect(Object.keys(essais)).toEqual(['cinq', 'deuxParTour', 'remplaceCoup', 'presage4', 'trente', 'mur', 'six']);
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
