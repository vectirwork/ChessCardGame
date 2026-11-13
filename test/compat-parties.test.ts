// Compatibilité des parties enregistrées (conception, § 8.5) : les témoins v1 (test/fixtures/v1, capturés avant la
// polymorphie) se rejouent coup pour coup, avec les mêmes informations rendues par le moteur, les mêmes clés de
// position et le même état final, au réglage par défaut ET avec des règles du jour volontairement changées
// (setRulesOverride) : une partie sans champ `rules` suit RULES_V1, jamais les règles du jour.
//
// Couvert : les 40 parties témoins (Pouvoirs avec et sans pendule, Duel, Sans cartes, Rituel, Présages, parties
// terminées), leur relecture complète depuis l'état initial (initialStateOf + treeFromLog, comme l'Analyse), les
// états des salles enregistrées (Duel avec instantanés et cardPlayed vrai, partie terminée, Présage en cours…), la
// sauvegarde v1 de l'accueil, la partie locale, et les tirages (dealHands, completeDraft, chooseBotDraft) au défaut.
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { chooseBotDraft } from '../src/shared/bot';
import type { BotLevel } from '../src/shared/bot';
import type { CardId, Catalog } from '../src/shared/cards';
import type { GameRulesSettings } from '../src/shared/config/rules';
import {
  completeDraft, createGame, dealHands, legalMovesOf, playCard, playMove, positionKey,
} from '../src/shared/game';
import type { GameState, LogEntry } from '../src/shared/game';
import { initialStateOf, mainline, treeFromLog } from '../src/shared/pgn';
import { RULES_V1, rulesFor, sameRules, setRulesOverride } from '../src/shared/rules';
import { mulberry32 } from './helpers/rng';

const DOSSIER = new URL('./fixtures/v1/', import.meta.url);
const lire = <T>(rel: string): T => JSON.parse(readFileSync(new URL(rel, DOSSIER), 'utf8')) as T;
/** Copie JSON : ce que la base ou le navigateur gardent. */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface Action {
  k: 'move' | 'card';
  c: 'w' | 'b';
  from?: number;
  to?: number;
  promo?: 'q' | 'r' | 'b' | 'n';
  index?: number;
  card?: CardId;
  targets?: number[];
  info: unknown;
  cle: string;
}
interface Partie {
  id: string;
  catalog: Catalog;
  timed: boolean;
  generateur: { skin: string };
  depart: GameState;
  actions: Action[];
  etat_final: GameState;
}

const PARTIES: Partie[] = readdirSync(new URL('parties/', DOSSIER))
  .filter(f => /^\d+-.*\.json$/.test(f))
  .sort()
  .map(f => lire<Partie>(`parties/${f}`));

/** Règles du jour volontairement différentes de RULES_V1 (aucune ne doit toucher une partie déjà enregistrée). */
const AUTRES_REGLES: Partial<GameRulesSettings> = {
  cardsPerPlayer: 5, cardsPerTurn: 2, presageDelay: 4, fiftyHalfmoves: 150, repetitions: 4,
};
const REGLAGES: [string, Partial<GameRulesSettings> | null][] = [
  ['au défaut', null],
  ['avec d’autres règles du jour', AUTRES_REGLES],
];

afterEach(() => setRulesOverride(null));

/** Rejoue les actions d'une partie témoin depuis son état de départ ; compare chaque étape au témoin. */
function rejouer(p: Partie): GameState {
  let s = json(p.depart);
  for (const [n, a] of p.actions.entries()) {
    const ou = `${p.id}, action ${n + 1}`;
    const r = a.k === 'move' ? playMove(s, a.from!, a.to!, a.promo) : playCard(s, a.c, a.index!, a.targets!, p.generateur.skin);
    if (!r.ok) throw new Error(`${ou} : refusée (${r.error})`);
    expect(json(r.info), ou).toEqual(a.info);
    expect(positionKey(r.state), ou).toBe(a.cle);
    s = r.state;
  }
  return s;
}

describe.each(REGLAGES)('parties témoins v1, %s', (_nom, regles) => {
  it('se rejouent coup pour coup : mêmes informations, mêmes clés, même état final', () => {
    setRulesOverride(regles);
    expect(PARTIES).toHaveLength(40);
    for (const p of PARTIES) {
      const fin = rejouer(p);
      expect(json(fin), p.id).toEqual(p.etat_final);
    }
  });

  it('se relisent complètes depuis l’état initial (initialStateOf, treeFromLog), mêmes clés', () => {
    setRulesOverride(regles);
    for (const p of PARTIES) {
      const final = p.etat_final;
      const start = initialStateOf(final);
      expect(json(start), p.id).toEqual(p.depart);
      const { root, complete } = treeFromLog(start, final.log);
      expect(complete, p.id).toBe(true);
      const ligne = mainline(root);
      const fin = ligne[ligne.length - 1].state;
      expect(fin.keys, p.id).toEqual(final.keys);
      expect(fin.result, p.id).toEqual(final.result);
      expect(fin.log.map(e => ({ ...e })), p.id).toEqual(final.log);
    }
  });

  it('états des salles enregistrées (Duel avec cardPlayed vrai, Présage en cours, partie terminée) : relecture et suite', () => {
    setRulesOverride(regles);
    for (const nom of ['attente-invitation', 'choix-en-cours', 'ia-choix', 'pouvoirs-en-cours', 'duel-instantanes', 'terminee-classee', 'accueil-relais']) {
      const d = lire<{ state: GameState }>(`salles/${nom}.json`);
      const s = d.state;
      expect('rules' in s || 'cardsThisTurn' in s, nom).toBe(false);
      const { root, complete } = treeFromLog(initialStateOf(s), s.log);
      expect(complete, nom).toBe(true);
      const ligne = mainline(root);
      expect(ligne[ligne.length - 1].state.keys, nom).toEqual(s.keys);
      // La partie continue : ses coups sont ceux d'une partie V1 (même liste qu'une copie relue).
      expect(legalMovesOf(s), nom).toEqual(legalMovesOf(json(s)));
    }
    // Duel : une carte jouée, pas encore de coup (cardPlayed vrai) : plus de carte possible, un coup reste.
    const duel = lire<{ state: GameState }>('salles/duel-instantanes.json').state;
    expect(duel.cardPlayed).toBe(true);
    const turn = duel.pos.turn;
    const autre = duel.hands[turn].findIndex(h => !h.used);
    expect(playCard(duel, turn, autre, [], 'x')).toMatchObject({ ok: false, error: 'Une seule carte par tour.' });
    const m = legalMovesOf(duel)[0];
    const r = playMove(duel, m.from, m.to, m.promo);
    expect(r.ok && r.state.cardPlayed).toBe(false);
    expect(r.ok && 'cardsThisTurn' in r.state).toBe(false);
  });

  it('sauvegarde v1 de l’accueil et partie locale : relecture complète', () => {
    setRulesOverride(regles);
    const accueil = lire<{ valeur: { state: GameState } }>('accueil-v1.json').valeur.state;
    const { root, complete } = treeFromLog(initialStateOf(accueil), accueil.log);
    expect(complete).toBe(true);
    const ligne = mainline(root);
    expect(ligne[ligne.length - 1].state.keys).toEqual(accueil.keys);
    const locale = lire<{ partie: { local: { log: LogEntry[]; hands: Record<'w' | 'b', CardId[]>; timed: boolean; catalog: Catalog } } }>(
      'partie-locale.json',
    ).partie.local;
    const start = createGame(locale.hands, locale.timed, locale.catalog);
    const t = treeFromLog(start, locale.log);
    expect(t.complete).toBe(true);
    expect(mainline(t.root).at(-1)!.state.result).toEqual({ winner: 'w', reason: 'checkmate' });
  });
});

describe('tirages témoins v1, au défaut', () => {
  interface Tirages {
    dealHands: { graine: number; timed: boolean; mirror: boolean; catalog: Catalog; vsBot: boolean; mains: Record<'w' | 'b', CardId[]> }[];
    completeDraft: { graine: number; pool: CardId[]; partial: CardId[]; main: CardId[] }[];
    chooseBotDraft: { graine: number; niveau: BotLevel; pool: CardId[]; main: CardId[] }[];
  }
  const t = lire<Tirages>('tirages.json');
  it('dealHands : mêmes mains à graine égale', () => {
    for (const x of t.dealHands) {
      const h = dealHands(x.timed, mulberry32(x.graine), x.catalog, { vsBot: x.vsBot });
      // Mode miroir (retiré du moteur au lot 9) : la main des Blancs, tirée la première avec le même générateur, copiée.
      expect(x.mirror ? { w: h.w, b: h.w.slice() } : h, String(x.graine)).toEqual(x.mains);
    }
  });
  it('completeDraft : mêmes compléments à graine égale', () => {
    for (const x of t.completeDraft) expect(completeDraft(x.pool, x.partial, mulberry32(x.graine)), String(x.graine)).toEqual(x.main);
  });
  it('chooseBotDraft : mêmes choix de l’IA à graine égale', () => {
    for (const x of t.chooseBotDraft) expect(chooseBotDraft(x.pool, x.niveau, mulberry32(x.graine)), String(x.graine)).toEqual(x.main);
  });
  it('au défaut, une nouvelle partie n’écrit ni rules ni cardsThisTurn', () => {
    const s = createGame({ w: ['truce'], b: ['rift'] }, true, 'climats');
    if (sameRules(rulesFor('classee'), RULES_V1)) expect('rules' in s).toBe(false);
    expect('cardsThisTurn' in s).toBe(false);
  });
});
