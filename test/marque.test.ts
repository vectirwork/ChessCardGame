// Marque et fichiers construits (lot 6) : au réglage par défaut, `vite build` produit index.html, le manifeste et
// robots.txt identiques octet pour octet à ceux d'avant la passe (noms de fichiers hachés normalisés). La liste des
// <link rel="modulepreload"> du paquet principal fait partie de la comparaison : un module qui changerait de morceau
// (api-*.js fondu dans le paquet principal, protocol-*.js tiré par le client…) la change.
//
// Le build est fait ici, dans un dossier temporaire, avec la vraie configuration (vite.config.ts) : quelques secondes.
// NODE_ENV vaut « test » sous Vitest : il est mis à « production » le temps du build (sinon React construit sa
// version de développement, jsx-dev-runtime).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

/** Empreintes des noms de fichiers construits (8 caractères) remplacées : seule la structure compte. */
const normaliser = (html: string) => html.replace(/-[A-Za-z0-9_-]{8}\.(js|css)\b/g, '-‹h›.$1');

/** dist/client/index.html au commit 7274072 (avant le lot 6), empreintes normalisées. */
const INDEX_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Spellmate · Les échecs ont appris la magie</title>
    <meta name="description" content="Jouez aux échecs avec trois cartes de pouvoir qui changent la partie pour les deux camps : Trêve, Lune de sang, Mur de glace… Gratuit, en ligne, sans inscription, contre l’IA ou un ami." />
    <meta name="theme-color" content="#04050f" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Spellmate · Les échecs ont appris la magie" />
    <meta property="og:description" content="Une vraie partie d’échecs, trois cartes de pouvoir visibles des deux joueurs, un sort par tour. Gratuit, en ligne, avec ou sans compte." />
    <meta property="og:image" content="/og.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="module" crossorigin src="/assets/index-‹h›.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/jsx-runtime-‹h›.js">
    <link rel="modulepreload" crossorigin href="/assets/api-‹h›.js">
    <link rel="stylesheet" crossorigin href="/assets/index-‹h›.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

/** dist/client/manifest.webmanifest au commit 7274072. */
const MANIFESTE = `{
  "name": "Spellmate",
  "short_name": "Spellmate",
  "description": "Les échecs ont appris la magie : une vraie partie, trois cartes de pouvoir. Gratuit, sans compte.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#04050f",
  "theme_color": "#04050f",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "lang": "fr"
}
`;

/** dist/client/robots.txt au commit 7274072. */
const ROBOTS = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /compte
Disallow: /admin
`;

describe('construction au réglage par défaut : fichiers identiques', () => {
  let out = '';
  beforeAll(async () => {
    out = mkdtempSync(path.join(os.tmpdir(), 'spellmate-marque-'));
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'production', logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
    } finally {
      vi.unstubAllEnvs();
    }
  }, 120_000);
  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });
  const lire = (f: string) => readFileSync(path.join(out, f), 'utf8');

  it('index.html (empreintes normalisées), modulepreload du paquet principal compris', () => {
    expect(normaliser(lire('index.html'))).toBe(INDEX_HTML);
  });
  it('manifeste', () => {
    expect(lire('manifest.webmanifest')).toBe(MANIFESTE);
  });
  it('robots.txt', () => {
    expect(lire('robots.txt')).toBe(ROBOTS);
  });
});
