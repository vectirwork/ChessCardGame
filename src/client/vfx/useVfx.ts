// Crée la scène d'effets à la demande, une fois le plateau affiché.
import { useEffect, useState } from 'react';
import type { Color } from '../../shared/chess';
import type { VfxStage } from './stage';

export type VfxModule = typeof import('./index');
export interface Vfx {
  stage: VfxStage;
  m: VfxModule;
}

export function useVfx(wrap: HTMLElement | null, orientation: Color): Vfx | null {
  const [vfx, setVfx] = useState<Vfx | null>(null);
  useEffect(() => {
    if (!wrap) return;
    let stage: VfxStage | null = null;
    let dead = false;
    void import('./index').then(m => {
      if (dead) return;
      stage = new m.VfxStage(wrap, orientation);
      stage.markerFactory = m.createMarker;
      stage.arrivalFactory = m.playArrival;
      setVfx({ stage, m });
    });
    return () => {
      dead = true;
      stage?.dispose();
      setVfx(null);
    };
    // L'orientation suivante passe par stage.setOrientation() pour ne pas recréer la scène
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrap]);
  return vfx;
}
