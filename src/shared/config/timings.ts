// Durées couplées entre le client et le serveur (ou réglées sur une animation). Aucun import.
// Les délais propres au serveur (premier coup, ménage, relais…) sont dans src/server/settings.ts.

/**
 * Pouvoirs (R10) : temps rendu à la pendule pour une cinématique (lancement, arrivée d'un Présage, Rituel). Doit
 * couvrir l'animation du sort côté client.
 */
export const CINEMATIC_MS = 1200;

/** Temps laissé à l'animation d'une carte de l'IA avant qu'elle ne joue son coup (ou sa carte suivante). */
export const BOT_CARD_PAUSE_MS = 2300;

/**
 * Délai maximal d'une décision de l'IA (fil de calcul du serveur ou Web Worker du navigateur) ; au-delà, la demande
 * échoue (serveur) ou se calcule sur le fil principal (navigateur). Doit rester au-dessus du plus long temps de
 * réflexion (BOT_PROFILES, 1500 ms pour l'Archimage).
 */
export const BOT_TIMEOUT_MS = 20_000;
