// Cabine d'essayage de la boutique (src/client/pages/shop/trial.ts) : fonctions pures, sans navigateur.
// Écart essai / panoplie, essai dans l'adresse (?essai=), prix de l'essai, bouton principal, meilleure collection,
// « Surprenez-moi », état des cartes.
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, DEFAULT_ITEM, FREE_ITEMS, ITEMS, SLOTS, collectionById, itemLabel, productById, productPrice } from '../src/shared/catalog';
import { RAYON_NOTE } from '../src/client/pages/shop/Rack';
import { RAYONS, RAYON_LABEL } from '../src/client/pages/shop/RayonTabs';
import {
  bestCollection, cardLabel, changedSlots, equipNote, formatEssai, itemPhrase, itemState, mainAction, normalize, orderSummary, parseEssai, quoteTrial,
  rackOrder, revertSlot, sealName, slotWord, surprise, toggleItem, trialOf, withCollection,
} from '../src/client/pages/shop/trial';
import type { Trial } from '../src/client/pages/shop/trial';
import { itemById } from '../src/shared/catalog';

const ARCANE: Trial = { ...DEFAULT_ITEM };
const owned = (...ids: string[]) => [...FREE_ITEMS, ...ids];
const norm = (s: string) => s.replace(/[  ]/g, ' ');
/** Tirages de « Surprenez-moi » (hasard de Park et Miller, graine 7), relevés avant la refonte. */
const SURPRISES: Trial[] = [
  { king: 'king:arcane', board: 'board:ciel', skin: 'skin:neon' },
  { king: 'king:printemps', board: 'board:grille', skin: 'skin:void' },
  { king: 'king:synthe', board: 'board:grille', skin: 'skin:laurier' },
  { king: 'king:laure', board: 'board:ruby', skin: 'skin:sakura' },
];

describe('écart entre l’essai et la panoplie', () => {
  it('l’essai complet prend la panoplie, puis les emplacements essayés', () => {
    expect(trialOf(ARCANE, { king: 'king:braise' })).toEqual({ king: 'king:braise', board: 'board:arcane', skin: 'skin:arcane' });
    expect(changedSlots(trialOf(ARCANE, { king: 'king:braise', skin: 'skin:void' }), ARCANE)).toEqual(['king', 'skin']);
  });

  it('normalize retire les emplacements identiques à la panoplie, les objets inconnus et mal rangés', () => {
    expect(normalize({ king: 'king:arcane', board: 'board:ruby' }, ARCANE)).toEqual({ board: 'board:ruby' });
    expect(normalize({ king: 'king:inconnu' }, ARCANE)).toEqual({});
    expect(normalize({ king: 'board:ruby' }, ARCANE)).toEqual({});
  });

  it('toucher l’objet en essai le retire ; toucher l’objet porté revient à la panoplie', () => {
    let d = toggleItem({}, ARCANE, 'king:braise');
    expect(d).toEqual({ king: 'king:braise' });
    d = toggleItem(d, ARCANE, 'board:ruby');
    expect(d).toEqual({ king: 'king:braise', board: 'board:ruby' });
    expect(toggleItem(d, ARCANE, 'king:braise')).toEqual({ board: 'board:ruby' });
    expect(toggleItem(d, ARCANE, 'king:arcane')).toEqual({ board: 'board:ruby' });
    expect(toggleItem(d, ARCANE, 'objet:inconnu')).toBe(d);
  });

  it('une collection essaie ses trois objets ; revertSlot remet un emplacement', () => {
    const c = collectionById('col:inferno')!;
    const d = withCollection({ skin: 'skin:void' }, ARCANE, c);
    expect(d).toEqual({ king: 'king:braise', board: 'board:obsidian', skin: 'skin:inferno' });
    expect(revertSlot(d, 'board')).toEqual({ king: 'king:braise', skin: 'skin:inferno' });
  });

  it('quand la panoplie change (objet équipé), l’emplacement essayé qu’elle rejoint disparaît de l’écart', () => {
    const pano = { ...ARCANE, king: 'king:braise' };
    expect(normalize({ king: 'king:braise', board: 'board:ruby' }, pano)).toEqual({ board: 'board:ruby' });
  });
});

describe('essai dans l’adresse (?essai=)', () => {
  it('aller-retour, dans l’ordre des emplacements', () => {
    const d = { skin: 'skin:inferno', king: 'king:braise', board: 'board:ruby' };
    const s = formatEssai(d);
    expect(s).toBe('king:braise,board:ruby,skin:inferno');
    expect(parseEssai(s)).toEqual(d);
    expect(formatEssai({})).toBe('');
  });

  it('lecture tolérante : objets inconnus ignorés, le premier de chaque emplacement, espaces', () => {
    expect(parseEssai('king:braise, inconnu,king:astral,skin:void')).toEqual({ king: 'king:braise', skin: 'skin:void' });
    expect(parseEssai(null)).toEqual({});
    expect(parseEssai('')).toEqual({});
  });
});

describe('prix de l’essai et bouton principal', () => {
  it('objets à acheter et objets possédés à équiper', () => {
    const trial = trialOf(ARCANE, { king: 'king:braise', board: 'board:wood', skin: 'skin:void' });
    const q = quoteTrial(trial, ARCANE, owned('skin:void'));
    expect(q.buy).toEqual(['king:braise']);
    expect(q.equip).toEqual(['board:wood', 'skin:void']);
    expect(q.cart?.totalCents).toBe(299);
  });

  it('un essai qui complète une collection est compté au prix « compléter »', () => {
    const trial = trialOf(ARCANE, { king: 'king:braise', board: 'board:obsidian' });
    const q = quoteTrial(trial, ARCANE, owned('skin:inferno'));
    // Forge : 5,99 € moins les sorts Inferno possédés (2,99 €) = 3,00 €, moins que 2,99 + 1,99 €
    expect(q.cart?.totalCents).toBe(300);
    expect(q.cart?.lines.map(l => l.productId)).toEqual(['col:inferno']);
    expect(q.cart?.totalCents).toBe(productPrice(productById('col:inferno')!, owned('skin:inferno')));
  });

  it('un seul bouton principal selon la situation', () => {
    const none = quoteTrial(ARCANE, ARCANE, owned());
    expect(mainAction(none, { loggedIn: true, sale: true })).toEqual({ kind: 'none' });

    const equip = quoteTrial(trialOf(ARCANE, { board: 'board:slate' }), ARCANE, owned());
    expect(mainAction(equip, { loggedIn: true, sale: true })).toEqual({ kind: 'equip', ids: ['board:slate'] });
    // Paiements fermés : équiper reste possible
    expect(mainAction(equip, { loggedIn: true, sale: false })).toEqual({ kind: 'equip', ids: ['board:slate'] });

    const buy = quoteTrial(trialOf(ARCANE, { king: 'king:astral', board: 'board:jade' }), ARCANE, owned());
    expect(mainAction(buy, { loggedIn: true, sale: true })).toEqual({ kind: 'buy', ids: ['king:astral', 'board:jade'], cents: 698 });
    expect(mainAction(buy, { loggedIn: true, sale: false })).toEqual({ kind: 'soon', cents: 698 });
    expect(mainAction(buy, { loggedIn: false, sale: true })).toEqual({ kind: 'signup', cents: 698 });
    // Visiteur, paiements fermés : rien de payant ne s'achète ; un essai d'objets offerts propose toujours le compte
    expect(mainAction(buy, { loggedIn: false, sale: false })).toEqual({ kind: 'soon', cents: 698 });
    expect(mainAction(equip, { loggedIn: false, sale: false })).toEqual({ kind: 'signup', cents: 0 });
  });
});

describe('meilleure collection à suggérer', () => {
  it('deux pièces d’une collection en essai : la collection les réunit avec la troisième, pour moins cher', () => {
    const trial = trialOf(ARCANE, { king: 'king:astral', board: 'board:ciel' });
    const h = bestCollection(trial, ARCANE, owned());
    expect(h?.collection.id).toBe('col:celeste');
    expect(h?.extra).toBe('skin:celestial');
    expect(h?.price).toBe(999);
    // 4,99 + 2,99 + 3,99 − 9,99
    expect(h?.saving).toBe(198);
  });

  it('rien quand l’essai complète déjà la collection, ni quand il manque plus d’une pièce, ni pour une collection possédée', () => {
    expect(bestCollection(trialOf(ARCANE, { king: 'king:braise', board: 'board:obsidian', skin: 'skin:inferno' }), ARCANE, owned())).toBeNull();
    expect(bestCollection(trialOf(ARCANE, { king: 'king:braise' }), ARCANE, owned())).toBeNull();
    expect(bestCollection(trialOf(ARCANE, { king: 'king:braise' }), ARCANE, owned('king:braise', 'board:obsidian', 'skin:inferno'))).toBeNull();
  });

  it('avec une pièce possédée, le prix suggéré est celui de « compléter »', () => {
    const trial = trialOf(ARCANE, { king: 'king:braise' });
    const h = bestCollection(trial, ARCANE, owned('skin:inferno'));
    expect(h?.collection.id).toBe('col:inferno');
    expect(h?.price).toBe(300);
    expect(h?.extra).toBe('board:obsidian');
  });

  it('la suggestion fait toujours économiser', () => {
    for (const k of ITEMS.filter(i => i.kind === 'king'))
      for (const b of ITEMS.filter(i => i.kind === 'board')) {
        const h = bestCollection(trialOf(ARCANE, { king: k.id, board: b.id }), ARCANE, owned());
        if (h) expect(h.saving).toBeGreaterThan(0);
      }
  });
});

describe('« Surprenez-moi »', () => {
  it('un objet par emplacement, du bon emplacement, différent de l’essai en cours', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let t = ARCANE;
    for (let i = 0; i < 200; i++) {
      const next = surprise(t, rand);
      for (const k of SLOTS) expect(itemById(next[k])?.kind).toBe(k);
      expect(SLOTS.some(k => next[k] !== t[k])).toBe(true);
      t = next;
    }
  });

  it('un hasard qui retombe toujours sur l’essai change au moins le roi', () => {
    const first = surprise(ARCANE, () => 0);
    const again = surprise(first, () => 0);
    expect(again.king).not.toBe(first.king);
  });
});

describe('phrase d’équipement', () => {
  it('le roi et les sorts se voient chez l’adversaire, l’échiquier reste chez soi', () => {
    expect(equipNote(['king:astral', 'board:jade'])).toBe('vos adversaires verront votre roi dès votre prochaine partie ; votre échiquier vous suit dans toutes vos parties');
    expect(equipNote(['king:braise', 'skin:inferno'])).toBe('vos adversaires verront votre roi et vos sorts dès votre prochaine partie');
    expect(equipNote(['board:ruby'])).toBe('votre échiquier vous suit dans toutes vos parties');
  });
});

describe('état et libellé des cartes', () => {
  it('Équipé, Offert, Possédé, prix', () => {
    const pano = { ...ARCANE, king: 'king:braise' };
    const mine = owned('king:braise', 'board:ruby');
    expect(itemState('king:braise', pano, mine)).toBe('equipped');
    expect(itemState('board:wood', pano, mine)).toBe('free');
    expect(itemState('board:ruby', pano, mine)).toBe('owned');
    expect(itemState('skin:void', pano, mine)).toBe('price');
  });

  it('libellé accessible : nom, emplacement, rareté, prix, essai', () => {
    expect(norm(cardLabel(itemById('king:braise')!, 'price', true))).toBe('Roi de braise, roi, rareté rare, 2,99 €, en essai');
    expect(cardLabel(itemById('board:ruby')!, 'owned', false)).toBe('Rubis, échiquier, rareté épique, possédé');
    expect(cardLabel(itemById('skin:arcane')!, 'equipped', false)).toBe('Arcane, sorts, rareté offert, équipé');
  });
});

describe('récapitulatif d’achat', () => {
  const tresor = productById('pack:tresor')!;
  const grimoire = productById('pack:skins')!;

  it('pack sans objet possédé : économie = prix barré − prix du pack', () => {
    const r = orderSummary({ kind: 'product', product: tresor }, owned())!;
    expect(r.items).toHaveLength(21);
    expect(r.totalCents).toBe(2499);
    expect(r.savingCents).toBe(tresor.compareAtCents! - 2499);
    expect(r.have).toBe(0);
  });

  it('pack dont des objets sont possédés : seuls les nouveaux comptent, ni dans l’économie ni dans les vignettes', () => {
    // 20 objets sur 21 : le dernier vaut moins que le pack, aucune économie n'est annoncée
    const mine = tresor.items.slice(0, 20);
    const r = orderSummary({ kind: 'product', product: tresor }, owned(...mine))!;
    expect(r.items).toEqual([tresor.items[20]]);
    expect(r.have).toBe(20);
    expect(r.of).toBe(21);
    expect(r.totalCents).toBe(2499);
    expect(r.savingCents).toBe(0);
    // Grimoire : 3 sorts sur 7 déjà possédés
    const g = orderSummary({ kind: 'product', product: grimoire }, owned(...grimoire.items.slice(0, 3)))!;
    expect(g.have).toBe(3);
    expect(g.items).toEqual(grimoire.items.slice(3));
    expect(g.savingCents).toBe(Math.max(0, g.items.reduce((s, i) => s + productPrice(productById(i)!, [])!, 0) - 1299));
    // Tout possédé : rien à payer
    expect(orderSummary({ kind: 'product', product: grimoire }, owned(...grimoire.items))).toBeNull();
  });

  it('collection à compléter et panier : lignes et économie aux montants du serveur', () => {
    const forge = productById('col:inferno')!;
    const c = orderSummary({ kind: 'product', product: forge }, owned('skin:inferno'))!;
    expect(c.totalCents).toBe(300);
    expect(c.items).toEqual(['king:braise', 'board:obsidian']);
    expect(c.lines[0].note).toMatch(/^Compléter la collection : 2 skins manquants/);
    // 2,99 + 1,99 − 3,00
    expect(c.savingCents).toBe(198);
    const cart = orderSummary({ kind: 'cart', itemIds: ['king:braise', 'board:obsidian'] }, owned('skin:inferno'))!;
    expect(cart.lines.map(l => l.label)).toEqual([forge.name]);
    expect(cart.totalCents).toBe(300);
    expect(orderSummary({ kind: 'cart', itemIds: ['king:astral'] }, owned())!.savingCents).toBe(0);
  });
});

describe('ordre des rayons', () => {
  it('nouveautés d’abord, objets offerts à la fin, ordre du catalogue à égalité', () => {
    for (const kind of SLOTS) {
      const list = rackOrder(ITEMS.filter(i => i.kind === kind));
      const rank = list.map(i => (i.free ? 2 : i.isNew ? 0 : 1));
      expect(rank).toEqual([...rank].sort((a, b) => a - b));
      expect(list).toHaveLength(ITEMS.filter(i => i.kind === kind).length);
      const firstFree = list.findIndex(i => i.free);
      expect(list.slice(firstFree).every(i => i.free)).toBe(true);
    }
    expect(rackOrder(ITEMS.filter(i => i.kind === 'board')).slice(0, 3).map(i => i.id)).toEqual(['board:grille', 'board:horizon', 'board:ciel']);
  });
});

// ---------------------------------------------------------------------------------------------
// Photographie des textes de la boutique au défaut, prise avant la refonte (lot 2 de la passe « polymorphe ») : les
// textes dérivés des emplacements (SLOT_DEFS) doivent rester égaux à ces valeurs, au caractère près.

describe('textes des emplacements au défaut (identiques à la boutique d’avant la refonte)', () => {
  it('mot de l’emplacement, nom d’un objet dans une phrase', () => {
    expect(SLOTS.map(slotWord)).toEqual(['roi', 'échiquier', 'sorts']);
    expect(itemPhrase(itemById('king:braise')!)).toBe('Roi de braise');
    expect(itemPhrase(itemById('board:ruby')!)).toBe('Échiquier Rubis');
    expect(itemPhrase(itemById('skin:inferno')!)).toBe('Sorts Inferno');
    for (const it of ITEMS) expect(itemPhrase(it)).toBe(itemLabel(it));
  });

  it('phrase d’équipement : toutes les combinaisons d’emplacements', () => {
    const one = { king: 'king:braise', board: 'board:ruby', skin: 'skin:inferno' };
    const phrases = [['king'], ['board'], ['skin'], ['king', 'board'], ['king', 'skin'], ['board', 'skin'], ['king', 'board', 'skin']].map(ks =>
      equipNote(ks.map(k => one[k as keyof typeof one])),
    );
    expect(phrases).toEqual([
      'vos adversaires verront votre roi dès votre prochaine partie',
      'votre échiquier vous suit dans toutes vos parties',
      'vos adversaires verront vos sorts dès votre prochaine partie',
      'vos adversaires verront votre roi dès votre prochaine partie ; votre échiquier vous suit dans toutes vos parties',
      'vos adversaires verront votre roi et vos sorts dès votre prochaine partie',
      'vos adversaires verront vos sorts dès votre prochaine partie ; votre échiquier vous suit dans toutes vos parties',
      'vos adversaires verront votre roi et vos sorts dès votre prochaine partie ; votre échiquier vous suit dans toutes vos parties',
    ]);
    expect(equipNote([])).toBe('');
  });

  it('noms des sceaux de collection', () => {
    expect(COLLECTIONS.map(sealName)).toEqual([
      'Sceau Arcane',
      'Sceau du Jardin de jade',
      'Sceau de Néon 2084',
      'Sceau de la Forge',
      'Sceau de l’Olympe',
      'Sceau de la Cour écarlate',
      'Sceau du Néant',
      'Sceau de la Voûte céleste',
    ]);
  });

  it('rayons : ordre, libellés, notes', () => {
    expect(RAYONS).toEqual(['rois', 'echiquiers', 'sorts', 'collections']);
    expect(RAYON_LABEL).toEqual({ rois: 'Rois', echiquiers: 'Échiquiers', sorts: 'Sorts', collections: 'Collections' });
    expect(RAYON_NOTE).toEqual({
      rois: 'Votre roi vous représente : vos adversaires le voient en face d’eux.',
      echiquiers: 'Votre échiquier vous suit dans toutes vos parties. Vos adversaires gardent le leur.',
      sorts: 'Vos sorts s’animent avec ce skin, chez vous comme chez votre adversaire.',
      collections: 'Trois skins assortis et une exclusivité qu’on ne trouve nulle part ailleurs : le sceau, à côté de votre pseudo.',
    });
  });

  it('« Surprenez-moi » : mêmes tirages pour un même hasard', () => {
    let a = 7;
    const rand = () => ((a = (a * 16807) % 2147483647) - 1) / 2147483646;
    const tirages: Trial[] = [];
    let t: Trial = { ...DEFAULT_ITEM };
    for (let i = 0; i < 4; i++) tirages.push((t = surprise(t, rand)));
    expect(tirages).toEqual(SURPRISES);
  });
});
