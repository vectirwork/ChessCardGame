// Accès à la base et migrations (appliquées au démarrage, dans l'ordre, une seule fois).
// Deux moteurs, même SQL :
// - DATABASE_URL définie : PostgreSQL (production, Docker) ;
// - sinon : PGlite, un vrai PostgreSQL embarqué dans Node, stocké dans DATA_DIR (lancement local sans rien installer).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from './config';

export interface DbResult<T> {
  rows: T[];
  rowCount: number | null;
}

/** Connexion utilisable dans une transaction. */
export interface DbClient {
  query<T = any>(text: string, params?: unknown[]): Promise<DbResult<T>>;
  /** Plusieurs instructions SQL sans paramètres (migrations). */
  exec(sql: string): Promise<void>;
}

interface Driver extends DbClient {
  transaction<T>(fn: (c: DbClient) => Promise<T>): Promise<T>;
  end(): Promise<void>;
  label: string;
}

function postgresDriver(url: string): Driver {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const wrap = (c: pg.Pool | pg.PoolClient): DbClient => ({
    async query<T>(text: string, params: unknown[] = []) {
      const r = await c.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rowCount };
    },
    async exec(sql: string) {
      await c.query(sql);
    },
  });
  return {
    ...wrap(pool),
    label: 'PostgreSQL',
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(wrap(c));
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    end: () => pool.end(),
  };
}

async function pgliteDriver(dir: string): Promise<Driver> {
  mkdirSync(dir, { recursive: true });
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create(dir);
  type Tx = { query: typeof db.query; exec: typeof db.exec };
  const wrap = (c: Tx): DbClient => ({
    async query<T>(text: string, params: unknown[] = []) {
      const r = await c.query<T>(text, params as any[]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    async exec(sql: string) {
      await c.exec(sql);
    },
  });
  return {
    ...wrap(db),
    label: `PGlite (${dir})`,
    transaction: fn => db.transaction(t => fn(wrap(t))),
    end: () => db.close(),
  };
}

let driver: Driver | null = null;

export async function connectDb(): Promise<string> {
  if (driver) return driver.label;
  driver = config.databaseUrl
    ? postgresDriver(config.databaseUrl)
    : await pgliteDriver(path.resolve(config.dataDir, 'db'));
  return driver.label;
}

function d(): Driver {
  if (!driver) throw new Error('Base non connectée : appelez connectDb() au démarrage.');
  return driver;
}

export const db = {
  query: <T = any>(text: string, params: unknown[] = []) => d().query<T>(text, params),
  end: () => (driver ? driver.end() : Promise.resolve()),
};

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await d().query<T>(text, params)).rows;
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Transaction : n'utilisez que `c` à l'intérieur (avec PGlite, un appel à q() attendrait la fin de la transaction). */
export async function tx<T>(fn: (c: DbClient) => Promise<T>): Promise<T> {
  return d().transaction(fn);
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    email_verified boolean NOT NULL DEFAULT false,
    rating integer NOT NULL DEFAULT 1200,
    games_played integer NOT NULL DEFAULT 0,
    wins integer NOT NULL DEFAULT 0,
    losses integer NOT NULL DEFAULT 0,
    draws integer NOT NULL DEFAULT 0,
    equipped_skin text NOT NULL DEFAULT 'skin:arcane',
    equipped_board text NOT NULL DEFAULT 'board:arcane',
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz
  );
  CREATE UNIQUE INDEX users_email_key ON users (lower(email));
  CREATE UNIQUE INDEX users_username_key ON users (lower(username));
  CREATE INDEX users_rating_idx ON users (rating DESC) WHERE games_played > 0;

  CREATE TABLE sessions (
    id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    user_agent text,
    ip text
  );
  CREATE INDEX sessions_user_idx ON sessions (user_id);

  CREATE TABLE email_tokens (
    id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('verify', 'reset')),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
  );

  CREATE TABLE games (
    id text PRIMARY KEY,
    mode text NOT NULL,
    rated boolean NOT NULL DEFAULT false,
    status text NOT NULL,
    white_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    black_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    white_name text,
    black_name text,
    white_rating integer,
    black_rating integer,
    white_diff integer,
    black_diff integer,
    time_control text NOT NULL,
    winner text,
    reason text,
    plies integer NOT NULL DEFAULT 0,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
  );
  CREATE INDEX games_white_idx ON games (white_user_id, created_at DESC);
  CREATE INDEX games_black_idx ON games (black_user_id, created_at DESC);
  CREATE INDEX games_status_idx ON games (status) WHERE status <> 'ended';

  CREATE TABLE user_items (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id text NOT NULL,
    source text NOT NULL,
    acquired_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    product_id text NOT NULL,
    items text[] NOT NULL,
    provider text NOT NULL,
    provider_ref text UNIQUE,
    payment_ref text,
    amount_cents integer NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz
  );
  CREATE INDEX purchases_user_idx ON purchases (user_id, created_at DESC);
  CREATE INDEX purchases_payment_idx ON purchases (payment_ref);
  `,
  `
  ALTER TABLE games ADD COLUMN ratings_applied boolean NOT NULL DEFAULT false;
  UPDATE games SET ratings_applied = true WHERE status = 'ended';
  `,
];

export async function migrate(): Promise<void> {
  await d().query(`CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await q<{ version: number }>('SELECT version FROM schema_migrations')).map(r => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (done.has(version)) continue;
    await tx(async c => {
      await c.exec(MIGRATIONS[i]);
      await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
    console.log(`Migration ${version} appliquée.`);
  }
}
