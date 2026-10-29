// Tableau de bord d'administration : chiffres clés, recherche de joueurs, attribution d'objets.
import { Router } from 'express';
import { z } from 'zod';
import { itemById } from '../shared/catalog';
import { requireAdmin, requireUser } from './auth';
import { one, q } from './db';
import { activeRoomCount } from './games';

export const adminRouter = Router();
adminRouter.use(requireUser, requireAdmin);

adminRouter.get('/overview', async (_req, res) => {
  const counts = await one(`
    SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int AS users_7d,
      (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '1 day')::int AS active_24h,
      (SELECT count(*) FROM games WHERE status = 'ended' AND reason <> 'aborted')::int AS games,
      (SELECT count(*) FROM games WHERE created_at > now() - interval '1 day')::int AS games_24h,
      (SELECT coalesce(sum(amount_cents), 0) FROM purchases WHERE status = 'paid')::int AS revenue,
      (SELECT coalesce(sum(amount_cents), 0) FROM purchases WHERE status = 'paid' AND paid_at > now() - interval '30 days')::int AS revenue_30d,
      (SELECT count(*) FROM purchases WHERE status = 'paid')::int AS sales,
      (SELECT count(DISTINCT user_id) FROM purchases WHERE status = 'paid')::int AS buyers
  `);
  const daily = await q(`
    SELECT to_char(d, 'YYYY-MM-DD') AS day,
      (SELECT coalesce(sum(amount_cents), 0) FROM purchases WHERE status = 'paid' AND paid_at::date = d)::int AS revenue,
      (SELECT count(*) FROM users WHERE created_at::date = d)::int AS signups,
      (SELECT count(*) FROM games WHERE created_at::date = d)::int AS games
    FROM generate_series(current_date - 29, current_date, interval '1 day') AS d ORDER BY d`);
  const products = await q(`
    SELECT product_id, count(*)::int AS sales, sum(amount_cents)::int AS revenue FROM purchases
    WHERE status = 'paid' GROUP BY product_id ORDER BY revenue DESC`);
  const recent = await q(`
    SELECT p.id, p.product_id, p.amount_cents, p.status, p.provider, p.created_at, u.username
    FROM purchases p LEFT JOIN users u ON u.id = p.user_id WHERE p.status <> 'pending'
    ORDER BY p.created_at DESC LIMIT 15`);
  res.json({ counts, live: activeRoomCount(), daily, products, recent });
});

adminRouter.get('/users', async (req, res) => {
  const term = String(req.query.q ?? '').trim();
  const rows = await q(
    `SELECT u.id, u.username, u.email, u.email_verified, u.rating, u.games_played, u.created_at, u.last_seen_at, u.is_admin,
       coalesce(array(SELECT item_id FROM user_items WHERE user_id = u.id), '{}') AS items
     FROM users u WHERE $1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%'
     ORDER BY u.created_at DESC LIMIT 50`,
    [term],
  );
  res.json({ users: rows });
});

adminRouter.post('/grant', async (req, res) => {
  const parsed = z.object({ userId: z.string().uuid(), itemId: z.string(), revoke: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success || !itemById(parsed.data.itemId)) return res.status(400).json({ error: 'Requête invalide.' });
  const { userId, itemId, revoke } = parsed.data;
  if (revoke) await q('DELETE FROM user_items WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
  else await q(`INSERT INTO user_items (user_id, item_id, source) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`, [userId, itemId]);
  res.json({ ok: true });
});
