// Matrice des règles (conception, § 8.2), partie moteur (lot 1 ; le lot 3 ajoute le serveur) : cartes par joueur
// (SPELLMATE_MATRICE, « 1,3,5 » par défaut) × cartes par tour {1, 2} × carte à la place du coup {non, oui} × délai du
// Présage {2, 4} × choix des cartes ou tirage (test/helpers/matrice.ts).
//
// Pour chaque combinaison jouable :
// - checkRules l'accepte (configuration complète : chaque contexte, chaque réserve) ;
// - mise en place : tirage de la bonne taille dans chaque réserve, contraintes du tirage (R9) respectées ; ou choix
//   (refus accordé au nombre de cartes, complément au hasard, choix de l'IA) ;
// - parties au hasard menées jusqu'au bout, avec ces invariants à chaque action : jamais plus de `cardsPerTurn`
//   cartes dans un tour ; le trait passe si la carte remplace le coup, jamais sinon ; R4a (le camp sans le trait n'est
//   jamais en échec), R4b (après une carte qui ne termine pas le tour, le lanceur garde un coup), R4c (sans coup, une
//   carte doit le redonner) ; une seule fin ; clés stables ; aucun champ `cardsThisTurn` à une carte par tour ni après
//   un coup ; relecture complète avec les règles de la partie, alors que les règles du jour ont encore changé ;
// - decideTurn ne lance jamais plus de cartes que castsLeft, et son coup est légal après ses cartes.
// Chaque combinaison refusée l'est par checkRules, avec un message qui nomme la cause.
import { afterEach, describe, expect, it } from 'vitest';
import { decideTurn, chooseBotDraft } from '../src/shared/bot';
import type { BotLevel } from '../src/shared/bot';
import { CARDS } from '../src/shared/cards';
import type { CardId } from '../src/shared/cards';
import { opposite } from '../src/shared/chess';
import type { Color } from '../src/shared/chess';
import { DEAL } from '../src/shared/config/rules';
import type { GameRulesSettings, Rules } from '../src/shared/config/rules';
import {
  cardOptions, cardPlayable, cardPool, castsThisTurn, completeDraft, createGame, dealHands, draftRefusal, legalMovesOf,
  modsFromEffects, playCard, playMove, positionKey, sideInCheck,
} from '../src/shared/game';
import type { GameState } from '../src/shared/game';
import { initialStateOf, mainline, treeFromLog } from '../src/shared/pgn';
import {
  CARD_TUNING, RULES_V1, cardEndsTurn, castsLeft, checkRules, maxValidHand, poolOf, rulesFor, rulesOf, sameRules,
  setRulesOverride, validHand,
} from '../src/shared/rules';
import {
  MAIN_MAX_TIRAGE, MATRICE, combinaisons, combinaisonsRefusees, estDefaut, nomCombinaison,
} from './helpers/matrice';
import type { Combinaison } from './helpers/matrice';
import { mulberry32, pick } from './helpers/rng';
import { REGLAGES_V1, equilibrageV1 } from './helpers/v1';

afterEach(() => setRulesOverride(null));

/** Réglages d'une combinaison, sur ceux de V1 (REGLAGES_V1, pas ceux du jour : lot 9e). */
const reglages = (c: Combinaison): GameRulesSettings => ({
  ...REGLAGES_V1, cardsPerPlayer: c.cardsPerPlayer, cardsPerTurn: c.cardsPerTurn, cardEndsTurn: c.cardEndsTurn, presageDelay: c.presageDelay,
});

/** Règles d'une nouvelle partie pour cette combinaison, par le chemin du serveur jetable (setRulesOverride). */
function reglesDe(c: Combinaison): Rules {
  setRulesOverride(reglages(c));
  const r = rulesFor('classee');
  setRulesOverride(null);
  return r;
}

/** Réserves à essayer : avec et sans pendule, contre l'IA ou non. */
const RESERVES = [
  { timed: true, vsBot: false },
  { timed: false, vsBot: false },
  { timed: true, vsBot: true },
] as const;

/** Mains d'une partie de la combinaison : choix (complément au hasard pour l'un, choix de l'IA pour l'autre) ou tirage. */
function mains(c: Combinaison, r: Rules, timed: boolean, rand: () => number): Record<Color, CardId[]> {
  if (!c.draft) return dealHands(timed, rand, 'climats', { rules: r });
  const pool = cardPool('climats', timed);
  return { w: completeDraft(pool, [], rand, r.cardsPerPlayer), b: chooseBotDraft(pool, 2, rand, { count: r.cardsPerPlayer }) };
}

/** Invariants d'un état, à chaque action. */
function invariants(s: GameState, r: Rules, ou: string) {
  const kings: Record<Color, number> = { w: 0, b: 0 };
  for (const p of s.pos.board) if (p?.t === 'k') kings[p.c]++;
  expect(kings, ou).toEqual({ w: 1, b: 1 });
  const blocked = modsFromEffects(s.effects).blocked;
  for (let i = 0; i < 64; i++) expect(blocked[i] && !!s.pos.board[i], `${ou} : pièce sur une case bloquée`).toBe(false);
  const climats = s.effects.filter(e => CARDS[e.card].family === 'climat');
  expect(climats.filter(e => !e.pending).length, ou).toBeLessThanOrEqual(1);
  expect(climats.filter(e => e.pending).length, ou).toBeLessThanOrEqual(1);
  for (const e of s.effects) if (e.pending) expect(e.delay! >= 1 && e.delay! <= r.presageDelay, `${ou} : délai ${e.delay}`).toBe(true);
  // Règles photographiées : celles de la partie, jamais celles du jour ; compteur écrit seulement à plusieurs cartes.
  expect(rulesOf(s), ou).toBe(sameRules(r, RULES_V1) ? RULES_V1 : r);
  if (r.cardsPerTurn === 1) expect('cardsThisTurn' in s, ou).toBe(false);
  expect(s.cardsThisTurn ?? 0, ou).toBeLessThanOrEqual(r.cardsPerTurn);
  expect(castsThisTurn(s, s.pos.turn).length, ou).toBeLessThanOrEqual(r.cardsPerTurn);
  if (s.result) {
    if (s.result.reason === 'checkmate') {
      expect(s.result.winner, ou).toBe(opposite(s.pos.turn));
      expect(sideInCheck(s), ou).toBe(true);
    }
    return;
  }
  // R4a : le camp qui n'a pas le trait n'est jamais en échec.
  expect(sideInCheck(s, opposite(s.pos.turn)), `${ou} : camp sans le trait en échec`).toBe(false);
  // R4c : sans coup, une carte doit en redonner un (budget du tour compris).
  if (!legalMovesOf(s).length) {
    expect(castsLeft(s), ou).toBeGreaterThan(0);
    expect(s.hands[s.pos.turn].some((_, i) => cardPlayable(s, s.pos.turn, i)), ou).toBe(true);
  }
}

/** Cibles au hasard parmi celles que le moteur propose. */
function cibles(s: GameState, color: Color, index: number, rand: () => number): number[] | null {
  const out: number[] = [];
  for (let k = 0; k < CARDS[s.hands[color][index].card].targets; k++) {
    const options = cardOptions(s, color, index, out);
    if (!options.length) return null;
    out.push(pick(rand, options)!);
  }
  return out;
}

/** Une partie au hasard sous les règles `r`, menée jusqu'au bout (ou `max` actions) ; renvoie l'état final. */
function partie(c: Combinaison, r: Rules, timed: boolean, seed: number, max = 150): { s: GameState; cartes: number; doubles: number; remplacent: number } {
  const rand = mulberry32(seed);
  let s = createGame(mains(c, r, timed, rand), timed, 'climats', { rules: r });
  expect('rules' in s).toBe(!sameRules(r, RULES_V1));
  for (const h of [s.hands.w, s.hands.b]) expect(h).toHaveLength(r.cardsPerPlayer);
  let cartes = 0;
  let doubles = 0;
  let remplacent = 0;
  for (let n = 0; n < max && !s.result; n++) {
    const color = s.pos.turn;
    const ou = `${nomCombinaison(c)}, graine ${seed}, demi-coup ${s.ply}`;
    invariants(s, r, ou);
    let legal = legalMovesOf(s);
    let ceTour = 0;
    while (!s.result && s.pos.turn === color && castsLeft(s) > 0 && (!legal.length || rand() < (ceTour ? 0.7 : 0.3))) {
      const jouables = s.hands[color].map((_, i) => i).filter(i => cardPlayable(s, color, i));
      if (!jouables.length) break;
      const index = pick(rand, jouables)!;
      const targets = cibles(s, color, index, rand);
      expect(targets, ou).not.toBeNull();
      const card = s.hands[color][index].card;
      const res = playCard(s, color, index, targets!, '');
      if (!res.ok) throw new Error(`${ou} : carte jouable refusée (${card}) : ${res.error}`);
      ceTour++;
      cartes++;
      expect(ceTour, `${ou} : cartes dans le tour`).toBeLessThanOrEqual(r.cardsPerTurn);
      if (ceTour === 2) doubles++;
      const termine = cardEndsTurn(CARDS[card], r);
      if (termine && !CARDS[card].ritual) remplacent++;
      // Le trait passe si (et seulement si) la carte remplace le coup.
      if (!res.state.result) expect(res.state.pos.turn !== color, `${ou} : ${card}, trait`).toBe(termine);
      // R4b : une carte qui ne termine pas le tour laisse un coup au lanceur.
      if (!termine && !res.state.result) expect(legalMovesOf(res.state).length, `${ou} : R4b après ${card}`).toBeGreaterThan(0);
      s = res.state;
      invariants(s, r, `${ou}, après ${card}`);
      legal = !s.result && s.pos.turn === color ? legalMovesOf(s) : [];
    }
    if (s.result || s.pos.turn !== color) continue;
    expect(legal.length, `${ou} : aucun coup ni carte, sans fin de partie`).toBeGreaterThan(0);
    const captures = legal.filter(m => s.pos.board[m.to] || m.flags & 2);
    const m = captures.length && rand() < 0.6 ? pick(rand, captures)! : pick(rand, legal)!;
    const res = playMove(s, m.from, m.to, m.promo);
    if (!res.ok) throw new Error(`${ou} : coup légal refusé : ${res.error}`);
    s = res.state;
    expect(s.keys.at(-1), ou).toBe(positionKey(s));
    expect('cardsThisTurn' in s, `${ou} : compteur après un coup`).toBe(false);
    expect(s.cardPlayed, ou).toBe(false);
  }
  if (s.result) {
    // Une seule fin : plus rien n'est joué.
    const m = legalMovesOf({ ...s, result: null })[0];
    if (m) expect(playMove(s, m.from, m.to, m.promo)).toMatchObject({ ok: false, code: 'game-over' });
    const i = s.hands[s.pos.turn].findIndex(h => !h.used);
    if (i >= 0) expect(playCard(s, s.pos.turn, i, [], '')).toMatchObject({ ok: false, code: 'game-over' });
  }
  return { s, cartes, doubles, remplacent };
}

/** Relecture complète depuis l'état initial, avec les règles de la partie, alors que celles du jour ont changé. */
function relecture(s: GameState, ailleurs: Partial<GameRulesSettings>) {
  setRulesOverride(ailleurs);
  try {
    const { root, complete } = treeFromLog(initialStateOf(JSON.parse(JSON.stringify(s)) as GameState), s.log);
    expect(complete).toBe(true);
    const fin = mainline(root).at(-1)!.state;
    expect(fin.keys).toEqual(s.keys);
    expect(fin.result).toEqual(s.result);
  } finally {
    setRulesOverride(null);
  }
}

describe(`matrice des règles (moteur), cartes par joueur ${MATRICE.join(', ')}`, () => {
  it('plus grande main tirable : MAIN_MAX_TIRAGE de la matrice = maxValidHand de chaque réserve (R9 du jour)', () => {
    for (const res of RESERVES) expect(maxValidHand(poolOf('climats', res), DEAL.handLimits), JSON.stringify(res)).toBe(MAIN_MAX_TIRAGE);
  });

  it('la combinaison par défaut est RULES_V1 : rien n’est écrit dans la partie', () => {
    const defaut = combinaisons([3]).filter(estDefaut);
    expect(defaut).toHaveLength(1);
    // Seul un équilibrage des cartes du jour changé (CARDS) la sépare alors de RULES_V1.
    if (equilibrageV1()) expect(reglesDe(defaut[0])).toBe(RULES_V1);
    else expect(reglesDe(defaut[0])).toEqual({ ...RULES_V1, tuning: CARD_TUNING });
  });

  describe.each(combinaisons().map(c => [nomCombinaison(c), c] as const))('%s', (_nom, c) => {
    it('acceptée par checkRules ; mise en place de la bonne taille dans chaque réserve', () => {
      expect(checkRules({ game: reglages(c), deal: { ...DEAL, draft: c.draft } })).toEqual([]);
      const r = reglesDe(c);
      const n = r.cardsPerPlayer;
      const rand = mulberry32(n * 100 + r.cardsPerTurn * 10 + r.presageDelay);
      for (const res of RESERVES) {
        const pool = cardPool('climats', res.timed, { vsBot: res.vsBot });
        for (let k = 0; k < 30; k++) {
          if (c.draft) {
            const h = completeDraft(pool, [], rand, n);
            expect(draftRefusal(pool, h, false, n)).toBeNull();
            expect(draftRefusal(pool, [...h, ...pool.filter(x => !h.includes(x))].slice(0, n + 1), false, n)).toBe(`Choisissez ${n} carte${n > 1 ? 's' : ''}.`);
            const bot = chooseBotDraft(pool, (1 + (k % 3)) as BotLevel, rand, { count: n });
            expect(draftRefusal(pool, bot, false, n)).toBeNull();
          } else {
            const { w, b } = dealHands(res.timed, rand, 'climats', { vsBot: res.vsBot, rules: r });
            for (const h of [w, b]) {
              expect(h).toHaveLength(n);
              expect(new Set(h).size).toBe(n);
              expect(h.every(id => pool.includes(id))).toBe(true);
              expect(validHand(h, DEAL.handLimits)).toBe(true);
            }
          }
        }
      }
    });

    it('parties au hasard jusqu’au bout : invariants, relecture avec les règles de la partie', () => {
      const r = reglesDe(c);
      const vu = { cartes: 0, doubles: 0, remplacent: 0 };
      for (const [k, timed] of [true, false, true].entries()) {
        const seed = 7000 + c.cardsPerPlayer * 1000 + c.cardsPerTurn * 100 + Number(c.cardEndsTurn) * 10 + c.presageDelay + k;
        const res = partie(c, r, timed, seed);
        vu.cartes += res.cartes;
        vu.doubles += res.doubles;
        vu.remplacent += res.remplacent;
        relecture(res.s, { ...REGLAGES_V1, cardsPerPlayer: 2, presageDelay: c.presageDelay === 2 ? 4 : 2, fiftyHalfmoves: 20 });
      }
      // La combinaison a bien été exercée : des cartes, deux dans un tour, des cartes qui remplacent le coup.
      expect(vu.cartes).toBeGreaterThan(0);
      if (c.cardsPerTurn > 1) expect(vu.doubles).toBeGreaterThan(0);
      if (c.cardEndsTurn) expect(vu.remplacent).toBeGreaterThan(0);
    });

    it('decideTurn : jamais plus de cartes que castsLeft, un coup légal après ses cartes', () => {
      const r = reglesDe(c);
      const rand = mulberry32(31 + c.cardsPerPlayer);
      let s = createGame(mains(c, r, true, rand), true, 'climats', { rules: r });
      for (let k = 0; k < 6 && !s.result; k++) {
        const me = s.pos.turn;
        const d = decideTurn(s, 1);
        expect(d.cards.length).toBeLessThanOrEqual(castsLeft(s));
        let t = s;
        for (const cc of d.cards) {
          const res = playCard(t, me, cc.index, cc.targets, '');
          expect(res.ok).toBe(true);
          if (res.ok) t = res.state;
        }
        if (t.result || t.pos.turn !== me) {
          expect(d.move).toBeNull();
          s = t;
          continue;
        }
        expect(d.move).not.toBeNull();
        const res = playMove(t, d.move!.from, d.move!.to, d.move!.promo);
        expect(res.ok).toBe(true);
        if (res.ok) s = res.state;
        // Le coup seul (cards: false) : aucune carte.
        if (!s.result) expect(decideTurn(s, 1, { cards: false }).cards).toEqual([]);
      }
    });
  });

  it.each(combinaisonsRefusees().map(c => [nomCombinaison(c), c] as const))('refusée par checkRules : %s', (_nom, c) => {
    const e = checkRules({ game: reglages(c), deal: { ...DEAL, draft: c.draft } });
    expect(e.length).toBeGreaterThan(0);
    const attendu =
      c.cardsPerTurn > c.cardsPerPlayer
        ? `GAME_RULES.cardsPerTurn vaut ${c.cardsPerTurn} : une main n'a qu`
        : c.cardEndsTurn && c.cardsPerTurn > 1
          ? 'GAME_RULES.cardEndsTurn (la carte remplace le coup) impose 1 carte par tour'
          : `main valide maximale : ${MAIN_MAX_TIRAGE}`;
    expect(e.some(m => m.includes(attendu)), `${c.raison} : ${e.join(' | ')}`).toBe(true);
  });
});
