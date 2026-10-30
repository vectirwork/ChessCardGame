// Gestion du compte (profil, sécurité, collection, RGPD) et pages publiques (profils, classement).
import { Router } from 'express';
import { z } from 'zod';
import { itemById } from '../shared/catalog';
import {
  clearSessionCookie, createEmailToken, createSession, emailSchema, passwordSchema, requireUser, toMe, userById,
  usernameSchema, zodError,
} from './auth';
import { one, q } from './db';
import { detachUser } from './games';
import { toSummary } from './summary';
import { sendVerification } from './mail';
import { hashPassword, verifyPassword } from './security';

export const accountRouter = Router();
accountRouter.use(requireUser);

accountRouter.patch('/profile', async (req, res) => {
  const parsed = z.object({ username: usernameSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  const u = req.identity.user!;
  const taken = await one('SELECT 1 FROM users WHERE lower(username) = lower($1) AND id <> $2', [parsed.data.username, u.id]);
  if (taken) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
  await q('UPDATE users SET username = $1 WHERE id = $2', [parsed.data.username, u.id]);
  res.json({ user: toMe((await userById(u.id))!) });
});

accountRouter.post('/password', async (req, res) => {
  const parsed = z.object({ current: z.string().min(1), next: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  const u = req.identity.user!;
  if (!(await verifyPassword(parsed.data.current, u.password_hash))) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  }
  await q('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(parsed.data.next), u.id]);
  // Déconnecte les autres appareils
  await q('DELETE FROM sessions WHERE user_id = $1', [u.id]);
  await createSession(req, res, u.id);
  res.json({ ok: true });
});

accountRouter.post('/email', async (req, res) => {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  const u = req.identity.user!;
  if (!(await verifyPassword(parsed.data.password, u.password_hash))) {
    return res.status(400).json({ error: 'Mot de passe incorrect.' });
  }
  const taken = await one('SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2', [parsed.data.email, u.id]);
  if (taken) return res.status(409).json({ error: 'Cette adresse est déjà utilisée.' });
  await q('UPDATE users SET email = $1, email_verified = false, is_admin = false WHERE id = $2', [parsed.data.email, u.id]);
  const token = await createEmailToken(u.id, 'verify');
  void sendVerification(parsed.data.email, u.username, token);
  res.json({ user: toMe((await userById(u.id))!) });
});

accountRouter.post('/equip', async (req, res) => {
  const parsed = z.object({ itemId: z.string().max(60) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Objet invalide.' });
  const item = itemById(parsed.data.itemId);
  const u = req.identity.user!;
  if (!item) return res.status(404).json({ error: 'Objet inconnu.' });
  if (!item.free && !u.items.includes(item.id)) return res.status(403).json({ error: 'Cet objet ne fait pas partie de votre collection.' });
  const column = item.kind === 'skin' ? 'equipped_skin' : 'equipped_board';
  await q(`UPDATE users SET ${column} = $1 WHERE id = $2`, [item.id, u.id]);
  res.json({ user: toMe((await userById(u.id))!) });
});

accountRouter.get('/purchases', async (req, res) => {
  const rows = await q(
    `SELECT id, product_id, items, provider, amount_cents, currency, status, created_at, paid_at
     FROM purchases WHERE user_id = $1 AND status <> 'pending' ORDER BY created_at DESC LIMIT 100`,
    [req.identity.user!.id],
  );
  res.json({ purchases: rows });
});

accountRouter.post('/logout-all', async (req, res) => {
  await q('DELETE FROM sessions WHERE user_id = $1', [req.identity.user!.id]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Export des données personnelles (RGPD, article 20). */
accountRouter.get('/export', async (req, res) => {
  const u = req.identity.user!;
  const games = await q(
    `SELECT id, mode, rated, white_name, black_name, winner, reason, time_control, created_at, ended_at
     FROM games WHERE white_user_id = $1 OR black_user_id = $1 ORDER BY created_at DESC`,
    [u.id],
  );
  const purchases = await q('SELECT * FROM purchases WHERE user_id = $1', [u.id]);
  const sessions = await q('SELECT created_at, expires_at, user_agent, ip FROM sessions WHERE user_id = $1', [u.id]);
  const { password_hash: _ignored, ...profile } = u;
  res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees-spellmate.json"');
  res.json({ exportedAt: new Date().toISOString(), profile, games, purchases, sessions });
});

/** Suppression définitive du compte (RGPD, article 17). Les factures restent conservées, anonymisées. */
accountRouter.delete('/', async (req, res) => {
  const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Mot de passe requis.' });
  const u = req.identity.user!;
  if (!(await verifyPassword(parsed.data.password, u.password_hash))) {
    return res.status(400).json({ error: 'Mot de passe incorrect.' });
  }
  await detachUser(u.id);
  await q(`UPDATE games SET white_name = 'Compte supprimé' WHERE white_user_id = $1`, [u.id]);
  await q(`UPDATE games SET black_name = 'Compte supprimé' WHERE black_user_id = $1`, [u.id]);
  await q('UPDATE purchases SET email = NULL WHERE user_id = $1', [u.id]);
  await q('DELETE FROM users WHERE id = $1', [u.id]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------------------------

export const communityRouter = Router();


communityRouter.get('/users/:username', async (req, res) => {
  const u = await one(
    `SELECT id, username, rating, games_played, wins, losses, draws, equipped_skin, created_at
     FROM users WHERE lower(username) = lower($1)`,
    [req.params.username],
  );
  if (!u) return res.status(404).json({ error: 'Joueur introuvable.' });
  const games = await q(
    `SELECT * FROM games WHERE (white_user_id = $1 OR black_user_id = $1) AND status = 'ended' AND reason <> 'aborted'
     ORDER BY ended_at DESC NULLS LAST LIMIT 20`,
    [u.id],
  );
  const rank = await one<{ rank: string }>(
    'SELECT count(*) + 1 AS rank FROM users WHERE games_played > 0 AND rating > $1',
    [u.rating],
  );
  res.json({
    profile: {
      username: u.username,
      rating: u.rating,
      gamesPlayed: u.games_played,
      wins: u.wins,
      losses: u.losses,
      draws: u.draws,
      skin: u.equipped_skin,
      memberSince: u.created_at.toISOString(),
      rank: u.games_played > 0 ? Number(rank?.rank ?? 0) : null,
    },
    games: games.map(toSummary),
  });
});

communityRouter.get('/leaderboard', async (_req, res) => {
  const rows = await q(
    `SELECT username, rating, games_played, wins, losses, draws FROM users
     WHERE games_played > 0 ORDER BY rating DESC, games_played DESC LIMIT 100`,
  );
  res.json({ players: rows });
});

communityRouter.get('/stats', async (_req, res) => {
  const r = await one<{ players: string; games: string }>(
    `SELECT (SELECT count(*) FROM users) AS players, (SELECT count(*) FROM games WHERE status = 'ended' AND reason <> 'aborted') AS games`,
  );
  res.json({ players: Number(r?.players ?? 0), games: Number(r?.games ?? 0) });
});
