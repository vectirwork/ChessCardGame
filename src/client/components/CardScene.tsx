// Scène explicative d'un pouvoir (voir cardScenes.ts) : un cas typique sur un petit échiquier.
//
// La plupart des pouvoirs se montrent en deux images, « avant » et « après » ; Trêve et Lune de sang, en une image
// avec leurs flèches. Modes :
// - `still` : images fixes ;
// - `hover` : images fixes, l'action se rejoue au survol, au focus clavier ou au toucher (pouvoirs en cours : aucune
//   animation n'attire l'œil pendant la partie tant qu'on ne la demande pas) ;
// - `auto` : l'action se rejoue en boucle (bulle d'une carte, avant de la lancer).
// En deux images, seule celle de droite s'anime : celle de gauche reste le point de départ.
// `active` : le parent demande l'animation (ligne survolée, tuile). Mouvement réduit : toujours fixe.
// Styles : styles/cards.css (classes csn-*).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, PointerEvent, ReactNode } from 'react';
import type { CardId } from '../../shared/cards';
import { boardStyle } from '../../shared/catalog';
import { nombre } from '../../shared/text/fr';
import { CARD_SCENES, sceneXY } from './cardScenes';
import type { CardSceneDef, PanelDecor, SceneArrow, SceneMark } from './cardScenes';
import { pieceUrl } from './pieces';

type Play = 'still' | 'hover' | 'auto';

function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

/** Position de la scène après `n` étapes : cases des pièces, pièces disparues, explosion, pièce qui tremble. */
function stateAfter(def: CardSceneDef, n: number) {
  const at = new Map(def.pieces.map(p => [p.id, p.at]));
  const gone = new Set<string>();
  let burst: string | null = null;
  let shake: string | null = null;
  def.steps.slice(0, n).forEach((s, i) => {
    for (const [id, to] of s.moves ?? []) at.set(id, to);
    for (const id of s.remove ?? []) gone.add(id);
    const last = i === n - 1;
    burst = last && s.burst ? s.burst : burst && !last ? burst : null;
    shake = last && s.shake ? s.shake : null;
  });
  return { at, gone, burst, shake };
}
type SceneState = ReturnType<typeof stateAfter>;

function Arrow({ a, rows }: { a: SceneArrow; rows: number }) {
  const p = (s: string) => {
    const { x, y } = sceneXY(s);
    return { x: x * 100 + 50, y: (rows - 1 - y) * 100 + 50 };
  };
  const from = p(a.from);
  const to = p(a.to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Les flèches partent du bord de la pièce et s'arrêtent avant la case d'arrivée
  const x1 = from.x + ux * 26;
  const y1 = from.y + uy * 26;
  const x2 = to.x - ux * 30;
  const y2 = to.y - uy * 30;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g className={`csn-arrow tone-${a.tone} ${a.blocked ? 'is-blocked' : ''}`}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={`url(#csn-head-${a.tone})`} />
      {a.blocked && (
        <g className="csn-cross" transform={`translate(${mx} ${my})`}>
          <circle r="15" />
          <path d="M-7 -7 L7 7 M7 -7 L-7 7" />
        </g>
      )}
      {a.n !== undefined && (
        <g className="csn-num" transform={`translate(${from.x - ux * 2 + uy * 30} ${from.y - uy * 2 - ux * 30})`}>
          <circle r="14" />
          <text dy="5">{a.n}</text>
        </g>
      )}
    </g>
  );
}

const boardColors = (() => {
  const bs = boardStyle(undefined);
  return { '--light': bs.light, '--dark': bs.dark } as CSSProperties;
})();

/** Style d'un élément posé sur une case de la scène (marque, point, surlignage, pièce). */
function cell(def: CardSceneDef, at: string, extra?: CSSProperties) {
  const { x, y } = sceneXY(at);
  return { '--x': x, '--y': def.rows - 1 - y, ...extra } as CSSProperties;
}

/** Un petit échiquier : cases, surlignages, marques, points, pièces, explosion, flèches. */
function Board({ def, st, decor, marks, arrows, tint, moving, reset, live, children }: {
  def: CardSceneDef;
  st: SceneState;
  decor?: PanelDecor;
  marks?: SceneMark[];
  arrows: SceneArrow[];
  tint: boolean;
  moving: boolean;
  reset: boolean;
  /** Animation en cours : ce qui apparaît (mur, givre, points) le fait en douceur. */
  live: boolean;
  children?: ReactNode;
}) {
  const style = { ...boardColors, '--cols': def.cols, '--rows': def.rows } as CSSProperties;
  return (
    <div className={`csn ${tint && def.tint ? `tint-${def.tint}` : ''} ${moving ? 'is-moving' : ''} ${reset ? 'is-reset' : ''} ${live ? 'is-live' : ''}`} style={style}>
      <div className="csn-board" aria-hidden="true">
        {Array.from({ length: def.rows * def.cols }, (_, k) => {
          const x = k % def.cols;
          const y = def.rows - 1 - Math.floor(k / def.cols);
          return <span key={k} className={`csn-sq ${(x + y) % 2 === 0 ? 'd' : 'l'}`} />;
        })}
      </div>
      {decor?.hl?.map(at => <span key={`hl-${at}`} className="csn-hl" style={cell(def, at)} aria-hidden="true" />)}
      {marks?.map(m => <span key={`${m.kind}-${m.at}`} className={`csn-mark is-${m.kind}`} style={cell(def, m.at)} aria-hidden="true" />)}
      {decor?.dots?.map(at => <span key={`d-${at}`} className="csn-dot" style={cell(def, at)} aria-hidden="true" />)}
      {decor?.rings?.map(at => <span key={`r-${at}`} className="csn-dot is-ring" style={cell(def, at)} aria-hidden="true" />)}
      {def.pieces.map(p => (
        <span
          key={p.id}
          className={`csn-pc ${st.gone.has(p.id) ? 'is-gone' : ''} ${st.shake === p.id ? 'is-shake' : ''}`}
          style={cell(def, st.at.get(p.id) ?? p.at, { backgroundImage: pieceUrl(p.c, p.t) })}
          aria-hidden="true"
        />
      ))}
      {st.burst && <span key={`burst-${st.burst}`} className="csn-burst" style={cell(def, st.burst)} aria-hidden="true" />}
      {arrows.length > 0 && (
        <svg className="csn-arrows" viewBox={`0 0 ${def.cols * 100} ${def.rows * 100}`} aria-hidden="true">
          <defs>
            {(['gold', 'red', 'cyan', 'white'] as const).map(t => (
              <marker key={t} id={`csn-head-${t}`} className={`tone-${t}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" />
              </marker>
            ))}
          </defs>
          {arrows.map((a, i) => (
            <Arrow key={i} a={a} rows={def.rows} />
          ))}
        </svg>
      )}
      {children}
    </div>
  );
}

/** Sablier fou : une pendule. `fast` : elle s'emballe (traînée de l'aiguille) ; `spinning` : l'aiguille tourne. */
function Clock({ fast, spinning, tag, children }: { fast: boolean; spinning: boolean; tag: ReactNode; children?: ReactNode }) {
  return (
    <div className={`csn is-clocks ${spinning ? 'is-spinning' : ''}`} style={{ '--cols': 1, '--rows': 1 } as CSSProperties}>
      <svg viewBox="0 0 100 100" className={`csn-dial ${fast ? 'is-fast' : ''}`} aria-hidden="true">
        <circle cx="50" cy="46" r="34" />
        {Array.from({ length: 12 }, (_, k) => (
          <line key={k} x1="50" y1="16" x2="50" y2={k % 3 === 0 ? 23 : 19} transform={`rotate(${k * 30} 50 46)`} />
        ))}
        {fast && <path className="csn-trail" d="M50 46 L50 20 A26 26 0 0 1 72.5 33 Z" />}
        <line className="csn-hand" x1="50" y1="46" x2="50" y2="21" />
        <circle cx="50" cy="46" r="3.6" className="csn-hub" />
      </svg>
      <span className="csn-tag">{tag}</span>
      {children}
    </div>
  );
}

export function CardScene({
  id,
  play = 'hover',
  className = '',
  active = false,
  labels = false,
}: {
  id: CardId;
  play?: Play;
  className?: string;
  /** Animée tant que vrai, quel que soit `play` (le parent gère le survol : ligne d'un pouvoir, tuile). */
  active?: boolean;
  /** Légendes sous les deux images (« Avant », « Les deux disparaissent »), là où il y a la place. */
  labels?: boolean;
}) {
  const def = CARD_SCENES[id];
  const reduced = useReducedMotion();
  const [wanted, setWanted] = useState(false);
  /** Type du dernier appui : un toucher émule aussi un survol et un focus, qu'il ne faut pas compter deux fois. */
  const pointer = useRef('mouse');
  const running = !!def && !reduced && (play === 'auto' || active || (play === 'hover' && wanted));
  const [n, setN] = useState(0);
  const [reset, setReset] = useState(false);

  // Étapes jouées l'une après l'autre ; à la fin, la scène revient d'un coup (sans glisser) à son départ, et recommence
  useEffect(() => {
    if (!running || !def) {
      setN(0);
      return;
    }
    let timer = 0;
    let i = 0;
    const next = () => {
      if (i < def.steps.length) {
        i++;
        setReset(false);
        setN(i);
        timer = window.setTimeout(next, def.steps[i - 1].hold ?? 900);
      } else {
        i = 0;
        setReset(true);
        setN(0);
        timer = window.setTimeout(next, 700);
      }
    };
    timer = window.setTimeout(next, 450);
    return () => window.clearTimeout(timer);
  }, [running, def]);

  const st = useMemo(() => (def ? stateAfter(def, n) : null), [def, n]);
  const start = useMemo(() => (def ? stateAfter(def, 0) : null), [def]);
  const end = useMemo(() => (def ? stateAfter(def, def.steps.length) : null), [def]);
  if (!def || !st || !start || !end) return null;

  const hoverProps =
    play === 'hover'
      ? {
          tabIndex: 0,
          onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setWanted(true),
          onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && setWanted(false),
          onPointerDown: (e: PointerEvent) => {
            pointer.current = e.pointerType;
          },
          // Focus au clavier seulement (un toucher donne aussi le focus, sans :focus-visible)
          onFocus: (e: FocusEvent<HTMLDivElement>) => e.currentTarget.matches(':focus-visible') && setWanted(true),
          onBlur: () => setWanted(false),
          // Au toucher : un appui lance la scène, un autre l'arrête
          onClick: () => {
            if (pointer.current !== 'mouse') setWanted(w => !w);
          },
        }
      : {};
  const playHint = play === 'hover' && !running && !reduced && <span className="csn-play" aria-hidden="true" />;
  const common = {
    role: 'img',
    'aria-label': def.caption,
    title: play === 'hover' ? def.caption : undefined,
    ...hoverProps,
  };

  // Une image : position animée, marques et flèches de la scène
  if (!def.pair) {
    return (
      <div className={`csn-one ${running ? 'is-playing' : ''} ${className}`} {...common}>
        <Board def={def} st={st} marks={def.marks} arrows={def.arrows} tint moving={n > 0} reset={reset} live={running}>
          {playHint}
        </Board>
      </div>
    );
  }

  // Deux images : avant (fixe), après (fixe, ou l'action rejouée)
  const pair = def.pair;
  const afterAt = pair.afterAt ?? def.steps.length;
  const showAfter = !running || n >= afterAt;
  const sep = (
    <span className="csn-sep" aria-hidden="true">
      <svg viewBox="0 0 10 16">
        <path d="M2 2 L8 8 L2 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
  return (
    <div className={`csn-pair ${running ? 'is-playing' : ''} ${def.clocks ? 'is-clocks' : ''} ${className}`} {...common}>
      {def.clocks ? (
        <>
          <Clock fast={false} spinning={false} tag="+2 s par coup" />
          {sep}
          <Clock
            fast={showAfter}
            spinning={running && showAfter}
            tag={
              <>
                <b>{`×${nombre(def.clocks.rate)}`}</b> · +0 s
              </>
            }
          >
            {playHint}
          </Clock>
        </>
      ) : (
        <>
          <Board
            def={def}
            st={start}
            decor={pair.before}
            marks={pair.before.marks}
            arrows={pair.before.arrow ? [{ ...pair.before.arrow, tone: 'white' }] : []}
            tint={false}
            moving={false}
            reset={false}
            live={false}
          />
          {sep}
          <Board
            def={def}
            st={running ? st : end}
            decor={showAfter ? pair.after : undefined}
            marks={showAfter ? pair.after.marks : undefined}
            arrows={[]}
            tint={showAfter}
            moving={running && n > 0}
            reset={reset}
            live={running}
          >
            {playHint}
          </Board>
        </>
      )}
      {labels && (
        <>
          <span className="csn-cap">{pair.labels[0]}</span>
          <span />
          <span className="csn-cap">{pair.labels[1]}</span>
        </>
      )}
    </div>
  );
}

/** La scène de ce pouvoir est-elle en deux images ? (mise en page des conteneurs) */
export const scenePaired = (id: CardId) => !!CARD_SCENES[id]?.pair;
