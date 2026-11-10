// Parties jouées sur cet appareil (invités, et parties locales contre l'IA) : liste conservée dans le navigateur.
//
// Intégration (page de partie, accueil) :
//   import { rememberView, rememberLocalGame } from '../features/history';
//   rememberView(view);                  // partie en ligne terminée (GameView du serveur)
//   rememberLocalGame(state, { white, black, you });   // partie locale terminée (contre l'IA dans le navigateur)
//
// Les parties en ligne se rouvrent dans l'Analyse par leur identifiant ; les parties locales emportent leur journal.
//
// Rois d'une partie (skins) : chaque camp porte son roi, pris à l'assise (view.seats[c].king) et vu de tous. La
// préférence locale « Rois adverses classiques » (CLASSIC_KINGS_PREF, réglée dans le compte) remplace à l'affichage
// les rois des autres par le roi Arcane : shownKings, lu par la partie, l'accueil et l'analyse.
// Ce module ne charge pas le catalogue (« Mes parties » s'en passe) : le serveur normalise déjà les rois des sièges
// (seatView), et un identifiant inconnu est dessiné en roi Arcane par pieceUrl.
import type { Color } from '../../shared/chess';
import type { CardId, Catalog } from '../../shared/cards';
import type { GameState, LogEntry, ResultReason } from '../../shared/game';
import type { GameView, SeatView } from '../../shared/protocol';
import { readJson, writeJson } from './storage';

/** Préférence locale (usePref) : les rois des adversaires s'affichent en roi Arcane. Défaut : false. */
export const CLASSIC_KINGS_PREF = 'rois-classiques';

/** Roi Arcane (DEFAULT_KING du catalogue, vérifié par test/kings.test.ts). */
const ARCANE_KING = 'king:arcane';

/** Roi de chaque camp (objets king:*). */
export type Kings = Record<Color, string>;

/** Rois d'une vue de partie : ceux des sièges (siège vide, partie d'avant les rois : le roi Arcane). */
export function seatKings(seats: Partial<Record<Color, SeatView | null>> | null | undefined): Kings {
  return { w: seats?.w?.king || ARCANE_KING, b: seats?.b?.king || ARCANE_KING };
}

/**
 * Rois à dessiner sur l'échiquier de `you` (null : spectateur). Avec la préférence « Rois adverses classiques », seul
 * son propre roi garde son skin ; un spectateur voit les deux rois Arcane. Renvoie des chaînes (Board est mémoïsé).
 */
export function shownKings(kings: Partial<Kings> | null | undefined, you: Color | null, classic: boolean): Kings {
  const w = kings?.w || ARCANE_KING;
  const b = kings?.b || ARCANE_KING;
  if (!classic) return { w, b };
  return { w: you === 'w' ? w : ARCANE_KING, b: you === 'b' ? b : ARCANE_KING };
}

export const HISTORY_KEY = 'sm:parties';
const MAX = 60;

export interface PlayedGame {
  /** Identifiant serveur, ou « local-… » pour une partie jouée dans le navigateur. */
  id: string;
  at: number;
  you: Color | null;
  white: string;
  black: string;
  winner?: Color | 'draw' | null;
  reason?: ResultReason | null;
  catalog?: Catalog;
  plies?: number;
  timeControl?: string;
  vsBot?: boolean;
  /** Rois des deux camps (absent : partie enregistrée avant les rois, Arcane). */
  kings?: Kings;
  /** Partie locale : de quoi la rejouer. */
  local?: { log: LogEntry[]; hands: Record<Color, CardId[]>; timed: boolean; catalog: Catalog };
}

export function playedGames(): PlayedGame[] {
  const list = readJson<PlayedGame[]>(HISTORY_KEY, []);
  return Array.isArray(list) ? list.filter(g => g && typeof g.id === 'string') : [];
}

export function rememberGame(g: PlayedGame) {
  const list = playedGames().filter(x => x.id !== g.id);
  list.unshift(g);
  writeJson(HISTORY_KEY, list.slice(0, MAX));
}

export function forgetGame(id: string) {
  writeJson(HISTORY_KEY, playedGames().filter(g => g.id !== id));
}

export function localGame(id: string): PlayedGame | undefined {
  return playedGames().find(g => g.id === id && g.local);
}

/** Partie en ligne : à appeler quand la partie se termine (ou quand un joueur la revoit). */
export function rememberView(view: GameView) {
  if (view.you === null || view.state.result?.reason === 'aborted') return;
  const tc = view.clock ? `${Math.round(view.clock.initial / 60)}+${view.clock.increment}` : 'Sans limite';
  rememberGame({
    id: view.id,
    at: view.createdAt || Date.now(),
    you: view.you,
    white: view.seats.w?.name ?? 'Blancs',
    black: view.seats.b?.name ?? 'Noirs',
    winner: view.state.result ? view.state.result.winner ?? 'draw' : null,
    reason: view.state.result?.reason ?? null,
    catalog: view.state.catalog ?? 'duel',
    plies: view.state.ply,
    timeControl: tc,
    vsBot: view.seats.w?.kind === 'bot' || view.seats.b?.kind === 'bot',
    kings: seatKings(view.seats),
  });
}

/** Partie locale terminée (accueil contre l'IA) : le journal suffit à la rejouer. */
export function rememberLocalGame(state: GameState, meta: { white: string; black: string; you: Color; vsBot?: boolean; id?: string; kings?: Kings }) {
  if (!state.log.length) return;
  const hands = {
    w: state.hands.w.map(h => h.card).filter((c): c is CardId => !!c),
    b: state.hands.b.map(h => h.card).filter((c): c is CardId => !!c),
  };
  rememberGame({
    id: meta.id ?? `local-${Date.now().toString(36)}`,
    at: Date.now(),
    you: meta.you,
    white: meta.white,
    black: meta.black,
    winner: state.result ? state.result.winner ?? 'draw' : null,
    reason: state.result?.reason ?? null,
    catalog: state.catalog ?? 'duel',
    plies: state.ply,
    vsBot: meta.vsBot ?? true,
    kings: meta.kings ? shownKings(meta.kings, null, false) : undefined,
    local: { log: state.log, hands, timed: state.timed, catalog: state.catalog ?? 'duel' },
  });
}
