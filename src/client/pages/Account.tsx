// Gestion du compte : profil, sécurité, collection, achats, données personnelles.
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ITEMS, formatPrice, productById } from '../../shared/catalog';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { PageLoader, Spinner } from '../components/Layout';
import { useApp } from '../store';
import { Swatch } from './Shop';

type Tab = 'profile' | 'security' | 'collection' | 'purchases' | 'data';

export default function Account() {
  const { me, ready } = useApp();
  const [tab, setTab] = useState<Tab>('profile');
  if (!ready) return <PageLoader />;
  if (!me) return <Navigate to="/connexion?retour=/compte" replace />;
  return (
    <div className="container page narrow" style={{ maxWidth: 860 }}>
      <div className="row" style={{ gap: 18, marginBottom: 26 }}>
        <span className="avatar lg">{me.username[0]?.toUpperCase()}</span>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{me.username}</h1>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <span className="badge gold">Elo {me.rating}</span>
            <span className="badge">{me.gamesPlayed} parties classées</span>
            <Link to={`/joueur/${me.username}`} style={{ fontSize: 14 }}>Voir mon profil public</Link>
          </div>
        </div>
      </div>
      <div className="tabs">
        {([['profile', 'Profil'], ['security', 'Sécurité'], ['collection', 'Collection'], ['purchases', 'Achats'], ['data', 'Mes données']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab me={me} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'collection' && <CollectionTab me={me} />}
      {tab === 'purchases' && <PurchasesTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

function useForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const msg = await fn();
      if (msg) setOk(msg);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, ok, run };
}

function ProfileTab({ me }: { me: MeUser }) {
  const { setMe } = useApp();
  const [username, setUsername] = useState(me.username);
  const [email, setEmail] = useState(me.email);
  const [password, setPassword] = useState('');
  const f1 = useForm();
  const f2 = useForm();
  const f3 = useForm();
  return (
    <div className="stack" style={{ gap: 20 }}>
      <form className="panel panel-pad stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void f1.run(async () => { const r = await api<{ user: MeUser }>('/account/profile', { method: 'PATCH', body: { username } }); setMe(r.user); return 'Pseudo mis à jour.'; }); }}>
        <h3>Pseudo</h3>
        <div className="field">
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} maxLength={20} />
        </div>
        {f1.error && <div className="form-error">{f1.error}</div>}
        {f1.ok && <div className="form-ok">{f1.ok}</div>}
        <div><button className="btn" disabled={f1.busy || username === me.username}>{f1.busy ? <Spinner /> : 'Enregistrer'}</button></div>
      </form>
      <form className="panel panel-pad stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void f2.run(async () => { const r = await api<{ user: MeUser }>('/account/email', { body: { email, password } }); setMe(r.user); setPassword(''); return 'Adresse modifiée : un lien de confirmation vous a été envoyé.'; }); }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Adresse e-mail</h3>
          {me.emailVerified ? <span className="badge green">Vérifiée</span> : <span className="badge red">Non vérifiée</span>}
        </div>
        {!me.emailVerified && (
          <div className="notice">
            <span>✉️</span>
            <span>Confirmez votre adresse pour sécuriser votre compte.{' '}
              <button type="button" className="btn btn-sm" onClick={() => void f3.run(async () => { await api('/auth/resend-verification', { body: {} }); return 'E-mail envoyé.'; })}>Renvoyer le lien</button>
            </span>
          </div>
        )}
        {f3.ok && <div className="form-ok">{f3.ok}</div>}
        <div className="field">
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        {email !== me.email && (
          <div className="field">
            <label>Mot de passe actuel (pour confirmer)</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
        )}
        {f2.error && <div className="form-error">{f2.error}</div>}
        {f2.ok && <div className="form-ok">{f2.ok}</div>}
        <div><button className="btn" disabled={f2.busy || email === me.email || !password}>{f2.busy ? <Spinner /> : 'Changer d’adresse'}</button></div>
      </form>
    </div>
  );
}

function SecurityTab() {
  const { setMe } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const f = useForm();
  const g = useForm();
  return (
    <div className="stack" style={{ gap: 20 }}>
      <form className="panel panel-pad stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void f.run(async () => { await api('/account/password', { body: { current, next } }); setCurrent(''); setNext(''); return 'Mot de passe modifié. Vos autres appareils ont été déconnectés.'; }); }}>
        <h3>Changer de mot de passe</h3>
        <div className="field"><label>Mot de passe actuel</label><input className="input" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} /></div>
        <div className="field"><label>Nouveau mot de passe</label><input className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={e => setNext(e.target.value)} /></div>
        {f.error && <div className="form-error">{f.error}</div>}
        {f.ok && <div className="form-ok">{f.ok}</div>}
        <div><button className="btn" disabled={f.busy || !current || next.length < 8}>{f.busy ? <Spinner /> : 'Modifier'}</button></div>
      </form>
      <div className="panel panel-pad stack">
        <h3>Sessions</h3>
        <p className="muted" style={{ margin: 0 }}>Déconnecte tous les appareils, y compris celui-ci.</p>
        {g.error && <div className="form-error">{g.error}</div>}
        <div><button className="btn" disabled={g.busy} onClick={() => void g.run(async () => { await api('/account/logout-all', { body: {} }); setMe(null); })}>Se déconnecter partout</button></div>
      </div>
    </div>
  );
}

function CollectionTab({ me }: { me: MeUser }) {
  const { setMe, toast } = useApp();
  const equip = async (id: string) => {
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: { itemId: id } });
      setMe(r.user);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="stack" style={{ gap: 26 }}>
      {(['skin', 'board'] as const).map(kind => (
        <div key={kind}>
          <h3>{kind === 'skin' ? 'Skins d’animation' : 'Plateaux'}</h3>
          <div className="collection">
            {ITEMS.filter(i => i.kind === kind).map(i => {
              const has = me.items.includes(i.id);
              const on = me.equippedSkin === i.id || me.equippedBoard === i.id;
              return (
                <button key={i.id} className={`coll-item ${on ? 'on' : ''} ${has ? '' : 'locked'}`} onClick={() => has && !on && equip(i.id)} disabled={!has}>
                  <Swatch item={i} small />
                  <span>{i.name}</span>
                  <small>{on ? '✓ Équipé' : has ? 'Équiper' : '🔒'}</small>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <Link to="/boutique" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Agrandir ma collection</Link>
    </div>
  );
}

function PurchasesTab() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    api<{ purchases: any[] }>('/account/purchases').then(r => setRows(r.purchases)).catch(() => setRows([]));
  }, []);
  if (!rows) return <PageLoader />;
  if (!rows.length) return <div className="empty">Aucun achat pour le moment. <Link to="/boutique">Découvrir la boutique</Link></div>;
  const status: Record<string, string> = { paid: 'Payé', refunded: 'Remboursé', failed: 'Échoué' };
  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead><tr><th>Date</th><th>Produit</th><th>Montant</th><th>Statut</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
              <td>{productById(r.product_id)?.name ?? r.product_id}{r.provider === 'demo' && <span className="badge" style={{ marginLeft: 8 }}>démo</span>}</td>
              <td>{formatPrice(r.amount_cents)}</td>
              <td><span className={`badge ${r.status === 'paid' ? 'green' : 'red'}`}>{status[r.status] ?? r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="faint" style={{ fontSize: 12.5, padding: '0 14px 12px' }}>Le reçu de chaque paiement vous a été envoyé par e-mail par Stripe.</p>
    </div>
  );
}

function DataTab() {
  const { setMe, toast } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const f = useForm();
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="panel panel-pad stack">
        <h3>Exporter mes données</h3>
        <p className="muted" style={{ margin: 0 }}>Téléchargez toutes les données associées à votre compte (profil, parties, achats) au format JSON.</p>
        <div><a className="btn" href="/api/account/export" download>Télécharger mes données</a></div>
      </div>
      <form className="panel panel-pad stack danger-zone" onSubmit={(e: FormEvent) => { e.preventDefault(); void f.run(async () => { await api('/account', { method: 'DELETE', body: { password } }); setMe(null); toast('Votre compte a été supprimé.'); }); }}>
        <h3>Supprimer mon compte</h3>
        <p className="muted" style={{ margin: 0 }}>Suppression définitive : profil, classement, collection et historique. Les factures sont conservées de façon anonymisée, comme la loi l’exige. Cette action est irréversible.</p>
        <label className="check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> <span>Je comprends que mes achats seront perdus.</span></label>
        <div className="field"><label>Mot de passe</label><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></div>
        {f.error && <div className="form-error">{f.error}</div>}
        <div><button className="btn btn-danger" disabled={!confirm || !password || f.busy}>{f.busy ? <Spinner /> : 'Supprimer définitivement'}</button></div>
      </form>
    </div>
  );
}
