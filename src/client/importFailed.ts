/**
 * Échec du chargement d'un module (code d'une page, ou composant paresseux comme l'échiquier des lieux de l'accueil) :
 * « Failed to fetch dynamically imported module » (Chromium), « error loading dynamically imported module » (Firefox),
 * « Importing a module script failed. » (Safari), « Unable to preload CSS for … » (feuille du module, Vite).
 * Partagé par les limites d'erreur qui rechargent alors le site (PageBoundary d'App.tsx, DecorBoundary de
 * odyssee/OdysseeHome.tsx) : à garder sans import, il est dans le paquet principal.
 */
export const importFailed = (e: unknown) => /dynamically imported|a module script|preload CSS/.test(String(e));
