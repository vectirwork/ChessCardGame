// Équipement et possession des skins côté client (boutique, compte, accueil), pour chaque emplacement (SLOT_DEFS).
// Non connecté : on possède les objets offerts et l'on porte les objets par défaut.
import { DEFAULT_ITEM, FREE_ITEMS, SLOTS, SLOT_DEFS, itemById } from '../shared/catalog';
import type { ItemKind } from '../shared/catalog';
import type { MeUser } from '../shared/protocol';

type Me = MeUser | null | undefined;

/** Champ de MeUser qui porte l'objet de chaque emplacement (un champ absent de MeUser ne compile pas : equippedId). */
const FIELD = Object.fromEntries(SLOTS.map(k => [k, SLOT_DEFS[k].meField])) as { [K in ItemKind]: (typeof SLOT_DEFS)[K]['meField'] };

/**
 * Préférence locale « Rois adverses classiques » (usePref) : en partie, le roi adverse s'affiche en roi Arcane. Lue en
 * partie, à l'accueil et dans l'analyse ; réglée dans le compte. Définie dans features/history.ts, qui reste léger
 * (« Mes parties » n'importe pas le catalogue).
 */
export { CLASSIC_KINGS_PREF } from './features/history';

/** Objet porté dans un emplacement (défaut si non connecté, ou si le serveur ne l'envoie pas encore). */
export function equippedId(me: Me, kind: ItemKind): string {
  return me?.[FIELD[kind]] || DEFAULT_ITEM[kind];
}

/** L'objet est-il porté dans son emplacement ? */
export function isEquipped(me: Me, id: string): boolean {
  const it = itemById(id);
  return !!it && equippedId(me, it.kind) === id;
}

/** L'objet est-il dans la collection (objets offerts compris) ? */
export function owns(me: Me, id: string): boolean {
  return FREE_ITEMS.includes(id) || !!me?.items.includes(id);
}

/** Panoplie portée : un objet par emplacement. */
export function panoplieOf(me: Me): Record<ItemKind, string> {
  return Object.fromEntries(SLOTS.map(k => [k, equippedId(me, k)])) as Record<ItemKind, string>;
}

/** Objets possédés, offerts compris (pour productPrice et quoteCart, qui ne comptent jamais un objet offert). */
export function ownedIds(me: Me): string[] {
  return [...new Set([...FREE_ITEMS, ...(me?.items ?? [])])];
}
