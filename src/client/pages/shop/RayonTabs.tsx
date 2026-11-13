// Onglets des rayons (Rois · Échiquiers · Sorts · Collections), filtres (Tout · Ma collection) et « Surprenez-moi ».
// role="tablist" : on passe d'un onglet à l'autre avec les flèches, Début et Fin. Seul le panneau de l'onglet actif est
// dans la page : aria-controls n'est posé que sur lui. Sur téléphone, les filtres passent sous le portant et
// « Surprenez-moi » en tête de cabine (shop.css).
import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { SLOTS, SLOT_DEFS } from '../../../shared/catalog';
import type { ItemKind, SlotRayon } from '../../../shared/catalog';

/** Rayons : un par emplacement (SLOT_DEFS), puis les collections. */
export type Rayon = SlotRayon | 'collections';
export const RAYONS: Rayon[] = [...SLOTS.map(k => SLOT_DEFS[k].rayon), 'collections'];
export const RAYON_LABEL = Object.fromEntries([...SLOTS.map(k => [SLOT_DEFS[k].rayon, SLOT_DEFS[k].plural]), ['collections', 'Collections']]) as Record<
  Rayon,
  string
>;
/** Rayon d'un emplacement. */
export const rayonOf = (k: ItemKind): Rayon => SLOT_DEFS[k].rayon;
/** Emplacement d'un rayon (null : les collections). */
export const kindOfRayon = (r: Rayon): ItemKind | null => SLOTS.find(k => SLOT_DEFS[k].rayon === r) ?? null;

interface Props {
  rayon: Rayon;
  counts: Record<Rayon, number>;
  onRayon: (r: Rayon) => void;
  /** Filtre « Ma collection » (connecté seulement). */
  mine: boolean | null;
  onMine: (v: boolean) => void;
  onSurprise: () => void;
  children?: ReactNode;
}

export function RayonTabs({ rayon, counts, onRayon, mine, onMine, onSurprise }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const i = RAYONS.indexOf(rayon);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % RAYONS.length;
    else if (e.key === 'ArrowLeft') j = (i + RAYONS.length - 1) % RAYONS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = RAYONS.length - 1;
    if (j < 0) return;
    e.preventDefault();
    onRayon(RAYONS[j]);
    refs.current[j]?.focus();
  };
  return (
    <div className="rt">
      <div className="rt-tabs" role="tablist" aria-label="Rayons de la boutique" onKeyDown={onKey}>
        {RAYONS.map((r, i) => (
          <button
            key={r}
            ref={el => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`rt-${r}`}
            aria-controls={rayon === r ? `rayon-${r}` : undefined}
            aria-selected={rayon === r}
            tabIndex={rayon === r ? 0 : -1}
            className={rayon === r ? 'on' : ''}
            onClick={() => onRayon(r)}
          >
            {RAYON_LABEL[r]}
            <small>{counts[r]}</small>
          </button>
        ))}
      </div>
      <div className="rt-filters">
        {mine !== null && (
          <span className="rt-chips" role="group" aria-label="Filtre">
            <button type="button" className={!mine ? 'on' : ''} aria-pressed={!mine} onClick={() => onMine(false)}>
              Tout
            </button>
            <button type="button" className={mine ? 'on' : ''} aria-pressed={mine} onClick={() => onMine(true)}>
              Ma collection
            </button>
          </span>
        )}
        <button type="button" className="rt-surprise" onClick={onSurprise}>
          ✦ Surprenez-moi
        </button>
      </div>
    </div>
  );
}
