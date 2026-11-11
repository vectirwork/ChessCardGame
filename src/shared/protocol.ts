// Messages échangés entre le navigateur et le serveur (Socket.IO et API).
//
// Contrat entre les deux côtés : ce fichier ne change qu'avec une montée de PROTOCOL_VERSION (garde :
// test/garde-fous/protocole.test.ts et test/fixtures/protocole.json). Tous les champs ajoutés sont facultatifs.

import type { Color, PieceType } from './chess';
import type { CardId } from './cards';
import type { Features } from './config/features';
import type { CardInfo, GameState, MoveInfo, RefusalCode } from './game';
import { LOCALE } from './text/fr';

/**
 * Version du protocole. Le client l'envoie à la connexion du socket (`io({ auth: { v: PROTOCOL_VERSION } })`) et
 * le serveur la renvoie dans /api/me (`MeResponse.version`). En cas d'écart, le serveur émet `server:outdated` et le
 * client recharge la page (une fois par minute au plus). À monter à chaque changement des cartes, des catalogues,
 * des cadences, des règles par défaut ou de la forme des messages.
 */
export const PROTOCOL_VERSION = 1;

/** Cadence en secondes ; null = sans pendule. */
export interface TimeControl {
  initial: number;
  increment: number;
}

/** Une cadence proposée par le site. Ne jamais recycler un identifiant : il est enregistré dans les parties. */
export interface TimeControlDef {
  id: string;
  /** Libellé : « 3 + 2 », « Sans limite ». */
  label: string;
  /** Libellé court (accueil, « Défier un ami ») : « 5 min », « 15 + 10 ». */
  short: string;
  tc: TimeControl | null;
  /** Famille : Bullet, Blitz, Rapide, Libre. */
  family: string;
  /** Proposée dans les files d'attente (classée et amicale). */
  quick?: boolean;
  /** Proposée dans l'invitation de l'accueil (« Défier un ami »). */
  invite?: boolean;
  /** Retirée : plus proposée nulle part, mais encore résolue (revanche, relecture, libellés). */
  archived?: boolean;
}

/** ← Cadences, dans l'ordre d'affichage. */
export const TIME_CONTROLS: TimeControlDef[] = [
  { id: '1+0', label: '1 + 0', short: '1 min', tc: { initial: 60, increment: 0 }, family: 'Bullet' },
  { id: '3+2', label: '3 + 2', short: '3 + 2', tc: { initial: 180, increment: 2 }, family: 'Blitz', quick: true },
  { id: '5+0', label: '5 + 0', short: '5 min', tc: { initial: 300, increment: 0 }, family: 'Blitz', quick: true, invite: true },
  { id: '10+0', label: '10 + 0', short: '10 min', tc: { initial: 600, increment: 0 }, family: 'Rapide', quick: true, invite: true },
  { id: '15+10', label: '15 + 10', short: '15 + 10', tc: { initial: 900, increment: 10 }, family: 'Rapide', quick: true, invite: true },
  { id: 'none', label: 'Sans limite', short: 'Sans limite', tc: null, family: 'Libre', invite: true },
];

/** Cadences des files d'attente (dérivées de `quick`) : 3+2, 5+0, 10+0, 15+10. */
export const QUICK_CONTROLS: string[] = /* @__PURE__ */ TIME_CONTROLS.filter(t => t.quick && !t.archived).map(t => t.id);

/** Cadences de l'invitation de l'accueil (dérivées de `invite`) : 5+0, 10+0, 15+10, sans limite. */
export const INVITE_CONTROLS: string[] = /* @__PURE__ */ TIME_CONTROLS.filter(t => t.invite && !t.archived).map(t => t.id);

/** Cadences proposées à la création d'une partie (Jouer, invitation, IA) : toutes sauf les archivées. */
export const OFFERED_CONTROLS: string[] = /* @__PURE__ */ TIME_CONTROLS.filter(t => !t.archived).map(t => t.id);

/** Cadence choisie par défaut (Jouer, « Défier un ami ») : une cadence de QUICK_CONTROLS (vérifié par test/socle.test.ts). */
export const DEFAULT_QUICK = '10+0';

/** Pendule d'une cadence (archivées comprises) ; null : sans pendule ; undefined : cadence inconnue. */
export function tcFromId(id: string): TimeControl | null | undefined {
  return TIME_CONTROLS.find(t => t.id === id)?.tc;
}

/** Cadence désignée par son identifiant ou par sa pendule (archivées comprises), ou undefined. */
export function tcDef(x: string | TimeControl | null): TimeControlDef | undefined {
  if (typeof x === 'string') return TIME_CONTROLS.find(t => t.id === x);
  if (x === null) return TIME_CONTROLS.find(t => t.tc === null);
  return TIME_CONTROLS.find(t => t.tc && t.tc.initial === x.initial && t.tc.increment === x.increment);
}

/** Minutes d'une pendule : entières telles quelles (« 10 »), sinon au format du site (« 1,5 »). */
function minutes(initial: number): string {
  const m = initial / 60;
  return Number.isInteger(m) ? String(m) : m.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
}

/**
 * Libellé d'une cadence, à partir de son identifiant ou de sa pendule (`null` : sans pendule). Un seul formateur
 * pour tout le site ; chaque style reproduit un usage actuel :
 * - 'label' (défaut) : « 3 + 2 », « Sans limite » ; pendule hors liste : « 7 + 3 » ;
 * - 'short' : « 5 min », « 15 + 10 », « Sans limite » ;
 * - 'family' : « Blitz 3 + 2 », « Sans limite » ;
 * - 'compact' : « 3+2 », « Sans limite » (historique local, en-tête PGN de l'Analyse) ;
 * - 'long' : « 10 min », « 3 min + 2 s par coup », « sans limite de temps ».
 * Un identifiant inconnu est rendu tel quel ; une chaîne vide ou undefined donne une chaîne vide.
 */
export function tcLabel(
  x: string | TimeControl | null | undefined,
  style: 'label' | 'short' | 'family' | 'compact' | 'long' = 'label',
): string {
  if (x === undefined || x === '') return '';
  const def = tcDef(x);
  const tc = typeof x === 'string' ? def?.tc : x;
  if (typeof x === 'string' && !def) return x;
  if (tc === null || tc === undefined) {
    if (style === 'long') return 'sans limite de temps';
    return def?.label ?? 'Sans limite';
  }
  if (style === 'long') {
    const m = initialText(tc.initial);
    return tc.increment ? `${m} + ${tc.increment} s par coup` : m;
  }
  if (style === 'compact') return def?.id ?? `${minutes(tc.initial)}+${tc.increment}`;
  const label = def?.label ?? `${minutes(tc.initial)} + ${tc.increment}`;
  if (style === 'short') return def?.short ?? label;
  if (style === 'family') return def ? `${def.family} ${def.label}` : label;
  return label;
}

/** Temps initial en toutes lettres abrégées : « 10 min », « 30 s », « 1 min 30 s ». */
function initialText(initial: number): string {
  if (initial % 60 === 0) return `${initial / 60} min`;
  if (initial < 60) return `${initial} s`;
  return `${Math.floor(initial / 60)} min ${initial % 60} s`;
}

/** Modes de paiement du serveur (variable PAYMENTS_MODE) : Stripe, simulé (développement), fermé. */
export const PAYMENTS_MODES = ['stripe', 'demo', 'off'] as const;
export type PaymentsMode = (typeof PAYMENTS_MODES)[number];

export type GameMode = 'invite' | 'quick' | 'bot';
export type GameStatus = 'waiting' | 'active' | 'ended';

export interface SeatView {
  kind: 'user' | 'guest' | 'bot';
  name: string;
  username: string | null;
  rating: number | null;
  /** Sorts du joueur (objet skin), pris à l'assise. */
  skin: string;
  /**
   * Roi du joueur (objet king), pris à l'assise et vu de tous : adversaire et spectateurs voient le même roi. Toujours
   * rempli (le serveur normalise : un siège enregistré avant les rois, ou un identifiant inconnu, donne le roi Arcane).
   * En ligne, l'image d'un roi vient uniquement d'ici, jamais de me.equippedKing.
   */
  king: string;
  /** Sceau de collection du joueur (id col:*), pris à l'assise, ou null. */
  seal?: string | null;
  online: boolean;
  level?: number;
}

export interface ClockView {
  initial: number;
  increment: number;
  /** Temps restant en millisecondes au moment `serverNow`. */
  w: number;
  b: number;
  running: Color | null;
  serverNow: number;
  /** Multiplicateur de vitesse (Distorsion temporelle, Sablier fou). */
  rate: Record<Color, number>;
  /** Sablier fou actif : les coups ne rapportent pas d'incrément (le « +2 » est barré). */
  noIncrement?: boolean;
}

/**
 * Phase de choix des cartes (décision D5, docs/PLAN-V2.md), avant le premier coup des parties avec cartes créées
 * par le serveur (invitation, file amicale ou classée, IA lancée depuis la page Jouer, revanche), si DEAL.draft.
 *
 * Déroulement :
 * 1. La partie devient active (deuxième joueur assis) : `GameView.draft` apparaît, `state.hands` est vide pour les
 *    deux camps. Aucun coup ni aucune carte n'est accepté ; pendules et délai du premier coup sont à l'arrêt.
 * 2. Chaque joueur envoie `game:draft` avec `count` cartes différentes de `pool`. Une sélection provisoire
 *    (`confirm: false`) peut être envoyée avant : elle reste secrète et sert seulement à l'échéance.
 * 3. Secret : la vue d'un joueur ne contient que SES cartes (`mine`) ; de l'adversaire, elle ne dit que s'il a
 *    validé (`chosen`). Un spectateur ne voit aucune carte. Événement `draft` à chaque validation.
 * 4. Les deux ont validé, ou l'échéance est passée (le serveur complète au hasard ce qui manque, sélection
 *    provisoire comprise) : `draft` redevient null, les deux mains sont révélées dans `state.hands` (événement
 *    `reveal`), puis la partie se joue comme avant (délai du premier coup, puis pendules).
 * L'IA choisit dès le début de la phase. Abandon ou annulation pendant le choix : partie annulée, sans effet sur
 * le classement. Après un redémarrage du serveur, l'échéance repart entière (DEAL.draftMs).
 */
export interface DraftView {
  /** Réserve, la même pour les deux joueurs, dans l'ordre du catalogue (sans le Sablier fou contre l'IA ou sans pendule). */
  pool: CardId[];
  /** Nombre de cartes à choisir : celui des règles de la partie (rulesOf(state).cardsPerPlayer). */
  count: number;
  /** Échéance, horodatage du serveur (ms). */
  deadline: number;
  /** Temps restant avant l'échéance au moment de l'envoi (ms) : le client y ajoute l'heure de réception. */
  msLeft: number;
  /** Durée totale du choix (ms), pour la barre de temps. Absent (ancien serveur) : DEAL.draftMs. */
  totalMs?: number;
  /** Qui a déjà validé son choix. Jamais les cartes de l'adversaire. */
  chosen: Record<Color, boolean>;
  /**
   * Vos cartes, dans l'ordre choisi : validées si `chosen[you]`, sinon votre sélection provisoire (complétée au
   * hasard à l'échéance). Vide pour un spectateur.
   */
  mine: CardId[];
}

export interface GameView {
  id: string;
  mode: GameMode;
  rated: boolean;
  status: GameStatus;
  seats: Record<Color, SeatView | null>;
  /** Couleur du spectateur, null s'il ne joue pas. */
  you: Color | null;
  /** État complet, public : les mains des deux camps sont visibles de tous (joueurs et spectateurs). */
  state: GameState;
  clock: ClockView | null;
  drawOffer: Color | null;
  /** Revanche : qui l'a proposée, partie suivante ; `deadline` : échéance de la proposition (absente : aucune). */
  rematch: { w: boolean; b: boolean; next: string | null; deadline?: number | null };
  ratingDiff: Record<Color, number> | null;
  /** Échéance pour jouer le premier coup (sinon la partie est annulée). */
  firstMoveDeadline: number | null;
  /** Délai total du premier coup (ms), pour le compte à rebours. Absent (ancien serveur) : 45 s. */
  firstMoveMs?: number;
  /** Heure du serveur à l'envoi (ms), pour corriger les échéances du décalage d'horloge du navigateur. */
  serverNow?: number;
  /** Depuis quand chaque joueur est déconnecté (horodatage serveur). */
  away: Record<Color, number | null>;
  claimAfterMs: number;
  createdAt: number;
  /** Les deux joueurs ont la même main (anciennes parties : le mode miroir n'est plus proposé, le serveur l'ignore). */
  mirror: boolean;
  /** Chaque joueur a joué son premier coup : la partie ne peut plus être annulée. */
  started: boolean;
  /**
   * Partie en direct de l'accueil : l'IA joue pour un joueur qui ne joue pas (relais), jusqu'à ce qu'il reprenne la
   * main. null hors de ces parties.
   */
  standIn?: Record<Color, boolean> | null;
  /** Phase de choix des cartes en cours (voir DraftView), sinon null (choix terminé, sans cartes, ancienne partie). */
  draft: DraftView | null;
}

export type GameEvent =
  | { type: 'move'; color: Color; info: MoveInfo }
  | { type: 'card'; info: CardInfo }
  | { type: 'start' }
  /** Phase de choix : un joueur a validé ses cartes (`color`) ; ses cartes restent secrètes. */
  | { type: 'draft'; color: Color }
  /**
   * Fin du choix : les deux mains sont révélées. `auto` : camps qui n'avaient pas validé à l'échéance ; `filled` :
   * camps qui ont vraiment reçu des cartes au hasard (sélection provisoire incomplète). Absent (ancien serveur) :
   * le client devine d'après `auto`.
   */
  | { type: 'reveal'; auto: Color[]; filled?: Color[] }
  | { type: 'end' }
  | { type: 'sync' };

export interface GameUpdate {
  view: GameView;
  event: GameEvent;
}

export interface JoinReply {
  ok: boolean;
  error?: string;
  /** Nature du refus (voir Ack.code). */
  code?: AckCode;
  needName?: boolean;
  view?: GameView;
}

/**
 * Nature d'un refus, pour que le client réagisse sans lire le texte : code de refus du moteur (RefusalCode, game.ts),
 * 'feature-off' (fonction coupée par un interrupteur), 'outdated' (version du protocole), 'rate-limited'.
 */
export type AckCode = RefusalCode | 'feature-off' | 'outdated' | 'rate-limited';

export interface Ack {
  ok: boolean;
  error?: string;
  /** Nature du refus (AckCode). */
  code?: AckCode;
}

/** Données d'authentification du socket (`io({ auth })`) : la version du protocole du client. */
export interface SocketAuth {
  v?: number;
}

export const EMOTES: Record<string, string> = {
  gg: 'Bien joué !',
  wow: 'Waouh !',
  oops: 'Oups…',
  hi: 'Salut !',
  thanks: 'Merci !',
  luck: 'Bonne chance !',
};

export interface ServerToClient {
  'game:update': (u: GameUpdate) => void;
  'game:emote': (p: { gameId: string; color: Color; key: string }) => void;
  'game:redirect': (p: { from: string; to: string }) => void;
  'queue:matched': (p: { gameId: string }) => void;
  'queue:status': (p: { waiting: boolean; tc: string | null; since: number | null; players: number }) => void;
  /**
   * Accueil : deux visiteurs arrivés depuis moins de 30 s, l'échiquier du haut sous les yeux, jouent l'un contre
   * l'autre. `country` : code pays de l'adversaire, d'après le fuseau horaire de son navigateur (null : inconnu).
   */
  'home:paired': (p: { gameId: string; color: Color; opponent: { country: string | null } }) => void;
  /**
   * Le client parle une autre version du protocole (auth.v à la connexion ≠ PROTOCOL_VERSION) : il doit recharger la
   * page. `version` : celle du serveur.
   */
  'server:outdated': (p: { version: number }) => void;
}

export interface ClientToServer {
  'game:join': (p: { id: string; name?: string; sit?: boolean }, ack: (r: JoinReply) => void) => void;
  'game:leave': (p: { id: string }) => void;
  'game:move': (p: { id: string; from: number; to: number; promo?: PieceType }, ack: (r: Ack) => void) => void;
  'game:card': (p: { id: string; index: number; targets: number[] }, ack: (r: Ack) => void) => void;
  /**
   * Choix des cartes (phase de choix, voir DraftView). `cards` : identifiants de cartes de la réserve, différents.
   * - `confirm` absent ou vrai : exactement `count` cartes (DraftView), choix définitif. Idempotent : renvoyer les
   *   mêmes cartes répond ok ; un autre choix après validation est refusé.
   * - `confirm: false` : sélection provisoire de 0 à `count` cartes, secrète, complétée au hasard à l'échéance si le
   *   joueur n'a pas validé.
   * Refusé hors phase de choix, pour un spectateur, ou si les cartes sont invalides.
   */
  'game:draft': (p: { id: string; cards: string[]; confirm?: boolean }, ack: (r: Ack) => void) => void;
  'game:resign': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:abort': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:draw': (p: { id: string; action: 'offer' | 'accept' | 'decline' }, ack: (r: Ack) => void) => void;
  'game:claim': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:rematch': (p: { id: string }, ack: (r: Ack) => void) => void;
  'game:emote': (p: { id: string; key: string }) => void;
  /**
   * rated : partie classée (comptes) ; sinon file amicale ouverte aux invités (name = pseudo).
   * catalog : 'climats' (Pouvoirs, par défaut) ou 'aucune' ; toute autre valeur, 'duel' compris, est ramenée
   * à 'climats'.
   */
  'queue:join': (p: { tc: string; rated?: boolean; name?: string; catalog?: string }, ack: (r: Ack) => void) => void;
  'queue:leave': () => void;
  /**
   * Accueil : le visiteur arrive (`tz` : fuseau horaire du navigateur) ; `ready` : il peut être apparié (échiquier du
   * haut sous les yeux, partie contre l'Oracle à peine commencée). Ensuite `home:ready` à chaque changement.
   */
  'home:hello': (p: { tz: string; ready: boolean }) => void;
  'home:ready': (p: { ready: boolean }) => void;
  'home:bye': () => void;
  /** Accueil : chercher un vrai joueur (sans limite de temps depuis l'arrivée), ou arrêter de chercher. */
  'home:search': (p: { search: boolean; tz: string }) => void;
  /** Partie en direct : le joueur est là (il touche l'échiquier) ; l'IA attend avant de jouer pour lui. */
  'game:activity': (p: { id: string }) => void;
  /** Partie en direct : le joueur reprend la main, l'IA cesse de jouer pour lui. */
  'game:takeover': (p: { id: string }, ack: (r: Ack) => void) => void;
}

/** Utilisateur connecté, tel que renvoyé par /api/me. */
export interface MeUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  equippedSkin: string;
  equippedBoard: string;
  equippedKing: string;
  items: string[];
  isAdmin: boolean;
  createdAt: string;
}

/**
 * Équiper (POST /api/account/equip) : un objet, ou un essai entier (au plus un objet par emplacement). Les anciens
 * clients envoient `{ itemId }`.
 */
export type EquipRequest = { itemId: string } | { itemIds: string[] };

/**
 * Payer (POST /api/shop/checkout) : un produit (objet, collection « à compléter », pack) ou un panier d'essai
 * (`itemIds`, au plus un objet par emplacement). `equip` : équiper ce qui est livré, dès la livraison.
 */
/**
 * Paiement d'un produit ou d'un panier d'objets. `equip` n'équipe que les objets livrés par l'achat (payés) ; les objets
 * déjà possédés ou offerts de l'essai s'équipent côté client, au retour d'un paiement réussi (boutique, Delivery).
 */
export type CheckoutRequest = ({ productId: string } | { itemIds: string[] }) & { waiver: true; equip?: boolean };

export interface MeResponse {
  user: MeUser | null;
  guestId: string;
  payments: PaymentsMode;
  appName: string;
  /** Interrupteurs du serveur (défauts fusionnés avec FEATURE_*). Absent (ancien serveur) : FEATURES. */
  features?: Features;
  /** PROTOCOL_VERSION du serveur. */
  version?: number;
}

export interface GameSummary {
  id: string;
  mode: GameMode;
  rated: boolean;
  status: GameStatus;
  white: string | null;
  black: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  winner: Color | 'draw' | null;
  reason: string | null;
  timeControl: string;
  createdAt: string;
  plies: number;
}

// ---------------------------------------------------------------------------------------------
// Réponses lues par la boutique, le compte, le profil et le classement. Contrat entre le serveur (lot A des skins :
// account.ts, shop.ts) et les pages (lot E : Shop, DemoCheckout, Account, Profile, Leaderboard) : les mêmes noms de
// champs des deux côtés. Les champs notés « lot A » ne sont pas encore renvoyés par le serveur du lot 0.

/** Statut d'un achat (`purchases.status`). */
export type PurchaseStatus = 'pending' | 'paid' | 'refunded' | 'failed';

/**
 * `productId` (`purchases.product_id`) d'un panier d'essai payé en une fois (lot A) : il ne correspond à aucun produit
 * du catalogue (`productById` renvoie undefined), les objets achetés sont dans `items`.
 */
export const CART_PRODUCT_ID = 'panier';

/** Profil public d'un joueur (GET /api/users/:username). */
export interface PublicProfile {
  username: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Sorts équipés (objet skin). */
  skin: string;
  /** Échiquier équipé (objet board). Lot A. */
  board: string;
  /** Roi équipé (objet king), normalisé comme en partie : identifiant inconnu → roi Arcane. Lot A. */
  king: string;
  /** Sceau de collection (`sealOf` des objets possédés, id col:*), ou null. Lot A. */
  seal: string | null;
  /** Date d'inscription (ISO 8601). */
  memberSince: string;
  /** Rang au classement ; null sans partie classée. */
  rank: number | null;
}

export interface ProfileResponse {
  profile: PublicProfile;
  games: GameSummary[];
}

/** Ligne du classement (GET /api/leaderboard). Noms des colonnes SQL, gardés tels quels. */
export interface LeaderboardRow {
  username: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  /** Sceau de collection du joueur (`sealOf`, id col:*), ou null. Lot A. */
  seal: string | null;
}

export interface LeaderboardResponse {
  players: LeaderboardRow[];
}

/** Ligne de l'historique des achats (GET /api/account/purchases ; sans les achats en attente). Noms des colonnes SQL. */
export interface PurchaseRecord {
  id: string;
  /** Produit acheté (retiré compris : `productById` le résout), ou CART_PRODUCT_ID : le libellé se déduit d'`items`. */
  product_id: string;
  /** Objets livrés par cet achat : ceux du produit, de la collection complétée ou du panier. */
  items: string[];
  provider: 'stripe' | 'demo';
  /** Montant facturé (centimes TTC) : prix « compléter » d'une collection, total d'un panier. */
  amount_cents: number;
  currency: string;
  status: Exclude<PurchaseStatus, 'pending'>;
  /** ISO 8601. */
  created_at: string;
  paid_at: string | null;
}

export interface PurchasesResponse {
  purchases: PurchaseRecord[];
}

/** Achat simulé (mode démo, GET /api/shop/demo/:id), lu par la page de paiement simulé. */
export interface DemoPurchase {
  id: string;
  /** Produit, ou CART_PRODUCT_ID pour un panier. */
  productId: string;
  /** Objets de l'achat : la page les montre d'ici, sans passer par le produit (un panier n'en a pas). */
  items: string[];
  /** Montant facturé (centimes TTC), celui que la page affiche. */
  amountCents: number;
  status: PurchaseStatus;
}

/** Retour de Stripe (GET /api/shop/confirm/:sessionId) : de quoi afficher le déballage. */
export interface ConfirmResponse {
  status: PurchaseStatus;
  productId: string;
  items: string[];
  user: MeUser;
}

/** Paiement simulé réussi (mode démo, POST /api/shop/demo/:id/complete). */
export interface DemoCompleteResponse {
  ok: true;
  productId: string;
  items: string[];
  user: MeUser;
}
