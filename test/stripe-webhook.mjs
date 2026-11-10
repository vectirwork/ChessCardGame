// Test du webhook Stripe (signature, livraison idempotente avec les objets promis d'un pack, équipement à la livraison,
// paiement expiré, remboursement partiel ignoré, remboursement)
// contre un serveur en mode Stripe, avec accès direct à sa base PostgreSQL.
// node test/stripe-webhook.mjs http://localhost:3100 whsec_test
// (serveur lancé avec PAYMENTS_MODE=stripe, STRIPE_SECRET_KEY=sk_test_…, STRIPE_WEBHOOK_SECRET=whsec_test et la même
// DATABASE_URL que ce script)
import assert from 'node:assert/strict';
import pg from 'pg';
import Stripe from 'stripe';

const [BASE = 'http://localhost:3100', SECRET = 'whsec_test'] = process.argv.slice(2);
const stripe = new Stripe('sk_test_dummy');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://spellmate:spellmate@localhost:5432/spellmate' });
await db.connect();

const stamp = Date.now().toString(36);
const email = `buyer-${stamp}@test.fr`;
const reg = await fetch(BASE + '/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, username: `buyer_${stamp}`, password: 'motdepasse123', acceptTerms: true }),
});
const { user } = await reg.json();

/** Achat en attente, comme le crée /api/shop/checkout avant la redirection vers Stripe. */
async function pending(productId, items, cents, ref, equip = false) {
  const { rows: [p] } = await db.query(
    `INSERT INTO purchases (user_id, product_id, items, provider, amount_cents, currency, status, email, provider_ref, equip)
     VALUES ($1, $2, $3, 'stripe', $4, 'eur', 'pending', $5, $6, $7) RETURNING id`,
    [user.id, productId, items, cents, email, ref, equip],
  );
  return p.id;
}
let n = 0;
const send = async (type, object, secret = SECRET) => {
  const payload = JSON.stringify({ id: `evt_${stamp}_${++n}`, object: 'event', type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
  return res.status;
};
const session = (purchaseId, ref, pi, paid = true) => ({
  id: ref, object: 'checkout.session', payment_status: paid ? 'paid' : 'unpaid', payment_intent: pi, metadata: { purchaseId },
});
const refund = pi => send('charge.refunded', { id: `ch_${pi}`, object: 'charge', refunded: true, payment_intent: pi });
const owned = async () => (await db.query('SELECT item_id FROM user_items WHERE user_id = $1 ORDER BY item_id', [user.id])).rows.map(r => r.item_id);
const equipped = async () =>
  (await db.query('SELECT equipped_king, equipped_board, equipped_skin FROM users WHERE id = $1', [user.id])).rows[0];
const purchase = async id => (await db.query('SELECT status, payment_ref FROM purchases WHERE id = $1', [id])).rows[0];
// Sorts promis par le Grimoire des sorts (tous les sorts premium du catalogue)
const SKINS = ['skin:celestial', 'skin:ecarlate', 'skin:inferno', 'skin:laurier', 'skin:neon', 'skin:sakura', 'skin:void'];

// 1. Livraison signée et idempotente. Grimoire des sorts créé avant l'ajout de sorts (2 sorts dans cet achat) et payé
// après : il livre aussi les sorts promis, notés dans l'achat.
const pack = await pending('pack:skins', ['skin:inferno', 'skin:neon'], 999, `cs_test_${stamp}`);
const completed = session(pack, `cs_test_${stamp}`, `pi_${stamp}`);
assert.equal(await send('checkout.session.completed', completed, 'whsec_faux'), 400, 'signature falsifiée refusée');
assert.equal(await send('checkout.session.completed', completed), 200);
assert.equal(await send('checkout.session.completed', completed), 200, 'rejeu accepté sans double livraison');
assert.deepEqual(await owned(), SKINS, 'pack ancien payé après la mise en ligne : tous les sorts promis');
assert.deepEqual(await purchase(pack), { status: 'paid', payment_ref: `pi_${stamp}` });
assert.deepEqual((await db.query('SELECT items FROM purchases WHERE id = $1', [pack])).rows[0].items.sort(), SKINS);
assert.equal((await equipped()).equipped_skin, 'skin:arcane', 'sans « équiper à la livraison » : rien n’est équipé');
console.log('✓ webhook signé : livraison (avec les sorts promis), signature falsifiée refusée, idempotence');

// 2. « Équiper à la livraison » (purchases.equip) : le webhook livre et équipe, sans retour du navigateur
const king = await pending('king:braise', ['king:braise'], 299, `cs_test_k_${stamp}`, true);
assert.equal(await send('checkout.session.completed', session(king, `cs_test_k_${stamp}`, `pi_k_${stamp}`)), 200);
assert.deepEqual(await equipped(), { equipped_king: 'king:braise', equipped_board: 'board:arcane', equipped_skin: 'skin:arcane' });
assert.deepEqual(await owned(), ['king:braise', ...SKINS]);
const cart = await pending('panier', ['king:astral', 'board:ciel'], 798, `cs_test_c_${stamp}`, true);
assert.equal(await send('checkout.session.completed', session(cart, `cs_test_c_${stamp}`, `pi_c_${stamp}`)), 200);
assert.deepEqual(await equipped(), { equipped_king: 'king:astral', equipped_board: 'board:ciel', equipped_skin: 'skin:arcane' });
console.log('✓ équiper à la livraison : roi seul, puis panier (roi et échiquier), équipés par le webhook');

// 3. Paiement expiré : l'achat échoue ; un « completed » tardif ne livre rien
// (un échiquier : les sorts sont tous déjà livrés par le Grimoire)
const late = await pending('board:horizon', ['board:horizon'], 399, `cs_test_x_${stamp}`, true);
assert.equal(await send('checkout.session.expired', session(late, `cs_test_x_${stamp}`, null, false)), 200);
assert.equal((await purchase(late)).status, 'failed');
assert.equal(await send('checkout.session.completed', session(late, `cs_test_x_${stamp}`, `pi_x_${stamp}`)), 200);
assert.ok(!(await owned()).includes('board:horizon'), 'achat échoué : rien livré');
assert.equal((await equipped()).equipped_board, 'board:ciel');
console.log('✓ paiement expiré : achat échoué, livraison tardive refusée');

// 4. Remboursement partiel (une ligne du panier) : rien n'est retiré ni déséquipé (avertissement dans le journal du
// serveur) ; l'achat reste payé
assert.equal(
  await send('charge.refunded', { id: `ch_pi_c_${stamp}`, object: 'charge', refunded: false, amount: 798, amount_refunded: 399, payment_intent: `pi_c_${stamp}` }),
  200,
);
assert.equal((await purchase(cart)).status, 'paid');
assert.deepEqual(await owned(), ['board:ciel', 'king:astral', 'king:braise', ...SKINS]);
assert.deepEqual(await equipped(), { equipped_king: 'king:astral', equipped_board: 'board:ciel', equipped_skin: 'skin:arcane' });
console.log('✓ remboursement partiel : rien retiré automatiquement, achat toujours payé');

// 5. Remboursement d'un roi équipé : le roi Arcane revient ; le reste ne bouge pas
await db.query(`UPDATE users SET equipped_king = 'king:braise' WHERE id = $1`, [user.id]);
assert.equal(await refund(`pi_k_${stamp}`), 200);
assert.deepEqual(await equipped(), { equipped_king: 'king:arcane', equipped_board: 'board:ciel', equipped_skin: 'skin:arcane' });
assert.deepEqual(await owned(), ['board:ciel', 'king:astral', ...SKINS]);
assert.equal((await purchase(king)).status, 'refunded');
console.log('✓ remboursement d’un roi équipé : roi Arcane rendu, échiquier possédé par ailleurs gardé');

// 6. Remboursement d'un pack dont un objet a été livré par sa promesse (même source) : retiré, déséquipé
await db.query(`UPDATE users SET equipped_skin = 'skin:laurier' WHERE id = $1`, [user.id]);
assert.equal(await refund(`pi_${stamp}`), 200);
assert.deepEqual(await owned(), ['board:ciel', 'king:astral'], 'objets du pack et de sa promesse retirés');
assert.deepEqual(await equipped(), { equipped_king: 'king:arcane', equipped_board: 'board:ciel', equipped_skin: 'skin:arcane' }, 'sorts promis déséquipés');
assert.equal(await refund(`pi_${stamp}`), 200, 'second remboursement sans effet');
assert.deepEqual(await owned(), ['board:ciel', 'king:astral']);
console.log('✓ remboursement d’un pack : objets de l’achat et de sa promesse retirés, sorts déséquipés');
await db.end();
