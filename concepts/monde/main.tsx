// Spellmate · Le Monde-Échiquier : le site est un plateau. Le défilement fait avancer la caméra de la rangée 1
// à la rangée 8 ; chaque lieu est un monument posé sur une région du sol, et son texte n'apparaît que lorsque la
// caméra y est arrêtée. « Jouer » plonge la caméra sur le plateau, qui devient le vrai échiquier jouable.
import '@fontsource-variable/unbounded';
import '@fontsource-variable/bricolage-grotesque';
import '../../src/client/styles/cards.css';
import '../../src/client/styles/board.css';
import './monde.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { DemoBoard } from '../../src/client/components/DemoBoard';
import { CARDS, RARITY_LABEL } from '../../src/shared/cards';
import { itemById } from '../../src/shared/catalog';
import { playSound } from '../../src/client/sound';
import { AVENUE, BOARD_THEMES, HAND, LEGAL, LEVELS, LIEUX, LIEU_HEIGHT, SKIN_PORTALS, STEPS } from './data';
import type { LevelId } from './data';
import { gameCam, gameRect, introCam, isMobile } from './engine';
import { GameMode } from './game';
import type { Flight, Phase } from './game';
import { Scene } from './scene';
import { Sky, World } from './world';

type Mode = 'page' | Phase;

const HAND_FAN = [-9, 0, 9];
const LIT_DEFAULT = { light: '#c3baf0', dark: '#4e3eb4' };

// Pas de « rattrapage » de GSAP : sur un appareil lent, l'animation saute des images au lieu de ralentir
gsap.ticker.lagSmoothing(0);

function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="mark">
      <defs>
        <linearGradient id="mk-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7ff3ff" />
          <stop offset="0.5" stopColor="#b48bff" />
          <stop offset="1" stopColor="#ff4fb8" />
        </linearGradient>
      </defs>
      <path d="M32 3l6.5 22.5L61 32l-22.5 6.5L32 61l-6.5-22.5L3 32l22.5-6.5z" fill="url(#mk-g)" />
      <path d="M32 18l2.8 11.2L46 32l-11.2 2.8L32 46l-2.8-11.2L18 32l11.2-2.8z" fill="#07061a" opacity="0.85" />
    </svg>
  );
}

function SoundGlyph({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="snd-glyph">
      <path d="M4 9.5 H8 L13 5.5 V18.5 L8 14.5 H4 Z" />
      {on ? <path className="w" d="M16.5 9 a4.5 4.5 0 0 1 0 6 M19 6.5 a8 8 0 0 1 0 11" /> : <path className="w" d="M17 9.5 L21.5 14.5 M21.5 9.5 L17 14.5" />}
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="play-glyph">
      <path d="M8 5.5 L19 12 L8 18.5 Z" />
    </svg>
  );
}

/** Titre découpé en lignes masquées (révélation ligne par ligne). */
function Lines({ lines, as = 'h2', className = '' }: { lines: ReactNode[]; as?: 'h1' | 'h2'; className?: string }) {
  const Tag = as;
  return (
    <Tag className={`lines ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className="ln" style={{ '--i': i } as CSSProperties}>
          <span>{l}</span>
        </span>
      ))}
    </Tag>
  );
}

function Codex({ subscribe }: { subscribe: (cb: (k: number) => void) => void }) {
  const [k, setK] = useState(0);
  useEffect(() => subscribe(setK), [subscribe]);
  const id = AVENUE[k];
  const c = CARDS[id];
  return (
    <div className="codex r" style={{ '--h': c.hue, '--i': 3 } as CSSProperties}>
      <div className="codex-top">
        <span className="codex-n"><b>{String(k + 1).padStart(2, '0')}</b> / 11</span>
        <span className="codex-rar">{RARITY_LABEL[c.rarity]} · {c.duration}</span>
      </div>
      <div key={id} className="codex-swap">
        <strong className="codex-name">{c.name}</strong>
        <em className="codex-tag">{c.tagline}</em>
        <p className="codex-rule">{c.description}</p>
      </div>
      <div className="codex-bar">
        {AVENUE.map((cid, i) => <i key={cid} className={i === k ? 'on' : i < k ? 'past' : ''} />)}
      </div>
    </div>
  );
}

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const focusCb = useRef<((k: number) => void) | null>(null);
  const itemsRef = useRef<Element[]>([]);
  const [mode, setMode] = useState<Mode>('page');
  const [lieu, setLieu] = useState(0);
  const [skin, setSkin] = useState('skin:inferno');
  const [theme, setTheme] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelId>('sorcier');
  const [toast, setToast] = useState<string | null>(null);
  const [forgeLive, setForgeLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [mobile, setMobile] = useState(() => isMobile(window.innerWidth));
  const [flight, setFlight] = useState<Flight | null>(null);
  const [boardHidden, setBoardHidden] = useState(false);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = sound;
  const busy = useRef(false);
  const diveRef = useRef<gsap.core.Timeline | null>(null);
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches).current;

  const subscribeFocus = useCallback((cb: (k: number) => void) => {
    focusCb.current = cb;
  }, []);

  useEffect(() => {
    const root = rootRef.current!;
    const scene = new Scene(root);
    sceneRef.current = scene;
    // Outils de capture, seulement en développement
    if (import.meta.env.DEV) (window as unknown as { __monde: unknown }).__monde = scene;
    scene.onFocus = k => focusCb.current?.(k);
    scene.onLieu = i => {
      setLieu(i);
      // Un son discret à chaque arrêt de la caméra (si le visiteur l'a activé)
      if (i >= 0 && soundRef.current) playSound('low');
    };

    // Ouverture : la caméra descend du ciel jusqu'au Seuil
    const params = new URLSearchParams(location.search);
    let readyT = 0;
    if (scene.reduced || (import.meta.env.DEV && params.has('nointro'))) {
      scene.driver = 'scroll';
      setReady(true);
    } else {
      scene.driver = 'tween';
      Object.assign(scene.tcam, introCam(scene.W));
      const target = scene.scrollCam();
      const tw = gsap.to(scene.tcam, {
        ...target,
        duration: 2.8,
        ease: 'power3.inOut',
        onComplete: () => {
          scene.driver = 'scroll';
          scene.markDirty();
        },
      });
      const speed = () => tw.timeScale(5);
      window.addEventListener('wheel', speed, { once: true, passive: true });
      window.addEventListener('touchstart', speed, { once: true, passive: true });
      readyT = window.setTimeout(() => setReady(true), 900);
    }
    const t = setTimeout(() => scene.measure(), 600);
    const onResize = () => setMobile(isMobile(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      clearTimeout(readyT);
      window.removeEventListener('resize', onResize);
      scene.destroy();
    };
  }, []);

  // L'allée change de disposition entre bureau et mobile : la scène relit ses monuments
  useEffect(() => {
    sceneRef.current?.scan();
  }, [mobile]);

  // Couleurs du sol « allumé » = couleurs de l'échiquier de jeu (le plateau choisi dans la Forge, sinon le néon)
  useEffect(() => {
    const root = rootRef.current!;
    const bs = theme ? itemById(theme)?.board : null;
    root.style.setProperty('--gl', bs?.light ?? LIT_DEFAULT.light);
    root.style.setProperty('--gd', bs?.dark ?? LIT_DEFAULT.dark);
    const floor = root.querySelector<HTMLElement>('.floor');
    if (!floor) return;
    if (bs) {
      floor.style.setProperty('--tl', bs.light);
      floor.style.setProperty('--td', bs.dark);
    }
    floor.style.setProperty('--tho', bs && lieu === 3 && mode === 'page' ? '0.94' : '0');
  }, [theme, lieu, mode]);

  // L'aperçu WebGL de la Forge n'existe que lorsque le lieu est à l'écran
  useEffect(() => {
    setForgeLive(lieu === 3 && mode === 'page');
  }, [lieu, mode]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(cur => (cur === msg ? null : cur)), 2600);
  }, []);

  const play = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || busy.current || mode !== 'page') return;
    busy.current = true;
    const root = rootRef.current!;
    const { W, H, P } = scene;
    const rect = gameRect(W, H);
    const end = gameCam(W, H, P, rect);
    const mid = gameCam(W, H, P, rect, 1.5);

    // Les cartes de la main, là où elles sont dans le monde : elles voleront jusqu'au HUD
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.hand-card'));
    const fl: Flight = {
      ids: HAND,
      rects: cards.map((c, i) => {
        const mon = c.closest<HTMLElement>('.mon');
        const op = mon ? parseFloat(mon.style.opacity || '1') : 0;
        const r = c.getBoundingClientRect();
        const onScreen = r.right > 20 && r.left < W - 20 && r.bottom > 20 && r.top < H - 20;
        return mon && mon.style.visibility !== 'hidden' && op > 0.35 && onScreen ? { x: r.left, y: r.top, w: r.width, h: r.height, rot: HAND_FAN[i] } : null;
      }),
    };

    scene.lock(true);
    Object.assign(scene.tcam, scene.driver === 'scroll' ? scene.scrollCam() : { ...scene.tcam });
    gsap.killTweensOf(scene.tcam);
    scene.driver = 'tween';
    root.classList.add('flying');
    document.documentElement.classList.remove('vfx-off');
    setFlight(fl);
    setMode('enter');
    const items = Array.from(root.querySelectorAll('.lieu.on .panel .ln > span, .lieu.on .panel .r'));
    itemsRef.current = items;
    if (scene.reduced) {
      Object.assign(scene.tcam, end);
      Object.assign(scene, { worldFade: 0, sink: 0, lit: 1, floorDim: 0.36 });
      gsap.set(items, { opacity: 0 });
      scene.inGame = true;
      scene.markDirty();
      setMode('game');
      setBoardHidden(true);
      busy.current = false;
      return;
    }
    const tl = gsap.timeline({ onUpdate: scene.markDirty });
    diveRef.current = tl;
    // 1. Le titre et les textes sont poussés vers la gauche par le jeu qui s'étend
    tl.to(items, { x: -W * 0.62, duration: 0.7, ease: 'power3.in', stagger: 0.018 }, 0);
    tl.to(items, { opacity: 0, duration: 0.42, ease: 'power2.in', stagger: 0.018 }, 0.04);
    // 2. Les monuments s'enfoncent dans le sol avant que la caméra ne bascule
    tl.to(scene, { worldFade: 0, sink: 0, duration: 0.38, ease: 'power2.in' }, 0);
    tl.to(scene.tcam, { x: mid.x, z: mid.z, h: mid.h, duration: 0.85, ease: 'power2.inOut' }, 0.1);
    tl.to(scene.tcam, { pitch: 90, yaw: 0, duration: 0.85, ease: 'power2.inOut' }, 0.1);
    // 3. Le sol prend les couleurs du jeu, le monde s'atténue sans disparaître
    tl.to(scene, { lit: 1, duration: 0.6, ease: 'power1.inOut' }, 0.55);
    tl.to(scene, { floorDim: 0.36, duration: 0.9, ease: 'power1.inOut' }, 0.5);
    // 4. Plongée : les 64 cases du sol se posent exactement sur l'échiquier jouable
    tl.to(scene.tcam, { x: end.x, z: end.z, h: end.h, duration: 0.55, ease: 'expo.inOut' }, 0.95);
    tl.add(() => {
      scene.inGame = true;
      setMode('game');
      if (soundRef.current) playSound('start');
    }, 1.42);
    tl.add(() => {
      busy.current = false;
    }, 1.6);
    tl.add(() => setBoardHidden(true), 2.05);
    tl.add(() => {
      diveRef.current = null;
    }, 2.1);
    if (import.meta.env.DEV) {
      // Outil de capture : ?hold fige la plongée dès le départ (window.__dive.seek(t) pour la parcourir)
      (window as unknown as { __dive: gsap.core.Timeline }).__dive = tl;
      if (new URLSearchParams(location.search).has('hold')) tl.pause();
    }
  }, [mode]);

  const leave = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || busy.current || mode !== 'game') return;
    busy.current = true;
    const root = rootRef.current!;
    const { W, H, P } = scene;
    const mid = gameCam(W, H, P, gameRect(W, H), 1.5);
    const back = scene.scrollCam();
    const items = itemsRef.current;
    setBoardHidden(false);
    scene.inGame = false;
    // Les effets 3D persistants du plateau (glace, boucliers…) ne doivent pas rester peints sur le monde
    document.documentElement.classList.add('vfx-off');
    setMode('leave');
    const done = () => {
      scene.driver = 'scroll';
      scene.lock(false);
      root.classList.remove('flying');
      setMode('page');
      setFlight(null);
      busy.current = false;
      scene.markDirty();
    };
    if (scene.reduced) {
      Object.assign(scene, { worldFade: 1, sink: 1, lit: 0, floorDim: 1 });
      gsap.set(items, { clearProps: 'all' });
      done();
      return;
    }
    const tl = gsap.timeline({ onUpdate: scene.markDirty, delay: 0.3, onComplete: done });
    tl.to(scene.tcam, { x: mid.x, z: mid.z, h: mid.h, duration: 0.6, ease: 'power2.inOut' }, 0);
    tl.to(scene, { lit: 0, duration: 0.5 }, 0.1);
    tl.to(scene, { floorDim: 1, duration: 0.8 }, 0.3);
    tl.to(scene.tcam, { ...back, duration: 1.1, ease: 'power3.inOut' }, 0.55);
    tl.add(() => root.classList.remove('flying'), 0.9);
    tl.to(scene, { worldFade: 1, sink: 1, duration: 0.8, ease: 'power2.out' }, 0.9);
    tl.to(items, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.025, clearProps: 'transform,opacity' }, 1.2);
  }, [mode]);

  const goTo = useCallback((i: number) => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.scrollTo(scene.stationY(i));
  }, []);

  // Rappels stables pour le monde (mémorisé) : ils lisent toujours la dernière version de play()
  const playRef = useRef(play);
  playRef.current = play;
  const onMode = useCallback((id: string) => {
    if (id === 'ia') playRef.current();
    else if (id === 'ami') {
      const link = `https://spellmate.fr/i/${Math.random().toString(36).slice(2, 8)}`;
      void navigator.clipboard?.writeText(link).catch(() => undefined);
      flash(`Lien copié : ${link.replace('https://', '')}`);
    } else flash('Le classé demande un pseudo : 20 secondes, et la file s’ouvre.');
  }, [flash]);
  const onLevel = useCallback((id: string) => setLevel(id as LevelId), []);
  const onTimeline = useCallback((t: gsap.core.Timeline) => {
    if (diveRef.current) diveRef.current.add(t, 0);
  }, []);

  const h = (id: keyof typeof LIEU_HEIGHT) => ({ height: `calc(var(--vh, 1vh) * ${LIEU_HEIGHT[id] * 100})` });
  const skinItem = itemById(skin)!;
  const skinPrice = SKIN_PORTALS.find(p => p.id === skin)!.price;
  const lv = LEVELS.find(l => l.id === level)!;

  return (
    <div ref={rootRef} className={`monde mode-${mode}${ready ? ' ready' : ''}${mode !== 'page' ? ' diving' : ''}${boardHidden ? ' board-hidden' : ''}`}>
      <Sky />
      <World onMode={onMode} mobile={mobile} skin={skin} onSkin={setSkin} level={level} onLevel={onLevel} />
      <div className="fog" aria-hidden="true" />
      <div className="veils" aria-hidden="true">
        {LIEUX.map(l => <div key={l.id} className={`veil v-${l.id}`} />)}
      </div>
      <div className="vignette" aria-hidden="true" />

      <header className="hud-top">
        <a className="brand" href="#seuil" onClick={e => { e.preventDefault(); goTo(0); }}>
          <Mark />
          <span>SPELLMATE</span>
        </a>
        <div className="hud-loc" aria-live="polite">
          <span id="hudRank">Rangée 1</span>
          <i />
          <span id="hudName">Le Seuil</span>
          <span id="hudShort">R1 · Seuil</span>
        </div>
        <div className="hud-right">
          <button
            className={`btn-snd ${sound ? 'on' : ''}`}
            aria-pressed={sound}
            aria-label={sound ? 'Couper le son du monde' : 'Activer le son du monde'}
            title={sound ? 'Son activé' : 'Son coupé'}
            onClick={() => {
              setSound(v => !v);
              if (!sound) playSound('select');
            }}
          >
            <SoundGlyph on={sound} />
          </button>
          <button className="btn-mini" onClick={play}>
            <PlayGlyph />
            Jouer
          </button>
        </div>
      </header>

      <main className="lieux">
        <section className="lieu l-seuil" id="seuil" style={h('seuil')}>
          <div className="panel">
            <div className="seuil-copy">
              <p className="eyebrow r" style={{ '--i': 0 } as CSSProperties}><span className="dot" />Échecs × cartes de pouvoir</p>
              <Lines as="h1" className="display" lines={['Les échecs', 'ont des', <span className="grad" key="g">pouvoirs.</span>]} />
            </div>
            <div className="seuil-act">
              <p className="lead r" style={{ '--i': 4 } as CSSProperties}>
                Trois cartes en main, une par tour, à lancer avant ton coup. Gel, foudre, retour arrière&nbsp;: la partie
                ne se joue plus seulement sur l’échiquier.
              </p>
              <div className="cta-row r" style={{ '--i': 5 } as CSSProperties}>
                <button className="btn-play" onClick={play}>
                  <span className="btn-play-in">
                    <PlayGlyph />
                    Jouer maintenant
                  </span>
                </button>
                <span className="cta-note">Anonyme, sans compte, gratuit.<br />La partie démarre ici même.</span>
              </div>
            </div>
            <div className="seuil-foot r" style={{ '--i': 6 } as CSSProperties}>
              <div className="seuil-meta">
                <span><b>11</b> pouvoirs</span>
                <span><b>3</b> niveaux d’IA</span>
                <span><b>0</b> pay-to-win</span>
              </div>
              <button className="scroll-cue" onClick={() => goTo(1)}>
                <i />
                <span>Traverser le plateau</span>
              </button>
            </div>
          </div>
        </section>

        <section className="lieu l-regle" id="regle" style={h('regle')}>
          <div className="panel">
            <div className="col col-right">
              <p className="eyebrow r" style={{ '--i': 0 } as CSSProperties}><span className="dot" />Rangée 3 · La Règle</p>
              <Lines lines={['Les échecs.', 'Plus trois cartes.']} />
              <ol className="steps">
                {STEPS.map((st, i) => (
                  <li key={st.n} className="r" style={{ '--i': i + 3 } as CSSProperties}>
                    <span className="step-n">{st.n}</span>
                    <div>
                      <strong>{st.title}</strong>
                      <p>{st.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="fine r" style={{ '--i': 6 } as CSSProperties}>Toutes les règles des échecs s’appliquent. Les cartes les tordent, elles ne les remplacent pas.</p>
            </div>
          </div>
        </section>

        <section className="lieu l-allee" id="allee" style={h('allee')}>
          <div className="panel">
            <div className="allee-head">
              <p className="eyebrow r" style={{ '--i': 0 } as CSSProperties}><span className="dot" />Rangées 4 et 5 · L’Allée des pouvoirs</p>
              <Lines lines={['Onze pouvoirs.', 'Un seul par tour.']} />
              <p className="allee-note r" style={{ '--i': 3 } as CSSProperties}>Communes, rares, épiques, légendaires&nbsp;: <b>toutes</b> les cartes sont à tout le monde, dès la première partie.</p>
            </div>
            <Codex subscribe={subscribeFocus} />
          </div>
        </section>

        <section className="lieu l-forge" id="forge" style={h('forge')}>
          <div className="panel">
            <div className="col col-left">
              <p className="eyebrow r" style={{ '--i': 0 } as CSSProperties}><span className="dot" />Rangée 6 · La Forge</p>
              <Lines lines={['Change de style.', 'Jamais de règles.']} />
              <p className="body r" style={{ '--i': 3 } as CSSProperties}>
                Les skins réinventent l’animation de chaque sort, les plateaux habillent l’échiquier. Rien ne s’achète qui
                fasse gagner.
              </p>
              <div className="forge-row r" style={{ '--i': 4 } as CSSProperties}>
                <div className="forge-preview">
                  {forgeLive ? <DemoBoard key={`${skin}${theme}`} mode="preview" skin={skin} theme={theme ?? 'board:obsidian'} /> : <div className="forge-ph" />}
                </div>
                <div className="forge-pick" style={{ '--p': skinItem.skin!.primary, '--q': skinItem.skin!.secondary } as CSSProperties}>
                  <span className="forge-live"><i />Aperçu en direct</span>
                  <strong className="forge-skin"><i />{skinItem.name}<em>{skinPrice}</em></strong>
                  <p>{skinItem.description}</p>
                  <div className="skin-dots" role="radiogroup" aria-label="Skins d’animation">
                    {SKIN_PORTALS.map(p => {
                      const it = itemById(p.id)!;
                      return (
                        <button
                          key={p.id}
                          role="radio"
                          aria-checked={skin === p.id}
                          aria-label={`${it.name}, ${p.price}`}
                          title={it.name}
                          className={skin === p.id ? 'on' : ''}
                          style={{ '--p': it.skin!.primary, '--q': it.skin!.secondary } as CSSProperties}
                          onClick={() => setSkin(p.id)}
                        />
                      );
                    })}
                  </div>
                  <span className="forge-hint">Touche un pilier de lumière pour changer de skin.</span>
                  <span className="forge-badge"><i />Zéro pay-to-win · cosmétique uniquement</span>
                </div>
              </div>
              <div className="theme-pick r" style={{ '--i': 5 } as CSSProperties}>
                <span className="pick-label">Plateau <em>{theme ? `${itemById(theme)!.name} · ${BOARD_THEMES.find(b => b.id === theme)!.price}` : 'le sol change, ta partie aussi'}</em></span>
                <div className="swatches" role="radiogroup" aria-label="Plateaux">
                  {BOARD_THEMES.map(b => {
                    const bs = itemById(b.id)!.board!;
                    return (
                      <button
                        key={b.id}
                        role="radio"
                        aria-checked={theme === b.id}
                        aria-label={itemById(b.id)!.name}
                        title={itemById(b.id)!.name}
                        className={`swatch ${theme === b.id ? 'on' : ''}`}
                        style={{ '--l': bs.light, '--d': bs.dark, '--fr': bs.frame } as CSSProperties}
                        onClick={() => setTheme(t => (t === b.id ? null : b.id))}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="seal r" style={{ '--i': 6 } as CSSProperties}>
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <defs>
                  <path id="seal-c" d="M100 100 m-82 0 a82 82 0 1 1 164 0 a82 82 0 1 1 -164 0" />
                </defs>
                <text><textPath href="#seal-c">ZÉRO PAY-TO-WIN · COSMÉTIQUE UNIQUEMENT · </textPath></text>
              </svg>
              <div className="seal-in">
                <b>0</b>
                <span>avantage<br />à vendre</span>
              </div>
            </div>
          </div>
        </section>

        <section className="lieu l-portes" id="portes" style={h('portes')}>
          <div className="panel">
            <div className="portes-head">
              <p className="eyebrow r" style={{ '--i': 0 } as CSSProperties}><span className="dot" />Rangée 7 · Les Trois Portes</p>
              <Lines lines={['Choisis ta porte.']} />
            </div>
            <p className="portes-note r" style={{ '--i': 5 } as CSSProperties}>Toutes mènent au même plateau, cartes comprises. IA choisie : <b>{lv.name}</b>.</p>
          </div>
        </section>

        <section className="lieu l-promotion" id="promotion" style={h('promotion')}>
          <div className="panel">
            <div className="promo-copy">
              <p className="eyebrow r" style={{ '--i': 0 } as CSSProperties}><span className="dot" />Rangée 8 · La Promotion</p>
              <Lines lines={['Ici, les pions', <span className="grad-gold" key="g">deviennent reines.</span>]} />
              <p className="lead r" style={{ '--i': 3 } as CSSProperties}>Ta première partie t’attend. Pas de compte, pas de téléchargement&nbsp;: un clic, et le plateau est à toi.</p>
              <div className="cta-row center r" style={{ '--i': 4 } as CSSProperties}>
                <button className="btn-play gold" onClick={play}>
                  <span className="btn-play-in">
                    <PlayGlyph />
                    Jouer maintenant
                  </span>
                </button>
                <button className="btn-ghost" onClick={() => onMode('ami')}>Inviter un ami</button>
              </div>
            </div>
          </div>
        </section>

        <footer className="foot">
          <div className="foot-in">
            <div className="foot-cta">
              <strong>La partie commence <span className="grad">à la rangée 1.</span></strong>
              <button className="btn-play" onClick={play}>
                <span className="btn-play-in">
                  <PlayGlyph />
                  Jouer maintenant
                </span>
              </button>
            </div>
            <div className="foot-brand">
              <Mark size={34} />
              <div>
                <strong>SPELLMATE</strong>
                <span>Les échecs ont des pouvoirs.</span>
              </div>
            </div>
            <nav className="foot-links" aria-label="Liens">
              {LEGAL.map(l => <a key={l} href="#" onClick={e => e.preventDefault()}>{l}</a>)}
            </nav>
            <div className="foot-base">
              <span>© 2026 Spellmate · Gratuit pour toujours · Aucun pay-to-win</span>
              <button className="foot-up" onClick={() => goTo(0)}>Retour à la rangée 1 ↑</button>
            </div>
          </div>
        </footer>
      </main>

      <nav className="rail" aria-label="Lieux du plateau">
        <div className="rail-track">
          {Array.from({ length: 8 }, (_, i) => 8 - i).map(r => {
            const l = LIEUX.findIndex(x => x.rank === r);
            return (
              <button
                key={r}
                className={`rail-r ${l >= 0 ? 'has' : ''} ${l === 0 ? 'cur' : ''}`}
                data-l={l}
                style={{ '--r': r } as CSSProperties}
                onClick={() => l >= 0 && goTo(l)}
                tabIndex={l >= 0 ? 0 : -1}
                aria-label={l >= 0 ? `Rangée ${r} : ${LIEUX[l].name}` : `Rangée ${r}`}
              >
                <b>{r}</b>
                {l >= 0 && <span>{LIEUX[l].short}</span>}
              </button>
            );
          })}
          <div className="rail-mark" />
        </div>
      </nav>

      {mode !== 'page' && <GameMode phase={mode} onExit={leave} level={level} theme={theme} skin={skin} flight={flight} reduced={reduced} onTimeline={onTimeline} />}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// Hauteur d'écran stable (barre d'adresse mobile)
const setVh = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight / 100}px`);
setVh();
let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth !== lastW) {
    lastW = window.innerWidth;
    setVh();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
