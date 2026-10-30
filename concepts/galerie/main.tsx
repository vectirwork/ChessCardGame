// Spellmate · La Galerie : une maison de jeu de luxe, éditoriale et claire. Le défilement vertical devient
// une visite horizontale, de salle en salle ; « Jouer » fait coulisser la galerie comme une porte.
import './maison';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/space-grotesk';
import '@fontsource/cinzel/700.css';
import '../../src/client/styles/cards.css';
import '../../src/client/styles/board.css';
import './galerie.css';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as RMouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import type { CardId } from '../../src/shared/cards';
import { useLocalGame } from '../_shared/localGame';
import { ROOMS } from './data';
import { Jeu } from './jeu';
import type { HeroRects } from './jeu';
import { Loupe } from './loupe';
import { HOUSE_BOARD, HOUSE_SKIN } from './maison';
import { Atelier, FAN, Hall, Pouvoirs, Salon, Sortie } from './rooms';
import { Arrow, Star } from './ui';

gsap.registerPlugin(ScrollTrigger);

type Mode = 'page' | 'opening' | 'game';

/** Rapport entre le défilement vertical et le trajet horizontal (moins de 1 : la visite avance un peu plus vite). */
const K = 0.85;

/** Bord gauche de la salle noire, en pixels d'écran (le curseur et l'en-tête passent en négatif au-delà). */
const darkZone = { left: Infinity };

function setDark(l: boolean, m: boolean, r: boolean, edge = false) {
  const c = document.documentElement.classList;
  c.toggle('dk-l', l);
  c.toggle('dk-m', m);
  c.toggle('dk-r', r);
  c.toggle('dk-edge', edge);
}

// ---------------------------------------------------------------------------------------------
// Curseur : un point d'encre précis, un anneau qui le suit et s'ouvre en étiquette

function Cursor() {
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');
  const [link, setLink] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const html = document.documentElement;
    html.classList.add('has-cursor');
    const xd = gsap.quickTo(dot.current, 'x', { duration: 0.08, ease: 'power3' });
    const yd = gsap.quickTo(dot.current, 'y', { duration: 0.08, ease: 'power3' });
    const xr = gsap.quickTo(ring.current, 'x', { duration: 0.45, ease: 'power3' });
    const yr = gsap.quickTo(ring.current, 'y', { duration: 0.45, ease: 'power3' });
    const move = (e: PointerEvent) => {
      setOn(true);
      xd(e.clientX);
      yd(e.clientY);
      xr(e.clientX);
      yr(e.clientY);
      root.current?.classList.toggle('c-dark', e.clientX >= darkZone.left);
    };
    const over = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      setLabel(t.closest('[data-cursor]')?.getAttribute('data-cursor') ?? '');
      setLink(!!t.closest('a, button, [role="button"]'));
    };
    // Si le fil principal rame (images de plus de 50 ms), le curseur système revient : la page ne paraît jamais figée
    let raf = 0;
    let last = performance.now();
    let slow = 0;
    let fine = 0;
    const watch = (now: number) => {
      const dt = now - last;
      last = now;
      if (!document.hidden) {
        if (dt > 50) {
          slow++;
          fine = 0;
        } else {
          fine++;
          if (fine > 90) slow = 0;
        }
        if (slow >= 3 && html.classList.contains('has-cursor')) html.classList.remove('has-cursor');
        else if (slow === 0 && !html.classList.contains('has-cursor')) html.classList.add('has-cursor');
      }
      raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerover', over);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerover', over);
      html.classList.remove('has-cursor');
    };
  }, []);
  return (
    <div className={`cursor ${on ? 'on' : ''}`} aria-hidden="true" ref={root}>
      <div className={`c-ring ${label ? 'has-label' : link ? 'is-link' : ''}`} ref={ring}>
        <span className="c-circle" />
        <span className="c-label">{label}</span>
      </div>
      <div className="c-dot" ref={dot} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function App() {
  const g = useLocalGame({ skin: HOUSE_SKIN, botSkin: 'skin:void', theme: HOUSE_BOARD });
  const [mode, setMode] = useState<Mode>('page');
  const [active, setActive] = useState(0);
  const [loupe, setLoupe] = useState<CardId | null>(null);
  const activeRef = useRef(0);
  activeRef.current = active;
  const snapRef = useRef<HeroRects['snap']>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const [ticks, setTicks] = useState<number[]>(() => ROOMS.map((_, i) => i / (ROOMS.length - 1)));
  const pinRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const heroBoardRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const hTween = useRef<gsap.core.Tween | null>(null);

  const hand = g.hand.map(h => h.card).filter((c): c is NonNullable<typeof c> => !!c);
  const resume = g.state.ply > 0 && !g.result;
  const paused = resume ? { pos: g.state.pos, lastMove: g.boardProps.lastMove, effects: g.state.effects, ply: g.state.ply } : null;

  // Défilement doux, visite horizontale, apparitions et parallaxe
  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: !reduce });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const track = trackRef.current!;
    const rooms = () => Array.from(track.querySelectorAll<HTMLElement>('[data-room]'));

    const intro = gsap.context(() => {
      if (reduce) return;
      const tl = gsap.timeline({ delay: 0.1, defaults: { ease: 'expo.out' } });
      tl.from('.hd > *', { y: -24, opacity: 0, duration: 1, stagger: 0.07 }, 0.2);
      tl.from('.hall [data-intro="lines"] .ln-in', { yPercent: 115, duration: 1.4, stagger: 0.1 }, 0.1);
      tl.fromTo('.hall [data-intro="curtain"] .curtain', { scaleX: 1 }, { scaleX: 0, duration: 1.5, ease: 'expo.inOut' }, 0.15);
      tl.from('.hall [data-intro="deal"]', { y: 220, x: 60, opacity: 0, duration: 1.3, stagger: 0.09 }, 0.75);
      tl.from('.hall [data-intro="up"]', { y: 30, opacity: 0, duration: 1.1, stagger: 0.08 }, 0.55);
      tl.from('.plan > *', { y: 20, opacity: 0, duration: 1, stagger: 0.08 }, 0.9);
    });

    const reveals = (ca?: gsap.core.Tween) => {
      const scope = track;
      const start = ca ? 'left 94%' : 'top 92%';
      const on = (el: Element, anim: gsap.core.Animation) =>
        ScrollTrigger.create({ trigger: el, containerAnimation: ca, start, once: true, onEnter: () => void anim.play() });
      if (reduce) return;
      scope.querySelectorAll('.room:not(.hall) [data-rv="lines"]').forEach(el =>
        on(el, gsap.from(el.querySelectorAll('.ln-in'), { yPercent: 115, duration: 1.25, stagger: 0.09, ease: 'expo.out', paused: true })),
      );
      scope.querySelectorAll('.room:not(.hall) [data-rv="up"]').forEach(el =>
        on(el, gsap.from(el, { y: 34, opacity: 0, duration: 1.1, ease: 'expo.out', paused: true })),
      );
      scope.querySelectorAll('.room:not(.hall) [data-rv="curtain"]').forEach(el => {
        const c = el.querySelector('.curtain');
        if (c) on(el, gsap.fromTo(c, { scaleX: 1 }, { scaleX: 0, duration: 1.4, ease: 'expo.inOut', paused: true }));
      });
      scope.querySelectorAll('[data-rv="wipe"]').forEach(el => {
        const c = el.querySelector('.wipe');
        if (c) on(el, gsap.fromTo(c, { scaleX: 1 }, { scaleX: 0, duration: 1.8, ease: 'power2.inOut', paused: true }));
      });
      scope.querySelectorAll<HTMLElement>('[data-rv="bar"]').forEach(el => {
        const v = parseFloat(getComputedStyle(el).getPropertyValue('--v')) || 1;
        on(el, gsap.fromTo(el, { scaleX: 0 }, { scaleX: v, duration: 1.4, ease: 'expo.out', paused: true }));
      });
    };

    const mm = gsap.matchMedia();
    mm.add({ desk: '(min-width: 900px)', mob: '(max-width: 899.98px)' }, ctx => {
      const { desk } = ctx.conditions as { desk: boolean; mob: boolean };
      if (desk) {
        const dist = () => track.scrollWidth - window.innerWidth;
        let offsets: number[] = [];
        const measure = () => {
          offsets = rooms().map(r => r.offsetLeft);
          const d = Math.max(1, dist());
          setTicks(offsets.map(o => Math.min(1, o / d)));
        };
        measure();
        const tween = gsap.to(track, {
          x: () => -dist(),
          ease: 'none',
          scrollTrigger: {
            trigger: pinRef.current,
            start: 'top top',
            end: () => `+=${dist() * K}`,
            pin: true,
            scrub: true,
            invalidateOnRefresh: true,
            onRefresh: measure,
            onUpdate: self => {
              const x = self.progress * dist();
              const W = window.innerWidth;
              let a = 0;
              offsets.forEach((o, i) => {
                if (x + W * 0.5 >= o) a = i;
              });
              setActive(a);
              // La salle noire entre par la droite : chaque zone de l'en-tête et du plan bascule quand elle est dessous
              const left = (offsets[offsets.length - 1] ?? Infinity) - x;
              darkZone.left = left;
              setDark(left <= 110, left <= W * 0.5, left <= W - 140, left > 2 && left < W - 2);
              if (fillRef.current) fillRef.current.style.transform = `scaleX(${self.progress.toFixed(4)})`;
            },
          },
        });
        hTween.current = tween;
        reveals(tween);
        if (!reduce) {
          track.querySelectorAll<HTMLElement>('[data-par]').forEach(el => {
            const k = parseFloat(el.dataset.par ?? '0');
            gsap.fromTo(
              el,
              { x: () => window.innerWidth * k },
              {
                x: () => -window.innerWidth * k,
                ease: 'none',
                scrollTrigger: { trigger: el, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true, invalidateOnRefresh: true },
              },
            );
          });
        }
      } else {
        hTween.current = null;
        darkZone.left = Infinity;
        reveals();
        rooms().forEach((r, i) =>
          ScrollTrigger.create({ trigger: r, start: 'top 55%', end: 'bottom 55%', onToggle: self => self.isActive && setActive(i) }),
        );
        const last = rooms()[rooms().length - 1];
        // En-tête : fond plein dès qu'on quitte le haut de page, en négatif sur la salle noire
        ScrollTrigger.create({
          start: 0,
          end: 'max',
          onUpdate: self => {
            if (fillRef.current) fillRef.current.style.transform = `scaleX(${self.progress.toFixed(4)})`;
            document.documentElement.classList.toggle('hd-solid', self.scroll() > 8);
            const dark = !!last && last.getBoundingClientRect().top <= 64;
            setDark(dark, dark, dark);
          },
        });
      }
      return () => setDark(false, false, false);
    });

    // Pour les captures : position de défilement de chaque salle
    (window as unknown as Record<string, unknown>).__galerie = {
      /** Position de défilement qui amène le bord gauche d'un élément à `frac` de la largeur d'écran. */
      at: (sel: string, frac = 0.06) => {
        const st = hTween.current?.scrollTrigger;
        const el = track.querySelector<HTMLElement>(sel);
        if (!el) return -1;
        if (!st) return Math.round(el.getBoundingClientRect().top + window.scrollY - 70);
        const x = el.getBoundingClientRect().left - track.getBoundingClientRect().left - frac * window.innerWidth;
        return Math.round(Math.min(st.end, Math.max(st.start, st.start + x * K)));
      },
      rooms: () => {
        const st = hTween.current?.scrollTrigger;
        return rooms().map(r => (st ? Math.round(st.start + r.offsetLeft * K) : Math.round(r.getBoundingClientRect().top + window.scrollY)));
      },
    };

    return () => {
      mm.revert();
      intro.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Hall : légère parallaxe à la souris (l'œuvre et le texte ne sont pas sur le même plan)
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const piece = document.querySelector<HTMLElement>('.hall-piece');
    const title = document.querySelector<HTMLElement>('.hall-title');
    if (!piece || !title) return;
    const px = gsap.quickTo(piece, 'x', { duration: 1.2, ease: 'power3' });
    const py = gsap.quickTo(piece, 'y', { duration: 1.2, ease: 'power3' });
    const tx = gsap.quickTo(title, 'x', { duration: 1.4, ease: 'power3' });
    const mv = (e: PointerEvent) => {
      if (document.documentElement.classList.contains('lenis-stopped')) return;
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      px(nx * -14);
      py(ny * -10);
      tx(nx * 8);
    };
    window.addEventListener('pointermove', mv);
    return () => window.removeEventListener('pointermove', mv);
  }, []);

  // Boutons magnétiques
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>('.btn-play, .hd-play'));
    const offs = els.map(el => {
      const xs = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      const ys = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      const mv = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        xs((e.clientX - (r.left + r.width / 2)) * 0.18);
        ys((e.clientY - (r.top + r.height / 2)) * 0.28);
      };
      const lv = () => {
        xs(0);
        ys(0);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerleave', lv);
      return () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerleave', lv);
      };
    });
    return () => offs.forEach(f => f());
  }, []);

  const goto = useCallback((i: number) => {
    const lenis = lenisRef.current;
    const room = trackRef.current?.querySelectorAll<HTMLElement>('[data-room]')[i];
    if (!lenis || !room) return;
    const st = hTween.current?.scrollTrigger;
    const y = st ? Math.min(st.start + room.offsetLeft * K, st.end) : room.getBoundingClientRect().top + window.scrollY - 60;
    lenis.scrollTo(y, { duration: 1.8, easing: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2) });
  }, []);

  // Clavier (bureau) : flèches = un pas de visite, Page suivante / précédente = salle suivante / précédente
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const st = hTween.current?.scrollTrigger;
      if (!st || mode !== 'page' || loupe || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      const n = ROOMS.length;
      const lenis = lenisRef.current;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const d = (e.key === 'ArrowRight' ? 1 : -1) * window.innerWidth * 0.7 * K;
        lenis?.scrollTo(Math.max(0, Math.min(st.end, window.scrollY + d)), { duration: 1 });
        return;
      }
      let i = -1;
      if (e.key === 'PageDown') i = Math.min(n - 1, activeRef.current + 1);
      else if (e.key === 'PageUp') i = Math.max(0, activeRef.current - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = n - 1;
      if (i < 0) return;
      e.preventDefault();
      goto(i);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mode, loupe, goto]);

  const openGame = useCallback(() => {
    if (mode !== 'page') return;
    originRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Instantané de l'échiquier exposé : c'est lui qui s'envole, à la position où on l'a laissé
    const wrap = heroBoardRef.current?.querySelector<HTMLElement>('.board-wrap');
    if (wrap) {
      const node = wrap.cloneNode(true) as HTMLElement;
      node.querySelectorAll('canvas, .vfx-flash').forEach(n => n.remove());
      node.classList.add('is-snap');
      snapRef.current = {
        node,
        tilt: parseFloat(wrap.style.getPropertyValue('--tilt')) || 0,
        zoom: parseFloat(wrap.style.getPropertyValue('--zoom')) || 1,
      };
    } else snapRef.current = null;
    lenisRef.current?.stop();
    setMode('opening');
  }, [mode]);

  const hero = useCallback((): HeroRects => {
    const vx = viewRef.current ? (gsap.getProperty(viewRef.current, 'x') as number) || 0 : 0;
    const b = heroBoardRef.current?.getBoundingClientRect() ?? null;
    return {
      snap: snapRef.current,
      board: b ? new DOMRect(b.left - vx, b.top, b.width, b.height) : null,
      // Lu dans le DOM : la Salle de jeu mesure l'éventail avant que React ne rattache ses refs
      cards: Array.from(trackRef.current?.querySelectorAll<HTMLElement>('.hall .hh-slot') ?? []).map((el, i) => {
        const r = el.getBoundingClientRect();
        return { cx: r.left + r.width / 2 - vx, cy: r.top + r.height / 2, w: el.offsetWidth, r: FAN[i] ?? 0 };
      }),
    };
  }, []);

  // Liens internes (#salle) : la visite se déplace au lieu de sauter
  const onClick = (e: RMouseEvent) => {
    const a = (e.target as Element).closest?.('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    const i = ROOMS.findIndex(r => r.id === id);
    if (i >= 0) {
      e.preventDefault();
      goto(i);
    }
  };

  const playing = mode !== 'page';
  return (
    <div className={`gal ${playing ? 'is-game' : ''} ${loupe ? 'is-loupe' : ''}`} onClick={onClick}>
      {playing && (
        <Jeu
          g={g}
          hero={hero}
          viewEl={viewRef.current}
          onOpened={() => setMode('game')}
          onClosed={() => {
            setMode('page');
            lenisRef.current?.start();
            originRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
      {loupe && (
        <Loupe
          id={loupe}
          onClose={() => {
            setLoupe(null);
            lenisRef.current?.start();
            originRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
      <Cursor />
      <header className="hd">
        <a className="hd-logo" href="#hall" data-cursor="Hall">
          <Star size={15} className="verm" />
          <span>Spellmate</span>
        </a>
        <nav className="hd-nav" aria-label="Salles">
          {ROOMS.map((r, i) => (
            <button key={r.id} className={active === i ? 'on' : ''} onClick={() => goto(i)}>
              <span className="hn-num">{r.num}</span>
              <span className="hn-name">{r.short}</span>
            </button>
          ))}
        </nav>
        <button className="hd-play" onClick={openGame}>
          <i className="hp-dot" />
          <span>{resume ? 'Reprendre' : 'Jouer'}</span>
          <span className="hp-sub">en anonyme</span>
        </button>
      </header>

      <div className="pin" ref={pinRef}>
        <div className="view" ref={viewRef}>
          <main className="track" ref={trackRef}>
            <Hall
              hand={hand}
              boardRef={heroBoardRef}
              live={!playing && !loupe}
              paused={paused}
              onPlay={openGame}
              onVisit={() => goto(1)}
            />
            <Pouvoirs
              onExamine={id => {
                originRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                lenisRef.current?.stop();
                setLoupe(id);
              }}
            />
            <Atelier />
            <Salon onPlay={openGame} />
            <Sortie onPlay={openGame} resume={resume} />
          </main>
        </div>
      </div>

      <nav className="plan" aria-label="Plan de la visite">
        <div className="plan-room">
          <span className="plan-n">Salle {ROOMS[active].num}</span>
          <span className="plan-of">/ 05</span>
          <span className="plan-name">{ROOMS[active].name}</span>
        </div>
        <div className="plan-line">
          <span className="plan-fill" ref={fillRef} />
          {ROOMS.map((r, i) => (
            <button
              key={r.id}
              className={`plan-tick ${i <= active ? 'on' : ''}`}
              style={{ left: `${(ticks[i] ?? 0) * 100}%` }}
              onClick={() => goto(i)}
              aria-label={`Salle ${r.num} : ${r.name}`}
            >
              <span className="pt-tip">{r.num} · {r.short}</span>
            </button>
          ))}
        </div>
        <div className="plan-hint">
          {active < 4 ? 'Défilez pour visiter' : 'Fin de la visite'} <Arrow size={14} />
        </div>
      </nav>

    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
