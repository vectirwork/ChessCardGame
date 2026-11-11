// Partie de l'accueil (L'Odyssée) : contre l'Oracle dans le navigateur, ou en direct contre un autre visiteur.
// Aucun import à l'exécution. Ses règles viennent de rulesFor('accueil') (GAME_RULES et RULES_BY_CONTEXT.accueil) ;
// l'accueil tire toujours les mains au hasard (pas de choix des cartes).

import type { BotLevel } from '../bot';
import type { CardCatalog } from '../cards';
import type { Color } from '../chess';

export interface HomeSettings {
  /** Catalogue des parties de l'accueil (contre l'Oracle et en direct). Une sauvegarde d'un autre catalogue repart de zéro. */
  catalog: CardCatalog;
  /** Pendule : jamais sur l'accueil. */
  timed: boolean;
  /** Partie contre l'Oracle : les cartes réservées aux humains (Sablier fou) sont exclues. */
  vsBot: boolean;
  /** Couleur du visiteur contre l'Oracle. */
  playerColor: Color;
  /** Niveau de l'Oracle tant que le visiteur n'en a pas choisi un autre. */
  botLevel: BotLevel;
  /** Fenêtre d'arrivée : un visiteur arrivé depuis moins longtemps peut être apparié à un autre (ms). */
  pairWindowMs: number;
  /** Appariable tant que la partie contre l'Oracle n'a pas dépassé ce nombre de demi-coups. */
  readyMaxPly: number;
  /** Nom des deux visiteurs appariés. */
  guestName: string;
  /** Version du format de la sauvegarde locale (clé KEYS.homeGame). */
  saveVersion: 1;
  /** Une partie oubliée depuis plus longtemps repart de zéro (ms). */
  saveMaxAgeMs: number;
  /** Temps de réflexion affiché de l'Oracle : minimum, plus un aléa (ms). */
  oracleThinkMs: number;
  oracleThinkJitterMs: number;
  /** Pause de l'Oracle entre son sort et son coup (ms). */
  oracleAfterCastMs: number;
  /** Sans geste du visiteur depuis ce délai, l'accueil se met au repos (ms). */
  idleMs: number;
  /** Partie en direct : signe de présence (game:activity) envoyé au plus une fois par ce délai (ms). */
  activityPingMs: number;
  /** Partie en direct annulée (personne n'a joué) : retour à l'Oracle après ce délai (ms). */
  duelAbortReturnMs: number;
}

/** ← Accueil. */
export const HOME: Readonly<HomeSettings> = /* @__PURE__ */ Object.freeze({
  catalog: 'climats',
  timed: false,
  vsBot: true,
  playerColor: 'w',
  botLevel: 2,
  pairWindowMs: 30_000,
  readyMaxPly: 4,
  guestName: 'Visiteur',
  saveVersion: 1,
  saveMaxAgeMs: 30 * 24 * 3600 * 1000,
  oracleThinkMs: 520,
  oracleThinkJitterMs: 380,
  oracleAfterCastMs: 380,
  idleMs: 30_000,
  activityPingMs: 3000,
  duelAbortReturnMs: 2500,
});
