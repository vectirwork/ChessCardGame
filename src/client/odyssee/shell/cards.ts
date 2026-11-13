// Aides de la main de cartes de la coque : pourquoi une carte n'est pas jouable, cartes lancées ce tour, message
// après un lancement (décision D2 du plan V2). Partagées par l'accueil et la partie en ligne. Les phrases suivent les
// règles de la partie (rulesOf(state)) : nombre de cartes par tour, carte à la place du coup, délai des Présages.
import { CARDS, isCardId } from '../../../shared/cards';
import type { CardId } from '../../../shared/cards';
import type { Color } from '../../../shared/chess';
import { GAME_RULES } from '../../../shared/config/rules';
import type { Rules } from '../../../shared/config/rules';
import { castsThisTurn as castsOfTurn, cardRefusalInfo } from '../../../shared/game';
import type { GameState, Refusal } from '../../../shared/game';
import { rulesOf } from '../../../shared/rulesCore';
import { apresLancement, dejaLance } from '../../../shared/text/regles';

/** Refus « cible » du moteur (par leur code, jamais par leur texte) : la bulle dit plutôt qu'aucune case ne convient. */
const TARGET_CODES: readonly string[] = ['target-missing', 'target-invalid'];

/**
 * Pour chaque carte de `color` : pourquoi elle n'est pas jouable maintenant, en une phrase, ou null (jouable, ou
 * déjà jouée : la bulle le dit elle-même). `playable` : résultat de cardPlayable, déjà calculé par la page.
 */
export function handNotes(s: GameState, color: Color, myTurn: boolean, playable: boolean[]): (string | null)[] {
  const r = rulesOf(s);
  return s.hands[color].map((h, i) => {
    if (h.used || playable[i] || !isCardId(h.card)) return null;
    if (s.result) return 'La partie est terminée.';
    if (!myTurn || s.pos.turn !== color) return r.cardEndsTurn ? 'Jouable à votre tour, à la place de votre coup.' : 'Jouable à votre tour, avant votre coup.';
    if (s.cardPlayed) return dejaLance(r);
    let ref: Partial<Refusal> | null = null;
    try {
      ref = cardRefusalInfo(s, color, i);
    } catch {
      ref = null;
    }
    const target = !ref?.error || (!!ref.code && TARGET_CODES.includes(ref.code));
    if (target) return CARDS[h.card].targets ? 'Aucune case possible pour cette carte en ce moment.' : 'Pas jouable pour le moment.';
    return ref!.error!;
  });
}

/**
 * Cartes que `color` a lancées depuis son dernier coup, dans l'ordre (vide hors de son tour ou partie finie). Avec
 * une carte par tour, au plus une ; elle reste listée tant que le coup n'est pas joué.
 */
export function castsThisTurn(s: GameState, color: Color): CardId[] {
  return castsOfTurn(s, color);
}

/**
 * Carte que `color` vient de lancer ce tour-ci, une fois son budget de cartes épuisé, en attendant son coup (null
 * sinon). Gardée pour l'accueil ; la partie en ligne lit castsThisTurn.
 */
export function castThisTurn(s: GameState, color: Color): CardId | null {
  if (!s.cardPlayed || s.result || s.pos.turn !== color) return null;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.k === 'move') return null;
    if (e.k === 'card' && e.c === color && !e.undone) return isCardId(e.card) ? e.card : null;
  }
  return null;
}

/**
 * Message après un lancement : un Présage est annoncé, les autres cartes agissent tout de suite (apresLancement).
 * `left` : cartes encore permises ce tour (castsLeft). Défaut : « Sort lancé. Jouez maintenant votre coup. ».
 */
export function castMessage(card: CardId, r: Pick<Rules, 'cardEndsTurn' | 'presageDelay'> = GAME_RULES, left = 0): string {
  return apresLancement(r, !!CARDS[card]?.presage, left);
}
