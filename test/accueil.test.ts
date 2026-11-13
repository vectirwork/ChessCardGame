// Accueil (L'Odyssée, lot 7) : sauvegarde locale de la partie contre l'Oracle, géométrie de l'échiquier dans les deux
// orientations, attributs des lieux, textes de l'accueil.
// Caractérisation d'abord (verte sur le code d'avant le lot 7) : ce que l'accueil produit aujourd'hui, au caractère près.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cellOf, squareAt } from '../src/client/components/boardGeometry';
import { LEVELS, MODES, PLACES, principle } from '../src/client/odyssee/data';
import { loadSaved, validState } from '../src/client/odyssee/useLiveGame';

const ROOT = path.resolve(__dirname, '..');
const fixture = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/v1/accueil-v1.json'), 'utf8')) as {
  cle: string;
  valeur: { v: 1; state: Record<string, unknown> & { hands: { w: unknown[]; b: unknown[] }; ply: number }; savedAt: number };
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** localStorage de doublure (environnement node). */
function stubStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  });
  return m;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sauvegarde de la partie contre l’Oracle (format v1)', () => {
  it('le témoin v1 est accepté et repris tel quel', () => {
    expect(fixture.cle).toBe('sm:odyssee:partie');
    expect(validState(clone(fixture.valeur.state))).toBe(true);
    stubStorage({ [fixture.cle]: JSON.stringify(fixture.valeur) });
    vi.useFakeTimers();
    vi.setSystemTime(fixture.valeur.savedAt);
    const s = loadSaved();
    expect(s).not.toBeNull();
    expect(s!.ply).toBe(fixture.valeur.state.ply);
    expect(s!.hands).toEqual(fixture.valeur.state.hands);
  });

  it('refusée : autre catalogue, forme abîmée, partie trop ancienne, autre version', () => {
    const duel = clone(fixture.valeur.state);
    duel.catalog = 'duel';
    expect(validState(duel)).toBe(false);
    const sans = clone(fixture.valeur.state);
    delete sans.catalog;
    expect(validState(sans)).toBe(false);
    const abimee = clone(fixture.valeur.state);
    abimee.hands = { w: [{ card: 'portail', used: false }], b: [] };
    expect(validState(abimee)).toBe(false);
    expect(validState(null)).toBe(false);
    expect(validState({})).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(fixture.valeur.savedAt + 31 * 24 * 3600 * 1000);
    stubStorage({ [fixture.cle]: JSON.stringify(fixture.valeur) });
    expect(loadSaved()).toBeNull();
    vi.setSystemTime(fixture.valeur.savedAt);
    stubStorage({ [fixture.cle]: JSON.stringify({ ...fixture.valeur, v: 2 }) });
    expect(loadSaved()).toBeNull();
  });
});

describe('géométrie de l’échiquier (boardGeometry) : halo et curseur de l’accueil dans les deux orientations', () => {
  it('Blancs en bas : a1 en bas à gauche, h8 en haut à droite', () => {
    expect(cellOf(0, 'w')).toEqual({ x: 0, y: 7 });
    expect(cellOf(63, 'w')).toEqual({ x: 7, y: 0 });
    expect(cellOf(12, 'w')).toEqual({ x: 4, y: 6 }); // e2
    expect(squareAt(0.01, 0.99, 'w')).toBe(0);
    expect(squareAt(4.5 / 8, 6.5 / 8, 'w')).toBe(12);
  });
  it('Noirs en bas : h8 en bas à gauche, a1 en haut à droite', () => {
    expect(cellOf(63, 'b')).toEqual({ x: 0, y: 7 });
    expect(cellOf(0, 'b')).toEqual({ x: 7, y: 0 });
    expect(cellOf(52, 'b')).toEqual({ x: 3, y: 6 }); // e7
    expect(squareAt(0.01, 0.99, 'b')).toBe(63);
    expect(squareAt(3.5 / 8, 6.5 / 8, 'b')).toBe(52);
  });
  it('aller-retour, hors de l’échiquier : null', () => {
    for (const o of ['w', 'b'] as const) {
      for (let sq = 0; sq < 64; sq++) {
        const { x, y } = cellOf(sq, o);
        expect(squareAt((x + 0.5) / 8, (y + 0.5) / 8, o)).toBe(sq);
      }
      expect(squareAt(-0.01, 0.5, o)).toBeNull();
      expect(squareAt(0.5, 1, o)).toBeNull();
    }
  });
});

/** Attributs des sections des lieux, tels qu'ils sont écrits dans OdysseeHome.tsx avant le lot 7. */
const SECTIONS = [
  { id: 'observatoire', pose: 'hero', n: 0 },
  { id: 'foret', pose: 'foret', n: 1 },
  { id: 'pics', pose: 'pics', n: 2 },
  { id: 'sablier', pose: 'sablier', n: 3 },
  { id: 'bazar', pose: 'bazar', n: 4 },
  { id: 'seuil', pose: 'seuil', n: 5 },
];

describe('lieux de la descente', () => {
  it('PLACES : six lieux, dans l’ordre des sections', () => {
    expect(PLACES.map(p => p.id)).toEqual(SECTIONS.map(s => s.pose));
    expect(PLACES.map(p => p.num)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
  });
  it('attributs des sections (id, data-pose, data-scene, data-place)', () => {
    const src = readFileSync(path.join(ROOT, 'src/client/odyssee/OdysseeHome.tsx'), 'utf8');
    for (const s of SECTIONS) {
      expect(src).toContain(`id="${s.id}" data-pose="${s.pose}" data-scene="${s.n}" data-place="${s.n}"`);
    }
  });
});

describe('textes de l’accueil au réglage par défaut', () => {
  it('principe (Forêt de givre)', () => {
    expect(principle().map(p => [p.n, p.title, p.text])).toEqual([
      ['01', 'Les échecs, intacts.', 'Roque, prise en passant, promotion, pendule : toutes les règles, sans exception. Votre jeu reste votre meilleure arme.'],
      [
        '02',
        'Trois cartes, visibles.',
        "Au début d'une partie, vous choisissez vos trois cartes ; sur l'accueil, elles sont tirées au hasard. Visibles des deux joueurs, chacune ne sert qu'une fois.",
      ],
      ['03', 'Un sort par tour.', 'Avant votre coup, lancez une carte : elle change la partie pour les deux camps. Certaines s’annoncent un tour à l’avance.'],
    ]);
  });
  it('portes du Seuil et niveaux de l’IA', () => {
    expect(MODES.map(m => [m.key, m.title, m.tag, m.text])).toEqual([
      ['ami', 'Défier un ami', 'Sans compte', 'Créez une partie, envoyez le lien. Votre ami la rejoint en un clic, sur mobile comme sur ordinateur.'],
      ['ia', "Affronter l'IA", '3 niveaux', 'Apprenti, Sorcier ou Archimage : une IA qui calcule et garde ses sorts pour le bon moment.'],
      ['elo', 'Parties classées', 'Elo', "Montez au classement et gardez l'historique de vos parties. Un compte gratuit suffit."],
    ]);
    expect(LEVELS).toEqual([
      { level: 1, name: 'Apprenti', text: 'Joue vite, lance ses sorts au hasard.' },
      { level: 2, name: 'Sorcier', text: 'Calcule, protège ses pièces, garde une carte pour la fin.' },
      { level: 3, name: 'Archimage', text: 'Calcule en profondeur et punit chaque sort gaspillé.' },
    ]);
  });
});
