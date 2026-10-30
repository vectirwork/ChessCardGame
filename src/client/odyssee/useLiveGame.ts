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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askBot } from '../ai';
import type { BotLevel } from '../ai';
import { CARDS, isCardId } from '../../shared/cards';
import type { CardDef, Catalog } from '../../shared/cards';
import type { Color, PieceType } from '../../shared/chess';
import { skinStyle } from '../../shared/catalog';
import { cardOptions, cardPlayable, createGame, dealHands, legalMovesOf, playCard, playMove, sideInCheck } from '../../shared/game';
import type { CardInfo, GameState, Result } from '../../shared/game';
import { checkSquare } from '../components/Board';
import type { BoardHandle } from '../components/Board';
import { playCardSound, playSound } from '../sound';
import { useVfx } from '../vfx/useVfx';
import { castSafely } from './castSafely';
import { liveCatalog } from './data';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  if (![...s.hands.w, ...s.hands.b].every(h => h && (h.card === null || isCardId(h.card)))) return false;
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
  by: 'player' | 'bot';
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
}

export function useLiveGame({ skin, theme, active, botSkin = 'skin:void' }: LiveGameOptions) {
  const [state, setState] = useState<GameState>(() => loadSaved() ?? newGame());
  const [resumed] = useState(() => state.ply > 0);
  const [level, setLevelState] = useState<BotLevel>(loadLevel);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [partial, setPartial] = useState<number[]>([]);
  const [casting, setCasting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastCast, setLastCast] = useState<LastCast | null>(null);
  const [botTick, setBotTick] = useState(0);
  const vfx = useVfx(wrapEl, PLAYER);

  const stateRef = useRef(state);
  const activeRef = useRef(active);
  const levelRef = useRef(level);
  const epochRef = useRef(0);
  const botBusy = useRef(false);
  activeRef.current = active;
  levelRef.current = level;

  const boardRef = useCallback((h: BoardHandle | null) => setWrapEl(h?.wrap ?? null), []);

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
      stateRef.current = n;
      setState(n);
      syncScene(n);
      persist(n);
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
    async (n: GameState, info: CardInfo, skinId: string) => {
      playCardSound(info.card);
      setLastCast({ card: info.card, by: info.caster === PLAYER ? 'player' : 'bot', key: Date.now() });
      if (vfx && activeRef.current) {
        // Garde-fou : une carte sans animation (carte nouvelle) ou une scène 3D qui rame ne bloquent jamais la partie
        await castSafely(vfx, info, skinStyle(skinId), {
          impact: () => apply(n),
          hide: ids => setHidden(new Set(ids)),
          show: () => setHidden(new Set()),
          victimAtBottom: info.caster === BOT,
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
    if (botBusy.current) return;
    if (state.result || state.pos.turn !== BOT) return;
    botBusy.current = true;
    void botTurn().finally(() => {
      botBusy.current = false;
      // Si c'est encore à l'IA (un sort lui a rendu la main), on relance
      setBotTick(t => t + 1);
    });
  }, [state, botTick, botTurn]);

  const myTurn = state.pos.turn === PLAYER && !state.result && !casting;
  const legal = useMemo(() => (myTurn ? legalMovesOf(state) : []), [state, myTurn]);
  const hand = state.hands[PLAYER];
  const playable = useMemo(() => hand.map((_, i) => myTurn && cardPlayable(state, PLAYER, i)), [hand, myTurn, state]);
  const selectedDef: CardDef | null = selected !== null && hand[selected]?.card ? CARDS[hand[selected].card!] : null;
  const options = useMemo(() => {
    if (selected === null || !selectedDef || selectedDef.targets === 0) return null;
    return cardOptions(state, PLAYER, selected, partial);
  }, [selected, selectedDef, state, partial]);

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
      const r = playCard(s, PLAYER, index, targets, skin);
      if (!r.ok) {
        playSound('error');
        return;
      }
      setCasting(true);
      await runCast(r.state, r.info, skin);
      setCasting(false);
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

  const newGameNow = useCallback(() => {
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

  const resign = useCallback(() => {
    const s = stateRef.current;
    if (s.result) return;
    epochRef.current++;
    setSelected(null);
    setPartial([]);
    const result: Result = { winner: BOT, reason: 'resign' };
    apply({ ...s, result });
    playSound('end');
  }, [apply]);

  const catalog: Catalog = state.catalog ?? 'duel';

  return {
    state,
    catalog,
    level,
    setLevel,
    /** La partie a été reprise d'une sauvegarde au chargement de la page. */
    resumed,
    boardRef,
    boardProps: {
      pos: state.pos,
      orientation: PLAYER,
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
