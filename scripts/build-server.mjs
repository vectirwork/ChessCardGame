// Compile le serveur (et le thread de l'IA) en JavaScript pour la production.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/index.ts', 'src/server/bot-worker.ts'],
  outdir: 'dist/server',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
