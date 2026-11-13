// Récapitulatif d'achat : un produit (skin, collection à prix « compléter », pack) ou le panier de l'essai (plusieurs
// skins, une ligne par produit facturé, comme sur Stripe). Case « Les équiper dès la livraison » cochée d'office (un
// choix d'affichage, pas une dépense) ; case de renoncement au droit de rétractation (L221-28) jamais cochée d'office.
// Le montant affiché est celui que le serveur facture (productPrice, quoteCart). Un pack garde son prix fixe : les objets
// déjà possédés sont dits, et l'économie ne compte que les objets nouveaux.
// Rien ne change sur le compte avant le paiement : les objets déjà possédés de l'essai (« Également équipés ») sont
// équipés au retour, une fois l'achat livré, et seulement si la case est cochée (Shop.tsx, deliver).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PAYMENT_PROVIDER, bySlot, duplicated, formatPrice, itemById, itemLabel } from '../../../shared/catalog';
import { selectionLabel } from '../../../shared/skins/texts';
import type { CheckoutRequest } from '../../../shared/protocol';
import { api, errMsg } from '../../api';
import { Modal } from '../../components/Layout';
import { StarMark } from '../PageScene';
import { ItemThumb } from './ItemThumb';
import { equipNote, orderSummary } from './trial';
import type { Order } from './trial';

export type { Order } from './trial';

/** Clé de sessionStorage : la livraison attendue au retour (objets, équipés ou non, objets possédés à équiper avec). */
export const DELIVERY_KEY = 'sm:livraison';

/** Livraison attendue, gardée avant de partir payer. */
export interface Delivery {
  items: string[];
  equip: boolean;
  /** Objets déjà possédés de l'essai, à équiper au retour (case cochée seulement). */
  equipOwned: string[];
}

/** Un objet par emplacement au plus : on peut les équiper à la livraison. */
function equippable(items: string[]) {
  return !duplicated(bySlot(items));
}

interface Props {
  order: Order;
  owned: string[];
  demo: boolean;
  /** Objets déjà possédés à équiper avec l'achat (essai mêlé, collection complétée), une fois l'achat livré. */
  equipOwned: string[];
  onClose: () => void;
}

export function CheckoutModal({ order, owned, demo, equipOwned, onClose }: Props) {
  const sum = orderSummary(order, owned);
  const lines = sum?.lines ?? null;
  const items = sum?.items ?? [];
  const canEquip = items.length > 0 && equippable(items);
  const also = canEquip ? equipOwned.filter(i => itemById(i) && !items.includes(i)) : [];
  const [equip, setEquip] = useState(true);
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  const total = sum?.totalCents ?? 0;
  const saving = sum?.savingCents ?? 0;
  const title = order.kind === 'product' ? order.product.name : items.length === 1 ? itemLabel(itemById(items[0])!) : selectionLabel(items.length);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const doEquip = canEquip && equip;
      const body: CheckoutRequest = order.kind === 'product' ? { productId: order.product.id, waiver: true, equip: doEquip } : { itemIds: items, waiver: true, equip: doEquip };
      const r = await api<{ url: string }>('/shop/checkout', { body });
      try {
        const d: Delivery = { items, equip: doEquip, equipOwned: doEquip ? also : [] };
        sessionStorage.setItem(DELIVERY_KEY, JSON.stringify(d));
      } catch {
        // stockage indisponible : le déballage se contente des objets renvoyés par le serveur
      }
      window.location.assign(r.url);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <div className="co-box">
        <p className="pg-kicker">
          <span className="pg-num">
            <StarMark size={12} />
          </span>
          <span>Récapitulatif</span>
        </p>
        <h2>{title}</h2>
        {!lines ? (
          <p className="form-error">Vous possédez déjà tout ce que contient cet achat.</p>
        ) : (
          <>
            {sum!.have > 0 && (
              <p className="co-have">
                Vous possédez déjà {sum!.have} objet{sum!.have > 1 ? 's' : ''} sur {sum!.of} : le prix du pack ne change pas. Nouveau pour vous :
              </p>
            )}
            <div className="co-thumbs">
              {items.map(id => (
                <span key={id} className="co-thumb" title={itemById(id)?.name}>
                  <ItemThumb id={id} size="chip" />
                  {items.length <= 4 && <span>{itemById(id)?.name}</span>}
                </span>
              ))}
            </div>
            {lines.map(l => (
              <div key={l.label} className="checkout-line">
                <span>
                  <b>{l.label}</b>
                  {l.note && <small className="muted">{l.note}</small>}
                </span>
                <b>{formatPrice(l.cents)}</b>
              </div>
            ))}
            {saving > 0 && (
              <div className="checkout-line saving">
                <span>Économie sur le prix des skins à l’unité</span>
                <span>− {formatPrice(saving)}</span>
              </div>
            )}
            <div className="checkout-line total">
              <span>Total TTC</span>
              <b>{formatPrice(total)}</b>
            </div>
            {canEquip && (
              <label className="check co-equip">
                <input type="checkbox" checked={equip} onChange={e => setEquip(e.target.checked)} />
                <span>
                  Les équiper dès la livraison
                  {also.length > 0 && (
                    <small className="co-also">
                      Également équipé{also.length > 1 ? 's' : ''} : {also.map(i => itemLabel(itemById(i)!)).join(', ')} (déjà à vous).
                    </small>
                  )}
                  <small> {capitalize(equipNote([...items, ...also]))}.</small>
                </span>
              </label>
            )}
            <label className="check co-waiver">
              <input ref={firstRef} type="checkbox" checked={waiver} onChange={e => setWaiver(e.target.checked)} />
              <span>
                Je demande l’accès immédiat à ce contenu numérique et je reconnais perdre mon droit de rétractation une fois l’achat livré (article L221-28 du Code
                de la consommation). J’accepte les{' '}
                <Link to="/cgv" target="_blank">
                  conditions générales de vente
                </Link>
                .
              </span>
            </label>
            {error && <div className="form-error">{error}</div>}
            <button type="button" className="btn-gold co-pay" disabled={!waiver || busy} onClick={pay}>
              <span className="btn-shine" />
              <span className="btn-main">{busy ? 'Redirection…' : `Payer ${formatPrice(total)}`}</span>
              <span className="btn-sub">{demo ? 'Paiement simulé, rien n’est débité' : 'Carte bancaire, Apple Pay, Google Pay'}</span>
              <svg className="btn-arrow" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <p className="co-secure">
              <LockIcon />{' '}
              {demo
                ? `Mode démonstration : une page de paiement simulée remplace ${PAYMENT_PROVIDER}.`
                : `Vous allez être redirigé vers la page de paiement sécurisée de ${PAYMENT_PROVIDER}.`}
            </p>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose} disabled={busy}>
          Continuer mes essais
        </button>
      </div>
    </Modal>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="pg-lock">
      <rect x="3" y="7" width="10" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
