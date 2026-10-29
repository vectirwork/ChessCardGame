// Page de paiement simulée (mode démo uniquement, sans Stripe).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatPrice, productById } from '../../shared/catalog';
import type { MeUser } from '../../shared/protocol';
import { api, errMsg } from '../api';
import { PageLoader, Spinner } from '../components/Layout';
import { useApp } from '../store';

export default function DemoCheckout() {
  const { id = '' } = useParams();
  const { setMe, toast } = useApp();
  const navigate = useNavigate();
  const [p, setP] = useState<{ productId: string; amountCents: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/shop/demo/${id}`).then(setP).catch(e => setError(errMsg(e)));
  }, [id]);
  if (error) return <div className="container page center"><p className="form-error">{error}</p><Link to="/boutique">Retour à la boutique</Link></div>;
  if (!p) return <PageLoader />;
  const product = productById(p.productId);
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api<{ user: MeUser }>(`/shop/demo/${id}/complete`, { body: {} });
      setMe(r.user);
      toast('Paiement simulé réussi : objets ajoutés à votre collection ✨', 'success');
      navigate('/boutique');
    } catch (e) {
      toast(errMsg(e), 'error');
      setBusy(false);
    }
  };
  return (
    <div className="auth-wrap">
      <div className="auth-card panel panel-pad">
        <span className="badge cyan">Paiement simulé · mode démo</span>
        <h1 style={{ marginTop: 14 }}>{product?.name}</h1>
        <p className="muted">Cette page remplace Stripe Checkout tant que les clés Stripe ne sont pas configurées. Aucune carte n’est demandée, rien n’est débité.</p>
        <div className="checkout-line total"><span>Total TTC</span><b>{formatPrice(p.amountCents)}</b></div>
        <div className="stack" style={{ marginTop: 20 }}>
          <button className="btn btn-primary btn-lg btn-block" onClick={pay} disabled={busy || p.status !== 'pending'}>
            {busy ? <Spinner /> : p.status === 'pending' ? `Simuler le paiement de ${formatPrice(p.amountCents)}` : 'Déjà payé'}
          </button>
          <Link to="/boutique?annule=1" className="btn btn-ghost btn-block">Annuler</Link>
        </div>
      </div>
    </div>
  );
}
