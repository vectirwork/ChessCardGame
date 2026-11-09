// Habillage d'un échiquier : classes et variables CSS posées sur .board-wrap, calculées une seule fois par thème
// (objets stables : Board est mémoïsé et ne recrée rien à chaque rendu).
// Squelette : seule la classe de texture d'origine (tex-<texture>). Les décors (liseré, incrustation, motif et halo du
// cadre) ajouteront ici leurs classes (has-fillet, has-inlay, fa-border, fa-corners, has-glow) et leurs variables
// (--fillet, --inlay, --frame-art, --frame-bg, --frame-shadow), avec des data URI construites une fois par thème.
import type { CSSProperties } from 'react';
import { boardStyle } from '../../shared/catalog';

export interface BoardTheme {
  /** Classes de .board-wrap, après « board-wrap ». */
  className: string;
  /** Variables CSS des décors, ajoutées au style de .board-wrap. */
  vars: CSSProperties;
}

const cache = new Map<string, BoardTheme>();

/** Habillage d'un thème (objet board:*) ; absent ou inconnu : Nuit arcane, comme boardStyle. */
export function boardTheme(theme: string | undefined): BoardTheme {
  const key = theme ?? '';
  let t = cache.get(key);
  if (!t) {
    const bs = boardStyle(theme);
    t = { className: `tex-${bs.texture}`, vars: {} };
    cache.set(key, t);
  }
  return t;
}
