// Aides de la main de cartes de la coque : pourquoi une carte n'est pas jouable, carte lancée ce tour, message
// après un lancement (décision D2 du plan V2). Partagées par l'accueil et la partie en ligne.
import { CARDS, isCardId } from '../../../shared/cards';
import type { CardId } from '../../../shared/cards';
import type { Color } from '../../../shared/chess';
import { cardRefusal } from '../../../shared/game';
import type { GameState } from '../../../shared/game';

/**
 * Pour chaque carte de `color` : pourquoi elle n'est pas jouable maintenant, en une phrase, ou null (jouable, ou
 * déjà jouée : la bulle le dit elle-même). `playable` : résultat de cardPlayable, déjà calculé par la page.
 */
export function handNotes(s: GameState, color: Color, myTurn: boolean, playable: boolean[]): (string | null)[] {
  return s.hands[color].map((h, i) => {
    if (h.used || playable[i] || !isCardId(h.card)) return null;
    if (s.result) return 'La partie est terminée.';
    if (!myTurn || s.pos.turn !== color) return 'Jouable à votre tour, avant votre coup.';
    if (s.cardPlayed) return 'Un seul sort par tour : vous en avez déjà lancé un.';
    let r: string | null = null;
    try {
      r = cardRefusal(s, color, i);
    } catch {
      r = null;
    }
    if (!r || r === 'Cible manquante.' || r === 'Cible invalide.') {
      return CARDS[h.card].targets ? 'Aucune case possible pour cette carte en ce moment.' : 'Pas jouable pour le moment.';
    }
    return r;
  });
}

/** Carte que `color` vient de lancer ce tour-ci, en attendant son coup (null sinon). */
export function castThisTurn(s: GameState, color: Color): CardId | null {
  if (!s.cardPlayed || s.result || s.pos.turn !== color) return null;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.k === 'move') return null;
    if (e.k === 'card' && e.c === color && !e.undone) return isCardId(e.card) ? e.card : null;
  }
  return null;
}

/** Message après un lancement : un Présage est annoncé, les autres cartes agissent tout de suite. */
export function castMessage(card: CardId): string {
  return CARDS[card]?.presage
    ? 'Annoncé : arrive au début de votre prochain tour. Jouez maintenant votre coup.'
    : 'Sort lancé. Jouez maintenant votre coup.';
}
