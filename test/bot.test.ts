import { describe, expect, it } from 'vitest';
import { CardId } from '../src/shared/cards';
import { Color, F_RELAXED, Move, sqIndex as q, sqName } from '../src/shared/chess';
import { BOT_PROFILES, BotLevel, analyse, chooseBotCard, chooseBotMove } from '../src/shared/bot';
import { Effect, GameState, createGame, createGameFromFen, legalMovesOf, playMove } from '../src/shared/game';
import { decide } from '../src/server/bot-worker';

describe('IA et analyse', () => {
  it('trouve un mat en un coup et le signale', () => {
    const s = createGameFromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { w: [], b: [] }, false);
    const a = analyse(s, 4, 3000);
    expect(a.best && sqName(a.best.from) + sqName(a.best.to)).toBe('a1a8');
    expect(a.mate).toBe(1);
    expect(a.pv[0]).toEqual(a.best);
  });
  it('évalue la position initiale comme équilibrée et donne une suite', () => {
    const a = analyse(createGame({ w: [], b: [] }, false), 3, 3000);
    expect(Math.abs(a.scoreWhite)).toBeLessThan(80);
    expect(a.pv.length).toBeGreaterThanOrEqual(2);
  });
  it('voit qu’une dame en prise se perd (point de vue des Blancs, Noirs au trait)', () => {
    const s = createGameFromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', { w: [], b: [] }, false);
    const a = analyse(s, 3, 3000);
    expect(a.best && sqName(a.best.to)).toBe('d5');
    expect(a.scoreWhite).toBeGreaterThan(300);
  });
  it("l'IA joue un coup légal", () => {
    expect(chooseBotMove(createGame({ w: [], b: [] }, false), 2)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Catalogue Climats : l'IA voit les effets coup par coup (Présage, expirations), la capture obligatoire de la
// Lune de sang, « la magie cède », et choisit ses cartes avec discernement, dans son budget de temps.

const climats = (fen: string, w: CardId[] = [], b: CardId[] = []) => {
  const s = createGameFromFen(fen, { w, b }, true, 'climats');
  s.ply = 30; // milieu de partie : l'IA ne garde plus ses cartes par principe
  return s;
};
const effect = (card: CardId, caster: Color, remaining: number, extra: Partial<Effect> = {}): Effect => ({
  id: 50, card, caster, countsOn: caster, remaining, total: remaining, skin: '', global: true, ...extra,
});
const uci = (m: Move | null) => (m ? sqName(m.from) + sqName(m.to) : null);
function move(s: GameState, from: string, to: string): GameState {
  const r = playMove(s, q(from), q(to));
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('IA et cartes Climats', () => {
  it('Lune de sang : la quiescence ne s’arrête pas sur une position où une capture est obligatoire', () => {
    // Blancs : Rg1, Td1, Fb5, pions f2 g2 h3 ; Noirs : Rg8, Dc7, pions f7 g7 h7. Sous la Lune, g3 ! force
    // ...Dxg3 (seule capture), puis fxg3 : la dame tombe. Sans la Lune, l'appât ne vaut rien.
    const s = climats('6k1/2q2ppp/8/1B6/8/7P/5PP1/3R2K1 w - - 0 30');
    expect(analyse(s, 1, 5000).scoreWhite).toBeLessThan(200);
    const moon = { ...s, effects: [effect('blood_moon', 'b', 3)] };
    const a = analyse(moon, 1, 5000);
    expect(a.scoreWhite).toBeGreaterThan(500);
    expect(['g2g3', 'b5d7']).toContain(uci(a.best));
  });

  it('Lune de sang : attendre laisse l’adversaire face à sa capture forcée (coup nul en quiescence)', () => {
    // Position de la relecture, Lune arrivée, après ...h5 : Fxh5 est forcé, les Noirs attendent (...Ff5), et
    // Fxf7+ devient forcé à son tour : les Blancs perdent le fou pour deux pions. Dès la profondeur 1.
    const s = climats('2br2k1/p4pp1/1p6/7p/8/5B2/PP3PPP/4R1K1 w - - 0 21');
    const moon = { ...s, effects: [effect('blood_moon', 'w', 3)] };
    expect(legalMovesOf(moon).map(uci)).toEqual(['f3h5']);
    expect(analyse(moon, 1, 5000).scoreWhite).toBeLessThan(0);
    expect(analyse(moon, 3, 5000).scoreWhite).toBeLessThan(0);
    // Et l'IA ne lance pas la Lune dans la position d'origine : elle s'y contraindrait la première.
    const before = climats('2br2k1/p4ppp/1p6/8/8/5B2/PP3PPP/4R1K1 w - - 0 20', ['blood_moon']);
    expect(chooseBotCard(before, 3)).toBeNull();
  });

  it('la recherche sait qu’un Climat annoncé arrive au coup suivant', () => {
    // Chevauchée annoncée par les Noirs : elle arrive après le coup blanc. La tour b3 pourra alors sauter en d4 :
    // la dame blanche doit quitter la case (rien ne l'y attaque aujourd'hui, et Dd8+ se heurte au fou e7).
    const s = climats('6k1/4bppp/8/8/3Q4/1r6/5PPP/6K1 w - - 0 30');
    const announced = { ...s, effects: [effect('cavalcade', 'b', 2, { pending: true, delay: 1 })] };
    for (const level of [2, 3] as BotLevel[]) {
      const m = chooseBotMove(announced, level)!;
      const after = playMove(announced, m.from, m.to, m.promo);
      expect(after.ok).toBe(true);
      if (!after.ok) return;
      const queen = after.state.pos.board.findIndex(p => p?.t === 'q');
      expect(legalMovesOf(after.state).some(x => x.to === queen), uci(m)!).toBe(false);
    }
  });

  it('« la magie cède » : l’IA joue un coup de pion quand l’Ère glaciaire la bloque', () => {
    const s = { ...climats('7k/8/8/8/8/8/4n1PP/7K w - - 0 40'), effects: [effect('ice_age', 'b', 4)] };
    for (const level of [1, 2, 3] as BotLevel[]) {
      const m = chooseBotMove(s, level);
      expect(m && m.flags & F_RELAXED).toBeTruthy();
      expect(['g2g3', 'g2g4', 'h2h3', 'h2h4']).toContain(uci(m));
    }
  });

  it('jamais le Sablier fou ; une carte qui sauve du mat est jouée (R4c)', () => {
    // Blancs Rh1, pions g2 h2 ; Noirs Te1 : mat, sauf un Mur de glace en f1 ou g1.
    const s = climats('k7/8/8/8/8/8/6PP/4r2K w - - 0 40', ['hourglass', 'truce', 'ice_wall']);
    expect(legalMovesOf(s)).toEqual([]);
    expect(s.result).toBeNull();
    for (const level of [1, 2, 3] as BotLevel[]) {
      const c = chooseBotCard(s, level);
      expect(c?.index).toBe(2);
      expect(['f1', 'g1']).toContain(sqName(c!.targets[0]));
    }
  });

  it('Déjà-vu après une dame perdue ; pas de Grande Marée qui offre une pièce (Écossaise de la relecture)', () => {
    let s = climats('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3', [], ['deja_vu']);
    s = move(s, 'd8', 'h4');
    s = move(s, 'f3', 'h4');
    expect(chooseBotCard(s, 3)).toEqual({ index: 0, targets: [] });
    // Le thread de l'IA joue la carte, puis un coup qui ne bouge pas la dame (pièce interdite).
    const reply = decide(s, 3);
    expect(reply.card).toEqual({ index: 0, targets: [] });
    expect(reply.move && sqName(reply.move.from)).not.toBe('h4');
    expect(reply.move && sqName(reply.move.from)).not.toBe('d8');
    const scotch = climats('r1bqk2r/pppp1ppp/2n2n2/8/1b1NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 3 6', ['tide']);
    expect(chooseBotCard(scotch, 3)).toBeNull();
  });

  it('le choix d’une carte tient dans le budget de temps du niveau', () => {
    const s = climats('r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10', ['portals', 'rift', 'ice_wall']);
    for (const level of [2, 3] as BotLevel[]) {
      const t = Date.now();
      chooseBotCard(s, level);
      // Marge pour une machine chargée (tests en parallèle).
      expect(Date.now() - t).toBeLessThan(BOT_PROFILES[level].thinkMs + 600);
    }
  });
});
