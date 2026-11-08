// Spellmate · L'Odyssée : une descente verticale à travers six lieux, avec un échiquier-astre qui l'accompagne.
// Zéro clic : l'échiquier du premier écran est une vraie partie. Le visiteur joue les Blancs dès qu'il touche
// une pièce ; au premier coup, la page s'efface vers la gauche et la partie passe en plein écran.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { CARDS, CATALOGS, offeredCatalog } from '../../shared/cards';
import type { Catalog, CardId } from '../../shared/cards';
import { DEFAULT_BOARD, DEFAULT_SKIN, FREE_ITEMS, itemById } from '../../shared/catalog';
import { RESULT_TEXT } from '../../shared/game';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { Board } from '../components/Board';
import { SpellCard } from '../components/SpellCard';
import { getGuestName, setGuestName, useApp } from '../store';
import { BOT_PROFILES } from '../ai';
import type { BotLevel } from '../ai';
import {
  BOARDS, INTERLUDE, LEVELS, MODES, PACKS, PLACES, PLACE_COPY, SKINS, idleCasts, liveCatalog, placeCards, priceOf, principle,
} from './data';
import { Engine, isMobile } from './engine';
import { Chapter, EQ, EqRing, Kicker, Lines, Mark, OrbitRings, Sheet, Slot } from './parts';
import { SceneStack } from './scenery';
import { GameShell, PowersPanel, PremoveNote, cardName, castMessage, castThisTurn, handNotes } from './shell';
import type { ShellAction } from './shell';
import type { Act } from './StageBoard';
import { useHomeLobby } from './useHomeLobby';
import type { HomeLobby } from './useHomeLobby';
import { countryName, fromCountry } from './country';
import { useLiveGame } from './useLiveGame';
import type { LiveGame } from './useLiveGame';
import './odyssee.css';

// Démonstrations des lieux II à V : hors du premier écran, chargées à part (préchargées au repos, voir plus bas)
/** Courbe expo.inOut de gsap, échantillonnée pour une animation du compositeur (linear() : Chrome 113+, Safari 17.2+). */
const EXPO_IN_OUT = (() => {
  const f = (t: number) => (t === 0 || t === 1 ? t : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2);
  const pts = Array.from({ length: 33 }, (_, i) => `${f(i / 32).toFixed(4)} ${((i / 32) * 100).toFixed(2)}%`);
  return typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)') ? `linear(${pts.join(', ')})` : 'cubic-bezier(0.87, 0, 0.13, 1)';
})();
/** Rideau hors de l'écran : sa lisière dorée (150 px à sa gauche) comprise, sinon elle reste en bordure d'écran. */
const CURTAIN_OUT = 'translateX(calc(101% + 160px))';
/** Glissement : sélecteur, deux états (transform seule ou images clés), durée et délai en secondes. */
type Slide = [string, [string, string] | [Keyframe, Keyframe], number, number];
const SLIDE_ANIMS = new WeakMap<Element, Animation>();
/** Joue les glissements du passage en partie (ou du retour) ; chacun remplace le précédent sur le même élément. */
function slides(root: HTMLElement, list: Slide[]) {
  for (const [sel, [a, b], dur, delay] of list) {
    const frames: Keyframe[] = typeof a === 'string' ? [{ transform: a }, { transform: b as string }] : [a, b as Keyframe];
    root.querySelectorAll(sel).forEach(el => {
      SLIDE_ANIMS.get(el)?.cancel();
      SLIDE_ANIMS.set(el, el.animate(frames, { duration: dur * 1000, delay: delay * 1000, easing: EXPO_IN_OUT, fill: 'both' }));
    });
  }
}
function clearSlides(root: HTMLElement, sel: string) {
  root.querySelectorAll(sel).forEach(el => {
    SLIDE_ANIMS.get(el)?.cancel();
    SLIDE_ANIMS.delete(el);
  });
}

const loadStageBoard = () => import('./StageBoard');
const StageBoard = lazy(() => loadStageBoard().then(m => ({ default: m.StageBoard })));

type Mode = 'page' | 'entering' | 'game' | 'leaving';
type SheetKind = 'friend' | 'ai' | null;

const IDS = ['observatoire', 'foret', 'pics', 'sablier', 'bazar', 'seuil'];
const INTRO_KEY = 'sm:intro';

const levelName = (l: BotLevel) => BOT_PROFILES[l].name;

function fmtWait(since: number | null) {
  const s = Math.max(0, Math.floor((Date.now() - (since ?? Date.now())) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Ligne discrète « Affronter un humain » : rejoindre la file amicale, voir l'attente, annuler. */
/** « Chercher un vrai joueur » : la salle d'attente de l'accueil ; l'IA reste l'adversaire en attendant. */
function SearchOption({ lobby, compact }: { lobby: HomeLobby; compact?: boolean }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!lobby.searching) return;
    const i = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(i);
  }, [lobby.searching]);
  if (lobby.searching) {
    return (
      <p className="o-human is-waiting" role="status">
        <span className="o-live-dot" style={{ '--h': 190 } as CSSProperties} />
        <span>
          Recherche d'un vrai joueur <b>{fmtWait(lobby.since)}</b>
          {!compact && <small>L'IA reste votre adversaire en attendant.</small>}
        </span>
        <button type="button" className="o-link" onClick={() => lobby.setSearching(false)}>
          Annuler
        </button>
      </p>
    );
  }
  return (
    <p className="o-human">
      <button type="button" className="btn-gold sm o-search-btn" onClick={() => lobby.setSearching(true)}>
        Chercher un vrai joueur
      </button>
      {!compact && <span className="o-human-sub">sans compte ; l'IA continue de jouer en attendant</span>}
    </p>
  );
}

/** Niveau de l'Oracle, en ligne : discret, toujours modifiable. */
function LevelPick({ level, onChange }: { level: BotLevel; onChange: (l: BotLevel) => void }) {
  return (
    <div className="o-levels-inline" role="radiogroup" aria-label="Niveau de l'IA">
      <span className="o-levels-k">Niveau</span>
      {LEVELS.map(l => (
        <button key={l.level} type="button" role="radio" aria-checked={level === l.level} className={level === l.level ? 'on' : ''} onClick={() => onChange(l.level)} title={l.text}>
          {l.name}
        </button>
      ))}
    </div>
  );
}

function statusOf(g: LiveGame) {
  if (g.result) {
    if (g.result.reason === 'aborted') return 'Partie annulée.';
    return g.result.winner === g.me ? 'Victoire.' : g.result.winner === g.them ? 'Défaite.' : 'Partie nulle.';
  }
  if (g.casting) return 'Le sort se déploie…';
  if (g.state.pos.turn === g.them) return g.duel ? 'Au tour de votre adversaire.' : "L'Oracle réfléchit…";
  if (g.boardProps.check !== null) return 'Échec au roi.';
  return 'À vous de jouer.';
}

export default function OdysseeHome() {
  const { me, setMe, toast: notify } = useApp();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const astreRef = useRef<HTMLDivElement>(null);
  const orbitsRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const altRootRef = useRef<HTMLElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [place, setPlace] = useState(0);
  const placeRef = useRef(0);
  const [chapter, setChapter] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>('page');
  const modeRef = useRef<Mode>('page');
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const [transit, setTransit] = useState(false);
  const [docked, setDocked] = useState(false);
  const [hover, setHover] = useState(false);
  const [hoverSq, setHoverSq] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [cast, setCast] = useState<{ card: CardId; skin: string } | null>(null);
  const [playSignal, setPlaySignal] = useState(0);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [mobile, setMobile] = useState(() => isMobile(window.innerWidth));
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setHeaderSlot(document.getElementById('header-slot')), []);

  const catalog = useMemo(() => liveCatalog(), []);
  const storyCards = useMemo(() => placeCards(catalog), [catalog]);

  // Bazar : aperçu d'un skin ou d'un plateau sur l'échiquier de démonstration
  const [skinPick, setSkinPick] = useState('skin:inferno');
  const [boardPick, setBoardPick] = useState('board:obsidian');
  const [pick, setPick] = useState<string>('skin:inferno');
  const [pulse, setPulse] = useState(0);

  const mySkin = me?.equippedSkin ?? DEFAULT_SKIN;
  const myBoard = me?.equippedBoard ?? DEFAULT_BOARD;
  // Scène 3D de la partie (three.js et un contexte WebGL) : préparée seulement à la première intention de jouer
  // (survol d'une pièce jouable, toucher de l'échiquier, survol ou focus des cartes, bouton Jouer). Jamais à la simple
  // ouverture de la page (D6) : un visiteur qui ne fait que lire ne la télécharge pas.
  const [intent, setIntent] = useState(false);
  const wantPlay = useCallback(() => setIntent(true), []);
  const g = useLiveGame({ skin: mySkin, theme: myBoard, active: mode === 'game', warm: intent });
  const gRef = useRef(g);
  gRef.current = g;

  // ------------------------------------------------------------------------------------------
  // Moteur, apparitions, ouverture

  useEffect(() => {
    const root = rootRef.current!;
    const html = document.documentElement;
    html.classList.add('ody-home');
    const header = document.querySelector<HTMLElement>('.site-header');
    const engine = new Engine(
      root,
      astreRef.current!,
      { alt: altRef.current, altRoot: altRootRef.current, orbits: orbitsRef.current, front: frontRef.current, caption: captionRef.current, header },
      {
        onPlace: p => {
          placeRef.current = p;
          setPlace(p);
          setCast(null);
          setPlaySignal(0);
          if (p !== 0) engine.setAwake(false);
        },
        onChapter: setChapter,
        onTransit: setTransit,
        onDock: setDocked,
      },
    );
    engineRef.current = engine;
    const onResize = () => setMobile(isMobile(window.innerWidth));
    window.addEventListener('resize', onResize);

    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    root.querySelectorAll('.o-rv, .o-rv-lines').forEach(el => {
      if (!el.closest('.o-hero') && !el.closest('.o-place-head')) io.observe(el);
    });

    // Lieux et chapitres hors de l'écran : leurs animations (halos des cartes, sceau du Bazar, flèche de défilement…)
    // sont en pause ; elles reprennent un peu avant d'entrer à l'écran
    const offscreen = new IntersectionObserver(
      entries => {
        // Un attribut plutôt qu'une classe : React réécrit className quand un chapitre devient actif
        for (const e of entries) e.target.toggleAttribute('data-offscreen', !e.isIntersecting);
      },
      { rootMargin: '25% 0px 25% 0px' },
    );
    root.querySelectorAll('.o-place, .o-chapter').forEach(el => offscreen.observe(el));

    // Ouverture : une étoile tombe dans l'astrolabe, éclair doré, l'échiquier s'éveille (une fois par visite)
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === '1';
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      // stockage indisponible
    }
    const ctx = gsap.context(() => {
      const revealHero = () => root.querySelectorAll('.o-hero .o-rv, .o-hero .o-rv-lines').forEach(el => el.classList.add('in'));
      if (engine.reduced || seen) {
        gsap.set('.o-falling-star, .o-impact', { display: 'none' });
        revealHero();
        return;
      }
      const p = engine.pose('hero');
      const sx = p.x - Math.min(980, window.innerWidth * 0.75);
      const sy = p.y - Math.min(760, window.innerHeight * 0.95);
      const angle = (Math.atan2(p.y - sy, p.x - sx) * 180) / Math.PI;
      gsap.set('.o-falling-star', { x: sx, y: sy, rotation: angle });
      gsap.set('.o-impact', { x: p.x, y: p.y });
      gsap
        .timeline()
        .call(revealHero, [], 0.15)
        .to('.o-falling-star', { x: p.x, y: p.y, duration: 0.7, ease: 'power3.in' }, 0.15)
        .set('.o-falling-star', { display: 'none' }, 0.85)
        .fromTo('.o-impact', { scale: 0.08, opacity: 1 }, { scale: 2.6, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0.84)
        // Éclair fini : retiré (transparent, il restait un calque plein écran pour toute la visite)
        .set('.o-impact', { display: 'none' }, 2.04)
        .from('.o-orbits', { scale: 0.55, rotation: -50, opacity: 0, duration: 2, ease: 'expo.out' }, 0.8)
        .from('.o-astro-front-in', { scale: 0.55, opacity: 0, duration: 1.8, ease: 'expo.out' }, 0.88)
        .from('.o-astre-wake', { y: -60, scale: 0.7, opacity: 0, duration: 1.5, ease: 'expo.out' }, 0.84)
        .from('.o-altimeter', { opacity: 0, x: 20, duration: 1, ease: 'expo.out' }, 1.0);
    }, root);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(() => engine.measure());
    return () => {
      ctx.revert();
      io.disconnect();
      offscreen.disconnect();
      window.removeEventListener('resize', onResize);
      engine.destroy();
      engineRef.current = null;
      html.classList.remove('ody-home', 'is-immersive');
      html.style.removeProperty('--tint');
    };
  }, []);

  // Code des démonstrations des lieux II à V : préchargé au repos après le chargement, ou au premier défilement.
  // Au premier défilement, aussi la scène 3D des sorts (three.js) : elle est analysée pendant la lecture du premier
  // écran, pas à l'entrée de la Forêt, quand le lieu doit apparaître (un lecteur qui ne défile pas ne la charge pas)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    let done = false;
    let vfx = false;
    const go = () => {
      if (done) return;
      done = true;
      void loadStageBoard().catch(() => undefined);
    };
    const onScroll = () => {
      go();
      if (!vfx) {
        vfx = true;
        void import('../vfx/index').catch(() => undefined);
      }
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('wheel', onScroll, true);
    };
    const t = window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 3000 }) : go()), 2500);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('wheel', onScroll, { passive: true, capture: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('wheel', onScroll, true);
    };
  }, []);

  // Repos (D6) : 30 s sans aucun geste, les décors animés en boucle (anneaux, étoiles, lanternes, flottement…) se
  // figent là où ils en sont (attribut data-still, odyssee.css) ; le premier geste les relance. Une seule minuterie,
  // réarmée au plus tard à l'échéance : rien ne tourne pendant le repos.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const STILL_MS = 30000;
    let last = performance.now();
    let timer = 0;
    const check = () => {
      timer = 0;
      const idle = performance.now() - last;
      // Seulement en lecture de la page : pendant la partie, l'échiquier et la coque ne se figent jamais (le geste
      // suivant réarme la minuterie)
      if (modeRef.current !== 'page') return;
      if (idle >= STILL_MS) root.setAttribute('data-still', '');
      else timer = window.setTimeout(check, STILL_MS - idle + 50);
    };
    const onGesture = () => {
      last = performance.now();
      if (root.hasAttribute('data-still')) root.removeAttribute('data-still');
      if (!timer) timer = window.setTimeout(check, STILL_MS + 50);
    };
    const events = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'scroll'] as const;
    for (const ev of events) window.addEventListener(ev, onGesture, { passive: true, capture: true });
    timer = window.setTimeout(check, STILL_MS + 50);
    return () => {
      window.clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, onGesture, { capture: true });
      root.removeAttribute('data-still');
    };
  }, []);

  const scrollTo = useCallback((sel: string) => {
    engineRef.current?.scrollTo(sel, () => {
      // Saut direct : ce qui est déjà à l'écran apparaît sans attendre
      rootRef.current?.querySelectorAll<HTMLElement>('.o-rv:not(.in), .o-rv-lines:not(.in)').forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add('in', 'instant');
      });
    });
  }, []);

  // Feuilles, partie : le défilement se fige
  useEffect(() => {
    engineRef.current?.lock(!!sheet || mode !== 'page');
  }, [sheet, mode]);

  const placeDef = PLACES[place];
  // Teinte du lieu (rideau, arène, feuilles, menus) : une propriété héritée posée sur <html>, donc un recalcul de style
  // de tout le document. Pendant le défilement rien ne l'affiche : elle est écrite au repos (0,4 s sans défilement),
  // et tout de suite à l'ouverture de la partie (play) ou d'une feuille.
  const tintRef = useRef(placeDef.tint);
  tintRef.current = placeDef.tint;
  const applyTint = useCallback(() => {
    const html = document.documentElement;
    if (html.style.getPropertyValue('--tint') !== tintRef.current) html.style.setProperty('--tint', tintRef.current);
  }, []);
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(applyTint, 400);
    };
    arm();
    window.addEventListener('scroll', arm, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', arm);
    };
  }, [placeDef, applyTint]);
  useEffect(() => {
    if (sheet) applyTint();
  }, [sheet, applyTint]);

  // ------------------------------------------------------------------------------------------
  // Passage en plein écran et retour

  const play = useCallback(
    (after?: () => void) => {
      const e = engineRef.current;
      const root = rootRef.current;
      if (!e || !root || modeRef.current !== 'page') return;
      setIntent(true);
      setSheet(null);
      setHover(false);
      setHoverSq(null);
      e.captureGameFrom();
      e.setAwake(false);
      e.lock(true);
      setMode('entering');
      applyTint();
      document.documentElement.classList.add('is-immersive');
      const k = reduced ? 0.25 : 1;
      const live = liveRef.current;
      const fromDemo = placeRef.current !== 0;
      const tl = gsap.timeline({
        onComplete: () => {
          if (live) gsap.set(live, { opacity: 1 });
          setMode('game');
          after?.();
        },
      });
      tl.to(e, { gameMix: 1, duration: 1.45 * k, ease: 'expo.inOut', onUpdate: () => e.markDirty() }, 0);
      // Rideau, voile, page et décor : animations du compositeur (fluides même pendant le montage de la partie).
      // Téléphone : la page glisse sans fondu et le décor ne bouge pas (le rideau les couvre ; un fondu ou un zoom de
      // ces grands groupes de calques coûtait plusieurs passages plein écran à chaque image)
      const phone = isMobile(window.innerWidth);
      slides(root, [
        ['.o-curtain-veil', [CURTAIN_OUT, 'translateX(0)'], 1.25 * k, 0],
        ['.o-curtain', [CURTAIN_OUT, 'translateX(0)'], 1.3 * k, 0.1 * k],
        ['.o-content', phone ? ['none', 'translateX(-18%)'] : [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-18%)', opacity: 0 }], 1.2 * k, 0],
        ...(phone ? [] : ([['.o-world-shift', [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-10%) scale(1.2)', opacity: 0.85 }], 1.45 * k, 0]] as Slide[])),
      ]);
      if (fromDemo && live) tl.fromTo(live, { opacity: 0 }, { opacity: 1, duration: 0.7 * k, ease: 'power2.out' }, 0.15 * k);
    },
    [reduced, applyTint],
  );

  const leave = useCallback(() => {
    const e = engineRef.current;
    const root = rootRef.current;
    if (!e || !root || modeRef.current !== 'game') return;
    const k = reduced ? 0.25 : 1;
    gsap.to(root.querySelectorAll('.gs-fan-slot'), { y: 360, opacity: 0, duration: 0.5 * k, ease: 'expo.in', stagger: 0.04 * k });
    gsap.to(root.querySelectorAll('.gs-in, .gs-toast, .gs-opponent'), { opacity: 0, y: 14, duration: 0.35 * k, ease: 'power2.in' });
    gsap.delayedCall(0.42 * k, () => {
      setMode('leaving');
      e.captureGameFrom();
      const live = liveRef.current;
      const toDemo = placeRef.current !== 0;
      const tl = gsap.timeline({
        onComplete: () => {
          setMode('page');
          document.documentElement.classList.remove('is-immersive');
          // Page et décor reviennent à leur style propre (le rideau, caché, garde sa position hors de l'écran)
          clearSlides(root, '.o-content, .o-world-shift');
          if (live) gsap.set(live, { clearProps: 'opacity' });
          // Partie terminée : l'échiquier de l'accueil se réinitialise, prêt pour le prochain premier coup
          if (gRef.current.result) gRef.current.newGame();
        },
      });
      tl.to(e, { gameMix: 0, duration: 1.3 * k, ease: 'expo.inOut', onUpdate: () => e.markDirty() }, 0);
      if (toDemo && live) tl.to(live, { opacity: 0, duration: 0.6 * k, ease: 'power2.inOut' }, 0.1 * k);
      const phone = isMobile(window.innerWidth);
      slides(root, [
        ['.o-curtain', ['translateX(0)', CURTAIN_OUT], 1.2 * k, 0],
        ['.o-curtain-veil', ['translateX(0)', CURTAIN_OUT], 1.25 * k, 0.08 * k],
        ['.o-content', phone ? ['translateX(-18%)', 'none'] : [{ transform: 'translateX(-18%)', opacity: 0 }, { transform: 'none', opacity: 1 }], 1.3 * k, 0.05 * k],
        ...(phone ? [] : ([['.o-world-shift', [{ transform: 'translateX(-10%) scale(1.2)', opacity: 0.85 }, { transform: 'none', opacity: 1 }], 1.3 * k, 0]] as Slide[])),
      ]);
    });
  }, [reduced]);

  // Annonces des sorts dans le HUD
  useEffect(() => {
    if (!g.lastCast) return;
    const name = cardName(g.lastCast.card);
    const them = g.duel ? (g.duelInfo?.standIn[g.them] ? 'L’IA, pour votre adversaire,' : 'Votre adversaire') : "L'Oracle";
    const text = g.lastCast.by === 'relay' ? `L’IA lance ${name} pour vous` : g.lastCast.by === 'bot' ? `${them} lance ${name}` : `Vous lancez ${name}`;
    setToast({ text, key: g.lastCast.key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.lastCast]);

  // ------------------------------------------------------------------------------------------
  // Partie en direct : deux visiteurs arrivés en même temps jouent l'un contre l'autre sur cet échiquier

  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  // Prêt : échiquier du haut sous les yeux (ou partie en plein écran), partie contre l'Oracle à peine commencée
  const lobbyReady = tabVisible && !g.duel && !g.result && g.state.ply <= 4 && (mode === 'game' || (mode === 'page' && place === 0));
  const startDuel = g.startDuel;
  const searchedRef = useRef(false);
  const lobby = useHomeLobby(lobbyReady, d => {
    startDuel(d);
    const where = fromCountry(d.country);
    notify(
      searchedRef.current
        ? `Joueur trouvé${where ? `, ${where}` : ''} : vous jouez contre une vraie personne.`
        : `Une personne vient d’arriver sur cette page${where ? `, ${where}` : ''} : vous jouez l’un contre l’autre.`,
    );
  });
  searchedRef.current = lobby.searching;

  // Partie en direct : l'IA joue pour un joueur qui ne joue pas (relais), jusqu'à ce qu'il reprenne la main
  const meRelayed = !!g.duel && !g.result && !!g.duelInfo?.standIn[g.me];
  const themRelayed = !!g.duel && !g.result && !!g.duelInfo?.standIn[g.them];
  useEffect(() => {
    if (meRelayed) notify('Vous ne jouiez pas : l’IA joue pour vous en attendant. « Prendre la main » quand vous voulez, ou jouez un coup.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meRelayed]);
  // Signes de présence : la souris ou le doigt sur l'échiquier (sur la page) ou n'importe où en plein écran
  const activity = g.activity;
  useEffect(() => {
    if (!g.duel || g.result) return;
    const on = (e: Event) => {
      if (mode === 'game') return activity();
      const t = e.target as Node | null;
      if (t && (astreRef.current?.contains(t) || rootRef.current?.querySelector('.o-hand-row')?.contains(t))) activity();
    };
    const opts = { passive: true } as AddEventListenerOptions;
    document.addEventListener('pointermove', on, opts);
    document.addEventListener('pointerdown', on, opts);
    document.addEventListener('keydown', on);
    return () => {
      document.removeEventListener('pointermove', on);
      document.removeEventListener('pointerdown', on);
      document.removeEventListener('keydown', on);
    };
  }, [g.duel, g.result, mode, activity]);
  const oppLabel = g.duel ? 'Votre adversaire' : "L'Oracle";
  const oppFrom = g.duel ? fromCountry(g.duel.country) : null;
  const oppCountry = g.duel?.country ? countryName(g.duel.country) : null;
  // L'adversaire a quitté la page : réclamer la victoire (passé le délai), ou revenir à l'Oracle
  const [, tick] = useState(0);
  const away = g.duel && !g.result ? g.duelInfo?.away ?? null : null;
  useEffect(() => {
    if (away === null) return;
    const i = window.setInterval(() => tick(x => x + 1), 1000);
    return () => window.clearInterval(i);
  }, [away]);
  const claimIn = away !== null && g.duelInfo ? Math.max(0, Math.ceil((away + g.duelInfo.claimAfterMs - Date.now()) / 1000)) : 0;
  // Partie en direct annulée avant le moindre coup (personne n'a joué en 45 s) : retour à l'Oracle, sans rien demander
  const abortedEmpty = !!g.duel && g.result?.reason === 'aborted' && g.state.ply === 0;
  const newGameNow = g.newGame;
  useEffect(() => {
    if (!abortedEmpty) return;
    const t = window.setTimeout(() => {
      newGameNow();
      notify('Personne n’a joué : la partie en direct est annulée, l’Oracle reprend.');
    }, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abortedEmpty]);
  const duelBanner = meRelayed ? (
    <div className="gp-offer is-away" role="status">
      <p>Vous ne jouiez pas : l’IA joue pour vous en attendant.</p>
      <div className="gp-offer-actions">
        <button type="button" className="btn-gold sm" onClick={g.takeOver}>
          Prendre la main
        </button>
        <small>ou jouez simplement un coup</small>
      </div>
    </div>
  ) :
    away !== null ? (
      <div className="gp-offer is-away" role="status">
        <p>Votre adversaire a quitté la page{themRelayed ? ' : l’IA joue à sa place' : ''}.</p>
        <div className="gp-offer-actions">
          {claimIn > 0 ? (
            <small>Victoire réclamable dans {claimIn} s, s'il ne revient pas.</small>
          ) : (
            <button type="button" className="btn-gold sm" onClick={g.claim}>
              Réclamer la victoire
            </button>
          )}
          <button type="button" className="btn-line" onClick={g.newGame}>
            Revenir à l’Oracle
          </button>
        </div>
      </div>
    ) : null;

  // ------------------------------------------------------------------------------------------
  // Échiquier jouable : zéro clic depuis l'accueil

  const heroLive = mode === 'page' && place === 0 && !transit;
  const liveInteractive = mode === 'game' || heroLive;
  const movers = useMemo(() => new Set(g.boardProps.legal.map(m => m.from)), [g.boardProps.legal]);
  const inProgress = g.state.ply > 0 && !g.result;

  const onMove = g.move;
  /** Pré-coups en attente sur l'échiquier de la partie (pendant que l'Oracle réfléchit). */
  const [premoves, setPremoves] = useState(0);
  const liveBoardProps = useMemo(
    () => ({
      ...g.boardProps,
      locked: g.boardProps.locked || !liveInteractive,
      premove: liveInteractive && !g.result ? g.me : null,
      onPremoves: setPremoves,
      onMove: (from: number, to: number, promo?: Parameters<typeof onMove>[2]) => {
        const ok = onMove(from, to, promo);
        // Premier geste sur l'échiquier de l'accueil : la partie passe en plein écran
        if (ok && modeRef.current === 'page') play();
      },
    }),
    [g.boardProps, liveInteractive, onMove, play, g.result, g.me],
  );

  const wake = (on: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    e.setAwake(on && modeRef.current === 'page' && placeRef.current === 0);
  };

  const onAstreEnter = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setHover(true);
    if (heroLive) wake(true);
  };
  const onAstreLeave = () => {
    setHover(false);
    setHoverSq(null);
    if (modeRef.current === 'page') wake(false);
  };
  const onAstreDownCapture = (e: RPointerEvent) => {
    setIntent(true);
    const en = engineRef.current;
    if (!en || modeRef.current !== 'page' || placeRef.current !== 0) return;
    // Souris : un clic sur un plateau encore incliné tomberait à côté ; on redresse d'abord
    if (e.pointerType === 'mouse' && !en.isAwake) {
      e.stopPropagation();
      wake(true);
      return;
    }
    wake(true);
  };
  const onAstreMove = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse' || !liveInteractive || g.boardProps.locked) return;
    if (mode === 'page' && !engineRef.current?.isAwake) return;
    const board = liveRef.current?.querySelector<HTMLElement>('.board');
    if (!board) return;
    const r = board.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 8);
    const y = Math.floor(((e.clientY - r.top) / r.height) * 8);
    const sq = x < 0 || x > 7 || y < 0 || y > 7 ? null : (7 - y) * 8 + x;
    // La souris passe sur une pièce jouable : la scène 3D se prépare pendant que le visiteur hésite
    if (sq !== null && movers.has(sq) && !intent) setIntent(true);
    setHoverSq(sq !== null && movers.has(sq) && g.selected === null ? sq : null);
  };

  /** Une carte de la main, touchée depuis l'accueil : la partie s'ouvre, la carte est prête à lancer. */
  const heroCard = (i: number) => {
    const ok = g.playable[i];
    const pickCard = g.pickCard;
    play(ok ? () => pickCard(i) : undefined);
  };

  // ------------------------------------------------------------------------------------------
  // Démonstrations des lieux

  const act: Act = useMemo(() => {
    if (chapter && chapter in CARDS) return { key: `c:${chapter}`, cards: [chapter as CardId], skin: placeDef.skin, every: 2 };
    if (placeDef.id === 'bazar') return { key: `bz:${skinPick}:${pulse}`, cards: idleCasts('bazar', catalog), skin: skinPick, every: 2 };
    return { key: `p:${placeDef.id}`, cards: idleCasts(placeDef.id, catalog), skin: placeDef.skin, every: 3 };
  }, [chapter, placeDef, skinPick, pulse, catalog]);

  const stageTheme = placeDef.id === 'bazar' ? boardPick : placeDef.theme;
  const castTilt = reduced ? 0 : mobile ? 0.62 : place === 5 ? 0.7 : 0.66;
  const onCast = useCallback((card: CardId, s: string) => setCast({ card, skin: s }), []);
  const onCanvas = useCallback((c: HTMLCanvasElement | null) => engineRef.current?.setCanvas(c), []);
  useEffect(() => {
    engineRef.current?.setHover(hover);
  }, [hover]);

  // ------------------------------------------------------------------------------------------
  // Bazar : la vraie boutique

  const owned = (id: string) => FREE_ITEMS.includes(id) || !!me?.items.includes(id);
  const isEquipped = (id: string) => me?.equippedSkin === id || me?.equippedBoard === id;
  const equip = async (id: string) => {
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: { itemId: id } });
      setMe(r.user);
      notify(`${itemById(id)?.name} équipé.`, 'success');
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  };
  const pickItem = itemById(pick);

  // ------------------------------------------------------------------------------------------
  // Textes

  const moveNo = Math.floor(g.state.ply / 2) + 1;
  const resume = inProgress;
  const castDef = cast ? CARDS[cast.card] : null;
  const chapterCard = chapter && chapter in CARDS ? CARDS[chapter as CardId] : null;
  const copy = PLACE_COPY[catalog];

  let captionBody: ReactNode;
  if (place === 0 || (mode !== 'page' && place === 0)) {
    if (g.result) captionBody = <span className="o-cap-go">Partie terminée · touchez l'échiquier pour la revoir</span>;
    else if (!inProgress)
      captionBody = (
        <>
          <span className={`o-live-dot ${g.duel ? '' : 'idle'}`} />
          <span>
            {!g.duel && (
              <>
                Contre l'IA <span className="o-cap-sep">·</span>{' '}
              </>
            )}
            {g.me === 'w' ? 'Vous avez les Blancs' : 'Vous avez les Noirs'} <span className="o-cap-sep">·</span>{' '}
            <b>{g.me === 'w' ? 'jouez votre premier coup' : 'à votre adversaire de commencer'}</b>
          </span>
        </>
      );
    else if (g.state.pos.turn === g.them)
      captionBody = (
        <>
          <span className="o-live-dot idle" />
          <span>
            Coup {moveNo} · <b>touchez l'échiquier pour reprendre</b>
          </span>
        </>
      );
    else
      captionBody = (
        <>
          <span className="o-live-dot idle" />
          <span>
            Partie en cours · coup {moveNo} · <b>à vous de jouer</b>
          </span>
        </>
      );
  } else if (reduced) {
    const c = chapterCard ?? castDef;
    captionBody = c ? (
      <button className="o-cap-play" onClick={() => setPlaySignal(n => n + 1)}>
        <span className="o-live-dot" style={{ '--h': c.hue } as CSSProperties} />
        Voir le sort : <b>{c.name}</b>
      </button>
    ) : (
      <span>Échiquier de démonstration</span>
    );
  } else if (hover) {
    captionBody = <span className="o-cap-go">{resume ? 'Reprendre la partie' : 'Jouer sur cet échiquier'} →</span>;
  } else if (castDef) {
    captionBody = (
      <>
        <span className="o-live-dot" style={{ '--h': castDef.hue } as CSSProperties} />
        <span className="o-cap-k">Sort en cours</span>
        <b>{castDef.name}</b>
        {placeDef.id === 'bazar' && <span className="o-cap-skin">skin {itemById(cast!.skin)?.name}</span>}
      </>
    );
  } else {
    captionBody = (
      <>
        <span className="o-live-dot idle" />
        <span className="o-cap-k">Démonstration en direct</span>
      </>
    );
  }

  // HUD du mode immersif
  const shellActions: ShellAction[] = [
    // Contre l'IA : chercher un vrai joueur, sans quitter la partie (l'IA joue en attendant) ; en direct : reprendre la main
    {
      label: lobby.searching ? 'Annuler la recherche' : 'Chercher un vrai joueur',
      icon: 'search',
      onClick: () => lobby.setSearching(!lobby.searching),
      hidden: !!g.duel,
    },
    { label: 'Prendre la main', icon: 'hand', onClick: g.takeOver, hidden: !meRelayed },
    { label: 'Nouvelle partie', icon: 'new', onClick: g.newGame, hidden: g.state.ply === 0 },
    { label: 'Abandonner', icon: 'resign', confirm: "Confirmer l'abandon", onClick: g.resign, hidden: g.state.ply === 0 || !!g.result },
  ];
  const prompt = g.selectedDef
    ? {
        name: g.selectedDef.name,
        hue: g.selectedDef.hue,
        text: g.prompt ?? '',
        onCast: g.selectedDef.targets === 0 ? g.castSelected : undefined,
        onCancel: g.cancel,
      }
    : null;

  // Accès clavier : l'échiquier se joue à la souris ou au doigt ; ce bouton ouvre la partie en plein écran
  const showHit = mode === 'page' && (place !== 0 || (inProgress && !g.myTurn) || !!g.result);

  const playLabel = resume ? 'Reprendre' : 'Jouer';

  return (
    <div className={`ody ${mode !== 'page' ? 'is-playing' : ''} ${mode === 'game' ? 'is-game' : ''}`} ref={rootRef}>
      <div className="o-falling-star" aria-hidden="true">
        <span className="o-fs-tail" />
        <span className="o-fs-head" />
      </div>
      <div className="o-impact" aria-hidden="true" />

      <div className="o-sky" aria-hidden="true">
        {PLACES.map((p, i) => (
          <div key={p.id} className={`o-sky-layer o-sky-${i}`} />
        ))}
      </div>

      <div className="o-world-shift">
        <div className="o-world" aria-hidden="true">
          {/* Lieux suivants : pas rendus au premier affichage (o-paused) ; le moteur les montre à l'approche */}
          <SceneStack part="back" />
        </div>
      </div>

      <div
        className={`o-astre ${mode === 'game' ? 'is-game' : ''} ${mode === 'entering' || mode === 'leaving' ? 'is-flip' : ''} ${place !== 0 && mode === 'page' ? 'is-demo' : ''} ${hover && mode === 'page' && place !== 0 ? 'is-hover' : ''} ${heroLive ? 'is-live' : ''}`}
        ref={astreRef}
      >
        <div className="o-astre-inner" onPointerEnter={onAstreEnter} onPointerLeave={onAstreLeave} onPointerDownCapture={onAstreDownCapture} onPointerMove={onAstreMove}>
          <div className="o-astre-aura" aria-hidden="true" />
          <div className="o-astre-glow" />
          <div className="o-astre-halo" />
          <div ref={orbitsRef} className="o-orbits-wrap">
            <OrbitRings />
            <div className="o-eq-wrap">
              {EQ.map((e, i) => (
                <EqRing key={i} part="back" {...e} />
              ))}
            </div>
          </div>
          <div className="o-astre-shadow" />
          <div className="o-astre-float">
            <div className="o-astre-wake">
              <div className="o-astre-board">
                {place !== 0 && mode === 'page' && (
                  <Suspense fallback={null}>
                    <StageBoard
                      key={placeDef.id}
                      act={act}
                      catalog={catalog}
                      theme={stageTheme}
                      resetSignal={0}
                      paused={mode !== 'page' || transit}
                      tilt={castTilt}
                      still={reduced}
                      playSignal={playSignal}
                      onCast={onCast}
                      onCanvas={onCanvas}
                    />
                  </Suspense>
                )}
              </div>
              <div className={`o-astre-game ${hoverSq !== null ? 'is-grab' : ''}`} ref={liveRef}>
                <Board ref={g.boardRef} {...liveBoardProps} />
                <div className="o-live-overlay" aria-hidden="true">
                  <div className="o-live-plane">
                    {hoverSq !== null && <span className="o-halo" style={{ left: `${(hoverSq & 7) * 12.5}%`, top: `${(7 - (hoverSq >> 3)) * 12.5}%` }} />}
                    {g.state.ply === 0 && mode === 'page' && place === 0 && (
                      <svg className="o-hint-arrow" viewBox="0 0 8 8" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="o-arrow-g" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0" stopColor="#f3c969" stopOpacity="0.15" />
                            <stop offset="1" stopColor="#fff1c4" stopOpacity="0.95" />
                          </linearGradient>
                        </defs>
                        <rect x="4.04" y="4.04" width="0.92" height="0.92" rx="0.08" fill="rgba(255,241,196,.10)" stroke="#f3c969" strokeWidth="0.035" strokeDasharray="0.1 0.07" />
                        <circle cx="4.5" cy="6.5" r="0.4" fill="none" stroke="#f3c969" strokeWidth="0.045" opacity="0.9" />
                        <path d="M4.5 6.1 L4.5 4.95" stroke="url(#o-arrow-g)" strokeWidth="0.17" strokeLinecap="round" fill="none" />
                        <path d="M4.2 5.06 L4.5 4.62 L4.8 5.06 Z" fill="#fff1c4" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div ref={frontRef} className="o-astro-front">
            <div className="o-astro-front-in">
              {EQ.map((e, i) => (
                <EqRing key={i} part="front" {...e} />
              ))}
            </div>
          </div>
          {showHit && (
            <button
              className="o-astre-hit"
              onClick={() => play()}
              onFocus={() => setHover(true)}
              onBlur={() => setHover(false)}
              aria-label={resume ? 'Reprendre la partie en plein écran' : 'Jouer sur cet échiquier'}
            />
          )}
        </div>
      </div>

      <div className="o-world-shift o-front-shift">
        <div className="o-world o-front" aria-hidden="true">
          <SceneStack part="front" />
        </div>
      </div>

      {place > 0 &&
        mode === 'page' &&
        (() => {
          const pip = (
            <button className={`o-pip-play ${docked ? 'is-docked' : ''}`} onClick={() => play()} aria-label={resume ? `Reprendre la partie, coup ${moveNo}` : 'Jouer maintenant'}>
              <span>
                {playLabel}
                {resume && <small> · coup {moveNo}</small>}
              </span>
            </button>
          );
          // Ordinateur : dans l'en-tête, à côté du menu ; mobile : en bas, à portée de pouce
          return headerSlot && !mobile ? createPortal(pip, headerSlot) : pip;
        })()}

      <div className={`o-astre-caption ${place === 0 ? 'is-live' : ''} ${reduced && place !== 0 ? 'is-still' : ''} ${hover && place !== 0 ? 'is-go' : ''}`} ref={captionRef} aria-live="off">
        {captionBody}
      </div>

      <aside className="o-altimeter o-chrome" ref={altRootRef} aria-label="Progression de la descente">
        <div className="o-alt-read">
          <span className="o-alt-label">Altitude</span>
          <span className="o-alt-val">
            <span ref={altRef}>9 120</span> m
          </span>
          <span className="o-alt-place">{PLACES[place].name}</span>
        </div>
        <ol className="o-alt-track">
          <span className="o-alt-fill" />
          {PLACES.map((p, i) => (
            <li key={p.id} className={place === i ? 'on' : place > i ? 'past' : ''}>
              <button onClick={() => scrollTo(`#${IDS[i]}`)} aria-label={p.name}>
                <span className="o-alt-num">{p.num}</span>
                <span className="o-alt-name">{p.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <div className="o-content">
        {/* I. L'Observatoire : la partie est déjà ouverte */}
        <section className="o-place o-hero" id="observatoire" data-pose="hero" data-scene="0" data-place="0">
          <div className="o-hero-copy">
            <Kicker num="I" name="L'Observatoire" />
            <Lines as="h1" className="o-display" lines={['Les échecs', 'ont appris', <em key="m">la magie.</em>]} />
            <p className="o-lede o-rv" style={{ '--i': 3 } as CSSProperties}>
              Une vraie partie d'échecs, trois cartes de pouvoir, un sort par tour. La partie est déjà ouverte : {mobile ? 'touchez une pièce' : 'déplacez une pièce'} sur l'échiquier, {g.duel ? 'votre adversaire vous répond' : 'l’Oracle, une IA, vous répond'}.
            </p>
            {g.duel && (
              <p className={`o-duel-note ${away !== null ? 'is-away' : ''}`} role="status">
                <span className="o-live-dot" style={{ '--h': away !== null ? 30 : 150 } as CSSProperties} />
                {meRelayed ? (
                  <span>
                    Vous ne jouiez pas : <b>l’IA joue pour vous</b> en attendant.{' '}
                    <button type="button" className="o-link" onClick={g.takeOver}>
                      Prendre la main
                    </button>
                  </span>
                ) : away !== null ? (
                  <span>
                    Votre adversaire a quitté la page{themRelayed ? ' : l’IA joue à sa place' : ''}.{' '}
                    {claimIn > 0 ? (
                      <small>Victoire réclamable dans {claimIn} s.</small>
                    ) : (
                      <button type="button" className="o-link" onClick={g.claim}>
                        Réclamer la victoire
                      </button>
                    )}
                  </span>
                ) : (
                  <span>
                    <b>En direct</b> : vous jouez contre une personne qui est aussi sur cette page{oppFrom ? `, connectée ${oppFrom}` : ''}.
                    {themRelayed && <small> Elle ne joue pas pour l’instant : l’IA joue à sa place.</small>}
                  </span>
                )}
              </p>
            )}
            <div className="o-hand-row o-rv" style={{ '--i': 4 } as CSSProperties} onPointerEnter={wantPlay} onFocus={wantPlay}>
              <div className="o-hand-mini" aria-label="Vos trois sorts">
                {g.hand.map((h, i) =>
                  h.card ? (
                    <SpellCard key={i} id={h.card} size="mini" used={h.used} disabled={!h.used && !g.myTurn} onClick={() => heroCard(i)} />
                  ) : null,
                )}
              </div>
              <div className="o-hand-copy">
                <span className="o-hand-k">{g.state.ply === 0 ? 'Vos trois sorts' : `Votre main · coup ${moveNo}`}</span>
                <span className="o-hand-names">
                  {g.hand.map((h, i) =>
                    h.card ? (
                      <button key={i} type="button" className={h.used ? 'is-used' : ''} onClick={() => heroCard(i)} title={CARDS[h.card].tagline}>
                        <span className="o-hand-n">{CARDS[h.card].name}</span>
                        {/* Effet sur le tour (décision D1) : le Rituel, l'exception, le dit à côté de son nom */}
                        {CARDS[h.card].ritual && <small className="o-hand-turn">remplace votre coup</small>}
                      </button>
                    ) : null,
                  )}
                </span>
                <span className="o-hand-t">
                  {g.hand.some(h => h.card && CARDS[h.card].ritual)
                    ? 'Touchez-en un pour le lire et le lancer ; les autres sorts s’ajoutent à votre coup.'
                    : 'Touchez-en un pour le lire et le lancer, puis jouez votre coup.'}
                </span>
              </div>
            </div>
            {g.state.hands[g.them].length > 0 && (
              <p className="o-hand-opp o-rv" style={{ '--i': 4 } as CSSProperties} aria-label={`Cartes ${g.duel ? 'de votre adversaire' : "de l'Oracle"}, visibles`}>
                <span className="o-hand-opp-k">{g.duel ? 'Votre adversaire tient' : "L'Oracle tient"}</span>
                {g.state.hands[g.them].map((h, i) =>
                  h.card && h.card in CARDS ? (
                    <span key={i} className={h.used ? 'is-used' : ''} title={`${CARDS[h.card].name}${h.used ? ' (jouée)' : ''} : ${CARDS[h.card].description}`}>
                      {CARDS[h.card].name}
                    </span>
                  ) : null,
                )}
              </p>
            )}
            <div className="o-opts o-rv" style={{ '--i': 5 } as CSSProperties}>
              {g.duel ? (
                <div className="o-opts-line">
                  <span className="o-opts-k">Contre</span>
                  <span>une personne aussi sur cette page{oppCountry ? ` (${oppCountry})` : ''}</span>
                  <button type="button" className="o-link" onClick={g.newGame}>
                    {g.result ? 'Rejouer contre l’Oracle' : 'Jouer plutôt contre l’Oracle'}
                  </button>
                </div>
              ) : (
                <div className="o-opts-line">
                  <span className="o-opts-k">Contre</span>
                  <span className="o-vs-ai">
                    <b className="o-ai-tag">IA</b> l'Oracle, une intelligence artificielle
                  </span>
                  <LevelPick level={g.level} onChange={g.setLevel} />
                </div>
              )}
              {/* Recommencer, ou retrouver la partie de la visite précédente, sans passer par le plein écran */}
              {!g.duel && (g.state.ply > 0 || g.result || g.previous) && (
                <p className="o-restart">
                  {(g.state.ply > 0 || g.result) && (
                    <button type="button" className="o-link" onClick={g.newGame}>
                      Nouvelle partie
                    </button>
                  )}
                  {g.previous && g.state.ply === 0 && (
                    <button type="button" className="o-link is-quiet" onClick={g.resumePrevious}>
                      Reprendre la partie d’avant (coup {g.previous.moveNo})
                    </button>
                  )}
                </p>
              )}
              {!g.duel && <SearchOption lobby={lobby} />}
            </div>
            <button type="button" className="o-kbd-play" onClick={() => play()}>
              Ouvrir la partie en plein écran
            </button>
            <ul className="o-facts o-rv" style={{ '--i': 6 } as CSSProperties}>
              <li>Gratuit</li>
              <li>Sans compte</li>
              <li>Zéro pay-to-win</li>
            </ul>
          </div>
          <button type="button" className="o-scroll-cue o-rv" style={{ '--i': 7 } as CSSProperties} onClick={() => scrollTo('#foret')}>
            <span className="o-cue-line" />
            Défiler pour descendre
          </button>
        </section>

        {/* II. La Forêt de givre */}
        <section className="o-place o-side-left" id="foret" data-pose="foret" data-scene="1" data-place="1">
          <div className="o-col" data-col>
            <header className="o-place-head o-veil" data-chapter="principe">
              <Kicker num="II" name="La Forêt de givre" alt={PLACES[1].alt} />
              <Lines className="o-h2" lines={["Une partie d'échecs.", <><em>Trois sorts</em> en main.</>]} />
              <ol className="o-principle">
                {principle(catalog).map((p, i) => (
                  <li key={p.n} className="o-rv" style={{ '--i': i } as CSSProperties}>
                    <span className="o-pr-n">{p.n}</span>
                    <div>
                      <h3>{p.title}</h3>
                      <p>{p.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Slot />
            </header>
            <div className="o-interlude o-veil">
              <Lines as="h3" className="o-h3" lines={[copy.foret.title[0], <em key="e">{copy.foret.title[1]}</em>]} />
              <p className="o-rv">{copy.foret.text}</p>
            </div>
            {storyCards.foret.map(id => (
              <Chapter key={id} id={id} active={chapter === id} />
            ))}
          </div>
        </section>

        {/* III. Les Pics de l'orage */}
        <section className="o-place o-side-right" id="pics" data-pose="pics" data-scene="2" data-place="2">
          <div className="o-col" data-col>
            <header className="o-place-head o-veil">
              <Kicker num="III" name="Les Pics de l'orage" alt={PLACES[2].alt} />
              <Lines className="o-h2" lines={[copy.pics.title[0], <em key="e">{copy.pics.title[1]}</em>]} />
              <p className="o-rv o-place-text">{copy.pics.text}</p>
            </header>
            {storyCards.pics.map(id => (
              <Chapter key={id} id={id} active={chapter === id} />
            ))}
          </div>
        </section>

        {/* IV. Le Sablier */}
        <section className="o-place o-side-left" id="sablier" data-pose="sablier" data-scene="3" data-place="3">
          <div className="o-col" data-col>
            <header className="o-place-head o-veil">
              <Kicker num="IV" name="Le Sablier" alt={PLACES[3].alt} />
              <Lines className="o-h2" lines={[copy.sablier.title[0], <em key="e">{copy.sablier.title[1]}</em>]} />
              <p className="o-rv o-place-text">{copy.sablier.text}</p>
            </header>
            {storyCards.sablier.map(id => (
              <Chapter key={id} id={id} active={chapter === id} />
            ))}
            <div className="o-interlude o-veil o-interlude-end">
              <Lines as="h3" className="o-h3" lines={[INTERLUDE[catalog].title[0], <em key="e">{INTERLUDE[catalog].title[1]}</em>]} />
              <p className="o-rv">{INTERLUDE[catalog].text}</p>
              <p className="o-rv o-more">
                <Link to="/cartes">Toutes les règles et les cartes</Link>
                <Link to="/apprendre">Apprendre pas à pas</Link>
              </p>
            </div>
          </div>
        </section>

        {/* V. Le Bazar céleste : la vraie boutique */}
        <section className="o-place o-bazar" id="bazar" data-pose="bazar" data-scene="4" data-place="4">
          <div className="o-sticky">
            <div className="o-bazar-col o-veil" data-col>
              <header className="o-place-head">
                <div className="o-seal o-rv" aria-label="Zéro pay-to-win">
                  {/* Le conteneur tourne, pas le <svg> : un texte SVG qui tourne serait remis en page à chaque image */}
                  <div className="o-seal-text">
                    <svg viewBox="0 0 200 200">
                      <defs>
                        <path id="o-seal-c" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" />
                      </defs>
                      <text fontFamily="Cinzel" fontSize="13.2" letterSpacing="5.2" fill="#f3c969">
                        <textPath href="#o-seal-c">ZÉRO PAY-TO-WIN · STYLE UNIQUEMENT · </textPath>
                      </text>
                    </svg>
                  </div>
                  <div className="o-seal-core">
                    <Mark size={34} />
                  </div>
                </div>
                <Kicker num="V" name="Le Bazar céleste" alt={PLACES[4].alt} />
                <Lines className="o-h2" lines={['Du style.', <em key="e">Jamais d'avantage.</em>]} />
                <p className="o-rv o-place-text">
                  La boutique ne vend que de l'apparence : des skins d'animation pour vos sorts et des plateaux. Toutes les cartes, tous les modes et le classement restent gratuits.{' '}
                  <span className="o-inline-more">
                    <Link to="/boutique">Entrer dans la boutique</Link>
                    {me && <Link to="/compte">Ma collection</Link>}
                  </span>
                </p>
              </header>
              <Slot label="Essayez un skin : l'échiquier le lance" />
              <div className="o-shelf o-rv">
                <div className="o-shelf-head">
                  <span>Skins d'animation</span>
                  <small>Allumez une lanterne : l'échiquier lance un sort avec ce skin</small>
                </div>
                <div className="o-lanterns">
                  {SKINS.map((s, i) => (
                    <button
                      key={s.id}
                      className={`o-lantern ${skinPick === s.id ? 'on' : ''}`}
                      style={{ '--p': s.skin!.primary, '--s': s.skin!.secondary, '--a': s.skin!.accent, '--i': i } as CSSProperties}
                      onClick={() => {
                        setSkinPick(s.id);
                        setPick(s.id);
                        setPulse(n => n + 1);
                      }}
                      aria-pressed={skinPick === s.id}
                    >
                      <span className="o-lantern-cord" />
                      <span className="o-lantern-body">
                        <span className="o-lantern-orb" />
                      </span>
                      <span className="o-lantern-name">{s.name}</span>
                      <span className="o-lantern-price">{owned(s.id) && me ? 'Possédé' : priceOf(s.id)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="o-shelf o-rv">
                <div className="o-shelf-head">
                  <span>Plateaux</span>
                  <small>
                    {itemById(boardPick)?.name} · {priceOf(boardPick)}
                  </small>
                </div>
                <div className="o-stall">
                  <div className="o-swatches">
                    {BOARDS.map(b => (
                      <button
                        key={b.id}
                        className={`o-swatch ${boardPick === b.id ? 'on' : ''}`}
                        style={{ '--l': b.board!.light, '--d': b.board!.dark, '--f': b.board!.frame } as CSSProperties}
                        onClick={() => {
                          setBoardPick(b.id);
                          setPick(b.id);
                        }}
                        aria-label={`${b.name}, ${priceOf(b.id)}`}
                        aria-pressed={boardPick === b.id}
                      >
                        <span className="o-swatch-tile">
                          <span className="o-swatch-grid" />
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className="o-stall-shelf" />
                </div>
              </div>
              {pickItem && (
                <div className="o-pick o-rv" aria-live="polite">
                  <div>
                    <b>{pickItem.name}</b>
                    <span>{pickItem.description}</span>
                  </div>
                  {me && owned(pick) ? (
                    isEquipped(pick) ? (
                      <span className="o-pick-state">Équipé</span>
                    ) : (
                      <button type="button" className="btn-gold sm" onClick={() => void equip(pick)}>
                        Équiper
                      </button>
                    )
                  ) : owned(pick) ? (
                    <span className="o-pick-state">Offert</span>
                  ) : (
                    <Link className="btn-gold sm" to="/boutique">
                      {priceOf(pick)} · Boutique
                    </Link>
                  )}
                </div>
              )}
              <div className="o-packs o-rv">
                {PACKS.map(p => (
                  <Link key={p.id} to="/boutique" className="o-pack">
                    <b>{p.name}</b>
                    <span>{p.description}</span>
                    <em>
                      {(p.priceCents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      {p.compareAtCents && <s>{(p.compareAtCents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</s>}
                    </em>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* VI. Le Seuil : les vrais modes */}
        <section className="o-place o-seuil" id="seuil" data-pose="seuil" data-scene="5" data-place="5">
          <div className="o-sticky o-seuil-grid">
            <div className="o-seuil-left o-veil">
              <Kicker num="VI" name="Le Seuil" alt={0} />
              <Lines className="o-h2" lines={["La descente s'achève.", <em key="e">La partie commence.</em>]} />
              <p className="o-rv o-place-text">Une partie dure de 5 à 20 minutes. La vôtre vous attend sur l'échiquier, sans inscription.</p>
              <div className="o-rv">
                <button className="btn-gold" onClick={() => play()}>
                  <span className="btn-shine" />
                  <span className="btn-main">{resume ? 'Reprendre la partie' : 'Franchir le seuil'}</span>
                  <span className="btn-sub">{resume ? `Coup ${moveNo} · en pause` : `Contre l'Oracle · ${levelName(g.level)}`}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="btn-arrow">
                    <path d="M5 12 H19 M13 6 L19 12 L13 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <Slot />
            </div>
            <div className="o-seuil-right o-veil">
              <p className="o-doors-label o-rv">Trois portes</p>
              {MODES.map((m, i) => (
                <button
                  key={m.key}
                  className="o-door o-rv"
                  style={{ '--i': i } as CSSProperties}
                  onClick={() => (m.key === 'ami' ? setSheet('friend') : m.key === 'ia' ? setSheet('ai') : navigate('/jouer?mode=quick'))}
                >
                  <span className="o-door-n">{['I', 'II', 'III'][i]}</span>
                  <span className="o-door-body">
                    <span className="o-door-title">
                      {m.title} <span className="o-tag">{m.tag}</span>
                    </span>
                    <span className="o-door-text">{m.text}</span>
                  </span>
                  <span className="o-door-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
              <nav className="o-also o-rv" aria-label="Aussi sur Spellmate">
                <Link to="/apprendre">Apprendre</Link>
                <Link to="/problemes">Problèmes</Link>
                <Link to="/analyse">Analyse</Link>
                <Link to="/direct">En direct</Link>
                <Link to="/classement">Classement</Link>
              </nav>
            </div>
          </div>
        </section>
      </div>

      {/* Mode jeu : le décor glisse vers la gauche, un rideau d'or traverse l'écran, l'arène garde l'atmosphère du lieu */}
      <div className={`o-curtain-veil ${mode === 'page' ? 'is-off' : ''}`} aria-hidden="true" />
      <div className={`o-curtain ${mode === 'page' ? 'is-off' : ''}`} aria-hidden={mode === 'page'}>
        <span className="o-curtain-edge">
          <span className="o-ce-glow" />
          <span className="o-ce-core" />
        </span>
        <div className="o-arena-glow" />
        <div className="o-arena-stars" />
      </div>

      <GameShell
        active={mode === 'game'}
        onBack={leave}
        backLabel="Retour à la page"
        badge={g.duel ? 'En direct · aucun compte' : 'Contre l’IA · aucun compte'}
        kicker={g.duel ? `Coup ${moveNo} · partie en direct` : `Coup ${moveNo} · contre l'IA, niveau ${levelName(g.level).toLowerCase()}`}
        title={statusOf(g)}
        banner={duelBanner}
        hint={
          !g.myTurn && !g.result ? (
            <>
              {g.duel ? (themRelayed ? 'L’IA joue pour votre adversaire.' : 'Votre adversaire réfléchit.') : 'L’Oracle, une IA, prépare sa réponse.'}
              <PremoveNote n={premoves} mobile={mobile} onCancel={g.clearPremoves} />
            </>
          ) : g.state.cardPlayed && g.myTurn ? (
            <>
              {castMessage(castThisTurn(g.state, g.me) ?? 'tide')}
              <small>Une seule carte par tour. Revenez à la page quand vous voulez : la partie vous attend.</small>
            </>
          ) : (
            <>
              Lancez une carte avant votre coup, ou jouez directement.
              <small>Une seule carte par tour. Revenez à la page quand vous voulez : la partie vous attend.</small>
            </>
          )
        }
        result={
          g.result
            ? {
                text: <p>{RESULT_TEXT[g.result.reason] ?? 'Partie terminée'}.</p>,
                actions: (
                  <>
                    <button type="button" className="btn-gold sm" onClick={g.newGame}>
                      {g.duel ? 'Rejouer contre l’Oracle' : 'Rejouer'}
                    </button>
                    <button type="button" className="btn-line" onClick={leave}>
                      Retour à la page
                    </button>
                  </>
                ),
              }
            : null
        }
        prompt={prompt}
        actions={shellActions}
        powers={!g.result && g.state.effects.length > 0 && <PowersPanel effects={g.state.effects} you={g.me} names={{ [g.them]: oppLabel }} mobile={mobile} />}
        statusExtra={
          g.duel ? undefined : (
            <div className="o-shell-extra">
              <LevelPick level={g.level} onChange={g.setLevel} />
              <SearchOption lobby={lobby} compact={mobile} />
            </div>
          )
        }
        opponent={
          g.duel
            ? {
                name: 'Votre adversaire',
                sub: themRelayed ? 'L’IA joue à sa place en ce moment' : oppCountry ? `En direct · ${oppCountry}` : 'En direct, sur cette page',
                hand: g.state.hands[g.them],
                handLabel: 'Cartes de votre adversaire',
              }
            : { name: "L'Oracle", sub: `IA · niveau ${levelName(g.level)}`, hand: g.state.hands.b, handLabel: "Cartes de l'Oracle" }
        }
        hand={g.hand}
        playable={g.playable}
        selected={g.selected}
        onPickCard={g.pickCard}
        notes={mode === 'game' ? handNotes(g.state, g.me, g.myTurn, g.playable) : undefined}
        cast={g.myTurn ? castThisTurn(g.state, g.me) : null}
        toast={toast}
      />

      {mode === 'page' && place !== 0 && lobby.searching && (
        <div className="o-queue-pill" role="status">
          <SearchOption lobby={lobby} compact />
        </div>
      )}

      {sheet === 'friend' && <FriendSheet onClose={() => setSheet(null)} catalog={catalog} signedIn={!!me} />}
      {sheet === 'ai' && (
        <Sheet
          kicker="Deuxième porte"
          title="Affronter l'IA"
          onClose={() => setSheet(null)}
          actions={
            <button type="button" className="btn-gold sm" onClick={() => play()}>
              {resume ? 'Reprendre la partie' : `Jouer contre le ${levelName(g.level)}`}
            </button>
          }
        >
          <div className="o-levels" role="radiogroup" aria-label="Niveau">
            {LEVELS.map(l => (
              <button key={l.level} type="button" role="radio" aria-checked={g.level === l.level} className={`o-level ${g.level === l.level ? 'on' : ''}`} onClick={() => g.setLevel(l.level)}>
                <b>{l.name}</b>
                <span>{l.text}</span>
              </button>
            ))}
          </div>
          <p className="o-sheet-note">
            La partie se joue dans votre navigateur, sans pendule. Avec une pendule et un historique : <Link to="/jouer?mode=bot">partie contre l'IA sur le serveur</Link>.
          </p>
        </Sheet>
      )}
    </div>
  );
}

/** Première porte : créer une invitation (vraie partie sur le serveur) et partir vers /partie/:id. */
function FriendSheet({ onClose, catalog: initial, signedIn }: { onClose: () => void; catalog: string; signedIn: boolean }) {
  const navigate = useNavigate();
  const [name, setName] = useState(getGuestName());
  const [tc, setTc] = useState('10+0');
  // Jeu proposé : « Pouvoirs » (par défaut) ou « Sans cartes » ; le Duel n'est plus proposé.
  const [catalog, setCatalog] = useState<Catalog>(() => offeredCatalog(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = signedIn || /^[\p{L}\p{N} _.-]{2,20}$/u.test(name.trim());
  const create = async () => {
    setError(null);
    if (!valid) {
      setError('Choisissez un pseudo de 2 à 20 caractères.');
      return;
    }
    setBusy(true);
    try {
      if (!signedIn) setGuestName(name.trim());
      const r = await api<{ id: string }>('/games', { body: { mode: 'invite', tc, color: 'random', catalog, name: signedIn ? undefined : name.trim() } });
      navigate(`/partie/${r.id}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <Sheet
      kicker="Première porte"
      title="Défier un ami"
      onClose={onClose}
      actions={
        <button type="button" className="btn-gold sm" onClick={() => void create()} disabled={busy}>
          {busy ? 'Création…' : "Créer l'invitation"}
        </button>
      }
    >
      <p>Créez la partie, puis envoyez le lien. Votre ami la rejoint en un clic, sans compte, sur mobile comme sur ordinateur.</p>
      <form
        className="o-form"
        onSubmit={e => {
          e.preventDefault();
          void create();
        }}
      >
        {!signedIn && (
          <label className="field">
            <span className="label">Votre pseudo</span>
            <input className="input" maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. : Fou du roi" autoComplete="nickname" />
          </label>
        )}
        <div className="field">
          <span className="label">Jeu</span>
          <div className="segmented">
            {CATALOGS.map(c => (
              <button key={c.id} type="button" className={catalog === c.id ? 'on' : ''} aria-pressed={catalog === c.id} title={c.description} onClick={() => setCatalog(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Cadence</span>
          <div className="segmented">
            {[
              ['5+0', '5 min'],
              ['10+0', '10 min'],
              ['15+10', '15 + 10'],
              ['none', 'Sans limite'],
            ].map(([id, label]) => (
              <button key={id} type="button" className={tc === id ? 'on' : ''} onClick={() => setTc(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>
      <p className="o-sheet-note">
        Plus d'options (couleur, cadence) : <Link to="/jouer?mode=invite">page Jouer</Link>.
      </p>
    </Sheet>
  );
}
