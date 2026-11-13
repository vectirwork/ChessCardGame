// Remboursement et retrait d'objets (src/server/shop.ts, src/server/admin.ts) exécutés sur une vraie base : PGlite,
// migrations du serveur, livraison par fulfillPurchase puis refundPurchase ou revokeItems (et la route de retrait de
// l'administration). Chaque colonne d'équipement (roi, échiquier, sorts) qui pointe vers un objet ni offert ni encore
// possédé revient à son défaut ; le reste ne bouge pas.
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// La route d'administration : sans la garde de connexion (testée ailleurs) ni les salles de games.ts
vi.mock('../src/server/games', () => ({ activeRoomCount: () => 0 }));
vi.mock('../src/server/auth', async orig => {
  const m = await orig<typeof import('../src/server/auth')>();
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...m, requireUser: pass, requireAdmin: pass };
});

import { adminRouter } from '../src/server/admin';
import { config } from '../src/server/config';
import { connectDb, db, migrate, one, q } from '../src/server/db';
import { fulfillPurchase, refundPurchase, revokeItems } from '../src/server/shop';

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

describe('retrait d’objets (administration, remboursement partiel)', () => {
  it('revokeItems : l’objet quitte la collection et, s’il était équipé, son emplacement revient au défaut', async () => {
    const u = await newUser();
    await buy(u, 'col:inferno', ['king:braise', 'board:obsidian', 'skin:inferno']);
    await equip(u, 'king:braise', 'board:obsidian', 'skin:inferno');
    expect(await revokeItems(u, ['king:braise', 'skin:inferno'])).toBe(2);
    expect(await equipped(u)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:obsidian', equipped_skin: 'skin:arcane' });
    expect(await owned(u)).toEqual(['board:obsidian']);
    // Objet non équipé : retiré, l'équipement ne bouge pas ; rien à retirer : 0
    expect(await revokeItems(u, ['board:jade'])).toBe(0);
    expect(await revokeItems(u, [])).toBe(0);
    expect(await equipped(u)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:obsidian', equipped_skin: 'skin:arcane' });
  });

  it('route POST /api/admin/grant { revoke: true } : un roi équipé retiré par l’administrateur est déséquipé', async () => {
    const u = await newUser();
    const other = await newUser();
    await buy(u, 'king:braise', ['king:braise']);
    await buy(other, 'king:braise', ['king:braise']);
    await equip(u, 'king:braise', 'board:wood', 'skin:arcane');
    await equip(other, 'king:braise', 'board:arcane', 'skin:arcane');
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const r = await fetch(`http://127.0.0.1:${port}/api/admin/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u, itemId: 'king:braise', revoke: true }),
      });
      expect(r.status).toBe(200);
      // Tableau de bord (listes lues dans LIMITS) : 30 jours de statistiques (série et chiffre d'affaires récent), les
      // joueurs cherchés. Un achat payé il y a 40 jours compte dans le total, pas dans les 30 derniers jours.
      await q(
        `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status, paid_at)
         VALUES ($1, 'skin:void', '{skin:void}', 'demo', 7777, 'eur', 'paid', now() - interval '40 days')`,
        [other],
      );
      const o = (await (await fetch(`http://127.0.0.1:${port}/api/admin/overview`)).json()) as {
        daily: { day: string }[];
        recent: unknown[];
        counts: { revenue: number; revenue_30d: number };
      };
      expect(o.counts.revenue - o.counts.revenue_30d).toBeGreaterThanOrEqual(7777);
      expect(o.counts.revenue_30d).toBeGreaterThanOrEqual(200);
      expect(o.daily).toHaveLength(30);
      expect(o.daily[29].day).toBe((await one<{ d: string }>(`SELECT to_char(current_date, 'YYYY-MM-DD') AS d`))!.d);
      expect(o.recent.length).toBeLessThanOrEqual(15);
      const found = (await (await fetch(`http://127.0.0.1:${port}/api/admin/users?q=r`)).json()) as { users: { id: string }[] };
      expect(found.users.some(x => x.id === u)).toBe(true);
    } finally {
      server.close();
    }
    expect(await owned(u)).toEqual([]);
    expect(await equipped(u)).toEqual({ equipped_king: 'king:arcane', equipped_board: 'board:wood', equipped_skin: 'skin:arcane' });
    // L'autre acheteur garde son roi
    expect((await equipped(other))!.equipped_king).toBe('king:braise');
  });
});
