// Pendule du serveur sous les Pouvoirs (src/server/games.ts, fonctions sans sockets) : Sablier fou (×2 pour les
// deux camps, sans incrément), Rituel (un coup), cinématiques hors pendule (R10), reprise après un redémarrage,
// anciennes parties (Duel, cartes retirées).
// Le temps est simulé (horloge factice de vitest).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqIndex as q } from '../src/shared/chess';
import { CardId, Catalog } from '../src/shared/cards';
import { GameState, clockRate, createGame, incrementSuspended, playCard, playMove } from '../src/shared/game';
import {
  CINEMATIC_MS, RoomData, commitCard, commitMove, hasRetiredCard, resumeClock, settleClock,
} from '../src/server/games';

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

describe('pendule et Pouvoirs (serveur)', () => {
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

  it('une partie qui garde une carte retirée (main ou effet) ne peut plus être reprise', () => {
    const d = room(['truce', 'ice_wall'], ['rift']);
    expect(hasRetiredCard(d.state)).toBe(false);
    const old = JSON.parse(JSON.stringify(d.state));
    old.hands.b[0].card = 'deja_vu';
    expect(hasRetiredCard(old)).toBe(true);
    const fx = JSON.parse(JSON.stringify(d.state));
    fx.effects = [{ id: 1, card: 'cavalcade', caster: 'w', countsOn: 'w', remaining: 2, total: 2, skin: '', global: true }];
    expect(hasRetiredCard(fx)).toBe(true);
    // Une ancienne partie Duel reste jouable.
    expect(hasRetiredCard(room(['rewind', 'ice_wall'], ['swap'], 'duel').state)).toBe(false);
  });
});
