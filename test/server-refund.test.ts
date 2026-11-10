// Remboursement (src/server/shop.ts) exécuté sur une vraie base : PGlite, migrations du serveur, livraison par
// fulfillPurchase puis refundPurchase. Chaque colonne d'équipement (roi, échiquier, sorts) qui pointe vers un objet ni
// offert ni encore possédé revient à son défaut ; le reste ne bouge pas.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/server/config';
import { connectDb, db, migrate, one, q } from '../src/server/db';
import { fulfillPurchase, refundPurchase } from '../src/server/shop';

const dir = mkdtempSync(path.join(tmpdir(), 'spellmate-remboursement-'));

beforeAll(async () => {
  // Base jetable : PGlite dans un dossier temporaire, quelle que soit la configuration de la machine.
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
async function newUser(): Promise<string> {
  n++;
  const u = await one<{ id: string }>(`INSERT INTO users (email, username, password_hash) VALUES ($1, $2, 'x') RETURNING id`, [`r${n}@test.fr`, `r${n}`]);
  return u!.id;
}

/** Achat payé de `items` (sans e-mail), livré par fulfillPurchase ; renvoie l'id de l'achat et sa référence de paiement. */
async function buy(userId: string, productId: string, items: string[]): Promise<{ id: string; ref: string }> {
  const p = await one<{ id: string }>(
    `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status) VALUES ($1, $2, $3, 'demo', 100, 'eur', 'pending') RETURNING id`,
    [userId, productId, items],
  );
  const ref = `pi_${p!.id}`;
  expect(await fulfillPurchase(p!.id, ref)).toBe(true);
  return { id: p!.id, ref };
}

const equip = (userId: string, king: string, board: string, skin: string) =>
  q(`UPDATE users SET equipped_king = $2, equipped_board = $3, equipped_skin = $4 WHERE id = $1`, [userId, king, board, skin]);
const equipped = (userId: string) =>
  one<{ equipped_king: string; equipped_board: string; equipped_skin: string }>(
    `SELECT equipped_king, equipped_board, equipped_skin FROM users WHERE id = $1`,
    [userId],
  );
const owned = async (userId: string) => (await q<{ item_id: string }>(`SELECT item_id FROM user_items WHERE user_id = $1`, [userId])).map(r => r.item_id).sort();

describe('remboursement sur une vraie base', () => {
  it('un roi équipé, remboursé : le roi Arcane revient ; échiquier et sorts possédés par ailleurs restent', async () => {
    const u = await newUser();
    const king = await buy(u, 'king:braise', ['king:braise']);
    await buy(u, 'skin:inferno', ['skin:inferno']);
    await equip(u, 'king:braise', 'board:wood', 'skin:inferno');
    await refundPurchase(king.ref);
    expect(await equipped(u)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:wood', equipped_skin: 'skin:inferno' });
    expect(await owned(u)).toEqual(['skin:inferno']);
    expect((await one<{ status: string }>(`SELECT status FROM purchases WHERE id = $1`, [king.id]))!.status).toBe('refunded');
  });

  it('un objet livré par la promesse d’un pack (même source que l’achat) part avec le remboursement du pack', async () => {
    const u = await newUser();
    // Pack ancien (2 objets dans l'achat) : fulfillPurchase livre aussi ses objets promis (Grille comprise), avec la
    // source 'purchase:<id du pack>', comme honorPackPromises
    const pack = await buy(u, 'pack:all', ['skin:void', 'board:ruby']);
    expect((await one<{ source: string }>(`SELECT source FROM user_items WHERE user_id = $1 AND item_id = 'board:grille'`, [u]))!.source).toBe(
      `purchase:${pack.id}`,
    );
    await buy(u, 'king:astral', ['king:astral']);
    await equip(u, 'king:astral', 'board:grille', 'skin:void');
    await refundPurchase(pack.ref);
    expect(await equipped(u)).toEqual({ equipped_king: 'king:astral', equipped_board: 'board:arcane', equipped_skin: 'skin:arcane' });
    expect(await owned(u)).toEqual(['king:astral']);
  });

  it('identifiant inconnu équipé : remis au défaut ; objet offert équipé : gardé ; second remboursement : rien', async () => {
    const u = await newUser();
    const p = await buy(u, 'skin:sakura', ['skin:sakura']);
    await equip(u, 'king:inconnu', 'board:slate', 'skin:sakura');
    await refundPurchase(p.ref);
    expect(await equipped(u)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:slate', equipped_skin: 'skin:arcane' });
    await equip(u, 'king:arcane', 'board:slate', 'skin:neon');
    await refundPurchase(p.ref);
    expect((await equipped(u))!.equipped_skin).toBe('skin:neon');
  });

  it('le remboursement d’un autre joueur ne touche pas à votre équipement', async () => {
    const ana = await newUser();
    const ben = await newUser();
    await buy(ana, 'col:inferno', ['king:braise', 'board:obsidian', 'skin:inferno']);
    await equip(ana, 'king:braise', 'board:obsidian', 'skin:inferno');
    const p = await buy(ben, 'col:inferno', ['king:braise', 'board:obsidian', 'skin:inferno']);
    await equip(ben, 'king:braise', 'board:obsidian', 'skin:inferno');
    await refundPurchase(p.ref);
    expect(await equipped(ana)).toEqual({ equipped_king: 'king:braise', equipped_board: 'board:obsidian', equipped_skin: 'skin:inferno' });
    expect(await owned(ana)).toEqual(['board:obsidian', 'king:braise', 'skin:inferno']);
    expect(await equipped(ben)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:arcane', equipped_skin: 'skin:arcane' });
    expect(await owned(ben)).toEqual([]);
  });
});
