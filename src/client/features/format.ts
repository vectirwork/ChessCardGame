// Mise en forme partagée par les pages des fonctions classiques.
import { Color, sanToFrench } from '../../shared/chess';
import { CARDS, CATALOGS, Catalog, isCardId } from '../../shared/cards';
import { RESULT_TEXT, ResultReason, describeCardPlay } from '../../shared/game';
import type { LogEntry } from '../../shared/game';

export const frSan = (san: string) => sanToFrench(san);

/** Libellé d'une entrée du journal (coup en notation française, ou carte). */
export function entryLabel(e: LogEntry): string {
  if (e.k === 'move') return frSan(e.san);
  return describeCardPlay(e.card, e.targets);
}

/** Nom d'une carte ; une carte retirée du jeu (ancienne partie) garde son identifiant. */
export function cardName(id: string): string {
  return isCardId(id) ? CARDS[id].name : id;
}

/**
 * Libellé du jeu d'une partie : « Pouvoirs » ou « Sans cartes ». Le Duel n'est plus proposé : une partie créée
 * avant (catalogue absent ou 'duel') est signalée comme telle.
 */
export function catalogLabel(c: Catalog | string | undefined | null): string {
  return CATALOGS.find(x => x.id === c)?.label ?? 'Duel (ancienne formule)';
}

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

export const REASON_TEXT = RESULT_TEXT;

/** « Victoire », « Défaite », « Nulle » du point de vue de `you` ; sinon « 1-0 »… */
export function outcomeFor(winner: Color | 'draw' | null | undefined, you: Color | null): { text: string; tone: 'win' | 'loss' | 'draw' | 'none' } {
  if (winner === undefined || winner === null) return { text: 'Non terminée', tone: 'none' };
  if (winner === 'draw') return { text: 'Nulle', tone: 'draw' };
  if (!you) return { text: winner === 'w' ? '1-0' : '0-1', tone: 'none' };
  return winner === you ? { text: 'Victoire', tone: 'win' } : { text: 'Défaite', tone: 'loss' };
}

export function reasonText(reason: string | null | undefined): string {
  if (!reason) return '';
  return RESULT_TEXT[reason as ResultReason] ?? reason;
}

export function scoreText(winner: Color | 'draw' | null | undefined): string {
  if (winner === 'w') return '1-0';
  if (winner === 'b') return '0-1';
  if (winner === 'draw') return '½-½';
  return '*';
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

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

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Numéro de coup lisible depuis un nombre de demi-coups. */
export function movesFromPlies(plies: number): number {
  return Math.ceil(plies / 2);
}
