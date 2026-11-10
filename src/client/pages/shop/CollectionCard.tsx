// Carte de collection : le triptyque (sceau des sorts, échiquier incliné, les deux rois), les trois skins et
// l'exclusivité (le sceau de collection), le prix (barré : la somme à l'unité) ou « Compléter la collection », et deux
// gestes : Essayer (les trois skins dans la cabine) et Acheter.
// Variantes : `compact` (rayon Collections) et `large` (vitrine de l'ordinateur, avec l'accroche).
import type { CSSProperties } from 'react';
import { collectionItems, formatPrice, itemById, productById, productPrice } from '../../../shared/catalog';
import type { Collection, Product } from '../../../shared/catalog';
import { CollectionSeal } from '../../components/CollectionSeal';
import { ItemThumb, RarityGem } from './ItemThumb';
import { itemPhrase, sealName } from './trial';

interface Props {
  c: Collection;
  owned: string[];
  loggedIn: boolean;
  sale: boolean;
  ready: boolean;
  large?: boolean;
  trying: boolean;
  onTry: (c: Collection) => void;
  onBuy: (p: Product) => void;
}

export function CollectionCard({ c, owned, loggedIn, sale, ready, large, trying, onTry, onBuy }: Props) {
  const product = productById(c.id);
  if (!product) return null;
  const items = collectionItems(c);
  const price = productPrice(product, owned);
  const have = items.filter(i => owned.includes(i)).length;
  const complete = price === null;
  const partial = !complete && have > 0;
  return (
    <article className={`cc ${large ? 'cc-large' : ''} r-${c.rarity} ${trying ? 'is-trying' : ''}`} style={{ '--gem': c.gem } as CSSProperties} aria-label={`Collection ${c.name}`}>
      <ItemThumb id={c.id} className="cc-thumb" />
      <div className="cc-body">
        <RarityGem rarity={c.rarity} label={`Collection · ${items.length} skins + sceau`} />
        <h3 className="cc-name">{c.name}</h3>
        {large && <p className="cc-tag">{c.tagline}</p>}
        <ul className="cc-items">
          {items.map(id => {
            const it = itemById(id)!;
            const mine = loggedIn && owned.includes(id);
            return (
              <li key={id} className={mine ? 'is-mine' : ''}>
                {itemPhrase(it)}
                {mine && <span className="sr-only"> (possédé)</span>}
              </li>
            );
          })}
          <li className="cc-bonus">
            <CollectionSeal id={c.id} size={16} />
            {sealName(c)}
            <small>exclusif</small>
          </li>
        </ul>
        <div className="cc-foot">
          <div className="cc-price">
            {complete && loggedIn ? (
              <span className="cc-done">Collection complète</span>
            ) : partial && loggedIn ? (
              <>
                <small>Compléter la collection</small>
                <b>{formatPrice(price!)}</b>
              </>
            ) : (
              <>
                <b>{formatPrice(product.priceCents)}</b>
                {product.compareAtCents && <s>{formatPrice(product.compareAtCents)}</s>}
              </>
            )}
          </div>
          <div className="cc-btns">
            <button type="button" className="btn btn-sm cc-try" onClick={() => onTry(c)} aria-pressed={trying}>
              {trying ? 'En essai' : 'Essayer'}
            </button>
            {!(complete && loggedIn) && (
              <button type="button" className="cc-buy" disabled={loggedIn && (!sale || !ready)} onClick={() => onBuy(product)}>
                {!loggedIn ? 'Acheter' : !sale && ready ? 'Bientôt en vente' : 'Acheter'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Bandeau du Trésor du Bazar : les 21 skins des 7 collections premium. */
export function TresorBanner({ product, owned, loggedIn, sale, ready, onBuy }: { product: Product; owned: string[]; loggedIn: boolean; sale: boolean; ready: boolean; onBuy: (p: Product) => void }) {
  const price = productPrice(product, owned);
  const have = product.items.filter(i => owned.includes(i)).length;
  return (
    <section className="tb" aria-labelledby="tb-t">
      <div className="tb-art" aria-hidden="true">
        {['col:celeste', 'col:neant', 'col:ecarlate', 'col:inferno', 'col:jade', 'col:neon', 'col:olympe'].map((id, i) => (
          <span key={id} className="tb-seal" style={{ '--i': i } as CSSProperties}>
            <CollectionSeal id={id} size={i === 0 ? 46 : 34} />
          </span>
        ))}
      </div>
      <div className="tb-txt">
        <RarityGem rarity="legendaire" label="Tout le Bazar" />
        <h3 id="tb-t" className="tb-name">
          {product.name}
          {product.badge && <span className="badge gold">{product.badge}</span>}
        </h3>
        <p>{product.description} Les sept sceaux de collection compris.</p>
        {loggedIn && have > 0 && price !== null && (
          <small className="tb-have">
            Vous possédez déjà {have} skin{have > 1 ? 's' : ''} sur {product.items.length} : le prix du Trésor ne change pas.
          </small>
        )}
      </div>
      <div className="tb-buy">
        <div className="cc-price">
          <b>{formatPrice(product.priceCents)}</b>
          {product.compareAtCents && <s>{formatPrice(product.compareAtCents)}</s>}
        </div>
        {price === null && loggedIn ? (
          <span className="cc-done">Déjà dans votre collection</span>
        ) : (
          <button type="button" className="btn-gold sm" disabled={loggedIn && (!sale || !ready)} onClick={() => onBuy(product)}>
            {loggedIn && !sale && ready ? 'Bientôt en vente' : `Acheter le Trésor`}
          </button>
        )}
      </div>
    </section>
  );
}

/** Carte du Grimoire des sorts, en tête du rayon Sorts. */
export function GrimoireCard({ product, owned, loggedIn, sale, ready, onBuy }: { product: Product; owned: string[]; loggedIn: boolean; sale: boolean; ready: boolean; onBuy: (p: Product) => void }) {
  const price = productPrice(product, owned);
  return (
    <div className="ic ic-pack r-legendaire" style={{ '--gem': '#f3c969' } as CSSProperties}>
      <div className="ic-hit">
        <span className="th th-card ic-pack-art" aria-hidden="true">
          {product.items.map((id, i) => (
            <span key={id} className="ic-pack-orb" style={{ '--i': i, '--n': product.items.length, '--p': itemById(id)?.skin?.primary } as CSSProperties} />
          ))}
          <span className="ic-pack-book" />
        </span>
        {product.badge && <span className="ic-new">{product.badge}</span>}
        <RarityGem rarity="legendaire" label={`Pack · ${product.items.length} sorts`} />
        <span className="ic-name">{product.name}</span>
        <span className="ic-desc">{product.description}</span>
        <span className="ic-foot">
          <span className="ic-price">
            {formatPrice(product.priceCents)}
            {product.compareAtCents && <s>{formatPrice(product.compareAtCents)}</s>}
          </span>
        </span>
      </div>
      {price === null && loggedIn ? (
        <span className="ic-equip is-done">Possédé</span>
      ) : (
        <button type="button" className="ic-equip" disabled={loggedIn && (!sale || !ready)} onClick={() => onBuy(product)}>
          {loggedIn && !sale && ready ? 'Bientôt' : 'Acheter'}
        </button>
      )}
    </div>
  );
}
