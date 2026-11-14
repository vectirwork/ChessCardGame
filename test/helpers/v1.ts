// Règles et mise en place d'avant la passe « polymorphe » (V1), pour les tests qui vérifient le moteur, le tirage, le
// serveur ou une page AUX RÈGLES V1 : ils les fixent explicitement et vérifient ainsi la même chose quel que soit le
// réglage du jour (lot 9e ; docs/REGLAGES.md, section 2). Un réglage par défaut changé ne fait échouer que les gardes
// voulus : test/garde-fous/defauts.test.ts (seul test qui épingle les valeurs par défaut), test/garde-fous/protocole.test.ts,
// test/reglages-doc.test.ts et checkRules (scripts/essai-reglage.mjs les liste).
//
// - createGame, createGameFromFen : ceux du moteur, aux règles RULES_V1 quand l'appel n'en donne pas (le moteur prend
//   sinon les règles du jour, rulesFor('classee')). Un test qui vérifie justement les règles du jour importe ceux de
//   src/shared/game.
// - dealHands, completeDraft, chooseBotDraft : de même, mains de RULES_V1.cardsPerPlayer cartes et mise en place
//   DEAL_V1 (contraintes, poids, essais) quand l'appel ne donne pas les siennes.
// - REGLAGES_V1 (GAME_RULES d'avant la passe, tiré de RULES_V1) et DEAL_V1 (DEAL d'avant la passe, écrit ici) : à
//   passer à setRulesOverride, dealHands, checkRules, aux textes…
// - reglerV1() : les règles des nouvelles parties fixées à REGLAGES_V1 (setRulesOverride) ; à défaire avec
//   setRulesOverride(null) dans afterEach. L'équilibrage des cartes reste celui de CARDS : un test qui en dépend
//   regarde reglesDuJourV1().
// - reglagesV1(), miseEnPlaceV1(), reglesDuJourV1(ctx), equilibrageV1() : GAME_RULES vaut-il REGLAGES_V1, DEAL vaut-il
//   DEAL_V1, les règles du jour de ce contexte sont-elles RULES_V1, l'équilibrage des cartes (CARDS) est-il celui de
//   RULES_V1 (vrai au réglage par défaut) ? Les photographies d'un texte qui suit les réglages gardent la chaîne exacte dans ce cas (et le même appel
//   qu'avant, valeurs par défaut des paramètres comprises), une forme dérivée ou les réglages V1 sinon ;
//   configDuJourV1() les réunit (avec RULES_BY_CONTEXT vide).
// - relireAvecConfigV1(rules, deal), defaireConfig() : pages, leçons et problèmes relus avec la configuration V1 (plus
//   les changements donnés), pour les textes calculés au chargement des modules.
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { vi } from 'vitest';
import type { DealSettings, GameRulesSettings, RulesContext } from '../../src/shared/config/rules';
import { DEAL, GAME_RULES, RULES_BY_CONTEXT, deepFreeze } from '../../src/shared/config/rules';
import { chooseBotDraft as chooseBotDraftDuJour } from '../../src/shared/bot';
import {
  completeDraft as completeDraftDuJour, createGame as createGameDuJour, createGameFromFen as createGameFromFenDuJour,
  dealHands as dealHandsDuJour,
} from '../../src/shared/game';
import { CARD_TUNING, RULES_V1, SETTING_KEYS, rulesFor, sameRules, setRulesOverride } from '../../src/shared/rulesCore';

export { RULES_V1 };

/** GAME_RULES d'avant la passe : les réglages de RULES_V1, sans le schéma ni l'équilibrage. */
export const REGLAGES_V1: GameRulesSettings = deepFreeze(
  Object.fromEntries(SETTING_KEYS.map(k => [k, RULES_V1[k]])) as unknown as GameRulesSettings,
);

/** DEAL d'avant la passe (commit 7148547) : choix en 45 s, au plus 1 Légendaire et 2 Climats, poids 4/3/2/1, 64 essais. */
export const DEAL_V1: DealSettings = deepFreeze({
  draft: true,
  draftMs: 45_000,
  handLimits: { maxPerRarity: { légendaire: 1 }, maxPerFamily: { climat: 2 } },
  limitsInDraft: false,
  rarityWeight: { commune: 4, rare: 3, épique: 2, légendaire: 1 },
  redrawAttempts: 64,
} satisfies DealSettings);

/** createGame du moteur, aux règles RULES_V1 si l'appel n'en donne pas. */
export const createGame: typeof createGameDuJour = (hands, timed, catalog, opts = {}) =>
  createGameDuJour(hands, timed, catalog, { ...opts, rules: opts.rules ?? RULES_V1 });

/** createGameFromFen du moteur, aux règles RULES_V1 si l'appel n'en donne pas. */
export const createGameFromFen: typeof createGameFromFenDuJour = (fen, hands, timed, catalog, opts = {}) =>
  createGameFromFenDuJour(fen, hands, timed, catalog, { ...opts, rules: opts.rules ?? RULES_V1 });

/** dealHands du moteur, mains de RULES_V1.cardsPerPlayer cartes et mise en place DEAL_V1 si l'appel n'en donne pas. */
export const dealHands: typeof dealHandsDuJour = (timed, rand, catalog, opts = {}) =>
  dealHandsDuJour(timed, rand, catalog, { ...opts, rules: opts.rules ?? RULES_V1, deal: opts.deal ?? DEAL_V1 });

/** completeDraft du moteur, à RULES_V1.cardsPerPlayer cartes si l'appel n'en donne pas le nombre. */
export const completeDraft: typeof completeDraftDuJour = (pool, partial, rand, count = RULES_V1.cardsPerPlayer, limits) =>
  completeDraftDuJour(pool, partial, rand, count, limits);

/** chooseBotDraft de l'IA, à RULES_V1.cardsPerPlayer cartes si l'appel n'en donne pas le nombre. */
export const chooseBotDraft: typeof chooseBotDraftDuJour = (pool, level, rand, opts = {}) =>
  chooseBotDraftDuJour(pool, level, rand, { ...opts, count: opts.count ?? RULES_V1.cardsPerPlayer });

/** Règles des nouvelles parties fixées à celles de V1 (surcharge de test) ; setRulesOverride(null) pour la retirer. */
export function reglerV1(): void {
  setRulesOverride(REGLAGES_V1);
}

/** Les règles du jour de ce contexte sont-elles RULES_V1, équilibrage des cartes compris (réglage par défaut) ? */
export function reglesDuJourV1(ctx: RulesContext = 'classee'): boolean {
  return sameRules(rulesFor(ctx), RULES_V1);
}

/** L'équilibrage des cartes du jour (coups, rangées, vitesse lus dans CARDS) est-il celui de RULES_V1 ? */
export function equilibrageV1(): boolean {
  return sameRules({ ...RULES_V1, tuning: CARD_TUNING }, RULES_V1);
}

/** GAME_RULES vaut-il REGLAGES_V1 (réglage par défaut) ? */
export function reglagesV1(): boolean {
  return SETTING_KEYS.every(k => GAME_RULES[k] === REGLAGES_V1[k]);
}

/** DEAL vaut-il DEAL_V1 (réglage par défaut) ? */
export function miseEnPlaceV1(): boolean {
  return isDeepStrictEqual({ ...DEAL }, { ...DEAL_V1 });
}

const CONFIG_REGLES = fileURLToPath(new URL('../../src/shared/config/rules.ts', import.meta.url));
const MODULE_CARTES = fileURLToPath(new URL('../../src/shared/cards.ts', import.meta.url));
type ConfigRules = typeof import('../../src/shared/config/rules');
type ModuleCartes = typeof import('../../src/shared/cards');

/**
 * Relit les modules du site avec la configuration de V1 (REGLAGES_V1, DEAL_V1, RULES_BY_CONTEXT vide, équilibrage et
 * textes des cartes de RULES_V1), plus les changements donnés : pour les pages, leçons et problèmes construits au
 * chargement. Après l'appel, `await import(…)` rend les modules relus (React et le routeur, hors de src, restent les
 * mêmes) ; defaireConfig() dans afterEach. Hors d'un réglage, ce n'est jamais la configuration du jour.
 */
export function relireAvecConfigV1(rules: Partial<GameRulesSettings> = {}, deal: Partial<DealSettings> = {}): void {
  vi.resetModules();
  vi.doMock(CONFIG_REGLES, async orig => {
    const m = await orig<ConfigRules>();
    return { ...m, GAME_RULES: Object.freeze({ ...REGLAGES_V1, ...rules }), DEAL: Object.freeze({ ...DEAL_V1, ...deal }), RULES_BY_CONTEXT: Object.freeze({}) };
  });
  vi.doMock(MODULE_CARTES, async orig => {
    const m = await orig<ModuleCartes>();
    const CARDS = { ...m.CARDS };
    const regles = { presageDelay: rules.presageDelay ?? REGLAGES_V1.presageDelay, tuning: RULES_V1.tuning };
    for (const id of m.CARD_IDS) CARDS[id] = { ...m.CARDS[id], ...RULES_V1.tuning[id], ...m.cardText(id, regles) };
    return { ...m, CARDS };
  });
}

/** Défait relireAvecConfigV1 : les `import()` suivants rendent de nouveau les modules du jour. */
export function defaireConfig(): void {
  vi.doUnmock(CONFIG_REGLES);
  vi.doUnmock(MODULE_CARTES);
  vi.resetModules();
}

/** Configuration du jour : est-ce celle de V1 (réglages, mise en place, contextes, équilibrage) ? */
export function configDuJourV1(): boolean {
  return reglagesV1() && miseEnPlaceV1() && Object.keys(RULES_BY_CONTEXT).length === 0 && equilibrageV1();
}
