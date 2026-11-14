// Salles de jeu : état arbitré par le serveur, pendules, invitations, file d'attente classée, IA.
import { Router } from 'express';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { Color, PieceType, opposite } from '../shared/chess';
import { BOT_LOOK, DEFAULT_KING, DEFAULT_SKIN, normKing, sealOf } from '../shared/catalog';
import {
  AbortCause, CardInfo, GameState, MoveInfo, Result, canStillMate, cardPool, catalogOf, clockRate, completeDraft, createGame,
  dealHands, draftRefusal, incrementSuspended, legalMovesOf, playCard, playMove, viewState, withHands,
} from '../shared/game';
import type {
  AckCode, ClientToServer, DraftView, GameEvent, GameMode, GameStatus, GameView, JoinReply, SeatView, ServerToClient,
  TimeControl,
} from '../shared/protocol';
import { EMOTES, OFFERED_CONTROLS, PROTOCOL_VERSION, QUICK_CONTROLS, tcFromId } from '../shared/protocol';
import { CARDS, CATALOG_IDS, CATALOG_RULES, CardId, Catalog, DEFAULT_CATALOG, isCardId, offeredCatalog } from '../shared/cards';
import type { FeatureKey } from '../shared/config/features';
import { HOME } from '../shared/config/home';
import { GUEST_NAME } from '../shared/config/limits';
import { BOUNDS } from '../shared/config/rules';
import type { HandLimits, RulesContext } from '../shared/config/rules';
import { RULES_V1, cardEndsTurn, parseRules, rulesFor, rulesOf } from '../shared/rules';
import type { Rules } from '../shared/rules';
import { cardsOfReply } from '../shared/botProtocol';
import type { BotCard, BotReply } from '../shared/botProtocol';
import rateLimit from 'express-rate-limit';
import { EQUIPPED_SELECT, Identity, identityFromCookies, userById } from './auth';
import type { SlotColumn, UserRow } from './auth';
import { BOT_LEVELS, BOT_PROFILES, BotLevel, DEFAULT_BOT_LEVEL, botLevelOr, chooseBotDraft } from '../shared/bot';
import { botPool } from './bot-pool';
import { DbClient, one, q, tx } from './db';
import { matchTolerance, ratingDiffs } from './rating';
import { gameId, randomToken } from './security';
import { BOT_RUNTIME, FEATURES, LIMITS, MATCHMAKING, PERSIST, RATING, RELAY, TIMINGS, dealSettings } from './settings';
import { toSummary } from './summary';
import { countryOfTimezone } from './timezones';

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
  /** Roi (objet king), pris à l'assise. Absent des parties enregistrées avant les rois : seatView donne Arcane. */
  king?: string;
  /** Sceau de collection (id col:*), pris à l'assise. */
  seal?: string | null;
  level?: BotLevel;
}

export interface Clock {
  initial: number;
  increment: number;
  w: number;
  b: number;
  running: Color | null;
  since: number;
}

/**
 * Phase de choix des cartes (décision D5, voir DraftView dans protocol.ts). Secrète : seul `draftView` la montre,
 * à chaque joueur ses propres cartes. Présente dès la création d'une partie avec cartes, armée (échéance) quand la
 * partie devient active, retirée quand les mains sont données.
 */
export interface DraftData {
  pool: CardId[];
  /** Échéance (horodatage, ms) ; null tant que la partie attend son deuxième joueur. */
  deadline: number | null;
  /** Choix validés, secrets jusqu'à la révélation. */
  picks: Record<Color, CardId[] | null>;
  /** Sélections provisoires, secrètes, complétées au hasard à l'échéance si le joueur n'a pas validé. */
  tentative: Record<Color, CardId[]>;
  /**
   * Contraintes du tirage (R9) appliquées aussi au choix, lues à la création (DEAL.limitsInDraft) ; absent : aucune
   * (décision Q4, et parties d'avant). Un déploiement qui change DEAL ne change pas les contraintes d'un choix en cours.
   */
  limits?: HandLimits;
}

export interface RoomData {
  id: string;
  mode: GameMode;
  rated: boolean;
  status: GameStatus;
  tc: string;
  /** Anciennes parties : mains identiques. Le mode miroir n'est plus proposé : les nouvelles parties ont faux. */
  mirror: boolean;
  /** Catalogue de cartes : 'climats' (Pouvoirs) ou 'aucune' ; 'duel' pour les parties créées avant. */
  catalog?: Catalog;
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
  /**
   * Choix des cartes en cours ou à venir ; absent (anciennes parties, mains tirées) ou null (choix terminé, sans
   * cartes). Pendant le choix, `state.hands` est vide pour les deux camps.
   */
  draft?: DraftData | null;
  lastActivity?: number;
  /**
   * Partie en direct de l'accueil : si un joueur ne joue pas, l'IA joue pour lui (`standIn`) jusqu'à ce qu'il reprenne
   * la main (il joue un coup, ou game:takeover). Ses mains sont tirées au hasard. Sa revanche (createRematch) est une
   * partie amicale ordinaire : choix des cartes, sans relais, comme avant la passe « polymorphe ».
   */
  relay?: boolean;
  standIn?: Record<Color, boolean>;
  /**
   * Heure de la dernière sauvegarde : après un arrêt brutal, le temps écoulé jusqu'à elle depuis le début du
   * tour est décompté à la reprise (après un arrêt normal, la pendule est figée juste avant).
   */
  savedAt?: number;
}

/** Salle de jeu (exportée pour les tests du choix des cartes, test/server-draft.test.ts). */
export class Room {
  sockets = new Set<Sock>();
  away: Record<Color, number | null> = { w: null, b: null };
  flagTimer: NodeJS.Timeout | null = null;
  abortTimer: NodeJS.Timeout | null = null;
  draftTimer: NodeJS.Timeout | null = null;
  saveTimer: NodeJS.Timeout | null = null;
  botBusy = false;
  /** Relais de l'IA (parties de l'accueil) : minuterie du tour, calcul en cours, début du tour, dernière présence. */
  relayTimer: NodeJS.Timeout | null = null;
  relayBusy = false;
  turnSince = Date.now();
  activityAt: Record<Color, number> = { w: 0, b: 0 };
  rematchPending = false;
  endedAt = 0;
  /** Échecs consécutifs de l'IA à jouer (décision en erreur, délai dépassé, coup refusé) : voir maybeBot. */
  botFailures = 0;
  /**
   * Fin de partie pas encore enregistrée (persistResult en cours, en attente d'un nouvel essai, ou à relancer) : la
   * salle reste en mémoire (le ménage ne l'évince pas et relance l'enregistrement), et flushRooms l'enregistre à
   * l'arrêt du serveur, classement compris.
   */
  resultPending = false;
  /** persistResult en cours (essais compris) : jamais deux à la fois pour une même salle. */
  persisting = false;
  constructor(public d: RoomData) {}
}

// Délais, limites, classement, appariement, relais et IA : src/server/settings.ts (TIMINGS, LIMITS, RATING,
// MATCHMAKING, RELAY, BOT_RUNTIME). Rien n'est écrit en dur ici.

/** Pouvoirs (R10) : les cinématiques (lancement, arrivée d'un Présage, Rituel) ne coûtent pas de temps. */
export const CINEMATIC_MS = TIMINGS.cinematicMs;

const COLORS: Color[] = ['w', 'b'];

/**
 * La partie a-t-elle commencé (chacun a joué son premier coup) ? Ensuite, plus d'annulation possible, et une
 * proposition de nulle devient permise.
 */
export const isStarted = (s: Pick<GameState, 'ply'>) => s.ply >= TIMINGS.minPlyToStart;

/** Catalogue d'une salle : celui de sa création, sinon celui de son état (catalogOf : Duel pour les plus anciennes). */
export const roomCatalog = (d: Pick<RoomData, 'catalog' | 'state'>): Catalog => d.catalog ?? catalogOf(d.state);

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
  }, TIMINGS.saveDebounceMs);
}

async function saveRoom(room: Room, client?: DbClient) {
  const d = room.d;
  const r = d.state.result;
  d.savedAt = now();
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

/**
 * Une partie en cours qui garde une carte retirée du jeu (Couronnement, Chevauchée, Portails, Déjà-vu : décision
 * du 30 octobre), en main ou en effet, ne peut plus être arbitrée.
 */
export function hasRetiredCard(s: GameState): boolean {
  return [...s.hands.w, ...s.hands.b].some(h => !isCardId(h.card)) || s.effects.some(e => !isCardId(e.card));
}

/**
 * Reprise après redémarrage : la pendule ne décompte pas le temps où le serveur était arrêté ; un choix des cartes
 * en cours repart avec une échéance entière. Exportée pour les tests.
 */
export function resumeRoom(room: Room) {
  // Les états enregistrés sans catalogue sont des parties Duel (catalogOf), toujours jouables. Une partie qui
  // garde une carte retirée est annulée, sans effet sur le classement (une partie terminée reste lisible telle
  // quelle : elle n'est jamais rejouée par le moteur).
  if (hasRetiredCard(room.d.state)) {
    endGame(room, { winner: null, reason: 'aborted' });
    return;
  }
  // Règles enregistrées illisibles (schéma d'une version plus récente, données abîmées, valeurs injouables) : la
  // partie ne peut pas être arbitrée, elle est annulée avec un message au journal. Lisibles : les mêmes, gelées.
  if (room.d.state.rules !== undefined) {
    const rules = parseRules(room.d.state.rules);
    if (!rules) {
      console.error(`Partie ${room.d.id} annulée à la reprise : ses règles enregistrées sont illisibles (schéma inconnu ou valeurs injouables).`);
      endGame(room, { winner: null, reason: 'aborted' });
      return;
    }
    room.d.state = { ...room.d.state, rules };
  }
  resumeClock(room.d);
  if (room.d.started === undefined) room.d.started = isStarted(room.d.state);
  room.d.lastActivity ??= now();
  if (room.d.status === 'active') {
    for (const c of COLORS) if (room.d.seats[c] && room.d.seats[c]!.kind !== 'bot') room.away[c] = now();
  }
  if (room.d.firstMoveDeadline) room.d.firstMoveDeadline = now() + TIMINGS.firstMoveMs;
  const both = resumeDraft(room.d);
  armTimers(room);
  if (both) closeDraftRoom(room);
  maybeBot(room);
  armRelay(room);
}

export async function restoreRooms() {
  await applyPendingRatings();
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

/** Vue publique d'un siège : le roi est normalisé (siège ancien ou identifiant inconnu : Arcane). Exportée pour les tests. */
export function seatView(room: Room, c: Color): SeatView | null {
  const s = room.d.seats[c];
  if (!s) return null;
  const online = s.kind === 'bot' || [...room.sockets].some(k => keyOf(k.data.identity) === s.key);
  return {
    kind: s.kind, name: s.name, username: s.username, rating: s.rating, skin: s.skin, king: normKing(s.king), seal: s.seal ?? null,
    online, level: s.level,
  };
}

/** Vue d'une partie pour un joueur (`you`) ou un spectateur (null). Exportée pour les tests. */
export function viewFor(room: Room, you: Color | null): GameView {
  const d = room.d;
  // Tout est public : les mains des deux camps, cartes jouées ou non, et les Présages annoncés.
  const state: GameState = viewState(d.state);
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
      w: Math.max(0, remaining(d, 'w')),
      b: Math.max(0, remaining(d, 'b')),
      running: ck.running,
      serverNow: now(),
      rate: { w: rate(d, 'w'), b: rate(d, 'b') },
      noIncrement: incrementSuspended(d.state),
    },
    drawOffer: d.drawOffer,
    rematch: d.rematch,
    ratingDiff: d.ratingDiff,
    firstMoveDeadline: d.firstMoveDeadline,
    away: room.away,
    claimAfterMs: TIMINGS.claimAfterMs,
    createdAt: d.createdAt,
    mirror: d.mirror,
    started: !!d.started,
    draft: draftView(d, you),
    standIn: d.relay ? { w: !!d.standIn?.w, b: !!d.standIn?.b } : null,
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
// Fonctions sur les données de la salle seules (sans sockets) : testées dans test/server-clock.test.ts.

function rate(d: RoomData, c: Color) {
  return clockRate(d.state, c);
}

function remaining(d: RoomData, c: Color): number {
  const ck = d.clock!;
  let t = ck[c];
  if (ck.running === c) t -= (now() - ck.since) * rate(d, c);
  return t;
}

/** Arrête la pendule du joueur `mover` (avec incrément éventuel) ; à appeler AVANT de changer l'état. */
function stopClock(d: RoomData, mover: Color, increment: boolean) {
  const ck = d.clock;
  if (!ck || ck.running !== mover) return;
  ck[mover] = Math.max(0, remaining(d, mover)) + (increment ? ck.increment * 1000 : 0);
  ck.running = null;
}

/** Relance la pendule du camp au trait, une fois que chacun a joué son premier coup. */
function startClock(d: RoomData) {
  const ck = d.clock;
  if (!ck) return;
  const s = d.state;
  ck.running = d.status === 'active' && !s.result && d.started ? s.pos.turn : null;
  ck.since = now();
}

/**
 * Fige le temps écoulé de la pendule en marche : avant un changement d'état qui peut changer sa vitesse, et
 * avant la sauvegarde d'arrêt du serveur (le temps réfléchi avant l'arrêt reste décompté).
 */
export function settleClock(d: RoomData) {
  const ck = d.clock;
  if (!ck?.running) return;
  ck[ck.running] = Math.max(0, remaining(d, ck.running));
  ck.since = now();
}

/**
 * Reprise après redémarrage : le temps où le serveur était arrêté n'est pas décompté, mais le temps écoulé avant
 * l'arrêt l'est. Arrêt normal : la pendule a été figée juste avant la sauvegarde. Arrêt brutal : on décompte au
 * moins le temps écoulé jusqu'à la dernière sauvegarde (la suite est perdue).
 */
export function resumeClock(d: RoomData) {
  const ck = d.clock;
  if (!ck?.running) return;
  if (d.savedAt !== undefined && d.savedAt > ck.since) {
    ck[ck.running] = Math.max(0, ck[ck.running] - (d.savedAt - ck.since) * rate(d, ck.running));
  }
  ck.since = now();
}

/** Pouvoirs (R10) : crédite au camp au trait la durée d'une cinématique, si sa pendule tourne. */
function creditCinematic(d: RoomData, c: Color) {
  const ck = d.clock;
  if (!ck || ck.running !== c || !CATALOG_RULES[catalogOf(d.state)]?.cinematicCredit) return;
  ck[c] += CINEMATIC_MS * rate(d, c);
}

/**
 * Pendule et état après un coup : incrément décidé sur l'état AVANT le coup (aucun sous le Sablier fou),
 * démarrage de la partie, crédit de cinématique si un Présage arrive.
 */
export function commitMove(d: RoomData, color: Color, state: GameState, info: MoveInfo) {
  stopClock(d, color, !incrementSuspended(d.state));
  d.state = state;
  d.drawOffer = null;
  d.lastActivity = now();
  if (isStarted(d.state)) d.started = true;
  startClock(d);
  if (info.arrived?.length) creditCinematic(d, d.state.pos.turn);
}

/**
 * Pendule et état après une carte. Renvoie vrai si le trait a changé (carte qui termine le tour, Retour arrière du
 * Duel).
 * - Carte qui termine le tour (cardEndsTurn : un Rituel, ou toute carte si les règles de la partie le disent) : c'est
 *   un coup (incrément, démarrage de la partie) ; l'adversaire est crédité de la cinématique.
 * - Autre carte : le lanceur, toujours au trait, est crédité de la cinématique de lancement.
 */
export function commitCard(d: RoomData, color: Color, state: GameState, info: CardInfo): boolean {
  const turnChanges = state.pos.turn !== color;
  const asMove = cardEndsTurn(CARDS[info.card], rulesOf(state));
  // La vitesse de la pendule dépend de l'état : le temps écoulé est figé avant de le changer.
  settleClock(d);
  if (turnChanges) stopClock(d, color, asMove && !incrementSuspended(d.state));
  d.state = state;
  d.lastActivity = now();
  if (turnChanges) {
    if (asMove) {
      d.drawOffer = null;
      if (isStarted(d.state)) d.started = true;
    }
    startClock(d);
    creditCinematic(d, d.state.pos.turn);
  } else {
    creditCinematic(d, color);
  }
  return turnChanges;
}

// ---------------------------------------------------------------------------------------------
// Choix des cartes (décision D5)
// Fonctions sur les données de la salle seules (sans sockets ni minuteries) : testées dans
// test/server-draft.test.ts. Les choix restent dans `RoomData.draft` jusqu'à la révélation ; la vue n'en montre
// que ce que `draftView` laisse passer.

/**
 * Choix des cartes d'une nouvelle partie (null : catalogue sans cartes). `count` : cartes par joueur des règles de la
 * partie. Une réserve trop petite pour en choisir `count` est une erreur de configuration (checkRules la refuse au
 * démarrage du serveur) : refus explicite, plus de tirage silencieux à la place du choix. `limits` : contraintes du
 * tirage appliquées aussi au choix (DEAL.limitsInDraft), gardées dans le choix ; absentes, aucune.
 */
export function newDraft(
  catalog: Catalog, timed: boolean, vsBot: boolean, count: number = rulesFor('classee').cardsPerPlayer, limits?: HandLimits,
): DraftData | null {
  const pool = cardPool(catalog, timed, { vsBot });
  if (!pool.length) return null;
  if (pool.length < count) {
    throw new Error(`Choix des cartes impossible : la réserve n'a que ${pool.length} cartes pour ${count} cartes par joueur (voir checkRules).`);
  }
  // `limits` n'est écrit que s'il y en a : au défaut, le choix enregistré est le même qu'avant (témoins v1).
  return { pool, deadline: null, picks: { w: null, b: null }, tentative: { w: [], b: [] }, ...(limits ? { limits } : {}) };
}

/** Cartes à choisir dans cette partie : celles de ses règles (RULES_V1 pour les parties d'avant le versionnement). */
const draftCount = (d: RoomData) => rulesOf(d.state).cardsPerPlayer;
/** Contraintes du tirage appliquées aussi au choix de cette partie, lues à sa création ; sinon aucune (décision Q4). */
const draftLimits = (d: RoomData) => d.draft?.limits;

/**
 * Ouvre (ou rouvre, après un redémarrage) le choix d'une partie active : échéance entière à partir de maintenant,
 * l'IA choisit aussitôt. Renvoie vrai si les deux camps ont déjà choisi.
 */
export function openDraft(d: RoomData): boolean {
  const dr = d.draft;
  if (!dr || d.status !== 'active') return false;
  dr.deadline = now() + dealSettings().draftMs;
  for (const c of COLORS) {
    const seat = d.seats[c];
    if (seat?.kind === 'bot' && !dr.picks[c]) {
      dr.picks[c] = chooseBotDraft(dr.pool, botLevelOr(seat.level), Math.random, { count: draftCount(d), limits: draftLimits(d) });
    }
  }
  return !!(dr.picks.w && dr.picks.b);
}

/** Reprise après un redémarrage : le choix en cours repart avec une échéance entière. */
export const resumeDraft = openDraft;

export type DraftOutcome = { ok: false; error: string } | { ok: true; validated: boolean; complete: boolean };

/**
 * Choix de `color` : validé (`confirm`, exactement `count` cartes, définitif, idempotent) ou provisoire (de 0 à
 * `count` cartes), `count` étant le nombre de cartes des règles de la partie (draftCount). `validated` : un nouveau
 * choix vient d'être validé ; `complete` : les deux camps ont validé.
 */
export function submitDraft(d: RoomData, color: Color, cards: readonly unknown[], confirm: boolean): DraftOutcome {
  const dr = d.draft;
  if (d.status !== 'active' || !dr?.deadline) return { ok: false, error: 'Aucun choix de cartes en cours.' };
  const err = draftRefusal(dr.pool, cards, !confirm, draftCount(d), draftLimits(d));
  if (err) return { ok: false, error: err };
  const chosen = cards.slice() as CardId[];
  const done = dr.picks[color];
  if (done) {
    // Idempotent : le même choix, dans n'importe quel ordre, est accepté sans rien changer.
    if (confirm && chosen.every(c => done.includes(c))) return { ok: true, validated: false, complete: false };
    return { ok: false, error: 'Vos cartes sont déjà choisies.' };
  }
  dr.tentative[color] = chosen;
  if (!confirm) return { ok: true, validated: false, complete: false };
  dr.picks[color] = chosen.slice();
  d.lastActivity = now();
  return { ok: true, validated: true, complete: !!(dr.picks.w && dr.picks.b) };
}

/** Fin du choix : camps qui n'avaient pas validé (`auto`), et parmi eux ceux qui ont reçu des cartes au hasard. */
export interface DraftClosure {
  auto: Color[];
  /** Camps dont la sélection provisoire avait moins de cartes que la partie n'en demande : complétés au hasard. */
  filled: Color[];
}

/**
 * Fin du choix : chaque camp reçoit ses cartes validées, ou sa sélection provisoire complétée au hasard. Les mains
 * sont données à l'état (révélées), le choix est retiré. Une sélection provisoire déjà complète est gardée telle
 * quelle : ce camp est dans `auto` (il n'avait pas validé), pas dans `filled` (aucune carte tirée au hasard).
 */
export function closeDraft(d: RoomData, rand: () => number = Math.random): DraftClosure {
  const dr = d.draft;
  if (!dr) return { auto: [], filled: [] };
  const count = draftCount(d);
  const auto: Color[] = [];
  const filled: Color[] = [];
  const hands: Record<Color, CardId[]> = { w: [], b: [] };
  for (const c of COLORS) {
    const picked = dr.picks[c];
    if (!picked) {
      auto.push(c);
      if (dr.tentative[c].length < count) filled.push(c);
    }
    hands[c] = picked ?? completeDraft(dr.pool, dr.tentative[c], rand, count, draftLimits(d));
  }
  d.state = withHands(d.state, hands);
  d.draft = null;
  d.lastActivity = now();
  return { auto, filled };
}

/** Ce qu'un joueur (ou un spectateur, `you` null) voit du choix en cours : jamais les cartes de l'adversaire. */
export function draftView(d: RoomData, you: Color | null): DraftView | null {
  const dr = d.draft;
  if (!dr || d.status !== 'active' || !dr.deadline) return null;
  return {
    pool: dr.pool.slice(),
    count: draftCount(d),
    deadline: dr.deadline,
    msLeft: Math.max(0, dr.deadline - now()),
    totalMs: dealSettings().draftMs,
    chosen: { w: !!dr.picks.w, b: !!dr.picks.b },
    mine: you ? (dr.picks[you] ?? dr.tentative[you]).slice() : [],
  };
}

/** Fin du choix dans la salle : mains révélées, puis délai du premier coup, pendules et IA comme avant. */
function closeDraftRoom(room: Room) {
  const d = room.d;
  if (!d.draft || d.status !== 'active') return;
  const { auto, filled } = closeDraft(d);
  updateFirstMoveDeadline(room);
  startClock(d);
  armTimers(room);
  broadcast(room, { type: 'reveal', auto, filled });
  maybeBot(room);
}

/** Choix reçu d'un joueur (exporté pour les tests). */
export function applyDraft(room: Room, color: Color, cards: readonly unknown[], confirm: boolean): Ack {
  const r = submitDraft(room.d, color, cards, confirm);
  if (!r.ok) return r;
  if (r.complete) closeDraftRoom(room);
  else if (r.validated) broadcast(room, { type: 'draft', color });
  else scheduleSave(room);
  return { ok: true };
}

function armTimers(room: Room) {
  if (room.flagTimer) clearTimeout(room.flagTimer);
  if (room.abortTimer) clearTimeout(room.abortTimer);
  if (room.draftTimer) clearTimeout(room.draftTimer);
  room.flagTimer = room.abortTimer = room.draftTimer = null;
  if (room.d.status !== 'active') return;
  const deadline = room.d.draft?.deadline;
  if (deadline) room.draftTimer = setTimeout(() => closeDraftRoom(room), Math.max(0, deadline - now()));
  const ck = room.d.clock;
  if (ck?.running) {
    const c = ck.running;
    const ms = Math.max(0, remaining(room.d, c) / rate(room.d, c)) + TIMINGS.flagMarginMs;
    room.flagTimer = setTimeout(() => checkFlag(room), Math.min(ms, 2 ** 31 - 1));
  }
  if (room.d.firstMoveDeadline) {
    const ms = Math.max(0, room.d.firstMoveDeadline - now());
    room.abortTimer = setTimeout(() => {
      if (room.d.status === 'active' && !room.d.started) endGame(room, firstMoveAbort(room.d));
    }, ms);
  }
}

function checkFlag(room: Room): boolean {
  const ck = room.d.clock;
  if (!ck?.running || room.d.status !== 'active') return false;
  const c = ck.running;
  if (remaining(room.d, c) > 0) {
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
  // Pendant le choix des cartes, pas de délai : il commence à la révélation des mains.
  // Parties de l'accueil : pas de délai, l'IA joue pour celui qui ne joue pas (relais) ; relais coupé
  // (FEATURE_HOME_RELAY=0) : le délai ordinaire, sinon une partie désertée resterait ouverte sans fin.
  const relayed = !!room.d.relay && FEATURES.homeRelay;
  room.d.firstMoveDeadline =
    room.d.status === 'active' && !room.d.draft && !room.d.started && !relayed && turnSeat?.kind !== 'bot' ? now() + TIMINGS.firstMoveMs : null;
}

// ---------------------------------------------------------------------------------------------
// Création et fin de partie

/** Siège d'un compte ou d'un invité. Le roi et le sceau sont pris ici, à l'assise. Exportée pour les tests. */
export async function seatFor(identity: Identity, guestName?: string): Promise<Seat> {
  // L'identité du socket date de sa connexion : on relit le classement (et l'équipement) à jour
  const u = identity.user ? (await userById(identity.user.id)) ?? identity.user : null;
  if (u) {
    return {
      kind: 'user', key: keyOf(identity), userId: u.id, name: u.username, username: u.username, rating: u.rating,
      gamesPlayed: u.games_played, skin: u.equipped_skin || DEFAULT_SKIN, king: u.equipped_king || DEFAULT_KING,
      seal: sealOf(u.items ?? []),
    };
  }
  return {
    kind: 'guest', key: keyOf(identity), userId: null, name: guestName || 'Invité', username: null, rating: null,
    gamesPlayed: 0, skin: DEFAULT_SKIN, king: DEFAULT_KING, seal: null,
  };
}

/** Siège de l'IA : son apparence (sorts et roi) vient de BOT_LOOK. Exportée pour les tests. */
export function botSeat(level: BotLevel): Seat {
  const p = BOT_PROFILES[level];
  const look = BOT_LOOK[level];
  return {
    kind: 'bot', key: `bot:${level}`, userId: null, name: `IA ${p.name}`, username: null, rating: p.rating, gamesPlayed: 0,
    skin: look.skin, king: look.king, seal: null, level,
  };
}

/** Contexte de règles d'une nouvelle partie (RULES_BY_CONTEXT) : accueil, contre l'IA, invitation, classée, amicale. */
export function contextOf(o: { mode: GameMode; rated: boolean; relay?: boolean }): RulesContext {
  if (o.relay) return 'accueil';
  if (o.mode === 'bot') return 'ia';
  if (o.mode === 'invite') return 'invitation';
  return o.rated ? 'classee' : 'amicale';
}

export interface NewRoomOptions {
  mode: GameMode;
  rated: boolean;
  /** Identifiant de cadence (TIME_CONTROLS, archivées comprises). Inconnu : refusé, sauf si `clock` est donnée. */
  tc: string;
  catalog: Catalog;
  creator: string;
  seats: Record<Color, Seat | null>;
  /** Mains tirées au hasard, sans choix des cartes (parties de l'accueil). Sinon : le choix si DEAL.draft. */
  deal?: boolean;
  /** L'IA joue pour un joueur qui ne joue pas (parties de l'accueil). */
  relay?: boolean;
  /** Contexte des règles (défaut : contextOf, d'après le mode). */
  ctx?: RulesContext;
  /** Règles imposées (tests) ; défaut : rulesFor(ctx), les règles du moment. */
  rules?: Rules;
  /** Pendule imposée (revanche : celle de la partie d'origine, même si sa cadence a été retirée depuis). */
  clock?: TimeControl | null;
}

/**
 * Nouvelle partie, avec les règles du moment de son contexte (rulesFor, photographiées dans l'état seulement si elles
 * diffèrent de RULES_V1) et la mise en place du moment (dealSettings) : choix des cartes (D5, mains vides jusqu'à la
 * révélation) ou tirage. Un catalogue qui n'est plus proposé (Duel : anciennes parties, tests) suit RULES_V1. Une
 * cadence inconnue est refusée (plus de partie « sans pendule » silencieuse). Le mode miroir n'existe plus (le
 * paramètre `mirror` des anciens clients est ignoré). Exportée pour les tests.
 */
export function newRoom(opts: NewRoomOptions): Room {
  const tc = opts.clock !== undefined ? opts.clock : tcFromId(opts.tc);
  if (tc === undefined) throw new Error(`Cadence inconnue : ${opts.tc}.`);
  const rules = opts.rules ?? (CATALOG_RULES[opts.catalog]?.offered === false ? RULES_V1 : rulesFor(opts.ctx ?? contextOf(opts)));
  const deal = dealSettings();
  let id = gameId();
  while (rooms.has(id)) id = gameId();
  // Réserve : contre l'IA, pas de Sablier fou (il ne pénaliserait que l'humain) ; sans pendule non plus.
  const vsBot = opts.mode === 'bot';
  const drawn = opts.deal || !deal.draft;
  const draft = drawn ? null : newDraft(opts.catalog, !!tc, vsBot, rules.cardsPerPlayer, deal.limitsInDraft ? deal.handLimits : undefined);
  const hands = draft ? { w: [], b: [] } : dealHands(!!tc, Math.random, opts.catalog, { vsBot, rules, deal });
  // Tirage plus court que les règles (contraintes du tirage impossibles à tenir) : refus explicite, jamais une main
  // silencieusement plus courte. checkRules l'empêche au démarrage ; ceci protège des règles imposées (tests).
  const dealt = [hands.w.length, hands.b.length];
  if (!draft && dealt.some(n => n > 0) && dealt.some(n => n !== rules.cardsPerPlayer)) {
    throw new Error(`Tirage impossible : mains de ${dealt.join(' et ')} cartes pour ${rules.cardsPerPlayer} cartes par joueur (voir checkRules).`);
  }
  const room = new Room({
    id,
    mode: opts.mode,
    rated: opts.rated,
    status: opts.seats.w && opts.seats.b ? 'active' : 'waiting',
    tc: opts.tc,
    mirror: false,
    catalog: opts.catalog,
    creator: opts.creator,
    seats: opts.seats,
    state: createGame(hands, !!tc, opts.catalog, { rules }),
    draft,
    clock: tc ? { initial: tc.initial, increment: tc.increment, w: tc.initial * 1000, b: tc.initial * 1000, running: null, since: now() } : null,
    drawOffer: null,
    rematch: { w: false, b: false, next: null },
    ratingDiff: null,
    firstMoveDeadline: null,
    createdAt: now(),
    started: false,
    lastActivity: now(),
    ...(opts.relay ? { relay: true, standIn: { w: false, b: false } } : {}),
  });
  rooms.set(id, room);
  if (room.d.status === 'active') begin(room);
  scheduleSave(room);
  return room;
}

/** La partie devient active : choix des cartes s'il y a lieu (l'IA choisit aussitôt), sinon délai du premier coup. */
function begin(room: Room) {
  room.d.status = 'active';
  const chosen = openDraft(room.d);
  updateFirstMoveDeadline(room);
  startClock(room.d);
  armTimers(room);
  if (chosen) closeDraftRoom(room);
  maybeBot(room);
  room.turnSince = now();
  armRelay(room);
}

/**
 * Annulation faute de premier coup dans le délai. Partie en direct de l'accueil (relayée : elle n'a ce délai que relais
 * coupé, FEATURE_HOME_RELAY=0) : avec sa cause (Result.cause), pour que l'accueil revienne seul à l'Oracle
 * (abortedEmpty, useLiveGame.ts). Toute autre partie : le résultat d'avant, sans cause (identité au défaut).
 */
const firstMoveAbort = (d: Pick<RoomData, 'relay'>): Result =>
  d.relay ? { winner: null, reason: 'aborted', cause: 'first-move' satisfies AbortCause } : { winner: null, reason: 'aborted' };

function endGame(room: Room, result?: Result) {
  const d = room.d;
  if (d.status === 'ended') return;
  if (result) d.state = { ...d.state, result };
  const r = d.state.result!;
  if (d.clock?.running) stopClock(d, d.clock.running, false);
  d.status = 'ended';
  d.drawOffer = null;
  d.firstMoveDeadline = null;
  // Partie terminée pendant le choix (abandon, annulation) : les choix secrets disparaissent avec lui.
  d.draft = null;
  room.endedAt = now();
  armTimers(room);
  if (room.relayTimer) clearTimeout(room.relayTimer);
  room.relayTimer = null;
  const { w, b } = d.seats;
  if (d.rated && w?.userId && b?.userId && r.reason !== 'aborted') d.ratingDiff = ratingDiffs(w, b, r.winner);
  broadcast(room, { type: 'end' });
  void persistResult(room);
}

/**
 * Classement d'une partie classée terminée, dans la transaction `c` : écarts (ratingDiff) et compteurs de parties.
 * Garde-fou : même après un redémarrage ou un nouvel essai, il n'est appliqué qu'une fois par partie
 * (ratings_applied). Renvoie vrai s'il vient d'être appliqué.
 */
async function applyRatings(c: DbClient, d: RoomData): Promise<boolean> {
  const r = d.state.result;
  if (!d.rated || !d.ratingDiff || !r || r.reason === 'aborted') return false;
  const first = await c.query(`UPDATE games SET ratings_applied = true WHERE id = $1 AND NOT ratings_applied RETURNING id`, [d.id]);
  if (!first.rowCount) return false;
  for (const color of COLORS) {
    const seat = d.seats[color]!;
    if (!seat.userId) continue;
    const outcome = r.winner === null ? 'draws' : r.winner === color ? 'wins' : 'losses';
    await c.query(
      `UPDATE users SET rating = greatest(${RATING.floor}, rating + $1), games_played = games_played + 1, ${outcome} = ${outcome} + 1 WHERE id = $2`,
      [d.ratingDiff[color], seat.userId],
    );
  }
  return true;
}

/** Salle terminée et classement, en une transaction. */
const saveResult = (room: Room) =>
  tx(async c => {
    await saveRoom(room, c);
    await applyRatings(c, room.d);
  });

/**
 * Fin de partie enregistrée (saveResult). Si la base ne répond pas, nouvel essai après PERSIST.retryMs,
 * PERSIST.attempts fois au plus. En attendant (resultPending), la partie reste en mémoire, terminée : le ménage ne
 * l'évince pas et relance l'enregistrement jusqu'au retour de la base, et un arrêt du serveur l'enregistre
 * (flushRooms). Un seul enregistrement à la fois par salle (persisting) : un appel pendant un autre rend faux tout de
 * suite. Exportée pour les tests.
 */
export async function persistResult(room: Room): Promise<boolean> {
  if (room.persisting) return false;
  room.persisting = true;
  try {
    return await persistAttempts(room);
  } finally {
    room.persisting = false;
  }
}

async function persistAttempts(room: Room): Promise<boolean> {
  const d = room.d;
  room.resultPending = true;
  for (let attempt = 1; ; attempt++) {
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    try {
      await saveResult(room);
      room.resultPending = false;
      return true;
    } catch (e) {
      if (attempt >= PERSIST.attempts) {
        console.error(`Fin de partie ${d.id} non enregistrée après ${attempt} essais (nouvel essai au prochain ménage) :`, e);
        return false;
      }
      console.error(`Fin de partie ${d.id} : enregistrement impossible (essai ${attempt} sur ${PERSIST.attempts}), nouvel essai :`, e);
      await sleep(PERSIST.retryMs);
    }
  }
}

/**
 * Rattrapage au démarrage : parties classées terminées en base dont le classement n'a pas été appliqué (fin de partie
 * sauvegardée sans lui : enregistrement interrompu entre deux écritures, ou ligne écrite par une version d'avant
 * cette transaction). Même garde-fou (ratings_applied) : jamais deux fois. Une fin de partie que la base n'a jamais
 * reçue (base injoignable jusqu'à l'arrêt) n'est pas rattrapable : la ligne reste celle de la dernière sauvegarde, et
 * la partie est reprise au redémarrage. Exportée pour les tests.
 */
export async function applyPendingRatings(): Promise<number> {
  const rows = await q<{ data: RoomData }>(
    `SELECT data FROM games WHERE status = 'ended' AND rated AND NOT ratings_applied AND white_diff IS NOT NULL AND black_diff IS NOT NULL`,
  );
  let n = 0;
  for (const { data } of rows) {
    try {
      if (await tx(c => applyRatings(c, data))) n++;
    } catch (e) {
      console.error(`Classement de la partie ${data.id} (rattrapage) :`, e);
    }
  }
  if (n) console.log(`Classement appliqué à ${n} partie(s) terminée(s) dont l'enregistrement avait été interrompu.`);
  return n;
}

// ---------------------------------------------------------------------------------------------
// IA

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Un coup légal au hasard, sans carte (repli de l'IA après trop d'échecs). */
function randomReply(s: GameState): BotReply {
  const moves = legalMovesOf(s);
  const m = moves[Math.floor(Math.random() * moves.length)];
  return { id: 0, card: null, cards: [], move: m ? { from: m.from, to: m.to, promo: m.promo } : null };
}

/**
 * Joue la décision de l'IA pour `color` : ses cartes dans l'ordre (reply.cards, ou reply.card d'un fil plus ancien),
 * avec BOT_RUNTIME.cardPauseMs entre deux cartes et avant le coup (le temps de l'animation), puis le coup. `still` :
 * l'IA joue-t-elle toujours (vérifié après chaque pause) ? Une carte refusée arrête les cartes suivantes ; le coup est
 * alors abandonné (`keepMove` faux) ou tenté quand même (relais, comme avant).
 */
async function playReply(room: Room, color: Color, reply: BotReply, still: () => boolean, o: { label: string; keepMove: boolean }) {
  const cards: BotCard[] = cardsOfReply(reply);
  let move = reply.move;
  for (let i = 0; i < cards.length; i++) {
    if (!applyCard(room, color, cards[i].index, cards[i].targets).ok) {
      if (!o.keepMove) move = null;
      break;
    }
    if (i < cards.length - 1 || move) await sleep(BOT_RUNTIME.cardPauseMs);
    if (!still()) return;
  }
  if (move && still()) {
    const r = applyMove(room, color, move.from, move.to, move.promo as PieceType | undefined);
    if (!r.ok) console.error(`${o.label}, coup refusé :`, r.error);
  }
}

/**
 * L'IA joue si elle a le trait : décision d'un fil de calcul (botPool), petite pause pour un rythme naturel, puis ses
 * cartes et son coup (playReply). Un niveau inconnu (partie enregistrée par une autre version) prend le défaut. Une
 * tentative qui ne joue rien alors que l'IA garde le trait (fil en panne, délai dépassé, décision refusée) est un
 * échec ; après BOT_RUNTIME.maxFailures échecs consécutifs, l'IA joue un coup légal au hasard (la partie avance
 * toujours) ; si même ce coup échoue, elle ne relance plus.
 */
function maybeBot(room: Room) {
  const d = room.d;
  if (d.status !== 'active' || room.botBusy || d.draft) return;
  const seat = d.seats[d.state.pos.turn];
  if (seat?.kind !== 'bot') return;
  room.botBusy = true;
  const color = d.state.pos.turn;
  const ply = d.state.ply;
  const logLen = d.state.log.length;
  const started = now();
  const stale = () => d.status !== 'active' || d.state.ply !== ply || d.state.log.length !== logLen;
  const fallback = room.botFailures >= BOT_RUNTIME.maxFailures;
  if (fallback) console.error(`IA : ${room.botFailures} échecs de suite dans la partie ${d.id}, coup légal au hasard.`);
  void (fallback ? Promise.resolve(randomReply(d.state)) : botPool.decide(d.state, botLevelOr(seat.level)))
    .then(async reply => {
      if (reply.error) console.error('IA :', reply.error);
      // Petite pause pour un rythme naturel
      const wait = Math.max(0, BOT_RUNTIME.pauseMinMs + Math.random() * BOT_RUNTIME.pauseJitterMs - (now() - started));
      await sleep(wait);
      if (stale()) return;
      await playReply(room, color, reply, () => d.status === 'active' && d.state.pos.turn === color, { label: 'IA', keepMove: false });
    })
    .catch(e => console.error('IA :', e))
    .finally(() => {
      room.botBusy = false;
      // Rien n'a été joué alors que l'IA garde le trait : un échec de plus. Sinon, le compte repart de zéro.
      const stuck = d.status === 'active' && d.state.pos.turn === color && d.state.ply === ply && d.state.log.length === logLen;
      room.botFailures = stuck ? room.botFailures + 1 : 0;
      if (stuck && fallback) {
        console.error(`IA : aucun coup possible dans la partie ${d.id}, l'IA ne relance plus.`);
        return;
      }
      // Si l'état a changé pendant le calcul (ou si l'IA doit rejouer), on relance.
      if (d.status === 'active' && d.seats[d.state.pos.turn]?.kind === 'bot') setTimeout(() => maybeBot(room), BOT_RUNTIME.retryMs);
    });
}

// ---------------------------------------------------------------------------------------------
// Relais de l'IA (parties en direct de l'accueil)
//
// Un joueur qui ne joue pas (aucun coup, l'échiquier pas touché) : l'IA joue pour lui, sans le faire attendre ni
// faire attendre l'autre, jusqu'à ce qu'il reprenne la main. Premier coup : RELAY.firstMoveMs ; ensuite
// RELAY.idleMs sans le moindre signe de présence (game:activity). Relayé, il joue de lui-même dès qu'il veut :
// son coup lui rend la main. Si les deux joueurs sont relayés, l'IA ne joue pas contre elle-même : la partie attend ;
// personne n'est plus là depuis RELAY.abandonMs, elle est annulée.

export function armRelay(room: Room) {
  if (room.relayTimer) clearTimeout(room.relayTimer);
  room.relayTimer = null;
  const d = room.d;
  // Relais coupé (FEATURE_HOME_RELAY=0) : l'IA ne joue plus pour personne ; la partie suit les délais ordinaires
  // (délai du premier coup : updateFirstMoveDeadline ; victoire réclamée contre un absent ; ménage des parties).
  if (!d.relay || !FEATURES.homeRelay || d.status !== 'active' || d.state.result) return;
  const c = d.state.pos.turn;
  const seat = d.seats[c];
  if (!seat || seat.kind === 'bot') return;
  const other = opposite(c);
  if (d.standIn?.[other] && !d.standIn?.[c]) {
    // L'adversaire est déjà relayé : l'IA ne joue pas contre elle-même. On attend ce joueur ; si plus personne n'est
    // sur la page depuis RELAY.abandonMs, la partie est annulée.
    if (room.away.w && room.away.b) {
      room.relayTimer = setTimeout(() => {
        if (d.status === 'active' && room.away.w && room.away.b) endGame(room, { winner: null, reason: 'aborted' });
      }, RELAY.abandonMs);
    }
    return;
  }
  let ms: number;
  if (d.standIn?.[c]) ms = RELAY.delayMinMs + Math.random() * RELAY.delayJitterMs;
  else {
    const first = d.state.ply < (c === 'w' ? 1 : 2);
    const since = Math.max(room.turnSince, room.activityAt[c]);
    ms = Math.max(0, since + (first ? RELAY.firstMoveMs : RELAY.idleMs) - now());
  }
  room.relayTimer = setTimeout(() => relayPlay(room, c), ms);
}

function relayPlay(room: Room, c: Color) {
  const d = room.d;
  room.relayTimer = null;
  if (!d.relay || !FEATURES.homeRelay || d.status !== 'active' || d.state.pos.turn !== c || room.relayBusy) return;
  if (d.standIn?.[opposite(c)] && !d.standIn?.[c]) return;
  if (!d.standIn?.[c]) {
    d.standIn = { w: !!d.standIn?.w, b: !!d.standIn?.b, [c]: true } as Record<Color, boolean>;
    broadcast(room, { type: 'sync' });
  }
  room.relayBusy = true;
  const len = d.state.log.length;
  const still = () => d.status === 'active' && d.state.pos.turn === c && d.state.log.length === len && !!d.standIn?.[c];
  void botPool
    .decide(d.state, RELAY.level)
    .then(async reply => {
      if (reply.error) console.error('Relais de l’IA :', reply.error);
      if (!still()) return;
      const playing = () => d.status === 'active' && d.state.pos.turn === c && !!d.standIn?.[c];
      await playReply(room, c, reply, playing, { label: 'Relais de l’IA', keepMove: true });
    })
    .catch(e => console.error('Relais de l’IA :', e))
    .finally(() => {
      room.relayBusy = false;
      armRelay(room);
    });
}

/** Le joueur reprend la main (il joue lui-même, ou game:takeover). */
function takeOver(room: Room, c: Color) {
  const d = room.d;
  room.activityAt[c] = now();
  if (!d.relay || !d.standIn?.[c]) return false;
  d.standIn = { ...d.standIn, [c]: false };
  return true;
}

// ---------------------------------------------------------------------------------------------
// Actions

type Ack = { ok: boolean; error?: string; code?: AckCode };

// ---------------------------------------------------------------------------------------------
// Interrupteurs (FEATURES : défauts de src/shared/config/features.ts, FEATURE_* de l'environnement). Le serveur refuse
// ce qui est coupé, avec le code 'feature-off' ; au défaut, tout est ouvert et rien de ceci ne répond jamais.

/** Message de refus d'une fonction coupée (seulement celles que le serveur refuse lui-même). */
const FEATURE_OFF: Partial<Record<FeatureKey, string>> = {
  ranked: 'Les parties classées sont fermées pour le moment.',
  friendlyQueue: 'La recherche de partie amicale est fermée pour le moment.',
  invites: 'Les invitations sont fermées pour le moment.',
  botGames: 'Les parties contre l’IA sont fermées pour le moment.',
  guestPlay: 'Connectez-vous pour jouer : le jeu sans compte est fermé pour le moment.',
  live: 'Les parties en direct sont fermées pour le moment.',
  homeDuel: 'Les parties de l’accueil sont fermées pour le moment.',
  newGames: 'Le site est en maintenance : aucune nouvelle partie pour le moment. Les parties en cours continuent.',
};

/** Refus « fonction coupée » (code 'feature-off'). */
export const featureOff = (k: FeatureKey): Ack & { error: string } => ({
  ok: false,
  error: FEATURE_OFF[k] ?? 'Cette fonction est fermée pour le moment.',
  code: 'feature-off',
});

/** Interrupteur d'une sorte de partie : accueil (relais), contre l'IA, invitation, classée, amicale (comme contextOf). */
export function featureOfGame(o: { mode: GameMode; rated: boolean; relay?: boolean }): FeatureKey {
  if (o.relay) return 'homeDuel';
  if (o.mode === 'bot') return 'botGames';
  if (o.mode === 'invite') return 'invites';
  return o.rated ? 'ranked' : 'friendlyQueue';
}

/**
 * Peut-on créer une partie de cette sorte pour ce joueur ? null si oui ; sinon le refus : maintenance (newGames),
 * sorte de partie coupée, ou invité alors que le jeu sans compte est coupé (guestPlay). Création par POST /games, file,
 * accueil et revanche.
 */
export function creationRefusal(o: { mode: GameMode; rated: boolean; relay?: boolean }, identity: Identity): (Ack & { error: string }) | null {
  if (!FEATURES.newGames) return featureOff('newGames');
  const k = featureOfGame(o);
  if (!FEATURES[k]) return featureOff(k);
  if (!identity.user && !FEATURES.guestPlay) return featureOff('guestPlay');
  return null;
}

/**
 * Version du protocole annoncée par le client à la connexion (`io({ auth: { v } })`) différente de celle du serveur :
 * l'onglet date d'une autre version du site. Absente : client d'avant la version du protocole (ou client de test qui
 * n'annonce rien), compté comme la version 1. Accepté tant que PROTOCOL_VERSION vaut 1 ; à la première montée, il est
 * prévenu et refusé comme les autres (un ancien onglet affiche le refus, « rechargez la page »). Les clients de test
 * devront alors annoncer leur version (docs/REGLAGES.md, section 2).
 */
export function protocolMismatch(auth: unknown): boolean {
  const v = (auth as { v?: unknown } | null | undefined)?.v;
  return (v ?? 1) !== PROTOCOL_VERSION;
}

/** Refus de toute action d'un client d'une autre version (code 'outdated') : il doit recharger la page. */
export const OUTDATED: Ack & { error: string } = { ok: false, error: 'Le site a été mis à jour : rechargez la page.', code: 'outdated' };

/** Coup reçu d'un joueur ou de l'IA (exporté pour les tests). */
export function applyMove(room: Room, color: Color, from: number, to: number, promo?: PieceType): Ack {
  const d = room.d;
  if (d.status !== 'active') return { ok: false, error: 'La partie n’est pas en cours.' };
  if (d.draft) return { ok: false, error: 'Choisissez d’abord vos cartes.' };
  if (d.state.pos.turn !== color) return { ok: false, error: "Ce n'est pas votre tour." };
  if (checkFlag(room)) return { ok: false, error: 'Temps écoulé.' };
  const r = playMove(d.state, from, to, promo);
  if (!r.ok) return r;
  commitMove(d, color, r.state, r.info);
  updateFirstMoveDeadline(room);
  armTimers(room);
  broadcast(room, { type: 'move', color, info: r.info });
  if (d.state.result) endGame(room);
  else maybeBot(room);
  room.turnSince = now();
  armRelay(room);
  return { ok: true };
}

function applyCard(room: Room, color: Color, index: number, targets: number[]): Ack {
  const d = room.d;
  if (d.status !== 'active') return { ok: false, error: 'La partie n’est pas en cours.' };
  if (d.draft) return { ok: false, error: 'Choisissez d’abord vos cartes.' };
  if (checkFlag(room)) return { ok: false, error: 'Temps écoulé.' };
  const skin = d.seats[color]?.skin ?? DEFAULT_SKIN;
  const r = playCard(d.state, color, index, targets, skin);
  if (!r.ok) return r;
  const turnChanges = commitCard(d, color, r.state, r.info);
  if (turnChanges) updateFirstMoveDeadline(room);
  armTimers(room);
  broadcast(room, { type: 'card', info: r.info });
  if (d.state.result) endGame(room);
  else if (turnChanges) maybeBot(room);
  if (turnChanges) room.turnSince = now();
  armRelay(room);
  return { ok: true };
}

/**
 * Abandon. Avant l'arrivée de l'adversaire ou pendant le choix des cartes : la partie est annulée, sans effet sur
 * le classement. Exportée pour les tests.
 */
export function resignRoom(room: Room, color: Color): Ack {
  if (room.d.status === 'waiting' || (room.d.status === 'active' && room.d.draft)) {
    endGame(room, { winner: null, reason: 'aborted' });
    return { ok: true };
  }
  if (room.d.status !== 'active') return { ok: false, error: 'Partie terminée.' };
  endGame(room, { winner: opposite(color), reason: 'resign' });
  return { ok: true };
}

/** Annulation, permise jusqu'au premier coup de chacun (choix des cartes compris). Exportée pour les tests. */
export function abortRoom(room: Room): Ack {
  if (room.d.status === 'ended') return { ok: false, error: 'Partie terminée.' };
  if (room.d.status === 'active' && room.d.started) return { ok: false, error: 'Trop tard pour annuler : vous pouvez abandonner.' };
  endGame(room, { winner: null, reason: 'aborted' });
  return { ok: true };
}

/**
 * La proposition de revanche a-t-elle expiré (TIMINGS.rematchTtlMs après la fin de la partie) ? Jamais au défaut
 * (null : elle vit tant que la salle est en mémoire). Après un redémarrage, le délai repart du rechargement de la salle.
 * Exportée pour les tests.
 */
export function rematchExpired(room: Room, ttl: number | null = TIMINGS.rematchTtlMs): boolean {
  return ttl !== null && room.d.status === 'ended' && now() - room.endedAt > ttl;
}

/**
 * Revanche : sièges copiés, couleurs inversées, classement et équipement (sorts, roi, sceau) relus en base. Pendule de
 * la partie d'origine (d.clock, même si sa cadence a été retirée depuis), et les règles du moment de son contexte
 * (décision Q3 : c'est une nouvelle partie). Mise en place ordinaire, comme avant la passe : la revanche d'une partie
 * de l'accueil (relayée, mains tirées) est une partie amicale avec le choix des cartes, sans relais (relecture finale :
 * la reprendre changeait le site au défaut). Renvoie la nouvelle salle (null si la revanche existe déjà). Exportée
 * pour les tests.
 */
export async function createRematch(room: Room): Promise<Room | null> {
  const d = room.d;
  if (room.rematchPending || d.rematch.next) return null;
  room.rematchPending = true;
  // Copies des sièges (la partie terminée garde ses classements d'origine), relues en base
  const fresh = async (s: Seat | null): Promise<Seat | null> => {
    if (!s) return null;
    const copy = { ...s };
    if (s.userId) {
      // Objets portés : toutes les colonnes d'équipement (EQUIPPED_SELECT, tirées de SLOT_DEFS) ; le siège garde les sorts et le roi.
      const u = await one<Pick<UserRow, 'rating' | 'games_played' | 'items' | SlotColumn>>(
        `SELECT rating, games_played, ${EQUIPPED_SELECT},
           coalesce(array(SELECT item_id FROM user_items WHERE user_id = u.id), '{}') AS items
         FROM users u WHERE id = $1`, [s.userId]);
      if (u) {
        Object.assign(copy, {
          rating: u.rating, gamesPlayed: u.games_played, skin: u.equipped_skin, king: u.equipped_king || DEFAULT_KING,
          seal: sealOf(u.items ?? []),
        });
      }
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
  // Revanche d'une ancienne partie Duel : le Duel n'est plus proposé, elle se joue avec les Pouvoirs.
  const catalog = offeredCatalog(roomCatalog(d));
  const clock = d.clock ? { initial: d.clock.initial, increment: d.clock.increment } : null;
  let next: Room;
  try {
    next = newRoom({ mode: d.mode, rated: d.rated, tc: d.tc, catalog, creator: d.creator, seats, clock });
  } catch (e) {
    room.rematchPending = false;
    throw e;
  }
  d.rematch.next = next.d.id;
  for (const s of room.sockets) s.emit('game:redirect', { from: d.id, to: next.d.id });
  broadcast(room, { type: 'sync' });
  return next;
}

// ---------------------------------------------------------------------------------------------
// File d'attente classée

interface QueueEntry {
  key: string;
  identity: Identity;
  rating: number;
  since: number;
  /** Pseudo de l'invité (file amicale). */
  name?: string;
  /** Catalogue demandé (celui de la partie si ce joueur attendait le premier). */
  catalog: Catalog;
}
const queues = new Map<string, QueueEntry[]>();
/**
 * Demande d'entrée en file en cours, par joueur : une demande plus récente, ou queue:leave, rend caduque celle qui
 * attend encore la lecture de son classement (le joueur parti n'est jamais mis en file ni apparié).
 */
const queueTickets = new Map<string, number>();
let queueTicket = 0;
/**
 * Joueurs appariés dont la partie est en cours de création (sièges relus en base) : les deux, celui qui attendait et
 * le demandeur. quitQueue les retire d'ici : un joueur parti pendant la lecture des sièges n'est pas apparié (l'autre
 * reste en file), et si la création échoue, celui qui attendait n'est remis en file que s'il est encore là.
 */
const queueMatching = new Set<string>();

function leaveQueues(key: string) {
  for (const [tc, list] of queues) {
    const rest = list.filter(e => e.key !== key);
    if (rest.length !== list.length) queues.set(tc, rest);
  }
}

/** Le joueur quitte la file (queue:leave, déconnexion) : son entrée, et toute demande encore en cours. Exportée pour les tests. */
export function quitQueue(key: string) {
  queueTickets.delete(key);
  queueMatching.delete(key);
  leaveQueues(key);
}

/**
 * File d'une demande : cadence, classée ou amicale, catalogue ; une seule file pour tous les catalogues (`*`) si
 * MATCHMAKING.splitByCatalog est faux. Exportée pour les tests.
 */
export function queuePool(tc: string, rated: boolean, catalog: Catalog, split: boolean = MATCHMAKING.splitByCatalog): string {
  return `${tc}|${rated ? 'classee' : 'amicale'}|${split ? catalog : '*'}`;
}

/** Clés des joueurs en attente, par file (`tc|classee|catalogue`, voir queuePool). Pour les tests. */
export function queueKeys(): Record<string, string[]> {
  return Object.fromEntries([...queues].filter(([, l]) => l.length).map(([pool, l]) => [pool, l.map(e => e.key)]));
}

function queueSize() {
  let n = 0;
  for (const l of queues.values()) n += l.length;
  return n;
}

/**
 * File d'attente. Classée : comptes uniquement, appariement par classement Elo.
 * Amicale : ouverte aux invités (pseudo anonyme), non classée, premier arrivé premier servi.
 *
 * Concurrence : la première attente (le classement relu en base) a lieu AVANT de toucher à la file ; ensuite, la
 * sortie des autres files, la lecture de la file, le choix de l'adversaire et l'écriture se font sans aucun await.
 * Deux demandes simultanées ne lisent donc jamais la même liste périmée (double appariement, entrée perdue), et un
 * joueur parti pendant l'attente n'est ni apparié ni remis en file. La seconde attente (sièges relus en base, une fois
 * appariés) est surveillée par queueMatching : si l'un des deux part pendant elle, pas de partie, et l'autre reste en
 * file. Exportée pour les tests (`sock` : identité et emit).
 */
export async function joinQueue(sock: Pick<Sock, 'data' | 'emit'>, tc: string, rated: boolean, guestName?: string, catalog: Catalog = DEFAULT_CATALOG): Promise<Ack> {
  const identity = sock.data.identity;
  const off = creationRefusal({ mode: 'quick', rated }, identity);
  if (off) return off;
  if (rated && !identity.user) return { ok: false, error: 'Connectez-vous pour jouer en partie classée.' };
  if (!QUICK_CONTROLS.includes(tc)) return { ok: false, error: 'Cadence inconnue.' };
  let name: string | undefined;
  if (!identity.user) {
    const parsed = guestNameSchema.safeParse(guestName ?? '');
    const { anonymousPrefix: prefix, anonymousMin: min, anonymousMax: max } = MATCHMAKING;
    name = parsed.success ? parsed.data : `${prefix}${Math.floor(min + Math.random() * (max - min + 1))}`;
  }
  const key = keyOf(identity);
  // Une nouvelle demande remplace la précédente : l'ancienne entrée sort tout de suite (elle ne peut plus être
  // appariée pendant l'attente du classement).
  const ticket = ++queueTicket;
  queueTickets.set(key, ticket);
  leaveQueues(key);
  // 1. Attente : classement à jour (la seule lecture en base avant l'appariement).
  const me = identity.user ? (await userById(identity.user.id))?.rating ?? identity.user.rating : RATING.initial;
  // 2. Section synchrone, sans aucun await. Le joueur est parti, ou une demande plus récente a pris la place : rien.
  if (queueTickets.get(key) !== ticket) return { ok: true };
  queueTickets.delete(key);
  leaveQueues(key);
  const pool = queuePool(tc, rated, catalog);
  const list = queues.get(pool) ?? [];
  // Classée : adversaire le plus proche en classement, avec une tolérance qui s'élargit avec l'attente
  const candidates = list
    .filter(e => e.key !== key)
    .filter(e => !rated || Math.abs(e.rating - me) <= matchTolerance(now() - e.since))
    .sort((a, b) => (rated ? Math.abs(a.rating - me) - Math.abs(b.rating - me) : a.since - b.since));
  const opp = candidates[0];
  if (!opp) {
    queues.set(pool, [...list, { key, identity, rating: me, since: now(), name, catalog }]);
    sock.emit('queue:status', { waiting: true, tc, since: now(), players: queueSize() });
    return { ok: true };
  }
  queues.set(pool, list.filter(e => e !== opp));
  queueMatching.add(opp.key);
  queueMatching.add(key);
  // 3. Appariés (plus personne ne peut les prendre) : sièges relus en base, puis la partie, avec le catalogue de celui
  // qui attendait (le même que le sien si les files sont séparées par catalogue).
  let room: Room;
  try {
    const [a, b] = await Promise.all([seatFor(identity, name), seatFor(opp.identity, opp.name)]);
    // L'un des deux a quitté la file pendant la lecture des sièges (queue:leave, déconnexion) : pas de partie. Celui
    // qui reste reprend sa place (en tête s'il attendait, au bout s'il demandait), sauf s'il est déjà de nouveau en file.
    const oppHere = queueMatching.has(opp.key);
    const meHere = queueMatching.has(key);
    if (!oppHere || !meHere) {
      queueMatching.delete(opp.key);
      queueMatching.delete(key);
      const queued = (k: string) => [...queues.values()].some(l => l.some(x => x.key === k));
      if (oppHere && !queued(opp.key)) queues.set(pool, [opp, ...(queues.get(pool) ?? [])]);
      if (meHere && !queued(key)) {
        queues.set(pool, [...(queues.get(pool) ?? []), { key, identity, rating: me, since: now(), name, catalog }]);
        sock.emit('queue:status', { waiting: true, tc, since: now(), players: queueSize() });
      }
      return { ok: true };
    }
    const white = Math.random() < 0.5;
    room = newRoom({ mode: 'quick', rated, tc, catalog: opp.catalog, creator: key, seats: white ? { w: a, b } : { w: b, b: a } });
  } catch (e) {
    // Création impossible (base qui ne répond pas) : celui qui attendait reprend sa place en tête de file, s'il ne
    // l'a pas quittée ni ne s'est remis en file entre-temps ; l'erreur remonte au demandeur.
    queueMatching.delete(key);
    if (queueMatching.delete(opp.key) && ![...queues.values()].some(l => l.some(x => x.key === opp.key))) {
      queues.set(pool, [opp, ...(queues.get(pool) ?? [])]);
    }
    throw e;
  }
  queueMatching.delete(opp.key);
  queueMatching.delete(key);
  if (io) io.to(`id:${key}`).to(`id:${opp.key}`).emit('queue:matched', { gameId: room.d.id });
  return { ok: true };
}

/** Une entrée de file ne survit pas si elle ne trouve personne en MATCHMAKING.entryTtlMs. */
setInterval(() => {
  for (const [tc, list] of queues) queues.set(tc, list.filter(e => now() - e.since < MATCHMAKING.entryTtlMs));
}, MATCHMAKING.sweepMs).unref();

// ---------------------------------------------------------------------------------------------
// Accueil : deux visiteurs arrivés depuis moins de HOME.pairWindowMs, l'échiquier du haut sous les yeux, jouent l'un
// contre l'autre sur cet échiquier, sans rien demander (retour du fondateur du 7 novembre). Partie amicale, sans
// pendule, mains tirées au hasard comme sur l'accueil (HOME) ; un joueur qui ne joue pas est relayé par l'IA (RELAY).
// Interrupteurs : homeDuel (appariement), homeRelay (relais), guestPlay (invités), newGames (maintenance).

interface HomeVisitor {
  sock: Sock;
  key: string;
  since: number;
  tz: string;
  ready: boolean;
  /** « Chercher un vrai joueur » : apparié quel que soit le temps passé sur la page. */
  searching: boolean;
}
/** Fenêtre d'arrivée : au-delà, le visiteur joue contre l'Oracle, on ne vient plus le chercher (HOME.pairWindowMs). */
export const HOME_WINDOW_MS = HOME.pairWindowMs;
const homeVisitors = new Map<string, HomeVisitor>();

/**
 * Ce visiteur peut-il être apparié sur l'accueil ? Non si le duel de l'accueil est coupé (homeDuel), en maintenance
 * (newGames), ou pour un invité si le jeu sans compte est coupé (guestPlay) : ses messages home:* sont ignorés.
 */
const homeAllowed = (sock: Sock) => !creationRefusal({ mode: 'quick', rated: false, relay: true }, sock.data.identity);

function pairHomeVisitors() {
  const t = now();
  for (const [id, v] of homeVisitors) if (!v.searching && t - v.since > HOME_WINDOW_MS) homeVisitors.delete(id);
  const ready = [...homeVisitors.values()].filter(v => v.ready || v.searching).sort((a, b) => a.since - b.since);
  while (ready.length >= 2) {
    const a = ready.shift()!;
    // Jamais contre soi-même (deux onglets du même navigateur)
    const i = ready.findIndex(v => v.key !== a.key);
    if (i < 0) break;
    const b = ready.splice(i, 1)[0];
    homeVisitors.delete(a.sock.id);
    homeVisitors.delete(b.sock.id);
    void startHomeGame(a, b).catch(e => console.error('Partie de l’accueil :', e));
  }
}

async function startHomeGame(a: HomeVisitor, b: HomeVisitor) {
  const [sa, sb] = await Promise.all([seatFor(a.sock.data.identity, HOME.guestName), seatFor(b.sock.data.identity, HOME.guestName)]);
  const aWhite = Math.random() < 0.5;
  // Sans pendule (HOME.timed est toujours faux : jamais de pendule sur l'accueil).
  const room = newRoom({ mode: 'quick', rated: false, tc: 'none', catalog: HOME.catalog, creator: a.key, seats: aWhite ? { w: sa, b: sb } : { w: sb, b: sa }, deal: true, relay: true });
  a.sock.emit('home:paired', { gameId: room.d.id, color: aWhite ? 'w' : 'b', opponent: { country: countryOfTimezone(b.tz) } });
  b.sock.emit('home:paired', { gameId: room.d.id, color: aWhite ? 'b' : 'w', opponent: { country: countryOfTimezone(a.tz) } });
}

// ---------------------------------------------------------------------------------------------
// Socket.IO

const guestNameSchema = z.string().trim().min(GUEST_NAME.min).max(GUEST_NAME.max).regex(GUEST_NAME.chars);

/** Choix des cartes (`game:draft`) : le contenu des cartes est vérifié ensuite contre la réserve (draftRefusal). */
const draftSchema = z.object({
  id: z.string().max(32),
  cards: z.array(z.string().max(32)).max(BOUNDS.cardsPerPlayer[1]),
  confirm: z.boolean().optional(),
});

function limiter() {
  let tokens: number = LIMITS.socketBurst;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(LIMITS.socketBurst, tokens + ((t - last) / 1000) * LIMITS.socketPerSecond);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

const freeSeat = (room: Room): Color | null => (!room.d.seats.w ? 'w' : !room.d.seats.b ? 'b' : null);

/**
 * Assise d'un visiteur qui rejoint une partie (game:join) : sa couleur s'il y joue déjà ; sinon, sur une invitation
 * en attente, le siège libre. Le siège est relu en base (seatFor) PUIS l'assise est revérifiée : si un autre visiteur
 * s'est assis entre-temps (ou ce même compte, depuis un autre onglet), ou si la partie a commencé, il la regarde en
 * spectateur au lieu d'écraser le siège. Renvoie sa couleur, null (spectateur), 'needName' (invité sans pseudo
 * valable), 'guestOff' (invité, jeu sans compte coupé) ou 'off' (s'asseoir lancerait une partie que creationRefusal
 * refuse : maintenance, ou sorte de partie coupée). Exportée pour les tests.
 */
export async function takeSeat(room: Room, identity: Identity, p: { name?: string; sit?: boolean }): Promise<Color | null | 'needName' | 'guestOff' | 'off'> {
  const color = colorOf(room, identity);
  if (color || room.d.status !== 'waiting' || p.sit === false || !freeSeat(room)) return color;
  let name: string | undefined;
  // Jeu sans compte coupé (FEATURE_GUEST_PLAY=0) : un invité ne s'assoit pas.
  if (!identity.user && !FEATURES.guestPlay) return 'guestOff';
  // Maintenance (FEATURE_NEW_GAMES=0) ou sorte de partie coupée (FEATURE_INVITES=0…) : une invitation déjà en attente
  // (reprise au démarrage) ne lance pas de nouvelle partie. Au défaut, tout est ouvert.
  if (creationRefusal(room.d, identity)) return 'off';
  if (!identity.user) {
    const parsed = guestNameSchema.safeParse(p.name ?? '');
    if (!parsed.success) return 'needName';
    name = parsed.data;
  }
  const seat = await seatFor(identity, name);
  const again = colorOf(room, identity);
  if (again) return again;
  const free = freeSeat(room);
  if (room.d.status !== 'waiting' || !free) return null;
  room.d.seats[free] = seat;
  begin(room);
  broadcast(room, { type: 'start' });
  return free;
}

/** Spectateurs d'une salle : ses sockets qui ne jouent pas (contre l'IA, onglets en double, joueur déconnecté compris). */
export function spectatorCount(room: Room): number {
  let n = 0;
  for (const s of room.sockets) if (!colorOf(room, s.data.identity)) n++;
  return n;
}

function updatePresence(room: Room) {
  if (room.d.status !== 'active') return;
  let changed = false;
  for (const c of COLORS) {
    const seat = room.d.seats[c];
    if (!seat || seat.kind === 'bot') continue;
    const online = [...room.sockets].some(s => keyOf(s.data.identity) === seat.key);
    if (online && room.away[c] !== null) { room.away[c] = null; changed = true; }
    if (!online && room.away[c] === null) { room.away[c] = now(); changed = true; }
  }
  if (changed) broadcast(room, { type: 'sync' });
  if (changed && room.d.relay) armRelay(room);
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
    // Onglet d'une autre version du site : prévenu (server:outdated, le client recharge), et chacune de ses actions
    // est refusée (code 'outdated') jusqu'au rechargement.
    if (protocolMismatch(sock.handshake.auth)) {
      sock.emit('server:outdated', { version: PROTOCOL_VERSION });
      sock.use(([, ...args], _next) => {
        const ack = args.at(-1);
        if (typeof ack === 'function') (ack as (r: Ack) => void)(OUTDATED);
      });
      return;
    }
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
        if (!color) return ack({ ok: false, error: 'Vous ne jouez pas dans cette partie.' });
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
      const seated = await takeSeat(room, identity, p);
      if (seated === 'needName') return ack({ ok: true, needName: true, view: viewFor(room, null) });
      // Invité qui ne peut pas s'asseoir (guestPlay coupé), assise qui lancerait une partie refusée (maintenance, sorte
      // de partie coupée), ou spectateur alors que les parties en direct sont coupées (live) : refusé, il ne reste pas
      // dans la salle.
      const refuse = (r: Ack) => {
        room.sockets.delete(sock);
        joined.delete(room);
        void sock.leave(`game:${room.d.id}`);
        ack(r);
      };
      if (seated === 'guestOff') return refuse(featureOff('guestPlay'));
      if (seated === 'off') return refuse(creationRefusal(room.d, identity)!);
      if (!seated && !FEATURES.live) return refuse(featureOff('live'));
      updatePresence(room);
      ack({ ok: true, view: viewFor(room, seated) });
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
      withRoom(p?.id, ack, (room, color) => {
        // Un joueur relayé qui joue lui-même reprend la main
        const took = takeOver(room, color);
        const r = applyMove(room, color, Number(p.from), Number(p.to), p.promo);
        if (took && !r.ok) {
          broadcast(room, { type: 'sync' });
          armRelay(room);
        }
        return r;
      }));

    sock.on('game:activity', p => {
      if (!allow()) return;
      const room = [...joined].find(r => r.d.id === String(p?.id ?? ''));
      const color = room ? colorOf(room, identity) : null;
      if (!room || !color || !room.d.relay) return;
      room.activityAt[color] = now();
      if (!room.d.standIn?.[color]) armRelay(room);
    });

    sock.on('game:takeover', (p, ack) =>
      withRoom(p?.id, ack, room => {
        const color = colorOf(room, identity)!;
        if (takeOver(room, color)) {
          broadcast(room, { type: 'sync' });
          armRelay(room);
        }
        return { ok: true };
      }));

    sock.on('game:card', (p, ack) =>
      withRoom(p?.id, ack, (room, color) => {
        const targets = Array.isArray(p.targets) ? p.targets.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 64) : [];
        const took = takeOver(room, color);
        const r = applyCard(room, color, Number(p.index), targets);
        if (took && !r.ok) {
          broadcast(room, { type: 'sync' });
          armRelay(room);
        }
        return r;
      }));

    sock.on('game:draft', (p, ack) => {
      const parsed = draftSchema.safeParse(p);
      if (!parsed.success) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Choix de cartes invalide.' });
        return;
      }
      const { id, cards, confirm } = parsed.data;
      return withRoom(id, ack, (room, color) => applyDraft(room, color, cards, confirm !== false));
    });

    sock.on('game:resign', (p, ack) => withRoom(p?.id, ack, (room, color) => resignRoom(room, color)));

    sock.on('game:abort', (p, ack) => withRoom(p?.id, ack, room => abortRoom(room)));

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
          if (!isStarted(d.state)) return { ok: false, error: 'Jouez au moins un coup chacun.' };
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
        if (room.d.status !== 'active' || since === null || now() - since < TIMINGS.claimAfterMs) {
          return { ok: false, error: "Votre adversaire peut encore revenir." };
        }
        // Départ pendant le choix des cartes ou avant le premier coup : la partie sera annulée (délai du premier coup),
        // pas gagnée.
        if (room.d.draft || !room.d.started) {
          return { ok: false, error: 'La partie n’a pas commencé : elle sera annulée si votre adversaire ne revient pas.' };
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
        if (rematchExpired(room)) return { ok: false, error: 'La revanche n’est plus possible.' };
        // Une revanche est une nouvelle partie : refusée si sa sorte (ou toute création) est coupée. Sa sorte est celle
        // que crée createRematch : même mode, même classement, jamais relayée (revanche d'une partie de l'accueil :
        // partie amicale).
        const off = creationRefusal({ mode: d.mode, rated: d.rated }, identity);
        if (off) return off;
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
        // Pouvoirs ou Sans cartes ; le Duel (ancien client) et les valeurs inconnues sont ramenés aux Pouvoirs.
        ack(await joinQueue(sock, String(p?.tc ?? ''), p?.rated !== false, p?.name, offeredCatalog(p?.catalog)));
      } catch (e) {
        console.error('File classée :', e);
        ack({ ok: false, error: 'Erreur serveur, réessaie.' });
      }
    });

    sock.on('queue:leave', () => {
      quitQueue(myKey);
      sock.emit('queue:status', { waiting: false, tc: null, since: null, players: queueSize() });
    });

    sock.on('home:hello', p => {
      if (!allow() || !homeAllowed(sock)) return;
      const prev = homeVisitors.get(sock.id);
      homeVisitors.set(sock.id, { sock, key: myKey, since: now(), tz: String(p?.tz ?? '').slice(0, 64), ready: !!p?.ready, searching: !!prev?.searching });
      pairHomeVisitors();
    });
    sock.on('home:search', p => {
      if (!allow() || !homeAllowed(sock)) return;
      const v = homeVisitors.get(sock.id);
      if (v) v.searching = !!p?.search;
      else if (p?.search) homeVisitors.set(sock.id, { sock, key: myKey, since: now(), tz: String(p?.tz ?? '').slice(0, 64), ready: false, searching: true });
      if (p?.search) pairHomeVisitors();
    });
    sock.on('home:ready', p => {
      if (!allow() || !homeAllowed(sock)) return;
      const v = homeVisitors.get(sock.id);
      if (!v) return;
      v.ready = !!p?.ready;
      if (v.ready) pairHomeVisitors();
    });
    sock.on('home:bye', () => {
      homeVisitors.delete(sock.id);
    });

    sock.on('disconnect', async () => {
      homeVisitors.delete(sock.id);
      for (const room of joined) {
        room.sockets.delete(sock);
        updatePresence(room);
      }
      try {
        const others = await io.in(`id:${myKey}`).fetchSockets();
        if (!others.length) quitQueue(myKey);
      } catch {
        quitQueue(myKey);
      }
    });
  });

  // Ménage : parties terminées sans spectateur, invitations jamais acceptées. Une fin de partie pas encore enregistrée
  // (base injoignable au-delà des essais de persistResult) n'est jamais évincée : relue en base, elle y serait encore
  // en cours. Son enregistrement est relancé ici jusqu'au retour de la base.
  setInterval(() => {
    for (const [id, room] of rooms) {
      const d = room.d;
      if (room.resultPending && !room.persisting) void persistResult(room);
      if (d.status === 'ended' && !room.resultPending && !room.sockets.size && now() - room.endedAt > TIMINGS.endedRoomEvictMs) rooms.delete(id);
      if (d.status === 'waiting' && now() - d.createdAt > TIMINGS.inviteTtlMs) endGame(room, { winner: null, reason: 'aborted' });
      if (d.status !== 'active') continue;
      const humans = COLORS.filter(c => d.seats[c] && d.seats[c]!.kind !== 'bot');
      const allAway = humans.every(c => room.away[c] !== null);
      const awayFor = Math.min(...humans.map(c => now() - (room.away[c] ?? now())));
      // Contre l'IA, le joueur parti depuis TIMINGS.botIdleMs : partie annulée
      if (d.mode === 'bot' && allAway && awayFor > TIMINGS.botIdleMs) endGame(room, { winner: null, reason: 'aborted' });
      // Sans pendule, aucune action depuis TIMINGS.untimedIdleMs : partie annulée
      else if (!d.clock && now() - (d.lastActivity ?? d.createdAt) > TIMINGS.untimedIdleMs) endGame(room, { winner: null, reason: 'aborted' });
    }
  }, TIMINGS.housekeepingMs).unref();
}

/** Compte supprimé : ses parties en cours se terminent et ses sièges deviennent anonymes. */
export async function detachUser(userId: string) {
  for (const room of rooms.values()) {
    for (const c of COLORS) {
      const seat = room.d.seats[c];
      if (seat?.userId !== userId) continue;
      // Pendant le choix des cartes, la partie est annulée (sans effet sur le classement).
      if (room.d.status === 'active' && !room.d.draft) endGame(room, { winner: opposite(c), reason: 'abandon' });
      else if (room.d.status !== 'ended') endGame(room, { winner: null, reason: 'aborted' });
      // Siège anonymisé comme celui d'un invité : sans le roi, le sceau ni les sorts du compte supprimé.
      room.d.seats[c] = {
        ...seat, kind: 'guest', userId: null, username: null, name: 'Compte supprimé', skin: DEFAULT_SKIN, king: DEFAULT_KING, seal: null,
      };
      scheduleSave(room);
    }
  }
}

/**
 * Sauvegarde immédiate de toutes les parties en cours (arrêt du serveur). La pendule en marche est figée : le
 * temps réfléchi avant l'arrêt reste décompté, seul le temps d'arrêt ne l'est pas (`resumeClock`). Une fin de partie
 * pas encore enregistrée (persistResult en attente d'un nouvel essai) l'est ici, classement compris (saveResult :
 * jamais deux fois, ratings_applied).
 */
export async function flushRooms() {
  await Promise.all([...rooms.values()].filter(r => r.d.status !== 'ended' || r.saveTimer || r.resultPending).map(r => {
    if (r.saveTimer) clearTimeout(r.saveTimer);
    r.saveTimer = null;
    if (r.d.status === 'active') settleClock(r.d);
    if (r.d.status === 'ended' && r.resultPending) {
      return saveResult(r).then(
        () => { r.resultPending = false; },
        e => console.error(`Fin de partie ${r.d.id} non enregistrée à l'arrêt :`, e),
      );
    }
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

/** Niveau de l'IA demandé (BOT_LEVELS) : une union de littéraux, comme avant (même message d'erreur). */
const botLevelSchema = z.union(BOT_LEVELS.map(l => z.literal(l)) as unknown as [z.ZodLiteral<BotLevel>, ...z.ZodLiteral<BotLevel>[]]);

const createLimiter = rateLimit({
  windowMs: LIMITS.createWindowMs,
  limit: LIMITS.createPerWindow,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de parties créées, patiente quelques minutes.' },
});

gamesRouter.post('/', createLimiter, async (req, res) => {
  const parsed = z
    .object({
      mode: z.enum(['invite', 'bot']),
      tc: z.string().refine(id => OFFERED_CONTROLS.includes(id), 'Cadence inconnue.'),
      color: z.enum(['w', 'b', 'random']).default('random'),
      level: botLevelSchema.optional(),
      // Mode miroir : plus proposé (chacun choisit ses cartes) ; accepté des anciens clients et ignoré.
      mirror: z.boolean().optional(),
      // Le Duel n'est plus proposé : une demande Duel (ancien client) est ramenée aux Pouvoirs ; une valeur
      // inconnue est refusée.
      catalog: z
        .enum(CATALOG_IDS, { message: 'Catalogue de cartes inconnu.' })
        .default(DEFAULT_CATALOG)
        .transform(offeredCatalog),
      name: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' });
  const o = parsed.data;
  const identity = req.identity;
  const off = creationRefusal({ mode: o.mode, rated: false }, identity);
  if (off) return res.status(503).json({ error: off.error, code: off.code });
  const open = [...rooms.values()].filter(r => r.d.status !== 'ended' && r.d.creator === keyOf(identity)).length;
  if (open >= LIMITS.maxOpenRooms) {
    return res.status(429).json({ error: 'Vous avez déjà trop de parties ouvertes : terminez-en ou annulez-en une.' });
  }
  let name: string | undefined;
  if (!identity.user) {
    const n = guestNameSchema.safeParse(o.name ?? '');
    if (!n.success) return res.status(400).json({ error: GUEST_NAME.invalid });
    name = n.data;
  }
  const me = await seatFor(identity, name);
  const color: Color = o.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : o.color;
  const other = o.mode === 'bot' ? botSeat(o.level ?? DEFAULT_BOT_LEVEL) : null;
  const seats = color === 'w' ? { w: me, b: other } : { w: other, b: me };
  const room = newRoom({ mode: o.mode, rated: false, tc: o.tc, catalog: o.catalog, creator: keyOf(identity), seats });
  await saveRoom(room);
  res.json({ id: room.d.id });
});

/** Parties en cours du visiteur (pour les reprendre). */
/** Parties en cours, pour les spectateurs (« Parties en direct »). Les parties entre humains d'abord. */
gamesRouter.get('/live', (_req, res) => {
  if (!FEATURES.live) {
    const off = featureOff('live');
    return res.status(503).json({ error: off.error, code: off.code });
  }
  const list = [...rooms.values()]
    .filter(r => r.d.status === 'active' && r.d.started)
    .map(r => ({
      id: r.d.id,
      mode: r.d.mode,
      rated: r.d.rated,
      tc: r.d.tc,
      catalog: roomCatalog(r.d),
      white: r.d.seats.w?.name ?? null,
      black: r.d.seats.b?.name ?? null,
      whiteRating: r.d.seats.w?.rating ?? null,
      blackRating: r.d.seats.b?.rating ?? null,
      vsBot: r.d.seats.w?.kind === 'bot' || r.d.seats.b?.kind === 'bot',
      plies: r.d.state.ply,
      spectators: spectatorCount(r),
      lastActivity: r.d.lastActivity ?? r.d.createdAt,
    }))
    .sort((a, b) => Number(a.vsBot) - Number(b.vsBot) || (b.whiteRating ?? 0) + (b.blackRating ?? 0) - ((a.whiteRating ?? 0) + (a.blackRating ?? 0)))
    .slice(0, LIMITS.liveList);
  res.json({ games: list });
});

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
      rated: r.d.rated,
      catalog: roomCatalog(r.d),
      createdAt: r.d.createdAt,
    }));
  res.json({ games: mine });
});

gamesRouter.get('/recent', async (req, res) => {
  const u = req.identity.user;
  if (!u) return res.json({ games: [] });
  const rows = await q(
    `SELECT * FROM games WHERE (white_user_id = $1 OR black_user_id = $1) AND status = 'ended' ORDER BY ended_at DESC NULLS LAST LIMIT ${LIMITS.recentGames}`,
    [u.id],
  );
  res.json({ games: rows.map(toSummary) });
});
