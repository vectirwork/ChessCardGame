// Cabine d'essayage : fonctions pures (sans React ni navigateur), testées dans test/trial.test.ts.
// Un essai est une panoplie composée dans la cabine : un objet par emplacement (roi, échiquier, sorts). On le garde
// comme un écart à la panoplie portée (`TrialDelta`) : quand le compte arrive après la page, ou quand on équipe, les
// emplacements que l'on n'a pas touchés suivent la panoplie, sans rien faire.
import {
  COLLECTIONS, RARITY, SHOP_ITEMS, SLOTS, SLOT_DEFS, collectionItems, collectionOf, formatPrice, itemById, productById, productPrice, quoteCart,
  unitPrice,
} from '../../../shared/catalog';
import type { CartLine, Collection, Item, ItemKind, Product } from '../../../shared/catalog';
import { compte, liste, pluriel } from '../../../shared/text/fr';

/** Un objet par emplacement. */
export type Trial = Record<ItemKind, string>;
/** Écart d'un essai à la panoplie portée : les seuls emplacements essayés. */
export type TrialDelta = Partial<Trial>;

/** Un objet par emplacement, dans l'ordre des emplacements. */
const perSlot = (f: (k: ItemKind) => string): Trial => Object.fromEntries(SLOTS.map(k => [k, f(k)])) as Trial;

/** Essai complet : la panoplie, et par-dessus les emplacements essayés. */
export function trialOf(pano: Trial, delta: TrialDelta): Trial {
  return perSlot(k => delta[k] ?? pano[k]);
}

/** L'essai est-il exactement cette collection ? */
export const isTrying = (trial: Trial, c: Collection): boolean => SLOTS.every(k => trial[k] === c[k]);

/** Écart minimal : sans les emplacements identiques à la panoplie ni les objets inconnus ou mal rangés. */
export function normalize(delta: TrialDelta, pano: Trial): TrialDelta {
  const out: TrialDelta = {};
  for (const k of SLOTS) {
    const id = delta[k];
    if (id && id !== pano[k] && itemById(id)?.kind === k) out[k] = id;
  }
  return out;
}

/**
 * Essai sans les objets payants retirés de la vente que l'on ne possède pas (ni achetables, ni équipables : ils peuvent
 * venir d'un lien `?essai=`, d'un essai gardé dans la session, d'une collection ou de SHOP_FEATURED). Qui possède un
 * objet retiré l'essaie encore.
 */
export function available(delta: TrialDelta, owned: readonly string[]): TrialDelta {
  const out: TrialDelta = {};
  for (const k of SLOTS) {
    const id = delta[k];
    const it = id ? itemById(id) : undefined;
    if (id && !(it?.retired && !it.free && !owned.includes(id))) out[k] = id;
  }
  return out;
}

/** Emplacements essayés (qui diffèrent de la panoplie), dans l'ordre d'affichage. */
export function changedSlots(trial: Trial, pano: Trial): ItemKind[] {
  return SLOTS.filter(k => trial[k] !== pano[k]);
}

/**
 * Essayer un objet. Toucher de nouveau l'objet en essai le retire (l'emplacement revient à la panoplie) ; essayer
 * l'objet porté revient au même.
 */
export function toggleItem(delta: TrialDelta, pano: Trial, id: string): TrialDelta {
  const it = itemById(id);
  if (!it) return delta;
  const next = { ...delta };
  if (next[it.kind] === id || pano[it.kind] === id) delete next[it.kind];
  else next[it.kind] = id;
  return normalize(next, pano);
}

/** Essayer une collection : tous ses objets. */
export function withCollection(delta: TrialDelta, pano: Trial, c: Collection): TrialDelta {
  return normalize({ ...delta, ...perSlot(k => c[k]) }, pano);
}

/** Remettre un emplacement sur l'objet porté. */
export function revertSlot(delta: TrialDelta, kind: ItemKind): TrialDelta {
  const next = { ...delta };
  delete next[kind];
  return next;
}

/**
 * Essai dans l'adresse (`?essai=king:braise,board:ruby`) : les emplacements essayés, séparés par des virgules. Un lien
 * partagé montre l'essai par-dessus la panoplie de celui qui l'ouvre.
 */
export function formatEssai(delta: TrialDelta): string {
  return SLOTS.flatMap(k => (delta[k] ? [delta[k]!] : [])).join(',');
}

/** Lecture de `?essai=` : objets connus, le premier de chaque emplacement ; le reste est ignoré. */
export function parseEssai(raw: string | null | undefined): TrialDelta {
  const out: TrialDelta = {};
  for (const id of (raw ?? '').split(',')) {
    const it = itemById(id.trim());
    if (it && !out[it.kind]) out[it.kind] = it.id;
  }
  return out;
}

/** Ce que coûte un essai : objets à acheter (panier de quoteCart), objets possédés à équiper. */
export interface TrialQuote {
  changed: ItemKind[];
  /** Objets essayés à acheter (ni offerts ni possédés). */
  buy: string[];
  /** Objets essayés déjà possédés ou offerts : il suffit de les équiper. */
  equip: string[];
  /** Panier des objets à acheter (une collection complétée au prix « compléter » si c'est moins cher). */
  cart: { totalCents: number; lines: CartLine[] } | null;
}

export function quoteTrial(trial: Trial, pano: Trial, owned: readonly string[]): TrialQuote {
  const changed = changedSlots(trial, pano);
  const have = new Set(owned);
  const ids = changed.map(k => trial[k]);
  const buy = ids.filter(id => !itemById(id)?.free && !have.has(id));
  const equip = ids.filter(id => !buy.includes(id));
  return { changed, buy, equip, cart: buy.length ? quoteCart(buy, owned) : null };
}

/** Suggestion de la ligne d'action : une collection qu'un seul objet de plus compléterait, pour moins cher. */
export interface CollectionHint {
  collection: Collection;
  product: Product;
  /** Prix de la collection pour ce joueur (« compléter » s'il en possède déjà des pièces). */
  price: number;
  /** L'objet qui manque à l'essai pour la compléter. */
  extra: string;
  /** Économie par rapport à l'essai acheté à l'unité, plus l'objet qui manque. */
  saving: number;
}

/**
 * Meilleure collection à suggérer : l'essai contient au moins une pièce à acheter d'une collection, et un seul objet de
 * plus la complète. On garde celle qui fait économiser le plus. Une collection que l'essai complète déjà n'est pas
 * suggérée : le panier la compte déjà au prix « compléter » (quoteCart).
 */
export function bestCollection(trial: Trial, pano: Trial, owned: readonly string[]): CollectionHint | null {
  const { buy } = quoteTrial(trial, pano, owned);
  const have = new Set(owned);
  let best: CollectionHint | null = null;
  for (const c of COLLECTIONS) {
    const product = productById(c.id);
    if (!product || product.retired) continue;
    const price = productPrice(product, owned);
    if (price === null) continue;
    const missing = collectionItems(c).filter(i => !have.has(i));
    const tried = missing.filter(i => buy.includes(i));
    const extra = missing.filter(i => !buy.includes(i));
    if (!tried.length || extra.length !== 1) continue;
    const saving = tried.reduce((s, i) => s + unitPrice(i), 0) + unitPrice(extra[0]) - price;
    if (saving <= 0) continue;
    if (!best || saving > best.saving) best = { collection: c, product, price, extra: extra[0], saving };
  }
  return best;
}

/**
 * « Surprenez-moi » : une panoplie tirée au hasard dans tout le catalogue (objets non possédés compris), un objet par
 * emplacement, différente de l'essai en cours.
 */
export function surprise(current: Trial, rand: () => number = Math.random): Trial {
  const pick = (k: ItemKind) => {
    const list = SHOP_ITEMS.filter(i => i.kind === k);
    return list[Math.min(list.length - 1, Math.floor(rand() * list.length))].id;
  };
  let t = current;
  for (let i = 0; i < 8; i++) {
    t = perSlot(pick);
    if (SLOTS.some(k => t[k] !== current[k])) return t;
  }
  // Hasard qui retombe toujours sur l'essai : on change au moins le premier emplacement (le roi)
  const k0 = SLOTS[0];
  const first = SHOP_ITEMS.filter(i => i.kind === k0);
  const next = first[(first.findIndex(i => i.id === current[k0]) + 1) % first.length].id;
  return { ...t, [k0]: next };
}

/** État d'une carte de skin. */
export type CardState = 'equipped' | 'owned' | 'free' | 'price';

/** État d'un objet pour qui possède `owned` et porte `pano` (non connecté : la panoplie Arcane, les objets offerts). */
export function itemState(id: string, pano: Trial, owned: readonly string[]): CardState {
  const it = itemById(id);
  if (!it) return 'price';
  if (pano[it.kind] === id) return 'equipped';
  if (it.free) return 'free';
  if (owned.includes(id)) return 'owned';
  return 'price';
}

/** Mot de l'emplacement, pour les phrases (« roi », « échiquier », « sorts »). */
export const slotWord = (k: ItemKind): string => SLOT_DEFS[k].word;

/**
 * Ce que change l'équipement de ces objets, en une phrase sans majuscule ni point : ce que l'adversaire voit (le roi et
 * les sorts), puis ce qui reste chez soi (« vos adversaires verront votre roi dès votre prochaine partie ; votre
 * échiquier vous suit dans toutes vos parties »).
 */
export function equipNote(ids: readonly string[]): string {
  const kinds = new Set(ids.map(id => itemById(id)?.kind));
  const on = SLOTS.filter(k => kinds.has(k));
  const seen = on.filter(k => SLOT_DEFS[k].seen).map(k => SLOT_DEFS[k].mine);
  const parts: string[] = [];
  if (seen.length) parts.push(`vos adversaires verront ${liste(seen)} dès votre prochaine partie`);
  for (const k of on) {
    const d: { mine: string; seen: boolean; follows?: { verb: string } } = SLOT_DEFS[k];
    // `follows` ne sert qu'à un emplacement que l'adversaire ne voit pas
    if (!d.seen && d.follows) parts.push(`${d.mine} ${d.follows.verb}`);
  }
  return parts.join(' ; ');
}

/** « 2 skins » : le nom des objets de la boutique, compté. */
export const skins = (n: number): string => compte(n, 'skin');

/** Libellé accessible d'une carte : « Roi de braise, roi, rareté rare, 2,99 €, en essai ». */
export function cardLabel(it: Item, state: CardState, trying: boolean): string {
  const parts = [it.name, slotWord(it.kind), `rareté ${RARITY[it.rarity].label.toLowerCase()}`];
  if (state === 'equipped') parts.push('équipé');
  else if (state === 'owned') parts.push('possédé');
  else if (state === 'free') parts.push('offert');
  else parts.push(formatPrice(unitPrice(it.id)));
  if (trying) parts.push('en essai');
  return parts.join(', ');
}

/** Bouton principal de la ligne d'action (un seul à la fois). */
export type MainAction =
  /** Essai identique à la panoplie. */
  | { kind: 'none' }
  /** Seulement des objets possédés ou offerts : un seul appel d'équipement. */
  | { kind: 'equip'; ids: string[] }
  /** Des objets à acheter (et ceux possédés de l'essai, équipés avec). */
  | { kind: 'buy'; ids: string[]; cents: number }
  /** Visiteur : il faut un compte pour acheter ou équiper. */
  | { kind: 'signup'; cents: number }
  /** Paiements fermés : achat impossible (l'équipement des objets possédés reste possible). */
  | { kind: 'soon'; cents: number };

export function mainAction(q: TrialQuote, opts: { loggedIn: boolean; sale: boolean }): MainAction {
  if (!q.changed.length) return { kind: 'none' };
  const cents = q.cart?.totalCents ?? 0;
  // Visiteur : un compte pour acheter ou équiper ; paiements fermés, rien de payant ne s'achète, compte ou non
  if (!opts.loggedIn) return !opts.sale && q.buy.length ? { kind: 'soon', cents } : { kind: 'signup', cents };
  if (!q.buy.length) return { kind: 'equip', ids: q.equip };
  if (!opts.sale) return { kind: 'soon', cents };
  return { kind: 'buy', ids: q.buy, cents };
}

/**
 * Ordre d'un rayon : les nouveautés d'abord, puis les autres objets payants, les objets offerts à la fin (sur le portant
 * du téléphone, les premières cartes visibles sont celles que l'on vient voir). Ordre du catalogue à égalité.
 */
export function rackOrder<T extends Pick<Item, 'free' | 'isNew'>>(items: readonly T[]): T[] {
  const rank = (i: T) => (i.free ? 2 : i.isNew ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Achat présenté au récapitulatif : un produit (objet, collection, pack) ou le panier de l'essai. */
export type Order = { kind: 'product'; product: Product } | { kind: 'cart'; itemIds: string[] };

export interface OrderLine {
  label: string;
  note?: string;
  items: string[];
  cents: number;
}

/** Récapitulatif d'un achat pour qui possède `owned`, aux montants que le serveur facture (productPrice, quoteCart). */
export interface OrderSummary {
  lines: OrderLine[];
  /** Objets nouveaux (ceux d'un pack déjà possédés n'y sont pas). */
  items: string[];
  totalCents: number;
  /** Économie sur le prix à l'unité des objets nouveaux ; 0 si l'achat n'en fait pas. */
  savingCents: number;
  /** Pack : objets déjà possédés (son prix ne change pas). */
  have: number;
  /** Pack : nombre d'objets qu'il contient. */
  of: number;
}

const sumUnit = (ids: readonly string[]) => ids.reduce((s, i) => s + unitPrice(i), 0);

/** null : rien à payer (tout est déjà possédé, ou panier invalide). */
export function orderSummary(order: Order, owned: readonly string[]): OrderSummary | null {
  const have = new Set(owned);
  let lines: OrderLine[];
  let packHave = 0;
  let packOf = 0;
  if (order.kind === 'product') {
    const p = order.product;
    const cents = productPrice(p, owned);
    if (cents === null) return null;
    const missing = p.items.filter(i => !have.has(i));
    const partial = p.kind === 'collection' && missing.length < p.items.length;
    if (p.kind === 'pack') {
      packHave = p.items.length - missing.length;
      packOf = p.items.length;
    }
    const n = missing.length;
    lines = [
      {
        label: p.name,
        note: partial ? `Compléter la collection : ${skins(n)} ${pluriel(n, 'manquant')}` : p.description,
        items: missing,
        cents,
      },
    ];
  } else {
    const q = quoteCart(order.itemIds, owned);
    if (!q) return null;
    lines = q.lines.map(l => ({
      label: l.label,
      note: isCollectionLine(l) ? 'Au prix de la collection, sceau compris' : undefined,
      items: l.items,
      cents: l.cents,
    }));
  }
  const items = lines.flatMap(l => l.items);
  const totalCents = lines.reduce((s, l) => s + l.cents, 0);
  return { lines, items, totalCents, savingCents: Math.max(0, sumUnit(items) - totalCents), have: packHave, of: packOf };
}

/** Ligne de panier facturée au prix d'une collection (complétée par l'essai). */
export const isCollectionLine = (l: Pick<CartLine, 'productId'>): boolean => productById(l.productId)?.kind === 'collection';

/** Collection d'un objet ou d'une collection, pour une teinte. */
export function gemOf(id: string): string {
  const it = itemById(id);
  if (it?.kind === 'king') return it.king?.gem ?? '#f3c969';
  if (it?.kind === 'skin') return it.skin?.primary ?? '#f3c969';
  if (it?.kind === 'board') return it.board?.gem ?? collectionOf(id)?.gem ?? it.board?.dark ?? '#f3c969';
  return COLLECTIONS.find(c => c.id === id)?.gem ?? '#f3c969';
}
