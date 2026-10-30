// Connexion, inscription, mot de passe oublié, réinitialisation, vérification d'e-mail.
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { Spinner } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, StarMark, useTitle } from './PageScene';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

export default function Auth({ mode }: { mode: Mode }) {
  const { setMe, refresh, toast, me } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { token = '' } = useParams();
  const back = params.get('retour') || '/jouer';
  const safeBack = back.startsWith('/') && !back.startsWith('//') ? back : '/jouer';
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDone(null);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'verify') return;
    api('/auth/verify', { body: { token } })
      .then(() => {
        setDone('Adresse e-mail confirmée. Merci !');
        void refresh();
      })
      .catch(e => setError(errMsg(e)));
  }, [mode, token, refresh]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        const r = await api<{ user: MeUser }>('/auth/login', { body: { login: email, password } });
        setMe(r.user);
        toast(`Bon retour, ${r.user.username} !`, 'success');
        navigate(safeBack);
      } else if (mode === 'register') {
        const r = await api<{ user: MeUser }>('/auth/register', { body: { email, username, password, acceptTerms: terms } });
        setMe(r.user);
        toast('Bienvenue ! Un e-mail de confirmation vous attend.', 'success');
        navigate(safeBack);
      } else if (mode === 'forgot') {
        await api('/auth/forgot', { body: { email } });
        setDone('Si un compte existe avec cette adresse, un lien de réinitialisation vient de vous être envoyé.');
      } else if (mode === 'reset') {
        await api('/auth/reset', { body: { token, password } });
        await refresh();
        toast('Mot de passe modifié, vous êtes connecté.', 'success');
        navigate('/jouer');
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = {
    login: 'Connexion',
    register: 'Créer un compte',
    forgot: 'Mot de passe oublié',
    reset: 'Nouveau mot de passe',
    verify: 'Confirmation de l’e-mail',
  };
  useTitle(titles[mode]);

  // Récit du Seuil, à gauche du formulaire
  const story: Record<Mode, { title: ReactNode; lede: string }> = {
    login: {
      title: (
        <>
          Content de vous <em>revoir.</em>
        </>
      ),
      lede: 'Votre classement, vos parties et votre collection vous attendent de l’autre côté.',
    },
    register: {
      title: (
        <>
          Franchissez <em>le seuil.</em>
        </>
      ),
      lede: 'Un compte gratuit garde la trace de votre chemin. Jouer sans compte reste possible, dès l’accueil.',
    },
    forgot: {
      title: (
        <>
          Un sésame <em>égaré ?</em>
        </>
      ),
      lede: 'Indiquez votre adresse : si un compte y est rattaché, un lien pour en choisir un nouveau vous parvient aussitôt.',
    },
    reset: {
      title: (
        <>
          Un nouveau <em>sésame.</em>
        </>
      ),
      lede: 'Choisissez un mot de passe d’au moins 8 caractères. Vos autres appareils seront déconnectés.',
    },
    verify: {
      title: (
        <>
          Une adresse <em>confirmée.</em>
        </>
      ),
      lede: 'Elle sécurise votre compte et vous permet de retrouver l’accès si vous oubliez votre mot de passe.',
    },
  };

  return (
    <PlacePage place="seuil" className="auth">
      <div className="auth-grid">
        <div className="auth-story">
          <PageHead num="VI" place="Le Seuil" aside={titles[mode]} title={story[mode].title} lede={story[mode].lede} />
          {mode === 'register' && (
            <ul className="auth-perks">
              <li>
                <StarMark size={12} />
                <span>
                  <b>Classement Elo</b> et parties classées contre des joueurs de votre niveau.
                </span>
              </li>
              <li>
                <StarMark size={12} />
                <span>
                  <b>Historique</b> de vos parties, à revoir et à analyser coup par coup.
                </span>
              </li>
              <li>
                <StarMark size={12} />
                <span>
                  <b>Collection</b> de skins et de plateaux, visibles par vos adversaires.
                </span>
              </li>
            </ul>
          )}
          {(mode === 'login' || mode === 'register') && (
            <p className="auth-guest">
              Envie de jouer tout de suite ? <Link to="/">L’échiquier de l’accueil</Link> vous attend, sans compte.
            </p>
          )}
        </div>

        <div className="auth-card panel panel-pad">
          <p className="auth-card-k">
            <span>{titles[mode]}</span>
          </p>

          {mode === 'verify' ? (
            <div className="stack">
              {!done && !error && (
                <div className="center">
                  <Spinner />
                </div>
              )}
              {done && <div className="form-ok">{done}</div>}
              {error && <div className="form-error">{error}</div>}
              <Link to={me ? '/' : '/connexion'} className="btn btn-primary btn-lg btn-block">
                {me ? 'Jouer' : 'Se connecter'}
              </Link>
            </div>
          ) : done ? (
            <div className="stack">
              <div className="form-ok">{done}</div>
              <Link to="/connexion" className="btn btn-block">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form className="stack auth-form" onSubmit={submit}>
              {mode !== 'reset' && (
                <div className="field">
                  <label htmlFor="email">{mode === 'login' ? 'E-mail ou pseudo' : 'Adresse e-mail'}</label>
                  <input
                    id="email"
                    className="input"
                    type={mode === 'login' ? 'text' : 'email'}
                    autoComplete={mode === 'login' ? 'username' : 'email'}
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              )}
              {mode === 'register' && (
                <div className="field">
                  <label htmlFor="username">Pseudo</label>
                  <input
                    id="username"
                    className="input"
                    autoComplete="nickname"
                    required
                    minLength={3}
                    maxLength={20}
                    pattern="[A-Za-z0-9_\-]+"
                    aria-describedby="username-hint"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                  <small id="username-hint" className="faint">
                    3 à 20 caractères : lettres, chiffres, - et _
                  </small>
                </div>
              )}
              {mode !== 'forgot' && (
                <div className="field">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <label htmlFor="password">{mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}</label>
                    {mode === 'login' && (
                      <Link to="/mot-de-passe-oublie" className="auth-forgot">
                        Oublié ?
                      </Link>
                    )}
                  </div>
                  <input
                    id="password"
                    className="input"
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'login' ? 1 : 8}
                    aria-describedby={mode !== 'login' ? 'password-hint' : undefined}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  {mode !== 'login' && (
                    <small id="password-hint" className="faint">
                      8 caractères minimum.
                    </small>
                  )}
                </div>
              )}
              {mode === 'register' && (
                <label className="check">
                  <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
                  <span>
                    J’accepte les{' '}
                    <Link to="/cgu" target="_blank">
                      conditions d’utilisation
                    </Link>{' '}
                    et la{' '}
                    <Link to="/confidentialite" target="_blank">
                      politique de confidentialité
                    </Link>
                    .
                  </span>
                </label>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || (mode === 'register' && !terms)}>
                {busy ? (
                  <Spinner />
                ) : mode === 'login' ? (
                  'Se connecter'
                ) : mode === 'register' ? (
                  'Créer mon compte'
                ) : mode === 'forgot' ? (
                  'Envoyer le lien'
                ) : (
                  'Enregistrer'
                )}
              </button>
              <p className="auth-switch">
                {mode === 'login' && (
                  <>
                    Pas encore de compte ?{' '}
                    <Link to={`/inscription${params.get('retour') ? `?retour=${encodeURIComponent(safeBack)}` : ''}`}>Créer un compte</Link>
                  </>
                )}
                {mode === 'register' && (
                  <>
                    Déjà inscrit ? <Link to={`/connexion${params.get('retour') ? `?retour=${encodeURIComponent(safeBack)}` : ''}`}>Se connecter</Link>
                  </>
                )}
                {mode === 'forgot' && <Link to="/connexion">Retour à la connexion</Link>}
              </p>
            </form>
          )}
        </div>
      </div>
    </PlacePage>
  );
}
