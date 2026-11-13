// Carte de collection : le triptyque (sceau des sorts, échiquier incliné, les deux rois), les trois skins et
// l'exclusivité (le sceau de collection), le prix (barré : la somme à l'unité) ou « Compléter la collection », et deux
// gestes : Essayer (les trois skins dans la cabine) et Acheter.
// Variantes : `compact` (rayon Collections) et `large` (vitrine de l'ordinateur, avec l'accroche).
// Paiements fermés : « Bientôt en vente », désactivé, pour tous (un visiteur ne part pas s'inscrire pour rien).
// Aussi : le bandeau d'un pack (Trésor du Bazar) et la carte de pack en tête d'un rayon (Grimoire des sorts).
import type { CSSProperties } from 'react';
import { SLOT_DEFS, collectionItems, formatPrice, itemById, itemLabel, productById, productPrice, sealName, tresorSeals } from '../../../shared/catalog';
import type { Collection, Product } from '../../../shared/catalog';
import { enLettres } from '../../../shared/text/fr';
import { CollectionSeal } from '../../components/CollectionSeal';
import { ItemThumb, RarityGem } from './ItemThumb';
import { gemOf, skins } from './trial';

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
        <RarityGem rarity={c.rarity} label={`Collection · ${skins(items.length)} + sceau`} />
        <h3 className="cc-name">{c.name}</h3>
        {large && <p className="cc-tag">{c.tagline}</p>}
        <ul className="cc-items">
          {items.map(id => {
            const it = itemById(id)!;
            const mine = loggedIn && owned.includes(id);
            return (
              <li key={id} className={mine ? 'is-mine' : ''}>
                {itemLabel(it)}
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
              <button type="button" className="cc-buy" disabled={!sale || !ready} onClick={() => onBuy(product)}>
                {buyLabel(sale, ready, 'Acheter')}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Sceaux des collections premium autour d'un sceau central (tresorSeals) : l'anneau se partage en n − 1 parts. */
const SEALS = tresorSeals();

/** Bandeau d'un pack (le Trésor du Bazar) : les sceaux de toutes les collections premium. */
export function TresorBanner({ product, owned, loggedIn, sale, ready, onBuy }: { product: Product; owned: string[]; loggedIn: boolean; sale: boolean; ready: boolean; onBuy: (p: Product) => void }) {
  const price = productPrice(product, owned);
  const have = product.items.filter(i => owned.includes(i)).length;
  const n = SEALS.length;
  return (
    <section className="tb" aria-labelledby="tb-t">
      <div className="tb-art" aria-hidden="true" style={{ '--n': n } as CSSProperties}>
        {SEALS.map((c, i) => (
          <span key={c.id} className="tb-seal" style={{ '--i': i } as CSSProperties}>
            <CollectionSeal id={c.id} size={i === 0 ? 46 : 34} />
          </span>
        ))}
      </div>
      <div className="tb-txt">
        <RarityGem rarity="legendaire" label="Tout le Bazar" />
        <h3 id="tb-t" className="tb-name">
          {product.name}
          {product.badge && <span className="badge gold">{product.badge}</span>}
        </h3>
        <p>
          {product.description}
          {` ${n > 1 ? `Les ${enLettres(n)} sceaux` : 'Le sceau'} de collection compris.`}
        </p>
        {loggedIn && have > 0 && price !== null && (
          <small className="tb-have">
            Vous possédez déjà {have} skin{have > 1 ? 's' : ''} sur {product.items.length}
            {` : ${priceKept(product)}`}
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
          <button type="button" className="btn-gold sm" disabled={!sale || !ready} onClick={() => onBuy(product)}>
            {buyLabel(sale, ready, product.shortName ? `Acheter le ${product.shortName}` : 'Acheter')}
          </button>
        )}
      </div>
    </section>
  );
}

/** Libellé d'un bouton d'achat : « Bientôt en vente » quand les paiements sont fermés (une fois l'état connu). */
const buyLabel = (sale: boolean, ready: boolean, label: string) => (!sale && ready ? 'Bientôt en vente' : label);

/** « le prix du Grimoire ne change pas. » */
const priceKept = (p: Product) => `le prix du ${p.shortName ?? 'pack'} ne change pas.`;

/**
 * Unité des objets d'un pack : celle de leur emplacement s'ils en ont un seul (« sort », « s » : « 7 sorts »), sinon
 * « skin ». Rendue en deux morceaux, singulier puis fin du pluriel (le texte reste découpé comme avant).
 */
function unitOf(p: Product): [string, string] {
  const kinds = new Set(p.items.map(id => itemById(id)?.kind));
  const [k] = kinds;
  const [sg, pl] = kinds.size === 1 && k ? SLOT_DEFS[k].unit : (['skin', 'skins'] as const);
  return pl.startsWith(sg) ? [sg, pl.slice(sg.length)] : [sg, ` (${pl})`];
}
/** Objets d'un pack comptés : « 7 sorts », « 2 skins ». */
const packCount = (p: Product, n: number) => {
  const [sg, end] = unitOf(p);
  return `${n} ${sg}${n > 1 ? end : ''}`;
};

/**
 * Carte de pack, en tête du rayon de son emplacement (`display`, le Grimoire des sorts en tête du rayon Sorts) : un
 * bandeau sur toute la largeur de la grille (ordinateur), une grande carte au début du portant (téléphone). Un orbe à la
 * teinte de chaque objet. Un pack garde son prix fixe : les objets déjà possédés sont dits.
 */
export function PackCard({ product, owned, loggedIn, sale, ready, onBuy }: { product: Product; owned: string[]; loggedIn: boolean; sale: boolean; ready: boolean; onBuy: (p: Product) => void }) {
  const price = productPrice(product, owned);
  const have = product.items.filter(i => owned.includes(i)).length;
  return (
    <div className="ic ic-pack r-legendaire" style={{ '--gem': '#f3c969' } as CSSProperties}>
      <div className="ic-hit">
        <span className="th th-card ic-pack-art" aria-hidden="true">
          {product.items.map((id, i) => (
            <span key={id} className="ic-pack-orb" style={{ '--i': i, '--n': product.items.length, '--p': gemOf(id) } as CSSProperties} />
          ))}
          <span className="ic-pack-book" />
        </span>
        {product.badge && <span className="ic-new">{product.badge}</span>}
        <span className="ic-pack-txt">
          <RarityGem rarity="legendaire" label={`Pack · ${packCount(product, product.items.length)}`} />
          <span className="ic-name">{product.name}</span>
          <span className="ic-desc">{product.description}</span>
          {loggedIn && have > 0 && price !== null && (
            <small className="ic-pack-have">
              Vous possédez déjà {have}
              {` ${unitOf(product)[0]}`}
              {have > 1 ? unitOf(product)[1] : ''} sur {product.items.length}
              {` : ${priceKept(product)}`}
            </small>
          )}
        </span>
        <span className="ic-pack-buy">
          <span className="ic-price">
            {formatPrice(product.priceCents)}
            {product.compareAtCents && <s>{formatPrice(product.compareAtCents)}</s>}
          </span>
          {price === null && loggedIn ? (
            <span className="ic-equip is-done">Possédé</span>
          ) : (
            <button type="button" className="ic-equip" disabled={!sale || !ready} onClick={() => onBuy(product)}>
              {buyLabel(sale, ready, 'Acheter')}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
