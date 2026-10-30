// Catalogue Pouvoirs (identifiant 'climats' ; concepts/CARTES-GLOBALES.md et décision du fondateur du
// 30 octobre dans docs/PLAN-ODYSSEE.md) : Présage, Rituel, « la magie cède », mains visibles, et les 8 cartes.
// Les positions citées par les relectures du document servent de tests de non-régression (section 4.6).
import { describe, expect, it } from 'vitest';
import { CARDS, CATALOGS, CardId, cardsOf, offeredCatalog } from '../src/shared/cards';
import {
  Color, F_BLAST, F_CASTLE_K, F_RELAXED, inCheck, legalMoves, sqIndex as q, sqName,
} from '../src/shared/chess';
import {
  Effect, GameState, canStillMate, cardOptions, cardPlayable, checkKind, clockRate, createGame, createGameFromFen,
  evaluateEnd, incrementSuspended, legalMovesOf, modsFromEffects, playCard, playMove, positionKey, sideInCheck,
  viewState,
} from '../src/shared/game';

const game = (fen: string, w: CardId[] = [], b: CardId[] = [], timed = true) => createGameFromFen(fen, { w, b }, timed, 'climats');
const names = (s: GameState, from: string) => legalMovesOf(s).filter(m => m.from === q(from)).map(m => sqName(m.to)).sort();
const all = (s: GameState) => legalMovesOf(s).map(m => sqName(m.from) + sqName(m.to)).sort();

function mv(s: GameState, from: string, to: string, promo?: 'q' | 'r' | 'b' | 'n'): GameState {
  const r = playMove(s, q(from), q(to), promo);
  if (!r.ok) throw new Error(`${from}-${to} : ${r.error}`);
  return r.state;
}
function card(s: GameState, idx: number, ...targets: string[]): GameState {
  const r = playCard(s, s.pos.turn, idx, targets.map(q), 'skin:arcane');
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
function refused(s: GameState, idx: number, ...targets: string[]): string {
  const r = playCard(s, s.pos.turn, idx, targets.map(q), '');
  if (r.ok) throw new Error('carte acceptée à tort');
  return r.error;
}
/** Ajoute un effet déjà arrivé (positions de test). */
function withEffect(s: GameState, cardId: CardId, extra: Partial<Effect> = {}, caster: Color = 'b'): GameState {
  const coups = CARDS[cardId].coups ?? 4;
  const e: Effect = { id: 900 + s.effects.length, card: cardId, caster, countsOn: caster, remaining: coups, total: coups, skin: '', global: true, ...extra };
  return { ...s, effects: [...s.effects, e] };
}
/** Mur de glace permanent déjà posé. */
const wall = (s: GameState, square: string, caster: Color = 'b') =>
  withEffect(s, 'ice_wall', { square: q(square), permanent: true, remaining: 0, total: 0 }, caster);
const live = (s: GameState) => s.effects.filter(e => !e.pending).map(e => e.card);
const pawnMoves = (s: GameState) => legalMovesOf(s).filter(m => s.pos.board[m.from]?.t === 'p');

describe('Présage', () => {
  it("un Climat annoncé n'agit ni sur le coup du lanceur ni sur la réponse, puis arrive au tour suivant", () => {
    let s = createGame({ w: ['ice_age'], b: [] }, false, 'climats');
    s = card(s, 0);
    expect(s.effects[0]).toMatchObject({ card: 'ice_age', pending: true, delay: 2 });
    expect(pawnMoves(s).length).toBe(16);
    s = mv(s, 'e2', 'e4');
    expect(s.effects[0]).toMatchObject({ pending: true, delay: 1 });
    expect(pawnMoves(s).length).toBeGreaterThan(0);
    s = mv(s, 'e7', 'e5');
    expect(s.effects[0].pending).toBeUndefined();
    expect(s.effects[0].remaining).toBe(4);
    expect(pawnMoves(s)).toEqual([]);
    // 4 coups (2 chacun), puis le dégel : le lanceur joue le premier coup de pion
    s = mv(s, 'g1', 'f3');
    s = mv(s, 'g8', 'f6');
    s = mv(s, 'b1', 'c3');
    expect(live(s)).toEqual(['ice_age']);
    expect(pawnMoves(s)).toEqual([]);
    s = mv(s, 'b8', 'c6');
    expect(s.effects).toEqual([]);
    expect(pawnMoves(s).length).toBeGreaterThan(0);
  });

  it('il remplace le Climat actif à son arrivée, sans attendre la fin de son compte', () => {
    let s = createGame({ w: ['ice_age'], b: ['truce'] }, false, 'climats');
    s = card(s, 0);
    s = mv(s, 'g1', 'f3');
    s = mv(s, 'g8', 'f6'); // l'Ère glaciaire arrive (4 coups)
    s = mv(s, 'b1', 'c3');
    s = card(s, 0); // les Noirs annoncent la Trêve
    s = mv(s, 'b8', 'c6');
    expect(live(s)).toEqual(['ice_age']); // l'ancien Climat s'applique encore
    expect(pawnMoves(s)).toEqual([]);
    s = mv(s, 'f3', 'g5'); // la Trêve arrive et chasse l'Ère glaciaire (qui avait encore 1 coup)
    expect(s.effects.map(e => e.card)).toEqual(['truce']);
    expect(pawnMoves(s).length).toBeGreaterThan(0);
  });

  it('un second Climat annoncé est refusé ; un Terrain se cumule', () => {
    let s = createGame({ w: ['truce'], b: ['ice_age', 'ice_wall'] }, false, 'climats');
    s = card(s, 0);
    s = mv(s, 'e2', 'e4');
    expect(refused(s, 0)).toBe('Un Climat est déjà annoncé.');
    expect(cardPlayable(s, 'b', 0)).toBe(false);
    expect(cardPlayable(s, 'b', 1)).toBe(true);
  });

  it('aucun Climat ne change les attaques : son arrivée ne met jamais un roi en échec', () => {
    // Dame blanche d6 face au roi e8 masquée par le fou e7 : chaque Climat arrive, aucun échec n'apparaît.
    for (const id of ['truce', 'blood_moon', 'ice_age', 'blast'] as CardId[]) {
      let s = game('4k3/4b3/3Q4/8/8/8/P7/4K3 w - - 0 1', [id]);
      s = card(s, 0);
      s = mv(s, 'a2', 'a3');
      expect(sideInCheck(s), id).toBe(false);
      s = mv(s, 'e8', 'f8');
      expect(live(s), id).toEqual([id]);
      expect(sideInCheck(s, 'b'), id).toBe(false);
    }
  });
});

describe('Durées', () => {
  it('Trêve et Lune de sang durent 3 coups, les autres Climats un nombre pair', () => {
    expect(CARDS.truce.coups).toBe(3);
    expect(CARDS.blood_moon.coups).toBe(3);
    for (const id of ['hourglass', 'ice_age', 'blast'] as CardId[]) expect(CARDS[id].coups! % 2).toBe(0);
  });

  it("sous la Trêve, l'adversaire reprend les captures le premier", () => {
    let s = createGame({ w: ['truce'], b: [] }, false, 'climats');
    s = card(s, 0);
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'd7', 'd5'); // arrivée : 3 coups (Blancs, Noirs, Blancs)
    expect(names(s, 'e4')).toEqual(['e5']); // exd5 interdit
    s = mv(s, 'g1', 'f3');
    expect(names(s, 'd5')).toEqual(['d4']); // dxe4 interdit
    s = mv(s, 'b8', 'c6');
    expect(names(s, 'e4')).toEqual(['e5']);
    s = mv(s, 'f1', 'b5');
    expect(s.effects).toEqual([]);
    expect(names(s, 'd5')).toContain('e4'); // les Noirs reprennent les premiers
  });
});

describe('La magie cède (R6)', () => {
  it('Ère glaciaire : Rh1, g2, h2 contre Ce2 jouent g3, g4, h3 ou h4', () => {
    const s = withEffect(game('7k/8/8/8/8/8/4n1PP/7K w - - 0 1'), 'ice_age');
    const moves = legalMovesOf(s);
    expect(moves.map(m => sqName(m.from) + sqName(m.to)).sort()).toEqual(['g2g3', 'g2g4', 'h2h3', 'h2h4']);
    expect(moves.every(m => m.flags & F_RELAXED)).toBe(true);
    expect(evaluateEnd(s)).toBeNull();
    const n = mv(s, 'g2', 'g4');
    expect(live(n)).toEqual(['ice_age']); // l'effet reprend pour tout le monde
  });

  it('Rf7 et Ce5 contre Rh8 et h7 : les Noirs jouent h6 ou h5 au lieu de passer', () => {
    const s = withEffect(game('7k/5K1p/8/4N3/8/8/8/8 b - - 0 1'), 'ice_age');
    expect(all(s)).toEqual(['h7h5', 'h7h6']);
  });

  it('un vrai pat reste un pat', () => {
    const s = withEffect(game('k7/8/1Q6/8/8/8/8/7K b - - 0 1'), 'ice_age');
    expect(legalMovesOf(s)).toEqual([]);
    expect(evaluateEnd(s)).toEqual({ winner: null, reason: 'stalemate' });
  });

  it('un mat aidé par un Mur reste un mat', () => {
    // Rh4 entre ses pions g4 et g5 : sans Mur, Th1+ Rg3 ; avec le Mur en g3, Th1 est mat.
    const s = game('8/8/8/6p1/6pk/8/4K3/R7 w - - 0 1', ['ice_wall']);
    expect(mv(s, 'a1', 'h1').result).toBeNull();
    const n = mv(card(s, 0, 'g3'), 'a1', 'h1');
    expect(n.result).toEqual({ winner: 'w', reason: 'checkmate' });
  });

  it('R4b : le lanceur ne peut pas se bloquer lui-même (sauf s’il l’était déjà)', () => {
    // Rh3 : g2, g3, g4 tenues par la tour g8, h2 par le cavalier f1 ; seul Rh4 est jouable.
    const fen = '6r1/8/8/8/8/7K/8/k4n2 w - - 0 1';
    const s = game(fen, ['ice_wall']);
    expect(all(s)).toEqual(['h3h4']);
    expect(refused(s, 0, 'h4')).toBe('Cette carte te laisserait sans aucun coup.');
    expect(cardOptions(s, 'w', 0).map(sqName)).not.toContain('h4');
    // Déjà bloqué par un Mur adverse : il peut jouer une carte (et jouera ensuite Rh4, la magie cède)
    const t = wall(game(fen, ['ice_wall']), 'h4');
    expect(all(t)).toEqual(['h3h4']);
    const n = card(t, 0, 'a5');
    const r = playMove(n, q('h3'), q('h4'));
    expect(r.ok && r.info.move.flags & F_RELAXED).toBeTruthy();
    // Le Mur (permanent) de la case où le roi s'est arrêté disparaît ; l'autre reste.
    if (r.ok) expect(r.state.effects.map(e => sqName(e.square!))).toEqual(['a5']);
  });

  it('la Faille reçoit un pont sous une pièce qui s’y arrête par la magie', () => {
    // Roi a1 enfermé par le fou d3 et la tour h2 ; seul le pion a3 bougerait, mais a4 est dans le gouffre.
    const rank4 = [0, 1, 2, 3, 4, 5, 6, 7].map(f => 24 + f);
    const s = withEffect(game('7k/8/8/8/8/P2b4/7r/K7 w - - 0 1'), 'rift', { squares: rank4, remaining: 3 });
    expect(all(s)).toEqual(['a3a4']);
    const r = playMove(s, q('a3'), q('a4'));
    if (!r.ok) throw new Error(r.error);
    expect(r.info.move.flags & F_RELAXED).toBeTruthy();
    expect(r.state.effects[0].squares).toEqual(rank4.slice(1));
  });
});

describe('Lune de sang', () => {
  const moon = (s: GameState) => withEffect(s, 'blood_moon', { remaining: 3 });

  it('qui peut prendre doit prendre, en choisissant sa capture', () => {
    const s = moon(game('4k3/p7/8/3p4/3Q4/8/8/4K3 w - - 0 1'));
    expect(all(s)).toEqual(['d4a7', 'd4d5']);
  });

  it('la prise en passant est obligatoire si c’est la seule ; pas de roque tant qu’une capture existe', () => {
    expect(all(moon(game('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1')))).toEqual(['e5d6']);
    expect(all(moon(game('4k3/8/8/8/8/8/p7/R3K2R w KQ - 0 1')))).toEqual(['a1a2']);
  });

  it('position de la relecture : après 1.Fd5 h6 et l’arrivée de la Lune, seul Fxf7+ est jouable', () => {
    let s = game('2br2k1/p4ppp/1p6/8/8/5B2/PP3PPP/4R1K1 w - - 0 1', ['blood_moon']);
    s = card(s, 0);
    s = mv(s, 'f3', 'd5');
    expect(names(s, 'd8')).toContain('d5'); // les Noirs ne sont pas obligés de prendre l'appât
    s = mv(s, 'h7', 'h6');
    expect(live(s)).toEqual(['blood_moon']);
    expect(all(s)).toEqual(['d5f7']);
    s = mv(s, 'd5', 'f7');
    expect(s.log[s.log.length - 1]).toMatchObject({ san: 'Bxf7+' });
  });
});


describe('Faille', () => {
  it('rangées 4 et 5 seulement ; depuis la position initiale, 12 et 20 coups', () => {
    const s = createGame({ w: ['rift'], b: [] }, false, 'climats');
    const opts = cardOptions(s, 'w', 0);
    expect(opts.length).toBe(16);
    expect(opts.every(t => t >> 3 === 3 || t >> 3 === 4)).toBe(true);
    let a = card(s, 0, 'a4');
    expect(a.effects[0].squares).toHaveLength(8);
    expect(legalMovesOf(a)).toHaveLength(12); // double pas blanc coupé ; les cavaliers sautent
    a = mv(a, 'g1', 'f3');
    expect(legalMovesOf(a)).toHaveLength(20);
    let b = card(s, 0, 'h5');
    expect(legalMovesOf(b)).toHaveLength(20);
    b = mv(b, 'g1', 'f3');
    expect(legalMovesOf(b)).toHaveLength(12);
  });

  it('les cases occupées restent des îlots ; une seule Faille ; 4 coups', () => {
    let s = createGame({ w: [], b: ['rift', 'rift'] }, false, 'climats');
    s = mv(s, 'e2', 'e4');
    s = card(s, 0, 'a4');
    expect(s.effects[0].squares).toHaveLength(7);
    expect(s.effects[0].squares).not.toContain(q('e4'));
    const blocked = modsFromEffects(s.effects).blocked;
    expect([blocked[q('e4')], blocked[q('d4')]]).toEqual([false, true]);
    s = mv(s, 'e7', 'e5');
    expect(names(s, 'f1')).toEqual(['d3', 'e2']); // la diagonale f1-a6 est coupée en c4
    s = mv(s, 'g1', 'f3');
    expect(cardOptions(s, 'b', 1)).toEqual([]); // une seule Faille à la fois
    s = mv(s, 'g8', 'f6');
    expect(s.effects).toHaveLength(1);
    s = mv(s, 'f3', 'e5');
    expect(s.effects).toEqual([]); // fermée après le 2e coup adverse
  });
});

describe('Cumul des Terrains', () => {
  it('Mur, Faille et Portails se cumulent, jamais sur une même case', () => {
    let s = createGame({ w: ['ice_wall', 'portals'], b: ['rift', 'ice_wall'] }, false, 'climats');
    s = card(s, 0, 'c4'); // Mur de glace en c4
    s = mv(s, 'e2', 'e3');
    s = card(s, 0, 'a4'); // Faille sur la 4e rangée : le Mur n'en fait pas partie
    const rift = s.effects.find(e => e.card === 'rift')!;
    expect(rift.squares!.map(sqName).sort()).toEqual(['a4', 'b4', 'd4', 'e4', 'f4', 'g4', 'h4']);
    s = mv(s, 'e7', 'e6');
    // Portails : ni sur un Terrain, ni en face d'un Terrain (c4 ⇄ f5, b4 ⇄ g5)
    const portals = cardOptions(s, 'w', 1).map(sqName);
    for (const x of ['c4', 'f5', 'b4', 'g5', 'd4']) expect(portals).not.toContain(x);
    expect(portals).toContain('c3');
    s = card(s, 1, 'c3'); // c3 ⇄ f6, annoncés
    s = mv(s, 'g1', 'f3');
    // Mur noir : ni sur la Faille, ni sur le Mur, ni sur les Portails annoncés
    const walls = cardOptions(s, 'b', 1).map(sqName);
    for (const x of ['c3', 'f6', 'c4', 'd4', 'h4']) expect(walls).not.toContain(x);
    expect(walls).toContain('d3');
    s = card(s, 1, 'd3');
    expect(s.effects.map(e => e.card).sort()).toEqual(['ice_wall', 'ice_wall', 'portals', 'rift']);
    const blocked = modsFromEffects(s.effects).blocked;
    expect(['c4', 'd3', 'a4', 'h4', 'c3'].map(x => blocked[q(x)])).toEqual([true, true, true, true, false]);
  });
});

describe('Déflagration', () => {
  const blast = (s: GameState) => withEffect(s, 'blast');

  it('Rf1 contre Te2 et Dd3 : Rxe2 reste interdit (le roi capture sans explosion)', () => {
    const s = blast(game('6k1/8/8/8/8/3q4/4r3/5K2 w - - 0 1'));
    expect(names(s, 'f1')).toEqual(['g1']);
  });

  it('les voisines sautent, sauf les pions et les rois', () => {
    const s = blast(game('1k6/8/3b1n2/3pp3/5B2/5N2/8/6K1 w - - 0 1'));
    const r = playMove(s, q('f3'), q('e5'));
    if (!r.ok) throw new Error(r.error);
    const b = r.state.pos.board;
    for (const x of ['e5', 'd6', 'f6', 'f4', 'f3']) expect(b[q(x)]).toBeNull();
    expect(b[q('d5')]).toMatchObject({ t: 'p', c: 'b' });
    expect(r.info.san).toBe('Nxe5*');
    expect(r.info.blasted).toHaveLength(4);
    expect(r.state.captured.b.slice().sort()).toEqual(['b', 'n', 'p']);
    expect(r.state.captured.w.slice().sort()).toEqual(['b', 'n']);
  });

  it('une explosion qui exposerait son propre roi est refusée', () => {
    const fen = '1k4r1/8/8/8/8/5p2/3N2B1/6K1 w - - 0 1';
    expect(names(game(fen), 'd2')).toContain('f3');
    expect(names(blast(game(fen)), 'd2')).not.toContain('f3');
  });

  it('une tour détruite sur sa case perd son droit de roque', () => {
    const s = blast(game('4k3/8/8/8/8/4n3/6P1/4K2R b K - 0 1'));
    const n = mv(s, 'e3', 'g2');
    expect(n.pos.board[q('h1')]).toBeNull();
    expect(n.pos.castling & 1).toBe(0);
  });

  it('une capture vers la dernière rangée n’offre aucun choix de promotion', () => {
    const s = blast(game('2r1k3/1P6/8/8/8/8/8/4K3 w - - 0 1'));
    const caps = legalMovesOf(s).filter(m => m.to === q('c8'));
    expect(caps).toHaveLength(1);
    expect(caps[0].flags & F_BLAST).toBeTruthy();
    expect(caps[0].promo).toBeUndefined();
    const r = playMove(s, q('b7'), q('c8'));
    expect(r.ok && r.info.san).toBe('bxc8*');
  });
});

describe('Couronnement', () => {
  const crown = (s: GameState) => withEffect(s, 'coronation');

  it('un pion est promu dès sa 7e rangée, en poussant ou en prenant', () => {
    let s = crown(game('4k3/3n4/4P3/8/8/3p4/8/4K3 w - - 0 1'));
    const e7 = legalMovesOf(s).filter(m => m.from === q('e6'));
    expect(e7.filter(m => m.to === q('e7')).map(m => m.promo).sort()).toEqual(['b', 'n', 'q', 'r']);
    expect(e7.filter(m => m.to === q('d7')).every(m => m.flags & F_PROMO)).toBe(true);
    s = mv(s, 'e6', 'e7', 'n');
    expect(s.pos.board[q('e7')]).toMatchObject({ t: 'n', c: 'w' });
    expect(legalMovesOf(s).filter(m => m.from === q('d3') && m.to === q('d2'))).toHaveLength(4);
    // Sans Couronnement : un simple coup
    expect(legalMovesOf(game('4k3/3n4/4P3/8/8/8/8/4K3 w - - 0 1')).filter(m => m.from === q('e6') && m.to === q('e7'))).toHaveLength(1);
  });

  it('la prise en passant ne couronne jamais', () => {
    const s = crown(game('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'));
    const ep = legalMovesOf(s).filter(m => m.to === q('d6'));
    expect(ep).toHaveLength(1);
    expect(ep[0].promo).toBeUndefined();
  });
});

describe('Trêve', () => {
  const truce = (s: GameState) => withEffect(s, 'truce', { remaining: 3 });

  it('aucune capture hors échec', () => {
    const s = truce(game('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1'));
    expect(names(s, 'd1')).toEqual(['a1', 'b1', 'c1', 'd2', 'd3', 'd4']);
  });

  it('en échec, la capture de la pièce qui donne échec est permise', () => {
    const s = truce(game('4k3/8/8/8/8/5n2/8/3QK3 w - - 0 1'));
    expect(names(s, 'd1')).toContain('f3');
  });

  it('le compteur des 50 coups est figé', () => {
    const fen = '4k3/8/8/8/8/8/8/R3K3 w - - 7 1';
    expect(mv(truce(game(fen)), 'a1', 'a2').pos.halfmove).toBe(7);
    expect(mv(game(fen), 'a1', 'a2').pos.halfmove).toBe(8);
  });
});

describe('Ère glaciaire', () => {
  it('un roi ne peut pas se placer sur une case attaquée par un pion gelé', () => {
    const s = withEffect(game('4k3/8/3p4/8/4K3/8/8/8 w - - 0 1'), 'ice_age');
    expect(names(s, 'e4')).not.toContain('e5');
    expect(names(s, 'e4')).toContain('d5');
  });

  it('le remplacement par un autre Climat n’est jamais refusé ; la Marée est injouable', () => {
    const s = withEffect(game('4k3/8/3p4/8/8/8/4P3/4K3 w - - 0 1', ['truce', 'tide']), 'ice_age');
    expect(cardPlayable(s, 'w', 0)).toBe(true);
    expect(refused(s, 1)).toBe('Aucun pion ne peut avancer.');
  });
});

describe('Portails', () => {
  const open = (s: GameState) => withEffect(s, 'portals', { squares: [q('c3'), q('f6')], remaining: 6 });

  it('cases symétriques, refusées au contact d’un roi', () => {
    const s = game('8/8/8/8/3K4/8/8/k7 w - - 0 1', ['portals']);
    const opts = cardOptions(s, 'w', 0);
    expect(opts.length).toBeGreaterThan(0);
    const touches = (i: number) => Math.abs((i & 7) - 3) <= 1 && Math.abs((i >> 3) - 3) <= 1;
    expect(opts.some(i => touches(i) || touches(63 - i))).toBe(false);
    expect(opts.every(i => i >> 3 >= 2 && i >> 3 <= 5)).toBe(true);
    expect(card(s, 0, 'b3').effects[0].squares).toEqual([q('b3'), q('g6')]);
  });

  it('un cavalier, un fou, une tour ou une dame voyage ; un passage ne capture jamais', () => {
    const s = open(game('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1'));
    const via = legalMovesOf(s).find(m => m.from === q('b1') && m.to === q('f6'))!;
    expect(via.flags & F_PORTAL).toBeTruthy();
    expect(via.via).toBe(q('c3'));
    const r = playMove(s, q('b1'), q('f6'));
    expect(r.ok && r.info.san).toBe('Nc3→f6');
    expect(names(open(game('4k3/8/5p2/8/8/8/8/1N2K3 w - - 0 1')), 'b1')).not.toContain('f6');
  });

  it('un roi ou un pion s’y arrête sans voyager et ferme la paire', () => {
    let s = open(game('4k3/p7/8/8/8/8/3K4/1N6 w - - 0 1'));
    expect(names(s, 'd2')).toContain('c3');
    expect(names(s, 'd2')).not.toContain('f6');
    s = mv(s, 'd2', 'c3');
    s = mv(s, 'a7', 'a6');
    expect(names(s, 'b1')).not.toContain('f6');
    const p = open(game('4k3/8/8/8/8/8/2P5/1N2K3 w - - 0 1'));
    expect(names(p, 'c2')).toEqual(['c3', 'c4']);
  });

  it('une seule paire à la fois ; un passage peut parer un échec', () => {
    const s = open(game('8/8/K6r/8/8/8/8/1N4k1 w - - 0 1', ['portals']));
    expect(cardOptions(s, 'w', 0)).toEqual([]);
    expect(sideInCheck(s)).toBe(true);
    expect(names(s, 'b1')).toEqual(['f6']);
  });
});

describe('Grande Marée (Rituel)', () => {
  it('remplace le coup : le trait passe à l’adversaire', () => {
    const s = createGame({ w: ['tide'], b: [] }, false, 'climats');
    const r = playCard(s, 'w', 0, [], '');
    if (!r.ok) throw new Error(r.error);
    expect(r.info.ritual).toBe(true);
    expect(r.state.pos.turn).toBe('b');
    expect(r.state.ply).toBe(1);
    expect(r.state.cardPlayed).toBe(false);
    for (let f = 0; f < 8; f++) {
      expect(r.state.pos.board[16 + f]).toMatchObject({ t: 'p', c: 'w' });
      expect(r.state.pos.board[40 + f]).toMatchObject({ t: 'p', c: 'b' });
    }
    expect(r.info.moves).toHaveLength(16);
  });

  it('dans l’Écossaise citée, 6…Fxc3+ est légal après la marée', () => {
    let s = createGame({ w: ['tide'], b: [] }, false, 'climats');
    for (const [a, b] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['d2', 'd4'], ['e5', 'd4'], ['f3', 'd4'], ['g8', 'f6'], ['b1', 'c3'], ['f8', 'b4']]) s = mv(s, a, b);
    s = card(s, 0);
    expect(s.pos.board[q('a3')]).toMatchObject({ t: 'p', c: 'w' });
    expect(s.pos.board[q('e5')]).toMatchObject({ t: 'p', c: 'w' });
    expect(s.pos.board[q('c2')]).toMatchObject({ t: 'p', c: 'w' }); // bloqué par le cavalier c3
    const r = playMove(s, q('b4'), q('c3'));
    expect(r.ok && r.info.check).toBe(true);
  });

  it('refusée si elle met le roi adverse en échec', () => {
    const s = game('8/4k3/8/3P4/8/8/8/4K3 w - - 0 1', ['tide']);
    expect(refused(s, 0)).toBe('Une carte ne peut pas mettre le roi adverse en échec.');
  });

  it('déplacement simultané, conflit sur une même case, 6e et 7e rangées immobiles', () => {
    const s = card(game('4k3/4P3/3p4/8/3P4/4P3/P3P3/4K3 w - - 0 1', ['tide']), 0);
    const b = s.pos.board;
    expect(b[q('e2')]?.t).toBe('p'); // bloqué : e3 était occupée avant la marée
    expect(b[q('e4')]?.t).toBe('p');
    expect(b[q('d4')]?.t).toBe('p'); // d4 et d6 visaient d5 : aucun ne bouge
    expect(b[q('d6')]?.t).toBe('p');
    expect(b[q('a3')]?.t).toBe('p');
    expect(b[q('e7')]?.t).toBe('p'); // la marée ne couronne jamais
    expect(s.pos.halfmove).toBe(0);
  });
});

describe('Déjà-vu', () => {
  function line(w: CardId[], b: CardId[]) {
    let s = createGame({ w, b }, true, 'climats');
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'd7', 'd5');
    return s;
  }

  it('restaure position, prises et journal ; la même pièce est interdite', () => {
    let s = line(['deja_vu'], []);
    s = mv(s, 'e4', 'd5');
    s = mv(s, 'd8', 'd5');
    expect(s.captured).toEqual({ w: ['p'], b: ['p'] });
    const r = playCard(s, 'w', 0, [], '');
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(s.pos.board[q('e4')]).toMatchObject({ t: 'p', c: 'w' });
    expect(s.pos.board[q('d5')]).toMatchObject({ t: 'p', c: 'b' });
    expect(s.captured).toEqual({ w: [], b: [] });
    expect(s.ply).toBe(2);
    expect(s.pos.turn).toBe('w');
    expect(names(s, 'e4')).toEqual([]); // ni exd5 ni e5
    expect(legalMovesOf(s).length).toBeGreaterThan(0);
    expect(s.log.filter(e => e.k === 'move' && e.undone)).toHaveLength(2);
    expect(r.info.moves).toEqual([{ from: q('d5'), to: q('d8') }, { from: q('d5'), to: q('e4') }]);
    expect(playCard(s, 'w', 0, [], '').ok).toBe(false);
  });

  it('les cartes jouées par l’adversaire pendant le tour effacé lui sont rendues, face visible', () => {
    let s = line(['deja_vu'], ['ice_wall', 'blood_moon', 'tide']);
    s = mv(s, 'g1', 'f3');
    s = card(s, 0, 'a5');
    s = mv(s, 'c8', 'g4');
    s = card(s, 0);
    expect(s.hands.b[0]).toEqual({ card: 'ice_wall', used: false, revealed: true });
    expect(s.effects).toEqual([]);
    expect(s.log.find(e => e.k === 'card' && e.card === 'ice_wall')).toMatchObject({ undone: true });
    const seen = viewState(s, 'w', false).hands.b.map(h => h.card);
    expect(seen).toEqual(['ice_wall', null, null]);
  });

  it('un Rituel effacé reste dépensé (et aucune pièce n’est interdite)', () => {
    let s = line(['tide', 'deja_vu'], []);
    s = card(s, 0);
    s = mv(s, 'b8', 'd7');
    s = card(s, 1);
    expect(s.hands.w[0].used).toBe(true);
    expect(s.forbidden).toBeNull();
    expect(s.pos.board[q('a2')]?.t).toBe('p');
    expect(names(s, 'e4')).toEqual(['d5', 'e5']);
  });

  it('un mat peut être effacé', () => {
    let s = createGame({ w: [], b: ['deja_vu'] }, false, 'climats');
    for (const [a, b] of [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6']]) s = mv(s, a, b);
    s = mv(s, 'h5', 'f7');
    expect(legalMovesOf(s)).toEqual([]);
    expect(s.result).toBeNull(); // le Déjà-vu peut sauver
    s = card(s, 0);
    expect(s.pos.turn).toBe('b');
    expect(names(s, 'g8')).toEqual([]);
    expect(s.result).toBeNull();
  });

  it('sans pendule et contre l’IA, le Sablier fou ne se joue pas ; son effet accélère les deux pendules', () => {
    expect(cardPlayable(createGame({ w: ['hourglass'], b: [] }, false, 'climats'), 'w', 0)).toBe(false);
    let s = createGame({ w: ['hourglass'], b: [] }, true, 'climats');
    s = card(s, 0);
    expect(clockRate(s, 'w')).toBe(1);
    expect(incrementSuspended(s)).toBe(false);
    s = mv(s, 'e2', 'e4');
    s = mv(s, 'e7', 'e5');
    expect([clockRate(s, 'w'), clockRate(s, 'b')]).toEqual([2, 2]);
    expect(incrementSuspended(s)).toBe(true);
    for (const [a, b] of [['g1', 'f3'], ['g8', 'f6'], ['b1', 'c3'], ['b8', 'c6'], ['f1', 'c4']]) s = mv(s, a, b);
    expect(clockRate(s, 'b')).toBe(2);
    s = mv(s, 'f8', 'c5'); // 6e coup sous le Sablier
    expect(clockRate(s, 'w')).toBe(1);
  });
});

describe('Non-fuite des mains', () => {
  it('aucune vue ne contient une carte adverse non jouée (mains, instantanés, journal)', () => {
    let s = createGame({ w: ['truce', 'ice_wall', 'deja_vu'], b: ['blood_moon', 'rift', 'tide'] }, true, 'climats');
    const check = (st: GameState) => {
      for (const [you, hidden] of [['w', ['blood_moon', 'tide', 'rift']], ['b', ['truce', 'ice_wall', 'deja_vu']], [null, []]] as const) {
        const view = viewState(st, you, false);
        const json = JSON.stringify(view);
        const other = you ? opposite(you) : null;
        for (const id of hidden) {
          const h = st.hands[other!].find(x => x.card === id)!;
          if (!h.used && !h.revealed) expect(json.includes(`"${id}"`), `${id} visible pour ${you}`).toBe(false);
        }
        if (you === null) {
          for (const c of ['w', 'b'] as Color[]) for (const h of view.hands[c]) if (!h.used && !h.revealed) expect(h.card).toBeNull();
        }
        expect(view.snaps.every(sn => !('hands' in sn))).toBe(true);
      }
    };
    check(s);
    s = mv(s, 'e2', 'e4');
    check(s);
    s = card(s, 1, 'a5'); // Faille noire, jouée : publique
    s = mv(s, 'e7', 'e6');
    check(s);
    s = card(s, 0); // Trêve annoncée : publique
    check(s);
    s = mv(s, 'g1', 'f3');
    s = mv(s, 'b8', 'c6');
    s = card(s, 2); // Déjà-vu : la Faille noire n'a pas été rejouée pendant le tour effacé
    check(s);
  });
});

describe('Ère glaciaire et Trêve figent la nulle', () => {
  it('le compteur ne monte pas sous l’Ère glaciaire', () => {
    const s = withEffect(game('4k3/8/8/8/8/8/8/R3K3 w - - 9 1'), 'ice_age');
    expect(mv(s, 'a1', 'a2').pos.halfmove).toBe(9);
  });
});

describe('Garde-fous génériques', () => {
  it('le camp au trait voit l’échec à la fonte d’un Mur (R5)', () => {
    // Mur noir en e4 entre la tour noire e8 et le roi blanc e1 ; il fond après le 3e coup blanc.
    let s = game('k3r3/8/8/8/8/8/8/4K3 b - - 0 1', [], ['ice_wall']);
    s = card(s, 0, 'e4');
    for (const [a, b] of [['a8', 'b8'], ['e1', 'd1'], ['b8', 'a8'], ['d1', 'e1'], ['a8', 'b8']]) s = mv(s, a, b);
    expect(inCheck(s.pos, 'w', modsFromEffects(s.effects))).toBe(false);
    expect(sideInCheck(s)).toBe(true);
    expect(checkKind(s)).toBe('melt');
    expect(names(s, 'e1')).not.toContain('e2');
    expect(names(s, 'e1')).toContain('d2');
  });

  it('les perft restent ceux des échecs classiques sous un catalogue sans effet', () => {
    const s = createGame({ w: [], b: [] }, false, 'climats');
    expect(legalMoves(s.pos)).toHaveLength(20);
    expect(legalMovesOf(s)).toHaveLength(20);
  });
});

describe('Catalogues', () => {
  it('12 cartes Climats, 11 Duel, le Mur de glace dans les deux', () => {
    expect(cardsOf('climats')).toHaveLength(12);
    expect(cardsOf('duel')).toHaveLength(11);
    expect(cardsOf('aucune')).toEqual([]);
    expect(CARDS.ice_wall.catalogs.slice().sort()).toEqual(['climats', 'duel']);
  });

  it('le Mur de glace compte 3 coups adverses en Duel et 6 coups en Climats, la même durée', () => {
    for (const catalog of ['duel', 'climats'] as const) {
      let s = createGameFromFen('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', { w: [], b: ['ice_wall'] }, true, catalog);
      s = card(s, 0, 'a4');
      const plies = [['e8', 'd8'], ['e1', 'e2'], ['d8', 'e8'], ['e2', 'e1'], ['e8', 'd8']];
      for (const [a, b] of plies) s = mv(s, a, b);
      expect(s.effects).toHaveLength(1);
      s = mv(s, 'e1', 'e2');
      expect(s.effects).toHaveLength(0);
    }
  });
});

// Corrections après la vérification adverse (test/climats-adverse.test.ts, docs/progres/verif-climats-*.md).
describe('Présage : pas de pat par magie, R4b à l’arrivée', () => {
  it('une Chevauchée qui laisserait l’adversaire sans aucun coup à sa réponse est refusée', () => {
    // Noirs : Rh8 seul ; Rg8 est jouable aujourd'hui, mais à l'arrivée le fou h6 sautera en g8.
    const s = game('7k/R7/7B/8/8/8/8/2K5 w - - 0 1', ['cavalcade']);
    expect(refused(s, 0)).toBe('À son arrivée, cette carte laisserait l’adversaire sans aucun coup.');
    expect(cardPlayable(s, 'w', 0)).toBe(false);
    // Avec un pion libre, les Noirs gardent un coup : la carte est permise.
    const t = game('7k/R7/7B/p7/8/8/8/2K5 w - - 0 1', ['cavalcade']);
    expect(cardPlayable(t, 'w', 0)).toBe(true);
  });

  it('un camp réduit aux coups de pion ne peut pas annoncer l’Ère glaciaire', () => {
    // Ra1 enfermé (b1 tenu par le fou e4) : sans la règle, ses pions avanceraient ensuite par « la magie cède »
    // pendant que le pion h7 noir resterait gelé.
    const s = game('7k/7p/8/3P4/4b3/8/PP6/K7 w - - 0 1', ['ice_age']);
    expect(refused(s, 0)).toBe('À son arrivée, cette carte te laisserait sans aucun coup.');
  });

  it('un camp dont le seul coup est une prise ne peut pas annoncer la Trêve', () => {
    const s = game('7k/8/8/8/8/1ppb4/1P6/K7 w - - 0 1', ['truce']);
    expect(all(s)).toEqual(['b2c3']);
    expect(refused(s, 0)).toBe('À son arrivée, cette carte te laisserait sans aucun coup.');
    // Dans une position ordinaire, la Trêve et l'Ère glaciaire s'annoncent.
    const o = createGame({ w: ['truce', 'ice_age'], b: [] }, false, 'climats');
    expect(cardPlayable(o, 'w', 0)).toBe(true);
    expect(cardPlayable(o, 'w', 1)).toBe(true);
  });
});

describe('Grande Marée sous la Lune de sang', () => {
  it('refusée quand une capture est jouable (qui peut prendre doit prendre), permise sinon', () => {
    const s = withEffect(game('4k3/8/8/3p4/4P3/8/P7/4K3 w - - 0 1', ['tide']), 'blood_moon');
    expect(all(s)).toEqual(['e4d5']);
    expect(refused(s, 0)).toBe('La Lune de sang impose une capture.');
    const t = withEffect(game('4k3/8/8/8/4P3/8/P7/4K3 w - - 0 1', ['tide']), 'blood_moon');
    const r = playCard(t, 'w', 0, [], '');
    expect(r.ok).toBe(true);
  });
});

describe('Échec à l’arrivée, à la fonte : la cause', () => {
  it('l’échec vient du Mur qui fond, même si une Chevauchée sans rapport arrive en même temps', () => {
    let s = withEffect(game('4r2k/8/8/8/8/8/P7/4K3 w - - 0 1'), 'ice_wall', { square: q('e4'), remaining: 1 });
    s = withEffect(s, 'cavalcade', { pending: true, delay: 1, remaining: 4 }, 'b');
    expect(sideInCheck(s)).toBe(true);
    expect(checkKind(s)).toBe('melt');
  });
});

describe('Matériel insuffisant avec des cartes', () => {
  it('un Mur de glace en main ou posé rend le mat possible avec une pièce mineure', () => {
    const s = game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', ['ice_wall']);
    expect(evaluateEnd(s)).toBeNull();
    expect(canStillMate(s, 'w')).toBe(true);
    expect(canStillMate(s, 'b')).toBe(false);
    const walled = card(s, 0, 'g8');
    expect(walled.result).toBeNull();
    expect(mv(walled, 'e3', 'd4').result).toEqual({ winner: 'w', reason: 'checkmate' });
    // Cavalier : Mur g8, puis Cf7#.
    const n = game('7k/8/6K1/4N3/8/8/8/8 w - - 0 1', ['ice_wall']);
    expect(evaluateEnd(n)).toBeNull();
    expect(mv(card(n, 0, 'g8'), 'e5', 'f7').result).toEqual({ winner: 'w', reason: 'checkmate' });
    // Le Mur (adverse) fond, plus aucune carte : nulle.
    const m = withEffect(game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1'), 'ice_wall', { square: q('a8'), remaining: 1 });
    expect(evaluateEnd(m)).toBeNull();
    expect(mv(m, 'g6', 'f6').result).toEqual({ winner: null, reason: 'insufficient' });
  });

  it('la Faille et la Chevauchée ne suffisent pas (vérifié par force brute)', () => {
    // La Chevauchée dure 2 coups : la réponse des Noirs à Ff6+ est jugée après son expiration, Rg8 reste jouable.
    expect(evaluateEnd(game('7k/8/8/8/8/8/8/K4B2 w - - 0 1', ['cavalcade']))).toEqual({ winner: null, reason: 'insufficient' });
    const active = withEffect(game('7k/8/8/4B3/8/8/8/K7 w - - 0 1'), 'cavalcade', { remaining: 2 }, 'w');
    const checked = mv(active, 'e5', 'f6');
    expect(checked.result).toEqual({ winner: null, reason: 'insufficient' });
    expect(all({ ...checked, result: null })).toEqual(['h8g8', 'h8h7']);
    const rift = game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', ['rift']);
    expect(evaluateEnd(rift)).toEqual({ winner: null, reason: 'insufficient' });
    expect(canStillMate(rift, 'w')).toBe(false);
  });
});
