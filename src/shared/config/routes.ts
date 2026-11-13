// Pages du site : chemin, module de code, interrupteur ; titre et indexation à part. Aucun import à l'exécution.
//
// Lu par :
// - le client (src/client/App.tsx) : une <Route> par entrée de ROUTES, avec le chargeur de son module (import()
//   littéral, un morceau de code par module ; le compilateur exige un chargeur pour chaque module de PAGE_MODULES) ;
//   une entrée dont l'interrupteur est coupé disparaît (page introuvable) ;
// - le serveur (src/server/site.ts) : motif de chaque chemin, code de la page préchargé dès le HTML, titre initial
//   (ROUTE_TITLES), adresse canonique, statut 404 pour un chemin inconnu ou une page coupée ;
// - la construction (vite.config.ts) : robots.txt (NOT_INDEXED).
// Les liens des menus (Layout.tsx) et de la page introuvable portent leur propre interrupteur ; test/routes.test.ts
// vérifie qu'il couvre celui de leur page.
//
// Le paquet principal (App.tsx) n'emporte que ROUTES : titres et indexation, lus par le serveur et la construction
// seulement, sont dans des tables séparées (chaque octet du paquet principal compte).
//
// Ajouter une page : une entrée dans ROUTES, son module dans PAGE_MODULES et son chargeur dans App.tsx (le compilateur
// le demande), ses propriétés dans PageProps si elle en prend, son titre dans ROUTE_TITLES si la page en pose un.
// Chemins à la syntaxe de React Router (« :param »).

import type { FeatureKey } from './features';

/** Modules de src/client/pages qui portent une page (un morceau de code chacun). */
export const PAGE_MODULES = [
  'Home', 'Play', 'GameRoute', 'Rules', 'Shop', 'DemoCheckout', 'Auth', 'Account', 'Profile', 'Leaderboard', 'Admin',
  'Learn', 'Puzzles', 'Analysis', 'MyGames', 'Live', 'Legal', 'NotFound',
] as const;
export type PageModule = (typeof PAGE_MODULES)[number];

/**
 * Propriétés des pages qui en prennent (les autres modules n'en prennent aucune). Vérifiées par le compilateur dans
 * ROUTES et contre le composant de la page (App.tsx).
 */
export interface PageProps {
  Auth: { mode: 'login' | 'register' | 'forgot' | 'reset' | 'verify' };
  Legal: { page: 'cgu' | 'cgv' | 'privacy' | 'mentions' };
}
/** Propriétés du module de page M (objet vide s'il n'en prend aucune). */
export type PropsOf<M extends PageModule> = M extends keyof PageProps ? PageProps[M] : object;

/** Une page de ROUTES, pour le module M. */
interface RouteOf<M extends PageModule> {
  /** Chemin (React Router) : « /apprendre/:lesson ». */
  path: string;
  /** Module de src/client/pages qui affiche la page. */
  page: M;
  /** Propriétés passées à la page : obligatoires pour un module de PageProps, interdites sinon. */
  props?: M extends keyof PageProps ? PageProps[M] : never;
  /**
   * Interrupteur (FEATURES) : coupé, la page disparaît (page introuvable, 404). La boutique n'en a pas : coupée, elle
   * affiche elle-même sa page fermée (Shop.tsx, DemoCheckout.tsx) ; ses liens sont cachés (interrupteur des liens).
   */
  feature?: FeatureKey;
}
export type RouteDef = { [M in PageModule]: M extends keyof PageProps ? RouteOf<M> & { props: PageProps[M] } : RouteOf<M> }[PageModule];

/** ← Pages du site, dans l'ordre de recherche (la première qui correspond l'emporte). */
export const ROUTES: readonly RouteDef[] = [
  { path: '/', page: 'Home' },
  { path: '/jouer', page: 'Play' },
  { path: '/partie/:id', page: 'GameRoute' },
  { path: '/cartes', page: 'Rules' },
  { path: '/regles', page: 'Rules' },
  { path: '/boutique', page: 'Shop' },
  { path: '/boutique/demo/:id', page: 'DemoCheckout' },
  { path: '/connexion', page: 'Auth', props: { mode: 'login' } },
  { path: '/inscription', page: 'Auth', props: { mode: 'register' } },
  { path: '/mot-de-passe-oublie', page: 'Auth', props: { mode: 'forgot' } },
  { path: '/reinitialiser/:token', page: 'Auth', props: { mode: 'reset' } },
  { path: '/verifier/:token', page: 'Auth', props: { mode: 'verify' } },
  { path: '/compte', page: 'Account' },
  { path: '/joueur/:username', page: 'Profile' },
  { path: '/classement', page: 'Leaderboard', feature: 'ranked' },
  { path: '/admin', page: 'Admin' },
  { path: '/apprendre', page: 'Learn', feature: 'learn' },
  { path: '/apprendre/:lesson', page: 'Learn', feature: 'learn' },
  { path: '/problemes', page: 'Puzzles', feature: 'puzzles' },
  { path: '/problemes/:puzzle', page: 'Puzzles', feature: 'puzzles' },
  { path: '/analyse', page: 'Analysis', feature: 'analysis' },
  { path: '/analyse/:gameId', page: 'Analysis', feature: 'analysis' },
  { path: '/parties', page: 'MyGames' },
  { path: '/direct', page: 'Live', feature: 'live' },
  { path: '/cgu', page: 'Legal', props: { page: 'cgu' } },
  { path: '/cgv', page: 'Legal', props: { page: 'cgv' } },
  { path: '/confidentialite', page: 'Legal', props: { page: 'privacy' } },
  { path: '/mentions-legales', page: 'Legal', props: { page: 'mentions' } },
];

/**
 * Titre que pose chaque page (useTitle), repris dans le <title> du HTML servi : « Boutique » donne « Boutique ·
 * Spellmate ». Une page absente d'ici ne pose pas de titre fixe (accueil, Jouer, partie, ou titre tiré de ses
 * données : leçon, problème, profil) et le HTML garde le titre de l'accueil. Clé : chemin de ROUTES ; « * » : page
 * introuvable.
 */
export const ROUTE_TITLES: Readonly<Record<string, string>> = {
  '/cartes': 'Règles et cartes',
  '/regles': 'Règles et cartes',
  '/boutique': 'Boutique',
  '/boutique/demo/:id': 'Paiement simulé',
  '/connexion': 'Connexion',
  '/inscription': 'Créer un compte',
  '/mot-de-passe-oublie': 'Mot de passe oublié',
  '/reinitialiser/:token': 'Nouveau mot de passe',
  '/verifier/:token': 'Confirmation de l’e-mail',
  '/compte': 'Mon compte',
  '/classement': 'Classement',
  '/admin': 'Administration',
  '/apprendre': 'Apprendre',
  '/problemes': 'Problèmes',
  '/analyse': 'Analyse',
  '/analyse/:gameId': 'Analyse',
  '/parties': 'Mes parties',
  '/direct': 'Parties en direct',
  '/cgu': 'Conditions d’utilisation',
  '/cgv': 'Conditions de vente',
  '/confidentialite': 'Confidentialité',
  '/mentions-legales': 'Mentions légales',
  '*': 'Page introuvable',
};

/** Pages que les moteurs de recherche n'explorent pas (robots.txt, Disallow). */
export const NOT_INDEXED: readonly string[] = ['/compte', '/admin'];

/** La page est-elle servie avec ces interrupteurs ? */
export function routeOpen(r: RouteDef, features: Readonly<Record<FeatureKey, boolean>>): boolean {
  return !r.feature || features[r.feature];
}
