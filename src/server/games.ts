// Salles de jeu : état arbitré par le serveur, pendules, invitations, file d'attente classée, IA.
import { Router } from 'express';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { Color, PieceType, opposite } from '../shared/chess';
import { DEFAULT_SKIN } from '../shared/catalog';
import {
  GameState, Result, canStillMate, createGame, dealHands, playCard, playMove, timeWarpOn,
} from '../shared/game';
import type {
  ClientToServer, GameEvent, GameMode, GameStatus, GameView, JoinReply, SeatView, ServerToClient,
} from '../shared/protocol';
import { EMOTES, QUICK_CONTROLS, TIME_CONTROLS, tcFromId } from '../shared/protocol';
import rateLimit from 'express-rate-limit';
import type pg from 'pg';
import { Identity, identityFromCookies, userById } from './auth';
import { BOT_PROFILES, BotLevel } from './bot';
import { botPool } from './bot-pool';
import { one, q, tx } from './db';
import { gameId, randomToken } from './security';
import { toSummary } from './summary';

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, { identity: Identity }>;

interface Seat {
  kind: 'user' | 'guest' | 'bot';
  /** u:<id>, g:<id> ou bot:<niveau> */
  key: string;
  userId: string | null;
  name: string;
  username: string | null;
  rating: number | null;
  gamesPlayed: number;
  skin: string;
  level?: BotLevel;
}

interface Clock {
  initial: number;
  increment: number;
  w: number;
  b: number;
  running: Color | null;
  since: number;
}

interface RoomData {
  id: string;
  mode: GameMode;
  rated: boolean;
  status: GameStatus;
  tc: string;
  mirror: boolean;
  creator: string;
  seats: Record<Color, Seat | null>;
  state: GameState;
  clock: Clock | null;
  drawOffer: Color | null;
  rematch: { w: boolean; b: boolean; next: string | null };
  ratingDiff: Record<Color, number> | null;
  firstMoveDeadline: number | null;
  createdAt: number;
  /** Les deux joueurs ont joué leur premier coup (ne redevient jamais faux, même après un Retour arrière). */
  started?: boolean;
  lastActivity?: number;
}

class Room {
  sockets = new Set<Sock>();
  away: Record<Color, number | null> = { w: null, b: null };
  flagTimer: NodeJS.Timeout | null = null;
  abortTimer: NodeJS.Timeout | null = null;
  saveTimer: NodeJS.Timeout | null = null;
  botBusy = false;
  rematchPending = false;
  endedAt = 0;
  constructor(public d: RoomData) {}
}

const FIRST_MOVE_MS = 45_000;
/** Partie contre l'IA abandonnée par le joueur humain. */
const BOT_IDLE_MS = 30 * 60_000;
/** Partie sans pendule sans aucune action. */
const UNTIMED_IDLE_MS = 3 * 86400_000;
const MAX_OPEN_ROOMS = 8;
const CLAIM_AFTER_MS = 60_000;
/** Temps laissé à l'animation d'une carte de l'IA avant qu'elle ne joue son coup. */
const BOT_CARD_PAUSE_MS = 2300;

const rooms = new Map<string, Room>();
let io: IO;

const keyOf = (id: Identity) => (id.user ? `u:${id.user.id}` : `g:${id.guestId}`);
const now = () => Date.now();

// ---------------------------------------------------------------------------------------------
// Persistance

function scheduleSave(room: Room) {
  if (room.saveTimer) return;
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    void saveRoom(room).catch(e => console.error('Sauvegarde de partie :', e));
  }, 250);
}

async function saveRoom(room: Room, client?: pg.PoolClient) {
  const d = room.d;
  const r = d.state.result;
  // Un compte supprimé pendant la partie ne doit pas bloquer la sauvegarde (clé étrangère)
  const sql = `INSERT INTO games (id, mode, rated, status, white_user_id, black_user_id, white_name, black_name, white_rating, black_rating,
       white_diff, black_diff, time_control, winner, reason, plies, data, updated_at, ended_at)
     VALUES ($1,$2,$3,$4,(SELECT id FROM users WHERE id = $5::uuid),(SELECT id FROM users WHERE id = $6::uuid),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now(), $18)
     ON CONFLICT (id) DO UPDATE SET status = $4, white_user_id = EXCLUDED.white_user_id, black_user_id = EXCLUDED.black_user_id, white_name = $7, black_name = $8,
       white_rating = $9, black_rating = $10, white_diff = $11, black_diff = $12, winner = $14, reason = $15, plies = $16,
       data = $17, updated_at = now(), ended_at = $18`;
  const params = [
      d.id, d.mode, d.rated, d.status, d.seats.w?.userId ?? null, d.seats.b?.userId ?? null,
      d.seats.w?.name ?? null, d.seats.b?.name ?? null, d.seats.w?.rating ?? null, d.seats.b?.rating ?? null,
      d.ratingDiff?.w ?? null, d.ratingDiff?.b ?? null, d.tc, r ? r.winner ?? 'draw' : null, r?.reason ?? null,
      d.state.ply, JSON.stringify(d), d.status === 'ended' ? new Date(room.endedAt || now()) : null,
  ];
  if (client) await client.query(sql, params);
  else await q(sql, params);
}

async function loadRoom(id: string): Promise<Room | null> {
  if (!/^[A-Za-z0-9]{6,16}$/.test(id)) return null;
  const mem = rooms.get(id);
  if (mem) return mem;
  const row = await one<{ data: RoomData }>('SELECT data FROM games WHERE id = $1', [id]);
  if (!row) return null;
  const again = rooms.get(id);
  if (again) return again;
  const room = new Room(row.data);
  rooms.set(id, room);
  if (room.d.status === 'ended') room.endedAt = now();
  else resumeRoom(room);
  return room;
}

/** Reprise après redémarrage : la pendule ne décompte pas le temps où le serveur était arrêté. */
function resumeRoom(room: Room) {
  if (room.d.clock?.running) room.d.clock.since = now();
  if (room.d.started === undefined) room.d.started = room.d.state.ply >= 2;
  room.d.lastActivity ??= now();
  if (room.d.status === 'active') {
    for (const c of ['w', 'b'] as Color[]) if (room.d.seats[c] && room.d.seats[c]!.kind !== 'bot') room.away[c] = now();
  }
  if (room.d.firstMoveDeadline) room.d.firstMoveDeadline = now() + FIRST_MOVE_MS;
  armTimers(room);
  maybeBot(room);
}

export async function restoreRooms() {
  const rows = await q<{ data: RoomData }>(`SELECT data FROM games WHERE status <> 'ended'`);
  for (const { data } of rows) {
    if (rooms.has(data.id)) continue;
    const room = new Room(data);
    rooms.set(data.id, room);
    resumeRoom(room);
  }
  if (rows.length) console.log(`${rows.length} partie(s) reprise(s).`);
}

// ---------------------------------------------------------------------------------------------
// Vues

function seatView(room: Room, c: Color): SeatView | null {
  const s = room.d.seats[c];
  if (!s) return null;
  const online = s.kind === 'bot' || [...room.sockets].some(k => keyOf(k.data.identity) === s.key);
  return { kind: s.kind, name: s.name, username: s.username, rating: s.rating, skin: s.skin, online, level: s.level };
}

function viewFor(room: Room, you: Color | null): GameView {
  const d = room.d;
  const reveal = d.status === 'ended';
  const hide = (c: Color) => d.state.hands[c].map(h => (reveal || h.used || c === you ? h : { card: null, used: false }));
  const state: GameState = { ...d.state, hands: { w: hide('w'), b: hide('b') }, keys: [] };
  const ck = d.clock;
  return {
    id: d.id,
    mode: d.mode,
    rated: d.rated,
    status: d.status,
    seats: { w: seatView(room, 'w'), b: seatView(room, 'b') },
    you,
    state,
    clock: ck && {
      initial: ck.initial,
      increment: ck.increment,
      // Temps restant à l'instant de l'envoi (le temps écoulé depuis le début du tour est déjà déduit)
      w: Math.max(0, remaining(room, 'w')),
      b: Math.max(0, remaining(room, 'b')),
      running: ck.running,
      serverNow: now(),
      rate: { w: rate(room, 'w'), b: rate(room, 'b') },
    },
    drawOffer: d.drawOffer,
    rematch: d.rematch,
    ratingDiff: d.ratingDiff,
    firstMoveDeadline: d.firstMoveDeadline,
    away: room.away,
    claimAfterMs: CLAIM_AFTER_MS,
    createdAt: d.createdAt,
    mirror: d.mirror,
    started: !!d.started,
  };
}

function colorOf(room: Room, identity: Identity): Color | null {
  const k = keyOf(identity);
  if (room.d.seats.w?.key === k) return 'w';
  if (room.d.seats.b?.key === k) return 'b';
  return null;
}

function broadcast(room: Room, event: GameEvent) {
  const views = new Map<string, GameView>();
  for (const s of room.sockets) {
    const c = colorOf(room, s.data.identity);
    const k = c ?? 'spectator';
    if (!views.has(k)) views.set(k, viewFor(room, c));
    s.emit('game:update', { view: views.get(k)!, event });
  }
  scheduleSave(room);
}

// ---------------------------------------------------------------------------------------------
// Pendule

function rate(room: Room, c: Color) {
  return timeWarpOn(room.d.state, c) ? 2 : 1;
}

function remaining(room: Room, c: Color): number {
  const ck = room.d.clock!;
  let t = ck[c];
  if (ck.running === c) t -= (now() - ck.since) * rate(room, c);
  return t;
}

/** Arrête la pendule du joueur `mover` (avec incrément éventuel) ; à appeler AVANT de changer l'état. */
function stopClock(room: Room, mover: Color, increment: boolean) {
  const ck = room.d.clock;
  if (!ck || ck.running !== mover) return;
  ck[mover] = Math.max(0, remaining(room, mover)) + (increment ? ck.increment * 1000 : 0);
  ck.running = null;
}

/** Relance la pendule du camp au trait, une fois que chacun a joué son premier coup. */
function startClock(room: Room) {
  const ck = room.d.clock;
  if (!ck) return;
  const s = room.d.state;
  ck.running = room.d.status === 'active' && !s.result && room.d.started ? s.pos.turn : null;
  ck.since = now();
}

function armTimers(room: Room) {
  if (room.flagTimer) clearTimeout(room.flagTimer);
  if (room.abortTimer) clearTimeout(room.abortTimer);
  room.flagTimer = room.abortTimer = null;
  if (room.d.status !== 'active') return;
  const ck = room.d.clock;
  if (ck?.running) {
    const c = ck.running;
    const ms = Math.max(0, remaining(room, c) / rate(room, c)) + 30;
    room.flagTimer = setTimeout(() => checkFlag(room), Math.min(ms, 2 ** 31 - 1));
  }
  if (room.d.firstMoveDeadline) {
    const ms = Math.max(0, room.d.firstMoveDeadline - now());
    room.abortTimer = setTimeout(() => {
      if (room.d.status === 'active' && !room.d.started) endGame(room, { winner: null, reason: 'aborted' });
    }, ms);
  }
}

function checkFlag(room: Room): boolean {
  const ck = room.d.clock;
  if (!ck?.running || room.d.status !== 'active') return false;
  const c = ck.running;
  if (remaining(room, c) > 0) {
    armTimers(room);
    return false;
  }
  ck[c] = 0;
  ck.running = null;
  const winner = opposite(c);
  endGame(room, { winner: canStillMate(room.d.state, winner) ? winner : null, reason: 'timeout' });
  return true;
}

function updateFirstMoveDeadline(room: Room) {
  const s = room.d.state;
  const turnSeat = room.d.seats[s.pos.turn];
  room.d.firstMoveDeadline = room.d.status === 'active' && !room.d.started && turnSeat?.kind !== 'bot' ? now() + FIRST_MOVE_MS : null;
}

// ---------------------------------------------------------------------------------------------
// Création et fin de partie

async function seatFor(identity: Identity, guestName?: string): Promise<Seat> {
  // L'identité du socket date de sa connexion : on relit le classement à jour
  const u = identity.user ? (await userById(identity.user.id)) ?? identity.user : null;
  if (u) {
    return {
      kind: 'user', key: keyOf(identity), userId: u.id, name: u.username, username: u.username, rating: u.rating,
      gamesPlayed: u.games_played, skin: u.equipped_skin || DEFAULT_SKIN,
    };
  }
  return {
    kind: 'guest', key: keyOf(identity), userId: null, name: guestName || 'Invité', username: null, rating: null,
    gamesPlayed: 0, skin: DEFAULT_SKIN,
  };
}

function botSeat(level: BotLevel): Seat {
  const p = BOT_PROFILES[level];
  const skins = ['skin:arcane', 'skin:inferno', 'skin:void'];
  return {
    kind: 'bot', key: `bot:${level}`, userId: null, name: `IA ${p.name}`, username: null, rating: p.rating, gamesPlayed: 0,
    skin: skins[level - 1], level,
  };
}

function newRoom(opts: { mode: GameMode; rated: boolean; tc: string; mirror: boolean; creator: string; seats: Record<Color, Seat | null> }): Room {
  const tc = tcFromId(opts.tc) ?? null;
  let id = gameId();
  while (rooms.has(id)) id = gameId();
  const room = new Room({
    id,
    mode: opts.mode,
    rated: opts.rated,
    status: opts.seats.w && opts.seats.b ? 'active' : 'waiting',
    tc: opts.tc,
    mirror: opts.mirror,
    creator: opts.creator,
    seats: opts.seats,
    state: createGame(dealHands(!!tc, opts.mirror), !!tc),
    clock: tc ? { initial: tc.initial, increment: tc.increment, w: tc.initial * 1000, b: tc.initial * 1000, running: null, since: now() } : null,
    drawOffer: null,
    rematch: { w: false, b: false, next: null },
    ratingDiff: null,
    firstMoveDeadline: null,
    createdAt: now(),
    started: false,
    lastActivity: now(),
  });
  rooms.set(id, room);
  if (room.d.status === 'active') begin(room);
  scheduleSave(room);
  return room;
}

function begin(room: Room) {
  room.d.status = 'active';
  updateFirstMoveDeadline(room);
  startClock(room);
  armTimers(room);
  maybeBot(room);
}

function elo(a: number, b: number, score: number, games: number): number {
  const k = games < 30 ? 40 : 20;
  return Math.round(k * (score - 1 / (1 + 10 ** ((b - a) / 400))));
}

function endGame(room: Room, result?: Result) {
  const d = room.d;
  if (d.status === 'ended') return;
  if (result) d.state = { ...d.state, result };
  const r = d.state.result!;
  if (d.clock?.running) stopClock(room, d.clock.running, false);
  d.status = 'ended';
  d.drawOffer = null;
  d.firstMoveDeadline = null;
  room.endedAt = now();
  armTimers(room);
  const { w, b } = d.seats;
  if (d.rated && w?.userId && b?.userId && r.reason !== 'aborted') {
    const sw = r.winner === 'w' ? 1 : r.winner === 'b' ? 0 : 0.5;
    d.ratingDiff = {
      w: elo(w.rating ?? 1200, b.rating ?? 1200, sw, w.gamesPlayed),
      b: elo(b.rating ?? 1200, w.rating ?? 1200, 1 - sw, b.gamesPlayed),
    };
  }
  broadcast(room, { type: 'end' });
  void persistResult(room).catch(e => console.error('Fin de partie :', e));
}

async function persistResult(room: Room) {
  const d = room.d;
  const r = d.state.result!;
  if (room.saveTimer) {
    clearTimeout(room.saveTimer);
    room.saveTimer = null;
  }
  await tx(async c => {
    await saveRoom(room, c);
    if (!d.rated || !d.ratingDiff || r.reason === 'aborted') return;
    // Garde-fou : même après un redémarrage, le classement n'est appliqué qu'une fois par partie
    const first = await c.query(`UPDATE games SET ratings_applied = true WHERE id = $1 AND NOT ratings_applied RETURNING id`, [d.id]);
    if (!first.rowCount) return;
    for (const color of ['w', 'b'] as Color[]) {
      const seat = d.seats[color]!;
      if (!seat.userId) continue;
      const outcome = r.winner === null ? 'draws' : r.winner === color ? 'wins' : 'losses';
      await c.query(
        `UPDATE users SET rating = greatest(100, rating + $1), games_played = games_played + 1, ${outcome} = ${outcome} + 1 WHERE id = $2`,
        [d.ratingDiff![color], seat.userId],
      );
    }
  });
}

// ---------------------------------------------------------------------------------------------
// IA

function maybeBot(room: Room) {
  const d = room.d;
  if (d.status !== 'active' || room.botBusy) return;
  const seat = d.seats[d.state.pos.turn];
  if (seat?.kind !== 'bot') return;
  room.botBusy = true;
  const ply = d.state.ply;
  const logLen = d.state.log.length;
  const started = now();
  const stale = () => d.status !== 'active' || d.state.ply !== ply || d.state.log.length !== logLen;
  void botPool
    .decide(d.state, seat.level!)
    .then(async reply => {
      if (reply.error) console.error('IA :', reply.error);
      // Petite pause pour un rythme naturel
      const wait = Math.max(0, 500 + Math.random() * 500 - (now() - started));
      await new Promise(r => setTimeout(r, wait));
      if (stale()) return;
      const color = d.state.pos.turn;
      if (reply.card) {
        if (!applyCard(room, color, reply.card.index, reply.card.targets).ok) reply.move = null;
        else if (reply.move) await new Promise(r => setTimeout(r, BOT_CARD_PAUSE_MS));
      }
      if (reply.move && d.status === 'active' && d.state.pos.turn === color) {
        const r = applyMove(room, color, reply.move.from, reply.move.to, reply.move.promo as PieceType | undefined);
        if (!r.ok) console.error('IA, coup refusé :', r.error);
      }
    })
    .catch(e => console.error('IA :', e))
    .finally(() => {
      room.botBusy = false;
      // Si l'état a changé pendant le calcul (ou si l'IA doit rejouer), on relance.
      if (d.status === 'active' && d.seats[d.state.pos.turn]?.kind === 'bot') setTimeout(() => maybeBot(room), 50);
    });
}

// ---------------------------------------------------------------------------------------------
// Actions

type Ack = { ok: boolean; error?: string };

function applyMove(room: Room, color: Color, from: number, to: number, promo?: PieceType): Ack {
  const d = room.d;
  if (d.status !== 'active') return { ok: false, error: 'La partie n’est pas en cours.' };
  if (d.state.pos.turn !== color) return { ok: false, error: "Ce n'est pas ton tour." };
  if (checkFlag(room)) return { ok: false, error: 'Temps écoulé.' };
  const r = playMove(d.state, from, to, promo);
  if (!r.ok) return r;
  stopClock(room, color, true);
  d.state = r.state;
  d.drawOffer = null;
  d.lastActivity = now();
  if (d.state.ply >= 2) d.started = true;
  updateFirstMoveDeadline(room);
  startClock(room);
  armTimers(room);
  broadcast(room, { type: 'move', color, info: r.info });
  if (d.state.result) endGame(room);
  else maybeBot(room);
  return { ok: true };
}

function applyCard(room: Room, color: Color, index: number, targets: number[]): Ack {
  const d = room.d;
  if (d.status !== 'active') return { ok: false, error: 'La partie n’est pas en cours.' };
  if (checkFlag(room)) return { ok: false, error: 'Temps écoulé.' };
  const skin = d.seats[color]?.skin ?? DEFAULT_SKIN;
  const r = playCard(d.state, color, index, targets, skin);
  if (!r.ok) return r;
  const turnChanges = r.state.pos.turn !== color;
  if (turnChanges) stopClock(room, color, false);
  d.state = r.state;
  d.lastActivity = now();
  if (turnChanges) {
    updateFirstMoveDeadline(room);
    startClock(room);
  }
  armTimers(room);
  broadcast(room, { type: 'card', info: r.info });
  if (d.state.result) endGame(room);
  else if (turnChanges) maybeBot(room);
  return { ok: true };
}

async function createRematch(room: Room): Promise<void> {
  const d = room.d;
  if (room.rematchPending || d.rematch.next) return;
  room.rematchPending = true;
  // Copies des sièges (la partie terminée garde ses classements d'origine), relues en base
  const fresh = async (s: Seat | null): Promise<Seat | null> => {
    if (!s) return null;
    const copy = { ...s };
    if (s.userId) {
      const u = await one<{ rating: number; games_played: number; equipped_skin: string }>(
        'SELECT rating, games_played, equipped_skin FROM users WHERE id = $1', [s.userId]);
      if (u) Object.assign(copy, { rating: u.rating, gamesPlayed: u.games_played, skin: u.equipped_skin });
    }
    return copy;
  };
  let seats: Record<Color, Seat | null>;
  try {
    seats = { w: await fresh(d.seats.b), b: await fresh(d.seats.w) };
  } catch (e) {
    room.rematchPending = false;
    throw e;
  }
  const next = newRoom({ mode: d.mode, rated: d.rated, tc: d.tc, mirror: d.mirror, creator: d.creator, seats });
  d.rematch.next = next.d.id;
  for (const s of room.sockets) s.emit('game:redirect', { from: d.id, to: next.d.id });
  broadcast(room, { type: 'sync' });
}

// ---------------------------------------------------------------------------------------------
// File d'attente classée

interface QueueEntry {
  key: string;
  identity: Identity;
  rating: number;
  since: number;
}
const queues = new Map<string, QueueEntry[]>();

function leaveQueues(key: string) {
  for (const [tc, list] of queues) {
    const rest = list.filter(e => e.key !== key);
    if (rest.length !== list.length) queues.set(tc, rest);
  }
}

function queueSize() {
  let n = 0;
  for (const l of queues.values()) n += l.length;
  return n;
}

async function joinQueue(sock: Sock, tc: string): Promise<Ack> {
  const identity = sock.data.identity;
  if (!identity.user) return { ok: false, error: 'Connecte-toi pour jouer en partie classée.' };
  if (!QUICK_CONTROLS.includes(tc)) return { ok: false, error: 'Cadence inconnue.' };
  const key = keyOf(identity);
  leaveQueues(key);
  const list = queues.get(tc) ?? [];
  // Adversaire le plus proche en classement, avec une tolérance qui s'élargit avec l'attente
  const me = (await userById(identity.user.id))?.rating ?? identity.user.rating;
  const candidates = list
    .filter(e => e.key !== key)
    .filter(e => Math.abs(e.rating - me) <= 250 + ((now() - e.since) / 1000) * 25)
    .sort((a, b) => Math.abs(a.rating - me) - Math.abs(b.rating - me));
  const opp = candidates[0];
  if (!opp) {
    list.push({ key, identity, rating: me, since: now() });
    queues.set(tc, list);
    sock.emit('queue:status', { waiting: true, tc, since: now(), players: queueSize() });
    return { ok: true };
  }
  queues.set(tc, list.filter(e => e !== opp));
  const [a, b] = await Promise.all([seatFor(identity), seatFor(opp.identity)]);
  const white = Math.random() < 0.5;
  const room = newRoom({ mode: 'quick', rated: true, tc, mirror: false, creator: key, seats: white ? { w: a, b } : { w: b, b: a } });
  io.to(`id:${key}`).to(`id:${opp.key}`).emit('queue:matched', { gameId: room.d.id });
  return { ok: true };
}

/** Une entrée de file ne survit pas si elle ne trouve personne en 10 minutes. */
setInterval(() => {
  for (const [tc, list] of queues) queues.set(tc, list.filter(e => now() - e.since < 600_000));
}, 30_000).unref();

// ---------------------------------------------------------------------------------------------
// Socket.IO

const guestNameSchema = z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _.-]+$/u);

function limiter() {
  let tokens = 20;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(20, tokens + ((t - last) / 1000) * 8);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function updatePresence(room: Room) {
  if (room.d.status !== 'active') return;
  let changed = false;
  for (const c of ['w', 'b'] as Color[]) {
    const seat = room.d.seats[c];
    if (!seat || seat.kind === 'bot') continue;
    const online = [...room.sockets].some(s => keyOf(s.data.identity) === seat.key);
    if (online && room.away[c] !== null) { room.away[c] = null; changed = true; }
    if (!online && room.away[c] === null) { room.away[c] = now(); changed = true; }
  }
  if (changed) broadcast(room, { type: 'sync' });
}

export function attachSockets(server: IO) {
  io = server;
  io.use(async (socket, next) => {
    try {
      const identity = await identityFromCookies(socket.handshake.headers.cookie);
      (socket as Sock).data.identity = identity ?? { user: null, sessionId: null, guestId: `anon-${randomToken(8)}` };
      next();
    } catch (e) {
      next(e as Error);
    }
  });

  io.on('connection', raw => {
    const sock = raw as Sock;
    const identity = sock.data.identity;
    const myKey = keyOf(identity);
    void sock.join(`id:${myKey}`);
    const allow = limiter();
    const joined = new Set<Room>();

    const withRoom = async (id: string, ack: (r: Ack) => void, fn: (room: Room, color: Color) => Ack | Promise<Ack>) => {
      if (typeof ack !== 'function') return;
      if (!allow()) return ack({ ok: false, error: 'Trop de requêtes.' });
      try {
        const room = await loadRoom(String(id));
        if (!room) return ack({ ok: false, error: 'Partie introuvable.' });
        const color = colorOf(room, identity);
        if (!color) return ack({ ok: false, error: 'Tu ne joues pas dans cette partie.' });
        ack(await fn(room, color));
      } catch (e) {
        console.error(e);
        ack({ ok: false, error: 'Erreur serveur.' });
      }
    };

    sock.on('game:join', async (p, ack) => {
      if (typeof ack !== 'function') return;
      if (!allow()) return ack({ ok: false, error: 'Trop de requêtes.' });
      try {
        await joinGame(p, ack);
      } catch (e) {
        console.error('Rejoindre une partie :', e);
        ack({ ok: false, error: 'Erreur serveur, réessaie.' });
      }
    });

    const joinGame = async (p: { id: string; name?: string; sit?: boolean }, ack: (r: JoinReply) => void) => {
      const room = await loadRoom(String(p?.id ?? ''));
      if (!room) return ack({ ok: false, error: 'Cette partie n’existe pas ou a expiré.' });
      room.sockets.add(sock);
      joined.add(room);
      void sock.join(`game:${room.d.id}`);
      let color = colorOf(room, identity);
      if (!color && room.d.status === 'waiting' && p.sit !== false) {
        const free: Color | null = !room.d.seats.w ? 'w' : !room.d.seats.b ? 'b' : null;
        if (free) {
          let name: string | undefined;
          if (!identity.user) {
            const parsed = guestNameSchema.safeParse(p.name ?? '');
            if (!parsed.success) return ack({ ok: true, needName: true, view: viewFor(room, null) });
            name = parsed.data;
          }
          room.d.seats[free] = await seatFor(identity, name);
          color = free;
          begin(room);
          broadcast(room, { type: 'start' });
        }
      }
      updatePresence(room);
      ack({ ok: true, view: viewFor(room, color) });
    };

    sock.on('game:leave', p => {
      const room = rooms.get(String(p?.id ?? ''));
      if (!room) return;
      room.sockets.delete(sock);
      joined.delete(room);
      void sock.leave(`game:${room.d.id}`);
      updatePresence(room);
    });

    sock.on('game:move', (p, ack) =>
      withRoom(p?.id, ack, (room, color) => applyMove(room, color, Number(p.from), Number(p.to), p.promo)));

    sock.on('game:card', (p, ack) =>
      withRoom(p?.id, ack, (room, color) => {
        const targets = Array.isArray(p.targets) ? p.targets.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 64) : [];
        return applyCard(room, color, Number(p.index), targets);
      }));

    sock.on('game:resign', (p, ack) =>
      withRoom(p?.id, ack, (room, color) => {
        if (room.d.status === 'waiting') {
          endGame(room, { winner: null, reason: 'aborted' });
          return { ok: true };
        }
        if (room.d.status !== 'active') return { ok: false, error: 'Partie terminée.' };
        endGame(room, { winner: opposite(color), reason: 'resign' });
        return { ok: true };
      }));

    sock.on('game:abort', (p, ack) =>
      withRoom(p?.id, ack, room => {
        if (room.d.status === 'ended') return { ok: false, error: 'Partie terminée.' };
        if (room.d.status === 'active' && room.d.started) return { ok: false, error: 'Trop tard pour annuler, tu peux abandonner.' };
        endGame(room, { winner: null, reason: 'aborted' });
        return { ok: true };
      }));

    sock.on('game:draw', (p, ack) =>
      withRoom(p?.id, ack, (room, color) => {
        const d = room.d;
        if (d.status !== 'active') return { ok: false, error: 'Partie terminée.' };
        const opp = opposite(color);
        if (p.action === 'offer' || p.action === 'accept') {
          if (d.drawOffer === opp) {
            endGame(room, { winner: null, reason: 'agreement' });
            return { ok: true };
          }
          if (p.action === 'accept') return { ok: false, error: 'Aucune proposition de nulle.' };
          if (d.seats[opp]?.kind === 'bot') return { ok: false, error: "L'IA refuse la nulle et veut se battre !" };
          if (d.state.ply < 2) return { ok: false, error: 'Jouez au moins un coup chacun.' };
          d.drawOffer = color;
        } else if (d.drawOffer === opp) {
          d.drawOffer = null;
        }
        broadcast(room, { type: 'sync' });
        return { ok: true };
      }));

    sock.on('game:claim', (p, ack) =>
      withRoom(p?.id, ack, (room, color) => {
        const opp = opposite(color);
        const since = room.away[opp];
        if (room.d.status !== 'active' || since === null || now() - since < CLAIM_AFTER_MS) {
          return { ok: false, error: "Ton adversaire peut encore revenir." };
        }
        endGame(room, { winner: color, reason: 'abandon' });
        return { ok: true };
      }));

    sock.on('game:rematch', (p, ack) =>
      withRoom(p?.id, ack, async (room, color) => {
        const d = room.d;
        if (d.status !== 'ended') return { ok: false, error: 'La partie n’est pas terminée.' };
        if (d.rematch.next) {
          sock.emit('game:redirect', { from: d.id, to: d.rematch.next });
          return { ok: true };
        }
        d.rematch[color] = true;
        const opp = opposite(color);
        if (d.seats[opp]?.kind === 'bot' || d.rematch[opp]) await createRematch(room);
        else broadcast(room, { type: 'sync' });
        return { ok: true };
      }));

    sock.on('game:emote', p => {
      if (!allow() || typeof p?.key !== 'string' || !Object.hasOwn(EMOTES, p.key)) return;
      const room = rooms.get(String(p.id));
      if (!room) return;
      const color = colorOf(room, identity);
      if (!color) return;
      io.to(`game:${room.d.id}`).emit('game:emote', { gameId: room.d.id, color, key: p.key });
    });

    sock.on('queue:join', async (p, ack) => {
      if (typeof ack !== 'function') return;
      if (!allow()) return ack({ ok: false, error: 'Trop de requêtes.' });
      try {
        ack(await joinQueue(sock, String(p?.tc ?? '')));
      } catch (e) {
        console.error('File classée :', e);
        ack({ ok: false, error: 'Erreur serveur, réessaie.' });
      }
    });

    sock.on('queue:leave', () => {
      leaveQueues(myKey);
      sock.emit('queue:status', { waiting: false, tc: null, since: null, players: queueSize() });
    });

    sock.on('disconnect', async () => {
      for (const room of joined) {
        room.sockets.delete(sock);
        updatePresence(room);
      }
      try {
        const others = await io.in(`id:${myKey}`).fetchSockets();
        if (!others.length) leaveQueues(myKey);
      } catch {
        leaveQueues(myKey);
      }
    });
  });

  // Ménage : parties terminées sans spectateur, invitations jamais acceptées
  setInterval(() => {
    for (const [id, room] of rooms) {
      const d = room.d;
      if (d.status === 'ended' && !room.sockets.size && now() - room.endedAt > 10 * 60_000) rooms.delete(id);
      if (d.status === 'waiting' && now() - d.createdAt > 3 * 86400_000) endGame(room, { winner: null, reason: 'aborted' });
      if (d.status !== 'active') continue;
      const humans = (['w', 'b'] as Color[]).filter(c => d.seats[c] && d.seats[c]!.kind !== 'bot');
      const allAway = humans.every(c => room.away[c] !== null);
      const awayFor = Math.min(...humans.map(c => now() - (room.away[c] ?? now())));
      // Contre l'IA, le joueur parti depuis 30 min : partie annulée
      if (d.mode === 'bot' && allAway && awayFor > BOT_IDLE_MS) endGame(room, { winner: null, reason: 'aborted' });
      // Sans pendule, aucune action depuis 3 jours : partie annulée
      else if (!d.clock && now() - (d.lastActivity ?? d.createdAt) > UNTIMED_IDLE_MS) endGame(room, { winner: null, reason: 'aborted' });
    }
  }, 60_000).unref();
}

/** Compte supprimé : ses parties en cours se terminent et ses sièges deviennent anonymes. */
export async function detachUser(userId: string) {
  for (const room of rooms.values()) {
    for (const c of ['w', 'b'] as Color[]) {
      const seat = room.d.seats[c];
      if (seat?.userId !== userId) continue;
      if (room.d.status === 'active') endGame(room, { winner: opposite(c), reason: 'abandon' });
      else if (room.d.status === 'waiting') endGame(room, { winner: null, reason: 'aborted' });
      room.d.seats[c] = { ...seat, kind: 'guest', userId: null, username: null, name: 'Compte supprimé' };
      scheduleSave(room);
    }
  }
}

/** Sauvegarde immédiate de toutes les parties en cours (arrêt du serveur). */
export async function flushRooms() {
  await Promise.all([...rooms.values()].filter(r => r.d.status !== 'ended' || r.saveTimer).map(r => {
    if (r.saveTimer) clearTimeout(r.saveTimer);
    r.saveTimer = null;
    return saveRoom(r).catch(e => console.error('Sauvegarde :', e));
  }));
}

export function activeRoomCount() {
  let active = 0;
  let waiting = 0;
  for (const r of rooms.values()) {
    if (r.d.status === 'active') active++;
    else if (r.d.status === 'waiting') waiting++;
  }
  return { active, waiting, queue: queueSize() };
}

// ---------------------------------------------------------------------------------------------
// API HTTP

export const gamesRouter = Router();

const createLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de parties créées, patiente quelques minutes.' },
});

gamesRouter.post('/', createLimiter, async (req, res) => {
  const parsed = z
    .object({
      mode: z.enum(['invite', 'bot']),
      tc: z.string().refine(id => TIME_CONTROLS.some(t => t.id === id), 'Cadence inconnue.'),
      color: z.enum(['w', 'b', 'random']).default('random'),
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      mirror: z.boolean().default(false),
      name: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' });
  const o = parsed.data;
  const identity = req.identity;
  const open = [...rooms.values()].filter(r => r.d.status !== 'ended' && r.d.creator === keyOf(identity)).length;
  if (open >= MAX_OPEN_ROOMS) {
    return res.status(429).json({ error: 'Tu as déjà trop de parties ouvertes : termine-en ou annule-en une.' });
  }
  let name: string | undefined;
  if (!identity.user) {
    const n = guestNameSchema.safeParse(o.name ?? '');
    if (!n.success) return res.status(400).json({ error: 'Choisis un pseudo de 2 à 20 caractères.' });
    name = n.data;
  }
  const me = await seatFor(identity, name);
  const color: Color = o.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : o.color;
  const other = o.mode === 'bot' ? botSeat(o.level ?? 2) : null;
  const seats = color === 'w' ? { w: me, b: other } : { w: other, b: me };
  const room = newRoom({ mode: o.mode, rated: false, tc: o.tc, mirror: o.mirror, creator: keyOf(identity), seats });
  await saveRoom(room);
  res.json({ id: room.d.id });
});

/** Parties en cours du visiteur (pour les reprendre). */
gamesRouter.get('/mine', (req, res) => {
  const k = keyOf(req.identity);
  const mine = [...rooms.values()]
    .filter(r => r.d.status !== 'ended' && (r.d.seats.w?.key === k || r.d.seats.b?.key === k || (r.d.status === 'waiting' && r.d.creator === k)))
    .map(r => ({
      id: r.d.id,
      status: r.d.status,
      mode: r.d.mode,
      opponent: (r.d.seats.w?.key === k ? r.d.seats.b : r.d.seats.w)?.name ?? null,
      tc: r.d.tc,
      createdAt: r.d.createdAt,
    }));
  res.json({ games: mine });
});

gamesRouter.get('/recent', async (req, res) => {
  const u = req.identity.user;
  if (!u) return res.json({ games: [] });
  const rows = await q(
    `SELECT * FROM games WHERE (white_user_id = $1 OR black_user_id = $1) AND status = 'ended' ORDER BY ended_at DESC NULLS LAST LIMIT 30`,
    [u.id],
  );
  res.json({ games: rows.map(toSummary) });
});
