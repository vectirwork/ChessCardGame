// Promesses des packs (« et les prochains offerts ») tenues au démarrage du serveur : honorPackPromises, appelée juste
// après les migrations (src/server/index.ts). Le serveur construit est lancé avec --migrate-only (migrations, promesses,
// puis arrêt), avant et après l'écriture d'achats anciens en base.
//   npm run build && node test/shop-promises.mjs                       # base PGlite jetable
//   DATABASE_URL=postgres://… node test/shop-promises.mjs              # PostgreSQL (données de test laissées en base)
// Vérifie : un Grimoire des sorts payé reçoit Laurier et Écarlate ; le Grimoire complet reçoit aussi les trois nouveaux
// échiquiers, jamais de roi ; un achat en attente, échoué ou remboursé ne reçoit rien ; un objet déjà possédé garde sa
// source ; un second démarrage ne fait rien.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'dist/server/index.js');
const url = process.env.DATABASE_URL ?? '';
const dir = url ? null : mkdtempSync(path.join(tmpdir(), 'spellmate-promesses-'));

/** Démarre le serveur construit le temps des migrations et des promesses ; renvoie sa sortie. */
function boot() {
  const r = spawnSync(process.execPath, [server, '--migrate-only'], {
    cwd: root,
    env: { ...process.env, ...(dir ? { DATA_DIR: dir } : {}) },
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(r.status, 0, `le serveur doit démarrer puis s'arrêter (--migrate-only) :\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/** Base partagée avec le serveur (jamais ouverte en même temps que lui avec PGlite). */
async function open() {
  if (url) {
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    return { query: async (t, p) => (await c.query(t, p)).rows, close: () => c.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create(path.join(dir, 'db'));
  return { query: async (t, p) => (await db.query(t, p)).rows, close: () => db.close() };
}

// Contenus d'avant les nouveautés : Grimoire des sorts à 5 sorts, Grimoire complet à 5 sorts et 4 échiquiers.
const OLD_SKINS = ['skin:inferno', 'skin:neon', 'skin:celestial', 'skin:void', 'skin:sakura'];
const OLD_ALL = [...OLD_SKINS, 'board:marble', 'board:obsidian', 'board:jade', 'board:ruby'];
const NEW_SKINS = ['skin:laurier', 'skin:ecarlate'];
const NEW_BOARDS = ['board:grille', 'board:horizon', 'board:ciel'];

try {
  boot();
  console.log('✓ serveur construit : migrations appliquées sur une base', url ? 'PostgreSQL' : 'PGlite jetable');

  const stamp = Date.now().toString(36);
  let db = await open();
  const users = {};
  for (const who of ['ana', 'ben', 'chloe', 'dan', 'eve', 'fred']) {
    const [u] = await db.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, 'x') RETURNING id`,
      [`${who}-${stamp}@test.fr`, `${who}_${stamp}`],
    );
    users[who] = u.id;
  }
  /** Achat ancien ; s'il a été payé, ses objets ont été livrés avec sa source (comme fulfillPurchase). */
  async function purchase(who, productId, items, status) {
    const [p] = await db.query(
      `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status)
       VALUES ($1, $2, $3, 'stripe', 999, 'eur', $4) RETURNING id`,
      [users[who], productId, items, status],
    );
    if (status === 'paid') {
      await db.query(
        `INSERT INTO user_items (user_id, item_id, source) SELECT $1::uuid, it, $3::text FROM unnest($2::text[]) AS it`,
        [users[who], items, `purchase:${p.id}`],
      );
    }
    return p.id;
  }
  const ana = await purchase('ana', 'pack:skins', OLD_SKINS, 'paid');
  const ben = await purchase('ben', 'pack:all', OLD_ALL, 'paid');
  await purchase('chloe', 'pack:skins', OLD_SKINS, 'pending');
  await purchase('dan', 'pack:all', OLD_ALL, 'refunded');
  await purchase('eve', 'pack:skins', OLD_SKINS, 'failed');
  await purchase('fred', 'pack:skins', OLD_SKINS, 'paid');
  const laurier = await purchase('fred', 'skin:laurier', ['skin:laurier'], 'paid');
  await db.close();

  const out = boot();
  assert.match(out, /Promesses des packs : 8 objet\(s\) livré\(s\)/, `journal du démarrage :\n${out}`);

  db = await open();
  const owned = async who =>
    (await db.query('SELECT item_id, source FROM user_items WHERE user_id = $1 ORDER BY item_id', [users[who]]));
  const ids = async who => (await owned(who)).map(r => r.item_id);
  assert.deepEqual(await ids('ana'), [...OLD_SKINS, ...NEW_SKINS].sort(), 'Grimoire des sorts : Laurier et Écarlate offerts');
  assert.ok((await owned('ana')).every(r => r.source === `purchase:${ana}`), 'source : l’achat du pack (son remboursement les retire)');
  assert.deepEqual(await ids('ben'), [...OLD_ALL, ...NEW_SKINS, ...NEW_BOARDS].sort(), 'Grimoire complet : nouveaux sorts et échiquiers');
  assert.ok(!(await ids('ben')).some(i => i.startsWith('king:')), 'Grimoire complet : jamais de roi');
  assert.ok((await owned('ben')).every(r => r.source === `purchase:${ben}`));
  assert.deepEqual(await ids('chloe'), [], 'achat en attente : rien');
  assert.deepEqual(await ids('dan'), [], 'achat remboursé : rien');
  assert.deepEqual(await ids('eve'), [], 'achat échoué : rien');
  const fred = await owned('fred');
  assert.deepEqual(fred.map(r => r.item_id), [...OLD_SKINS, ...NEW_SKINS].sort());
  assert.equal(fred.find(r => r.item_id === 'skin:laurier').source, `purchase:${laurier}`, 'un objet déjà possédé garde sa source');
  console.log('✓ démarrage : Grimoire des sorts → Laurier et Écarlate ; Grimoire complet → aussi Grille, Horizon et Carte du ciel, sans roi');
  console.log('✓ achats en attente, échoués et remboursés : rien ; objet déjà possédé : source gardée');
  const before = (await db.query('SELECT count(*)::int AS n FROM user_items'))[0].n;
  await db.close();

  const again = boot();
  assert.doesNotMatch(again, /Promesses des packs/, 'second démarrage : aucune livraison');
  db = await open();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM user_items'))[0].n, before, 'second démarrage : rien de plus');
  await db.close();
  console.log('✓ second démarrage : rien de plus (idempotent)');
  console.log('\nPromesses des packs : tous les tests sont passés.');
} finally {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
