// Catalogue des skins (src/shared/catalog.ts et src/shared/skins/) : identifiants, raretés, grille des prix et ses
// exceptions, collections, produits et packs, « compléter la collection », panier d'essai, sceau, apparence des IA,
// emplacements (SLOT_DEFS) et tables qui en dérivent.
//
// Deux parties :
// - INVARIANTS : vrais pour toute offre (un identifiant vendu ne change jamais, un prix ne monte jamais, un objet par
//   emplacement…). Ne jamais les assouplir pour faire passer un changement d'offre ;
// - PHOTOGRAPHIE de l'offre au défaut : les objets, prix, collections et textes d'aujourd'hui. Un changement d'offre
//   voulu (nouvel objet, nouveau pack, autre prix) se reporte ici.
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  ALL_PRODUCTS, BOT_LOOK, COLLECTIONS, CURRENCY, DEFAULT_BOARD, DEFAULT_ITEM, DEFAULT_KING, DEFAULT_SKIN, FREE_ITEMS, ITEMS,
  ORACLE_LOOK, PACKS, PAYMENT_PROVIDER, PREMIUM_COLLECTIONS, PREMIUM_ITEMS, PRICE, PRODUCTS, RARITY, SHOP_COLLECTIONS, SHOP_FEATURED,
  SHOP_ITEMS, SLOTS, SLOT_DEFS, SLOT_LABEL, TRESOR, alone, boardStyle, bySlot, collectionItems, collectionOf, duplicated, formatPrice,
  itemById, itemLabel, kingStyle, normItem, normKing, productById, productPrice, quoteCart, sealName, sealOf, skinStyle, tresorPack,
  tresorSeals, unitPrice,
} from '../src/shared/catalog';
import type { ItemKind } from '../src/shared/catalog';
import { SLOT_TEXTS, equippedMessage, itemWithArticle, sealsIn, selectionLabel, whoSees } from '../src/shared/skins/texts';
import { TRESOR_RING } from '../src/shared/skins/collections';

/** Les 13 objets vendus avant les skins, avec leur emplacement et leur prix à l'unité d'alors (centimes). */
const HISTORIC_ITEMS: Record<string, { kind: ItemKind; price: number }> = {
  'skin:arcane': { kind: 'skin', price: 0 },
  'skin:inferno': { kind: 'skin', price: 299 },
  'skin:neon': { kind: 'skin', price: 299 },
  'skin:celestial': { kind: 'skin', price: 399 },
  'skin:void': { kind: 'skin', price: 399 },
  'skin:sakura': { kind: 'skin', price: 299 },
  'board:arcane': { kind: 'board', price: 0 },
  'board:wood': { kind: 'board', price: 0 },
  'board:slate': { kind: 'board', price: 0 },
  'board:marble': { kind: 'board', price: 199 },
  'board:obsidian': { kind: 'board', price: 199 },
  'board:jade': { kind: 'board', price: 199 },
  'board:ruby': { kind: 'board', price: 199 },
};
/** Les 11 produits vendus avant les skins : prix et nombre d'objets d'alors. */
const HISTORIC_PRODUCTS: Record<string, { price: number; count: number }> = {
  'skin:inferno': { price: 299, count: 1 },
  'skin:neon': { price: 299, count: 1 },
  'skin:sakura': { price: 299, count: 1 },
  'skin:celestial': { price: 399, count: 1 },
  'skin:void': { price: 399, count: 1 },
  'board:marble': { price: 199, count: 1 },
  'board:obsidian': { price: 199, count: 1 },
  'board:jade': { price: 199, count: 1 },
  'board:ruby': { price: 199, count: 1 },
  'pack:skins': { price: 999, count: 5 },
  'pack:all': { price: 1299, count: 9 },
};

/** Prix à l'unité attendus (plan des skins, § 2) : la grille, plus les deux prix gardés (Rubis, Céleste). */
const EXPECTED_PRICES: Record<string, number> = {
  'king:printemps': 299, 'king:synthe': 299, 'king:braise': 299, 'king:laure': 299, 'king:rubis': 399, 'king:eclipse': 399, 'king:astral': 499,
  'board:jade': 199, 'board:grille': 199, 'board:obsidian': 199, 'board:marble': 199, 'board:ruby': 199, 'board:horizon': 249, 'board:ciel': 299,
  'skin:sakura': 299, 'skin:neon': 299, 'skin:inferno': 299, 'skin:laurier': 299, 'skin:ecarlate': 399, 'skin:void': 399, 'skin:celestial': 399,
};

const paid = ITEMS.filter(i => !i.free);

/** Empreinte (sha256, 16 caractères) du JSON, champs nouveaux retirés. */
function empreinte(x: unknown, sans: readonly string[] = []): string {
  const json = JSON.stringify(x, (k, v) => (sans.includes(k) ? undefined : v));
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

// =============================================================================================
// INVARIANTS

describe('invariants : objets', () => {
  it('identifiants uniques, préfixe = emplacement, style présent pour son emplacement seulement', () => {
    expect(new Set(ITEMS.map(i => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) {
      expect(i.id.split(':')[0], i.id).toBe(i.kind);
      expect(!!i.king, i.id).toBe(i.kind === 'king');
      expect(!!i.board, i.id).toBe(i.kind === 'board');
      expect(!!i.skin, i.id).toBe(i.kind === 'skin');
      expect(i.name.length && i.description.length, i.id).toBeTruthy();
    }
  });

  it('free ⇔ rareté « offert » ; chaque emplacement a son défaut offert', () => {
    for (const i of ITEMS) expect(i.free, i.id).toBe(i.rarity === 'offert');
    expect(DEFAULT_ITEM).toEqual({ king: DEFAULT_KING, board: DEFAULT_BOARD, skin: DEFAULT_SKIN });
    for (const k of SLOTS) {
      const it = itemById(DEFAULT_ITEM[k])!;
      expect(it.kind).toBe(k);
      expect(it.free).toBe(true);
    }
  });

  it('identifiants historiques présents, au même emplacement (garde-fou « jamais renommer »)', () => {
    for (const [id, h] of Object.entries(HISTORIC_ITEMS)) expect(itemById(id)?.kind, id).toBe(h.kind);
    for (const id of Object.keys(HISTORIC_PRODUCTS)) expect(productById(id), id).toBeDefined();
  });

  it('replis : style par défaut pour un identifiant absent ou inconnu ; normKing', () => {
    expect(skinStyle(undefined)).toBe(skinStyle(DEFAULT_SKIN));
    expect(skinStyle('skin:inconnu')).toBe(skinStyle(DEFAULT_SKIN));
    expect(boardStyle('board:inconnu')).toBe(boardStyle(DEFAULT_BOARD));
    expect(kingStyle('king:inconnu')).toBe(kingStyle(DEFAULT_KING));
    expect(kingStyle('skin:inferno')).toBe(kingStyle(DEFAULT_KING));
    expect(kingStyle('king:braise').gem).toBe('#ff7a1a');
    expect(normKing('king:braise')).toBe('king:braise');
    for (const bad of [undefined, null, '', 'king:inconnu', 'skin:inferno', '__proto__']) expect(normKing(bad)).toBe(DEFAULT_KING);
  });
});

describe('invariants : prix et produits', () => {
  it('un produit à l’unité par objet payant : même identifiant, prix > 0, libellé dérivé', () => {
    for (const i of paid) {
      const p = productById(i.id)!;
      expect(p, i.id).toBeDefined();
      expect(p.kind).toBe('item');
      expect(p.items).toEqual([i.id]);
      expect(p.priceCents).toBe(unitPrice(i.id));
      expect(p.priceCents).toBeGreaterThan(0);
    }
    expect(productById('king:braise')!.name).toBe('Roi de braise');
    expect(productById('board:obsidian')!.name).toBe('Échiquier Obsidienne & Or');
    expect(productById('skin:inferno')!.name).toBe('Sorts Inferno');
    expect(productById('skin:inferno')!.badge).toBe('Populaire');
    for (const id of FREE_ITEMS) expect(productById(id)).toBeUndefined();
  });

  it('aucun prix d’un objet ou d’un produit déjà vendu ne monte', () => {
    for (const [id, h] of Object.entries(HISTORIC_ITEMS)) expect(unitPrice(id), id).toBeLessThanOrEqual(h.price);
    for (const [id, h] of Object.entries(HISTORIC_PRODUCTS)) {
      const p = productById(id)!;
      if (h.count === 1) expect(p.priceCents, id).toBeLessThanOrEqual(h.price);
      // Un pack qui s'agrandit peut coûter plus, mais pas plus cher par objet (Grimoire des sorts : 7 sorts à 12,99 €
      // au lieu de 5 à 9,99 €)
      else expect(p.priceCents / p.items.length, id).toBeLessThanOrEqual(h.price / h.count);
    }
    expect(productById('pack:all')!.priceCents).toBe(1299);
  });

  it('identifiants de produits uniques ; en vente = tous sauf les retirés', () => {
    expect(new Set(ALL_PRODUCTS.map(p => p.id)).size).toBe(ALL_PRODUCTS.length);
    expect(PRODUCTS).toEqual(ALL_PRODUCTS.filter(p => !p.retired));
    expect(ALL_PRODUCTS.filter(p => p.retired).map(p => p.id)).toEqual(['pack:all']);
    for (const p of ALL_PRODUCTS) for (const id of p.items) expect(itemById(id), `${p.id} → ${id}`).toBeDefined();
  });

  it('formatPrice', () => {
    expect(formatPrice(6429).replace(/\s/g, ' ')).toBe('64,29 €');
  });

  it('un pack garde son prix fixe, même si l’on possède une partie de son contenu ; tout possédé → null', () => {
    const p = productById('pack:skins')!;
    expect(productPrice(p, ['skin:inferno', 'skin:void'])).toBe(1299);
    expect(productPrice(p, p.items)).toBeNull();
    expect(productPrice(productById('king:braise')!, ['king:braise'])).toBeNull();
    expect(productPrice(productById('king:braise')!, [])).toBe(299);
  });
});

describe('invariants : collections', () => {
  it('un objet par emplacement, de la rareté de la collection ; collections disjointes ; tout objet payant dans une collection', () => {
    for (const c of COLLECTIONS) {
      for (const k of SLOTS) {
        const it = itemById(c[k])!;
        expect(it?.kind, `${c.id} ${k}`).toBe(k);
        expect(it.rarity, `${c.id} ${c[k]}`).toBe(c.rarity);
        expect(collectionOf(c[k])).toBe(c);
      }
      expect(collectionItems(c)).toEqual(SLOTS.map(k => c[k]));
    }
    const all = COLLECTIONS.flatMap(collectionItems);
    expect(new Set(all).size).toBe(all.length);
    for (const i of paid) expect(collectionOf(i.id), i.id).toBeDefined();
    expect(PREMIUM_COLLECTIONS).toEqual(COLLECTIONS.filter(c => c.rarity !== 'offert'));
  });

  it('« compléter la collection » : prix − valeur possédée, jamais sous la pièce manquante la moins chère', () => {
    const forge = productById('col:inferno')!;
    expect(productPrice(forge, [])).toBe(599);
    expect(productPrice(forge, ['skin:inferno'])).toBe(300);
    expect(productPrice(forge, ['skin:arcane', 'board:arcane', 'king:arcane', 'skin:inferno'])).toBe(300);
    // Inferno (2,99) et Obsidienne (1,99) possédés : 5,99 − 4,98 = 1,01, plancher au Roi de braise (2,99)
    expect(productPrice(forge, ['skin:inferno', 'board:obsidian'])).toBe(299);
    expect(productPrice(forge, ['king:braise', 'board:obsidian', 'skin:inferno'])).toBeNull();
    // Voûte céleste, détenteur des sorts Céleste (3,99 € gardé) : 9,99 − 3,99 = 6,00
    expect(productPrice(productById('col:celeste')!, ['skin:celestial'])).toBe(600);
  });
});

describe('invariants : panier d’essai (quoteCart)', () => {
  it('un panier qui complète une collection est compté au prix « compléter »', () => {
    const q = quoteCart(['king:braise', 'board:obsidian'], ['skin:inferno'])!;
    expect(q.totalCents).toBe(300);
    expect(q.lines).toEqual([{ label: 'Collection Forge d’Inferno', items: ['king:braise', 'board:obsidian'], cents: 300, productId: 'col:inferno' }]);
    const full = quoteCart(['skin:inferno', 'king:braise', 'board:obsidian'], [])!;
    expect(full.totalCents).toBe(599);
    expect(full.lines).toHaveLength(1);
  });

  it('un panier mêlant plusieurs collections, sans en compléter aucune : prix à l’unité', () => {
    const q = quoteCart(['king:braise', 'board:jade', 'skin:void'], [])!;
    expect(q.totalCents).toBe(299 + 199 + 399);
    expect(q.lines.map(l => l.label)).toEqual(['Roi de braise', 'Échiquier Palais de jade', 'Sorts Néant']);
  });

  it('les objets offerts et déjà possédés ne se paient pas', () => {
    const q = quoteCart(['king:arcane', 'board:wood', 'skin:laurier'], ['skin:inferno'])!;
    expect(q.lines).toEqual([{ label: 'Sorts Laurier', items: ['skin:laurier'], cents: 299, productId: 'skin:laurier' }]);
  });

  it('refus : deux objets du même emplacement, objet inconnu ; tout possédé ou offert → null', () => {
    expect(quoteCart(['king:braise', 'king:rubis'], [])).toBeNull();
    expect(quoteCart(['king:inconnu'], [])).toBeNull();
    expect(quoteCart(['king:braise'], ['king:braise'])).toBeNull();
    expect(quoteCart(['king:arcane', 'board:wood'], [])).toBeNull();
    expect(quoteCart([], [])).toBeNull();
  });
});

describe('invariants : sceau de collection', () => {
  const all = (id: string) => {
    const c = COLLECTIONS.find(x => x.id === id)!;
    return [c.king, c.board, c.skin];
  };
  it('rien → null ; Arcane ne compte jamais ; collection incomplète → null', () => {
    expect(sealOf([])).toBeNull();
    expect(sealOf(FREE_ITEMS)).toBeNull();
    expect(sealOf(['king:braise', 'skin:inferno'])).toBeNull();
  });
  it('une collection complète → son id ; plusieurs → la plus rare, puis l’ordre du catalogue', () => {
    expect(sealOf(all('col:inferno'))).toBe('col:inferno');
    expect(sealOf([...all('col:inferno'), ...all('col:celeste')])).toBe('col:celeste');
    expect(sealOf([...all('col:ecarlate'), ...all('col:inferno')])).toBe('col:ecarlate');
    expect(sealOf([...all('col:neon'), ...all('col:jade')])).toBe('col:jade');
    expect(sealOf([...all('col:neant'), ...all('col:ecarlate')])).toBe('col:ecarlate');
  });
});

describe('invariants : emplacements (SLOT_DEFS, source unique)', () => {
  it('SLOTS, libellés et objets par défaut dérivés de SLOT_DEFS ; chaque défaut est offert et de son emplacement', () => {
    expect(SLOTS).toEqual(Object.keys(SLOT_DEFS));
    for (const k of SLOTS) {
      expect(SLOT_LABEL[k]).toBe(SLOT_DEFS[k].label);
      expect(DEFAULT_ITEM[k]).toBe(SLOT_DEFS[k].default);
      expect(itemById(DEFAULT_ITEM[k])).toMatchObject({ kind: k, free: true });
      expect(SLOT_DEFS[k].column).toBe(`equipped_${k}`);
      // `follows` (SLOT_TEXTS) dit ce que devient un objet que l'adversaire ne voit pas : présent si et seulement si
      // `seen` est faux
      expect(!!SLOT_TEXTS[k].follows, k).toBe(!SLOT_DEFS[k].seen);
    }
    expect(new Set(SLOTS.map(k => SLOT_DEFS[k].rayon)).size).toBe(SLOTS.length);
    expect(SLOTS.map(k => SLOT_DEFS[k].rayon)).not.toContain('collections');
  });

  it('normItem : un objet connu de cet emplacement, sinon le défaut de l’emplacement', () => {
    for (const k of SLOTS) {
      for (const it of ITEMS.filter(i => i.kind === k)) expect(normItem(k, it.id)).toBe(it.id);
      for (const bad of [undefined, null, '', `${k}:inconnu`, '__proto__', ...ITEMS.filter(i => i.kind !== k).map(i => i.id)]) {
        expect(normItem(k, bad)).toBe(DEFAULT_ITEM[k]);
      }
    }
    expect(normKing('king:braise')).toBe(normItem('king', 'king:braise'));
  });

  it('bySlot : objets rangés par emplacement dans l’ordre reçu, inconnus à part ; duplicated, alone', () => {
    const s = bySlot(['skin:void', 'king:braise', 'x:inconnu', 'skin:neon']);
    expect(s.items.map(i => i.id)).toEqual(['skin:void', 'king:braise', 'skin:neon']);
    expect(s.unknown).toEqual(['x:inconnu']);
    expect(s.of.skin.map(i => i.id)).toEqual(['skin:void', 'skin:neon']);
    expect(s.of.board).toEqual([]);
    expect(duplicated(s)).toBe(true);
    expect(alone(s, 'king')?.id).toBe('king:braise');
    expect(alone(s, 'skin')).toBeUndefined();
    expect(duplicated(bySlot(['king:braise', 'board:jade', 'skin:void']))).toBe(false);
  });

  it('objets et collections premium : les payants en vente, les collections non offertes ; Trésor selon son réglage', () => {
    expect(PREMIUM_ITEMS).toEqual(ITEMS.filter(i => !i.free && !i.retired));
    expect(SHOP_ITEMS).toEqual(ITEMS.filter(i => !i.retired));
    expect(SHOP_COLLECTIONS).toEqual(PREMIUM_COLLECTIONS.filter(c => PRODUCTS.some(p => p.id === c.id)));
    const tresor = productById('pack:tresor')!;
    if (TRESOR.items === 'premium') expect(tresor.items).toEqual(PREMIUM_ITEMS.map(i => i.id));
    else {
      expect(TRESOR.items.length).toBeGreaterThan(0);
      for (const id of TRESOR.items) expect(itemById(id), id).toMatchObject({ free: false });
      expect(tresor.items).toEqual(TRESOR.items.filter(id => !itemById(id)!.retired));
    }
    expect(tresor.future ?? []).toEqual([...TRESOR.future]);
    for (const p of PACKS) for (const id of p.items) expect([itemById(id)?.free, !!itemById(id)?.retired], `${p.id} : ${id}`).toEqual([false, false]);
    expect(PACKS).toEqual(PRODUCTS.filter(p => p.kind === 'pack'));
    for (const c of COLLECTIONS) expect(sealName(c)).toBe(c.sealName ?? `Sceau ${c.name}`);
  });

  it('un pack ne promet que les sceaux qu’il apporte : sealsIn = les collections premium qu’il complète', () => {
    for (const p of PACKS) {
      const seals = sealsIn(p.items);
      expect(seals.map(c => c.id).sort()).toEqual(PREMIUM_COLLECTIONS.filter(c => collectionItems(c).every(i => p.items.includes(i))).map(c => c.id).sort());
      expect(seals).toEqual(tresorSeals().filter(c => seals.includes(c)));
    }
    expect(sealsIn([])).toEqual([]);
  });

  it('objet mis en avant (SHOP_FEATURED) : existant, de son emplacement, en vente', () => {
    for (const k of SLOTS) {
      const id = SHOP_FEATURED[k];
      if (id) expect([itemById(id)?.kind, !!itemById(id)?.retired], id).toEqual([k, false]);
    }
  });

  it('Trésor sous d’autres réglages : liste figée (sans les offerts, inconnus ni retirés), promesse des prochains', () => {
    const figé = tresorPack({ items: ['king:braise', 'board:obsidian', 'skin:inferno', 'board:wood', 'king:inconnu'], future: [] });
    expect(figé.items).toEqual(['king:braise', 'board:obsidian', 'skin:inferno']);
    expect(figé.description).toBe('Les 3 objets d’une collection premium : rois, échiquiers et sorts.');
    expect(figé.compareAtCents).toBe(299 + 199 + 299);
    expect(sealsIn(figé.items).map(c => c.id)).toEqual(['col:inferno']);
    expect(figé.future).toBeUndefined();
    const rois = tresorPack({ items: ['king:braise', 'king:synthe'], future: [] });
    expect(rois.description).toBe('Les 2 objets des 2 collections premium : rois.');
    expect(sealsIn(rois.items)).toEqual([]);
    const promis = tresorPack({ items: 'premium', future: ['king', 'board', 'skin'] });
    expect(promis.items).toEqual(productById('pack:tresor')!.items);
    expect(promis.future).toEqual(['king', 'board', 'skin']);
    expect(promis.description).toBe('Les 21 objets des 7 collections premium : rois, échiquiers et sorts, et les prochains offerts.');
    // Au défaut : le Trésor d'aujourd'hui (mêmes clés, même ordre)
    expect(tresorPack(TRESOR)).toEqual(productById('pack:tresor'));
    expect(JSON.stringify(tresorPack(TRESOR))).toBe(JSON.stringify(productById('pack:tresor')));
  });

  it('bandeau du Trésor : toutes les collections premium, celles de TRESOR_RING d’abord dans son ordre', () => {
    const seals = tresorSeals();
    expect([...seals].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...PREMIUM_COLLECTIONS].sort((a, b) => a.id.localeCompare(b.id)));
    const ringed = TRESOR_RING.filter(id => PREMIUM_COLLECTIONS.some(c => c.id === id));
    expect(seals.slice(0, ringed.length).map(c => c.id)).toEqual(ringed);
  });

  it('un objet retiré : hors des rayons, des packs et du Trésor, son produit n’est plus en vente, mais il reste résolu', async () => {
    vi.resetModules();
    vi.doMock('../src/shared/skins/spells', async orig => {
      const m = await orig<typeof import('../src/shared/skins/spells')>();
      const inferno = m.SPELL_ITEMS.find(i => i.id === 'skin:inferno')!;
      return { ...m, SPELL_ITEMS: [...m.SPELL_ITEMS, { ...inferno, id: 'skin:ancien', name: 'Ancien', badge: undefined, retired: true }] };
    });
    try {
      const c = await import('../src/shared/catalog');
      expect(c.itemById('skin:ancien')?.retired).toBe(true);
      expect(c.normItem('skin', 'skin:ancien')).toBe('skin:ancien');
      expect(c.SHOP_ITEMS.some(i => i.id === 'skin:ancien')).toBe(false);
      expect(c.PREMIUM_ITEMS.some(i => i.id === 'skin:ancien')).toBe(false);
      expect(c.productById('skin:ancien')).toMatchObject({ retired: true, priceCents: 299 });
      expect(c.PRODUCTS.some(p => p.id === 'skin:ancien')).toBe(false);
      for (const p of c.PACKS) expect(p.items, p.id).not.toContain('skin:ancien');
      // Le reste de l'offre ne bouge pas
      expect(c.PRODUCTS.map(p => [p.id, p.priceCents, p.items.length])).toEqual(PRODUCTS.map(p => [p.id, p.priceCents, p.items.length]));
    } finally {
      vi.doUnmock('../src/shared/skins/spells');
      vi.resetModules();
    }
  });

  it('un objet retiré dans une collection : ni le panier ni la collection ne le vendent, le Trésor ne promet que ses sceaux', async () => {
    vi.resetModules();
    vi.doMock('../src/shared/skins/spells', async orig => {
      const m = await orig<typeof import('../src/shared/skins/spells')>();
      return { ...m, SPELL_ITEMS: m.SPELL_ITEMS.map(i => (i.id === 'skin:neon' ? { ...i, retired: true } : i)) };
    });
    try {
      const c = await import('../src/shared/catalog');
      // Le panier ne vend pas l'objet retiré ; qui le possède paie les autres pièces à l'unité (collection plus en vente)
      expect(c.quoteCart(['skin:neon'], FREE_ITEMS)).toBeNull();
      expect(c.quoteCart(['king:synthe', 'board:grille', 'skin:neon'], FREE_ITEMS)).toBeNull();
      expect(c.quoteCart(['king:synthe', 'board:grille'], [...FREE_ITEMS, 'skin:neon'])).toMatchObject({
        totalCents: 299 + 199,
        lines: [{ productId: 'king:synthe' }, { productId: 'board:grille' }],
      });
      expect(c.quoteCart(['skin:neon'], [...FREE_ITEMS, 'skin:neon'])).toBeNull();
      // La collection ne se vend plus, mais reste résolue ; son sceau reste à qui l'a complétée
      expect(c.productById('col:neon')).toMatchObject({ retired: true, items: ['king:synthe', 'board:grille', 'skin:neon'] });
      expect(c.PRODUCTS.some(p => p.id === 'col:neon')).toBe(false);
      expect(c.SHOP_COLLECTIONS.map(x => x.id)).not.toContain('col:neon');
      expect(c.PREMIUM_COLLECTIONS.map(x => x.id)).toContain('col:neon');
      expect(c.sealOf(['king:synthe', 'board:grille', 'skin:neon'])).toBe('col:neon');
      // Le Trésor : sans l'objet retiré, et seulement les sceaux qu'il complète
      const t = c.productById('pack:tresor')!;
      expect(t.items).toHaveLength(20);
      expect(t.items).not.toContain('skin:neon');
      expect(t.description).toBe('Les 20 objets des 7 collections premium : rois, échiquiers et sorts.');
      expect((await import('../src/shared/skins/texts')).sealsIn(t.items).map(x => x.id)).toEqual(['col:celeste', 'col:neant', 'col:ecarlate', 'col:inferno', 'col:jade', 'col:olympe']);
      expect(c.sealOf(t.items)).not.toBeNull();
      for (const p of c.PACKS) expect(p.items, p.id).not.toContain('skin:neon');
      // Le reste de l'offre ne bouge pas
      const autres = (ps: { id: string; priceCents: number }[]) => ps.filter(p => !['skin:neon', 'col:neon', 'pack:tresor', 'pack:skins'].includes(p.id)).map(p => [p.id, p.priceCents]);
      expect(autres(c.PRODUCTS)).toEqual(autres(PRODUCTS));
    } finally {
      vi.doUnmock('../src/shared/skins/spells');
      vi.resetModules();
    }
  });

  it('un emplacement vu par l’adversaire n’a pas de phrase « il vous suit » (seen l’emporte sur follows)', async () => {
    vi.resetModules();
    vi.doMock('../src/shared/skins/slots', async orig => {
      const m = await orig<typeof import('../src/shared/skins/slots')>();
      return { ...m, SLOT_DEFS: { ...m.SLOT_DEFS, board: { ...m.SLOT_DEFS.board, seen: true } } };
    });
    try {
      const c = await import('../src/shared/skins/texts');
      const t = await import('../src/client/pages/shop/trial');
      expect(c.whoSees()).toBe('Votre roi, votre échiquier et vos sorts : vos adversaires les voient.');
      expect(t.equipNote(['board:ruby'])).toBe('vos adversaires verront votre échiquier dès votre prochaine partie');
    } finally {
      vi.doUnmock('../src/shared/skins/slots');
      vi.resetModules();
    }
  });
});

describe('invariants : un emplacement fictif ne compile pas tant qu’il n’est pas complété', () => {
  it('ajouter une entrée à SLOT_DEFS fait échouer la compilation dans les tables à compléter, et seulement là', () => {
    const ROOT = path.resolve(__dirname, '..');
    const SLOTS_FILE = path.join(ROOT, 'src/shared/skins/slots.ts');
    const config = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
    const roots = ['src/shared/catalog.ts', 'src/shared/skins/texts.ts', 'src/client/skins.ts', 'src/client/pages/shop/ItemThumb.tsx', 'src/server/auth.ts'].map(f => path.join(ROOT, f));
    const errorsWith = (slots: string) => {
      const host = ts.createCompilerHost({ ...options, noEmit: true });
      const read = host.readFile.bind(host);
      host.readFile = f => (path.resolve(f) === SLOTS_FILE ? slots : read(f));
      const getSource = host.getSourceFile.bind(host);
      host.getSourceFile = (f, v, onError, create) =>
        path.resolve(f) === SLOTS_FILE ? ts.createSourceFile(f, slots, v) : getSource(f, v, onError, create);
      const program = ts.createProgram(roots, { ...options, noEmit: true }, host);
      return ts.getPreEmitDiagnostics(program).map(d => (d.file ? path.relative(ROOT, d.file.fileName) : '?'));
    };
    const source = ts.sys.readFile(SLOTS_FILE)!;
    expect(errorsWith(source)).toEqual([]);
    // Un dos de carte, décrit ici seulement : sans prix, sans collections complétées, sans champ du compte, sans
    // dessin de vignette, sans colonne côté serveur
    const fictif = source.replace(
      '} as const satisfies Record<string, SlotDef>;',
      `  cardback: {
    label: 'Dos', plural: 'Dos', word: 'dos', words: 'dos', pl: false, unit: ['dos', 'dos'], named: false, article: 'le ',
    rayon: 'dos', view: 'partie', seen: true, default: 'cardback:arcane', column: 'equipped_cardback', meField: 'equippedCardback',
  },
} as const satisfies Record<string, SlotDef>;`,
    );
    expect(fictif).not.toBe(source);
    const files = new Set(errorsWith(fictif));
    expect([...files].sort()).toEqual([
      'src/client/pages/shop/ItemThumb.tsx',
      'src/client/skins.ts',
      'src/server/auth.ts',
      'src/shared/catalog.ts',
      'src/shared/skins/collections.ts',
      'src/shared/skins/texts.ts',
    ]);
  }, 120_000);
});

// =============================================================================================
// PHOTOGRAPHIE de l'offre au défaut

describe('photographie : objets, prix, collections, packs', () => {
  it('26 objets : 8 rois, 10 échiquiers, 8 sorts ; 5 offerts et 21 payants (7 par emplacement)', () => {
    expect(ITEMS).toHaveLength(26);
    const count = (k: ItemKind, free?: boolean) => ITEMS.filter(i => i.kind === k && (free === undefined || i.free === free)).length;
    expect([count('king'), count('board'), count('skin')]).toEqual([8, 10, 8]);
    expect([...FREE_ITEMS].sort()).toEqual(['board:arcane', 'board:slate', 'board:wood', 'king:arcane', 'skin:arcane']);
    expect([count('king', false), count('board', false), count('skin', false)]).toEqual([7, 7, 7]);
  });

  it('raretés : libellés et couleurs du plan', () => {
    expect(RARITY).toEqual({
      offert: { label: 'Offert', color: '#c9c6dc' },
      rare: { label: 'Rare', color: '#5ee7ff' },
      epique: { label: 'Épique', color: '#c79bff' },
      legendaire: { label: 'Légendaire', color: '#f3c969' },
    });
  });

  it('valeurs de base des nouveautés et retouches (Obsidienne, Laurier, Écarlate, nouveaux échiquiers)', () => {
    expect(boardStyle('board:obsidian').dark).toBe('#322d38');
    expect(boardStyle('board:grille')).toMatchObject({ light: '#cbbcf2', dark: '#46317e', frame: '#0b0614', texture: 'none', coords: '#46317e' });
    expect(boardStyle('board:horizon')).toMatchObject({ light: '#dcd8e4', dark: '#504372', frame: '#07050c', texture: 'grain', coords: '#504372' });
    expect(boardStyle('board:ciel')).toMatchObject({ light: '#ede3c8', dark: '#2c3672', frame: '#0e1230', texture: 'grain', coords: '#2c3672' });
    expect(skinStyle('skin:laurier')).toEqual({ primary: '#f3d27a', secondary: '#8fc27a', accent: '#fffbe8', particle: 'petal', flourish: 'laurel', drift: -0.5, flash: 0.75, shake: 0.2 });
    expect(skinStyle('skin:ecarlate')).toEqual({ primary: '#ff3d5e', secondary: '#ffc861', accent: '#fff0f3', particle: 'shard', flourish: 'filigree', drift: -0.2, flash: 0.85, shake: 0.45 });
    // Les autres échiquiers et sorts d'avant gardent leurs couleurs
    expect(boardStyle('board:arcane')).toEqual({ light: '#d8d3ee', dark: '#6f62ad', frame: '#1c1838', texture: 'grain', coords: '#3b3270' });
    expect(skinStyle('skin:inferno').primary).toBe('#ff7a1a');
  });

  it('grille du plan, avec deux exceptions : échiquier Rubis 1,99 € et sorts Céleste 3,99 €', () => {
    expect(PRICE).toEqual({
      rare: { king: 299, board: 199, skin: 299, collection: 599 },
      epique: { king: 399, board: 249, skin: 399, collection: 799 },
      legendaire: { king: 499, board: 299, skin: 499, collection: 999 },
    });
    expect(Object.keys(EXPECTED_PRICES).sort()).toEqual(paid.map(i => i.id).sort());
    for (const [id, cents] of Object.entries(EXPECTED_PRICES)) expect(unitPrice(id), id).toBe(cents);
    for (const id of FREE_ITEMS) expect(unitPrice(id)).toBe(0);
    expect(unitPrice('king:inconnu')).toBe(0);
    const exceptions = paid.filter(i => i.priceCents !== undefined).map(i => i.id).sort();
    expect(exceptions).toEqual(['board:ruby', 'skin:celestial']);
  });

  it('8 collections : un roi, un échiquier, des sorts, existants, de la même rareté', () => {
    expect(COLLECTIONS.map(c => c.id)).toEqual(['col:arcane', 'col:jade', 'col:neon', 'col:inferno', 'col:olympe', 'col:ecarlate', 'col:neant', 'col:celeste']);
    for (const c of COLLECTIONS) {
      for (const [k, id] of [['king', c.king], ['board', c.board], ['skin', c.skin]] as const) {
        const it = itemById(id)!;
        expect(it?.kind, `${c.id} ${k}`).toBe(k);
        expect(it.rarity, `${c.id} ${id}`).toBe(c.rarity);
        expect(collectionOf(id)).toBe(c);
      }
    }
    // Un objet appartient à une collection au plus ; Bois de chêne et Ardoise à aucune
    const all = COLLECTIONS.flatMap(c => [c.king, c.board, c.skin]);
    expect(new Set(all).size).toBe(all.length);
    expect(collectionOf('board:wood')).toBeUndefined();
    expect(collectionOf('board:slate')).toBeUndefined();
    // Tous les objets payants sont dans une collection
    for (const i of paid) expect(collectionOf(i.id), i.id).toBeDefined();
  });

  it('produits de collection : prix de la grille, prix barré calculé et plus élevé ; Arcane sans produit', () => {
    expect(productById('col:arcane')).toBeUndefined();
    const expected: Record<string, [number, number]> = {
      'col:jade': [599, 797], 'col:neon': [599, 797], 'col:inferno': [599, 797], 'col:olympe': [599, 797],
      'col:ecarlate': [799, 997], 'col:neant': [799, 1047], 'col:celeste': [999, 1197],
    };
    for (const [id, [price, compare]] of Object.entries(expected)) {
      const p = productById(id)!;
      expect(p.kind).toBe('collection');
      expect(p.collection).toBe(id);
      expect([p.priceCents, p.compareAtCents]).toEqual([price, compare]);
      expect(p.priceCents).toBeLessThan(p.compareAtCents!);
      expect(p.items).toHaveLength(3);
    }
  });

  it('Trésor du Bazar : les 21 objets premium, 24,99 €, prix barré calculé de 64,29 €', () => {
    const p = productById('pack:tresor')!;
    expect(p.kind).toBe('pack');
    expect([...p.items].sort()).toEqual(paid.map(i => i.id).sort());
    expect(p.priceCents).toBe(2499);
    expect(p.compareAtCents).toBe(6429);
    expect(p.badge).toBe('Meilleure offre');
    expect(p.future).toBeUndefined();
    expect(p.retired).toBeFalsy();
  });

  it('Grimoire des sorts (ancien « Collection légendaire ») : les 7 sorts premium, 12,99 €, promesse des prochains', () => {
    const p = productById('pack:skins')!;
    expect(p.name).toBe('Grimoire des sorts');
    expect([...p.items].sort()).toEqual(paid.filter(i => i.kind === 'skin').map(i => i.id).sort());
    expect(p.items).toHaveLength(7);
    expect(p.priceCents).toBe(1299);
    expect(p.compareAtCents).toBe(2393);
    expect(p.future).toEqual(['skin']);
    expect(p.description).toContain('7 sorts');
  });

  it('Grimoire complet : retiré de la vente mais toujours résolu, contenu d’origine, promesse sorts et échiquiers', () => {
    const p = productById('pack:all')!;
    expect(p.retired).toBe(true);
    expect(PRODUCTS.some(x => x.id === 'pack:all')).toBe(false);
    expect(p.items).toHaveLength(9);
    expect(p.compareAtCents).toBe(2491);
    expect(p.future).toEqual(['skin', 'board']);
  });

  it('BOT_LOOK et ORACLE_LOOK : des objets existants du bon emplacement', () => {
    for (const look of [...Object.values(BOT_LOOK), ORACLE_LOOK]) {
      expect(itemById(look.skin)?.kind).toBe('skin');
      expect(itemById(look.king)?.kind).toBe('king');
    }
    // Les sorts des IA ne changent pas (Arcane, Inferno, Néant) ; leurs rois sont ceux du plan
    expect(BOT_LOOK).toEqual({
      1: { skin: 'skin:arcane', king: 'king:arcane' },
      2: { skin: 'skin:inferno', king: 'king:braise' },
      3: { skin: 'skin:void', king: 'king:eclipse' },
    });
    expect(ORACLE_LOOK).toEqual({ skin: 'skin:void', king: 'king:eclipse' });
  });
});

// Prise avant la refonte (lot 2 de la passe « polymorphe ») : les tables dérivées (emplacements, libellés, produits)
// doivent rester égales à ces valeurs, au caractère près. Les champs ajoutés par la refonte (Item.badge, Item.retired,
// Collection.sealName, Product.display, Product.shortName) sont retirés avant de comparer l'empreinte : leur ajout est
// voulu, le reste ne bouge pas (même ordre des clés).
describe('photographie de l’offre au défaut (identique à la boutique d’avant la refonte)', () => {
  it('objets, collections et produits : mêmes données, même ordre, mêmes clés', () => {
    expect(empreinte(ITEMS, ['badge', 'retired'])).toBe('7db9051280ad9270');
    expect(empreinte(COLLECTIONS, ['sealName'])).toBe('f5bdd1ad80879e67');
    expect(empreinte(ALL_PRODUCTS, ['display', 'shortName'])).toBe('fbc704e7d3d878be');
    expect(PRODUCTS.map(p => p.id)).toEqual(ALL_PRODUCTS.filter(p => p.id !== 'pack:all').map(p => p.id));
  });

  it('produits : libellés, descriptions, prix, prix barrés et badges', () => {
    const lignes = ALL_PRODUCTS.map(p => [p.id, p.name, p.description, p.priceCents, p.compareAtCents ?? null, p.badge ?? null]);
    expect(lignes).toEqual([
      ['king:printemps', 'Roi du printemps', 'Une couronne de lotus, une fleur de cerisier pour croix et un rameau en fleurs gravé sur la porcelaine.', 299, null, 'Nouveau'],
      ['king:synthe', 'Roi Synthé', 'Tout en angles : une visière néon et un pixel lumineux au cœur de la croix. Le roi du club de 2084.', 299, null, 'Nouveau'],
      ['king:braise', 'Roi de braise', 'Une couronne de flammes, une croix de feu et une veine de lave qui le fend de part en part.', 299, null, 'Nouveau'],
      ['king:laure', 'Roi lauré', 'Un dôme de marbre ceint d’une couronne de laurier d’or, une croix pattée, un fût cannelé de colonne grecque.', 299, null, 'Nouveau'],
      ['king:rubis', 'Roi de rubis', 'La couronne impériale : arches perlées, coiffe de velours écarlate, globe d’or et croix, rubis au front.', 399, null, 'Nouveau'],
      ['king:eclipse', 'Roi éclipse', 'Un soleil noir ceint d’un anneau d’accrétion, et un œil de néant posé sur le bandeau.', 399, null, 'Nouveau'],
      ['king:astral', 'Roi astral', 'Une couronne de rayons, une étoile d’or pour croix et un croissant de lune gravé : le roi de la carte du ciel.', 499, null, 'Nouveau'],
      ['board:marble', 'Échiquier Marbre de Carrare', 'Marbre blanc veiné, marbre gris et frise grecque d’or : l’échiquier des vainqueurs.', 199, null, null],
      ['board:obsidian', 'Échiquier Obsidienne & Or', 'Pierre volcanique sertie d’or, rivets forgés et veines de lave figées dans la roche.', 199, null, null],
      ['board:jade', 'Échiquier Palais de jade', 'Jade impérial et ivoire, liseré d’or ; des pétales de cerisier tombent sur l’échiquier.', 199, null, null],
      ['board:ruby', 'Échiquier Rubis', 'Rubis taillé et crème, serti d’un filigrane d’or : taillé pour l’attaque.', 199, null, null],
      ['board:grille', 'Échiquier Grille 2084', 'Cases indigo et lavande sous une grille cyan qui ne s’éteint jamais, cadre néon magenta.', 199, null, 'Nouveau'],
      ['board:horizon', 'Échiquier Horizon des événements', 'Un ciel éteint : un disque d’accrétion violet tourne autour d’une singularité, au cœur de l’échiquier.', 249, null, 'Nouveau'],
      ['board:ciel', 'Échiquier Carte du ciel', 'Parchemin et bleu nuit, piqué d’étoiles d’or comme une carte des astronomes.', 299, null, 'Nouveau'],
      ['skin:inferno', 'Sorts Inferno', 'Chaque carte s’embrase : braises, cercle de flammes et onde de chaleur.', 299, null, 'Populaire'],
      ['skin:neon', 'Sorts Néon 2084', 'Grille synthwave, pixels lumineux et glitch rétro-futuriste.', 299, null, null],
      ['skin:celestial', 'Sorts Céleste', 'Poussière d’étoiles dorée et constellations qui dessinent vos coups.', 399, null, null],
      ['skin:void', 'Sorts Néant', 'Un trou noir s’ouvre sous l’échiquier. Particules d’ombre et lueurs pourpres.', 399, null, null],
      ['skin:sakura', 'Sorts Sakura', 'Une pluie de pétales roses et un souffle de printemps à chaque sort.', 299, null, null],
      ['skin:laurier', 'Sorts Laurier', 'Une pluie de feuilles d’or et de laurier, et une couronne de vainqueur qui se referme à chaque sort.', 299, null, 'Nouveau'],
      ['skin:ecarlate', 'Sorts Écarlate', 'Des éclats de rubis jaillissent et retombent en pluie sous un anneau de filigrane d’or.', 399, null, 'Nouveau'],
      ['col:jade', 'Collection Jardin de jade', 'Dans un palais suspendu au-dessus des nuages, le printemps ne finit jamais.', 599, 797, null],
      ['col:neon', 'Collection Néon 2084', 'Un club clandestin rejoue les grandes parties en hologrammes.', 599, 797, null],
      ['col:inferno', 'Collection Forge d’Inferno', 'Au cœur du Sablier, une forge coule les couronnes dans l’obsidienne et l’or.', 599, 797, null],
      ['col:olympe', 'Collection Olympe', 'Sculpté dans le marbre de Carrare et couronné de laurier.', 599, 797, null],
      ['col:ecarlate', 'Collection Cour écarlate', 'La plus ancienne cour du ciel.', 799, 997, null],
      ['col:neant', 'Collection Néant', 'Ce qui reste quand le ciel s’éteint.', 799, 1047, null],
      ['col:celeste', 'Collection Voûte céleste', 'La carte du ciel de l’Odyssée : chaque coup y dessine une constellation.', 999, 1197, null],
      ['pack:skins', 'Grimoire des sorts', 'Les 7 sorts premium, et les prochains offerts.', 1299, 2393, '-46 %'],
      ['pack:tresor', 'Trésor du Bazar', 'Les 21 objets des 7 collections premium : rois, échiquiers et sorts.', 2499, 6429, 'Meilleure offre'],
      ['pack:all', 'Grimoire complet', 'Tous les skins et tous les plateaux premium.', 1299, 2491, null],
    ]);
  });

  it('emplacements : ordre, libellés, objets par défaut, libellé d’un objet', () => {
    expect(SLOTS).toEqual(['king', 'board', 'skin']);
    expect(SLOT_LABEL).toEqual({ king: 'Roi', board: 'Échiquier', skin: 'Sorts' });
    expect(DEFAULT_ITEM).toEqual({ king: 'king:arcane', board: 'board:arcane', skin: 'skin:arcane' });
    expect(ITEMS.filter(i => i.free).map(itemLabel)).toEqual(['Roi Arcane', 'Échiquier Nuit arcane', 'Échiquier Bois de chêne', 'Échiquier Ardoise', 'Sorts Arcane']);
    expect(COLLECTIONS.map(c => collectionItems(c).join(' '))).toEqual([
      'king:arcane board:arcane skin:arcane',
      'king:printemps board:jade skin:sakura',
      'king:synthe board:grille skin:neon',
      'king:braise board:obsidian skin:inferno',
      'king:laure board:marble skin:laurier',
      'king:rubis board:ruby skin:ecarlate',
      'king:eclipse board:horizon skin:void',
      'king:astral board:ciel skin:celestial',
    ]);
  });
});

describe('photographie : textes des emplacements et réglages de la vente au défaut', () => {
  it('libellés, articles, messages d’équipement, qui voit quoi, sélection', () => {
    const it = (id: string) => itemById(id)!;
    expect(['king:braise', 'board:ruby', 'skin:inferno'].map(id => itemWithArticle(it(id)))).toEqual([
      'le roi de braise', 'l’échiquier Rubis', 'les sorts Inferno',
    ]);
    expect(['king:braise', 'board:ruby', 'skin:inferno'].map(id => equippedMessage(it(id)))).toEqual([
      'Roi de braise équipé. Vos adversaires le verront dès votre prochaine partie.',
      'Échiquier Rubis équipé : il vous suit dans toutes vos parties.',
      'Sorts Inferno équipés : vos adversaires les verront à chacun de vos sorts.',
    ]);
    expect(whoSees()).toBe('Votre roi et vos sorts : vos adversaires les voient. Votre échiquier : il vous suit dans toutes vos parties.');
    expect(whoSees({ theirs: true })).toBe(
      'Votre roi et vos sorts : vos adversaires les voient. Votre échiquier : il vous suit dans toutes vos parties, et vos adversaires gardent le leur.',
    );
    expect([selectionLabel(1), selectionLabel(2), selectionLabel(3)]).toEqual(['Votre sélection (1 skin)', 'Votre sélection (2 skins)', 'Votre sélection (3 skins)']);
    expect(SLOTS.map(k => [SLOT_DEFS[k].plural, SLOT_DEFS[k].rayon, SLOT_DEFS[k].view])).toEqual([
      ['Rois', 'rois', 'roi'], ['Échiquiers', 'echiquiers', 'partie'], ['Sorts', 'sorts', 'partie'],
    ]);
  });

  it('vente : euro, Stripe, roi de braise mis en avant ; packs : Grimoire en tête du rayon Sorts, Trésor en bandeau', () => {
    expect([CURRENCY, PAYMENT_PROVIDER]).toEqual(['eur', 'Stripe']);
    expect(SHOP_FEATURED).toEqual({ king: 'king:braise' });
    expect(PACKS.map(p => [p.id, p.display, p.shortName])).toEqual([['pack:skins', 'skin', 'le Grimoire'], ['pack:tresor', 'banner', 'le Trésor']]);
    expect(TRESOR).toEqual({ items: 'premium', future: [] });
    expect(SHOP_COLLECTIONS).toEqual(PREMIUM_COLLECTIONS);
    expect(sealsIn(productById('pack:tresor')!.items)).toEqual(tresorSeals());
    expect(tresorSeals().map(c => c.id)).toEqual(['col:celeste', 'col:neant', 'col:ecarlate', 'col:inferno', 'col:jade', 'col:neon', 'col:olympe']);
    expect(ITEMS.filter(i => i.badge).map(i => [i.id, i.badge])).toEqual([['skin:inferno', 'Populaire']]);
    expect(ITEMS.filter(i => i.retired)).toEqual([]);
  });
});
