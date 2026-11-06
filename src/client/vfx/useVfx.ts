// Crée la scène d'effets à la demande, une fois le plateau affiché.
// `pool` : la scène n'est pas détruite au démontage mais gardée un moment pour le prochain échiquier du même nom
// (la démonstration de l'accueil change d'échiquier à chaque lieu) : un seul contexte WebGL, des programmes déjà
// compilés, aucune image sautée pendant le défilement.
import { useEffect, useState } from 'react';
import type { Color } from '../../shared/chess';
import type { VfxStage } from './stage';

export type VfxModule = typeof import('./index');
export interface Vfx {
  stage: VfxStage;
  m: VfxModule;
}

/** Scène gardée sans échiquier au-delà de ce délai : elle est libérée (contexte WebGL rendu au navigateur). */
const POOL_KEEP_MS = 20000;
const pool = new Map<string, { stage: VfxStage; timer: number }>();

export function useVfx(wrap: HTMLElement | null, orientation: Color, poolKey?: string): Vfx | null {
  const [vfx, setVfx] = useState<Vfx | null>(null);
  useEffect(() => {
    if (!wrap) return;
    let stage: VfxStage | null = null;
    let dead = false;
    void import('./index').then(m => {
      if (dead) return;
      const kept = poolKey ? pool.get(poolKey) : undefined;
      if (kept) {
        pool.delete(poolKey!);
        window.clearTimeout(kept.timer);
        stage = kept.stage;
        stage.attach(wrap, orientation);
      } else {
        stage = new m.VfxStage(wrap, orientation);
        stage.markerFactory = m.createMarker;
        stage.arrivalFactory = m.playArrival;
      }
      setVfx({ stage, m });
    });
    return () => {
      dead = true;
      setVfx(null);
      if (!stage) return;
      if (!poolKey || !stage.ok) {
        stage.dispose();
        return;
      }
      const s = stage;
      s.detach();
      const prev = pool.get(poolKey);
      if (prev && prev.stage !== s) {
        window.clearTimeout(prev.timer);
        prev.stage.dispose();
      }
      const timer = window.setTimeout(() => {
        if (pool.get(poolKey)?.stage !== s) return;
        pool.delete(poolKey);
        s.dispose();
      }, POOL_KEEP_MS);
      pool.set(poolKey, { stage: s, timer });
    };
    // L'orientation suivante passe par stage.setOrientation() pour ne pas recréer la scène
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrap]);
  return vfx;
}
