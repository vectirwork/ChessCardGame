// Boutique côté serveur (src/server/shop.ts, src/server/account.ts), sur une vraie base (PGlite jetable, migrations du
// serveur) : commande calculée au serveur (produit, collection « à compléter », panier d'essai), lignes Stripe,
// livraison avec équipement dans la même transaction (et objets promis d'un pack créé avant leur ajout), e-mail d'achat
// (objets nouveaux seuls, regroupés au-delà de 4), promesses des packs (une fois par achat), messages de refus en
// français, profil public et classement.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// account.ts importe games.ts (salles, minuteries) pour la suppression du compte : inutile ici.
vi.mock('../src/server/games', () => ({ detachUser: vi.fn(async () => undefined) }));

import { ITEMS, productById, quoteCart } from '../src/shared/catalog';
import { CART_PRODUCT_ID } from '../src/shared/protocol';
import { leaderboard, publicProfile } from '../src/server/account';
import { config } from '../src/server/config';
import { connectDb, db, migrate, one, q } from '../src/server/db';
import { purchaseConfirmationMail, purchaseItemLines } from '../src/server/mail';
import {
  checkoutSchema, equipAtDelivery, fulfillPurchase, honorPackPromises, orderFor, promisedItems, purchaseLabel,
  refundPurchase, slotSelection, stripeLineItems,
} from '../src/server/shop';
import type { Order } from '../src/server/shop';

const dir = mkdtempSync(path.join(tmpdir(), 'spellmate-boutique-'));

beforeAll(async () => {
  config.databaseUrl = '';
  config.dataDir = dir;
  await connectDb();
  await migrate();
}, 60_000);

afterAll(async () => {
  await db.end();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
async function newUser(extra = ''): Promise<string> {
  n++;
  const u = await one<{ id: string }>(
    `INSERT INTO users (email, username, password_hash${extra ? ', games_played, rating' : ''}) VALUES ($1, $2, 'x'${extra}) RETURNING id`,
    [`b${n}@test.fr`, `b${n}`],
  );
  return u!.id;
}
const own = (userId: string, items: string[], source = 'test') =>
  q(`INSERT INTO user_items (user_id, item_id, source) SELECT $1::uuid, it, $3::text FROM unnest($2::text[]) AS it`, [userId, items, source]);
async function pending(userId: string, order: { productId: string; items: string[]; amountCents?: number }, equip = false, status = 'pending') {
  const p = await one<{ id: string }>(
    `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status, equip)
     VALUES ($1, $2, $3, 'demo', $4, 'eur', $5, $6) RETURNING id`,
    [userId, order.productId, order.items, order.amountCents ?? 100, status, equip],
  );
  return p!.id;
}
const equipped = (userId: string) =>
  one<{ equipped_king: string; equipped_board: string; equipped_skin: string }>(
    `SELECT equipped_king, equipped_board, equipped_skin FROM users WHERE id = $1`,
    [userId],
  );
const owned = async (userId: string) =>
  (await q<{ item_id: string }>(`SELECT item_id FROM user_items WHERE user_id = $1`, [userId])).map(r => r.item_id).sort();
const isOrder = (o: ReturnType<typeof orderFor>): o is Order => !('error' in o);
const purchaseItems = async (id: string) => (await one<{ items: string[] }>(`SELECT items FROM purchases WHERE id = $1`, [id]))!.items;
/** Texte de l'e-mail d'achat affiché dans la console (pas de SMTP en test) pendant `fn`. */
async function mailOf(fn: () => Promise<unknown>): Promise<string> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await fn();
    return log.mock.calls.map(c => String(c[0])).find(t => t.includes('Achat confirmé')) ?? '';
  } finally {
    log.mockRestore();
  }
}
afterEach(() => vi.restoreAllMocks());

describe('commande calculée au serveur (orderFor)', () => {
  it('produit : prix fixe ; collection : prix « compléter » ; inconnu ou retiré : 404 ; tout possédé : 409', () => {
    const king = orderFor({ productId: 'king:braise' }, []);
    expect(king).toEqual({ productId: 'king:braise', items: ['king:braise'], amountCents: 299, lines: [expect.objectContaining({ name: 'Roi de braise', cents: 299 })] });
    const forge = orderFor({ productId: 'col:inferno' }, ['skin:inferno']);
    expect(isOrder(forge) && forge.amountCents).toBe(300);
    expect(isOrder(forge) && forge.items).toEqual(['king:braise', 'board:obsidian', 'skin:inferno']);
    expect(isOrder(forge) && forge.lines[0].name).toBe('Collection Forge d’Inferno (pièces manquantes)');
    expect((orderFor({ productId: 'col:inferno' }, []) as Order).lines[0].name).toBe('Collection Forge d’Inferno');
    expect(orderFor({ productId: 'col:inferno' }, ['skin:inferno', 'king:braise'])).toMatchObject({ amountCents: 199 });
    expect(orderFor({ productId: 'pack:skins' }, ['skin:inferno'])).toMatchObject({ amountCents: 1299 });
    expect(orderFor({ productId: 'pack:all' }, [])).toEqual({ status: 404, error: 'Ce produit n’est plus en vente.' });
    expect(orderFor({ productId: 'pack:inconnu' }, [])).toMatchObject({ status: 404 });
    expect(orderFor({ productId: 'king:braise' }, ['king:braise'])).toMatchObject({ status: 409 });
  });

  it('panier : collection complétée au prix « compléter », objets à payer seulement, montant = quoteCart', () => {
    const cart = ['king:synthe', 'board:grille', 'skin:neon'];
    const o = orderFor({ itemIds: cart }, ['skin:neon']);
    expect(o).toMatchObject({ productId: CART_PRODUCT_ID, items: ['king:synthe', 'board:grille'], amountCents: 300 });
    expect(isOrder(o) && o.amountCents).toBe(quoteCart(cart, ['skin:neon'])!.totalCents);
    // Deux collections, des objets offerts : seuls les objets payants non possédés sont facturés et livrés
    const mixed = orderFor({ itemIds: ['king:braise', 'board:wood', 'skin:void'] }, []);
    expect(mixed).toMatchObject({ items: ['king:braise', 'skin:void'], amountCents: 299 + 399 });
    expect(isOrder(mixed) && mixed.lines.map(l => l.name)).toEqual(['Roi de braise', 'Sorts Néant']);
  });

  it('panier refusé : objet inconnu (404), deux objets du même emplacement (400), rien à payer (409)', () => {
    expect(orderFor({ itemIds: ['king:inconnu'] }, [])).toEqual({ status: 404, error: 'Objet inconnu.' });
    expect(orderFor({ itemIds: ['king:braise', 'king:rubis'] }, [])).toEqual({ status: 400, error: 'Un seul objet par emplacement.' });
    expect(orderFor({ itemIds: ['king:arcane', 'board:wood'] }, [])).toMatchObject({ status: 409 });
    expect(orderFor({ itemIds: ['king:braise'] }, ['king:braise'])).toMatchObject({ status: 409 });
  });

  it('lignes Stripe : une par ligne de la commande, en euros, TTC (inclusive), somme = montant facturé', () => {
    for (const o of [orderFor({ productId: 'col:neant' }, ['skin:void']), orderFor({ itemIds: ['king:astral', 'board:ruby', 'skin:laurier'] }, [])]) {
      expect(isOrder(o)).toBe(true);
      const order = o as Order;
      const lines = stripeLineItems(order);
      expect(lines).toHaveLength(order.lines.length);
      for (const l of lines) {
        expect(l.quantity).toBe(1);
        expect(l.price_data).toMatchObject({ currency: 'eur', tax_behavior: 'inclusive' });
        expect(l.price_data!.product_data!.name).toBeTruthy();
        expect(l.price_data!.product_data!.description).not.toBe('');
      }
      expect(lines.reduce((s, l) => s + l.price_data!.unit_amount!, 0)).toBe(order.amountCents);
    }
  });

  it('libellés : nom facturé du produit (comme la ligne Stripe), « Votre sélection (n skins) » pour un panier', () => {
    expect(purchaseLabel('col:jade', ['king:printemps', 'board:jade', 'skin:sakura'])).toBe('Collection Jardin de jade');
    const jade = productById('col:jade')!.priceCents;
    expect(purchaseLabel('col:jade', ['king:printemps', 'board:jade', 'skin:sakura'], jade)).toBe('Collection Jardin de jade');
    expect(purchaseLabel('col:inferno', ['king:braise', 'board:obsidian', 'skin:inferno'], 300)).toBe(
      (orderFor({ productId: 'col:inferno' }, ['skin:inferno']) as Order).lines[0].name,
    );
    expect(purchaseLabel('pack:skins', [], 1299)).toBe('Grimoire des sorts');
    expect(purchaseLabel(CART_PRODUCT_ID, ['king:braise', 'skin:void'])).toBe('Votre sélection (2 skins)');
    expect(purchaseLabel(CART_PRODUCT_ID, ['king:braise'])).toBe('Votre sélection (1 skin)');
  });

  it('e-mail d’achat : libellé, montant, objets livrés (échappés), équipés ou non, qui voit quoi', () => {
    const m = purchaseConfirmationMail({ label: 'Votre sélection (2 skins)', amount: '3,00 €', items: ['Roi Synthé', 'Échiquier Obsidienne & Or'], equipped: true });
    expect(m.html).toContain('<li style="padding:2px 0">Échiquier Obsidienne &#38; Or</li>');
    expect(m.html).toContain('Votre sélection (2 skins)');
    expect(m.html).toContain('Voir ma panoplie');
    expect(m.text).toContain('- Roi Synthé\n- Échiquier Obsidienne & Or');
    expect(m.text).toContain('Votre échiquier : il vous suit dans toutes vos parties.');
    const solo = purchaseConfirmationMail({ label: 'Roi de braise', amount: '2,99 €', items: ['Roi de braise'], equipped: false });
    expect(solo.html).toContain('Équiper mes nouveautés');
    expect(solo.html).not.toContain('<script');
    expect(solo.html).not.toContain('Déjà dans votre collection');
    // Collection complétée : la pièce déjà possédée est présentée à part, pas comme une nouveauté
    const forge = purchaseConfirmationMail({
      label: 'Collection Forge d’Inferno (pièces manquantes)', amount: '3,00 €', items: ['Roi de braise', 'Échiquier Obsidienne & Or'],
      alreadyOwned: ['Sorts Inferno'], equipped: false,
    });
    expect(forge.html).not.toContain('<li style="padding:2px 0">Sorts Inferno</li>');
    expect(forge.html).toContain('Déjà dans votre collection : Sorts Inferno.');
    expect(forge.text).toContain('- Échiquier Obsidienne & Or\nDéjà dans votre collection : Sorts Inferno.');
    // Rien de nouveau (tout acquis entre la commande et le paiement) : pas de liste vide
    const none = purchaseConfirmationMail({ label: 'Grimoire des sorts', amount: '12,99 €', items: [], alreadyOwned: ['7 sorts : …'], equipped: false });
    expect(none.html).not.toContain('<ul');
    expect(none.text).toContain('Tout ce contenu était déjà dans votre collection.');
  });

  it('e-mail d’achat : jusqu’à 4 objets un par ligne ; au-delà, regroupés par collection puis par emplacement', () => {
    expect(purchaseItemLines(['king:braise', 'board:obsidian', 'skin:inferno'])).toEqual(['Roi de braise', 'Échiquier Obsidienne & Or', 'Sorts Inferno']);
    expect(purchaseItemLines(['king:inconnu', 'skin:void'])).toEqual(['Sorts Néant']);
    const tresor = productById('pack:tresor')!.items;
    const lines = purchaseItemLines(tresor);
    expect(lines).toHaveLength(7);
    expect(lines).toContain('Jardin de jade : roi, échiquier et sorts');
    expect(lines).toContain('Forge d’Inferno : roi, échiquier et sorts');
    // Trésor d'un acheteur qui avait déjà les sorts Inferno et le roi Synthé
    const partial = purchaseItemLines(tresor.filter(i => i !== 'skin:inferno' && i !== 'king:synthe'));
    expect(partial).toContain('Forge d’Inferno : roi et échiquier');
    expect(partial).toContain('Néon 2084 : échiquier et sorts');
    expect(partial).toHaveLength(7);
    // Grimoire des sorts : une ligne
    const skins = purchaseItemLines(productById('pack:skins')!.items);
    expect(skins).toHaveLength(1);
    expect(skins[0]).toMatch(/^7 sorts : .+, .+ et .+$/);
    expect(skins[0]).toContain('Inferno');
    // Rois et échiquiers sans collection commune : par emplacement
    expect(purchaseItemLines(['king:braise', 'king:synthe', 'board:jade', 'board:ruby', 'skin:void'])).toEqual([
      '2 rois : Roi de braise et Roi Synthé', '2 échiquiers : Palais de jade et Rubis', 'Sorts Néant',
    ]);
  });

  it('refus du paiement : messages en français, y compris pour une requête forgée', () => {
    const msg = (body: unknown) => {
      const r = checkoutSchema.safeParse(body);
      return r.success ? null : r.error.issues[0]?.message;
    };
    expect(msg({ productId: 'king:braise', waiver: true, equip: 'oui' })).toBe('Requête invalide.');
    expect(msg({ itemIds: ['x'.repeat(61)], waiver: true })).toBe('Objet inconnu.');
    expect(msg({ itemIds: [3], waiver: true })).toBe('Objet inconnu.');
    expect(msg({ itemIds: 'king:braise', waiver: true })).toBe('Sélection invalide.');
    expect(msg({ productId: 'x'.repeat(61), waiver: true })).toBe('Produit inconnu.');
    expect(msg({ productId: 5, waiver: true })).toBe('Produit inconnu.');
    expect(msg(null)).toBe('Requête invalide.');
    expect(msg({ productId: 'king:braise' })).toBe('Vous devez accepter la livraison immédiate du contenu numérique.');
    expect(msg({ waiver: true })).toBe('Indiquez un produit ou une sélection.');
    expect(msg({ productId: 'king:braise', waiver: true, equip: true })).toBeNull();
  });

  it('sélection : un objet par emplacement ; équipement à la livraison : l’objet seul de son emplacement', () => {
    expect(slotSelection(['king:braise', 'board:wood', 'skin:arcane'])).toHaveProperty('items');
    expect(slotSelection(['skin:void', 'skin:arcane'])).toMatchObject({ status: 400 });
    expect(equipAtDelivery(['king:braise', 'board:obsidian', 'skin:inferno']).map(i => i.id)).toEqual(['king:braise', 'board:obsidian', 'skin:inferno']);
    expect(equipAtDelivery(productById('pack:tresor')!.items)).toEqual([]);
    expect(equipAtDelivery(['skin:void', 'skin:neon', 'king:rubis']).map(i => i.id)).toEqual(['king:rubis']);
  });
});

describe('livraison (fulfillPurchase) : équiper dans la même transaction', () => {
  it('equip : l’objet livré est équipé ; sans equip, l’équipement ne bouge pas', async () => {
    const u = await newUser();
    await fulfillPurchase(await pending(u, { productId: 'skin:sakura', items: ['skin:sakura'] }), 'ref-a');
    expect(await equipped(u)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:arcane', equipped_skin: 'skin:arcane' });
    await fulfillPurchase(await pending(u, { productId: 'king:laure', items: ['king:laure'] }, true), 'ref-b');
    expect(await equipped(u)).toEqual({ equipped_king: 'king:laure', equipped_board: 'board:arcane', equipped_skin: 'skin:arcane' });
    expect(await owned(u)).toEqual(['king:laure', 'skin:sakura']);
  });

  it('collection complétée avec equip : les trois emplacements ; pack avec equip : rien (plusieurs sorts)', async () => {
    const u = await newUser();
    await own(u, ['skin:inferno']);
    const forge = orderFor({ productId: 'col:inferno' }, ['skin:inferno']) as Order;
    const forgeId = await pending(u, forge, true);
    await q(`UPDATE purchases SET email = 'forge@test.fr' WHERE id = $1`, [forgeId]);
    const mail = await mailOf(() => fulfillPurchase(forgeId, 'ref-c'));
    expect(await equipped(u)).toEqual({ equipped_king: 'king:braise', equipped_board: 'board:obsidian', equipped_skin: 'skin:inferno' });
    // E-mail : libellé de la ligne Stripe ; seules les pièces nouvelles sont annoncées, la pièce possédée à part
    expect(mail).toContain('Achat confirmé : Collection Forge d’Inferno (pièces manquantes) · 3,00');
    expect(mail).toContain('- Roi de braise\n- Échiquier Obsidienne & Or\nDéjà dans votre collection : Sorts Inferno.');
    expect(mail).not.toContain('- Sorts Inferno');
    await fulfillPurchase(await pending(u, { productId: 'pack:skins', items: productById('pack:skins')!.items }, true), 'ref-d');
    expect((await equipped(u))!.equipped_skin).toBe('skin:inferno');
    expect(await owned(u)).toContain('skin:laurier');
  });

  it('pack créé avant l’ajout d’objets promis, payé après : livré avec les objets promis, notés dans l’achat', async () => {
    const u = await newUser();
    const id = await pending(u, { productId: 'pack:skins', items: ['skin:inferno', 'skin:neon'] });
    expect(await fulfillPurchase(id, 'ref-promesse')).toBe(true);
    const skins = ITEMS.filter(i => !i.free && i.kind === 'skin').map(i => i.id).sort();
    expect(await owned(u)).toEqual(skins);
    expect([...(await purchaseItems(id))].sort()).toEqual(skins);
    expect((await one(`SELECT count(*)::int AS n FROM user_items WHERE user_id = $1 AND source = $2`, [u, `purchase:${id}`]))!.n).toBe(7);
    // Le remboursement retire tout ce que l'achat a livré
    await refundPurchase('ref-promesse');
    expect(await owned(u)).toEqual([]);
  });

  it('panier avec equip : roi et échiquier livrés et équipés, sorts inchangés ; un second appel ne fait rien', async () => {
    const u = await newUser();
    await own(u, ['skin:neon']);
    const order = orderFor({ itemIds: ['king:synthe', 'board:grille', 'skin:neon'] }, ['skin:neon']) as Order;
    const id = await pending(u, order, true);
    expect(await fulfillPurchase(id, 'ref-e')).toBe(true);
    expect(await equipped(u)).toEqual({ equipped_king: 'king:synthe', equipped_board: 'board:grille', equipped_skin: 'skin:arcane' });
    await q(`UPDATE users SET equipped_king = 'king:arcane' WHERE id = $1`, [u]);
    expect(await fulfillPurchase(id, 'ref-e')).toBe(false);
    expect((await equipped(u))!.equipped_king).toBe('king:arcane');
    expect(await owned(u)).toEqual(['board:grille', 'king:synthe', 'skin:neon']);
    expect((await one(`SELECT product_id, amount_cents, equip, status FROM purchases WHERE id = $1`, [id]))).toEqual({
      product_id: CART_PRODUCT_ID, amount_cents: 300, equip: true, status: 'paid',
    });
  });
});

describe('promesses des packs (honorPackPromises)', () => {
  const OLD_SKINS = ['skin:inferno', 'skin:neon', 'skin:celestial', 'skin:void', 'skin:sakura'];
  const OLD_ALL = productById('pack:all')!.items;

  it('objets promis : le Grimoire des sorts, tous les sorts ; le Grimoire complet, sorts et échiquiers, jamais les rois', () => {
    expect(promisedItems('pack:skins').sort()).toEqual(ITEMS.filter(i => !i.free && i.kind === 'skin').map(i => i.id).sort());
    expect(promisedItems('pack:all').sort()).toEqual(ITEMS.filter(i => !i.free && i.kind !== 'king').map(i => i.id).sort());
    expect(promisedItems('pack:tresor')).toEqual([]);
    expect(promisedItems('col:inferno')).toEqual([]);
  });

  it('achats payés livrés, en attente ou remboursés oubliés, second appel sans effet, remboursement après coup', async () => {
    const skins = await newUser();
    const all = await newUser();
    const waiting = await newUser();
    const refunded = await newUser();
    // Achats d'avant les nouveautés, payés et livrés avec l'ancienne liste
    const skinsBuy = await pending(skins, { productId: 'pack:skins', items: OLD_SKINS }, false, 'paid');
    const allBuy = await pending(all, { productId: 'pack:all', items: OLD_ALL }, false, 'paid');
    await own(skins, OLD_SKINS, `purchase:${skinsBuy}`);
    await own(all, OLD_ALL, `purchase:${allBuy}`);
    await pending(waiting, { productId: 'pack:skins', items: OLD_SKINS });
    await pending(refunded, { productId: 'pack:all', items: OLD_ALL }, false, 'refunded');
    // Laurier déjà acheté à part : gardé avec sa source
    await own(skins, ['skin:laurier'], 'purchase:autre');

    const first = await honorPackPromises();
    expect(first).toBe(1 + 5); // Écarlate ; Laurier, Écarlate et les trois nouveaux échiquiers
    expect(await owned(skins)).toEqual([...OLD_SKINS, 'skin:laurier', 'skin:ecarlate'].sort());
    expect((await one(`SELECT source FROM user_items WHERE user_id = $1 AND item_id = 'skin:ecarlate'`, [skins]))!.source).toBe(`purchase:${skinsBuy}`);
    expect((await one(`SELECT source FROM user_items WHERE user_id = $1 AND item_id = 'skin:laurier'`, [skins]))!.source).toBe('purchase:autre');
    expect(await owned(all)).toEqual([...OLD_ALL, 'skin:laurier', 'skin:ecarlate', 'board:grille', 'board:horizon', 'board:ciel'].sort());
    expect((await owned(all)).some(i => i.startsWith('king:'))).toBe(false);
    expect(await owned(waiting)).toEqual([]);
    expect(await owned(refunded)).toEqual([]);

    expect(await honorPackPromises()).toBe(0);
    // Les objets promis sont notés dans l'achat, y compris Laurier, déjà possédé (sa source ne change pas)
    expect([...(await purchaseItems(skinsBuy))].sort()).toEqual([...OLD_SKINS, 'skin:laurier', 'skin:ecarlate'].sort());
    expect(await purchaseItems(allBuy)).toHaveLength(OLD_ALL.length + 5);

    // Un retrait par l'administrateur (objet promis ou d'origine) n'est pas annulé au démarrage suivant
    await q(`DELETE FROM user_items WHERE user_id = $1 AND item_id = ANY($2::text[])`, [skins, ['skin:ecarlate', 'skin:inferno']]);
    expect(await honorPackPromises()).toBe(0);
    expect(await owned(skins)).not.toContain('skin:ecarlate');
    expect(await owned(skins)).not.toContain('skin:inferno');

    // Le remboursement du pack retire aussi ce que la promesse a livré, et le déséquipe
    await q(`UPDATE purchases SET payment_ref = 'ref-all' WHERE id = $1`, [allBuy]);
    await q(`UPDATE users SET equipped_board = 'board:horizon', equipped_skin = 'skin:ecarlate' WHERE id = $1`, [all]);
    await refundPurchase('ref-all');
    expect(await owned(all)).toEqual([]);
    expect(await equipped(all)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:arcane', equipped_skin: 'skin:arcane' });
    expect(await honorPackPromises()).toBe(0);
  });
});

describe('profil public et classement', () => {
  it('profil : roi, échiquier et sorts normalisés, sceau de la collection complète la plus rare ; inconnu : null', async () => {
    const u = await newUser();
    await own(u, ['king:braise', 'board:obsidian', 'skin:inferno', 'king:eclipse', 'board:horizon', 'skin:void']);
    await q(`UPDATE users SET equipped_king = 'king:eclipse', equipped_board = 'board:horizon', equipped_skin = 'skin:inferno' WHERE id = $1`, [u]);
    const name = (await one<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [u]))!.username;
    const p = await publicProfile(name.toUpperCase());
    expect(p).toMatchObject({ king: 'king:eclipse', board: 'board:horizon', skin: 'skin:inferno', seal: 'col:neant', rank: null });
    await q(`UPDATE users SET equipped_king = 'king:inconnu' WHERE id = $1`, [u]);
    expect((await publicProfile(name))!.king).toBe('king:arcane');
    // Sorts et échiquier normalisés de même : inconnu ou d'un autre emplacement → Arcane
    await q(`UPDATE users SET equipped_board = 'board:retire', equipped_skin = 'king:braise' WHERE id = $1`, [u]);
    expect(await publicProfile(name)).toMatchObject({ king: 'king:arcane', board: 'board:arcane', skin: 'skin:arcane', seal: 'col:neant' });
    expect(await publicProfile('personne-ici')).toBeNull();
  });

  it('classement : un sceau par joueur (null sans collection complète, jamais Arcane)', async () => {
    const champion = await newUser(', 5, 2400');
    const second = await newUser(', 3, 2300');
    await own(champion, ['king:astral', 'board:ciel', 'skin:celestial']);
    await own(second, ['king:arcane', 'board:arcane', 'skin:arcane', 'king:rubis']);
    const rows = await leaderboard();
    expect(rows[0]).toMatchObject({ rating: 2400, games_played: 5, seal: 'col:celeste' });
    expect(rows[1]).toMatchObject({ rating: 2300, seal: null });
    expect(Object.keys(rows[0]).sort()).toEqual(['draws', 'games_played', 'losses', 'rating', 'seal', 'username', 'wins']);
  });
});
