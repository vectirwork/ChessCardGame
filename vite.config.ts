/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Polices : aucun préchargement. Mesuré (4G simulée, CPU ÷4, médianes de 3) : précharger les 5 polices du premier écran
// (124 ko) retardait l'accueil (LCP 5,1 s contre 4,6 s sans), elles prennent la bande passante du JavaScript sans
// lequel rien ne s'affiche. Inter est de toute façon demandée tôt (texte du corps).

/**
 * Fichiers précompressés à côté des originaux (`.br` brotli 11 et `.gz` gzip 9) : le serveur les envoie tels quels
 * (src/server/site.ts). Brotli 11 donne 15 à 20 % de moins que la compression à la volée (brotli 4), sans coût CPU par
 * requête. Les formats déjà compressés (woff2, webp, png, jpg) ne sont pas touchés.
 */
function precompress(): Plugin {
  const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|webmanifest|txt)$/;
  let outDir = 'dist/client';
  const br = promisify(brotliCompress);
  const gz = promisify(gzip);
  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])));
    return nested.flat();
  }
  return {
    name: 'spellmate:precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await walk(outDir)).filter(f => COMPRESSIBLE.test(f) && !f.includes(`${path.sep}.vite${path.sep}`));
      await Promise.all(
        files.map(async file => {
          if ((await stat(file)).size < 1024) return;
          const data = await readFile(file);
          const [b, g] = await Promise.all([
            br(data, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
            gz(data, { level: 9 }),
          ]);
          if (b.length < data.length * 0.95) await writeFile(`${file}.br`, b);
          if (g.length < data.length * 0.95) await writeFile(`${file}.gz`, g);
        }),
      );
    },
  };
}

/** Tests lents (projet « lent ») et paramétrés par les réglages (projet « matrice ») ; le reste est « rapide ». */
const TESTS_LENTS = ['test/bot.test.ts'];
const TESTS_MATRICE = ['test/regles-matrice.test.ts', 'test/**/*.matrice.test.ts'];

export default defineConfig({
  plugins: [react(), precompress()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
    // dist/client/.vite/manifest.json : le serveur y lit le code et le CSS de chaque page pour les précharger dès le
    // HTML (src/server/site.ts). Jamais servi (dossier caché).
    manifest: true,
  },
  // Tests (Vitest) : trois projets. npm test les lance tous ; npm run test:rapide pendant le travail.
  // - rapide : toute la suite, sauf ce qui suit ;
  // - matrice : tests paramétrés par les réglages (SPELLMATE_MATRICE, test/helpers/matrice.ts) ;
  // - lent : l'IA à pleine profondeur (bot.test.ts).
  // Les témoins (test/fixtures/v1/generer.ts) ont leur propre configuration : npm run temoins.
  test: {
    projects: [
      { extends: true, test: { name: 'rapide', include: ['test/**/*.test.ts'], exclude: [...TESTS_LENTS, ...TESTS_MATRICE] } },
      { extends: true, test: { name: 'matrice', include: TESTS_MATRICE } },
      { extends: true, test: { name: 'lent', include: TESTS_LENTS } },
    ],
  },
});
