// Spellmate · La Galerie : la Salle de jeu. La galerie coulisse vers la gauche comme une porte,
// l'échiquier s'installe en plein écran sur fond papier, les cartes deviennent des cartels.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { Board } from '../../src/client/components/Board';
import { CardBack, SpellCard } from '../../src/client/components/SpellCard';
import { pieceUrl } from '../../src/client/components/pieces';
import { CARDS, RARITY_LABEL } from '../../src/shared/cards';
import { sanToFrench } from '../../src/shared/chess';
import type { Color, PieceType } from '../../src/shared/chess';
import { describeCardPlay } from '../../src/shared/game';
import type { ResultReason } from '../../src/shared/game';
import type { LocalGame } from '../_shared/localGame';
import { PROMPT_VOUS } from './data';
import { Arrow, Star } from './ui';

export interface HeroRects {
  board: DOMRect | null;
  /** Centre et largeur (hors rotation) des cartes de l'éventail. */
  cards: { cx: number; cy: number; w: number; r: number }[];
  /** Instantané de l'échiquier du Hall (copie du DOM), pour que l'objet qui vole soit bien le même. */
  snap?: { node: HTMLElement; tilt: number; zoom: number } | null;
}

interface Props {
  g: LocalGame;
  hero: () => HeroRects;
  viewEl: HTMLElement | null;
  onOpened: () => void;
  onClosed: () => void;
}

const REASON: Partial<Record<ResultReason, string>> = {
  checkmate: 'Échec et mat',
  stalemate: 'Pat',
  repetition: 'Triple répétition',
  fifty: 'Règle des cinquante coups',
  insufficient: 'Matériel insuffisant',
  resign: 'Abandon',
};

const onScreen = (r: DOMRect | null) => !!r && r.width > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;

function flipFrom(from: { cx: number; cy: number; w: number }, to: DOMRect, toW = to.width) {
  return {
    x: from.cx - (to.left + to.width / 2),
    y: from.cy - (to.top + to.height / 2),
    scale: from.w / toW,
  };
}

function Captured({ pieces, color }: { pieces: PieceType[]; color: Color }) {
  if (!pieces.length) return <span className="cap-none">Aucune prise</span>;
  return (
    <span className="cap-row">
      {pieces.map((t, i) => (
        <i key={i} className="cap-pc" style={{ backgroundImage: pieceUrl(color, t) }} />
      ))}
    </span>
  );
}

export function Jeu({ g, hero, viewEl, onOpened, onClosed }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const boardBox = useRef<HTMLDivElement>(null);
  const snapBox = useRef<HTMLDivElement>(null);
  const cardEls = useRef<(HTMLDivElement | null)[]>([]);
  const [closing, setClosing] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ouverture : la porte coulisse, l'échiquier et les cartes quittent le Hall pour leur place
  useLayoutEffect(() => {
    const el = root.current!;
    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.from(el, { opacity: 0, duration: 0.3, onComplete: opened });
        return;
      }
      const W = window.innerWidth;
      const h = hero();
      const to = boardBox.current!.getBoundingClientRect();
      const cardTo = cardEls.current.map(c => (c ? { rect: c.getBoundingClientRect(), w: c.offsetWidth } : null));
      const D = 1.3;
      const tl = gsap.timeline({ onComplete: opened, defaults: { ease: 'expo.inOut' } });
      // La porte : un panneau de papier, son chant d'encre et l'ombre qu'il pousse devant lui
      tl.fromTo('.jeu-panel', { xPercent: 100 }, { xPercent: 0, duration: D }, 0);
      tl.fromTo('.jeu-shadow', { scaleX: 0.25, opacity: 0 }, { scaleX: 1, opacity: 1, duration: D * 0.8, ease: 'power2.out' }, 0);
      if (viewEl) tl.to(viewEl, { x: -W * 0.32, scale: 0.94, transformOrigin: '50% 50%', duration: D }, 0);
      let t0 = 0;
      if (onScreen(h.board)) {
        const b = h.board!;
        const snap = h.snap;
        if (snap && snapBox.current) {
          snapBox.current.appendChild(snap.node);
          // L'échiquier exposé se remet à plat avant de quitter son passe-partout
          if (Math.abs(snap.tilt) > 0.5 || snap.zoom !== 1) {
            gsap.set(snap.node, { '--tilt': `${snap.tilt}deg`, '--zoom': snap.zoom });
            tl.to(snap.node, { '--tilt': '0deg', '--zoom': 1, duration: 0.25, ease: 'power2.out' }, 0);
            t0 = 0.22;
          }
          tl.to(snapBox.current, { opacity: 0, duration: D * 0.25, ease: 'power1.inOut' }, t0 + D * 0.45);
        }
        tl.from(boardBox.current, { ...flipFrom({ cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width }, to), duration: D }, t0);
      } else {
        tl.from(boardBox.current, { x: W * 0.35, scale: 0.86, duration: D }, 0);
      }
      cardTo.forEach((t, i) => {
        const c = cardEls.current[i];
        const from = h.cards[i];
        if (!c || !t) return;
        if (from && from.cy > 0 && from.cy < window.innerHeight && from.cx > 0 && from.cx < W) {
          tl.from(c, { ...flipFrom(from, t.rect, t.w), rotation: from.r, duration: D }, t0 + 0.05 * i);
        } else {
          tl.from(c, { x: W * 0.4, y: 60, rotation: 8, duration: D }, 0.06 * i);
        }
      });
      tl.from('.jeu-rule', { scaleX: 0, duration: 1, ease: 'expo.out' }, D * 0.6);
      tl.from('.jeu-top > *', { yPercent: -140, opacity: 0, duration: 0.9, stagger: 0.07, ease: 'expo.out' }, D * 0.66);
      tl.from('.jeu [data-j]', { y: 26, opacity: 0, duration: 0.9, stagger: 0.06, ease: 'expo.out' }, D * 0.7);
      tl.from('.cc-text', { x: 28, opacity: 0, duration: 0.9, stagger: 0.07, ease: 'expo.out' }, D * 0.76);
      // Une fois la porte fermée, son chant sort du cadre : plus aucun filet au bord gauche
      tl.to('.jeu-edge, .jeu-shadow', { opacity: 0, duration: 0.3, ease: 'power1.out' }, D);
      // Aide aux captures (développement seulement) : ?gel=0.4 fige la transition à 40 %
      if (import.meta.env.DEV) {
        const gel = parseFloat(new URLSearchParams(window.location.search).get('gel') ?? '');
        if (gel >= 0 && gel < 1) tl.pause(tl.duration() * gel);
      }
    }, el);
    return () => ctx.revert();
    // L'ouverture ne se joue qu'une fois, au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opened = () => {
    root.current?.querySelector<HTMLElement>('.jeu-back')?.focus({ preventScroll: true });
    onOpened();
  };

  // Clavier : Échap ramène à la galerie, Tab reste dans la Salle de jeu
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (g.selectedDef) g.cancel();
        else close();
        return;
      }
      if (e.key !== 'Tab' || !root.current) return;
      const f = Array.from(root.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'));
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) {
        e.preventDefault();
        f[0].focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const close = () => {
    if (closing) return;
    setClosing(true);
    g.cancel();
    if (reduce) {
      gsap.to(root.current, { opacity: 0, duration: 0.25, onComplete: onClosed });
      return;
    }
    const W = window.innerWidth;
    const h = hero();
    const tl = gsap.timeline({ onComplete: onClosed, defaults: { ease: 'expo.inOut' } });
    const D = 1.15;
    tl.to('.jeu-top > *, .jeu [data-j], .cc-text, .jeu-result, .jeu-rule', { opacity: 0, y: -12, duration: 0.35, stagger: 0.015, ease: 'power2.in' }, 0);
    const box = boardBox.current!;
    const now = box.getBoundingClientRect();
    if (onScreen(h.board)) {
      const b = h.board!;
      tl.to(box, { ...flipFrom({ cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width }, now), duration: D }, 0.18);
    } else {
      tl.to(box, { x: W * 0.4, scale: 0.86, duration: D }, 0.18);
    }
    cardEls.current.forEach((c, i) => {
      if (!c) return;
      const from = h.cards[i];
      const r = c.getBoundingClientRect();
      if (from) tl.to(c, { ...flipFrom(from, r, c.offsetWidth), rotation: from.r, duration: D }, 0.18 + 0.03 * i);
      else tl.to(c, { x: W * 0.4, duration: D }, 0.18);
    });
    tl.set('.jeu-edge', { opacity: 1 }, 0.16);
    tl.fromTo('.jeu-shadow', { opacity: 1, scaleX: 1 }, { opacity: 0, scaleX: 0.3, duration: D, ease: 'power2.in' }, 0.18);
    tl.to('.jeu-panel', { xPercent: 100, duration: D }, 0.18);
    if (viewEl) tl.to(viewEl, { x: 0, scale: 1, duration: D }, 0.18);
  };

  const s = g.state;
  const rows = useMemo(() => {
    const out: { key: number; n: string; who: Color; text: string; card: boolean; undone: boolean }[] = [];
    let no = 0;
    s.log.forEach((e, k) => {
      if (e.k === 'move') {
        if (e.c === 'w' && !e.undone) no++;
        const n = e.c === 'w' ? `${e.undone ? no + 1 : no}.` : `${no}…`;
        out.push({ key: k, n, who: e.c, text: sanToFrench(e.san), card: false, undone: !!e.undone });
      } else {
        out.push({ key: k, n: '', who: e.c, text: describeCardPlay(e.card, e.targets), card: true, undone: false });
      }
    });
    return out.slice(-11);
  }, [s.log]);

  const botCasting = g.lastCast?.by === 'bot' && g.busy;
  let status = '';
  let tone = '';
  if (g.result) {
    status = g.result.winner === 'w' ? 'Victoire' : g.result.winner === 'b' ? 'Défaite' : 'Partie nulle';
    tone = 'end';
  } else if (botCasting) {
    status = `L’Automate lance ${CARDS[g.lastCast!.card as keyof typeof CARDS].name}`;
    tone = 'bot';
  } else if (g.busy && s.pos.turn === 'b') {
    status = 'L’Automate réfléchit';
    tone = 'bot';
  } else if (g.busy) {
    status = 'Le sort se déploie';
    tone = 'cast';
  } else if (g.selectedDef) {
    status = g.selectedDef.targets ? 'Choisissez la cible' : 'Prêt à lancer';
    tone = 'cast';
  } else if (g.myTurn) {
    status = 'À vous de jouer';
    tone = 'you';
  }

  const promptText = g.selectedDef
    ? g.selectedDef.targets
      ? (PROMPT_VOUS[g.selectedDef.id]?.[g.boardProps.chosen.length] ?? g.prompt)
      : g.selectedDef.description
    : '';
  const peekDef = peek !== null && g.hand[peek]?.card ? CARDS[g.hand[peek].card!] : null;
  const isMobile = () => window.matchMedia('(max-width: 899.98px)').matches;

  const resultTitle = g.result ? (g.result.winner === 'w' ? 'Vous l’emportez.' : g.result.winner === 'b' ? 'L’Automate l’emporte.' : 'Partie nulle.') : '';

  return (
    <div className={`jeu ${closing ? 'is-closing' : ''}`} ref={root} role="dialog" aria-label="Partie contre l’Automate">
      <div className="jeu-panel">
        <span className="jeu-shadow" />
        <span className="jeu-edge">
          <i className="je-mark" />
          <i className="je-mark" />
        </span>
      </div>

      <span className="jeu-rule" aria-hidden="true" />
      <header className="jeu-top">
        <button className="jeu-back" onClick={close}>
          <Arrow dir="left" size={18} /> <span>Retour à la galerie</span>
        </button>
        <div className="jeu-name">
          <Star size={12} className="verm" /> <em>La Salle de jeu</em> <span className="jn-sep">·</span> Partie anonyme, vous jouez les Blancs
        </div>
        <div className={`jeu-status st-${tone}`} aria-live="polite">
          <i className="st-dot" />
          {status}
        </div>
      </header>

      <aside className="jeu-left">
        <div className="opp" data-j>
          <span className="lbl">Adversaire</span>
          <span className="opp-name"><em>L’Automate</em></span>
          <span className="opp-meta">Niveau Apprenti · joue aussi ses cartes</span>
          <div className="opp-hand">
            {s.hands.b.map((h, i) => (
              <CardBack key={i} size="mini" used={h.used} />
            ))}
          </div>
        </div>
        <div className="registre" data-j>
          <span className="lbl">Registre de la partie</span>
          {rows.length ? (
            <ol>
              {rows.map(r => (
                <li key={r.key} className={`${r.card ? 'r-card' : ''} ${r.undone ? 'r-undone' : ''} ${r.who === 'w' ? 'r-w' : 'r-b'}`}>
                  <span className="r-no">{r.card ? <Star size={9} /> : r.n}</span>
                  <span className="r-txt">{r.text}</span>
                  <span className="r-who">{r.who === 'w' ? 'Vous' : 'Automate'}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="registre-empty">La première page est blanche. Jouez un coup, ou ouvrez avec un sort.</p>
          )}
        </div>
        <div className="captures" data-j>
          <span className="lbl">Prises</span>
          <div className="cap-line"><span>Vous</span><Captured pieces={s.captured.b} color="b" /></div>
          <div className="cap-line"><span>Automate</span><Captured pieces={s.captured.w} color="w" /></div>
        </div>
      </aside>

      <div className="jeu-board maison" ref={boardBox}>
        <Board ref={g.boardRef} {...g.boardProps} />
        <div className="jeu-snap" ref={snapBox} aria-hidden="true" />
        {g.result && (
          <div className="jeu-result">
            <span className="ct-num">{REASON[g.result.reason] ?? 'Fin de partie'}</span>
            <span className="jr-title"><em>{resultTitle}</em></span>
            <div className="jr-actions">
              <button className="jr-btn jr-primary" onClick={g.reset}>Rejouer</button>
              <button className="jr-btn" onClick={close}>Retour à la galerie</button>
            </div>
          </div>
        )}
      </div>

      <aside className="jeu-hand">
        <span className="lbl" data-j>Votre main · une carte par tour</span>
        <div className="cc-list">
          {g.hand.map((h, i) => {
            if (!h.card) return null;
            const def = CARDS[h.card];
            return (
              <div
                key={i}
                className={`cc ${g.selected === i ? 'on' : ''} ${peek === i ? 'is-peek' : ''} ${h.used ? 'is-used' : ''}`}
                onClickCapture={e => {
                  // Sur téléphone, un premier toucher montre la règle ; le second lance la carte
                  if (!isMobile() || h.used) return;
                  if (peek !== i && g.selected !== i) {
                    e.stopPropagation();
                    setPeek(i);
                  } else {
                    setPeek(null);
                  }
                }}
              >
                <div
                  className="cc-card"
                  ref={el => {
                    cardEls.current[i] = el;
                  }}
                >
                  <SpellCard
                    id={h.card}
                    size="hand"
                    used={h.used}
                    selected={g.selected === i}
                    disabled={!h.used && !g.playable[i]}
                    onClick={() => {
                      setPeek(null);
                      g.pickCard(i);
                    }}
                  />
                </div>
                <div className="cc-text">
                  <span className="cc-num">N° {String(i + 1).padStart(2, '0')}{h.used ? ' · utilisée' : ''}</span>
                  <span className="cc-name">{def.name}</span>
                  <span className="cc-meta">{RARITY_LABEL[def.rarity]} · {def.duration}</span>
                  <span className="cc-desc">{def.description}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="jeu-prompt" data-j aria-live="polite">
          {g.selectedDef ? (
            <>
              <span className="jp-text"><Star size={10} className="verm" /> {promptText}</span>
              <span className="jp-actions">
                {g.selectedDef.targets === 0 && (
                  <button className="jp-cast" onClick={() => g.castSelected()}>Lancer {g.selectedDef.name}</button>
                )}
                <button className="jp-cancel" onClick={g.cancel}>Annuler</button>
              </span>
            </>
          ) : peekDef ? (
            <span className="jp-text jp-peek">
              <b>{peekDef.name}</b> · {peekDef.description}{' '}
              <em>{g.playable[peek!] ? 'Touchez de nouveau la carte pour la lancer.' : 'Elle ne peut pas être lancée maintenant.'}</em>
            </span>
          ) : (
            <span className="jp-text jp-faint">
              {g.myTurn && !s.cardPlayed && g.playable.some(Boolean)
                ? 'Touchez une carte pour la lancer, ou jouez directement votre coup.'
                : g.myTurn
                  ? 'Jouez votre coup.'
                  : 'Patientez : l’Automate joue.'}
            </span>
          )}
        </div>
      </aside>
    </div>
  );
}
