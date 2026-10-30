// Classement Elo des parties classées : le Hall des archimages.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PageLoader } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, StarMark, useTitle } from './PageScene';

interface Row { username: string; rating: number; games_played: number; wins: number; losses: number; draws: number }

const PLACE_LABEL = ['Premier', 'Deuxième', 'Troisième'];

export default function Leaderboard() {
  useTitle('Classement');
  const [rows, setRows] = useState<Row[] | null>(null);
  const { me } = useApp();
  useEffect(() => {
    api<{ players: Row[] }>('/leaderboard').then(r => setRows(r.players)).catch(() => setRows([]));
  }, []);
  const podium = rows?.slice(0, 3) ?? [];
  const myRank = rows && me ? rows.findIndex(r => r.username === me.username) : -1;
  return (
    <PlacePage place="hall" className="lb">
      <PageHead
        place="Le Hall des archimages"
        aside="Classement"
        title={
          <>
            Les plus grands <em>sorciers.</em>
          </>
        }
        lede="Le classement Elo des parties classées. Une victoire contre plus fort que soi rapporte davantage ; une défaite contre plus faible coûte plus cher."
      >
        {me && (
          <p className="lb-me">
            <StarMark size={12} />
            {myRank >= 0 ? (
              <>
                Vous êtes <b>{myRank + 1}ᵉ</b> avec <b>{me.rating}</b> points.
              </>
            ) : (
              <>
                Votre Elo : <b>{me.rating}</b>. Jouez une partie classée pour entrer dans le Hall.
              </>
            )}
          </p>
        )}
      </PageHead>
      {!rows ? (
        <PageLoader />
      ) : !rows.length ? (
        <div className="empty lb-empty">
          <p>Personne n’est encore classé. Le premier nom gravé dans le Hall peut être le vôtre.</p>
          <Link to="/jouer?mode=quick" className="btn-gold sm">
            Jouer une partie classée
          </Link>
        </div>
      ) : (
        <>
          <ol className="lb-podium" aria-label="Podium">
            {podium.map((r, i) => (
              <li key={r.username} className={`lb-step s${i + 1} ${me?.username === r.username ? 'me' : ''}`}>
                <span className="lb-medal" aria-hidden="true">{['I', 'II', 'III'][i]}</span>
                <span className="avatar lg" aria-hidden="true">{r.username[0]?.toUpperCase()}</span>
                <Link to={`/joueur/${r.username}`} className="lb-name">{r.username}</Link>
                <b className="lb-rating">{r.rating}</b>
                <span className="lb-sub">
                  {PLACE_LABEL[i]} · {r.games_played} parties
                </span>
              </li>
            ))}
          </ol>
          <div className="panel table-wrap">
            <table className="table leaderboard">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Joueur</th>
                  <th>Elo</th>
                  <th>Parties</th>
                  <th>V / D / N</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.username} className={me?.username === r.username ? 'me' : ''}>
                    <td className="rank">{i < 3 ? <span className={`lb-rank r${i + 1}`}>{i + 1}</span> : i + 1}</td>
                    <td>
                      <Link to={`/joueur/${r.username}`}>{r.username}</Link>
                    </td>
                    <td>
                      <b>{r.rating}</b>
                    </td>
                    <td>{r.games_played}</td>
                    <td className="faint">
                      {r.wins} / {r.losses} / {r.draws}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PlacePage>
  );
}
