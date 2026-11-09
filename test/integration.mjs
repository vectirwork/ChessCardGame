// Test d'intégration du serveur en marche : node test/integration.mjs [http://localhost:3000]
// Parcourt : inscription, invitation sans compte, choix des cartes (décision D5 : réserve, secret jusqu'à la
// révélation, refus, idempotence, échéance de 45 s et complément au hasard), coups, mains visibles, carte jouée
// (catalogue Pouvoirs, identifiant 'climats', par défaut), choix du catalogue (Sans cartes ; Duel ramené aux Pouvoirs ;
// file amicale), abandon pendant le choix (annulation), revanche, IA, boutique (mode démo), rois (roi de l'IA ; en
// mode démo : achat, équipement, roi pris à l'assise et vu de tous, revanche).
// Durée : au moins 47 s (l'échéance du choix est attendue en parallèle des autres étapes).
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const sq = s => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);

// Les 8 Pouvoirs (src/shared/cards.ts, catalogue 'climats').
const POUVOIRS = ['hourglass', 'truce', 'blood_moon', 'ice_age', 'blast', 'ice_wall', 'rift', 'tide'];
/** Cartes annoncées (Présage) : l'effet est public avant son arrivée. */
const PRESAGE = ['hourglass', 'truce', 'blood_moon', 'ice_age', 'blast'];

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
    throw new Error(`Mise à jour attendue non reçue : ${pred}`);
  }
}

const step = (name) => console.log('✓', name);
const stamp = Date.now().toString(36);
const DRAFT_MS = 45_000;
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const validHand = (cards, pool) => cards.length === 3 && new Set(cards).size === 3 && cards.every(c => pool.includes(c));

// 0. Échéance du choix, lancée d'abord et vérifiée à la fin : Eve valide, Frank n'envoie qu'une sélection provisoire
const eve = new Client();
const frank = new Client();
await eve.api('/me');
await frank.api('/me');
let r = await eve.api('/games', { mode: 'invite', tc: '3+2', color: 'w', name: 'Eve' });
assert.equal(r.status, 200, JSON.stringify(r.data));
const lateId = r.data.id;
await eve.connect();
await frank.connect();
await eve.emit('game:join', { id: lateId, name: 'Eve' });
const lateJoin = await frank.emit('game:join', { id: lateId, name: 'Frank' });
const lateStart = Date.now();
assert.ok(lateJoin.view.draft, 'choix ouvert');
const EVE = ['hourglass', 'ice_age', 'rift'];
assert.ok((await eve.emit('game:draft', { id: lateId, cards: EVE })).ok);
assert.ok((await frank.emit('game:draft', { id: lateId, cards: ['tide', 'blast'], confirm: false })).ok, 'sélection provisoire');
const lateMine = await frank.emit('game:join', { id: lateId });
assert.deepEqual(lateMine.view.draft.mine, ['tide', 'blast'], 'la sélection provisoire est gardée (reconnexion)');
assert.deepEqual(lateMine.view.draft.chosen, { w: true, b: false });
step('échéance : partie lancée, un joueur valide, l’autre garde une sélection provisoire (vérifiée à la fin)');

// 1. Inscription d'Alice
const alice = new Client();
r = await alice.api('/auth/register', { email: `alice-${stamp}@test.fr`, username: `alice_${stamp}`, password: 'motdepasse123', acceptTerms: true });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.user.rating, 1200);
r = await alice.api('/auth/register', { email: `alice-${stamp}@test.fr`, username: `autre_${stamp}`, password: 'motdepasse123', acceptTerms: true });
assert.equal(r.status, 409);
r = await alice.api('/me');
assert.ok(r.data.user, 'session active après inscription');
step('inscription, doublon refusé, session');

// 2. Alice crée une invitation (mode miroir demandé par un ancien client : ignoré), Bob (invité sans compte) la rejoint
r = await alice.api('/games', { mode: 'invite', tc: '5+0', color: 'w', mirror: true });
const gameId = r.data.id;
await alice.connect();
let j = await alice.emit('game:join', { id: gameId });
assert.equal(j.view.status, 'waiting');
assert.equal(j.view.you, 'w');
assert.equal(j.view.draft, null, 'pas de choix avant l’arrivée de l’adversaire');
assert.equal(j.view.mirror, false, 'mode miroir ignoré');
const bob = new Client();
await bob.api('/me');
await bob.connect();
j = await bob.emit('game:join', { id: gameId });
assert.equal(j.needName, true, 'un invité doit choisir un pseudo');
j = await bob.emit('game:join', { id: gameId, name: 'Bob le Fou' });
assert.equal(j.view.status, 'active');
assert.equal(j.view.you, 'b');
assert.equal(j.view.state.catalog, 'climats', 'catalogue Pouvoirs par défaut');
assert.ok(j.view.draft, 'phase de choix ouverte');
assert.deepEqual(j.view.draft.pool, POUVOIRS, 'réserve : les huit pouvoirs');
assert.equal(j.view.draft.count, 3);
assert.ok(j.view.draft.msLeft > DRAFT_MS - 3000 && j.view.draft.msLeft <= DRAFT_MS, `échéance de 45 s (${j.view.draft.msLeft})`);
assert.deepEqual(j.view.draft.chosen, { w: false, b: false });
assert.deepEqual(j.view.state.hands, { w: [], b: [] }, 'mains vides pendant le choix');
assert.equal(j.view.firstMoveDeadline, null, 'pas de délai du premier coup pendant le choix');
assert.equal(j.view.clock.running, null, 'pendules à l’arrêt');
const start = await alice.waitFor(u => u.event.type === 'start');
assert.ok(start.view.draft, 'Alice voit le choix s’ouvrir');
const spectator = new Client();
await spectator.api('/me');
await spectator.connect();
const js = await spectator.emit('game:join', { id: gameId, sit: false });
assert.equal(js.view.you, null);
assert.deepEqual(js.view.draft.mine, [], 'le spectateur ne voit aucun choix');
step('invitation par lien, invité avec pseudo, choix des cartes ouvert (8 pouvoirs, 45 s, mains vides, pendules à l’arrêt)');

// 2 bis. Choix des cartes : refus, secret jusqu'à la révélation, idempotence, révélation
let a = await alice.emit('game:move', { id: gameId, from: sq('e2'), to: sq('e4') });
assert.equal(a.ok, false, 'aucun coup pendant le choix');
for (const cards of [['ice_wall', 'rift'], ['ice_wall', 'ice_wall', 'tide'], ['ice_wall', 'rift', 'freeze'], ['ice_wall', 'rift', 'tide', 'truce'], 'tide', [1, 2, 3]]) {
  a = await alice.emit('game:draft', { id: gameId, cards });
  assert.equal(a.ok, false, `choix invalide refusé : ${JSON.stringify(cards)}`);
}
a = await spectator.emit('game:draft', { id: gameId, cards: ['ice_wall', 'rift', 'tide'] });
assert.equal(a.ok, false, 'un spectateur ne choisit pas');
assert.ok((await alice.emit('game:draft', { id: gameId, cards: ['truce'], confirm: false })).ok, 'sélection provisoire');
const ALICE = ['ice_wall', 'blood_moon', 'tide'];
assert.ok((await alice.emit('game:draft', { id: gameId, cards: ALICE })).ok);
const bobSees = await bob.waitFor(u => u.event.type === 'draft');
assert.equal(bobSees.event.color, 'w');
assert.deepEqual(bobSees.view.draft.chosen, { w: true, b: false }, 'Bob sait qu’Alice a choisi');
assert.deepEqual(bobSees.view.draft.mine, [], 'Bob ne voit pas les cartes d’Alice');
assert.deepEqual(bobSees.view.state.hands, { w: [], b: [] }, 'mains toujours vides');
const specSees = await spectator.waitFor(u => u.event.type === 'draft');
assert.deepEqual(specSees.view.draft.mine, []);
assert.deepEqual(specSees.view.state.hands, { w: [], b: [] });
const aliceSees = await alice.waitFor(u => u.event.type === 'draft');
assert.deepEqual(aliceSees.view.draft.mine, ALICE, 'Alice voit ses cartes');
assert.ok((await alice.emit('game:draft', { id: gameId, cards: ALICE })).ok, 'même choix renvoyé : accepté (idempotent)');
assert.ok((await alice.emit('game:draft', { id: gameId, cards: [ALICE[2], ALICE[0], ALICE[1]] })).ok, 'même choix dans un autre ordre');
a = await alice.emit('game:draft', { id: gameId, cards: ['rift', 'truce', 'blast'] });
assert.equal(a.ok, false, 'un autre choix après validation est refusé');
const BOB = ['rift', 'truce', 'blast'];
assert.ok((await bob.emit('game:draft', { id: gameId, cards: BOB })).ok);
const rev = await alice.waitFor(u => u.event.type === 'reveal');
assert.deepEqual(rev.event.auto, [], 'aucun complément au hasard');
assert.equal(rev.view.draft, null, 'choix terminé');
assert.deepEqual(rev.view.state.hands.w, ALICE.map(card => ({ card, used: false })), 'main blanche révélée, dans l’ordre choisi');
assert.deepEqual(rev.view.state.hands.b, BOB.map(card => ({ card, used: false })), 'main noire révélée');
assert.ok(rev.view.firstMoveDeadline, 'le délai du premier coup démarre à la révélation');
const specRev = await spectator.waitFor(u => u.event.type === 'reveal');
assert.deepEqual(specRev.view.state.hands, rev.view.state.hands, 'le spectateur voit les deux mains');
const bobRev = await bob.waitFor(u => u.event.type === 'reveal');
assert.deepEqual(bobRev.view.state.hands, rev.view.state.hands, 'les deux joueurs voient les mêmes mains');
a = await bob.emit('game:draft', { id: gameId, cards: BOB });
assert.equal(a.ok, false, 'plus de choix après la révélation');
step('choix : refus (cartes invalides, spectateur, coups), secret jusqu’à la révélation, idempotence, mains révélées');

// 3. Coups
a = await alice.emit('game:move', { id: gameId, from: sq('e2'), to: sq('e5') });
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

// 4. Un pouvoir d'Alice (la première carte jouable de sa main) : effet public, mains toujours visibles
const hand = afterTwo.view.state.hands.w;
let played = false;
// Cibles : Mur de glace sur une case vide des rangées 3 à 6, Faille sur la 4e rangée ; les autres n'en ont pas.
const targetsFor = { ice_wall: [sq('e3')], rift: [sq('a4')] };
await new Promise(res => setTimeout(res, 1500)); // la pendule des Blancs tourne
for (let i = 0; i < hand.length && !played; i++) {
  const card = hand[i].card;
  a = await alice.emit('game:card', { id: gameId, index: i, targets: targetsFor[card] ?? [] });
  if (!a.ok) continue;
  played = card;
  const u = await bob.waitFor(x => x.event.type === 'card');
  const v = u.view.state;
  assert.equal(u.event.info.card, card);
  assert.deepEqual(v.hands.w[i], { card, used: true }, 'la carte jouée est marquée utilisée');
  assert.deepEqual(v.hands.w.map(h => h.card), hand.map(h => h.card), 'la main reste visible, exacte');
  assert.deepEqual(v.snaps, [], 'aucun instantané hors Duel');
  if (PRESAGE.includes(card)) {
    assert.ok(v.effects.some(e => e.card === card && e.pending && e.delay === 2), 'le Présage est public, avec son délai');
  }
  if (card === 'ice_wall') assert.ok(v.effects.some(e => e.card === 'ice_wall' && e.permanent && e.square === sq('e3')), 'Mur permanent');
  if (card === 'tide') assert.equal(v.pos.turn, 'b', 'le Rituel tient lieu de coup');
  // 1,5 s écoulée, 1,2 s de cinématique créditée (R10) : la pendule est sous son départ, sans excès.
  assert.ok(u.view.clock.w < 300_000 && u.view.clock.w > 290_000, `la pendule tient compte du temps écoulé (${u.view.clock.w})`);
  a = await alice.emit('game:card', { id: gameId, index: (i + 1) % 3, targets: [] });
  assert.equal(a.ok, false, 'une seule carte par tour');
}
assert.ok(played, `aucune carte jouable dans la main ${hand.map(h => h.card)}`);
step(`pouvoir joué, public, mains visibles (${played})`);
spectator.socket.close();

// 4 bis. Choix du catalogue : Sans cartes par invitation ; le Duel, plus proposé, est ramené aux Pouvoirs
// (création de partie et file amicale entre invités)
for (const [catalog, expected] of [['aucune', 'aucune'], ['duel', 'climats']]) {
  r = await alice.api('/games', { mode: 'invite', tc: '5+0', color: 'w', catalog });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.id;
  await alice.emit('game:join', { id });
  let jb = await bob.emit('game:join', { id });
  if (jb.needName) jb = await bob.emit('game:join', { id, name: 'Bob le Fou' });
  assert.equal(jb.view.state.catalog, expected);
  assert.deepEqual(jb.view.state.hands, { w: [], b: [] });
  if (expected === 'climats') assert.deepEqual(jb.view.draft?.pool, POUVOIRS, 'choix parmi les Pouvoirs');
  else {
    assert.equal(jb.view.draft, null, 'sans cartes : pas de choix');
    assert.ok(jb.view.firstMoveDeadline, 'sans cartes : délai du premier coup tout de suite');
  }
  bob.updates = [];
  assert.ok((await bob.emit('game:resign', { id })).ok);
  const ended = await bob.waitFor(u => u.event.type === 'end' && u.view.id === id);
  // Pendant le choix, l'abandon annule la partie (sans effet sur le classement) ; sans cartes, avant le premier coup,
  // c'est un abandon ordinaire.
  if (expected === 'climats') assert.deepEqual(ended.view.state.result, { winner: null, reason: 'aborted' }, 'abandon pendant le choix : annulation');
}
r = await alice.api('/games', { mode: 'invite', tc: '5+0', catalog: 'inconnu' });
assert.equal(r.status, 400, 'catalogue inconnu refusé');
const carol = new Client();
const dave = new Client();
await carol.api('/me');
await dave.api('/me');
await carol.connect();
await dave.connect();
const matched = c => new Promise(res => c.socket.once('queue:matched', res));
const [mc, md] = [matched(carol), matched(dave)];
// Carol demande le Duel (ancien client), Dave les Pouvoirs : les deux attendent dans la même file.
assert.ok((await carol.emit('queue:join', { tc: '3+2', rated: false, name: 'Carol', catalog: 'duel' })).ok);
assert.ok((await dave.emit('queue:join', { tc: '3+2', rated: false, name: 'Dave', catalog: 'climats' })).ok);
const [gc, gd] = await Promise.all([mc, md]);
assert.equal(gc.gameId, gd.gameId);
const jc = await carol.emit('game:join', { id: gc.gameId });
assert.equal(jc.view.state.catalog, 'climats', 'le Duel est ramené aux Pouvoirs dans la file');
assert.deepEqual(jc.view.draft?.pool, POUVOIRS, 'file amicale : choix des cartes parmi les Pouvoirs');
assert.ok((await carol.emit('game:resign', { id: gc.gameId })).ok);
carol.socket.close();
dave.socket.close();
step('Sans cartes ; Duel ramené aux Pouvoirs (création et file amicale) ; catalogue inconnu refusé');

// 5. Abandon et revanche
a = await bob.emit('game:resign', { id: gameId });
assert.ok(a.ok);
const end = await alice.waitFor(u => u.event.type === 'end' && u.view.id === gameId);
assert.deepEqual(end.view.state.result, { winner: 'w', reason: 'resign' });
assert.ok(end.view.state.hands.b.every(h => POUVOIRS.includes(h.card)), 'les mains restent visibles en fin de partie');
const redirect = new Promise(res => alice.socket.on('game:redirect', res));
await alice.emit('game:rematch', { id: gameId });
await bob.emit('game:rematch', { id: gameId });
const rd = await redirect;
assert.equal(rd.from, gameId);
j = await alice.emit('game:join', { id: rd.to });
assert.equal(j.view.you, 'b', 'les couleurs sont inversées à la revanche');
assert.ok(j.view.draft, 'la revanche commence par un nouveau choix des cartes');
assert.deepEqual(j.view.draft.mine, [], 'rien n’est repris de la partie précédente');
assert.deepEqual(j.view.state.hands, { w: [], b: [] });
step('abandon, mains visibles, revanche avec couleurs inversées et nouveau choix des cartes');

// 6. Partie contre l'IA : elle a choisi aussitôt ; le choix du joueur révèle les mains, puis elle répond seule
r = await alice.api('/games', { mode: 'bot', tc: 'none', color: 'w', level: 1 });
const botGame = r.data.id;
alice.updates = [];
let jbot = await alice.emit('game:join', { id: botGame });
assert.deepEqual(jbot.view.draft.chosen, { w: false, b: true }, "l'IA a déjà choisi");
assert.deepEqual(jbot.view.draft.pool, POUVOIRS.filter(c => c !== 'hourglass'), 'pas de Sablier fou contre l’IA ni sans pendule');
assert.equal((await alice.emit('game:move', { id: botGame, from: sq('d2'), to: sq('d4') })).ok, false, 'pas de coup avant le choix');
assert.ok((await alice.emit('game:draft', { id: botGame, cards: ['tide', 'rift', 'truce'] })).ok);
const botRev = await alice.waitFor(u => u.event.type === 'reveal' && u.view.id === botGame);
assert.ok(validHand(botRev.view.state.hands.b.map(h => h.card), jbot.view.draft.pool), "main de l'IA révélée");
await alice.emit('game:move', { id: botGame, from: sq('d2'), to: sq('d4') });
const botReply = await alice.waitFor(u => u.event.type === 'move' && u.event.color === 'b', 15000);
assert.ok(botReply);
step("partie contre l'IA : elle choisit aussitôt, mains révélées au choix du joueur, réponse reçue");

// 6 bis. Contre l'IA, avec pendule : le Sablier fou n'est jamais proposé (ni à l'humain ni à l'IA) ; l'IA varie
const botHands = new Set();
for (let k = 0; k < 4; k++) {
  r = await alice.api('/games', { mode: 'bot', tc: '3+2', color: 'b', level: 2, catalog: 'climats' });
  const id = r.data.id;
  alice.updates = [];
  jbot = await alice.emit('game:join', { id });
  assert.ok(!jbot.view.draft.pool.includes('hourglass'), 'réserve sans Sablier fou');
  a = await alice.emit('game:draft', { id, cards: ['hourglass', 'rift', 'tide'] });
  assert.equal(a.ok, false, 'Sablier fou refusé contre l’IA');
  assert.ok((await alice.emit('game:draft', { id, cards: ['ice_wall', 'rift', 'tide'] })).ok);
  const done = await alice.waitFor(u => u.event.type === 'reveal' && u.view.id === id);
  const cards = done.view.state.hands.w.map(h => h.card);
  assert.ok(validHand(cards, jbot.view.draft.pool), `main de l'IA : ${cards}`);
  botHands.add([...cards].sort().join());
  a = await alice.emit('game:resign', { id });
  assert.ok(a.ok, `abandon refusé : ${a.error}`);
  await new Promise(res => setTimeout(res, 500)); // limiteur par socket (20 actions, 8 par seconde)
}
step(`contre l'IA : pas de Sablier fou, mains de l'IA valides (${botHands.size} différentes sur 4)`);

// 7. Boutique en mode démo
r = await alice.api('/shop/checkout', { productId: 'skin:inferno', waiver: false });
assert.equal(r.status, 400, 'renonciation obligatoire');
r = await alice.api('/shop/checkout', { productId: 'skin:inferno', waiver: true });
const demoShop = r.status === 200 && r.data.url.startsWith('/boutique/demo/');
if (demoShop) {
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

// 7 bis. Rois : le roi de l'IA (BOT_LOOK) ; en mode démo, achat et équipement d'un roi (sa colonne seulement), roi
// non possédé refusé, produit retiré refusé, roi pris à l'assise et vu de tous (Alice, Bob, un spectateur), changement
// de roi sans effet sur la partie en cours, revanche avec le roi relu en base.
r = await alice.api('/games', { mode: 'bot', tc: 'none', color: 'w', level: 3, catalog: 'aucune' });
assert.equal(r.status, 200, JSON.stringify(r.data));
const botKingGame = r.data.id;
const jk = await alice.emit('game:join', { id: botKingGame });
assert.equal(jk.view.seats.b.king, 'king:eclipse', "roi de l'IA de niveau 3 (BOT_LOOK)");
assert.equal(jk.view.seats.b.skin, 'skin:void', "sorts de l'IA de niveau 3 inchangés");
assert.equal(jk.view.seats.w.king, 'king:arcane', 'roi Arcane par défaut');
assert.ok((await alice.emit('game:resign', { id: botKingGame })).ok);
step("rois : l'IA porte le roi de BOT_LOOK, le joueur le roi Arcane par défaut");
if (demoShop) {
  r = await alice.api('/me');
  const before = r.data.user;
  assert.equal(before.equippedKing, 'king:arcane', 'roi Arcane équipé par défaut');
  r = await alice.api('/account/equip', { itemId: 'king:braise' });
  assert.equal(r.status, 403, 'impossible d’équiper un roi non acheté');
  r = await alice.api('/shop/checkout', { productId: 'pack:all', waiver: true });
  assert.equal(r.status, 404, 'produit retiré de la vente');
  r = await alice.api('/shop/checkout', { productId: 'king:braise', waiver: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const kpid = r.data.url.split('/').pop();
  r = await alice.api(`/shop/demo/${kpid}`);
  assert.equal(r.data.amountCents, 299, 'Roi de braise à 2,99 €');
  r = await alice.api(`/shop/demo/${kpid}/complete`, {});
  assert.ok(r.data.user.items.includes('king:braise'));
  r = await alice.api('/account/equip', { itemId: 'king:braise' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.equippedKing, 'king:braise');
  assert.equal(r.data.user.equippedBoard, before.equippedBoard, 'équiper un roi ne touche pas l’échiquier');
  assert.equal(r.data.user.equippedSkin, before.equippedSkin, 'équiper un roi ne touche pas les sorts');
  r = await alice.api('/account/equip', { itemId: 'skin:arcane' });
  assert.equal(r.data.user.equippedSkin, 'skin:arcane');
  assert.equal(r.data.user.equippedKing, 'king:braise', 'équiper des sorts ne touche pas le roi');
  assert.equal(r.data.user.equippedBoard, before.equippedBoard, 'équiper des sorts ne touche pas l’échiquier');
  r = await alice.api('/me');
  assert.equal(r.data.user.equippedKing, 'king:braise', '/me renvoie le roi équipé');
  step('rois : achat démo, équipement dans la seule colonne du roi, roi non possédé et produit retiré refusés');

  r = await alice.api('/games', { mode: 'invite', tc: '5+0', color: 'w', catalog: 'aucune' });
  const kingGame = r.data.id;
  await alice.emit('game:join', { id: kingGame });
  let jbk = await bob.emit('game:join', { id: kingGame });
  if (jbk.needName) jbk = await bob.emit('game:join', { id: kingGame, name: 'Bob le Fou' });
  const watcher = new Client();
  await watcher.api('/me');
  await watcher.connect();
  const jwk = await watcher.emit('game:join', { id: kingGame, sit: false });
  const jak = await alice.emit('game:join', { id: kingGame });
  for (const [who, v] of [['Alice', jak.view], ['Bob', jbk.view], ['le spectateur', jwk.view]]) {
    assert.equal(v.status, 'active');
    assert.equal(v.seats.w.king, 'king:braise', `le roi d’Alice vu par ${who}`);
    assert.equal(v.seats.b.king, 'king:arcane', `le roi de Bob vu par ${who}`);
    assert.equal(v.seats.w.seal, null, 'pas de sceau sans collection complète');
  }
  watcher.socket.close();
  r = await alice.api('/account/equip', { itemId: 'king:arcane' });
  assert.equal(r.data.user.equippedKing, 'king:arcane');
  assert.equal((await bob.emit('game:join', { id: kingGame })).view.seats.w.king, 'king:braise', 'roi pris à l’assise : la partie en cours ne change pas');
  const kingRedirect = new Promise(res => {
    const h = p => {
      if (p.from !== kingGame) return;
      alice.socket.off('game:redirect', h);
      res(p);
    };
    alice.socket.on('game:redirect', h);
  });
  assert.ok((await bob.emit('game:resign', { id: kingGame })).ok);
  await alice.emit('game:rematch', { id: kingGame });
  await bob.emit('game:rematch', { id: kingGame });
  const rk = await kingRedirect;
  const jrk = await alice.emit('game:join', { id: rk.to });
  assert.equal(jrk.view.you, 'b', 'couleurs inversées');
  assert.equal(jrk.view.seats.b.king, 'king:arcane', 'revanche : le roi est relu en base');
  assert.equal(jrk.view.seats.w.king, 'king:arcane');
  assert.ok((await alice.emit('game:abort', { id: rk.to })).ok);
  step('rois : roi vu par les deux joueurs et un spectateur, figé pendant la partie, relu à la revanche');
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

// 8 bis. Échéance (partie lancée à l'étape 0) : le serveur complète au hasard ce qui manque
const waitLeft = Math.max(0, lateStart + DRAFT_MS - Date.now());
console.log(`  … échéance du choix dans ${Math.round(waitLeft / 1000)} s`);
const late = await eve.waitFor(u => u.event.type === 'reveal' && u.view.id === lateId, waitLeft + 6000);
assert.ok(Date.now() - lateStart >= DRAFT_MS - 1000, 'révélation à l’échéance, pas avant');
assert.deepEqual(late.event.auto, ['b'], 'seul Frank a été complété au hasard');
assert.deepEqual(late.view.state.hands.w.map(h => h.card), EVE, 'le choix validé est gardé');
const fh = late.view.state.hands.b.map(h => h.card);
assert.deepEqual(fh.slice(0, 2), ['tide', 'blast'], 'la sélection provisoire est gardée');
assert.ok(validHand(fh, POUVOIRS), `main complétée valide : ${fh}`);
assert.ok(late.view.firstMoveDeadline > Date.now() + 30_000, 'délai du premier coup à partir de la révélation');
const frankLate = await frank.waitFor(u => u.event.type === 'reveal' && u.view.id === lateId);
assert.deepEqual(frankLate.view.state.hands, late.view.state.hands);
assert.ok((await eve.emit('game:abort', { id: lateId })).ok, 'annulation possible avant le premier coup');
eve.socket.close();
frank.socket.close();
step('échéance de 45 s : choix validé gardé, sélection provisoire complétée au hasard, délai du premier coup ensuite');

// 8 bis. Accueil : deux visiteurs prêts, arrivés en même temps, sont appariés ; deux onglets du même visiteur, jamais
{
  const v1 = new Client();
  const v2 = new Client();
  await v1.api('/me');
  await v2.api('/me');
  await v1.connect();
  await v2.connect();
  const paired = c => new Promise(res => c.socket.once('home:paired', res));
  // Deux onglets du même visiteur : pas de partie contre soi-même
  const twin = io(BASE, { transports: ['websocket'], extraHeaders: { cookie: [...v1.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
  await new Promise(r => twin.on('connect', r));
  let selfPaired = false;
  twin.once('home:paired', () => (selfPaired = true));
  v1.socket.once('home:paired', () => (selfPaired = true));
  v1.socket.emit('home:hello', { tz: 'Europe/Paris', ready: true });
  twin.emit('home:hello', { tz: 'Europe/Paris', ready: true });
  await new Promise(r => setTimeout(r, 400));
  assert.equal(selfPaired, false, 'deux onglets du même visiteur ne sont pas appariés');
  twin.emit('home:bye');
  twin.close();
  // Pas prêt (il a fait défiler la page) : pas apparié, puis prêt : apparié
  const p1 = paired(v1);
  const p2 = paired(v2);
  v2.socket.emit('home:hello', { tz: 'America/Montreal', ready: false });
  await new Promise(r => setTimeout(r, 300));
  v2.socket.emit('home:ready', { ready: true });
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a.gameId, b.gameId, 'même partie');
  assert.notEqual(a.color, b.color, 'couleurs opposées');
  assert.equal(a.opponent.country, 'CA', 'pays de l’adversaire d’après son fuseau');
  assert.equal(b.opponent.country, 'FR');
  const ja = await v1.emit('game:join', { id: a.gameId });
  assert.ok(ja.ok && ja.view.status === 'active' && !ja.view.draft, 'partie lancée tout de suite, sans choix des cartes');
  assert.ok(ja.view.state.hands.w.length === 3 && ja.view.state.hands.b.length === 3, 'mains tirées au hasard');
  assert.equal(ja.view.clock, null, 'sans pendule');
  assert.ok((await v1.emit('game:abort', { id: a.gameId })).ok, 'on peut revenir à l’Oracle avant le premier coup');
  v1.socket.close();
  v2.socket.close();
}
step('accueil : deux visiteurs prêts appariés (pays d’après le fuseau, partie sans choix ni pendule), jamais soi-même');

// 8 ter. Accueil : « Chercher un vrai joueur » (sans limite de temps), puis relais de l'IA pour celui qui ne joue pas
{
  const v1 = new Client();
  const v2 = new Client();
  await v1.api('/me');
  await v2.api('/me');
  await v1.connect();
  await v2.connect();
  let early = false;
  v1.socket.once('home:paired', () => (early = true));
  v1.socket.emit('home:hello', { tz: 'Europe/Paris', ready: false });
  v2.socket.emit('home:hello', { tz: 'Europe/Paris', ready: false });
  v1.socket.emit('home:search', { search: true, tz: 'Europe/Paris' });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(early, false, 'seul à chercher : pas encore apparié');
  const p1 = new Promise(res => v1.socket.once('home:paired', res));
  const p2 = new Promise(res => v2.socket.once('home:paired', res));
  v2.socket.emit('home:search', { search: true, tz: 'Europe/Paris' });
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a.gameId, b.gameId, 'deux chercheurs appariés');
  const [white, black] = a.color === 'w' ? [v1, v2] : [v2, v1];
  const jw = await white.emit('game:join', { id: a.gameId });
  await black.emit('game:join', { id: a.gameId });
  assert.deepEqual(jw.view.standIn, { w: false, b: false }, 'personne n’est relayé au départ');
  assert.equal(jw.view.firstMoveDeadline, null, 'pas d’annulation au premier coup : l’IA prend le relais');
  // Les Blancs ne jouent pas : au bout de 10 s, l'IA joue pour eux
  const relayed = await black.waitFor(u => u.view.id === a.gameId && u.event.type === 'move' && u.event.color === 'w', 16000);
  assert.equal(relayed.view.standIn.w, true, 'les Blancs sont relayés par l’IA');
  // Les Noirs jouent ; les Blancs reprennent la main
  assert.ok((await white.emit('game:takeover', { id: a.gameId })).ok, 'reprendre la main');
  const back = await black.waitFor(u => u.view.id === a.gameId && u.view.standIn && u.view.standIn.w === false, 4000);
  assert.ok(back, 'les Blancs ont repris la main');
  assert.ok((await white.emit('game:resign', { id: a.gameId })).ok);
  v1.socket.close();
  v2.socket.close();
}
step('accueil : recherche d’un vrai joueur ; un joueur qui ne joue pas est relayé par l’IA (10 s), puis reprend la main');

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
