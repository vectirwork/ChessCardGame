// Chargement de Playwright pour les scripts de captures et de bout en bout (rois, échiquiers, sorts, boutique,
// identite, textes-pages…), factorisé : chaque script recopiait la même recherche.
//
// Ordre de recherche : la variable PLAYWRIGHT_PATH (dossier du paquet ou fichier d'entrée), puis node_modules du
// dépôt (paquet « playwright »), puis /opt/node-tools/node_modules/playwright (machines des agents).
// Chromium tourne en rendu logiciel (SwiftShader) : `LANCEMENT` porte l'option qui l'autorise pour WebGL.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Chemins essayés, dans l'ordre. */
export function cheminsPlaywright() {
  return [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
}

/** Le module Playwright (erreur claire s'il est introuvable). */
export function chargerPlaywright() {
  const essais = [];
  for (const p of cheminsPlaywright()) {
    try {
      return require(p);
    } catch (e) {
      essais.push(`${p} : ${e.code ?? e.message}`);
    }
  }
  throw new Error(
    `Playwright introuvable (${essais.join(' ; ')}). Installez-le (npx playwright install chromium) ou indiquez son ` +
      'dossier dans PLAYWRIGHT_PATH.',
  );
}

/** Options de lancement de Chromium communes aux bancs (WebGL en rendu logiciel). */
export const LANCEMENT = { args: ['--enable-unsafe-swiftshader'] };

/** Lance Chromium avec les options des bancs (options supplémentaires fusionnées, arguments ajoutés). */
export async function lancerChromium(extra = {}) {
  const { chromium } = chargerPlaywright();
  return chromium.launch({ ...LANCEMENT, ...extra, args: [...LANCEMENT.args, ...(extra.args ?? [])] });
}

/** Tailles d'écran des témoins (identite, textes-pages, coque). */
export const ECRANS = {
  '1280x720': { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  '1440x900': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  '375x667': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  '360x640': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
