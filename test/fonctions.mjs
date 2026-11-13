// Fonctions activables (FEATURE_*) sur un vrai serveur : boutique et parties classées, ouvertes ou coupées.
//   node scripts/serveur-jetable.mjs -- node test/fonctions.mjs {base}                                   (au défaut)
//   node scripts/serveur-jetable.mjs --env=FEATURE_SHOP=0 -- node test/fonctions.mjs {base} shop=0
//   node scripts/serveur-jetable.mjs --env=FEATURE_RANKED=0 -- node test/fonctions.mjs {base} ranked=0
// Cadences archivées (TIME_CONTROLS, `archived: true`) : refusées à la création et dans la file, encore libellées ;
// au défaut aucune ne l'est (lancer sur une copie qui en archive une pour l'éprouver).
// Les arguments `cle=0|1` disent ce que le serveur doit avoir reçu (FEATURE_*) ; sans argument, tout est ouvert (défaut).
// Vérifie :
// - /api/me : les interrupteurs annoncés sont ceux attendus ; le HTML ne porte la meta sm-features que hors défaut ;
// - boutique coupée (FEATURE_SHOP=0) : POST /api/shop/checkout, GET /api/shop/demo/:id et POST /api/shop/demo/:id/complete
//   répondent 503 « La boutique est fermée. » (connecté ou non), GET /api/shop/catalog reste en 200 ; ouverte : achat de
//   démonstration et livraison ;
// - classé coupé (FEATURE_RANKED=0) : la file classée refuse (code 'feature-off', message en français), la file amicale
//   et le classement restent ouverts ; ouvert : la file classée accepte.
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { Client, baseUrl, compte } from './lib/client.mjs';

const args = process.argv.slice(2);
const BASE = baseUrl(args.find(a => a.startsWith('http')));
/** Interrupteurs attendus : tout ouvert, sauf ceux passés en argument (`shop=0`). */
const attendu = { shop: true, ranked: true };
for (const a of args.filter(x => /^\w+=[01]$/.test(x))) {
  const [k, v] = a.split('=');
  attendu[k] = v === '1';
}
const step = name => console.log('✓', name);
const stamp = Date.now().toString(36);
const FERMEE = { error: 'La boutique est fermée.' };

// 1. Interrupteurs annoncés, meta du HTML
const visiteur = new Client(BASE);
let r = await visiteur.api('/me');
assert.equal(r.status, 200);
for (const [k, v] of Object.entries(attendu)) assert.equal(r.data.features?.[k], v, `/api/me : features.${k}`);
const html = await (await fetch(`${BASE}/`)).text();
const coupees = Object.entries(attendu).filter(([, v]) => !v);
if (coupees.length) for (const [k] of coupees) assert.match(html, new RegExp(`<meta name="sm-features" content='[^']*"${k}":false`), `meta sm-features : ${k}`);
else assert.ok(!html.includes('sm-features'), 'au défaut, aucune meta sm-features');
step(`interrupteurs annoncés (${JSON.stringify(attendu)}), meta du HTML ${coupees.length ? 'présente' : 'absente'}`);

// 2. Boutique
const acheteur = await compte(BASE, { email: `fonctions-${stamp}@test.fr`, username: `fonctions_${stamp}` });
r = await acheteur.api('/shop/catalog');
assert.equal(r.status, 200, 'catalogue lisible');
assert.ok(Array.isArray(r.data.items) && r.data.items.length > 0 && Array.isArray(r.data.products), 'catalogue : objets et produits');
if (attendu.shop) {
  r = await acheteur.api('/shop/checkout', { productId: 'skin:inferno', waiver: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const pid = r.data.url.split('/').pop();
  assert.equal((await acheteur.api(`/shop/demo/${pid}`)).status, 200, 'page de démonstration');
  r = await acheteur.api(`/shop/demo/${pid}/complete`, {});
  assert.equal(r.status, 200);
  assert.ok(r.data.user.items.includes('skin:inferno'), 'livré');
  step('boutique ouverte : commande, page de démonstration, livraison');
} else {
  for (const c of [acheteur, visiteur]) {
    r = await c.api('/shop/checkout', { productId: 'skin:inferno', waiver: true });
    assert.deepEqual([r.status, r.data], [503, FERMEE], 'POST /api/shop/checkout');
    r = await c.api('/shop/demo/inconnu');
    assert.deepEqual([r.status, r.data], [503, FERMEE], 'GET /api/shop/demo/:id');
    r = await c.api('/shop/demo/inconnu/complete', {});
    assert.deepEqual([r.status, r.data], [503, FERMEE], 'POST /api/shop/demo/:id/complete');
  }
  assert.equal((await fetch(`${BASE}/boutique`)).status, 200, 'la page de la boutique (fermée) est servie');
  step('boutique coupée : commande et caisse de démonstration en 503 « La boutique est fermée. », catalogue en 200');
}

// 3. Parties classées
const joueur = await compte(BASE, { email: `classe-${stamp}@test.fr`, username: `classe_${stamp}` });
await joueur.connect();
r = await joueur.emit('queue:join', { tc: '5+0', rated: true });
if (attendu.ranked) {
  assert.deepEqual(r, { ok: true }, 'file classée ouverte');
  joueur.socket.emit('queue:leave');
} else {
  assert.deepEqual(r, { ok: false, error: 'Les parties classées sont fermées pour le moment.', code: 'feature-off' }, 'file classée coupée');
}
r = await joueur.emit('queue:join', { tc: '5+0', rated: false });
assert.deepEqual(r, { ok: true }, 'file amicale ouverte');
joueur.socket.emit('queue:leave');
r = await joueur.api('/leaderboard');
assert.equal(r.status, 200, 'classement lisible');
step(attendu.ranked ? 'parties classées ouvertes : files classée et amicale' : 'parties classées coupées : file classée refusée (feature-off), file amicale et classement ouverts');

// 4. Cadences archivées (TIME_CONTROLS, `archived`) : plus proposées (création, file), encore libellées ; les autres le
//    sont. Au défaut, aucune n'est archivée : la vérification porte alors sur les cadences proposées.
{
  const { TIME_CONTROLS, OFFERED_CONTROLS, QUICK_CONTROLS, tcLabel } = await tsImport('../src/shared/protocol.ts', import.meta.url);
  const archivees = TIME_CONTROLS.filter(t => t.archived).map(t => t.id);
  for (const id of archivees) {
    assert.ok(tcLabel(id), `libellé de la cadence archivée ${id}`);
    r = await joueur.api('/games', { mode: 'invite', tc: id, color: 'w', name: 'Archive' });
    assert.equal(r.status, 400, `cadence archivée ${id} refusée à la création`);
    r = await joueur.emit('queue:join', { tc: id, rated: false });
    assert.equal(r.ok, false, `cadence archivée ${id} refusée dans la file`);
  }
  for (const id of OFFERED_CONTROLS) {
    r = await joueur.api('/games', { mode: 'invite', tc: id, color: 'w', name: 'Proposée' });
    assert.equal(r.status, 200, `cadence proposée ${id} acceptée : ${JSON.stringify(r.data)}`);
    await joueur.emit('game:abort', { id: r.data.id });
  }
  r = await joueur.emit('queue:join', { tc: QUICK_CONTROLS[0], rated: false });
  assert.deepEqual(r, { ok: true }, `file : ${QUICK_CONTROLS[0]}`);
  joueur.socket.emit('queue:leave');
  step(archivees.length
    ? `cadences archivées (${archivees.join(', ')}) : refusées à la création et dans la file, encore libellées ; ${OFFERED_CONTROLS.length} proposées acceptées`
    : `aucune cadence archivée ; les ${OFFERED_CONTROLS.length} cadences proposées sont acceptées`);
}

joueur.close();
console.log('\nFonctions activables : tout est conforme.');
process.exit(0);
