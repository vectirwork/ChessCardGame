// Compile le serveur (et le thread de l'IA) en JavaScript pour la production.
//
// Constante de build `__SM__.marque` (BRAND.name), comme dans le site (vite.config.ts, BuildConstants) : un module
// partagé qui la lit (src/shared/lessons.ts) se charge aussi dans le serveur construit. Sous tsx (npm run dev) elle
// n'existe pas : le serveur n'importe toujours pas lessons.ts (garde-fou de test/lessons.test.ts).
import { build } from 'esbuild';

/** BRAND (src/shared/config/brand.ts, sans import à l'exécution), lu à travers esbuild sans rien écrire. */
async function readBrand() {
  const r = await build({
    entryPoints: ['src/shared/config/brand.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
  return mod.BRAND;
}

const BRAND = await readBrand();

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
  define: { '__SM__.marque': JSON.stringify(BRAND.name) },
});
