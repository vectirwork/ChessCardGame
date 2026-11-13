// Émotes de la partie en ligne : une bulle par camp, retirée EMOTE_MS après son arrivée. Chaque camp a sa propre
// minuterie, annulée par l'émote suivante du même camp (la seconde reste affichée tout son temps, avec sa propre clé
// pour rejouer l'apparition), et par clear() (revanche, départ de la page).
import type { Color } from '../../shared/chess';

/** Durée d'affichage d'une émote (ms). */
export const EMOTE_MS = 2800;

/** Émote affichée : texte, et clé qui change à chaque émote (la bulle se rejoue). */
export interface ShownEmote {
  text: string;
  key: number;
}

export interface EmoteTimers {
  /** Affiche une émote pour `color` (remplace la précédente et sa minuterie). */
  show(color: Color, text: string): void;
  /** Annule les minuteries en cours (les bulles restent à effacer par l'appelant). */
  clear(): void;
}

/** Minuteries des émotes ; `set(color, émote ou null)` met la page à jour. */
export function emoteTimers(set: (color: Color, e: ShownEmote | null) => void, ms = EMOTE_MS): EmoteTimers {
  const timers: Partial<Record<Color, ReturnType<typeof setTimeout>>> = {};
  let key = 0;
  const stop = (c: Color) => {
    if (timers[c] !== undefined) clearTimeout(timers[c]);
    timers[c] = undefined;
  };
  return {
    show(color, text) {
      stop(color);
      set(color, { text, key: ++key });
      timers[color] = setTimeout(() => {
        timers[color] = undefined;
        set(color, null);
      }, ms);
    },
    clear() {
      stop('w');
      stop('b');
    },
  };
}
