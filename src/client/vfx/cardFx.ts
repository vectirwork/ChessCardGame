// Fiche d'effet de chaque carte : sa mise en scène et ce qui la règle (impact, inclinaison, secousse, éclair, ambiance
// de l'échiquier, teinte). Record exhaustif : une carte ajoutée à CardId ne compile pas sans sa fiche. Seul import à
// l'exécution : config.ts (lu par effects.ts, dans le morceau des effets).
// Les classes d'ambiance sont définies dans board.css (« Ambiances passagères ») ; les marques laissées sur l'échiquier
// par un effet actif (cases givrées, gouffre, pièces gelées…) sont dans boardMarks.ts.
import type { CardId } from '../../shared/cards';
import { CSS_MARGIN_MS, REWIND_MS } from './config';

/** Mises en scène (effects.ts, SCENES) : une par Pouvoir, une pour les cartes du Duel, une générique. */
export type SceneKey = 'generique' | 'duel' | 'hourglass' | 'truce' | 'blood_moon' | 'ice_age' | 'blast' | 'rift' | 'tide';

/** Classes d'ambiance de l'échiquier (board.css). */
export type MoodClass = 'vfx-calm' | 'vfx-blood' | 'vfx-frost' | 'vfx-blast' | 'vfx-tide' | 'vfx-storm' | 'vfx-rewind';

/**
 * Ambiance : classe posée sur l'échiquier au début de la mise en scène, retirée `afterImpactS` secondes après l'impact
 * (Pouvoirs : elle suit l'impact, mouvement réduit compris), ou au bout de `ms` quel que soit l'impact (Duel).
 */
export type Mood = { cls: MoodClass; afterImpactS: number } | { cls: MoodClass; ms: number };

export interface CardFx {
  scene: SceneKey;
  /** Impact (s) : l'état de la partie change à cet instant. */
  impactAt: number;
  /** Inclinaison du plateau pendant le sort (radians). */
  tilt: number;
  /** Secousse à l'impact (multiplie celle du skin). */
  shake: number;
  /** Éclair à l'impact (multiplie celui du skin). */
  flash: number;
  mood?: Mood;
  /** Teinte propre à la carte, mêlée au skin du lanceur (tinted) : couleur et part de mélange. */
  tint?: { color: string; mix: number };
}

/** Carte inconnue de ce code (catalogue plus récent) : sceau, convergence, éclat. */
export const GENERIC_FX: Readonly<CardFx> = Object.freeze({ scene: 'generique', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 });

/** ← Une fiche par carte. Valeurs d'avant ce registre (tables IMPACT_AT, TILT, SHAKE, FLASH et scènes de effects.ts). */
export const CARD_FX: Readonly<Record<CardId, Readonly<CardFx>>> = {
  // ----- Pouvoirs : Climats (Présages : annonce discrète au lancement, cette mise en scène à l'arrivée)
  hourglass: { scene: 'hourglass', impactAt: 1.05, tilt: 0.6, shake: 0.5, flash: 0.6 },
  truce: { scene: 'truce', impactAt: 0.95, tilt: 0.52, shake: 0.25, flash: 0.45, mood: { cls: 'vfx-calm', afterImpactS: 1.4 }, tint: { color: '#f4f1dc', mix: 0.45 } },
  blood_moon: { scene: 'blood_moon', impactAt: 1.05, tilt: 0.58, shake: 0.7, flash: 0.9, mood: { cls: 'vfx-blood', afterImpactS: 1.5 }, tint: { color: '#ff2a3d', mix: 0.7 } },
  ice_age: { scene: 'ice_age', impactAt: 0.95, tilt: 0.52, shake: 0.7, flash: 0.6, mood: { cls: 'vfx-frost', afterImpactS: 1.6 }, tint: { color: '#cfefff', mix: 0.6 } },
  blast: { scene: 'blast', impactAt: 1, tilt: 0.6, shake: 1.8, flash: 1.1, mood: { cls: 'vfx-blast', afterImpactS: 1.2 }, tint: { color: '#ff8a2a', mix: 0.5 } },
  // ----- Pouvoirs : Terrains et Événement
  ice_wall: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 1.4, flash: 0.6 },
  rift: { scene: 'rift', impactAt: 0.85, tilt: 0.52, shake: 1.5, flash: 0.6, tint: { color: '#b46bff', mix: 0.35 } },
  tide: { scene: 'tide', impactAt: 1, tilt: 0.52, shake: 0.9, flash: 0.5, mood: { cls: 'vfx-tide', afterImpactS: 1.2 }, tint: { color: '#3fe0d0', mix: 0.7 } },
  // ----- Duel (cartes historiques, gardées pour relire les anciennes parties)
  time_warp: { scene: 'duel', impactAt: 1.15, tilt: 0.62, shake: 0.7, flash: 0.6 },
  gravity: { scene: 'duel', impactAt: 0.85, tilt: 0.62, shake: 1.4, flash: 0.6 },
  freeze: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 },
  shield: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 },
  swap: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 },
  rewind: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6, mood: { cls: 'vfx-rewind', ms: REWIND_MS + CSS_MARGIN_MS } },
  revive: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 },
  knight_leap: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 },
  lightning: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 1.4, flash: 1, mood: { cls: 'vfx-storm', ms: 1700 } },
  phase: { scene: 'duel', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 },
};

/** Fiche d'une carte, ou la fiche générique pour un identifiant inconnu de ce code. */
export const cardFx = (card: CardId): Readonly<CardFx> => CARD_FX[card] ?? GENERIC_FX;
