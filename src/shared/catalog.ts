// Catalogue de la boutique : rois, échiquiers et sorts (skins), collections, produits et prix.
// Modifier src/shared/skins/ suffit pour changer l'offre ; les prix sont dans la grille PRICE ci-dessous (centimes
// d'euro, TTC). Règle (testée) : un identifiant d'objet ou de produit déjà vendu ne disparaît ni ne change de sens
// (user_items, equipped_*, purchases.product_id le référencent), et son prix ne monte jamais. Les noms, si. Un objet
// qu'on ne vend plus prend `retired: true` (hors rayons, hors packs, et les collections qui le contiennent ne se
// vendent plus ; toujours résolu).
// Les emplacements (roi, échiquier, sorts) sont décrits dans src/shared/skins/slots.ts : tout ce qui suit en dérive.
import { BOARD_ITEMS } from './skins/boards';
import { COLLECTIONS, TRESOR_RING } from './skins/collections';
import { KING_ITEMS } from './skins/kings';
import { SLOT_DEFS } from './skins/slots';
import { SPELL_ITEMS } from './skins/spells';
import type { BoardStyle, Collection, Item, ItemKind, KingStyle, Product, SkinRarity, SkinStyle } from './skins/types';
import type { BotLevel } from './bot';
import { LOCALE, liste } from './text/fr';

export * from './skins/types';
export { COLLECTIONS } from './skins/collections';
export { KING_ART, KING_BASE } from './skins/kings';
export { SLOT_DEFS } from './skins/slots';
export type { SlotDef, SlotRayon } from './skins/slots';
// Phrases de la boutique, du compte et des e-mails : skins/texts.ts, à importer de là. TRANSITOIRE : whoSees et
// selectionLabel restent réexportés ici pour le serveur (mail.ts, shop.ts, qui les importent encore de catalog.ts).
// Cette réexportation range texts.ts dans le morceau du catalogue, que chargent l'accueil et la partie (≈ 0,6 ko
// compressé) : à retirer dès que mail.ts et shop.ts importent de skins/texts.ts.
export { selectionLabel, whoSees } from './skins/texts';
export { LOCALE } from './text/fr';

// ---------------------------------------------------------------------------------------------
// Réglages de la vente

/** Monnaie des prix et des paiements (code ISO, en minuscules comme chez Stripe). */
export const CURRENCY = 'eur';
/** Prestataire de paiement, tel que nommé dans les textes (« Paiement sécurisé par Stripe »). */
export const PAYMENT_PROVIDER = 'Stripe';
/** Mis en essai à la première arrivée dans la boutique, quand rien d'autre n'est demandé. */
export const SHOP_FEATURED: Readonly<Partial<Record<ItemKind, string>>> = { king: 'king:braise' };
/**
 * Contenu du Trésor du Bazar (décision Q2 du fondateur ; au défaut, le comportement d'aujourd'hui) :
 * - `items` : 'premium', tous les objets payants en vente (un objet ajouté au catalogue y entre pour les acheteurs
 *   suivants), ou une liste figée d'identifiants (un objet retiré de la vente en sort) ;
 * - `future` : emplacements promis aux acheteurs, « et les prochains offerts » (promisedItems) ; vide : aucune promesse.
 * Le prix reste fixe (priceCents du pack), même pour qui possède déjà une partie du contenu.
 */
export const TRESOR: { readonly items: 'premium' | readonly string[]; readonly future: readonly ItemKind[] } = { items: 'premium', future: [] };

export const ITEMS: Item[] = [...KING_ITEMS, ...BOARD_ITEMS, ...SPELL_ITEMS];

// ---------------------------------------------------------------------------------------------
// Emplacements (dérivés de SLOT_DEFS)

/** Emplacements, dans l'ordre d'affichage. */
export const SLOTS = Object.keys(SLOT_DEFS) as ItemKind[];
const slotMap = <T>(f: (k: ItemKind) => T) => Object.fromEntries(SLOTS.map(k => [k, f(k)])) as Record<ItemKind, T>;
export const SLOT_LABEL: Record<ItemKind, string> = slotMap(k => SLOT_DEFS[k].label);

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

export const DEFAULT_ITEM: Record<ItemKind, string> = slotMap(k => SLOT_DEFS[k].default);
export const DEFAULT_SKIN = DEFAULT_ITEM.skin;
export const DEFAULT_BOARD = DEFAULT_ITEM.board;
export const DEFAULT_KING = DEFAULT_ITEM.king;

/**
 * Apparence des IA du serveur (par niveau) et de l'Oracle de l'accueil. Vitrine : elles peuvent porter du payant.
 * Avant les rois, l'IA avait les sorts Arcane, Inferno et Néant, et l'Oracle Néant : gardés.
 */
export const BOT_LOOK: Record<BotLevel, { skin: string; king: string }> = {
  1: { skin: 'skin:arcane', king: 'king:arcane' },
  2: { skin: 'skin:inferno', king: 'king:braise' },
  3: { skin: 'skin:void', king: 'king:eclipse' },
};
export const ORACLE_LOOK: { skin: string; king: string } = { skin: 'skin:void', king: 'king:eclipse' };

export const itemById = (id: string): Item | undefined => ITEMS.find(i => i.id === id);
export const FREE_ITEMS = ITEMS.filter(i => i.free).map(i => i.id);
/** Objets des rayons (tous sauf les retirés), dans l'ordre du catalogue. Un objet retiré reste montré à qui le possède. */
export const SHOP_ITEMS: Item[] = ITEMS.filter(i => !i.retired);
/** Objets payants en vente (ni offerts, ni retirés), dans l'ordre du catalogue. */
export const PREMIUM_ITEMS: Item[] = SHOP_ITEMS.filter(i => !i.free);

/** Identifiant d'objet connu et de cet emplacement, sinon l'objet par défaut de l'emplacement. */
export function normItem(kind: ItemKind, id: string | undefined | null): string {
  return id && itemById(id)?.kind === kind ? id : DEFAULT_ITEM[kind];
}

/** Objets d'une liste rangés par emplacement (ordre de la liste) ; `unknown` : identifiants inconnus. */
export interface SlotSplit {
  items: Item[];
  unknown: string[];
  of: Record<ItemKind, Item[]>;
}
/**
 * Range des objets par emplacement. La règle « au plus un objet par emplacement » (essai, panier, équipement,
 * livraison) s'écrit avec : `duplicated(bySlot(ids))`, ou `alone(s, k)` pour l'objet seul de son emplacement.
 */
export function bySlot(ids: readonly string[]): SlotSplit {
  const s: SlotSplit = { items: [], unknown: [], of: slotMap(() => []) };
  for (const id of ids) {
    const it = itemById(id);
    if (!it) s.unknown.push(id);
    else {
      s.items.push(it);
      s.of[it.kind].push(it);
    }
  }
  return s;
}
/** Un emplacement au moins a plusieurs objets. */
export const duplicated = (s: SlotSplit): boolean => SLOTS.some(k => s.of[k].length > 1);
/** L'objet seul de son emplacement, s'il est seul. */
export const alone = (s: SlotSplit, k: ItemKind): Item | undefined => (s.of[k].length === 1 ? s.of[k][0] : undefined);

/** Prix à l'unité d'un objet (centimes TTC) ; 0 s'il est offert ou inconnu. */
export function unitPrice(itemId: string): number {
  const it = itemById(itemId);
  if (!it || it.free || it.rarity === 'offert') return 0;
  return it.priceCents ?? PRICE[it.rarity][it.kind];
}

const sum = (ids: readonly string[]) => ids.reduce((s, id) => s + unitPrice(id), 0);

const COLLECTION_OF = new Map<string, Collection>();
/** Les objets d'une collection, un par emplacement, dans l'ordre des emplacements. */
export const collectionItems = (c: Collection): string[] => SLOTS.map(k => c[k]);
for (const c of COLLECTIONS) for (const id of collectionItems(c)) COLLECTION_OF.set(id, c);
/** Collection d'un objet (Bois de chêne et Ardoise n'en ont pas). */
export const collectionOf = (itemId: string): Collection | undefined => COLLECTION_OF.get(itemId);
export const collectionById = (id: string): Collection | undefined => COLLECTIONS.find(c => c.id === id);
/** Collections premium (toutes sauf les offertes), dans l'ordre du catalogue. */
export const PREMIUM_COLLECTIONS: Collection[] = COLLECTIONS.filter(c => c.rarity !== 'offert');
/** Nom du sceau d'une collection (son exclusivité) : « Sceau de la Forge ». */
export const sealName = (c: Collection): string => c.sealName ?? `Sceau ${c.name}`;

/**
 * Sceaux du bandeau du Trésor : toutes les collections premium, celles de TRESOR_RING d'abord (dans son ordre), puis
 * les autres par rareté décroissante. Le premier est au centre.
 */
export function tresorSeals(): Collection[] {
  const placed = TRESOR_RING.map(collectionById).filter((c): c is Collection => !!c && PREMIUM_COLLECTIONS.includes(c));
  const rest = PREMIUM_COLLECTIONS.filter(c => !placed.includes(c)).sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
  return [...placed, ...rest];
}

/** Libellé d'un objet vendu à l'unité : « Roi de braise », « Échiquier Obsidienne & Or », « Sorts Inferno ». */
export function itemLabel(it: Item): string {
  const d = SLOT_DEFS[it.kind];
  return d.named ? it.name : `${d.label} ${it.name}`;
}

const pct = (price: number, compare: number) => `-${Math.round((1 - price / compare) * 100)} %`;

const unitProducts: Product[] = ITEMS.filter(i => !i.free).map(it => ({
  id: it.id,
  kind: 'item',
  name: itemLabel(it),
  description: it.description,
  priceCents: unitPrice(it.id),
  items: [it.id],
  badge: it.badge ?? (it.isNew ? 'Nouveau' : undefined),
  ...(it.retired ? { retired: true } : {}),
}));

const collectionProducts: Product[] = PREMIUM_COLLECTIONS.map(c => {
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
    // Une collection qui contient un objet retiré ne se vend plus (elle le vendrait) ; son sceau reste à qui l'a complétée
    ...(items.some(i => itemById(i)?.retired) ? { retired: true } : {}),
  };
});

/**
 * Pack : prix fixe écrit une fois ; prix barré (somme à l'unité) calculé ; badge `'%'` : la remise calculée
 * (« -46 % »). Mêmes clés, dans le même ordre, que les produits écrits à la main d'avant.
 */
function pack(p: Omit<Product, 'kind' | 'compareAtCents'>): Product {
  const compareAtCents = sum(p.items);
  const { id, name, description, priceCents, items, badge, future, retired, display, shortName } = p;
  return {
    id, kind: 'pack', name, description, priceCents, items, compareAtCents,
    ...(badge ? { badge: badge === '%' ? pct(priceCents, compareAtCents) : badge } : {}),
    ...(future ? { future } : {}),
    ...(retired ? { retired } : {}),
    ...(display ? { display } : {}),
    ...(shortName ? { shortName } : {}),
  };
}

const premiumOf = (kind: ItemKind) => PREMIUM_ITEMS.filter(i => i.kind === kind).map(i => i.id);
const skinsPack = premiumOf('skin');
/** Contenu du Grimoire complet le jour de son retrait (5 sorts et 4 échiquiers) : il ne change plus. */
const ALL_PACK = ['skin:inferno', 'skin:neon', 'skin:celestial', 'skin:void', 'skin:sakura', 'board:marble', 'board:obsidian', 'board:jade', 'board:ruby'];

/**
 * Le Trésor du Bazar selon son réglage (TRESOR) : contenu, description dérivée du contenu (« Les 21 objets des
 * 7 collections premium : rois, échiquiers et sorts. »), promesse. Exportée pour les tests d'autres réglages.
 */
export function tresorPack(t: typeof TRESOR): Product {
  const items =
    t.items === 'premium'
      ? PREMIUM_ITEMS.map(i => i.id)
      : t.items.filter(id => {
          const it = itemById(id);
          return !!it && !it.free && !it.retired;
        });
  const kinds = SLOTS.filter(k => items.some(id => itemById(id)?.kind === k));
  const colls = PREMIUM_COLLECTIONS.filter(c => collectionItems(c).some(i => items.includes(i))).length;
  const what = `${items.length > 1 ? `Les ${items.length} objets` : 'L’objet'} ${colls > 1 ? `des ${colls} collections premium` : 'd’une collection premium'}`;
  const promise = t.future.length ? ', et les prochains offerts' : '';
  return pack({
    id: 'pack:tresor',
    name: 'Trésor du Bazar',
    description: `${what} : ${liste(kinds.map(k => SLOT_DEFS[k].words))}${promise}.`,
    priceCents: 2499,
    items,
    badge: 'Meilleure offre',
    ...(t.future.length ? { future: [...t.future] } : {}),
    display: 'banner',
    shortName: 'le Trésor',
  });
}

/**
 * Packs. `display` : où la boutique le montre (en tête d'un rayon d'emplacement, ou en bandeau sous les collections) ;
 * sans `display`, un pack en vente n'est montré qu'à l'accueil.
 */
const packProducts: Product[] = [
  pack({
    id: 'pack:skins',
    name: 'Grimoire des sorts',
    description: `Les ${skinsPack.length} sorts premium, et les prochains offerts.`,
    priceCents: 1299,
    items: skinsPack,
    badge: '%',
    future: ['skin'],
    display: 'skin',
    shortName: 'le Grimoire',
  }),
  tresorPack(TRESOR),
  pack({
    id: 'pack:all',
    name: 'Grimoire complet',
    description: 'Tous les skins et tous les plateaux premium.',
    priceCents: 1299,
    items: ALL_PACK,
    future: ['skin', 'board'],
    retired: true,
  }),
];

/** Tous les produits, retirés compris (historique des achats, remboursements, promesses des packs). */
export const ALL_PRODUCTS: Product[] = [...unitProducts, ...collectionProducts, ...packProducts];
/** Produits en vente : un par objet payant, un par collection premium, les packs (sans les produits retirés). */
export const PRODUCTS: Product[] = ALL_PRODUCTS.filter(p => !p.retired);
/** Packs en vente (Grimoire des sorts, Trésor du Bazar). */
export const PACKS: Product[] = PRODUCTS.filter(p => p.kind === 'pack');

const PRODUCT_BY_ID = new Map(ALL_PRODUCTS.map(p => [p.id, p]));
/** Produit par identifiant, retiré compris (le paiement refuse `retired`). */
export const productById = (id: string): Product | undefined => PRODUCT_BY_ID.get(id);
/** Collections en vente (premium, produit non retiré), dans l'ordre du catalogue : rayon et vitrine de la boutique. */
export const SHOP_COLLECTIONS: Collection[] = PREMIUM_COLLECTIONS.filter(c => !productById(c.id)?.retired);

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
  return normItem('king', id);
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
 * Panier d'essai (au plus un objet par emplacement) : prix total et lignes. Une collection en vente que le panier
 * complète (ses pièces manquantes sont toutes dans le panier) est comptée au prix « compléter » s'il est plus bas que
 * la somme des pièces à l'unité. Les collections sont disjointes : ce calcul glouton est optimal.
 * null : panier invalide (objet inconnu, deux objets du même emplacement, objet retiré de la vente à acheter) ou rien
 * à payer.
 */
export function quoteCart(itemIds: readonly string[], owned: readonly string[]): { totalCents: number; lines: CartLine[] } | null {
  const sel = bySlot(itemIds);
  if (sel.unknown.length || duplicated(sel)) return null;
  const have = new Set(owned);
  const toBuy = sel.items.filter(i => !i.free && !have.has(i.id));
  if (!toBuy.length || toBuy.some(i => i.retired)) return null;
  const buy = toBuy.map(i => i.id);
  const lines: CartLine[] = [];
  const done = new Set<string>();
  for (const id of buy) {
    if (done.has(id)) continue;
    const c = collectionOf(id);
    const product = c && productById(c.id);
    if (c && product && !product.retired) {
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
  for (const c of PREMIUM_COLLECTIONS) {
    if (!collectionItems(c).every(i => have.has(i))) continue;
    if (!best || RANK[c.rarity] > RANK[best.rarity]) best = c;
  }
  return best?.id ?? null;
}

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString(LOCALE, { style: 'currency', currency: CURRENCY.toUpperCase() });
}
