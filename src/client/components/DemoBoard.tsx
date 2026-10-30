// Échiquier de démonstration : joue seul et lance des sorts en boucle (aperçu des skins).
// Il n'est plus monté que par SkinPreview (pages/Home.tsx), que rien n'importe : la boutique et l'accueil passent
// par odyssee/StageBoard. Il montre les huit pouvoirs (catalogue « climats »).
import { useEffect, useRef, useState } from 'react';
import { Color, VALUE, fileOf, rankOf } from '../../shared/chess';
import { CARDS, CardId, cardsOf, isCardId } from '../../shared/cards';
import { ITEMS, itemById, skinStyle } from '../../shared/catalog';
import {
  GameState, cardOptions, createGame, createGameFromFen, legalMovesOf, playCard, playMove,
} from '../../shared/game';
import { useVfx } from '../vfx/useVfx';
import { Board, BoardHandle } from './Board';

const SKINS = ITEMS.filter(i => i.kind === 'skin').map(i => i.id);
const HERO_ORDER: CardId[] = ['blast', 'ice_wall', 'ice_age', 'rift', 'blood_moon', 'truce', 'tide', 'hourglass'];
const PREVIEW_ORDER: CardId[] = ['blast', 'ice_wall', 'rift', 'ice_age', 'blood_moon', 'tide'];
const POWERS = cardsOf('climats');
const PREVIEW_FEN = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/2BQK2R w K - 0 9';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function freshHero(): GameState {
  return createGame({ w: [...POWERS], b: [...POWERS] }, true, 'climats');
}

function freshPreview(): GameState {
  const s = createGameFromFen(PREVIEW_FEN, { w: [...POWERS], b: [...POWERS] }, true, 'climats');
  s.captured = { w: ['r'], b: ['p'] };
  return s;
}

/** Coup « raisonnable » : préfère les prises et le centre, avec une part de hasard. */
function demoMove(s: GameState) {
  const moves = legalMovesOf(s);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const victim = s.pos.board[m.to];
    const mover = s.pos.board[m.from]!;
    let score = Math.random() * 40;
    if (victim) score += VALUE[victim.t] - VALUE[mover.t] / 10;
    const f = fileOf(m.to), r = rankOf(m.to);
    score += (3.5 - Math.abs(3.5 - f)) * 4 + (3.5 - Math.abs(3.5 - r)) * 4;
    if (mover.t === 'k') score -= 40;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Choisit des cibles valides au hasard pour une carte. */
function randomTargets(s: GameState, color: Color, index: number): number[] | null {
  const id = s.hands[color][index]?.card;
  if (!isCardId(id)) return null;
  const need = CARDS[id].targets;
  const out: number[] = [];
  for (let k = 0; k < need; k++) {
    const opts = cardOptions(s, color, index, out);
    if (!opts.length) return null;
    // Préfère les cibles proches du centre : plus lisibles
    opts.sort((a, b) => Math.abs(3.5 - fileOf(a)) + Math.abs(3.5 - rankOf(a)) - (Math.abs(3.5 - fileOf(b)) + Math.abs(3.5 - rankOf(b))) + (Math.random() - 0.5) * 3);
    out.push(opts[0]);
  }
  return out;
}

interface Props {
  /** Skin imposé ; sinon les skins défilent. */
  skin?: string;
  theme?: string;
  mode?: 'hero' | 'preview';
  onCaption?: (text: string) => void;
}

export function DemoBoard({ skin, theme, mode = 'hero', onCaption }: Props) {
  const ref = useRef<BoardHandle>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<GameState>(() => (mode === 'hero' ? freshHero() : freshPreview()));
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const vfx = useVfx(wrap, 'w');
  const captionRef = useRef(onCaption);
  captionRef.current = onCaption;

  useEffect(() => setWrap(ref.current?.wrap ?? null), []);

  useEffect(() => {
    if (!vfx) return;
    let dead = false;
    let s = mode === 'hero' ? freshHero() : freshPreview();
    let cardIdx = 0;
    let skinIdx = Math.floor(Math.random() * SKINS.length);
    let step = 0;
    const order = mode === 'hero' ? HERO_ORDER : PREVIEW_ORDER;
    const apply = (n: GameState) => {
      s = n;
      setState(n);
      vfx.stage.syncMarkers(n.effects, n.pos);
    };
    const cast = async (): Promise<boolean> => {
      const color = s.pos.turn;
      for (let tries = 0; tries < order.length; tries++) {
        const card = order[cardIdx++ % order.length];
        const index = s.hands[color].findIndex(h => h.card === card);
        const targets = randomTargets(s, color, index);
        if (!targets) continue;
        const skinId = skin ?? SKINS[skinIdx++ % SKINS.length];
        const r = playCard(s, color, index, targets, skinId);
        if (!r.ok) continue;
        // Toutes les cartes restent disponibles dans la démo
        r.state.hands[color] = r.state.hands[color].map(h => ({ ...h, used: false }));
        captionRef.current?.(`${CARDS[card].name} · skin ${itemById(skinId)?.name ?? ''}`);
        await vfx.m.playCast(vfx.stage, r.info, skinStyle(skinId), {
          impact: () => apply(r.state),
          hide: ids => setHidden(new Set(ids)),
          show: () => setHidden(new Set()),
          victimAtBottom: color === 'b',
        });
        setHidden(new Set());
        return true;
      }
      return false;
    };
    const loop = async () => {
      await sleep(900);
      while (!dead) {
        if (document.hidden) {
          await sleep(500);
          continue;
        }
        step++;
        if (mode === 'preview') {
          await cast();
          await sleep(1900);
          if (dead) break;
          apply(freshPreview());
          await sleep(700);
          continue;
        }
        if (s.result || s.ply > 36) {
          await sleep(1200);
          apply(freshHero());
          continue;
        }
        if (step % 3 === 0 && !s.cardPlayed && (await cast())) {
          await sleep(1500);
          if (dead) break;
        }
        if (s.result) continue;
        const m = demoMove(s);
        if (!m) {
          apply(freshHero());
          continue;
        }
        const r = playMove(s, m.from, m.to, m.promo);
        if (r.ok) apply(r.state);
        await sleep(1100);
      }
    };
    void loop();
    return () => {
      dead = true;
    };
  }, [vfx, mode, skin]);

  const lastMove = (() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.k === 'move' && !e.undone) return { from: e.from, to: e.to };
    }
    return null;
  })();

  return (
    <Board
      ref={ref}
      pos={state.pos}
      orientation="w"
      theme={theme}
      effects={state.effects}
      lastMove={lastMove}
      hidden={hidden}
      locked
      coords={false}
    />
  );
}
