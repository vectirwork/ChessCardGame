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
  it('Murs et Faille se cumulent, jamais sur une même case', () => {
    let s = createGame({ w: ['ice_wall', 'truce'], b: ['rift', 'ice_wall'] }, false, 'climats');
    s = card(s, 0, 'c4'); // Mur de glace en c4
    s = mv(s, 'e2', 'e3');
    s = card(s, 0, 'a4'); // Faille sur la 4e rangée : le Mur n'en fait pas partie
    const rift = s.effects.find(e => e.card === 'rift')!;
    expect(rift.squares!.map(sqName).sort()).toEqual(['a4', 'b4', 'd4', 'e4', 'f4', 'g4', 'h4']);
    s = mv(s, 'e7', 'e6');
    s = mv(s, 'g1', 'f3');
    // Mur noir : ni sur la Faille, ni sur le Mur, ni hors des rangées 3 à 6
    const walls = cardOptions(s, 'b', 1).map(sqName);
    for (const x of ['c4', 'd4', 'h4', 'e7', 'a2', 'h1']) expect(walls).not.toContain(x);
    expect(walls).toContain('d3');
    s = card(s, 1, 'd3');
    expect(s.effects.map(e => e.card).sort()).toEqual(['ice_wall', 'ice_wall', 'rift']);
    const blocked = modsFromEffects(s.effects).blocked;
    expect(['c4', 'd3', 'a4', 'h4', 'c3'].map(x => blocked[q(x)])).toEqual([true, true, true, true, false]);
    // La Faille se referme, les Murs restent.
    for (const [a, b] of [['e8', 'e7'], ['f3', 'g1'], ['e7', 'e8'], ['g1', 'f3']]) s = mv(s, a, b);
    expect(s.effects.map(e => e.card)).toEqual(['ice_wall', 'ice_wall']);
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

describe('Sablier fou', () => {
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

describe('Mains visibles', () => {
  it('les deux mains sont publiques et exactes, cartes jouées comprises ; aucun instantané hors Duel', () => {
    let s = createGame({ w: ['truce', 'ice_wall', 'tide'], b: ['blood_moon', 'rift', 'blast'] }, true, 'climats');
    const check = (st: GameState) => {
      const view = viewState(st);
      expect(view.hands).toEqual(st.hands);
      expect(view.hands.w.map(h => h.card)).toEqual(['truce', 'ice_wall', 'tide']);
      expect(view.hands.b.map(h => h.card)).toEqual(['blood_moon', 'rift', 'blast']);
      expect(view.effects).toEqual(st.effects);
      expect(view.snaps).toEqual([]);
      expect(view.keys).toEqual([]);
    };
    check(s);
    s = mv(s, 'e2', 'e4');
    s = card(s, 1, 'a5'); // Faille noire
    s = mv(s, 'e7', 'e6');
    check(s);
    s = card(s, 0); // Trêve annoncée
    expect(s.hands.w[0]).toEqual({ card: 'truce', used: true });
    check(s);
    s = mv(s, 'g1', 'f3');
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
  it('Duel : le camp au trait voit l’échec à la fonte d’un Mur (R5)', () => {
    // Mur noir en e4 entre la tour noire e8 et le roi blanc e1 ; il fond après le 3e coup blanc.
    let s = createGameFromFen('k3r3/8/8/8/8/8/8/4K3 b - - 0 1', { w: [], b: ['ice_wall'] }, true, 'duel');
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
  it('8 Pouvoirs, 11 cartes Duel, le Mur de glace dans les deux ; Pouvoirs et Sans cartes proposés', () => {
    expect(cardsOf('climats')).toEqual(['hourglass', 'truce', 'blood_moon', 'ice_age', 'blast', 'ice_wall', 'rift', 'tide']);
    expect(cardsOf('duel')).toHaveLength(11);
    expect(cardsOf('aucune')).toEqual([]);
    expect(CARDS.ice_wall.catalogs.slice().sort()).toEqual(['climats', 'duel']);
    expect(CATALOGS.map(c => c.id)).toEqual(['climats', 'aucune']);
    expect(CATALOGS[0].label).toBe('Pouvoirs');
    expect([offeredCatalog('duel'), offeredCatalog('aucune'), offeredCatalog(undefined), offeredCatalog('x')])
      .toEqual(['climats', 'aucune', 'climats', 'climats']);
  });

  it('le Mur de glace est permanent dans les Pouvoirs, et fond après 3 coups adverses dans le Duel', () => {
    const plies = [['e8', 'd8'], ['e1', 'e2'], ['d8', 'e8'], ['e2', 'e1'], ['e8', 'd8'], ['e1', 'e2']];
    let duel = createGameFromFen('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', { w: [], b: ['ice_wall'] }, true, 'duel');
    duel = card(duel, 0, 'a4');
    expect(duel.effects[0]).toMatchObject({ remaining: 3, countsOn: 'w' });
    for (const [a, b] of plies.slice(0, 5)) duel = mv(duel, a, b);
    expect(duel.effects).toHaveLength(1);
    duel = mv(duel, 'e1', 'e2');
    expect(duel.effects).toHaveLength(0);
    let s = game('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', [], ['ice_wall']);
    s = card(s, 0, 'a4');
    expect(s.effects[0]).toMatchObject({ card: 'ice_wall', square: q('a4'), permanent: true, global: true, remaining: 0 });
    const walk = ['e8f8', 'e1f1', 'f8g8', 'f1g1', 'g8h8', 'g1h1', 'h8h7', 'h1h2', 'h7g7', 'h2g2', 'g7f7', 'g2f2'];
    for (const x of walk) s = mv(s, x.slice(0, 2), x.slice(2));
    expect(s.effects).toHaveLength(1);
    expect(names(s, 'a1')).not.toContain('a4');
  });

  it('Pouvoirs : un Mur se pose sur une case vide des rangées 3 à 6 ; Duel : sur n’importe quelle case vide', () => {
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    const opts = cardOptions(game(fen, ['ice_wall']), 'w', 0);
    expect(opts).toHaveLength(32);
    expect(opts.every(i => i >> 3 >= 2 && i >> 3 <= 5)).toBe(true);
    expect(cardOptions(createGameFromFen(fen, { w: ['ice_wall'], b: [] }, true, 'duel'), 'w', 0)).toHaveLength(62);
    expect(refused(game(fen, ['ice_wall']), 0, 'e2')).toBe('Cible invalide.');
    expect(refused(game('4k3/8/8/8/8/2n5/8/4K3 w - - 0 1', ['ice_wall']), 0, 'c3')).toBe('Cible invalide.');
  });
});

describe('Murs permanents : roque, prise en passant, promotion, pat, échec, répétition', () => {
  it('un Mur qui coupe la diagonale d’un fou adverse rend le petit roque possible, pour toute la partie', () => {
    const fen = 'r3k3/8/b7/8/8/8/P7/4K2R w K - 0 1';
    expect(names(game(fen), 'e1')).not.toContain('g1');
    let s = wall(game(fen), 'c4');
    for (const [a, b] of [['a2', 'a3'], ['a8', 'a7'], ['a3', 'a4'], ['a7', 'a8']]) s = mv(s, a, b);
    const castle = legalMovesOf(s).find(m => m.from === q('e1') && m.to === q('g1'));
    expect(castle && castle.flags & F_CASTLE_K).toBeTruthy();
  });

  it('un Mur sur la case de prise en passant l’interdit ; le pion bloqué par un Mur prend en diagonale et promeut', () => {
    let s = createGame({ w: [], b: ['ice_wall'] }, false, 'climats');
    for (const [a, b] of [['d2', 'd4'], ['e7', 'e5'], ['d4', 'd5'], ['c7', 'c5']]) s = mv(s, a, b);
    expect(names(s, 'd5')).toContain('c6'); // prise en passant possible
    const t = createGameFromFen('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', { w: [], b: ['ice_wall'] }, true, 'climats');
    const u = card(mv(t, 'e2', 'e4'), 0, 'e3'); // Mur noir sur la case de prise en passant
    expect(u.pos.ep).toBe(q('e3'));
    expect(names(u, 'd4')).toEqual(['d3']);
    // Les Murs ne touchent jamais la 7e ni la 8e rangée : la case de promotion reste libre.
    const blocked = wall(game('4k3/8/3n4/4P3/8/8/8/4K3 w - - 0 1'), 'e6');
    expect(names(blocked, 'e5')).toEqual(['d6']);
    const promo = wall(game('2r1k3/1P6/8/8/8/8/8/4K3 w - - 0 1'), 'b6');
    expect(legalMovesOf(promo).filter(m => m.from === q('b7')).map(m => sqName(m.to) + m.promo).sort())
      .toEqual(['b8b', 'b8n', 'b8q', 'b8r', 'c8b', 'c8n', 'c8q', 'c8r']);
  });

  it('un roi muré sans être en échec joue par la magie cède (pas de pat) ; le Mur où il s’arrête disparaît', () => {
    // Ra5 : a4 et a6 murés, b4, b5, b6 tenues par le roi c5.
    const s = wall(wall(game('8/8/8/k1K5/8/8/8/7R b - - 0 1', [], [], false), 'a4', 'w'), 'a6', 'w');
    expect(all(s)).toEqual(['a5a4', 'a5a6']);
    expect(legalMovesOf(s).every(m => m.flags & F_RELAXED)).toBe(true);
    expect(evaluateEnd(s)).toBeNull();
    const n = mv(s, 'a5', 'a6');
    expect(n.effects.map(e => sqName(e.square!))).toEqual(['a4']);
    // Un vrai pat reste un pat (aucun coup, même sans les Murs).
    const pat = wall(game('k7/8/1Q6/8/8/8/8/7K b - - 0 1'), 'c4');
    expect(evaluateEnd(pat)).toEqual({ winner: null, reason: 'stalemate' });
  });

  it('un Mur coupe un échec ; le roi ne peut pas s’y poser', () => {
    expect(sideInCheck(wall(game('k7/8/8/8/8/8/8/R3K3 b - - 0 1'), 'a4'))).toBe(false);
    expect(sideInCheck(game('k7/8/8/8/8/8/8/R3K3 b - - 0 1'))).toBe(true);
    expect(names(wall(game('8/8/8/8/3K4/8/8/k7 w - - 0 1'), 'd5'), 'd4')).not.toContain('d5');
  });

  it('avec des Murs permanents, la triple répétition se compte normalement', () => {
    let s = wall(game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), 'c5');
    const key = positionKey(s);
    s.keys = [key];
    for (let k = 0; k < 2; k++) for (const [a, b] of [['a1', 'a2'], ['e8', 'd8'], ['a2', 'a1'], ['d8', 'e8']]) s = mv(s, a, b);
    expect(positionKey(s)).toBe(key);
    expect(s.result).toEqual({ winner: null, reason: 'repetition' });
  });
});

// Corrections après la vérification adverse (test/climats-adverse.test.ts, docs/progres/verif-climats-*.md).
describe('Présage : R4b à l’arrivée', () => {
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

describe('Échec à la fermeture, à la fonte : la cause', () => {
  it('l’échec vient de la Faille qui se ferme, même si un Mur sans rapport (ancienne partie) fond en même temps', () => {
    const rank4 = ['a4', 'b4', 'c4', 'd4', 'f4', 'g4', 'h4'].map(q);
    let s = withEffect(game('4r2k/8/8/8/4P3/8/8/4K3 w - - 0 1'), 'rift', { squares: rank4, remaining: 1 });
    s = withEffect(s, 'ice_wall', { square: q('a6'), remaining: 1 });
    expect(sideInCheck(s)).toBe(false); // la tour e8 est arrêtée par le pion e4
    const t = withEffect(withEffect(game('4r2k/8/8/8/8/8/P7/4K3 w - - 0 1'), 'rift', { squares: [...rank4, q('e4')], remaining: 1 }), 'ice_wall', { square: q('a6'), remaining: 1 });
    expect(sideInCheck(t)).toBe(true);
    expect(checkKind(t)).toBe('close');
  });
});

describe('Matériel insuffisant avec des cartes', () => {
  it('un seul Mur ne suffit jamais à une pièce mineure ; deux Murs bien placés, si', () => {
    // Un seul Mur de glace (en main) : Roi et Fou contre Roi reste nul.
    const one = game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', ['ice_wall']);
    expect(evaluateEnd(one)).toEqual({ winner: null, reason: 'insufficient' });
    expect(canStillMate(one, 'w')).toBe(false);
    // Un Mur dans chaque main (un mat aidé compte) : pas de nulle.
    const two = game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', ['ice_wall'], ['ice_wall']);
    expect(evaluateEnd(two)).toBeNull();
    expect(canStillMate(two, 'w')).toBe(true);
    expect(canStillMate(two, 'b')).toBe(false);
    // Mur posé en a3, un Mur en main : Mur a5, puis Fd1# contre Ra4 (Rc4 tient b3, b4, b5).
    const s = wall(game('8/8/8/8/k1K5/5B2/8/8 w - - 0 1', ['ice_wall']), 'a3', 'w');
    expect(evaluateEnd(s)).toBeNull();
    const walled = card(s, 0, 'a5');
    expect(walled.result).toBeNull();
    expect(mv(walled, 'f3', 'd1').result).toEqual({ winner: 'w', reason: 'checkmate' });
    // Le dernier Mur posé ailleurs : plus aucun mat possible, nulle aussitôt.
    expect(card(s, 0, 'd5').result).toEqual({ winner: null, reason: 'insufficient' });
    // Un Mur posé loin du bord et un Mur en main : aucune paire possible.
    expect(evaluateEnd(wall(game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', ['ice_wall']), 'd4'))).toEqual({ winner: null, reason: 'insufficient' });
  });

  it('une Faille tient lieu d’un Mur, jamais seule ; Roi et Cavalier aussi', () => {
    const rift = game('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', ['rift']);
    expect(evaluateEnd(rift)).toEqual({ winner: null, reason: 'insufficient' });
    expect(canStillMate(rift, 'w')).toBe(false);
    const both = game('7k/8/6K1/4N3/8/8/8/8 w - - 0 1', ['rift'], ['ice_wall']);
    expect(evaluateEnd(both)).toBeNull();
    expect(canStillMate(both, 'w')).toBe(true);
    // Faille de la 5e rangée et Mur a3 : Cb2# contre Ra4 (Rc4 tient b3, b4, b5 ; a5 est dans le gouffre).
    const rank5 = [0, 1, 2, 3, 4, 5, 6, 7].map(f => 32 + f);
    const m = wall(withEffect(game('8/8/8/8/k1K5/8/8/3N4 w - - 0 1'), 'rift', { squares: rank5, remaining: 4 }, 'w'), 'a3', 'w');
    expect(evaluateEnd(m)).toBeNull();
    expect(mv(m, 'd1', 'b2').result).toEqual({ winner: 'w', reason: 'checkmate' });
  });

  it('Duel (anciennes parties) : un Mur de glace en main suffit (Mur g8, puis Fd4#)', () => {
    const s = createGameFromFen('7k/8/6K1/8/8/4B3/8/8 w - - 0 1', { w: ['ice_wall'], b: [] }, true, 'duel');
    expect(evaluateEnd(s)).toBeNull();
    expect(canStillMate(s, 'w')).toBe(true);
    expect(mv(card(s, 0, 'g8'), 'e3', 'd4').result).toEqual({ winner: 'w', reason: 'checkmate' });
  });
});
