// Choix des cartes au début d'une vraie partie (décision D5, docs/PLAN-V2.md), en plein écran par-dessus la partie.
//
// Le serveur ouvre la phase de choix (GameView.draft, voir DraftView dans src/shared/protocol.ts) : chaque joueur
// choisit trois cartes différentes de la réserve, sur leur règle, en 45 secondes. Sa sélection est envoyée au fil
// de l'eau comme provisoire (gardée si le temps manque), puis validée par « Valider mes cartes ». Les choix restent
// secrets jusqu'à ce que les deux aient validé ; les deux mains sont alors révélées un court instant, puis la partie
// commence. Un spectateur voit la réserve et qui a choisi.
//
// Clavier : Tab ou flèches pour parcourir les cartes, Espace ou Entrée pour choisir, touches 1 à 8 en raccourci.
// Mobile : une colonne, barre de validation collée en bas. Animations : transform et opacity, figées si l'utilisateur
// réduit les animations.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as RKeyboardEvent } from 'react';
import { opposite } from '../../shared/chess';
import type { Color } from '../../shared/chess';
import { CARDS, FAMILY_LABEL } from '../../shared/cards';
import type { CardDef, CardId } from '../../shared/cards';
import type { Ack, DraftView, GameView, SeatView } from '../../shared/protocol';
import { CardEmblem } from '../components/CardArt';
import { SpellCard } from '../components/SpellCard';
import { emitAck } from '../socket';
import { playSound } from '../sound';
import { modeLabel, tcLabel } from './parts';
import './draft.css';

const DRAFT_TOTAL_MS = 45_000;
/** Durée d'affichage des mains révélées avant de laisser place à la partie. */
const REVEAL_MS = 5200;

const WORDS = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
const word = (n: number) => WORDS[n] ?? String(n);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Famille, mot-clé et durée, en clair : « Climat · Présage · 3 coups ». */
function cardMeta(def: CardDef): string {
  const key = def.presage ? 'Présage' : def.ritual ? 'Rituel' : def.permanent && def.family === 'terrain' ? 'Permanent' : null;
  const dur = def.permanent && def.family === 'terrain' ? 'toute la partie' : def.duration.replace(/\s*\(.*\)\s*$/, '');
  return [FAMILY_LABEL[def.family], key, dur.charAt(0).toLowerCase() + dur.slice(1)].filter(Boolean).join(' · ');
}

const seatName = (seat: SeatView | null, c: Color) => seat?.name ?? (c === 'w' ? 'Les Blancs' : 'Les Noirs');

/** Garde le focus clavier dans le dialogue plein écran (la partie, dessous, est cachée). */
function trapTab(e: RKeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (e.shiftKey && (at === first || !e.currentTarget.contains(at))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
}

export interface CardDraftProps {
  view: GameView;
  /** Heure locale de réception de la vue : le compte à rebours ne dépend pas de l'horloge du serveur. */
  receivedAt: number;
  /** Annuler la partie (pendant le choix, sans effet sur le classement). */
  onAbort: () => void;
}

/**
 * Écran de choix (pendant `view.draft`), puis mains révélées quelques secondes. Ne dessine rien le reste du temps :
 * GamePage peut le rendre en permanence.
 */
export function CardDraft({ view, receivedAt, onAbort }: CardDraftProps) {
  const draft = view.draft;
  const you = view.you;
  const [reveal, setReveal] = useState<{ auto: boolean } | null>(null);
  const last = useRef<{ draft: DraftView; deadline: number } | null>(null);
  /** Choix validé depuis cet onglet (contre l'IA, la validation révèle aussitôt : aucune vue intermédiaire). */
  const submitted = useRef(false);

  // Fin du choix : la vue suivante n'a plus de `draft` et porte les deux mains.
  useEffect(() => {
    if (draft) {
      last.current = { draft, deadline: receivedAt + draft.msLeft };
      return;
    }
    const prev = last.current;
    last.current = null;
    if (prev && view.status === 'active' && !view.state.result) {
      // Complétées au hasard : pas de choix validé, et la révélation arrive à l'échéance (pas avant).
      const auto = !!you && !prev.draft.chosen[you] && !submitted.current && Date.now() >= prev.deadline - 1500;
      submitted.current = false;
      setReveal({ auto });
      playSound('start');
    }
  }, [draft, receivedAt, view.status, view.state.result, you]);

  useEffect(() => {
    if (!reveal) return;
    const t = window.setTimeout(() => setReveal(null), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [reveal]);

  if (draft && view.status === 'active') {
    return (
      <DraftScreen key={view.id} view={view} draft={draft} receivedAt={receivedAt} onAbort={onAbort} onSubmitted={on => (submitted.current = on)} />
    );
  }
  if (reveal && view.status === 'active' && !view.state.result) return <Reveal view={view} auto={reveal.auto} onDone={() => setReveal(null)} />;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Choix

function DraftScreen({ view, draft, receivedAt, onAbort, onSubmitted }: {
  view: GameView; draft: DraftView; receivedAt: number; onAbort: () => void; onSubmitted: (on: boolean) => void;
}) {
  const you = view.you;
  const spectator = !you;
  const opp: Color = you ? opposite(you) : 'b';
  const oppSeat = view.seats[opp];
  const count = draft.count;
  const confirmed = !!you && draft.chosen[you];
  const [sel, setSel] = useState<CardId[]>(() => draft.mine.filter(c => draft.pool.includes(c)).slice(0, count));
  const [submitted, setSubmitted] = useState(confirmed);
  const [sending, setSending] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [abortArmed, setAbortArmed] = useState(false);
  const titleId = useId();
  const gridRef = useRef<HTMLUListElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(false);
  const locked = spectator || confirmed || submitted || expired;
  const deadline = receivedAt + draft.msLeft;

  // Choix validé (par cet onglet ou un autre) : les cartes du serveur font foi.
  const mineKey = draft.mine.join();
  useEffect(() => {
    if (confirmed) {
      setSel(draft.mine.slice());
      setSubmitted(true);
    }
  }, [confirmed, mineKey]); // draft.mine : suivi par sa clé

  // L'adversaire vient de valider : un signal discret.
  const oppChosen = draft.chosen[opp];
  const oppWas = useRef(oppChosen);
  useEffect(() => {
    if (oppChosen && !oppWas.current && !spectator) playSound('notify');
    oppWas.current = oppChosen;
  }, [oppChosen, spectator]);

  // Sélection provisoire envoyée au serveur (secrète) : si le temps manque, elle est complétée, pas remplacée.
  useEffect(() => {
    if (!dirty.current || locked || sending) return;
    const t = window.setTimeout(() => {
      void emitAck<Ack>('game:draft', { id: view.id, cards: sel, confirm: false }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(t);
  }, [sel, locked, sending, view.id]);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!abortArmed) return;
    const t = window.setTimeout(() => setAbortArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [abortArmed]);

  const toggle = useCallback(
    (id: CardId) => {
      if (locked) return;
      setError(null);
      if (sel.includes(id)) {
        dirty.current = true;
        setSel(sel.filter(c => c !== id));
        setNote(null);
        playSound('select');
        return;
      }
      if (sel.length >= count) {
        setNote(`Vous avez déjà ${word(count)} cartes : retirez-en une pour en prendre une autre.`);
        playSound('error');
        return;
      }
      dirty.current = true;
      const next = [...sel, id];
      setSel(next);
      setNote(next.length === count ? 'Trois cartes choisies : validez-les quand vous êtes prêt.' : null);
      playSound('select');
    },
    [locked, sel, count],
  );

  const validate = async () => {
    if (locked || sending || sel.length !== count) return;
    setSending(true);
    setError(null);
    // Le serveur révèle les mains avant de répondre (contre l'IA, ou si l'adversaire a déjà choisi) : le choix est
    // marqué validé avant l'envoi, puis démarqué en cas de refus.
    onSubmitted(true);
    try {
      const r = await emitAck<Ack>('game:draft', { id: view.id, cards: sel, confirm: true });
      if (r.ok) {
        setSubmitted(true);
        setNote(null);
      } else {
        onSubmitted(false);
        setError(r.error ?? 'Choix refusé.');
        playSound('error');
      }
    } catch (e) {
      onSubmitted(false);
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // Clavier : flèches entre les cartes (selon le nombre de colonnes affichées), chiffres pour choisir directement.
  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    trapTab(e);
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tiles = [...(gridRef.current?.querySelectorAll<HTMLElement>('.cd-tile') ?? [])];
    const at = tiles.indexOf(document.activeElement as HTMLElement);
    if (/^[1-9]$/.test(e.key) && !locked) {
      const id = draft.pool[Number(e.key) - 1];
      if (id) {
        e.preventDefault();
        toggle(id);
        tiles[Number(e.key) - 1]?.focus();
      }
      return;
    }
    if (at < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const first = tiles[0]?.getBoundingClientRect().top ?? 0;
    const cols = Math.max(1, tiles.filter(t => Math.abs(t.getBoundingClientRect().top - first) < 4).length);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, Home: -at, End: tiles.length - 1 - at }[e.key] ?? 0;
    const next = Math.min(tiles.length - 1, Math.max(0, at + step));
    if (next !== at) {
      e.preventDefault();
      tiles[next].focus();
    }
  };

  // Le Sablier fou n'est pas dans la réserve contre l'IA ni sans pendule : on le dit, pour qu'on ne le cherche pas.
  const excluded = draft.pool.includes('hourglass')
    ? ''
    : view.mode === 'bot'
      ? ' Le Sablier fou n’est pas proposé contre l’IA.'
      : ' Le Sablier fou n’est pas proposé dans une partie sans pendule.';
  const oppLabel = seatName(oppSeat, opp);
  const vsBot = oppSeat?.kind === 'bot';

  let status: string;
  if (spectator) {
    const w = seatName(view.seats.w, 'w');
    const b = seatName(view.seats.b, 'b');
    status = `${w} : ${draft.chosen.w ? 'cartes choisies' : 'choisit…'} · ${b} : ${draft.chosen.b ? 'cartes choisies' : 'choisit…'}`;
  } else status = oppChosen ? `${oppLabel} a choisi ses cartes.` : `${oppLabel} choisit ses cartes…`;

  return (
    <div className="cd" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="cd-inner">
        <header className="cd-head">
          <p className="cd-kick">
            Choix des cartes · {modeLabel(view)} · {tcLabel(view.clock)}
          </p>
          <h2 className="cd-title" id={titleId} ref={titleRef} tabIndex={-1}>
            {spectator ? (
              <>
                Les joueurs choisissent leurs <em>cartes</em>.
              </>
            ) : (
              <>
                Choisissez vos <em>{word(count)}</em> cartes.
              </>
            )}
          </h2>
          <p className="cd-sub">
            {spectator
              ? `Chacun prend ${word(count)} cartes parmi ces ${word(draft.pool.length)} pouvoirs. Les mains seront révélées quand les deux auront choisi.`
              : vsBot
                ? `${cap(word(draft.pool.length))} pouvoirs, les mêmes pour vous deux. Lisez leur règle, prenez-en ${word(count)} : ${oppLabel} a choisi les siennes en secret, et les deux mains seront révélées dès votre choix.${excluded}`
                : `${cap(word(draft.pool.length))} pouvoirs, les mêmes pour vous deux. Lisez leur règle, prenez-en ${word(count)} : votre choix reste secret jusqu’à ce que votre adversaire ait choisi aussi, puis les deux mains sont visibles de tous.${excluded}`}
          </p>
          {!spectator && (
            <p className="cd-keys" aria-hidden="true">
              Clavier : flèches pour parcourir, Espace pour choisir, 1 à {draft.pool.length} en raccourci.
            </p>
          )}
        </header>

        <ul className="cd-grid" ref={gridRef} aria-label={spectator ? 'Réserve de la partie' : 'Cartes à choisir'}>
          {draft.pool.map((id, i) => {
            const def = CARDS[id];
            if (!def) return null;
            const order = sel.indexOf(id);
            const on = order >= 0;
            const content = (
              <>
                <span className="cd-top">
                  <span className="cd-art" aria-hidden="true">
                    <SpellCard id={id} size="mini" tilt={false} className="cd-sc" />
                  </span>
                  <span className="cd-id">
                    <span className="cd-name" id={`cd-n-${id}`}>
                      {def.name}
                    </span>
                    <span className="cd-meta" id={`cd-m-${id}`}>
                      {cardMeta(def)}
                    </span>
                    <span className={`cd-turn ${def.ritual ? 'is-replace' : ''}`} id={`cd-t-${id}`}>
                      {def.ritual ? 'Remplace votre coup' : '+ votre coup'}
                    </span>
                  </span>
                </span>
                <span className="cd-rule" id={`cd-r-${id}`}>
                  {def.description}
                </span>
                {!spectator && (
                  <span className="cd-mark" aria-hidden="true">
                    {on ? order + 1 : <span className="cd-key">{i + 1}</span>}
                  </span>
                )}
              </>
            );
            return (
              <li key={id} style={{ '--h': def.hue, '--i': i } as CSSProperties}>
                {spectator ? (
                  <div className="cd-tile is-static">{content}</div>
                ) : (
                  <button
                    type="button"
                    className={`cd-tile ${on ? 'is-on' : ''} ${locked && !on ? 'is-off' : ''}`}
                    aria-pressed={on}
                    aria-disabled={locked || undefined}
                    aria-labelledby={`cd-n-${id}`}
                    aria-describedby={`cd-m-${id} cd-t-${id} cd-r-${id}`}
                    onClick={() => toggle(id)}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="cd-foot">
          <DraftTimer deadline={deadline} total={DRAFT_TOTAL_MS} warn={!locked} onExpire={() => setExpired(true)} />

          <div className="cd-picked">
            {!spectator && (
              <ol className="cd-slots" aria-label="Vos cartes">
                {Array.from({ length: count }, (_, k) => {
                  const id = sel[k];
                  const def = id ? CARDS[id] : null;
                  return (
                    <li key={k} className={def ? 'is-full' : ''} style={def ? ({ '--h': def.hue } as CSSProperties) : undefined}>
                      {def ? (
                        <>
                          <CardEmblem id={def.id} className="cd-slot-em" />
                          <span className="cd-slot-name">{def.name}</span>
                        </>
                      ) : (
                        <span className="cd-slot-empty">Carte {k + 1}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="cd-status-row">
              <p className={`cd-status ${(spectator ? draft.chosen.w && draft.chosen.b : oppChosen) ? 'is-done' : ''}`} aria-live="polite">
                <span className="cd-dot" aria-hidden="true" />
                {status}
              </p>
              {!spectator && (
                <button
                  type="button"
                  className={`cd-abort ${abortArmed ? 'is-armed' : ''}`}
                  onClick={() => (abortArmed ? onAbort() : setAbortArmed(true))}
                >
                  {abortArmed ? 'Confirmer l’annulation' : 'Annuler la partie'}
                </button>
              )}
            </div>
          </div>

          <div className="cd-actions">
            {spectator ? null : confirmed || submitted ? (
              <p className="cd-wait" role="status">
                <span className="cd-orbit" aria-hidden="true" />
                {oppChosen ? 'Les mains vont être révélées…' : 'Vos cartes sont choisies. En attente de votre adversaire…'}
              </p>
            ) : expired ? (
              <p className="cd-wait" role="status">
                <span className="cd-orbit" aria-hidden="true" />
                Temps écoulé : vos cartes manquantes sont tirées au hasard…
              </p>
            ) : (
              <button type="button" className="btn-gold cd-validate" disabled={sel.length !== count || sending} onClick={() => void validate()}>
                <span className="btn-main">{sending ? 'Validation…' : 'Valider mes cartes'}</span>
                <span className="btn-sub">{sel.length === count ? 'Choix définitif' : `Encore ${word(count - sel.length)} carte${count - sel.length > 1 ? 's' : ''}`}</span>
              </button>
            )}
          </div>
          <p className="cd-live" aria-live="assertive">
            {error ?? note ?? ''}
          </p>
        </footer>
      </div>
    </div>
  );
}

/** Compte à rebours (re-rendu de ce seul élément, une fois par seconde) et barre qui se vide (transform). */
function DraftTimer({ deadline, total, warn, onExpire }: { deadline: number; total: number; warn: boolean; onExpire: () => void }) {
  const secs = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [left, setLeft] = useState(secs);
  const expired = useRef(false);
  const warned = useRef(false);
  useEffect(() => {
    const tick = () => setLeft(secs());
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [deadline]); // secs ne dépend que de deadline
  useEffect(() => {
    if (left <= 0 && !expired.current) {
      expired.current = true;
      onExpire();
    }
    if (left <= 10 && left > 0 && warn && !warned.current) {
      warned.current = true;
      playSound('low');
    }
  }, [left, warn, onExpire]);
  const low = left <= 10;
  // La barre vise la valeur de la seconde suivante, en une transition linéaire d'une seconde.
  const frac = Math.max(0, Math.min(1, (left - 1) / (total / 1000)));
  return (
    <div className={`cd-timer ${low ? 'is-low' : ''}`}>
      <span className="cd-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${frac})` }} />
      </span>
      <span className="cd-digits" role="timer" aria-label={`${left} secondes restantes`}>
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      <span className="cd-timer-cap">{left > 0 ? 'pour choisir' : 'temps écoulé'}</span>
      <span className="cd-sr" aria-live="polite">
        {left === 10 ? 'Plus que dix secondes.' : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Mains révélées

function Reveal({ view, auto, onDone }: { view: GameView; auto: boolean; onDone: () => void }) {
  const you = view.you;
  const first: Color = you ?? 'w';
  const second = opposite(first);
  const s = view.state;
  const titleId = useId();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  const turn = s.pos.turn;
  const turnSeat = view.seats[turn];
  const lead = !you
    ? `Les ${turn === 'w' ? 'Blancs' : 'Noirs'} commencent.`
    : you === turn
      ? 'À vous de commencer : jouez votre premier coup.'
      : `${seatName(turnSeat, turn)} commence.`;
  const label = (c: Color) => (you === c ? 'Vos cartes' : `Cartes de ${seatName(view.seats[c], c)}`);
  return (
    <div className="cd cd-reveal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab} onClick={e => e.target === e.currentTarget && onDone()}>
      <div className="cd-reveal-in">
        <p className="cd-kick">Choix des cartes · terminé</p>
        <h2 className="cd-title" id={titleId}>
          Les mains sont <em>révélées</em>.
        </h2>
        <div className="cd-hands">
          {[first, second].map((c, k) => (
            <section key={c} className="cd-hand" aria-label={label(c)}>
              <p className="cd-hand-label">{label(c)}</p>
              <div className="cd-hand-cards">
                {s.hands[c].map((h, i) =>
                  CARDS[h.card] ? (
                    <div key={i} className="cd-deal" style={{ '--i': k * 3 + i } as CSSProperties}>
                      <SpellCard id={h.card} size="hand" tilt={false} className="cd-sc" />
                    </div>
                  ) : null,
                )}
              </div>
            </section>
          ))}
        </div>
        {auto && <p className="cd-note">Le temps était écoulé : vos cartes manquantes ont été tirées au hasard.</p>}
        <p className="cd-lead">
          {lead} <span>Les deux mains restent visibles jusqu’à la fin de la partie.</span>
        </p>
        <button ref={btn} type="button" className="btn-gold sm" onClick={onDone}>
          Jouer
        </button>
      </div>
    </div>
  );
}
