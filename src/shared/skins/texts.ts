// Phrases de la boutique, du compte et des e-mails sur les emplacements et les objets : « qui voit quoi », message après
// l'équipement, objet avec son article, panier, sceaux d'un pack. À part du catalogue (catalog.ts), que l'accueil et
// la partie chargent pour les prix et les apparences : catalog.ts ne doit pas le réexporter.
//
// Un emplacement de plus (SLOT_DEFS, slots.ts) demande aussi ses phrases ici (SLOT_TEXTS) : le compilateur le signale.
import type { Collection, Item } from './types';
import type { ItemKind } from './slots';
import { SLOT_DEFS } from './slots';
import { collectionItems, itemLabel, tresorSeals } from '../catalog';
import { cap, compte, liste } from '../text/fr';

/** Phrases d'un emplacement (boutique, compte, e-mails). */
export interface SlotTexts {
  /** Possessif : « votre roi », « vos sorts ». */
  mine: string;
  /** Accord de « équipé » : « Sorts Inferno équipés ». */
  equipped: string;
  /** Fin du message après équipement (« Roi de braise équipé » + fin). */
  equippedTail: string;
  /** Note sous le rayon et dans la collection du compte. */
  note: string;
  /**
   * Objet non vu par l'adversaire (`seen` faux dans SLOT_DEFS) : ce qu'il fait (« vous suit dans toutes vos
   * parties »), pronom et « le leur ».
   */
  follows?: { verb: string; pronoun: string; theirs: string };
}

/** ← Phrases de chaque emplacement de SLOT_DEFS. */
export const SLOT_TEXTS: Readonly<Record<ItemKind, SlotTexts>> = {
  king: {
    mine: 'votre roi',
    equipped: 'équipé',
    equippedTail: '. Vos adversaires le verront dès votre prochaine partie.',
    note: 'Votre roi vous représente : vos adversaires le voient en face d’eux.',
  },
  board: {
    mine: 'votre échiquier',
    equipped: 'équipé',
    equippedTail: ' : il vous suit dans toutes vos parties.',
    note: 'Votre échiquier vous suit dans toutes vos parties. Vos adversaires gardent le leur.',
    follows: { verb: 'vous suit dans toutes vos parties', pronoun: 'il', theirs: 'le leur' },
  },
  skin: {
    mine: 'vos sorts',
    equipped: 'équipés',
    equippedTail: ' : vos adversaires les verront à chacun de vos sorts.',
    note: 'Vos sorts s’animent avec ce skin, chez vous comme chez votre adversaire.',
  },
};

// Rien n'est calculé au chargement de ce module (aucun effet de bord). Son morceau suit ceux qui l'importent : la
// réexportation transitoire de catalog.ts le range avec le catalogue (voir en tête).
const slots = () => Object.keys(SLOT_DEFS) as ItemKind[];

/** Objet dans une phrase, avec son article : « le roi de braise », « l’échiquier Rubis », « les sorts Inferno ». */
export function itemWithArticle(it: Item): string {
  const d = SLOT_DEFS[it.kind];
  return d.named ? `${d.article}${it.name.charAt(0).toLowerCase()}${it.name.slice(1)}` : `${d.article}${d.word} ${it.name}`;
}

/** Message après l'équipement d'un objet : « Sorts Inferno équipés : vos adversaires les verront à chacun de vos sorts. » */
export function equippedMessage(it: Item): string {
  const t = SLOT_TEXTS[it.kind];
  return `${itemLabel(it)} ${t.equipped}${t.equippedTail}`;
}

/**
 * Qui voit quoi : « Votre roi et vos sorts : vos adversaires les voient. Votre échiquier : il vous suit dans toutes vos
 * parties. » Avec `theirs` : « …, et vos adversaires gardent le leur. » (engagements de la boutique).
 */
export function whoSees(opts: { theirs?: boolean } = {}): string {
  const all = slots();
  const seen = all.filter(k => SLOT_DEFS[k].seen);
  const out: string[] = [];
  if (seen.length) {
    const les = seen.length > 1 || SLOT_DEFS[seen[0]].pl ? 'les' : 'le';
    out.push(`${cap(liste(seen.map(k => SLOT_TEXTS[k].mine)))} : vos adversaires ${les} voient.`);
  }
  for (const k of all) {
    const t = SLOT_TEXTS[k];
    // `follows` ne sert qu'à un emplacement que l'adversaire ne voit pas
    if (SLOT_DEFS[k].seen || !t.follows) continue;
    const keep = opts.theirs ? `, et vos adversaires gardent ${t.follows.theirs}` : '';
    out.push(`${cap(t.mine)} : ${t.follows.pronoun} ${t.follows.verb}${keep}.`);
  }
  return out.join(' ');
}

/** Panier de plusieurs skins : « Votre sélection (2 skins) ». */
export const selectionLabel = (n: number): string => `Votre sélection (${compte(n, 'skin')})`;

/** Sceaux qu'apporte un ensemble d'objets (un pack) : les collections premium qu'il complète, dans l'ordre du bandeau. */
export const sealsIn = (items: readonly string[]): Collection[] => tresorSeals().filter(c => collectionItems(c).every(i => items.includes(i)));
