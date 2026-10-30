// Tests adverses des 8 Pouvoirs après la refonte du 30 octobre (décision du fondateur, docs/PLAN-ODYSSEE.md),
// écrits par un vérificateur indépendant. Ils complètent climats.test.ts et climats-adverse.test.ts par d'autres
// angles : Mur de glace permanent (plusieurs Murs, route d'un pion, roque, échec à travers un Mur, cavaliers, pat
// et « la magie cède », matériel insuffisant, répétition), interactions entre Climats, mains visibles, tirage,
// anciens états (cartes retirées, Duel), sérialisation et parties au hasard tirées comme dans une vraie partie
// (au plus deux Murs, mains distribuées par dealHands).
//
// Les tests dont le nom commence par « ÉCART » échouent volontairement : ils prouvent un écart entre le moteur et
// la règle. Voir docs/progres/verif-pouvoirs-adverse.md.
import { describe, expect, it } from 'vitest';
import { CARDS, CATALOGS, CardId, cardsOf, isCardId, offeredCatalog } from '../src/shared/cards';
import {
  Color, F_CAPTURE, F_RELAXED, Piece, Position, emptyMods, inCheck, isLightSquare, legalMoves, opposite, rankOf,
  sqIndex as q, sqName, toFen,
} from '../src/shared/chess';
import {
  Effect, GameState, canStillMate, cardOptions, cardPlayable, cardRefusal, catalogOf, checkKind, createGame,
  createGameFromFen, dealHands, describeCardPlay, evaluateEnd, legalMovesOf, modsFromEffects, playCard, playMove,
  positionKey, sideInCheck, viewState,
} from '../src/shared/game';
import { initialStateOf, treeFromLog } from '../src/shared/pgn';

// ---------------------------------------------------------------------------------------------
// Aides

const G = (fen: string, w: CardId[] = [], b: CardId[] = [], timed = true) => createGameFromFen(fen, { w, b }, timed, 'climats');
const uci = (s: GameState) => legalMovesOf(s).map(m => sqName(m.from) + sqName(m.to) + (m.promo ?? '')).sort();
const has = (s: GameState, u: string) => uci(s).includes(u);

function mv(s: GameState, from: string, to: string, promo?: 'q' | 'r' | 'b' | 'n') {
  const r = playMove(s, q(from), q(to), promo);
  if (!r.ok) throw new Error(`${from}-${to} : ${r.error} (${toFen(s.pos)})`);
  return r;
}
/** Joue la première carte `card` encore en main du camp au trait. */
function cast(s: GameState, card: CardId, ...targets: string[]) {
  const c = s.pos.turn;
  const i = s.hands[c].findIndex(h => h.card === card && !h.used);
  if (i < 0) throw new Error(`${card} absent de la main de ${c}`);
  const r = playCard(s, c, i, targets.map(q), 'skin:test');
  if (!r.ok) throw new Error(`${card} ${targets} : ${r.error}`);
  return r;
}
function refusal(s: GameState, card: CardId, ...targets: string[]): string | null {
  const c = s.pos.turn;
  const i = s.hands[c].findIndex(h => h.card === card && !h.used);
  return cardRefusal(s, c, i, targets.map(q));
}
const idx = (s: GameState, card: CardId, c: Color = s.pos.turn) => s.hands[c].findIndex(h => h.card === card && !h.used);

let fxId = 900;
/** Ajoute des effets à une position de test et recalcule la clé de position. */
function withFx(s: GameState, ...effects: Effect[]): GameState {
  const n = { ...s, effects: [...s.effects, ...effects] };
  n.keys = [positionKey(n)];
  return n;
}
const wallFx = (square: string, caster: Color = 'w'): Effect => ({
  id: fxId++, card: 'ice_wall', caster, countsOn: caster, remaining: 0, total: 0, skin: '', global: true, permanent: true, square: q(square),
});
/** Faille sur la rangée `rank` (1 à 8), sur toutes ses cases vides de `s`. */
const riftFx = (s: GameState, rank: number, remaining = 3, caster: Color = 'w'): Effect => ({
  id: fxId++, card: 'rift', caster, countsOn: caster, remaining, total: 4, skin: '', global: true,
  squares: [0, 1, 2, 3, 4, 5, 6, 7].map(f => (rank - 1) * 8 + f).filter(x => !s.pos.board[x]),
});
const climFx = (card: CardId, caster: Color, extra: Partial<Effect> = {}): Effect => ({
  id: fxId++, card, caster, countsOn: caster, remaining: CARDS[card].coups!, total: CARDS[card].coups!, skin: '', global: true, ...extra,
});
const walls = (s: GameState) => s.effects.filter(e => e.card === 'ice_wall').map(e => sqName(e.square!)).sort();

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Position à trois pièces (Roi blanc, pièce mineure blanche, Roi noir), Noirs au trait. */
function trio(kd: number, ka: number, x: number, t: 'b' | 'n'): Position {
  const board: (Piece | null)[] = new Array(64).fill(null);
  board[kd] = { id: 1, t: 'k', c: 'b' };
  board[ka] = { id: 2, t: 'k', c: 'w' };
  board[x] = { id: 3, t, c: 'w' };
  return { board, turn: 'b', castling: 0, ep: -1, halfmove: 0, fullmove: 40 };
}
const near = (a: number, b: number) => Math.abs((a & 7) - (b & 7)) <= 1 && Math.abs((a >> 3) - (b >> 3)) <= 1;

// ---------------------------------------------------------------------------------------------
// Mur de glace permanent

describe('Mur de glace permanent : plusieurs Murs', () => {
  it('un Mur par camp, posés par les cartes : 120 demi-coups plus tard ils sont toujours là, jamais décomptés', () => {
    let s = createGame({ w: ['ice_wall', 'truce', 'rift'], b: ['ice_wall', 'blood_moon', 'tide'] }, true, 'climats');
    // Les cases proposées : vides, rangées 3 à 6, rien d'autre.
    const opts = cardOptions(s, 'w', idx(s, 'ice_wall')).map(sqName);
    expect(opts).toHaveLength(32);
    expect(opts.every(x => ['3', '4', '5', '6'].includes(x[1]))).toBe(true);
    s = cast(s, 'ice_wall', 'd4').state;
    s = mv(s, 'g1', 'f3').state;
    s = cast(s, 'ice_wall', 'e5').state;
    // Un seul Terrain par case : e5 et d4 ne sont plus proposés.
    expect(walls(s)).toEqual(['d4', 'e5']);
    s = mv(s, 'b8', 'c6').state;
    const rand = rng(4242);
    for (let k = 0; k < 120 && !s.result; k++) {
      const moves = legalMovesOf(s).filter(m => !(m.flags & F_RELAXED));
      if (!moves.length) break;
      const m = moves[Math.floor(rand() * moves.length)];
      const r = playMove(s, m.from, m.to, m.promo);
      expect(r.ok).toBe(true);
      if (!r.ok) break;
      const ids = s.effects.filter(e => e.card === 'ice_wall').map(e => e.id);
      expect(r.info.expired?.some(id => ids.includes(id)), 'un Mur a expiré').toBe(false);
      s = r.state;
      for (const e of s.effects.filter(e => e.card === 'ice_wall')) {
        expect([e.permanent, e.remaining, e.total]).toEqual([true, 0, 0]);
      }
      expect(walls(s)).toEqual(['d4', 'e5']);
      expect(s.pos.board[q('d4')]).toBeNull();
      expect(s.pos.board[q('e5')]).toBeNull();
      expect(checkKind(s)).not.toBe('melt');
    }
  });

  it('les deux Murs ne se posent pas sur une case de la Faille, ni la Faille sur un Mur', () => {
    let s = G('4k3/p7/8/8/8/8/P7/4K3 w - - 0 1', ['ice_wall', 'rift'], ['ice_wall']);
    s = cast(s, 'rift', 'a4').state;
    s = mv(s, 'e1', 'e2').state;
    expect(cardOptions(s, 'b', idx(s, 'ice_wall')).filter(x => rankOf(x) === 3)).toEqual([]);
    s = cast(s, 'ice_wall', 'd5').state;
    s = mv(s, 'e8', 'e7').state;
    // La Faille est sur la rangée 4 entière (8 cases vides) ; le Mur blanc ne peut aller que sur 3, 5 (sauf d5) ou 6.
    const o = cardOptions(s, 'w', idx(s, 'ice_wall')).map(sqName);
    expect(o.some(x => x[1] === '4')).toBe(false);
    expect(o).not.toContain('d5');
    expect(o).toHaveLength(8 * 3 - 1);
  });
});

describe('Mur de glace sur la route d’un pion', () => {
  it('Mur devant le pion : ni pas simple ni double pas ; Mur deux cases devant : pas simple seulement ; les prises restent', () => {
    // Blancs : e2 (Mur e3), g2 (Mur g4) ; Noirs : d7 (Mur d5), b7 (Mur b6). Le pion c3 blanc peut prendre b4 ou d4.
    let s = G('4k3/1p1p4/8/8/1n1n4/2P5/4P1P1/4K3 w - - 0 1');
    s = withFx(s, wallFx('e3'), wallFx('g4'), wallFx('d5', 'b'), wallFx('b6', 'b'));
    const w = uci(s).filter(x => /^[a-h]2|^c3/.test(x));
    expect(w).toEqual(['c3b4', 'c3c4', 'c3d4', 'g2g3']);
    s = mv(s, 'e1', 'f1').state;
    const b = uci(s).filter(x => /^[a-h]7/.test(x));
    expect(b).toEqual(['d7d6']);
  });

  it('la Grande Marée n’avance pas un pion dont la case suivante est murée', () => {
    let s = G('4k3/3p4/8/8/2P5/8/4P3/4K3 w - - 0 1', ['tide']);
    const t = withFx(s, wallFx('c5'), wallFx('d6', 'b'));
    // Sans Mur en e3, seul e2 avance.
    expect(cast(t, 'tide').info.moves).toEqual([{ from: q('e2'), to: q('e3') }]);
    // e2 (Mur e3), c4 (Mur c5) et d7 (Mur d6) restent : aucun pion ne bouge, la Marée est refusée.
    expect(refusal(withFx(t, wallFx('e3')), 'tide')).toBe('Aucun pion ne peut avancer.');
  });

  it('« la magie cède » : un pion muré saute le Mur par le double pas, mais personne ne prend en passant sur le Mur', () => {
    // Noirs : Rh8 sans case (Rf7, Cf6), pion d7 muré en d6 ; Blancs : pion e5 prêt à prendre en passant.
    let s = G('7k/3p1K2/5N2/4P3/8/8/8/8 b - - 0 1');
    s = withFx(s, wallFx('d6', 'w'));
    expect(sideInCheck(s)).toBe(false);
    expect(uci(s)).toEqual(['d7d5', 'd7d6']);
    expect(legalMovesOf(s).every(m => m.flags & F_RELAXED)).toBe(true);
    const n = mv(s, 'd7', 'd5').state;
    // Le pion a sauté par-dessus le Mur, qui reste ; la case de prise en passant est le Mur : pas de exd6.
    expect(walls(n)).toEqual(['d6']);
    expect(n.pos.ep).toBe(q('d6'));
    expect(has(n, 'e5d6')).toBe(false);
    // Le pas simple, lui, fait disparaître le Mur où le pion s'arrête.
    const o = mv(s, 'd7', 'd6').state;
    expect(walls(o)).toEqual([]);
  });
});

describe('Mur de glace et roque', () => {
  it('aucun Mur ne se pose sur les rangées 1, 2, 7 et 8 : le chemin du roque n’est jamais muré', () => {
    const s = G('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', ['ice_wall']);
    const o = cardOptions(s, 'w', 0);
    expect(o.every(x => rankOf(x) >= 2 && rankOf(x) <= 5)).toBe(true);
    for (const x of ['b1', 'c1', 'd1', 'f1', 'g1', 'e2', 'e7', 'f8']) expect(refusal(s, 'ice_wall', x)).not.toBeNull();
  });

  it('un Mur en d5 contre la tour d8 rend le grand roque possible, et le reste plusieurs coups plus tard', () => {
    let s = G('3rk3/8/8/8/8/8/8/R3K2N w Q - 0 1', ['ice_wall'], []);
    expect(has(s, 'e1c1')).toBe(false);
    s = cast(s, 'ice_wall', 'd5').state;
    expect(has(s, 'e1c1')).toBe(true);
    s = mv(s, 'h1', 'g3').state;
    s = mv(s, 'd8', 'd7').state;
    s = mv(s, 'g3', 'h1').state;
    s = mv(s, 'd7', 'd8').state;
    s = mv(s, 'h1', 'g3').state;
    s = mv(s, 'd8', 'd6').state;
    s = mv(s, 'g3', 'h1').state;
    s = mv(s, 'd6', 'd8').state;
    expect(walls(s)).toEqual(['d5']);
    expect(has(s, 'e1c1')).toBe(true);
    const n = mv(s, 'e1', 'c1').state;
    expect(n.pos.board[q('c1')]).toMatchObject({ t: 'k', c: 'w' });
    expect(n.pos.board[q('d1')]).toMatchObject({ t: 'r', c: 'w' });
  });
});

describe('Échec à travers un Mur', () => {
  it('un Mur coupe l’échec d’une tour, pas celui d’un cavalier', () => {
    const s = withFx(G('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1'), wallFx('e5', 'b'));
    expect(sideInCheck(s)).toBe(false);
    // Cavalier f4 contre Rd3, Murs e3 et e4 entre eux : l'échec passe, et le roi ne fuit pas sur un Mur.
    const t = withFx(G('7k/8/8/8/5n2/3K4/8/8 w - - 0 1'), wallFx('e3', 'b'), wallFx('e4', 'b'));
    expect(sideInCheck(t)).toBe(true);
    expect(checkKind(t)).toBe('now');
    expect(uci(t)).toEqual(['d3c2', 'd3c3', 'd3c4', 'd3d2', 'd3d4']);
  });

  it('R4c : un Mur de glace en main pare un échec de tour par la colonne (case des rangées 3 à 6) : pas de mat', () => {
    // Re1 enfermé par Td1, Tf1, d2, f2 ; tour noire e8. Sans carte : mat.
    const fen = '4r2k/8/8/8/8/8/3P1P2/3RKR2 w - - 0 1';
    expect(evaluateEnd(G(fen))).toEqual({ winner: 'b', reason: 'checkmate' });
    const s = G(fen, ['ice_wall']);
    expect(evaluateEnd(s)).toBeNull();
    expect(cardOptions(s, 'w', 0).map(sqName).sort()).toEqual(['e3', 'e4', 'e5', 'e6']);
    const n = cast(s, 'ice_wall', 'e4').state;
    expect(sideInCheck(n)).toBe(false);
    expect(has(n, 'e1e2')).toBe(true);
  });

  it('R4c : le Mur ne pare ni le mat du couloir (1re rangée) ni le mat étouffé (cavalier)', () => {
    const back = G('6k1/5ppp/8/8/8/8/5PPP/r5K1 w - - 0 1', ['ice_wall']);
    expect(cardPlayable(back, 'w', 0)).toBe(false);
    expect(evaluateEnd(back)).toEqual({ winner: 'b', reason: 'checkmate' });
    const s2 = G('6k1/8/8/8/8/8/5nPP/6RK w - - 0 1', ['ice_wall']);
    expect(sideInCheck(s2)).toBe(true);
    expect(cardPlayable(s2, 'w', 0)).toBe(false);
    expect(evaluateEnd(s2)).toEqual({ winner: 'b', reason: 'checkmate' });
  });
});

describe('Cavaliers et Murs', () => {
  it('un cavalier saute par-dessus les Murs mais ne se pose jamais sur un Mur', () => {
    // Cg1 : f3 et h3 murés, e2 libre ; Murs autour d'un cavalier d4 : il saute quand même.
    let s = G('4k3/8/8/8/3N4/8/8/4K1N1 w - - 0 1');
    s = withFx(s, wallFx('f3'), wallFx('h3', 'b'), wallFx('c4'), wallFx('e4', 'b'), wallFx('d3'), wallFx('d5', 'b'));
    expect(uci(s).filter(x => x.startsWith('g1'))).toEqual(['g1e2']);
    expect(uci(s).filter(x => x.startsWith('d4'))).toEqual(['d4b3', 'd4b5', 'd4c2', 'd4c6', 'd4e2', 'd4e6', 'd4f5']);
  });
});

describe('Pat et « la magie cède » avec des Murs permanents', () => {
  it('roi muré par deux Murs (un de chaque camp) : il marche sur un Mur, qui disparaît ; l’autre reste', () => {
    // Ra4 : b3 et b4 couverts par Rc3 ; a3, a5 et b5 murés. Pas d'échec. (Pion h2 : pas de nulle par matériel.)
    let s = G('8/8/8/8/k7/2K5/7P/8 b - - 0 1');
    s = withFx(s, wallFx('a5', 'w'), wallFx('b5', 'b'), wallFx('a3', 'w'));
    expect(sideInCheck(s)).toBe(false);
    const m = legalMovesOf(s);
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(x => x.flags & F_RELAXED)).toBe(true);
    const n = mv(s, 'a4', 'b5').state;
    expect(walls(n)).toEqual(['a3', 'a5']);
    expect(n.result).toBeNull();
  });

  it('un vrai pat reste un pat, même avec des Murs posés ailleurs', () => {
    const s = withFx(G('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1'), wallFx('e4'), wallFx('f5', 'b'));
    expect(evaluateEnd(s)).toEqual({ winner: null, reason: 'stalemate' });
  });
});

describe('Répétition avec des Murs', () => {
  it('trois fois la même position avec deux Murs permanents : nulle par répétition', () => {
    let s = createGame({ w: ['ice_wall'], b: ['ice_wall'] }, true, 'climats');
    s = cast(s, 'ice_wall', 'd4').state;
    s = mv(s, 'g1', 'f3').state;
    s = cast(s, 'ice_wall', 'e5').state;
    s = mv(s, 'g8', 'f6').state;
    for (let k = 0; k < 2; k++) {
      expect(s.result).toBeNull();
      s = mv(s, 'f3', 'g1').state;
      s = mv(s, 'f6', 'g8').state;
      s = mv(s, 'g1', 'f3').state;
      s = mv(s, 'g8', 'f6').state;
    }
    expect(s.result).toEqual({ winner: null, reason: 'repetition' });
  });
});

// ---------------------------------------------------------------------------------------------
// Matériel insuffisant avec des Murs permanents

describe('Matériel insuffisant avec des Murs et une Faille', () => {
  it('contrôle : deux Murs en paire (a3 et a5) et un Cavalier : la partie continue', () => {
    const s = withFx(G('8/8/8/8/8/8/8/K1N4k w - - 0 1'), wallFx('a3'), wallFx('a5', 'b'));
    expect(evaluateEnd(s)).toBeNull();
    expect(canStillMate(s, 'w')).toBe(true);
  });

  it('ÉCART : Murs c3 et e3 (hors paire) et une Faille en main : nulle déclarée alors que les Blancs matent en un (Faille, puis Cf2#)', () => {
    // Partie réelle : chaque camp pose son Mur, les Blancs gardent la Faille.
    let s = G('8/8/8/8/3k4/8/8/3K2N1 w - - 0 1', ['ice_wall', 'rift'], ['ice_wall']);
    const open = (x: GameState): GameState => ({ ...x, result: null });
    s = cast(s, 'ice_wall', 'c3').state;
    s = mv(s, 'g1', 'h3').state;
    expect(s.result).toBeNull();
    // Le Mur noir e3 : le moteur arrête aussitôt la partie, « matériel insuffisant ».
    const r = cast(s, 'ice_wall', 'e3');
    const declared = r.state.result;
    // Pourtant le mat existe : …Rd3, Faille sur la 4e rangée, Cf2#.
    let t = mv(open(r.state), 'd4', 'd3').state;
    t = cast(open(t), 'rift', 'a4').state;
    const mate = mv(open(t), 'h3', 'f2').state;
    expect(mate.result).toEqual({ winner: 'w', reason: 'checkmate' });
    expect({ declared, canMate: canStillMate(open(r.state), 'w') }).toEqual({ declared: null, canMate: true });
  });

  it('ÉCART : même chose avec la Faille déjà posée : nulle déclarée, canStillMate faux, alors que Cf2 est mat', () => {
    // Rd1, Ch1 contre Rd3 ; Murs c3 et e3 ; Faille sur la 4e rangée (3 coups restants). Les Blancs au trait.
    let s = G('8/8/8/8/8/3k4/8/3K3N w - - 0 1');
    s = withFx(s, wallFx('c3', 'w'), wallFx('e3', 'b'), riftFx(s, 4, 3, 'w'));
    const mate = mv({ ...s, result: null }, 'h1', 'f2').state;
    expect(mate.result).toEqual({ winner: 'w', reason: 'checkmate' });
    expect({ end: evaluateEnd(s), canMate: canStillMate(s, 'w') }).toEqual({ end: null, canMate: true });
  });

  it('force brute : avec deux Murs hors paire et une Faille, des mats existent pour le Cavalier (c3+e3, d3+f3, b3+d3…)', () => {
    // Recherche exhaustive : Rd3 noir, Murs c3 et e3, Faille sur la 4e rangée : positions de mat du Cavalier.
    const mods = emptyMods();
    for (const x of ['c3', 'e3', 'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4']) mods.blocked[q(x)] = true;
    const mates: string[] = [];
    for (let ka = 0; ka < 64; ka++) {
      for (let x = 0; x < 64; x++) {
        const kd = q('d3');
        if (ka === kd || x === kd || x === ka || near(ka, kd) || mods.blocked[ka] || mods.blocked[x]) continue;
        const pos = trio(kd, ka, x, 'n');
        if (inCheck(pos, 'b', mods) && legalMoves(pos, mods, mods).length === 0) mates.push(`K${sqName(ka)} N${sqName(x)}`);
      }
    }
    expect(mates.length).toBeGreaterThan(5);
    expect(mates).toContain('Kd1 Nf2');
  });

  it('ÉCART : Roi et Fou de cases foncées avec les Murs a3 et a5 (paire des fous clairs) contre Roi : aucun mat possible, mais ni nulle ni perte au temps', () => {
    // Force brute : avec les Murs a3 et a5 (et aucun autre), un fou de cases foncées ne mate jamais.
    const mods = emptyMods();
    mods.blocked[q('a3')] = true;
    mods.blocked[q('a5')] = true;
    let mates = 0;
    for (let kd = 0; kd < 64; kd++) {
      for (let ka = 0; ka < 64; ka++) {
        if (ka === kd || near(ka, kd) || mods.blocked[ka] || mods.blocked[kd]) continue;
        for (let x = 0; x < 64; x++) {
          if (x === kd || x === ka || isLightSquare(x) || mods.blocked[x]) continue;
          const pos = trio(kd, ka, x, 'b');
          if (inCheck(pos, 'b', mods) && legalMoves(pos, mods, mods).length === 0) mates++;
        }
      }
    }
    expect(mates).toBe(0);
    // Fc1 (case foncée), Murs a3 et a5 posés, plus aucune carte : la position est morte.
    const s = withFx(G('7k/8/8/8/8/8/8/2B2K2 w - - 0 1'), wallFx('a3'), wallFx('a5', 'b'));
    expect(isLightSquare(q('c1'))).toBe(false);
    expect({ end: evaluateEnd(s), canMate: canStillMate(s, 'w') }).toEqual({
      end: { winner: null, reason: 'insufficient' }, canMate: false,
    });
  });

  it('contrôle : Roi et Fou de cases claires avec les Murs a3 et a5 : un mat existe (Rc4, Fc6# contre Ra4… ou Fb5#)', () => {
    const mods = emptyMods();
    mods.blocked[q('a3')] = true;
    mods.blocked[q('a5')] = true;
    let mates = 0;
    for (let ka = 0; ka < 64; ka++) {
      for (let x = 0; x < 64; x++) {
        const kd = q('a4');
        if (ka === kd || x === kd || x === ka || near(ka, kd) || mods.blocked[ka] || mods.blocked[x] || !isLightSquare(x)) continue;
        const pos = trio(kd, ka, x, 'b');
        if (inCheck(pos, 'b', mods) && legalMoves(pos, mods, mods).length === 0) mates++;
      }
    }
    expect(mates).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Interactions entre Climats

describe('Climats : remplacement', () => {
  it('l’Ère glaciaire (4 coups) est remplacée par la Trêve adverse avant la fin de son compte : arrivée et expiration au même coup', () => {
    let s = createGame({ w: ['ice_age'], b: ['truce'] }, true, 'climats');
    s = mv(s, 'e2', 'e4').state;
    s = mv(s, 'd7', 'd5').state;
    s = cast(s, 'ice_age').state;
    const iceId = s.effects.find(e => e.card === 'ice_age')!.id;
    s = mv(s, 'g1', 'f3').state;
    const arr = mv(s, 'b8', 'c6');
    expect(arr.info.arrived).toEqual([iceId]);
    s = arr.state;
    // Blancs : pions gelés (exd5 interdit).
    expect(has(s, 'e4d5')).toBe(false);
    s = mv(s, 'b1', 'c3').state;
    s = cast(s, 'truce').state;
    const truceId = s.effects.find(e => e.card === 'truce')!.id;
    s = mv(s, 'g8', 'f6').state;
    expect(s.effects.find(e => e.id === iceId)?.remaining).toBe(2);
    const r = mv(s, 'f1', 'b5');
    expect(r.info.arrived).toEqual([truceId]);
    expect(r.info.expired).toEqual([iceId]);
    s = r.state;
    // Noirs : pions dégelés (d5-d4 permis), mais Trêve : dxe4 interdit (pas d'échec).
    expect(has(s, 'd5d4')).toBe(true);
    expect(has(s, 'd5e4')).toBe(false);
    expect(has(s, 'f6e4')).toBe(false);
    expect(s.effects.filter(e => CARDS[e.card].family === 'climat').map(e => e.card)).toEqual(['truce']);
  });

  it('un second Climat ne s’annonce pas tant que le premier est en Présage, quel que soit le camp', () => {
    let s = createGame({ w: ['blood_moon'], b: ['truce', 'blast'] }, true, 'climats');
    s = cast(s, 'blood_moon').state;
    s = mv(s, 'e2', 'e4').state;
    expect(refusal(s, 'truce')).toBe('Un Climat est déjà annoncé.');
    expect(refusal(s, 'blast')).toBe('Un Climat est déjà annoncé.');
    expect(cardPlayable(s, 'b', 0)).toBe(false);
  });
});

describe('Présage annoncé puis Rituel', () => {
  it('la Grande Marée adverse fait arriver l’Ère glaciaire annoncée, après avoir poussé les pions (le Présage n’agit pas encore)', () => {
    let s = createGame({ w: ['ice_age'], b: ['tide'] }, true, 'climats');
    s = cast(s, 'ice_age').state;
    const id = s.effects[0].id;
    s = mv(s, 'g1', 'f3').state;
    const r = cast(s, 'tide');
    expect(r.info.ritual).toBe(true);
    // 7 pions blancs (f2 bloqué par le cavalier f3) et 8 noirs : le Présage n'agit pas encore.
    expect(r.info.moves?.length).toBe(15);
    expect(r.info.arrived).toEqual([id]);
    s = r.state;
    expect(s.pos.turn).toBe('w');
    // Arrivée : pions gelés pour les Blancs (au début de leur tour) comme pour les Noirs.
    expect(legalMovesOf(s).some(m => s.pos.board[m.from]!.t === 'p')).toBe(false);
    expect(s.effects[0]).toMatchObject({ card: 'ice_age', remaining: 4 });
    expect(s.effects[0].pending).toBeUndefined();
  });

  it('Lune de sang annoncée, Marée adverse : la Lune arrive au tour du lanceur, qui doit prendre ce que la Marée lui offre', () => {
    let s = G('4k3/8/3p4/8/8/4P3/8/4K3 w - - 0 1', ['blood_moon'], ['tide']);
    s = cast(s, 'blood_moon').state;
    s = mv(s, 'e1', 'd1').state;
    // La Marée (Lune encore en Présage : permise) pousse e3-e4 et d6-d5.
    const r = cast(s, 'tide');
    expect(r.info.moves).toEqual([{ from: q('e3'), to: q('e4') }, { from: q('d6'), to: q('d5') }]);
    s = r.state;
    expect(s.effects.find(e => e.card === 'blood_moon')?.pending).toBeUndefined();
    expect(uci(s)).toEqual(['e4d5']);
  });
});

describe('Trêve et Lune de sang', () => {
  it('Lune active, Trêve annoncée : tant que la Trêve n’est pas arrivée, la Lune oblige toujours à prendre', () => {
    let s = G('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', ['blood_moon'], ['truce']);
    s = withFx(s, climFx('blood_moon', 'w'));
    expect(uci(s)).toEqual(['e4d5']);
    s = mv(s, 'e4', 'd5').state;
    // Noirs : la Lune (2 coups restants) ; aucune prise possible.
    s = cast(s, 'truce').state;
    s = mv(s, 'e8', 'd7').state;
    // Blancs : la Trêve n'est pas arrivée (elle arrive au tour des Noirs). Lune encore active (1 coup).
    expect(s.effects.find(e => e.card === 'truce')?.pending).toBe(true);
    expect(s.effects.find(e => e.card === 'blood_moon')?.remaining).toBe(1);
  });

  it('Trêve active : une prise qui sort d’un échec est permise, et sous la Lune elle est obligatoire', () => {
    const fen = '4k3/8/8/8/8/8/3q4/4K3 w - - 0 1';
    const truce = withFx(G(fen), climFx('truce', 'b'));
    expect(uci(truce)).toContain('e1d2');
    const moon = withFx(G(fen), climFx('blood_moon', 'b'));
    expect(uci(moon)).toEqual(['e1d2']);
  });
});

describe('Ère glaciaire et Grande Marée', () => {
  it('Marée refusée pendant l’Ère glaciaire, permise à nouveau quand elle a fini ; jamais sans pion qui puisse avancer', () => {
    let s = createGame({ w: ['ice_age', 'tide'], b: [] }, true, 'climats');
    s = cast(s, 'ice_age').state;
    s = mv(s, 'g1', 'f3').state;
    s = mv(s, 'g8', 'f6').state;
    // Ère glaciaire arrivée : 4 coups.
    expect(refusal(s, 'tide')).toBe('Aucun pion ne peut avancer.');
    s = mv(s, 'f3', 'g1').state;
    s = mv(s, 'f6', 'g8').state;
    expect(refusal(s, 'tide')).toBe('Aucun pion ne peut avancer.');
    s = mv(s, 'g1', 'f3').state;
    s = mv(s, 'g8', 'f6').state;
    expect(s.effects).toEqual([]);
    expect(refusal(s, 'tide')).toBeNull();
    const t = withFx(G('4k3/8/8/8/8/4p3/4P3/4K3 w - - 0 1', ['tide']));
    expect(refusal(t, 'tide')).toBe('Aucun pion ne peut avancer.');
  });
});

describe('Déflagration près des rois et des Murs', () => {
  it('une explosion à côté d’un Mur détruit les pièces voisines mais laisse le Mur, qui bloque toujours', () => {
    // Td1 x Cd5 sous la Déflagration : Fc6 et Fe6 noirs sautent, le Mur e5 reste, le roi e8 aussi.
    let s = G('4k3/8/2b1b3/3n4/8/8/8/3RK3 w - - 0 1');
    s = withFx(s, wallFx('e5', 'b'), climFx('blast', 'w'));
    const r = mv(s, 'd1', 'd5');
    // La tour qui prend et les deux fous ; le cavalier pris est une capture ordinaire.
    expect(r.info.blasted?.length).toBe(3);
    s = r.state;
    expect(walls(s)).toEqual(['e5']);
    expect(s.pos.board[q('c6')]).toBeNull();
    expect(s.pos.board[q('e6')]).toBeNull();
    expect(s.pos.board[q('d5')]).toBeNull();
    expect(modsFromEffects(s.effects).blocked[q('e5')]).toBe(true);
  });

  it('un roi qui prend à côté d’un Mur et du roi adverse : pas d’explosion', () => {
    let s = G('8/8/8/8/3k4/4n3/4K3/8 w - - 0 1');
    s = withFx(s, wallFx('f3', 'b'), climFx('blast', 'b'));
    // Re2 x e3 : e3 voisine de d4 (roi noir) ? Oui : interdit (rois voisins).
    expect(has(s, 'e2e3')).toBe(false);
    let t = G('8/8/8/2k5/8/4n3/4K3/8 w - - 0 1');
    t = withFx(t, wallFx('f3', 'b'), climFx('blast', 'b'));
    const r = mv(t, 'e2', 'e3');
    expect(r.info.blasted).toBeUndefined();
    expect(r.state.pos.board[q('e3')]).toMatchObject({ t: 'k', c: 'w' });
    expect(walls(r.state)).toEqual(['f3']);
  });
});

// ---------------------------------------------------------------------------------------------
// Mains visibles

describe('Mains visibles', () => {
  it('aucune vue ne masque : les deux mains, cartes jouées ou non, Présages compris, pour tout le monde', () => {
    let s = createGame({ w: ['truce', 'ice_wall', 'rift'], b: ['blood_moon', 'tide', 'blast'] }, true, 'climats');
    s = cast(s, 'truce').state;
    s = mv(s, 'e2', 'e4').state;
    const v = viewState(s);
    expect(v.hands).toEqual({
      w: [{ card: 'truce', used: true }, { card: 'ice_wall', used: false }, { card: 'rift', used: false }],
      b: [{ card: 'blood_moon', used: false }, { card: 'tide', used: false }, { card: 'blast', used: false }],
    });
    expect(v.effects).toEqual(s.effects);
    expect(v.effects[0].pending).toBe(true);
    // Le JSON envoyé contient tout, et aucun champ « revealed ».
    const json = JSON.stringify(v);
    for (const c of ['truce', 'ice_wall', 'rift', 'blood_moon', 'tide', 'blast']) expect(json).toContain(`"${c}"`);
    expect(json).not.toContain('revealed');
    expect(v.keys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Tirage

describe('Tirage, sur des dizaines de milliers de mains', () => {
  const POOL = cardsOf('climats');
  it('8 cartes ; contraintes R9 ; Sablier fou exclu contre l’IA et sans pendule ; miroir ; « Sans cartes » vide', () => {
    expect(POOL.sort()).toEqual(['blast', 'blood_moon', 'hourglass', 'ice_age', 'ice_wall', 'rift', 'tide', 'truce']);
    const rand = rng(777);
    const count = new Map<string, number>();
    const bad: string[] = [];
    for (let k = 0; k < 30_000; k++) {
      const timed = k % 2 === 0;
      const vsBot = k % 3 === 0;
      const mirror = k % 5 === 0;
      const h = dealHands(timed, mirror, rand, 'climats', { vsBot });
      const tag = `${k} timed=${timed} vsBot=${vsBot} mirror=${mirror}`;
      for (const c of ['w', 'b'] as Color[]) {
        const hand = h[c];
        if (hand.length !== 3 || new Set(hand).size !== 3) bad.push(`${tag} : main ${hand}`);
        if (!hand.every(id => POOL.includes(id))) bad.push(`${tag} : hors catalogue ${hand}`);
        if (hand.filter(id => CARDS[id].family === 'climat').length > 2) bad.push(`${tag} : 3 Climats ${hand}`);
        if (hand.filter(id => CARDS[id].rarity === 'légendaire').length > 1) bad.push(`${tag} : 2 Légendaires ${hand}`);
        if ((!timed || vsBot) && hand.includes('hourglass')) bad.push(`${tag} : Sablier ${hand}`);
        for (const id of hand) count.set(`${timed && !vsBot}:${id}`, (count.get(`${timed && !vsBot}:${id}`) ?? 0) + 1);
      }
      if (mirror && h.b.join() !== h.w.join()) bad.push(`${tag} : miroir ${h.w} / ${h.b}`);
    }
    expect(bad).toEqual([]);
    expect(count.get('true:hourglass')).toBeGreaterThan(1000);
    // Communes (Trêve, Mur, Faille) plus fréquentes que les Rares, elles-mêmes plus que l'Épique et la Légendaire.
    const f = (id: CardId) => count.get(`false:${id}`) ?? 0;
    expect(Math.min(f('truce'), f('ice_wall'), f('rift'))).toBeGreaterThan(Math.max(f('ice_age'), f('tide')));
    expect(Math.min(f('ice_age'), f('tide'))).toBeGreaterThan(f('blood_moon'));
    expect(f('blood_moon')).toBeGreaterThan(f('blast'));
    expect(dealHands(true, false, rand, 'aucune')).toEqual({ w: [], b: [] });
  }, 60_000);

  it('générateurs dégénérés (toujours 0, toujours 0,999…, alternés) : mains valides, sans Sablier contre l’IA', () => {
    const gens = [() => 0, () => 0.9999999, (() => { let t = 0; return () => (t++ % 2 ? 0.9999 : 0); })()];
    for (const g of gens) {
      for (const vsBot of [false, true]) {
        const h = dealHands(true, false, g, 'climats', { vsBot });
        for (const c of ['w', 'b'] as Color[]) {
          expect(new Set(h[c]).size).toBe(3);
          expect(h[c].filter(id => CARDS[id].family === 'climat').length).toBeLessThanOrEqual(2);
          if (vsBot) expect(h[c]).not.toContain('hourglass');
        }
      }
    }
  });

  it('le Sablier fou, s’il est en main d’une partie sans pendule (ancien état), est refusé', () => {
    const s = createGame({ w: ['hourglass'], b: [] }, false, 'climats');
    expect(cardPlayable(s, 'w', 0)).toBe(false);
    expect(cardRefusal(s, 'w', 0)).toBe('Cette carte demande une partie avec pendule.');
  });
});

// ---------------------------------------------------------------------------------------------
// Anciens états

describe('Anciens états : Duel, Mur à durée, cartes retirées', () => {
  it('catalogues proposés : Pouvoirs puis Sans cartes ; le Duel et l’inconnu ramenés aux Pouvoirs', () => {
    expect(CATALOGS.map(c => c.id)).toEqual(['climats', 'aucune']);
    for (const x of ['duel', 'climats', undefined, null, 42, 'portals', '']) expect(offeredCatalog(x)).toBe('climats');
    expect(offeredCatalog('aucune')).toBe('aucune');
  });

  it('partie Duel sans catalogue enregistré : Mur sur n’importe quelle case vide, 3 coups adverses, puis il fond', () => {
    let s = createGame({ w: ['ice_wall', 'lightning', 'freeze'], b: ['shield', 'swap', 'rewind'] }, true, 'duel');
    delete s.catalog;
    expect(catalogOf(s)).toBe('duel');
    // En Duel, la 7e rangée est vide après e7-e5… on prend une case de la 3e rangée et une de la 6e : toutes permises.
    const o = cardOptions(s, 'w', 0);
    expect(o.length).toBe(32);
    s = mv(s, 'e2', 'e4').state;
    s = mv(s, 'e7', 'e5').state;
    expect(cardOptions(s, 'w', 0).map(sqName)).toContain('e2');
    s = cast(s, 'ice_wall', 'e2').state;
    expect(s.effects[0]).toMatchObject({ card: 'ice_wall', remaining: 3, countsOn: 'b' });
    expect(s.effects[0].permanent).toBeUndefined();
    s = mv(s, 'g1', 'f3').state;
    for (let k = 0; k < 3; k++) {
      s = mv(s, k % 2 ? 'f6' : 'g8', k % 2 ? 'g8' : 'f6').state;
      if (k < 2) s = mv(s, k % 2 ? 'g1' : 'f3', k % 2 ? 'f3' : 'g1').state;
    }
    expect(walls(s)).toEqual([]);
  });

  it('partie Pouvoirs d’avant la refonte : un Mur à durée (6 coups) garde son compte, fond, et donne un échec « à la fonte »', () => {
    let s = G('4r1k1/8/8/8/8/8/P7/4K3 w - - 0 1');
    const old: Effect = { id: 1, card: 'ice_wall', caster: 'b', countsOn: 'b', remaining: 3, total: 6, skin: '', global: true, square: q('e4') };
    s = withFx(s, old);
    expect(sideInCheck(s)).toBe(false);
    s = mv(s, 'a2', 'a3').state;
    expect(checkKind(s)).toBeNull();
    // Noirs jouent : il reste 1 coup au Mur, qui fond après le coup blanc : échec « à la fonte ».
    s = mv(s, 'g8', 'h8').state;
    expect(checkKind(s)).toBe('melt');
  });

  it('partie terminée avec des cartes retirées : vue intacte, libellés bruts, relecture arrêtée sans exception', () => {
    const final = {
      hands: { w: [{ card: 'deja_vu', used: true }, { card: 'tide', used: false }, { card: 'portals', used: false }],
        b: [{ card: 'cavalcade', used: true }, { card: 'truce', used: false }, { card: 'coronation', used: false }] },
      timed: true, catalog: 'climats',
    } as unknown as GameState;
    for (const id of ['deja_vu', 'portals', 'cavalcade', 'coronation']) {
      expect(isCardId(id)).toBe(false);
      expect(describeCardPlay(id as CardId, [])).toBe(id);
    }
    const start = initialStateOf(final);
    expect(start.hands.w.map(h => h.card)).toEqual(['tide']);
    expect(start.hands.b.map(h => h.card)).toEqual(['truce']);
    const log = [
      { k: 'move', c: 'w', san: 'e4', from: q('e2'), to: q('e4') },
      { k: 'card', c: 'b', card: 'cavalcade', targets: [] },
      { k: 'move', c: 'b', san: 'e5', from: q('e7'), to: q('e5') },
    ] as GameState['log'];
    const { root, complete } = treeFromLog(start, log);
    expect(complete).toBe(false);
    expect(root.children).toHaveLength(1);
    expect(viewState({ ...createGame({ w: [], b: [] }, true, 'climats'), ...final }).hands).toEqual(final.hands);
  });
});

// ---------------------------------------------------------------------------------------------
// Parties au hasard, tirées comme de vraies parties, avec sérialisation

/** Joue une partie au hasard ; cartes jouées souvent, cibles tirées dans cardOptions. Invariants à chaque action. */
function randomGame(seed: number, stats: Map<string, number>) {
  const rand = rng(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
  const bump = (k: string) => stats.set(k, (stats.get(k) ?? 0) + 1);
  const timed = seed % 3 !== 0;
  const vsBot = seed % 4 === 0;
  let s = createGame(dealHands(timed, seed % 7 === 0, rand, 'climats', { vsBot }), timed, 'climats');
  const trail: string[] = [];
  try {
    for (let step = 0; step < 260 && !s.result; step++) {
      const me = s.pos.turn;
      const them = opposite(me);
      // Une carte, souvent (et forcément quand aucun coup n'existe : R4c).
      const noMove = legalMovesOf(s).length === 0;
      if (!s.cardPlayed && (noMove || rand() < 0.35)) {
        const free = s.hands[me].map((_, i) => i).filter(i => !s.hands[me][i].used && cardPlayable(s, me, i));
        if (noMove) expect(free.length, 'aucun coup, aucune carte, pas de fin').toBeGreaterThan(0);
        if (free.length) {
          const i = pick(free);
          const id = s.hands[me][i].card;
          const targets: number[] = [];
          for (let k = 0; k < CARDS[id].targets; k++) targets.push(pick(cardOptions(s, me, i, targets)));
          const r = playCard(s, me, i, targets, '');
          expect(r.ok, `${id} ${targets.map(sqName)} : ${r.ok ? '' : r.error}`).toBe(true);
          if (!r.ok) break;
          const n = r.state;
          const now = modsFromEffects(n.effects);
          if (r.info.ritual) {
            expect(n.pos.turn).toBe(them);
            expect(inCheck(n.pos, me, now), 'Rituel : roi du lanceur en prise').toBe(false);
            expect(sideInCheck(n), 'Rituel : échec donné').toBe(false);
          } else {
            expect(n.pos.turn).toBe(me);
            expect(inCheck(n.pos, them, now), 'carte : échec donné').toBe(false);
            expect(legalMovesOf(n).length, 'carte : plus aucun coup').toBeGreaterThan(0);
          }
          if (id === 'ice_wall') {
            const w = n.effects[n.effects.length - 1];
            expect(w).toMatchObject({ card: 'ice_wall', permanent: true, remaining: 0, total: 0 });
            expect(rankOf(w.square!) >= 2 && rankOf(w.square!) <= 5).toBe(true);
          }
          bump(id);
          trail.push(`[${id}${targets.map(sqName).join(',')}]`);
          s = n;
          if (s.result || s.pos.turn !== me) continue;
        }
      }
      const moves = legalMovesOf(s);
      expect(moves.length, 'aucun coup jouable').toBeGreaterThan(0);
      const m = rand() < 0.5 ? pick(moves.filter(x => x.flags & F_CAPTURE).concat(moves).slice(0, 4)) : pick(moves);
      const wallsBefore = s.effects.filter(e => e.card === 'ice_wall').map(e => e.square!);
      const r = playMove(s, m.from, m.to, m.promo);
      expect(r.ok, r.ok ? '' : r.error).toBe(true);
      if (!r.ok) break;
      const n = r.state;
      const now = modsFromEffects(n.effects);
      expect(inCheck(n.pos, me, now), `roi de ${me} en prise après ${r.info.san}`).toBe(false);
      for (let x = 0; x < 64; x++) expect(now.blocked[x] && !!n.pos.board[x], `pièce sur ${sqName(x)} bloquée`).toBe(false);
      // Murs permanents : ils ne disparaissent que sous une pièce qui s'y arrête par « la magie cède ».
      const wallsAfter = n.effects.filter(e => e.card === 'ice_wall').map(e => e.square!);
      for (const w of wallsBefore) {
        if (!wallsAfter.includes(w)) {
          expect(m.flags & F_RELAXED && m.to === w, `Mur ${sqName(w)} disparu après ${r.info.san}`).toBeTruthy();
          bump('mur-cède');
        }
      }
      expect(checkKind(n)).not.toBe('melt');
      const climates = n.effects.filter(e => CARDS[e.card].family === 'climat');
      expect(climates.filter(e => !e.pending).length).toBeLessThanOrEqual(1);
      expect(climates.filter(e => e.pending).length).toBeLessThanOrEqual(1);
      expect(n.effects.filter(e => e.card === 'ice_wall').length).toBeLessThanOrEqual(2);
      if (m.flags & F_RELAXED) bump('magie');
      trail.push(r.info.san);
      s = n;
      // Mains visibles.
      expect(viewState(s).hands).toEqual(s.hands);
      // Sérialisation : tous les 7 demi-coups, l'état relu par JSON se comporte à l'identique.
      if (s.ply % 7 === 0) {
        const c = JSON.parse(JSON.stringify(s)) as GameState;
        expect(positionKey(c)).toBe(positionKey(s));
        expect(uci(c)).toEqual(uci(s));
        expect(evaluateEnd(c)).toEqual(evaluateEnd(s));
        for (const col of ['w', 'b'] as Color[]) {
          for (let i = 0; i < 3; i++) expect(cardPlayable(c, col, i)).toBe(cardPlayable(s, col, i));
        }
        const sc = structuredClone(s);
        expect(uci(sc)).toEqual(uci(s));
      }
    }
    if (s.result) {
      bump('fin:' + s.result.reason);
      const open = { ...s, result: null };
      if (s.result.reason === 'checkmate' || s.result.reason === 'stalemate') {
        expect(legalMovesOf(open)).toEqual([]);
        expect(s.hands[s.pos.turn].some((_, i) => cardPlayable(open, s.pos.turn, i))).toBe(false);
        expect(sideInCheck(open)).toBe(s.result.reason === 'checkmate');
      }
    }
  } catch (e) {
    throw new Error(`graine ${seed} : ${(e as Error).message}\n${trail.join(' ')}`);
  }
}

describe('Parties au hasard (mains distribuées, cartes fréquentes), invariants et sérialisation', () => {
  it('160 parties Pouvoirs (graines 91 000+)', () => {
    const stats = new Map<string, number>();
    for (let g = 0; g < 160; g++) randomGame(91_000 + g, stats);
    if (process.env.STATS) console.log(Object.fromEntries([...stats].sort()));
    for (const id of ['truce', 'blood_moon', 'ice_age', 'blast', 'ice_wall', 'rift', 'tide']) {
      expect(stats.get(id) ?? 0, id).toBeGreaterThan(10);
    }
  }, 180_000);
});
