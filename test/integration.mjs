// Test d'intégration du serveur en marche :
//   node test/integration.mjs [http://localhost:3000]
//   node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}
//   SPELLMATE_TEST_RULES='{"cardsPerPlayer":5}' node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}
// Parcourt : inscription, invitation sans compte, choix des cartes (décision D5 : réserve, secret jusqu'à la
// révélation, refus, idempotence, échéance et complément au hasard), coups, mains visibles, carte jouée (catalogue
// Pouvoirs, identifiant 'climats', par défaut), choix du catalogue (Sans cartes ; Duel ramené aux Pouvoirs ; file
// amicale), abandon pendant le choix (annulation), revanche, IA, boutique (mode démo ; collection complétée au prix de
// productPrice), rois (roi de l'IA ; en mode démo : achat, équipement, roi pris à l'assise et vu de tous, revanche),
// essai équipé en une requête, panier payé en une fois et équipé à la livraison, sceau, profil public et classement.
// Rien n'est recopié des réglages : nombre de cartes, réserve et durée du choix viennent de la vue du choix
// (view.draft.count, pool, msLeft, totalMs), les règles d'une partie de son état (rulesOf), les Pouvoirs, le classement
// de départ et les délais des modules partagés (lus avec tsx). Avec SPELLMATE_TEST_RULES, la suite suit les règles du
// serveur : N cartes, plusieurs cartes par tour, tirage partout ({"draft":false} : les étapes du choix sont sautées).
// Durée : au moins la durée du choix (l'échéance est attendue en parallèle des autres étapes).
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { Client as BaseClient, baseUrl, sleep, sq } from './lib/client.mjs';

const BASE = baseUrl(process.argv[2]);
const { CARDS, cardsOf } = await tsImport('../src/shared/cards.ts', import.meta.url);
const { DEAL, RULES_V1 } = await tsImport('../src/shared/config/rules.ts', import.meta.url);
const { poolOf, rulesOf, sameRules, validHand: r9 } = await tsImport('../src/shared/rulesCore.ts', import.meta.url);
const { BOT_RUNTIME, RATING, RELAY, TIMINGS } = await tsImport('../src/server/settings.ts', import.meta.url);

/** Les Pouvoirs (catalogue 'climats'), dans l'ordre des réserves. */
const POUVOIRS = poolOf('climats', { timed: true });
/** Cartes annoncées (Présage) : l'effet est public avant son arrivée. */
const PRESAGE = cardsOf('climats').filter(c => CARDS[c].presage);

/** Client de test/lib (cookies, socket, mises à jour), sur le serveur de BASE. */
class Client extends BaseClient {
  constructor() {
    super(BASE);
  }
}

const step = (name) => console.log('✓', name);
const stamp = Date.now().toString(36);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
/** Main choisie valable : `count` cartes différentes de la réserve. */
const validPick = (cards, pool, count) => cards.length === count && new Set(cards).size === count && cards.every(c => pool.includes(c));
/** Main tirée valable : cartes différentes de la réserve, contraintes du tirage (R9) respectées. */
const validDeal = (cards, pool) => cards.length > 0 && new Set(cards).size === cards.length && cards.every(c => pool.includes(c)) && r9(cards, DEAL.handLimits);
/** `n` cartes de la réserve, dans l'ordre de préférence donné (puis celui de la réserve). */
const prefer = (order, pool, n) => [...new Set([...order.filter(c => pool.includes(c)), ...pool])].slice(0, n);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

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
/** Le serveur fait choisir les cartes (sinon il les tire : DEAL.draft faux, les étapes du choix sont sautées). */
const DRAFTING = !!lateJoin.view.draft;
let EVE = [];
let FRANK = [];
let lateTotal = 0;
if (DRAFTING) {
  const { count, pool, totalMs } = lateJoin.view.draft;
  lateTotal = totalMs;
  EVE = prefer(['hourglass', 'ice_age', 'rift'], pool, count);
  // Sélection provisoire incomplète : complétée au hasard à l'échéance.
  FRANK = prefer(['tide', 'blast'], pool, Math.min(2, count - 1));
  assert.ok((await eve.emit('game:draft', { id: lateId, cards: EVE })).ok);
  assert.ok((await frank.emit('game:draft', { id: lateId, cards: FRANK, confirm: false })).ok, 'sélection provisoire');
  const lateMine = await frank.emit('game:join', { id: lateId });
  assert.deepEqual(lateMine.view.draft.mine, FRANK, 'la sélection provisoire est gardée (reconnexion)');
  assert.deepEqual(lateMine.view.draft.chosen, { w: true, b: false });
  step('échéance : partie lancée, un joueur valide, l’autre garde une sélection provisoire (vérifiée à la fin)');
} else {
  const h = lateJoin.view.state.hands;
  assert.ok(validDeal(h.w.map(x => x.card), POUVOIRS) && validDeal(h.b.map(x => x.card), POUVOIRS), 'mains tirées valables');
  assert.equal(h.w.length, h.b.length);
  assert.ok((await eve.emit('game:abort', { id: lateId })).ok);
  step(`tirage partout : pas de choix des cartes, mains de ${plural(h.w.length, 'carte')} tirées dès l’arrivée de l’adversaire`);
}

// 1. Inscription d'Alice
const alice = new Client();
r = await alice.api('/auth/register', { email: `alice-${stamp}@test.fr`, username: `alice_${stamp}`, password: 'motdepasse123', acceptTerms: true });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.user.rating, RATING.initial);
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
const spectator = new Client();
await spectator.api('/me');
await spectator.connect();
let a;
if (DRAFTING) {
  assert.ok(j.view.draft, 'phase de choix ouverte');
  const { count, totalMs } = j.view.draft;
  assert.deepEqual(j.view.draft.pool, POUVOIRS, `réserve : les ${POUVOIRS.length} pouvoirs`);
  assert.equal(count, rulesOf(j.view.state).cardsPerPlayer, 'autant de cartes que les règles de la partie en demandent');
  assert.ok(j.view.draft.msLeft > totalMs - 3000 && j.view.draft.msLeft <= totalMs, `échéance de ${totalMs / 1000} s (${j.view.draft.msLeft})`);
  assert.deepEqual(j.view.draft.chosen, { w: false, b: false });
  assert.deepEqual(j.view.state.hands, { w: [], b: [] }, 'mains vides pendant le choix');
  assert.equal(j.view.firstMoveDeadline, null, 'pas de délai du premier coup pendant le choix');
  assert.equal(j.view.clock.running, null, 'pendules à l’arrêt');
  const start = await alice.waitFor(u => u.event.type === 'start');
  assert.ok(start.view.draft, 'Alice voit le choix s’ouvrir');
  const js = await spectator.emit('game:join', { id: gameId, sit: false });
  assert.equal(js.view.you, null);
  assert.deepEqual(js.view.draft.mine, [], 'le spectateur ne voit aucun choix');
  step(`invitation par lien, invité avec pseudo, choix des cartes ouvert (${POUVOIRS.length} pouvoirs, ${plural(count, 'carte')}, ${totalMs / 1000} s, mains vides, pendules à l’arrêt)`);

  // 2 bis. Choix des cartes : refus, secret jusqu'à la révélation, idempotence, révélation
  a = await alice.emit('game:move', { id: gameId, from: sq('e2'), to: sq('e4') });
  assert.equal(a.ok, false, 'aucun coup pendant le choix');
  const order = ['ice_wall', 'rift', 'tide', 'truce', 'blast', 'blood_moon', 'ice_age', 'hourglass'];
  const first = n => prefer(order, POUVOIRS, n);
  const invalid = [
    first(count - 1), // trop peu
    count > 1 ? [...first(count - 1), first(count - 1).at(-1)] : [order[0], order[0]], // deux fois la même
    [...first(count - 1), 'freeze'], // carte d'un autre catalogue
    first(count + 1), // trop
    'tide',
    [1, 2, 3],
  ];
  for (const cards of invalid) {
    a = await alice.emit('game:draft', { id: gameId, cards });
    assert.equal(a.ok, false, `choix invalide refusé : ${JSON.stringify(cards)}`);
  }
  a = await spectator.emit('game:draft', { id: gameId, cards: first(count) });
  assert.equal(a.ok, false, 'un spectateur ne choisit pas');
  assert.ok((await alice.emit('game:draft', { id: gameId, cards: ['truce'], confirm: false })).ok, 'sélection provisoire');
  // Délai du Présage changé (SPELLMATE_TEST_RULES) : Alice met un Présage en tête, pour que son délai soit vérifié à
  // l'étape 4 (au défaut, le Mur de glace d'abord, comme avant).
  const presageFirst = rulesOf(j.view.state).presageDelay !== RULES_V1.presageDelay;
  const ALICE = prefer(presageFirst ? ['blood_moon', 'ice_wall', 'tide'] : ['ice_wall', 'blood_moon', 'tide'], POUVOIRS, count);
  const BOB = prefer(['rift', 'truce', 'blast'], POUVOIRS, count);
  assert.ok(!sameSet(ALICE, BOB));
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
  assert.ok((await alice.emit('game:draft', { id: gameId, cards: ALICE.slice().reverse() })).ok, 'même choix dans un autre ordre');
  a = await alice.emit('game:draft', { id: gameId, cards: BOB });
  assert.equal(a.ok, false, 'un autre choix après validation est refusé');
  assert.ok((await bob.emit('game:draft', { id: gameId, cards: BOB })).ok);
  const rev = await alice.waitFor(u => u.event.type === 'reveal');
  assert.deepEqual(rev.event.auto, [], 'aucun complément au hasard');
  assert.deepEqual(rev.event.filled, [], 'aucune carte tirée au hasard');
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
} else {
  assert.equal(j.view.draft, null, 'pas de choix des cartes');
  const n = j.view.state.hands.w.length;
  assert.equal(n, rulesOf(j.view.state).cardsPerPlayer, 'mains de la taille des règles de la partie');
  for (const c of ['w', 'b']) assert.ok(validDeal(j.view.state.hands[c].map(h => h.card), POUVOIRS), `main ${c} tirée valable`);
  assert.ok(j.view.firstMoveDeadline, 'délai du premier coup tout de suite');
  await alice.waitFor(u => u.event.type === 'start');
  const js = await spectator.emit('game:join', { id: gameId, sit: false });
  assert.deepEqual(js.view.state.hands, j.view.state.hands, 'le spectateur voit les mains tirées');
  a = await alice.emit('game:draft', { id: gameId, cards: j.view.state.hands.w.map(h => h.card) });
  assert.equal(a.ok, false, 'aucun choix des cartes à faire');
  step(`invitation par lien, invité avec pseudo, mains de ${plural(n, 'carte')} tirées (tirage partout)`);
}

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
  const rules = rulesOf(v);
  if (PRESAGE.includes(card)) {
    assert.ok(v.effects.some(e => e.card === card && e.pending && e.delay === rules.presageDelay), 'le Présage est public, avec son délai');
  } else if (DRAFTING && rules.presageDelay !== RULES_V1.presageDelay) {
    assert.fail(`délai du Présage changé, mais la carte jouée (${card}) n’est pas un Présage : délai non vérifié`);
  }
  if (card === 'ice_wall') assert.ok(v.effects.some(e => e.card === 'ice_wall' && e.permanent && e.square === sq('e3')), 'Mur permanent');
  // Rituel (Grande Marée), ou toute carte si elle remplace le coup (cardEndsTurn) : le trait et la pendule passent.
  if (rules.cardEndsTurn || CARDS[card].ritual) {
    assert.equal(v.pos.turn, 'b', 'la carte tient lieu de coup');
    assert.equal(u.view.clock.running, 'b', 'la pendule des Noirs tourne');
  } else {
    assert.equal(v.pos.turn, 'w', 'la carte s’ajoute au coup : les Blancs gardent le trait');
  }
  // 1,5 s écoulée, cinématique créditée (R10) : la pendule est sous son départ, sans excès.
  const initial = u.view.clock.initial * 1000;
  assert.ok(u.view.clock.w < initial && u.view.clock.w > initial - 10_000, `la pendule tient compte du temps écoulé (${u.view.clock.w})`);
  // Les autres cartes : pas plus de rules.cardsPerTurn cartes dans le tour (une seule au défaut).
  let more = 0;
  for (let k = 1; k < hand.length; k++) {
    const idx = (i + k) % hand.length;
    a = await alice.emit('game:card', { id: gameId, index: idx, targets: targetsFor[hand[idx].card] ?? [] });
    if (a.ok) more++;
  }
  if (rules.cardsPerTurn === 1) assert.equal(more, 0, 'une seule carte par tour');
  else assert.ok(1 + more <= rules.cardsPerTurn, `au plus ${rules.cardsPerTurn} cartes par tour (${1 + more})`);
  played = more ? `${card} et ${plural(more, 'autre carte')}` : card;
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
  if (expected === 'climats' && DRAFTING) {
    assert.deepEqual(jb.view.state.hands, { w: [], b: [] });
    assert.deepEqual(jb.view.draft?.pool, POUVOIRS, 'choix parmi les Pouvoirs');
  } else if (expected === 'climats') {
    assert.equal(jb.view.draft, null, 'tirage partout : pas de choix');
    assert.ok(validDeal(jb.view.state.hands.w.map(h => h.card), POUVOIRS), 'mains tirées parmi les Pouvoirs');
  } else {
    assert.deepEqual(jb.view.state.hands, { w: [], b: [] });
    assert.equal(jb.view.draft, null, 'sans cartes : pas de choix');
    assert.ok(jb.view.firstMoveDeadline, 'sans cartes : délai du premier coup tout de suite');
  }
  bob.updates = [];
  assert.ok((await bob.emit('game:resign', { id })).ok);
  const ended = await bob.waitFor(u => u.event.type === 'end' && u.view.id === id);
  // Pendant le choix, l'abandon annule la partie (sans effet sur le classement) ; sans cartes, avant le premier coup,
  // c'est un abandon ordinaire.
  if (expected === 'climats' && DRAFTING) assert.deepEqual(ended.view.state.result, { winner: null, reason: 'aborted' }, 'abandon pendant le choix : annulation');
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
if (DRAFTING) assert.deepEqual(jc.view.draft?.pool, POUVOIRS, 'file amicale : choix des cartes parmi les Pouvoirs');
else assert.ok(validDeal(jc.view.state.hands.w.map(h => h.card), POUVOIRS), 'file amicale : mains tirées parmi les Pouvoirs');
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
if (DRAFTING) {
  assert.ok(j.view.draft, 'la revanche commence par un nouveau choix des cartes');
  assert.deepEqual(j.view.draft.mine, [], 'rien n’est repris de la partie précédente');
  assert.deepEqual(j.view.state.hands, { w: [], b: [] });
} else {
  assert.equal(j.view.draft, null);
  assert.ok(validDeal(j.view.state.hands.w.map(h => h.card), POUVOIRS), 'la revanche tire de nouvelles mains');
}
step(`abandon, mains visibles, revanche avec couleurs inversées et ${DRAFTING ? 'nouveau choix des cartes' : 'nouvelles mains'}`);

// 6. Partie contre l'IA : elle a choisi aussitôt ; le choix du joueur révèle les mains, puis elle répond seule
r = await alice.api('/games', { mode: 'bot', tc: 'none', color: 'w', level: 1 });
const botGame = r.data.id;
alice.updates = [];
let jbot = await alice.emit('game:join', { id: botGame });
const BOT_POOL = poolOf('climats', { timed: false, vsBot: true });
if (DRAFTING) {
  assert.deepEqual(jbot.view.draft.chosen, { w: false, b: true }, "l'IA a déjà choisi");
  assert.deepEqual(jbot.view.draft.pool, BOT_POOL, 'pas de Sablier fou contre l’IA ni sans pendule');
  assert.ok(!BOT_POOL.includes('hourglass'));
  assert.equal((await alice.emit('game:move', { id: botGame, from: sq('d2'), to: sq('d4') })).ok, false, 'pas de coup avant le choix');
  const { count } = jbot.view.draft;
  assert.ok((await alice.emit('game:draft', { id: botGame, cards: prefer(['tide', 'rift', 'truce'], BOT_POOL, count) })).ok);
  const botRev = await alice.waitFor(u => u.event.type === 'reveal' && u.view.id === botGame);
  assert.ok(validPick(botRev.view.state.hands.b.map(h => h.card), BOT_POOL, count), "main de l'IA révélée");
} else {
  assert.equal(jbot.view.draft, null);
  for (const c of ['w', 'b']) assert.ok(validDeal(jbot.view.state.hands[c].map(h => h.card), BOT_POOL), `main ${c} tirée sans Sablier fou`);
}
await alice.emit('game:move', { id: botGame, from: sq('d2'), to: sq('d4') });
const botReply = await alice.waitFor(u => u.event.type === 'move' && u.event.color === 'b', 15000);
assert.ok(botReply);
step(DRAFTING ? "partie contre l'IA : elle choisit aussitôt, mains révélées au choix du joueur, réponse reçue" : "partie contre l'IA : mains tirées, réponse reçue");

// 6 bis. Contre l'IA, avec pendule : le Sablier fou n'est jamais proposé (ni à l'humain ni à l'IA) ; l'IA varie
const botHands = new Set();
for (let k = 0; k < 4; k++) {
  r = await alice.api('/games', { mode: 'bot', tc: '3+2', color: 'b', level: 2, catalog: 'climats' });
  const id = r.data.id;
  alice.updates = [];
  jbot = await alice.emit('game:join', { id });
  let cards;
  if (DRAFTING) {
    const { count, pool } = jbot.view.draft;
    assert.ok(!pool.includes('hourglass'), 'réserve sans Sablier fou');
    a = await alice.emit('game:draft', { id, cards: ['hourglass', ...prefer(['rift', 'tide'], pool, count - 1)] });
    assert.equal(a.ok, false, 'Sablier fou refusé contre l’IA');
    assert.ok((await alice.emit('game:draft', { id, cards: prefer(['ice_wall', 'rift', 'tide'], pool, count) })).ok);
    const done = await alice.waitFor(u => u.event.type === 'reveal' && u.view.id === id);
    cards = done.view.state.hands.w.map(h => h.card);
    assert.ok(validPick(cards, pool, count), `main de l'IA : ${cards}`);
  } else {
    cards = jbot.view.state.hands.w.map(h => h.card);
    assert.ok(validDeal(cards, poolOf('climats', { timed: true, vsBot: true })), `main de l'IA : ${cards}`);
    assert.ok(!jbot.view.state.hands.b.some(h => h.card === 'hourglass'), 'pas de Sablier fou contre l’IA');
  }
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
  // Compléter la collection : Alice a les sorts Inferno, la Forge lui coûte 5,99 € − 2,99 € = 3,00 € (productPrice)
  const forge = ['king:braise', 'board:obsidian', 'skin:inferno'];
  r = await alice.api('/shop/checkout', { productId: 'col:inferno', waiver: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await alice.api(`/shop/demo/${r.data.url.split('/').pop()}`);
  assert.equal(r.data.amountCents, 300, 'Forge d’Inferno complétée à 3,00 €');
  assert.deepEqual(r.data.items, forge, 'la page de démo reçoit les objets de l’achat');
  assert.equal(r.data.status, 'pending');
  r = await alice.api('/shop/checkout', { productId: 'king:braise', waiver: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const kpid = r.data.url.split('/').pop();
  r = await alice.api(`/shop/demo/${kpid}`);
  assert.equal(r.data.amountCents, 299, 'Roi de braise à 2,99 €');
  assert.deepEqual(r.data.items, ['king:braise']);
  r = await alice.api(`/shop/demo/${kpid}/complete`, {});
  assert.ok(r.data.user.items.includes('king:braise'));
  assert.deepEqual(r.data.items, ['king:braise'], 'paiement simulé : objets livrés');
  // Avec le roi et les sorts, il ne manque que l'échiquier : jamais sous son prix à l'unité (1,99 €)
  r = await alice.api('/shop/checkout', { productId: 'col:inferno', waiver: true });
  r = await alice.api(`/shop/demo/${r.data.url.split('/').pop()}`);
  assert.equal(r.data.amountCents, 199, 'Forge d’Inferno : plancher au prix de la pièce manquante');
  step('boutique : collection complétée au prix de productPrice (3,00 €, puis 1,99 €), objets de l’achat dans la page de démo');
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

  // 7 ter. Équiper un essai entier (EquipRequest { itemIds }) : une requête, un objet par emplacement, tout ou rien
  r = await alice.api('/account/equip', { itemIds: ['king:braise', 'board:wood', 'skin:inferno'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const look = u => [u.equippedKing, u.equippedBoard, u.equippedSkin];
  assert.deepEqual(look(r.data.user), ['king:braise', 'board:wood', 'skin:inferno'], 'roi, échiquier et sorts équipés d’un coup');
  r = await alice.api('/account/equip', { itemIds: ['king:braise', 'king:arcane'] });
  assert.equal(r.status, 400, 'deux rois : refusé');
  assert.equal(r.data.error, 'Un seul objet par emplacement.');
  r = await alice.api('/account/equip', { itemIds: ['king:arcane', 'board:ruby'] });
  assert.equal(r.status, 403, 'échiquier non possédé : refusé');
  r = await alice.api('/account/equip', { itemIds: ['king:arcane', 'board:inconnu'] });
  assert.equal(r.status, 404, 'objet inconnu : refusé');
  for (const itemIds of [[], ['king:arcane', 'board:arcane', 'skin:arcane', 'skin:inferno']]) {
    r = await alice.api('/account/equip', { itemIds });
    assert.equal(r.status, 400, `sélection invalide : ${itemIds.length} objets`);
  }
  r = await alice.api('/me');
  assert.deepEqual(look(r.data.user), ['king:braise', 'board:wood', 'skin:inferno'], 'refus : rien n’est équipé, pas même le roi offert');
  step('équiper un essai entier : une requête ; deux objets d’un emplacement (400), non possédé (403), inconnu (404) : rien ne change');

  // 7 quater. Panier d'essai (CheckoutRequest { itemIds, equip }) : prix de quoteCart, objets à payer seulement,
  // équipés à la livraison ; collection complétée avec equip : les trois emplacements équipés
  r = await alice.api('/shop/checkout', { productId: 'skin:neon', waiver: true });
  r = await alice.api(`/shop/demo/${r.data.url.split('/').pop()}/complete`, {});
  assert.ok(r.data.user.items.includes('skin:neon'));
  assert.equal(r.data.user.equippedSkin, 'skin:inferno', 'sans equip : l’équipement ne change pas');
  r = await alice.api('/shop/checkout', { itemIds: ['king:synthe', 'board:grille', 'skin:neon'], waiver: true, equip: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const cartId = r.data.url.split('/').pop();
  r = await alice.api(`/shop/demo/${cartId}`);
  // Alice a les sorts Néon : le panier complète la collection Néon 2084 pour 5,99 € − 2,99 € = 3,00 € (au lieu de 4,98 €)
  assert.deepEqual(r.data, { id: cartId, productId: 'panier', items: ['king:synthe', 'board:grille'], amountCents: 300, status: 'pending' });
  r = await alice.api(`/shop/demo/${cartId}/complete`, {});
  assert.equal(r.data.productId, 'panier');
  assert.deepEqual(r.data.items, ['king:synthe', 'board:grille']);
  assert.deepEqual(look(r.data.user), ['king:synthe', 'board:grille', 'skin:inferno'], 'equip : roi et échiquier livrés et équipés, sorts inchangés');
  r = await alice.api('/shop/checkout', { itemIds: ['king:synthe', 'skin:arcane'], waiver: true });
  assert.equal(r.status, 409, 'panier sans rien à payer');
  r = await alice.api('/shop/checkout', { itemIds: ['king:rubis', 'king:astral'], waiver: true });
  assert.equal(r.status, 400, 'panier : deux rois refusés');
  r = await alice.api('/shop/checkout', { productId: 'skin:void', itemIds: ['skin:void'], waiver: true });
  assert.equal(r.status, 400, 'un produit ou un panier, pas les deux');
  r = await alice.api('/shop/checkout', { productId: 'col:inferno', waiver: true, equip: true });
  const forgeId = r.data.url.split('/').pop();
  assert.equal((await alice.api(`/shop/demo/${forgeId}`)).data.amountCents, 199, 'Forge complétée : il ne manque que l’échiquier');
  r = await alice.api(`/shop/demo/${forgeId}/complete`, {});
  assert.deepEqual(look(r.data.user), ['king:braise', 'board:obsidian', 'skin:inferno'], 'collection avec equip : les trois emplacements');
  r = await alice.api('/account/purchases');
  const cartRow = r.data.purchases.find(p => p.id === cartId);
  assert.deepEqual([cartRow.product_id, cartRow.items, cartRow.amount_cents, cartRow.status], ['panier', ['king:synthe', 'board:grille'], 300, 'paid'], 'historique : le panier');
  step('panier d’essai payé en une fois (Néon complétée à 3,00 €), équipé à la livraison ; collection avec equip ; refus 409 et 400');

  // Le sceau et le roi pris à l'assise : Néon 2084 et Forge d'Inferno complètes, rareté égale → la première du catalogue
  r = await alice.api('/games', { mode: 'bot', tc: 'none', color: 'w', level: 1, catalog: 'aucune' });
  const sealGame = r.data.id;
  const js2 = await alice.emit('game:join', { id: sealGame });
  assert.equal(js2.view.seats.w.king, 'king:braise');
  assert.equal(js2.view.seats.w.seal, 'col:neon', 'sceau de collection à l’assise');
  assert.equal(js2.view.seats.b.seal, null, 'l’IA n’a pas de sceau');
  assert.ok((await alice.emit('game:resign', { id: sealGame })).ok);
  step('sceau de collection et roi équipé pris à l’assise');
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
if (DRAFTING) {
  const waitLeft = Math.max(0, lateStart + lateTotal - Date.now());
  console.log(`  … échéance du choix dans ${Math.round(waitLeft / 1000)} s`);
  const late = await eve.waitFor(u => u.event.type === 'reveal' && u.view.id === lateId, waitLeft + 6000);
  assert.ok(Date.now() - lateStart >= lateTotal - 1000, 'révélation à l’échéance, pas avant');
  assert.deepEqual(late.event.auto, ['b'], 'seul Frank n’avait pas validé');
  assert.deepEqual(late.event.filled, ['b'], 'seul Frank a été complété au hasard');
  assert.deepEqual(late.view.state.hands.w.map(h => h.card), EVE, 'le choix validé est gardé');
  const fh = late.view.state.hands.b.map(h => h.card);
  assert.deepEqual(fh.slice(0, FRANK.length), FRANK, 'la sélection provisoire est gardée');
  assert.ok(validPick(fh, POUVOIRS, EVE.length), `main complétée valide : ${fh}`);
  assert.ok(late.view.firstMoveDeadline > Date.now() + TIMINGS.firstMoveMs - 15_000, 'délai du premier coup à partir de la révélation');
  const frankLate = await frank.waitFor(u => u.event.type === 'reveal' && u.view.id === lateId);
  assert.deepEqual(frankLate.view.state.hands, late.view.state.hands);
  assert.ok((await eve.emit('game:abort', { id: lateId })).ok, 'annulation possible avant le premier coup');
  step(`échéance de ${lateTotal / 1000} s : choix validé gardé, sélection provisoire complétée au hasard, délai du premier coup ensuite`);
}
eve.close();
frank.close();

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
  const twin = new Client();
  twin.cookies = new Map(v1.cookies);
  await twin.connect();
  let selfPaired = false;
  twin.socket.once('home:paired', () => (selfPaired = true));
  v1.socket.once('home:paired', () => (selfPaired = true));
  v1.socket.emit('home:hello', { tz: 'Europe/Paris', ready: true });
  twin.socket.emit('home:hello', { tz: 'Europe/Paris', ready: true });
  await sleep(400);
  assert.equal(selfPaired, false, 'deux onglets du même visiteur ne sont pas appariés');
  twin.socket.emit('home:bye');
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
  const n = rulesOf(ja.view.state).cardsPerPlayer;
  assert.ok(ja.view.state.hands.w.length === n && ja.view.state.hands.b.length === n, `mains de ${plural(n, 'carte')} tirées au hasard`);
  for (const c of ['w', 'b']) assert.ok(validDeal(ja.view.state.hands[c].map(h => h.card), poolOf('climats', { timed: false })), `main ${c} tirée valable`);
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
  // Les Blancs ne jouent pas : au bout de RELAY.firstMoveMs, l'IA joue pour eux (ses cartes d'abord, s'il y a lieu)
  const relayed = await black.waitFor(u => u.view.id === a.gameId && u.event.type === 'move' && u.event.color === 'w', RELAY.firstMoveMs + 6000 + 3 * BOT_RUNTIME.cardPauseMs);
  assert.equal(relayed.view.standIn.w, true, 'les Blancs sont relayés par l’IA');
  // Les Noirs jouent ; les Blancs reprennent la main
  assert.ok((await white.emit('game:takeover', { id: a.gameId })).ok, 'reprendre la main');
  const back = await black.waitFor(u => u.view.id === a.gameId && u.view.standIn && u.view.standIn.w === false, 4000);
  assert.ok(back, 'les Blancs ont repris la main');
  assert.ok((await white.emit('game:resign', { id: a.gameId })).ok);
  v1.socket.close();
  v2.socket.close();
}
step(`accueil : recherche d’un vrai joueur ; un joueur qui ne joue pas est relayé par l’IA (${RELAY.firstMoveMs / 1000} s), puis reprend la main`);

// 8 ter. Résumés des parties terminées (GameSummary : historique du compte, profil public) : les champs d'avant, plus
// `rules` seulement pour une partie dont les règles diffèrent de RULES_V1 (rien de nouveau au défaut), égales alors à
// celles de son état.
{
  const CHAMPS = ['id', 'mode', 'rated', 'status', 'white', 'black', 'whiteRating', 'blackRating', 'winner', 'reason', 'timeControl', 'createdAt', 'plies'];
  const recent = (await alice.api('/games/recent')).data.games;
  const publics = (await alice.api(`/users/alice_${stamp}`)).data.games;
  assert.ok(recent.length > 0, 'parties terminées d’Alice');
  let hors = 0;
  for (const g of [...recent, ...publics]) {
    await sleep(150); // limiteur par socket (réserve de 20 actions, 8 par seconde)
    const jg = await alice.emit('game:join', { id: g.id, sit: false });
    assert.ok(jg.ok, `partie ${g.id} relue`);
    const v1 = sameRules(rulesOf(jg.view.state), RULES_V1);
    assert.deepEqual(Object.keys(g), v1 ? CHAMPS : [...CHAMPS, 'rules'], `résumé de ${g.id} : champs`);
    if (!v1) {
      assert.deepEqual(g.rules, jg.view.state.rules, `résumé de ${g.id} : règles de la partie`);
      hors++;
    }
  }
  step(`résumés des parties (historique, profil) : ${hors ? `${hors} avec leurs règles (hors RULES_V1)` : 'champs d’avant, sans règles (RULES_V1)'}`);
}

// 9. Compte : profil public (roi, échiquier, sorts, sceau), classement, export, suppression
r = await alice.api(`/users/ALICE_${stamp}`);
assert.equal(r.status, 200);
assert.equal(r.data.profile.username, `alice_${stamp}`);
assert.ok(!('id' in r.data.profile), 'le profil public ne montre pas l’identifiant');
assert.deepEqual(
  [r.data.profile.king, r.data.profile.board, r.data.profile.skin, r.data.profile.seal],
  demoShop ? ['king:braise', 'board:obsidian', 'skin:inferno', 'col:neon'] : ['king:arcane', 'board:arcane', 'skin:arcane', null],
  'profil public : roi, échiquier, sorts et sceau',
);
r = await alice.api('/users/personne_ici');
assert.equal(r.status, 404);
r = await alice.api('/leaderboard');
assert.ok(r.data.players.every(p => p.seal === null || /^col:/.test(p.seal)), 'classement : un sceau (ou null) par joueur');
assert.ok(r.data.players.every(p => !('items' in p)), 'classement : la collection n’est pas exposée');
r = await alice.api('/account/export');
assert.ok(r.data.profile && !('password_hash' in r.data.profile));
r = await alice.api('/account', { password: 'mauvais' }, 'DELETE');
assert.equal(r.status, 400);
r = await alice.api('/account', { password: 'motdepasse123' }, 'DELETE');
assert.equal(r.status, 200);
r = await alice.api('/me');
assert.equal(r.data.user, null);
step('profil public (roi, échiquier, sorts, sceau), classement avec sceaux, export RGPD sans mot de passe, suppression du compte');

alice.close();
bob.close();
console.log('\nTous les tests d’intégration sont passés.');
process.exit(0);
