// Cabine d'essayage : fonctions pures (sans React ni navigateur), testées dans test/trial.test.ts.
// Un essai est une panoplie composée dans la cabine : un objet par emplacement (roi, échiquier, sorts). On le garde
// comme un écart à la panoplie portée (`TrialDelta`) : quand le compte arrive après la page, ou quand on équipe, les
// emplacements que l'on n'a pas touchés suivent la panoplie, sans rien faire.
import {
  COLLECTIONS, ITEMS, PRODUCTS, RARITY, SLOTS, SLOT_LABEL, collectionItems, collectionOf, formatPrice, itemById, productById, productPrice,
  quoteCart, unitPrice,
} from '../../../shared/catalog';
import type { CartLine, Collection, Item, ItemKind, Product } from '../../../shared/catalog';

/** Un objet par emplacement. */
export type Trial = Record<ItemKind, string>;
/** Écart d'un essai à la panoplie portée : les seuls emplacements essayés. */
export type TrialDelta = Partial<Trial>;

/** Essai complet : la panoplie, et par-dessus les emplacements essayés. */
export function trialOf(pano: Trial, delta: TrialDelta): Trial {
  return { king: delta.king ?? pano.king, board: delta.board ?? pano.board, skin: delta.skin ?? pano.skin };
}

/** Écart minimal : sans les emplacements identiques à la panoplie ni les objets inconnus ou mal rangés. */
export function normalize(delta: TrialDelta, pano: Trial): TrialDelta {
  const out: TrialDelta = {};
  for (const k of SLOTS) {
    const id = delta[k];
    if (id && id !== pano[k] && itemById(id)?.kind === k) out[k] = id;
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

/** Essayer une collection : ses trois objets. */
export function withCollection(delta: TrialDelta, pano: Trial, c: Collection): TrialDelta {
  return normalize({ ...delta, king: c.king, board: c.board, skin: c.skin }, pano);
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
    const list = ITEMS.filter(i => i.kind === k);
    return list[Math.min(list.length - 1, Math.floor(rand() * list.length))].id;
  };
  let t = current;
  for (let i = 0; i < 8; i++) {
    t = { king: pick('king'), board: pick('board'), skin: pick('skin') };
    if (SLOTS.some(k => t[k] !== current[k])) return t;
  }
  // Hasard qui retombe toujours sur l'essai : on change au moins le roi
  const kings = ITEMS.filter(i => i.kind === 'king');
  const next = kings[(kings.findIndex(i => i.id === current.king) + 1) % kings.length].id;
  return { ...t, king: next };
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

/** Libellé d'emplacement en minuscules, pour les phrases (« roi », « échiquier », « sorts »). */
export const slotWord = (k: ItemKind) => SLOT_LABEL[k].toLowerCase();

/** Nom d'un objet dans une phrase : « Roi de braise », « Échiquier Rubis », « Sorts Inferno ». */
export function itemPhrase(it: Item): string {
  if (it.kind === 'board') return `Échiquier ${it.name}`;
  if (it.kind === 'skin') return `Sorts ${it.name}`;
  return it.name;
}

/**
 * Ce que change l'équipement de ces objets, en une phrase sans majuscule ni point : le roi et les sorts se voient chez
 * l'adversaire, l'échiquier reste chez soi (« vos adversaires verront votre roi dès votre prochaine partie ; votre
 * échiquier vous suit dans toutes vos parties »).
 */
export function equipNote(ids: readonly string[]): string {
  const kinds = new Set(ids.map(id => itemById(id)?.kind));
  const seen = [kinds.has('king') && 'votre roi', kinds.has('skin') && 'vos sorts'].filter(Boolean).join(' et ');
  const parts: string[] = [];
  if (seen) parts.push(`vos adversaires verront ${seen} dès votre prochaine partie`);
  if (kinds.has('board')) parts.push('votre échiquier vous suit dans toutes vos parties');
  return parts.join(' ; ');
}

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

/** Produits « pack » en vente (Trésor du Bazar, Grimoire des sorts). */
export const PACKS = PRODUCTS.filter(p => p.kind === 'pack');
/** Collections premium, dans l'ordre du catalogue. */
export const PREMIUM_COLLECTIONS = COLLECTIONS.filter(c => c.rarity !== 'offert');

/** Nom du sceau d'une collection (son exclusivité) : « Sceau de la Forge ». */
const SEAL_NAME: Record<string, string> = {
  'col:jade': 'Sceau du Jardin de jade',
  'col:neon': 'Sceau de Néon 2084',
  'col:inferno': 'Sceau de la Forge',
  'col:olympe': 'Sceau de l’Olympe',
  'col:ecarlate': 'Sceau de la Cour écarlate',
  'col:neant': 'Sceau du Néant',
  'col:celeste': 'Sceau de la Voûte céleste',
};
export const sealName = (c: Collection) => SEAL_NAME[c.id] ?? `Sceau ${c.name}`;

/** Collection d'un objet ou d'une collection, pour une teinte. */
export function gemOf(id: string): string {
  const it = itemById(id);
  if (it?.kind === 'king') return it.king?.gem ?? '#f3c969';
  if (it?.kind === 'skin') return it.skin?.primary ?? '#f3c969';
  if (it?.kind === 'board') return it.board?.gem ?? collectionOf(id)?.gem ?? it.board?.dark ?? '#f3c969';
  return COLLECTIONS.find(c => c.id === id)?.gem ?? '#f3c969';
}
