// Petites pièces de l'Odyssée : marque, titres révélés ligne à ligne, astrolabe, chapitres, feuilles.
import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CARDS, RARITY_LABEL } from '../../shared/cards';
import type { CardId } from '../../shared/cards';
import { SpellCard } from '../components/SpellCard';
import { howToPlay } from './data';

/** Étoile à quatre branches dans son cercle : la marque Spellmate au trait de l'Odyssée. */
export function Mark({ size = 28 }: { size?: number }) {
  const id = `mk${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="o-mark">
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

export function Lines({ lines, as: Tag = 'h2', className = '' }: { lines: ReactNode[]; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  return (
    <Tag className={`o-rv-lines ${className}`}>
      {lines.map((l, i) => (
        <span className="o-ln" key={i} style={{ '--l': i } as CSSProperties}>
          <span>{l}</span>
        </span>
      ))}
    </Tag>
  );
}

export function Kicker({ num, name, alt }: { num: string; name: string; alt?: number }) {
  return (
    <p className="o-kicker o-rv">
      <span className="o-num">{num}</span>
      <span>{name}</span>
      {alt !== undefined && <span className="o-kicker-alt">{alt.toLocaleString('fr-FR')} m</span>}
    </p>
  );
}

/** Mobile : emplacement où l'échiquier vient se poser pendant la lecture (invisible sur bureau). */
export function Slot({ label = "Touchez l'échiquier pour jouer" }: { label?: string }) {
  return (
    <div className="o-m-slot" data-slot aria-hidden="true">
      <span className="o-m-slot-hint">{label}</span>
    </div>
  );
}

export function Chapter({ id, active }: { id: CardId; active: boolean }) {
  const c = CARDS[id];
  return (
    <article className={`o-chapter ${active ? 'on' : ''}`} data-chapter={id} style={{ '--h': c.hue } as CSSProperties}>
      <div className="o-chapter-card o-rv">
        <SpellCard id={id} size="full" />
      </div>
      <div className="o-chapter-text">
        <p className="o-chapter-meta o-rv">
          <span>{RARITY_LABEL[c.rarity]}</span>
          <span>{c.duration}</span>
        </p>
        <h3 className="o-chapter-name o-rv">{c.name}</h3>
        <p className="o-chapter-tag o-rv">{c.tagline}</p>
        <p className="o-chapter-rule o-rv">{c.description}</p>
        <p className="o-chapter-target o-rv">
          <span>En partie</span>
          {howToPlay(c)}
        </p>
      </div>
      <Slot label={`${c.name} · touchez pour jouer`} />
    </article>
  );
}

/** Anneaux méridiens de l'astrolabe, derrière l'échiquier. */
export function OrbitRings() {
  return (
    <div className="o-orbits" aria-hidden="true">
      <svg className="o-orbit o-o1" viewBox="0 0 200 200">
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
      <svg className="o-orbit o-o2" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(127,231,255,.36)" strokeWidth="0.22" />
        <circle cx="14" cy="100" r="1.3" fill="#bff3ff" />
        <circle cx="186" cy="100" r="0.9" fill="#bff3ff" />
      </svg>
      <svg className="o-orbit o-o3" viewBox="0 0 200 200">
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
export function EqRing({ part, w, r, rot, dur, reverse, hue }: { part: 'back' | 'front'; w: number; r: number; rot: number; dur: number; reverse?: boolean; hue: 'gold' | 'cyan' }) {
  const stroke = hue === 'gold' ? 'rgba(243,201,105,.85)' : 'rgba(150,236,255,.6)';
  const ring = (
    <div className="o-eq-squash" style={{ transform: `scaleY(${r})` }}>
      <svg className="o-eq-spin" viewBox="0 0 200 200" style={{ animationDuration: `${dur}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
        <circle cx="100" cy="100" r="98" fill="none" stroke={stroke} strokeWidth="0.55" />
        <circle cx="100" cy="100" r="94.5" fill="none" stroke={stroke} strokeWidth="0.2" opacity="0.6" />
        {Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          const l = i % 4 === 0 ? 3.5 : 1.6;
          return <line key={i} x1={(100 + Math.cos(a) * 98).toFixed(2)} y1={(100 + Math.sin(a) * 98).toFixed(2)} x2={(100 + Math.cos(a) * (98 - l)).toFixed(2)} y2={(100 + Math.sin(a) * (98 - l)).toFixed(2)} stroke={stroke} strokeWidth="0.4" />;
        })}
        <circle cx="198" cy="100" r="3" fill={hue === 'gold' ? '#fff1c4' : '#d8f8ff'} />
        <circle cx="198" cy="100" r="6" fill={hue === 'gold' ? 'rgba(255,225,160,.25)' : 'rgba(190,240,255,.25)'} />
        <circle cx="30" cy="170" r="2" fill={hue === 'gold' ? '#ffd68a' : '#bff3ff'} />
      </svg>
    </div>
  );
  return (
    <div className={`o-eq o-eq-${part}`} style={{ '--w': `${w}%`, '--r': r, transform: `translate(-50%, -50%) rotate(${rot}deg)` } as CSSProperties}>
      {part === 'front' ? <div className="o-eq-clip">{ring}</div> : ring}
    </div>
  );
}

export const EQ = [
  { w: 142, r: 0.27, rot: -1, dur: 90, hue: 'gold' as const },
  { w: 122, r: 0.22, rot: 7, dur: 60, reverse: true, hue: 'cyan' as const },
];

/** Feuille modale de l'Odyssée (invitation, niveau de l'IA…). Échap ou clic sur le voile pour fermer. */
export function Sheet({ kicker, title, children, actions, onClose }: { kicker?: string; title: string; children: ReactNode; actions?: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="o-sheet-veil" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="o-sheet" role="dialog" aria-modal="true" aria-label={title}>
        {kicker && <p className="o-sheet-kicker">{kicker}</p>}
        <h2>{title}</h2>
        {children}
        <div className="o-sheet-actions">
          {actions}
          <button type="button" className="btn-line" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
