// Vignettes des skins (boutique, compte, récapitulatif d'achat, paiement simulé). Toutes statiques : images SVG mises
// en cache (rois : data URI de pieces.ts en background-image), CSS figé, aucune animation, aucune 3D vivante.
// - Roi : les deux rois du skin, le blanc devant, le noir derrière.
// - Échiquier : un coin de 4 × 4 cases incliné (rotateX fixe), avec le vrai cadre, le liseré et l'incrustation du thème
//   (boardTheme, mêmes classes que Board), et un roi Arcane posé dessus pour l'échelle.
// - Sorts : le sceau du skin (anneau, cœur, 8 particules à sa forme) sur un fond à ses deux couleurs.
// - Collection : le triptyque (sceau des sorts derrière, échiquier incliné, les deux rois devant).
// Remplace l'ancienne pastille `Swatch` de Shop.tsx.
import type { CSSProperties } from 'react';
import { RARITY, boardStyle, collectionById, itemById, kingStyle } from '../../../shared/catalog';
import type { SkinRarity } from '../../../shared/catalog';
import { boardTheme } from '../../components/boardTheme';
import { crestUrl, kingUrl } from '../../components/pieces';
import { gemOf } from './trial';
import './thumbs.css';

/** Taille : `card` (carte de rayon), `chip` (44 px : emplacement, ligne de récapitulatif), `mini` (24 px). */
export type ThumbSize = 'card' | 'chip' | 'mini';

const CELLS = Array.from({ length: 16 }, (_, i) => <span key={i} className={`sq ${((i >> 2) + (i & 3)) % 2 ? 'd' : 'l'}`} />);

/** Coin d'échiquier 4 × 4 : la structure de Board (.board-wrap > .board > .squares), donc les décors de boardTheme. */
export function BoardTile({ id, tilt = true, king = true, className = '' }: { id: string; tilt?: boolean; king?: boolean; className?: string }) {
  const bs = boardStyle(id);
  const bt = boardTheme(id);
  const style = { '--light': bs.light, '--dark': bs.dark, '--frame': bs.frame, '--coords': bs.coords, ...bt.vars } as CSSProperties;
  return (
    <span className={`th-board ${tilt ? 'is-tilted' : ''} ${className}`}>
      <span className={`board-wrap ${bt.className}`} style={style}>
        <span className="board">
          <span className="squares">{CELLS}</span>
        </span>
      </span>
      {king && <span className="th-board-king" style={{ backgroundImage: kingUrl('w') }} />}
    </span>
  );
}

/** Sceau des sorts, figé (aucune rotation). */
export function SpellSeal({ id, className = '' }: { id: string; className?: string }) {
  const s = itemById(id)?.skin;
  if (!s) return null;
  return (
    <span className={`th-seal p-${s.particle} f-${s.flourish} ${className}`} style={{ '--p': s.primary, '--s': s.secondary, '--a': s.accent } as CSSProperties}>
      <span className="th-seal-ring" />
      <span className="th-seal-ring r2" />
      <span className="th-seal-core" />
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  );
}

/** Les deux rois d'un skin. */
export function KingDuo({ id, className = '' }: { id: string; className?: string }) {
  return (
    <span className={`th-duo ${className}`}>
      <span className="th-k th-kb" style={{ backgroundImage: kingUrl('b', id) }} />
      <span className="th-k th-kw" style={{ backgroundImage: kingUrl('w', id) }} />
    </span>
  );
}

/** Triptyque d'une collection. */
export function Triptych({ id, className = '' }: { id: string; className?: string }) {
  const c = collectionById(id);
  if (!c) return null;
  return (
    <span className={`th-trip ${className}`} style={{ '--gem': c.gem } as CSSProperties}>
      <span className="th-trip-halo" />
      <SpellSeal id={c.skin} className="th-trip-seal" />
      <BoardTile id={c.board} king={false} className="th-trip-board" />
      <KingDuo id={c.king} className="th-trip-kings" />
    </span>
  );
}

/** Vignette d'un objet (roi, échiquier, sorts) ou d'une collection. */
export function ItemThumb({ id, size = 'card', className = '' }: { id: string; size?: ThumbSize; className?: string }) {
  const it = itemById(id);
  const gem = gemOf(id);
  const cls = `th th-${size} ${className}`;
  const style = { '--gem': gem } as CSSProperties;
  if (!it) {
    const c = collectionById(id);
    if (!c) return null;
    return (
      <span className={`${cls} th-is-coll`} style={style} aria-hidden="true">
        {size === 'card' ? <Triptych id={id} /> : <span className="th-crest" style={{ backgroundImage: crestUrl(c.king) }} />}
      </span>
    );
  }
  let body;
  if (it.kind === 'king') body = size === 'card' ? <KingDuo id={id} /> : <span className="th-k th-solo" style={{ backgroundImage: kingUrl('w', id) }} />;
  else if (it.kind === 'board') body = <BoardTile id={id} tilt={size === 'card'} king={size === 'card'} />;
  else body = <SpellSeal id={id} />;
  return (
    <span className={`${cls} th-is-${it.kind}`} style={size === 'card' && it.kind === 'king' ? ({ '--gem': kingStyle(id).gem } as CSSProperties) : style} aria-hidden="true">
      {body}
    </span>
  );
}

/** Pierre de rareté et son libellé (« ◆ ÉPIQUE »). `label` remplace le libellé (« Collection »). */
export function RarityGem({ rarity, label }: { rarity: SkinRarity; label?: string }) {
  return (
    <span className={`gem r-${rarity}`} style={{ '--rc': RARITY[rarity].color } as CSSProperties}>
      <i aria-hidden="true" />
      {label ?? RARITY[rarity].label}
    </span>
  );
}

/** Teinte de fond d'un échiquier pour une pastille simple (sans décor). */
export const boardTint = (id: string) => boardStyle(id).dark;
