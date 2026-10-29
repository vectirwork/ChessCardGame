// Carte de pouvoir : cadre type tarot, emblème, effet holographique et inclinaison 3D au survol.
import { useRef } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { CARDS, CardId, RARITY_LABEL } from '../../shared/cards';
import { CardEmblem } from './CardArt';

interface Props {
  id: CardId;
  size?: 'full' | 'hand' | 'mini';
  used?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  tilt?: boolean;
  className?: string;
}

export function SpellCard({ id, size = 'full', used, selected, disabled, onClick, children, tilt = true, className = '' }: Props) {
  const def = CARDS[id];
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: RPointerEvent) => {
    if (!tilt || !ref.current || e.pointerType === 'touch') return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--mx', `${x * 100}%`);
    ref.current.style.setProperty('--my', `${y * 100}%`);
    ref.current.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 18}deg`);
  };
  const leave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  const cls = ['spell-card', `sc-${size}`, `r-${def.rarity === 'épique' ? 'epique' : def.rarity === 'légendaire' ? 'legendaire' : def.rarity}`,
    used ? 'used' : '', selected ? 'selected' : '', disabled ? 'disabled' : '', onClick ? 'clickable' : '', className].join(' ');
  return (
    <div
      ref={ref}
      className={cls}
      style={{ '--h': def.hue } as CSSProperties}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={e => {
        if (onClick && !disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${def.name} : ${def.description}`}
    >
      <div className="sc-body">
        <div className="sc-top">
          <span className="sc-rarity">{RARITY_LABEL[def.rarity]}</span>
          {size !== 'mini' && <span className="sc-dur">{def.duration}</span>}
        </div>
        <div className="sc-art">
          <div className="sc-halo" />
          <CardEmblem id={id} className="sc-emblem" />
        </div>
        <div className="sc-name">{def.name}</div>
        {size === 'full' && <div className="sc-tag">{def.tagline}</div>}
        {size === 'full' && <div className="sc-desc">{def.description}</div>}
        {children}
      </div>
      <div className="sc-foil" />
      {used && <div className="sc-used">Utilisée</div>}
    </div>
  );
}

export function CardBack({ size = 'hand', used }: { size?: 'hand' | 'mini'; used?: boolean }) {
  return (
    <div className={`spell-card card-back sc-${size} ${used ? 'used' : ''}`} aria-label="Carte cachée">
      <div className="cb-pattern">
        <svg viewBox="0 0 100 140" aria-hidden="true">
          <defs>
            <linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe19a" />
              <stop offset="1" stopColor="#d58a2e" />
            </linearGradient>
          </defs>
          <rect x="8" y="8" width="84" height="124" rx="8" fill="none" stroke="url(#cbg)" strokeWidth="1.2" opacity="0.7" />
          <rect x="13" y="13" width="74" height="114" rx="5" fill="none" stroke="url(#cbg)" strokeWidth="0.6" opacity="0.5" />
          <circle cx="50" cy="70" r="26" fill="none" stroke="url(#cbg)" strokeWidth="0.8" opacity="0.6" />
          <circle cx="50" cy="70" r="20" fill="none" stroke="url(#cbg)" strokeWidth="0.5" opacity="0.5" strokeDasharray="2 3" />
          <path d="M50 46 l5.5 18.5 L74 70 l-18.5 5.5 L50 94 l-5.5-18.5 L26 70 l18.5-5.5z" fill="url(#cbg)" />
          <circle cx="50" cy="70" r="4" fill="#120f22" />
        </svg>
      </div>
      {used && <div className="sc-used">Utilisée</div>}
    </div>
  );
}
