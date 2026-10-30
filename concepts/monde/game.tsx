// Mode jeu : l'échiquier du sol devient un vrai plateau jouable, les cartes volent du monde jusqu'au HUD de gauche.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import gsap from 'gsap';
import { Board } from '../../src/client/components/Board';
import { CardBack, SpellCard } from '../../src/client/components/SpellCard';
import { pieceUrl } from '../../src/client/components/pieces';
import { CARDS } from '../../src/shared/cards';
import { itemById } from '../../src/shared/catalog';
import type { CardId } from '../../src/shared/cards';
import { useLocalGame } from '../_shared/localGame';
import { LEVELS } from './data';
import type { LevelId } from './data';
import { gameRect, isMobile } from './engine';

export type Phase = 'enter' | 'game' | 'leave';

/** Cartes de la main vues dans le monde au moment de « Jouer » : point de départ de leur vol vers le HUD. */
export interface Flight {
  ids: CardId[];
  rects: ({ x: number; y: number; w: number; h: number; rot: number } | null)[];
}

const REASON: Record<string, string> = {
  checkmate: 'Échec et mat',
  stalemate: 'Pat',
  repetition: 'Nulle par répétition',
  fifty: 'Nulle, règle des 50 coups',
  insufficient: 'Nulle, matériel insuffisant',
  resign: 'Abandon',
  timeout: 'Temps écoulé',
  agreement: 'Nulle',
};

interface Props {
  phase: Phase;
  onExit: () => void;
  level: LevelId;
  theme: string | null;
  /** Skin d'animation choisi dans la Forge : il habille les sorts du joueur. */
  skin: string;
  flight: Flight | null;
  reduced: boolean;
  /** Rattache la chronologie d'entrée (panneau, vol des cartes) à celle de la plongée. */
  onTimeline?: (tl: gsap.core.Timeline) => void;
}

export function GameMode({ phase, onExit, level, theme, skin, flight, reduced, onTimeline }: Props) {
  const lv = LEVELS.find(l => l.id === level) ?? LEVELS[1];
  const g = useLocalGame({ skin, botSkin: skin === 'skin:void' ? 'skin:arcane' : 'skin:void', theme: theme ?? 'board:arcane', botCardChance: lv.chance });
  const [rect, setRect] = useState(() => gameRect(window.innerWidth, window.innerHeight));
  const [mobile, setMobile] = useState(() => isMobile(window.innerWidth));
  const [castMsg, setCastMsg] = useState<{ text: string; hue: number; key: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(reduced);

  useEffect(() => {
    const on = () => {
      setRect(gameRect(window.innerWidth, window.innerHeight));
      setMobile(isMobile(window.innerWidth));
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Entrée : le panneau arrive de la gauche, les trois cartes volent depuis le monde et se retournent
  useLayoutEffect(() => {
    if (reduced) return;
    const H = window.innerHeight;
    const tl = gsap.timeline();
    if (panelRef.current) tl.fromTo(panelRef.current, { xPercent: -100 }, { xPercent: 0, duration: 0.6, ease: 'power3.out' }, 0.75);
    flyRefs.current.forEach((el, i) => {
      if (!el) return;
      const last = el.getBoundingClientRect();
      const r = flight?.rects[i] ?? { x: -220 + i * 40, y: H + 60, w: last.width, h: last.height, rot: -24 };
      const slotRot = (+getComputedStyle(el.parentElement!).getPropertyValue('--rot').replace('deg', '') || 0) * (Math.PI / 180);
      const dx = r.x + r.w / 2 - (last.left + last.width / 2);
      const dy = r.y + r.h / 2 - (last.top + last.height / 2);
      // Déplacement exprimé dans le repère tourné de l'emplacement
      const lx = dx * Math.cos(-slotRot) - dy * Math.sin(-slotRot);
      const ly = dx * Math.sin(-slotRot) + dy * Math.cos(-slotRot);
      const sc = Math.max(0.3, r.w / Math.max(1, last.width));
      tl.fromTo(el, { x: lx, y: ly, scale: sc, rotation: r.rot - (slotRot * 180) / Math.PI, opacity: 1 }, {
        x: 0, y: 0, scale: 1, rotation: 0, duration: 1.2, ease: 'power3.inOut',
      }, 0.12 + i * 0.07);
      const flip = flipRefs.current[i];
      if (flip) tl.fromTo(flip, { rotationY: 0 }, { rotationY: 180, duration: 0.7, ease: 'power2.inOut' }, 0.45 + i * 0.07);
    });
    tl.add(() => setLanded(true));
    onTimeline?.(tl);
    return () => {
      tl.kill();
    };
    // Seulement au montage (phase « enter »)
  }, []);

  // Une fois posées, les cartes n'ont plus besoin de leur double face
  useLayoutEffect(() => {
    if (!landed) return;
    const flips = flipRefs.current.filter(Boolean);
    const flys = flyRefs.current.filter(Boolean);
    gsap.killTweensOf([...flips, ...flys]);
    gsap.set(flips, { clearProps: 'transform' });
    gsap.set(flys, { clearProps: 'transform,opacity' });
  }, [landed]);

  // Sortie : le panneau et les cartes repartent vers la gauche
  useEffect(() => {
    if (phase !== 'leave' || reduced) return;
    const tl = gsap.timeline();
    if (panelRef.current) tl.to(panelRef.current, { xPercent: -100, duration: 0.55, ease: 'power3.in' }, 0.05);
    tl.to(flyRefs.current.filter(Boolean), { x: -window.innerWidth * 0.45, rotation: -20, opacity: 0, duration: 0.55, ease: 'power3.in', stagger: 0.05 }, 0);
    return () => {
      tl.kill();
    };
  }, [phase, reduced]);

  useEffect(() => {
    if (!g.lastCast) return;
    const def = CARDS[g.lastCast.card as keyof typeof CARDS];
    setCastMsg({ text: g.lastCast.by === 'bot' ? `L’IA lance ${def.name}` : `Tu lances ${def.name}`, hue: def.hue, key: g.lastCast.key });
    const t = setTimeout(() => setCastMsg(null), 2600);
    return () => clearTimeout(t);
  }, [g.lastCast]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (g.selected !== null) g.cancel();
        else onExit();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [g, onExit]);

  const status = g.result
    ? REASON[g.result.reason] ?? 'Partie terminée'
    : g.selectedDef
      ? g.prompt
      : g.myTurn
        ? 'Lance une carte, ou joue ton coup.'
        : 'Ses cartes sont cachées. Méfie-toi.';
  const bot = g.state.hands.b;
  const capturedByMe = g.state.captured.b;
  const capturedByBot = g.state.captured.w;
  const won = g.result?.winner === 'w';
  let moveNo = 0;
  const journal = g.state.log.map((e, i) => {
    if (e.k === 'move') {
      if (e.c === 'w') moveNo++;
      return { key: i, side: e.c, n: e.c === 'w' ? `${moveNo}.` : '', text: `${e.san}${e.undone ? ' ↺' : ''}`, undone: !!e.undone };
    }
    const def = CARDS[e.card];
    return { key: i, side: e.c, n: e.c === 'w' ? 'Toi' : 'IA', text: def.name, hue: def.hue, undone: false };
  });
  const shown = journal.slice(mobile ? -8 : -24);
  const turnNo = Math.floor(g.state.ply / 2) + 1;

  // Le journal défile vers le dernier coup
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (mobile) el.scrollLeft = el.scrollWidth;
    else el.scrollTop = el.scrollHeight;
  }, [journal.length, mobile]);

  return (
    <div className={`game ph-${phase} ${mobile ? 'is-mobile' : ''} ${landed ? 'landed' : ''}`} style={{ '--by': `${rect.y + rect.size}px`, '--bx': `${rect.x}px`, '--bs': `${rect.size}px` } as CSSProperties}>
      <div ref={panelRef} className="gh-panel" aria-hidden="true">
        <div className="gh-watermark" style={{ '--src': pieceUrl('b', 'k') } as CSSProperties} />
      </div>

      <div className={`game-board ${theme ? 'themed' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.size, height: rect.size }}>
        <Board ref={g.boardRef} {...g.boardProps} />
      </div>

      <div className="gh-top">
        <button className="gh-back" onClick={onExit}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19" /></svg>
          <span>Retour au monde</span>
        </button>
        {mobile && phase === 'game' && <span className={`gh-turn ${g.myTurn ? 'me' : ''}`}>{g.myTurn ? 'À toi' : 'IA…'}</span>}
      </div>

      <aside className="gh" aria-label="Partie en cours">
        {!mobile && (
          <div className="gh-head gi" style={{ '--i': 0 } as CSSProperties}>
            <span className="gh-kicker">Partie libre · anonyme · skin {itemById(skin)?.name ?? 'Arcane'}</span>
            <strong>Toi <em>contre</em> l’IA {lv.name}</strong>
          </div>
        )}

        <div className="gh-opp gi" style={{ '--i': 1 } as CSSProperties}>
          <div className="gh-avatar" style={{ backgroundImage: pieceUrl('b', 'k') }} />
          <div className="gh-who">
            <span>IA {lv.name}</span>
            <small>{g.busy && !g.myTurn ? 'réfléchit…' : `Noirs · ${lv.elo}`}</small>
          </div>
          <div className="gh-backs" title="Cartes de l’IA">
            {bot.map((h, i) => <CardBack key={i} size="mini" used={h.used} />)}
          </div>
        </div>
        {!mobile && (
          <div className="gh-capt gi" style={{ '--i': 2 } as CSSProperties}>
            <span>Prises</span>
            <div>
              {capturedByMe.map((t, i) => <i key={`b${i}`} style={{ backgroundImage: pieceUrl('b', t) }} />)}
              {!capturedByMe.length && <em>aucune pour l’instant</em>}
            </div>
            {capturedByBot.length > 0 && (
              <div className="lost">
                {capturedByBot.map((t, i) => <i key={`w${i}`} style={{ backgroundImage: pieceUrl('w', t) }} />)}
              </div>
            )}
          </div>
        )}

        <div className="gh-hand">
          {g.hand.map((h, i) => h.card && (
            <div key={i} className={`gh-slot ${g.selected === i ? 'sel' : ''}`} style={{ '--i': i } as CSSProperties}>
              <div className="gh-fly" ref={el => { flyRefs.current[i] = el; }}>
                <div className="gh-flip" ref={el => { flipRefs.current[i] = el; }}>
                  {!landed && flight?.ids[i] && (
                    <div className="gh-face a" aria-hidden="true">
                      <SpellCard id={flight.ids[i]} size="hand" tilt={false} />
                    </div>
                  )}
                  <div className={`gh-face ${landed ? '' : 'b'}`}>
                    <div className="gh-bob" style={{ animationDelay: `${-i * 1.1}s` }}>
                      <SpellCard
                        id={h.card}
                        size="hand"
                        used={h.used}
                        selected={g.selected === i}
                        disabled={!h.used && !g.playable[i]}
                        onClick={() => g.pickCard(i)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={`gh-status gi ${g.selectedDef ? 'targeting' : ''} ${g.myTurn ? 'me' : 'bot'}`} style={{ '--i': 3, '--h': g.selectedDef?.hue ?? 190 } as CSSProperties}>
          <div className="gh-turnline">
            <i />
            <b>{g.result ? 'Partie terminée' : g.myTurn ? 'À toi de jouer' : 'L’IA réfléchit'}</b>
            <span>Coup {turnNo}</span>
          </div>
          {g.selectedDef && <span className="gh-cardname">{g.selectedDef.name}</span>}
          <p>{status}</p>
          {g.selectedDef && (
            <div className="gh-actions">
              {g.selectedDef.targets === 0 && <button className="gh-btn hot" onClick={g.castSelected}>Lancer la carte</button>}
              <button className="gh-btn" onClick={g.cancel}>Annuler</button>
            </div>
          )}
        </div>

        <div className="gh-logwrap gi" style={{ '--i': 4 } as CSSProperties}>
          {!mobile && <span className="gh-label">Journal</span>}
          <div ref={logRef} className="gh-log" aria-label="Journal de la partie" aria-live="polite">
            {shown.length ? shown.map(j => (
              <span
                key={j.key}
                className={`tok ${j.side} ${j.hue !== undefined ? 'card' : ''} ${j.undone ? 'undone' : ''}`}
                style={j.hue !== undefined ? ({ '--h': j.hue } as CSSProperties) : undefined}
              >
                {j.n && <small>{j.n}</small>}
                {j.text}
              </span>
            )) : <em>Le journal des coups et des sorts s’écrit ici.</em>}
          </div>
        </div>

        {!mobile && (
          <div className="gh-foot gi" style={{ '--i': 5 } as CSSProperties}>
            <button className="gh-link" onClick={g.reset}>Nouvelle partie</button>
            <span><kbd>Échap</kbd> pour revenir au monde</span>
          </div>
        )}
      </aside>

      {castMsg && (
        <div key={castMsg.key} className="gh-cast" style={{ '--h': castMsg.hue } as CSSProperties}>{castMsg.text}</div>
      )}

      {g.result && (
        <div className="gh-result">
          <div className="gh-result-card">
            <span className="gh-kicker">{REASON[g.result.reason] ?? 'Partie terminée'}</span>
            <strong>{g.result.winner === null ? 'Partie nulle.' : won ? 'Victoire.' : 'L’IA l’emporte.'}</strong>
            <div className="gh-actions">
              <button className="gh-btn hot" onClick={g.reset}>Rejouer</button>
              <button className="gh-btn" onClick={onExit}>Retour au monde</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
