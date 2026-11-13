// Classement Elo et tolérance de l'appariement classé : fonctions pures, réglées par RATING et MATCHMAKING
// (src/server/settings.ts). Testées dans test/rating.test.ts.
import type { Color } from '../shared/chess';
import { MATCHMAKING, RATING } from './settings';

/** Réglages du classement lus par elo() (RATING par défaut ; les tests en passent d'autres). */
export interface RatingSettings {
  kProvisional: number;
  kEstablished: number;
  provisionalGames: number;
  scale: number;
}

/**
 * Écart de classement d'un joueur classé `a` contre `b` : K × (score − score attendu), arrondi. `score` : 1 victoire,
 * 0,5 nulle, 0 défaite. K vaut RATING.kProvisional pendant les RATING.provisionalGames premières parties classées
 * (`games` : parties déjà jouées), puis RATING.kEstablished.
 */
export function elo(a: number, b: number, score: number, games: number, r: RatingSettings = RATING): number {
  const k = games < r.provisionalGames ? r.kProvisional : r.kEstablished;
  return Math.round(k * (score - 1 / (1 + 10 ** ((b - a) / r.scale))));
}

/** Ce qu'elo() lit d'un siège : son classement (absent : RATING.initial) et ses parties jouées. */
export interface RatedSide {
  rating: number | null;
  gamesPlayed: number;
}

/** Écarts de classement des deux camps d'une partie classée terminée (`winner` null : nulle). */
export function ratingDiffs(w: RatedSide, b: RatedSide, winner: Color | null): Record<Color, number> {
  const sw = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
  return {
    w: elo(w.rating ?? RATING.initial, b.rating ?? RATING.initial, sw, w.gamesPlayed),
    b: elo(b.rating ?? RATING.initial, w.rating ?? RATING.initial, 1 - sw, b.gamesPlayed),
  };
}

/**
 * Écart de classement accepté par l'appariement classé pour une entrée qui attend depuis `waitedMs` : la tolérance
 * de départ, élargie de MATCHMAKING.tolerancePerSecond par seconde d'attente.
 */
export function matchTolerance(waitedMs: number): number {
  return MATCHMAKING.baseTolerance + (waitedMs / 1000) * MATCHMAKING.tolerancePerSecond;
}
