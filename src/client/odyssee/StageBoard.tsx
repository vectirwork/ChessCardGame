// Échiquier de la descente : il joue seul et lance, à la demande, le sort du lieu traversé.
// À la différence de DemoBoard, le sort est piloté par le défilement (prop `act`).
// Le parent le remonte (key) à chaque changement de lieu : sort en attente, effets et position repartent de zéro.
// Il distribue les huit pouvoirs (catalogue « climats ») aux deux camps ; un autre catalogue reste accepté.
import { useEffect, useRef, useState } from 'react';
import { Board } from '../components/Board';
import type { BoardHandle } from '../components/Board';
import { CARDS, cardsOf, isCardId } from '../../shared/cards';
import type { CardId, Catalog } from '../../shared/cards';
import { VALUE, fileOf, rankOf } from '../../shared/chess';
import type { Color } from '../../shared/chess';
import { skinStyle } from '../../shared/catalog';
import { cardOptions, cardPlayable, createGame, legalMovesOf, playCard, playMove } from '../../shared/game';
import type { GameState } from '../../shared/game';
import { useVfx } from '../vfx/useVfx';
import { castSafely } from './castSafely';

export interface Act {
  /** Identifiant : un changement déclenche un sort immédiat. */
  key: string;
  cards: CardId[];
  skin: string;
  /** Nombre de coups entre deux sorts. */
  every: number;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let demoCatalog: Exclude<Catalog, 'aucune'> = 'climats';

/** Position de départ de la démonstration : toutes les cartes du catalogue, dans les deux camps. */
const fresh = (): GameState => {
  const ids = cardsOf(demoCatalog);
  return createGame({ w: [...ids], b: [...ids] }, true, demoCatalog);
};

/** Accès aux champs internes de la scène d'effets (perspective, calque, rendu) sans modifier le module partagé. */
interface StageInternals {
  perspective: number;
  canvas: HTMLCanvasElement | null;
  renderer: { forceContextLoss: () => void } | null;
}

function pickMove(s: GameState) {
  const moves = legalMovesOf(s);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const victim = s.pos.board[m.to];
    const mover = s.pos.board[m.from]!;
    let score = Math.random() * 40;
    if (victim) score += VALUE[victim.t] - VALUE[mover.t] / 10;
    score += (3.5 - Math.abs(3.5 - fileOf(m.to))) * 4 + (3.5 - Math.abs(3.5 - rankOf(m.to))) * 4;
    if (mover.t === 'k') score -= 40;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Cibles lisibles : près du centre. */
function targetsFor(s: GameState, color: Color, index: number): number[] | null {
  const id = s.hands[color][index].card;
  if (!isCardId(id)) return null;
  const need = CARDS[id].targets;
  const out: number[] = [];
  for (let k = 0; k < need; k++) {
    const opts = cardOptions(s, color, index, out);
    if (!opts.length) return null;
    opts.sort((a, b) => Math.abs(3.5 - fileOf(a)) + Math.abs(3.5 - rankOf(a)) - (Math.abs(3.5 - fileOf(b)) + Math.abs(3.5 - rankOf(b))) + (Math.random() - 0.5) * 2);
    out.push(opts[0]);
  }
  return out;
}

/** Prépare un coup de sort lisible : quelques coups d'ouverture, puis la carte demandée. */
function prepareCast(card: CardId, skin: string) {
  let s = fresh();
  for (let i = 0; i < 4; i++) {
    const m = pickMove(s);
    if (!m) break;
    const r = playMove(s, m.from, m.to, m.promo);
    if (r.ok) s = r.state;
  }
  const color = s.pos.turn;
  const index = s.hands[color].findIndex(h => h.card === card);
  if (index < 0) return null;
  if (!cardPlayable(s, color, index)) return null;
  const targets = targetsFor(s, color, index);
  if (!targets) return null;
  const r = playCard(s, color, index, targets, skin);
  return r.ok ? { before: s, r, color } : null;
}

interface Props {
  act: Act;
  /** Catalogue des cartes montrées : les Pouvoirs (« climats »). */
  catalog: Exclude<Catalog, 'aucune'>;
  theme: string;
  /** Incrémenté pour ramener les pièces en position de départ (avant une partie). */
  resetSignal: number;
  paused: boolean;
  /** Inclinaison de base du plateau (radians) : la scène 3D est maintenue à la même inclinaison que le CSS. */
  tilt: number;
  /** Mouvement réduit : pas de lecture automatique, une image fixe du sort et une lecture à la demande. */
  still: boolean;
  /** Incrémenté pour jouer le sort une fois (bouton « Voir le sort »). */
  playSignal: number;
  onCast?: (card: CardId, skin: string) => void;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
}

export function StageBoard({ act, catalog, theme, resetSignal, paused, tilt, still, playSignal, onCast, onCanvas }: Props) {
  demoCatalog = catalog;
  const ref = useRef<BoardHandle>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<GameState>(fresh);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const vfx = useVfx(wrap, 'w');
  const actRef = useRef(act);
  const pausedRef = useRef(paused);
  const castRef = useRef(onCast);
  const wakeRef = useRef<() => void>(() => undefined);
  const epochRef = useRef(0);
  const sRef = useRef<GameState>(state);
  const tiltRef = useRef(tilt);
  const tiltUntil = useRef(0);
  const castingRef = useRef(false);
  pausedRef.current = paused;
  castRef.current = onCast;
  tiltRef.current = tilt;

  useEffect(() => setWrap(ref.current?.wrap ?? null), []);

  // Calque WebGL : signalé au moteur (il suit l'opacité de l'échiquier) et libéré au démontage
  useEffect(() => {
    if (!vfx) return;
    const st = vfx.stage as unknown as StageInternals;
    st.canvas?.classList.add('o-stage-canvas');
    onCanvas?.(st.canvas);
    return () => {
      onCanvas?.(null);
      try {
        st.renderer?.forceContextLoss();
      } catch {
        /* contexte déjà perdu */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfx]);

  // Nouvelle carte : on réveille la boucle pour lancer le sort tout de suite
  useEffect(() => {
    const changed = actRef.current.key !== act.key;
    actRef.current = act;
    if (changed) wakeRef.current();
  }, [act]);

  // Retour en position de départ : les pièces rentrent chez elles
  useEffect(() => {
    if (!resetSignal) return;
    epochRef.current++;
    const s = fresh();
    sRef.current = s;
    setState(s);
    setHidden(new Set());
    vfx?.stage.syncMarkers(s.effects, s.pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  /** Garde la scène 3D à l'inclinaison du plateau CSS tant qu'un sort ou un effet est visible. */
  const holdTilt = async (ms: number) => {
    if (!vfx || still) return;
    const st = vfx.stage as unknown as StageInternals;
    const w = wrap ? wrap.getBoundingClientRect().width / Math.max(1, wrap.offsetWidth) : 1;
    // Le plateau est réduit par le calque « astre » : la perspective de la scène 3D doit l'être aussi
    st.perspective = 1400 * w;
    const now = performance.now();
    const covered = tiltUntil.current > now + 120;
    vfx.stage.cinematic(ms / 1000, tiltRef.current, 1);
    tiltUntil.current = Math.max(tiltUntil.current, now + 550 + ms);
    if (!covered) await sleep(620);
  };

  useEffect(() => {
    if (!vfx || still) return;
    const id = window.setInterval(() => {
      if (castingRef.current) void holdTilt(2200);
    }, 900);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfx, still]);

  // Mouvement réduit : image fixe du sort du chapitre, et lecture animée à la demande
  useEffect(() => {
    if (!vfx || !still) return;
    const a = actRef.current;
    const card = a.cards[0];
    epochRef.current++;
    if (!card) {
      const s = fresh();
      sRef.current = s;
      setState(s);
      vfx.stage.syncMarkers(s.effects, s.pos);
      return;
    }
    const prep = prepareCast(card, a.skin);
    if (!prep) return;
    const epoch = epochRef.current;
    const show = (n: GameState) => {
      if (epoch !== epochRef.current) return;
      sRef.current = n;
      setState(n);
      vfx.stage.syncMarkers(n.effects, n.pos);
    };
    castRef.current?.(card, a.skin);
    if (!playSignal) {
      show(prep.r.state);
      return;
    }
    show(prep.before);
    void castSafely(vfx, prep.r.info, skinStyle(a.skin), {
      impact: () => show(prep.r.state),
      hide: ids => epoch === epochRef.current && setHidden(new Set(ids)),
      show: () => setHidden(new Set()),
      victimAtBottom: prep.color === 'b',
    });
  }, [vfx, still, act.key, playSignal]);

  useEffect(() => {
    if (!vfx || still) return;
    let dead = false;
    let sinceCast = 99;
    let lastKey = '';
    let cardIdx = 0;
    const wait = (ms: number) =>
      new Promise<void>(resolve => {
        const t = setTimeout(resolve, ms);
        wakeRef.current = () => {
          clearTimeout(t);
          resolve();
        };
      });
    const apply = (n: GameState, epoch: number) => {
      if (epoch !== epochRef.current) return;
      sRef.current = n;
      setState(n);
      vfx.stage.syncMarkers(n.effects, n.pos);
    };
    const cast = async (): Promise<boolean> => {
      const a = actRef.current;
      if (!a.cards.length) return false;
      for (let tries = 0; tries < a.cards.length + 1; tries++) {
        let s = sRef.current;
        const card = a.cards[cardIdx++ % a.cards.length];
        const color = s.pos.turn;
        const index = s.hands[color].findIndex(h => h.card === card);
        if (index < 0) continue;
        if (!cardPlayable(s, color, index) && tries === 0) {
          // Carte pas encore jouable (un Climat déjà annoncé, une Grande Marée sans pion à pousser…) : on joue un coup
          // et on réessaie
          const m = pickMove(s);
          const r0 = m && playMove(s, m.from, m.to, m.promo);
          if (r0 && r0.ok) {
            apply(r0.state, epochRef.current);
            await sleep(650);
            cardIdx--;
            continue;
          }
        }
        if (!cardPlayable(s, color, index)) continue;
        const targets = targetsFor(s, color, index);
        if (!targets) continue;
        const r = playCard(s, color, index, targets, a.skin);
        if (!r.ok) continue;
        r.state.hands[color] = r.state.hands[color].map(h => ({ ...h, used: false }));
        const epoch = epochRef.current;
        castingRef.current = true;
        await holdTilt(2600);
        if (dead || epoch !== epochRef.current || actRef.current.key !== a.key) {
          castingRef.current = false;
          return false;
        }
        // La légende annonce le sort au moment où il part, avec la carte réellement lancée
        castRef.current?.(card, a.skin);
        await castSafely(vfx, r.info, skinStyle(a.skin), {
          impact: () => apply(r.state, epoch),
          hide: ids => epoch === epochRef.current && setHidden(new Set(ids)),
          show: () => setHidden(new Set()),
          victimAtBottom: color === 'b',
        });
        setHidden(new Set());
        // L'effet reste visible un instant, puis se dissipe : entre deux sorts, la scène 3D n'a plus rien à dessiner
        await wait(1700);
        if (!dead && epoch === epochRef.current && sRef.current.effects.length) {
          apply({ ...sRef.current, effects: [] }, epoch);
          await sleep(500);
        }
        castingRef.current = false;
        return true;
      }
      return false;
    };
    const loop = async () => {
      await sleep(700);
      while (!dead) {
        if (document.hidden || pausedRef.current) {
          await sleep(300);
          continue;
        }
        const s = sRef.current;
        if (s.result || s.ply > 44) {
          await wait(900);
          apply(fresh(), epochRef.current);
          continue;
        }
        const a = actRef.current;
        const fresher = a.key !== lastKey;
        if (fresher && lastKey && s.effects.length) {
          // Nouveau chapitre : les effets du sort précédent se dissipent avant le suivant
          apply({ ...s, effects: [] }, epochRef.current);
          await sleep(450);
        }
        if (a.cards.length && !sRef.current.cardPlayed && (fresher || sinceCast >= a.every)) {
          lastKey = a.key;
          if (fresher) cardIdx = 0;
          if (await cast()) {
            sinceCast = 0;
            await wait(1300);
            continue;
          }
        }
        lastKey = a.key;
        if (dead || pausedRef.current) continue;
        const cur = sRef.current;
        const m = pickMove(cur);
        if (!m) {
          apply(fresh(), epochRef.current);
          continue;
        }
        const r = playMove(cur, m.from, m.to, m.promo);
        if (r.ok) apply(r.state, epochRef.current);
        sinceCast++;
        await wait(1150);
      }
    };
    void loop();
    return () => {
      dead = true;
      wakeRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfx, still]);

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
