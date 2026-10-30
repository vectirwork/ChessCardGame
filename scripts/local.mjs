// Lancement local en une commande : npm run local
// Construit le site si besoin, crée une clé secrète locale, puis démarre le serveur avec la base intégrée (dossier data/).
// Fonctionne sous Windows, macOS et Linux ; seul Node.js 22 (ou plus récent) est nécessaire.
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
process.chdir(root);
const port = process.env.PORT ?? '3000';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

const built = existsSync('dist/server/index.js') && existsSync('dist/client/index.html');
if (!built || newest('src') > statSync('dist/server/index.js').mtimeMs || process.argv.includes('--rebuild')) {
  console.log('Construction du site (environ 30 secondes)…');
  const r = spawnSync(npm, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

mkdirSync('data', { recursive: true });
const secretFile = path.join('data', 'secret.key');
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('hex'));

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: port,
  PUBLIC_URL: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  SECRET_KEY: process.env.SECRET_KEY ?? readFileSync(secretFile, 'utf8').trim(),
  DATA_DIR: process.env.DATA_DIR ?? 'data',
  PAYMENTS_MODE: process.env.PAYMENTS_MODE ?? (process.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo'),
  TRUST_PROXY: process.env.TRUST_PROXY ?? 'false',
};
console.log(`\nSpellmate démarre sur http://localhost:${port}  (Ctrl+C pour arrêter, données dans data/)\n`);
const child = spawn(process.execPath, ['dist/server/index.js'], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
