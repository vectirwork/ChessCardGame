import { describe, expect, it } from 'vitest';
import { CardId } from '../src/shared/cards';
import { Color, F_RELAXED, Move, sqName } from '../src/shared/chess';
import { BOT_PROFILES, BotLevel, analyse, chooseBotCard, chooseBotMove, decideTurn } from '../src/shared/bot';
import { deepFreeze } from '../src/shared/config/rules';
import { Effect, legalMovesOf, playCard, playMove } from '../src/shared/game';
import { RULES_V1, castsLeft } from '../src/shared/rules';
import { decide } from '../src/server/bot-worker';
import { think } from '../src/client/ai/think';
// Parties, tirages et choix scriptés aux règles V1 (RULES_V1, DEAL_V1), quel que soit le réglage du jour (lot 9e) :
// test/helpers/v1.ts.
import { createGame, createGameFromFen } from './helpers/v1';

describe('IA et analyse', () => {
  it('trouve un mat en un coup et le signale', () => {
    const s = createGameFromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { w: [], b: [] }, false, 'duel');
    const a = analyse(s, 4, 3000);
    expect(a.best && sqName(a.best.from) + sqName(a.best.to)).toBe('a1a8');
    expect(a.mate).toBe(1);
    expect(a.pv[0]).toEqual(a.best);
  });
  it('évalue la position initiale comme équilibrée et donne une suite', () => {
    const a = analyse(createGame({ w: [], b: [] }, false, 'duel'), 3, 3000);
    expect(Math.abs(a.scoreWhite)).toBeLessThan(80);
    expect(a.pv.length).toBeGreaterThanOrEqual(2);
  });
  it('voit qu’une dame en prise se perd (point de vue des Blancs, Noirs au trait)', () => {
    const s = createGameFromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', { w: [], b: [] }, false, 'duel');
    const a = analyse(s, 3, 3000);
    expect(a.best && sqName(a.best.to)).toBe('d5');
    expect(a.scoreWhite).toBeGreaterThan(300);
  });
  it("l'IA joue un coup légal", () => {
    expect(chooseBotMove(createGame({ w: [], b: [] }, false, 'duel'), 2)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Catalogue Pouvoirs : l'IA voit les effets coup par coup (Présage, expirations), la capture obligatoire de la
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

describe('IA et Pouvoirs', () => {
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
    // Trêve annoncée par les Noirs : elle arrive après le coup blanc, et les Noirs ne pourront pas reprendre en
    // d5. Dxd5 gagne alors une tour ; sans la Trêve, …exd5 gagnerait la dame.
    const s = climats('6k1/5ppp/4p3/3r4/8/8/5PPP/3Q2K1 w - - 0 30');
    expect(uci(chooseBotMove(s, 3))).not.toBe('d1d5');
    const announced = { ...s, effects: [effect('truce', 'b', 3, { pending: true, delay: 1 })] };
    for (const level of [1, 2, 3] as BotLevel[]) expect(uci(chooseBotMove(announced, level)), `niveau ${level}`).toBe('d1d5');
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
    // Blancs Rh3, pions g2 g3 g4 ; Noirs Th8 : mat, sauf un Mur de glace en h4, h5 ou h6.
    const s = climats('k6r/8/8/8/6P1/6PK/6P1/8 w - - 0 40', ['hourglass', 'truce', 'ice_wall']);
    expect(legalMovesOf(s)).toEqual([]);
    expect(s.result).toBeNull();
    for (const level of [1, 2, 3] as BotLevel[]) {
      const c = chooseBotCard(s, level);
      expect(c?.index).toBe(2);
      expect(['h4', 'h5', 'h6']).toContain(sqName(c!.targets[0]));
    }
    // Le thread de l'IA joue la carte, puis un coup.
    const reply = decide(s, 2);
    expect(reply.card?.index).toBe(2);
    expect(reply.move).not.toBeNull();
  });

  it('pas de Grande Marée qui offre une pièce (Écossaise de la relecture)', () => {
    const scotch = climats('r1bqk2r/pppp1ppp/2n2n2/8/1b1NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 3 6', ['tide']);
    expect(chooseBotCard(scotch, 3)).toBeNull();
  });

  it('le choix d’une carte tient dans le budget de temps du niveau', () => {
    const s = climats('r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10', ['truce', 'rift', 'ice_wall']);
    for (const level of [2, 3] as BotLevel[]) {
      const t = Date.now();
      chooseBotCard(s, level);
      // Marge pour une machine chargée (tests en parallèle).
      expect(Date.now() - t).toBeLessThan(BOT_PROFILES[level].thinkMs + 600);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Décision d'un tour (decideTurn), partagée par le serveur (bot-worker) et le navigateur (think).

describe('decideTurn', () => {
  it('serveur et navigateur rendent la même décision, au format { card, cards, move }', () => {
    const s = climats('k6r/8/8/8/6P1/6PK/6P1/8 w - - 0 40', ['hourglass', 'truce', 'ice_wall']);
    const serveur = decide(s, 3);
    const navigateur = think(s, 3);
    expect(serveur.cards).toHaveLength(1);
    expect(serveur.card).toEqual(serveur.cards![0]);
    expect(navigateur.card).toEqual(serveur.card);
    expect(navigateur.cards).toEqual(serveur.cards);
    expect(uci(navigateur.move)).toBe(uci(serveur.move as Move));
    // Partie finie : rien ; coup seul demandé : aucune carte.
    expect(decide({ ...s, result: { winner: 'b', reason: 'resign' } }, 2)).toEqual({ card: null, cards: [], move: null });
    const seul = decideTurn(climats('r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10', ['ice_wall']), 2, { cards: false });
    expect(seul.cards).toEqual([]);
    expect(seul.move).not.toBeNull();
  });

  it('plusieurs cartes par tour : jamais plus que castsLeft, chacune jouable, puis un coup légal', () => {
    const deux = deepFreeze({ ...RULES_V1, cardsPerTurn: 2 });
    const positions = [
      'k6r/8/8/8/6P1/6PK/6P1/8 w - - 0 40',
      'r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10',
      '6k1/2q2ppp/8/1B6/8/7P/5PP1/3R2K1 w - - 0 30',
    ];
    for (const fen of positions) {
      const s = createGameFromFen(fen, { w: ['ice_wall', 'truce', 'rift'], b: [] }, true, 'climats', { rules: deux });
      s.ply = 30;
      for (const level of [2, 3] as BotLevel[]) {
        const d = decideTurn(s, level);
        expect(d.cards.length, fen).toBeLessThanOrEqual(castsLeft(s));
        let t = s;
        for (const c of d.cards) {
          const r = playCard(t, 'w', c.index, c.targets, '');
          expect(r.ok, fen).toBe(true);
          if (r.ok) t = r.state;
        }
        if (t.pos.turn === 'w' && !t.result) {
          expect(d.move, fen).not.toBeNull();
          expect(playMove(t, d.move!.from, d.move!.to, d.move!.promo).ok, fen).toBe(true);
        }
      }
    }
  });

  it('carte qui termine le tour : pas de coup après elle', () => {
    const place = deepFreeze({ ...RULES_V1, cardEndsTurn: true });
    // Mat imminent sauf un Mur (h4, h5 ou h6) : la carte est forcée (R4c) et remplace le coup.
    const s = createGameFromFen('k6r/8/8/8/6P1/6PK/6P1/8 w - - 0 40', { w: ['ice_wall'], b: [] }, true, 'climats', { rules: place });
    const d = decideTurn(s, 2);
    expect(d.cards).toHaveLength(1);
    expect(d.move).toBeNull();
  });
});
