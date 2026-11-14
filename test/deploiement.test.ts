// Déploiement de production (deploy/, docker-compose.yml, src/server/index.ts) :
// - la configuration de production du dépôt passe parseEnv sans erreur, telle que le conteneur la reçoit : .env
//   assemblé par deploy/update.sh (deploy/production.env, secrets générés sur le serveur, jeton d'état), puis la clé
//   `environment` de docker-compose.yml (qui l'emporte sur env_file), et l'ENV du Dockerfile ;
// - `--check-config` vérifie la configuration (et les règles) sans ouvrir la base : code 0 si elle est bonne, 1 sinon ;
// - deploy/update.sh le lance dans la nouvelle image entre la construction et `docker compose up` : une configuration
//   refusée arrête le déploiement avant de remplacer la version en ligne (relecture finale, lot 9f).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/server/config';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

/** Fichier d'environnement (KEY=valeur par ligne, commentaires #), comme `env_file` de Compose. */
function envFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2];
  }
  return out;
}

/** Interpolation de Compose : ${VAR}, ${VAR:-défaut} (vide ou absente : le défaut). */
const interpolate = (v: string, vars: Record<string, string>) =>
  v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_, k: string, d?: string) => (vars[k] ? vars[k] : d ?? ''));

/** Clé `environment` du service `app` de docker-compose.yml (forme « CLÉ: valeur »), interpolée avec ces variables. */
function composeEnvironment(vars: Record<string, string>): Record<string, string> {
  const yml = read('docker-compose.yml');
  const block = /\n  app:\n[\s\S]*?\n    environment:\n((?: {6}.*\n)+)/.exec(yml);
  expect(block, 'services.app.environment introuvable dans docker-compose.yml').not.toBeNull();
  const out: Record<string, string> = {};
  for (const line of block![1].split('\n')) {
    const m = /^ {6}([A-Z_]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = interpolate(m[2].replace(/^"(.*)"$/, '$1'), vars);
  }
  return out;
}

/** ENV de l'image (Dockerfile, étape finale). */
function dockerfileEnv(): Record<string, string> {
  const lines = read('Dockerfile').split('\n').filter(l => /^ENV /.test(l));
  const last = lines.at(-1)!.replace(/^ENV /, '');
  return Object.fromEntries(last.split(/\s+/).map(kv => kv.split('=') as [string, string]));
}

describe('configuration de production du dépôt', () => {
  it('telle que le conteneur la reçoit (update.sh, docker-compose.yml, Dockerfile) : aucune erreur de parseEnv', () => {
    // .env assemblé par update.sh : production.env, secrets générés (openssl rand -hex 24 et -hex 32), jeton d'état.
    const dotenv = {
      ...envFile(read('deploy/production.env')),
      POSTGRES_PASSWORD: 'a'.repeat(48),
      SECRET_KEY: 'b'.repeat(64),
      STATUS_TOKEN: 'jeton',
    };
    const env = { ...dockerfileEnv(), ...dotenv, ...composeEnvironment(dotenv) };
    expect(env).toMatchObject({ NODE_ENV: 'production', PORT: '3000', TRUST_PROXY: 'true', PUBLIC_URL: 'https://chess-powers.com' });
    const { config, errors } = parseEnv(env);
    expect(errors).toEqual([]);
    expect(config).toMatchObject({ isProd: true, port: 3000, trustProxy: 1, publicUrl: 'https://chess-powers.com', payments: 'off', appName: 'Spellmate' });
    expect(config.databaseUrl).toBe(`postgres://spellmate:${'a'.repeat(48)}@db:5432/spellmate`);
  });

  it('TRUST_PROXY : "true" sans valeur dans .env (comme avant), la valeur de .env sinon', () => {
    expect(composeEnvironment({ DOMAIN: 'x.fr' }).TRUST_PROXY).toBe('true');
    expect(composeEnvironment({ DOMAIN: 'x.fr', TRUST_PROXY: '' }).TRUST_PROXY).toBe('true');
    expect(composeEnvironment({ DOMAIN: 'x.fr', TRUST_PROXY: '2' }).TRUST_PROXY).toBe('2');
  });
});

describe('deploy/update.sh', () => {
  it('vérifie la configuration dans la nouvelle image entre la construction et le remplacement de la version en ligne', () => {
    const sh = read('deploy/update.sh');
    expect(sh).toMatch(/^set -euo pipefail$/m);
    const at = (re: RegExp) => {
      const m = re.exec(sh);
      expect(m, String(re)).not.toBeNull();
      return m!.index;
    };
    const build = at(/^\$COMPOSE build --pull app$/m);
    const check = at(/^\$COMPOSE run --rm --no-deps -T app node dist\/server\/index\.js --check-config$/m);
    const up = at(/^\$COMPOSE up -d --remove-orphans$/m);
    expect(build).toBeLessThan(check);
    expect(check).toBeLessThan(up);
    // La commande lancée est bien celle de l'image (CMD du Dockerfile), avec le drapeau en plus.
    expect(read('Dockerfile')).toContain('CMD ["node", "dist/server/index.js"]');
  });
});

describe('--check-config', () => {
  /** Lance src/server/index.ts avec ces variables et ces arguments, dans un dossier vide (rien ne doit y être créé). */
  function run(vars: Record<string, string>, args: string[]) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'spellmate-check-'));
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('FEATURE_') && !['NODE_ENV', 'SPELLMATE_TEST_RULES', 'DATABASE_URL'].includes(k)),
      );
      // Port peu courant : si le serveur démarrait quand même (régression), il n'occuperait pas celui d'un autre.
      const port = String(40_000 + Math.floor(Math.random() * 20_000));
      const r = spawnSync(
        process.execPath, ['--import', path.join(ROOT, 'node_modules/tsx/dist/esm/index.mjs'), path.join(ROOT, 'src/server/index.ts'), ...args],
        { cwd: dir, encoding: 'utf8', timeout: 30_000, env: { ...env, PORT: port, DATA_DIR: path.join(dir, 'base'), ...vars } },
      );
      return { ...r, created: readdirSync(dir) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const PROD = { NODE_ENV: 'production', SECRET_KEY: 'x'.repeat(64), PUBLIC_URL: 'https://chess-powers.com', PAYMENTS_MODE: 'off' };

  it('configuration valable : code 0, sans ouvrir la base ni écouter de port', () => {
    const r = run(PROD, ['--check-config']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Règles des nouvelles parties : ');
    expect(r.stdout).toContain('Configuration vérifiée (--check-config)');
    expect(r.stdout).not.toMatch(/prêt sur/);
    expect(r.created).toEqual([]);
  }, 60_000);

  it('configuration refusée : code 1 avec le message (comme au démarrage)', () => {
    const r = run({ ...PROD, PAYMENTS_MODE: 'Stripe', SMTP_PORT: '587x' }, ['--check-config']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Configuration invalide : arrêt.');
    expect(r.stderr).toContain('- PAYMENTS_MODE : stripe, demo ou off est attendu.');
    expect(r.stderr).toContain('- SMTP_PORT : un nombre entier est attendu.');
    expect(r.stdout).not.toContain('Configuration vérifiée');
    expect(r.created).toEqual([]);
  }, 60_000);
});
