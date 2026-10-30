// Panneaux posés sur l'échiquier ou au-dessus de la partie : salle d'attente (lien d'invitation), invitation reçue
// (pseudo des invités), sort lancé, adversaire parti, proposition de nulle, fin de partie, coups joués (mobile).
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { opposite } from '../../shared/chess';
import { CARDS } from '../../shared/cards';
import type { CardId, Catalog } from '../../shared/cards';
import { RESULT_TEXT } from '../../shared/game';
import type { GameView } from '../../shared/protocol';
import { Modal, Spinner } from '../components/Layout';
import { SpellCard } from '../components/SpellCard';
import { getGuestName, useApp } from '../store';
import { catalogDescription, catalogTag, colorName, tcLong } from './parts';

export interface Casting {
  card: CardId;
  by: string;
  mine: boolean;
  key: number;
}

const NAME_RE = /^[\p{L}\p{N} _.-]{2,20}$/u;
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
// ---------------------------------------------------------------------------------------------
// Sort lancé : la carte apparaît au-dessus de l'échiquier pendant que la scène 3D joue l'effet

export function CastBanner({ c }: { c: Casting }) {
  const def = CARDS[c.card];
  if (!def) return null;
  return (
    <div className="gp-cast" style={{ '--h': def.hue } as CSSProperties} aria-live="polite">
      <SpellCard id={c.card} size="full" tilt={false} />
      <p className="gp-cast-cap">
        <span>{c.mine ? 'Vous lancez' : `${c.by} lance`}</span>
        <b>{def.name}</b>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Salle d'attente du créateur : lien d'invitation

export function WaitingCard({ id, view, catalog, onCancel }: { id: string; view: GameView; catalog: Catalog; onCancel: () => void }) {
  const url = `${window.location.origin}/partie/${id}`;
  const { toast } = useApp();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Lien copié. Envoyez-le à votre adversaire.', 'success');
    } catch {
      toast('Copie impossible : sélectionnez le lien à la main.', 'error');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Partie de Spellmate', text: 'Je vous défie aux échecs… avec des pouvoirs.', url });
    } catch {
      // partage annulé
    }
  };
  const mine = view.you ?? 'w';
  return (
    <div className="gp-veil">
      <div className="gp-card gp-waiting" role="dialog" aria-label="Invitation">
        <div className="gp-orbit" aria-hidden="true">
          <span />
        </div>
        <p className="gp-kick">Invitation</p>
        <h2 className="gp-card-title">
          Invitez votre <em>adversaire</em>.
        </h2>
        <p className="gp-card-text">Envoyez ce lien : la partie commence dès qu'il l'ouvre, même sans compte.</p>
        <div className="gp-link">
          <input className="input" readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Lien d'invitation" />
          <button type="button" className="btn-gold sm" onClick={copy}>
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <div className="gp-card-actions">
          {'share' in navigator && (
            <button type="button" className="btn-line" onClick={share}>
              Partager…
            </button>
          )}
          <button type="button" className="btn-line" onClick={onCancel}>
            Annuler l'invitation
          </button>
        </div>
        <p className="gp-card-meta">
          Vous jouez les {colorName(mine)} · {tcLong(view.clock)} · {catalogTag(catalog)}
          {view.mirror && catalog !== 'aucune' ? ' · mains miroir' : ''}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Invitation reçue : pseudo d'invité (ou connexion)

export function JoinSheet({ host, loggedIn, mirror, catalog, view, onJoin }: { host: string; loggedIn: boolean; mirror: boolean; catalog: Catalog; view: GameView; onJoin: (name: string) => void }) {
  const [name, setName] = useState(getGuestName());
  const [busy, setBusy] = useState(false);
  const valid = NAME_RE.test(name.trim());
  const back = `/connexion?retour=${encodeURIComponent(location.pathname)}`;
  return (
    <Modal>
      <div className="gp-sheet">
        <p className="gp-kick">Invitation · {tcLong(view.clock)}</p>
        <h2 className="gp-card-title">
          {host} vous <em>défie</em>.
        </h2>
        <p className="gp-card-text">
          {catalog === 'aucune'
            ? 'Une partie d’échecs classiques, sans cartes.'
            : `Les échecs, plus trois cartes de pouvoir chacun. ${catalogDescription(catalog)}`}
        </p>
        {mirror && catalog !== 'aucune' && <p className="gp-note">Mode miroir : vous recevrez tous les deux les mêmes cartes.</p>}
        {!loggedIn ? (
          <form
            className="gp-join"
            onSubmit={e => {
              e.preventDefault();
              if (!valid) return;
              setBusy(true);
              onJoin(name.trim());
            }}
          >
            <div className="field">
              <label htmlFor="gp-guest-name">Votre pseudo</label>
              <input id="gp-guest-name" className="input" autoFocus maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. : Magnus du 93" autoComplete="nickname" />
            </div>
            <button type="submit" className="btn-gold sm gp-join-btn" disabled={!valid || busy}>
              {busy ? <Spinner /> : 'Rejoindre la partie'}
            </button>
            <p className="gp-card-meta">
              Vous avez un compte ? <Link to={back}>Connectez-vous</Link> pour que la partie compte dans votre historique.
            </p>
          </form>
        ) : (
          <div className="gp-card-actions">
            <button type="button" className="btn-gold sm" onClick={() => onJoin('')}>
              Rejoindre la partie
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Bandeaux d'information (toujours visibles dans le panneau de statut)

export function DrawOffer({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="gp-offer" role="alert">
      <p>Votre adversaire propose la nulle.</p>
      <div className="gp-offer-actions">
        <button type="button" className="btn-gold sm" onClick={onAccept}>
          Accepter
        </button>
        <button type="button" className="btn-line" onClick={onDecline}>
          Refuser
        </button>
      </div>
    </div>
  );
}

export function AwayNotice({ since, claimAfter, onClaim }: { since: number; claimAfter: number; onClaim: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const left = Math.max(0, Math.ceil((since + claimAfter - Date.now()) / 1000));
  return (
    <div className="gp-offer is-away" role="status">
      <p>Votre adversaire s'est déconnecté.</p>
      {left > 0 ? (
        <small>Victoire réclamable dans {left} s, s'il ne revient pas.</small>
      ) : (
        <div className="gp-offer-actions">
          <button type="button" className="btn-gold sm" onClick={onClaim}>
            Réclamer la victoire
          </button>
        </div>
      )}
    </div>
  );
}

/** Délai du premier coup : sans coup avant l'échéance, la partie est annulée. */
export function FirstMoveCountdown({ deadline }: { deadline: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (left <= 0 || left > 120) return null;
  return <small>Premier coup avant {left} s, sinon la partie est annulée.</small>;
}

// ---------------------------------------------------------------------------------------------
// Fin de partie, posée sur l'échiquier

export function resultTitle(view: GameView): string {
  const r = view.state.result;
  if (!r) return '';
  if (r.reason === 'aborted') return 'Partie annulée.';
  if (r.winner === null) return 'Partie nulle.';
  if (view.you) return r.winner === view.you ? 'Victoire.' : 'Défaite.';
  return `Victoire des ${colorName(r.winner)}.`;
}

export function rematchLabel(view: GameView): string | null {
  const you = view.you;
  if (!you || view.state.result?.reason === 'aborted') return null;
  if (view.rematch[you]) return 'Revanche proposée…';
  if (view.rematch[opposite(you)]) return 'Accepter la revanche';
  return 'Revanche';
}

export function EndCard({ view, onClose, onRematch, loggedIn, footer, screen }: { view: GameView; onClose: () => void; onRematch: () => void; loggedIn: boolean; footer?: ReactNode; /** Plein écran (mobile) plutôt que sur l'échiquier. */ screen?: boolean }) {
  const r = view.state.result!;
  const you = view.you;
  const win = !!you && r.winner === you;
  const draw = r.winner === null;
  const aborted = r.reason === 'aborted';
  const diff = you && view.ratingDiff ? view.ratingDiff[you] : null;
  const rematch = rematchLabel(view);
  const moves = Math.ceil(view.state.ply / 2);
  return (
    <div className={`gp-veil is-end ${screen ? 'is-screen' : ''}`}>
      <div className={`gp-card gp-end ${aborted ? 'is-aborted' : win ? 'is-win' : draw ? 'is-draw' : you ? 'is-loss' : ''}`} role="dialog" aria-label="Fin de partie">
        <div className="gp-end-mark" aria-hidden="true">
          {aborted ? '✕' : draw ? '½' : win ? '♛' : '♚'}
        </div>
        <p className="gp-kick">Fin de partie{moves > 0 && !aborted ? ` · ${plural(moves, 'coup')}` : ''}</p>
        <h2 className="gp-card-title">{win ? <em>Victoire.</em> : resultTitle(view)}</h2>
        <p className="gp-card-text">{aborted ? 'Elle ne compte ni au classement ni dans l’historique.' : `${RESULT_TEXT[r.reason] ?? 'Partie terminée'}.`}</p>
        {diff !== null && (
          <p className={`gp-end-diff ${diff >= 0 ? 'up' : 'down'}`}>
            {diff >= 0 ? '+' : ''}
            {diff} Elo
          </p>
        )}
        <div className="gp-card-actions">
          {rematch && (
            <button type="button" className="btn-gold sm" onClick={onRematch} disabled={!!you && view.rematch[you]}>
              {rematch}
            </button>
          )}
          <Link to="/jouer" className="btn-line">
            Nouvelle partie
          </Link>
          {!aborted && view.state.ply > 0 && (
            <Link to={`/analyse/${view.id}`} className="btn-line">
              Analyser
            </Link>
          )}
          <button type="button" className="btn-line" onClick={onClose}>
            Voir l'échiquier
          </button>
        </div>
        {!loggedIn && you && (
          <p className="gp-card-meta">
            <Link to="/inscription">Créez un compte gratuit</Link> pour garder votre historique, jouer en classé et débloquer des skins.
          </p>
        )}
        {footer}
      </div>
    </div>
  );
}

