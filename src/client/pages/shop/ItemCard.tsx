// Carte de skin d'un rayon : vignette dessinée, rareté, nom, et l'état (prix, Offert, Possédé, Équipé, En essai).
// Un clic essaie, il n'achète jamais : l'achat est un second geste, dans la cabine, sur un bouton qui porte le prix.
// Un skin possédé mais pas porté s'équipe d'ici (petit bouton or).
import type { CSSProperties } from 'react';
import { formatPrice, itemById, unitPrice } from '../../../shared/catalog';
import { Spinner } from '../../components/Layout';
import { ItemThumb, RarityGem } from './ItemThumb';
import { cardLabel, gemOf } from './trial';
import type { CardState } from './trial';

interface Props {
  id: string;
  state: CardState;
  trying: boolean;
  /** Bouton « Équiper » (connecté, objet possédé ou offert, pas porté). */
  canEquip: boolean;
  equipping: boolean;
  onTry: (id: string) => void;
  onEquip: (id: string) => void;
}

export function ItemCard({ id, state, trying, canEquip, equipping, onTry, onEquip }: Props) {
  const it = itemById(id);
  if (!it) return null;
  const cls = ['ic', `r-${it.rarity}`];
  if (trying) cls.push('is-trying');
  if (state === 'equipped') cls.push('is-on');
  return (
    <div className={cls.join(' ')} style={{ '--gem': gemOf(id) } as CSSProperties}>
      <button type="button" className="ic-hit" onClick={() => onTry(id)} aria-pressed={trying} aria-label={cardLabel(it, state, trying)}>
        <ItemThumb id={id} />
        {it.isNew && <span className="ic-new">Nouveau</span>}
        <RarityGem rarity={it.rarity} />
        <span className="ic-name">{it.name}</span>
        <span className="ic-foot">
          {state === 'equipped' ? (
            <span className="ic-st on">Équipé</span>
          ) : state === 'owned' ? (
            <span className="ic-st">Possédé</span>
          ) : state === 'free' ? (
            <span className="ic-st">Offert</span>
          ) : (
            <span className="ic-price">{formatPrice(unitPrice(id))}</span>
          )}
          {trying && <span className="ic-try">En essai</span>}
        </span>
      </button>
      {canEquip && !trying && (
        <button type="button" className="ic-equip" onClick={() => onEquip(id)} disabled={equipping} aria-label={`Équiper ${it.name}`}>
          {equipping ? <Spinner /> : 'Équiper'}
        </button>
      )}
    </div>
  );
}
