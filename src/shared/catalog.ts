// Catalogue de la boutique : rois, échiquiers et sorts (skins), collections, produits et prix.
// Modifier src/shared/skins/ suffit pour changer l'offre ; les prix sont dans la grille PRICE ci-dessous (centimes
// d'euro, TTC). Règle (testée) : un identifiant d'objet ou de produit déjà vendu ne disparaît ni ne change de sens
// (user_items, equipped_*, purchases.product_id le référencent), et son prix ne monte jamais. Les noms, si.
import { BOARD_ITEMS } from './skins/boards';
import { COLLECTIONS } from './skins/collections';
import { KING_ITEMS } from './skins/kings';
import { SPELL_ITEMS } from './skins/spells';
import type { BoardStyle, Collection, Item, ItemKind, KingStyle, Product, SkinRarity, SkinStyle } from './skins/types';

export * from './skins/types';
export { COLLECTIONS } from './skins/collections';
export { KING_ART, KING_BASE } from './skins/kings';

export const ITEMS: Item[] = [...KING_ITEMS, ...BOARD_ITEMS, ...SPELL_ITEMS];

/** Emplacements, dans l'ordre d'affichage. */
export const SLOTS = ['king', 'board', 'skin'] as const satisfies readonly ItemKind[];
export const SLOT_LABEL: Record<ItemKind, string> = { king: 'Roi', board: 'Échiquier', skin: 'Sorts' };

/** Libellé et couleur de chaque rareté (le violet de l'épique et l'or du légendaire sont ceux des cartes de pouvoir). */
export const RARITY: Record<SkinRarity, { label: string; color: string }> = {
  offert: { label: 'Offert', color: '#c9c6dc' },
  rare: { label: 'Rare', color: '#5ee7ff' },
  epique: { label: 'Épique', color: '#c79bff' },
  legendaire: { label: 'Légendaire', color: '#f3c969' },
};
/** Rang de rareté (offert 0 … légendaire 3). */
const RANK: Record<SkinRarity, number> = { offert: 0, rare: 1, epique: 2, legendaire: 3 };

/**
 * Grille des prix (centimes TTC) par rareté et par emplacement. Un objet peut la contredire par `priceCents` : deux
 * exceptions, pour qu'aucun prix déjà pratiqué ne monte (échiquier Rubis 1,99 €, sorts Céleste 3,99 €).
 */
export const PRICE: Record<Exclude<SkinRarity, 'offert'>, Record<ItemKind | 'collection', number>> = {
  rare: { king: 299, board: 199, skin: 299, collection: 599 },
  epique: { king: 399, board: 249, skin: 399, collection: 799 },
  legendaire: { king: 499, board: 299, skin: 499, collection: 999 },
};

export const DEFAULT_SKIN = 'skin:arcane';
export const DEFAULT_BOARD = 'board:arcane';
export const DEFAULT_KING = 'king:arcane';
export const DEFAULT_ITEM: Record<ItemKind, string> = { king: DEFAULT_KING, board: DEFAULT_BOARD, skin: DEFAULT_SKIN };

/**
 * Apparence des IA du serveur (par niveau) et de l'Oracle de l'accueil. Vitrine : elles peuvent porter du payant.
 * Avant les rois, l'IA avait les sorts Arcane, Inferno et Néant, et l'Oracle Néant : gardés.
 */
export const BOT_LOOK: Record<1 | 2 | 3, { skin: string; king: string }> = {
  1: { skin: 'skin:arcane', king: 'king:arcane' },
  2: { skin: 'skin:inferno', king: 'king:braise' },
  3: { skin: 'skin:void', king: 'king:eclipse' },
};
export const ORACLE_LOOK: { skin: string; king: string } = { skin: 'skin:void', king: 'king:eclipse' };

export const itemById = (id: string): Item | undefined => ITEMS.find(i => i.id === id);
export const FREE_ITEMS = ITEMS.filter(i => i.free).map(i => i.id);

/** Prix à l'unité d'un objet (centimes TTC) ; 0 s'il est offert ou inconnu. */
export function unitPrice(itemId: string): number {
  const it = itemById(itemId);
  if (!it || it.free || it.rarity === 'offert') return 0;
  return it.priceCents ?? PRICE[it.rarity][it.kind];
}

const sum = (ids: readonly string[]) => ids.reduce((s, id) => s + unitPrice(id), 0);

const COLLECTION_OF = new Map<string, Collection>();
for (const c of COLLECTIONS) for (const id of [c.king, c.board, c.skin]) COLLECTION_OF.set(id, c);
/** Collection d'un objet (Bois de chêne et Ardoise n'en ont pas). */
export const collectionOf = (itemId: string): Collection | undefined => COLLECTION_OF.get(itemId);
export const collectionById = (id: string): Collection | undefined => COLLECTIONS.find(c => c.id === id);
/** Les trois objets d'une collection, dans l'ordre des emplacements. */
export const collectionItems = (c: Collection): string[] => [c.king, c.board, c.skin];

/** Libellé d'un objet vendu à l'unité : « Roi de braise », « Échiquier Obsidienne & Or », « Sorts Inferno ». */
export function itemLabel(it: Item): string {
  if (it.kind === 'board') return `Échiquier ${it.name}`;
  if (it.kind === 'skin') return `Sorts ${it.name}`;
  return it.name;
}

const PREMIUM = ITEMS.filter(i => !i.free);
const premiumOf = (kind: ItemKind) => PREMIUM.filter(i => i.kind === kind).map(i => i.id);
const pct = (price: number, compare: number) => `-${Math.round((1 - price / compare) * 100)} %`;

const unitProducts: Product[] = PREMIUM.map(it => ({
  id: it.id,
  kind: 'item',
  name: itemLabel(it),
  description: it.description,
  priceCents: unitPrice(it.id),
  items: [it.id],
  badge: it.id === 'skin:inferno' ? 'Populaire' : it.isNew ? 'Nouveau' : undefined,
}));

const collectionProducts: Product[] = COLLECTIONS.filter(c => c.rarity !== 'offert').map(c => {
  const items = collectionItems(c);
  return {
    id: c.id,
    kind: 'collection',
    name: `Collection ${c.name}`,
    description: c.tagline,
    priceCents: PRICE[c.rarity as Exclude<SkinRarity, 'offert'>].collection,
    items,
    compareAtCents: sum(items),
    collection: c.id,
  };
});

const skinsPack = premiumOf('skin');
const tresor = PREMIUM.map(i => i.id);
/** Contenu du Grimoire complet le jour de son retrait (5 sorts et 4 échiquiers) : il ne change plus. */
const ALL_PACK = ['skin:inferno', 'skin:neon', 'skin:celestial', 'skin:void', 'skin:sakura', 'board:marble', 'board:obsidian', 'board:jade', 'board:ruby'];

const packProducts: Product[] = [
  {
    id: 'pack:skins',
    kind: 'pack',
    name: 'Grimoire des sorts',
    description: `Les ${skinsPack.length} sorts premium, et les prochains offerts.`,
    priceCents: 1299,
    items: skinsPack,
    compareAtCents: sum(skinsPack),
    badge: pct(1299, sum(skinsPack)),
    future: ['skin'],
  },
  {
    id: 'pack:tresor',
    kind: 'pack',
    name: 'Trésor du Bazar',
    description: `Les ${tresor.length} objets des ${COLLECTIONS.length - 1} collections premium : rois, échiquiers et sorts.`,
    priceCents: 2499,
    items: tresor,
    compareAtCents: sum(tresor),
    badge: 'Meilleure offre',
  },
  {
    id: 'pack:all',
    kind: 'pack',
    name: 'Grimoire complet',
    description: 'Tous les skins et tous les plateaux premium.',
    priceCents: 1299,
    items: ALL_PACK,
    compareAtCents: sum(ALL_PACK),
    future: ['skin', 'board'],
    retired: true,
  },
];

/** Tous les produits, retirés compris (historique des achats, remboursements, promesses des packs). */
export const ALL_PRODUCTS: Product[] = [...unitProducts, ...collectionProducts, ...packProducts];
/** Produits en vente : un par objet payant, un par collection premium, les packs (sans les produits retirés). */
export const PRODUCTS: Product[] = ALL_PRODUCTS.filter(p => !p.retired);

const PRODUCT_BY_ID = new Map(ALL_PRODUCTS.map(p => [p.id, p]));
/** Produit par identifiant, retiré compris (le paiement refuse `retired`). */
export const productById = (id: string): Product | undefined => PRODUCT_BY_ID.get(id);

export function skinStyle(id: string | undefined): SkinStyle {
  return (itemById(id ?? '')?.skin ?? itemById(DEFAULT_SKIN)!.skin)!;
}
export function boardStyle(id: string | undefined): BoardStyle {
  return (itemById(id ?? '')?.board ?? itemById(DEFAULT_BOARD)!.board)!;
}
export function kingStyle(id: string | undefined): KingStyle {
  return (itemById(id ?? '')?.king ?? itemById(DEFAULT_KING)!.king)!;
}
/** Identifiant de roi connu, sinon le roi Arcane (parties enregistrées avant les rois, identifiant inconnu). */
export function normKing(id: string | undefined | null): string {
  return id && itemById(id)?.kind === 'king' ? id : DEFAULT_KING;
}

/**
 * Prix d'un produit (centimes TTC) pour qui possède `owned`. Fait foi au serveur (montant Stripe) ; le client affiche
 * le même nombre.
 * - Objet et pack : prix fixe.
 * - Collection (« compléter la collection ») : prix de la collection moins la valeur à l'unité des pièces possédées,
 *   jamais sous le prix à l'unité de la pièce manquante la moins chère.
 * null : il possède déjà tout.
 */
export function productPrice(p: Product, owned: readonly string[]): number | null {
  const have = new Set(owned);
  const missing = p.items.filter(i => !have.has(i));
  if (!missing.length) return null;
  if (p.kind !== 'collection') return p.priceCents;
  const ownedValue = sum(p.items.filter(i => have.has(i)));
  return Math.max(p.priceCents - ownedValue, Math.min(...missing.map(unitPrice)));
}

export interface CartLine {
  label: string;
  items: string[];
  cents: number;
  /** Produit facturé : l'objet à l'unité, ou la collection complétée. */
  productId: string;
}

/**
 * Panier d'essai (au plus un objet par emplacement) : prix total et lignes. Une collection que le panier complète
 * (ses pièces manquantes sont toutes dans le panier) est comptée au prix « compléter » s'il est plus bas que la somme
 * des pièces à l'unité. Les collections sont disjointes : ce calcul glouton est optimal.
 * null : panier invalide (objet inconnu, deux objets du même emplacement) ou rien à payer.
 */
export function quoteCart(itemIds: readonly string[], owned: readonly string[]): { totalCents: number; lines: CartLine[] } | null {
  const items = itemIds.map(itemById);
  if (items.some(i => !i)) return null;
  const kinds = items.map(i => i!.kind);
  if (new Set(kinds).size !== kinds.length) return null;
  const have = new Set(owned);
  const buy = items.filter(i => !i!.free && !have.has(i!.id)).map(i => i!.id);
  if (!buy.length) return null;
  const lines: CartLine[] = [];
  const done = new Set<string>();
  for (const id of buy) {
    if (done.has(id)) continue;
    const c = collectionOf(id);
    const product = c && productById(c.id);
    if (c && product) {
      const missing = collectionItems(c).filter(i => !have.has(i));
      const complete = missing.every(i => buy.includes(i));
      const price = complete ? productPrice(product, owned) : null;
      if (price !== null && price < sum(missing)) {
        lines.push({ label: product.name, items: missing, cents: price, productId: product.id });
        missing.forEach(i => done.add(i));
        continue;
      }
    }
    lines.push({ label: itemLabel(itemById(id)!), items: [id], cents: unitPrice(id), productId: id });
    done.add(id);
  }
  return { totalCents: lines.reduce((s, l) => s + l.cents, 0), lines };
}

/**
 * Sceau de collection : la collection premium complète la plus rare (à rareté égale, l'ordre du catalogue) ; null
 * sinon. Arcane ne compte jamais.
 */
export function sealOf(items: readonly string[]): string | null {
  const have = new Set(items);
  let best: Collection | null = null;
  for (const c of COLLECTIONS) {
    if (c.rarity === 'offert') continue;
    if (!collectionItems(c).every(i => have.has(i))) continue;
    if (!best || RANK[c.rarity] > RANK[best.rarity]) best = c;
  }
  return best?.id ?? null;
}

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
