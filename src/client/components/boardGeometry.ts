// Géométrie de l'échiquier affiché : case ↔ cellule de la grille, point ↔ case, dans les deux orientations.
// Fonctions pures, sans DOM. Une case est un index de 0 (a1) à 63 (h8) ; une cellule est une colonne `x` (0 à 7, de
// gauche à droite) et une ligne `y` (0 à 7, de haut en bas) de l'échiquier tel qu'il est dessiné.
// `orientation` : couleur affichée en bas ('w' : a1 en bas à gauche ; 'b' : h8 en bas à gauche).

export type Orientation = 'w' | 'b';

/** Cellule affichée d'une case : `x` colonne depuis la gauche, `y` ligne depuis le haut. */
export function cellOf(sq: number, orientation: Orientation): { x: number; y: number } {
  const f = sq & 7;
  const r = sq >> 3;
  return orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
}

/** Case d'une cellule affichée (inverse de cellOf). */
export function squareOfCell(x: number, y: number, orientation: Orientation): number {
  return orientation === 'w' ? (7 - y) * 8 + x : y * 8 + (7 - x);
}

/**
 * Case sous un point, donné en fraction de la taille de l'échiquier (0 à gauche ou en haut, 1 à droite ou en bas :
 * `(clientX - rect.left) / rect.width`), ou null hors de l'échiquier.
 */
export function squareAt(fx: number, fy: number, orientation: Orientation): number | null {
  const x = Math.floor(fx * 8);
  const y = Math.floor(fy * 8);
  // Écrit en positif pour qu'un échiquier de taille nulle (NaN) donne aussi null.
  if (!(x >= 0 && x <= 7 && y >= 0 && y <= 7)) return null;
  return squareOfCell(x, y, orientation);
}
