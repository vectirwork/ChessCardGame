// Gestion du compte : profil, sécurité, collection, achats, données personnelles.
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ITEMS, formatPrice, productById } from '../../shared/catalog';
import type { CSSProperties } from 'react';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { PageLoader, Spinner } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, StarMark, useTitle } from './PageScene';
import { Swatch } from './Shop';

type Tab = 'profile' | 'security' | 'collection' | 'purchases' | 'data';

const TABS: [Tab, string][] = [
  ['profile', 'Profil'],
  ['security', 'Sécurité'],
  ['collection', 'Collection'],
  ['purchases', 'Achats'],
  ['data', 'Mes données'],
];
const TAB_PARAM: Record<string, Tab> = { profil: 'profile', securite: 'security', collection: 'collection', achats: 'purchases', donnees: 'data' };

export default function Account() {
  useTitle('Mon compte');
  const { me, ready } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => TAB_PARAM[params.get('onglet') ?? ''] ?? 'profile');
  if (!ready) return <PageLoader />;
  if (!me) return <Navigate to="/connexion?retour=/compte" replace />;
  const owned = ITEMS.filter(i => !i.free && me.items.includes(i.id)).length;
  return (
    <PlacePage place="cabinet" className="acc" narrow>
      <div className="acc-head">
        <span className="acc-avatar" aria-hidden="true">
          <span className="avatar lg">{me.username[0]?.toUpperCase()}</span>
        </span>
        <PageHead place="Le Cabinet" aside="Mon compte" title={me.username}>
          <div className="acc-badges">
            <span className="badge gold">Elo {me.rating}</span>
            <span className="badge">{me.gamesPlayed} parties classées</span>
            <span className="badge">{owned} objets premium</span>
            <Link to={`/joueur/${me.username}`} className="btn-line">
              Voir mon profil public
            </Link>
          </div>
        </PageHead>
      </div>
      <div className="tabs" role="tablist" aria-label="Rubriques du compte">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab me={me} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'collection' && <CollectionTab me={me} />}
      {tab === 'purchases' && <PurchasesTab />}
      {tab === 'data' && <DataTab />}
    </PlacePage>
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
      <form
        className="panel panel-pad stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void f1.run(async () => {
            const r = await api<{ user: MeUser }>('/account/profile', { method: 'PATCH', body: { username } });
            setMe(r.user);
            return 'Pseudo mis à jour.';
          });
        }}
      >
        <h3>Pseudo</h3>
        <div className="field">
          <input className="input" aria-label="Pseudo" value={username} onChange={e => setUsername(e.target.value)} maxLength={20} />
        </div>
        {f1.error && <div className="form-error">{f1.error}</div>}
        {f1.ok && <div className="form-ok">{f1.ok}</div>}
        <div>
          <button className="btn" disabled={f1.busy || username === me.username}>
            {f1.busy ? <Spinner /> : 'Enregistrer'}
          </button>
        </div>
      </form>
      <form
        className="panel panel-pad stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void f2.run(async () => {
            const r = await api<{ user: MeUser }>('/account/email', { body: { email, password } });
            setMe(r.user);
            setPassword('');
            return 'Adresse modifiée : un lien de confirmation vous a été envoyé.';
          });
        }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Adresse e-mail</h3>
          {me.emailVerified ? <span className="badge green">Vérifiée</span> : <span className="badge red">Non vérifiée</span>}
        </div>
        {!me.emailVerified && (
          <div className="notice">
            <span className="notice-k">À faire</span>
            <span>
              Confirmez votre adresse pour sécuriser votre compte.{' '}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void f3.run(async () => {
                    await api('/auth/resend-verification', { body: {} });
                    return 'E-mail envoyé.';
                  })
                }
              >
                Renvoyer le lien
              </button>
            </span>
          </div>
        )}
        {f3.ok && <div className="form-ok">{f3.ok}</div>}
        <div className="field">
          <input className="input" type="email" aria-label="Adresse e-mail" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        {email !== me.email && (
          <div className="field">
            <label htmlFor="acc-pw-mail">Mot de passe actuel (pour confirmer)</label>
            <input
              id="acc-pw-mail"
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        )}
        {f2.error && <div className="form-error">{f2.error}</div>}
        {f2.ok && <div className="form-ok">{f2.ok}</div>}
        <div>
          <button className="btn" disabled={f2.busy || email === me.email || !password}>
            {f2.busy ? <Spinner /> : 'Changer d’adresse'}
          </button>
        </div>
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
      <form
        className="panel panel-pad stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void f.run(async () => {
            await api('/account/password', { body: { current, next } });
            setCurrent('');
            setNext('');
            return 'Mot de passe modifié. Vos autres appareils ont été déconnectés.';
          });
        }}
      >
        <h3>Changer de mot de passe</h3>
        <div className="field">
          <label htmlFor="acc-pw-cur">Mot de passe actuel</label>
          <input id="acc-pw-cur" className="input" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="acc-pw-new">Nouveau mot de passe</label>
          <input
            id="acc-pw-new"
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={next}
            onChange={e => setNext(e.target.value)}
          />
        </div>
        {f.error && <div className="form-error">{f.error}</div>}
        {f.ok && <div className="form-ok">{f.ok}</div>}
        <div>
          <button className="btn" disabled={f.busy || !current || next.length < 8}>
            {f.busy ? <Spinner /> : 'Modifier'}
          </button>
        </div>
      </form>
      <div className="panel panel-pad stack">
        <h3>Sessions</h3>
        <p className="muted" style={{ margin: 0 }}>
          Déconnecte tous les appareils, y compris celui-ci.
        </p>
        {g.error && <div className="form-error">{g.error}</div>}
        <div>
          <button
            className="btn"
            disabled={g.busy}
            onClick={() =>
              void g.run(async () => {
                await api('/account/logout-all', { body: {} });
                setMe(null);
              })
            }
          >
            Se déconnecter partout
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionTab({ me }: { me: MeUser }) {
  const { setMe, toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const equip = async (id: string) => {
    setBusy(id);
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: { itemId: id } });
      setMe(r.user);
      toast(`${ITEMS.find(i => i.id === id)?.name} équipé.`, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="stack" style={{ gap: 30 }}>
      {(['skin', 'board'] as const).map(kind => {
        const list = ITEMS.filter(i => i.kind === kind);
        const has = list.filter(i => me.items.includes(i.id)).length;
        return (
          <section key={kind} className="acc-coll">
            <div className="acc-coll-head">
              <h3>{kind === 'skin' ? 'Skins d’animation' : 'Plateaux'}</h3>
              <span className="faint">
                {has} sur {list.length}
              </span>
            </div>
            <div className="collection">
              {list.map(i => {
                const owned = me.items.includes(i.id);
                const on = me.equippedSkin === i.id || me.equippedBoard === i.id;
                const col = i.skin ? { '--p': i.skin.primary } : { '--p': i.board!.dark };
                return (
                  <button
                    key={i.id}
                    type="button"
                    className={`coll-item ${on ? 'on' : ''} ${owned ? '' : 'locked'}`}
                    style={col as CSSProperties}
                    onClick={() => owned && !on && equip(i.id)}
                    disabled={!owned || busy === i.id}
                    aria-pressed={on}
                    aria-label={`${i.name} : ${on ? 'équipé' : owned ? 'équiper' : 'à découvrir dans la boutique'}`}
                  >
                    <span className="coll-swatch">
                      <Swatch item={i} />
                    </span>
                    <span className="coll-name">{i.name}</span>
                    <small>{busy === i.id ? <Spinner /> : on ? 'Équipé' : owned ? 'Équiper' : 'Dans la boutique'}</small>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <div className="acc-coll-foot">
        <StarMark size={12} />
        <span>Un skin change l’animation de vos sorts, un plateau l’échiquier : vos adversaires les voient aussi.</span>
        <Link to="/boutique" className="btn-gold sm">
          Agrandir ma collection
        </Link>
      </div>
    </div>
  );
}

function PurchasesTab() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    api<{ purchases: any[] }>('/account/purchases')
      .then(r => setRows(r.purchases))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <PageLoader />;
  if (!rows.length)
    return (
      <div className="empty">
        Aucun achat pour le moment.
        <br />
        <Link to="/boutique" className="btn-line">
          Découvrir le Bazar céleste
        </Link>
      </div>
    );
  const status: Record<string, string> = { paid: 'Payé', refunded: 'Remboursé', failed: 'Échoué' };
  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Produit</th>
            <th>Montant</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
              <td>
                {productById(r.product_id)?.name ?? r.product_id}
                {r.provider === 'demo' && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    démo
                  </span>
                )}
              </td>
              <td>{formatPrice(r.amount_cents)}</td>
              <td>
                <span className={`badge ${r.status === 'paid' ? 'green' : 'red'}`}>{status[r.status] ?? r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="faint" style={{ fontSize: 12.5, padding: '0 14px 12px' }}>
        Le reçu de chaque paiement vous a été envoyé par e-mail par Stripe.
      </p>
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
        <p className="muted" style={{ margin: 0 }}>
          Téléchargez toutes les données associées à votre compte (profil, parties, achats) au format JSON.
        </p>
        <div>
          <a className="btn" href="/api/account/export" download>
            Télécharger mes données
          </a>
        </div>
      </div>
      <form
        className="panel panel-pad stack danger-zone"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void f.run(async () => {
            await api('/account', { method: 'DELETE', body: { password } });
            setMe(null);
            toast('Votre compte a été supprimé.');
          });
        }}
      >
        <h3>Supprimer mon compte</h3>
        <p className="muted" style={{ margin: 0 }}>
          Suppression définitive : profil, classement, collection et historique. Les factures sont conservées de façon anonymisée, comme la loi l’exige. Cette
          action est irréversible.
        </p>
        <label className="check">
          <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> <span>Je comprends que mes achats seront perdus.</span>
        </label>
        <div className="field">
          <label htmlFor="acc-pw-del">Mot de passe</label>
          <input
            id="acc-pw-del"
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {f.error && <div className="form-error">{f.error}</div>}
        <div>
          <button className="btn btn-danger" disabled={!confirm || !password || f.busy}>
            {f.busy ? <Spinner /> : 'Supprimer définitivement'}
          </button>
        </div>
      </form>
    </div>
  );
}
