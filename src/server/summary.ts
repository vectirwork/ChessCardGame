// Résumé d'une partie terminée (profils, historique).
import type { GameSummary } from '../shared/protocol';

export function toSummary(r: any): GameSummary {
  return {
    id: r.id,
    mode: r.mode,
    rated: r.rated,
    status: r.status,
    white: r.white_name,
    black: r.black_name,
    whiteRating: r.white_rating,
    blackRating: r.black_rating,
    winner: r.winner,
    reason: r.reason,
    timeControl: r.time_control,
    createdAt: r.created_at.toISOString(),
    plies: r.plies,
  };
}
