// Réglages du serveur, nommés : délais, classement, appariement, relais, IA, limites, comptes, interrupteurs.
// Lus par games.ts, rating.ts, auth.ts, index.ts, bot-pool.ts et db.ts (aucun de ces nombres n'y est recopié) ; les
// tests les importent. Les durées couplées au client sont dans src/shared/config/timings.ts, les règles du jeu dans
// src/shared/config/rules.ts, la configuration lue dans l'environnement dans config.ts.

import type { BotLevel } from '../shared/bot';
import { FEATURES as FEATURE_DEFAULTS, FEATURE_KEYS, featureEnvName } from '../shared/config/features';
import type { Features } from '../shared/config/features';
import { DEAL, deepFreeze } from '../shared/config/rules';
import type { DealSettings } from '../shared/config/rules';
import { BOT_CARD_PAUSE_MS, BOT_TIMEOUT_MS, CINEMATIC_MS } from '../shared/config/timings';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Délais des parties (ms). */
export const TIMINGS = Object.freeze({
  /** Personne n'a joué son premier coup : la partie est annulée (aussi pour une partie en direct de l'accueil). */
  firstMoveMs: 45_000,
  /** Adversaire déconnecté depuis ce délai : la victoire peut être réclamée (envoyé au client : claimAfterMs). */
  claimAfterMs: 60_000,
  /** Partie contre l'IA abandonnée par le joueur humain : annulée. */
  botIdleMs: 30 * MIN,
  /** Partie sans pendule sans aucune action : annulée. */
  untimedIdleMs: 3 * DAY,
  /** Invitation jamais acceptée : annulée. */
  inviteTtlMs: 3 * DAY,
  /** Partie terminée sans spectateur : retirée de la mémoire. */
  endedRoomEvictMs: 10 * MIN,
  /** Période du ménage des parties. */
  housekeepingMs: 60_000,
  /** Échéance d'une proposition de revanche ; null : aucune (elle vit tant que la salle est en mémoire). */
  rematchTtlMs: null as number | null,
  /** Regroupement des sauvegardes d'une partie. */
  saveDebounceMs: 250,
  /** Marge de la minuterie du drapeau (temps écoulé). */
  flagMarginMs: 30,
  /** Demi-coups au-delà desquels la partie a commencé (plus d'annulation possible). */
  minPlyToStart: 2,
  /** Cinématiques des Pouvoirs rendues à la pendule (partagé avec le client). */
  cinematicMs: CINEMATIC_MS,
});

/** Classement Elo. */
export const RATING = Object.freeze({
  /** Classement de départ d'un compte (et d'un invité dans la file). Le DEFAULT SQL de la migration 1 reste 1200. */
  initial: 1200,
  /** Facteur K : 40 pendant les `provisionalGames` premières parties classées, puis 20. */
  kProvisional: 40,
  kEstablished: 20,
  provisionalGames: 30,
  /** Échelle de la formule Elo. */
  scale: 400,
  /** Classement minimal. */
  floor: 100,
});

/** File d'attente (parties rapides, classées ou amicales). */
export const MATCHMAKING = Object.freeze({
  /** Partie classée : écart de classement accepté au départ… */
  baseTolerance: 250,
  /** … élargi de tant de points par seconde d'attente. */
  tolerancePerSecond: 25,
  /** Une entrée qui ne trouve personne est oubliée après ce délai. */
  entryTtlMs: 10 * MIN,
  /** Période du balayage des entrées oubliées. */
  sweepMs: 30_000,
  /** Files séparées par catalogue (Pouvoirs, Sans cartes). */
  splitByCatalog: true,
  /** Pseudo d'un invité anonyme dans la file amicale : « Anonyme-1000 » à « Anonyme-9999 ». */
  anonymousPrefix: 'Anonyme-',
  anonymousMin: 1000,
  anonymousMax: 9999,
});

/** Relais de l'IA dans les parties en direct de l'accueil. */
export const RELAY = Object.freeze({
  /** Joueur qui n'a pas encore joué : l'IA joue pour lui après ce délai. */
  firstMoveMs: 10_000,
  /** Ensuite : après ce délai sans le moindre signe de présence. */
  idleMs: 30_000,
  /** Les deux joueurs partis : la partie est annulée après ce délai. */
  abandonMs: 30_000,
  /** Temps de jeu de l'IA pour un joueur relayé : minimum, plus un aléa. */
  delayMinMs: 900,
  delayJitterMs: 700,
  /** Niveau de l'IA qui joue en relais (games.ts : RELAY_LEVEL). Indépendant du niveau de l'Oracle (HOME.botLevel). */
  level: 2 as BotLevel,
});

/** L'IA du serveur. */
export const BOT_RUNTIME = Object.freeze({
  /** Pause avant de jouer, pour un rythme naturel : minimum, plus un aléa (calcul compris). */
  pauseMinMs: 500,
  pauseJitterMs: 500,
  /** Pause entre la carte de l'IA et son coup (ou sa carte suivante) : le temps de l'animation. */
  cardPauseMs: BOT_CARD_PAUSE_MS,
  /** Relance quand l'IA doit rejouer. */
  retryMs: 50,
  /** Échecs consécutifs avant de jouer un coup légal au hasard. */
  maxFailures: 3,
  /** Fils de calcul : au plus tant, et au plus le nombre de processeurs moins un. */
  maxThreads: 4,
  /** Délai maximal d'une décision. */
  timeoutMs: BOT_TIMEOUT_MS,
});

/** Base PostgreSQL (DATABASE_URL ; la base embarquée PGlite n'a pas de pool). */
export const DATABASE = Object.freeze({
  /** Connexions ouvertes au plus (variable DATABASE_POOL_MAX). */
  poolMax: 10,
  /** Ouverture d'une connexion : échec au-delà de ce délai (base injoignable) au lieu d'une attente sans fin. */
  connectionTimeoutMs: 10_000,
});

/**
 * Fils de calcul de l'IA (bot-pool.ts) : un fil mort est remplacé ; au-delà de `maxRestarts` remplacements en
 * `restartWindowMs`, plus de remplacement, et le calcul se fait dans le processus quand il ne reste aucun fil.
 */
export const BOT_THREADS = Object.freeze({
  maxRestarts: 5,
  restartWindowMs: 60_000,
});

/**
 * Enregistrement d'une fin de partie (résultat et classement, en une transaction) : essais si la base ne répond pas,
 * et délai entre deux. Le classement n'est jamais appliqué deux fois (ratings_applied).
 */
export const PERSIST = Object.freeze({
  attempts: 5,
  retryMs: 5_000,
});

/** Limites d'usage. */
export const LIMITS = Object.freeze({
  /** Parties non terminées par créateur. */
  maxOpenRooms: 8,
  /** Messages d'un socket : réserve de jetons et recharge par seconde. */
  socketBurst: 20,
  socketPerSecond: 8,
  /** Créations de parties par adresse : tant par fenêtre. */
  createPerWindow: 40,
  createWindowMs: 10 * MIN,
  /** Connexions et inscriptions par adresse : tant par fenêtre en production (1000 en développement). */
  authPerWindow: 30,
  authPerWindowDev: 1000,
  authWindowMs: 10 * MIN,
  /** Paiements par adresse et par minute. */
  checkoutPerMinute: 15,
  /** Taille maximale d'un corps JSON, et du webhook de Stripe. */
  jsonBody: '100kb',
  webhookBody: '1mb',
  /** Socket.IO : intervalle et délai du ping. */
  pingIntervalMs: 10_000,
  pingTimeoutMs: 8_000,
  /** Longueur des listes : parties en direct, parties récentes, classement, parties d'un profil, achats. */
  liveList: 40,
  recentGames: 30,
  leaderboard: 100,
  profileGames: 20,
  purchases: 100,
  /** Tableau de bord de l'administration : joueurs, achats, jours de statistiques. */
  adminUsers: 50,
  adminPurchases: 15,
  adminDays: 30,
});

/** Comptes et identité. */
export const ACCOUNT = Object.freeze({
  /** Durée d'une session (prolongée au plus une fois par jour). */
  sessionDays: 30,
  /** Durée du cookie d'invité. */
  guestCookieDays: 365,
  /** Validité du lien de vérification de l'adresse e-mail, et du lien de réinitialisation du mot de passe. */
  verifyTokenMs: 3 * DAY,
  resetTokenMs: 1 * HOUR,
});

/**
 * Interrupteurs lus dans l'environnement : FEATURE_<NOM>=0 (ou false, off, non) coupe, 1 (ou true, on, oui) ouvre.
 * Une valeur illisible, ou une variable FEATURE_* qui ne désigne aucun interrupteur (faute de frappe :
 * FEATURE_SHOPP=0), est signalée dans `errors` et laisse le défaut. Exemple : FEATURE_SHOP=0, FEATURE_HOME_DUEL=0.
 */
export function readFeatures(env: Record<string, string | undefined>): { features: Readonly<Features>; errors: string[] } {
  const features: Features = { ...FEATURE_DEFAULTS };
  const errors: string[] = [];
  const names = FEATURE_KEYS.map(featureEnvName);
  for (const name of Object.keys(env).sort()) {
    if (name.startsWith('FEATURE_') && !names.includes(name)) {
      errors.push(`${name} : interrupteur inconnu (interrupteurs : ${names.join(', ')}).`);
    }
  }
  for (const k of FEATURE_KEYS) {
    const name = featureEnvName(k);
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') continue;
    const v = raw.trim().toLowerCase();
    if (['1', 'true', 'on', 'oui'].includes(v)) features[k] = true;
    else if (['0', 'false', 'off', 'non'].includes(v)) features[k] = false;
    else errors.push(`${name}=${raw} : valeur inconnue (attendu 0 ou 1).`);
  }
  return { features: Object.freeze(features), errors };
}

const fromEnv = readFeatures(process.env);

/** Interrupteurs du serveur : défauts (shared/config/features.ts) fusionnés avec FEATURE_*. */
export const FEATURES: Readonly<Features> = fromEnv.features;

/** Erreurs de lecture des FEATURE_* (à signaler au démarrage ; la valeur par défaut est gardée). */
export const FEATURE_ERRORS: readonly string[] = fromEnv.errors;

// ---------------------------------------------------------------------------------------------
// Mise en place des nouvelles parties sur ce serveur

let dealOverride: Readonly<DealSettings> | null = null;

/**
 * Mise en place des nouvelles parties (choix ou tirage, durée du choix, contraintes du tirage) : DEAL
 * (src/shared/config/rules.ts), sauf surcharge de test (SPELLMATE_TEST_RULES, config.ts). Lue à chaque création.
 */
export function dealSettings(): Readonly<DealSettings> {
  return dealOverride ?? DEAL;
}

/**
 * Surcharge de test de la mise en place (serveur jetable : {"draft":false}, {"draftMs":5000}), ou null pour la
 * retirer. Refusée en production, comme setRulesOverride.
 */
export function setDealOverride(p: Partial<Pick<DealSettings, 'draft' | 'draftMs' | 'limitsInDraft'>> | null): void {
  if (p && process.env.NODE_ENV === 'production') throw new Error('Mise en place de test refusée en production (SPELLMATE_TEST_RULES).');
  dealOverride = p ? deepFreeze({ ...DEAL, ...p }) : null;
}
