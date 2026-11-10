// Barre de panoplie : les trois emplacements (Roi, Échiquier, Sorts) de l'essai. Pour chacun : vignette, emplacement,
// nom, état (Équipé, En essai · prix, En essai · Possédé). Toucher un emplacement ouvre son rayon et la vue qui va
// avec ; la croix remet l'objet porté.
import type { CSSProperties } from 'react';
import { SLOTS, SLOT_LABEL, formatPrice, itemById, unitPrice } from '../../../shared/catalog';
import type { ItemKind } from '../../../shared/catalog';
import { ItemThumb } from './ItemThumb';
import { gemOf, itemState } from './trial';
import type { Trial } from './trial';

interface Props {
  trial: Trial;
  pano: Trial;
  owned: string[];
  loggedIn: boolean;
  onOpen: (kind: ItemKind) => void;
  onRevert: (kind: ItemKind) => void;
}

export function PanoplieBar({ trial, pano, owned, loggedIn, onOpen, onRevert }: Props) {
  return (
    <div className="pb" role="group" aria-label="Panoplie essayée">
      {SLOTS.map(k => (
        <SlotChip key={k} kind={k} id={trial[k]} trying={trial[k] !== pano[k]} owned={owned} pano={pano} loggedIn={loggedIn} onOpen={onOpen} onRevert={onRevert} />
      ))}
    </div>
  );
}

export function SlotChip({
  kind, id, trying, owned, pano, loggedIn, onOpen, onRevert,
}: { kind: ItemKind; id: string; trying: boolean; owned: string[]; pano: Trial; loggedIn: boolean; onOpen: (k: ItemKind) => void; onRevert: (k: ItemKind) => void }) {
  const it = itemById(id);
  const state = itemState(id, pano, owned);
  let status: string;
  if (!trying) status = loggedIn ? 'Équipé' : 'Par défaut';
  else if (state === 'owned') status = 'En essai · Possédé';
  else if (state === 'free') status = 'En essai · Offert';
  else status = `En essai · ${formatPrice(unitPrice(id))}`;
  const back = itemById(pano[kind])?.name ?? '';
  return (
    <div className={`slot ${trying ? 'is-trying' : 'is-on'}`} style={{ '--gem': gemOf(id) } as CSSProperties}>
      <button type="button" className="slot-hit" onClick={() => onOpen(kind)} aria-label={`${SLOT_LABEL[kind]} : ${it?.name ?? ''}, ${status.toLowerCase()}. Ouvrir le rayon`}>
        <ItemThumb id={id} size="chip" />
        <span className="slot-txt">
          <small>{SLOT_LABEL[kind]}</small>
          <b>{it?.name}</b>
          <em>{status}</em>
        </span>
      </button>
      {trying && (
        <button type="button" className="slot-x" onClick={() => onRevert(kind)} aria-label={`Retirer l’essai : remettre ${back}`} title={`Remettre ${back}`}>
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
