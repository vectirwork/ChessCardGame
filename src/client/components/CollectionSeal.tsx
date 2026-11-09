// Sceau de collection : l'exclusivité des collections premium complètes (sealOf, catalog.ts). C'est le cimier du roi de
// la collection (crestUrl) dans un médaillon cerclé d'or, à la teinte de la collection, montré à côté du pseudo (en-tête
// de partie, profil, classement). Aucun nouveau dessin, aucune animation.
// À ne pas confondre avec le sceau « Zéro pay-to-win » de la boutique (Seal, Shop.tsx).
import type { CSSProperties } from 'react';
import { collectionById } from '../../shared/catalog';
import { crestUrl } from './pieces';

export function CollectionSeal({ id, size = 20, className }: { id: string | null | undefined; size?: number; className?: string }) {
  const c = id ? collectionById(id) : undefined;
  // Arcane (offerte) ne donne jamais de sceau
  if (!c || c.rarity === 'offert') return null;
  return (
    <span
      className={className ? `collection-seal ${className}` : 'collection-seal'}
      style={{ '--crest': crestUrl(c.king), '--gem': c.gem, '--size': `${size}px` } as CSSProperties}
      role="img"
      aria-label={`Sceau de la collection ${c.name}`}
      title={`Sceau de la collection ${c.name}`}
    />
  );
}
