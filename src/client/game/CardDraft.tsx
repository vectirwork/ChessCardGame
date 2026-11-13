// Choix des cartes au début d'une vraie partie (décision D5, docs/PLAN-V2.md), en plein écran par-dessus la partie.
//
// Le serveur ouvre la phase de choix (GameView.draft, voir DraftView dans src/shared/protocol.ts) : chaque joueur
// choisit ses cartes (DraftView.count) parmi la réserve, sur leur règle, dans le temps du choix (DraftView.totalMs,
// DEAL.draftMs). Sa sélection est envoyée au fil de l'eau comme provisoire (gardée si le temps manque), puis validée
// par « Valider mes cartes ». Les choix restent secrets jusqu'à ce que les deux aient validé ; les deux mains sont
// alors révélées un court instant, puis la partie commence. Un spectateur voit la réserve et qui a choisi.
//
// Fin du choix : le serveur dit (événement `reveal`, passé par GamePage) qui a reçu des cartes au hasard ; la note de
// la révélation ne s'affiche que pour lui. DRAFT_LOCK_MS avant l'échéance, le choix se verrouille et la sélection part
// aussitôt : une carte choisie au dernier moment n'est plus remplacée en silence.
//
// Clavier : Tab ou flèches pour parcourir les cartes, Espace ou Entrée pour choisir, touches 1 à 9 en raccourci (les
// 9 premières cartes). Mobile : une colonne, barre de validation collée en bas. Animations : transform et opacity,
// figées si l'utilisateur réduit les animations. Phrases et décisions pures : ./draftText.ts.
//
// Règles : celles de la partie (rulesOf(view.state)), jamais celles du jour : pastilles « Remplace votre coup » (carte
// à la place du coup), moment d'action (délai des Présages), durée et règle (équilibrage de la partie).
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as RKeyboardEvent } from 'react';
import { opposite } from '../../shared/chess';
import type { Color } from '../../shared/chess';
import { CARDS, cardsOf } from '../../shared/cards';
import type { CardId } from '../../shared/cards';
import { DEAL } from '../../shared/config/rules';
import { catalogOf } from '../../shared/game';
import type { Ack, DraftView, GameView, SeatView } from '../../shared/protocol';
import { rulesOf } from '../../shared/rulesCore';
import { colorName } from '../../shared/text/libelles';
import { CardEmblem } from '../components/CardArt';
import { SpellCard, ruleBody } from '../components/SpellCard';
import { CardScene, scenePaired } from '../components/CardScene';
import { REF_HAND } from '../odyssee/shell/layout';
import { emitAck } from '../socket';
import { playSound } from '../sound';
import {
  DRAFT_LOCK_MS, attenteAdversaire, cardMeta, cartesChoisies, cartesDe, choixComplet, dealOrder, dejaComplet, draftClosing, encore,
  excludedNote, expiration, gridColumns, noteRevelation, revealNote, sesCartes, shortcutCount, shortcutIndex, sousTitre, tilePills,
  titreChoix, titreSpectateur, vosCartesLabel,
} from './draftText';
import type { RevealEvent } from './draftText';
import { deNom } from './names';
import { modeLabel, tcLabel } from './parts';
import './draft.css';

/** Durée d'affichage des mains révélées avant de laisser place à la partie. */
const REVEAL_MS = 5200;

const seatName = (seat: SeatView | null, c: Color) => seat?.name ?? `Les ${colorName(c)}`;

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
  /** Dernier événement `reveal` de la partie (GamePage) : qui a reçu des cartes au hasard. */
  reveal?: RevealEvent | null;
}

/**
 * Écran de choix (pendant `view.draft`), puis mains révélées quelques secondes. Ne dessine rien le reste du temps :
 * GamePage peut le rendre en permanence.
 */
export function CardDraft({ view, receivedAt, onAbort, reveal: revealEvent }: CardDraftProps) {
  const draft = view.draft;
  const you = view.you;
  const [reveal, setReveal] = useState<{ auto: boolean; count: number } | null>(null);
  const last = useRef<{ draft: DraftView; deadline: number } | null>(null);
  /** Choix validé depuis cet onglet (contre l'IA, la validation révèle aussitôt : aucune vue intermédiaire). */
  const submitted = useRef(false);
  /** Événement de fin du choix : il arrive avec la vue qui révèle les mains (même rendu). */
  const event = useRef(revealEvent);
  event.current = revealEvent;

  // Fin du choix : la vue suivante n'a plus de `draft` et porte les deux mains.
  useEffect(() => {
    if (draft) {
      last.current = { draft, deadline: receivedAt + draft.msLeft };
      return;
    }
    const prev = last.current;
    last.current = null;
    if (prev && view.status === 'active' && !view.state.result) {
      // Complétées au hasard : le serveur le dit (filled) ; sinon, l'heuristique d'avant (pas de choix validé, et la
      // révélation arrive à l'échéance, pas avant).
      const auto = revealNote(you, event.current, () => !!you && !prev.draft.chosen[you] && !submitted.current && Date.now() >= prev.deadline - 1500);
      submitted.current = false;
      setReveal({ auto, count: prev.draft.count });
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
  if (reveal && view.status === 'active' && !view.state.result) return <Reveal view={view} auto={reveal.auto} count={reveal.count} onDone={() => setReveal(null)} />;
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
  // Règles de la partie (pastilles, moment d'action, durée et règle des cartes), pas celles du jour
  const rules = rulesOf(view.state);
  const confirmed = !!you && draft.chosen[you];
  const [sel, setSel] = useState<CardId[]>(() => draft.mine.filter(c => draft.pool.includes(c)).slice(0, count));
  const [submitted, setSubmitted] = useState(confirmed);
  const [sending, setSending] = useState(false);
  /** Tuile dont la scène s'anime : survolée à la souris, au focus clavier, ou touchée en dernier. */
  const [peek, setPeek] = useState<CardId | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [abortArmed, setAbortArmed] = useState(false);
  const titleId = useId();
  const gridRef = useRef<HTMLUListElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(false);
  /** Sélection que le serveur connaît (provisoire ou validée), sous forme de clé. */
  const sent = useRef(draft.mine.join());
  const deadline = receivedAt + draft.msLeft;
  // Peu avant l'échéance locale, le choix se verrouille (la sélection part aussitôt, voir plus bas)
  const [closing, setClosing] = useState(() => draftClosing(deadline, Date.now()));
  const locked = spectator || confirmed || submitted || expired || closing;
  // Nouvelle échéance dans le futur (le serveur a redémarré pendant le choix et redonne tout le temps) : le choix rouvre.
  useEffect(() => {
    const now = Date.now();
    if (deadline > now) setExpired(false);
    const shut = draftClosing(deadline, now);
    setClosing(shut);
    if (shut) return;
    const t = window.setTimeout(() => setClosing(true), deadline - DRAFT_LOCK_MS - now);
    return () => window.clearTimeout(t);
  }, [deadline]);

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
  const sendProvisional = useCallback(
    (cards: CardId[]) => {
      sent.current = cards.join();
      void emitAck<Ack>('game:draft', { id: view.id, cards, confirm: false }).catch(() => undefined);
    },
    [view.id],
  );
  useEffect(() => {
    if (!dirty.current || locked || sending) return;
    const t = window.setTimeout(() => sendProvisional(sel), 300);
    return () => window.clearTimeout(t);
  }, [sel, locked, sending, sendProvisional]);
  // Verrou avant l'échéance : la dernière sélection part aussitôt (son envoi différé vient d'être annulé)
  useEffect(() => {
    if (!closing || spectator || confirmed || submitted || sending || !dirty.current) return;
    if (sel.join() !== sent.current) sendProvisional(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

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
        setNote(dejaComplet(count));
        playSound('error');
        return;
      }
      dirty.current = true;
      const next = [...sel, id];
      setSel(next);
      setNote(next.length === count ? choixComplet(count) : null);
      playSound('select');
    },
    [locked, sel, count],
  );

  const validate = async () => {
    if (locked || sending || sel.length !== count) return;
    setSending(true);
    setError(null);
    // La sélection part aussitôt (son envoi différé s'annule avec `sending`) : si la validation arrive après la clôture
    // du choix, le serveur a déjà les bonnes cartes.
    if (sel.join() !== sent.current) sendProvisional(sel);
    // Le serveur révèle les mains avant de répondre (contre l'IA, ou si l'adversaire a déjà choisi) : le choix est
    // marqué validé avant l'envoi, puis démarqué en cas de refus.
    onSubmitted(true);
    try {
      const r = await emitAck<Ack>('game:draft', { id: view.id, cards: sel, confirm: true });
      if (r.ok) {
        sent.current = sel.join();
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
      const k = shortcutIndex(e.key, draft.pool.length);
      if (k !== null) {
        e.preventDefault();
        toggle(draft.pool[k]);
        tiles[k]?.focus();
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

  // Cartes absentes de la réserve (le Sablier fou contre l'IA ou sans pendule) : on le dit, pour qu'on ne les cherche pas.
  const excluded = excludedNote(cardsOf(catalogOf(view.state)), draft.pool, { vsBot: view.mode === 'bot', timed: view.state.timed });
  const oppLabel = seatName(oppSeat, opp);
  const vsBot = oppSeat?.kind === 'bot';
  const title = spectator ? titreSpectateur(count) : titreChoix(count);
  const cols = gridColumns(draft.pool.length);
  const keys = shortcutCount(draft.pool.length);

  let status: string;
  if (spectator) {
    const w = seatName(view.seats.w, 'w');
    const b = seatName(view.seats.b, 'b');
    status = `${w} : ${draft.chosen.w ? cartesChoisies(count) : 'choisit…'} · ${b} : ${draft.chosen.b ? cartesChoisies(count) : 'choisit…'}`;
  } else status = oppChosen ? `${oppLabel} a choisi ${sesCartes(count)}.` : `${oppLabel} choisit ${sesCartes(count)}…`;

  return (
    <div className="cd" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="cd-inner">
        <header className="cd-head">
          <p className="cd-kick">
            Choix des cartes · {modeLabel(view)} · {tcLabel(view.clock)}
          </p>
          <h2 className="cd-title" id={titleId} ref={titleRef} tabIndex={-1}>
            {title.avant}
            <em>{title.em}</em>
            {title.apres}
          </h2>
          <p className="cd-sub">
            {sousTitre({ spectator, vsBot, n: count, pool: draft.pool.length, oppLabel, excluded })}
          </p>
          {!spectator && (
            <p className="cd-keys" aria-hidden="true">
              Clavier : flèches pour parcourir, Espace pour choisir, 1 à {keys} en raccourci.
            </p>
          )}
        </header>

        <ul
          className="cd-grid"
          ref={gridRef}
          aria-label={spectator ? 'Réserve de la partie' : 'Cartes à choisir'}
          data-cols={cols ?? undefined}
          style={cols ? ({ '--cols': cols } as CSSProperties) : undefined}
        >
          {draft.pool.map((id, i) => {
            const def = CARDS[id];
            if (!def) return null;
            const order = sel.indexOf(id);
            const on = order >= 0;
            const pills = tilePills(def, rules);
            const content = (
              <>
                <span className="cd-top">
                  <span className="cd-art" aria-hidden="true">
                    <SpellCard id={id} size="mini" tilt={false} rules={rules} className="cd-sc" />
                  </span>
                  <span className="cd-id">
                    <span className="cd-name" id={`cd-n-${id}`}>
                      {def.name}
                    </span>
                    <span className="cd-meta" id={`cd-m-${id}`}>
                      {cardMeta(def, rules)}
                    </span>
                  </span>
                </span>
                {/* Moment et effet sur le tour, sur toute la largeur de la tuile (une seule ligne) */}
                <span className="cd-pills" id={`cd-t-${id}`}>
                  <span className={`cd-when ${pills.next ? 'is-next' : ''}`}>{pills.when}</span>
                  <span className={`cd-turn ${pills.replace ? 'is-replace' : ''}`}>{pills.turn}</span>
                </span>
                <span className="cd-rule" id={`cd-r-${id}`}>
                  {/* Scène de la carte en image fixe, animée sur la tuile survolée ou touchée en dernier */}
                  <span className={`cd-scene ${scenePaired(id) ? 'is-pair' : ''}`} aria-hidden="true">
                    <CardScene id={id} play="still" active={peek === id} />
                  </span>
                  {/* Sans « Annoncée, elle arrive… » ni « Rituel : … » : les pastilles le disent déjà */}
                  {ruleBody(def, rules)}
                </span>
                {!spectator && (
                  <span className="cd-mark" aria-hidden="true">
                    {on ? order + 1 : i < keys ? <span className="cd-key">{i + 1}</span> : null}
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
                    onClick={e => {
                      toggle(id);
                      if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType !== 'mouse') setPeek(id);
                    }}
                    onPointerEnter={e => e.pointerType === 'mouse' && setPeek(id)}
                    onPointerLeave={e => e.pointerType === 'mouse' && setPeek(p => (p === id ? null : p))}
                    onFocus={e => e.currentTarget.matches(':focus-visible') && setPeek(id)}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="cd-foot">
          <DraftTimer deadline={deadline} total={draft.totalMs ?? DEAL.draftMs} warn={!locked} onExpire={() => setExpired(true)} />

          <div className="cd-picked">
            {!spectator && (
              <ol className="cd-slots" aria-label={vosCartesLabel(count)}>
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
                {oppChosen ? 'Les mains vont être révélées…' : attenteAdversaire(count)}
              </p>
            ) : expired ? (
              <p className="cd-wait" role="status">
                <span className="cd-orbit" aria-hidden="true" />
                {expiration(sel.length, count)}
              </p>
            ) : (
              <button type="button" className="btn-gold cd-validate" disabled={sel.length !== count || sending || closing} onClick={() => void validate()}>
                <span className="btn-main">{sending ? 'Validation…' : 'Valider mes cartes'}</span>
                <span className="btn-sub">{sel.length === count ? 'Choix définitif' : encore(count - sel.length)}</span>
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
    // Échéance repoussée (redémarrage du serveur) : l'expiration et l'alerte des 10 s peuvent revenir
    const l = secs();
    if (l > 0) expired.current = false;
    if (l > 10) warned.current = false;
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

function Reveal({ view, auto, count, onDone }: { view: GameView; auto: boolean; count: number; onDone: () => void }) {
  const you = view.you;
  const first: Color = you ?? 'w';
  const second = opposite(first);
  const s = view.state;
  // Règles de la partie : pastilles et moment d'action des mains révélées, comme la main de la coque derrière
  const rules = rulesOf(s);
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
    ? `Les ${colorName(turn)} commencent.`
    : you === turn
      ? 'À vous de commencer : jouez votre premier coup.'
      : `${seatName(turnSeat, turn)} commence.`;
  // Cartes par main : celles des mains révélées (au-delà de la main de référence, elles rapetissent : data-crowd)
  const n = Math.max(s.hands.w.length, s.hands.b.length);
  const label = (c: Color) => (you === c ? vosCartesLabel(n) : cartesDe(n, deNom(seatName(view.seats[c], c))));
  return (
    <div className="cd cd-reveal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab} onClick={e => e.target === e.currentTarget && onDone()}>
      <div className="cd-reveal-in">
        <p className="cd-kick">Choix des cartes · terminé</p>
        <h2 className="cd-title" id={titleId}>
          Les mains sont <em>révélées</em>.
        </h2>
        <div className="cd-hands" data-crowd={n > REF_HAND ? n : undefined} style={n > REF_HAND ? ({ '--n': n } as CSSProperties) : undefined}>
          {[first, second].map((c, k) => (
            <section key={c} className="cd-hand" aria-label={label(c)}>
              <p className="cd-hand-label">{label(c)}</p>
              <div className="cd-hand-cards">
                {s.hands[c].map((h, i) =>
                  CARDS[h.card] ? (
                    <div key={i} className="cd-deal" style={{ '--i': dealOrder(k, n, i) } as CSSProperties}>
                      <SpellCard id={h.card} size="hand" tilt={false} rules={rules} narrow={n > REF_HAND} className="cd-sc" />
                    </div>
                  ) : null,
                )}
              </div>
            </section>
          ))}
        </div>
        {auto && <p className="cd-note">{noteRevelation(count)}</p>}
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
