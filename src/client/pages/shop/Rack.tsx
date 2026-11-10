// Rayon : grille de cartes sur ordinateur, portant à défilement natif (scroll-snap, sans JavaScript de carrousel) sur
// téléphone. Même composant : la mise en page vient du CSS (shop.css). Le rayon Collections s'empile en colonne.
import type { ReactNode } from 'react';
import { StarMark } from '../PageScene';
import type { Rayon } from './RayonTabs';

export const RAYON_NOTE: Record<Rayon, string> = {
  rois: 'Votre roi vous représente : vos adversaires le voient en face d’eux.',
  echiquiers: 'Votre échiquier vous suit dans toutes vos parties. Vos adversaires gardent le leur.',
  sorts: 'Vos sorts s’animent avec ce skin, chez vous comme chez votre adversaire.',
  collections: 'Trois skins assortis et une exclusivité qu’on ne trouve nulle part ailleurs : le sceau, à côté de votre pseudo.',
};

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
