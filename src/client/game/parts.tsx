// Éléments de la page de partie en ligne (style Odyssée) : pendules, pièces prises, coups joués, sorts en cours
// (Présages annoncés compris), identité des joueurs. Classes gp-* (styles/game.css).
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Color, PieceType, VALUE, sanToFrench } from '../../shared/chess';
import { CARDS, CATALOGS } from '../../shared/cards';
import type { Catalog } from '../../shared/cards';
import type { Rules } from '../../shared/config/rules';
import type { GameState, LogEntry } from '../../shared/game';
import { describeCardPlay } from '../../shared/game';
import type { ClockView, GameView, SeatView } from '../../shared/protocol';
import { tcLabel as tcText } from '../../shared/protocol';
import { DEFAULT_KING, kingStyle, normKing } from '../../shared/catalog';
import { mmss } from '../../shared/text/fr';
import { catalogLabel as catalogName, colorName as colorWord, modeLabel as modeText } from '../../shared/text/libelles';
import { vitesse } from '../../shared/text/regles';
import { CollectionSeal } from '../components/CollectionSeal';
import { crestUrl, pieceUrl } from '../components/pieces';
import { OracleEye } from '../odyssee/shell';
import { playSound } from '../sound';


// ---------------------------------------------------------------------------------------------
// Libellés

export const colorName = (c: Color) => colorWord(c);

export function catalogLabel(c: Catalog): string {
  return catalogName(c, CATALOGS);
}

/** Catalogue en quelques mots (« Pouvoirs », « sans cartes ») pour les surtitres. */
export function catalogTag(c: Catalog): string {
  return c === 'aucune' ? 'sans cartes' : catalogLabel(c);
}

export function catalogDescription(c: Catalog): string {
  return CATALOGS.find(x => x.id === c)?.description ?? '';
}

/** Nature de la partie, pour le badge du haut. La file amicale est une partie « quick » non classée. */
export function modeLabel(view: GameView): string {
  return modeText(view.mode, view.rated);
}

/** Cadence d'une pendule (« 3 + 2 », « Sans limite ») ; hors liste, sans arrondir les minutes (« 1,5 + 0 »). */
export function tcLabel(clock: ClockView | null): string {
  return tcText(clock ? { initial: clock.initial, increment: clock.increment } : null);
}

/** Cadence en toutes lettres (« 10 min + 5 s par coup », « 30 s »). */
export function tcLong(clock: ClockView | null): string {
  return tcText(clock ? { initial: clock.initial, increment: clock.increment } : null, 'long');
}

/** Sous-titre d'un joueur : niveau de l'IA, classement, invité. */
export function seatSub(seat: SeatView | null, color: Color, diff?: number | null): ReactNode {
  if (!seat) return 'Invitation envoyée';
  const parts: ReactNode[] = [];
  if (seat.kind === 'bot') parts.push('IA');
  else if (seat.kind === 'guest') parts.push('Invité');
  if (seat.rating != null && seat.kind !== 'bot') parts.push(`${seat.rating} Elo`);
  parts.push(colorName(color));
  return (
    <>
      {parts.join(' · ')}
      {diff != null && <em className={`gp-diff ${diff >= 0 ? 'up' : 'down'}`}>{diff >= 0 ? `+${diff}` : diff}</em>}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Pendules (exactes : temps restant à l'envoi, moins le temps écoulé depuis la réception, au rythme du joueur)

/** Temps d'une pendule : dixièmes sous 10 s (« 9,4 »), « m:ss » ensuite, « h:mm:ss » au-delà d'une heure. */
export function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return `${Math.floor(t / 1000)},${Math.floor((t % 1000) / 100)}`;
  return mmss(Math.ceil(t / 1000), { heures: true });
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

export function Clock({ clock, color, receivedAt, active, compact }: { clock: ClockView | null; color: Color; receivedAt: number; active: boolean; compact?: boolean }) {
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
  const warp = !!clock && clock.rate[color] > 1;
  // Sablier fou : les coups ne rapportent plus d'incrément, le « +2 » de la cadence est barré
  const noInc = !!clock?.noIncrement && clock.increment > 0;
  return (
    <div
      className={`gp-clock ${active ? 'is-on' : ''} ${low ? 'is-low' : ''} ${warp ? 'is-warp' : ''} ${compact ? 'is-compact' : ''}`}
      role="timer"
      aria-label={`Pendule des ${colorName(color)} : ${formatClock(ms)}`}
    >
      {warp && (
        <span className="gp-warp" title={`Le temps s'écoule ${vitesse(clock!.rate[color])}`}>
          ×{clock!.rate[color]}
        </span>
      )}
      {noInc && (
        <span className="gp-noinc" title="Pas d’incrément pour le moment">
          <s>+{clock!.increment}</s>
        </span>
      )}
      <span className="gp-clock-t">{formatClock(ms)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Pièces prises et avantage matériel

export function material(state: GameState, c: Color): number {
  let m = 0;
  for (const p of state.pos.board) if (p && p.c === c) m += VALUE[p.t];
  return m;
}

/** Pièces prises par `color` (donc de la couleur adverse) et avantage matériel. */
export function Captured({ state, color }: { state: GameState; color: Color }) {
  const opp: Color = color === 'w' ? 'b' : 'w';
  const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  const pieces = [...state.captured[opp]].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const adv = Math.round((material(state, color) - material(state, opp)) / 100);
  if (!pieces.length && adv <= 0) return null;
  return (
    <div className="gp-captured" aria-label="Pièces prises">
      {pieces.map((t, i) => (
        <span key={i} className="gp-cap" style={{ backgroundImage: pieceUrl(opp, t) }} />
      ))}
      {adv > 0 && <span className="gp-adv">+{adv}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Joueurs

/**
 * Pastille d'un joueur : l'œil de l'Oracle pour l'IA ; pour un joueur, le cimier de son roi (crestUrl, dans sa couleur :
 * disque clair pour les Blancs, sombre avec un halo de la gemme pour les Noirs) s'il porte un roi de collection, sinon
 * son initiale (roi Arcane). `king` : le roi dessiné sur l'échiquier (préférence « Rois adverses classiques » comprise),
 * sinon celui du siège. Son sceau de collection se pose en badge en bas à gauche, en miroir du point de présence. Images
 * fixes : des data URI en cache, aucune animation.
 */
export function Avatar({ seat, color, king: shown, sealSize = 16 }: { seat: SeatView | null; color: Color; king?: string; sealSize?: number }) {
  if (seat?.kind === 'bot') return <OracleEye />;
  const king = normKing(shown ?? seat?.king);
  const crest = king !== DEFAULT_KING;
  const face = (
    <span
      className={`gp-avatar ${color} ${crest ? 'has-crest' : ''}`}
      style={crest ? ({ '--crest': crestUrl(king, color), '--gem': kingStyle(king).gem } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {!crest && (seat?.name ?? '·')[0]?.toUpperCase()}
      {seat && <i className={`gp-presence ${seat.online ? 'on' : ''}`} />}
    </span>
  );
  if (!seat?.seal) return face;
  return (
    <span className="gp-avatar-wrap">
      {face}
      <CollectionSeal id={seat.seal} size={sealSize} className="gp-seal" />
    </span>
  );
}

export function SeatName({ seat }: { seat: SeatView | null }) {
  if (!seat) return <>En attente…</>;
  if (seat.username) return <Link to={`/joueur/${seat.username}`}>{seat.name}</Link>;
  return <>{seat.name}</>;
}

export function EmoteBubble({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span className="gp-emote" role="status">
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Coups joués (sorts compris) : une ligne par coup complet, un sort sur sa propre ligne, à sa place dans la partie

type MoveLine =
  | { k: 'pair'; n: number; w?: Extract<LogEntry, { k: 'move' }>; b?: Extract<LogEntry, { k: 'move' }> }
  | { k: 'card'; e: Extract<LogEntry, { k: 'card' }> };

/**
 * Numéro du premier coup d'une partie : 1 depuis la position standard, sinon celui de sa position de départ (FEN,
 * sixième champ).
 */
export function firstMoveNumber(r: Pick<Rules, 'startFen'>): number {
  const n = Number(r.startFen?.trim().split(/\s+/)[5]);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Lignes de la liste des coups ; `first` : numéro du premier coup (firstMoveNumber). */
export function moveLines(log: LogEntry[], first = 1): MoveLine[] {
  const out: MoveLine[] = [];
  let n = first;
  let cur: Extract<MoveLine, { k: 'pair' }> | null = null;
  for (const e of log) {
    if (e.k === 'card') {
      out.push({ k: 'card', e });
      cur = null;
      continue;
    }
    if (e.c === 'w') {
      cur = { k: 'pair', n, w: e };
      out.push(cur);
    } else if (cur && cur.w && !cur.b) {
      cur.b = e;
    } else {
      cur = { k: 'pair', n, b: e };
      out.push(cur);
    }
    if (e.c === 'b' && !e.undone) {
      n++;
      cur = null;
    }
  }
  return out;
}

export function MoveList({ log, first = 1, className = '' }: { log: LogEntry[]; first?: number; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [log.length]);
  if (!log.length) return <p className={`gp-moves-empty ${className}`}>Les coups et les sorts s'inscriront ici.</p>;
  const lines = moveLines(log, first);
  return (
    <ol className={`gp-moves ${className}`} ref={ref} aria-label="Coups joués">
      {lines.map((l, i) => {
        const last = i === lines.length - 1;
        if (l.k === 'card') {
          const def = CARDS[l.e.card];
          if (!def) return null;
          return (
            <li key={i} className={`gp-mv-line is-card ${l.e.undone ? 'is-undone' : ''}`} style={{ '--h': def.hue } as CSSProperties} title={describeCardPlay(l.e.card, l.e.targets)}>
              <span className="gp-mv-n" aria-hidden="true" />
              <span className="gp-mv-card">
                <i aria-hidden="true" />
                <span className="gp-mv-card-name">{def.name}</span>
                <small>{colorName(l.e.c)}</small>
              </span>
            </li>
          );
        }
        return (
          <li key={i} className={`gp-mv-line ${last ? 'is-last' : ''}`}>
            <span className="gp-mv-n">{l.w ? `${l.n}.` : `${l.n}…`}</span>
            <span className={`gp-mv ${l.w?.undone ? 'is-undone' : ''}`}>{l.w ? sanToFrench(l.w.san) : ''}</span>
            <span className={`gp-mv ${l.b?.undone ? 'is-undone' : ''}`}>{l.b ? sanToFrench(l.b.san) : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

