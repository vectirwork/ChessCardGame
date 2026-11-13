// Rayon : grille de cartes sur ordinateur, portant à défilement natif (scroll-snap, sans JavaScript de carrousel) sur
// téléphone. Même composant : la mise en page vient du CSS (shop.css). Le rayon Collections s'empile en colonne.
import type { ReactNode } from 'react';
import { SLOTS, SLOT_DEFS } from '../../../shared/catalog';
import { cap, enLettres } from '../../../shared/text/fr';
import { StarMark } from '../PageScene';
import type { Rayon } from './RayonTabs';

/** Note sous chaque rayon : celle de l'emplacement (SLOT_DEFS), et celle des collections (un objet par emplacement). */
export const RAYON_NOTE = Object.fromEntries([
  ...SLOTS.map(k => [SLOT_DEFS[k].rayon, SLOT_DEFS[k].note]),
  ['collections', `${cap(enLettres(SLOTS.length))} skins assortis et une exclusivité qu’on ne trouve nulle part ailleurs : le sceau, à côté de votre pseudo.`],
]) as Record<Rayon, string>;

export function Rack({ rayon, empty, children }: { rayon: Rayon; empty?: ReactNode; children: ReactNode }) {
  return (
    <div id={`rayon-${rayon}`} role="tabpanel" aria-labelledby={`rt-${rayon}`} className={`rack rack-${rayon}`}>
      {empty ?? <div className="rack-row">{children}</div>}
      <p className="rack-note">
        <StarMark size={11} />
        {RAYON_NOTE[rayon]}
      </p>
    </div>
  );
}
