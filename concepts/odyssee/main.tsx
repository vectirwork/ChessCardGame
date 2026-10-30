// Spellmate · L'Odyssée : une descente verticale à travers six lieux, un échiquier-astre qui l'accompagne,
// et une partie jouable en plein écran à tout moment.
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource-variable/inter';
import '../../src/client/styles/cards.css';
import '../../src/client/styles/board.css';
import './odyssee.css';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { SpellCard } from '../../src/client/components/SpellCard';
import { CARDS, RARITY_LABEL } from '../../src/shared/cards';
import type { CardId } from '../../src/shared/cards';
import { ITEMS, itemById } from '../../src/shared/catalog';
import { IDLE_CASTS, LEGAL, LEVELS, MODES, PLACES, PLACE_CARDS, PLACE_COPY, PRICES, PRINCIPLE } from './data';
import { Engine, isMobile } from './engine';
import { GameMode } from './GameMode';
import { SCENES } from './scenery';
import { StageBoard } from './StageBoard';
import type { Act } from './StageBoard';

type Mode = 'page' | 'entering' | 'game' | 'leaving';
type Preview = { kind: 'legal'; key: string } | { kind: 'login' } | { kind: 'friend' } | { kind: 'ranked' } | { kind: 'ai' } | null;

const IDS = ['observatoire', 'foret', 'pics', 'sablier', 'bazar', 'seuil'];

function Mark({ size = 28 }: { size?: number }) {
  const id = `mk${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="mark">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.55" stopColor="#f3c969" />
          <stop offset="1" stopColor="#c47f2a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="none" stroke={`url(#${id})`} strokeWidth="1" opacity="0.6" />
      <path d="M32 6l5.2 20.8L58 32l-20.8 5.2L32 58l-5.2-20.8L6 32l20.8-5.2z" fill={`url(#${id})`} />
      <circle cx="32" cy="32" r="3.4" fill="#05060f" />
    </svg>
  );
}

function Lines({ lines, as: Tag = 'h2', className = '' }: { lines: ReactNode[]; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  return (
    <Tag className={`rv-lines ${className}`}>
      {lines.map((l, i) => (
        <span className="ln" key={i} style={{ '--l': i } as CSSProperties}>
          <span>{l}</span>
        </span>
      ))}
    </Tag>
  );
}

function Kicker({ num, name, alt }: { num: string; name: string; alt?: number }) {
  return (
    <p className="kicker rv">
      <span className="num">{num}</span>
      <span>{name}</span>
      {alt !== undefined && <span className="kicker-alt">{alt.toLocaleString('fr-FR')} m</span>}
    </p>
  );
}

/** Mobile : emplacement où l'échiquier vient se poser pendant la lecture (invisible sur bureau). */
function Slot({ label = "Touche l'échiquier pour jouer" }: { label?: string }) {
  return (
    <div className="m-slot" data-slot aria-hidden="true">
      <span className="m-slot-hint">{label}</span>
    </div>
  );
}

function Chapter({ id, active }: { id: CardId; active: boolean }) {
  const c = CARDS[id];
  return (
    <article className={`chapter ${active ? 'on' : ''}`} data-chapter={id} style={{ '--h': c.hue } as CSSProperties}>
      <div className="chapter-card rv">
        <SpellCard id={id} size="full" />
      </div>
      <div className="chapter-text">
        <p className="chapter-meta rv">
          <span>{RARITY_LABEL[c.rarity]}</span>
          <span>{c.duration}</span>
        </p>
        <h3 className="chapter-name rv">{c.name}</h3>
        <p className="chapter-tag rv">{c.tagline}</p>
        <p className="chapter-rule rv">{c.description}</p>
        <p className="chapter-target rv">
          <span>En partie</span>
          {c.prompts[0] ?? 'Effet immédiat, sans cible.'}
        </p>
      </div>
      <Slot label={`${c.name} · touche pour jouer`} />
    </article>
  );
}

/** Anneaux méridiens de l'astrolabe, derrière l'échiquier. */
function OrbitRings() {
  return (
    <div className="orbits" aria-hidden="true">
      <svg className="orbit o1" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(243,201,105,.55)" strokeWidth="0.3" />
        <circle cx="100" cy="100" r="93" fill="none" stroke="rgba(243,201,105,.4)" strokeWidth="0.2" strokeDasharray="0.6 2.2" />
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * Math.PI * 2;
          const l = i % 6 === 0 ? 4 : 1.8;
          return (
            <line
              key={i}
              x1={(100 + Math.cos(a) * 98).toFixed(2)}
              y1={(100 + Math.sin(a) * 98).toFixed(2)}
              x2={(100 + Math.cos(a) * (98 - l)).toFixed(2)}
              y2={(100 + Math.sin(a) * (98 - l)).toFixed(2)}
              stroke="rgba(243,201,105,.7)"
              strokeWidth="0.24"
            />
          );
        })}
        <circle cx="198" cy="100" r="1.6" fill="#ffe1a0" />
      </svg>
      <svg className="orbit o2" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(127,231,255,.36)" strokeWidth="0.22" />
        <circle cx="14" cy="100" r="1.3" fill="#bff3ff" />
        <circle cx="186" cy="100" r="0.9" fill="#bff3ff" />
      </svg>
      <svg className="orbit o3" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(243,201,105,.24)" strokeWidth="0.16" />
        {['N', 'E', 'S', 'O'].map((t, i) => (
          <text key={t} x={100 + [0, 81, 0, -81][i]} y={100 + [-80, 1.2, 82.6, 1.2][i]} fill="rgba(243,201,105,.75)" fontSize="3.4" textAnchor="middle" fontFamily="Cinzel">
            {t}
          </text>
        ))}
      </svg>
    </div>
  );
}

/**
 * Anneau équatorial de l'astrolabe : un cercle gradué vu de biais (écrasé en ellipse) qui tourne sur lui-même.
 * La moitié arrière passe derrière l'échiquier, la moitié avant devant (deux calques).
 */
function EqRing({ part, w, r, rot, dur, reverse, hue }: { part: 'back' | 'front'; w: number; r: number; rot: number; dur: number; reverse?: boolean; hue: 'gold' | 'cyan' }) {
  const stroke = hue === 'gold' ? 'rgba(243,201,105,.85)' : 'rgba(150,236,255,.6)';
  const ring = (
    <div className="eq-squash" style={{ transform: `scaleY(${r})` }}>
      <svg className="eq-spin" viewBox="0 0 200 200" style={{ animationDuration: `${dur}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
        <circle cx="100" cy="100" r="98" fill="none" stroke={stroke} strokeWidth="0.55" />
        <circle cx="100" cy="100" r="94.5" fill="none" stroke={stroke} strokeWidth="0.2" opacity="0.6" />
        {Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          const l = i % 4 === 0 ? 3.5 : 1.6;
          return (
            <line key={i} x1={(100 + Math.cos(a) * 98).toFixed(2)} y1={(100 + Math.sin(a) * 98).toFixed(2)} x2={(100 + Math.cos(a) * (98 - l)).toFixed(2)} y2={(100 + Math.sin(a) * (98 - l)).toFixed(2)} stroke={stroke} strokeWidth="0.4" />
          );
        })}
        <circle cx="198" cy="100" r="3" fill={hue === 'gold' ? '#fff1c4' : '#d8f8ff'} />
        <circle cx="198" cy="100" r="6" fill={hue === 'gold' ? 'rgba(255,225,160,.25)' : 'rgba(190,240,255,.25)'} />
        <circle cx="30" cy="170" r="2" fill={hue === 'gold' ? '#ffd68a' : '#bff3ff'} />
      </svg>
    </div>
  );
  return (
    <div className={`eq eq-${part}`} style={{ '--w': `${w}%`, '--r': r, transform: `translate(-50%, -50%) rotate(${rot}deg)` } as CSSProperties}>
      {part === 'front' ? <div className="eq-clip">{ring}</div> : ring}
    </div>
  );
}

const EQ = [
  { w: 142, r: 0.27, rot: -1, dur: 90, hue: 'gold' as const },
  { w: 122, r: 0.22, rot: 7, dur: 60, reverse: true, hue: 'cyan' as const },
];

function PreviewSheet({ preview, onClose, onPlay, level, setLevel }: { preview: NonNullable<Preview>; onClose: () => void; onPlay: () => void; level: string; setLevel: (l: string) => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  let title = '';
  let body: ReactNode = null;
  let action: ReactNode = (
    <button className="btn-gold sm" onClick={onPlay}>
      Jouer sans compte
    </button>
  );
  if (preview.kind === 'legal') {
    title = LEGAL[preview.key].title;
    body = <p>{LEGAL[preview.key].text}</p>;
    action = null;
  } else if (preview.kind === 'login') {
    title = 'Se connecter';
    body = (
      <p>
        Le compte, gratuit et facultatif, garde ton classement Elo, l'historique de tes parties et tes achats. Dans ce prototype, tout se joue sans compte.
      </p>
    );
  } else if (preview.kind === 'friend') {
    title = 'Défier un ami';
    body = (
      <>
        <p>Crée une partie et envoie le lien. Ton ami la rejoint en un clic, sans compte, sur mobile comme sur ordinateur.</p>
        <div className="sheet-link">
          <code>spellmate.app/p/7F3K-QZ</code>
          <button
            className="btn-line"
            onClick={() => {
              void navigator.clipboard?.writeText('https://spellmate.app/p/7F3K-QZ').catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? 'Copié' : 'Copier le lien'}
          </button>
        </div>
        <p className="sheet-note">Lien d'exemple : les parties entre amis passent par le serveur de jeu, absent de ce prototype.</p>
      </>
    );
    action = (
      <button className="btn-gold sm" onClick={onPlay}>
        En attendant, jouer contre l'IA
      </button>
    );
  } else if (preview.kind === 'ranked') {
    title = 'Parties classées';
    body = <p>Un adversaire de ton niveau, une pendule, et ton Elo qui monte ou descend. Il suffit d'un compte gratuit ; les cartes et les règles restent les mêmes pour tous.</p>;
    action = (
      <button className="btn-gold sm" onClick={onPlay}>
        Jouer une partie libre
      </button>
    );
  } else {
    title = "Affronter l'IA";
    body = (
      <div className="levels" role="radiogroup" aria-label="Niveau">
        {LEVELS.map(l => (
          <button key={l.key} role="radio" aria-checked={level === l.name} className={`level ${level === l.name ? 'on' : ''}`} onClick={() => setLevel(l.name)}>
            <b>{l.name}</b>
            <span>{l.text}</span>
          </button>
        ))}
      </div>
    );
    action = (
      <button className="btn-gold sm" onClick={onPlay}>
        Jouer contre le {level}
      </button>
    );
  }
  return (
    <div className="sheet-veil" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <p className="sheet-kicker">Aperçu du prototype</p>
        <h2>{title}</h2>
        {body}
        <div className="sheet-actions">
          {action}
          <button className="btn-line" onClick={onClose} autoFocus>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const astreRef = useRef<HTMLDivElement>(null);
  const orbitsRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const altRootRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const gameSlotRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [place, setPlace] = useState(0);
  const [chapter, setChapter] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('page');
  const [resetSignal, setResetSignal] = useState(0);
  const [skin, setSkin] = useState('skin:inferno');
  const [boardTheme, setBoardTheme] = useState('board:obsidian');
  const [picked, setPicked] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [cast, setCast] = useState<{ card: CardId; skin: string } | null>(null);
  const [gameSlot, setGameSlot] = useState<HTMLDivElement | null>(null);
  const [transit, setTransit] = useState(false);
  const [docked, setDocked] = useState(false);
  const [hover, setHover] = useState(false);
  const [hasGame, setHasGame] = useState(false);
  const [progress, setProgress] = useState({ ply: 0, over: false });
  const [level, setLevel] = useState('Sorcier');
  const [preview, setPreview] = useState<Preview>(null);
  const [playSignal, setPlaySignal] = useState(0);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [mobile, setMobile] = useState(() => isMobile(window.innerWidth));

  useEffect(() => {
    const engine = new Engine(
      astreRef.current!,
      { alt: altRef.current, altRoot: altRootRef.current, orbits: orbitsRef.current, front: frontRef.current, caption: captionRef.current, header: headerRef.current },
      {
        onPlace: p => {
          setPlace(p);
          setCast(null);
          setPlaySignal(0);
        },
        onChapter: setChapter,
        onTransit: setTransit,
        onDock: setDocked,
      },
    );
    engineRef.current = engine;
    setGameSlot(gameSlotRef.current);
    const onResize = () => setMobile(isMobile(window.innerWidth));
    window.addEventListener('resize', onResize);

    // Apparitions au défilement (les titres de lieu sont révélés par le moteur, à la fin du trajet de l'échiquier)
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
    document.querySelectorAll('.rv, .rv-lines').forEach(el => {
      if (!el.closest('.hero') && !el.closest('.place-head')) io.observe(el);
    });

    // Ouverture : la marque, puis une étoile tombe dans l'astrolabe, éclair doré, l'échiquier s'éveille
    const intro = gsap.timeline();
    const revealHero = () => document.querySelectorAll('.hero .rv, .hero .rv-lines').forEach(el => el.classList.add('in'));
    if (engine.reduced) {
      document.querySelector<HTMLElement>('.intro')?.style.setProperty('display', 'none');
      document.querySelector<HTMLElement>('.falling-star')?.style.setProperty('display', 'none');
      revealHero();
    } else {
      const p = engine.pose('hero');
      const sx = p.x - Math.min(980, window.innerWidth * 0.75);
      const sy = p.y - Math.min(760, window.innerHeight * 0.95);
      const angle = (Math.atan2(p.y - sy, p.x - sx) * 180) / Math.PI;
      gsap.set('.falling-star', { x: sx, y: sy, rotation: angle });
      intro
        .from('.intro-mark', { scale: 0.4, rotation: -90, opacity: 0, duration: 0.9, ease: 'expo.out' })
        .from('.intro-word', { y: 12, opacity: 0, duration: 0.6, ease: 'expo.out' }, 0.2)
        .to('.intro', { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 0.8)
        .set('.intro', { display: 'none' })
        .to('.falling-star', { x: p.x, y: p.y, duration: 0.72, ease: 'power3.in' }, 0.95)
        .set('.falling-star', { display: 'none' }, 1.67)
        .fromTo('.impact', { scale: 0.08, opacity: 1 }, { scale: 2.6, opacity: 0, duration: 1.2, ease: 'expo.out' }, 1.66)
        .from('.orbits', { scale: 0.55, rotation: -50, opacity: 0, duration: 2.2, ease: 'expo.out' }, 1.62)
        .from('.astro-front-in', { scale: 0.55, opacity: 0, duration: 2, ease: 'expo.out' }, 1.7)
        .from('.astre-board', { y: -70, scale: 0.6, opacity: 0, duration: 1.7, ease: 'expo.out' }, 1.66)
        .from('.top', { y: -20, opacity: 0, duration: 1, ease: 'expo.out' }, 1.75)
        .from('.altimeter', { opacity: 0, x: 20, duration: 1, ease: 'expo.out' }, 1.85)
        .call(revealHero, [], 1.5);
      gsap.set('.impact', { x: p.x, y: p.y });
    }
    // Accès de débogage à l'ouverture (captures image par image)
    (window as unknown as { __intro?: gsap.core.Timeline }).__intro = intro;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(() => engine.measure());
    return () => {
      intro.kill();
      io.disconnect();
      window.removeEventListener('resize', onResize);
      engine.destroy();
    };
  }, []);

  const scrollTo = useCallback((sel: string) => {
    engineRef.current?.scrollTo(sel, () => {
      // Saut direct : ce qui est déjà à l'écran apparaît sans attendre
      document.querySelectorAll<HTMLElement>('.rv:not(.in), .rv-lines:not(.in)').forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add('in', 'instant');
      });
    });
  }, []);

  // Rideau, aperçus : le défilement se fige
  useEffect(() => {
    engineRef.current?.lock(!!preview || mode !== 'page');
  }, [preview, mode]);

  const placeDef = PLACES[place];
  useEffect(() => {
    document.documentElement.style.setProperty('--tint', placeDef.tint);
  }, [placeDef]);

  const play = useCallback(() => {
    const e = engineRef.current;
    if (!e || mode !== 'page') return;
    setPreview(null);
    setHover(false);
    e.lock(true);
    e.captureGameFrom();
    setMode('entering');
    if (!hasGame) setResetSignal(n => n + 1);
    document.documentElement.classList.add('is-playing');
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set('.astre-game', { opacity: 1 });
        setMode('game');
        setHasGame(true);
      },
    });
    tl.to(e, { gameMix: 1, duration: 1.45, ease: 'expo.inOut', onUpdate: () => e.markDirty() }, 0);
    tl.fromTo('.curtain-veil', { xPercent: 101 }, { xPercent: 0, duration: 1.25, ease: 'expo.inOut' }, 0);
    tl.fromTo('.curtain', { xPercent: 101 }, { xPercent: 0, duration: 1.3, ease: 'expo.inOut' }, 0.1);
    tl.to('.content', { xPercent: -18, opacity: 0, duration: 1.2, ease: 'expo.inOut' }, 0);
    tl.to('.world-shift', { xPercent: -10, scale: 1.2, opacity: 0.85, duration: 1.45, ease: 'expo.inOut' }, 0);
    tl.to('.chrome', { autoAlpha: 0, y: -10, duration: 0.45, ease: 'power2.out' }, 0);
    if (hasGame) tl.fromTo('.astre-game', { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0.15);
  }, [mode, hasGame]);

  const leave = useCallback(() => {
    const e = engineRef.current;
    if (!e || mode !== 'game') return;
    gsap.to('.fan-slot', { y: 360, opacity: 0, duration: 0.5, ease: 'expo.in', stagger: 0.04 });
    gsap.to('.hud-in, .hud-toast, .hud-opponent, .oracle-hand-m', { opacity: 0, y: 14, duration: 0.35, ease: 'power2.in' });
    setCast(null);
    gsap.delayedCall(0.42, () => {
      setMode('leaving');
      e.captureGameFrom();
      const tl = gsap.timeline({
        onComplete: () => {
          setMode('page');
          document.documentElement.classList.remove('is-playing');
          gsap.set('.content, .world-shift', { clearProps: 'transform,opacity' });
        },
      });
      tl.to(e, { gameMix: 0, duration: 1.3, ease: 'expo.inOut', onUpdate: () => e.markDirty() }, 0);
      tl.to('.astre-game', { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 0.1);
      tl.to('.curtain', { xPercent: 101, duration: 1.2, ease: 'expo.inOut' }, 0);
      tl.to('.curtain-veil', { xPercent: 101, duration: 1.25, ease: 'expo.inOut' }, 0.08);
      tl.to('.content', { xPercent: 0, opacity: 1, duration: 1.3, ease: 'expo.inOut' }, 0.05);
      tl.to('.world-shift', { xPercent: 0, scale: 1, opacity: 1, duration: 1.3, ease: 'expo.inOut' }, 0);
      tl.to('.chrome', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 0.75);
    });
  }, [mode]);

  const onProgress = useCallback((ply: number, over: boolean) => setProgress({ ply, over }), []);

  const act: Act = useMemo(() => {
    if (chapter && chapter in CARDS) return { key: `c:${chapter}`, cards: [chapter as CardId], skin: placeDef.skin, every: 2 };
    if (placeDef.id === 'bazar') return { key: `bz:${skin}:${pulse}`, cards: IDLE_CASTS.bazar, skin, every: 2 };
    return { key: `p:${placeDef.id}`, cards: IDLE_CASTS[placeDef.id], skin: placeDef.skin, every: 3 };
  }, [chapter, placeDef, skin, pulse]);

  const gameTheme = picked ? boardTheme : 'board:arcane';
  const gameSkin = picked ? skin : 'skin:arcane';
  const stageTheme = mode !== 'page' && !hasGame ? gameTheme : placeDef.id === 'bazar' ? boardTheme : placeDef.theme;
  // Inclinaison du plateau au moment des sorts (identique à celle que le moteur donne au CSS)
  const castTilt = reduced ? 0 : mobile ? (place === 0 ? 0.74 : 0.62) : place === 0 ? 0.8 : place === 5 ? 0.7 : 0.66;

  useEffect(() => {
    engineRef.current?.setHover(hover);
  }, [hover]);

  const onCast = useCallback((card: CardId, s: string) => setCast({ card, skin: s }), []);
  const onCanvas = useCallback((c: HTMLCanvasElement | null) => engineRef.current?.setCanvas(c), []);

  const skins = ITEMS.filter(i => i.kind === 'skin');
  const boards = ITEMS.filter(i => i.kind === 'board');
  const resume = hasGame && !progress.over;
  const moveNo = Math.floor(progress.ply / 2) + 1;
  const castDef = cast ? CARDS[cast.card] : null;
  const chapterCard = chapter && chapter in CARDS ? CARDS[chapter as CardId] : null;

  let captionBody: ReactNode;
  if (reduced) {
    const c = chapterCard ?? castDef;
    captionBody = c ? (
      <button className="cap-play" onClick={() => setPlaySignal(n => n + 1)}>
        <span className="live-dot" style={{ '--h': c.hue } as CSSProperties} />
        Voir le sort : <b>{c.name}</b>
      </button>
    ) : (
      <span>Échiquier de démonstration</span>
    );
  } else if (hover) {
    captionBody = <span className="cap-go">{resume ? 'Reprendre la partie sur cet échiquier' : 'Jouer sur cet échiquier'} →</span>;
  } else if (castDef) {
    captionBody = (
      <>
        <span className="live-dot" style={{ '--h': castDef.hue } as CSSProperties} />
        <span className="cap-k">Sort en cours</span>
        <b>{castDef.name}</b>
        {placeDef.id === 'bazar' && <span className="cap-skin">skin {itemById(cast!.skin)?.name}</span>}
      </>
    );
  } else {
    captionBody = (
      <>
        <span className="live-dot idle" />
        <span className="cap-k">Démonstration en direct</span>
      </>
    );
  }

  const playLabel = resume ? 'Reprendre' : 'Jouer';

  return (
    <>
      <div className="intro" aria-hidden="true">
        <div className="intro-mark">
          <Mark size={64} />
        </div>
        <div className="intro-word">SPELLMATE</div>
      </div>
      <div className="falling-star" aria-hidden="true">
        <span className="fs-tail" />
        <span className="fs-head" />
      </div>
      <div className="impact" aria-hidden="true" />

      <div className="sky" aria-hidden="true">
        {PLACES.map((p, i) => (
          <div key={p.id} className={`sky-layer sky-${i}`} />
        ))}
      </div>

      <div className="world-shift">
        <div className="world" aria-hidden="true">
          {SCENES.map((Scene, i) => (
            <div key={i} className={`scene scene-${i}`} data-scene-layer={i} data-part="back">
              <Scene part="back" />
            </div>
          ))}
        </div>
      </div>

      <div
        className={`astre ${mode === 'game' ? 'is-game' : ''} ${mode === 'entering' || mode === 'leaving' ? 'is-flip' : ''} ${hasGame ? 'has-game' : ''} ${hover && mode === 'page' ? 'is-hover' : ''}`}
        ref={astreRef}
      >
        <div className="astre-inner">
          <div className="astre-glow" />
          <div className="astre-halo" />
          <div ref={orbitsRef} className="orbits-wrap">
            <OrbitRings />
            <div className="eq-wrap">
              {EQ.map((e, i) => (
                <EqRing key={i} part="back" {...e} />
              ))}
            </div>
          </div>
          <div className="astre-shadow" />
          <div className="astre-float">
            <div className="astre-board">
              {mode !== 'game' && (
                <StageBoard
                  key={placeDef.id}
                  act={act}
                  theme={stageTheme}
                  resetSignal={resetSignal}
                  paused={mode !== 'page' || transit}
                  tilt={castTilt}
                  still={reduced}
                  playSignal={playSignal}
                  onCast={onCast}
                  onCanvas={onCanvas}
                />
              )}
            </div>
          </div>
          <div className="astre-game" ref={gameSlotRef} />
          <div ref={frontRef} className="astro-front">
            <div className="astro-front-in">
              {EQ.map((e, i) => (
                <EqRing key={i} part="front" {...e} />
              ))}
            </div>
          </div>
          <button
            className="astre-hit"
            onClick={play}
            onPointerEnter={e => e.pointerType === 'mouse' && setHover(true)}
            onPointerLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            tabIndex={mode === 'page' ? 0 : -1}
            aria-label={resume ? 'Reprendre la partie sur cet échiquier' : 'Jouer sur cet échiquier'}
          />
        </div>
      </div>

      <div className="world-shift front-shift">
        <div className="world front" aria-hidden="true">
          {SCENES.map((Scene, i) => (
            <div key={i} className={`scene scene-${i}`} data-scene-layer={i} data-part="front">
              <Scene part="front" />
            </div>
          ))}
        </div>
      </div>

      {place > 0 && mode === 'page' && (
        <button className={`pip-play ${docked ? 'is-docked' : ''}`} onClick={play} aria-label={resume ? 'Reprendre la partie' : 'Jouer maintenant'}>
          <span>{playLabel}</span>
        </button>
      )}

      <div className={`astre-caption ${reduced ? 'is-still' : ''} ${hover ? 'is-go' : ''}`} ref={captionRef} aria-live="off">
        {captionBody}
      </div>

      <header className="top chrome" ref={headerRef}>
        <div className="top-in">
          <a className="brand" href="#observatoire" onClick={e => (e.preventDefault(), scrollTo('#observatoire'))}>
            <Mark />
            <span>SPELLMATE</span>
          </a>
          <nav className="nav" aria-label="Lieux">
            <button onClick={() => scrollTo('#foret')}>Le principe</button>
            <button onClick={() => scrollTo('#pics')}>Les pouvoirs</button>
            <button onClick={() => scrollTo('#bazar')}>Le Bazar</button>
            <button onClick={() => scrollTo('#seuil')}>Les modes</button>
          </nav>
          <div className="top-right">
            <button className="link-quiet" onClick={() => setPreview({ kind: 'login' })}>
              Se connecter
            </button>
            <button className="btn-top" onClick={play}>
              <span className="btn-top-dot" />
              {playLabel}
            </button>
          </div>
        </div>
      </header>

      <aside className="altimeter chrome" ref={altRootRef} aria-label="Progression de la descente">
        <div className="alt-read">
          <span className="alt-label">Altitude</span>
          <span className="alt-val">
            <span ref={altRef}>9 120</span> m
          </span>
          <span className="alt-place">{PLACES[place].name}</span>
        </div>
        <ol className="alt-track">
          <span className="alt-fill" />
          {PLACES.map((p, i) => (
            <li key={p.id} className={place === i ? 'on' : place > i ? 'past' : ''}>
              <button onClick={() => scrollTo(`#${IDS[i]}`)} aria-label={p.name}>
                <span className="alt-num">{p.num}</span>
                <span className="alt-name">{p.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <main className="content">
        {/* I. L'Observatoire */}
        <section className="place hero" id="observatoire" data-pose="hero" data-scene="0" data-place="0">
          <div className="hero-copy">
            <Kicker num="I" name="L'Observatoire" />
            <Lines as="h1" className="display" lines={['Les échecs', 'ont appris', <em key="m">la magie.</em>]} />
            <p className="lede rv" style={{ '--i': 3 } as CSSProperties}>
              Une vraie partie d'échecs, trois cartes de pouvoir, un sort par tour. Gèle une dame, foudroie un pion, efface le dernier coup de ton rival.
            </p>
            <div className="cta-row rv" style={{ '--i': 4 } as CSSProperties}>
              <button className="btn-gold" onClick={play}>
                <span className="btn-shine" />
                <span className="btn-main">{resume ? 'Reprendre la partie' : 'Jouer maintenant'}</span>
                <span className="btn-sub">{resume ? `Coup ${moveNo} · en pause` : 'Anonyme · sans compte'}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="btn-arrow">
                  <path d="M5 12 H19 M13 6 L19 12 L13 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="btn-line" onClick={() => scrollTo('#foret')}>
                Commencer la descente
              </button>
            </div>
            <ul className="facts rv" style={{ '--i': 5 } as CSSProperties}>
              <li>Gratuit</li>
              <li>Dans le navigateur</li>
              <li>Zéro pay-to-win</li>
            </ul>
          </div>
          <div className="scroll-cue rv" style={{ '--i': 6 } as CSSProperties}>
            <span className="cue-line" />
            Défiler pour descendre
          </div>
        </section>

        {/* II. La Forêt de givre */}
        <section className="place side-left" id="foret" data-pose="foret" data-scene="1" data-place="1">
          <div className="col" data-col>
            <header className="place-head veil" data-chapter="principe">
              <Kicker num="II" name="La Forêt de givre" alt={PLACES[1].alt} />
              <Lines className="h2" lines={["Une partie d'échecs.", <><em>Trois sorts</em> en main.</>]} />
              <ol className="principle">
                {PRINCIPLE.map((p, i) => (
                  <li key={p.n} className="rv" style={{ '--i': i } as CSSProperties}>
                    <span className="pr-n">{p.n}</span>
                    <div>
                      <h3>{p.title}</h3>
                      <p>{p.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Slot />
            </header>
            <div className="interlude veil">
              <Lines as="h3" className="h3" lines={[PLACE_COPY.foret.title[0], <em key="e">{PLACE_COPY.foret.title[1]}</em>]} />
              <p className="rv">{PLACE_COPY.foret.text}</p>
            </div>
            {PLACE_CARDS.foret!.map(id => (
              <Chapter key={id} id={id} active={chapter === id} />
            ))}
          </div>
        </section>

        {/* III. Les Pics de l'orage */}
        <section className="place side-right" id="pics" data-pose="pics" data-scene="2" data-place="2">
          <div className="col" data-col>
            <header className="place-head veil">
              <Kicker num="III" name="Les Pics de l'orage" alt={PLACES[2].alt} />
              <Lines className="h2" lines={[PLACE_COPY.pics.title[0], <em key="e">{PLACE_COPY.pics.title[1]}</em>]} />
              <p className="rv place-text">{PLACE_COPY.pics.text}</p>
            </header>
            {PLACE_CARDS.pics!.map(id => (
              <Chapter key={id} id={id} active={chapter === id} />
            ))}
          </div>
        </section>

        {/* IV. Le Sablier */}
        <section className="place side-left" id="sablier" data-pose="sablier" data-scene="3" data-place="3">
          <div className="col" data-col>
            <header className="place-head veil">
              <Kicker num="IV" name="Le Sablier" alt={PLACES[3].alt} />
              <Lines className="h2" lines={[PLACE_COPY.sablier.title[0], <em key="e">{PLACE_COPY.sablier.title[1]}</em>]} />
              <p className="rv place-text">{PLACE_COPY.sablier.text}</p>
            </header>
            {PLACE_CARDS.sablier!.map(id => (
              <Chapter key={id} id={id} active={chapter === id} />
            ))}
          </div>
        </section>

        {/* V. Le Bazar céleste */}
        <section className="place bazar" id="bazar" data-pose="bazar" data-scene="4" data-place="4">
          <div className="sticky">
            <div className="bazar-col veil" data-col>
              <header className="place-head">
                <div className="seal rv" aria-label="Zéro pay-to-win">
                  <svg viewBox="0 0 200 200" className="seal-text">
                    <defs>
                      <path id="seal-c" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" />
                    </defs>
                    <text fontFamily="Cinzel" fontSize="13.2" letterSpacing="5.2" fill="#f3c969">
                      <textPath href="#seal-c">ZÉRO PAY-TO-WIN · STYLE UNIQUEMENT · </textPath>
                    </text>
                  </svg>
                  <div className="seal-core">
                    <Mark size={34} />
                  </div>
                </div>
                <Kicker num="V" name="Le Bazar céleste" alt={PLACES[4].alt} />
                <Lines className="h2" lines={['Du style.', <em key="e">Jamais d'avantage.</em>]} />
                <p className="rv place-text">
                  La boutique ne vend que de l'apparence : des skins d'animation pour tes sorts et des plateaux. Toutes les cartes, tous les modes et le classement restent gratuits.
                </p>
              </header>
              <Slot label="Essaie un skin : l'échiquier le lance" />
              <div className="shelf rv">
                <div className="shelf-head">
                  <span>Skins d'animation</span>
                  <small>Allume une lanterne : l'échiquier lance un sort avec ce skin</small>
                </div>
                <div className="lanterns">
                  {skins.map((s, i) => (
                    <button
                      key={s.id}
                      className={`lantern ${skin === s.id ? 'on' : ''}`}
                      style={{ '--p': s.skin!.primary, '--s': s.skin!.secondary, '--a': s.skin!.accent, '--i': i } as CSSProperties}
                      onClick={() => {
                        setSkin(s.id);
                        setPicked(true);
                        setPulse(n => n + 1);
                      }}
                      aria-pressed={skin === s.id}
                    >
                      <span className="lantern-cord" />
                      <span className="lantern-body">
                        <span className="lantern-orb" />
                      </span>
                      <span className="lantern-name">{s.name}</span>
                      <span className="lantern-price">{PRICES[s.id]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="shelf rv">
                <div className="shelf-head">
                  <span>Plateaux</span>
                  <small>
                    {itemById(boardTheme)?.name} · {PRICES[boardTheme]}
                  </small>
                </div>
                <div className="stall">
                  <div className="swatches">
                    {boards.map(b => (
                      <button
                        key={b.id}
                        className={`swatch ${boardTheme === b.id ? 'on' : ''}`}
                        style={{ '--l': b.board!.light, '--d': b.board!.dark, '--f': b.board!.frame } as CSSProperties}
                        onClick={() => {
                          setBoardTheme(b.id);
                          setPicked(true);
                        }}
                        aria-label={`${b.name}, ${PRICES[b.id]}`}
                        aria-pressed={boardTheme === b.id}
                      >
                        <span className="swatch-tile">
                          <span className="swatch-grid" />
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className="stall-shelf" />
                </div>
              </div>
              <div className="packs rv">
                <div className="pack">
                  <b>Collection légendaire</b>
                  <span>Les 5 skins premium</span>
                  <em>
                    9,99 € <s>16,95 €</s>
                  </em>
                </div>
                <div className="pack">
                  <b>Grimoire complet</b>
                  <span>Tous les skins et plateaux</span>
                  <em>
                    12,99 € <s>24,91 €</s>
                  </em>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* VI. Le Seuil */}
        <section className="place seuil" id="seuil" data-pose="seuil" data-scene="5" data-place="5">
          <div className="sticky seuil-grid">
            <div className="seuil-left veil">
              <Kicker num="VI" name="Le Seuil" alt={0} />
              <Lines className="h2" lines={["La descente s'achève.", <em key="e">La partie commence.</em>]} />
              <p className="rv place-text">Une partie dure de 5 à 20 minutes. La première commence maintenant, sans inscription.</p>
              <div className="rv">
                <button className="btn-gold" onClick={play}>
                  <span className="btn-shine" />
                  <span className="btn-main">{resume ? 'Reprendre la partie' : 'Franchir le seuil'}</span>
                  <span className="btn-sub">{resume ? `Coup ${moveNo} · en pause` : 'Partie immédiate'}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="btn-arrow">
                    <path d="M5 12 H19 M13 6 L19 12 L13 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <Slot />
            </div>
            <div className="seuil-right veil">
              <p className="doors-label rv">Trois portes</p>
              {MODES.map((m, i) => (
                <button
                  key={m.key}
                  className="door rv"
                  style={{ '--i': i } as CSSProperties}
                  onClick={() => setPreview({ kind: m.key === 'ami' ? 'friend' : m.key === 'ia' ? 'ai' : 'ranked' })}
                >
                  <span className="door-n">{['I', 'II', 'III'][i]}</span>
                  <span className="door-body">
                    <span className="door-title">
                      {m.title} <span className="tag">{m.tag}</span>
                    </span>
                    <span className="door-text">{m.text}</span>
                  </span>
                  <span className="door-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <footer className="foot">
          <div className="foot-top">
            <div className="foot-brand">
              <a className="brand" href="#observatoire" onClick={e => (e.preventDefault(), scrollTo('#observatoire'))}>
                <Mark />
                <span>SPELLMATE</span>
              </a>
              <p>Les échecs que tu aimes, avec trois cartes de pouvoir pour renverser la partie. Gratuit, sans publicité, sans pay-to-win.</p>
            </div>
            <nav className="foot-links" aria-label="Pied de page">
              <div>
                <h4>Jouer</h4>
                <button onClick={play}>Partie immédiate</button>
                <button onClick={() => setPreview({ kind: 'ai' })}>Contre l'IA</button>
                <button onClick={() => setPreview({ kind: 'friend' })}>Inviter un ami</button>
                <button onClick={() => setPreview({ kind: 'ranked' })}>Classement</button>
              </div>
              <div>
                <h4>Découvrir</h4>
                <button onClick={() => scrollTo('#foret')}>Règles et cartes</button>
                <button onClick={() => scrollTo('#bazar')}>Boutique</button>
                <button onClick={() => setPreview({ kind: 'login' })}>Créer un compte</button>
              </div>
              <div>
                <h4>Légal</h4>
                <button onClick={() => setPreview({ kind: 'legal', key: 'mentions' })}>Mentions légales</button>
                <button onClick={() => setPreview({ kind: 'legal', key: 'cgu' })}>Conditions d'utilisation</button>
                <button onClick={() => setPreview({ kind: 'legal', key: 'cgv' })}>Conditions de vente</button>
                <button onClick={() => setPreview({ kind: 'legal', key: 'confidentialite' })}>Confidentialité</button>
              </div>
            </nav>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Spellmate. Tous droits réservés.</span>
            <span>Altitude 0 m · fin de la descente</span>
          </div>
        </footer>
      </main>

      {/* Mode jeu : le décor glisse vers la gauche, un rideau d'or traverse l'écran, l'arène garde l'atmosphère du lieu */}
      <div className={`curtain-veil ${mode === 'page' ? 'is-off' : ''}`} aria-hidden="true" />
      <div className={`curtain ${mode === 'page' ? 'is-off' : ''}`} aria-hidden={mode === 'page'}>
        <span className="curtain-edge">
          <span className="ce-glow" />
          <span className="ce-core" />
        </span>
        <div className="arena-glow" />
        <div className="arena-stars" />
      </div>
      {hasGame && (
        <GameMode
          slot={gameSlot}
          theme={gameTheme}
          skin={gameSkin}
          skinName={itemById(gameSkin)?.name ?? 'Arcane'}
          level={level}
          active={mode === 'game'}
          onExit={leave}
          onProgress={onProgress}
        />
      )}
      {preview && <PreviewSheet preview={preview} onClose={() => setPreview(null)} onPlay={play} level={level} setLevel={setLevel} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
