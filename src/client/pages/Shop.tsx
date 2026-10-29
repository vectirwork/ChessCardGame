// Boutique : skins d'animation, plateaux, packs. Paiement par Stripe Checkout.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ITEMS, Item, PRODUCTS, Product, boardStyle, formatPrice, itemById } from '../../shared/catalog';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { Modal, Spinner } from '../components/Layout';
import { useApp } from '../store';
import { SkinPreview } from './Home';

type Tab = 'skin' | 'board' | 'pack';

export default function Shop() {
  const { me, setMe, toast, payments, ready } = useApp();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('skin');
  const [buying, setBuying] = useState<Product | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const sid = params.get('achat');
    if (params.get('annule')) {
      toast('Paiement annulé : aucun montant n’a été débité.');
      setParams({}, { replace: true });
    }
    if (!sid || !me) return;
    setConfirming(true);
    api<{ status: string; user: MeUser }>(`/shop/confirm/${encodeURIComponent(sid)}`)
      .then(r => {
        setMe(r.user);
        if (r.status === 'paid') toast('Merci ! Votre achat est disponible dans votre collection ✨', 'success');
        else toast('Paiement en cours de validation : il apparaîtra d’ici quelques instants.');
      })
      .catch(e => toast(errMsg(e), 'error'))
      .finally(() => {
        setConfirming(false);
        setParams({}, { replace: true });
      });
  }, [params, me, setMe, toast, setParams]);

  const owned = (id: string) => !!me?.items.includes(id);
  const equipped = (id: string) => me?.equippedSkin === id || me?.equippedBoard === id;

  const equip = async (id: string) => {
    try {
      const r = await api<{ user: MeUser }>('/account/equip', { body: { itemId: id } });
      setMe(r.user);
      toast(`${itemById(id)?.name} équipé !`, 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const buy = (product: Product) => {
    if (!me) {
      navigate(`/inscription?retour=${encodeURIComponent('/boutique')}`);
      return;
    }
    setBuying(product);
  };

  const items = ITEMS.filter(i => i.kind === tab);

  return (
    <div className="container page">
      <span className="eyebrow">Boutique</span>
      <h1 className="page-title">Faites briller vos sorts</h1>
      <p className="page-sub">Des skins d’animation et des plateaux, visibles par vos adversaires. Uniquement de l’apparence : aucun avantage en partie, jamais.</p>

      {payments === 'demo' && (
        <div className="notice" style={{ marginBottom: 22 }}>
          <span>🧪</span>
          <span><b>Mode démonstration</b> : les paiements sont simulés et rien n’est débité. Configurez Stripe pour encaisser de vrais paiements.</span>
        </div>
      )}
      {confirming && <div className="notice" style={{ marginBottom: 22 }}><Spinner /> Validation de votre paiement…</div>}

      <div className="tabs">
        <button className={tab === 'skin' ? 'on' : ''} onClick={() => setTab('skin')}>✨ Skins d’animation</button>
        <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>♟ Plateaux</button>
        <button className={tab === 'pack' ? 'on' : ''} onClick={() => setTab('pack')}>🎁 Packs</button>
      </div>

      {tab === 'pack' ? (
        <div className="grid-2">
          {PRODUCTS.filter(p => p.id.startsWith('pack:')).map(p => {
            const all = p.items.every(owned);
            return (
              <div key={p.id} className="pack panel panel-pad">
                {p.badge && <span className="badge gold pack-badge">{p.badge}</span>}
                <h2 className="display">{p.name}</h2>
                <p className="muted">{p.description}</p>
                <div className="pack-items">
                  {p.items.map(id => {
                    const it = itemById(id)!;
                    return (
                      <span key={id} className={`pack-chip ${owned(id) ? 'owned' : ''}`}>
                        <Swatch item={it} small />
                        {it.name}
                      </span>
                    );
                  })}
                </div>
                <div className="price-row">
                  <span className="price">{formatPrice(p.priceCents)}</span>
                  {p.compareAtCents && <s className="faint">{formatPrice(p.compareAtCents)}</s>}
                </div>
                <button className="btn btn-primary btn-block" disabled={all || payments === 'off' || !ready} onClick={() => buy(p)}>
                  {all ? 'Déjà dans votre collection' : payments === 'off' ? 'Bientôt disponible' : 'Acheter le pack'}
                </button>
                {!all && p.items.some(owned) && <small className="faint">Vous possédez déjà une partie de ce pack.</small>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="shop-grid">
          {items.map(item => {
            const product = PRODUCTS.find(p => p.id === item.id);
            const has = item.free || owned(item.id);
            const on = equipped(item.id) || (!me && item.free && (item.id === 'skin:arcane' || item.id === 'board:arcane'));
            return (
              <div key={item.id} className={`shop-item panel ${on ? 'equipped' : ''}`}>
                <button className="shop-visual" onClick={() => setPreview(item)} aria-label={`Aperçu de ${item.name}`}>
                  <Swatch item={item} />
                  <span className="shop-play">▶ Aperçu</span>
                </button>
                <div className="shop-body">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3>{item.name}</h3>
                    {product?.badge && <span className="badge gold">{product.badge}</span>}
                    {item.free && <span className="badge green">Offert</span>}
                  </div>
                  <p className="muted">{item.description}</p>
                  <div className="shop-actions">
                    {has ? (
                      me ? (
                        <button className="btn btn-block" disabled={on} onClick={() => equip(item.id)}>{on ? '✓ Équipé' : 'Équiper'}</button>
                      ) : (
                        <Link to="/inscription" className="btn btn-block">{on ? 'Par défaut' : 'Créer un compte pour l’équiper'}</Link>
                      )
                    ) : (
                      <button className="btn btn-primary btn-block" disabled={payments === 'off' || !ready} onClick={() => product && buy(product)}>
                        {payments === 'off' ? 'Bientôt disponible' : `Acheter · ${formatPrice(product!.priceCents)}`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="faint center" style={{ marginTop: 30, fontSize: 13 }}>
        Prix TTC. Paiement sécurisé par Stripe. Contenu numérique livré immédiatement. <Link to="/cgv">Conditions de vente</Link>
      </p>

      {preview && (
        <Modal onClose={() => setPreview(null)} wide>
          {preview.kind === 'skin' ? <SkinPreview skin={preview.id} theme={me?.equippedBoard} /> : <SkinPreview skin={me?.equippedSkin} theme={preview.id} />}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>Fermer</button>
          </div>
        </Modal>
      )}
      {buying && <CheckoutModal product={buying} onClose={() => setBuying(null)} />}
    </div>
  );
}

export function Swatch({ item, small }: { item: Item; small?: boolean }) {
  if (item.kind === 'board') {
    const b = boardStyle(item.id);
    return (
      <span className={`swatch-board tex-${b.texture} ${small ? 'small' : ''}`} style={{ '--light': b.light, '--dark': b.dark, '--frame': b.frame } as CSSProperties}>
        {Array.from({ length: 16 }, (_, i) => <i key={i} className={(Math.floor(i / 4) + i) % 2 ? 'd' : 'l'} />)}
      </span>
    );
  }
  const s = item.skin!;
  return (
    <span className={`swatch-skin p-${s.particle} ${small ? 'small' : ''}`} style={{ '--p': s.primary, '--s': s.secondary, '--a': s.accent } as CSSProperties}>
      <span className="orb" />
      {!small && <span className="ring" />}
      {!small && Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
    </span>
  );
}

function CheckoutModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>('/shop/checkout', { body: { productId: product.id, waiver } });
      window.location.assign(r.url);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <h2>Récapitulatif</h2>
      <div className="checkout-line">
        <span>
          <b>{product.name}</b>
          <small className="muted">{product.description}</small>
        </span>
        <b>{formatPrice(product.priceCents)}</b>
      </div>
      <div className="checkout-line total">
        <span>Total TTC</span>
        <b>{formatPrice(product.priceCents)}</b>
      </div>
      <label className="check" style={{ margin: '18px 0' }}>
        <input type="checkbox" checked={waiver} onChange={e => setWaiver(e.target.checked)} />
        <span>
          Je demande l’accès immédiat à ce contenu numérique et je reconnais perdre mon droit de rétractation une fois l’achat livré
          (article L221-28 du Code de la consommation). J’accepte les <Link to="/cgv" target="_blank">conditions générales de vente</Link>.
        </span>
      </label>
      {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={!waiver || busy} onClick={pay}>
        {busy ? <Spinner /> : `Payer ${formatPrice(product.priceCents)}`}
      </button>
      <p className="faint center" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>🔒 Vous allez être redirigé vers la page de paiement sécurisée de Stripe.</p>
    </Modal>
  );
}
