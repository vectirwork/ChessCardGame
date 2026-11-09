// Catalogue des skins (src/shared/catalog.ts et src/shared/skins/) : identifiants, raretés, grille des prix et ses
// exceptions, collections, produits et packs, « compléter la collection », panier d'essai, sceau, apparence des IA.
import { describe, expect, it } from 'vitest';
import {
  ALL_PRODUCTS, BOT_LOOK, COLLECTIONS, DEFAULT_BOARD, DEFAULT_ITEM, DEFAULT_KING, DEFAULT_SKIN, FREE_ITEMS, ITEMS,
  ORACLE_LOOK, PRICE, PRODUCTS, RARITY, SLOTS, SLOT_LABEL, boardStyle, collectionOf, formatPrice, itemById, kingStyle,
  normKing, productById, productPrice, quoteCart, sealOf, skinStyle, unitPrice,
} from '../src/shared/catalog';
import type { ItemKind } from '../src/shared/catalog';

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

describe('catalogue : objets', () => {
  it('26 objets : 8 rois, 10 échiquiers, 8 sorts ; 5 offerts et 21 payants (7 par emplacement)', () => {
    expect(ITEMS).toHaveLength(26);
    const count = (k: ItemKind, free?: boolean) => ITEMS.filter(i => i.kind === k && (free === undefined || i.free === free)).length;
    expect([count('king'), count('board'), count('skin')]).toEqual([8, 10, 8]);
    expect([...FREE_ITEMS].sort()).toEqual(['board:arcane', 'board:slate', 'board:wood', 'king:arcane', 'skin:arcane']);
    expect([count('king', false), count('board', false), count('skin', false)]).toEqual([7, 7, 7]);
  });

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
    expect(SLOTS).toEqual(['king', 'board', 'skin']);
    expect(SLOT_LABEL).toEqual({ king: 'Roi', board: 'Échiquier', skin: 'Sorts' });
    expect(DEFAULT_ITEM).toEqual({ king: DEFAULT_KING, board: DEFAULT_BOARD, skin: DEFAULT_SKIN });
    for (const k of SLOTS) {
      const it = itemById(DEFAULT_ITEM[k])!;
      expect(it.kind).toBe(k);
      expect(it.free).toBe(true);
    }
  });

  it('raretés : libellés et couleurs du plan', () => {
    expect(RARITY).toEqual({
      offert: { label: 'Offert', color: '#c9c6dc' },
      rare: { label: 'Rare', color: '#5ee7ff' },
      epique: { label: 'Épique', color: '#c79bff' },
      legendaire: { label: 'Légendaire', color: '#f3c969' },
    });
  });

  it('identifiants historiques présents, au même emplacement (garde-fou « jamais renommer »)', () => {
    for (const [id, h] of Object.entries(HISTORIC_ITEMS)) expect(itemById(id)?.kind, id).toBe(h.kind);
    for (const id of Object.keys(HISTORIC_PRODUCTS)) expect(productById(id), id).toBeDefined();
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

describe('catalogue : prix', () => {
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
});

describe('catalogue : collections', () => {
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

describe('catalogue : packs', () => {
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

  it('un pack garde son prix fixe, même si l’on possède une partie de son contenu ; tout possédé → null', () => {
    const p = productById('pack:skins')!;
    expect(productPrice(p, ['skin:inferno', 'skin:void'])).toBe(1299);
    expect(productPrice(p, p.items)).toBeNull();
    expect(productPrice(productById('king:braise')!, ['king:braise'])).toBeNull();
    expect(productPrice(productById('king:braise')!, [])).toBe(299);
  });
});

describe('catalogue : panier d’essai (quoteCart)', () => {
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

describe('catalogue : sceau de collection', () => {
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

describe('catalogue : apparence des IA et de l’Oracle', () => {
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
