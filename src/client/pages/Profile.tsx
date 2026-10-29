// Profil public d'un joueur.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { itemById } from '../../shared/catalog';
import { RESULT_TEXT, ResultReason } from '../../shared/game';
import type { GameSummary } from '../../shared/protocol';
import { TIME_CONTROLS } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { PageLoader } from '../components/Layout';

interface ProfileData {
  profile: { username: string; rating: number; gamesPlayed: number; wins: number; losses: number; draws: number; skin: string; memberSince: string; rank: number | null };
  games: GameSummary[];
}

export default function Profile() {
  const { username = '' } = useParams();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    api<ProfileData>(`/users/${encodeURIComponent(username)}`).then(setData).catch(e => setError(errMsg(e)));
  }, [username]);
  if (error) return <div className="container page center"><h1 className="page-title">Joueur introuvable</h1><p className="muted">{error}</p></div>;
  if (!data) return <PageLoader />;
  const p = data.profile;
  const winRate = p.gamesPlayed ? Math.round((p.wins / p.gamesPlayed) * 100) : 0;
  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      <div className="profile-head panel panel-pad">
        <span className="avatar lg">{p.username[0]?.toUpperCase()}</span>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{p.username}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Membre depuis {new Date(p.memberSince).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} · skin {itemById(p.skin)?.name}
          </p>
        </div>
        <div className="profile-rating">
          <b>{p.rating}</b>
          <span>Elo{p.rank ? ` · ${p.rank}ᵉ` : ''}</span>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat panel"><b>{p.gamesPlayed}</b><span>parties classées</span></div>
        <div className="stat panel"><b className="win">{p.wins}</b><span>victoires</span></div>
        <div className="stat panel"><b className="loss">{p.losses}</b><span>défaites</span></div>
        <div className="stat panel"><b>{p.draws}</b><span>nulles</span></div>
        <div className="stat panel"><b>{winRate} %</b><span>de victoires</span></div>
      </div>
      <h2 className="section-title" style={{ fontSize: 24, marginTop: 34 }}>Dernières parties</h2>
      {data.games.length ? <GamesTable games={data.games} me={p.username} /> : <div className="empty">Aucune partie terminée pour le moment.</div>}
    </div>
  );
}

export function GamesTable({ games, me }: { games: GameSummary[]; me: string }) {
  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead><tr><th>Partie</th><th>Résultat</th><th>Cadence</th><th>Coups</th><th>Date</th></tr></thead>
        <tbody>
          {games.map(g => {
            const isWhite = g.white === me;
            const mine = isWhite ? 'w' : 'b';
            const res = g.winner === 'draw' || g.winner === null ? 'draw' : g.winner === mine ? 'win' : 'loss';
            return (
              <tr key={g.id}>
                <td><Link to={`/partie/${g.id}`}>⚪ {g.white} <span className="faint">vs</span> ⚫ {g.black}</Link></td>
                <td>
                  <span className={`badge ${res === 'win' ? 'green' : res === 'loss' ? 'red' : ''}`}>{res === 'win' ? 'Victoire' : res === 'loss' ? 'Défaite' : 'Nulle'}</span>{' '}
                  <span className="faint" style={{ fontSize: 12.5 }}>{RESULT_TEXT[g.reason as ResultReason] ?? ''}</span>
                </td>
                <td>{TIME_CONTROLS.find(t => t.id === g.timeControl)?.label ?? g.timeControl}{g.rated ? ' · classée' : ''}</td>
                <td>{Math.ceil(g.plies / 2)}</td>
                <td className="faint">{new Date(g.createdAt).toLocaleDateString('fr-FR')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
