// Éléments de la page de partie : pendules, barres des joueurs, coups joués, effets actifs.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Color, PieceType, VALUE, sanToFrench } from '../../shared/chess';
import { CARDS } from '../../shared/cards';
import type { Effect, GameState, HandCard, LogEntry } from '../../shared/game';
import { describeCardPlay } from '../../shared/game';
import type { ClockView, SeatView } from '../../shared/protocol';
import { CardEmblem } from '../components/CardArt';
import { pieceUrl } from '../components/pieces';
import { playSound } from '../sound';

export function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return `${Math.floor(t / 1000)},${Math.floor((t % 1000) / 100)}`;
  const s = Math.ceil(t / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function useClock(clock: ClockView | null, color: Color, receivedAt: number): number | null {
  const [, force] = useState(0);
  const running = clock?.running === color;
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => force(x => x + 1), 100);
    return () => clearInterval(i);
  }, [running]);
  if (!clock) return null;
  let t = clock[color];
  if (running) t -= (Date.now() - receivedAt) * clock.rate[color];
  return t;
}

export function Clock({ clock, color, receivedAt, active }: { clock: ClockView | null; color: Color; receivedAt: number; active: boolean }) {
  const ms = useClock(clock, color, receivedAt);
  const warned = useRef(false);
  const low = ms !== null && ms < 20_000;
  useEffect(() => {
    if (ms === null) return;
    if (active && ms < 10_000 && ms > 0 && !warned.current) {
      warned.current = true;
      playSound('low');
    }
    if (ms > 12_000) warned.current = false;
  }, [ms, active]);
  if (ms === null) return null;
  const warp = clock && clock.rate[color] > 1;
  return (
    <div className={`clock ${active ? 'on' : ''} ${low ? 'low' : ''} ${warp ? 'warp' : ''}`} aria-label="Pendule">
      {warp && <span className="warp-badge" title="Distorsion temporelle : la pendule s'écoule deux fois plus vite">×2</span>}
      {formatClock(ms)}
    </div>
  );
}

function CapturedRow({ pieces, color, advantage }: { pieces: PieceType[]; color: Color; advantage: number }) {
  const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  const sorted = [...pieces].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className="captured">
      {sorted.map((t, i) => (
        <span key={i} className="cap" style={{ backgroundImage: pieceUrl(color, t) }} />
      ))}
      {advantage > 0 && <span className="adv">+{advantage}</span>}
    </div>
  );
}

export function material(state: GameState, c: Color): number {
  let m = 0;
  for (const p of state.pos.board) if (p && p.c === c) m += VALUE[p.t];
  return m;
}

export function PlayerBar(props: {
  seat: SeatView | null;
  color: Color;
  state: GameState;
  clock: ClockView | null;
  receivedAt: number;
  active: boolean;
  hand: HandCard[];
  showHand: boolean;
  emote?: string | null;
  away?: number | null;
  ratingDiff?: number | null;
}) {
  const { seat, color, state, clock, receivedAt, active, hand, showHand, emote, away, ratingDiff } = props;
  const opp: Color = color === 'w' ? 'b' : 'w';
  const adv = Math.round((material(state, color) - material(state, opp)) / 100);
  return (
    <div className={`player-bar ${active ? 'active' : ''}`}>
      <div className={`pb-avatar ${color}`}>
        {seat?.kind === 'bot' ? '✦' : (seat?.name ?? '?')[0]?.toUpperCase()}
        {seat && <span className={`dot ${seat.online && away == null ? 'on' : ''}`} />}
      </div>
      <div className="pb-main">
        <div className="pb-name">
          {seat?.username ? <Link to={`/joueur/${seat.username}`}>{seat.name}</Link> : <span>{seat?.name ?? 'En attente…'}</span>}
          {seat?.rating != null && <span className="pb-rating">{seat.rating}</span>}
          {ratingDiff != null && <span className={`pb-diff ${ratingDiff >= 0 ? 'up' : 'down'}`}>{ratingDiff >= 0 ? '+' : ''}{ratingDiff}</span>}
          {seat?.kind === 'guest' && <span className="badge">Invité</span>}
        </div>
        <CapturedRow pieces={state.captured[opp]} color={opp} advantage={adv} />
      </div>
      {showHand && (
        <div className="pb-hand" aria-label="Cartes">
          {hand.map((h, i) =>
            h.used && h.card ? (
              <span key={i} className="mini-card used" title={`${CARDS[h.card].name} (utilisée)`} style={{ '--h': CARDS[h.card].hue } as React.CSSProperties}>
                <CardEmblem id={h.card} />
              </span>
            ) : (
              <span key={i} className="mini-card back" title="Carte cachée" />
            ),
          )}
        </div>
      )}
      <Clock clock={clock} color={color} receivedAt={receivedAt} active={active} />
      {emote && <div className="emote-bubble">{emote}</div>}
    </div>
  );
}

export function MoveList({ log }: { log: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [log.length]);
  const rows: { n: number; w: LogEntry[]; b: LogEntry[] }[] = [];
  let n = 1;
  let cur: { n: number; w: LogEntry[]; b: LogEntry[] } | null = null;
  for (const e of log) {
    if (!cur) {
      cur = { n, w: [], b: [] };
      rows.push(cur);
    }
    cur[e.c].push(e);
    if (e.k === 'move' && e.c === 'b' && !e.undone) {
      n++;
      cur = null;
    }
  }
  return (
    <div className="moves" ref={ref}>
      {!log.length && <div className="moves-empty">Les coups et les sorts apparaîtront ici.</div>}
      {rows.map(r => (
        <div className="mv-row" key={r.n + ':' + r.w.length + ':' + r.b.length}>
          <span className="mv-n">{r.n}.</span>
          <span className="mv-cell">{r.w.map((e, i) => <Entry key={i} e={e} />)}</span>
          <span className="mv-cell">{r.b.map((e, i) => <Entry key={i} e={e} />)}</span>
        </div>
      ))}
    </div>
  );
}

function Entry({ e }: { e: LogEntry }) {
  if (e.k === 'move') return <span className={`mv ${e.undone ? 'undone' : ''}`}>{sanToFrench(e.san)}</span>;
  const def = CARDS[e.card];
  return (
    <span className="mv-card" style={{ '--h': def.hue } as React.CSSProperties} title={describeCardPlay(e.card, e.targets)}>
      <CardEmblem id={e.card} />
      {def.name}
    </span>
  );
}

export function EffectsList({ effects, you }: { effects: Effect[]; you: Color | null }) {
  if (!effects.length) return null;
  return (
    <div className="effects-list">
      {effects.map(e => {
        const def = CARDS[e.card];
        const mine = you ? e.caster === you : e.caster === 'w';
        const who = you ? (mine ? 'Ton sort' : 'Sort adverse') : e.caster === 'w' ? 'Blancs' : 'Noirs';
        const unit = e.countsOn === e.caster ? 'ce tour' : `${e.remaining} coup${e.remaining > 1 ? 's' : ''} ${you ? (e.countsOn === you ? 'à toi' : 'adverse' + (e.remaining > 1 ? 's' : '')) : ''}`;
        return (
          <div key={e.id} className={`effect-chip ${mine ? 'mine' : 'theirs'}`} style={{ '--h': def.hue } as React.CSSProperties}>
            <CardEmblem id={e.card} />
            <div>
              <b>{def.name}</b>
              <small>{who} · {unit}</small>
            </div>
            <div className="effect-pips">
              {Array.from({ length: e.total }, (_, i) => <i key={i} className={i < e.remaining ? 'on' : ''} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
