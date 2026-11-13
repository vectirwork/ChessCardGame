// Carte de pouvoir : cadre type tarot, emblème, effet holographique et inclinaison 3D au survol.
//
// Face épurée (décision D1 du plan V2) : l'emblème, le nom, en haut le moment où elle agit (« Immédiat » ou « Au
// prochain tour » pour un Présage) et une pastille qui dit l'effet sur le tour : « En plus du coup » (on lance la
// carte, puis on joue son coup) ou « Remplace le coup » (Rituel, ou toute carte si les règles de la partie le disent :
// cardEndsTurn). La règle, la famille et la durée sont dans la bulle (CardBubble), ouverte au survol, au focus ou au
// toucher. Une carte jouée reste visible, grisée, avec « Jouée ».
//
// Règles (`rules`) : celles de la partie (rulesOf(state)), sinon celles des nouvelles parties (GAME_RULES). Elles
// règlent la pastille (carte à la place du coup), le moment d'action (délai des Présages) et, si elles portent
// l'équilibrage (`tuning`), les textes de la carte (cardText : durée, règle, consignes d'une partie dont l'équilibrage
// diffère du réglage du jour). Au défaut, les textes de CARDS.
//
// Tailles : 'hand' (mains), 'full' (la même face en grand : annonce d'un sort, chapitres de l'accueil, dont la règle
// est écrite à côté), 'mini' (vignette : emblème seul) et 'compact' (bandeau : emblème, nom, pastille).
import { forwardRef, useId, useRef } from 'react';
import type { CSSProperties, FocusEvent as RFocusEvent, PointerEvent as RPointerEvent, ReactNode, Ref } from 'react';
import { CARDS, CardDef, CardId, FAMILY_LABEL, cardText } from '../../shared/cards';
import { GAME_RULES } from '../../shared/config/rules';
import type { Rules } from '../../shared/config/rules';
import { enLettres, ordinalLettres } from '../../shared/text/fr';
import { prochainTour, toursPresage } from '../../shared/text/regles';
import { CardEmblem } from './CardArt';
import { CardScene } from './CardScene';
import { CARD_SCENES } from './cardScenes';

/**
 * Règles qui changent ce que dit une carte : carte à la place du coup, délai des Présages et, si elles le portent,
 * l'équilibrage de la partie (`tuning`, règles complètes d'une partie : rulesOf(state)).
 */
export type CardRules = Pick<Rules, 'cardEndsTurn' | 'presageDelay'> & { tuning?: Rules['tuning'] };

/**
 * Textes d'une carte (règle, durée, consignes de ciblage) selon les règles d'une partie : cardText si elles portent
 * l'équilibrage (mémorisé par objet de règles), sinon ceux de CARDS. Pour RULES_V1 et au réglage du jour, ce sont
 * les textes de CARDS au caractère près (test/climats.test.ts).
 */
export function cardTexts(def: CardDef, r: CardRules = GAME_RULES): Pick<CardDef, 'description' | 'duration' | 'prompts'> {
  const tuning = r.tuning;
  return tuning && CARDS[def.id] === def ? cardText(def.id, r as CardRules & { tuning: Rules['tuning'] }) : def;
}

/**
 * La carte termine-t-elle le tour ? Même règle que cardEndsTurn (src/shared/rulesCore.ts, vérifié par
 * test/coque-layout.test.ts) : un Rituel toujours, toute carte si les règles le disent. Recopiée ici parce que
 * rulesCore.ts entraînerait le moteur (chess.ts) dans le morceau de SpellCard, chargé par des pages sans partie.
 */
export function endsTurn(def: Pick<CardDef, 'ritual'>, r: Pick<Rules, 'cardEndsTurn'>): boolean {
  return !!def.ritual || r.cardEndsTurn;
}

/** Famille et mot-clé : « Climat · Présage », « Terrain · Permanent », « Événement · Rituel ». */
export function cardKicker(def: CardDef): string {
  const key = def.presage ? 'Présage' : def.ritual ? 'Rituel' : def.permanent && def.family === 'terrain' ? 'Permanent' : '';
  return key ? `${FAMILY_LABEL[def.family]} · ${key}` : FAMILY_LABEL[def.family];
}

/**
 * Effet de la carte sur le tour : elle s'ajoute au coup, ou elle le remplace (Rituel, ou toute carte avec
 * cardEndsTurn). `owner` 'opponent' : formulé pour la carte de votre adversaire (« + son coup »), dans sa bulle.
 */
export function turnEffect(def: CardDef, owner: 'self' | 'opponent' = 'self', r: CardRules = GAME_RULES): { kind: 'plus' | 'replace'; label: string; short: string; who: string } {
  const who = owner === 'self' ? 'votre coup' : 'son coup';
  return endsTurn(def, r)
    ? { kind: 'replace', label: `Remplace ${who}`, short: 'Remplace le coup', who }
    : { kind: 'plus', label: `En plus de ${who}`, short: 'En plus du coup', who };
}

/**
 * Moment où la carte agit, en deux mots : tout de suite, ou au prochain tour du lanceur (Présage). Avec un délai des
 * Présages de plus de 2 demi-coups : « Dans deux tours », « Dans trois tours » (même compte que prochainTour).
 */
export function cardWhen(def: CardDef, r: Pick<Rules, 'presageDelay'> = GAME_RULES): { kind: 'now' | 'next'; label: string } {
  if (!def.presage) return { kind: 'now', label: 'Immédiat' };
  const k = toursPresage(r.presageDelay);
  return { kind: 'next', label: k === 1 ? 'Au prochain tour' : `Dans ${enLettres(k)} tours` };
}

/** Étiquette du haut de la carte : « Immédiat » (éclair) ou « Au prochain tour » (sablier). `iconOnly` : petites cartes. */
export function WhenTag({ def, iconOnly = false, rules = GAME_RULES, className = '' }: { def: CardDef; iconOnly?: boolean; rules?: Pick<Rules, 'presageDelay'>; className?: string }) {
  const w = cardWhen(def, rules);
  return (
    <span className={`sc-when is-${w.kind} ${className}`} title={w.label}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {w.kind === 'next' ? (
          <path d="M4.5 2.5h7M4.5 13.5h7M5.5 2.5c0 3 5 3.2 5 5.5s-5 2.5-5 5.5M10.5 2.5c0 3-5 3.2-5 5.5s5 2.5 5 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M9.2 1.8 3.8 9h4l-1 5.2L12.2 7h-4z" fill="currentColor" />
        )}
      </svg>
      {!iconOnly && w.label}
    </span>
  );
}

/**
 * Moment où la carte agit, en une phrase. `owner` : la carte est à vous, ou à votre adversaire. `r` : délai des
 * Présages (« votre prochain tour », « votre deuxième tour à venir ») et carte à la place du coup.
 */
export function cardTiming(def: CardDef, owner: 'self' | 'opponent' = 'self', r: CardRules = GAME_RULES): string {
  const self = owner === 'self';
  const replaces = !def.ritual && endsTurn(def, r);
  if (def.presage) {
    if (!self) {
      const k = toursPresage(r.presageDelay);
      const when = k === 1 ? 'du tour suivant de votre adversaire' : `de son ${ordinalLettres(k)} tour à venir`;
      return `Présage : annoncée, elle arrive au début ${when}.${replaces ? ' L’annonce remplace son coup.' : ''}`;
    }
    const then = replaces ? 'L’annonce remplace votre coup.' : 'Vous jouez votre coup juste après l’annonce.';
    return `Présage : annoncée maintenant, elle arrive au début de ${prochainTour(r.presageDelay)}. ${then}`;
  }
  if (def.ritual) {
    return self ? 'Rituel : la carte remplace votre coup.' : 'Rituel : la carte remplace son coup.';
  }
  if (replaces) {
    const where = def.targets ? 'Effet immédiat sur la case choisie' : 'Effet immédiat';
    return `${where}, à la place de ${self ? 'votre' : 'son'} coup.`;
  }
  if (def.targets) return self ? 'Effet immédiat sur la case choisie, puis vous jouez votre coup.' : 'Effet immédiat sur la case choisie, puis il joue son coup.';
  return self ? 'Effet immédiat, puis vous jouez votre coup.' : 'Effet immédiat, puis il joue son coup.';
}

/**
 * Règle sans sa phrase d'arrivée (« Annoncée, elle arrive… », « Rituel : la carte remplace votre coup. ») : dans la
 * bulle, le moment d'action a sa propre ligne. Texte selon les règles de la partie (cardTexts).
 */
export function ruleBody(def: CardDef, r: CardRules = GAME_RULES): string {
  return cardTexts(def, r).description
    .replace(/^Annoncée?, (?:il|elle) arrive au début de votre (?:prochain|[a-zéè-]+ième) tour(?: à venir)?\.\s*/u, '')
    .replace(/^Rituel : la carte remplace votre coup\.\s*/u, '');
}

/**
 * Pastille de tour : « + votre coup » ou « Remplace votre coup ». `compact` (petites cartes de la main adverse) :
 * « + coup » ou « Remplace », le libellé entier restant lu par les lecteurs d'écran et dans la bulle.
 */
export function TurnPill({ def, owner = 'self', compact = false, long = false, rules = GAME_RULES, className = '' }: { def: CardDef; owner?: 'self' | 'opponent'; compact?: boolean; /** Libellé entier (« En plus de votre coup »), là où il y a la place. */ long?: boolean; rules?: CardRules; className?: string }) {
  const t = turnEffect(def, owner, rules);
  if (compact) {
    return (
      <span className={`sc-turn is-${t.kind} is-compact ${className}`} title={t.label}>
        {t.kind === 'plus' ? (
          <>
            <i className="sc-turn-sign">+</i> En plus
          </>
        ) : (
          'Remplace'
        )}
      </span>
    );
  }
  return (
    <span className={`sc-turn is-${t.kind} ${className}`} title={t.label}>
      {t.kind === 'plus' ? (
        <>
          <i className="sc-turn-sign">+</i> {long ? t.label : t.short}
        </>
      ) : (
        <>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 6h8.5l-2.4-2.4M13 10H4.5l2.4 2.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {long ? t.label : t.short}
        </>
      )}
    </span>
  );
}

/** Libellé accessible d'une carte : nom, effet sur le tour, état. La règle est lue par la bulle (aria-describedby). */
export function cardAriaLabel(def: CardDef, used?: boolean, owner: 'self' | 'opponent' = 'self', r: CardRules = GAME_RULES): string {
  return `${def.name}, ${cardWhen(def, r).label.toLowerCase()}, ${turnEffect(def, owner, r).label.toLowerCase()}${used ? ', jouée' : ''}`;
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
  /** Règles de la partie (pastille « Remplace le coup ») ; par défaut celles des nouvelles parties. */
  rules?: CardRules;
  /** Petite carte d'une main nombreuse : moment en icône et pastille courte (« + En plus », « Remplace »). */
  narrow?: boolean;
  className?: string;
}

export const SpellCard = forwardRef(function SpellCard(
  { id, size = 'full', used, selected, disabled, dim, onClick, onHover, onFocusChange, describedBy, expanded, label, children, tilt = true, owner = 'self', rules = GAME_RULES, narrow = false, className = '' }: Props,
  outer: Ref<HTMLDivElement>,
) {
  const def = CARDS[id];
  const ref = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (typeof outer === 'function') outer(el);
    else if (outer) outer.current = el;
  };
  if (size === 'compact') return <CompactCard def={def} used={used} selected={selected} disabled={disabled} rules={rules} onClick={onClick ? () => onClick('pointer') : undefined} className={className} />;
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
      aria-label={label ?? `${cardAriaLabel(def, used, owner, rules)}${describedBy ? '' : ` : ${cardTexts(def, rules).description}`}`}
    >
      <div className="sc-body">
        <div className="sc-art">
          <div className="sc-halo" />
          <CardEmblem id={id} className="sc-emblem" />
        </div>
        {(size === 'hand' || size === 'full') && <WhenTag def={def} rules={rules} iconOnly={narrow || (owner === 'opponent' && size === 'hand')} />}
        {size !== 'mini' && <div className="sc-name">{def.name}</div>}
        {size !== 'mini' && <TurnPill def={def} owner={owner} rules={rules} compact={narrow || (owner === 'opponent' && size === 'hand')} />}
        {children}
      </div>
      <div className="sc-foil" />
      {used && <div className="sc-used">Jouée</div>}
    </div>
  );
});

/** Bandeau compact : emblème dans sa pastille, nom lisible, effet sur le tour ; grisé une fois jouée. */
function CompactCard({ def, used, selected, disabled, rules, onClick, className = '' }: {
  def: CardDef; used?: boolean; selected?: boolean; disabled?: boolean; rules: CardRules; onClick?: () => void; className?: string;
}) {
  const cls = ['spell-chip', `fam-${def.family}`, used ? 'used' : '', selected ? 'selected' : '', disabled ? 'disabled' : '',
    onClick ? 'clickable' : '', className].join(' ');
  const description = cardTexts(def, rules).description;
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
      title={`${def.name}${used ? ' (jouée)' : ''} : ${description}`}
      aria-label={`${cardAriaLabel(def, used, 'self', rules)} : ${description}`}
    >
      <span className="sch-em" aria-hidden="true">
        <CardEmblem id={def.id} />
      </span>
      <span className="sch-text">
        <span className="sch-name">{def.name}</span>
        <span className="sch-kicker">{used ? 'Jouée' : turnEffect(def, 'self', rules).label}</span>
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
  /** Règles de la partie (moment d'action, carte à la place du coup) ; par défaut celles des nouvelles parties. */
  rules?: CardRules;
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

export function CardBubble({ id, domId, mode, used, owner = 'self', rules = GAME_RULES, note, aim, onCast, onCancel, primaryRef, className = '', style }: CardBubbleProps) {
  const def = CARDS[id];
  if (!def) return null;
  const interactive = mode !== 'read';
  // Durée et règle selon l'équilibrage de la partie (cardTexts), comme le moment d'action (cardTiming)
  const texts = cardTexts(def, rules);
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
              {cardKicker(def)} · {texts.duration}
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
          <div className={`cbub-body ${CARD_SCENES[id]?.pair ? 'is-pair' : ''}`}>
            <CardScene id={id} play="auto" className="cbub-scene" labels={!!CARD_SCENES[id]?.pair} />
            <p className="cbub-rule">{ruleBody(def, rules)}</p>
          </div>
        ) : (
          <p className="cbub-rule">{ruleBody(def, rules)}</p>
        )}
        <p className="cbub-when">
          <TurnPill def={def} owner={owner} rules={rules} long />
          <span>{cardTiming(def, owner, rules)}</span>
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

/** Dos de carte (carte inconnue). Dégradé à identifiant unique : plusieurs dos dans la même page ne se gênent pas. */
export function CardBack({ size = 'hand', used }: { size?: 'hand' | 'mini'; used?: boolean }) {
  const grad = `cbg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div className={`spell-card card-back sc-${size} ${used ? 'used' : ''}`} aria-label="Carte inconnue (ancienne formule)">
      <div className="cb-pattern">
        <svg viewBox="0 0 100 140" aria-hidden="true">
          <defs>
            <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe19a" />
              <stop offset="1" stopColor="#d58a2e" />
            </linearGradient>
          </defs>
          <rect x="8" y="8" width="84" height="124" rx="8" fill="none" stroke={`url(#${grad})`} strokeWidth="1.2" opacity="0.7" />
          <rect x="13" y="13" width="74" height="114" rx="5" fill="none" stroke={`url(#${grad})`} strokeWidth="0.6" opacity="0.5" />
          <circle cx="50" cy="70" r="26" fill="none" stroke={`url(#${grad})`} strokeWidth="0.8" opacity="0.6" />
          <circle cx="50" cy="70" r="20" fill="none" stroke={`url(#${grad})`} strokeWidth="0.5" opacity="0.5" strokeDasharray="2 3" />
          <path d="M50 46 l5.5 18.5 L74 70 l-18.5 5.5 L50 94 l-5.5-18.5 L26 70 l18.5-5.5z" fill={`url(#${grad})`} />
          <circle cx="50" cy="70" r="4" fill="#120f22" />
        </svg>
      </div>
      {used && <div className="sc-used">Jouée</div>}
    </div>
  );
}
