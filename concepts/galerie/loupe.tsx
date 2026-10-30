// Spellmate · La Galerie : la loupe. « Examiner » une vitrine ouvre la carte en grand, son cartel complet
// et un petit échiquier qui rejoue l'effet en boucle (skin de la maison).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Board } from '../../src/client/components/Board';
import type { BoardHandle } from '../../src/client/components/Board';
import { SpellCard } from '../../src/client/components/SpellCard';
import { useVfx } from '../../src/client/vfx/useVfx';
import { CARDS, CARD_IDS, RARITY_LABEL } from '../../src/shared/cards';
import type { CardId } from '../../src/shared/cards';
import { VALUE, fileOf, rankOf } from '../../src/shared/chess';
import { skinStyle } from '../../src/shared/catalog';
import { cardOptions, createGameFromFen, legalMovesOf, playCard, playMove } from '../../src/shared/game';
import type { GameState } from '../../src/shared/game';
import { COLLECTION } from './data';
import { HOUSE_BOARD, HOUSE_SKIN } from './maison';
import { Arrow } from './ui';

const FEN = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/2BQK2R w K - 0 9';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function fresh(): GameState {
  const s = createGameFromFen(FEN, { w: [...CARD_IDS], b: [...CARD_IDS] }, true);
  s.captured = { w: ['r'], b: ['p'] };
  return s;
}

function quietMove(s: GameState) {
  const moves = legalMovesOf(s);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const mover = s.pos.board[m.from]!;
    let score = Math.random() * 30 - (s.pos.board[m.to] ? VALUE[s.pos.board[m.to]!.t] : 0);
    score += (3.5 - Math.abs(3.5 - fileOf(m.to))) * 3 + (3.5 - Math.abs(3.5 - rankOf(m.to))) * 2;
    if (mover.t === 'k') score -= 60;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Petit échiquier qui rejoue une seule carte, en boucle. */
function Rejeu({ card }: { card: CardId }) {
  const ref = useRef<BoardHandle>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<GameState>(fresh);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const vfx = useVfx(wrap, 'w');
  useEffect(() => setWrap(ref.current?.wrap ?? null), []);

  useEffect(() => {
    if (!vfx) return;
    let dead = false;
    let s = fresh();
    const apply = (n: GameState) => {
      s = n;
      setState(n);
      vfx.stage.syncMarkers(n.effects, n.pos);
    };
    const loop = async () => {
      while (!dead) {
        apply(fresh());
        await sleep(800);
        // Un coup de chaque camp : le Retour arrière a besoin d'un coup adverse à annuler
        for (let k = 0; k < 2 && !dead; k++) {
          const m = quietMove(s);
          const r = m && playMove(s, m.from, m.to, m.promo);
          if (r && r.ok) apply(r.state);
          await sleep(650);
        }
        if (dead) return;
        const index = s.hands.w.findIndex(h => h.card === card);
        const targets: number[] = [];
        for (let k = 0; k < CARDS[card].targets; k++) {
          const opts = cardOptions(s, 'w', index, targets);
          if (!opts.length) break;
          opts.sort((a, b) => Math.abs(3.5 - fileOf(a)) + Math.abs(3.5 - rankOf(a)) - (Math.abs(3.5 - fileOf(b)) + Math.abs(3.5 - rankOf(b))));
          targets.push(opts[Math.floor(Math.random() * Math.min(3, opts.length))]);
        }
        const r = playCard(s, 'w', index, targets, HOUSE_SKIN);
        if (r.ok) {
          await vfx.m.playCast(vfx.stage, r.info, skinStyle(HOUSE_SKIN), {
            impact: () => apply(r.state),
            hide: ids => setHidden(new Set(ids)),
            show: () => setHidden(new Set()),
            victimAtBottom: false,
          });
          setHidden(new Set());
        }
        await sleep(2600);
      }
    };
    void loop();
    return () => {
      dead = true;
    };
  }, [vfx, card]);

  return (
    <Board ref={ref} pos={state.pos} orientation="w" theme={HOUSE_BOARD} effects={state.effects} hidden={hidden} locked coords={false} />
  );
}

export function Loupe({ id, onClose }: { id: CardId; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const def = CARDS[id];
  const n = COLLECTION.indexOf(id) + 1;
  const [leaving, setLeaving] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (reduce) return;
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
      tl.fromTo('.lp-sheet', { yPercent: 100 }, { yPercent: 0, duration: 0.9, ease: 'expo.inOut' }, 0);
      tl.from('.lp-card', { y: 80, rotation: -4, opacity: 0, duration: 1.1 }, 0.45);
      tl.from('.lp-board', { y: 60, opacity: 0, duration: 1.1 }, 0.55);
      tl.from('.lp-text > *', { y: 24, opacity: 0, duration: 0.9, stagger: 0.05 }, 0.6);
    }, root);
    closeBtn.current?.focus({ preventScroll: true });
    return () => ctx.revert();
  }, [reduce]);

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    if (reduce || !root.current) return onClose();
    gsap.to(root.current.querySelector('.lp-sheet'), { yPercent: 100, duration: 0.7, ease: 'expo.inOut', onComplete: onClose });
    gsap.to(root.current.querySelectorAll('.lp-inner'), { opacity: 0, duration: 0.25 });
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab' && root.current) {
        const f = Array.from(root.current.querySelectorAll<HTMLElement>('button'));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <div className="loupe" ref={root} role="dialog" aria-modal="true" aria-label={`Examiner : ${def.name}`}>
      <div className="lp-sheet">
        <div className="lp-inner">
          <header className="lp-top">
            <span className="ct-num">N° {String(n).padStart(2, '0')} · Examen de la pièce</span>
            <button className="jeu-back lp-close" ref={closeBtn} onClick={close}>
              <Arrow dir="left" size={18} /> <span>Retour à la salle</span>
            </button>
          </header>
          <div className="lp-grid">
            <div className="lp-card">
              <SpellCard id={id} size="full" tilt={false} />
            </div>
            <div className="lp-text">
              <span className="v-meta">{RARITY_LABEL[def.rarity]} · {def.duration}</span>
              <h3 className="lp-name">{def.name}</h3>
              <p className="lp-tag">« {def.tagline} »</p>
              <p className="lp-rule">{def.description}</p>
              <p className="lp-how">À droite, l’effet rejoué sur un échiquier de la maison : un coup de chaque camp, puis la carte.</p>
            </div>
            <figure className="lp-board maison">
              <Rejeu card={id} />
              <figcaption><i className="live-dot" /> Rejeu en boucle · skin Encre &amp; vermillon</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  );
}
