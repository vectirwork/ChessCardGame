// Interrupteurs et version du protocole côté serveur (src/server/games.ts, src/server/settings.ts) :
// - au défaut, tout est ouvert : aucun refus, aucun changement ;
// - FEATURE_*=0 : le serveur refuse ce qui est coupé (code 'feature-off', message en français) : file classée et
//   amicale, POST /games (invitation, IA), invités, /live et spectateurs, accueil (home:*), relais, revanche,
//   maintenance (newGames) ;
// - version : un client qui annonce une autre version (auth.v) reçoit server:outdated et ses actions sont refusées
//   (code 'outdated') ; un client qui n'annonce rien (d'avant la version du protocole) est accepté.
// - FEATURE_* écrites dans le fichier .env (lancement hors Docker) : prises en compte ;
// - réglages du serveur (settings.ts) lus par games.ts : échéance de la revanche (TIMINGS.rematchTtlMs), files par
//   catalogue (MATCHMAKING.splitByCatalog) ; catalogues de POST /games (CATALOG_IDS, DEFAULT_CATALOG).
// Les interrupteurs sont lus dans l'environnement au chargement de settings.ts : chaque cas recharge les modules du
// serveur (vi.resetModules) avec ses variables (vi.stubEnv), et au besoin des réglages changés (vi.doMock). Les
// sockets sont des doublures (FakeIO, FakeSocket).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/db', () => ({
  q: vi.fn(async () => []),
  one: vi.fn(async () => null),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) })),
}));
vi.mock('../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import { FEATURES as DEFAULTS, FEATURE_KEYS, featureEnvName } from '../src/shared/config/features';
import { PROTOCOL_VERSION } from '../src/shared/protocol';
import type { Identity, UserRow } from '../src/server/auth';

type Games = typeof import('../src/server/games');
type Settings = typeof import('../src/server/settings');

/**
 * Modules du serveur rechargés avec ces variables d'environnement, et des réglages de settings.ts changés (`patch` :
 * TIMINGS, MATCHMAKING… remplacés en entier).
 */
async function load(env: Record<string, string> = {}, patch?: (s: Settings) => Partial<Settings>): Promise<{ games: Games; settings: Settings }> {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock('../src/server/settings');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  if (patch) {
    vi.doMock('../src/server/settings', async importOriginal => {
      const s = await importOriginal<Settings>();
      return { ...s, ...patch(s) };
    });
  }
  const settings = await import('../src/server/settings');
  const games = await import('../src/server/games');
  return { games, settings };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function user(id: string): UserRow {
  return {
    id, email: `${id}@test.fr`, username: id, password_hash: '', email_verified: true, rating: 1500, games_played: 3, wins: 1,
    losses: 1, draws: 1, equipped_skin: 'skin:arcane', equipped_board: 'board:arcane', equipped_king: 'king:arcane', is_admin: false,
    created_at: new Date(0), items: [],
  };
}
const account = (id: string): Identity => ({ user: user(id), guestId: `u-${id}`, sessionId: 's' });
const guest = (id: string): Identity => ({ user: null, guestId: id, sessionId: null });

/** Doublure d'un socket du serveur : gestionnaires, intergiciels (socket.use), événements émis, salons. */
class FakeSocket {
  static n = 0;
  id = `S${++FakeSocket.n}`;
  handlers = new Map<string, (...a: unknown[]) => unknown>();
  middlewares: ((packet: unknown[], next: (e?: Error) => void) => void)[] = [];
  emitted: [string, unknown][] = [];
  rooms = new Set<string>();
  handshake: { auth: Record<string, unknown>; headers: Record<string, string> };
  data: { identity: Identity };
  constructor(identity: Identity, auth: Record<string, unknown> = {}) {
    this.data = { identity };
    this.handshake = { auth, headers: {} };
  }
  on(ev: string, f: (...a: unknown[]) => unknown) {
    this.handlers.set(ev, f);
    return this;
  }
  use(f: (packet: unknown[], next: (e?: Error) => void) => void) {
    this.middlewares.push(f);
    return this;
  }
  emit(ev: string, p: unknown) {
    this.emitted.push([ev, p]);
    return true;
  }
  join(r: string) {
    this.rooms.add(r);
  }
  leave(r: string) {
    this.rooms.delete(r);
  }
  /** Message reçu du client : intergiciels d'abord (comme socket.io), puis le gestionnaire. */
  async fire(ev: string, ...args: unknown[]) {
    for (const mw of this.middlewares) {
      let passed = false;
      mw([ev, ...args], () => (passed = true));
      if (!passed) return;
    }
    await this.handlers.get(ev)?.(...args);
  }
  /** Message avec accusé de réception : la réponse du serveur. */
  async ask<T>(ev: string, p?: unknown): Promise<T> {
    let reply: T | undefined;
    await this.fire(ev, ...(p === undefined ? [] : [p]), (r: T) => (reply = r));
    for (let i = 0; i < 20 && reply === undefined; i++) await Promise.resolve();
    return reply as T;
  }
}

/** Doublure du serveur Socket.IO : intergiciel d'identité et connexion, appelés comme par socket.io. */
class FakeIO {
  mw: ((s: unknown, next: (e?: Error) => void) => void | Promise<void>)[] = [];
  connection: ((s: unknown) => void) | null = null;
  /** Événements envoyés à des salons (io.to(…).emit). */
  sent: [string, unknown][] = [];
  use(f: (s: unknown, next: (e?: Error) => void) => void) {
    this.mw.push(f);
  }
  on(ev: string, f: (s: unknown) => void) {
    if (ev === 'connection') this.connection = f;
  }
  to() {
    return this;
  }
  emit(ev: string, p: unknown) {
    this.sent.push([ev, p]);
    return true;
  }
  in() {
    return { fetchSockets: async () => [] };
  }
  /** Connexion d'un client (l'identité est donnée : l'intergiciel des cookies est sauté). */
  connect(s: FakeSocket) {
    this.connection!(s);
    return s;
  }
}

async function sockets(games: Games) {
  const io = new FakeIO();
  games.attachSockets(io as never);
  return io;
}

/** Seat d'un humain (siège de newRoom). */
const seat = (key: string, userId: string | null = null) => ({
  kind: userId ? ('user' as const) : ('guest' as const), key, userId, name: key, username: null, rating: null, gamesPlayed: 0, skin: '',
});

/** Le routeur des parties sur un port libre, avec cette identité ; renvoie le statut et le corps d'une requête. */
async function http(games: Games, identity: Identity, method: 'GET' | 'POST', url: string, body?: unknown) {
  vi.useRealTimers();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { identity: Identity }).identity = identity;
    next();
  });
  app.use('/api/games', games.gamesRouter);
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    server.close();
  }
}

describe('au défaut : tout est ouvert', () => {
  it('FEATURES du serveur = défauts ; aucune création refusée ; version annoncée ou absente acceptée', async () => {
    const { games, settings } = await load();
    expect(settings.FEATURES).toEqual(DEFAULTS);
    expect(settings.FEATURE_ERRORS).toEqual([]);
    for (const o of [
      { mode: 'quick' as const, rated: true }, { mode: 'quick' as const, rated: false }, { mode: 'invite' as const, rated: false },
      { mode: 'bot' as const, rated: false }, { mode: 'quick' as const, rated: false, relay: true },
    ]) {
      expect(games.creationRefusal(o, guest('g1'))).toBeNull();
      expect(games.creationRefusal(o, account('a1'))).toBeNull();
    }
    expect(games.protocolMismatch(undefined)).toBe(false);
    expect(games.protocolMismatch({})).toBe(false);
    expect(games.protocolMismatch({ v: PROTOCOL_VERSION })).toBe(false);
    expect(games.protocolMismatch({ v: PROTOCOL_VERSION + 1 })).toBe(true);
    expect(games.protocolMismatch({ v: String(PROTOCOL_VERSION) })).toBe(true);
  });

  it('interrupteur de chaque sorte de partie', async () => {
    const { games } = await load();
    expect(games.featureOfGame({ mode: 'quick', rated: true })).toBe('ranked');
    expect(games.featureOfGame({ mode: 'quick', rated: false })).toBe('friendlyQueue');
    expect(games.featureOfGame({ mode: 'invite', rated: false })).toBe('invites');
    expect(games.featureOfGame({ mode: 'bot', rated: false })).toBe('botGames');
    expect(games.featureOfGame({ mode: 'quick', rated: false, relay: true })).toBe('homeDuel');
  });

  it('client sans version : ses actions passent (file amicale, invité)', async () => {
    const { games } = await load();
    const io = await sockets(games);
    const s = io.connect(new FakeSocket(guest('g1')));
    expect(s.emitted.find(([e]) => e === 'server:outdated')).toBeUndefined();
    expect(await s.ask('queue:join', { tc: '5+0', rated: false, name: 'Aurore' })).toEqual({ ok: true });
  });
});

describe('lecture des FEATURE_*', () => {
  it('0, false, off, non coupent ; 1, true, on, oui ouvrent ; erreurs signalées, défaut gardé', async () => {
    const { settings } = await load();
    const r = settings.readFeatures({ FEATURE_SHOP: '0', FEATURE_LIVE: 'off', FEATURE_RANKED: 'oui', FEATURE_HOME_DUEL: 'peut-être', FEATURE_SHOPP: '0' });
    expect(r.features.shop).toBe(false);
    expect(r.features.live).toBe(false);
    expect(r.features.ranked).toBe(true);
    expect(r.features.homeDuel).toBe(true);
    expect(r.errors).toEqual([
      expect.stringMatching(/^FEATURE_SHOPP : interrupteur inconnu/),
      'FEATURE_HOME_DUEL=peut-être : valeur inconnue (attendu 0 ou 1).',
    ]);
    // Chaque interrupteur a sa variable.
    expect(FEATURE_KEYS.map(featureEnvName)).toContain('FEATURE_NEW_GAMES');
  });

  it('fichier .env (npm start, npm run dev) : ses FEATURE_* sont prises en compte, comme le reste de la configuration', () => {
    // Processus à part, lancé dans un dossier qui contient un .env : comme le serveur, il importe config.ts (qui importe
    // settings.ts) puis lit FEATURES.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'spellmate-env-'));
    try {
      writeFileSync(path.join(dir, '.env'), 'FEATURE_LIVE=0\nFEATURE_SHOP=off\nPORT=3999\n');
      const root = path.resolve(__dirname, '..');
      const tsx = path.join(root, 'node_modules/tsx/dist/esm/index.mjs');
      const script = [
        `const { config } = await import(${JSON.stringify(path.join(root, 'src/server/config.ts'))});`,
        `const { FEATURES } = await import(${JSON.stringify(path.join(root, 'src/server/settings.ts'))});`,
        'console.log(JSON.stringify({ port: config.port, live: FEATURES.live, shop: FEATURES.shop, ranked: FEATURES.ranked }));',
      ].join('\n');
      const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('FEATURE_') && k !== 'PORT' && k !== 'NODE_ENV'));
      const r = spawnSync(process.execPath, ['--import', tsx, '--input-type=module', '-e', script], { cwd: dir, env, encoding: 'utf8' });
      expect(r.stderr).toBe('');
      expect(JSON.parse(r.stdout.trim().split('\n').at(-1)!)).toEqual({ port: 3999, live: false, shop: false, ranked: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('interrupteurs coupés : refus du serveur', () => {
  it('file classée et file amicale', async () => {
    const { games } = await load({ FEATURE_RANKED: '0' });
    const io = await sockets(games);
    const a = io.connect(new FakeSocket(account('a1')));
    expect(await a.ask('queue:join', { tc: '5+0', rated: true })).toEqual({
      ok: false, error: 'Les parties classées sont fermées pour le moment.', code: 'feature-off',
    });
    expect(games.queueKeys()).toEqual({});
    // L'amicale reste ouverte.
    expect(await a.ask('queue:join', { tc: '5+0', rated: false })).toEqual({ ok: true });
    const { games: g2 } = await load({ FEATURE_FRIENDLY_QUEUE: '0' });
    const io2 = await sockets(g2);
    const b = io2.connect(new FakeSocket(guest('g2')));
    expect(await b.ask('queue:join', { tc: '5+0', rated: false, name: 'Basile' })).toMatchObject({ ok: false, code: 'feature-off' });
    expect(g2.queueKeys()).toEqual({});
  });

  it('POST /games : invitations et parties contre l’IA (503, code feature-off) ; l’autre sorte reste ouverte', async () => {
    const { games } = await load({ FEATURE_INVITES: '0' });
    const off = await http(games, account('a1'), 'POST', '/api/games', { mode: 'invite', tc: '5+0' });
    expect(off).toEqual({ status: 503, body: { error: 'Les invitations sont fermées pour le moment.', code: 'feature-off' } });
    const ok = await http(games, account('a1'), 'POST', '/api/games', { mode: 'bot', tc: '5+0', level: 2 });
    expect(ok.status).toBe(200);
    const { games: g2 } = await load({ FEATURE_BOT_GAMES: '0' });
    expect(await http(g2, account('a1'), 'POST', '/api/games', { mode: 'bot', tc: '5+0' })).toMatchObject({
      status: 503, body: { error: 'Les parties contre l’IA sont fermées pour le moment.', code: 'feature-off' },
    });
    // Requête invalide : toujours 400 (la validation passe avant les interrupteurs).
    expect((await http(g2, account('a1'), 'POST', '/api/games', { mode: 'bot', tc: '7+3' })).status).toBe(400);
  });

  it('jeu sans compte coupé : un invité ne crée pas de partie, n’entre pas en file, ne s’assoit pas', async () => {
    const { games } = await load({ FEATURE_GUEST_PLAY: '0' });
    const refus = { ok: false, error: 'Connectez-vous pour jouer : le jeu sans compte est fermé pour le moment.', code: 'feature-off' };
    expect(await http(games, guest('g1'), 'POST', '/api/games', { mode: 'bot', tc: '5+0', name: 'Aurore' })).toEqual({
      status: 503, body: { error: refus.error, code: refus.code },
    });
    vi.useFakeTimers();
    const io = await sockets(games);
    const g = io.connect(new FakeSocket(guest('g1')));
    expect(await g.ask('queue:join', { tc: '5+0', rated: false, name: 'Aurore' })).toEqual(refus);
    // Invitation d'un compte : l'invité qui l'ouvre ne prend pas le siège libre (et ne reste pas dans la salle).
    const room = games.newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'climats', creator: 'u:a1', seats: { w: seat('u:a1', 'a1'), b: null } });
    expect(await g.ask('game:join', { id: room.d.id, name: 'Aurore' })).toEqual(refus);
    expect(room.d.seats.b).toBeNull();
    expect(room.sockets.size).toBe(0);
    expect(await games.takeSeat(room, guest('g1'), { name: 'Aurore' })).toBe('guestOff');
    // Un compte s'assoit toujours.
    const a = io.connect(new FakeSocket(account('b2')));
    expect(await a.ask('game:join', { id: room.d.id })).toMatchObject({ ok: true });
    expect(room.d.seats.b?.key).toBe('u:b2');
  });

  it('parties en direct coupées : /live (503) et spectateurs refusés ; les joueurs rejoignent leur partie', async () => {
    const { games } = await load({ FEATURE_LIVE: '0' });
    expect(await http(games, guest('g9'), 'GET', '/api/games/live')).toEqual({
      status: 503, body: { error: 'Les parties en direct sont fermées pour le moment.', code: 'feature-off' },
    });
    vi.useFakeTimers();
    const io = await sockets(games);
    const room = games.newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'climats', creator: 'g:p1', seats: { w: seat('g:p1'), b: seat('g:p2') } });
    const spectator = io.connect(new FakeSocket(guest('g9')));
    expect(await spectator.ask('game:join', { id: room.d.id })).toEqual({
      ok: false, error: 'Les parties en direct sont fermées pour le moment.', code: 'feature-off',
    });
    expect(room.sockets.size).toBe(0);
    const player = io.connect(new FakeSocket(guest('p1')));
    expect(await player.ask('game:join', { id: room.d.id })).toMatchObject({ ok: true, view: { you: 'w' } });
  });

  it('accueil coupé : les visiteurs ne sont pas appariés (home:* ignorés)', async () => {
    const { games } = await load({ FEATURE_HOME_DUEL: '0' });
    const io = await sockets(games);
    const a = io.connect(new FakeSocket(guest('h1')));
    const b = io.connect(new FakeSocket(guest('h2')));
    await a.fire('home:hello', { tz: 'Europe/Paris', ready: true });
    await b.fire('home:hello', { tz: 'Europe/Paris', ready: true });
    await b.fire('home:search', { search: true, tz: 'Europe/Paris' });
    await vi.advanceTimersByTimeAsync(0);
    expect([...a.emitted, ...b.emitted].filter(([e]) => e === 'home:paired')).toEqual([]);
    expect(games.activeRoomCount()).toMatchObject({ active: 0, waiting: 0 });
    // Ouvert (défaut) : appariés.
    const { games: g2 } = await load();
    const io2 = await sockets(g2);
    const c = io2.connect(new FakeSocket(guest('h3')));
    const d = io2.connect(new FakeSocket(guest('h4')));
    await c.fire('home:hello', { tz: 'Europe/Paris', ready: true });
    await d.fire('home:hello', { tz: 'Europe/Paris', ready: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.emitted.filter(([e]) => e === 'home:paired')).toHaveLength(1);
  });

  it('relais coupé : l’IA ne joue plus pour un visiteur de l’accueil qui ne joue pas ; délais ordinaires', async () => {
    const { games, settings } = await load({ FEATURE_HOME_RELAY: '0' });
    const room = games.newRoom({ mode: 'quick', rated: false, tc: 'none', catalog: 'climats', creator: 'g:p1', seats: { w: seat('g:p1'), b: seat('g:p2') }, deal: true, relay: true });
    games.armRelay(room);
    expect(room.relayTimer).toBeNull();
    await vi.advanceTimersByTimeAsync(settings.RELAY.firstMoveMs + 1);
    expect(room.d.standIn).toEqual({ w: false, b: false });
    // Délai du premier coup ordinaire : personne n'a joué, la partie est annulée (elle ne reste pas ouverte des jours).
    expect(room.d.firstMoveDeadline).toBe(Date.now() - settings.RELAY.firstMoveMs - 1 + settings.TIMINGS.firstMoveMs);
    await vi.advanceTimersByTimeAsync(settings.TIMINGS.firstMoveMs);
    expect(room.d.status).toBe('ended');
    expect(room.d.state.result).toEqual({ winner: null, reason: 'aborted', cause: 'first-move' });
    // Ouvert (défaut) : le relais est armé, pas de délai du premier coup (l'IA joue pour celui qui ne joue pas).
    const { games: g2 } = await load();
    const open = g2.newRoom({ mode: 'quick', rated: false, tc: 'none', catalog: 'climats', creator: 'g:p1', seats: { w: seat('g:p1'), b: seat('g:p2') }, deal: true, relay: true });
    g2.armRelay(open);
    expect(open.relayTimer).not.toBeNull();
    expect(open.d.firstMoveDeadline).toBeNull();
  });

  it('cause d’une annulation (Result.cause) : premier coup pas joué à temps, annulation voulue, partie délaissée', async () => {
    const { games, settings } = await load({ FEATURE_HOME_RELAY: '0' });
    const room = () =>
      games.newRoom({ mode: 'quick', rated: false, tc: 'none', catalog: 'climats', creator: 'g:p1', seats: { w: seat('g:p1'), b: seat('g:p2') }, deal: true, relay: true });
    // Les Blancs jouent, les Noirs ne répondent pas dans le délai (relais coupé) : 'first-move', au demi-coup 1.
    const late = room();
    expect(games.applyMove(late, 'w', 12, 28)).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(settings.TIMINGS.firstMoveMs + 1);
    expect([late.d.state.ply, late.d.state.result]).toEqual([1, { winner: null, reason: 'aborted', cause: 'first-move' }]);
    // Un joueur annule avant son premier coup : 'player'.
    const quit = room();
    expect(games.applyMove(quit, 'w', 12, 28)).toEqual({ ok: true });
    expect(games.abortRoom(quit)).toEqual({ ok: true });
    expect(quit.d.state.result).toEqual({ winner: null, reason: 'aborted', cause: 'player' });
    // Toute autre fin : pas de cause.
    const resigned = room();
    expect(games.applyMove(resigned, 'w', 12, 28)).toEqual({ ok: true });
    expect(games.applyMove(resigned, 'b', 52, 36)).toEqual({ ok: true });
    expect(games.resignRoom(resigned, 'b')).toEqual({ ok: true });
    expect(resigned.d.state.result).toEqual({ winner: 'w', reason: 'resign' });
  });

  it('maintenance (newGames coupé) : file, POST /games, accueil et revanche refusés ; les parties en cours continuent', async () => {
    const { games } = await load({ FEATURE_NEW_GAMES: '0' });
    const maintenance = 'Le site est en maintenance : aucune nouvelle partie pour le moment. Les parties en cours continuent.';
    expect(await http(games, account('a1'), 'POST', '/api/games', { mode: 'invite', tc: '5+0' })).toEqual({
      status: 503, body: { error: maintenance, code: 'feature-off' },
    });
    vi.useFakeTimers();
    const io = await sockets(games);
    const a = io.connect(new FakeSocket(account('a1')));
    expect(await a.ask('queue:join', { tc: '5+0', rated: true })).toEqual({ ok: false, error: maintenance, code: 'feature-off' });
    // Partie en cours (créée avant la maintenance) : on y joue, mais pas de revanche.
    const room = games.newRoom({ mode: 'invite', rated: false, tc: 'none', catalog: 'aucune', creator: 'u:a1', seats: { w: seat('u:a1', 'a1'), b: seat('g:p2') } });
    expect(await a.ask('game:join', { id: room.d.id })).toMatchObject({ ok: true });
    expect(await a.ask('game:move', { id: room.d.id, from: 12, to: 28 })).toEqual({ ok: true });
    expect(await a.ask('game:resign', { id: room.d.id })).toEqual({ ok: true });
    expect(await a.ask('game:rematch', { id: room.d.id })).toEqual({ ok: false, error: maintenance, code: 'feature-off' });
    expect(room.d.rematch).toEqual({ w: false, b: false, next: null });
  });
});

describe('réglages du serveur lus par games.ts', () => {
  /** Partie Sans cartes entre un compte et un invité, connectés, terminée par abandon. */
  async function endedGame(games: Games) {
    const io = await sockets(games);
    const a = io.connect(new FakeSocket(account('a1')));
    const room = games.newRoom({ mode: 'invite', rated: false, tc: 'none', catalog: 'aucune', creator: 'u:a1', seats: { w: seat('u:a1', 'a1'), b: seat('g:p2') } });
    expect(await a.ask('game:join', { id: room.d.id })).toMatchObject({ ok: true });
    expect(await a.ask('game:resign', { id: room.d.id })).toEqual({ ok: true });
    return { a, room };
  }

  it('revanche : aucune échéance au défaut (TIMINGS.rematchTtlMs null)', async () => {
    const { games, settings } = await load();
    expect(settings.TIMINGS.rematchTtlMs).toBeNull();
    const { a, room } = await endedGame(games);
    await vi.advanceTimersByTimeAsync(2 * 24 * 3600_000);
    expect(await a.ask('game:rematch', { id: room.d.id })).toEqual({ ok: true });
    expect(room.d.rematch.w).toBe(true);
  });

  it('revanche : refusée au-delà de TIMINGS.rematchTtlMs', async () => {
    const { games } = await load({}, s => ({ TIMINGS: Object.freeze({ ...s.TIMINGS, rematchTtlMs: 60_000 }) }));
    const { a, room } = await endedGame(games);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await a.ask('game:rematch', { id: room.d.id })).toEqual({ ok: false, error: 'La revanche n’est plus possible.' });
    expect(room.d.rematch).toEqual({ w: false, b: false, next: null });
    // Dans le délai : acceptée.
    const second = await endedGame(games);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(await second.a.ask('game:rematch', { id: second.room.d.id })).toEqual({ ok: true });
  });

  it('files par catalogue (défaut) : Sans cartes et Pouvoirs ne sont pas appariés', async () => {
    const { games } = await load();
    const io = await sockets(games);
    const a = io.connect(new FakeSocket(guest('q1')));
    const b = io.connect(new FakeSocket(guest('q2')));
    expect(await a.ask('queue:join', { tc: '5+0', rated: false, name: 'Aurore', catalog: 'aucune' })).toEqual({ ok: true });
    expect(await b.ask('queue:join', { tc: '5+0', rated: false, name: 'Basile', catalog: 'climats' })).toEqual({ ok: true });
    expect(games.queueKeys()).toEqual({ '5+0|amicale|aucune': ['g:q1'], '5+0|amicale|climats': ['g:q2'] });
    expect(io.sent.filter(([e]) => e === 'queue:matched')).toEqual([]);
  });

  it('une seule file (MATCHMAKING.splitByCatalog faux) : appariés, avec le catalogue de celui qui attendait', async () => {
    const { games } = await load({}, s => ({ MATCHMAKING: Object.freeze({ ...s.MATCHMAKING, splitByCatalog: false }) }));
    const io = await sockets(games);
    const a = io.connect(new FakeSocket(guest('q1')));
    const b = io.connect(new FakeSocket(guest('q2')));
    expect(await a.ask('queue:join', { tc: '5+0', rated: false, name: 'Aurore', catalog: 'aucune' })).toEqual({ ok: true });
    expect(games.queueKeys()).toEqual({ '5+0|amicale|*': ['g:q1'] });
    expect(await b.ask('queue:join', { tc: '5+0', rated: false, name: 'Basile', catalog: 'climats' })).toEqual({ ok: true });
    expect(games.queueKeys()).toEqual({});
    const matched = io.sent.find(([e]) => e === 'queue:matched')?.[1] as { gameId: string };
    const j = await b.ask<{ ok: boolean; view: { state: { catalog: string } } }>('game:join', { id: matched.gameId });
    expect(j.view.state.catalog).toBe('aucune');
  });

  it('POST /games : catalogues de CATALOG_IDS (Pouvoirs par défaut, Duel ramené aux Pouvoirs, inconnu refusé)', async () => {
    const { games } = await load();
    expect(await http(games, account('c1'), 'POST', '/api/games', { mode: 'invite', tc: '5+0', catalog: 'inconnu' })).toEqual({
      status: 400, body: { error: 'Catalogue de cartes inconnu.' },
    });
    for (const [catalog, expected] of [[undefined, 'climats'], ['duel', 'climats'], ['aucune', 'aucune']] as const) {
      const created = await http(games, account('c1'), 'POST', '/api/games', { mode: 'invite', tc: '5+0', catalog });
      expect(created.status).toBe(200);
      const mine = await http(games, account('c1'), 'GET', '/api/games/mine');
      const game = (mine.body.games as { id: string; catalog: string }[]).find(g => g.id === created.body.id);
      expect(game?.catalog).toBe(expected);
    }
  });
});

describe('version du protocole', () => {
  it('client d’une autre version : server:outdated, puis chaque action refusée (code outdated)', async () => {
    const { games } = await load();
    const io = await sockets(games);
    const old = io.connect(new FakeSocket(account('a1'), { v: PROTOCOL_VERSION + 1 }));
    expect(old.emitted).toEqual([['server:outdated', { version: PROTOCOL_VERSION }]]);
    const outdated = { ok: false, error: 'Le site a été mis à jour : rechargez la page.', code: 'outdated' };
    expect(await old.ask('queue:join', { tc: '5+0', rated: true })).toEqual(outdated);
    expect(await old.ask('game:join', { id: 'X' })).toEqual(outdated);
    expect(games.queueKeys()).toEqual({});
    // Messages sans accusé de réception : ignorés.
    await old.fire('home:hello', { tz: 'Europe/Paris', ready: true });
    expect(old.emitted).toHaveLength(1);
  });

  it('client de la même version : rien de particulier', async () => {
    const { games } = await load();
    const io = await sockets(games);
    const s = io.connect(new FakeSocket(account('a1'), { v: PROTOCOL_VERSION }));
    expect(s.emitted).toEqual([]);
    expect(await s.ask('queue:join', { tc: '5+0', rated: true })).toEqual({ ok: true });
  });
});
