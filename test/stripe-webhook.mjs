// Test du webhook Stripe (signature, livraison idempotente, remboursement) contre un serveur en mode Stripe.
// node test/stripe-webhook.mjs http://localhost:3100 whsec_test
import assert from 'node:assert/strict';
import pg from 'pg';
import Stripe from 'stripe';

const [BASE = 'http://localhost:3100', SECRET = 'whsec_test'] = process.argv.slice(2);
const stripe = new Stripe('sk_test_dummy');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://spellmate:spellmate@localhost:5432/spellmate' });
await db.connect();

const stamp = Date.now().toString(36);
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `buyer-${stamp}@test.fr`, username: `buyer_${stamp}`, password: 'motdepasse123', acceptTerms: true }),
});
const { user } = await reg.json();
const { rows: [p] } = await db.query(
  `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status, email, provider_ref)
   VALUES ($1, 'pack:skins', $2, 'stripe', 999, 'eur', 'pending', $3, $4) RETURNING id`,
  [user.id, ['skin:inferno', 'skin:neon'], `buyer-${stamp}@test.fr`, `cs_test_${stamp}`],
);

const send = async (event, secret = SECRET) => {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
  return res.status;
};
const completed = {
  id: 'evt_1', object: 'event', type: 'checkout.session.completed',
  data: { object: { id: `cs_test_${stamp}`, object: 'checkout.session', payment_status: 'paid', payment_intent: `pi_${stamp}`, metadata: { purchaseId: p.id } } },
};
assert.equal(await send(completed, 'whsec_faux'), 400, 'signature falsifiée refusée');
assert.equal(await send(completed), 200);
assert.equal(await send(completed), 200, 'rejeu accepté sans double livraison');
let items = (await db.query('SELECT item_id FROM user_items WHERE user_id = $1 ORDER BY item_id', [user.id])).rows.map(r => r.item_id);
assert.deepEqual(items, ['skin:inferno', 'skin:neon']);
const st = (await db.query('SELECT status, payment_ref FROM purchases WHERE id = $1', [p.id])).rows[0];
assert.deepEqual(st, { status: 'paid', payment_ref: `pi_${stamp}` });
console.log('✓ webhook signé : livraison, signature falsifiée refusée, idempotence');

await db.query(`UPDATE users SET equipped_skin = 'skin:neon' WHERE id = $1`, [user.id]);
assert.equal(await send({ id: 'evt_2', object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_1', object: 'charge', refunded: true, payment_intent: `pi_${stamp}` } } }), 200);
items = (await db.query('SELECT item_id FROM user_items WHERE user_id = $1', [user.id])).rows;
assert.equal(items.length, 0, 'objets retirés après remboursement');
const u = (await db.query('SELECT equipped_skin FROM users WHERE id = $1', [user.id])).rows[0];
assert.equal(u.equipped_skin, 'skin:arcane', 'skin remboursé déséquipé');
console.log('✓ remboursement : objets retirés et skin déséquipé');
await db.end();
