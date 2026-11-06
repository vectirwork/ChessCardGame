// Relecture de la passe V2 (diff f32af47 -- src test) : chaque test ci-dessous prouve un défaut trouvé et ÉCHOUE tant
// qu'il n'est pas corrigé. Les scénarios navigateur correspondants (Playwright, version de production construite hors
// du dépôt) sont décrits dans docs/progres/v2-revue.md.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameLayout } from '../src/client/odyssee/shell/layout';

const CLIENT = path.resolve(__dirname, '../src/client');

/** Fichiers atteints par les imports STATIQUES depuis `entry` (les import() dynamiques sont des morceaux à part). */
function staticGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  if (entry.endsWith('.css')) return seen;
  const src = readFileSync(entry, 'utf8');
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith('.')) continue;
    const base = path.resolve(path.dirname(entry), spec);
    const file = [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(
      f => existsSync(f) && /\.(tsx?|css)$/.test(f),
    );
    if (file) staticGraph(file, seen);
  }
  return seen;
}

/** Feuilles de style chargées avec une page ouverte directement : celles du paquet principal et celles de la page. */
function stylesOf(page: string): string[] {
  const files = staticGraph(path.join(CLIENT, 'main.tsx'));
  staticGraph(path.join(CLIENT, page), files);
  return [...files].filter(f => f.endsWith('.css'));
}

/** Une règle `selector { … property: value … }` existe-t-elle dans l'une des feuilles ? */
function hasRule(sheets: string[], selector: RegExp, decl: RegExp): boolean {
  return sheets.some(f => {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(([, sel, body]) => selector.test(sel) && decl.test(body));
  });
}

describe('revue V2 : bulle des cartes hors de la partie (leçons, problèmes, analyse)', () => {
  // CardHand (features/CardHand.tsx) place sa bulle en coordonnées d'écran (getBoundingClientRect, `bottom: vh - top`)
  // et lui donne la classe `is-floating`. Le `position: fixed` correspondant n'est écrit que dans shell.css, qui n'est
  // plus chargé qu'avec l'accueil et /partie depuis le découpage du CSS par page. Ouvertes directement, ces pages
  // posent donc la bulle en `position: absolute` (cards.css) : décalée de la hauteur défilée, sous l'en-tête, voire
  // hors de l'écran avec son bouton « Lancer ce sort ».
  for (const page of ['pages/Learn.tsx', 'pages/Puzzles.tsx', 'pages/Analysis.tsx']) {
    it(`${page} : la bulle .card-bubble.is-floating est en position fixe`, () => {
      const sheets = stylesOf(page);
      expect(sheets.map(f => path.relative(CLIENT, f))).not.toContain('odyssee/shell/shell.css');
      expect(hasRule(sheets, /\.card-bubble\.is-floating\b/, /position\s*:\s*fixed/)).toBe(true);
    });
  }
});

describe('revue V2 : panneau de statut de la partie sur petit téléphone', () => {
  // Coque mobile : l'échiquier commence maintenant à 112 px (bande des cartes adverses, MOBILE_BOARD_TOP) au lieu de
  // 76, et l'invite ou le message au-dessus de l'éventail retirent encore 54 à 55 px au panneau de statut. Sur
  // 375 × 667 (iPhone SE) et 360 × 640, le panneau (titre « À vous de jouer », consigne, délai du premier coup,
  // « Options de la partie ») tombe à 0 à 20 px de haut. En f32af47 il gardait 42 à 96 px.
  const css = (file: string) => readFileSync(path.join(CLIENT, file), 'utf8');
  /** Marges soustraites par la règle `max-height: calc(100vh - var(--gs-top) - var(--gs-g) - Apx - Bpx)` du sélecteur. */
  function margins(file: string, selector: string): number {
    const body = css(file).split(`${selector} {`)[1]?.split('}')[0] ?? '';
    const m = body.match(/max-height:\s*calc\(100vh - var\(--gs-top\) - var\(--gs-g\) - (\d+)px - (\d+)px\)/);
    if (!m) throw new Error(`règle introuvable : ${selector} (${file})`);
    return Number(m[1]) + Number(m[2]);
  }
  /** Hauteur laissée au panneau de statut, comme le calcule le navigateur (bornée à 0). */
  function statusHeight(vw: number, vh: number, sub: number) {
    const g = gameLayout(vw, vh);
    return Math.max(0, vh - (g.y - g.G / 2) - g.G - sub);
  }
  const MIN = 40; // de quoi lire au moins le titre (≈ 27 px) et le début de la consigne

  for (const [vw, vh] of [[360, 640], [375, 667]] as const) {
    it(`partie en ligne ${vw} × ${vh} : au moins ${MIN} px pour le statut, invite affichée ou non`, () => {
      const plain = statusHeight(vw, vh, margins('styles/game.css', '.gs.gp.is-mobile .gs-status'));
      const note = statusHeight(vw, vh, margins('styles/game.css', '.gs.gp.is-mobile.has-fan-note .gs-status'));
      expect({ plain, note }).toEqual({ plain: expect.toSatisfy((h: number) => h >= MIN), note: expect.toSatisfy((h: number) => h >= MIN) });
    });
    it(`accueil ${vw} × ${vh} : au moins ${MIN} px pour le statut avec l'invite (premier passage)`, () => {
      const note = statusHeight(vw, vh, margins('odyssee/shell/shell.css', '.gs.is-mobile.has-fan-note .gs-status'));
      expect(note).toBeGreaterThanOrEqual(MIN);
    });
  }
});
