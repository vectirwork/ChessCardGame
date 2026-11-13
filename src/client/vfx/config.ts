// Réglages des effets (scène WebGL des sorts) : rythme, coût, durées couplées au CSS. Aucun import. Lu seulement par le
// morceau des effets, chargé à la demande (stage.ts, effects.ts) : le partage des scènes entre échiquiers garde ses
// délais dans useVfx.ts, chargé avec les échiquiers, pour ne rien ajouter à leur morceau.
// Chaque valeur est celle d'avant ce module ; changer une durée marquée « CSS » demande de changer la feuille indiquée
// (test/durees-css.test.ts les compare).

/**
 * Échiquier : cases par côté, et position du centre des cases du bord depuis le centre de l'échiquier (repère de la
 * scène : 1 unité = 1 case ; les centres vont de -HALF à HALF).
 */
export const N = 8;
export const HALF = (N - 1) / 2;

/** Densité de pixels du rendu WebGL : au plus `maxRatio`, `modestRatio` sur un appareil modeste. */
export const RENDER = Object.freeze({
  maxRatio: 2,
  modestRatio: 1.5,
  /** Appareil modeste : au plus tant de cœurs, ou au plus tant de Go de mémoire. */
  modestCores: 4,
  modestMemoryGb: 4,
});

/** Perspective de l'échiquier quand sa feuille n'en donne pas (CSS : board.css, .board-wrap), en px. */
export const DEFAULT_PERSPECTIVE = 1400;

/** Particules : capacité de chaque système (une forme et un mélange). */
export const PARTICLE_CAPACITY = 2600;

/** Image plafonnée (s) : sur un appareil lent, l'animation saute des images au lieu de ralentir. */
export const MAX_FRAME_S = 0.1;

/** Préparation au repos (VfxStage.warm) : moment calme (ms sans défilement), nouvel essai, attente pendant un sort. */
export const CALM = Object.freeze({ scrollQuietMs: 400, retryMs: 200, idleFallbackMs: 60, busyRetryMs: 250 });

/** Inclinaison cinématographique : montée et retour à plat (s), inclinaison (rad) et agrandissement par défaut. */
export const CINE = Object.freeze({ upS: 0.55, downS: 0.7, tilt: 0.5, zoom: 1.04 });

/** Secousse : pixels par unité de secousse, durée par défaut (s). */
export const SHAKE = Object.freeze({ px: 9, durationS: 0.45 });

/** Éclair plein écran (CSS : board.css, .vfx-flash, animation vfx-flash) : durée de l'animation, en ms. */
export const FLASH_MS = 800;
/** Retour arrière, carte du Duel (CSS : board.css, .vfx-rewind, animations rewind-glitch et fade-out), en ms. */
export const REWIND_MS = 1400;
/** Marge après une animation CSS avant de retirer son élément ou sa classe, en ms. */
export const CSS_MARGIN_MS = 100;

/** Mise en scène d'un sort (runScene). */
export const CAST = Object.freeze({
  /** Maintien de l'inclinaison (s). */
  holdS: 1.25,
  /** Impact avec le mouvement réduit (s). */
  reducedImpactS: 0.15,
  /** Fin du sort après l'impact (ms ; mouvement réduit). */
  endAfterImpactMs: 450,
  reducedEndAfterImpactMs: 50,
  /** Garde-fous en temps réel : impact forcé, puis fin forcée, tant de secondes après l'impact prévu. */
  guardImpactS: 1.2,
  guardEndS: 2.5,
  /** Sans WebGL : impact au bout de tant de ms. */
  noGlImpactMs: 150,
  /** Garde-fou de l'inclinaison après la fin du sort (ms). */
  releaseMs: 2600,
  /** Annonce d'un Présage : impact (s) et éclair atténué (facteur). */
  announceImpactS: 0.45,
  lightFlash: 0.3,
});

/** Arrivée d'un Présage : délai (ms) laissé à l'échiquier pour prendre la teinte du Climat avant la mise en scène. */
export const ARRIVAL_DELAY_MS = 80;
