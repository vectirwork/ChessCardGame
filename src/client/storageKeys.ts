// Clés du stockage du navigateur (localStorage et sessionStorage), en un seul endroit. Aucun import.
//
// Ce sont des identifiants techniques : NE JAMAIS LES RENOMMER (même pour une nouvelle marque). Une clé renommée
// efface en silence la préférence, la progression ou la partie en cours de chaque visiteur.
// Tables figées avec /* @__PURE__ */ : un morceau qui ne lit pas KEY_STORE (le client ne le lit pas) ne l'emporte pas.

/** ← Clés actuelles, inchangées. */
export const KEYS = /* @__PURE__ */ Object.freeze({
  // localStorage
  /** Son activé (« false » : coupé). */
  sound: 'sm:sound',
  /** Pseudo d'invité retenu. */
  guestName: 'sm:guestName',
  /** Historique local des parties (Mes parties, Analyse). */
  history: 'sm:parties',
  /** Le joueur a déjà ouvert une carte : l'invite au-dessus de la main ne s'affiche plus. */
  cardsSeen: 'sm:cartes:lues',
  /** Progression des problèmes. */
  puzzles: 'sm:problemes',
  /** Progression des leçons. */
  learn: 'sm:apprendre',
  /** Moteur d'analyse allumé. */
  analysisEngine: 'sm:analyse:moteur',
  /** Partie en cours de l'accueil contre l'Oracle (format v1, HOME.saveVersion). */
  homeGame: 'sm:odyssee:partie',
  /** Niveau de l'Oracle choisi sur l'accueil. */
  homeLevel: 'sm:odyssee:niveau',
  /** Préférence « Rois adverses classiques » (usePref(KEYS.classicKings) : PREF_PREFIX + CLASSIC_KINGS_PREF). */
  classicKings: 'sm:rois-classiques',

  // sessionStorage
  /** Dernier rechargement automatique après un échec de chargement (garde d'une minute). */
  reload: 'spellmate:reload',
  /** Introduction de l'accueil déjà vue pendant cette visite. */
  intro: 'sm:intro',
  /** Essai de la boutique en cours. */
  trial: 'sm:essai',
  /** Livraison attendue au retour d'un paiement. */
  delivery: 'sm:livraison',
});

export type StorageKey = keyof typeof KEYS;

/** Stockage de chaque clé : local (permanent) ou session (le temps de l'onglet). */
export const KEY_STORE: Readonly<Record<StorageKey, 'local' | 'session'>> = /* @__PURE__ */ Object.freeze({
  sound: 'local',
  guestName: 'local',
  history: 'local',
  cardsSeen: 'local',
  puzzles: 'local',
  learn: 'local',
  analysisEngine: 'local',
  homeGame: 'local',
  homeLevel: 'local',
  classicKings: 'local',
  reload: 'session',
  intro: 'session',
  trial: 'session',
  delivery: 'session',
});

/** Préfixe des préférences locales (l'ancien usePref de store.tsx l'ajoutait au nom : 'rois-classiques' → 'sm:rois-classiques'). */
export const PREF_PREFIX = 'sm:';

/** Événement de la page qui prévient les autres composants d'une écriture (storage.ts). */
export const STORED_EVENT = 'sm:stored';
