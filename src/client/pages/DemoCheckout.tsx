// Page de paiement simulée (mode démo uniquement, sans Stripe) : la caisse du Bazar céleste.
// Elle montre ce que contient l'achat (un produit, une collection complétée, ou le panier d'un essai) au montant que le
// serveur facture, puis revient à la boutique avec les objets livrés : la cabine les déballe.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatPrice, itemById, productById } from '../../shared/catalog';
import { CART_PRODUCT_ID } from '../../shared/protocol';
import type { DemoCompleteResponse, DemoPurchase } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { PageLoader, Spinner } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, useTitle } from './PageScene';
import { LockIcon } from './shop/CheckoutModal';
import { ItemThumb } from './shop/ItemThumb';
import { itemPhrase } from './shop/trial';

export default function DemoCheckout() {
  useTitle('Paiement simulé');
  const { id = '' } = useParams();
  const { setMe, toast } = useApp();
  const navigate = useNavigate();
  const [p, setP] = useState<DemoPurchase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<DemoPurchase>(`/shop/demo/${id}`)
      .then(setP)
      .catch(e => setError(errMsg(e)));
  }, [id]);
  if (error)
    return (
      <PlacePage place="bazar" className="co-page" narrow>
        <PageHead
          place="La caisse du Bazar"
          title={
            <>
              Paiement <em>introuvable.</em>
            </>
          }
          center
        />
        <div className="co-card panel panel-pad">
          <p className="form-error">{error}</p>
          <Link to="/boutique" className="btn btn-block">
            Retour à la boutique
          </Link>
        </div>
      </PlacePage>
    );
  if (!p) return <PageLoader />;
  const product = p.productId === CART_PRODUCT_ID ? undefined : productById(p.productId);
  // Objets de l'achat : renvoyés par le serveur ; à défaut (ancien serveur), ceux du produit
  const ids = (p.items?.length ? p.items : product?.items ?? []).filter(i => itemById(i));
  const title = product?.name ?? (ids.length === 1 ? itemPhrase(itemById(ids[0])!) : `Votre sélection (${ids.length} skins)`);
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api<DemoCompleteResponse>(`/shop/demo/${id}/complete`, { body: {} });
      setMe(r.user);
      // Retour à la cabine, qui déballe les objets livrés (et dit s'ils sont équipés)
      navigate('/boutique', { state: { livre: r.items?.length ? r.items : ids, user: r.user } });
    } catch (e) {
      toast(errMsg(e), 'error');
      setBusy(false);
    }
  };
  const pending = p.status === 'pending';
  return (
    <PlacePage place="bazar" className="co-page" narrow>
      <PageHead
        place="La caisse du Bazar"
        aside="Mode démonstration"
        title={title}
        lede="Cette page remplace Stripe Checkout tant que les clés Stripe ne sont pas configurées. Aucune carte n’est demandée, rien n’est débité."
        center
      />
      <div className="co-card panel panel-pad">
        <span className="badge cyan">Paiement simulé</span>
        {ids.length > 0 && (
          <div className="co-items">
            {ids.map(i => (
              <span key={i} className="co-item">
                <ItemThumb id={i} size="chip" />
                <span>{itemPhrase(itemById(i)!)}</span>
              </span>
            ))}
          </div>
        )}
        <div className="checkout-line">
          <span>
            <b>{title}</b>
            {product && <small className="muted">{product.description}</small>}
          </span>
          <b>{formatPrice(p.amountCents)}</b>
        </div>
        <div className="checkout-line total">
          <span>Total TTC</span>
          <b>{formatPrice(p.amountCents)}</b>
        </div>
        <div className="stack co-actions">
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={pay} disabled={busy || !pending}>
            {busy ? <Spinner /> : pending ? `Simuler le paiement de ${formatPrice(p.amountCents)}` : 'Déjà payé'}
          </button>
          <Link to="/boutique?annule=1" className="btn btn-ghost btn-block">
            Annuler
          </Link>
        </div>
        <p className="co-secure">
          <LockIcon /> En production, le paiement passe par la page sécurisée de Stripe.
        </p>
      </div>
    </PlacePage>
  );
}
