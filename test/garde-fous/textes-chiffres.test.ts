// Garde-fou des textes chiffrés et de la marque (conception, § 4.1).
//
// Un nombre de règle écrit en dur (« trois cartes », « un sort par tour », « 45 secondes », « huit pouvoirs »,
// « 3 niveaux », « deux Climats »…) ou le nom de la marque écrit en dur ne suivraient pas un changement de réglage.
// Ce test parcourt src/ (hors src/shared/config et src/shared/text, qui en sont la source), index.html et le
// manifeste. Chaque occurrence doit être :
// - soit une exception permanente (exceptions.txt : identifiants techniques, variante PGN, noms des fils de calcul,
//   commentaires) ;
// - soit inscrite dans la dette d'un lot (dette-<lot>.txt), qui la remplace par une phrase dérivée
//   (src/shared/text/regles.ts, text/fr.ts) ou par BRAND, puis retire la ligne. À la fin, toutes les dettes sont vides.
// Une dette qui ne correspond plus à rien fait aussi échouer le test : la liste reste exacte.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const HERE = __dirname;

/** Textes chiffrés : nombre de cartes, de sorts par tour, durée du choix, taille du catalogue, niveaux, R9. */
const RULES =
  /trois (cartes|sorts)|\b3 cartes|un sort par tour|seul sort par tour|une seule carte par tour|une (seule )?par tour|45 secondes|huit (pouvoirs|cartes)|3 niveaux|deux climats/gi;
/** Nom de la marque (pas les identifiants comme SPELLMATE_TEST_RULES). */
const BRAND = /\bspellmate\b/gi;

const SOURCES = /\.(ts|tsx|mts|js|mjs|cjs|css|html|json|webmanifest)$/;
const SKIP = ['src/shared/config/', 'src/shared/text/'];

interface Occurrence {
  file: string;
  text: string;
  line: number;
  content: string;
}

function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : SOURCES.test(e.name) ? [rel] : [];
  });
}

function occurrences(): Occurrence[] {
  const files = ['index.html', 'public/manifest.webmanifest', ...walk('src').filter(f => !SKIP.some(s => f.startsWith(s)))];
  const out: Occurrence[] = [];
  for (const file of files) {
    readFileSync(path.join(ROOT, file), 'utf8')
      .split('\n')
      .forEach((content, i) => {
        for (const re of [RULES, BRAND]) {
          for (const m of content.matchAll(re)) out.push({ file, text: m[0].toLowerCase(), line: i + 1, content: content.trim() });
        }
      });
  }
  return out;
}

/** Lignes utiles d'un fichier de liste : colonnes séparées par des tabulations, commentaires après « # ». */
function entries(file: string): string[][] {
  return readFileSync(path.join(HERE, file), 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('\t').filter(c => !c.startsWith('#')).map(c => c.trimEnd()));
}

const EXCEPTIONS = entries('exceptions.txt').map(([file, text, context]) => ({ file, text, context }));
const DEBT_FILES = readdirSync(HERE).filter(f => /^dette-[\w]+\.txt$/.test(f)).sort();

describe('garde-fou des textes chiffrés et de la marque', () => {
  const found = occurrences().filter(o => !EXCEPTIONS.some(e => e.file === o.file && e.text === o.text && o.content.includes(e.context)));
  const key = (file: string, text: string) => `${file}\t${text}`;

  it('chaque lot a sa dette (dette-<lot>.txt), au format attendu', () => {
    for (const lot of ['0a', '0b', '1', '2', '3', '4', '5', '6', '7', '8', '9']) expect(DEBT_FILES).toContain(`dette-${lot}.txt`);
    for (const f of DEBT_FILES) {
      for (const e of entries(f)) expect(e.length, `${f} : ${e.join(' | ')}`).toBe(2);
    }
  });

  it('chaque occurrence est une exception permanente ou une dette inscrite, et chaque dette existe encore', () => {
    const debt = new Map<string, { count: number; files: Set<string> }>();
    for (const f of DEBT_FILES) {
      for (const [file, text] of entries(f)) {
        const d = debt.get(key(file, text)) ?? { count: 0, files: new Set<string>() };
        d.count++;
        d.files.add(f);
        debt.set(key(file, text), d);
      }
    }
    const seen = new Map<string, Occurrence[]>();
    for (const o of found) seen.set(key(o.file, o.text), [...(seen.get(key(o.file, o.text)) ?? []), o]);

    const problems: string[] = [];
    for (const [k, list] of seen) {
      const allowed = debt.get(k)?.count ?? 0;
      if (list.length > allowed) {
        for (const o of list.slice(allowed)) {
          problems.push(
            `${o.file}:${o.line} « ${o.text} » écrit en dur : dérivez-le de src/shared/text/regles.ts (ou BRAND), ` +
              `sinon inscrivez-le dans la dette de votre lot. Ligne : ${o.content.slice(0, 140)}`,
          );
        }
      }
    }
    for (const [k, d] of debt) {
      const n = seen.get(k)?.length ?? 0;
      const [file, text] = k.split('\t');
      if (n < d.count) problems.push(`${[...d.files].join(', ')} : « ${text} » dans ${file}, inscrit ${d.count} fois, trouvé ${n} fois : retirez la dette réglée.`);
    }
    expect(problems).toEqual([]);
  });

  it('les exceptions permanentes sont justifiées', () => {
    for (const e of entries('exceptions.txt')) expect(e.length, e.join(' | ')).toBe(3);
    expect(readFileSync(path.join(HERE, 'exceptions.txt'), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).every(l => /\t# \S/.test(l))).toBe(true);
  });

  it('les sources des phrases (config, text) ne sont pas parcourues, le reste oui', () => {
    const all = occurrences();
    expect(all.some(o => o.file.startsWith('src/shared/text/'))).toBe(false);
    expect(all.some(o => o.file.startsWith('src/client/'))).toBe(true);
    // index.html est encore parcouru, mais ses textes viennent maintenant de la marque, pliée au build (lot 6).
    expect(readFileSync(path.join(ROOT, 'index.html'), 'utf8')).toContain('%SM_TITRE%');
  });
});
