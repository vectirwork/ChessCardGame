// Récapitulatif d'achat : un produit (skin, collection à prix « compléter », pack) ou le panier de l'essai (plusieurs
// skins, une ligne par produit facturé, comme sur Stripe). Case « Les équiper dès la livraison » cochée d'office (un
// choix d'affichage, pas une dépense) ; case de renoncement au droit de rétractation (L221-28) jamais cochée d'office.
// Le montant affiché est celui que le serveur facture (productPrice, quoteCart).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SLOTS, formatPrice, itemById, productPrice, quoteCart, unitPrice } from '../../../shared/catalog';
import type { Product } from '../../../shared/catalog';
import type { CheckoutRequest, MeUser } from '../../../shared/protocol';
import { api, errMsg } from '../../api';
import { Modal } from '../../components/Layout';
import { StarMark } from '../PageScene';
import { ItemThumb } from './ItemThumb';
import { equipNote, itemPhrase } from './trial';

export type Order = { kind: 'product'; product: Product } | { kind: 'cart'; itemIds: string[] };

/** Clé de sessionStorage : la livraison attendue au retour (objets, équipés ou non), pour le déballage. */
export const DELIVERY_KEY = 'sm:livraison';

interface Line {
  label: string;
  note?: string;
  items: string[];
  cents: number;
  /** Prix à l'unité des objets de la ligne, s'il est plus haut (économie). */
  unit: number;
}

function linesOf(order: Order, owned: string[]): Line[] | null {
  if (order.kind === 'product') {
    const p = order.product;
    const cents = productPrice(p, owned);
    if (cents === null) return null;
    const missing = p.items.filter(i => !owned.includes(i));
    const partial = p.kind === 'collection' && cents < p.priceCents;
    return [
      {
        label: p.name,
        note: partial ? `Compléter la collection : ${missing.length} skin${missing.length > 1 ? 's' : ''} manquant${missing.length > 1 ? 's' : ''}` : p.description,
        items: partial ? missing : p.items,
        cents,
        unit: (partial ? missing : p.items).reduce((s, i) => s + unitPrice(i), 0),
      },
    ];
  }
  const q = quoteCart(order.itemIds, owned);
  if (!q) return null;
  return q.lines.map(l => ({
    label: l.label,
    note: l.productId.startsWith('col:') ? 'Au prix de la collection, sceau compris' : undefined,
    items: l.items,
    cents: l.cents,
    unit: l.items.reduce((s, i) => s + unitPrice(i), 0),
  }));
}

/** Un objet par emplacement au plus : on peut les équiper à la livraison. */
function equippable(items: string[]) {
  return SLOTS.every(k => items.filter(i => itemById(i)?.kind === k).length <= 1);
}

interface Props {
  order: Order;
  owned: string[];
  demo: boolean;
  /** Objets possédés de l'essai, équipés juste avant de partir payer. */
  equipOwned: string[];
  onEquipped: (me: MeUser) => void;
  onClose: () => void;
}

export function CheckoutModal({ order, owned, demo, equipOwned, onEquipped, onClose }: Props) {
  const lines = linesOf(order, owned);
  const items = lines?.flatMap(l => l.items) ?? [];
  const canEquip = items.length > 0 && equippable(items);
  const [equip, setEquip] = useState(true);
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  const total = lines?.reduce((s, l) => s + l.cents, 0) ?? 0;
  const unit = lines?.reduce((s, l) => s + l.unit, 0) ?? 0;
  const pack = order.kind === 'product' && order.product.kind === 'pack' ? order.product : null;
  const saving = pack?.compareAtCents ? pack.compareAtCents - total : unit - total;
  const title = order.kind === 'product' ? order.product.name : items.length === 1 ? itemPhrase(itemById(items[0])!) : `Votre sélection (${items.length} skins)`;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      if (equipOwned.length) {
        const r = await api<{ user: MeUser }>('/account/equip', { body: equipOwned.length === 1 ? { itemId: equipOwned[0] } : { itemIds: equipOwned } });
        onEquipped(r.user);
      }
      const doEquip = canEquip && equip;
      const body: CheckoutRequest = order.kind === 'product' ? { productId: order.product.id, waiver: true, equip: doEquip } : { itemIds: items, waiver: true, equip: doEquip };
      const r = await api<{ url: string }>('/shop/checkout', { body });
      try {
        sessionStorage.setItem(DELIVERY_KEY, JSON.stringify({ items, equip: doEquip }));
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
            <div className="co-thumbs">
              {items.slice(0, 21).map(id => (
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
                  <small> {capitalize(equipNote(items))}.</small>
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
              {demo ? 'Mode démonstration : une page de paiement simulée remplace Stripe.' : 'Vous allez être redirigé vers la page de paiement sécurisée de Stripe.'}
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
