// Serveur jetable : lance le site construit (node dist/server/index.js) sur une base PGlite neuve et un port libre,
// exécute une commande contre lui, puis arrête tout et rend le code de sortie de la commande.
//
//   node scripts/serveur-jetable.mjs [options] -- <commande> [arguments…]
//   node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}
//   SPELLMATE_TEST_RULES='{"cardsPerPlayer":5}' node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}
//   node scripts/serveur-jetable.mjs --racine=/home/user/spellmate-ref -- node test/integration.mjs {base}   (site d'avant)
//   node scripts/serveur-jetable.mjs                      (sans commande : le serveur reste ouvert jusqu'à Ctrl+C)
//
// Dans la commande, {base} est remplacé par l'adresse du serveur (http://localhost:<port>) et {port} par le port ;
// la commande reçoit aussi SPELLMATE_BASE et SPELLMATE_PORT dans son environnement.
//
// Options :
//   --racine=<dossier>  dossier qui contient dist/ et package.json (défaut : la racine du dépôt). Rien n'est construit
//                       ici : lancez npm run build avant.
//   --port=<n>          port imposé (défaut : un port libre) ;
//   --env=CLE=valeur    variable de plus pour le serveur (répétable) : FEATURE_*, PAYMENTS_MODE=off… ;
//   --garder            garde la base et le journal du serveur (dossier affiché) ;
//   --silencieux        n'affiche pas le journal du serveur en cas d'échec.
//
// Le serveur tourne en production (NODE_ENV=production, comme en ligne), paiements en démo, clé secrète aléatoire de
// 64 caractères, base PGlite dans un dossier temporaire (DATABASE_URL est retirée). SPELLMATE_TEST_RULES (réglages des
// tests de bout en bout, lu par le serveur à partir du lot 3) est transmise ; comme le serveur la refuse en production,
// le serveur jetable passe alors en NODE_ENV=test avec SERVE_BUILD=true : il sert toujours le site construit.
//
// Le serveur n'est déclaré prêt que si c'est bien le sien qui répond : le processus lancé ici est vivant, son journal
// annonce l'écoute sur le port (« … prêt sur … (port <n>, … », src/server/index.ts) et /api/health répond. Un --port
// déjà occupé est refusé (code 2) ; un port tiré au hasard et pris entre-temps est retiré (3 essais).
//
// Express (module send) refuse de servir un fichier dont un dossier du chemin commence par un point (« .claude ») :
// si la racine est dans un tel dossier, dist/ et package.json sont copiés dans un dossier temporaire (node_modules y est
// lié) avant le lancement.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const opts = sep < 0 ? argv : argv.slice(0, sep);
const commande = sep < 0 ? [] : argv.slice(sep + 1);
const opt = name => opts.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = name => opts.includes(`--${name}`);

const inconnues = opts.filter(a => !/^--(racine|port|env)=/.test(a) && !['--garder', '--silencieux'].includes(a));
if (inconnues.length) {
  console.error(`serveur-jetable : option inconnue ${inconnues.join(' ')} (voir l'en-tête du script).`);
  process.exit(2);
}

const racine = path.resolve(opt('racine') ?? DEPOT);
if (!existsSync(path.join(racine, 'dist/server/index.js')) || !existsSync(path.join(racine, 'dist/client/index.html'))) {
  console.error(`serveur-jetable : ${racine}/dist incomplet. Lancez d'abord npm run build.`);
  process.exit(2);
}

/** Un dossier du chemin commence par un point : Express refuserait de servir les fichiers. */
const cheminPointe = p => p.split(path.sep).some(s => s.startsWith('.') && s !== '.' && s !== '..');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'spellmate-jetable-'));
const dataDir = path.join(tmp, 'base');
const journal = path.join(tmp, 'serveur.log');

let cwd = racine;
if (cheminPointe(racine)) {
  cwd = path.join(tmp, 'site');
  cpSync(path.join(racine, 'dist'), path.join(cwd, 'dist'), { recursive: true });
  cpSync(path.join(racine, 'package.json'), path.join(cwd, 'package.json'));
  const nm = existsSync(path.join(racine, 'node_modules')) ? path.join(racine, 'node_modules') : path.join(DEPOT, 'node_modules');
  symlinkSync(nm, path.join(cwd, 'node_modules'), 'dir');
}

/** Un port libre tiré par le système. */
function portAuHasard() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Vrai si personne n'écoute sur ce port (toutes interfaces, comme le serveur). */
function estLibre(port) {
  return new Promise(resolve => {
    const s = createServer();
    s.unref();
    s.once('error', () => resolve(false));
    s.listen(port, () => s.close(() => resolve(true)));
  });
}

const portImpose = opt('port') === undefined ? null : Number(opt('port'));
if (portImpose !== null && !(Number.isInteger(portImpose) && portImpose > 0 && portImpose < 65536)) {
  console.error(`serveur-jetable : --port invalide (${opt('port')}).`);
  process.exit(2);
}
if (portImpose !== null && !(await estLibre(portImpose))) {
  console.error(`serveur-jetable : le port ${portImpose} est déjà occupé (un autre serveur répondrait à la place du site construit).`);
  process.exit(2);
}

const extra = {};
for (const a of opts.filter(a => a.startsWith('--env='))) {
  const kv = a.slice('--env='.length);
  const i = kv.indexOf('=');
  if (i <= 0) {
    console.error(`serveur-jetable : --env attend CLE=valeur (${a}).`);
    process.exit(2);
  }
  extra[kv.slice(0, i)] = kv.slice(i + 1);
}

let sortie = '';
let serveur = null;
let mort = null;
let port = 0;
let base = '';
let env = {};

const garder = chunk => {
  sortie += chunk;
  if (sortie.length > 2_000_000) sortie = sortie.slice(-1_000_000);
};

/** Lance le serveur sur `p` ; `mort` passe au code de sortie quand il s'arrête. */
function lancer(p) {
  port = p;
  base = `http://localhost:${port}`;
  env = { ...process.env };
  delete env.DATABASE_URL;
  Object.assign(env, {
    NODE_ENV: 'production',
    PORT: String(port),
    PUBLIC_URL: base,
    SECRET_KEY: randomBytes(32).toString('hex'),
    DATA_DIR: dataDir,
    PAYMENTS_MODE: 'demo',
    TRUST_PROXY: 'false',
    ...extra,
  });
  if (env.SPELLMATE_TEST_RULES) {
    env.NODE_ENV = 'test';
    env.SERVE_BUILD = 'true';
  }
  sortie = '';
  mort = null;
  const enfant = spawn(process.execPath, ['dist/server/index.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  enfant.stdout.on('data', garder);
  enfant.stderr.on('data', garder);
  enfant.on('exit', code => {
    if (enfant === serveur) mort = code ?? 1;
  });
  serveur = enfant;
}

function finJournal() {
  if (has('silencieux')) return;
  console.error('--- journal du serveur (fin) ---');
  console.error(sortie.split('\n').slice(-30).join('\n'));
}

/**
 * Prêt : notre processus est vivant, il a annoncé l'écoute sur notre port, et /api/health répond. Rend 'pret',
 * 'occupe' (le port a été pris entre-temps : EADDRINUSE) ou 'echec'.
 */
async function pret() {
  const annonce = new RegExp(`prêt sur .*\\(port ${port}\\b`);
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    if (mort !== null) return /EADDRINUSE/.test(sortie) ? 'occupe' : 'echec';
    if (annonce.test(sortie)) {
      try {
        const r = await fetch(base + '/api/health');
        if (r.ok && mort === null) return 'pret';
      } catch {
        // pas encore prêt
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return 'echec';
}

async function arreter() {
  if (serveur && mort === null) {
    serveur.kill('SIGTERM');
    const t0 = Date.now();
    while (mort === null && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 100));
    if (mort === null) serveur.kill('SIGKILL');
  }
  writeFileSync(journal, sortie);
  if (has('garder')) console.error(`serveur-jetable : base et journal gardés dans ${tmp}`);
  else rmSync(tmp, { recursive: true, force: true });
}

let etat = 'echec';
for (let essai = 1; essai <= (portImpose === null ? 3 : 1); essai++) {
  lancer(portImpose ?? (await portAuHasard()));
  etat = await pret();
  if (etat !== 'occupe') break;
  rmSync(dataDir, { recursive: true, force: true });
}
if (etat !== 'pret') {
  console.error(`serveur-jetable : le serveur n'a pas démarré (${base}${etat === 'occupe' ? ' : port pris par un autre processus' : ''}).`);
  finJournal();
  await arreter();
  process.exit(3);
}
console.error(`serveur-jetable : ${base} (base ${dataDir}${env.NODE_ENV === 'test' ? ', NODE_ENV=test' : ''})`);

if (!commande.length) {
  console.error('serveur-jetable : aucune commande, Ctrl+C pour arrêter.');
  await new Promise(r => {
    process.once('SIGINT', r);
    process.once('SIGTERM', r);
  });
  await arreter();
  process.exit(0);
}

if (mort !== null) {
  console.error(`serveur-jetable : le serveur s'est arrêté avant la commande (code ${mort}).`);
  finJournal();
  await arreter();
  process.exit(3);
}
const remplacer = a => a.replaceAll('{base}', base).replaceAll('{port}', String(port));
const [cmd, ...args] = commande.map(remplacer);
const enfant = spawn(cmd, args, {
  stdio: 'inherit',
  env: { ...process.env, SPELLMATE_BASE: base, SPELLMATE_PORT: String(port) },
  shell: process.platform === 'win32',
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => enfant.kill(sig));
const code = await new Promise(r => {
  enfant.on('exit', (c, signal) => r(c ?? (signal ? 1 : 0)));
  enfant.on('error', e => {
    console.error(`serveur-jetable : ${e.message}`);
    r(127);
  });
});
if (code !== 0) finJournal();
await arreter();
process.exit(code);

