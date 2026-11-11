// Configuration Vitest du générateur des témoins v1 (test/fixtures/v1/generer.ts) : npm run temoins.
// Le générateur n'est pas un test du dépôt : il n'est lancé que par cette configuration, jamais par npm test.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export default defineConfig({
  root: ROOT,
  test: {
    include: ['test/fixtures/v1/generer.ts'],
    testTimeout: 300_000,
  },
});
