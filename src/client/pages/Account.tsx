// Gestion du compte : profil, sécurité, collection (rois, échiquiers, sorts, sceaux), achats, données personnelles.
import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { COLLECTIONS, ITEMS, SLOTS, collectionById, collectionItems, formatPrice, itemById, productById, sealOf, unitPrice } from '../../shared/catalog';
import type { ItemKind } from '../../shared/catalog';
import { CART_PRODUCT_ID } from '../../shared/protocol';
import type { MeUser, PurchaseRecord } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { CollectionSeal } from '../components/CollectionSeal';
import { PageLoader, Spinner } from '../components/Layout';
import { crestUrl } from '../components/pieces';
import { CLASSIC_KINGS_PREF, equippedId, isEquipped, owns } from '../skins';
import { useApp, usePref } from '../store';
import { PageHead, PlacePage, StarMark, useTitle } from './PageScene';
import { ItemThumb, RarityGem } from './shop/ItemThumb';
import { gemOf, itemPhrase } from './shop/trial';

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
  const king = equippedId(me, 'king');
  return (
    <PlacePage place="cabinet" className="acc" narrow>
      <div className="acc-head">
        <span className="acc-avatar has-crest" aria-hidden="true" style={{ '--gem': gemOf(king) } as CSSProperties}>
          <span className="avatar lg avatar-crest" style={{ backgroundImage: crestUrl(king) }} />
        </span>
        <PageHead
          place="Le Cabinet"
          aside="Mon compte"
          title={
            <span className="acc-name">
              {me.username}
              <CollectionSeal id={sealOf(me.items)} size={26} />
            </span>
          }
        >
          <div className="acc-badges">
            <span className="badge gold">Elo {me.rating}</span>
            <span className="badge">
              {me.gamesPlayed} {me.gamesPlayed > 1 ? 'parties classées' : 'partie classée'}
            </span>
            <span className="badge">
              {owned} {owned > 1 ? 'skins premium' : 'skin premium'}
            </span>
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

const SLOT_TITLE: Record<ItemKind, string> = { king: 'Rois', board: 'Échiquiers', skin: 'Sorts' };
const SLOT_RAYON: Record<ItemKind, string> = { king: 'rois', board: 'echiquiers', skin: 'sorts' };
const SLOT_NOTE: Record<ItemKind, string> = {
  king: 'Votre roi vous représente : vos adversaires le voient en face d’eux.',
  board: 'Votre échiquier vous suit dans toutes vos parties. Vos adversaires gardent le leur.',
  skin: 'Vos sorts s’animent avec ce skin, chez vous comme chez votre adversaire.',
};

function CollectionTab({ me }: { me: MeUser }) {
  const { setMe, toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const [classic, setClassic] = usePref<boolean>(CLASSIC_KINGS_PREF, false);
  const seal = sealOf(me.items);
  const equip = async (id: string) => {
    setBusy(id);
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: { itemId: id } });
      setMe(r.user);
      toast(`${itemById(id)?.name} équipé.`, 'success');
      // Le roi est pris à l'assise : une partie en cours garde l'ancien
      if (itemById(id)?.kind === 'king') {
        const g = await api<{ games: { status: string }[] }>('/games/mine').catch(() => ({ games: [] }));
        setLater(g.games.some(x => x.status !== 'ended'));
      }
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="stack acc-coll-wrap" style={{ gap: 34 }}>
      {SLOTS.map(kind => {
        const list = ITEMS.filter(i => i.kind === kind);
        const has = list.filter(i => owns(me, i.id)).length;
        return (
          <section key={kind} className="acc-coll" aria-labelledby={`acc-coll-${kind}`}>
            <div className="acc-coll-head">
              <h3 id={`acc-coll-${kind}`}>{SLOT_TITLE[kind]}</h3>
              <span className="faint">
                {has} sur {list.length}
              </span>
              <Link to={`/boutique?rayon=${SLOT_RAYON[kind]}`} className="acc-coll-more">
                Voir le rayon
              </Link>
            </div>
            {kind === 'king' && later && (
              <p className="notice acc-later" role="status">
                <span className="notice-k">À la prochaine partie</span>
                <span>Votre nouveau roi vous attend à la prochaine partie : celle en cours garde le roi pris à l’assise.</span>
              </p>
            )}
            <div className="collection">
              {list.map(i => {
                const owned = owns(me, i.id);
                const on = isEquipped(me, i.id);
                return (
                  <div key={i.id} className={`coll-item ${on ? 'on' : ''} ${owned ? '' : 'locked'}`} style={{ '--gem': gemOf(i.id) } as CSSProperties}>
                    <ItemThumb id={i.id} />
                    <RarityGem rarity={i.rarity} />
                    <span className="coll-name">{i.name}</span>
                    {on ? (
                      <span className="coll-st on">Équipé</span>
                    ) : owned ? (
                      <button type="button" className="coll-btn" onClick={() => void equip(i.id)} disabled={busy === i.id} aria-label={`Équiper ${i.name}`}>
                        {busy === i.id ? <Spinner /> : 'Équiper'}
                      </button>
                    ) : (
                      <Link className="coll-try" to={`/boutique?rayon=${SLOT_RAYON[kind]}&essai=${i.id}`} aria-label={`Essayer ${i.name} dans la boutique`}>
                        L’essayer · {formatPrice(unitPrice(i.id))}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="acc-coll-note">{SLOT_NOTE[kind]}</p>
            {kind === 'king' && (
              <div className="acc-pref">
                <span className="acc-pref-t">
                  <b>Rois adverses</b>
                  <small>En partie, le roi de votre adversaire s’affiche tel qu’il l’a choisi, ou en roi classique (Arcane) si vous préférez une lecture stricte.</small>
                </span>
                <span className="acc-pref-seg" role="group" aria-label="Rois adverses">
                  <button type="button" className={!classic ? 'on' : ''} aria-pressed={!classic} onClick={() => setClassic(false)}>
                    Tels qu’ils les ont choisis
                  </button>
                  <button type="button" className={classic ? 'on' : ''} aria-pressed={classic} onClick={() => setClassic(true)}>
                    Classiques
                  </button>
                </span>
              </div>
            )}
          </section>
        );
      })}
      <section className="acc-coll" aria-labelledby="acc-seals">
        <div className="acc-coll-head">
          <h3 id="acc-seals">Sceaux de collection</h3>
          <span className="faint">{seal ? `Affiché : ${collectionById(seal)?.name}` : 'Aucun pour l’instant'}</span>
          <Link to="/boutique?rayon=collections" className="acc-coll-more">
            Voir les collections
          </Link>
        </div>
        <div className="acc-seals">
          {COLLECTIONS.filter(c => c.rarity !== 'offert').map(c => {
            const items = collectionItems(c);
            const n = items.filter(i => owns(me, i)).length;
            const done = n === items.length;
            return (
              <Link
                key={c.id}
                to={`/boutique?rayon=collections&essai=${items.join(',')}`}
                className={`acc-seal ${done ? 'done' : ''} ${seal === c.id ? 'shown' : ''}`}
                style={{ '--gem': c.gem } as CSSProperties}
                aria-label={`${c.name} : ${n} sur ${items.length}${done ? ', sceau obtenu' : ''}`}
              >
                <span className="acc-seal-medal">{done ? <CollectionSeal id={c.id} size={40} /> : <ItemThumb id={c.id} size="chip" />}</span>
                <span className="acc-seal-txt">
                  <b>{c.name}</b>
                  <small>{done ? (seal === c.id ? 'Sceau affiché' : 'Sceau obtenu') : `${n} sur ${items.length}`}</small>
                </span>
                <span className="acc-seal-bar" aria-hidden="true">
                  {items.map(i => (
                    <i key={i} className={owns(me, i) ? 'on' : ''} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="acc-coll-note">
          Le sceau de votre collection complète la plus rare s’affiche à côté de votre pseudo : en partie, sur votre profil et au classement.
        </p>
      </section>
      <div className="acc-coll-foot">
        <StarMark size={12} />
        <span>Votre roi et vos sorts : vos adversaires les voient. Votre échiquier : il vous suit dans toutes vos parties.</span>
        <Link to="/boutique" className="btn-gold sm">
          Agrandir ma collection
        </Link>
      </div>
    </div>
  );
}

function PurchasesTab() {
  const [rows, setRows] = useState<PurchaseRecord[] | null>(null);
  useEffect(() => {
    api<{ purchases: PurchaseRecord[] }>('/account/purchases')
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
                <span className="acc-buy">
                  <span className="acc-buy-ths" aria-hidden="true">
                    {(r.items ?? []).slice(0, 3).map(id => (
                      <ItemThumb key={id} id={id} size="mini" />
                    ))}
                  </span>
                  {purchaseLabel(r)}
                </span>
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

/** Libellé d'un achat : le produit, ou pour un panier « Votre sélection » et ses skins. */
function purchaseLabel(r: PurchaseRecord): string {
  const items = (r.items ?? []).map(itemById).filter(i => !!i);
  if (r.product_id !== CART_PRODUCT_ID) return productById(r.product_id)?.name ?? r.product_id;
  if (items.length === 1) return itemPhrase(items[0]!);
  return `Votre sélection (${items.length} skins) : ${items.map(i => i!.name).join(', ')}`;
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
