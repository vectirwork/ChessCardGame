// Comptes : inscription, connexion, sessions, invités, vérification d'e-mail, mot de passe oublié.
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { FREE_ITEMS } from '../shared/catalog';
import type { MeUser } from '../shared/protocol';
import { config } from './config';
import { one, q } from './db';
import { sendPasswordReset, sendVerification } from './mail';
import { hashPassword, randomToken, sha256, sign, unsign, verifyPassword } from './security';

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  email_verified: boolean;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  equipped_skin: string;
  equipped_board: string;
  is_admin: boolean;
  created_at: Date;
  items: string[];
}

export interface Identity {
  user: UserRow | null;
  guestId: string;
  sessionId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity: Identity;
    }
  }
}

const SESSION_COOKIE = 'sm_session';
const GUEST_COOKIE = 'sm_guest';
const SESSION_DAYS = 30;
const secureCookies = config.publicUrl.startsWith('https://');

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export async function userById(id: string): Promise<UserRow | null> {
  return one<UserRow>(
    `SELECT u.*, coalesce(array(SELECT item_id FROM user_items WHERE user_id = u.id), '{}') AS items FROM users u WHERE u.id = $1`,
    [id],
  );
}

async function userFromSession(token: string | undefined): Promise<{ user: UserRow; sessionId: string } | null> {
  if (!token) return null;
  const sid = sha256(token);
  const row = await one<{ user_id: string; expires_at: Date }>(
    'SELECT user_id, expires_at FROM sessions WHERE id = $1 AND expires_at > now()',
    [sid],
  );
  if (!row) return null;
  const user = await userById(row.user_id);
  if (!user) return null;
  // Prolongation glissante, au plus une fois par jour
  if (row.expires_at.getTime() - Date.now() < (SESSION_DAYS - 1) * 86400_000) {
    await q(`UPDATE sessions SET expires_at = now() + interval '${SESSION_DAYS} days' WHERE id = $1`, [sid]);
    await q('UPDATE users SET last_seen_at = now() WHERE id = $1', [user.id]);
  }
  return { user, sessionId: sid };
}

/** Identité à partir des cookies (utilisée aussi par Socket.IO). */
export async function identityFromCookies(header: string | undefined): Promise<Identity | null> {
  const cookies = parseCookies(header);
  const session = await userFromSession(cookies[SESSION_COOKIE]);
  const guestId = unsign(cookies[GUEST_COOKIE]);
  if (!guestId && !session) return null;
  return { user: session?.user ?? null, sessionId: session?.sessionId ?? null, guestId: guestId ?? `u-${session!.user.id}` };
}

export async function identify(req: Request, res: Response, next: NextFunction) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const session = await userFromSession(cookies[SESSION_COOKIE]);
    let guestId = unsign(cookies[GUEST_COOKIE]);
    if (!guestId) {
      guestId = randomToken(12);
      res.cookie(GUEST_COOKIE, sign(guestId), {
        httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 365 * 86400_000, path: '/',
      });
    }
    req.identity = { user: session?.user ?? null, sessionId: session?.sessionId ?? null, guestId };
    next();
  } catch (e) {
    next(e);
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.identity.user) return res.status(401).json({ error: 'Connexion requise.' });
  next();
}

/** Administrateur : marqué en base, ou e-mail listé dans ADMIN_EMAILS ET vérifié (sinon n'importe qui pourrait le revendiquer). */
export function isAdmin(u: UserRow | null): boolean {
  if (!u) return false;
  return u.is_admin || (u.email_verified && config.adminEmails.includes(u.email.toLowerCase()));
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.identity.user)) return res.status(403).json({ error: 'Accès réservé.' });
  next();
}

export function toMe(u: UserRow): MeUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    emailVerified: u.email_verified,
    rating: u.rating,
    gamesPlayed: u.games_played,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    equippedSkin: u.equipped_skin,
    equippedBoard: u.equipped_board,
    items: [...new Set([...FREE_ITEMS, ...u.items])],
    isAdmin: isAdmin(u),
    createdAt: u.created_at.toISOString(),
  };
}

export async function createSession(req: Request, res: Response, userId: string) {
  const token = randomToken();
  await q(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent, ip) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days', $3, $4)`,
    [sha256(token), userId, (req.headers['user-agent'] ?? '').slice(0, 300), req.ip ?? null],
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: SESSION_DAYS * 86400_000, path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function createEmailToken(userId: string, kind: 'verify' | 'reset'): Promise<string> {
  const token = randomToken();
  const ttl = kind === 'verify' ? '3 days' : '1 hour';
  await q(`DELETE FROM email_tokens WHERE user_id = $1 AND kind = $2`, [userId, kind]);
  await q(`INSERT INTO email_tokens (id, user_id, kind, expires_at) VALUES ($1, $2, $3, now() + interval '${ttl}')`, [sha256(token), userId, kind]);
  return token;
}

async function consumeEmailToken(token: string, kind: 'verify' | 'reset'): Promise<string | null> {
  const row = await one<{ user_id: string }>(
    `UPDATE email_tokens SET used_at = now() WHERE id = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
    [sha256(token), kind],
  );
  return row?.user_id ?? null;
}

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Le pseudo doit faire au moins 3 caractères.')
  .max(20, 'Le pseudo doit faire au plus 20 caractères.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Lettres, chiffres, tirets et soulignés uniquement.')
  .refine(n => !/^(admin|administrateur|moderateur|support|bot|ia|spellmate|anonyme|invite)$/i.test(n), 'Ce pseudo est réservé.');
export const passwordSchema = z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.').max(200);
export const emailSchema = z.string().trim().max(254).email('Adresse e-mail invalide.');

/** Renvoie le premier message d'erreur zod, lisible. */
export function zodError(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Données invalides.';
}

const authLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: config.isProd ? 30 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans quelques minutes.' },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const parsed = z
    .object({
      email: emailSchema,
      username: usernameSchema,
      password: passwordSchema,
      acceptTerms: z.literal(true, { error: 'Vous devez accepter les conditions générales.' }),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  const { email, username, password } = parsed.data;
  if (await one('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse e-mail.' });
  }
  if (await one('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username])) {
    return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
  }
  const hash = await hashPassword(password);
  let user: { id: string } | null;
  try {
    user = await one<{ id: string }>(
      'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, username, hash],
    );
  } catch {
    return res.status(409).json({ error: 'Pseudo ou e-mail déjà utilisé.' });
  }
  await createSession(req, res, user!.id);
  const token = await createEmailToken(user!.id, 'verify');
  void sendVerification(email, username, token);
  const full = await userById(user!.id);
  res.json({ user: toMe(full!) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = z.object({ login: z.string().trim().min(1).max(254), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Identifiants manquants.' });
  const { login, password } = parsed.data;
  const row = await one<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($1)',
    [login],
  );
  // Vérification factice si l'utilisateur n'existe pas, pour ne pas révéler les comptes par le temps de réponse
  const ok = await verifyPassword(password, row?.password_hash ?? 'scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!row || !ok) return res.status(401).json({ error: 'E-mail, pseudo ou mot de passe incorrect.' });
  await createSession(req, res, row.id);
  const user = await userById(row.id);
  res.json({ user: toMe(user!) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.identity.sessionId) await q('DELETE FROM sessions WHERE id = $1', [req.identity.sessionId]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/verify', async (req, res) => {
  const token = String(req.body?.token ?? '');
  const userId = await consumeEmailToken(token, 'verify');
  if (!userId) return res.status(400).json({ error: 'Lien invalide ou expiré.' });
  await q('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
  res.json({ ok: true });
});

authRouter.post('/resend-verification', authLimiter, requireUser, async (req, res) => {
  const u = req.identity.user!;
  if (u.email_verified) return res.json({ ok: true });
  const token = await createEmailToken(u.id, 'verify');
  void sendVerification(u.email, u.username, token);
  res.json({ ok: true });
});

authRouter.post('/forgot', authLimiter, async (req, res) => {
  const parsed = z.object({ email: emailSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  const row = await one<{ id: string; username: string; email: string }>(
    'SELECT id, username, email FROM users WHERE lower(email) = lower($1)',
    [parsed.data.email],
  );
  if (row) {
    const token = await createEmailToken(row.id, 'reset');
    void sendPasswordReset(row.email, row.username, token);
  }
  // Même réponse dans tous les cas : on ne révèle pas quels e-mails ont un compte.
  res.json({ ok: true });
});

authRouter.post('/reset', authLimiter, async (req, res) => {
  const parsed = z.object({ token: z.string().min(10), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  const userId = await consumeEmailToken(parsed.data.token, 'reset');
  if (!userId) return res.status(400).json({ error: 'Lien invalide ou expiré.' });
  await q('UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2', [await hashPassword(parsed.data.password), userId]);
  await q('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await createSession(req, res, userId);
  res.json({ ok: true });
});

/** Refuse les requêtes d'écriture venant d'une autre origine (protection CSRF en plus de SameSite). */
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowed = new Set([new URL(config.publicUrl).origin, `${req.protocol}://${req.headers.host}`]);
  if (!allowed.has(origin)) return res.status(403).json({ error: 'Origine refusée.' });
  next();
}
