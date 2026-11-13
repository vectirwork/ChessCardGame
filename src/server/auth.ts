// Comptes : inscription, connexion, sessions, invités, vérification d'e-mail, mot de passe oublié.
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DEFAULT_ITEM, FREE_ITEMS } from '../shared/catalog';
import type { ItemKind } from '../shared/catalog';
import { PASSWORD, USERNAME } from '../shared/config/limits';
import type { MeUser } from '../shared/protocol';
import { config } from './config';
import { one, q } from './db';
import { sendPasswordReset, sendVerification } from './mail';
import { hashPassword, needsRehash, randomToken, sha256, sign, unsign, verifyPassword } from './security';
import { ACCOUNT, LIMITS, RATING } from './settings';

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
  equipped_king: string;
  is_admin: boolean;
  created_at: Date;
  items: string[];
}

/**
 * Colonne d'équipement de chaque emplacement (exhaustive : le compilateur signale l'emplacement oublié). Les noms de
 * colonnes ne viennent que d'ici, jamais de la requête.
 */
export const SLOT_COLUMN = {
  king: 'equipped_king',
  board: 'equipped_board',
  skin: 'equipped_skin',
} as const satisfies Record<ItemKind, string>;

/**
 * Création d'un compte : classement de départ (RATING.initial) et objets portés par défaut (DEFAULT_ITEM) écrits
 * explicitement, au lieu des DEFAULT SQL figés dans les migrations (inchangés : mêmes valeurs aujourd'hui).
 */
const SLOTS_IN_ORDER = Object.keys(SLOT_COLUMN) as ItemKind[];
const INSERT_USER_SQL =
  `INSERT INTO users (email, username, password_hash, rating, ${SLOTS_IN_ORDER.map(k => SLOT_COLUMN[k]).join(', ')}) ` +
  `VALUES ($1, $2, $3, $4, ${SLOTS_IN_ORDER.map((_, i) => `$${i + 5}`).join(', ')}) RETURNING id`;

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
const SESSION_DAYS = ACCOUNT.sessionDays;
const DAY_MS = 86400_000;
const secureCookies = config.publicUrl.startsWith('https://');

/**
 * Durée en intervalle SQL, dans la plus grande unité exacte : « 3 days », « 1 hour », « 90 minutes ». Le nombre vient
 * des réglages (ACCOUNT), jamais d'une requête.
 */
export function pgInterval(ms: number): string {
  const units: [number, string][] = [[DAY_MS, 'day'], [3_600_000, 'hour'], [60_000, 'minute'], [1000, 'second']];
  for (const [size, unit] of units) {
    if (ms % size === 0) {
      const n = ms / size;
      return `${n} ${unit}${n > 1 ? 's' : ''}`;
    }
  }
  return `${ms} milliseconds`;
}

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
  if (row.expires_at.getTime() - Date.now() < (SESSION_DAYS - 1) * DAY_MS) {
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
        httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: ACCOUNT.guestCookieDays * DAY_MS, path: '/',
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
    equippedKing: u.equipped_king,
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
    httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: SESSION_DAYS * DAY_MS, path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function createEmailToken(userId: string, kind: 'verify' | 'reset'): Promise<string> {
  const token = randomToken();
  const ttl = pgInterval(kind === 'verify' ? ACCOUNT.verifyTokenMs : ACCOUNT.resetTokenMs);
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

/** Pseudo d'un compte : bornes, caractères, mots réservés et messages de USERNAME (src/shared/config/limits.ts). */
export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME.min, USERNAME.tooShort)
  .max(USERNAME.max, USERNAME.tooLong)
  .regex(USERNAME.chars, USERNAME.badChars)
  .refine(n => !USERNAME.reservedPattern.test(n), USERNAME.isReserved);
/** Mot de passe : PASSWORD (src/shared/config/limits.ts). */
export const passwordSchema = z.string().min(PASSWORD.min, PASSWORD.tooShort).max(PASSWORD.max);
export const emailSchema = z.string().trim().max(254).email('Adresse e-mail invalide.');

/** Renvoie le premier message d'erreur zod, lisible. */
export function zodError(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Données invalides.';
}

const authLimiter = rateLimit({
  windowMs: LIMITS.authWindowMs,
  limit: config.isProd ? LIMITS.authPerWindow : LIMITS.authPerWindowDev,
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
    user = await one<{ id: string }>(INSERT_USER_SQL, [email, username, hash, RATING.initial, ...SLOTS_IN_ORDER.map(k => DEFAULT_ITEM[k])]);
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
  const parsed = z.object({ login: z.string().trim().min(1).max(254), password: z.string().min(1).max(PASSWORD.max) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Identifiants manquants.' });
  const { login, password } = parsed.data;
  const row = await one<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($1)',
    [login],
  );
  // Vérification factice si l'utilisateur n'existe pas, pour ne pas révéler les comptes par le temps de réponse
  const ok = await verifyPassword(password, row?.password_hash ?? 'scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!row || !ok) return res.status(401).json({ error: 'E-mail, pseudo ou mot de passe incorrect.' });
  // Hachage d'un coût plus faible que le coût courant (SCRYPT.N relevé depuis) : refait avec le coût courant.
  if (needsRehash(row.password_hash)) await q('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), row.id]);
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
