// Partie locale de l'accueil : le visiteur (Blancs) contre l'IA du navigateur (Web Worker, src/client/ai),
// avec ses trois cartes, les vrais effets 3D et une sauvegarde locale qui survit au rechargement.
//
//   const g = useLiveGame({ skin, theme, active });
//   <Board ref={g.boardRef} {...g.boardProps} />
//   g.hand / g.playable / g.selected / g.pickCard(i) / g.castSelected() / g.cancel() / g.prompt
//   g.newGame() / g.resign() / g.level / g.setLevel(l)
//
// `active` (mode immersif) : les sorts s'animent en 3D et l'IA joue. Hors mode immersif, la partie est en pause :
// l'IA attend, et la scène 3D est vidée (aucun rendu WebGL pour un échiquier qu'on ne regarde pas).
// La scène 3D n'est créée qu'à la première intention de jouer (`warm`) ou au passage en mode immersif.
//
// Partie en direct (`startDuel`) : deux visiteurs de l'accueil appariés par le serveur jouent l'un contre l'autre sur
// ce même échiquier. Le visiteur peut alors avoir les Noirs ; ses coups partent au serveur (et s'affichent aussitôt),
// ceux de l'adversaire arrivent par game:update et s'animent. Rien n'est sauvegardé localement : la partie est au
// serveur, et la partie contre l'Oracle reprend ensuite.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOT_PROFILES, askBot } from '../ai';
import { rememberLocalGame } from '../features/history';
import type { BotLevel } from '../ai';
import { CARDS, isCardId } from '../../shared/cards';
import type { CardDef, Catalog } from '../../shared/cards';
import { opposite } from '../../shared/chess';
import type { Color, PieceType } from '../../shared/chess';
import { skinStyle } from '../../shared/catalog';
import { cardOptions, cardPlayable, createGame, dealHands, legalMovesOf, playCard, playMove, positionKey, sideInCheck } from '../../shared/game';
import type { Ack, GameUpdate, GameView, JoinReply } from '../../shared/protocol';
import { emitAck, getSocket } from '../socket';
import type { CardInfo, GameState, Result } from '../../shared/game';
import { checkSquare } from '../components/Board';
import type { BoardHandle } from '../components/Board';
import { playCardSound, playSound } from '../sound';
import { useVfx } from '../vfx/useVfx';
import { castSafely } from './castSafely';
import { liveCatalog } from './data';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Même partie, au coup près : position, effets, mains, fin. */
function sameGame(a: GameState, b: GameState) {
  return a.log.length === b.log.length && !!a.result === !!b.result && positionKey(a) === positionKey(b) && JSON.stringify(a.hands) === JSON.stringify(b.hands);
}

/** Partie en direct contre un autre visiteur de l'accueil. */
export interface HomeDuel {
  id: string;
  /** Couleur du visiteur. */
  me: Color;
  /** Pays de l'adversaire (code ISO), d'après son fuseau horaire. */
  country: string | null;
}
/** Ce que le serveur dit de la partie en direct, au-delà de la position. */
interface DuelInfo {
  status: GameView['status'];
  started: boolean;
  /** Depuis quand l'adversaire a quitté la page (horodatage serveur), null s'il est là. */
  away: number | null;
  claimAfterMs: number;
  /** L'IA joue pour ce camp (relais : le joueur ne jouait plus), jusqu'à ce qu'il reprenne la main. */
  standIn: Record<Color, boolean>;
}

export const PLAYER: Color = 'w';
export const BOT: Color = 'b';
const STORE_KEY = 'sm:odyssee:partie';
const LEVEL_KEY = 'sm:odyssee:niveau';

interface Saved {
  v: 1;
  state: GameState;
  savedAt: number;
}

function newGame(): GameState {
  const catalog = liveCatalog();
  return createGame(dealHands(false, false, Math.random, catalog), false, catalog);
}

/** Une sauvegarde est rejetée si sa forme ne correspond plus au moteur (cartes renommées, champs manquants). */
function validState(x: unknown): x is GameState {
  const s = x as GameState | null;
  if (!s || typeof s !== 'object' || !s.pos || !Array.isArray(s.pos.board) || s.pos.board.length !== 64) return false;
  if (s.pos.turn !== 'w' && s.pos.turn !== 'b') return false;
  if (!s.hands || !Array.isArray(s.hands.w) || !Array.isArray(s.hands.b)) return false;
  // Une sauvegarde d'avant les huit pouvoirs (Duel, ou carte retirée : Couronnement, Portails…) repart de zéro
  if (s.catalog !== 'climats') return false;
  if (![...s.hands.w, ...s.hands.b].every(h => h && isCardId(h.card))) return false;
  if (!Array.isArray(s.effects) || !s.effects.every(e => e && isCardId(e.card))) return false;
  if (!Array.isArray(s.log) || !Array.isArray(s.keys) || !Array.isArray(s.snaps) || !s.captured) return false;
  return true;
}

function loadSaved(): GameState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Saved;
    if (data?.v !== 1 || !validState(data.state) || data.state.result) return null;
    // Une partie oubliée depuis plus de 30 jours repart de zéro
    if (Date.now() - (data.savedAt ?? 0) > 30 * 24 * 3600 * 1000) return null;
    legalMovesOf(data.state);
    return data.state;
  } catch {
    return null;
  }
}

function persist(s: GameState) {
  try {
    if (s.result) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, state: s, savedAt: Date.now() } satisfies Saved));
  } catch {
    // stockage indisponible (navigation privée) : la partie vit le temps de la page
  }
}

function loadLevel(): BotLevel {
  try {
    const n = Number(localStorage.getItem(LEVEL_KEY));
    return n === 1 || n === 2 || n === 3 ? n : 2;
  } catch {
    return 2;
  }
}

export interface LastCast {
  card: string;
  /** 'relay' : l'IA l'a lancée pour le joueur (partie en direct, relais). */
  by: 'player' | 'bot' | 'relay';
  key: number;
}

export interface LiveGameOptions {
  /** Skin des sorts du joueur. */
  skin: string;
  /** Plateau (thème). */
  theme: string;
  /** Mode immersif : sorts animés en 3D, l'IA joue. */
  active: boolean;
  /** Skin des sorts de l'IA. */
  botSkin?: string;
  /** Préparer la scène 3D (three.js, ~1 s de calcul sur un téléphone) : dès que le visiteur manifeste l'intention de
   *  jouer. Elle est de toute façon créée au passage en mode immersif ; jamais au chargement de la page. */
  warm?: boolean;
}

export function useLiveGame({ skin, theme, active, botSkin = 'skin:void', warm = false }: LiveGameOptions) {
  // Chaque visite commence une partie neuve (retour du fondateur : « le site peut m'oublier un peu quand je recharge
  // la page »). La partie d'avant reste proposée, discrètement, jusqu'au premier coup de la nouvelle.
  const [previous, setPrevious] = useState<GameState | null>(() => {
    const p = loadSaved();
    return p && p.ply > 0 ? p : null;
  });
  const [state, setState] = useState<GameState>(newGame);
  const [level, setLevelState] = useState<BotLevel>(loadLevel);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [partial, setPartial] = useState<number[]>([]);
  const [casting, setCasting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastCast, setLastCast] = useState<LastCast | null>(null);
  const [botTick, setBotTick] = useState(0);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (active || warm) setArmed(true);
  }, [active, warm]);
  const [duel, setDuel] = useState<HomeDuel | null>(null);
  const [duelInfo, setDuelInfo] = useState<DuelInfo | null>(null);
  const duelInfoRef = useRef(duelInfo);
  duelInfoRef.current = duelInfo;
  const duelRef = useRef(duel);
  duelRef.current = duel;
  /** Camp du visiteur : les Blancs contre l'Oracle ; en direct, celui que le serveur lui a donné. */
  const me: Color = duel?.me ?? PLAYER;
  const them = opposite(me);
  const meRef = useRef(me);
  meRef.current = me;
  const vfx = useVfx(armed ? wrapEl : null, PLAYER);
  useEffect(() => {
    if (vfx) vfx.stage.setOrientation(me, stateRef.current.effects, stateRef.current.pos);
  }, [vfx, me]);

  const stateRef = useRef(state);
  const activeRef = useRef(active);
  const levelRef = useRef(level);
  const epochRef = useRef(0);
  const botBusy = useRef(false);
  activeRef.current = active;
  levelRef.current = level;

  const handleRef = useRef<BoardHandle | null>(null);
  const boardRef = useCallback((h: BoardHandle | null) => {
    handleRef.current = h;
    setWrapEl(h?.wrap ?? null);
  }, []);
  const clearPremoves = useCallback(() => handleRef.current?.clearPremoves(), []);

  // Calque WebGL de la partie : masqué hors mode immersif (voir odyssee.css)
  useEffect(() => {
    const canvas = (vfx?.stage as unknown as { canvas?: HTMLCanvasElement | null } | undefined)?.canvas;
    canvas?.classList.add('o-live-canvas');
  }, [vfx]);

  /** Effets persistants dans la scène 3D : seulement quand on regarde la partie. */
  const syncScene = useCallback(
    (s: GameState) => {
      vfx?.stage.syncMarkers(activeRef.current ? s.effects : [], s.pos);
    },
    [vfx],
  );

  const apply = useCallback(
    (n: GameState) => {
      // Partie terminée : elle rejoint « Mes parties » (journal compris, pour la relire dans l'Analyse). Une partie en
      // direct est gardée par le serveur.
      if (!duelRef.current && n.result && !stateRef.current.result && n.result.reason !== 'aborted') {
        try {
          rememberLocalGame(n, { white: 'Vous', black: `L'Oracle (${BOT_PROFILES[levelRef.current].name})`, you: PLAYER, vsBot: true });
        } catch {
          // stockage indisponible : la partie n'est simplement pas gardée
        }
      }
      stateRef.current = n;
      setState(n);
      syncScene(n);
      if (duelRef.current) return;
      persist(n);
      // Un coup dans la nouvelle partie remplace la sauvegarde : la partie d'avant n'est plus proposée
      if (n.ply > 0) setPrevious(null);
    },
    [syncScene],
  );

  useEffect(() => {
    syncScene(stateRef.current);
  }, [active, syncScene]);

  const setLevel = useCallback((l: BotLevel) => {
    setLevelState(l);
    try {
      localStorage.setItem(LEVEL_KEY, String(l));
    } catch {
      // stockage indisponible
    }
  }, []);

  const runCast = useCallback(
    async (n: GameState, info: CardInfo, skinId: string, relay = false) => {
      playCardSound(info.card);
      setLastCast({ card: info.card, by: relay ? 'relay' : info.caster === meRef.current ? 'player' : 'bot', key: Date.now() });
      if (vfx && activeRef.current) {
        // Garde-fou : une carte sans animation (carte nouvelle) ou une scène 3D qui rame ne bloquent jamais la partie
        await castSafely(vfx, info, skinStyle(skinId), {
          impact: () => apply(n),
          hide: ids => setHidden(new Set(ids)),
          show: () => setHidden(new Set()),
          victimAtBottom: info.caster !== meRef.current,
        });
      } else {
        apply(n);
      }
      setHidden(new Set());
    },
    [vfx, apply],
  );

  // Tour de l'IA : la décision est calculée tout de suite (Worker), elle n'est jouée qu'en mode immersif
  const botTurn = useCallback(async () => {
    const epoch = epochRef.current;
    const s0 = stateRef.current;
    setThinking(true);
    const started = performance.now();
    const d = await askBot(s0, levelRef.current);
    const stale = () => epoch !== epochRef.current || stateRef.current !== s0;
    while (!activeRef.current && !stale()) await sleep(150);
    // Un temps de réflexion lisible, même quand le calcul est instantané
    const minThink = 520 + Math.random() * 380;
    const elapsed = performance.now() - started;
    if (elapsed < minThink) await sleep(minThink - elapsed);
    if (stale()) {
      setThinking(false);
      return;
    }
    let s = s0;
    if (d.card) {
      const r = playCard(s, BOT, d.card.index, d.card.targets, botSkin);
      if (r.ok) {
        setThinking(false);
        setCasting(true);
        await runCast(r.state, r.info, botSkin);
        setCasting(false);
        if (epoch !== epochRef.current) return;
        s = r.state;
        await sleep(380);
      }
    }
    if (!s.result && s.pos.turn === BOT && epoch === epochRef.current) {
      let r = d.move ? playMove(s, d.move.from, d.move.to, d.move.promo) : null;
      if (!r || !r.ok) {
        // Décision devenue invalide (carte refusée) : on redemande un coup sur la position réelle
        const again = await askBot({ ...s, cardPlayed: true }, levelRef.current);
        if (epoch !== epochRef.current) return;
        r = again.move ? playMove(s, again.move.from, again.move.to, again.move.promo) : null;
      }
      if (r && r.ok) {
        apply(r.state);
        playSound(r.state.result ? 'end' : r.info.check ? 'check' : r.info.capturedId !== null ? 'capture' : 'move');
      }
    }
    setThinking(false);
  }, [apply, runCast, botSkin]);

  useEffect(() => {
    if (botBusy.current || duel) return;
    if (state.result || state.pos.turn !== BOT) return;
    botBusy.current = true;
    void botTurn().finally(() => {
      botBusy.current = false;
      // Si c'est encore à l'IA (un sort lui a rendu la main), on relance
      setBotTick(t => t + 1);
    });
  }, [state, botTick, botTurn, duel]);

  const myTurn = state.pos.turn === me && !state.result && !casting && (!duel || duelInfo?.status === 'active');
  const legal = useMemo(() => (myTurn ? legalMovesOf(state) : []), [state, myTurn]);
  const hand = state.hands[me];
  const playable = useMemo(() => hand.map((_, i) => myTurn && cardPlayable(state, me, i)), [hand, myTurn, state, me]);
  const selectedDef: CardDef | null = selected !== null && hand[selected]?.card ? CARDS[hand[selected].card!] : null;
  const options = useMemo(() => {
    if (selected === null || !selectedDef || selectedDef.targets === 0) return null;
    return cardOptions(state, me, selected, partial);
  }, [selected, selectedDef, state, partial, me]);

  // Une carte sélectionnée qui n'est plus jouable (tour passé, partie finie) est relâchée
  useEffect(() => {
    if (selected !== null && !playable[selected]) {
      setSelected(null);
      setPartial([]);
    }
  }, [selected, playable]);

  const cast = useCallback(
    async (index: number, targets: number[]) => {
      const s = stateRef.current;
      setSelected(null);
      setPartial([]);
      const r = playCard(s, meRef.current, index, targets, skin);
      if (!r.ok) {
        playSound('error');
        return;
      }
      const d = duelRef.current;
      // En direct : la carte part au serveur tout de suite, l'animation se joue pendant ce temps
      const sent = d ? emitAck<Ack>('game:card', { id: d.id, index, targets }).catch(() => ({ ok: false }) as Ack) : null;
      setCasting(true);
      await runCast(r.state, r.info, skin);
      setCasting(false);
      if (sent && !(await sent).ok) resyncRef.current();
    },
    [skin, runCast],
  );

  const pickCard = useCallback(
    (i: number) => {
      if (!playable[i]) return;
      playSound('select');
      setSelected(cur => (cur === i ? null : i));
      setPartial([]);
    },
    [playable],
  );

  const onTarget = useCallback(
    (sq: number) => {
      if (selected === null || !selectedDef) return;
      const next = [...partial, sq];
      if (next.length >= selectedDef.targets) void cast(selected, next);
      else setPartial(next);
    },
    [selected, selectedDef, partial, cast],
  );

  const onMove = useCallback(
    (from: number, to: number, promo?: PieceType) => {
      const r = playMove(stateRef.current, from, to, promo);
      if (!r.ok) {
        playSound('error');
        return false;
      }
      setSelected(null);
      setPartial([]);
      apply(r.state);
      playSound(r.state.result ? 'end' : r.info.check ? 'check' : r.info.capturedId !== null ? 'capture' : 'move');
      const d = duelRef.current;
      if (d) {
        void emitAck<Ack>('game:move', { id: d.id, from, to, promo })
          .catch(() => ({ ok: false }) as Ack)
          .then(a => {
            if (!a.ok) resyncRef.current();
          });
      }
      return true;
    },
    [apply],
  );

  const lastMove = useMemo(() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.k === 'move' && !e.undone) return { from: e.from, to: e.to };
    }
    return null;
  }, [state]);

  // ------------------------------------------------------------------------------------------
  // Partie en direct contre un autre visiteur de l'accueil

  /** Reprend la position du serveur (coup refusé, reconnexion). */
  const resyncRef = useRef<() => void>(() => {});
  /** Mises à jour du serveur traitées une par une : une carte adverse s'anime avant que son coup ne s'affiche. */
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  const takeView = useCallback((v: GameView) => {
    setDuelInfo({
      status: v.status,
      started: v.started,
      away: v.away[opposite(meRef.current)],
      claimAfterMs: v.claimAfterMs,
      standIn: { w: !!v.standIn?.w, b: !!v.standIn?.b },
    });
  }, []);

  const handleUpdate = useCallback(
    async (u: GameUpdate) => {
      const d = duelRef.current;
      if (!d || u.view.id !== d.id) return;
      takeView(u.view);
      const srv = u.view.state;
      const ev = u.event;
      // Nouveau pour ce navigateur : un coup ou une carte de l'adversaire, ou joués par l'IA en relais pour ce joueur
      // (ses propres coups sont déjà affichés)
      const fresh = srv.log.length > stateRef.current.log.length;
      if (ev.type === 'card' && fresh) {
        setSelected(null);
        setPartial([]);
        setCasting(true);
        await runCast(srv, ev.info, ev.info.skin, ev.info.caster === d.me);
        setCasting(false);
        return;
      }
      if (ev.type === 'move' && fresh) {
        apply(srv);
        playSound(srv.result ? 'end' : ev.info.check ? 'check' : ev.info.capturedId !== null ? 'capture' : 'move');
        return;
      }
      // Ses propres coups (déjà affichés), fin, synchronisation : on ne reprend la position du serveur que si elle diffère
      const local = stateRef.current;
      if (!sameGame(srv, local)) {
        apply(srv);
        if (srv.result && !local.result) playSound('end');
      }
    },
    [apply, runCast, takeView],
  );

  // Rejoint la partie au serveur, suit ses mises à jour, la rejoint de nouveau après une coupure. Fonctions lues par
  // références : l'abonnement ne dépend que de la partie (sinon il la quittait et la rejoignait à chaque scène 3D créée).
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const handleRef2 = useRef(handleUpdate);
  handleRef2.current = handleUpdate;
  const duelId = duel?.id ?? null;
  useEffect(() => {
    if (!duelId) return;
    const duel = { id: duelId };
    const apply = (n: GameState) => applyRef.current(n);
    const sock = getSocket();
    let dead = false;
    const join = () => {
      void emitAck<JoinReply>('game:join', { id: duel.id })
        .then(r => {
          if (dead || !r.ok || !r.view) return;
          takeView(r.view);
          // La partie du serveur fait foi (mains tirées par lui, coups joués pendant une coupure)
          if (!sameGame(r.view.state, stateRef.current)) apply(r.view.state);
        })
        .catch(() => {});
    };
    resyncRef.current = join;
    const onUpdate = (u: GameUpdate) => {
      chainRef.current = chainRef.current.then(() => handleRef2.current(u)).catch(() => {});
    };
    sock.on('game:update', onUpdate);
    sock.on('connect', join);
    join();
    return () => {
      dead = true;
      sock.off('game:update', onUpdate);
      sock.off('connect', join);
      sock.emit('game:leave', { id: duel.id });
      resyncRef.current = () => {};
    };
  }, [duelId, takeView]);

  /** Signe de présence (le joueur touche l'échiquier) : l'IA attend avant de jouer pour lui. Au plus toutes les 3 s. */
  const lastPing = useRef(0);
  const activity = useCallback(() => {
    const d = duelRef.current;
    if (!d || stateRef.current.result) return;
    const t = Date.now();
    if (t - lastPing.current < 3000) return;
    lastPing.current = t;
    getSocket().emit('game:activity', { id: d.id });
  }, []);
  /** Reprendre la main : l'IA cesse de jouer pour ce joueur. */
  const takeOver = useCallback(() => {
    const d = duelRef.current;
    if (d) void emitAck<Ack>('game:takeover', { id: d.id }).catch(() => {});
  }, []);

  /** Le serveur a apparié ce visiteur avec un autre : la partie contre l'Oracle laisse place à la partie en direct. */
  const startDuel = useCallback(
    (p: HomeDuel) => {
      epochRef.current++;
      setSelected(null);
      setPartial([]);
      setHidden(new Set());
      setCasting(false);
      setThinking(false);
      setLastCast(null);
      setDuelInfo(null);
      // La position de départ, en attendant celle du serveur (mêmes règles : rien ne bouge avant le premier coup)
      duelRef.current = p;
      setDuel(p);
      playSound('start');
    },
    [],
  );

  const newGameNow = useCallback(() => {
    // Quitter une partie en direct : annulée si personne n'a encore joué, sinon abandonnée
    const d = duelRef.current;
    if (d) {
      if (!stateRef.current.result) void emitAck<Ack>(duelInfoRef.current?.started ? 'game:resign' : 'game:abort', { id: d.id }).catch(() => {});
      duelRef.current = null;
      setDuel(null);
      setDuelInfo(null);
    }
    epochRef.current++;
    setSelected(null);
    setPartial([]);
    setHidden(new Set());
    setCasting(false);
    setThinking(false);
    setLastCast(null);
    apply(newGame());
    playSound('start');
  }, [apply]);

  /** Reprend la partie d'avant (celle de la visite précédente). */
  const resumePrevious = useCallback(() => {
    const p = previous;
    if (!p) return;
    epochRef.current++;
    setSelected(null);
    setPartial([]);
    setHidden(new Set());
    setCasting(false);
    setThinking(false);
    setLastCast(null);
    apply(p);
  }, [previous, apply]);

  const resign = useCallback(() => {
    const s = stateRef.current;
    if (s.result) return;
    const d = duelRef.current;
    if (d) {
      // Le serveur annonce la fin à tous les deux (game:update, événement « end »)
      void emitAck<Ack>(duelInfoRef.current?.started ? 'game:resign' : 'game:abort', { id: d.id }).catch(() => {});
      return;
    }
    epochRef.current++;
    setSelected(null);
    setPartial([]);
    const result: Result = { winner: BOT, reason: 'resign' };
    apply({ ...s, result });
    playSound('end');
  }, [apply]);

  // Catalogue absent : ancienne sauvegarde (Duel) ; les nouvelles parties sont toujours aux Pouvoirs
  const catalog: Catalog = state.catalog ?? 'duel';

  return {
    state,
    catalog,
    level,
    setLevel,
    /** Partie de la visite précédente, encore en cours : coup où elle en était (rien après le premier coup de la nouvelle). */
    previous: previous && !duel ? { moveNo: Math.floor(previous.ply / 2) + 1 } : null,
    resumePrevious,
    /** Partie en direct contre un autre visiteur (null : contre l'Oracle). */
    duel,
    duelInfo,
    startDuel,
    activity,
    takeOver,
    /** Camp du visiteur, et celui de son adversaire. */
    me,
    them,
    /** Réclamer la victoire : l'adversaire a quitté la page depuis assez longtemps. */
    claim: () => {
      const d = duelRef.current;
      if (d) void emitAck<Ack>('game:claim', { id: d.id }).catch(() => {});
    },
    boardRef,
    /** Annule les pré-coups en attente sur l'échiquier de la partie. */
    clearPremoves,
    boardProps: {
      pos: state.pos,
      orientation: me,
      theme,
      legal,
      onMove: (from: number, to: number, promo?: PieceType) => void onMove(from, to, promo),
      lastMove,
      check: state.result ? null : checkSquare(state.pos, sideInCheck(state) ? state.pos.turn : null),
      effects: state.effects,
      targets: options,
      targetHue: selectedDef?.hue,
      chosen: partial,
      onTarget,
      hidden,
      locked: !myTurn,
    },
    /** Joue un coup du joueur (renvoie faux s'il est refusé). */
    move: onMove,
    hand,
    playable,
    selected,
    selectedDef,
    /** Consigne à afficher pendant le ciblage. */
    prompt: selectedDef ? (selectedDef.targets ? selectedDef.prompts[partial.length] ?? '' : selectedDef.description) : null,
    pickCard,
    /** Lance la carte sélectionnée si elle n'a pas de cible. */
    castSelected: () => {
      if (selected !== null && selectedDef?.targets === 0) void cast(selected, []);
    },
    cancel: () => {
      setSelected(null);
      setPartial([]);
    },
    myTurn,
    /** L'IA calcule son coup. */
    thinking,
    /** Un sort est en cours d'animation. */
    casting,
    lastCast,
    result: state.result,
    newGame: newGameNow,
    resign,
  };
}

export type LiveGame = ReturnType<typeof useLiveGame>;
