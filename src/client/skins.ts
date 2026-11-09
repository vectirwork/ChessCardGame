// Équipement et possession des skins côté client (boutique, compte, accueil), pour les trois emplacements.
// Non connecté : on possède les objets offerts et l'on porte les objets par défaut.
import { DEFAULT_ITEM, FREE_ITEMS, itemById } from '../shared/catalog';
import type { ItemKind } from '../shared/catalog';
import type { MeUser } from '../shared/protocol';

type Me = MeUser | null | undefined;

const FIELD = { king: 'equippedKing', board: 'equippedBoard', skin: 'equippedSkin' } as const satisfies Record<ItemKind, keyof MeUser>;

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
