// Géométrie du mode immersif (gameLayout), suivie au redimensionnement, partagée par tous ceux qui la lisent : la coque
// (GameShell) et la page de partie en ligne (GamePage) lisent le même objet, et un seul écouteur `resize` est posé sur
// la fenêtre, quel que soit le nombre de lecteurs (posé au premier, retiré au dernier).
//
// La fenêtre n'est lue qu'au premier lecteur et à chaque redimensionnement, jamais pendant un rendu ordinaire (lire
// innerWidth peut forcer un calcul de mise en page) : l'accueil, qui rend la coque souvent, n'y gagne aucune lecture.
import { useSyncExternalStore } from 'react';
import { gameLayout } from './layout';
import type { GameLayout } from './layout';

export interface StageLayout extends GameLayout {
  /** Taille de la fenêtre. */
  vw: number;
  vh: number;
}

let cache: StageLayout | null = null;
const listeners = new Set<() => void>();

function read(): StageLayout {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return { vw, vh, ...gameLayout(vw, vh) };
}

function onResize() {
  cache = read();
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1) window.addEventListener('resize', onResize);
  return () => {
    listeners.delete(cb);
    if (listeners.size) return;
    window.removeEventListener('resize', onResize);
    // Plus personne ne suit la fenêtre : la prochaine lecture repartira de sa taille du moment.
    cache = null;
  };
}

const snapshot = (): StageLayout => (cache ??= read());

/** Géométrie du mode immersif et taille de la fenêtre ; le même objet tant que la fenêtre ne change pas de taille. */
export function useGameLayout(): StageLayout {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
