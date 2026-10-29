// Lancer une partie : contre l'IA, invitation, partie classée.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QUICK_CONTROLS, TIME_CONTROLS } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { Spinner } from '../components/Layout';
import { getSocket, emitAck } from '../socket';
import { getGuestName, setGuestName, useApp } from '../store';

type Mode = 'bot' | 'invite' | 'quick';

interface MyGame {
  id: string;
  status: string;
  mode: string;
  opponent: string | null;
  tc: string;
}

const LEVELS = [
  { level: 1, name: 'Apprenti', desc: 'Joue vite et lance ses cartes au hasard.', rating: '≈ 800' },
  { level: 2, name: 'Sorcier', desc: 'Calcule deux coups et garde ses sorts.', rating: '≈ 1300' },
  { level: 3, name: 'Archimage', desc: 'Calcule en profondeur. Bonne chance.', rating: '≈ 1800' },
];

export default function Play() {
  const [params] = useSearchParams();
  const initial = (params.get('mode') as Mode) || 'bot';
  const [mode, setMode] = useState<Mode>(['bot', 'invite', 'quick'].includes(initial) ? initial : 'bot');
  const [tc, setTc] = useState('10+0');
  const [color, setColor] = useState<'w' | 'random' | 'b'>('random');
  const [level, setLevel] = useState(2);
  const [mirror, setMirror] = useState(false);
  const [name, setName] = useState(getGuestName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyGame[]>([]);
  const [queue, setQueue] = useState<{ tc: string; since: number } | null>(null);
  const { me } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    api<{ games: MyGame[] }>('/games/mine').then(r => setMine(r.games)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode === 'quick' && !QUICK_CONTROLS.includes(tc)) setTc('5+0');
  }, [mode, tc]);

  useEffect(() => {
    const s = getSocket();
    const onMatched = (p: { gameId: string }) => navigate(`/partie/${p.gameId}`);
    const onStatus = (p: { waiting: boolean; tc: string | null; since: number | null }) =>
      setQueue(p.waiting && p.tc ? { tc: p.tc, since: p.since ?? Date.now() } : null);
    s.on('queue:matched', onMatched);
    s.on('queue:status', onStatus);
    return () => {
      s.off('queue:matched', onMatched);
      s.off('queue:status', onStatus);
      s.emit('queue:leave');
    };
  }, [navigate]);

  const guestOk = !!me || /^[\p{L}\p{N} _.-]{2,20}$/u.test(name.trim());

  const start = async () => {
    setError(null);
    if (mode === 'quick') {
      setBusy(true);
      try {
        const r = await emitAck<{ ok: boolean; error?: string }>('queue:join', { tc });
        if (!r.ok) setError(r.error ?? 'Impossible de rejoindre la file.');
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!guestOk) {
      setError('Choisis un pseudo de 2 à 20 caractères.');
      return;
    }
    setBusy(true);
    try {
      if (!me) setGuestName(name.trim());
      const r = await api<{ id: string }>('/games', {
        body: { mode, tc, color, level, mirror, name: me ? undefined : name.trim() },
      });
      navigate(`/partie/${r.id}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const tcs = mode === 'quick' ? TIME_CONTROLS.filter(t => QUICK_CONTROLS.includes(t.id)) : TIME_CONTROLS;

  return (
    <div className="container page">
      <h1 className="page-title">Nouvelle partie</h1>
      <p className="page-sub">Choisis ton adversaire. Chacun reçoit trois cartes de pouvoir au hasard.</p>

      <div className="play-grid">
        <div className="mode-list">
          {([
            ['bot', '🤖', 'Contre l’IA', 'Idéal pour découvrir les cartes'],
            ['invite', '🔗', 'Inviter un ami', 'Un lien, même sans compte'],
            ['quick', '🏆', 'Partie classée', 'Adversaire de ton niveau, Elo'],
          ] as [Mode, string, string, string][]).map(([m, icon, title, sub]) => (
            <button key={m} className={`mode-card ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
              <span className="mode-icon">{icon}</span>
              <span>
                <b>{title}</b>
                <small>{sub}</small>
              </span>
            </button>
          ))}

          {mine.length > 0 && (
            <div className="panel panel-pad" style={{ marginTop: 6 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Parties en cours</div>
              <div className="stack" style={{ gap: 8 }}>
                {mine.map(g => (
                  <Link key={g.id} to={`/partie/${g.id}`} className="resume">
                    <span>{g.status === 'waiting' ? 'Invitation en attente' : `contre ${g.opponent ?? '…'}`}</span>
                    <span className="badge">{TIME_CONTROLS.find(t => t.id === g.tc)?.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel panel-pad play-options">
          {mode === 'quick' && !me ? (
            <div className="center" style={{ padding: '30px 10px' }}>
              <div style={{ fontSize: 44 }}>🏆</div>
              <h2 className="display">Les parties classées demandent un compte</h2>
              <p className="muted">C’est gratuit et ça prend 20 secondes. Ton classement Elo et ton historique t’attendent.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to="/inscription" className="btn btn-primary">Créer un compte</Link>
                <Link to="/connexion?retour=/jouer?mode=quick" className="btn">Se connecter</Link>
              </div>
            </div>
          ) : queue ? (
            <QueueWaiting tc={queue.tc} since={queue.since} onCancel={() => { getSocket().emit('queue:leave'); setQueue(null); }} />
          ) : (
            <div className="stack" style={{ gap: 22 }}>
              {mode === 'bot' && (
                <div className="field">
                  <span className="label">Niveau de l’IA</span>
                  <div className="level-grid">
                    {LEVELS.map(l => (
                      <button key={l.level} className={`level ${level === l.level ? 'on' : ''}`} onClick={() => setLevel(l.level)}>
                        <b>{l.name}</b>
                        <small>{l.desc}</small>
                        <span className="badge">{l.rating}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="field">
                <span className="label">Cadence</span>
                <div className="segmented">
                  {tcs.map(t => (
                    <button key={t.id} className={tc === t.id ? 'on' : ''} onClick={() => setTc(t.id)}>
                      {t.label}
                      <small>{t.family}</small>
                    </button>
                  ))}
                </div>
                {tc === 'none' && <small className="faint">Sans pendule, la carte Distorsion temporelle n’est pas distribuée.</small>}
              </div>
              {mode !== 'quick' && (
                <div className="field">
                  <span className="label">Ta couleur</span>
                  <div className="segmented">
                    <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>♔ Blancs</button>
                    <button className={color === 'random' ? 'on' : ''} onClick={() => setColor('random')}>🎲 Au hasard</button>
                    <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>♚ Noirs</button>
                  </div>
                </div>
              )}
              {mode === 'invite' && (
                <label className="check">
                  <input type="checkbox" checked={mirror} onChange={e => setMirror(e.target.checked)} />
                  <span><b>Mode miroir</b> : les deux joueurs reçoivent les mêmes trois cartes.</span>
                </label>
              )}
              {!me && mode !== 'quick' && (
                <div className="field">
                  <label htmlFor="pseudo">Ton pseudo</label>
                  <input id="pseudo" className="input" maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. : Fou du roi" />
                  <small className="faint">Pas de compte nécessaire. <Link to="/inscription">En créer un</Link> pour garder ton historique.</small>
                </div>
              )}
              {error && <div className="form-error">{error}</div>}
              <button className="btn btn-primary btn-lg btn-block" onClick={start} disabled={busy || (mode !== 'quick' && !guestOk)}>
                {busy ? <Spinner /> : mode === 'bot' ? 'Commencer la partie' : mode === 'invite' ? 'Créer le lien d’invitation' : 'Trouver un adversaire'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueWaiting({ tc, since, onCancel }: { tc: string; since: number; onCancel: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return (
    <div className="center" style={{ padding: '30px 10px' }}>
      <div className="pulse-ring" style={{ margin: '0 auto 18px' }}><span>♞</span></div>
      <h2 className="display">Recherche d’un adversaire…</h2>
      <p className="muted">
        Cadence {TIME_CONTROLS.find(t => t.id === tc)?.label} · {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </p>
      <p className="faint" style={{ fontSize: 13 }}>Nous cherchons un joueur de ton niveau. La tolérance s’élargit avec l’attente.</p>
      <button className="btn" onClick={onCancel}>Annuler</button>
    </div>
  );
}
