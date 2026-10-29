// Classement Elo des parties classées.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PageLoader } from '../components/Layout';
import { useApp } from '../store';

interface Row { username: string; rating: number; games_played: number; wins: number; losses: number; draws: number }

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const { me } = useApp();
  useEffect(() => {
    api<{ players: Row[] }>('/leaderboard').then(r => setRows(r.players)).catch(() => setRows([]));
  }, []);
  return (
    <div className="container page" style={{ maxWidth: 900 }}>
      <span className="eyebrow">Hall des archimages</span>
      <h1 className="page-title">Classement</h1>
      <p className="page-sub">Le classement Elo des parties classées. Une victoire contre plus fort que soi rapporte davantage.</p>
      {!rows ? <PageLoader /> : !rows.length ? (
        <div className="empty">
          Personne n’est encore classé. Soyez le premier !<br /><br />
          <Link to="/jouer?mode=quick" className="btn btn-primary">Jouer une partie classée</Link>
        </div>
      ) : (
        <div className="panel table-wrap">
          <table className="table leaderboard">
            <thead><tr><th>#</th><th>Joueur</th><th>Elo</th><th>Parties</th><th>V / D / N</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.username} className={me?.username === r.username ? 'me' : ''}>
                  <td className="rank">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                  <td><Link to={`/joueur/${r.username}`}>{r.username}</Link></td>
                  <td><b>{r.rating}</b></td>
                  <td>{r.games_played}</td>
                  <td className="faint">{r.wins} / {r.losses} / {r.draws}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
