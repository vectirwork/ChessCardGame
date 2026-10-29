// Page de partie : plateau, cartes, pendules, sorts animés, invitations, fin de partie.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Color, PieceType, opposite } from '../../shared/chess';
import { CARDS, CardId } from '../../shared/cards';
import { skinStyle } from '../../shared/catalog';
import type { CardInfo, GameState } from '../../shared/game';
import {
  RESULT_TEXT, cardOptions, cardPlayable, legalMovesOf, playMove, sideInCheck,
} from '../../shared/game';
import type { Ack, GameUpdate, GameView, JoinReply } from '../../shared/protocol';
import { EMOTES, TIME_CONTROLS } from '../../shared/protocol';
import { Board, BoardHandle, checkSquare } from '../components/Board';
import { Modal, PageLoader, Spinner } from '../components/Layout';
import { SpellCard } from '../components/SpellCard';
import { getSocket, emitAck } from '../socket';
import { playCardSound, playSound, setSoundEnabled, soundEnabled } from '../sound';
import { getGuestName, setGuestName, useApp } from '../store';
import { useVfx } from '../vfx/useVfx';
import { EffectsList, MoveList, PlayerBar } from './parts';

interface Casting {
  card: CardId;
  by: string;
  mine: boolean;
  key: number;
}

export default function GamePage() {
  const { id = '' } = useParams();
  const { me, toast } = useApp();
  const navigate = useNavigate();
  const [view, setView] = useState<GameView | null>(null);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [needName, setNeedName] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [selCard, setSelCard] = useState<number | null>(null);
  const [partial, setPartial] = useState<number[]>([]);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [casting, setCasting] = useState<Casting | null>(null);
  const [animating, setAnimating] = useState(false);
  const [emotes, setEmotes] = useState<Record<Color, string | null>>({ w: null, b: null });
  const [showEnd, setShowEnd] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [sound, setSound] = useState(soundEnabled());
  const [tab, setTab] = useState<'moves' | 'cards'>('moves');
  const boardRef = useRef<BoardHandle>(null);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const serverView = useRef<GameView | null>(null);
  const queue = useRef<GameUpdate[]>([]);
  const busy = useRef(false);
  const viewRef = useRef<GameView | null>(null);
  viewRef.current = view;

  const you = view?.you ?? null;
  const orientation: Color = flipped ? opposite(you ?? 'w') : you ?? 'w';
  const vfx = useVfx(wrapEl, orientation);
  const vfxRef = useRef(vfx);
  vfxRef.current = vfx;

  useEffect(() => {
    setWrapEl(boardRef.current?.wrap ?? null);
  }, [view !== null]);

  const applyView = useCallback((v: GameView) => {
    setView(v);
    setReceivedAt(Date.now());
    vfxRef.current?.stage.syncMarkers(v.state.effects, v.state.pos);
  }, []);

  // Orientation et objets persistants
  useEffect(() => {
    const v = viewRef.current;
    if (vfx && v) {
      vfx.stage.setOrientation(orientation, v.state.effects, v.state.pos);
      vfx.stage.syncMarkers(v.state.effects, v.state.pos);
    }
  }, [vfx, orientation]);

  // ----- File des mises à jour : les sorts sont joués avant d'appliquer l'état -----
  const process = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const u = queue.current.shift()!;
        serverView.current = u.view;
        const ev = u.event;
        const prev = viewRef.current;
        const skipFx = document.hidden || queue.current.length > 2;
        if (ev.type === 'card' && !skipFx) {
          await playCardEvent(u, ev.info, prev);
        } else {
          applyView(u.view);
          if (ev.type === 'card') playCardSound(ev.info.card);
          if (ev.type === 'move') {
            const mine = prev?.you === ev.color;
            const alreadyShown = mine && prev && prev.state.ply === u.view.state.ply;
            if (!alreadyShown) playSound(ev.info.check ? 'check' : ev.info.capturedId !== null ? 'capture' : 'move');
          }
          if (ev.type === 'start') playSound('start');
          if (ev.type === 'end') {
            playSound('end');
            setTimeout(() => setShowEnd(true), 700);
          }
        }
      }
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyView]);

  const playCardEvent = async (u: GameUpdate, info: CardInfo, prev: GameView | null) => {
    const seat = u.view.seats[info.caster];
    const mine = u.view.you === info.caster;
    setCasting({ card: info.card, by: seat?.name ?? '', mine, key: Date.now() });
    setAnimating(true);
    playCardSound(info.card);
    const stage = vfxRef.current?.stage;
    const victim = opposite(info.caster);
    const bottom = (prev?.you ?? 'w') === victim ? !flippedRef.current : flippedRef.current;
    if (stage && vfxRef.current) {
      await vfxRef.current.m.playCast(stage, info, skinStyle(info.skin), {
        impact: () => applyView(u.view),
        hide: ids => setHidden(new Set(ids)),
        show: () => setHidden(new Set()),
        victimAtBottom: bottom,
      });
    } else {
      await new Promise(r => setTimeout(r, 600));
      applyView(u.view);
    }
    setHidden(new Set());
    setTimeout(() => setCasting(c => (c && Date.now() - c.key > 1500 ? null : c)), 1600);
    setAnimating(false);
  };
  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;

  // ----- Connexion à la partie -----
  const join = useCallback(async (name?: string) => {
    try {
      const r = await emitAck<JoinReply>('game:join', { id, name: name ?? (getGuestName() || undefined) });
      if (!r.ok) {
        setError(r.error ?? 'Partie introuvable.');
        return;
      }
      setNeedName(!!r.needName);
      if (r.view) {
        serverView.current = r.view;
        queue.current = [];
        applyView(r.view);
        if (r.view.status === 'ended') setShowEnd(false);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, applyView]);

  useEffect(() => {
    const s = getSocket();
    setView(null);
    setError(null);
    setShowEnd(false);
    setSelCard(null);
    const onUpdate = (u: GameUpdate) => {
      if (u.view.id !== id) return;
      queue.current.push(u);
      void process();
    };
    const onRedirect = (p: { from: string; to: string }) => {
      if (p.from === id) navigate(`/partie/${p.to}`);
    };
    const onEmote = (p: { gameId: string; color: Color; key: string }) => {
      if (p.gameId !== id) return;
      setEmotes(e => ({ ...e, [p.color]: EMOTES[p.key] }));
      playSound('notify');
      setTimeout(() => setEmotes(e => ({ ...e, [p.color]: null })), 2800);
    };
    const onConnect = () => void join();
    s.on('game:update', onUpdate);
    s.on('game:redirect', onRedirect);
    s.on('game:emote', onEmote);
    s.on('connect', onConnect);
    if (s.connected) void join();
    return () => {
      s.off('game:update', onUpdate);
      s.off('game:redirect', onRedirect);
      s.off('game:emote', onEmote);
      s.off('connect', onConnect);
      s.emit('game:leave', { id });
    };
  }, [id, join, navigate, process]);

  // ----- Dérivés -----
  const state: GameState | null = view?.state ?? null;
  const myTurn = !!view && !!state && view.status === 'active' && you === state.pos.turn && !state.result;
  const legal = useMemo(() => (myTurn && state && !animating ? legalMovesOf(state) : []), [myTurn, state, animating]);
  const lastMove = useMemo(() => {
    if (!state) return null;
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.k === 'move' && !e.undone) return { from: e.from, to: e.to };
    }
    return null;
  }, [state]);
  const check = state && !state.result ? checkSquare(state.pos, sideInCheck(state) ? state.pos.turn : null) : null;
  const myHand = you && state ? state.hands[you] : [];
  const playable = useMemo(
    () => myHand.map((_, i) => (myTurn && state && you ? cardPlayable(state, you, i) : false)),
    [myHand, myTurn, state, you],
  );
  const selectedDef = selCard !== null && myHand[selCard]?.card ? CARDS[myHand[selCard].card!] : null;
  const options = useMemo(() => {
    if (selCard === null || !state || !you || !selectedDef || selectedDef.targets === 0) return null;
    return cardOptions(state, you, selCard, partial);
  }, [selCard, state, you, partial, selectedDef]);
  const hasLegalMove = useMemo(() => (myTurn && state ? legalMovesOf(state).length > 0 : true), [myTurn, state]);
  const mustPlayCard = myTurn && !animating && !hasLegalMove && playable.some(Boolean);

  useEffect(() => {
    if (!myTurn) {
      setSelCard(null);
      setPartial([]);
    }
  }, [myTurn]);

  // ----- Actions -----
  const send = async (event: string, payload: Record<string, unknown>) => {
    try {
      const r = await emitAck<Ack>(event, { id, ...payload });
      if (!r.ok) {
        toast(r.error ?? 'Action refusée.', 'error');
        playSound('error');
        if (serverView.current) applyView(serverView.current);
      }
      return r.ok;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    }
  };

  const onMove = (from: number, to: number, promo?: PieceType) => {
    if (!view || !state) return;
    // Coup affiché immédiatement, confirmé par le serveur ensuite
    const r = playMove(state, from, to, promo);
    if (r.ok) {
      applyView({ ...view, state: r.state });
      playSound(r.info.check ? 'check' : r.info.capturedId !== null ? 'capture' : 'move');
    }
    void send('game:move', { from, to, promo });
  };

  const castCard = (index: number, targets: number[]) => {
    setSelCard(null);
    setPartial([]);
    void send('game:card', { index, targets });
  };

  const onTarget = (sq: number) => {
    if (selCard === null || !selectedDef) return;
    const next = [...partial, sq];
    playSound('select');
    if (next.length >= selectedDef.targets) castCard(selCard, next);
    else setPartial(next);
  };

  const pickCard = (i: number) => {
    if (!playable[i]) return;
    if (selCard === i) {
      setSelCard(null);
      setPartial([]);
      return;
    }
    playSound('select');
    setSelCard(i);
    setPartial([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelCard(null);
        setPartial([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- Rendu -----
  if (error) {
    return (
      <div className="container page center">
        <h1 className="page-title">Partie introuvable</h1>
        <p className="muted">{error}</p>
        <Link to="/jouer" className="btn btn-primary">Lancer une nouvelle partie</Link>
      </div>
    );
  }
  if (!view || !state) return <PageLoader />;

  const top: Color = opposite(orientation);
  const bottom: Color = orientation;
  const tcLabel = TIME_CONTROLS.find(t => t.tc && view.clock && t.tc.initial === view.clock.initial && t.tc.increment === view.clock.increment)?.label ?? (view.clock ? '' : 'Sans limite');
  const iAmCreatorWaiting = view.status === 'waiting' && you !== null;
  const oppAway = you ? view.away[opposite(you)] : null;
  const endInfo = state.result;
  const turnColor = state.pos.turn;

  const castBar = selectedDef && (
    <div className="cast-bar" style={{ '--h': selectedDef.hue } as CSSProperties}>
      <div>
        <b>{selectedDef.name}</b>
        <span className="muted">{selectedDef.targets === 0 ? selectedDef.description : selectedDef.prompts[partial.length]}</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {selectedDef.targets === 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => castCard(selCard!, [])}>✦ Lancer le sort</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelCard(null); setPartial([]); }}>Annuler</button>
      </div>
    </div>
  );

  const barFor = (c: Color) => (
    <PlayerBar
      seat={view.seats[c]}
      color={c}
      state={state}
      clock={view.clock}
      receivedAt={receivedAt}
      active={view.status === 'active' && turnColor === c && !state.result}
      hand={state.hands[c]}
      showHand={c !== you}
      emote={emotes[c]}
      away={view.away[c]}
      ratingDiff={view.ratingDiff?.[c] ?? null}
    />
  );

  return (
    <div className="game-page">
      <div className="game-grid">
        <aside className="game-side left">
          {you && (
            <div className="hand-panel panel">
              <div className="hand-title">
                <span className="eyebrow">Tes cartes</span>
                <span className="faint" style={{ fontSize: 12 }}>1 carte par tour, avant ton coup</span>
              </div>
              {castBar}
              <Hand hand={myHand} playable={playable} selected={selCard} onPick={pickCard} />
            </div>
          )}
          <div className="panel effects-panel">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Sorts actifs</div>
            {state.effects.length ? <EffectsList effects={state.effects} you={you} /> : <div className="faint" style={{ fontSize: 13 }}>Aucun sort en cours.</div>}
          </div>
        </aside>

        <section className="game-center">
          {barFor(top)}
          <div className="board-holder">
            <Board
              ref={boardRef}
              pos={state.pos}
              orientation={orientation}
              theme={me?.equippedBoard}
              legal={legal}
              onMove={onMove}
              lastMove={lastMove}
              check={check}
              effects={state.effects}
              targets={options}
              targetHue={selectedDef?.hue}
              chosen={partial}
              onTarget={onTarget}
              hidden={hidden}
              locked={!myTurn || animating}
            />
            {casting && <CastBanner key={casting.key} c={casting} />}
            {iAmCreatorWaiting && <WaitingOverlay id={id} view={view} onCancel={() => send('game:abort', {})} />}
          </div>
          {barFor(bottom)}
          {mustPlayCard && !selectedDef && (
            <div className="notice" style={{ marginTop: 10 }}>⚠️ Aucun coup légal : seule une carte peut te sauver !</div>
          )}
          {you && (
            <div className="hand-mobile">
              <Hand hand={myHand} playable={playable} selected={selCard} onPick={pickCard} compact />
              {castBar}
            </div>
          )}
        </section>

        <aside className="game-side right">
          <div className="panel info-panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge cyan">{tcLabel}</span>
                <span className="badge">{view.mode === 'bot' ? 'Contre l’IA' : view.mode === 'quick' ? 'Classée' : 'Entre amis'}</span>
                {view.rated && <span className="badge gold">Elo</span>}
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-ghost btn-sm" title="Retourner l'échiquier" onClick={() => setFlipped(f => !f)}>⇅</button>
                <button className="btn btn-ghost btn-sm" title={sound ? 'Couper le son' : 'Activer le son'} onClick={() => { setSoundEnabled(!sound); setSound(!sound); }}>
                  {sound ? '🔊' : '🔈'}
                </button>
              </div>
            </div>
            <div className="status-line">
              {view.status === 'waiting' && 'En attente d’un adversaire…'}
              {view.status === 'active' && !state.result && (myTurn ? (selectedDef ? (selectedDef.targets ? 'Choisis la cible de ton sort' : 'Lance ton sort ou annule') : 'À toi de jouer') : you ? `Au tour de ${view.seats[turnColor]?.name ?? 'l’adversaire'}` : `Trait aux ${turnColor === 'w' ? 'Blancs' : 'Noirs'}`)}
              {endInfo && <ResultLine view={view} />}
            </div>
            <div className="tabs small">
              <button className={tab === 'moves' ? 'on' : ''} onClick={() => setTab('moves')}>Coups</button>
              <button className={tab === 'cards' ? 'on' : ''} onClick={() => setTab('cards')}>Sorts actifs {state.effects.length ? `(${state.effects.length})` : ''}</button>
            </div>
            {tab === 'moves' ? <MoveList log={state.log} /> : <div className="moves"><EffectsList effects={state.effects} you={you} />{!state.effects.length && <div className="moves-empty">Aucun sort en cours.</div>}</div>}

            {view.drawOffer && you && view.drawOffer !== you && view.status === 'active' && (
              <div className="offer">
                <span>🤝 Ton adversaire propose la nulle</span>
                <div className="row">
                  <button className="btn btn-primary btn-sm" onClick={() => send('game:draw', { action: 'accept' })}>Accepter</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => send('game:draw', { action: 'decline' })}>Refuser</button>
                </div>
              </div>
            )}
            {oppAway && view.status === 'active' && <AwayNotice since={oppAway} claimAfter={view.claimAfterMs} onClaim={() => send('game:claim', {})} />}

            {you && view.status === 'active' && (
              <div className="actions">
                {state.ply < 2 ? (
                  <button className="btn btn-sm" onClick={() => send('game:abort', {})}>Annuler la partie</button>
                ) : (
                  <button className="btn btn-sm" disabled={view.drawOffer === you || view.mode === 'bot'} onClick={() => send('game:draw', { action: 'offer' }).then(ok => ok && toast('Proposition de nulle envoyée.'))}>
                    {view.drawOffer === you ? 'Nulle proposée' : '½ Proposer nulle'}
                  </button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmResign(true)}>⚑ Abandonner</button>
              </div>
            )}
            {view.status === 'ended' && you && (
              <div className="actions">
                <button className="btn btn-primary btn-sm" onClick={() => send('game:rematch', {})} disabled={view.rematch[you]}>
                  {view.rematch[you] ? 'Revanche proposée…' : view.rematch[opposite(you)] ? 'Accepter la revanche' : '↻ Revanche'}
                </button>
                <Link to="/jouer" className="btn btn-sm">Nouvelle partie</Link>
              </div>
            )}
            {you && view.mode !== 'bot' && view.status !== 'waiting' && (
              <div className="emotes">
                {Object.entries(EMOTES).map(([k, label]) => (
                  <button key={k} className="btn btn-ghost btn-sm" onClick={() => getSocket().emit('game:emote', { id, key: k })}>{label}</button>
                ))}
              </div>
            )}
            {!you && view.status !== 'waiting' && <div className="faint" style={{ fontSize: 13, marginTop: 12 }}>👁 Tu regardes cette partie en spectateur.</div>}
          </div>
        </aside>
      </div>

      {needName && view.status === 'waiting' && (
        <JoinModal
          host={view.seats.w?.name ?? view.seats.b?.name ?? 'un joueur'}
          loggedIn={!!me}
          onJoin={name => {
            setGuestName(name);
            void join(name);
          }}
        />
      )}
      {confirmResign && (
        <Modal onClose={() => setConfirmResign(false)}>
          <h2>Abandonner ?</h2>
          <p className="muted">La partie sera perdue{view.rated ? ' et ton classement mis à jour' : ''}.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setConfirmResign(false)}>Continuer à jouer</button>
            <button className="btn btn-danger" onClick={() => { setConfirmResign(false); void send('game:resign', {}); }}>Abandonner</button>
          </div>
        </Modal>
      )}
      {showEnd && endInfo && view.status === 'ended' && (
        <EndModal view={view} onClose={() => setShowEnd(false)} onRematch={() => send('game:rematch', {})} loggedIn={!!me} />
      )}
    </div>
  );
}

function Hand({ hand, playable, selected, onPick, compact }: { hand: GameState['hands']['w']; playable: boolean[]; selected: number | null; onPick: (i: number) => void; compact?: boolean }) {
  return (
    <div className={`hand ${compact ? 'compact' : ''}`}>
      {hand.map((h, i) => (
        <div key={i} className="hand-slot">
          {h.card && (
            <SpellCard
              id={h.card}
              size="hand"
              used={h.used}
              selected={selected === i}
              disabled={!h.used && !playable[i]}
              onClick={h.used ? undefined : () => onPick(i)}
            />
          )}
          {h.card && !compact && (
            <div className="hand-desc">
              <b>{CARDS[h.card].duration}</b> · {CARDS[h.card].description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CastBanner({ c }: { c: Casting }) {
  const def = CARDS[c.card];
  return (
    <div className="cast-banner" style={{ '--h': def.hue } as CSSProperties}>
      <SpellCard id={c.card} size="full" tilt={false} />
      <div className="cast-caption">
        <span>{c.mine ? 'Tu lances' : `${c.by} lance`}</span>
        <b>{def.name}</b>
      </div>
    </div>
  );
}

function WaitingOverlay({ id, view, onCancel }: { id: string; view: GameView; onCancel: () => void }) {
  const url = `${window.location.origin}/partie/${id}`;
  const { toast } = useApp();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié ! Envoie-le à ton adversaire.', 'success');
    } catch {
      toast('Copie impossible : sélectionne le lien à la main.', 'error');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Partie de Spellmate', text: 'Je te défie aux échecs… avec des pouvoirs !', url });
    } catch {
      // partage annulé
    }
  };
  return (
    <div className="waiting-overlay">
      <div className="panel panel-pad waiting-card">
        <div className="pulse-ring"><span>♞</span></div>
        <h2 className="display">Invite ton adversaire</h2>
        <p className="muted">Envoie ce lien : ton ami pourra jouer tout de suite, même sans compte.</p>
        <div className="link-box">
          <input className="input" readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Lien d'invitation" />
          <button className="btn btn-primary" onClick={copy}>Copier</button>
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
          {'share' in navigator && <button className="btn btn-sm" onClick={share}>Partager…</button>}
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler l’invitation</button>
        </div>
        <p className="faint" style={{ fontSize: 12.5, marginTop: 16, marginBottom: 0 }}>
          Tu joues les {view.seats.w ? 'Blancs' : 'Noirs'} · {view.clock ? `${view.clock.initial / 60} min + ${view.clock.increment} s` : 'sans limite de temps'}
        </p>
      </div>
    </div>
  );
}

function JoinModal({ host, loggedIn, onJoin }: { host: string; loggedIn: boolean; onJoin: (name: string) => void }) {
  const [name, setName] = useState(getGuestName());
  const [busy, setBusy] = useState(false);
  const valid = /^[\p{L}\p{N} _.-]{2,20}$/u.test(name.trim());
  return (
    <Modal>
      <div className="center">
        <div className="eyebrow">Invitation</div>
        <h2 style={{ marginTop: 8 }}>{host} te défie !</h2>
        <p className="muted">Échecs classiques, plus trois cartes de pouvoir chacun. Choisis un pseudo pour rejoindre la partie.</p>
      </div>
      {!loggedIn && (
        <form
          className="stack"
          onSubmit={e => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            onJoin(name.trim());
          }}
        >
          <div className="field">
            <label htmlFor="guest-name">Ton pseudo</label>
            <input id="guest-name" className="input" autoFocus maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. : Magnus du 93" />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={!valid || busy}>{busy ? <Spinner /> : 'Rejoindre la partie'}</button>
          <p className="faint center" style={{ fontSize: 13, margin: 0 }}>
            Tu as un compte ? <Link to={`/connexion?retour=${encodeURIComponent(location.pathname)}`}>Connecte-toi</Link> pour que la partie compte dans ton historique.
          </p>
        </form>
      )}
    </Modal>
  );
}

function AwayNotice({ since, claimAfter, onClaim }: { since: number; claimAfter: number; onClaim: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const left = Math.max(0, Math.ceil((since + claimAfter - Date.now()) / 1000));
  return (
    <div className="offer">
      <span>📡 Ton adversaire s’est déconnecté.</span>
      {left > 0 ? <span className="faint">Victoire réclamable dans {left} s</span> : <button className="btn btn-primary btn-sm" onClick={onClaim}>Réclamer la victoire</button>}
    </div>
  );
}

function ResultLine({ view }: { view: GameView }) {
  const r = view.state.result!;
  const who = r.winner === null ? 'Nulle' : r.winner === view.you ? 'Victoire' : view.you ? 'Défaite' : r.winner === 'w' ? 'Les Blancs gagnent' : 'Les Noirs gagnent';
  return <span><b>{r.reason === 'aborted' ? 'Partie annulée' : who}</b> · {RESULT_TEXT[r.reason]}</span>;
}

function EndModal({ view, onClose, onRematch, loggedIn }: { view: GameView; onClose: () => void; onRematch: () => void; loggedIn: boolean }) {
  const r = view.state.result!;
  const you = view.you;
  const win = you && r.winner === you;
  const draw = r.winner === null;
  const title = r.reason === 'aborted' ? 'Partie annulée' : draw ? 'Partie nulle' : you ? (win ? 'Victoire !' : 'Défaite') : r.winner === 'w' ? 'Victoire des Blancs' : 'Victoire des Noirs';
  const diff = you && view.ratingDiff ? view.ratingDiff[you] : null;
  return (
    <Modal onClose={onClose}>
      <div className={`end-modal ${win ? 'win' : draw ? 'draw' : 'loss'}`}>
        <div className="end-emblem">{win ? '♛' : draw ? '½' : r.reason === 'aborted' ? '✕' : '♚'}</div>
        <h2 className="display">{title}</h2>
        <p className="muted">{RESULT_TEXT[r.reason]}</p>
        {diff !== null && <div className={`end-diff ${diff >= 0 ? 'up' : 'down'}`}>{diff >= 0 ? '+' : ''}{diff} Elo</div>}
        <div className="row" style={{ justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          {you && r.reason !== 'aborted' && <button className="btn btn-primary" onClick={onRematch}>↻ Revanche</button>}
          <Link to="/jouer" className="btn">Nouvelle partie</Link>
          <button className="btn btn-ghost" onClick={onClose}>Voir l’échiquier</button>
        </div>
        {!loggedIn && you && (
          <div className="notice" style={{ marginTop: 20, textAlign: 'left' }}>
            <span>✨</span>
            <span>
              <Link to="/inscription">Crée un compte gratuit</Link> pour garder ton historique, jouer en classé et débloquer des skins.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
