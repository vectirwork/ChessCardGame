// Mains de cartes des leçons, des problèmes et de l'analyse (les deux mains sont visibles : la sienne, jouable,
// et celle de l'adversaire, en lecture seule, cartes jouées grisées), ciblage compris, et liste sobre des effets
// en cours. Une carte retirée du jeu (ancienne partie relue) s'affiche par son identifiant, sans planter.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { CardEmblem } from '../components/CardArt';
import { CARDS, CardId, FAMILY_LABEL, isCardId } from '../../shared/cards';
import { rankOf, sqName } from '../../shared/chess';
import type { Color } from '../../shared/chess';
import { Effect, GameState, cardOptions, cardPlayable } from '../../shared/game';

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
  if (!hand.length) return null;
  const left = hand.filter(h => !h.used).length;
  return (
    <div className={`ft-hand ft-hand-ro ${compact ? 'compact' : ''}`} aria-label={title}>
      <div className="ft-hand-k">{title} · {left ? `${left} en main` : 'toutes jouées'}</div>
      <ul className="ft-hand-row">
        {hand.map((h, i) => {
          if (!isCardId(h.card)) return <li key={i}><RetiredCard id={String(h.card)} used={h.used} /></li>;
          const def = CARDS[h.card];
          return (
            <li key={i}>
              <div className={`ft-card ro ${h.used ? 'used' : ''}`} style={{ '--h': def.hue } as CSSProperties} title={`${def.name}${h.used ? ' (jouée)' : ''} : ${def.description}`}>
                <span className="ft-card-em sm"><CardEmblem id={h.card} /></span>
                <span className="ft-card-txt">
                  <b>{def.name}</b>
                  <small>{h.used ? 'Jouée' : def.tagline}</small>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CardHand({ state, color, targeting, disabled, title = 'Vos cartes' }: { state: GameState; color: Color; targeting: Targeting; disabled?: boolean; title?: string }) {
  const hand = state.hands[color];
  if (!hand.length) return null;
  return (
    <div className="ft-hand" aria-label={title}>
      <div className="ft-hand-k">{title}{state.cardPlayed ? ' · carte jouée ce tour' : ''}</div>
      <div className="ft-hand-row">
        {hand.map((h, i) => {
          if (!isCardId(h.card)) return <RetiredCard key={i} id={String(h.card)} used={h.used} />;
          const def = CARDS[h.card];
          const playable = !disabled && !h.used && !state.cardPlayed && cardPlayable(state, color, i);
          const on = targeting.index === i;
          return (
            <button
              key={i}
              type="button"
              className={`ft-card ${on ? 'on' : ''} ${h.used ? 'used' : ''}`}
              style={{ '--h': def.hue } as CSSProperties}
              disabled={!playable && !on}
              aria-pressed={on}
              onClick={() => targeting.select(i)}
              title={def.description}
            >
              <span className="ft-card-em"><CardEmblem id={h.card} /></span>
              <span className="ft-card-txt">
                <b>{def.name}</b>
                <small>{h.used ? 'Utilisée' : def.tagline}</small>
              </span>
              {(def.presage || def.ritual) && <span className="ft-card-tag">{def.presage ? 'Présage' : 'Rituel'}</span>}
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
