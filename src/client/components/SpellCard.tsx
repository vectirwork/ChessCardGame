// Carte de pouvoir : cadre type tarot, emblème, effet holographique et inclinaison 3D au survol.
//
// Face épurée (décision D1 du plan V2) : l'emblème, le nom et une seule pastille qui dit l'effet sur le tour,
// « + votre coup » (on lance la carte, puis on joue son coup) ou « Remplace votre coup » (Rituel). La règle, la
// famille, la durée et le moment où la carte agit sont dans la bulle (CardBubble), ouverte au survol, au focus ou au
// toucher. Une carte jouée reste visible, grisée, avec « Jouée ».
//
// Tailles : 'hand' (mains), 'full' (la même face en grand : annonce d'un sort, chapitres de l'accueil, dont la règle
// est écrite à côté), 'mini' (vignette : emblème seul) et 'compact' (bandeau : emblème, nom, pastille).
import { forwardRef, useRef } from 'react';
import type { CSSProperties, FocusEvent as RFocusEvent, PointerEvent as RPointerEvent, ReactNode, Ref } from 'react';
import { CARDS, CardDef, CardId, FAMILY_LABEL } from '../../shared/cards';
import { CardEmblem } from './CardArt';
import { CardScene } from './CardScene';
import { CARD_SCENES } from './cardScenes';

/** Durée courte (le détail « vous, lui, vous » reste dans la règle). */
export function shortDuration(def: CardDef): string {
  if (def.permanent && def.family === 'terrain') return 'Toute la partie';
  return def.duration.replace(/\s*\(.*\)\s*$/, '');
}

/** Famille et mot-clé : « Climat · Présage », « Terrain · Permanent », « Événement · Rituel ». */
export function cardKicker(def: CardDef): string {
  const key = def.presage ? 'Présage' : def.ritual ? 'Rituel' : def.permanent && def.family === 'terrain' ? 'Permanent' : '';
  return key ? `${FAMILY_LABEL[def.family]} · ${key}` : FAMILY_LABEL[def.family];
}

/**
 * Effet de la carte sur le tour : elle s'ajoute au coup, ou elle le remplace (Rituel). `owner` 'opponent' : formulé
 * pour la carte de votre adversaire (« + son coup »), dans sa bulle.
 */
export function turnEffect(def: CardDef, owner: 'self' | 'opponent' = 'self'): { kind: 'plus' | 'replace'; label: string; who: string } {
  const who = owner === 'self' ? 'votre coup' : 'son coup';
  return def.ritual ? { kind: 'replace', label: `Remplace ${who}`, who } : { kind: 'plus', label: `+ ${who}`, who };
}

/** Moment où la carte agit, en une phrase. `owner` : la carte est à vous, ou à votre adversaire. */
export function cardTiming(def: CardDef, owner: 'self' | 'opponent' = 'self'): string {
  const self = owner === 'self';
  if (def.presage) {
    return self
      ? 'Présage : annoncée maintenant, elle arrive au début de votre prochain tour. Vous jouez votre coup juste après l’annonce.'
      : 'Présage : annoncée, elle arrive au début du tour suivant de votre adversaire.';
  }
  if (def.ritual) {
    return self ? 'Rituel : la carte remplace votre coup.' : 'Rituel : la carte remplace son coup.';
  }
  if (def.targets) return self ? 'Effet immédiat sur la case choisie, puis vous jouez votre coup.' : 'Effet immédiat sur la case choisie, puis il joue son coup.';
  return self ? 'Effet immédiat, puis vous jouez votre coup.' : 'Effet immédiat, puis il joue son coup.';
}

/**
 * Règle sans sa phrase d'arrivée (« Annoncée, elle arrive… », « Rituel : la carte remplace votre coup. ») : dans la
 * bulle, le moment d'action a sa propre ligne.
 */
export function ruleBody(def: CardDef): string {
  return def.description
    .replace(/^Annoncée?, (?:il|elle) arrive au début de votre prochain tour\.\s*/u, '')
    .replace(/^Rituel : la carte remplace votre coup\.\s*/u, '');
}

/**
 * Pastille de tour : « + votre coup » ou « Remplace votre coup ». `compact` (petites cartes de la main adverse) :
 * « + coup » ou « Remplace », le libellé entier restant lu par les lecteurs d'écran et dans la bulle.
 */
export function TurnPill({ def, owner = 'self', compact = false, className = '' }: { def: CardDef; owner?: 'self' | 'opponent'; compact?: boolean; className?: string }) {
  const t = turnEffect(def, owner);
  if (compact) {
    return (
      <span className={`sc-turn is-${t.kind} is-compact ${className}`} title={t.label}>
        {t.kind === 'plus' ? (
          <>
            <i className="sc-turn-sign">+</i> coup
          </>
        ) : (
          'Remplace'
        )}
      </span>
    );
  }
  return (
    <span className={`sc-turn is-${t.kind} ${className}`}>
      {t.kind === 'plus' ? (
        <>
          <i className="sc-turn-sign">+</i> {t.who}
        </>
      ) : (
        <>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 6h8.5l-2.4-2.4M13 10H4.5l2.4 2.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.label}
        </>
      )}
    </span>
  );
}

/** Libellé accessible d'une carte : nom, effet sur le tour, état. La règle est lue par la bulle (aria-describedby). */
export function cardAriaLabel(def: CardDef, used?: boolean, owner: 'self' | 'opponent' = 'self'): string {
  return `${def.name}, ${turnEffect(def, owner).label}${used ? ', jouée' : ''}`;
}

interface Props {
  id: CardId;
  size?: 'full' | 'hand' | 'mini' | 'compact';
  used?: boolean;
  selected?: boolean;
  /** Carte inactive : grisée et sans clic. */
  disabled?: boolean;
  /** Carte pas jouable maintenant mais lisible : grisée, le clic reste permis (il ouvre la bulle). */
  dim?: boolean;
  /** `how` : 'key' quand la carte est activée au clavier (Entrée, Espace). */
  onClick?: (how: 'pointer' | 'key') => void;
  /** Survol à la souris (le doigt passe par onClick). */
  onHover?: (on: boolean) => void;
  /** Focus au clavier (focus visible seulement). */
  onFocusChange?: (on: boolean) => void;
  /** Bulle associée (aria-describedby) et état ouvert (aria-expanded). */
  describedBy?: string;
  expanded?: boolean;
  /** Libellé accessible ; par défaut le nom, l'effet sur le tour, l'état et la règle. */
  label?: string;
  children?: ReactNode;
  tilt?: boolean;
  /** Carte de votre adversaire : pastille et libellé à la troisième personne (« + son coup »), pastille courte. */
  owner?: 'self' | 'opponent';
  className?: string;
}

export const SpellCard = forwardRef(function SpellCard(
  { id, size = 'full', used, selected, disabled, dim, onClick, onHover, onFocusChange, describedBy, expanded, label, children, tilt = true, owner = 'self', className = '' }: Props,
  outer: Ref<HTMLDivElement>,
) {
  const def = CARDS[id];
  const ref = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (typeof outer === 'function') outer(el);
    else if (outer) outer.current = el;
  };
  if (size === 'compact') return <CompactCard def={def} used={used} selected={selected} disabled={disabled} onClick={onClick ? () => onClick('pointer') : undefined} className={className} />;
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
  const leave = (e: RPointerEvent) => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
    if (e.pointerType === 'mouse') onHover?.(false);
  };
  const active = !!onClick && !disabled;
  const cls = ['spell-card', `sc-${size}`, `r-${def.rarity === 'épique' ? 'epique' : def.rarity === 'légendaire' ? 'legendaire' : def.rarity}`,
    used ? 'used' : '', selected ? 'selected' : '', disabled || dim ? 'disabled' : '', active ? 'clickable' : '', className].join(' ');
  const focusChange = (e: RFocusEvent<HTMLDivElement>, on: boolean) => {
    if (!onFocusChange) return;
    if (!on) onFocusChange(false);
    else if (e.currentTarget.matches(':focus-visible')) onFocusChange(true);
  };
  return (
    <div
      ref={setRef}
      className={cls}
      style={{ '--h': def.hue } as CSSProperties}
      onPointerMove={move}
      onPointerEnter={e => e.pointerType === 'mouse' && onHover?.(true)}
      onPointerLeave={leave}
      onFocus={e => focusChange(e, true)}
      onBlur={e => focusChange(e, false)}
      onClick={active ? () => onClick!('pointer') : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={active ? 0 : undefined}
      aria-disabled={onClick && (disabled || dim) ? true : undefined}
      aria-expanded={expanded}
      aria-describedby={describedBy}
      onKeyDown={e => {
        if (active && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick!('key');
        }
      }}
      aria-label={label ?? `${cardAriaLabel(def, used, owner)}${describedBy ? '' : ` : ${def.description}`}`}
    >
      <div className="sc-body">
        <div className="sc-art">
          <div className="sc-halo" />
          <CardEmblem id={id} className="sc-emblem" />
        </div>
        {size !== 'mini' && <div className="sc-name">{def.name}</div>}
        {size !== 'mini' && <TurnPill def={def} owner={owner} compact={owner === 'opponent' && size === 'hand'} />}
        {children}
      </div>
      <div className="sc-foil" />
      {used && <div className="sc-used">Jouée</div>}
    </div>
  );
});

/** Bandeau compact : emblème dans sa pastille, nom lisible, effet sur le tour ; grisé une fois jouée. */
function CompactCard({ def, used, selected, disabled, onClick, className = '' }: {
  def: CardDef; used?: boolean; selected?: boolean; disabled?: boolean; onClick?: () => void; className?: string;
}) {
  const cls = ['spell-chip', `fam-${def.family}`, used ? 'used' : '', selected ? 'selected' : '', disabled ? 'disabled' : '',
    onClick ? 'clickable' : '', className].join(' ');
  return (
    <div
      className={cls}
      style={{ '--h': def.hue } as CSSProperties}
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={e => {
        if (onClick && !disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      title={`${def.name}${used ? ' (jouée)' : ''} : ${def.description}`}
      aria-label={`${cardAriaLabel(def, used)} : ${def.description}`}
    >
      <span className="sch-em" aria-hidden="true">
        <CardEmblem id={def.id} />
      </span>
      <span className="sch-text">
        <span className="sch-name">{def.name}</span>
        <span className="sch-kicker">{used ? 'Jouée' : turnEffect(def).label}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Bulle d'une carte (décision D2) : règle, famille, durée, moment où elle agit, puis, ouverte au toucher ou au
// clic, « Lancer ce sort » et « Annuler » (ou la consigne de ciblage). Son emplacement est choisi par la main qui
// l'affiche (au-dessus de l'éventail, sous la main adverse…).

export interface CardBubbleProps {
  id: CardId;
  /** Identifiant DOM (aria-describedby de la carte). */
  domId?: string;
  /** 'read' : survol ou focus, lecture seule ; 'open' : ouverte au toucher (actions) ; 'aim' : ciblage en cours. */
  mode: 'read' | 'open' | 'aim';
  used?: boolean;
  /** Carte de votre adversaire (formulations à la troisième personne, jamais d'action). */
  owner?: 'self' | 'opponent';
  /** Pourquoi la carte n'est pas jouable maintenant (rien : jouable ou sans objet). */
  note?: string | null;
  /** Consigne de ciblage (mode 'aim'). */
  aim?: ReactNode;
  /** Lance la carte (mode 'open', carte jouable). */
  onCast?: () => void;
  /** Annuler (mode 'open' ou 'aim') ; en lecture, « Fermer ». */
  onCancel?: () => void;
  primaryRef?: Ref<HTMLButtonElement>;
  className?: string;
  style?: CSSProperties;
}

export function CardBubble({ id, domId, mode, used, owner = 'self', note, aim, onCast, onCancel, primaryRef, className = '', style }: CardBubbleProps) {
  const def = CARDS[id];
  if (!def) return null;
  const interactive = mode !== 'read';
  return (
    <div
      id={domId}
      className={`card-bubble is-${mode} ${owner === 'opponent' ? 'is-opp' : ''} ${className}`}
      style={{ '--h': def.hue, ...style } as CSSProperties}
      role={interactive ? 'dialog' : 'tooltip'}
      aria-label={interactive ? def.name : undefined}
    >
      <div className="cbub-in">
        <div className="cbub-head">
          <span className="cbub-em" aria-hidden="true">
            <CardEmblem id={id} />
          </span>
          <span className="cbub-title">
            <b>{def.name}</b>
            <small>
              {cardKicker(def)} · {def.duration}
            </small>
          </span>
        </div>
        {mode === 'aim' && aim && (
          <p className="cbub-aim" role="status">
            {aim}
          </p>
        )}
        {/* Avant de lancer la carte : sa scène se joue en boucle, à côté de la règle (pas pendant le ciblage) */}
        {mode !== 'aim' && CARD_SCENES[id] ? (
          <div className="cbub-body">
            <CardScene id={id} play="auto" className="cbub-scene" />
            <p className="cbub-rule">{ruleBody(def)}</p>
          </div>
        ) : (
          <p className="cbub-rule">{ruleBody(def)}</p>
        )}
        <p className="cbub-when">
          <TurnPill def={def} owner={owner} />
          <span>{cardTiming(def, owner)}</span>
        </p>
        {(used || note) && mode !== 'aim' && <p className="cbub-note">{used ? 'Déjà jouée.' : note}</p>}
      </div>
      {interactive && (onCast || onCancel) && (
        <div className="cbub-actions">
          {mode === 'open' && onCast && (
            <button ref={primaryRef} type="button" className="btn-gold sm cbub-cast" onClick={onCast}>
              Lancer ce sort
            </button>
          )}
          {onCancel && (
            <button ref={mode === 'open' && onCast ? undefined : primaryRef} type="button" className="btn-line cbub-cancel" onClick={onCancel}>
              {mode === 'open' && !onCast ? 'Fermer' : 'Annuler'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CardBack({ size = 'hand', used }: { size?: 'hand' | 'mini'; used?: boolean }) {
  return (
    <div className={`spell-card card-back sc-${size} ${used ? 'used' : ''}`} aria-label="Carte inconnue (ancienne formule)">
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
      {used && <div className="sc-used">Jouée</div>}
    </div>
  );
}
