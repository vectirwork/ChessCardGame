// Déballage, au retour du paiement : un seul geste de 1,2 s au plus, dans la cabine. Les skins livrés montent sur le
// socle (translateY 24 px → 0) en apparaissant, une couronne de 12 éclats dorés s'ouvre une fois. Rien ne tourne en
// boucle ; transform et opacité seulement. Mouvement réduit : un simple changement d'état (règle globale, global.css).
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { ItemThumb } from './ItemThumb';

export function Unboxing({ items, onDone }: { items: string[]; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1500);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <div className="ub" aria-hidden="true">
      <span className="ub-ring">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
      <span className="ub-items">
        {items.slice(0, 3).map((id, i) => (
          <span key={id} className="ub-item" style={{ '--i': i } as CSSProperties}>
            <ItemThumb id={id} />
          </span>
        ))}
      </span>
    </div>
  );
}
