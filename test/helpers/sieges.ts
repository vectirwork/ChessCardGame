// Sièges et salles des tests du serveur (src/server/games.ts), sans socket : un humain (compte ou invité), l'IA, une
// invitation entre deux humains. Repris de test/server-draft.test.ts.
//
// Importer ce module importe src/server/games.ts : les tests qui créent des salles remplacent d'abord la base et le
// pool de l'IA par des doublures (vi.mock('../src/server/db', …) et vi.mock('../src/server/bot-pool', …), voir
// server-draft.test.ts), et figent l'horloge (vi.useFakeTimers).
import type { Catalog } from '../../src/shared/cards';
import { newRoom } from '../../src/server/games';
import type { Room } from '../../src/server/games';

/** Siège d'une salle (le type Seat n'est pas exporté par games.ts). */
export type SeatArg = NonNullable<Parameters<typeof newRoom>[0]['seats']['w']>;
export type BotLevelArg = 1 | 2 | 3;

/** Humain n° `n` : invité (g:n) sans `userId`, compte (u:userId, classement 1 500) avec. */
export const human = (n: number, userId: string | null = null): SeatArg => ({
  kind: userId ? 'user' : 'guest',
  key: userId ? `u:${userId}` : `g:${n}`,
  userId,
  name: `Joueur ${n}`,
  username: null,
  rating: userId ? 1500 : null,
  gamesPlayed: 10,
  skin: '',
});

/** L'IA du niveau donné (2 par défaut, comme la partie de l'accueil). */
export const bot = (level: BotLevelArg = 2): SeatArg => ({
  kind: 'bot',
  key: `bot:${level}`,
  userId: null,
  name: 'IA',
  username: null,
  rating: 1300,
  gamesPlayed: 0,
  skin: '',
  level,
});

/**
 * Invitation déjà acceptée entre deux humains (salle active, choix des cartes ouvert s'il y a des cartes). `rated` :
 * partie classée de la file (deux comptes a1 et b2).
 */
export function invite(tc = '5+0', catalog: Catalog = 'climats', rated = false): Room {
  const ids = rated ? ['a1', 'b2'] : [null, null];
  return newRoom({
    mode: rated ? 'quick' : 'invite',
    rated,
    tc,
    catalog,
    creator: 'g:1',
    seats: { w: human(1, ids[0]), b: human(2, ids[1]) },
  });
}

/** Partie contre l'IA (l'humain a les Blancs par défaut). */
export function contreIA(tc = '10+0', level: BotLevelArg = 2, humanColor: 'w' | 'b' = 'w', catalog: Catalog = 'climats'): Room {
  const seats = humanColor === 'w' ? { w: human(1), b: bot(level) } : { w: bot(level), b: human(1) };
  return newRoom({ mode: 'bot', rated: false, tc, catalog, creator: 'g:1', seats });
}

/** Invitation en attente de son deuxième joueur (salle « waiting », choix pas encore ouvert). */
export function enAttente(tc = '5+0', catalog: Catalog = 'climats'): Room {
  return newRoom({ mode: 'invite', rated: false, tc, catalog, creator: 'g:1', seats: { w: human(1), b: null } });
}
