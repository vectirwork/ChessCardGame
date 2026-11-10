// Gestion du compte (profil, sécurité, collection, RGPD) et pages publiques (profils, classement).
import { Router } from 'express';
import { z } from 'zod';
import { COLLECTIONS, DEFAULT_ITEM, SLOTS, collectionItems, itemById, sealOf } from '../shared/catalog';
import type { ItemKind } from '../shared/catalog';
import type { LeaderboardResponse, LeaderboardRow, ProfileResponse, PublicProfile } from '../shared/protocol';
import {
  clearSessionCookie, createEmailToken, createSession, emailSchema, passwordSchema, requireUser, toMe, userById,
  usernameSchema, zodError,
} from './auth';
import { one, q } from './db';
import { detachUser } from './games';
import { toSummary } from './summary';
import { sendVerification } from './mail';
import { hashPassword, verifyPassword } from './security';
import { equipItems, slotSelection } from './shop';

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

/**
 * Équiper (EquipRequest) : un objet (`itemId`, anciens clients) ou un essai entier (`itemIds`, 1 à 3 objets, au plus un
 * par emplacement), en une seule requête. Inconnu : 404 ; deux objets du même emplacement : 400 ; un objet ni offert ni
 * possédé : 403, et rien n'est équipé.
 */
const equipSchema = z.union([
  z.object({ itemId: z.string().max(60) }),
  z.object({ itemIds: z.array(z.string().max(60)).min(1).max(SLOTS.length) }),
]);

accountRouter.post('/equip', async (req, res) => {
  const parsed = equipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Objet invalide.' });
  const sel = slotSelection('itemIds' in parsed.data ? parsed.data.itemIds : [parsed.data.itemId]);
  if ('error' in sel) return res.status(sel.status).json({ error: sel.error });
  const u = req.identity.user!;
  if (sel.items.some(it => !it.free && !u.items.includes(it.id))) {
    return res.status(403).json({ error: 'Cet objet ne fait pas partie de votre collection.' });
  }
  await equipItems(u.id, sel.items);
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

/** Objets qui comptent pour le sceau : ceux des collections premium (Arcane ne compte jamais). */
const SEAL_ITEMS = COLLECTIONS.filter(c => c.rarity !== 'offert').flatMap(collectionItems);

/** Objet équipé tel qu'on le montre : connu et du bon emplacement, sinon le défaut de l'emplacement (Arcane). */
const shownItem = (kind: ItemKind, id: string | null | undefined): string =>
  id && itemById(id)?.kind === kind ? id : DEFAULT_ITEM[kind];

/**
 * Profil public d'un joueur (pseudo sans casse), avec son roi, ses sorts et son échiquier (normalisés comme en partie :
 * un identifiant inconnu ou retiré devient l'objet Arcane de l'emplacement) et son sceau ; null s'il n'existe pas.
 * Exportée pour les tests.
 */
export async function publicProfile(username: string): Promise<(PublicProfile & { id: string }) | null> {
  const u = await one(
    `SELECT id, username, rating, games_played, wins, losses, draws, equipped_skin, equipped_board, equipped_king, created_at,
       coalesce(array(SELECT item_id FROM user_items WHERE user_id = users.id AND item_id = ANY($2::text[])), '{}') AS items
     FROM users WHERE lower(username) = lower($1)`,
    [username, SEAL_ITEMS],
  );
  if (!u) return null;
  const rank = await one<{ rank: string }>(
    'SELECT count(*) + 1 AS rank FROM users WHERE games_played > 0 AND rating > $1',
    [u.rating],
  );
  return {
    id: u.id,
    username: u.username,
    rating: u.rating,
    gamesPlayed: u.games_played,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    skin: shownItem('skin', u.equipped_skin),
    board: shownItem('board', u.equipped_board),
    king: shownItem('king', u.equipped_king),
    seal: sealOf(u.items),
    memberSince: u.created_at.toISOString(),
    rank: u.games_played > 0 ? Number(rank?.rank ?? 0) : null,
  };
}

/** Classement : les 100 meilleurs joueurs classés, avec leur sceau. Exportée pour les tests. */
export async function leaderboard(): Promise<LeaderboardRow[]> {
  const rows = await q<Omit<LeaderboardRow, 'seal'> & { items: string[] }>(
    `SELECT username, rating, games_played, wins, losses, draws,
       coalesce(array(SELECT item_id FROM user_items i WHERE i.user_id = u.id AND i.item_id = ANY($1::text[])), '{}') AS items
     FROM users u WHERE games_played > 0 ORDER BY rating DESC, games_played DESC LIMIT 100`,
    [SEAL_ITEMS],
  );
  return rows.map(({ items, ...r }) => ({ ...r, seal: sealOf(items) }));
}

communityRouter.get('/users/:username', async (req, res) => {
  const found = await publicProfile(String(req.params.username));
  if (!found) return res.status(404).json({ error: 'Joueur introuvable.' });
  const { id, ...profile } = found;
  const games = await q(
    `SELECT * FROM games WHERE (white_user_id = $1 OR black_user_id = $1) AND status = 'ended' AND reason <> 'aborted'
     ORDER BY ended_at DESC NULLS LAST LIMIT 20`,
    [id],
  );
  res.json({ profile, games: games.map(toSummary) } satisfies ProfileResponse);
});

communityRouter.get('/leaderboard', async (_req, res) => {
  res.json({ players: await leaderboard() } satisfies LeaderboardResponse);
});

communityRouter.get('/stats', async (_req, res) => {
  const r = await one<{ players: string; games: string }>(
    `SELECT (SELECT count(*) FROM users) AS players, (SELECT count(*) FROM games WHERE status = 'ended' AND reason <> 'aborted') AS games`,
  );
  res.json({ players: Number(r?.players ?? 0), games: Number(r?.games ?? 0) });
});
