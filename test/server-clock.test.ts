// Pendule du serveur sous les cartes Climats (src/server/games.ts, fonctions sans sockets) :
// Sablier fou (×2 pour les deux camps, sans incrément), Déjà-vu (temps rendu à l'adversaire, incrément du coup
// effacé repris au lanceur), Rituel (un coup), cinématiques hors pendule (R10), reprise après un redémarrage.
// Le temps est simulé (horloge factice de vitest).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqIndex as q } from '../src/shared/chess';
import { CardId, Catalog } from '../src/shared/cards';
import { GameState, clockRate, createGame, incrementSuspended, playCard, playMove } from '../src/shared/game';
import { CINEMATIC_MS, RoomData, commitCard, commitMove, resumeClock, settleClock } from '../src/server/games';

const T0 = 1_800_000_000_000;

/** Salle 3+2 déjà commencée (les deux pendules tournent), Blancs au trait. */
function room(w: CardId[], b: CardId[], catalog: Catalog = 'climats'): RoomData {
  const state = createGame({ w, b }, true, catalog);
  return {
    id: 'TEST01', mode: 'invite', rated: false, status: 'active', tc: '3+2', mirror: false, catalog,
    creator: 'u:1', seats: { w: null, b: null }, state,
    clock: { initial: 180, increment: 2, w: 180_000, b: 180_000, running: 'w', since: T0 },
    drawOffer: null, rematch: { w: false, b: false, next: null }, ratingDiff: null, firstMoveDeadline: null,
    createdAt: T0, started: true,
    // begin() note la pendule au début du premier tour.
    turnMarks: [{ ply: 0, color: 'w', ms: 180_000 }],
  };
}

/** Attend `ms` puis joue le coup (comme applyMove). */
function move(d: RoomData, ms: number, from: string, to: string) {
  vi.advanceTimersByTime(ms);
  const color = d.state.pos.turn;
  const r = playMove(d.state, q(from), q(to));
  if (!r.ok) throw new Error(r.error);
  commitMove(d, color, r.state, r.info);
}

/** Attend `ms` puis joue la carte `index` (comme applyCard). Renvoie vrai si le trait a changé. */
function card(d: RoomData, ms: number, index: number, targets: string[] = []): boolean {
  vi.advanceTimersByTime(ms);
  const color = d.state.pos.turn;
  const r = playCard(d.state, color, index, targets.map(q), '');
  if (!r.ok) throw new Error(r.error);
  return commitCard(d, color, r.state, r.info);
}

const clock = (d: RoomData) => d.clock!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('pendule et cartes Climats (serveur)', () => {
  it('Sablier fou : rythme normal pendant le Présage, puis ×2 pour les deux camps et plus d’incrément', () => {
    const d = room(['hourglass'], []);
    card(d, 1000, 0);
    // Lancement : la cinématique est créditée au lanceur, toujours au trait.
    expect(clock(d).running).toBe('w');
    expect(clockRate(d.state, 'w')).toBe(1);
    move(d, 9000, 'e2', 'e4');
    expect(clock(d).w).toBe(180_000 - 10_000 + CINEMATIC_MS + 2000);
    // Réponse au Présage : encore au rythme normal, avec incrément ; le Sablier arrive après ce coup.
    move(d, 10_000, 'e7', 'e5');
    expect(clock(d).b).toBe(180_000 - 10_000 + 2000);
    expect(clockRate(d.state, 'w')).toBe(2);
    expect(clockRate(d.state, 'b')).toBe(2);
    expect(incrementSuspended(d.state)).toBe(true);
    // L'arrivée est une cinématique : le camp au trait en est crédité (au double, puisque sa pendule va deux fois plus vite).
    const w0 = clock(d).w;
    expect(w0).toBe(180_000 - 10_000 + CINEMATIC_MS + 2000 + 2 * CINEMATIC_MS);
    // 6 coups à ×2, sans incrément.
    const plays: [string, string][] = [['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['b1', 'c3'], ['f8', 'c5']];
    const before = { w: w0, b: clock(d).b };
    for (const [from, to] of plays) move(d, 5000, from, to);
    expect(clock(d).w).toBe(before.w - 3 * 10_000);
    expect(clock(d).b).toBe(before.b - 3 * 10_000);
    // Le Sablier a expiré : rythme normal et incrément rétablis.
    expect(clockRate(d.state, 'w')).toBe(1);
    expect(incrementSuspended(d.state)).toBe(false);
    move(d, 5000, 'e1', 'g1');
    expect(clock(d).w).toBe(before.w - 30_000 - 5000 + 2000);
  });

  it('Déjà-vu : l’adversaire retrouve le temps qu’il avait au début du coup effacé ; le lanceur perd l’incrément de son coup effacé', () => {
    const d = room(['deja_vu'], []);
    move(d, 3000, 'e2', 'e4');
    const wAfter = clock(d).w;
    const bStart = clock(d).b;
    move(d, 40_000, 'e7', 'e5');
    expect(clock(d).b).toBe(bStart - 40_000 + 2000);
    const turned = card(d, 5000, 0);
    expect(turned).toBe(false);
    expect(d.state.pos.turn).toBe('w');
    expect(clock(d).running).toBe('w');
    // Noirs : temps du début de leur coup effacé (incrément compris, perdu avec le coup).
    expect(clock(d).b).toBe(bStart);
    // Blancs : leur temps continue de s'écouler depuis leur coup effacé (5 s), sans l'incrément de ce coup (2 s),
    // plus la cinématique.
    expect(clock(d).w).toBe(wAfter - 5000 - 2000 + CINEMATIC_MS);
  });

  it('Déjà-vu en 15+10 : un coup joué vite puis effacé ne rapporte pas de temps au lanceur', () => {
    const d = room(['deja_vu'], []);
    d.tc = '15+10';
    d.clock = { initial: 900, increment: 10, w: 900_000, b: 900_000, running: 'w', since: T0 };
    d.turnMarks = [{ ply: 0, color: 'w', ms: 900_000 }];
    move(d, 1000, 'e2', 'e4');
    move(d, 1000, 'e7', 'e5');
    card(d, 1000, 0);
    expect(d.state.ply).toBe(0);
    // Avant la correction : 909 200 ms (l'incrément du coup effacé restait acquis).
    expect(clock(d).w).toBe(900_000 - 2000 + CINEMATIC_MS);
    expect(clock(d).b).toBe(900_000);
  });

  it('Déjà-vu qui efface un Rituel : l’incrément de la Grande Marée est repris aussi', () => {
    const d = room(['tide', 'deja_vu'], []);
    move(d, 1000, 'e2', 'e4');
    move(d, 1000, 'e7', 'e5');
    const w0 = clock(d).w;
    card(d, 1000, 0); // Grande Marée : 1 s, +2 s
    expect(clock(d).w).toBe(w0 - 1000 + 2000);
    move(d, 1000, 'g8', 'e7'); // (la marée a poussé les pions noirs d'une case)
    card(d, 1000, 1);
    expect(d.state.ply).toBe(2);
    expect(clock(d).w).toBe(w0 - 2000 + CINEMATIC_MS);
  });

  it('Déjà-vu qui efface l’arrivée d’un Sablier fou : la pendule en marche ralentit sans perdre le temps écoulé', () => {
    // Les Blancs annoncent le Sablier ; il arrive après la réponse noire ; les Noirs effacent ce tour.
    const d = room(['hourglass'], ['deja_vu']);
    card(d, 0, 0);
    move(d, 1000, 'e2', 'e4');
    const wStart = clock(d).w; // début du tour blanc qui sera effacé (avant la cinématique d'arrivée)
    const bStart = clock(d).b;
    move(d, 1000, 'e7', 'e5'); // arrivée : ×2 (l'incrément est encore dû)
    expect(clock(d).b).toBe(bStart - 1000 + 2000);
    move(d, 1000, 'g1', 'f3'); // ×2, sans incrément
    expect(clockRate(d.state, 'b')).toBe(2);
    const b0 = clock(d).b;
    // Les Noirs réfléchissent 3 s à ×2 (6 s perdues), puis lancent le Déjà-vu : le Sablier redevient annoncé.
    // L'incrément de leur coup effacé (…e5, 2 s) leur est repris.
    card(d, 3000, 0);
    expect(d.state.pos.turn).toBe('b');
    expect(clockRate(d.state, 'b')).toBe(1);
    expect(clock(d).b).toBe(b0 - 6000 - 2000 + CINEMATIC_MS);
    // Les Blancs retrouvent le temps du début de leur coup effacé (cinématique d'arrivée comprise, effacée avec lui).
    expect(clock(d).w).toBe(wStart);
    // La suite se joue au rythme normal, avec incrément ; le pion e7 est interdit.
    move(d, 1000, 'd7', 'd5');
    expect(clock(d).b).toBe(b0 - 6000 - 2000 + CINEMATIC_MS - 1000 + 2000);
  });

  it('Grande Marée (Rituel) : compte comme un coup (incrément, trait adverse, cinématique créditée à l’adversaire)', () => {
    const d = room(['tide'], []);
    move(d, 1000, 'e2', 'e4');
    move(d, 1000, 'e7', 'e5');
    const w0 = clock(d).w;
    const b0 = clock(d).b;
    const turned = card(d, 4000, 0);
    expect(turned).toBe(true);
    expect(d.state.pos.turn).toBe('b');
    expect(clock(d).running).toBe('b');
    expect(clock(d).w).toBe(w0 - 4000 + 2000);
    expect(clock(d).b).toBe(b0 + CINEMATIC_MS);
  });

  it('Duel : pas de crédit de cinématique, la Distorsion temporelle n’accélère que la pendule adverse', () => {
    const d = room(['time_warp'], [], 'duel');
    card(d, 1000, 0);
    expect(clock(d).w).toBe(180_000 - 1000);
    expect(clockRate(d.state, 'w')).toBe(1);
    expect(clockRate(d.state, 'b')).toBe(2);
    expect(incrementSuspended(d.state)).toBe(false);
    move(d, 1000, 'e2', 'e4');
    move(d, 5000, 'e7', 'e5');
    expect(clock(d).b).toBe(180_000 - 10_000 + 2000);
  });

  it('redémarrage normal : le temps réfléchi avant l’arrêt reste décompté, pas le temps d’arrêt', () => {
    const d = room(['hourglass'], []);
    move(d, 1000, 'e2', 'e4');
    vi.advanceTimersByTime(12_000); // les Noirs réfléchissent 12 s, puis le serveur s'arrête
    settleClock(d); // flushRooms
    d.savedAt = Date.now(); // saveRoom
    const saved = JSON.parse(JSON.stringify(d)) as RoomData;
    vi.advanceTimersByTime(60_000); // serveur arrêté
    resumeClock(saved); // resumeRoom
    move(saved, 1000, 'e7', 'e5');
    // Avant la correction : 180 000 - 1000 + 2000 (les 12 s d'avant l'arrêt étaient rendues).
    expect(clock(saved).b).toBe(180_000 - 12_000 - 1000 + 2000);
  });

  it('arrêt brutal : le temps écoulé jusqu’à la dernière sauvegarde est décompté (au double sous le Sablier)', () => {
    const d = room(['hourglass'], []);
    card(d, 0, 0);
    move(d, 0, 'e2', 'e4');
    move(d, 0, 'e7', 'e5'); // le Sablier arrive : ×2
    expect(clockRate(d.state, 'w')).toBe(2);
    const w0 = clock(d).w;
    vi.advanceTimersByTime(3000);
    d.savedAt = Date.now(); // une sauvegarde pendant la réflexion, sans pendule figée
    const saved = JSON.parse(JSON.stringify(d)) as RoomData;
    vi.advanceTimersByTime(20_000); // la suite de la réflexion et l'arrêt sont perdus
    resumeClock(saved);
    expect(clock(saved).w).toBe(w0 - 6000);
    move(saved, 1000, 'g1', 'f3');
    expect(clock(saved).w).toBe(w0 - 6000 - 2000);
  });

  it('anciens états sans catalogue : parties Duel, toujours jouables après sérialisation', () => {
    const d = room(['rewind'], [], 'duel');
    const old = JSON.parse(JSON.stringify(d.state)) as GameState;
    delete old.catalog;
    d.state = old;
    move(d, 1000, 'e2', 'e4');
    move(d, 1000, 'e7', 'e5');
    for (const snap of d.state.snaps) delete snap.used;
    vi.advanceTimersByTime(1000);
    // Retour arrière (Duel) : annule le dernier coup adverse, sans crédit de cinématique ni temps rendu.
    const r = playCard(d.state, 'w', 0, [], '');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = clock(d).b;
    expect(commitCard(d, 'w', r.state, r.info)).toBe(true);
    expect(d.state.pos.turn).toBe('b');
    expect(clock(d).b).toBe(b);
    expect(clock(d).running).toBe('b');
  });
});
