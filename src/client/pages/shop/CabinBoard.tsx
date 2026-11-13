// Cabine, vue « En partie » : l'échiquier essayé en milieu de partie (rois roqués, cases vides qui montrent la texture),
// coordonnées visibles, le roi essayé de votre côté et le roi Arcane en face, et le vrai sort avec les sorts essayés.
// Sobriété :
// - échiquier immobile tant qu'aucun sort n'est demandé (aucun coup joué tout seul) ;
// - la scène 3D (une seule sur la page, pool « boutique ») se crée au premier sort demandé, ou au repos après
//   l'ouverture de la vue ; elle se met en pause hors de l'écran et onglet caché ;
// - sorts automatiques bornés : `play.count` au plus (3 après l'essai de sorts), puis plus rien ne bouge ;
// - halo de la case du roi : une seule impulsion d'opacité à chaque roi essayé, puis un halo fixe.
// Sans WebGL (scène impossible), le sceau CSS du skin remplace le sort.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CARDS, cardsOf, isCardId } from '../../../shared/cards';
import type { CardId, Catalog } from '../../../shared/cards';
import { fileOf, kingSquare, rankOf } from '../../../shared/chess';
import type { Color } from '../../../shared/chess';
import { DEFAULT_KING, skinStyle } from '../../../shared/catalog';
import { cardOptions, cardPlayable, createGameFromFen, playCard } from '../../../shared/game';
import type { GameState } from '../../../shared/game';
import { Board } from '../../components/Board';
import type { BoardHandle } from '../../components/Board';
import { castSafely } from '../../odyssee/castSafely';
import { useVfx } from '../../vfx/useVfx';
import { gemOf } from './trial';

/** Milieu de partie : rois roqués, quelques pièces échangées, de la place pour la texture et le sort. */
const MID_FEN = 'r2q1rk1/pp2bppp/4pn2/3p4/3P4/4PN2/PP2BPPP/R2Q1RK1 w - - 0 12';
/** Catalogue des sorts montrés dans la cabine : celui des parties (les Pouvoirs). */
const PREVIEW_CATALOG: Catalog = 'climats';
const POWERS = cardsOf(PREVIEW_CATALOG);
/** Ordre préféré des sorts montrés ; une carte du catalogue absente de cette liste passe à la suite. */
const PREFERRED: readonly string[] = ['ice_wall', 'rift', 'tide', 'blast', 'ice_age', 'blood_moon', 'truce', 'hourglass'];
/** Sorts montrés, dans cet ordre : tous ceux du catalogue (les 8 pouvoirs aujourd'hui). */
export const PREVIEW_ORDER: CardId[] = [
  ...PREFERRED.filter((id): id is CardId => isCardId(id) && POWERS.includes(id)),
  ...POWERS.filter(id => !PREFERRED.includes(id)),
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function freshGame(side: Color): GameState {
  const fen = MID_FEN.replace(' w ', ` ${side} `);
  return createGameFromFen(fen, { w: [...POWERS], b: [...POWERS] }, true, PREVIEW_CATALOG);
}

/** Cibles lisibles : près du centre, un peu de hasard. */
function targetsFor(s: GameState, color: Color, index: number): number[] | null {
  const id = s.hands[color][index]?.card;
  if (!isCardId(id)) return null;
  const out: number[] = [];
  for (let k = 0; k < CARDS[id].targets; k++) {
    const opts = cardOptions(s, color, index, out);
    if (!opts.length) return null;
    opts.sort((a, b) => Math.abs(3.5 - fileOf(a)) + Math.abs(3.5 - rankOf(a)) - (Math.abs(3.5 - fileOf(b)) + Math.abs(3.5 - rankOf(b))) + (Math.random() - 0.5) * 2);
    out.push(opts[0]);
  }
  return out;
}

export interface PlayRequest {
  /** Change à chaque demande. */
  key: number;
  /** Nombre de sorts à la suite (0 : aucun, l'échiquier reste immobile). */
  count: number;
}

interface Props {
  theme: string;
  king: string;
  skin: string;
  side: Color;
  play: PlayRequest;
  /** Hors de l'écran : rien ne part, la scène dort. */
  paused: boolean;
  /** Un sort part (pour la légende). */
  onCast: (card: CardId | null) => void;
  /** La série de sorts est finie (ou interrompue). */
  onIdle: () => void;
  /** La scène 3D est impossible (WebGL indisponible). */
  onNoScene: () => void;
}

export function CabinBoard({ theme, king, skin, side, play, paused, onCast, onIdle, onNoScene }: Props) {
  const ref = useRef<BoardHandle>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<GameState>(() => freshGame(side));
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [want, setWant] = useState(false);
  const vfx = useVfx(want ? wrap : null, side, 'boutique');
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const cb = useRef({ onCast, onIdle, onNoScene });
  cb.current = { onCast, onIdle, onNoScene };
  const skinRef = useRef(skin);
  skinRef.current = skin;
  const idxRef = useRef(0);

  useEffect(() => setWrap(ref.current?.wrap ?? null), []);

  // Côté changé : position neuve, de ce côté-ci
  useEffect(() => {
    setState(freshGame(side));
    setHidden(new Set());
  }, [side]);

  // Scène préparée au repos, une fois la vue ouverte (le premier sort part alors sans attendre)
  useEffect(() => {
    if (want) return;
    type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const w = window as IdleWin;
    let idle = 0;
    const t = window.setTimeout(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(() => setWant(true), { timeout: 2500 });
      else setWant(true);
    }, 1400);
    return () => {
      window.clearTimeout(t);
      if (idle) w.cancelIdleCallback?.(idle);
    };
  }, [want]);

  useEffect(() => {
    if (play.count > 0) setWant(true);
  }, [play]);

  useEffect(() => {
    if (vfx && !vfx.stage.ok) cb.current.onNoScene();
  }, [vfx]);

  // Série de sorts demandée : chacun part de la position neuve, puis l'effet se dissipe ; ensuite plus rien ne bouge
  useEffect(() => {
    if (!vfx || play.count <= 0) return;
    let dead = false;
    let s = freshGame(side);
    const apply = (n: GameState) => {
      if (dead) return;
      s = n;
      setState(n);
      vfx.stage.syncMarkers(n.effects, n.pos);
    };
    const run = async () => {
      for (let i = 0; i < play.count && !dead; i++) {
        while (!dead && (pausedRef.current || document.hidden)) await sleep(300);
        if (dead) return;
        if (i > 0 || s.effects.length) {
          apply(freshGame(side));
          await sleep(350);
        }
        let cast = false;
        for (let tries = 0; tries < PREVIEW_ORDER.length && !cast && !dead; tries++) {
          const card = PREVIEW_ORDER[idxRef.current++ % PREVIEW_ORDER.length];
          const index = s.hands[side].findIndex(h => h.card === card);
          if (index < 0 || !cardPlayable(s, side, index)) continue;
          const targets = targetsFor(s, side, index);
          if (!targets) continue;
          const skinId = skinRef.current;
          const r = playCard(s, side, index, targets, skinId);
          if (!r.ok) continue;
          cast = true;
          cb.current.onCast(card);
          await castSafely(vfx, r.info, skinStyle(skinId), {
            impact: () => apply(r.state),
            hide: ids => !dead && setHidden(new Set(ids)),
            show: () => !dead && setHidden(new Set()),
            victimAtBottom: side === 'b',
          });
          if (dead) return;
          setHidden(new Set());
          await sleep(1700);
        }
        if (!cast) break;
      }
      if (dead) return;
      // L'effet se dissipe : entre deux séries, la scène 3D n'a plus rien à dessiner
      apply({ ...s, effects: [] });
      cb.current.onCast(null);
      cb.current.onIdle();
    };
    void run();
    return () => {
      dead = true;
      setHidden(new Set());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfx, play.key]);

  const kingW = side === 'w' ? king : DEFAULT_KING;
  const kingB = side === 'b' ? king : DEFAULT_KING;
  const ksq = kingSquare(state.pos, side);
  // Case du roi à l'écran (vue de son côté : en bas)
  const halo = useMemo(() => {
    if (ksq < 0) return null;
    const f = fileOf(ksq), r = rankOf(ksq);
    const x = side === 'w' ? f : 7 - f;
    const y = side === 'w' ? 7 - r : r;
    // .cb-board a 10 px de marge autour de l'échiquier (cadre) : la case fait (100 % − 20 px) / 8
    return { left: `calc((100% - 20px) * ${x} / 8)`, top: `calc((100% - 20px) * ${y} / 8)` };
  }, [ksq, side]);

  return (
    <div className="cb-board">
      <Board
        ref={ref}
        pos={state.pos}
        orientation={side}
        theme={theme}
        effects={state.effects}
        hidden={hidden}
        locked
        coords
        kingW={kingW}
        kingB={kingB}
      />
      {halo && <span key={`${king}:${side}`} className="cb-halo" style={{ ...halo, '--gem': gemOf(king) } as CSSProperties} aria-hidden="true" />}
    </div>
  );
}
