// Parties en direct : GET /api/games/live, rafraîchi régulièrement ; un clic pour regarder la partie.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import { catalogLabel, movesFromPlies } from '../features/format';
import { PageHead, useTitle } from '../features/ui';
import type { Catalog } from '../../shared/cards';
import { TIME_CONTROLS } from '../../shared/protocol';

interface LiveGame {
  id: string;
  mode: string;
  rated: boolean;
  tc: string;
  catalog: Catalog;
  white: string | null;
  black: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  vsBot: boolean;
  plies: number;
  spectators: number;
  lastActivity: number;
}

const REFRESH_MS = 10_000;
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function tcText(id: string): string {
  const t = TIME_CONTROLS.find(x => x.id === id);
  return t ? (t.tc ? `${t.family} ${t.label}` : t.label) : id;
}

export default function Live() {
  useTitle('Parties en direct');
  const [games, setGames] = useState<LiveGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ games: LiveGame[] }>('/games/live');
      if (!alive.current) return;
      setGames(r.games);
      setError(null);
      setAt(Date.now());
    } catch (e) {
      if (alive.current) setError(errMsg(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive.current = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const humans = (games ?? []).filter(g => !g.vsBot);
  const bots = (games ?? []).filter(g => g.vsBot);

  return (
    <div className="container page ft-page">
      <PageHead
        kicker="En direct"
        title={<>Les parties <em>en cours</em></>}
        sub="Regardez les parties qui se jouent en ce moment sur Spellmate, sans vous asseoir à l’échiquier. Les parties entre joueurs d’abord."
      >
        <div className="ft-head-row">
          <button type="button" className="btn btn-sm" onClick={() => void load()} disabled={loading}>Actualiser</button>
          <span className="faint" aria-live="polite">
            {at ? `Mis à jour à ${TIME_FMT.format(at)} · actualisation toutes les ${REFRESH_MS / 1000} s` : 'Chargement…'}
          </span>
        </div>
      </PageHead>

      {error && <p className="ft-note bad" role="alert">{error}</p>}
      {games && !games.length && (
        <div className="ft-empty panel panel-pad">
          <p>Aucune partie en cours pour l’instant.</p>
          <p className="muted">Lancez-en une depuis l’accueil : la première pourrait bien être la vôtre.</p>
          <Link className="btn btn-primary btn-sm" to="/">Jouer une partie</Link>
        </div>
      )}
      {humans.length > 0 && <LiveSection title="Entre joueurs" games={humans} />}
      {bots.length > 0 && <LiveSection title="Contre l’IA" games={bots} />}
    </div>
  );
}

function LiveSection({ title, games }: { title: string; games: LiveGame[] }) {
  return (
    <section className="ft-group" aria-label={title}>
      <h2 className="ft-group-title">{title} <span className="ft-count">{games.length}</span></h2>
      <ul className="ft-live">
        {games.map(g => (
          <li key={g.id}>
            <Link to={`/partie/${g.id}`} className="ft-live-card" aria-label={`Regarder ${g.white ?? 'Blancs'} contre ${g.black ?? 'Noirs'}`}>
              <span className="ft-live-top">
                <span className="ft-dot" aria-hidden="true" />
                <span>{g.rated ? 'Classée' : 'Amicale'} · {tcText(g.tc)}</span>
                <span className="ft-live-cat">{catalogLabel(g.catalog)}</span>
              </span>
              <span className="ft-pl w"><i aria-hidden="true" />{g.white ?? 'Blancs'}{g.whiteRating ? <small> {g.whiteRating}</small> : null}</span>
              <span className="ft-pl b"><i aria-hidden="true" />{g.black ?? 'Noirs'}{g.blackRating ? <small> {g.blackRating}</small> : null}</span>
              <span className="ft-live-foot">
                <span>{g.plies ? `Coup ${movesFromPlies(g.plies + 1)}` : 'Premiers coups'}</span>
                {g.spectators > 0 && <span>{g.spectators} spectateur{g.spectators > 1 ? 's' : ''}</span>}
                <span className="ft-live-go">Regarder →</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
