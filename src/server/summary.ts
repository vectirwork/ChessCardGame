// Résumé d'une partie terminée (profils, historique).
import type { GameSummary } from '../shared/protocol';
import { RULES_V1, parseRules } from '../shared/rules';

/**
 * Règles d'une partie enregistrée (colonne data : RoomData, son état), pour son résumé : seulement si elles diffèrent
 * de RULES_V1 (parseRules rend RULES_V1 pour des règles égales) ; absentes ou illisibles : rien (RULES_V1 côté client,
 * comme pour une partie d'avant le versionnement).
 */
function summaryRules(data: unknown): Pick<GameSummary, 'rules'> {
  const raw = (data as { state?: { rules?: unknown } } | null | undefined)?.state?.rules;
  if (raw === undefined) return {};
  const rules = parseRules(raw);
  return rules && rules !== RULES_V1 ? { rules } : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    ...summaryRules(r.data),
  };
}
