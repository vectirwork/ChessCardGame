// Règles d'une partie de Spellmate : coups, cartes, effets temporaires et fins de partie.
// Toutes les fonctions sont pures : elles renvoient un nouvel état sans modifier l'ancien.
// Le même code tourne sur le serveur (arbitre), dans le navigateur (aperçu des coups, partie contre l'IA locale)
// et dans l'IA (src/shared/bot.ts).
//
// Deux catalogues de cartes (voir cards.ts) :
// - Pouvoirs (identifiant 'climats', concepts/CARTES-GLOBALES.md et décision du fondateur du 30 octobre dans
//   docs/PLAN-ODYSSEE.md) : 8 pouvoirs qui touchent les deux camps, mains visibles. Les effets se décomptent sur
//   les coups des deux camps (`global`) ou durent toute la partie (`permanent` : Mur de glace) ; les Climats
//   s'annoncent un tour à l'avance (Présage), la Grande Marée remplace le coup (Rituel), et « la magie cède » :
//   un joueur que les effets privent de tout coup, sans être en échec, joue comme s'ils n'existaient pas pour
//   ses pièces (R6) ;
// - Duel (parties créées avant, plus proposé) : chaque effet se décompte sur les coups d'un seul camp
//   (`countsOn`).

import {
  Color, F_PROMO, F_RELAXED, Move, Mods, NO_MODS, Piece, PieceType, Position, applyMustCapture, clonePosition,
  emptyMods, fromFen, hasLegalMove, inCheck, initialPosition, isCapture, isLightSquare, isSlider, legalMoves,
  makeMove, opposite, rankOf, sqIndex, sqName, toSan,
} from './chess';
import { CARDS, CardId, Catalog, RARITY_WEIGHT, cardsOf, isCardId } from './cards';

export interface Effect {
  id: number;
  card: CardId;
  caster: Color;
  /**
   * Duel : couleur dont les coups font baisser le compteur.
   * Pouvoirs (`global`) : le lanceur, à titre indicatif ; le compteur baisse après chaque coup des deux camps.
   */
  countsOn: Color;
  /**
   * Coups restants : ceux de `countsOn` (Duel), ou des deux camps à partir de l'arrivée (Pouvoirs).
   * 0 pour un effet permanent, qui ne se décompte pas.
   */
  remaining: number;
  total: number;
  square?: number;
  pieceId?: number;
  /** Skin d'animation du lanceur, pour que les deux joueurs voient le même effet. */
  skin: string;
  /** Pouvoirs : le compteur baisse après chaque coup, des deux camps. */
  global?: boolean;
  /** Pouvoirs : l'effet dure jusqu'à la fin de la partie (Mur de glace). */
  permanent?: boolean;
  /** Présage : effet annoncé, pas encore actif (il le devient au début du tour suivant du lanceur). Public. */
  pending?: boolean;
  /** Présage : coups avant l'arrivée (2 au lancement, 1 après le coup du lanceur). */
  delay?: number;
  /** Cases concernées quand il y en a plusieurs (Faille : cases du gouffre). */
  squares?: number[];
}

/** Carte d'une main. Les mains sont publiques : les deux joueurs et les spectateurs voient tout. */
export interface HandCard {
  card: CardId;
  used: boolean;
}

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'resign'
  | 'timeout'
  | 'repetition'
  | 'fifty'
  | 'insufficient'
  | 'agreement'
  | 'abandon'
  | 'aborted';

export interface Result {
  winner: Color | null;
  reason: ResultReason;
}

export type LogEntry =
  /** `undone` : coup annulé par un Retour arrière (Duel), ou effacé par un Déjà-vu (anciennes parties). */
  | { k: 'move'; c: Color; san: string; from: number; to: number; promo?: PieceType; undone?: boolean }
  /**
   * Carte jouée. `undone` n'existe que dans le journal des parties jouées avec le Déjà-vu (carte retirée) : une
   * carte effacée avec le tour.
   */
  | { k: 'card'; c: Color; card: CardId; targets: number[]; undone?: boolean };

/** Coup interdit pour ce tour (Duel : le coup annulé par un Retour arrière ne peut pas être rejoué). */
export interface MoveRef {
  from: number;
  to: number;
  promo?: PieceType;
}

export interface Snapshot {
  pos: Position;
  effects: Effect[];
  captured: Record<Color, PieceType[]>;
  cardPlayed: boolean;
  ply: number;
  keysLen: number;
  forbidden: MoveRef | null;
  /** Coup joué depuis cette position et index de son entrée dans le journal. */
  next: MoveRef & { log: number };
}

export interface GameState {
  pos: Position;
  effects: Effect[];
  hands: Record<Color, HandCard[]>;
  /** Une carte a déjà été jouée pendant ce tour. */
  cardPlayed: boolean;
  /** Pièces capturées (ou détruites), rangées par couleur de la pièce perdue. */
  captured: Record<Color, PieceType[]>;
  nextPieceId: number;
  nextEffectId: number;
  /** Coups joués (demi-coups, Rituels compris). */
  ply: number;
  log: LogEntry[];
  keys: string[];
  /** Duel : les deux dernières positions avant un coup, pour le Retour arrière (vide dans les autres catalogues). */
  snaps: Snapshot[];
  /** Duel : coup interdit pour ce tour (Retour arrière). */
  forbidden: MoveRef | null;
  timed: boolean;
  /** Catalogue de cartes de la partie (absent dans les parties antérieures : 'duel'). */
  catalog?: Catalog;
  result: Result | null;
}

export const CARDS_PER_PLAYER = 3;

/** Catalogue effectif d'une partie (les parties enregistrées avant les catalogues sont des parties Duel). */
export const catalogOf = (s: GameState): Catalog => s.catalog ?? 'duel';

/** « La magie cède » (R6) : règle du catalogue Pouvoirs. */
export const magicYields = (s: GameState): boolean => catalogOf(s) === 'climats';

const isClimate = (card: CardId) => CARDS[card].family === 'climat';

// ---------------------------------------------------------------------------------------------
// Création

export interface DealOptions {
  /** Partie contre l'IA : les cartes `humanOnly` (Sablier fou) sont exclues. */
  vsBot?: boolean;
}

/** Une main du catalogue Pouvoirs est valide avec au plus 1 Légendaire et au plus 2 Climats (R9). */
function validClimatsHand(hand: CardId[]): boolean {
  let legendary = 0;
  let climates = 0;
  for (const id of hand) {
    if (CARDS[id].rarity === 'légendaire') legendary++;
    if (isClimate(id)) climates++;
  }
  return legendary <= 1 && climates <= 2;
}

/**
 * Distribue les mains.
 * - Pouvoirs : tirage pondéré par rareté (Commune 4, Rare 3, Épique 2, Légendaire 1), sans remise, recommencé
 *   si la main a plus d'une Légendaire ou plus de deux Climats (R9). Avec 8 cartes (5 Climats, 1 Légendaire),
 *   seule la contrainte des Climats compte ; sans le Sablier fou (contre l'IA, sans pendule), il en reste 7,
 *   dont 3 qui ne sont pas des Climats : une main valide existe toujours.
 * - Duel (anciennes parties, tests) : tirage uniforme, sans remise.
 * Les cartes `timedOnly` sont exclues sans pendule, les cartes `humanOnly` contre l'IA. En mode miroir, les deux
 * joueurs reçoivent la même main.
 */
export function dealHands(
  timed: boolean, mirror: boolean, rand: () => number = Math.random, catalog: Catalog = 'duel', opts: DealOptions = {},
): Record<Color, CardId[]> {
  if (catalog === 'aucune') return { w: [], b: [] };
  const pool = cardsOf(catalog).filter(id => (timed || !CARDS[id].timedOnly) && !(opts.vsBot && CARDS[id].humanOnly));
  const uniform = () => {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, CARDS_PER_PLAYER);
  };
  const weight = (id: CardId) => RARITY_WEIGHT[CARDS[id].rarity];
  /** Tirage pondéré sans remise ; `constrained` : on écarte au fur et à mesure les cartes qui rendraient la main invalide. */
  const weighted = (constrained: boolean) => {
    let bag = pool.slice();
    const hand: CardId[] = [];
    while (hand.length < CARDS_PER_PLAYER && bag.length) {
      let r = rand() * bag.reduce((t, id) => t + weight(id), 0);
      let k = 0;
      while (k < bag.length - 1 && r >= weight(bag[k])) r -= weight(bag[k++]);
      hand.push(bag[k]);
      bag.splice(k, 1);
      if (constrained) bag = bag.filter(id => validClimatsHand([...hand, id]));
    }
    return hand;
  };
  const draw = () => {
    if (catalog === 'duel') return uniform();
    // Tirage recommencé tant que la main est invalide (R9). Au-delà de 64 essais (générateur dégénéré, tests),
    // tirage contraint carte par carte.
    for (let attempt = 0; attempt < 64; attempt++) {
      const hand = weighted(false);
      if (validClimatsHand(hand)) return hand;
    }
    return weighted(true);
  };
  const w = draw();
  return { w, b: mirror ? w.slice() : draw() };
}

export function createGame(hands: Record<Color, CardId[]>, timed: boolean, catalog: Catalog = 'duel'): GameState {
  const { pos, nextId } = initialPosition();
  const s: GameState = {
    pos,
    effects: [],
    hands: {
      w: hands.w.map(card => ({ card, used: false })),
      b: hands.b.map(card => ({ card, used: false })),
    },
    cardPlayed: false,
    captured: { w: [], b: [] },
    nextPieceId: nextId,
    nextEffectId: 1,
    ply: 0,
    log: [],
    keys: [],
    snaps: [],
    forbidden: null,
    timed,
    catalog,
    result: null,
  };
  s.keys.push(positionKey(s));
  return s;
}

/**
 * Partie à partir d'une position FEN (tests, tutoriel, problèmes).
 * Sans catalogue précisé : Pouvoirs si une main contient une carte qui n'est pas du Duel, sinon Duel.
 */
export function createGameFromFen(fen: string, hands: Record<Color, CardId[]>, timed = true, catalog?: Catalog): GameState {
  const cat = catalog ?? ([...hands.w, ...hands.b].some(id => !CARDS[id].catalogs.includes('duel')) ? 'climats' : 'duel');
  const s = createGame(hands, timed, cat);
  const { pos, nextId } = fromFen(fen);
  s.pos = pos;
  s.nextPieceId = nextId;
  s.keys = [positionKey(s)];
  return s;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    pos: clonePosition(s.pos),
    effects: s.effects.slice(),
    hands: { w: s.hands.w.map(h => ({ ...h })), b: s.hands.b.map(h => ({ ...h })) },
    captured: { w: s.captured.w.slice(), b: s.captured.b.slice() },
    log: s.log.slice(),
    keys: s.keys.slice(),
    snaps: s.snaps.slice(),
  };
}

/**
 * État envoyé aux joueurs et aux spectateurs. Tout est public (mains des deux camps, cartes jouées ou non,
 * Présages annoncés) ; seules les clés de répétition, inutiles au client, sont retirées.
 */
export function viewState(s: GameState): GameState {
  return { ...s, keys: [] };
}

// ---------------------------------------------------------------------------------------------
// Effets

/** Modificateurs des effets arrivés : un Présage n'a aucun effet avant son arrivée. */
export function modsFromEffects(effects: Effect[]): Mods {
  const mods = emptyMods();
  for (const e of effects) {
    if (e.pending) continue;
    switch (e.card) {
      // Duel
      case 'ice_wall': mods.blocked[e.square!] = true; break;
      case 'freeze': mods.frozen.add(e.pieceId!); break;
      case 'shield': mods.shielded.add(e.pieceId!); break;
      case 'gravity': mods.range[e.countsOn] = 3; break;
      case 'knight_leap': mods.leap.add(e.pieceId!); break;
      case 'phase': mods.phase.add(e.pieceId!); break;
      // Pouvoirs
      case 'rift': for (const q of e.squares ?? []) mods.blocked[q] = true; break;
      case 'ice_age': mods.pawnsFrozen = true; break;
      case 'truce': mods.truce = true; break;
      case 'blood_moon': mods.mustCapture = true; break;
      case 'blast': mods.blast = true; break;
    }
  }
  return mods;
}

/** Copie d'un effet arrivé (sans les marques du Présage). */
function arrive(e: Effect): Effect {
  const a = { ...e };
  delete a.pending;
  delete a.delay;
  return a;
}

/**
 * Décompte les effets après un coup de `mover` et retire ceux qui expirent.
 * - Duel : seuls les effets dont `countsOn` est `mover` baissent.
 * - Pouvoirs (`global`) : tous baissent, sauf un effet permanent ; un Présage perd 1 de `delay` et arrive à 0
 *   (sans être décompté ce coup-là) ; un Climat qui arrive remplace le Climat actif, qui s'arrête sans finir
 *   son compte.
 */
export function tickEffects(effects: Effect[], mover: Color): Effect[] {
  const climateArrives = effects.some(e => e.pending && (e.delay ?? 1) <= 1 && isClimate(e.card));
  const out: Effect[] = [];
  for (const e of effects) {
    if (e.pending) {
      const delay = (e.delay ?? 1) - 1;
      out.push(delay > 0 ? { ...e, delay } : arrive(e));
      continue;
    }
    if (climateArrives && isClimate(e.card)) continue;
    if (e.permanent) out.push(e);
    else if (e.global || e.countsOn === mover) {
      if (e.remaining > 1) out.push({ ...e, remaining: e.remaining - 1 });
    } else {
      out.push(e);
    }
  }
  return out;
}

/** Retire les effets liés à une pièce qui n'est plus sur l'échiquier (Duel). */
function dropOrphanEffects(effects: Effect[], pos: Position): Effect[] {
  if (!effects.some(e => e.pieceId !== undefined)) return effects;
  const alive = new Set<number>();
  for (const p of pos.board) if (p) alive.add(p.id);
  return effects.filter(e => e.pieceId === undefined || alive.has(e.pieceId));
}

/**
 * Modificateurs vus depuis la position de `s`, coup par coup : `[0]` pour le coup du camp au trait, `[1]` pour
 * la réponse, etc. (effets décomptés, arrivées et expirations comprises). Sert à l'IA, dont la recherche
 * doit savoir qu'une Trêve expire ou qu'un Climat annoncé arrive.
 */
export function modsSequence(s: GameState, plies: number): Mods[] {
  const out: Mods[] = [];
  let effects = s.effects;
  let mover = s.pos.turn;
  for (let k = 0; k < plies; k++) {
    out.push(effects.length ? modsFromEffects(effects) : NO_MODS);
    effects = tickEffects(effects, mover);
    mover = opposite(mover);
  }
  return out;
}

export function pieceSquare(pos: Position, id: number): number {
  return pos.board.findIndex(p => p?.id === id);
}

/** Duel : la pendule de `c` est-elle accélérée (Distorsion temporelle) ? */
export function timeWarpOn(s: GameState, c: Color): boolean {
  return s.effects.some(e => e.card === 'time_warp' && e.countsOn === c);
}

/** Sablier fou arrivé : les deux pendules s'écoulent deux fois plus vite. */
function hourglassOn(s: GameState): boolean {
  return s.effects.some(e => e.card === 'hourglass' && !e.pending);
}

/** Vitesse d'écoulement de la pendule de `c` (2 sous la Distorsion temporelle ou le Sablier fou). */
export function clockRate(s: GameState, c: Color): number {
  return timeWarpOn(s, c) || hourglassOn(s) ? 2 : 1;
}

/** Les coups ne rapportent pas d'incrément tant que le Sablier fou est actif (à lire AVANT le coup). */
export function incrementSuspended(s: GameState): boolean {
  return hourglassOn(s);
}

/** Cases qui portent un Terrain (Mur, Faille) : un seul Terrain par case. */
function terrainSquares(effects: Effect[]): Set<number> {
  const out = new Set<number>();
  for (const e of effects) {
    if (e.card === 'ice_wall' && e.square !== undefined) out.add(e.square);
    if (e.card === 'rift') for (const q of e.squares ?? []) out.add(q);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Coups

const nowMods = (s: GameState) => modsFromEffects(s.effects);
/** Effets tels qu'ils seront au prochain coup adverse (après décompte du coup du camp au trait). */
const afterMods = (s: GameState) => modsFromEffects(tickEffects(s.effects, s.pos.turn));

function isForbidden(m: Move, f: MoveRef): boolean {
  return m.from === f.from && m.to === f.to && (m.promo ?? null) === (f.promo ?? null);
}

/** Étapes 1 à 3 : coups sous les effets, coup interdit retiré (Duel), puis capture obligatoire (un seul filtre). */
function strictMoves(s: GameState, now: Mods, after: Mods): Move[] {
  let moves = legalMoves(s.pos, now, after);
  const f = s.forbidden;
  if (f) moves = moves.filter(m => !isForbidden(m, f));
  if (now.mustCapture) moves = applyMustCapture(moves);
  return moves;
}

/** Étape 4, « la magie cède » (R6) : hors échec, coups joués comme si les effets n'existaient pas pour ses pièces. */
function relaxedMoves(s: GameState, after: Mods): Move[] {
  if (inCheck(s.pos, s.pos.turn, after)) return [];
  const f = s.forbidden;
  return legalMoves(s.pos, NO_MODS, after)
    .filter(m => !f || !isForbidden(m, f))
    .map(m => ({ ...m, flags: m.flags | F_RELAXED }));
}

/**
 * Coups légaux du camp au trait, une seule chaîne pour tout le monde (client, serveur, IA à la racine) :
 * effets → coup interdit (Duel) → capture obligatoire → « la magie cède » si la liste est vide (Pouvoirs).
 */
export function legalMovesOf(s: GameState): Move[] {
  if (s.result) return [];
  const now = nowMods(s);
  const after = afterMods(s);
  const moves = strictMoves(s, now, after);
  if (moves.length || !magicYields(s)) return moves;
  return relaxedMoves(s, after);
}

/** Existe-t-il un coup sous les effets (sans « la magie cède ») ? La capture obligatoire ne vide jamais la liste. */
function hasStrictLegal(s: GameState): boolean {
  const f = s.forbidden;
  return hasLegalMove(s.pos, nowMods(s), afterMods(s), f ? m => isForbidden(m, f) : undefined);
}

/** Existe-t-il un coup jouable, « la magie cède » comprise ? */
function hasLegal(s: GameState): boolean {
  if (hasStrictLegal(s)) return true;
  if (!magicYields(s)) return false;
  const after = afterMods(s);
  if (inCheck(s.pos, s.pos.turn, after)) return false;
  const f = s.forbidden;
  return hasLegalMove(s.pos, NO_MODS, after, f ? m => isForbidden(m, f) : undefined);
}

/**
 * Le roi de `c` est-il en échec ? Pour le camp au trait (R5) : l'adversaire pourra-t-il le prendre à son
 * prochain coup, avec les effets tels qu'ils seront à ce moment-là (arrivées et expirations comprises) ?
 */
export function sideInCheck(s: GameState, c: Color = s.pos.turn): boolean {
  return inCheck(s.pos, c, c === s.pos.turn ? afterMods(s) : nowMods(s));
}

/**
 * Nature de l'échec du camp au trait, pour l'affichage (R5) : 'now' (échec ordinaire), 'close' (à la fermeture
 * d'une Faille), 'melt' (à la fonte d'un Mur : Duel, et Murs posés avant qu'il ne devienne permanent) ; null sans
 * échec. Seules ces fins d'effet rendent une attaque au camp adverse : aucun Présage ne change les attaques (une
 * arrivée ne donne jamais échec), et les autres effets du Duel qui en retirent se décomptent sur les coups de
 * leur victime.
 */
export type CheckKind = 'now' | 'melt' | 'close';
export function checkKind(s: GameState): CheckKind | null {
  const c = s.pos.turn;
  if (!inCheck(s.pos, c, afterMods(s))) return null;
  if (inCheck(s.pos, c, nowMods(s))) return 'now';
  // La cause : chaque fin d'effet est essayée seule, à partir des effets actuels.
  const next = tickEffects(s.effects, c);
  const ended = (card: CardId) => s.effects.filter(e => !e.pending && e.card === card && !next.some(x => x.id === e.id)).map(e => e.id);
  const checkWithout = (ids: number[]) => ids.length > 0 && inCheck(s.pos, c, modsFromEffects(s.effects.filter(e => !ids.includes(e.id))));
  const closed = ended('rift');
  const melted = ended('ice_wall');
  if (checkWithout(closed)) return 'close';
  if (checkWithout(melted)) return 'melt';
  // Échec qui naît de plusieurs fins combinées (Faille et Mur) : ordre de priorité fixe.
  return closed.length ? 'close' : 'melt';
}

export interface MoveInfo {
  san: string;
  move: Move;
  pieceId: number;
  capturedId: number | null;
  check: boolean;
  /** Échec « à la fermeture », « à la fonte »… du camp qui va jouer (R5). */
  checkKind?: CheckKind | null;
  /** Déflagration : identifiants des pièces détruites par l'explosion (la pièce qui capture comprise). */
  blasted?: number[];
  /** Effets arrivés (Présage) et expirés à la fin de ce coup (identifiants d'effet). */
  arrived?: number[];
  expired?: number[];
}

export type Outcome<I> = { ok: true; state: GameState; info: I } | { ok: false; error: string };

/** Duel : instantané de `s` avant le coup `next` (Retour arrière) ; on n'en garde que deux. */
function pushSnapshot(n: GameState, s: GameState, next: Snapshot['next']) {
  n.snaps = [...s.snaps, {
    pos: clonePosition(s.pos),
    effects: s.effects,
    captured: { w: s.captured.w.slice(), b: s.captured.b.slice() },
    cardPlayed: s.cardPlayed,
    ply: s.ply,
    keysLen: s.keys.length,
    forbidden: s.forbidden,
    next,
  }].slice(-2);
}

/**
 * Fin de tour commune à un coup et à un Rituel : décompte des effets, trait à l'adversaire (déjà donné par
 * le coup), clé de position et fin de partie éventuelle. Renvoie les effets arrivés et expirés.
 */
function finishTurn(n: GameState, mover: Color): { arrived: number[]; expired: number[] } {
  const before = n.effects;
  n.effects = dropOrphanEffects(tickEffects(before, mover), n.pos);
  n.cardPlayed = false;
  n.forbidden = null;
  n.ply++;
  n.keys.push(positionKey(n));
  n.result = evaluateEnd(n);
  const arrived = before.filter(e => e.pending && n.effects.some(x => x.id === e.id && !x.pending)).map(e => e.id);
  const expired = before.filter(e => !n.effects.some(x => x.id === e.id)).map(e => e.id);
  return { arrived, expired };
}

/** « La magie cède » : un Terrain sur lequel une pièce s'est arrêtée disparaît de cette case. */
function clearTerrainUnder(effects: Effect[], pos: Position, blocked: boolean[]): Effect[] {
  const occupied = (q: number) => blocked[q] && !!pos.board[q];
  return effects.flatMap(e => {
    if (e.card === 'ice_wall' && e.square !== undefined && occupied(e.square)) return [];
    if (e.card === 'rift' && e.squares?.some(occupied)) return [{ ...e, squares: e.squares.filter(q => !occupied(q)) }];
    return [e];
  });
}

export function playMove(s: GameState, from: number, to: number, promo?: PieceType): Outcome<MoveInfo> {
  if (s.result) return { ok: false, error: 'La partie est terminée.' };
  const legal = legalMovesOf(s);
  const candidates = legal.filter(m => m.from === from && m.to === to);
  if (!candidates.length) return { ok: false, error: 'Coup illégal.' };
  const m = candidates.find(c => !(c.flags & F_PROMO) || c.promo === (promo ?? 'q'));
  if (!m) return { ok: false, error: 'Promotion invalide.' };
  const mover = s.pos.turn;
  const now = nowMods(s);
  const san = toSan(s.pos, m, legal);
  const n = cloneState(s);
  if (catalogOf(s) === 'duel') pushSnapshot(n, s, { from: m.from, to: m.to, promo: m.promo, log: s.log.length });
  const u = makeMove(n.pos, m);
  if (u.captured) n.captured[u.captured.c].push(u.captured.t);
  for (const x of u.blasted ?? []) n.captured[x.piece.c].push(x.piece.t);
  // Trêve et Ère glaciaire : le compteur des 50 coups ne monte pas (une prise ou un pion le remet à zéro).
  if (now.truce || now.pawnsFrozen) n.pos.halfmove = Math.min(n.pos.halfmove, s.pos.halfmove);
  if (m.flags & F_RELAXED) n.effects = clearTerrainUnder(n.effects, n.pos, now.blocked);
  const fx = finishTurn(n, mover);
  const check = sideInCheck(n);
  const kind = check ? checkKind(n) : null;
  n.log.push({ k: 'move', c: mover, san: san + (check ? '+' : ''), from: m.from, to: m.to, promo: m.promo });
  if (n.result?.reason === 'checkmate') {
    const last = n.log[n.log.length - 1] as Extract<LogEntry, { k: 'move' }>;
    n.log[n.log.length - 1] = { ...last, san: last.san.replace(/\+$/, '') + '#' };
  }
  return {
    ok: true,
    state: n,
    info: {
      san, move: m, pieceId: u.moved.id, capturedId: u.captured?.id ?? null, check, checkKind: kind,
      ...(u.blasted ? { blasted: u.blasted.map(x => x.piece.id) } : {}),
      arrived: fx.arrived, expired: fx.expired,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Cartes

export interface CardInfo {
  card: CardId;
  caster: Color;
  targets: number[];
  /** Identifiants des pièces concernées (gelée, foudroyée, ressuscitée, pions de la Marée…). */
  pieces: number[];
  skin: string;
  /** Effet créé par la carte (identifiant), le cas échéant. */
  effectId?: number;
  /** Rituel : la carte a tenu lieu de coup, le trait passe à l'adversaire. */
  ritual?: boolean;
  /** Déplacements à animer : pions de la Grande Marée (de → vers). */
  moves?: { from: number; to: number }[];
  /** Rituel : effets arrivés et expirés à la fin du tour. */
  arrived?: number[];
  expired?: number[];
}

/** Vérifications communes : tour du joueur, carte disponible, une seule carte par tour. */
function cardPrecheck(s: GameState, color: Color, index: number): string | null {
  if (s.result) return 'La partie est terminée.';
  if (s.pos.turn !== color) return "Ce n'est pas votre tour.";
  if (s.cardPlayed) return 'Une seule carte par tour.';
  const h = s.hands[color][index];
  if (!h) return 'Carte inconnue.';
  if (h.used) return 'Carte déjà utilisée.';
  return null;
}

function bestRevivable(captured: PieceType[]): PieceType | null {
  for (const t of ['r', 'b', 'n'] as PieceType[]) if (captured.includes(t)) return t;
  return null;
}

/** Faille : cases vides (et sans Terrain) de la rangée, qui formeront le gouffre. */
function riftSquares(s: GameState, rank: number): number[] {
  const terrain = terrainSquares(s.effects);
  const out: number[] = [];
  for (let f = 0; f < 8; f++) {
    const q = rank * 8 + f;
    if (!s.pos.board[q] && !terrain.has(q)) out.push(q);
  }
  return out;
}

/**
 * Grande Marée : pions des deux camps sur leurs 2e à 5e rangées dont la case suivante est libre (dans la
 * position d'avant la marée : déplacement simultané), ni murée ni dans le gouffre. Deux pions qui visent la
 * même case ne bougent ni l'un ni l'autre. Les pions gelés (Ère glaciaire) ne bougent pas.
 */
export function tidePushes(s: GameState): { from: number; to: number }[] {
  const b = s.pos.board;
  const mods = nowMods(s);
  if (mods.pawnsFrozen) return [];
  const pushes: { from: number; to: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p.t !== 'p' || mods.frozen.has(p.id)) continue;
    const rel = p.c === 'w' ? rankOf(i) : 7 - rankOf(i);
    if (rel < 1 || rel > 4) continue;
    const to = i + (p.c === 'w' ? 8 : -8);
    if (b[to] || mods.blocked[to]) continue;
    pushes.push({ from: i, to });
  }
  return pushes.filter(x => pushes.filter(y => y.to === x.to).length === 1);
}

/** Cases candidates pour la prochaine cible, avant le contrôle de validité complet. */
function rawCandidates(s: GameState, color: Color, card: CardId, partial: number[]): number[] {
  const b = s.pos.board;
  const mods = nowMods(s);
  const them = opposite(color);
  const out: number[] = [];
  const each = (pred: (p: Piece | null, i: number) => boolean) => {
    for (let i = 0; i < 64; i++) if (pred(b[i], i)) out.push(i);
  };
  switch (card) {
    case 'ice_wall': {
      // Pouvoirs : une case vide des rangées 3 à 6 ; Duel (anciennes parties) : n'importe quelle case vide.
      const terrain = terrainSquares(s.effects);
      const anyRank = catalogOf(s) === 'duel';
      each((p, i) => !p && !mods.blocked[i] && !terrain.has(i) && (anyRank || (rankOf(i) >= 2 && rankOf(i) <= 5)));
      break;
    }
    case 'rift': {
      // Une seule Faille à la fois ; la cible désigne la rangée (4e ou 5e), qui doit avoir une case vide.
      if (s.effects.some(e => e.card === 'rift')) break;
      for (const rank of [3, 4]) if (riftSquares(s, rank).length) for (let f = 0; f < 8; f++) out.push(rank * 8 + f);
      out.sort((x, y) => x - y);
      break;
    }
    case 'freeze':
      each(p => !!p && p.c === them && p.t !== 'k' && !mods.frozen.has(p.id) && !mods.shielded.has(p.id));
      break;
    case 'lightning':
      each(p => !!p && p.c === them && p.t === 'p' && !mods.shielded.has(p.id));
      break;
    case 'shield':
      each(p => !!p && p.c === color && p.t !== 'k' && !mods.shielded.has(p.id));
      break;
    case 'knight_leap':
    case 'phase':
      each(p => !!p && p.c === color && isSlider(p.t) && !mods.frozen.has(p.id));
      break;
    case 'swap': {
      const first = partial[0];
      each((p, i) => {
        if (!p || p.c !== color || p.t === 'k' || mods.frozen.has(p.id)) return false;
        if (first === undefined) return true;
        if (i === first) return false;
        const a = b[first]!;
        const lastRank = (x: number) => rankOf(x) === 0 || rankOf(x) === 7;
        if (a.t === 'p' && lastRank(i)) return false;
        if (p.t === 'p' && lastRank(first)) return false;
        return true;
      });
      break;
    }
    case 'revive': {
      const pieceRank = color === 'w' ? 0 : 7;
      const pawnRank = color === 'w' ? 1 : 6;
      const caps = s.captured[color];
      const canPiece = bestRevivable(caps) !== null;
      const canPawn = caps.includes('p');
      each((p, i) => !p && !mods.blocked[i] &&
        ((canPiece && rankOf(i) === pieceRank) || (canPawn && rankOf(i) === pawnRank)));
      break;
    }
    default:
      break;
  }
  return out;
}

/** Applique l'effet brut de la carte (sans les contrôles de fin). */
function applyCardRaw(s: GameState, color: Color, index: number, targets: number[], skin: string): { state: GameState; info: CardInfo } | string {
  const card = s.hands[color][index].card;
  const def = CARDS[card];
  if (targets.length !== def.targets) return 'Cible manquante.';
  for (let k = 0; k < targets.length; k++) {
    if (!rawCandidates(s, color, card, targets.slice(0, k)).includes(targets[k])) return 'Cible invalide.';
  }
  if (def.timedOnly && !s.timed) return 'Cette carte demande une partie avec pendule.';
  const them = opposite(color);
  const n = cloneState(s);
  n.hands[color][index] = { card, used: true };
  n.cardPlayed = true;
  const info: CardInfo = { card, caster: color, targets, pieces: [], skin };
  const addEffect = (extra: Partial<Effect>) => {
    // Pouvoirs : effet des deux camps (décompté sur leurs coups, ou permanent). Duel : `turns` coups d'un camp
    // (le Mur de glace d'une ancienne partie Duel garde ses 3 coups adverses).
    const global = catalogOf(s) === 'climats' && (def.coups !== undefined || !!def.permanent);
    const permanent = global && !!def.permanent;
    const turns = permanent ? 0 : (global ? def.coups : def.turns) ?? 1;
    const e: Effect = {
      id: n.nextEffectId++, card, caster: color, countsOn: global ? color : def.countsOnOpponent ? them : color,
      remaining: turns, total: turns, skin,
      ...(global ? { global: true } : {}),
      ...(permanent ? { permanent: true } : {}),
      ...(def.presage ? { pending: true, delay: 2 } : {}),
      ...extra,
    };
    n.effects = [...n.effects, e];
    info.effectId = e.id;
  };
  const b = n.pos.board;
  switch (card) {
    // ----- Climats (Présage) -----
    case 'hourglass':
    case 'truce':
    case 'blood_moon':
    case 'ice_age':
    case 'blast':
      // Un seul Climat annoncé à la fois (R1) ; il remplacera le Climat actif à son arrivée.
      if (s.effects.some(e => e.pending && isClimate(e.card))) return 'Un Climat est déjà annoncé.';
      addEffect({});
      break;
    // ----- Terrains -----
    case 'ice_wall':
      addEffect({ square: targets[0] });
      break;
    case 'rift':
      addEffect({ squares: riftSquares(s, rankOf(targets[0])) });
      break;
    // ----- Événements -----
    case 'tide': {
      // Rituel : la marée est le coup du lanceur. Sous la Lune de sang, qui peut prendre doit prendre : la marée,
      // qui ne prend rien, n'est permise que si aucune capture n'est jouable.
      const mods = nowMods(s);
      if (mods.mustCapture && strictMoves(s, mods, afterMods(s)).some(isCapture)) return 'La Lune de sang impose une capture.';
      const pushes = tidePushes(s);
      if (!pushes.length) return 'Aucun pion ne peut avancer.';
      const pieces = pushes.map(x => b[x.from]!);
      for (const x of pushes) b[x.from] = null;
      pushes.forEach((x, k) => { b[x.to] = pieces[k]; });
      info.pieces = pieces.map(p => p.id);
      info.moves = pushes;
      info.ritual = true;
      n.pos.ep = -1;
      n.pos.halfmove = 0;
      if (color === 'b') n.pos.fullmove++;
      n.pos.turn = them;
      break;
    }
    // ----- Duel -----
    case 'time_warp':
      if (timeWarpOn(s, them)) return 'La pendule adverse est déjà accélérée.';
      addEffect({});
      break;
    case 'gravity':
      if (s.effects.some(e => e.card === 'gravity' && e.countsOn === them)) return 'Gravité déjà active.';
      if (!b.some(p => p && p.c === them && isSlider(p.t))) return "L'adversaire n'a ni tour, ni fou, ni dame.";
      addEffect({});
      break;
    case 'freeze':
    case 'shield':
    case 'knight_leap':
    case 'phase': {
      const id = b[targets[0]]!.id;
      info.pieces.push(id);
      addEffect({ pieceId: id });
      break;
    }
    case 'lightning': {
      const victim = b[targets[0]]!;
      info.pieces.push(victim.id);
      b[targets[0]] = null;
      n.captured[them].push('p');
      if (n.pos.ep >= 0 && targets[0] === n.pos.ep + (them === 'w' ? 8 : -8)) n.pos.ep = -1;
      n.effects = dropOrphanEffects(n.effects, n.pos);
      break;
    }
    case 'swap': {
      const [a, c] = targets;
      info.pieces.push(b[a]!.id, b[c]!.id);
      [b[a], b[c]] = [b[c], b[a]];
      const bits: Record<number, number> = { 7: 1, 0: 2, 63: 4, 56: 8 };
      for (const x of targets) if (bits[x] !== undefined) n.pos.castling &= ~bits[x];
      break;
    }
    case 'revive': {
      const t = rankOf(targets[0]) === (color === 'w' ? 1 : 6) ? 'p' : bestRevivable(n.captured[color])!;
      const k = n.captured[color].indexOf(t);
      n.captured[color].splice(k, 1);
      const piece: Piece = { id: n.nextPieceId++, t, c: color };
      b[targets[0]] = piece;
      info.pieces.push(piece.id);
      break;
    }
    case 'rewind': {
      const snap = s.snaps[s.snaps.length - 1];
      if (!snap || snap.pos.turn !== them) return "Aucun coup adverse à annuler.";
      n.pos = clonePosition(snap.pos);
      n.effects = snap.effects;
      n.captured = { w: snap.captured.w.slice(), b: snap.captured.b.slice() };
      n.cardPlayed = snap.cardPlayed;
      n.ply = snap.ply;
      n.keys = s.keys.slice(0, snap.keysLen);
      n.snaps = s.snaps.slice(0, -1);
      n.forbidden = { from: snap.next.from, to: snap.next.to, promo: snap.next.promo };
      const entry = n.log[snap.next.log];
      if (entry && entry.k === 'move') n.log[snap.next.log] = { ...entry, undone: true };
      info.targets = [snap.next.from, snap.next.to];
      break;
    }
  }
  n.log.push({ k: 'card', c: color, card, targets: info.targets });
  if (def.ritual) {
    // Le Rituel termine le tour comme un coup (décompte des effets, trait adverse, fin de partie).
    const fx = finishTurn(n, color);
    info.arrived = fx.arrived;
    info.expired = fx.expired;
  }
  return { state: n, info };
}

/**
 * Sonde d'un garde-fou de Présage : la position de `n`, trait à `turn`, avec les effets `effects`, sans coup
 * interdit ni carte jouée.
 */
function probeState(n: GameState, turn: Color, effects: Effect[]): GameState {
  const pos = clonePosition(n.pos);
  if (pos.turn !== turn) {
    pos.turn = turn;
    pos.ep = -1;
  }
  return { ...n, pos, effects, forbidden: null, cardPlayed: false, result: null };
}

/**
 * Présage (Climats) : R4b jugée aussi à l'arrivée, en supposant que les coups d'ici là ne changent rien. Au tour
 * suivant du lanceur, l'effet arrivé, il garde un coup légal sous les effets, sauf s'il était déjà bloqué avant
 * la carte. Sans cela, un camp réduit aux coups de pion annoncerait l'Ère glaciaire pour pousser ensuite ses
 * pions par « la magie cède » pendant que ceux de l'adversaire sont gelés (de même pour la Trêve quand il n'a
 * que des prises). La sonde compare le même monde avec et sans le nouvel effet : seul l'effet de la carte est
 * jugé.
 * Les autres garde-fous n'ont pas besoin d'être jugés à l'arrivée : aucun Climat ne change les attaques, donc
 * une arrivée ne met jamais un roi en échec (R4a) ni l'adversaire sans aucun coup (« la magie cède » lui rend
 * toujours ses coups ordinaires).
 */
function presageRefusal(s: GameState, n: GameState, color: Color, id: number): string | null {
  const them = opposite(color);
  const others = n.effects.filter(e => e.id !== id);
  const arrival = (effects: Effect[]) => probeState(n, color, tickEffects(tickEffects(effects, color), them));
  if (hasStrictLegal(s) && hasStrictLegal(arrival(others)) && !hasStrictLegal(arrival(n.effects))) {
    return 'À son arrivée, cette carte vous laisserait sans aucun coup.';
  }
  return null;
}

/**
 * Garde-fous après une carte (R4) :
 * a) elle ne met jamais le roi adverse en échec ;
 * b) le lanceur garde un coup légal sous les effets (« la magie cède » ne compte pas, sauf s'il était déjà
 *    bloqué ; Présage : aussi à l'arrivée, `presageRefusal`) ; un Rituel est un coup : il ne peut pas laisser
 *    le roi du lanceur en échec.
 */
function validateAfterCard(s: GameState, n: GameState, color: Color, card: CardId, info: CardInfo): string | null {
  if (card === 'rewind') {
    return hasLegal(n) ? null : "L'adversaire n'aurait aucun autre coup possible.";
  }
  const them = opposite(color);
  if (CARDS[card].ritual) {
    if (inCheck(n.pos, color, nowMods(n))) return 'Ce rituel laisserait votre roi en échec.';
    if (inCheck(n.pos, them, nowMods(n)) || sideInCheck(n)) return 'Une carte ne peut pas mettre le roi adverse en échec.';
    return null;
  }
  if (inCheck(n.pos, them, nowMods(n))) return 'Une carte ne peut pas mettre le roi adverse en échec.';
  if (!hasLegal(n)) return 'Après cette carte, vous n’auriez plus aucun coup légal.';
  if (magicYields(n) && !hasStrictLegal(n) && hasStrictLegal(s)) return 'Cette carte vous laisserait sans aucun coup.';
  if (CARDS[card].presage && info.effectId !== undefined && magicYields(n)) return presageRefusal(s, n, color, info.effectId);
  return null;
}

function tryCard(s: GameState, color: Color, index: number, targets: number[], skin: string): Outcome<CardInfo> {
  const pre = cardPrecheck(s, color, index);
  if (pre) return { ok: false, error: pre };
  const r = applyCardRaw(s, color, index, targets, skin);
  if (typeof r === 'string') return { ok: false, error: r };
  const err = validateAfterCard(s, r.state, color, s.hands[color][index].card, r.info);
  if (err) return { ok: false, error: err };
  return { ok: true, state: r.state, info: r.info };
}

/** Cases valides pour la prochaine cible de la carte `index`, sachant les cibles déjà choisies. */
export function cardOptions(s: GameState, color: Color, index: number, partial: number[] = []): number[] {
  if (cardPrecheck(s, color, index)) return [];
  const card = s.hands[color][index].card;
  const need = CARDS[card].targets;
  if (partial.length >= need) return [];
  return rawCandidates(s, color, card, partial).filter(t => {
    const chosen = [...partial, t];
    if (chosen.length === need) return tryCard(s, color, index, chosen, '').ok;
    return rawCandidates(s, color, card, chosen).some(t2 => tryCard(s, color, index, [...chosen, t2], '').ok);
  });
}

/** La carte peut-elle être jouée maintenant (avec au moins une cible valide) ? */
export function cardPlayable(s: GameState, color: Color, index: number): boolean {
  if (cardPrecheck(s, color, index)) return false;
  const card = s.hands[color][index].card;
  if (CARDS[card].targets === 0) return tryCard(s, color, index, [], '').ok;
  return cardOptions(s, color, index).length > 0;
}

/** Raison pour laquelle la carte ne peut pas être jouée maintenant (sans cible : la première trouvée), ou null. */
export function cardRefusal(s: GameState, color: Color, index: number, targets: number[] = []): string | null {
  const r = tryCard(s, color, index, targets, '');
  return r.ok ? null : r.error;
}

export function playCard(s: GameState, color: Color, index: number, targets: number[], skin: string): Outcome<CardInfo> {
  const r = tryCard(s, color, index, targets, skin);
  if (!r.ok) return r;
  // Un Rituel a déjà évalué la fin de partie pour l'adversaire (finishTurn).
  if (!r.info.ritual) r.state.result = evaluateEnd(r.state);
  return r;
}

function hasPlayableCard(s: GameState, color: Color): boolean {
  return s.hands[color].some((_, i) => cardPlayable(s, color, i));
}

// ---------------------------------------------------------------------------------------------
// Fins de partie

export function positionKey(s: GameState): string {
  let k = '';
  for (const p of s.pos.board) k += p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.';
  k += s.pos.turn + s.pos.castling + ':' + s.pos.ep;
  for (const e of s.effects) {
    k += `|${e.card}${e.countsOn}${e.remaining}:${e.square ?? ''}:${e.pieceId ?? ''}`;
    if (e.delay) k += `d${e.delay}`;
    if (e.squares) k += `s${e.squares.join(',')}`;
  }
  k += '|' + s.hands.w.map(h => (h.used ? 1 : 0)).join('') + s.hands.b.map(h => (h.used ? 1 : 0)).join('');
  return k;
}

/**
 * Paires de Murs de glace (rangées 3 à 6) avec lesquelles une seule pièce mineure peut mater : Roi et Cavalier, ou
 * Roi et Fou de la bonne couleur, contre Roi. Vérifié par force brute : aucun mat avec un seul Mur ; ces 16 paires, au
 * bord de l'échiquier, suffisent au cavalier, et chacune à une seule couleur de fou (`light` : fou de cases claires ;
 * Murs a3 et a5, Rc4, Fc6# contre Ra4).
 */
const WALL_MATE_PAIRS: { squares: [number, number]; light: boolean }[] = (
  [['a3', 'b4', 1], ['a3', 'a5', 1], ['b3', 'a4', 0], ['g3', 'h4', 1], ['h3', 'g4', 0], ['h3', 'h5', 0],
    ['a4', 'b5', 0], ['a4', 'a6', 0], ['b4', 'a5', 1], ['g4', 'h5', 0], ['h4', 'g5', 1], ['h4', 'h6', 1],
    ['a5', 'b6', 1], ['b5', 'a6', 0], ['g5', 'h6', 1], ['h5', 'g6', 0]] as const
).map(([x, y, l]) => ({ squares: [sqIndex(x), sqIndex(y)], light: l === 1 }));

/** Cartes `card` encore en main, des deux camps (un mat aidé compte : chacun peut poser des Terrains). */
const unusedCards = (s: GameState, card: CardId) =>
  s.hands.w.filter(h => !h.used && h.card === card).length + s.hands.b.filter(h => !h.used && h.card === card).length;

/** Pièces mineures d'un camp, pour savoir quelles paires de Murs peuvent lui servir. */
interface Minors { knight: boolean; lightBishop: boolean; darkBishop: boolean }

/**
 * Pouvoirs : les Terrains posés ou encore en main (des deux camps) peuvent-ils permettre un mat avec ces pièces ?
 * - deux Murs formant une paire de `WALL_MATE_PAIRS` utilisable par l'une des pièces ;
 * - une Faille (posée ou en main) avec au moins un Mur (posé ou en main) : une Faille ferme toute une rangée, et les
 *   combinaisons possibles (Murs c3 et e3 avec la Faille de la 4e rangée, par exemple) sont trop nombreuses pour une
 *   table : par prudence, on considère qu'un mat reste possible (la règle des 50 coups reste).
 */
function terrainMate(s: GameState, m: Minors): boolean {
  const walls = new Set<number>();
  let riftPosed = false;
  for (const e of s.effects) {
    if (e.card === 'ice_wall' && e.square !== undefined) walls.add(e.square);
    if (e.card === 'rift') riftPosed = true;
  }
  const wallCards = unusedCards(s, 'ice_wall');
  if ((riftPosed || unusedCards(s, 'rift') > 0) && walls.size + wallCards > 0) return true;
  return WALL_MATE_PAIRS.some(pair => {
    if (!m.knight && !(pair.light ? m.lightBishop : m.darkBishop)) return false;
    return pair.squares.filter(q => !walls.has(q)).length <= wallCards;
  });
}

/**
 * Une carte ou un effet permet-il à `c` de mater avec une seule pièce mineure ?
 * - Pouvoirs : des Murs (et une Faille) bien placés, posés ou encore en main (`terrainMate`).
 * - Duel (anciennes parties) : Résurrection en main avec une pièce à ressusciter, ou Mur de glace (3 coups,
 *   n'importe quelle case) en main ou posé : Mur g8, puis Fd4# ou Cf7# contre Rh8.
 */
function cardMateHelp(s: GameState, c: Color): boolean {
  const m: Minors = { knight: false, lightBishop: false, darkBishop: false };
  s.pos.board.forEach((p, i) => {
    if (!p || p.c !== c) return;
    if (p.t === 'n') m.knight = true;
    if (p.t === 'b') {
      if (isLightSquare(i)) m.lightBishop = true;
      else m.darkBishop = true;
    }
  });
  const minor = m.knight || m.lightBishop || m.darkBishop;
  if (catalogOf(s) !== 'duel') return minor && terrainMate(s, m);
  const inHand = (card: CardId) => s.hands[c].some(h => !h.used && h.card === card);
  if (inHand('revive') && s.captured[c].some(t => t !== 'q')) return true;
  return minor && (inHand('ice_wall') || s.effects.some(e => e.card === 'ice_wall'));
}

function insufficientMaterial(s: GameState): boolean {
  if (cardMateHelp(s, 'w') || cardMateHelp(s, 'b')) return false;
  const minors: { t: PieceType; light: boolean }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = s.pos.board[i];
    if (!p || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false;
    minors.push({ t: p.t, light: isLightSquare(i) });
  }
  if (minors.length <= 1) return true;
  if (!minors.every(m => m.t === 'b' && m.light === minors[0].light)) return false;
  // Fous de même couleur des deux camps : avec un Terrain, les pièces du camp maté peuvent boucher des fuites.
  // Par prudence, la nulle attend qu'aucun Terrain ne puisse plus servir (la règle des 50 coups reste).
  return !(magicYields(s) && (s.effects.some(e => e.card === 'ice_wall' || e.card === 'rift') ||
    unusedCards(s, 'ice_wall') + unusedCards(s, 'rift') > 0));
}

/**
 * Fin de partie éventuelle pour le camp au trait. Sans coup jouable (« la magie cède » comprise) : une carte
 * qui en redonne un doit être jouée s'il en existe une (R4c), sinon mat si le roi est en échec (R5), pat sinon.
 */
export function evaluateEnd(s: GameState): Result | null {
  const turn = s.pos.turn;
  if (!hasLegal(s)) {
    if (!s.cardPlayed && hasPlayableCard(s, turn)) return null;
    return sideInCheck(s, turn) ? { winner: opposite(turn), reason: 'checkmate' } : { winner: null, reason: 'stalemate' };
  }
  if (s.pos.halfmove >= 100) return { winner: null, reason: 'fifty' };
  const key = s.keys[s.keys.length - 1];
  if (key && s.keys.filter(k => k === key).length >= 3) return { winner: null, reason: 'repetition' };
  if (insufficientMaterial(s)) return { winner: null, reason: 'insufficient' };
  return null;
}

/** Le camp `c` a-t-il assez de matériel pour mater (utile quand l'autre tombe au temps) ? */
export function canStillMate(s: GameState, c: Color): boolean {
  if (cardMateHelp(s, c)) return true;
  let minors = 0;
  for (const p of s.pos.board) {
    if (!p || p.c !== c || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return true;
    minors++;
  }
  return minors >= 2;
}

// ---------------------------------------------------------------------------------------------
// Affichage

export const RESULT_TEXT: Record<ResultReason, string> = {
  checkmate: 'Échec et mat',
  stalemate: 'Pat',
  resign: 'Abandon',
  timeout: 'Temps écoulé',
  repetition: 'Triple répétition',
  fifty: 'Règle des 50 coups',
  insufficient: 'Matériel insuffisant',
  agreement: 'Nulle par accord',
  abandon: 'Adversaire parti',
  aborted: 'Partie annulée',
};

/**
 * Libellé d'une carte jouée, pour le journal. Les journaux des parties jouées avant le retrait de quatre cartes
 * (Couronnement, Chevauchée, Portails, Déjà-vu) peuvent nommer une carte qui n'existe plus : son identifiant est
 * alors affiché tel quel.
 */
export function describeCardPlay(card: CardId, targets: number[]): string {
  if (!isCardId(card)) return String(card);
  const name = CARDS[card].name;
  if (card === 'swap') return `${name} ${sqName(targets[0])}⇄${sqName(targets[1])}`;
  if (card === 'rewind') return `${name} (${sqName(targets[0])}-${sqName(targets[1])})`;
  if (card === 'rift') return `${name}, rangée ${rankOf(targets[0]) + 1}`;
  if (targets.length === 1) return `${name} ${sqName(targets[0])}`;
  return name;
}
