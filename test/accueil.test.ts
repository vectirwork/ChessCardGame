// Accueil (L'Odyssée, lot 7) : sauvegarde locale de la partie contre l'Oracle, géométrie de l'échiquier dans les deux
// orientations, attributs des lieux, textes de l'accueil.
// Caractérisation d'abord (verte sur le code d'avant le lot 7) : ce que l'accueil produisait, au caractère près ; puis
// les mêmes valeurs lues dans PLACES, HOME et les règles, et les textes pour 1 et 5 cartes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cellOf, squareAt } from '../src/client/components/boardGeometry';
import {
  LEVELS, MODES, MORE_SLOTS, PAGE_TEXTS, PLACE, PLACES, doorKicker, doorNum, doorsLabel, howToPlay, liveTexts, placeAttrs, placeIndex,
  principle,
} from '../src/client/odyssee/data';
import type { TextRules } from '../src/client/odyssee/data';
import { BOT, PLAYER, abortedEmpty, loadSaved, validState } from '../src/client/odyssee/useLiveGame';
import { DEFAULT_PERSPECTIVE } from '../src/client/vfx/config';
import { CARDS } from '../src/shared/cards';
import { GAME_RULES, RULES_V1 } from '../src/shared/config/rules';
import { HOME } from '../src/shared/config/home';
import { createGame, dealHands } from '../src/shared/game';
import { DEFAULT_QUICK, TIME_CONTROLS } from '../src/shared/protocol';
import { rulesFor, setRulesOverride } from '../src/shared/rulesCore';

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
  setRulesOverride(null);
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

  it('refusée si ses règles ne sont plus celles de l’accueil, ou si ses mains n’ont pas leur nombre de cartes', () => {
    // Mains de 4 cartes avec les règles par défaut (3 cartes) : refusée
    const longue = clone(fixture.valeur.state);
    longue.hands.w.push({ card: 'truce', used: false });
    expect(validState(longue)).toBe(false);
    // Règles photographiées différentes de celles de l'accueil : refusée
    const autres = clone(fixture.valeur.state);
    (autres as Record<string, unknown>).rules = { ...RULES_V1, cardsPerTurn: 2 };
    expect(validState(autres)).toBe(false);
    // Accueil réglé à 5 cartes : l'ancienne sauvegarde v1 (3 cartes, règles V1) repart de zéro
    setRulesOverride({ cardsPerPlayer: 5 });
    expect(validState(clone(fixture.valeur.state))).toBe(false);
    // … et une partie neuve de l'accueil à ces règles est acceptée
    const rules = rulesFor('accueil');
    const neuve = JSON.parse(
      JSON.stringify(createGame(dealHands(HOME.timed, Math.random, HOME.catalog, { vsBot: HOME.vsBot, rules }), HOME.timed, HOME.catalog, { rules })),
    );
    expect(neuve.hands.w).toHaveLength(5);
    expect(validState(neuve)).toBe(true);
  });

  it('format v1 conservé : rien de nouveau n’est écrit dans une partie neuve au défaut', () => {
    const rules = rulesFor('accueil');
    expect(rules).toBe(RULES_V1);
    const s = createGame(dealHands(HOME.timed, Math.random, HOME.catalog, { vsBot: HOME.vsBot, rules }), HOME.timed, HOME.catalog, { rules });
    expect('rules' in s).toBe(false);
    expect('cardsThisTurn' in s).toBe(false);
    expect(validState(JSON.parse(JSON.stringify(s)))).toBe(true);
    expect([PLAYER, BOT]).toEqual(['w', 'b']);
  });

  it('tirage contre l’Oracle : vsBot ne change rien au défaut (le Sablier fou, seule carte réservée aux humains, demande une pendule)', () => {
    const seed = (n: number) => () => {
      n = (n * 1103515245 + 12345) % 2 ** 31;
      return n / 2 ** 31;
    };
    for (let k = 1; k < 40; k++) {
      expect(dealHands(false, seed(k), 'climats', { vsBot: true })).toEqual(dealHands(false, seed(k), 'climats'));
    }
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
  it('PLACES : six lieux, dans l’ordre des sections, numérotés en chiffres romains', () => {
    expect(PLACES.map(p => p.id)).toEqual(SECTIONS.map(s => s.pose));
    expect(PLACES.map(p => p.num)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
    expect(PLACES.map(p => p.anchor)).toEqual(SECTIONS.map(s => s.id));
    expect(PLACE.bazar).toBe(PLACES[4]);
    expect(placeIndex('seuil')).toBe(5);
  });
  it('placeAttrs(id) : les attributs écrits avant le lot 7, dans le même ordre, le même objet à chaque appel', () => {
    for (const s of SECTIONS) {
      const a = placeAttrs(s.pose as (typeof PLACES)[number]['id']);
      expect(Object.entries(a)).toEqual([
        ['id', s.id],
        ['data-pose', s.pose],
        ['data-scene', String(s.n)],
        ['data-place', String(s.n)],
      ]);
      expect(placeAttrs(s.pose as (typeof PLACES)[number]['id'])).toBe(a);
    }
  });
  it('OdysseeHome n’écrit plus ces attributs à la main ; scenery choisit le décor par identifiant', () => {
    const src = readFileSync(path.join(ROOT, 'src/client/odyssee/OdysseeHome.tsx'), 'utf8');
    expect(src).not.toMatch(/data-scene="\d"|data-place="\d"|PLACES\[\d\]/);
    for (const s of SECTIONS) expect(src).toContain(`{...placeAttrs('${s.pose}')}`);
    const scenery = readFileSync(path.join(ROOT, 'src/client/odyssee/scenery.tsx'), 'utf8');
    expect(scenery).toMatch(/const Scene = SCENES\[id\]/);
  });
  it('Bazar : aucune étagère de plus au défaut (les emplacements de SLOT_DEFS ont chacun la leur)', () => {
    expect(MORE_SLOTS).toEqual([]);
  });
});

/** Règles de démonstration des textes, sans passer par checkRules (seuls les champs lus par les textes comptent). */
const avec = (p: Partial<TextRules>): TextRules => ({ ...GAME_RULES, ...p });

describe('textes de l’accueil au réglage par défaut', () => {
  it('principe (Forêt de givre)', () => {
    expect(principle(GAME_RULES)).toEqual(principle());
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
    expect(doorsLabel(MODES.length)).toBe('Trois portes');
    expect(MODES.map((_, i) => doorNum(i))).toEqual(['I', 'II', 'III']);
    expect([doorKicker(0), doorKicker(1)]).toEqual(['Première porte', 'Deuxième porte']);
  });
  it('partie ouverte : accroche, mini-main, consignes de la coque', () => {
    const t = liveTexts(RULES_V1);
    expect(t.lede).toBe("Une vraie partie d'échecs, trois cartes de pouvoir, un sort par tour.");
    expect(t.hand).toBe('Vos trois sorts');
    expect(t.touch(false)).toBe('Touchez-en un pour le lire et le lancer, puis jouez votre coup.');
    expect(t.touch(true)).toBe('Touchez-en un pour le lire et le lancer ; les autres sorts s’ajoutent à votre coup.');
    expect(t.before).toBe('Lancez une carte avant votre coup, ou jouez directement.');
    expect(t.budget).toBe('Une seule carte par tour. Revenez à la page quand vous voulez : la partie vous attend.');
    expect(PAGE_TEXTS.sortsEnMain).toBe('Trois sorts');
  });
});

describe('textes de l’accueil selon les règles (1 et 5 cartes, 2 par tour, carte à la place du coup)', () => {
  it('une carte par joueur', () => {
    const r = avec({ cardsPerPlayer: 1 });
    const t = liveTexts(r);
    expect(t.lede).toBe("Une vraie partie d'échecs, une carte de pouvoir, un sort par tour.");
    expect(t.hand).toBe('Votre sort');
    expect(t.touch(false)).toBe('Touchez-le pour le lire et le lancer, puis jouez votre coup.');
    expect(t.touch(true)).toBe('Touchez-le pour le lire et le lancer, à la place de votre coup.');
    const p = principle(r);
    expect(p[1].title).toBe('Une carte, visible.');
    expect(p[1].text).toBe(
      "Au début d'une partie, vous choisissez votre carte ; sur l'accueil, elle est tirée au hasard. Visible des deux joueurs, elle ne sert qu'une fois.",
    );
  });
  it('cinq cartes par joueur', () => {
    const r = avec({ cardsPerPlayer: 5 });
    expect(liveTexts(r).lede).toBe("Une vraie partie d'échecs, cinq cartes de pouvoir, un sort par tour.");
    expect(liveTexts(r).hand).toBe('Vos cinq sorts');
    expect(principle(r)[1].title).toBe('Cinq cartes, visibles.');
    expect(principle(r)[1].text).toBe(
      "Au début d'une partie, vous choisissez vos cinq cartes ; sur l'accueil, elles sont tirées au hasard. Visibles des deux joueurs, chacune ne sert qu'une fois.",
    );
  });
  it('deux cartes par tour, carte à la place du coup, Présage à 4 demi-coups', () => {
    const deux = avec({ cardsPerTurn: 2 });
    expect(liveTexts(deux).lede).toBe("Une vraie partie d'échecs, trois cartes de pouvoir, deux sorts par tour.");
    expect(liveTexts(deux).budget).toBe('Deux cartes par tour au plus. Revenez à la page quand vous voulez : la partie vous attend.');
    expect(principle(deux)[2]).toMatchObject({
      title: 'Deux sorts par tour.',
      text: 'Avant votre coup, lancez jusqu’à deux cartes : chacune change la partie pour les deux camps. Certaines s’annoncent un tour à l’avance.',
    });
    const place = avec({ cardEndsTurn: true, presageDelay: 4 });
    expect(liveTexts(place).before).toBe('Lancez une carte à la place de votre coup, ou jouez directement.');
    expect(liveTexts(place).touch(false)).toBe('Touchez-en un pour le lire et le lancer, à la place de votre coup.');
    expect(principle(place)[2]).toMatchObject({
      title: 'Un sort par tour, à la place du coup.',
      text: 'À la place de votre coup, lancez une carte : elle change la partie pour les deux camps. Certaines s’annoncent deux tours à l’avance.',
    });
  });
  it('Forêt : la clause « sur l’accueil » suit les règles de l’accueil (RULES_BY_CONTEXT.accueil), au défaut la phrase d’avant', () => {
    // L'accueil passe rulesFor('accueil') : au défaut, les mêmes règles, la même phrase
    expect(principle(GAME_RULES, rulesFor('accueil'))).toEqual(principle());
    expect(readFileSync(path.join(__dirname, '../src/client/odyssee/OdysseeHome.tsx'), 'utf8')).toContain(
      "const PRINCIPLE = principle(GAME_RULES, rulesFor('accueil'));",
    );
    expect(principle(GAME_RULES, avec({ cardsPerPlayer: 5 }))[1].text).toBe(
      "Au début d'une partie, vous choisissez vos trois cartes ; sur l'accueil, vos cinq cartes sont tirées au hasard. Visibles des deux joueurs, chacune ne sert qu'une fois.",
    );
    expect(principle(avec({ cardsPerPlayer: 5 }), GAME_RULES)[1].text).toBe(
      "Au début d'une partie, vous choisissez vos cinq cartes ; sur l'accueil, vos trois cartes sont tirées au hasard. Visibles des deux joueurs, chacune ne sert qu'une fois.",
    );
  });
});

describe('relecture du lot 7', () => {
  it('« En partie » d’un Présage : la phrase d’avant au défaut, l’arrivée et les coups de l’adversaire selon le délai', () => {
    const presages = Object.values(CARDS).filter(c => c.presage && !c.ritual);
    expect(presages.length).toBeGreaterThan(0);
    for (const c of presages) {
      expect(howToPlay(c)).toBe("Présage : annoncée maintenant, elle arrive à votre tour suivant. L'adversaire a un coup pour s'y préparer.");
      expect(howToPlay(c, GAME_RULES)).toBe(howToPlay(c));
      expect(howToPlay(c, { presageDelay: 4 })).toBe(
        "Présage : annoncée maintenant, elle arrive au début de votre deuxième tour à venir. L'adversaire a deux coups pour s'y préparer.",
      );
    }
    const rituel = Object.values(CARDS).find(c => c.ritual)!;
    expect(howToPlay(rituel, { presageDelay: 4 })).toBe('Rituel : la carte remplace votre coup.');
  });

  it('partie en direct annulée : retour automatique à l’Oracle au demi-coup 0 seulement (comme avant le lot 7)', () => {
    const annulee = { winner: null, reason: 'aborted' as const };
    expect(abortedEmpty(true, { ply: 0, result: annulee })).toBe(true);
    // Les Blancs ont joué, les Noirs annulent avant leur premier coup (game:abort, partie pas commencée) : l'écran de
    // fin reste, avec « Rejouer contre l'Oracle »
    expect(abortedEmpty(true, { ply: 1, result: annulee })).toBe(false);
    expect(abortedEmpty(false, { ply: 0, result: annulee })).toBe(false);
    expect(abortedEmpty(true, { ply: 0, result: null })).toBe(false);
    expect(abortedEmpty(true, { ply: 0, result: { winner: 'w', reason: 'resign' } })).toBe(false);
  });

  it('partie en direct annulée parce que les Noirs n’ont pas joué leur premier coup à temps (relais coupé) : retour à l’Oracle', () => {
    // Cause posée par le serveur (Result.cause 'first-move', lot 9) ; jamais après une annulation voulue (sans cause).
    const tardive = { winner: null, reason: 'aborted' as const, cause: 'first-move' as const };
    expect(abortedEmpty(true, { ply: 1, result: tardive })).toBe(true);
    expect(abortedEmpty(true, { ply: 0, result: tardive })).toBe(true);
    expect(abortedEmpty(false, { ply: 1, result: tardive })).toBe(false);
  });

  it('perspective du plateau : la même valeur dans StageBoard (morceau à part), engine.ts et vfx/config', () => {
    const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
    const stage = src('src/client/odyssee/StageBoard.tsx');
    const engine = src('src/client/odyssee/engine.ts');
    expect(Number(/const BOARD_PERSP = (\d+);/.exec(stage)?.[1])).toBe(DEFAULT_PERSPECTIVE);
    expect(Number(/const PERSP = (\d+);/.exec(engine)?.[1])).toBe(DEFAULT_PERSPECTIVE);
    // StageBoard, chargé paresseusement par l'accueil, n'importe rien du morceau de l'accueil
    expect(stage).not.toMatch(/from '\.\/engine'|config\/home'/);
  });

  it('Défier un ami : au défaut, la cadence d’ouverture (DEFAULT_QUICK) fait partie des cadences proposées', () => {
    const invite = TIME_CONTROLS.filter(t => t.invite && !t.archived).map(t => t.id);
    expect(invite).toEqual(['5+0', '10+0', '15+10', 'none']);
    expect(invite).toContain(DEFAULT_QUICK);
    expect(DEFAULT_QUICK).toBe('10+0');
  });
});
