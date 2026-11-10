// Cabine, vue « Portrait du roi » : le roi essayé en blanc et en noir côte à côte, sur un socle d'or (dégradé fixe),
// avec un halo de sa couleur, et l'encart « À 36 px, sur un téléphone ». Aucun WebGL : images SVG mises en cache.
// Un roi qui arrive monte de quelques pixels en apparaissant (une fois, transform et opacité).
import type { CSSProperties } from 'react';
import { RARITY, itemById, kingStyle } from '../../../shared/catalog';
import { kingUrl, pieceUrl } from '../../components/pieces';
import { boardStyle } from '../../../shared/catalog';
import { RarityGem } from './ItemThumb';

export function KingPortrait({ king, board }: { king: string; board: string }) {
  const it = itemById(king);
  const gem = kingStyle(king).gem;
  const name = it?.name ?? 'Roi';
  return (
    <div className="kp" style={{ '--gem': gem } as CSSProperties}>
      <span className="kp-halo" aria-hidden="true" />
      <span className="kp-ped" aria-hidden="true" />
      <div className="kp-duo" key={king}>
        <figure className="kp-fig">
          <span className="kp-k" role="img" aria-label={`${name}, côté blancs`} style={{ backgroundImage: kingUrl('w', king) }} />
          <figcaption>Côté blancs</figcaption>
        </figure>
        <figure className="kp-fig">
          <span className="kp-k" role="img" aria-label={`${name}, côté noirs`} style={{ backgroundImage: kingUrl('b', king) }} />
          <figcaption>Côté noirs</figcaption>
        </figure>
      </div>
      {it && (
        <div className="kp-id">
          <RarityGem rarity={it.rarity} />
          <b>{it.name}</b>
          <span>{it.description}</span>
        </div>
      )}
      <ProofStrip king={king} board={board} />
      {it && <span className="sr-only">Rareté {RARITY[it.rarity].label}</span>}
    </div>
  );
}

/**
 * Preuve de lisibilité : 4 cases de 36 px de l'échiquier essayé, roi blanc, dame blanche, dame noire, roi noir. Le roi
 * reste un roi et ne se confond pas avec la dame, aux deux couleurs.
 */
export function ProofStrip({ king, board, caption = true }: { king: string; board: string; caption?: boolean }) {
  const b = boardStyle(board);
  const cells: [string, boolean, string][] = [
    [kingUrl('w', king), true, 'roi blanc'],
    [pieceUrl('w', 'q'), false, 'dame blanche'],
    [pieceUrl('b', 'q'), true, 'dame noire'],
    [kingUrl('b', king), false, 'roi noir'],
  ];
  return (
    <div className="proof" style={{ '--l': b.light, '--d': b.dark } as CSSProperties}>
      <span className="proof-k">À 36 px, sur un téléphone</span>
      <span className="proof-row" role="img" aria-label="À 36 pixels : roi blanc, dame blanche, dame noire, roi noir">
        {cells.map(([img, light, label]) => (
          <i key={label} className={light ? 'l' : 'd'} style={{ backgroundImage: img }} />
        ))}
      </span>
      {caption && <span className="proof-cap">roi · dame · dame · roi</span>}
    </div>
  );
}
