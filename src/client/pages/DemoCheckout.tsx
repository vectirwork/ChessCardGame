// Page de paiement simulée (mode démo uniquement, sans Stripe) : la caisse du Bazar céleste.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatPrice, itemById, productById } from '../../shared/catalog';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { PageLoader, Spinner } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, useTitle } from './PageScene';
import { LockIcon, Swatch } from './Shop';

export default function DemoCheckout() {
  useTitle('Paiement simulé');
  const { id = '' } = useParams();
  const { setMe, toast } = useApp();
  const navigate = useNavigate();
  const [p, setP] = useState<{ productId: string; amountCents: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ productId: string; amountCents: number; status: string }>(`/shop/demo/${id}`).then(setP).catch(e => setError(errMsg(e)));
  }, [id]);
  if (error)
    return (
      <PlacePage place="bazar" className="co-page" narrow>
        <PageHead place="La caisse du Bazar" title={<>Paiement <em>introuvable.</em></>} center />
        <div className="co-card panel panel-pad">
          <p className="form-error">{error}</p>
          <Link to="/boutique" className="btn btn-block">Retour à la boutique</Link>
        </div>
      </PlacePage>
    );
  if (!p) return <PageLoader />;
  const product = productById(p.productId);
  const items = (product?.items ?? []).map(i => itemById(i)!).filter(Boolean);
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api<{ user: MeUser }>(`/shop/demo/${id}/complete`, { body: {} });
      setMe(r.user);
      toast('Paiement simulé réussi : vos objets sont dans votre collection.', 'success');
      navigate(items.length === 1 ? `/boutique?objet=${items[0].id}` : '/boutique');
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
        title={product?.name ?? 'Votre achat'}
        lede="Cette page remplace Stripe Checkout tant que les clés Stripe ne sont pas configurées. Aucune carte n’est demandée, rien n’est débité."
        center
      />
      <div className="co-card panel panel-pad">
        <span className="badge cyan">Paiement simulé</span>
        {items.length > 0 && (
          <div className="co-items">
            {items.map(it => (
              <span key={it.id} className="bz-pack-chip">
                <Swatch item={it} small />
                <span>{it.name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="checkout-line">
          <span>
            <b>{product?.name}</b>
            <small className="muted">{product?.description}</small>
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
