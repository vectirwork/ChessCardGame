// Profil public d'un joueur : son portrait à l'Observatoire.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemById } from '../../shared/catalog';
import { RESULT_TEXT, ResultReason } from '../../shared/game';
import type { GameSummary } from '../../shared/protocol';
import { TIME_CONTROLS } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { PageLoader } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, useTitle } from './PageScene';

interface ProfileData {
  profile: {
    username: string;
    rating: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    skin: string;
    memberSince: string;
    rank: number | null;
  };
  games: GameSummary[];
}

export default function Profile() {
  const { username = '' } = useParams();
  useTitle(username || 'Profil');
  const { me } = useApp();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setError(null);
    api<ProfileData>(`/users/${encodeURIComponent(username)}`)
      .then(setData)
      .catch(e => setError(errMsg(e)));
  }, [username]);
  if (error)
    return (
      <PlacePage place="observatoire" className="prof" narrow>
        <PageHead
          place="L’Observatoire"
          aside="Profil"
          title={
            <>
              Joueur <em>introuvable.</em>
            </>
          }
          lede={error}
          center
        >
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <Link to="/classement" className="btn">
              Voir le classement
            </Link>
          </div>
        </PageHead>
      </PlacePage>
    );
  if (!data) return <PageLoader />;
  const p = data.profile;
  const winRate = p.gamesPlayed ? Math.round((p.wins / p.gamesPlayed) * 100) : 0;
  const skin = itemById(p.skin);
  const isMe = me?.username === p.username;
  const share = (n: number) => (p.gamesPlayed ? `${(n / p.gamesPlayed) * 100}%` : '0%');
  return (
    <PlacePage place="observatoire" className="prof">
      <div className="prof-head">
        <div className="prof-id">
          <span className="prof-avatar" style={{ '--p': skin?.skin?.primary ?? '#f3c969' } as CSSProperties} aria-hidden="true">
            <span className="avatar lg">{p.username[0]?.toUpperCase()}</span>
          </span>
          <PageHead
            place="L’Observatoire"
            aside={p.rank ? `${p.rank}ᵉ au classement` : 'Profil'}
            title={p.username}
            lede={
              <>
                Membre depuis {new Date(p.memberSince).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                {skin && (
                  <>
                    {' '}
                    · skin <b className="prof-skin">{skin.name}</b>
                  </>
                )}
                {isMe && (
                  <>
                    {' '}
                    · <Link to="/compte">Gérer mon compte</Link>
                  </>
                )}
              </>
            }
          />
        </div>
        <div className="prof-rating">
          <b>{p.rating}</b>
          <span>Elo{p.rank ? ` · ${p.rank}ᵉ` : ''}</span>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <b>{p.gamesPlayed}</b>
          <span>parties classées</span>
        </div>
        <div className="stat">
          <b className="win">{p.wins}</b>
          <span>victoires</span>
        </div>
        <div className="stat">
          <b className="loss">{p.losses}</b>
          <span>défaites</span>
        </div>
        <div className="stat">
          <b>{p.draws}</b>
          <span>nulles</span>
        </div>
        <div className="stat">
          <b className="gold">{winRate} %</b>
          <span>de victoires</span>
        </div>
      </div>
      {p.gamesPlayed > 0 && (
        <div className="prof-bar" role="img" aria-label={`${p.wins} victoires, ${p.draws} nulles, ${p.losses} défaites`}>
          <i className="w" style={{ width: share(p.wins) }} />
          <i className="d" style={{ width: share(p.draws) }} />
          <i className="l" style={{ width: share(p.losses) }} />
        </div>
      )}

      <h2 className="section-title prof-games-t">Dernières parties</h2>
      {data.games.length ? <GamesTable games={data.games} me={p.username} /> : <div className="empty">Aucune partie terminée pour le moment.</div>}
    </PlacePage>
  );
}

export function GamesTable({ games, me }: { games: GameSummary[]; me: string }) {
  return (
    <div className="panel table-wrap">
      <table className="table games-table">
        <thead>
          <tr>
            <th>Partie</th>
            <th>Résultat</th>
            <th>Cadence</th>
            <th>Coups</th>
            <th>Date</th>
            <th>
              <span className="sr-only">Revoir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {games.map(g => {
            const isWhite = g.white === me;
            const mine = isWhite ? 'w' : 'b';
            const res = g.winner === 'draw' || g.winner === null ? 'draw' : g.winner === mine ? 'win' : 'loss';
            return (
              <tr key={g.id}>
                <td>
                  <span className="gt-players">
                    <span className="gt-p">
                      <i className="gt-dot w" aria-label="Blancs" />
                      {g.white}
                    </span>
                    <span className="gt-p">
                      <i className="gt-dot b" aria-label="Noirs" />
                      {g.black}
                    </span>
                  </span>
                </td>
                <td>
                  <span className={`badge ${res === 'win' ? 'green' : res === 'loss' ? 'red' : ''}`}>
                    {res === 'win' ? 'Victoire' : res === 'loss' ? 'Défaite' : 'Nulle'}
                  </span>{' '}
                  <span className="faint" style={{ fontSize: 12.5 }}>
                    {RESULT_TEXT[g.reason as ResultReason] ?? ''}
                  </span>
                </td>
                <td>
                  {TIME_CONTROLS.find(t => t.id === g.timeControl)?.label ?? g.timeControl}
                  {g.rated ? ' · classée' : ''}
                </td>
                <td>{Math.ceil(g.plies / 2)}</td>
                <td className="faint">{new Date(g.createdAt).toLocaleDateString('fr-FR')}</td>
                <td className="gt-act">
                  <Link to={`/analyse/${g.id}`} className="btn btn-sm">
                    Revoir
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
