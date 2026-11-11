// Libellés uniques : couleur, catalogue, nature d'une partie, nom de carte. Aucun import à l'exécution : les
// registres (CATALOGS, CARDS) sont passés par l'appelant, pour que ce module reste lisible partout.
// Chaque variante reproduit une copie actuelle du site (apostrophe comprise) ; les copies locales disparaissent
// au profit de ces fonctions (lots 5 et 8).

import type { Catalog } from '../cards';
import type { Color } from '../chess';
import type { GameMode } from '../protocol';

/** « Blancs », « Noirs » ; avec un article : « les Blancs », « des Noirs », « aux Blancs ». */
export function colorName(c: Color, article?: 'les' | 'des' | 'aux'): string {
  const nom = c === 'w' ? 'Blancs' : 'Noirs';
  return article ? `${article} ${nom}` : nom;
}

/** Catalogue d'une partie qui n'est plus proposé (états sans catalogue, anciennes parties). */
export const LEGACY_CATALOG_LABEL = 'Duel';

/**
 * Libellé du jeu d'une partie : « Pouvoirs », « Sans cartes ». Un seul repli pour un catalogue absent ou plus
 * proposé : « Duel », ou avec `detail` « Duel (ancienne formule) ».
 * `catalogs` : la liste CATALOGS de cards.ts.
 */
export function catalogLabel(
  c: Catalog | string | null | undefined,
  catalogs: readonly { id: string; label: string }[],
  detail = false,
): string {
  return catalogs.find(x => x.id === c)?.label ?? (detail ? `${LEGACY_CATALOG_LABEL} (ancienne formule)` : LEGACY_CATALOG_LABEL);
}

/**
 * Nature d'une partie.
 * - 'badge' (en-tête de la partie, choix des cartes) : « Contre l'IA », « Entre amis », « Partie classée »,
 *   « Partie amicale » ;
 * - 'liste' (Mes parties) : « Classée » pour toute partie classée, sinon « Contre l’IA », « Partie rapide »,
 *   « Invitation ».
 */
export function modeLabel(mode: GameMode, rated: boolean, style: 'badge' | 'liste' = 'badge'): string {
  if (style === 'liste') {
    if (rated) return 'Classée';
    return mode === 'bot' ? 'Contre l’IA' : mode === 'quick' ? 'Partie rapide' : 'Invitation';
  }
  if (mode === 'bot') return "Contre l'IA";
  if (mode === 'invite') return 'Entre amis';
  return rated ? 'Partie classée' : 'Partie amicale';
}

/** Nom d'une carte ; une carte inconnue (retirée du jeu, ancienne partie) garde son identifiant. `cards` : CARDS. */
export function cardName(id: string, cards: Readonly<Record<string, { name: string }>>): string {
  return Object.hasOwn(cards, id) ? cards[id].name : id;
}
