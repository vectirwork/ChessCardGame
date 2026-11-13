// Mise en forme partagée par les pages des fonctions classiques (Analyse, Mes parties, Direct).
// Les libellés communs à tout le site sont ailleurs, en un seul exemplaire : cadence (tcLabel, protocol.ts), catalogue,
// nature d'une partie, couleur et nom de carte (text/libelles.ts), pluriels et nombres (text/fr.ts).
import { Color, sanToFrench } from '../../shared/chess';
import type { Rules } from '../../shared/config/rules';
import { RESULT_TEXT, resultText } from '../../shared/game';
import type { ResultReason } from '../../shared/game';
import { LOCALE } from '../../shared/text/fr';

export const frSan = (san: string) => sanToFrench(san);

const MATE_CP = 2000;

/** Évaluation en centipions (point de vue des Blancs), mats ramenés à ±2000 pour les courbes. */
export function evalCp(scoreWhite: number, mate: number | null): number {
  if (mate !== null) return mate > 0 ? MATE_CP : -MATE_CP;
  if (Math.abs(scoreWhite) > 50_000) return scoreWhite > 0 ? MATE_CP : -MATE_CP;
  return Math.max(-1500, Math.min(1500, scoreWhite));
}

/** « +0,4 », « −1,2 », « #3 », « #−2 ». */
export function formatEval(scoreWhite: number, mate: number | null): string {
  if (mate !== null) return mate > 0 ? `#${mate}` : `#−${-mate}`;
  if (Math.abs(scoreWhite) > 50_000) return scoreWhite > 0 ? '#' : '#−';
  const v = scoreWhite / 100;
  const s = Math.abs(v).toFixed(1).replace('.', ',');
  return v > 0.04 ? `+${s}` : v < -0.04 ? `−${s}` : '0,0';
}

/** Part des Blancs dans la barre d'évaluation (0 à 1). */
export function whiteShare(scoreWhite: number, mate: number | null): number {
  const cp = evalCp(scoreWhite, mate);
  if (Math.abs(cp) >= MATE_CP) return cp > 0 ? 1 : 0;
  const x = 2 / (1 + Math.exp(-cp / 360)) - 1;
  return Math.max(0.03, Math.min(0.97, 0.5 + x / 2));
}

/** « Victoire », « Défaite », « Nulle » du point de vue de `you` ; sinon « 1-0 »… */
export function outcomeFor(winner: Color | 'draw' | null | undefined, you: Color | null): { text: string; tone: 'win' | 'loss' | 'draw' | 'none' } {
  if (winner === undefined || winner === null) return { text: 'Non terminée', tone: 'none' };
  if (winner === 'draw') return { text: 'Nulle', tone: 'draw' };
  if (!you) return { text: winner === 'w' ? '1-0' : '0-1', tone: 'none' };
  return winner === you ? { text: 'Victoire', tone: 'win' } : { text: 'Défaite', tone: 'loss' };
}

/**
 * Libellé d'une fin de partie. Avec les règles de la partie (`rulesOf(état)`, ou celles qu'une partie enregistrée a
 * gardées) : « Règle des 75 coups » si elle en avait changé ; sans elles (listes sans état), celles des nouvelles
 * parties (RESULT_TEXT). Une raison inconnue est rendue telle quelle.
 */
export function reasonText(reason: string | null | undefined, rules?: Pick<Rules, 'fiftyHalfmoves' | 'repetitions'>): string {
  if (!reason) return '';
  if (!Object.hasOwn(RESULT_TEXT, reason)) return reason;
  return rules ? resultText(reason as ResultReason, rules) : RESULT_TEXT[reason as ResultReason];
}

export function scoreText(winner: Color | 'draw' | null | undefined): string {
  if (winner === 'w') return '1-0';
  if (winner === 'b') return '0-1';
  if (winner === 'draw') return '½-½';
  return '*';
}

const DATE_FMT = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export function formatDate(d: Date | number | string): string {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const today = new Date();
  const same = x.toDateString() === today.toDateString();
  const yest = new Date(today.getTime() - 86_400_000).toDateString() === x.toDateString();
  if (same) return `Aujourd’hui, ${TIME_FMT.format(x)}`;
  if (yest) return `Hier, ${TIME_FMT.format(x)}`;
  return DATE_FMT.format(x);
}

/** Numéro de coup lisible depuis un nombre de demi-coups. */
export function movesFromPlies(plies: number): number {
  return Math.ceil(plies / 2);
}
