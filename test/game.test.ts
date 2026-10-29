import { describe, expect, it } from 'vitest';
import { sqIndex as q, sqName } from '../src/shared/chess';
import {
  cardOptions, cardPlayable, createGame, createGameFromFen, GameState, legalMovesOf, playCard, playMove,
} from '../src/shared/game';

const moves = (s: GameState, from: string) => legalMovesOf(s).filter(m => m.from === q(from)).map(m => sqName(m.to)).sort();
function mv(s: GameState, from: string, to: string): GameState {
  const r = playMove(s, q(from), q(to));
  if (!r.ok) throw new Error(`${from}-${to}: ${r.error}`);
  return r.state;
}
function card(s: GameState, idx: number, ...targets: string[]): GameState {
  const r = playCard(s, s.pos.turn, idx, targets.map(q), 'arcane');
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('cartes', () => {
  it('Mur de glace : bloque passage et arrivée, puis fond après 3 coups adverses', () => {
    let s = createGameFromFen('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', { w: ['ice_wall'], b: ['ice_wall'] });
    s = card(s, 0, 'a4');
    expect(s.effects).toHaveLength(1);
    // Le mur, posé par les noirs, arrête la tour blanche en a3
    s = mv(s, 'e8', 'd8');
    expect(moves(s, 'a1')).not.toContain('a4');
    expect(moves(s, 'a1')).not.toContain('a5');
    expect(moves(s, 'a1')).toContain('a3');
    s = mv(s, 'e1', 'e2'); // 1er coup blanc
    s = mv(s, 'd8', 'e8');
    s = mv(s, 'e2', 'e1'); // 2e
    s = mv(s, 'e8', 'd8');
    expect(s.effects).toHaveLength(1);
    s = mv(s, 'e1', 'e2'); // 3e : le mur fond
    expect(s.effects).toHaveLength(0);
  });

  it('Cryogénie : la pièce gelée ne bouge plus et ne donne plus échec', () => {
    let s = createGameFromFen('3qk3/8/8/8/8/8/8/4K3 w - - 0 1', { w: ['freeze'], b: [] });
    s = card(s, 0, 'd8');
    // Le roi blanc peut désormais aller sur la colonne d de la dame gelée
    expect(moves(s, 'e1')).toContain('d1');
    s = mv(s, 'e1', 'e2');
    expect(moves(s, 'd8')).toEqual([]);
  });

  it('Égide : la pièce protégée est imprenable', () => {
    let s = createGameFromFen('4k3/8/8/3n4/8/8/8/3RK3 b - - 0 1', { w: [], b: ['shield'] });
    s = card(s, 0, 'd5');
    s = mv(s, 'e8', 'f8');
    expect(moves(s, 'd1')).not.toContain('d5');
    expect(moves(s, 'd1')).toContain('d4');
  });

  it('Gravité : portée limitée à 3 cases', () => {
    let s = createGameFromFen('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', { w: [], b: ['gravity'] });
    s = card(s, 0);
    s = mv(s, 'e8', 'd8');
    expect(moves(s, 'a1')).toEqual(['a2', 'a3', 'a4', 'b1', 'c1', 'd1']);
  });

  it('Foudre : détruit un pion, mais jamais en découvrant un échec', () => {
    const s = createGameFromFen('4k3/4p3/8/8/8/8/3p4/4RK2 w - - 0 1', { w: ['lightning'], b: [] });
    const opts = cardOptions(s, 'w', 0).map(sqName);
    expect(opts).toEqual(['d2']); // e7 couvre le roi noir de la tour e1
    const n = card(s, 0, 'd2');
    expect(n.pos.board[q('d2')]).toBeNull();
    expect(n.captured.b).toEqual(['p']);
  });

  it('Permutation : échange deux pièces, sans échec direct', () => {
    let s = createGame({ w: ['swap'], b: [] }, false);
    s = card(s, 0, 'b1', 'c1');
    expect(s.pos.board[q('b1')]?.t).toBe('b');
    expect(s.pos.board[q('c1')]?.t).toBe('n');
    expect(s.pos.turn).toBe('w'); // la carte ne remplace pas le coup
    // Un pion ne peut pas rejoindre la première rangée
    const t = createGame({ w: ['swap'], b: [] }, false);
    expect(cardOptions(t, 'w', 0, [q('e2')]).map(sqName)).not.toContain('b1');
  });

  it('Retour arrière : annule le dernier coup adverse et interdit de le rejouer', () => {
    let s = createGame({ w: [], b: ['rewind'] }, false);
    s = mv(s, 'e2', 'e4');
    expect(cardPlayable(s, 'b', 0)).toBe(true);
    s = card(s, 0);
    expect(s.pos.turn).toBe('w');
    expect(s.pos.board[q('e2')]?.t).toBe('p');
    expect(moves(s, 'e2')).toEqual(['e3']);
    expect(s.log[0]).toMatchObject({ k: 'move', undone: true });
    s = mv(s, 'd2', 'd4');
    expect(s.forbidden).toBeNull();
  });

  it('Résurrection : la tour capturée revient sur la première rangée', () => {
    let s = createGameFromFen('7k/8/8/8/8/8/r7/R3K3 b Q - 0 1', { w: ['revive'], b: [] });
    s = mv(s, 'a2', 'a1');
    expect(s.captured.w).toEqual(['r']);
    const opts = cardOptions(s, 'w', 0).map(sqName);
    expect(opts).toContain('b1');
    expect(opts).not.toContain('h1'); // la tour ressuscitée mettrait le roi h8 en échec
    expect(opts.some(x => x.endsWith('2'))).toBe(false); // aucun pion capturé
    s = card(s, 0, 'b1');
    expect(s.pos.board[q('b1')]).toMatchObject({ t: 'r', c: 'w' });
    expect(s.captured.w).toEqual([]);
  });

  it('Saut du cavalier et Passe-muraille', () => {
    let s = createGame({ w: ['knight_leap', 'phase'], b: [] }, false);
    s = card(s, 0, 'c1');
    expect(moves(s, 'c1')).toEqual(['b3', 'd3']);
    const t = card(createGame({ w: ['phase'], b: [] }, false), 0, 'a1');
    expect(moves(t, 'a1')).toEqual(['a3', 'a4', 'a5', 'a6', 'a7']); // traverse a2, s'arrête sur a7
  });

  it('une seule carte par tour', () => {
    let s = createGame({ w: ['shield', 'freeze'], b: [] }, false);
    s = card(s, 0, 'e2');
    expect(playCard(s, 'w', 1, [q('d7')], 'arcane').ok).toBe(false);
  });

  it('une carte peut sauver d’un mat', () => {
    // Mat du couloir : la tour noire en a1 mate le roi blanc g1, mais les blancs peuvent la geler
    const s = createGameFromFen('6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1', { w: ['freeze'], b: [] });
    expect(legalMovesOf(s)).toHaveLength(0);
    expect(s.result).toBeNull();
    const n = card(s, 0, 'a1');
    expect(legalMovesOf(n).length).toBeGreaterThan(0);
  });

  it('sans carte utile, le mat est bien un mat', () => {
    let s = createGameFromFen('6k1/8/8/8/8/8/5PPP/1r4K1 b - - 0 1', { w: ['ice_wall'], b: [] });
    s = mv(s, 'b1', 'a1');
    // Un mur entre b1 et f1 coupe la ligne de la tour : les blancs sont sauvés
    expect(s.result).toBeNull();
    expect(cardOptions(s, 'w', 0).map(sqName)).toEqual(['b1', 'c1', 'd1', 'e1', 'f1']);
    // L'Égide ne protège pas d'un échec : c'est mat
    let t = createGameFromFen('6k1/8/8/8/8/8/5PPP/1r4K1 b - - 0 1', { w: ['shield'], b: [] });
    t = mv(t, 'b1', 'e1');
    expect(t.result).toEqual({ winner: 'b', reason: 'checkmate' });
  });

  it("l'expiration d'un mur ne peut pas exposer le roi de celui qui joue", () => {
    // Mur noir en e4 entre la tour noire e8 et le roi blanc e1, il fond au prochain coup blanc
    let s = createGameFromFen('k3r3/8/8/8/8/8/8/4K3 b - - 0 1', { w: [], b: ['ice_wall'] });
    s = card(s, 0, 'e4');
    s = mv(s, 'a8', 'b8');
    s = mv(s, 'e1', 'd1');
    s = mv(s, 'b8', 'a8');
    s = mv(s, 'd1', 'e1'); // 2e coup blanc : le mur tient encore
    s = mv(s, 'a8', 'b8');
    // 3e coup blanc : rester sur la colonne e serait illégal, le mur fond juste après
    expect(moves(s, 'e1')).not.toContain('e2');
    expect(moves(s, 'e1')).toContain('d2');
  });

  it('Distorsion temporelle : réservée aux parties avec pendule', () => {
    const s = createGame({ w: ['time_warp'], b: [] }, false);
    expect(cardPlayable(s, 'w', 0)).toBe(false);
    const t = createGame({ w: ['time_warp'], b: [] }, true);
    expect(cardPlayable(t, 'w', 0)).toBe(true);
  });
});
