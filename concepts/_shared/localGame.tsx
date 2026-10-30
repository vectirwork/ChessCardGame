// Partie locale jouable pour les prototypes de concepts : le joueur (Blancs) contre une petite IA,
// avec ses 3 cartes et les vrais effets 3D. Aucune connexion au serveur.
//
// Utilisation :
//   const g = useLocalGame();
//   <Board ref={g.boardRef} {...g.boardProps} />
//   g.hand / g.playable / g.selected / g.pickCard(i) / g.castSelected() / g.cancel() / g.prompt
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Color, PieceType, VALUE, fileOf, rankOf } from '../../src/shared/chess';
import { CARDS, CardDef } from '../../src/shared/cards';
import { skinStyle } from '../../src/shared/catalog';
import {
  GameState, cardOptions, cardPlayable, createGame, dealHands, legalMovesOf, playCard, playMove, sideInCheck,
} from '../../src/shared/game';
import type { BoardHandle } from '../../src/client/components/Board';
import { checkSquare } from '../../src/client/components/Board';
import { playCardSound, playSound } from '../../src/client/sound';
import { useVfx } from '../../src/client/vfx/useVfx';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Coup de l'IA : préfère les prises et le centre, avec une part de hasard. */
function botMove(s: GameState) {
  const moves = legalMovesOf(s);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const victim = s.pos.board[m.to];
    const mover = s.pos.board[m.from]!;
    let score = Math.random() * 60;
    if (victim) score += VALUE[victim.t] * 1.2 - VALUE[mover.t] / 8;
    score += (3.5 - Math.abs(3.5 - fileOf(m.to))) * 5 + (3.5 - Math.abs(3.5 - rankOf(m.to))) * 3;
    if (mover.t === 'k') score -= 50;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function randomTargets(s: GameState, color: Color, index: number): number[] | null {
  const need = CARDS[s.hands[color][index].card!].targets;
  const out: number[] = [];
  for (let k = 0; k < need; k++) {
    const opts = cardOptions(s, color, index, out);
    if (!opts.length) return null;
    out.push(opts[Math.floor(Math.random() * opts.length)]);
  }
  return out;
}

export interface LocalGameOptions {
  /** Skin des sorts du joueur. */
  skin?: string;
  /** Skin des sorts de l'IA. */
  botSkin?: string;
  /** Plateau (thème) : 'board:arcane', 'board:marble', etc. */
  theme?: string;
  /** Probabilité que l'IA lance une carte avant son coup (après le 6e demi-coup). */
  botCardChance?: number;
}

export function useLocalGame(opts: LocalGameOptions = {}) {
  const { skin = 'skin:arcane', botSkin = 'skin:void', theme, botCardChance = 0.35 } = opts;
  const [state, setState] = useState<GameState>(() => createGame(dealHands(false, false), false));
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [partial, setPartial] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastCast, setLastCast] = useState<{ card: string; by: 'player' | 'bot'; key: number } | null>(null);
  const vfx = useVfx(wrapEl, 'w');
  const stateRef = useRef(state);
  stateRef.current = state;

  const boardRef = useCallback((h: BoardHandle | null) => setWrapEl(h?.wrap ?? null), []);

  const apply = useCallback((n: GameState) => {
    setState(n);
    vfx?.stage.syncMarkers(n.effects, n.pos);
  }, [vfx]);

  const runCast = useCallback(async (n: GameState, info: Parameters<NonNullable<typeof vfx>['m']['playCast']>[1], skinId: string) => {
    playCardSound(info.card);
    setLastCast({ card: info.card, by: info.caster === 'w' ? 'player' : 'bot', key: Date.now() });
    if (vfx) {
      await vfx.m.playCast(vfx.stage, info, skinStyle(skinId), {
        impact: () => apply(n),
        hide: ids => setHidden(new Set(ids)),
        show: () => setHidden(new Set()),
        victimAtBottom: info.caster === 'b',
      });
    } else {
      apply(n);
    }
    setHidden(new Set());
  }, [vfx, apply]);

  const botTurn = useCallback(async () => {
    setBusy(true);
    await sleep(500 + Math.random() * 400);
    let s = stateRef.current;
    if (s.result || s.pos.turn !== 'b') {
      setBusy(false);
      return;
    }
    if (s.ply >= 6 && Math.random() < botCardChance) {
      const idx = s.hands.b.findIndex((_, i) => cardPlayable(s, 'b', i));
      if (idx >= 0) {
        const t = randomTargets(s, 'b', idx);
        const r = t && playCard(s, 'b', idx, t, botSkin);
        if (r && r.ok) {
          await runCast(r.state, r.info, botSkin);
          s = r.state;
          await sleep(400);
        }
      }
    }
    if (!s.result && s.pos.turn === 'b') {
      const m = botMove(s);
      if (m) {
        const r = playMove(s, m.from, m.to, m.promo);
        if (r.ok) {
          apply(r.state);
          playSound(r.info.check ? 'check' : r.info.capturedId !== null ? 'capture' : 'move');
        }
      }
    }
    setBusy(false);
  }, [apply, runCast, botSkin, botCardChance]);

  // Retour arrière de l'IA : c'est de nouveau à elle
  useEffect(() => {
    if (state.pos.turn === 'b' && !state.result && !busy) void botTurn();
  }, [state, busy, botTurn]);

  const myTurn = state.pos.turn === 'w' && !state.result && !busy;
  const legal = useMemo(() => (myTurn ? legalMovesOf(state) : []), [state, myTurn]);
  const hand = state.hands.w;
  const playable = useMemo(() => hand.map((_, i) => myTurn && cardPlayable(state, 'w', i)), [hand, myTurn, state]);
  const selectedDef: CardDef | null = selected !== null && hand[selected]?.card ? CARDS[hand[selected].card!] : null;
  const options = useMemo(() => {
    if (selected === null || !selectedDef || selectedDef.targets === 0) return null;
    return cardOptions(state, 'w', selected, partial);
  }, [selected, selectedDef, state, partial]);

  const cast = useCallback(async (index: number, targets: number[]) => {
    const s = stateRef.current;
    setSelected(null);
    setPartial([]);
    const r = playCard(s, 'w', index, targets, skin);
    if (!r.ok) {
      playSound('error');
      return;
    }
    setBusy(true);
    await runCast(r.state, r.info, skin);
    setBusy(false);
  }, [skin, runCast]);

  const pickCard = useCallback((i: number) => {
    if (!playable[i]) return;
    playSound('select');
    setSelected(cur => (cur === i ? null : i));
    setPartial([]);
  }, [playable]);

  const onTarget = useCallback((sq: number) => {
    if (selected === null || !selectedDef) return;
    const next = [...partial, sq];
    if (next.length >= selectedDef.targets) void cast(selected, next);
    else setPartial(next);
  }, [selected, selectedDef, partial, cast]);

  const onMove = useCallback((from: number, to: number, promo?: PieceType) => {
    const r = playMove(stateRef.current, from, to, promo);
    if (!r.ok) return;
    apply(r.state);
    playSound(r.info.check ? 'check' : r.info.capturedId !== null ? 'capture' : 'move');
  }, [apply]);

  const lastMove = useMemo(() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.k === 'move' && !e.undone) return { from: e.from, to: e.to };
    }
    return null;
  }, [state]);

  const reset = useCallback(() => {
    setSelected(null);
    setPartial([]);
    apply(createGame(dealHands(false, false), false));
  }, [apply]);

  return {
    state,
    boardRef,
    boardProps: {
      pos: state.pos,
      orientation: 'w' as Color,
      theme,
      legal,
      onMove,
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
    hand,
    playable,
    selected,
    selectedDef,
    /** Consigne à afficher pendant le ciblage. */
    prompt: selectedDef ? (selectedDef.targets ? selectedDef.prompts[partial.length] : selectedDef.description) : null,
    pickCard,
    /** Lance la carte sélectionnée si elle n'a pas de cible. */
    castSelected: () => selected !== null && selectedDef?.targets === 0 && void cast(selected, []),
    cancel: () => {
      setSelected(null);
      setPartial([]);
    },
    myTurn,
    busy,
    lastCast,
    result: state.result,
    reset,
  };
}

export type LocalGame = ReturnType<typeof useLocalGame>;
