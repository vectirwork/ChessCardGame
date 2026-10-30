// Lancer un sort animé sans jamais bloquer la partie.
// playCast (src/client/vfx) rend la main après l'impact ; une carte qu'il ne sait pas encore animer (nouvelle carte)
// ou une scène 3D qui rame ne doivent pas figer l'échiquier : l'impact est forcé au bout de `ms`.
import type { CardInfo } from '../../shared/game';
import type { SkinStyle } from '../../shared/catalog';
import type { Vfx } from '../vfx/useVfx';

export interface SafeCastHooks {
  impact: () => void;
  hide: (ids: number[]) => void;
  show: () => void;
  victimAtBottom?: boolean;
}

/** Durée maximale d'un sort animé avant que la partie reprenne d'elle-même. */
export const CAST_WATCHDOG_MS = 4200;

export async function castSafely(vfx: Vfx, info: CardInfo, skin: SkinStyle, hooks: SafeCastHooks, ms = CAST_WATCHDOG_MS): Promise<void> {
  let impacted = false;
  const impact = () => {
    if (impacted) return;
    impacted = true;
    hooks.impact();
  };
  try {
    const done = vfx.m.playCast(vfx.stage, info, skin, { ...hooks, impact });
    await Promise.race([done, new Promise(r => setTimeout(r, ms))]);
  } catch {
    // animation en erreur : l'état de la partie passe avant tout
  }
  impact();
  hooks.show();
}
