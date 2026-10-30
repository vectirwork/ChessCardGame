// Page de partie en ligne (/partie/:id), au style Odyssée.
//
// La coque immersive de l'accueil (odyssee/shell : GameShell) entoure l'échiquier, à la même place que sur
// l'accueil : passer d'une partie de l'accueil (file amicale) à une partie en ligne se fait sans rupture.
// Fonctions : pendules exactes, coups optimistes, cartes et ciblage, file d'animation des sorts (garde-fou
// castSafely), salle d'attente et lien d'invitation, pseudo des invités, spectateurs, nulle, abandon, annulation,
// réclamation de victoire, revanche, émotes, fin de partie, Présages annoncés et catalogue de la partie.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Color, PieceType, opposite } from '../../shared/chess';
import { CARDS } from '../../shared/cards';
import type { Catalog } from '../../shared/cards';
import { skinStyle } from '../../shared/catalog';
import type { CardInfo, GameState, HandCard } from '../../shared/game';
import { RESULT_TEXT, cardOptions, cardPlayable, catalogOf, legalMovesOf, playMove, sideInCheck } from '../../shared/game';
import type { Ack, GameUpdate, GameView, JoinReply } from '../../shared/protocol';
import { EMOTES } from '../../shared/protocol';
import { Board, BoardHandle, checkSquare } from '../components/Board';
import { Modal, Spinner } from '../components/Layout';
import { rememberView } from '../features/history';
import { castSafely } from '../odyssee/castSafely';
import { GameShell, gameLayout } from '../odyssee/shell';
import type { ShellAction, ShellPrompt } from '../odyssee/shell';
import { emitAck, getSocket } from '../socket';
import { playCardSound, playSound, setSoundEnabled, soundEnabled } from '../sound';
import { getGuestName, setGuestName, useApp } from '../store';
import { useVfx } from '../vfx/useVfx';
import { AwayNotice, CastBanner, DrawOffer, EndCard, FirstMoveCountdown, JoinSheet, WaitingCard, rematchLabel, resultTitle } from './overlays';
import type { Casting } from './overlays';
import {
  Avatar, Captured, Clock, EffectsPanel, EmoteBubble, HandRow, MoveList, SeatName, catalogDescription, catalogTag, colorName,
  modeLabel, seatSub, tcLabel,
} from './parts';

type Queued = GameUpdate & { at: number };

/**
 * Carte inconnue du client (catalogue modifié entre-temps, client et serveur pas encore à la même version) : retirée de
 * l'affichage sans décaler les index (la coque ne dessine pas une carte vide), jamais d'erreur de rendu.
 */
const known = (hand: HandCard[]): HandCard[] => hand.map(h => (h.card && !CARDS[h.card] ? { ...h, card: null as unknown as HandCard['card'] } : h));
type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

/** Géométrie du mode immersif (la même que celle de la coque), suivie au redimensionnement. */
function useStageLayout() {
  const read = () => ({ vw: window.innerWidth, vh: window.innerHeight, ...gameLayout(window.innerWidth, window.innerHeight) });
  const [l, setL] = useState(read);
  useEffect(() => {
    const on = () => setL(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return l;
}

/** Plein écran immersif : en-tête du site masqué, pas de défilement (html.is-immersive, styles/global.css). */
function useImmersive(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const html = document.documentElement;
    html.classList.add('is-immersive', 'gp-on');
    return () => html.classList.remove('is-immersive', 'gp-on');
  }, [on]);
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
  const [sound, setSound] = useState(soundEnabled());
  const [movesOpen, setMovesOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [announce, setAnnounce] = useState<{ text: string; key: number } | null>(null);
  const [warm, setWarm] = useState(false);
  const layout = useStageLayout();
  const boardRef = useRef<BoardHandle>(null);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const serverView = useRef<GameView | null>(null);
  const queue = useRef<Queued[]>([]);
  const busy = useRef(false);
  const viewRef = useRef<GameView | null>(null);
  viewRef.current = view;
  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;

  useImmersive(!error);

  // Largeur libre à droite de l'échiquier : les blocs des joueurs (adversaire en haut, vous en bas) n'y débordent pas
  const side = Math.max(120, layout.vw - (layout.x + layout.G / 2) - 58);
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty('--gp-side', `${side}px`);
    return () => {
      html.style.removeProperty('--gp-side');
    };
  }, [side]);

  const you = view?.you ?? null;
  const orientation: Color = flipped ? opposite(you ?? 'w') : you ?? 'w';
  // Scène 3D des sorts : créée au repos après l'arrivée (ou à la première carte choisie), jamais pendant le premier
  // affichage. Un sort reçu avant qu'elle soit prête s'applique sans animation.
  const vfx = useVfx(warm ? wrapEl : null, orientation);
  const vfxRef = useRef(vfx);
  vfxRef.current = vfx;

  useEffect(() => {
    setWrapEl(boardRef.current?.wrap ?? null);
  }, [view !== null]);

  const viewStatus = view?.status;
  useEffect(() => {
    if (warm || !viewStatus || viewStatus === 'waiting') return;
    const w = window as IdleWin;
    let idle = 0;
    const t = window.setTimeout(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(() => setWarm(true), { timeout: 2000 });
      else setWarm(true);
    }, 1600);
    return () => {
      window.clearTimeout(t);
      if (idle) w.cancelIdleCallback?.(idle);
    };
  }, [warm, viewStatus]);

  const applyView = useCallback((v: GameView, at = Date.now()) => {
    setView(v);
    setReceivedAt(at);
    vfxRef.current?.stage.syncMarkers(v.state.effects, v.state.pos);
  }, []);

  // Orientation et objets persistants (marqueurs des sorts)
  useEffect(() => {
    const v = viewRef.current;
    if (vfx && v) {
      vfx.stage.setOrientation(orientation, v.state.effects, v.state.pos);
      vfx.stage.syncMarkers(v.state.effects, v.state.pos);
    }
  }, [vfx, orientation]);

  // ----- Sort reçu : animation, puis état (l'horodatage de réception garde les pendules exactes) -----
  const playCardEvent = useCallback(
    async (u: Queued, info: CardInfo, prev: GameView | null) => {
      const seat = u.view.seats[info.caster];
      const mine = u.view.you === info.caster;
      const by = seat?.name ?? (info.caster === 'w' ? 'Les Blancs' : 'Les Noirs');
      setCasting({ card: info.card, by, mine, key: Date.now() });
      if (!mine && CARDS[info.card]) setAnnounce({ text: `${by} lance ${CARDS[info.card].name}`, key: Date.now() });
      setAnimating(true);
      playCardSound(info.card);
      const victim = opposite(info.caster);
      const bottom = (prev?.you ?? 'w') === victim ? !flippedRef.current : flippedRef.current;
      const v = vfxRef.current;
      if (v) {
        await castSafely(v, info, skinStyle(info.skin), {
          impact: () => applyView(u.view, u.at),
          hide: ids => setHidden(new Set(ids)),
          show: () => setHidden(new Set()),
          victimAtBottom: bottom,
        });
      } else {
        await new Promise(r => setTimeout(r, 650));
        applyView(u.view, u.at);
      }
      setHidden(new Set());
      setTimeout(() => setCasting(c => (c && Date.now() - c.key > 1500 ? null : c)), 1600);
      setAnimating(false);
    },
    [applyView],
  );

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
          applyView(u.view, u.at);
          if (ev.type === 'card') {
            playCardSound(ev.info.card);
            if (u.view.you !== ev.info.caster && CARDS[ev.info.card]) {
              setAnnounce({ text: `${u.view.seats[ev.info.caster]?.name ?? 'Votre adversaire'} lance ${CARDS[ev.info.card].name}`, key: Date.now() });
            }
          }
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
  }, [applyView, playCardEvent]);

  // ----- Connexion à la partie -----
  const join = useCallback(
    async (name?: string) => {
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
    },
    [id, applyView],
  );

  useEffect(() => {
    const s = getSocket();
    setView(null);
    setError(null);
    setShowEnd(false);
    setSelCard(null);
    setFlipped(false);
    // Nouvelle partie (revanche) : la scène 3D sera recréée au repos, pas pendant l'arrivée de la coque
    setWarm(false);
    const onUpdate = (u: GameUpdate) => {
      if (u.view.id !== id) return;
      queue.current.push({ ...u, at: Date.now() });
      void process();
    };
    const onRedirect = (p: { from: string; to: string }) => {
      // Revanche : la nouvelle partie remplace l'ancienne dans l'historique (le retour ne ramène pas à la précédente)
      if (p.from === id) navigate(`/partie/${p.to}`, { replace: true });
    };
    const onEmote = (p: { gameId: string; color: Color; key: string }) => {
      if (p.gameId !== id || !Object.hasOwn(EMOTES, p.key)) return;
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
  const myHand = useMemo(() => (you && state ? known(state.hands[you]) : []), [you, state]);
  const playable = useMemo(
    () =>
      myHand.map((h, i) => {
        if (!myTurn || !state || !you || !h.card) return false;
        try {
          return cardPlayable(state, you, i);
        } catch {
          return false;
        }
      }),
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

  // Partie terminée : un invité la retrouve dans « Mes parties » (liste de ce navigateur). Un compte l'a déjà dans son
  // historique serveur. rememberView ignore les spectateurs et les parties annulées.
  const endedId = view?.status === 'ended' && view.state.result ? view.id : null;
  useEffect(() => {
    const v = viewRef.current;
    if (!endedId || !v || me) return;
    rememberView(v);
  }, [endedId, me]);

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
      // Même horodatage que la vue affichée : la pendule ne saute pas en attendant le serveur
      applyView({ ...view, state: r.state }, receivedAt);
      playSound(r.info.check ? 'check' : r.info.capturedId !== null ? 'capture' : 'move');
    }
    void send('game:move', { from, to, promo });
  };

  const cancelCard = () => {
    setSelCard(null);
    setPartial([]);
  };

  const castCard = (index: number, targets: number[]) => {
    cancelCard();
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
    setWarm(true);
    if (selCard === i) {
      cancelCard();
      return;
    }
    playSound('select');
    setSelCard(i);
    setPartial([]);
  };

  const leave = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/');
  }, [navigate]);

  const toggleSound = () => {
    setSoundEnabled(!sound);
    setSound(!sound);
  };

  const sendEmote = (key: string) => {
    getSocket().emit('game:emote', { id, key });
    setEmoteOpen(false);
  };

  // ----- Rendu -----
  if (error) {
    return (
      <div className="gp-lost">
        <div className="gp-card">
          <p className="gp-kick">Partie en ligne</p>
          <h1 className="gp-card-title">
            Partie <em>introuvable</em>.
          </h1>
          <p className="gp-card-text">{error}</p>
          <div className="gp-card-actions">
            <Link to="/jouer" className="btn-gold sm">
              Lancer une nouvelle partie
            </Link>
            <Link to="/" className="btn-line">
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!view || !state) {
    return (
      <div className="gp-loading" role="status">
        <div className="gs-backdrop" aria-hidden="true">
          <div className="gs-backdrop-glow" />
          <div className="gs-backdrop-stars" />
        </div>
        <div className="gp-loading-board" style={{ left: layout.x - layout.G / 2, top: layout.y - layout.G / 2, width: layout.G, height: layout.G }}>
          <Spinner />
          <span>Connexion à la partie…</span>
        </div>
      </div>
    );
  }

  const catalog: Catalog = catalogOf(state);
  const top: Color = opposite(orientation);
  const bottom: Color = orientation;
  const spectator = !you;
  const iAmCreatorWaiting = view.status === 'waiting' && you !== null;
  const oppAway = you ? view.away[opposite(you)] : null;
  const ended = view.status === 'ended' && !!state.result;
  const turn = state.pos.turn;
  const moveNo = Math.floor(state.ply / 2) + 1;
  const vsHuman = view.mode !== 'bot';
  const turnSeat = view.seats[turn];
  const isActive = (c: Color) => view.status === 'active' && turn === c && !state.result;
  const hasCards = catalog !== 'aucune';

  // Colonne droite (ordinateur) : liste des coups si la place le permet, sinon action « Coups joués »
  const boardBottom = layout.y + layout.G / 2;
  const railLeft = layout.x + layout.G / 2 + 28;
  // Avec cartes, la main adverse (trois bandeaux empilés) occupe le haut de la colonne.
  const railTop = hasCards ? 300 : 178;
  const selfBottom = Math.max(28, layout.vh - boardBottom);
  const railBottom = selfBottom + (spectator && hasCards ? 250 : 184);
  const showRail = !layout.mobile && layout.vw - 30 - railLeft >= 132 && layout.vh - railTop - railBottom >= 120;

  // ----- Statut -----
  let title: string;
  if (view.status === 'waiting') title = you ? 'En attente de votre adversaire.' : 'Une invitation vous attend.';
  else if (ended) title = resultTitle(view);
  else if (animating && casting) title = 'Le sort se déploie…';
  else if (spectator) title = `Trait aux ${colorName(turn)}.`;
  else if (myTurn) title = check !== null ? 'Échec au roi.' : 'À vous de jouer.';
  else title = turnSeat?.kind === 'bot' ? `${turnSeat.name} réfléchit…` : `Au tour de ${turnSeat?.name ?? 'votre adversaire'}.`;

  const firstMove = !view.started && view.firstMoveDeadline && view.status === 'active' && myTurn ? <FirstMoveCountdown deadline={view.firstMoveDeadline} /> : null;
  let hint: ReactNode = null;
  if (view.status === 'waiting') {
    hint = you ? (
      <>
        La partie commence dès que votre adversaire ouvre le lien.
        <small>Gardez cette page ouverte : vous jouez dès son arrivée.</small>
      </>
    ) : (
      <>Choisissez un pseudo pour prendre place.</>
    );
  } else if (animating && casting && CARDS[casting.card]) {
    hint = (
      <>
        {casting.mine ? 'Vous lancez' : `${casting.by} lance`} {CARDS[casting.card].name}.
        <small>{CARDS[casting.card].tagline ?? 'Le sort prend effet sur l’échiquier.'}</small>
      </>
    );
  } else if (spectator) {
    hint = (
      <>
        Vous regardez cette partie en direct.
        {hasCards && <small>Les mains des deux joueurs sont visibles : chaque pouvoir touche les deux camps.</small>}
      </>
    );
  } else if (myTurn) {
    const line = mustPlayCard
      ? 'Aucun coup légal : seule une carte peut vous sauver.'
      : state.cardPlayed
        ? 'Sort lancé : jouez maintenant votre coup.'
        : hasCards && playable.some(Boolean)
          ? layout.mobile
            ? 'Une carte avant le coup, ou jouez directement.'
            : 'Lancez une carte avant votre coup, ou jouez directement.'
          : 'Jouez votre coup.';
    hint = (
      <>
        {line}
        {firstMove ?? (hasCards && <small>Une seule carte par tour, toujours avant le coup.</small>)}
      </>
    );
  } else if (view.status === 'active') {
    hint = (
      <>
        {turnSeat?.kind === 'bot' ? "L'IA calcule son coup." : 'Votre adversaire réfléchit.'}
        {hasCards && you && !layout.mobile && state.hands[opposite(you)].some(h => !h.used) && <small>Ses pouvoirs restent visibles en haut à droite.</small>}
      </>
    );
  }

  const prompt: ShellPrompt | null = selectedDef
    ? {
        name: selectedDef.name,
        hue: selectedDef.hue,
        text: selectedDef.targets ? selectedDef.prompts[partial.length] ?? '' : selectedDef.description,
        onCast: selectedDef.targets === 0 ? () => castCard(selCard!, []) : undefined,
        onCancel: cancelCard,
      }
    : null;

  const rematch = rematchLabel(view);
  const diff = you && view.ratingDiff ? view.ratingDiff[you] : null;
  const result = ended
    ? {
        text: (
          <p>
            {state.result!.reason === 'aborted' ? 'Elle ne compte ni au classement ni dans l’historique.' : `${RESULT_TEXT[state.result!.reason] ?? 'Partie terminée'}.`}
            {diff !== null && <span className={`gp-diff ${diff >= 0 ? 'up' : 'down'}`}>{` ${diff >= 0 ? '+' : ''}${diff} Elo`}</span>}
          </p>
        ),
        actions: (
          <>
            {rematch && (
              <button type="button" className="btn-gold sm" onClick={() => void send('game:rematch', {})} disabled={!!you && view.rematch[you]}>
                {rematch}
              </button>
            )}
            {!showEnd && (
              <button type="button" className="btn-line" onClick={() => setShowEnd(true)}>
                Bilan
              </button>
            )}
            <Link to="/jouer" className="btn-line">
              Nouvelle partie
            </Link>
          </>
        ),
      }
    : null;

  const actions: ShellAction[] = [
    {
      label: 'Proposer la nulle',
      onClick: () => void send('game:draw', { action: 'offer' }).then(ok => ok && toast('Proposition de nulle envoyée.')),
      hidden: !you || view.status !== 'active' || !view.started || !vsHuman || view.drawOffer === you,
    },
    { label: 'Annuler la partie', confirm: "Confirmer l'annulation", onClick: () => void send('game:abort', {}), hidden: !you || view.status !== 'active' || view.started },
    { label: 'Abandonner', confirm: "Confirmer l'abandon", onClick: () => void send('game:resign', {}), hidden: !you || view.status !== 'active' },
    { label: 'Coups joués', onClick: () => setMovesOpen(true), hidden: showRail || view.status === 'waiting' },
    { label: "Retourner l'échiquier", onClick: () => setFlipped(f => !f), hidden: !layout.mobile },
    { label: sound ? 'Couper le son' : 'Activer le son', onClick: () => toggleSound(), hidden: !layout.mobile },
  ];

  const oppSeat = view.seats[top];
  const selfSeat = view.seats[bottom];

  const info = (
    <>
      {view.drawOffer && you && view.drawOffer !== you && view.status === 'active' && (
        <DrawOffer onAccept={() => void send('game:draw', { action: 'accept' })} onDecline={() => void send('game:draw', { action: 'decline' })} />
      )}
      {view.drawOffer === you && you && view.status === 'active' && <p className="gp-note">Nulle proposée : en attente de la réponse.</p>}
      {oppAway && view.status === 'active' && <AwayNotice since={oppAway} claimAfter={view.claimAfterMs} onClaim={() => void send('game:claim', {})} />}
      {ended && view.rematch.next === null && you && view.rematch[opposite(you)] && !view.rematch[you] && <p className="gp-note">Votre adversaire propose une revanche.</p>}
      {!ended && <EffectsPanel effects={state.effects} you={you} />}
      {hasCards && layout.mobile && view.status !== 'waiting' && (
        <div className="gp-opp-hand-m">
          <span>Main de {oppSeat?.name ?? colorName(top)}</span>
          <HandRow hand={state.hands[top]} label={`Cartes de ${oppSeat?.name ?? colorName(top)}`} />
        </div>
      )}
    </>
  );


  const emoteMenu = you && vsHuman && view.status !== 'waiting' && (
    <div className="gp-emotes">
      <button type="button" className="gp-emote-btn" aria-expanded={emoteOpen} aria-label="Envoyer un message" title="Envoyer un message" onClick={() => setEmoteOpen(o => !o)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5h16v10H9.5L5.5 19v-3.5H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      {emoteOpen && (
        <div className="gp-emote-menu" role="menu">
          {Object.entries(EMOTES).map(([k, label]) => (
            <button key={k} type="button" role="menuitem" onClick={() => sendEmote(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const selfBlock = (
    <div
      className={`gp-self ${layout.mobile ? 'is-mobile' : ''} ${isActive(bottom) ? 'is-turn' : ''}`}
      style={layout.mobile ? { top: boardBottom + 14 } : { bottom: selfBottom }}
      aria-label={`${colorName(bottom)} : ${selfSeat?.name ?? 'en attente'}`}
    >
      {spectator && hasCards && !layout.mobile && <HandRow hand={state.hands[bottom]} label={`Cartes de ${selfSeat?.name ?? colorName(bottom)}`} className="gp-self-hand" />}
      <div className="gp-self-clock">
        <Captured state={state} color={bottom} />
        <Clock clock={view.clock} color={bottom} receivedAt={receivedAt} active={isActive(bottom)} compact={layout.mobile} />
      </div>
      <div className="gp-self-id">
        <Avatar seat={selfSeat} color={bottom} />
        <div>
          <b>
            <SeatName seat={selfSeat} />
            {you === bottom && <span className="gp-you"> · vous</span>}
          </b>
          <span>{seatSub(selfSeat, bottom, view.ratingDiff?.[bottom] ?? null)}</span>
        </div>
        {layout.mobile && you === bottom && emoteMenu}
      </div>
      {!layout.mobile && (
        <div className="gp-tools">
          <button type="button" className="gp-tool" onClick={() => setFlipped(f => !f)} aria-label="Retourner l'échiquier" title="Retourner l'échiquier">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4v15M8 4 4.5 7.5M8 4l3.5 3.5M16 20V5m0 15-3.5-3.5M16 20l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="gp-tool" onClick={toggleSound} aria-pressed={!sound} aria-label={sound ? 'Couper le son' : 'Activer le son'} title={sound ? 'Couper le son' : 'Activer le son'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              {sound ? (
                <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              ) : (
                <path d="M15.5 9.5l5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              )}
            </svg>
          </button>
          {you === bottom && emoteMenu}
        </div>
      )}
      <EmoteBubble text={emotes[bottom]} />
    </div>
  );

  const endCard = ended && (
    <EndCard view={view} onClose={() => setShowEnd(false)} onRematch={() => void send('game:rematch', {})} loggedIn={!!me} screen={layout.mobile} />
  );

  const board = (
    <div className={`gp-board ${view.status === 'waiting' ? 'is-waiting' : ''}`}>
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
      {iAmCreatorWaiting && <WaitingCard id={id} view={view} catalog={catalog} onCancel={() => void send('game:abort', {})} />}
      {showEnd && ended && !layout.mobile && endCard}
    </div>
  );

  const badge = `${modeLabel(view)} · ${tcLabel(view.clock)}${view.mirror && hasCards ? ' · miroir' : ''}`;

  return (
    <>
      <GameShell
        active
        backdrop
        className={`gp ${!spectator && view.status === 'active' && !myTurn && !ended ? 'their-turn' : ''} ${spectator ? 'is-spectator' : ''} ${!hasCards ? 'no-cards' : ''} ${!hasCards || spectator ? 'no-hand' : ''} ${showRail ? 'has-rail' : ''}`}
        board={board}
        onBack={leave}
        backLabel="Retour"
        badge={badge}
        kicker={
          <span title={catalogDescription(catalog)}>
            {view.status === 'waiting' ? 'Partie en ligne' : `Coup ${moveNo}`} · {catalogTag(catalog)}
          </span>
        }
        title={title}
        hint={hint}
        result={result}
        prompt={prompt}
        actions={actions}
        info={info}
        opponent={{
          name: oppSeat?.name ?? 'En attente…',
          sub: seatSub(oppSeat, top, view.ratingDiff?.[top] ?? null),
          // Main dessinée ici (faces visibles quand le serveur les montre) plutôt que par la coque (dos seulement)
          hand: [],
          avatar: <Avatar seat={oppSeat} color={top} />,
          extra: (
            <>
              <div className={`gp-opp-extra ${isActive(top) ? 'is-turn' : ''}`}>
                <Captured state={state} color={top} />
                <Clock clock={view.clock} color={top} receivedAt={receivedAt} active={isActive(top)} compact={layout.mobile} />
                <EmoteBubble text={emotes[top]} />
              </div>
              {hasCards && !layout.mobile && <HandRow hand={state.hands[top]} label={`Cartes de ${oppSeat?.name ?? colorName(top)}`} />}
            </>
          ),
        }}
        hand={hasCards && you ? myHand : []}
        playable={playable}
        selected={selCard}
        onPickCard={pickCard}
        handLabel={state.cardPlayed && myTurn ? 'Sort lancé · jouez votre coup' : 'Votre main · un sort par tour'}
        toast={announce}
        onEscape={() => {
          if (selCard !== null) cancelCard();
          else if (emoteOpen) setEmoteOpen(false);
          else if (showEnd) setShowEnd(false);
        }}
      />
      {selfBlock}
      {showRail && (
        <aside className="gp-rail" style={{ left: railLeft, top: railTop, bottom: railBottom } as CSSProperties} aria-label="Coups joués">
          <p className="gp-label">Coups</p>
          <MoveList log={state.log} />
        </aside>
      )}
      {showEnd && ended && layout.mobile && endCard}
      {movesOpen && (
        <Modal onClose={() => setMovesOpen(false)}>
          <div className="gp-sheet">
            <p className="gp-kick">Coup {moveNo}</p>
            <h2 className="gp-card-title">Coups joués</h2>
            <MoveList log={state.log} className="is-sheet" />
            <div className="gp-card-actions">
              <button type="button" className="btn-line" onClick={() => setMovesOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}
      {needName && view.status === 'waiting' && (
        <JoinSheet
          mirror={view.mirror}
          catalog={catalog}
          view={view}
          host={view.seats.w?.name ?? view.seats.b?.name ?? 'Un joueur'}
          loggedIn={!!me}
          onJoin={name => {
            if (me) {
              void join();
              return;
            }
            setGuestName(name);
            void join(name);
          }}
        />
      )}
    </>
  );
}
