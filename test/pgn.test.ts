import { describe, expect, it } from 'vitest';
import { sqIndex as q, toFen } from '../src/shared/chess';
import type { CardId } from '../src/shared/cards';
import { GameState, createGame, playCard, playMove } from '../src/shared/game';
import {
  START_FEN, TreeNode, findSanMove, initialStateOf, mainline, parsePgnText, readPgn, sanOf, stateFromFen,
  treeFromLog, validateFen, writePgn,
} from '../src/shared/pgn';

const OPERA = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duc de Brunswick et comte Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const sans = (root: TreeNode) => mainline(root).slice(1).map(n => (n.entry?.k === 'move' ? n.entry.san : `[${n.entry?.k}]`));
const placement = (s: GameState) => toFen(s.pos).split(' ')[0];

function play(s: GameState, ...uci: string[]): GameState {
  for (const u of uci) {
    const r = playMove(s, q(u.slice(0, 2)), q(u.slice(2, 4)), (u[4] as 'q') || undefined);
    if (!r.ok) throw new Error(`${u} : ${r.error}`);
    s = r.state;
  }
  return s;
}

describe('SAN', () => {
  it('lit les coups spéciaux : roque, prise en passant, promotion, levée d’ambiguïté', () => {
    let s = stateFromFen(START_FEN);
    s = play(s, 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5');
    expect(findSanMove(s, 'O-O')).toMatchObject({ from: q('e1'), to: q('g1') });
    expect(findSanMove(s, '0-0')).toMatchObject({ from: q('e1'), to: q('g1') });
    expect(findSanMove(s, 'O-O-O')).toBeNull();

    const ep = stateFromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const m = findSanMove(ep, 'exd6')!;
    expect(m.to).toBe(q('d6'));
    expect(sanOf(ep, m)).toBe('exd6');
    expect(findSanMove(ep, 'exd6 e.p.')).toEqual(m);

    const promo = stateFromFen('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    expect(sanOf(promo, findSanMove(promo, 'b8=Q')!)).toBe('b8=Q+');
    expect(findSanMove(promo, 'b8Q')?.promo).toBe('q');
    expect(findSanMove(promo, 'b8=N')?.promo).toBe('n');
    expect(sanOf(promo, findSanMove(promo, 'b8=N')!)).toBe('b8=N');

    const amb = stateFromFen('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1');
    expect(findSanMove(amb, 'Ra3')).toBeNull();
    const r1 = findSanMove(amb, 'R1a3')!;
    expect(r1.from).toBe(q('a1'));
    expect(sanOf(amb, r1)).toBe('R1a3');
    expect(findSanMove(amb, 'R5a3')!.from).toBe(q('a5'));

    const files = stateFromFen('4k3/8/8/8/8/8/8/R4RK1 w - - 0 1');
    expect(sanOf(files, findSanMove(files, 'Rad1')!)).toBe('Rad1');
    expect(findSanMove(files, 'Rfd1')!.from).toBe(q('f1'));
  });

  it('accepte la notation française et les annotations', () => {
    const s = stateFromFen(START_FEN);
    expect(findSanMove(s, 'Cf3', 'fr')).toMatchObject({ from: q('g1'), to: q('f3') });
    expect(findSanMove(s, 'e4!?')).toMatchObject({ from: q('e2'), to: q('e4') });
    const g = readPgn('1. e4 e5 2. Cf3 Cc6 3. Fb5 a6 4. Fa4 Cf6 5. O-O Fe7 *');
    expect(sans(g.root)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']);
  });
});

describe('PGN', () => {
  it('relit la partie de l’Opéra jusqu’au mat', () => {
    const g = readPgn(OPERA);
    expect(g.headers.White).toBe('Paul Morphy');
    expect(g.result).toBe('1-0');
    const line = mainline(g.root);
    expect(line).toHaveLength(34);
    const last = line[line.length - 1];
    expect(placement(last.state)).toBe('1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5');
    expect(last.state.result?.reason).toBe('checkmate');
    expect(last.entry?.k === 'move' && last.entry.san).toBe('Rd8#');
  });

  it('écrit puis relit le même PGN (aller-retour)', () => {
    const g = readPgn(OPERA);
    const text = writePgn(g.headers, g.root, g.result);
    expect(text).toContain('[White "Paul Morphy"]');
    expect(text).toContain('12. O-O-O Rd8');
    expect(text).toContain('17. Rd8# 1-0');
    expect(text.split('\n').every(l => l.length <= 80)).toBe(true);
    const again = readPgn(text);
    expect(sans(again.root)).toEqual(sans(g.root));
  });

  it('conserve variantes, commentaires et annotations', () => {
    const src = '1. e4 e5 (1... c5 2. Nf3 (2. Nc3) d6) 2. Nf3 {Le cavalier sort.} Nc6 $1 3. Bb5 *';
    const g = readPgn(src);
    expect(sans(g.root)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    const e4 = g.root.children[0];
    expect(e4.children).toHaveLength(2);
    expect(e4.children[1].entry?.k === 'move' && e4.children[1].entry.san).toBe('c5');
    expect(e4.children[1].children).toHaveLength(2);
    const out = writePgn({}, g.root, '*');
    expect(out.replace(/\n/g, ' ')).toContain('1. e4 e5 (1... c5 2. Nf3 (2. Nc3) 2... d6) 2. Nf3 {Le cavalier sort.} 2... Nc6 $1 3. Bb5 *');
    expect(sans(readPgn(out).root)).toEqual(sans(g.root));
  });

  it('lit une position de départ (FEN) et l’écrit dans l’en-tête', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const g = readPgn(`[FEN "${fen}"]\n[SetUp "1"]\n\n1. Rd8# 1-0`);
    expect(mainline(g.root).at(-1)!.state.result?.reason).toBe('checkmate');
    const out = writePgn({}, g.root, '1-0');
    expect(out).toContain(`[FEN "${fen}"]`);
    expect(out).toContain('1. Rd8# 1-0');
  });

  it('signale un coup illégal en français', () => {
    expect(() => readPgn('1. e4 e5 2. Ke3 *')).toThrow(/illégal/);
  });

  it('ignore les tokens parasites et lit le résultat', () => {
    const p = parsePgnText('% commentaire de logiciel\n[Result "0-1"]\n1.f3 e5 2.g4?? Qh4# 0-1');
    expect(p.result).toBe('0-1');
    expect(p.entries.filter(e => e.k === 'move').map(e => e.k === 'move' && e.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(p.entries[2].k === 'move' && p.entries[2].nags).toEqual([4]);
  });
});

describe('Parties à cartes', () => {
  function cardGame() {
    let s = createGame({ w: ['lightning' as CardId], b: ['freeze' as CardId] }, false, 'duel');
    s = play(s, 'e2e4', 'd7d5');
    let r = playCard(s, 'w', 0, [q('d5')], 'arcane');
    if (!r.ok) throw new Error(r.error);
    s = play(r.state, 'g1f3');
    r = playCard(s, 'b', 0, [q('f3')], 'arcane');
    if (!r.ok) throw new Error(r.error);
    return play(r.state, 'e7e5', 'f1c4');
  }

  it('relit le journal d’une partie du site, cartes comprises', () => {
    const final = cardGame();
    const { root, complete } = treeFromLog(initialStateOf(final), final.log);
    expect(complete).toBe(true);
    const line = mainline(root);
    expect(line).toHaveLength(final.log.length + 1);
    expect(toFen(line.at(-1)!.state.pos)).toBe(toFen(final.pos));
    expect(line.filter(n => n.entry?.k === 'card')).toHaveLength(2);
  });

  it('écrit les cartes en commentaires [%spell] et les rejoue à la lecture', () => {
    const final = cardGame();
    const { root } = treeFromLog(initialStateOf(final), final.log);
    const text = writePgn({ White: 'A', Black: 'B' }, root, '*');
    expect(text).toContain('[Variant "Spellmate"]');
    expect(text).toContain('{[%spell lightning d5]} 2. Nf3 {[%spell freeze f3]} 2... e5 3. Bc4');
    const again = readPgn(text);
    expect(toFen(mainline(again.root).at(-1)!.state.pos)).toBe(toFen(final.pos));
  });

  it('relit un Retour arrière (coup annulé puis rejoué autrement)', () => {
    let s = createGame({ w: [], b: ['rewind' as CardId] }, false, 'duel');
    s = play(s, 'e2e4');
    const r = playCard(s, 'b', 0, [], 'arcane');
    if (!r.ok) throw new Error(r.error);
    s = play(r.state, 'd2d4', 'd7d5');
    const { root, complete } = treeFromLog(initialStateOf(s), s.log);
    expect(complete).toBe(true);
    const line = mainline(root);
    expect(line[1].entry).toMatchObject({ k: 'move', undone: true });
    expect(toFen(line.at(-1)!.state.pos)).toBe(toFen(s.pos));
    const text = writePgn({}, root, '*');
    expect(text).toContain('1. e4 {[%spell rewind]} 1. d4 d5');
    expect(toFen(mainline(readPgn(text).root).at(-1)!.state.pos)).toBe(toFen(s.pos));
  });
});

describe('FEN', () => {
  it('accepte une position valable et refuse les impossibles', () => {
    expect(validateFen(START_FEN)).toBeNull();
    expect(validateFen('8/8/8/8/8/8/8/4K3 w - - 0 1')).toMatch(/roi/);
    expect(validateFen('4k2P/8/8/8/8/8/8/4K3 w - - 0 1')).toMatch(/pion/);
    expect(validateFen('4k3/8/8/8/8/8/8/4K2R b - - 0 1')).toBeNull();
    expect(validateFen('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1')).toMatch(/échec/);
    expect(validateFen('4k3/8/8/8/8/8/8/4K3 w KQ - 0 1')).toMatch(/roque/);
    expect(validateFen('4k3/9/8/8/8/8/8/4K3 w - - 0 1')).not.toBeNull();
    expect(validateFen('4k3/8/8/8/8/8/8/4K3 x - - 0 1')).toMatch(/trait/);
  });
});
