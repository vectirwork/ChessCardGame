// Tests adverses du catalogue Climats (règles et moteur), écrits par un vérificateur indépendant.
// Ils cherchent à casser l'implémentation : états impossibles, Présage, « la magie cède », Déflagration, Couronnement,
// Portails, Faille et roque, prise en passant sous Trêve et Lune de sang, répétition et 50 coups, Déjà-vu,
// tirage pondéré, sérialisation, et des parties au hasard plus agressives que celles de climats-random.test.ts.
// Les tests marqués « ÉCART » échouent volontairement : ce sont des preuves, laissées en place.
import { describe, expect, it } from 'vitest';
import { CARDS, CardId, cardsOf } from '../src/shared/cards';
import {
  Color, F_BLAST, F_CAPTURE, F_EP, F_LEAP, F_PORTAL, F_PROMO, F_RELAXED, Mods, NO_MODS, Position, fileOf, hasLegalMove,
  inCheck, legalMoves, makeMove, opposite, pseudoMoves, rankOf, sqIndex as q, sqName, toFen, unmakeMove,
} from '../src/shared/chess';
import {
  Effect, GameState, canStillMate, cardOptions, cardPlayable, checkKind, createGame, createGameFromFen, dealHands,
  evaluateEnd, legalMovesOf, modsFromEffects, playCard, playMove, positionKey, sideInCheck, tickEffects, viewState,
} from '../src/shared/game';

// ---------------------------------------------------------------------------------------------
// Aides

const game = (fen: string, w: CardId[] = [], b: CardId[] = [], timed = true) =>
  createGameFromFen(fen, { w, b }, timed, 'climats');
const all = (s: GameState) => legalMovesOf(s).map(m => sqName(m.from) + sqName(m.to)).sort();
const has = (s: GameState, uci: string) => all(s).includes(uci);
const live = (s: GameState) => s.effects.filter(e => !e.pending).map(e => e.card);

function mv(s: GameState, from: string, to: string, promo?: 'q' | 'r' | 'b' | 'n'): GameState {
  const r = playMove(s, q(from), q(to), promo);
  if (!r.ok) throw new Error(`${from}-${to} : ${r.error}`);
  return r.state;
}
function mvInfo(s: GameState, from: string, to: string, promo?: 'q' | 'r' | 'b' | 'n') {
  const r = playMove(s, q(from), q(to), promo);
  if (!r.ok) throw new Error(`${from}-${to} : ${r.error}`);
  return r;
}
function card(s: GameState, idx: number, ...targets: string[]): GameState {
  const r = playCard(s, s.pos.turn, idx, targets.map(q), 'skin:arcane');
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
/** Ajoute un effet (arrivé par défaut) dans une position de test. */
function withEffect(s: GameState, cardId: CardId, extra: Partial<Effect> = {}, caster: Color = 'b'): GameState {
  const coups = CARDS[cardId].coups ?? 4;
  const e: Effect = {
    id: 800 + s.effects.length, card: cardId, caster, countsOn: caster, remaining: coups, total: coups, skin: '',
    global: true, ...extra,
  };
  const n = { ...s, effects: [...s.effects, e] };
  n.keys = [positionKey(n)];
  return n;
}
const rank = (r: number) => [0, 1, 2, 3, 4, 5, 6, 7].map(f => (r - 1) * 8 + f);

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

// ---------------------------------------------------------------------------------------------
// États impossibles

describe('États impossibles : le roi de celui qui vient de jouer n’est jamais en prise', () => {
  it('un Mur qui fond après mon coup ne couvre plus mon roi : seuls les coups qui quittent la colonne sont légaux', () => {
    // Tour noire e8, Mur e4 qui fond après le coup blanc.
    const s = withEffect(game('4r2k/8/8/8/8/8/P7/4K3 w - - 0 1'), 'ice_wall', { square: q('e4'), remaining: 1 });
    expect(sideInCheck(s)).toBe(true);
    expect(checkKind(s)).toBe('melt');
    expect(all(s)).toEqual(['e1d1', 'e1d2', 'e1f1', 'e1f2']);
    const n = mv(s, 'e1', 'f2');
    expect(n.effects).toEqual([]);
    expect(inCheck(n.pos, 'w', modsFromEffects(n.effects))).toBe(false);
  });

  it('une Faille qui se ferme après mon coup ne couvre plus mon roi (échec « à la fermeture »)', () => {
    const s = withEffect(game('4r2k/8/8/8/8/8/P7/4K3 w - - 0 1'), 'rift', { squares: rank(5), remaining: 1 });
    expect(checkKind(s)).toBe('close');
    expect(all(s).every(m => m.startsWith('e1') && !m.endsWith('e2'))).toBe(true);
  });

  it('R4e : l’arrivée de ma propre Chevauchée peut mettre MON roi en échec, jamais celui de l’adversaire', () => {
    let s = game('6k1/8/q7/8/8/8/5PPP/6K1 w - - 0 1', ['cavalcade']);
    s = card(s, 0);
    s = mv(s, 'h2', 'h3');
    // La réponse noire est jugée avec la Chevauchée arrivée : Dame en e2, à un saut de g1.
    const r = mvInfo(s, 'a6', 'e2');
    s = r.state;
    expect(r.info.arrived?.length).toBe(1);
    expect(live(s)).toEqual(['cavalcade']);
    expect(inCheck(s.pos, 'b', modsFromEffects(s.effects))).toBe(false);
    expect(sideInCheck(s)).toBe(true);
    expect(checkKind(s)).toBe('now');
    // Chaque réponse blanche met le roi à l'abri des sauts.
    for (const m of legalMovesOf(s)) {
      const n = playMove(s, m.from, m.to, m.promo);
      expect(n.ok).toBe(true);
      if (n.ok) expect(inCheck(n.state.pos, 'w', modsFromEffects(n.state.effects))).toBe(false);
    }
  });

  it('une Chevauchée qui expire ne laisse aucun « échec par saut » fantôme', () => {
    // Chevauchée blanche, dernier coup (celui des Noirs) : la dame noire se pose à un saut du roi blanc.
    const s = withEffect(game('6k1/8/q7/8/8/8/5PPP/6K1 b - - 0 1'), 'cavalcade', { remaining: 1 }, 'w');
    const n = mv(s, 'a6', 'e2');
    expect(n.effects).toEqual([]);
    expect(sideInCheck(n)).toBe(false);
    expect(n.log[n.log.length - 1]).toMatchObject({ san: 'Qe2' });
  });

  it('un Climat qui remplace la Chevauchée retire les sauts à son arrivée, sans créer d’échec', () => {
    // Les Noirs ont annoncé la Trêve ; elle arrive après le coup blanc et chasse la Chevauchée blanche.
    let s = withEffect(game('6k1/8/8/8/8/8/5PPP/Q5K1 w - - 0 1'), 'cavalcade', { remaining: 2 }, 'w');
    s = withEffect(s, 'truce', { pending: true, delay: 1, remaining: 3 }, 'b');
    const r = mvInfo(s, 'a1', 'e5');
    expect(r.state.effects.map(e => e.card)).toEqual(['truce']);
    expect(r.info.expired?.length).toBe(1);
    expect(sideInCheck(r.state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Présage

describe('Présage', () => {
  it('délai 2, puis 1, arrivée sur la réponse adverse (MoveInfo.arrived), expiration exacte (MoveInfo.expired)', () => {
    let s = createGame({ w: ['blood_moon'], b: [] }, false, 'climats');
    s = card(s, 0);
    const id = s.effects[0].id;
    expect(s.effects[0]).toMatchObject({ pending: true, delay: 2, remaining: 3 });
    s = mv(s, 'e2', 'e4');
    expect(s.effects[0]).toMatchObject({ pending: true, delay: 1 });
    const r = mvInfo(s, 'd7', 'd5');
    expect(r.info.arrived).toEqual([id]);
    s = r.state;
    expect(s.effects[0]).toMatchObject({ remaining: 3 });
    expect(s.effects[0].pending).toBeUndefined();
    expect(all(s)).toEqual(['e4d5']); // le lanceur est le premier contraint
    s = mv(s, 'e4', 'd5');
    s = mv(s, 'd8', 'd5');
    const last = mvInfo(s, 'b1', 'c3');
    expect(last.info.expired).toEqual([id]);
    expect(last.state.effects).toEqual([]);
    expect(has(last.state, 'd5d4')).toBe(true); // les Noirs retrouvent les premiers leur liberté
  });

  it('un Rituel adverse compte comme un coup : la Grande Marée fait arriver le Présage', () => {
    let s = createGame({ w: ['truce'], b: ['tide'] }, false, 'climats');
    s = card(s, 0);
    s = mv(s, 'e2', 'e4');
    const r = playCard(s, 'b', 0, [], '');
    if (!r.ok) throw new Error(r.error);
    expect(r.info.ritual).toBe(true);
    expect(r.info.arrived).toEqual([s.effects[0].id]);
    expect(r.state.pos.turn).toBe('w');
    expect(live(r.state)).toEqual(['truce']);
  });

  it('miroir : le même Climat annoncé pendant qu’il est actif repart de zéro à son arrivée', () => {
    let s = createGame({ w: ['truce'], b: ['truce'] }, false, 'climats');
    s = card(s, 0);
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'd7', 'd5'); // Trêve blanche arrivée (3)
    s = mv(s, 'g1', 'f3'); // 2
    s = card(s, 0); // Trêve noire annoncée
    s = mv(s, 'b8', 'c6'); // 1
    const oldId = s.effects.find(e => !e.pending)!.id;
    const r = mvInfo(s, 'f1', 'b5'); // l'ancienne expire, la nouvelle arrive
    expect(r.info.expired).toContain(oldId);
    expect(r.state.effects).toHaveLength(1);
    expect(r.state.effects[0]).toMatchObject({ card: 'truce', caster: 'b', remaining: 3 });
    expect(has(r.state, 'd5e4')).toBe(false); // la nouvelle Trêve interdit la prise
  });

  it('annonce effacée par un Déjà-vu adverse : l’effet disparaît, la carte revient face visible et se rejoue', () => {
    let s = createGame({ w: ['ice_age'], b: ['deja_vu'] }, false, 'climats');
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'e7', 'e5');
    s = card(s, 0); // Blancs : Ère glaciaire annoncée
    s = mv(s, 'g1', 'f3');
    s = card(s, 0); // Noirs : Déjà-vu (efface …e5 et Cf3, avec l'annonce faite entre les deux)
    expect(s.effects).toEqual([]);
    expect(s.hands.w[0]).toMatchObject({ card: 'ice_age', used: false, revealed: true });
    expect(viewState(s, 'b', false).hands.w[0].card).toBe('ice_age');
    expect(has(s, 'e7e5')).toBe(false); // pièce interdite
    s = mv(s, 'd7', 'd5');
    expect(cardPlayable(s, 'w', 0)).toBe(true);
  });

  it('annonce du lanceur, puis son propre Déjà-vu : le Présage revient avec son délai d’alors et arrive à l’heure', () => {
    let s = createGame({ w: ['ice_age', 'deja_vu'], b: [] }, false, 'climats');
    s = card(s, 0);
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'e7', 'e5'); // arrivée
    expect(live(s)).toEqual(['ice_age']);
    s = card(s, 1); // Déjà-vu
    expect(s.effects).toHaveLength(1);
    expect(s.effects[0]).toMatchObject({ card: 'ice_age', pending: true, delay: 2 });
    expect(s.hands.w.map(h => h.used)).toEqual([true, true]);
    expect(has(s, 'e2e4')).toBe(false);
    s = mv(s, 'd2', 'd4');
    expect(s.effects[0]).toMatchObject({ pending: true, delay: 1 });
    s = mv(s, 'd7', 'd5');
    expect(live(s)).toEqual(['ice_age']);
    expect(s.effects[0].remaining).toBe(4);
  });

  it('ÉCART R4b : un Présage d’Ère glaciaire ne doit pas permettre au lanceur de se bloquer pour jouer « comme si les effets n’existaient pas »', () => {
    // Blancs : Ra1 enfermé (b1 tenu par le fou e4), seuls des coups de pion. Ils annoncent l'Ère glaciaire.
    let s = game('7k/7p/8/3P4/4b3/8/PP6/K7 w - - 0 1', ['ice_age']);
    const r = playCard(s, 'w', 0, [], '');
    if (r.ok) {
      s = mv(r.state, 'd5', 'd6');
      s = mv(s, 'h8', 'g8'); // l'Ère glaciaire arrive
      const white = legalMovesOf(s);
      // Constat : les pions blancs avancent (coups R6) pendant que le pion h7 noir reste gelé.
      expect(white.some(m => sqName(m.from) === 'd6')).toBe(true);
      expect(white.every(m => m.flags & F_RELAXED)).toBe(true);
      s = mv(s, 'd6', 'd7');
      expect(all(s).some(m => m.startsWith('h7'))).toBe(false);
    }
    // Attendu (intention de R4b, appliquée au monde qui arrive, comme R4a) : l'annonce est refusée.
    expect(r.ok, 'l’Ère glaciaire annoncée par un camp réduit aux coups de pion est acceptée').toBe(false);
  });

  it('ÉCART « pas de pat par magie » : une Chevauchée annoncée pate l’adversaire sans qu’aucun coup n’y contribue', () => {
    // Noirs : Rh8 seul. Aux échecs ordinaires, Rg8 est jouable. À l'arrivée, le fou h6 sautera en g8.
    let s = game('7k/R7/7B/8/8/8/8/2K5 w - - 0 1', ['cavalcade']);
    expect(legalMoves({ ...s.pos, turn: 'b' }).map(m => sqName(m.from) + sqName(m.to))).toEqual(['h8g8']);
    const r = playCard(s, 'w', 0, [], '');
    if (!r.ok) return; // correctif possible : la carte est refusée (comme R4a pour l'échec)
    s = mv(r.state, 'c1', 'd1'); // coup de roi sans rapport
    // Constat : pat déclaré (nulle) par l'effet seul. Attendu : la carte refusée, ou un coup rendu aux Noirs.
    expect(s.result, 'pat par magie après une Chevauchée annoncée').toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// La magie cède (R6)

describe('La magie cède (R6), cas limites', () => {
  it('la pièce interdite par un Déjà-vu le reste pour les coups de la magie cède', () => {
    const s0 = withEffect(game('7k/8/8/8/8/8/4n1PP/7K w - - 0 1'), 'ice_age');
    const s = { ...s0, forbidden: { from: q('g2') } };
    const moves = legalMovesOf(s);
    expect(moves.map(m => sqName(m.from) + sqName(m.to)).sort()).toEqual(['h2h3', 'h2h4']);
    expect(moves.every(m => m.flags & F_RELAXED)).toBe(true);
  });

  it('Trêve : un camp dont les seuls coups sont des prises prend (coup R6) et le compteur des 50 coups repart à zéro', () => {
    // Ra1 : a2 tenu par le pion b3, b1 par le fou d3 ; le pion b2 ne peut que prendre en c3.
    const s = withEffect(game('7k/8/8/8/8/1ppb4/1P6/K7 w - - 37 40'), 'truce', { remaining: 2 });
    expect(all(s)).toEqual(['b2c3']);
    const r = mvInfo(s, 'b2', 'c3');
    expect(r.info.move.flags & F_RELAXED).toBeTruthy();
    expect(r.state.pos.halfmove).toBe(0);
    expect(live(r.state)).toEqual(['truce']);
  });

  it('en échec (même « à la fonte »), aucun coup de la magie cède : un mat reste un mat', () => {
    // Tour a1 derrière un Mur d1 qui fond après le coup blanc ; pions blancs gelés ; la tour e3 ne peut pas
    // descendre en e1 (Mur e2). Sans échec, la magie céderait (Te1 traverserait le Mur) ; ici, c'est mat.
    let s = game('7k/8/8/8/8/4R3/6PP/r6K w - - 0 1');
    s = withEffect(s, 'ice_age', { remaining: 2 });
    s = withEffect(s, 'ice_wall', { square: q('d1'), remaining: 1 });
    s = withEffect(s, 'ice_wall', { square: q('e2'), remaining: 3 });
    expect(checkKind(s)).toBe('melt');
    expect(sideInCheck(s)).toBe(true);
    expect(legalMovesOf(s)).toEqual([]);
    expect(evaluateEnd(s)).toEqual({ winner: 'b', reason: 'checkmate' });
  });

  it('R6 sous la Lune de sang : la prise obligatoire ne s’applique pas aux coups de la magie cède', () => {
    // Murs b1, a3, b3 : le roi, la tour a2 et le pion b2 sont emmurés. La magie cède ; la prise Txa4 en fait partie.
    let s = game('7k/8/8/8/p7/8/RP6/K7 w - - 0 1');
    s = withEffect(s, 'blood_moon', { remaining: 2 });
    for (const x of ['b1', 'a3', 'b3']) s = withEffect(s, 'ice_wall', { square: q(x), remaining: 3 });
    const moves = legalMovesOf(s);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(m => m.flags & F_RELAXED)).toBe(true);
    expect(all(s)).toContain('a2a4');
  });
});

// ---------------------------------------------------------------------------------------------
// Déflagration

describe('Déflagration près des rois et des pièces protégées', () => {
  const blast = (s: GameState) => withEffect(s, 'blast', { remaining: 3 }, 'w');

  it('explosion au contact des deux rois : rois et pions épargnés, pièces des deux camps détruites', () => {
    // Rd1 et Rd3 ; le Cf3 prend le Cd2 ; voisins Fc1, Fe1, Cc2, Te2 (détruits), pions c3 et e3 (épargnés).
    const h = blast(game('8/8/8/8/8/2pkPN2/2Nnr3/2BKb3 w - - 0 1'));
    const info = mvInfo(h, 'f3', 'd2');
    const b = info.state.pos.board;
    expect(info.info.move.flags & F_BLAST).toBeTruthy();
    for (const x of ['d2', 'c1', 'e1', 'c2', 'e2', 'f3']) expect(b[q(x)], x).toBeNull();
    expect(b[q('d1')]).toMatchObject({ t: 'k', c: 'w' });
    expect(b[q('d3')]).toMatchObject({ t: 'k', c: 'b' });
    expect(b[q('c3')]).toMatchObject({ t: 'p', c: 'b' });
    expect(b[q('e3')]).toMatchObject({ t: 'p', c: 'w' });
    expect(info.info.blasted).toHaveLength(5);
    expect([...info.state.captured.w].sort()).toEqual(['b', 'n', 'n']);
    expect([...info.state.captured.b].sort()).toEqual(['b', 'n', 'r']);
    expect(info.info.san).toBe('Nxd2*');
  });

  it('une explosion qui emporte un écran adverse découvre un échec : permis, et noté +', () => {
    const s = blast(game('4k3/8/3p4/1N2n3/8/8/8/4R1K1 w - - 0 1'));
    const r = mvInfo(s, 'b5', 'd6');
    expect(r.state.pos.board[q('e5')]).toBeNull();
    expect(r.info.check).toBe(true);
    expect(r.state.log[r.state.log.length - 1]).toMatchObject({ san: 'Nxd6*+' });
  });

  it('un roi capture sans explosion, et jamais une pièce protégée', () => {
    const s = blast(game('k7/8/8/8/8/8/3r4/2BK4 w - - 0 1'));
    const r = mvInfo(s, 'd1', 'd2');
    expect(r.info.move.flags & F_BLAST).toBeFalsy();
    expect(r.info.blasted).toBeUndefined();
    expect(r.state.pos.board[q('c1')]).toMatchObject({ t: 'b', c: 'w' });
    const t = blast(game('k7/8/8/8/8/4b3/3r4/2BK4 w - - 0 1'));
    expect(has(t, 'd1d2')).toBe(false);
  });

  it('pièce clouée qui prend son cloueur : l’explosion la fait disparaître et ouvre la ligne du rayon X', () => {
    const fen = 'k3q3/8/8/4r3/8/8/4R3/4K3 w - - 0 1';
    expect(has(game(fen), 'e2e5')).toBe(true); // échecs ordinaires : la tour bloque toujours
    expect(has(blast(game(fen)), 'e2e5')).toBe(false); // explosion : la dame e8 verrait le roi
  });

  it('une explosion qui emporte la pièce qui donne échec est une parade', () => {
    const fen = 'k7/8/8/6rp/5N2/8/8/6K1 w - - 0 1';
    expect(has(game(fen), 'f4h5')).toBe(false);
    expect(has(blast(game(fen)), 'f4h5')).toBe(true);
    const r = mvInfo(blast(game(fen)), 'f4', 'h5');
    expect(r.state.pos.board[q('g5')]).toBeNull();
  });

  it('prise en passant : explosion centrée sur la case d’arrivée, pas sur le pion pris', () => {
    let s = withEffect(game('6k1/3p4/8/2n1P3/4r3/8/8/6K1 b - - 0 1'), 'blast', { remaining: 3 }, 'w');
    s = mv(s, 'd7', 'd5');
    const r = mvInfo(s, 'e5', 'd6');
    expect(r.info.move.flags & (F_EP | F_BLAST)).toBe(F_EP | F_BLAST);
    const b = r.state.pos.board;
    expect(b[q('d6')]).toBeNull(); // le pion qui prend explose
    expect(b[q('d5')]).toBeNull(); // la victime
    expect(b[q('c5')]).toBeNull(); // voisin de d6
    expect(b[q('e4')]).toMatchObject({ t: 'r', c: 'b' }); // voisin de d5 seulement : épargné
    expect(r.info.san).toBe('exd6*');
  });
});

// ---------------------------------------------------------------------------------------------
// Couronnement

describe('Couronnement et échec', () => {
  const crown = (s: GameState) => withEffect(s, 'coronation', { remaining: 3 }, 'w');

  it('une promotion en 7e rangée qui donne échec est notée et oblige à répondre', () => {
    const s = crown(game('4k3/8/3P4/8/8/8/8/6K1 w - - 0 1'));
    const pushes = legalMovesOf(s).filter(m => sqName(m.from) === 'd6');
    expect(pushes.every(m => m.flags & F_PROMO)).toBe(true);
    expect(pushes.map(m => m.promo).sort()).toEqual(['b', 'n', 'q', 'r']);
    const r = mvInfo(s, 'd6', 'd7', 'q');
    expect(r.info.check).toBe(true);
    expect(r.state.pos.board[q('d7')]).toMatchObject({ t: 'q', c: 'w' });
    expect(r.state.log[r.state.log.length - 1]).toMatchObject({ san: 'd7=Q+' });
    expect(all(r.state)).toEqual(['e8d7', 'e8f8']);
  });

  it('promotion en 7e rangée qui découvre un échec du fou', () => {
    const s = crown(game('5k2/8/3P4/8/1B6/8/8/6K1 w - - 0 1'));
    const r = mvInfo(s, 'd6', 'd7', 'r'); // la tour d7 ne voit pas f8 : l'échec vient du fou b4
    expect(r.info.check).toBe(true);
  });

  it('pendant le Présage, le pion qui atteint sa 7e rangée n’est pas promu ; il se promeut ensuite en 8e', () => {
    let s = game('4k3/8/3P4/8/8/8/8/6K1 w - - 0 1', ['coronation']);
    s = card(s, 0);
    const r = mvInfo(s, 'd6', 'd7');
    expect(r.info.move.flags & F_PROMO).toBeFalsy();
    s = mv(r.state, 'e8', 'e7');
    expect(live(s)).toEqual(['coronation']);
    expect(legalMovesOf(s).filter(m => sqName(m.from) === 'd7').every(m => sqName(m.to) === 'd8' && m.promo)).toBe(true);
  });

  it('les Noirs couronnent en 2e rangée, et la dame promue donne échec', () => {
    let s = crown(game('6k1/8/8/8/8/2p5/8/K7 b - - 0 1'));
    s = mv(s, 'g8', 'g7');
    s = mv(s, 'a1', 'b1');
    // Le compteur : 3 → 2 → 1 ; reste un coup noir sous le Couronnement.
    const r = mvInfo(s, 'c3', 'c2', 'q');
    expect(r.state.pos.board[q('c2')]).toMatchObject({ t: 'q', c: 'b' });
    expect(r.info.check).toBe(true); // Dc2 attaque b1
  });

  it('Déjà-vu : une pièce promue pendant le tour effacé redevient un pion', () => {
    let s = crown(game('6k1/8/3P4/8/8/8/8/K7 w - - 0 1', ['deja_vu']));
    s = mv(s, 'd6', 'd7', 'q');
    s = mv(s, 'g8', 'h8');
    s = card(s, 0);
    expect(s.pos.board[q('d6')]).toMatchObject({ t: 'p', c: 'w' });
    expect(s.pos.board[q('d7')]).toBeNull();
    expect(has(s, 'd6d7')).toBe(false); // même pièce interdite
  });
});

// ---------------------------------------------------------------------------------------------
// Portails

describe('Portails et détection d’échec', () => {
  const portals = (s: GameState, a: string, extra: Partial<Effect> = {}) =>
    withEffect(s, 'portals', { squares: [q(a), 63 - q(a)], remaining: 4, ...extra }, 'w');

  it('un passage qui donne échec est noté Tc3→f6+ et l’adversaire doit répondre', () => {
    const s = portals(game('5k2/8/8/8/8/8/8/2R3K1 w - - 0 1'), 'c3');
    const pass = legalMovesOf(s).find(m => m.flags & F_PORTAL && sqName(m.to) === 'f6');
    expect(pass).toMatchObject({ from: q('c1'), via: q('c3') });
    const r = mvInfo(s, 'c1', 'f6');
    expect(r.info.check).toBe(true);
    expect(r.info.san).toBe('Rc3→f6');
    expect(r.state.log[r.state.log.length - 1]).toMatchObject({ san: 'Rc3→f6+' });
    expect(all(r.state).every(m => m.startsWith('f8') && !m.endsWith('f7'))).toBe(true);
  });

  it('une pièce clouée peut s’arrêter sur l’entrée (sur la ligne) mais pas ressortir hors de la ligne', () => {
    const s = portals(game('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1'), 'e3');
    expect(has(s, 'e2e3')).toBe(true);
    expect(legalMovesOf(s).some(m => m.flags & F_PORTAL)).toBe(false); // e3 → d6 quitterait la ligne
  });

  it('un roi peut se poser sur une sortie qu’une pièce adverse atteindrait par le portail : un passage n’attaque pas', () => {
    const s = portals(game('8/6k1/8/8/8/8/8/2R3K1 b - - 0 1'), 'c3');
    expect(has(s, 'g7f6')).toBe(true);
    const n = mv(s, 'g7', 'f6');
    expect(legalMovesOf(n).some(m => m.flags & F_PORTAL)).toBe(false); // portail occupé : paire fermée
  });

  it('Chevauchée et Portails : un saut s’arrête sur l’entrée et ressort', () => {
    let s = portals(game('6k1/8/8/8/8/8/8/1R4K1 w - - 0 1'), 'c3');
    s = withEffect(s, 'cavalcade', { remaining: 2 }, 'w');
    const m = legalMovesOf(s).find(x => x.from === q('b1') && x.via === q('c3'));
    expect(m && sqName(m.to)).toBe('f6');
    expect(m!.flags & (F_LEAP | F_PORTAL)).toBe(F_LEAP | F_PORTAL);
    expect(m!.flags & F_CAPTURE).toBe(0);
  });

  it('aucun coup en double (même départ, même arrivée) quand la sortie est aussi atteignable autrement', () => {
    // Fou a1 : c3 (entrée) puis f6 (sortie) sont sur sa diagonale ; aucun passage n'est ajouté.
    const s = portals(game('8/7k/8/8/8/8/8/B5K1 w - - 0 1'), 'c3');
    const keys = legalMovesOf(s).map(m => `${m.from}-${m.to}-${m.promo ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(legalMovesOf(s).some(m => m.flags & F_PORTAL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Faille et roque

describe('Faille et roque', () => {
  const fen = 'k4r2/8/8/8/8/8/8/4K2R w K - 0 1';

  it('aux échecs ordinaires, f1 attaqué : pas de petit roque', () => {
    expect(has(game(fen), 'e1g1')).toBe(false);
  });

  it('la Faille coupe la colonne f : le roque devient légal tant qu’elle reste ouverte après le coup', () => {
    const s = withEffect(game(fen), 'rift', { squares: rank(5), remaining: 3 });
    expect(has(s, 'e1g1')).toBe(true);
    const n = mv(s, 'e1', 'g1');
    expect(n.pos.board[q('f1')]).toMatchObject({ t: 'r', c: 'w' });
  });

  it('R5 : la Faille qui se ferme après le roque ne le couvre plus', () => {
    const s = withEffect(game(fen), 'rift', { squares: rank(5), remaining: 1 });
    expect(has(s, 'e1g1')).toBe(false);
  });

  it('une Faille ne se pose jamais sur les rangées 1, 2, 3, 6, 7 et 8', () => {
    const s = createGame({ w: ['rift'], b: ['rift'] }, false, 'climats');
    expect(cardOptions(s, 'w', 0).every(x => rankOf(x) === 3 || rankOf(x) === 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Prise en passant sous Trêve ou Lune de sang

describe('Prise en passant sous Trêve ou Lune de sang', () => {
  it('Trêve, hors échec : pas de prise en passant ; le droit se perd ensuite', () => {
    let s = withEffect(game('6k1/3p4/8/4P3/8/8/8/K7 b - - 0 1'), 'truce', { remaining: 3 }, 'b');
    s = mv(s, 'd7', 'd5');
    expect(s.pos.ep).toBe(q('d6'));
    expect(has(s, 'e5d6')).toBe(false);
    expect(has(s, 'e5e6')).toBe(true);
  });

  it('Trêve, en échec : la prise en passant qui retire le pion qui donne échec est permise', () => {
    let s = withEffect(game('6k1/3p4/8/4P3/4K3/8/8/8 b - - 0 1'), 'truce', { remaining: 3 }, 'b');
    s = mv(s, 'd7', 'd5'); // échec au roi e4
    expect(sideInCheck(s)).toBe(true);
    expect(has(s, 'e5d6')).toBe(true);
    expect(has(s, 'e4d5')).toBe(true);
  });

  it('Lune de sang : la prise en passant est une capture obligatoire, au choix avec les autres', () => {
    let s = withEffect(game('6k1/3p4/8/4P3/8/7n/6P1/K7 b - - 0 1'), 'blood_moon', { remaining: 3 }, 'b');
    s = mv(s, 'd7', 'd5');
    expect(all(s)).toEqual(['e5d6', 'g2h3']);
  });

  it('Lune de sang : la prise en passant par la pièce interdite (Déjà-vu) ne compte plus', () => {
    let s = withEffect(game('6k1/3p4/8/4P3/8/8/7P/K7 b - - 0 1'), 'blood_moon', { remaining: 3 }, 'b');
    s = mv(s, 'd7', 'd5');
    expect(all(s)).toEqual(['e5d6']);
    const f = { ...s, forbidden: { from: q('e5') } };
    expect(all(f)).toEqual(['a1a2', 'a1b1', 'a1b2', 'h2h3', 'h2h4']);
  });

  it('un Mur sur la case de prise en passant l’interdit', () => {
    const s = withEffect(game('6k1/8/8/3pP3/8/8/8/K7 w - d6 0 1'), 'ice_wall', { square: q('d6'), remaining: 3 });
    expect(has(s, 'e5d6')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Répétition et 50 coups

describe('Répétition et règle des 50 coups avec effets', () => {
  const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const fen = 'rn2k1n1/pppppppp/8/8/8/8/PPPPPPPP/RN2K1N1 w - - 0 1';

  function shuffleUntilEnd(s: GameState, max = 40): { s: GameState; plies: number } {
    let k = 0;
    while (!s.result && k < max) {
      const m = shuffle[k % 4];
      s = mv(s, m.slice(0, 2), m.slice(2));
      k++;
    }
    return { s, plies: k };
  }

  it('sans effet : triple répétition après 8 demi-coups', () => {
    const { s, plies } = shuffleUntilEnd(game(fen));
    expect(s.result).toEqual({ winner: null, reason: 'repetition' });
    expect(plies).toBe(8);
  });

  it('un Mur actif rend chaque position unique ; la répétition ne compte qu’après la fonte', () => {
    let s = game(fen, ['ice_wall']);
    s = card(s, 0, 'a4');
    const { s: end, plies } = shuffleUntilEnd(s);
    expect(end.result).toEqual({ winner: null, reason: 'repetition' });
    // 6 coups de Mur (positions toutes différentes), puis 8 demi-coups : 3e occurrence de la position d'après la fonte.
    expect(plies).toBe(14);
  });

  it('une carte jouée change la position (droits différents) : pas de répétition avec la position d’avant', () => {
    let s = game(fen, [], ['truce']);
    s = mv(s, 'g1', 'f3');
    s = mv(s, 'g8', 'f6');
    s = mv(s, 'f3', 'g1');
    s = card(s, 0); // Trêve annoncée par les Noirs
    s = mv(s, 'f6', 'g8');
    expect(s.keys.filter(k => k === s.keys[s.keys.length - 1])).toHaveLength(1);
  });

  it('Trêve : à 98 demi-coups, la nulle des 50 coups attend la fin de la Trêve', () => {
    let s = withEffect(game('4k3/8/8/8/8/8/8/R3K3 w - - 98 80'), 'truce', { remaining: 3 }, 'w');
    s = mv(s, 'a1', 'a2');
    s = mv(s, 'e8', 'd8');
    s = mv(s, 'a2', 'a3'); // dernier coup de la Trêve
    expect(s.pos.halfmove).toBe(98);
    expect(s.effects).toEqual([]);
    s = mv(s, 'd8', 'e8');
    expect(s.pos.halfmove).toBe(99);
    expect(s.result).toBeNull();
    s = mv(s, 'a3', 'a4');
    expect(s.result).toEqual({ winner: null, reason: 'fifty' });
  });

  it('la Grande Marée remet le compteur à zéro ; une prise qui explose aussi', () => {
    let s = game('4k3/p7/8/8/8/8/P7/4K3 w - - 77 80', ['tide']);
    s = card(s, 0);
    expect(s.pos.halfmove).toBe(0);
    let t = withEffect(game('4k3/8/8/3r4/8/8/3R4/4K3 w - - 77 80'), 'blast', { remaining: 3 }, 'w');
    t = mv(t, 'd2', 'd5');
    expect(t.pos.halfmove).toBe(0);
  });

  it('Déjà-vu : les positions effacées ne comptent plus pour la répétition', () => {
    let s = game(fen, ['deja_vu']);
    for (const m of shuffle.slice(0, 2)) s = mv(s, m.slice(0, 2), m.slice(2));
    const len = s.keys.length;
    s = mv(s, 'f3', 'g1');
    s = mv(s, 'f6', 'g8');
    s = card(s, 0);
    expect(s.keys).toHaveLength(len);
    expect(s.keys[s.keys.length - 1]).toBe(positionKey({ ...s, hands: { ...s.hands, w: s.hands.w.map(h => ({ ...h, used: false })) } }));
  });
});

// ---------------------------------------------------------------------------------------------
// Déjà-vu et instantanés

describe('Déjà-vu et instantanés', () => {
  it('restaure exactement l’état d’avant le coup du lanceur, vide l’historique et ne s’enchaîne pas', () => {
    let s = createGame({ w: ['deja_vu', 'ice_wall'], b: ['deja_vu'] }, false, 'climats');
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'd7', 'd5');
    const A = s;
    s = mv(s, 'e4', 'd5');
    s = mv(s, 'd8', 'd5');
    s = card(s, 0);
    expect(toFen(s.pos)).toBe(toFen(A.pos));
    expect(s.captured).toEqual(A.captured);
    expect(s.effects).toEqual(A.effects);
    expect(s.ply).toBe(A.ply);
    expect(s.keys).toEqual(A.keys);
    expect(s.snaps).toEqual([]);
    expect(s.cardPlayed).toBe(true);
    expect(cardPlayable(s, 'w', 1)).toBe(false); // une seule carte par tour
    s = mv(s, 'g1', 'f3');
    // Les Noirs n'ont qu'un instantané (le coup blanc) : pas de Déjà-vu possible.
    expect(cardPlayable(s, 'b', 0)).toBe(false);
  });

  it('les instantanés ne portent que des drapeaux ; une vue n’y révèle aucune carte', () => {
    let s = createGame({ w: ['deja_vu', 'blast', 'portals'], b: ['tide', 'cavalcade', 'rift'] }, false, 'climats');
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'e7', 'e5');
    for (const snap of s.snaps) {
      expect(Object.keys(snap)).not.toContain('hands');
      expect(snap.used).toEqual({ w: [false, false, false], b: [false, false, false] });
    }
    const v = JSON.stringify(viewState(s, 'w', false));
    for (const id of ['tide', 'cavalcade', 'rift']) expect(v).not.toContain(`"${id}"`);
  });

  it('une Grande Marée adverse effacée : les pions reviennent, la carte est rendue face visible', () => {
    let s = createGame({ w: ['deja_vu'], b: ['tide'] }, false, 'climats');
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'e7', 'e5');
    const before = toFen(s.pos);
    s = mv(s, 'g1', 'f3');
    s = card(s, 0); // Marée noire (Rituel)
    expect(s.pos.turn).toBe('w');
    s = card(s, 0); // Déjà-vu blanc
    expect(toFen(s.pos)).toBe(before);
    expect(s.hands.b[0]).toMatchObject({ card: 'tide', used: false, revealed: true });
    expect(viewState(s, 'w', false).hands.b[0].card).toBe('tide');
    expect(has(s, 'g1f3')).toBe(false);
  });

  it('Déjà-vu après aller-retour JSON : même résultat que sur l’état d’origine', () => {
    let s = createGame({ w: ['deja_vu'], b: ['ice_wall'] }, false, 'climats');
    s = mv(s, 'e2', 'e4');
    s = card(s, 0, 'e5');
    s = mv(s, 'd7', 'd5');
    s = mv(s, 'e4', 'd5');
    s = mv(s, 'd8', 'd5');
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    const a = playCard(s, 'w', 0, [], '');
    const b = playCard(copy, 'w', 0, [], '');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(JSON.parse(JSON.stringify(b.state))).toEqual(JSON.parse(JSON.stringify(a.state)));
      expect(a.state.effects.map(e => e.card)).toEqual(['ice_wall']); // le Mur noir d'avant reste
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Tirage pondéré

describe('Tirage pondéré (R9), sur des milliers de mains', () => {
  it('contraintes tenues pour toutes les options : pendule, IA, miroir', () => {
    const rand = rng(424242);
    for (const timed of [true, false]) {
      for (const vsBot of [false, true]) {
        for (const mirror of [false, true]) {
          for (let i = 0; i < 1500; i++) {
            const h = dealHands(timed, mirror, rand, 'climats', { vsBot });
            for (const hand of [h.w, h.b]) {
              expect(hand).toHaveLength(3);
              expect(new Set(hand).size).toBe(3);
              expect(hand.every(id => CARDS[id].catalogs.includes('climats'))).toBe(true);
              expect(hand.filter(id => CARDS[id].rarity === 'légendaire').length).toBeLessThanOrEqual(1);
              expect(hand.filter(id => CARDS[id].family === 'climat').length).toBeLessThanOrEqual(2);
              if (!timed || vsBot) expect(hand).not.toContain('hourglass');
            }
            if (mirror) expect(h.b).toEqual(h.w);
          }
        }
      }
    }
  }, 60_000);

  it('générateurs dégénérés : toujours une main valide de 3 cartes distinctes', () => {
    let k = 0;
    const gens: (() => number)[] = [() => 0, () => 0.9999999999, () => 0.5, () => (k++ % 2 ? 0.999 : 0), () => (k++ % 7) / 7];
    for (const g of gens) {
      for (const opts of [{}, { vsBot: true }]) {
        const { w, b } = dealHands(false, false, g, 'climats', opts);
        for (const hand of [w, b]) {
          expect(new Set(hand).size).toBe(3);
          expect(hand.filter(id => CARDS[id].rarity === 'légendaire').length).toBeLessThanOrEqual(1);
          expect(hand.filter(id => CARDS[id].family === 'climat').length).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('les Légendaires restent rares et les Communes fréquentes, sans pendule comme avec', () => {
    const rand = rng(99);
    const N = 20000;
    const seen: Partial<Record<CardId, number>> = {};
    for (let i = 0; i < N; i++) for (const id of dealHands(false, false, rand, 'climats').w) seen[id] = (seen[id] ?? 0) + 1;
    const pct = (id: CardId) => ((seen[id] ?? 0) / N) * 100;
    expect(pct('hourglass')).toBe(0);
    // Sans Sablier, les autres montent de 2 à 4 points (section R9).
    expect(pct('ice_wall')).toBeGreaterThan(40);
    expect(pct('ice_wall')).toBeLessThan(46);
    expect(pct('blast')).toBeGreaterThan(7);
    expect(pct('blast')).toBeLessThan(12);
    expect(pct('deja_vu') + pct('blast')).toBeLessThan(24);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------
// Sérialisation

describe('Sérialisation', () => {
  it('un état chargé de tous les effets survit à JSON et à structuredClone, puis se joue à l’identique', () => {
    let s = game('r3k2r/ppp2ppp/2n5/3pp3/3PP3/2N5/PPP2PPP/R3K2R w KQkq - 4 9', ['deja_vu', 'tide', 'ice_wall'], ['rift', 'portals', 'blood_moon']);
    s = withEffect(s, 'ice_wall', { square: q('h4'), remaining: 5 });
    s = withEffect(s, 'rift', { squares: [q('a5'), q('b5'), q('c5'), q('f5'), q('g5'), q('h5')], remaining: 3 });
    s = withEffect(s, 'portals', { squares: [q('a3'), q('h6')], remaining: 6, pending: true, delay: 1 }, 'w');
    s = withEffect(s, 'coronation', { remaining: 2 }, 'w');
    s = withEffect(s, 'blast', { remaining: 4, pending: true, delay: 2 }, 'b');
    s = { ...s, hands: { ...s.hands, b: [{ card: 'rift', used: false, revealed: true }, ...s.hands.b.slice(1)] } };
    s = mv(s, 'h2', 'h3');
    s = mv(s, 'a7', 'a6');
    for (const copy of [JSON.parse(JSON.stringify(s)) as GameState, structuredClone(s)]) {
      expect(positionKey(copy)).toBe(positionKey(s));
      expect(legalMovesOf(copy)).toEqual(legalMovesOf(s));
      expect(cardOptions(copy, 'w', 2)).toEqual(cardOptions(s, 'w', 2));
      // 30 demi-coups au hasard, en parallèle sur l'original et la copie
      const r1 = rng(5), r2 = rng(5);
      let a = s, b = copy;
      for (let k = 0; k < 30 && !a.result; k++) {
        const la = legalMovesOf(a), lb = legalMovesOf(b);
        expect(lb).toEqual(la);
        const ma = la[Math.floor(r1() * la.length)], mb = lb[Math.floor(r2() * lb.length)];
        const ra = playMove(a, ma.from, ma.to, ma.promo), rb = playMove(b, mb.from, mb.to, mb.promo);
        if (!ra.ok || !rb.ok) throw new Error('coup refusé');
        a = ra.state;
        b = rb.state;
      }
      expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)));
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Matériel insuffisant et libellés d'échec

describe('Matériel insuffisant avec des cartes en main', () => {
  it('ÉCART : Roi et Fou plus un Mur de glace en main contre Roi seul n’est pas nul (Mur g8, puis Fd4#)', () => {
    const s = game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', ['ice_wall']);
    // Preuve que le mat existe : on neutralise la nulle et on joue la suite.
    const r = playCard({ ...s, result: null }, 'w', 0, [q('g8')], '');
    if (!r.ok) throw new Error(r.error);
    const m = playMove({ ...r.state, result: null }, q('e3'), q('d4'));
    expect(m.ok && m.state.result).toEqual({ winner: 'w', reason: 'checkmate' });
    // Constat : le moteur déclare la nulle avant même la carte, et la pendule ne laisserait pas gagner au temps.
    expect(evaluateEnd(s), 'nulle par matériel insuffisant malgré le Mur en main').toBeNull();
    expect(canStillMate(s, 'w')).toBe(true);
  });
});

describe('Libellé de l’échec (checkKind, R5)', () => {
  it('ÉCART : un Mur sans rapport qui fond ne doit pas transformer un échec « à l’arrivée » en échec « à la fonte »', () => {
    // La Chevauchée blanche arrive après le coup noir : la dame d6 sautera en e8. Un Mur a5, loin de tout, fond.
    let s = game('4k3/8/3Q4/8/8/8/8/4K3 b - - 0 1');
    s = withEffect(s, 'cavalcade', { pending: true, delay: 1, remaining: 2 }, 'w');
    s = withEffect(s, 'ice_wall', { square: q('a5'), remaining: 1 }, 'b');
    expect(sideInCheck(s)).toBe(true);
    expect(checkKind(s)).toBe('arrival');
  });
});

// ---------------------------------------------------------------------------------------------
// Parties au hasard, plus agressives

const ROOK_HOME: [number, number, number, Color][] = [[1, 4, 7, 'w'], [2, 4, 0, 'w'], [4, 60, 63, 'b'], [8, 60, 56, 'b']];

let invariantCalls = 0;
/** Invariants d'un état ; `fromStart` : partie commencée à la position initiale (comptes exacts). */
function invariants(s: GameState, fromStart: boolean) {
  invariantCalls++;
  const b = s.pos.board;
  const kings: Record<Color, number> = { w: 0, b: 0 };
  let count = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    count++;
    if (p.t === 'k') kings[p.c]++;
    expect(p.t === 'p' && (rankOf(i) === 0 || rankOf(i) === 7), `pion en ${sqName(i)}`).toBe(false);
  }
  expect(kings).toEqual({ w: 1, b: 1 });
  if (fromStart) {
    expect(count + s.captured.w.length + s.captured.b.length, 'pièces conservées').toBe(32);
    expect(s.pos.fullmove).toBe(1 + Math.floor(s.ply / 2));
    expect(s.keys).toHaveLength(s.ply + 1);
    const plies = s.log.filter(e => !e.undone && (e.k === 'move' || CARDS[e.card].ritual)).length;
    expect(plies, 'journal et demi-coups').toBe(s.ply);
  }
  for (const [bit, k, r, c] of ROOK_HOME) {
    if (s.pos.castling & bit) {
      expect(b[k], `roi pour le droit ${bit}`).toMatchObject({ t: 'k', c });
      expect(b[r], `tour pour le droit ${bit}`).toMatchObject({ t: 'r', c });
    }
  }
  if (s.pos.ep >= 0) {
    const behind = s.pos.ep + (s.pos.turn === 'w' ? -8 : 8);
    expect(b[s.pos.ep]).toBeNull();
    expect(b[behind]).toMatchObject({ t: 'p', c: opposite(s.pos.turn) });
  }
  const now = modsFromEffects(s.effects);
  for (let i = 0; i < 64; i++) expect(now.blocked[i] && !!b[i], `pièce sur une case bloquée ${sqName(i)}`).toBe(false);
  const climates = s.effects.filter(e => CARDS[e.card].family === 'climat');
  expect(climates.filter(e => !e.pending).length).toBeLessThanOrEqual(1);
  expect(climates.filter(e => e.pending).length).toBeLessThanOrEqual(1);
  expect(s.effects.filter(e => e.card === 'rift').length).toBeLessThanOrEqual(1);
  expect(s.effects.filter(e => e.card === 'portals').length).toBeLessThanOrEqual(1);
  const terrain = new Set<number>();
  for (const e of s.effects) {
    expect(e.remaining).toBeGreaterThan(0);
    expect(e.remaining).toBeLessThanOrEqual(e.total);
    if (e.pending) expect([1, 2]).toContain(e.delay);
    const sqs = e.card === 'ice_wall' ? [e.square!] : e.card === 'rift' || e.card === 'portals' ? e.squares ?? [] : [];
    for (const x of sqs) {
      expect(terrain.has(x), `deux Terrains en ${sqName(x)}`).toBe(false);
      terrain.add(x);
    }
  }
  for (const you of ['w', 'b'] as Color[]) {
    const v = viewState(s, you, false);
    const them = opposite(you);
    s.hands[them].forEach((h, i) => {
      if (!h.used && !h.revealed) expect(v.hands[them][i].card).toBeNull();
    });
    for (const snap of v.snaps) expect(Object.keys(snap)).not.toContain('hands');
  }
  if (s.result) {
    if (s.result.reason === 'checkmate') {
      expect(s.result.winner).toBe(opposite(s.pos.turn));
      expect(sideInCheck(s)).toBe(true);
    }
    if (s.result.reason === 'checkmate' || s.result.reason === 'stalemate') {
      expect(legalMovesOf({ ...s, result: null })).toEqual([]);
    }
    if (s.result.reason === 'stalemate') expect(sideInCheck(s)).toBe(false);
    return;
  }
  const me = s.pos.turn;
  const them = opposite(me);
  expect(inCheck(s.pos, them, now), `roi ${them} en prise : ${toFen(s.pos)}`).toBe(false);
  const after = modsFromEffects(tickEffects(s.effects, me));
  const moves = legalMovesOf(s);
  const keys = moves.map(m => `${m.from}-${m.to}-${m.promo ?? ''}`);
  expect(new Set(keys).size, 'coups en double').toBe(keys.length);
  const relaxed = moves.length > 0 && moves.every(m => m.flags & F_RELAXED);
  expect(relaxed || !moves.some(m => m.flags & F_RELAXED)).toBe(true);
  if (relaxed) {
    expect(inCheck(s.pos, me, after)).toBe(false);
  } else {
    if (now.truce && !inCheck(s.pos, me, after)) expect(moves.some(m => m.flags & F_CAPTURE)).toBe(false);
    if (now.mustCapture && moves.some(m => m.flags & F_CAPTURE)) expect(moves.every(m => m.flags & F_CAPTURE)).toBe(true);
    if (now.pawnsFrozen) expect(moves.some(m => b[m.from]!.t === 'p')).toBe(false);
    for (const m of moves) expect(now.blocked[m.to]).toBe(false);
  }
  const lm = legalMoves(s.pos, now, after);
  expect(hasLegalMove(s.pos, now, after)).toBe(lm.length > 0);
  if (invariantCalls % 3 === 0) checkMakeUnmake(s.pos, now, after);
  if (!moves.length) {
    expect(s.cardPlayed).toBe(false);
    expect(s.hands[me].some((_, i) => cardPlayable(s, me, i))).toBe(true);
  }
}

/** makeMove puis unmakeMove rendent exactement la position (explosions comprises). */
function checkMakeUnmake(pos: Position, now: Mods, after: Mods) {
  const before = JSON.stringify(pos);
  for (const m of pseudoMoves(pos, now, after)) {
    const u = makeMove(pos, m);
    unmakeMove(pos, u);
    expect(JSON.stringify(pos), `${sqName(m.from)}${sqName(m.to)}`).toBe(before);
  }
}

const neighbours = (x: number) =>
  [-9, -8, -7, -1, 1, 7, 8, 9].map(d => x + d).filter(y => y >= 0 && y < 64 && Math.abs(fileOf(y) - fileOf(x)) <= 1);

/** Joue au hasard avec des cartes dès qu'elles sont possibles ; vérifie les invariants après chaque action. */
function aggressive(start: GameState, rand: () => number, maxSteps: number, fromStart: boolean, label: string, stats: Map<string, number>) {
  let s = start;
  const log: string[] = [];
  const bump = (k: string) => stats.set(k, (stats.get(k) ?? 0) + 1);
  try {
    invariants(s, fromStart);
    for (let step = 0; step < maxSteps && !s.result; step++) {
      const me = s.pos.turn;
      if (!s.cardPlayed && (rand() < 0.85 || !legalMovesOf(s).length)) {
        const free = s.hands[me].map((_, i) => i).filter(i => !s.hands[me][i].used);
        for (const i of free.sort(() => rand() - 0.5)) {
          const id = s.hands[me][i].card!;
          const targets: number[] = [];
          let ok = true;
          for (let k = 0; k < CARDS[id].targets; k++) {
            const o = cardOptions(s, me, i, targets);
            if (!o.length) { ok = false; break; }
            targets.push(o[Math.floor(rand() * o.length)]);
          }
          if (!ok) continue;
          const r = playCard(s, me, i, targets, '');
          if (CARDS[id].targets) expect(r.ok, `${id} ${targets.map(sqName)} : ${r.ok ? '' : r.error}`).toBe(true);
          if (!r.ok) continue;
          if (!r.info.ritual) {
            // R4a : jamais d'échec par une carte, ni maintenant ni (Présage) à l'arrivée pour la position actuelle.
            expect(inCheck(r.state.pos, opposite(me), modsFromEffects(r.state.effects))).toBe(false);
          }
          log.push(`[${id}${targets.map(sqName).join(',')}]`);
          bump(id);
          s = r.state;
          invariants(s, fromStart);
          break;
        }
        if (s.result || s.pos.turn !== me) continue;
      }
      const legal = legalMovesOf(s);
      expect(legal.length, 'aucun coup et aucune carte jouée').toBeGreaterThan(0);
      const sharp = legal.filter(m => m.flags & (F_CAPTURE | F_PORTAL | F_PROMO | F_RELAXED));
      const m = sharp.length && rand() < 0.6 ? sharp[Math.floor(rand() * sharp.length)] : legal[Math.floor(rand() * legal.length)];
      const now = modsFromEffects(s.effects);
      const r = playMove(s, m.from, m.to, m.promo);
      expect(r.ok, r.ok ? '' : r.error).toBe(true);
      if (!r.ok) break;
      const n = r.state;
      // Le roi de celui qui vient de jouer n'est pas en prise, avec les effets tels qu'ils sont après le coup.
      expect(inCheck(n.pos, me, modsFromEffects(n.effects)), `roi de ${me} en prise après ${r.info.san}`).toBe(false);
      expect(r.info.check).toBe(sideInCheck(n));
      expect(n.keys[n.keys.length - 1]).toBe(positionKey(n));
      if (m.flags & F_BLAST) {
        expect(n.pos.board[m.to]).toBeNull();
        for (const x of neighbours(m.to)) {
          const p = n.pos.board[x];
          expect(!p || p.t === 'p' || p.t === 'k', `voisine survivante ${sqName(x)}`).toBe(true);
        }
      }
      if (now.crown && s.pos.board[m.from]!.t === 'p' && !(m.flags & (F_BLAST | F_RELAXED))) {
        const rel = me === 'w' ? rankOf(m.to) : 7 - rankOf(m.to);
        if (rel === 6 && !(m.flags & F_EP)) expect(n.pos.board[m.to]?.t).not.toBe('p');
      }
      for (const [f, k] of [[F_RELAXED, 'relaxed'], [F_BLAST, 'explosion'], [F_PORTAL, 'passage'], [F_PROMO, 'promotion']] as const) {
        if (m.flags & f) bump(k);
      }
      log.push(r.info.san + (m.flags & F_RELAXED ? '(R6)' : ''));
      s = n;
      invariants(s, fromStart);
      if (s.ply % 10 === 0) {
        const c = JSON.parse(JSON.stringify(s)) as GameState;
        expect(positionKey(c)).toBe(positionKey(s));
        expect(legalMovesOf(c)).toEqual(legalMovesOf(s));
      }
    }
    if (s.result) bump('fin:' + s.result.reason);
  } catch (e) {
    throw new Error(`${label} : ${(e as Error).message}\n${toFen(start.pos)}\n${log.join(' ')}`);
  }
}

/** Position clairsemée au hasard, avec beaucoup de Murs, parfois une Faille, des Portails et un Climat. */
function crowdedTerrain(rand: () => number): GameState {
  const ri = (n: number) => Math.floor(rand() * n);
  const pool = cardsOf('climats');
  const CLIM: CardId[] = ['truce', 'blood_moon', 'ice_age', 'coronation', 'blast', 'cavalcade'];
  for (;;) {
    const b: (string | null)[] = new Array(64).fill(null);
    const put = (t: string) => {
      for (;;) {
        const i = ri(64);
        if (b[i] || (t.toLowerCase() === 'p' && (i >> 3 === 0 || i >> 3 === 7))) continue;
        b[i] = t;
        return;
      }
    };
    put('K');
    put('k');
    for (let k = 2 + ri(9); k > 0; k--) {
      const t = 'pppppppnbr'[ri(10)];
      put(rand() < 0.5 ? t.toUpperCase() : t);
    }
    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let row = '';
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = b[r * 8 + f];
        if (!p) e++;
        else {
          if (e) row += e;
          e = 0;
          row += p;
        }
      }
      rows.push(row + (e || ''));
    }
    const pick = () => Array.from({ length: 3 }, () => pool[ri(pool.length)]);
    const s = createGameFromFen(`${rows.join('/')} ${rand() < 0.5 ? 'w' : 'b'} - - ${ri(60)} 30`, { w: pick(), b: pick() }, rand() < 0.7, 'climats');
    s.nextEffectId = 500;
    const used = new Set<number>();
    const empties = () => s.pos.board.map((p, i) => (p || used.has(i) ? -1 : i)).filter(i => i >= 0);
    const eff = (id: CardId, extra: Partial<Effect> = {}): Effect => {
      const total = CARDS[id].coups ?? 4;
      const caster: Color = rand() < 0.5 ? 'w' : 'b';
      return { id: s.nextEffectId++, card: id, caster, countsOn: caster, remaining: 1 + ri(total), total, skin: '', global: true, ...extra };
    };
    const effects: Effect[] = [];
    for (let k = 6 + ri(16); k > 0; k--) {
      const e = empties();
      const x = e[ri(e.length)];
      used.add(x);
      effects.push(eff('ice_wall', { square: x }));
    }
    if (rand() < 0.3) {
      const r = 3 + ri(2);
      const sqs = empties().filter(i => i >> 3 === r);
      sqs.forEach(x => used.add(x));
      if (sqs.length) effects.push(eff('rift', { squares: sqs }));
    }
    if (rand() < 0.25) {
      const c = empties().filter(i => rankOf(i) >= 2 && rankOf(i) <= 5 && !used.has(63 - i) && !s.pos.board[63 - i]);
      if (c.length) {
        const x = c[ri(c.length)];
        used.add(x);
        used.add(63 - x);
        effects.push(eff('portals', { squares: [x, 63 - x] }));
      }
    }
    if (rand() < 0.8) effects.push(eff(rand() < 0.5 ? 'ice_age' : CLIM[ri(CLIM.length)]));
    if (rand() < 0.3) {
      const c = CLIM[ri(CLIM.length)];
      effects.push(eff(c, { pending: true, delay: 1 + ri(2), remaining: CARDS[c].coups! }));
    }
    s.effects = effects;
    s.keys = [positionKey(s)];
    const them = opposite(s.pos.turn);
    if (inCheck(s.pos, them, modsFromEffects(effects)) || inCheck(s.pos, them, NO_MODS)) continue;
    if (inCheck(s.pos, s.pos.turn, NO_MODS) !== inCheck(s.pos, s.pos.turn, modsFromEffects(effects))) continue;
    if (evaluateEnd(s)) continue;
    return s;
  }
}

describe('parties au hasard agressives (cartes jouées dès que possible)', () => {
  it('130 parties Climats depuis la position initiale (graines 70 000+), mains tirées ou imposées', () => {
    const stats = new Map<string, number>();
    const pool = cardsOf('climats');
    for (let g = 0; g < 130; g++) {
      const seed = 70_000 + g;
      const rand = rng(seed);
      const hands = g % 3 === 0
        ? dealHands(true, g % 6 === 0, rand, 'climats')
        : { w: Array.from({ length: 3 }, () => pool[Math.floor(rand() * pool.length)]), b: Array.from({ length: 3 }, () => pool[Math.floor(rand() * pool.length)]) };
      aggressive(createGame(hands, g % 4 !== 0, 'climats'), rand, 240, true, `partie ${seed}`, stats);
    }
    for (const id of cardsOf('climats')) expect(stats.get(id) ?? 0, id).toBeGreaterThan(25);
    for (const k of ['explosion', 'passage', 'promotion']) expect(stats.get(k) ?? 0, k).toBeGreaterThan(10);
  }, 120_000);

  it('300 positions clairsemées couvertes de Murs, Failles, Portails et Climats (graines 31 000+)', () => {
    const stats = new Map<string, number>();
    for (let g = 0; g < 300; g++) {
      const seed = 31_000 + g;
      const rand = rng(seed);
      aggressive(crowdedTerrain(rand), rand, 100, false, `position ${seed}`, stats);
    }
    expect(stats.get('relaxed') ?? 0).toBeGreaterThan(0);
    expect((stats.get('fin:checkmate') ?? 0) + (stats.get('fin:stalemate') ?? 0)).toBeGreaterThan(10);
  }, 120_000);
});
