// Échiquier de la descente : il joue seul et lance, à la demande, le sort du lieu traversé.
// À la différence de DemoBoard, le sort est piloté par le défilement (prop `act`).
// Une seule instance pour les lieux II à VI : au changement de lieu (`resetSignal`), elle n'est plus remontée (≈ 200
// nœuds recréés, scène 3D détachée puis rattachée, plateau retramé en pleine traversée) mais remise à neuf : sort en
// attente, effets, scène 3D et position repartent de zéro, et la démonstration reprend comme au premier montage.
// Il distribue les huit pouvoirs (catalogue « climats ») aux deux camps ; un autre catalogue reste accepté.
// Sobriété (D6) : la scène 3D est partagée d'un lieu à l'autre (un seul contexte WebGL, gardé par useVfx) ; la
// démonstration se met en pause quand l'onglet est caché, pendant les traversées, et quand le visiteur ne fait plus
// rien depuis IDLE_MS (elle reprend au premier geste).
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import type { BoardHandle } from '../components/Board';
import { MATE_FALL_MS, matedKing } from '../components/mate';
import { CARDS, cardsOf, isCardId } from '../../shared/cards';
import type { CardId, Catalog } from '../../shared/cards';
import { VALUE, fileOf, rankOf } from '../../shared/chess';
import type { Color, Position } from '../../shared/chess';
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

/** Sans défilement, souris, toucher ni clavier depuis ce délai, la démonstration s'arrête après son geste en cours. */
const IDLE_MS = 30000;
let lastInput = performance.now();
const onInput = () => {
  lastInput = performance.now();
};
const idle = () => performance.now() - lastInput > IDLE_MS;

/** Un sort ne part qu'après ce délai sans défilement : pendant le geste, la scène 3D plein écran et les pièces
 *  dressées (un calque composé chacune) se disputeraient chaque image avec le défilement (téléphones). Un coup de la
 *  démonstration l'attend aussi : son rendu et sa glissade ne prennent rien au geste. */
const SETTLE_MS = 280;
let lastScroll = 0;
const onScrollInput = () => {
  lastScroll = performance.now();
};

let demoCatalog: Exclude<Catalog, 'aucune'> = 'climats';

/** Position de départ de la démonstration : toutes les cartes du catalogue, dans les deux camps. */
const fresh = (): GameState => {
  const ids = cardsOf(demoCatalog);
  return createGame({ w: [...ids], b: [...ids] }, true, demoCatalog);
};

/** L'échiquier montre-t-il exactement cette position (pièces visibles, hors pièces qui s'effacent) ? */
function showsPosition(wrap: HTMLElement, pos: Position) {
  let n = 0;
  for (const el of Array.from(wrap.querySelectorAll<HTMLElement>('.piece:not(.ghost):not(.vanish)'))) {
    if (String(pos.board[Number(el.dataset.at)]?.id) !== el.dataset.piece) return false;
    n++;
  }
  return n === pos.board.reduce((c, p) => (p ? c + 1 : c), 0);
}

/**
 * Remise à neuf sans remontage (changement de lieu). Un échiquier remonté apparaissait d'un coup ; remis à neuf, il
 * déclencherait des transitions (couleurs des cases au changement de thème, pièces qui rentrent chez elles, pièces
 * prises qui réapparaissent, effets qui s'effacent) : elles sont menées à leur terme avant la première image
 * (getAnimations() lance celles qui sont dues, finish() les achève). Jusqu'à ce que l'échiquier montre la position
 * neuve, tout est achevé. Ensuite et jusqu'au coup suivant, les pièces revenues gardent dans Board l'état « appear » :
 * une telle pièce remontée (cachée puis remontrée pendant un sort) ou dont une classe a remplacé puis rendu l'animation
 * de .pi la rejouerait ; seules celles-là sont achevées, comme sur un échiquier neuf où elle n'existe pas. Rien d'autre
 * n'est lu pendant ce temps (le premier sort d'un lieu change les classes de tout l'échiquier : chaque lot de mutations
 * ne coûte qu'un parcours de ses enregistrements, sans calcul de style). Renvoie l'arrêt.
 * Bornes de sûreté (si l'échiquier ne disait plus où sont ses pièces, data-at et data-piece) : la première phase dure
 * au plus 600 ms (la position neuve est affichée en une ou deux images), le tout au plus 15 s.
 */
function settleFresh(wrap: HTMLElement, current: () => Position): () => void {
  if (typeof wrap.getAnimations !== 'function') return () => undefined;
  const t0 = performance.now();
  let first: Position | null = null;
  const finish = (all: boolean) => {
    for (const a of wrap.getAnimations({ subtree: true })) {
      if (!all && !(a instanceof CSSAnimation && a.animationName === 'appear')) continue;
      // Une animation sans fin (pièce qui flotte, halo) ne s'achève pas : elle n'est d'ailleurs pas due au changement
      if (a.effect?.getComputedTiming().endTime === Infinity) continue;
      a.finish();
    }
  };
  /** Apparitions relancées par ce lot : pièces encore « appear » ajoutées au DOM, ou dont la classe a changé. */
  const settleAppear = (records: MutationRecord[]) => {
    const pieces = new Set<Element>();
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach(n => {
          if (!(n instanceof Element)) return;
          if (n.matches('.piece.appear')) pieces.add(n);
          n.querySelectorAll('.piece.appear').forEach(el => pieces.add(el));
        });
      } else if (r.attributeName === 'class' && r.target instanceof Element && r.target.matches('.piece.appear')) pieces.add(r.target);
    }
    for (const el of pieces) {
      for (const a of el.getAnimations({ subtree: true })) if (a instanceof CSSAnimation && a.animationName === 'appear') a.finish();
    }
  };
  const check = (records: MutationRecord[] = []) => {
    const pos = current();
    if (first) {
      // Coup suivant affiché : l'échiquier vit de nouveau sa vie (la position n'est relue qu'une fois changée)
      if (pos !== first && showsPosition(wrap, pos)) return stop();
      settleAppear(records);
      return;
    }
    if (performance.now() - t0 > 600) {
      first = pos;
      finish(false);
      return;
    }
    finish(true);
    if (showsPosition(wrap, pos)) first = pos;
  };
  const mo = new MutationObserver(check);
  const timer = window.setTimeout(() => mo.disconnect(), 15000);
  const stop = () => {
    mo.disconnect();
    window.clearTimeout(timer);
  };
  check();
  mo.observe(wrap, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-at'] });
  return stop;
}

/** Accès aux champs internes de la scène d'effets (perspective, calque) sans modifier le module partagé. */
interface StageInternals {
  perspective: number;
  canvas: HTMLCanvasElement | null;
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
  /** Change à chaque lieu (son index) : position neuve, effets et scène 3D vidés, démonstration reprise de zéro, d'un
   *  coup (comme un échiquier neuf, sans transition), pendant que l'échiquier traverse la nuée. */
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

/** Mémoïsé : l'accueil se re-rend à chaque seuil du défilement (chapitre, amarrage), sans rien changer ici. */
export const StageBoard = memo(function StageBoard({ act, catalog, theme, resetSignal, paused, tilt, still, playSignal, onCast, onCanvas }: Props) {
  demoCatalog = catalog;
  const ref = useRef<BoardHandle>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<GameState>(fresh);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const vfx = useVfx(wrap, 'w', 'odyssee-stage');
  const actRef = useRef(act);
  const pausedRef = useRef(paused);
  const castRef = useRef(onCast);
  const wakeRef = useRef<() => void>(() => undefined);
  const epochRef = useRef(0);
  const sRef = useRef<GameState>(state);
  const tiltRef = useRef(tilt);
  const tiltUntil = useRef(0);
  const castingRef = useRef(false);
  const holdRef = useRef(0);
  const resetRef = useRef(resetSignal);
  /** Arrête la boucle de démonstration en cours (une autre la remplace, sans rien hériter d'elle). */
  const stopLoopRef = useRef<() => void>(() => undefined);
  const settleRef = useRef<() => void>(() => undefined);
  pausedRef.current = paused;
  castRef.current = onCast;
  tiltRef.current = tilt;

  useEffect(() => setWrap(ref.current?.wrap ?? null), []);

  // Activité du visiteur : la démonstration ne joue que pour quelqu'un qui est là
  useEffect(() => {
    lastInput = performance.now();
    const evs = ['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart'] as const;
    for (const e of evs) window.addEventListener(e, onInput, { passive: true });
    window.addEventListener('scroll', onScrollInput, { passive: true });
    return () => {
      for (const e of evs) window.removeEventListener(e, onInput);
      window.removeEventListener('scroll', onScrollInput);
    };
  }, []);

  // Calque WebGL : signalé au moteur (il suit l'opacité de l'échiquier). La scène est rendue à useVfx au démontage
  // (gardée pour le lieu suivant, puis libérée)
  useEffect(() => {
    if (!vfx) return;
    const st = vfx.stage as unknown as StageInternals;
    st.canvas?.classList.add('o-stage-canvas');
    onCanvas?.(st.canvas);
    return () => {
      onCanvas?.(null);
      window.clearInterval(holdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfx]);

  // Textures du skin du lieu (ornement, particules) dessinées et envoyées au premier moment calme : le premier sort ne
  // les prépare plus au milieu de son animation (les programmes, eux, sont préparés par useVfx)
  useEffect(() => {
    if (vfx) void vfx.stage.warm([], vfx.m.warmTextures([skinStyle(act.skin)]));
  }, [vfx, act.skin]);

  // Nouvelle carte : on réveille la boucle pour lancer le sort tout de suite
  useEffect(() => {
    const changed = actRef.current.key !== act.key;
    actRef.current = act;
    if (changed) wakeRef.current();
  }, [act]);

  // Nouveau lieu : l'échiquier repart de zéro, comme remonté. Avant la première image (effet de mise en page) : le thème
  // du lieu vient de changer avec ce rendu, et rien de l'ancienne démonstration ne doit jouer sur la nouvelle
  useLayoutEffect(() => {
    if (resetRef.current === resetSignal) return;
    resetRef.current = resetSignal;
    // La boucle en cours s'arrête là (ses attentes ne joueront plus rien) ; la suivante démarre avec ce rendu
    stopLoopRef.current();
    epochRef.current++;
    tiltUntil.current = 0;
    const s = fresh();
    sRef.current = s;
    setState(s);
    setHidden(new Set());
    // Scène 3D vidée (sort en cours, objets, inclinaison), comme au démontage puis au remontage
    if (vfx && wrap) vfx.stage.attach(wrap, 'w');
    vfx?.stage.syncMarkers(s.effects, s.pos);
    settleRef.current();
    settleRef.current = wrap ? settleFresh(wrap, () => sRef.current.pos) : () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);
  useEffect(() => () => settleRef.current(), []);

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

  /** Pendant un sort, l'inclinaison de la scène 3D est entretenue (une minuterie qui n'existe que pendant le sort). */
  const casting = (on: boolean) => {
    castingRef.current = on;
    window.clearInterval(holdRef.current);
    holdRef.current = on ? window.setInterval(() => void holdTilt(2200), 900) : 0;
  };

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
    const family = vfx.stage.family;
    const show = (n: GameState) => {
      if (epoch !== epochRef.current) return;
      sRef.current = n;
      setState(n);
      // Impact forcé après la sortie du lieu (garde-fou du sort) : la scène peut être passée à la partie de l'accueil
      if (vfx.stage.family === family) vfx.stage.syncMarkers(n.effects, n.pos);
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
      show: () => epoch === epochRef.current && setHidden(new Set()),
      victimAtBottom: prep.color === 'b',
    });
  }, [vfx, still, act.key, playSignal]);

  // Boucle de démonstration ; une nouvelle à chaque lieu (resetSignal). Une boucle arrêtée (lieu changé) ne touche plus
  // à rien de partagé (état, pièces cachées, inclinaison entretenue, réveil) : la suivante part de zéro, comme sur un
  // échiquier remonté
  useEffect(() => {
    if (!vfx || still) return;
    let dead = false;
    let sinceCast = 99;
    let lastKey = '';
    let cardIdx = 0;
    const wait = (ms: number) =>
      new Promise<void>(resolve => {
        if (dead) return resolve();
        const t = setTimeout(resolve, ms);
        wakeRef.current = () => {
          clearTimeout(t);
          resolve();
        };
      });
    const family = vfx.stage.family;
    const apply = (n: GameState, epoch: number) => {
      if (dead || epoch !== epochRef.current) return;
      sRef.current = n;
      setState(n);
      // Un sort coupé par la sortie du lieu finit par son garde-fou, après le démontage : la scène partagée peut être
      // passée entre-temps à la partie de l'accueil (useVfx), qui ne doit pas recevoir les objets de la démonstration
      if (vfx.stage.family === family) vfx.stage.syncMarkers(n.effects, n.pos);
    };
    /** Lance un sort ; null : remis à plus tard (défilement repris, lieu ou chapitre changé pendant l'attente). */
    const cast = async (): Promise<boolean | null> => {
      const a = actRef.current;
      if (!a.cards.length) return false;
      while (!dead && performance.now() - lastScroll < SETTLE_MS) await sleep(120);
      if (dead || pausedRef.current || actRef.current.key !== a.key) return null;
      for (let tries = 0; tries < a.cards.length + 1; tries++) {
        if (dead) return null;
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
        casting(true);
        await holdTilt(2600);
        // Boucle arrêtée : son arrêt a déjà rendu l'inclinaison entretenue (celle de la suivante n'est pas la sienne)
        if (dead) return false;
        if (epoch !== epochRef.current || actRef.current.key !== a.key) {
          casting(false);
          return false;
        }
        // La légende annonce le sort au moment où il part, avec la carte réellement lancée
        castRef.current?.(card, a.skin);
        await castSafely(vfx, r.info, skinStyle(a.skin), {
          impact: () => apply(r.state, epoch),
          hide: ids => epoch === epochRef.current && setHidden(new Set(ids)),
          show: () => epoch === epochRef.current && setHidden(new Set()),
          victimAtBottom: color === 'b',
        });
        if (dead) return false;
        setHidden(new Set());
        // L'effet reste visible un instant, puis se dissipe : entre deux sorts, la scène 3D n'a plus rien à dessiner
        await wait(1700);
        if (!dead && epoch === epochRef.current && sRef.current.effects.length) {
          apply({ ...sRef.current, effects: [] }, epoch);
          await sleep(500);
        }
        if (!dead) casting(false);
        return true;
      }
      return false;
    };
    const loop = async () => {
      await sleep(700);
      while (!dead) {
        if (document.hidden || pausedRef.current || idle()) {
          await sleep(300);
          continue;
        }
        const s = sRef.current;
        if (s.result || s.ply > 44) {
          // Un mat se montre : le roi tombe (Board, mated), reste couché un instant, puis la partie repart à zéro
          await wait(s.result?.reason === 'checkmate' ? MATE_FALL_MS + 600 : 900);
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
          const prevKey = lastKey;
          lastKey = a.key;
          if (fresher) cardIdx = 0;
          const done = await cast();
          if (done === null) {
            // Remis à plus tard : le sort du chapitre reste dû
            lastKey = prevKey;
            continue;
          }
          if (done) {
            sinceCast = 0;
            await wait(1300);
            continue;
          }
        }
        lastKey = a.key;
        if (dead || pausedRef.current) continue;
        // Un coup attend lui aussi l'arrêt du défilement (comme un sort) : pendant le geste, l'échiquier défile avec le
        // texte sans rien jouer, la démonstration reprend à l'arrêt. Un chapitre atteint pendant le geste passe avant
        while (!dead && performance.now() - lastScroll < SETTLE_MS && actRef.current.key === a.key) await sleep(120);
        if (dead || pausedRef.current || actRef.current.key !== a.key) continue;
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
    const stop = () => {
      if (dead) return;
      dead = true;
      casting(false);
      wakeRef.current();
    };
    stopLoopRef.current = stop;
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfx, still, resetSignal]);

  // Même objet tant que le journal ne change pas : le Board (mémoïsé) ne se re-rend pas pour rien
  const lastMove = useMemo(() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.k === 'move' && !e.undone) return { from: e.from, to: e.to };
    }
    return null;
  }, [state.log]);

  return (
    <Board
      ref={ref}
      pos={state.pos}
      orientation="w"
      theme={theme}
      effects={state.effects}
      lastMove={lastMove}
      mated={matedKing(state)}
      hidden={hidden}
      locked
      coords={false}
    />
  );
});
