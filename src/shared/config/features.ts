// Fonctions activables du site (interrupteurs). Aucun import.
//
// Défauts ici ; le serveur les fusionne avec les variables d'environnement FEATURE_* (FEATURE_SHOP=0 coupe la
// boutique : src/server/settings.ts) et refuse ce qui est coupé. Le client les lit par useFeature(k)
// (src/client/store.tsx) : d'abord dans <meta name="sm-features">, posée par le serveur seulement si une valeur
// diffère des défauts (aucun changement du HTML au défaut), puis dans /api/me.

export interface Features {
  /** Parties classées (file classée, classement, Elo). */
  ranked: boolean;
  /** File amicale (partie rapide sans classement). */
  friendlyQueue: boolean;
  /** Invitations (« Défier un ami »). */
  invites: boolean;
  /** Parties contre l'IA créées depuis la page Jouer. */
  botGames: boolean;
  /** Jeu sans compte (invités). */
  guestPlay: boolean;
  /** Parties en direct (/live et spectateurs). */
  live: boolean;
  /** Accueil : deux visiteurs récents appariés sur l'échiquier du haut. */
  homeDuel: boolean;
  /** Accueil : l'IA joue pour un visiteur qui ne joue plus (relais). */
  homeRelay: boolean;
  /** Page des problèmes. */
  puzzles: boolean;
  /** Page Apprendre (leçons). */
  learn: boolean;
  /** Page Analyse. */
  analysis: boolean;
  /** Boutique (rayons, prix, achats). */
  shop: boolean;
  /** Création de nouvelles parties (false : mode maintenance, les parties en cours continuent). */
  newGames: boolean;
}

export type FeatureKey = keyof Features;

/** ← Défauts : tout est ouvert. */
export const FEATURES: Readonly<Features> = /* @__PURE__ */ Object.freeze({
  ranked: true,
  friendlyQueue: true,
  invites: true,
  botGames: true,
  guestPlay: true,
  live: true,
  homeDuel: true,
  homeRelay: true,
  puzzles: true,
  learn: true,
  analysis: true,
  shop: true,
  newGames: true,
});

export const FEATURE_KEYS = /* @__PURE__ */ Object.keys(FEATURES) as FeatureKey[];

/** Nom de la variable d'environnement d'un interrupteur : homeDuel → FEATURE_HOME_DUEL. */
export function featureEnvName(k: FeatureKey): string {
  return `FEATURE_${k.replace(/[A-Z]/g, c => `_${c}`).toUpperCase()}`;
}

/**
 * Valeurs d'interrupteurs reçues (meta sm-features, /api/me) fusionnées avec les défauts : seules les clés connues à
 * valeur booléenne sont prises, le reste est ignoré. Renvoie `base` lui-même si rien ne change (aucun rendu de plus).
 */
export function mergeFeatures(base: Readonly<Features>, x: unknown): Readonly<Features> {
  if (!x || typeof x !== 'object') return base;
  let out: Features | null = null;
  // Clés de `base` (celles de FEATURES) : pas de FEATURE_KEYS ici, pour ne pas l'ajouter au paquet principal.
  for (const k in base) {
    const v = (x as Record<string, unknown>)[k];
    if (typeof v === 'boolean' && v !== base[k as FeatureKey]) (out ??= { ...base })[k as FeatureKey] = v;
  }
  return out ?? base;
}

/** Interrupteurs qui diffèrent des défauts (contenu de la meta sm-features) ; vide au défaut. */
export function featuresDiff(f: Readonly<Features>): Partial<Features> {
  const out: Partial<Features> = {};
  for (const k of FEATURE_KEYS) if (f[k] !== FEATURES[k]) out[k] = f[k];
  return out;
}
