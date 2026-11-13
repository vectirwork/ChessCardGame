// Mes parties : historique du compte (GET /api/games/recent) et parties jouées sur cet appareil (liste locale).
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errMsg } from '../api';
import { formatDate, movesFromPlies, outcomeFor, reasonText } from '../features/format';
import { HISTORY_KEY, PlayedGame, forgetGame } from '../features/history';
import { useStored } from '../features/storage';
import { PageHead, useTitle } from '../features/ui';
import { useApp } from '../store';
import { CATALOGS } from '../../shared/cards';
import type { Color } from '../../shared/chess';
import type { Rules } from '../../shared/config/rules';
import { tcLabel } from '../../shared/protocol';
import type { GameSummary } from '../../shared/protocol';
import { compte } from '../../shared/text/fr';
import { catalogLabel, colorName, modeLabel } from '../../shared/text/libelles';

interface Row {
  id: string;
  white: string;
  black: string;
  whiteRating?: number | null;
  blackRating?: number | null;
  you: Color | null;
  winner: Color | 'draw' | null | undefined;
  reason: string | null | undefined;
  date: number | string;
  plies?: number;
  tags: string[];
  /** Règles de la partie, si l'appareil les a gardées (parties locales et en ligne d'autres règles que RULES_V1). */
  rules?: Rules;
}

export default function MyGames() {
  useTitle('Mes parties');
  const { me, ready } = useApp();
  const navigate = useNavigate();
  const [server, setServer] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local] = useStored<PlayedGame[]>(HISTORY_KEY, []);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) {
      setServer(null);
      return;
    }
    let alive = true;
    api<{ games: GameSummary[] }>('/games/recent')
      .then(r => alive && setServer(r.games))
      .catch(e => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [me]);

  const serverRows: Row[] = (server ?? []).map(g => ({
    id: g.id,
    white: g.white ?? colorName('w'),
    black: g.black ?? colorName('b'),
    whiteRating: g.whiteRating,
    blackRating: g.blackRating,
    you: me ? (g.white === me.username ? 'w' : g.black === me.username ? 'b' : null) : null,
    winner: g.winner,
    reason: g.reason,
    date: g.createdAt,
    plies: g.plies,
    tags: [modeLabel(g.mode, g.rated, 'liste'), tcLabel(g.timeControl)].filter(Boolean),
  }));
  const serverIds = new Set(serverRows.map(r => r.id));
  const localRows: Row[] = (Array.isArray(local) ? local : [])
    .filter(g => g && typeof g.id === 'string' && !serverIds.has(g.id))
    .map(g => ({
      id: g.id,
      white: g.white,
      black: g.black,
      you: g.you,
      winner: g.winner,
      reason: g.reason,
      date: g.at,
      plies: g.plies,
      rules: g.rules,
      tags: [
        g.local ? 'Sur cet appareil' : g.vsBot ? modeLabel('bot', false, 'liste') : 'En ligne',
        g.catalog ? catalogLabel(g.catalog, CATALOGS, true) : '',
        g.timeControl ?? '',
      ].filter(Boolean),
    }));

  const openLink = (e: FormEvent) => {
    e.preventDefault();
    const m = /([A-Za-z0-9]{6,16})\/?(?:[?#].*)?$/.exec(link.trim());
    if (!m) {
      setLinkError('Collez le lien d’une partie (…/partie/abc123) ou son identifiant.');
      return;
    }
    navigate(`/analyse/${m[1]}`);
  };

  return (
    <div className="container page ft-page">
      <PageHead
        kicker="Mes parties"
        title={<>Vos parties, <em>à revoir</em></>}
        sub={me
          ? 'Vos dernières parties terminées. Ouvrez-en une pour la rejouer coup par coup, avec la courbe d’évaluation et les erreurs graves signalées.'
          : 'Les parties jouées sur cet appareil. Avec un compte, votre historique vous suit partout.'}
      />

      {me && (
        <section className="ft-group" aria-labelledby="pc">
          <h2 id="pc" className="ft-group-title">Sur votre compte</h2>
          {error && <p className="ft-note bad" role="alert">{error}</p>}
          {!server && !error && <p className="ft-meta">Chargement…</p>}
          {server && !serverRows.length && <p className="ft-empty">Aucune partie terminée pour l’instant. <Link to="/">Jouer une partie</Link></p>}
          {serverRows.length > 0 && <GameList rows={serverRows} />}
        </section>
      )}

      <section className="ft-group" aria-labelledby="pl">
        <h2 id="pl" className="ft-group-title">{me ? 'Sur cet appareil' : 'Parties récentes'}</h2>
        {localRows.length ? (
          <GameList rows={localRows} onForget={id => forgetGame(id)} />
        ) : (
          <p className="ft-empty">
            {me ? 'Aucune autre partie enregistrée dans ce navigateur.' : 'Aucune partie enregistrée dans ce navigateur pour l’instant.'}{' '}
            <Link to="/">Jouer une partie</Link>
            {ready && !me && <> · <Link to="/connexion">Se connecter</Link></>}
          </p>
        )}
      </section>

      <section className="ft-group" aria-labelledby="ol">
        <h2 id="ol" className="ft-group-title">Revoir une partie par son lien</h2>
        <form className="ft-linkform" onSubmit={openLink}>
          <input
            className="input"
            value={link}
            onChange={e => { setLink(e.target.value); setLinkError(null); }}
            placeholder="https://…/partie/abc123"
            aria-label="Lien ou identifiant de la partie"
          />
          <button type="submit" className="btn" disabled={!link.trim()}>Ouvrir dans l’Analyse</button>
        </form>
        {linkError && <p className="ft-note bad" role="alert">{linkError}</p>}
      </section>
    </div>
  );
}

function GameList({ rows, onForget }: { rows: Row[]; onForget?: (id: string) => void }) {
  return (
    <ul className="ft-games">
      {rows.map(r => {
        const o = outcomeFor(r.winner ?? null, r.you);
        return (
          <li key={r.id} className="ft-game">
            <span className={`ft-outcome ${o.tone}`}>{o.text}</span>
            <span className="ft-game-players">
              <span className={`ft-pl w ${r.you === 'w' ? 'me' : ''}`}><i aria-hidden="true" />{r.white}{r.whiteRating ? <small> {r.whiteRating}</small> : null}</span>
              <span className={`ft-pl b ${r.you === 'b' ? 'me' : ''}`}><i aria-hidden="true" />{r.black}{r.blackRating ? <small> {r.blackRating}</small> : null}</span>
            </span>
            <span className="ft-game-meta">
              <span>{[reasonText(r.reason, r.rules), r.plies ? compte(movesFromPlies(r.plies), 'coup') : ''].filter(Boolean).join(' · ')}</span>
              <small>{r.tags.join(' · ')}</small>
            </span>
            <span className="ft-game-date">{formatDate(r.date)}</span>
            <span className="ft-game-act">
              <Link className="btn btn-sm" to={`/analyse/${r.id}`}>Revoir</Link>
              {onForget && (
                <button type="button" className="ft-icon sm" aria-label="Retirer de la liste" title="Retirer de la liste" onClick={() => onForget(r.id)}>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" /></svg>
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
