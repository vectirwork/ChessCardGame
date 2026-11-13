// Mains de cartes des leçons, des problèmes et de l'analyse (les deux mains sont visibles : la sienne, jouable,
// et celle de l'adversaire, en lecture seule, cartes jouées grisées), ciblage compris, et liste sobre des effets
// en cours. Une carte retirée du jeu (ancienne partie relue) s'affiche par son identifiant, sans planter.
//
// Comme dans la coque de partie (décisions D1 et D2 du plan V2) : une carte montre son emblème, son nom et
// l'effet sur le tour ; la toucher ouvre sa bulle (règle, famille, durée, moment d'action) avec « Lancer ce sort »
// et « Annuler » ; le survol et le focus clavier montrent la même bulle en lecture seule.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CardEmblem } from '../components/CardArt';
import { CardBubble, TurnPill, cardAriaLabel } from '../components/SpellCard';
import { CARDS, CardId, FAMILY_LABEL, isCardId } from '../../shared/cards';
import { rankOf, sqName } from '../../shared/chess';
import type { Color } from '../../shared/chess';
import { Effect, GameState, cardOptions, cardPlayable } from '../../shared/game';
import { rulesOf } from '../../shared/rulesCore';
import { handNotes } from '../odyssee/shell/cards';

export interface Targeting {
  index: number | null;
  partial: number[];
  options: number[] | null;
  prompt: string | null;
  hue: number | undefined;
  select: (i: number) => void;
  target: (sq: number) => void;
  cancel: () => void;
}

/** Choix d'une carte puis de ses cibles ; `onPlay` reçoit la carte et ses cibles complètes. */
export function useTargeting(state: GameState, color: Color, enabled: boolean, onPlay: (card: CardId, index: number, targets: number[]) => void): Targeting {
  const [index, setIndex] = useState<number | null>(null);
  const [partial, setPartial] = useState<number[]>([]);
  useEffect(() => {
    setIndex(null);
    setPartial([]);
  }, [state, enabled]);
  const raw = index !== null ? state.hands[color][index]?.card ?? null : null;
  const card = raw && isCardId(raw) ? raw : null;
  const options = useMemo(() => (index !== null && card ? cardOptions(state, color, index, partial) : null), [state, color, index, partial, card]);
  const select = useCallback((i: number) => {
    if (!enabled) return;
    if (index === i) {
      setIndex(null);
      setPartial([]);
      return;
    }
    const c = state.hands[color][i]?.card;
    if (!c || !isCardId(c) || state.hands[color][i].used) return;
    if (CARDS[c].targets === 0) {
      onPlay(c, i, []);
      return;
    }
    setIndex(i);
    setPartial([]);
  }, [enabled, index, state, color, onPlay]);
  const target = useCallback((sq: number) => {
    if (index === null || !card) return;
    const next = [...partial, sq];
    if (next.length >= CARDS[card].targets) {
      setIndex(null);
      setPartial([]);
      onPlay(card, index, next);
    } else setPartial(next);
  }, [index, card, partial, onPlay]);
  const cancel = useCallback(() => {
    setIndex(null);
    setPartial([]);
  }, []);
  return {
    index,
    partial,
    options,
    prompt: card ? CARDS[card].prompts[partial.length] ?? null : null,
    hue: card ? CARDS[card].hue : undefined,
    select,
    target,
    cancel,
  };
}

export const sideName = (c: Color) => (c === 'w' ? 'Blancs' : 'Noirs');

/** Invite « Touchez une carte… » (même mémoire que la coque de partie). */
const SEEN_KEY = 'sm:cartes:lues';
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};
const writeSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // stockage indisponible
  }
};

/**
 * Place d'une bulle accrochée à une carte : sous la carte si la place le permet (`prefer`), sinon au-dessus ; suit
 * le défilement de la page.
 */
function useAnchoredBubble(el: HTMLElement | null, prefer: 'above' | 'below'): { style: CSSProperties; below: boolean } | null {
  const [pos, setPos] = useState<{ style: CSSProperties; below: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!el) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(340, vw - 24);
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, vw - w - 12));
      const ax = `${r.left + r.width / 2 - left}px`;
      // L'en-tête du site reste collé en haut, au-dessus de la bulle : la place au-dessus de la carte s'arrête dessous
      const head = document.querySelector('.site-header')?.getBoundingClientRect();
      const top = head && head.bottom > 0 && head.height > 0 ? head.bottom : 0;
      const roomBelow = vh - r.bottom;
      const roomAbove = r.top - top;
      const below = prefer === 'below' ? roomBelow >= 230 || roomBelow > roomAbove : roomAbove < 230 && roomBelow > roomAbove;
      setPos(
        below
          ? { below, style: { left, width: w, top: r.bottom + 12, '--cbub-ax': ax, '--cbub-max': `${Math.max(120, roomBelow - 28)}px` } as CSSProperties }
          : { below, style: { left, width: w, bottom: vh - r.top + 12, '--cbub-ax': ax, '--cbub-max': `${Math.max(120, roomAbove - 28)}px` } as CSSProperties },
      );
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [el, prefer]);
  return pos;
}

/** Ouverture d'une bulle au toucher, aperçu au survol et au focus ; Échap et toucher ailleurs la referment. */
function useCardBubbles(resetKey: unknown) {
  const [open, setOpen] = useState<number | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const primary = useRef<HTMLButtonElement>(null);
  const keyOpen = useRef(false);
  useEffect(() => {
    setOpen(null);
    setPeek(null);
  }, [resetKey]);
  const close = useCallback(() => {
    setOpen(cur => {
      if (cur !== null && document.activeElement?.closest('.card-bubble')) requestAnimationFrame(() => refs.current[cur]?.focus({ preventScroll: true }));
      return null;
    });
  }, []);
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('.card-bubble, .ft-card')) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  /** Bulle ouverte au clavier : son premier bouton reçoit le focus dès qu'elle est posée (`ready`). */
  const useKeyFocus = (ready: boolean) =>
    useEffect(() => {
      if (!ready || !keyOpen.current || !primary.current) return;
      keyOpen.current = false;
      primary.current.focus({ preventScroll: true });
    }, [ready, open]);
  /** Props d'une carte : clic (bascule), survol à la souris, focus clavier. */
  const cardProps = (i: number, onOpen?: () => void) => ({
    ref: (el: HTMLButtonElement | null) => {
      refs.current[i] = el;
    },
    'aria-expanded': open === i,
    onClick: (e: React.MouseEvent) => {
      keyOpen.current = e.detail === 0;
      setPeek(null);
      setOpen(cur => (cur === i ? null : i));
      onOpen?.();
    },
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setPeek(i),
    onPointerLeave: () => setPeek(cur => (cur === i ? null : cur)),
    onFocus: (e: React.FocusEvent<HTMLButtonElement>) => e.currentTarget.matches(':focus-visible') && setPeek(i),
    onBlur: () => setPeek(cur => (cur === i ? null : cur)),
  });
  return { open, setOpen, peek, refs, primary, close, cardProps, useKeyFocus };
}

/** Carte retirée du jeu (ancienne partie) : un emplacement neutre, nommé par son identifiant. */
function RetiredCard({ id, used }: { id: string; used: boolean }) {
  return (
    <div className={`ft-card ro retired ${used ? 'used' : ''}`} title="Carte retirée du jeu">
      <span className="ft-card-txt">
        <b>{id}</b>
        <small>{used ? 'Utilisée' : 'Carte retirée du jeu'}</small>
      </span>
    </div>
  );
}

/** Main adverse (ou des deux camps en relecture) : visible, en lecture seule, cartes jouées grisées. */
export function HandView({ state, color, title = `Cartes des ${sideName(color)}`, compact }: { state: GameState; color: Color; title?: string; compact?: boolean }) {
  const hand = state.hands[color];
  const b = useCardBubbles(state);
  const shown = b.open ?? b.peek;
  const pos = useAnchoredBubble(shown !== null ? b.refs.current[shown] ?? null : null, 'above');
  b.useKeyFocus(!!pos);
  if (!hand.length) return null;
  const rules = rulesOf(state);
  const left = hand.filter(h => !h.used).length;
  const shownCard = shown !== null && isCardId(hand[shown]?.card) ? hand[shown].card : null;
  const id = `ft-bubble-ro-${color}`;
  return (
    <div className={`ft-hand ft-hand-ro ${compact ? 'compact' : ''}`} aria-label={title}>
      <div className="ft-hand-k">{title} · {left ? `${left} en main` : 'toutes jouées'}</div>
      <ul className="ft-hand-row">
        {hand.map((h, i) => {
          if (!isCardId(h.card)) return <li key={i}><RetiredCard id={String(h.card)} used={h.used} /></li>;
          const def = CARDS[h.card];
          return (
            <li key={i}>
              <button
                type="button"
                className={`ft-card ro ${h.used ? 'used' : ''} ${shown === i ? 'is-peek' : ''}`}
                style={{ '--h': def.hue } as CSSProperties}
                aria-label={cardAriaLabel(def, h.used, 'self', rules)}
                aria-describedby={shown === i ? id : undefined}
                {...b.cardProps(i)}
              >
                <span className="ft-card-em sm"><CardEmblem id={h.card} /></span>
                <span className="ft-card-txt">
                  <b>{def.name}</b>
                  {!compact && <TurnPill def={def} rules={rules} className="ft-turn" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shownCard && pos && createPortal(
        <CardBubble
          id={shownCard}
          domId={id}
          mode={b.open === shown ? 'open' : 'read'}
          owner="opponent"
          used={hand[shown!].used}
          rules={rules}
          onCancel={b.open === shown ? b.close : undefined}
          primaryRef={b.primary}
          className={`is-floating ${pos.below ? 'is-below' : ''}`}
          style={pos.style}
        />,
        document.body,
      )}
    </div>
  );
}

export function CardHand({ state, color, targeting, disabled, title = 'Vos cartes' }: { state: GameState; color: Color; targeting: Targeting; disabled?: boolean; title?: string }) {
  const hand = state.hands[color];
  const b = useCardBubbles(state);
  const [seen, setSeen] = useState(readSeen);
  // La règle (carte déjà jouée, budget du tour, cibles…) est celle du moteur : cardPlayable seul
  const playable = useMemo(
    () => hand.map((h, i) => !disabled && isCardId(h.card) && cardPlayable(state, color, i)),
    [hand, disabled, state, color],
  );
  const notes = useMemo(() => handNotes(state, color, !disabled, playable), [state, color, disabled, playable]);
  const shown = targeting.index === null ? b.open ?? b.peek : null;
  const pos = useAnchoredBubble(shown !== null ? b.refs.current[shown] ?? null : null, 'below');
  b.useKeyFocus(!!pos);
  if (!hand.length) return null;
  const rules = rulesOf(state);
  const markSeen = () => {
    if (seen) return;
    setSeen(true);
    writeSeen();
  };
  const shownCard = shown !== null && isCardId(hand[shown]?.card) ? hand[shown].card : null;
  const id = `ft-bubble-${color}`;
  const showInvite = !seen && hand.some(h => !h.used);
  return (
    <div className="ft-hand" aria-label={title}>
      <div className="ft-hand-k">
        {title}
        {state.cardPlayed ? ' · carte jouée ce tour' : ''}
      </div>
      {showInvite && <p className="ft-hand-invite">Touchez une carte pour la lire et la lancer.</p>}
      <div className="ft-hand-row">
        {hand.map((h, i) => {
          if (!isCardId(h.card)) return <RetiredCard key={i} id={String(h.card)} used={h.used} />;
          const def = CARDS[h.card];
          const on = targeting.index === i;
          const props = b.cardProps(i, () => {
            markSeen();
            // Toucher la carte en cours de ciblage l'annule ; une autre carte annule le ciblage en cours
            if (targeting.index !== null) targeting.cancel();
          });
          return (
            <button
              key={i}
              type="button"
              className={`ft-card ${on ? 'on' : ''} ${h.used ? 'used' : ''} ${!h.used && !playable[i] ? 'dim' : ''} ${shown === i ? 'is-peek' : ''}`}
              style={{ '--h': def.hue } as CSSProperties}
              aria-label={cardAriaLabel(def, h.used, 'self', rules)}
              aria-describedby={shown === i ? id : undefined}
              {...props}
              onClick={e => {
                if (on) {
                  targeting.cancel();
                  return;
                }
                props.onClick(e);
              }}
            >
              <span className="ft-card-em"><CardEmblem id={h.card} /></span>
              <span className="ft-card-txt">
                <b>{def.name}</b>
                <TurnPill def={def} rules={rules} className="ft-turn" />
              </span>
            </button>
          );
        })}
      </div>
      {targeting.index !== null && (
        <div className="ft-hand-prompt" role="status">
          <span>{targeting.prompt ?? 'Choisissez une case.'}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={targeting.cancel}>Annuler</button>
        </div>
      )}
      {shownCard && pos && createPortal(
        <CardBubble
          id={shownCard}
          domId={id}
          mode={b.open === shown ? 'open' : 'read'}
          used={hand[shown!].used}
          rules={rules}
          note={notes[shown!]}
          onCast={
            b.open === shown && playable[shown!]
              ? () => {
                  const i = shown!;
                  b.setOpen(null);
                  markSeen();
                  targeting.select(i);
                }
              : undefined
          }
          onCancel={b.open === shown ? b.close : undefined}
          primaryRef={b.primary}
          className={`is-floating ${pos.below ? 'is-below' : ''}`}
          style={pos.style}
        />,
        document.body,
      )}
    </div>
  );
}

export function EffectsLine({ effects }: { effects: Effect[] }) {
  if (!effects.length) return null;
  return (
    <ul className="ft-effects" aria-label="Effets en cours">
      {effects.map(e => {
        if (!isCardId(e.card)) {
          return <li key={e.id}><span><b>{String(e.card)}</b> <small>carte retirée du jeu</small></span></li>;
        }
        const def = CARDS[e.card];
        const who = e.caster === 'w' ? 'Blancs' : 'Noirs';
        const where = e.square !== undefined ? ` en ${sqName(e.square)}` : e.squares?.length ? `, rangée ${rankOf(e.squares[0]) + 1}` : '';
        const when = e.pending
          ? `annoncé, arrive dans ${e.delay ?? 1} coup${(e.delay ?? 1) > 1 ? 's' : ''}`
          : e.permanent
            ? 'jusqu’à la fin de la partie'
            : e.total > 0
              ? `${e.remaining} coup${e.remaining > 1 ? 's' : ''} restant${e.remaining > 1 ? 's' : ''}`
              : 'actif';
        return (
          <li key={e.id} className={e.pending ? 'pending' : ''} style={{ '--h': def.hue } as CSSProperties}>
            <span className="ft-card-em sm"><CardEmblem id={e.card} /></span>
            <span><b>{def.name}{where}</b> <small>{FAMILY_LABEL[def.family]} · {who} · {when}</small></span>
          </li>
        );
      })}
    </ul>
  );
}
