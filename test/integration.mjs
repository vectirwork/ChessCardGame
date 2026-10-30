// Test d'intégration du serveur en marche : node test/integration.mjs [http://localhost:3000]
// Parcourt : inscription, invitation sans compte, coups, cartes, abandon, revanche, IA, boutique (mode démo).
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const sq = s => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);

class Client {
  cookies = new Map();
  async api(path, body, method) {
    const res = await fetch(BASE + '/api' + path, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  connect() {
    this.updates = [];
    this.socket = io(BASE, { transports: ['websocket'], extraHeaders: { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
    this.socket.on('game:update', u => this.updates.push(u));
    return new Promise(r => this.socket.on('connect', r));
  }
  emit(ev, payload) {
    return new Promise(r => this.socket.emit(ev, payload, r));
  }
  async waitFor(pred, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const u = this.updates.find(pred);
      if (u) return u;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Mise à jour attendue non reçue');
  }
}

const step = (name) => console.log('✓', name);
const stamp = Date.now().toString(36);

// 1. Inscription d'Alice
const alice = new Client();
let r = await alice.api('/auth/register', { email: `alice-${stamp}@test.fr`, username: `alice_${stamp}`, password: 'motdepasse123', acceptTerms: true });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.user.rating, 1200);
r = await alice.api('/auth/register', { email: `alice-${stamp}@test.fr`, username: `autre_${stamp}`, password: 'motdepasse123', acceptTerms: true });
assert.equal(r.status, 409);
r = await alice.api('/me');
assert.ok(r.data.user, 'session active après inscription');
step('inscription, doublon refusé, session');

// 2. Alice crée une invitation, Bob (invité sans compte) la rejoint
r = await alice.api('/games', { mode: 'invite', tc: '5+0', color: 'w' });
const gameId = r.data.id;
await alice.connect();
let j = await alice.emit('game:join', { id: gameId });
assert.equal(j.view.status, 'waiting');
assert.equal(j.view.you, 'w');
const bob = new Client();
await bob.api('/me');
await bob.connect();
j = await bob.emit('game:join', { id: gameId });
assert.equal(j.needName, true, 'un invité doit choisir un pseudo');
j = await bob.emit('game:join', { id: gameId, name: 'Bob le Fou' });
assert.equal(j.view.status, 'active');
assert.equal(j.view.you, 'b');
assert.ok(j.view.state.hands.w.every(h => h.card === null), "les cartes adverses sont cachées");
assert.ok(j.view.state.hands.b.every(h => h.card), 'ses propres cartes sont visibles');
await alice.waitFor(u => u.event.type === 'start');
step('invitation par lien, invité avec pseudo, cartes adverses cachées');

// 3. Coups
let a = await alice.emit('game:move', { id: gameId, from: sq('e2'), to: sq('e5') });
assert.equal(a.ok, false, 'coup illégal refusé');
a = await bob.emit('game:move', { id: gameId, from: sq('e7'), to: sq('e5') });
assert.equal(a.ok, false, 'pas son tour');
a = await alice.emit('game:move', { id: gameId, from: sq('e2'), to: sq('e4') });
assert.ok(a.ok);
await bob.waitFor(u => u.event.type === 'move' && u.view.state.ply === 1);
a = await bob.emit('game:move', { id: gameId, from: sq('e7'), to: sq('e5') });
assert.ok(a.ok);
const afterTwo = await alice.waitFor(u => u.view.state.ply === 2);
assert.equal(afterTwo.view.clock.running, 'w', 'la pendule démarre après le premier coup de chacun');
step('coups légaux, coups illégaux refusés, pendule');

// 4. Une carte d'Alice (n'importe laquelle de jouable)
const hand = afterTwo.view.state.hands.w;
let played = false;
const targetsFor = {
  time_warp: [], gravity: [], rewind: [], ice_wall: [sq('e3')], freeze: [sq('b8')], shield: [sq('g1')], lightning: [sq('a7')],
  knight_leap: [sq('f1')], phase: [sq('d1')], swap: [sq('b1'), sq('g1')], revive: [],
};
await new Promise(res => setTimeout(res, 1100)); // la pendule des Blancs tourne
for (let i = 0; i < hand.length && !played; i++) {
  const card = hand[i].card;
  if (card === 'revive' || card === 'rewind') continue;
  a = await alice.emit('game:card', { id: gameId, index: i, targets: targetsFor[card] });
  if (a.ok) {
    played = card;
    const u = await bob.waitFor(x => x.event.type === 'card');
    assert.equal(u.event.info.card, card);
    assert.equal(u.view.state.hands.w[i].card, card, 'une carte jouée est révélée');
    assert.ok(u.view.clock.w <= 300_000 - 1000, `la pendule tient compte du temps écoulé (${u.view.clock.w})`);
    a = await alice.emit('game:card', { id: gameId, index: (i + 1) % 3, targets: [] });
    assert.equal(a.ok, false, 'une seule carte par tour');
  }
}
step(`carte jouée et révélée à l'adversaire (${played || 'aucune jouable dans cette main'})`);

// 5. Abandon et revanche
a = await bob.emit('game:resign', { id: gameId });
assert.ok(a.ok);
const end = await alice.waitFor(u => u.event.type === 'end');
assert.deepEqual(end.view.state.result, { winner: 'w', reason: 'resign' });
assert.ok(end.view.state.hands.b.every(h => h.card), 'les mains sont révélées en fin de partie');
const redirect = new Promise(res => alice.socket.on('game:redirect', res));
await alice.emit('game:rematch', { id: gameId });
await bob.emit('game:rematch', { id: gameId });
const rd = await redirect;
assert.equal(rd.from, gameId);
j = await alice.emit('game:join', { id: rd.to });
assert.equal(j.view.you, 'b', 'les couleurs sont inversées à la revanche');
step('abandon, mains révélées, revanche avec couleurs inversées');

// 6. Partie contre l'IA : elle répond seule
r = await alice.api('/games', { mode: 'bot', tc: 'none', color: 'w', level: 1 });
const botGame = r.data.id;
alice.updates = [];
await alice.emit('game:join', { id: botGame });
await alice.emit('game:move', { id: botGame, from: sq('d2'), to: sq('d4') });
const botReply = await alice.waitFor(u => u.event.type === 'move' && u.event.color === 'b', 15000);
assert.ok(botReply);
step("partie contre l'IA : réponse reçue");

// 7. Boutique en mode démo
r = await alice.api('/shop/checkout', { productId: 'skin:inferno', waiver: false });
assert.equal(r.status, 400, 'renonciation obligatoire');
r = await alice.api('/shop/checkout', { productId: 'skin:inferno', waiver: true });
if (r.status === 200 && r.data.url.startsWith('/boutique/demo/')) {
  const pid = r.data.url.split('/').pop();
  r = await alice.api(`/shop/demo/${pid}/complete`, {});
  assert.ok(r.data.user.items.includes('skin:inferno'));
  r = await alice.api(`/shop/demo/${pid}/complete`, {});
  r = await alice.api('/account/purchases');
  assert.equal(r.data.purchases.filter(p => p.product_id === 'skin:inferno').length, 1, 'livraison idempotente');
  r = await alice.api('/account/equip', { itemId: 'skin:inferno' });
  assert.equal(r.data.user.equippedSkin, 'skin:inferno');
  r = await alice.api('/account/equip', { itemId: 'skin:void' });
  assert.equal(r.status, 403, 'impossible d’équiper un skin non acheté');
  step('achat démo, livraison idempotente, équipement');
} else {
  step(`boutique : mode ${r.data?.url ?? r.status} (test démo ignoré)`);
}

// 8. Sécurité : émote piégée ignorée, droits d'administrateur réservés aux e-mails vérifiés
const seen = [];
await bob.emit('game:join', { id: rd.to });
bob.socket.on('game:emote', e => seen.push(e));
alice.socket.emit('game:emote', { id: rd.to, key: '__proto__' });
alice.socket.emit('game:emote', { id: rd.to, key: 'gg' });
await new Promise(res => setTimeout(res, 400));
assert.deepEqual(seen.map(e => e.key), ['gg'], 'seules les émotes connues sont relayées');
const mallory = new Client();
r = await mallory.api('/auth/register', { email: 'admin@spellmate.test', username: `mallory_${stamp}`, password: 'motdepasse123', acceptTerms: true });
if (r.status === 200) {
  assert.equal(r.data.user.isAdmin, false, "un e-mail d'administrateur non vérifié ne donne aucun droit");
  r = await mallory.api('/admin/overview');
  assert.equal(r.status, 403);
  await mallory.api('/account', { password: 'motdepasse123' }, 'DELETE');
}
step('émote piégée ignorée, administration réservée aux e-mails vérifiés');

// 9. Compte : profil public, export, suppression
r = await alice.api(`/users/alice_${stamp}`);
assert.equal(r.status, 200);
r = await alice.api('/account/export');
assert.ok(r.data.profile && !('password_hash' in r.data.profile));
r = await alice.api('/account', { password: 'mauvais' }, 'DELETE');
assert.equal(r.status, 400);
r = await alice.api('/account', { password: 'motdepasse123' }, 'DELETE');
assert.equal(r.status, 200);
r = await alice.api('/me');
assert.equal(r.data.user, null);
step('profil public, export RGPD sans mot de passe, suppression du compte');

alice.socket.close();
bob.socket.close();
console.log('\nTous les tests d’intégration sont passés.');
process.exit(0);
