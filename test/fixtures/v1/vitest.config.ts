// Configuration Vitest du générateur des témoins v1 (test/fixtures/v1/generer.ts) : npm run temoins.
// Le générateur n'est pas un test du dépôt : il n'est lancé que par cette configuration, jamais par npm test.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Fuseau imposé : les dates des en-têtes PGN (pgnDate) se lisent en heure locale. Sans cela, les témoins pgn/* changent
// hors de UTC−11 à UTC+11 (Nouvelle-Zélande en été : UTC+13). Les processus de Vitest héritent de la variable.
process.env.TZ = 'UTC';

export default defineConfig({
  root: ROOT,
  test: {
    include: ['test/fixtures/v1/generer.ts'],
    testTimeout: 300_000,
    env: { TZ: 'UTC' },
    // Les champs ajoutés et les écarts voulus s'affichent même quand la vérification passe.
    silent: false,
  },
});
