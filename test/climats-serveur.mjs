// Vérification indépendante du catalogue Pouvoirs (identifiant 'climats') sur un vrai serveur (vérificateur,
// flux A), mise à jour pour la décision du fondateur du 30 octobre (8 cartes, mains visibles, Mur permanent).
// Usage : ./node_modules/.bin/tsx test/climats-serveur.mjs http://localhost:3171 [sablier] [mur] [ia] [redemarrage] [drapeau]
//         node scripts/serveur-jetable.mjs -- ./node_modules/.bin/tsx test/climats-serveur.mjs {base} sablier mur ia
// (sans scénario : sablier, mur, ia ; « redemarrage » et « drapeau » seulement sur demande ; adresse : argument, sinon
// SPELLMATE_BASE du serveur jetable)
// (tsx : le script importe le moteur partagé pour choisir des coups légaux.)
// Rien n'est recopié des règles : le nombre de cartes vient des règles de chaque partie (rulesOf de son état, connu dès
// sa création) et de la vue du choix (count, pool, totalMs), les réserves de poolOf. Les scénarios sablier, mur,
// redemarrage et drapeau choisissent une main précise : avec le tirage partout (DEAL.draft faux), ils sont sautés ;
// sablier et drapeau suivent un calendrier écrit pour un Présage à 2 demi-coups et la carte avant le coup, mur la
// carte avant le coup : sautés sinon (SPELLMATE_TEST_RULES). IA_CARTES_PAR_TOUR=n (avec {"cardsPerTurn":n} et
// IA_GAMES=10) exige que l'IA ait joué n cartes dans un même tour.
// Variables : RESTART_CMD (commande qui redémarre l'instance en gardant sa base, pour « redemarrage »),
//             IA_GAMES (nombre de parties contre l'IA, 4 par défaut), IA_PLIES (120), THINK_MS (réflexion avant
//             l'arrêt du serveur, 2000).
// Chaque mise à jour reçue passe par un audit des mains visibles : les deux mains, exactes et complètes, pour les
// joueurs comme pour les spectateurs, et aucun instantané hors Duel. Pendant le choix des cartes (décision D5), l'audit
// vérifie le secret : mains vides, et seulement ses propres cartes dans la vue du choix.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { legalMovesOf, cardOptions, cardPlayable } from '../src/shared/game.ts';
import { CARDS } from '../src/shared/cards.ts';
import { chooseBotMove } from '../src/shared/bot.ts';
import { poolOf, rulesOf } from '../src/shared/rulesCore.ts';
import { Client as BaseClient, baseUrl, sleep, sq } from './lib/client.mjs';

const BASE = baseUrl(process.argv[2]?.startsWith('http') ? process.argv[2] : undefined);
const WANT = new Set(process.argv.slice(process.argv[2]?.startsWith('http') ? 3 : 2));
const all = WANT.size === 0;
const name = i => String.fromCharCode(97 + (i & 7)) + ((i >> 3) + 1);
const log = (...a) => console.log(...a);
const problems = [];
const problem = (msg) => { problems.push(msg); console.log('PROBLÈME :', msg); };

/** Vérité : mains de chaque camp, apprises de la première vue reçue (elles ne changent jamais). */
const truth = new Map(); // gameId -> { w: string[], b: string[] }

/** Client de test/lib (cookies, API), avec un nom, un curseur de lecture et l'audit de chaque vue reçue. */
class Client extends BaseClient {
  constructor(label) { super(BASE); this.label = label; this.cursor = 0; }
  cookie() { return this.cookieHeader(); }
  connect() {
    this.socket?.close();
    this.socket = io(BASE, { transports: ['websocket'], reconnection: false, extraHeaders: { cookie: this.cookie() } });
    this.socket.on('game:update', u => {
      u.at = Date.now();
      audit(this, u.view, `update ${u.event.type}`);
      this.updates.push(u);
    });
    return new Promise((r, j) => { this.socket.on('connect', r); this.socket.on('connect_error', j); });
  }
  emit(ev, payload) { return new Promise(r => this.socket.emit(ev, payload, r)); }
  async join(id, nameArg, sit) {
    const j = await this.emit('game:join', { id, ...(nameArg ? { name: nameArg } : {}), ...(sit === false ? { sit: false } : {}) });
    if (j.view) audit(this, j.view, 'join');
    return j;
  }
  /** Prochaine mise à jour (après le curseur) qui vérifie `pred`. */
  async next(pred, ms = 15000, what = '') {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      for (let i = this.cursor; i < this.updates.length; i++) {
        if (pred(this.updates[i])) { this.cursor = i + 1; return this.updates[i]; }
      }
      await sleep(20);
    }
    throw new Error(`${this.label} : mise à jour attendue non reçue (${what || pred})`);
  }
  last() { return this.updates[this.updates.length - 1]; }
  skip() { this.cursor = this.updates.length; }
  close() { this.socket?.close(); }
}

/** Cartes choisies par chaque joueur, connues du script (pour vérifier le secret pendant le choix). */
const picked = new Map(); // gameId -> { w?: string[], b?: string[] }

/** Audit des mains visibles d'une vue reçue par `client`. */
function audit(client, view, where) {
  const s = view.state;
  if (view.draft) {
    if (s.hands.w.length || s.hands.b.length) problem(`${client.label} ${where} : mains visibles pendant le choix des cartes`);
    const mine = view.draft.mine ?? [];
    if (!view.you && mine.length) problem(`${client.label} ${where} : un spectateur voit des cartes choisies`);
    const other = view.you ? picked.get(view.id)?.[view.you === 'w' ? 'b' : 'w'] : null;
    if (other && !view.draft.chosen[view.you] && JSON.stringify(mine) === JSON.stringify(other)) {
      problem(`${client.label} ${where} : la vue du choix montre les cartes adverses`);
    }
    return;
  }
  // Invitation en attente : les mains seront choisies à l'arrivée de l'adversaire.
  if (view.status === 'waiting') return;
  const hands = { w: s.hands.w.map(h => h.card), b: s.hands.b.map(h => h.card) };
  if (!truth.has(view.id)) truth.set(view.id, hands);
  const t = truth.get(view.id);
  if ((s.snaps ?? []).length) problem(`${client.label} ${where} : instantanés hors Duel`);
  for (const c of ['w', 'b']) {
    if (s.catalog === 'climats' && hands[c].length !== rulesOf(s).cardsPerPlayer) problem(`${client.label} ${where} : main ${c} incomplète (${hands[c]})`);
    s.hands[c].forEach((h, i) => {
      if (!h.card || !CARDS[h.card]) problem(`${client.label} ${where} : carte ${c}[${i}] cachée ou inconnue (${h.card})`);
    });
    if (JSON.stringify(hands[c]) !== JSON.stringify(t[c])) problem(`${client.label} ${where} : main ${c} différente (${hands[c]} au lieu de ${t[c]})`);
  }
}

const step = (name) => log('✓', name);
/** JSON à clés triées (la base JSONB ne garde pas l'ordre des clés). */
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const stamp = Date.now().toString(36);
let guestN = 0;
async function guest() {
  const c = new Client(`invité${++guestN}`);
  await c.api('/me');
  await c.connect();
  return c;
}

const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
/** Mains possibles (`n` cartes différentes) d'une réserve, dans un ordre au hasard. */
function handsOf(pool, n) {
  const out = [];
  const pick = (from, hand) => {
    if (hand.length === n) return void out.push(shuffle(hand));
    for (let i = from; i < pool.length; i++) pick(i + 1, [...hand, pool[i]]);
  };
  pick(0, []);
  return shuffle(out);
}
const POOL = { timed: poolOf('climats', { timed: true }), untimed: poolOf('climats', { timed: false }) };
/** Le serveur tire les mains au lieu de les faire choisir (DEAL.draft faux) : connu à la première invitation. */
let drawing = false;

/** Choix prévus pour une invitation : le créateur prend `hand`, l'invité la même main (`mirror`) ou trois cartes au hasard. */
const planned = new Map();

/** Crée une invitation où les Blancs choisiront une main qui vérifie `pred` (décision D5 : chacun choisit ses cartes). */
async function inviteWith(creator, pred, opts = {}) {
  const tc = opts.tc ?? '3+2';
  const r = await creator.api('/games', { mode: 'invite', tc, color: 'w', catalog: 'climats', name: 'Alice' });
  if (r.status !== 200) throw new Error(`création refusée : ${r.status} ${JSON.stringify(r.data)}`);
  const id = r.data.id;
  const j = await creator.join(id);
  assert.equal(j.ok, true);
  // Cartes par joueur : règles de la partie, photographiées dans son état dès sa création.
  const count = rulesOf(j.view.state).cardsPerPlayer;
  const pool = tc === 'none' ? POOL.untimed : POOL.timed;
  const hand = handsOf(pool, count).find(pred);
  if (!hand) throw new Error('aucune main ne vérifie la condition');
  planned.set(id, { creator, hand, count, mirror: !!opts.mirror, pool });
  return { id, hand };
}

/** Phase de choix d'une partie entre deux joueurs : chacun valide, puis la révélation arrive aux deux. */
async function draftBoth(id, white, black, wHand, bHand) {
  picked.set(id, { w: wHand, b: bHand });
  let a = await white.emit('game:draft', { id, cards: wHand });
  assert.equal(a.ok, true, `choix blanc refusé : ${a.error}`);
  const d = await black.next(x => x.event.type === 'draft' || x.event.type === 'reveal', 8000, 'choix blanc signalé');
  if (d.event.type === 'draft') assert.equal(d.view.draft.chosen.w, true);
  a = await black.emit('game:draft', { id, cards: bHand });
  assert.equal(a.ok, true, `choix noir refusé : ${a.error}`);
  const u = await black.next(x => x.event.type === 'reveal', 8000, 'révélation (Noirs)');
  await white.next(x => x.event.type === 'reveal', 8000, 'révélation (Blancs)');
  assert.deepEqual(u.view.state.hands.w.map(h => h.card), wHand);
  assert.deepEqual(u.view.state.hands.b.map(h => h.card), bHand);
  return u;
}

/** Choix seul (contre l'IA, qui a déjà choisi) : `count` cartes au hasard dans la réserve, puis la révélation. */
async function draftAlone(client, id, view) {
  if (!view.draft) return view;
  const cards = shuffle(view.draft.pool).slice(0, view.draft.count);
  const a = await client.emit('game:draft', { id, cards });
  assert.equal(a.ok, true, `choix refusé : ${a.error}`);
  const u = await client.next(x => x.event.type === 'reveal', 15000, 'révélation');
  return u.view;
}

async function seatBob(bob, id) {
  let j = await bob.join(id);
  if (j.needName) j = await bob.join(id, 'Bob');
  assert.equal(j.view.status, 'active');
  assert.equal(j.view.you, 'b');
  const plan = planned.get(id);
  if (!plan || !j.view.draft) return j;
  assert.equal(j.view.draft.count, plan.count, 'nombre de cartes du choix : celui des règles de la partie');
  const other = handsOf(plan.pool, plan.count)[0];
  const u = await draftBoth(id, plan.creator, bob, plan.hand, plan.mirror ? plan.hand.slice() : other);
  return { ok: true, view: u.view };
}

/** Joue un coup et attend que les deux joueurs l'aient reçu. Renvoie la mise à jour de `a`. */
async function move(id, mover, other, from, to, promo) {
  const ack = await mover.emit('game:move', { id, from: sq(from), to: sq(to), ...(promo ? { promo } : {}) });
  if (!ack.ok) throw new Error(`${mover.label} ${from}-${to} refusé : ${ack.error}`);
  const u = await mover.next(x => x.event.type === 'move' || x.event.type === 'end', 15000, `coup ${from}-${to}`);
  await other.next(x => x.event.type === 'move' || x.event.type === 'end', 15000, `coup ${from}-${to} (adversaire)`);
  return u;
}

const near = (got, want, tol, msg) => {
  const ok = Math.abs(got - want) <= tol;
  log(`   ${ok ? 'ok' : 'ÉCART'} ${msg} : obtenu ${Math.round(got)} ms, attendu ${Math.round(want)} ± ${tol}`);
  if (!ok) problem(`${msg} : obtenu ${Math.round(got)} ms, attendu ${Math.round(want)} ± ${tol}`);
};

// ---------------------------------------------------------------------------------------------
// 1. Sablier fou mesuré entre deux humains (3+2), avec un spectateur ; fin par mat.
async function sablier() {
  log('\n== Sablier fou (3+2), deux invités et un spectateur ==');
  const alice = await guest(); alice.label = 'Alice';
  const bob = await guest(); bob.label = 'Bob';
  const spec = await guest(); spec.label = 'Spectateur';
  const { id, hand } = await inviteWith(alice, h => h.includes('hourglass'));
  const hIdx = hand.indexOf('hourglass');
  log(`   partie ${id}, main blanche ${hand.join(', ')}`);
  await seatBob(bob, id);
  const js = await spec.join(id, undefined, false);
  assert.equal(js.view.you, null);
  assert.deepEqual(js.view.state.hands.w.map(h => h.card), hand, 'spectateur : main blanche visible');
  assert.ok(js.view.state.hands.b.every(h => h.card && CARDS[h.card]), 'spectateur : main noire visible');
  await move(id, alice, bob, 'e2', 'e4');
  await move(id, bob, alice, 'e7', 'e5');
  // Ply 2 : la pendule des Blancs tourne. Annonce du Sablier.
  await sleep(300);
  let a = await alice.emit('game:card', { id, index: hIdx, targets: [] });
  assert.equal(a.ok, true, `Sablier refusé : ${a.error}`);
  const ub = await bob.next(x => x.event.type === 'card', 8000, 'carte (Bob)');
  const us = await spec.next(x => x.event.type === 'card', 8000, 'carte (spectateur)');
  for (const [who, u] of [['Bob', ub], ['spectateur', us]]) {
    const e = u.view.state.effects.find(x => x.card === 'hourglass');
    assert.ok(e && e.pending && e.delay === rulesOf(u.view.state).presageDelay, `${who} voit le Présage du Sablier avec son délai`);
    assert.equal(u.view.state.hands.w[hIdx].card, 'hourglass');
    assert.equal(u.view.clock.rate.w, 1);
    assert.equal(u.view.clock.noIncrement, false);
  }
  step('Présage du Sablier visible des deux joueurs et du spectateur, rythme encore normal');

  // Ply 2 → 3 : coup blanc au rythme normal, avec incrément (Sablier seulement annoncé).
  let ua = await alice.next(x => x.event.type === 'card');
  let before = ua.view.clock.w - (Date.now() - ua.view.clock.serverNow) * 0; // valeur à l'envoi
  let t0 = ua.view.clock.serverNow;
  await sleep(1000);
  let u = await move(id, alice, bob, 'f1', 'c4');
  let spent = u.view.clock.serverNow - t0;
  near(before - u.view.clock.w, spent * 1 - 2000, 150, 'Blancs, coup annoncé (×1, incrément 2 s)');
  // Ply 3 → 4 : coup noir, arrivée du Sablier à la fin de ce coup (incrément encore dû).
  before = u.view.clock.b; t0 = u.view.clock.serverNow;
  await sleep(1000);
  const arrivalAck = await bob.emit('game:move', { id, from: sq('a7'), to: sq('a6') });
  assert.ok(arrivalAck.ok);
  u = await bob.next(x => x.event.type === 'move');
  ua = await alice.next(x => x.event.type === 'move');
  spent = u.view.clock.serverNow - t0;
  near(before - u.view.clock.b, spent - 2000, 150, 'Noirs, coup qui fait arriver le Sablier (×1, incrément 2 s)');
  assert.ok(u.event.info.arrived?.length, 'arrivée signalée (MoveInfo.arrived)');
  assert.deepEqual(u.view.clock.rate, { w: 2, b: 2 }, 'les deux pendules à ×2');
  assert.equal(u.view.clock.noIncrement, true, 'incrément suspendu');
  step('arrivée du Sablier : ×2 pour les deux, incrément suspendu');

  // 6 coups à ×2 sans incrément (3 chacun).
  const seq = [['w', 'b1', 'c3'], ['b', 'a6', 'a5'], ['w', 'd2', 'd3'], ['b', 'h7', 'h6'], ['w', 'd1', 'f3'], ['b', 'h6', 'h5']];
  let last = ua;
  for (const [c, f, t] of seq) {
    const [m, o] = c === 'w' ? [alice, bob] : [bob, alice];
    const b0 = last.view.clock[c];
    const s0 = last.view.clock.serverNow;
    await sleep(800);
    last = await move(id, m, o, f, t);
    const sp = last.view.clock.serverNow - s0;
    near(b0 - last.view.clock[c], 2 * sp, 200, `${c === 'w' ? 'Blancs' : 'Noirs'} ${f}-${t} sous le Sablier (×2, sans incrément)`);
  }
  assert.ok(last.event.info.expired?.length, 'expiration signalée après 6 coups');
  assert.deepEqual(last.view.clock.rate, { w: 1, b: 1 }, 'retour au rythme normal');
  assert.equal(last.view.clock.noIncrement, false);
  step('6 coups sous le Sablier (3 chacun), puis retour à ×1 avec incrément');
  // Fin : Dxf7#.
  const b0 = last.view.clock.w; const s0 = last.view.clock.serverNow;
  await sleep(500);
  a = await alice.emit('game:move', { id, from: sq('f3'), to: sq('f7') });
  assert.ok(a.ok, a.error);
  const mv = await bob.next(x => x.event.type === 'move' || x.event.type === 'end', 8000, 'Dxf7');
  // La mise à jour du coup précède celle de la fin : c'est le résultat de l'état qui dit s'il y a mat (le statut est
  // encore « active » dans la mise à jour du coup qui mate).
  if (!mv.view.state.result) {
    // R4c : les Noirs ont une carte qui sauve du mat : la partie continue.
    const sb = mv.view.state;
    const saving = sb.hands.b.map((h, i) => [h.card, i]).filter(([, i]) => cardPlayable(sb, 'b', i)).map(([c]) => c);
    log(`   Dxf7 : pas de mat, les Noirs ont une carte qui sauve (R4c) : ${saving.join(', ')} ; coups légaux : ${legalMovesOf(sb).length}`);
    assert.equal(legalMovesOf(sb).length, 0);
    assert.ok(saving.length > 0);
    await bob.emit('game:resign', { id });
  }
  const end = await bob.next(x => x.event.type === 'end', 8000, 'fin');
  assert.equal(end.view.status, 'ended');
  assert.ok(['checkmate', 'resign'].includes(end.view.state.result.reason) && end.view.state.result.winner === 'w', JSON.stringify(end.view.state.result));
  assert.ok(end.view.state.hands.w.every(h => h.card), 'mains visibles en fin de partie');
  const endA = await alice.next(x => x.event.type === 'end', 8000, 'fin (Alice)');
  log(`   pendule blanche à la fin : ${endA.view.clock.w} ms (avant : ${b0})`);
  step('mat Dxf7#, résultat et mains visibles en fin de partie');
  for (const c of [alice, bob, spec]) c.close();
}

// ---------------------------------------------------------------------------------------------
// 2. Mur de glace permanent : rangées 3 à 6, visible de tous, il reste jusqu'à la fin de la partie.
async function mur() {
  log('\n== Mur de glace permanent (3+2), avec un spectateur ==');
  const alice = await guest(); alice.label = 'Alice';
  const bob = await guest(); bob.label = 'Bob';
  const spec = await guest(); spec.label = 'Spectateur';
  const { id, hand } = await inviteWith(alice, h => h.includes('ice_wall'));
  const wIdx = hand.indexOf('ice_wall');
  log(`   partie ${id}, main blanche ${hand.join(', ')}`);
  const jb = await seatBob(bob, id);
  assert.deepEqual(jb.view.state.hands.w.map(h => h.card), hand, 'Bob voit la main blanche');
  await spec.join(id, undefined, false);
  await move(id, alice, bob, 'e2', 'e4');
  await move(id, bob, alice, 'e7', 'e5');
  // e2 (2e rangée) est vide, mais hors des rangées 3 à 6 : refusé.
  let a = await alice.emit('game:card', { id, index: wIdx, targets: [sq('e2')] });
  assert.equal(a.ok, false, 'Mur hors des rangées 3 à 6 refusé');
  a = await alice.emit('game:card', { id, index: wIdx, targets: [sq('d3')] });
  assert.ok(a.ok, a.error);
  for (const c of [alice, bob, spec]) {
    const u = await c.next(x => x.event.type === 'card', 8000, `Mur (${c.label})`);
    const w = u.view.state.effects.find(e => e.card === 'ice_wall');
    assert.ok(w && w.permanent && w.square === sq('d3') && w.remaining === 0, `${c.label} voit le Mur permanent en d3`);
    assert.deepEqual(u.view.state.hands.w[wIdx], { card: 'ice_wall', used: true });
  }
  step('Mur en d3 (2e rangée refusée), permanent, visible des deux joueurs et du spectateur');
  // 12 demi-coups (sans répétition) : le Mur reste ; il bloque le pion d2 et la diagonale f1-c4.
  const plies = [['w', 'g1', 'f3'], ['b', 'b8', 'c6'], ['w', 'b1', 'c3'], ['b', 'g8', 'f6'], ['w', 'a2', 'a3'], ['b', 'a7', 'a6'],
    ['w', 'h2', 'h3'], ['b', 'h7', 'h6'], ['w', 'a3', 'a4'], ['b', 'a6', 'a5'], ['w', 'h3', 'h4'], ['b', 'h6', 'h5']];
  let u;
  for (const [c, f, t] of plies) u = c === 'w' ? await move(id, alice, bob, f, t) : await move(id, bob, alice, f, t);
  assert.ok(u.view.state.effects.some(e => e.card === 'ice_wall' && e.square === sq('d3')), 'le Mur reste après 12 demi-coups');
  const sw = alice.last().view.state;
  assert.ok(!legalMovesOf(sw).some(m => m.from === sq('d2')), 'le pion d2 est bloqué par le Mur');
  a = await alice.emit('game:move', { id, from: sq('f1'), to: sq('c4') });
  assert.equal(a.ok, false, 'le Mur coupe la diagonale f1-c4');
  a = await alice.emit('game:move', { id, from: sq('f1'), to: sq('e2') });
  assert.ok(a.ok, a.error);
  await bob.next(x => x.event.type === 'move'); await alice.next(x => x.event.type === 'move');
  step('le Mur reste toute la partie et bloque les deux camps');
  a = await bob.emit('game:resign', { id });
  assert.ok(a.ok);
  const end = await alice.next(x => x.event.type === 'end');
  assert.ok(end.view.state.effects.some(e => e.card === 'ice_wall'), 'le Mur est encore là en fin de partie');
  step('abandon : fin de partie');
  for (const c of [alice, bob, spec]) c.close();
}

// ---------------------------------------------------------------------------------------------
// 3. Contre l'IA, catalogue Pouvoirs : l'humain joue au hasard (coups et cartes), on mesure l'IA.
function randomTargets(s, color, index) {
  const need = CARDS[s.hands[color][index].card].targets;
  const out = [];
  for (let k = 0; k < need; k++) {
    const o = cardOptions(s, color, index, out);
    if (!o.length) return null;
    out.push(o[Math.floor(Math.random() * o.length)]);
  }
  return out;
}

async function botGame(level, tc, maxPlies) {
  const me = await guest(); me.label = `Humain-IA${level}`;
  const r = await me.api('/games', { mode: 'bot', tc, color: Math.random() < 0.5 ? 'w' : 'b', level, catalog: 'climats', name: 'Humain' });
  if (r.status !== 200) throw new Error(`création IA refusée : ${r.status} ${JSON.stringify(r.data)}`);
  const id = r.data.id;
  const j = await me.join(id);
  const you = j.view.you;
  const bot = you === 'w' ? 'b' : 'w';
  const stats = { id, level, tc, you, botCards: [], humanCards: [], botMs: [], plies: 0, result: null, errors: [], relaxed: 0, maxTurnCards: 0 };
  // Cartes de l'IA dans le tour en cours : jamais plus que les règles de la partie (cardsPerTurn) ; le plus grand nombre
  // joué en un tour est relevé (avec {"cardsPerTurn":2}, l'IA doit en jouer deux : IA_CARTES_PAR_TOUR).
  let turnCards = 0;
  const seeBot = u => {
    if (u.event.type === 'card' && u.event.info.caster === bot) {
      stats.botCards.push(u.event.info.card);
      turnCards++;
      stats.maxTurnCards = Math.max(stats.maxTurnCards, turnCards);
      const max = rulesOf(u.view.state).cardsPerTurn;
      if (turnCards > max) stats.errors.push(`l'IA a joué ${turnCards} cartes dans un tour (au plus ${max})`);
    }
    if (u.view.state.pos.turn !== bot) turnCards = 0;
  };
  if (j.view.draft?.pool.includes('hourglass')) problem(`partie IA ${id} : Sablier fou proposé`);
  let view = await draftAlone(me, id, j.view);
  const t0 = Date.now();
  while (view.status === 'active' && !view.state.result && view.state.ply < maxPlies) {
    const s = view.state;
    if (s.pos.turn === you) {
      // Carte au hasard (30 %) avant le coup.
      if (!s.cardPlayed && Math.random() < 0.15) {
        const idx = s.hands[you].map((h, i) => i).filter(i => !s.hands[you][i].used && cardPlayable(s, you, i));
        if (idx.length) {
          const i = idx[Math.floor(Math.random() * idx.length)];
          const t = randomTargets(s, you, i);
          if (t) {
            const a = await me.emit('game:card', { id, index: i, targets: t });
            if (a.ok) {
              stats.humanCards.push(s.hands[you][i].card);
              const u = await me.next(x => x.event.type === 'card' || x.event.type === 'end', 15000, 'carte humaine');
              view = u.view;
              continue;
            } else stats.errors.push(`carte humaine refusée alors que jouable : ${s.hands[you][i].card} ${t} : ${a.error}`);
          }
        }
      }
      const moves = legalMovesOf(s);
      if (!moves.length) {
        // R4c : sans coup, une carte doit être jouée.
        const idx = s.hands[you].map((h, i) => i).filter(i => cardPlayable(s, you, i));
        if (!idx.length) { stats.errors.push('humain sans coup ni carte, partie non terminée'); break; }
        const t = randomTargets(s, you, idx[0]);
        const a = await me.emit('game:card', { id, index: idx[0], targets: t });
        if (!a.ok) { stats.errors.push(`carte obligatoire refusée : ${a.error}`); break; }
        view = (await me.next(x => x.event.type === 'card' || x.event.type === 'end', 15000, 'carte R4c')).view;
        continue;
      }
      // Coups : IA partagée de niveau 2 côté client (comme l'accueil), un coup sur quatre au hasard.
      const m = Math.random() < 0.25 ? moves[Math.floor(Math.random() * moves.length)] : chooseBotMove(s, 2) ?? moves[0];
      const a = await me.emit('game:move', { id, from: m.from, to: m.to, ...(m.promo ? { promo: m.promo } : {}) });
      if (!a.ok) { stats.errors.push(`coup humain refusé ${name(m.from)}-${name(m.to)} : ${a.error}`); break; }
      const sent = Date.now();
      view = (await me.next(x => x.event.type === 'move' || x.event.type === 'end', 15000, 'coup humain')).view;
      if (view.status !== 'active') break;
      // Réponse de l'IA : une ou plusieurs mises à jour (carte puis coup) jusqu'à ce que le trait revienne.
      while (view.status === 'active' && !view.state.result && view.state.pos.turn === bot) {
        const u = await me.next(() => true, 30000, `réponse de l'IA (ply ${view.state.ply})`);
        seeBot(u);
        if (u.event.type === 'move' && u.event.color === bot) {
          stats.botMs.push(u.at - sent);
          if (u.event.info.move.flags & 1024) stats.relaxed++;
        }
        view = u.view;
      }
    } else {
      // L'IA commence (Blancs) ou rejoue après un Rituel humain
      const sent = Date.now();
      const u = await me.next(() => true, 30000, `IA (ply ${s.ply})`);
      seeBot(u);
      if (u.event.type === 'move' && u.event.color === bot) stats.botMs.push(u.at - sent);
      view = u.view;
    }
  }
  stats.plies = view.state.ply;
  if (view.status === 'active' && !view.state.result) {
    await me.emit('game:resign', { id });
    view = (await me.next(x => x.event.type === 'end', 8000, 'fin')).view;
  }
  if (view.status === 'active') view = (await me.next(x => x.event.type === 'end', 8000, 'fin')).view;
  stats.result = view.state.result;
  stats.hands = { w: view.state.hands.w.map(h => h.card), b: view.state.hands.b.map(h => h.card) };
  stats.durationS = Math.round((Date.now() - t0) / 1000);
  if ([...stats.hands.w, ...stats.hands.b].includes('hourglass')) problem(`partie IA ${id} : Sablier fou distribué`);
  me.close();
  return stats;
}

async function ia() {
  log('\n== Parties contre l’IA, catalogue Pouvoirs ==');
  const n = Number(process.env.IA_GAMES ?? 4);
  const jobs = [];
  for (let k = 0; k < n; k++) jobs.push(botGame(k % 2 ? 3 : 2, k % 2 ? 'none' : '10+0', Number(process.env.IA_PLIES ?? 120)));
  const res = await Promise.all(jobs);
  for (const s of res) {
    const ms = s.botMs.slice().sort((a, b) => a - b);
    const avg = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
    log(`   ${s.id} IA${s.level} ${s.tc} humain=${s.you} plies=${s.plies} résultat=${JSON.stringify(s.result)} durée=${s.durationS}s`);
    log(`     cartes IA : ${s.botCards.join(', ') || 'aucune'} | humain : ${s.humanCards.join(', ') || 'aucune'} | mains : w=${s.hands.w} b=${s.hands.b}`);
    log(`     réponse IA : moy ${Math.round(avg)} ms, médiane ${ms[ms.length >> 1]} ms, max ${ms[ms.length - 1]} ms (${ms.length} coups) ; coups « la magie cède » de l'IA : ${s.relaxed} ; au plus ${s.maxTurnCards} carte(s) de l'IA en un tour`);
    for (const e of s.errors) problem(`partie IA ${s.id} : ${e}`);
  }
  // IA_CARTES_PAR_TOUR=n : l'IA doit avoir joué n cartes dans un même tour au moins une fois (serveur à n cartes par tour).
  const attendu = Number(process.env.IA_CARTES_PAR_TOUR ?? 0);
  const vu = Math.max(0, ...res.map(s => s.maxTurnCards));
  if (attendu && vu < attendu) problem(`l'IA n'a jamais joué ${attendu} cartes dans un même tour (au plus ${vu})`);
  return res;
}

// ---------------------------------------------------------------------------------------------
// 4. Redémarrage du serveur en cours de partie, effets actifs (Terrain) et annoncé (Présage).
async function redemarrage() {
  log('\n== Redémarrage du serveur en cours de partie ==');
  const cmd = process.env.RESTART_CMD;
  assert.ok(cmd, 'RESTART_CMD manquant');
  await redemarrageChoix(cmd);
  let alice = await guest(); alice.label = 'Alice';
  let bob = await guest(); bob.label = 'Bob';
  const terr = h => h.includes('ice_wall') || h.includes('rift');
  const pres = ['truce', 'ice_age', 'blast', 'blood_moon', 'hourglass'];
  const { id, hand } = await inviteWith(alice, h => terr(h) && h.some(c => pres.includes(c)), { mirror: true });
  log(`   partie ${id}, mains (miroir) ${hand.join(', ')}`);
  await seatBob(bob, id);
  await move(id, alice, bob, 'e2', 'e4');
  await move(id, bob, alice, 'e7', 'e5');
  // Alice : Terrain immédiat (Mur en h4 ou Faille en 4e rangée).
  const s = alice.last().view.state;
  const ti = hand.findIndex(terr);
  const opts = cardOptions(s, 'w', ti);
  const target = hand[ti] === 'ice_wall' ? (opts.includes(sq('h4')) ? sq('h4') : opts[0]) : opts.find(q => q >> 3 === 3) ?? opts[0];
  let a = await alice.emit('game:card', { id, index: ti, targets: [target] });
  assert.ok(a.ok, a.error);
  await alice.next(x => x.event.type === 'card'); await bob.next(x => x.event.type === 'card');
  await move(id, alice, bob, 'g1', 'f3');
  // Bob : Présage (annoncé, arrive après le prochain coup blanc).
  const sb = bob.last().view.state;
  const pi = sb.hands.b.findIndex(h => !h.used && pres.includes(h.card) && cardPlayable(sb, 'b', sb.hands.b.indexOf(h)));
  let presage = null;
  if (pi >= 0) {
    a = await bob.emit('game:card', { id, index: pi, targets: [] });
    if (a.ok) { presage = sb.hands.b[pi].card; await alice.next(x => x.event.type === 'card'); await bob.next(x => x.event.type === 'card'); }
  }
  log(`   Présage noir : ${presage ?? 'aucun'}`);
  let u = await move(id, bob, alice, 'b8', 'c6');
  await sleep(Number(process.env.THINK_MS ?? 2000)); // la pendule blanche tourne avant l'arrêt
  const preU = alice.last();
  const pre = preU.view;
  pre.at = preU.at;
  const tStopReq = Date.now();
  const preState = canon({ pos: pre.state.pos, effects: pre.state.effects, ply: pre.state.ply, hands: pre.state.hands });
  const preClock = pre.clock;
  log(`   avant l'arrêt : ply ${pre.state.ply}, effets ${pre.state.effects.map(e => `${e.card}(${e.pending ? 'annoncé ' + e.delay : e.remaining})`).join(', ')}, pendule w ${preClock.w} (envoyée il y a ${Date.now() - pre.at} ms)`);
  alice.close(); bob.close();
  const tStop = Date.now();
  execSync(cmd, { stdio: 'inherit' });
  log(`   serveur redémarré en ${Date.now() - tStop} ms`);
  // Reconnexion (mêmes cookies)
  await alice.connect(); await bob.connect();
  alice.updates = []; alice.cursor = 0; bob.updates = []; bob.cursor = 0;
  const ja = await alice.join(id);
  const jb = await bob.join(id);
  assert.ok(ja.ok && jb.ok, 'reprise de la partie');
  const post = ja.view;
  const postState = canon({ pos: post.state.pos, effects: post.state.effects, ply: post.state.ply, hands: post.state.hands });
  if (postState !== preState) {
    const a1 = JSON.parse(preState), b1 = JSON.parse(postState);
    for (const k of Object.keys(a1)) if (JSON.stringify(a1[k]) !== JSON.stringify(b1[k])) log(`   diff ${k} :\n     avant ${JSON.stringify(a1[k])}\n     après ${JSON.stringify(b1[k])}`);
    problem('état différent après redémarrage');
  }
  else step('état identique après redémarrage (position, effets actifs et annoncés, mains)');
  // Pendule : le temps écoulé avant l'arrêt (2 s depuis le début du tour) doit rester décompté.
  const elapsedBefore = tStopReq - pre.clock.serverNow; // réflexion blanche entre l'envoi de la vue et l'ordre d'arrêt
  const sinceRestart = Date.now() - tStop; // ordre d'arrêt → reprise vue (le serveur était arrêté une partie de ce temps)
  log(`   pendule blanche : avant l'arrêt ${preClock.w} (+≈${elapsedBefore} ms écoulées ensuite), après reprise ${post.clock.w}, en marche : ${post.clock.running}`);
  // Valeur attendue : au plus ce qu'elle valait à l'arrêt (≈ preClock.w − 2000).
  log(`   réflexion avant l'ordre d'arrêt : ${elapsedBefore} ms ; ordre d'arrêt → vue après reprise : ${sinceRestart} ms`);
  // Attendu : la pendule garde le temps écoulé avant l'arrêt (≈ elapsedBefore), et ne décompte pas l'arrêt.
  const drop = preClock.w - post.clock.w;
  const okClock = drop >= elapsedBefore - 100;
  log(`   ${okClock ? 'ok' : 'ÉCART'} temps blanc décompté à travers le redémarrage : ${drop} ms (au moins ${elapsedBefore} ms de réflexion avant l’arrêt attendues)`);
  if (!okClock) problem(`redémarrage : la pendule blanche n'a perdu que ${drop} ms alors que les Blancs avaient réfléchi ${elapsedBefore} ms avant l'arrêt (temps rendu : ≈ ${elapsedBefore - drop} ms)`);
  // On continue : les compteurs d'effets reprennent.
  const lm = legalMovesOf(post.state).filter(m => !(m.flags & 1)).sort((x, y) => x.from - y.from)[0];
  u = await move(id, alice, bob, name(lm.from), name(lm.to));
  log(`   après le 3e coup blanc : effets ${u.view.state.effects.map(e => `${e.card}(${e.pending ? 'annoncé ' + e.delay : e.remaining})`).join(', ')} ; arrivés ${JSON.stringify(u.event.info.arrived)}`);
  if (presage) assert.ok(u.event.info.arrived?.length, 'le Présage annoncé avant le redémarrage arrive à son heure');
  step('partie reprise, l’effet annoncé arrive au bon coup');
  a = await bob.emit('game:resign', { id });
  assert.ok(a.ok);
  alice.close(); bob.close();

  // Partie contre l'IA interrompue pendant que l'IA doit jouer.
  const me = await guest(); me.label = 'Humain-redém';
  const r = await me.api('/games', { mode: 'bot', tc: '10+0', color: 'b', level: 2, catalog: 'climats', name: 'Humain' });
  const bid = r.data.id;
  const jb0 = await me.join(bid);
  await draftAlone(me, bid, jb0.view);
  await me.next(x => x.event.type === 'move', 20000, 'premier coup IA');
  const v = me.last().view.state;
  const m = legalMovesOf(v)[0];
  a = await me.emit('game:move', { id: bid, from: m.from, to: m.to });
  assert.ok(a.ok);
  me.close();
  execSync(cmd, { stdio: 'inherit' });
  await me.connect(); me.updates = []; me.cursor = 0;
  const jm = await me.join(bid);
  if (jm.view.state.pos.turn === 'w') {
    const u2 = await me.next(x => x.event.type === 'move' || x.event.type === 'card', 20000, 'IA après redémarrage');
    log(`   l'IA rejoue après redémarrage : ${u2.event.type} ${u2.event.info.san ?? u2.event.info.card}`);
  } else log('   l’IA avait joué avant l’arrêt');
  step('partie contre l’IA reprise après redémarrage');
  await me.emit('game:resign', { id: bid });
  me.close();
}

/**
 * Redémarrage pendant le choix des cartes (décision D5) : le choix validé et la sélection provisoire sont gardés,
 * l'échéance repart entière, puis le choix se termine normalement.
 */
async function redemarrageChoix(cmd) {
  let alice = await guest(); alice.label = 'Alice';
  let bob = await guest(); bob.label = 'Bob';
  const r = await alice.api('/games', { mode: 'invite', tc: '5+0', color: 'w', catalog: 'climats', name: 'Alice' });
  const id = r.data.id;
  await alice.join(id);
  let jb = await bob.join(id);
  if (jb.needName) jb = await bob.join(id, 'Bob');
  assert.ok(jb.view.draft, 'choix ouvert');
  const { count, pool, totalMs } = jb.view.draft;
  const prefer = order => [...new Set([...order.filter(c => pool.includes(c)), ...pool])];
  const W = prefer(['ice_wall', 'blast', 'truce']).slice(0, count);
  const B = prefer(['rift', 'tide', 'ice_age']).slice(0, count);
  const tentative = B.slice(0, Math.min(1, count - 1));
  picked.set(id, { w: W });
  assert.ok((await alice.emit('game:draft', { id, cards: W })).ok);
  assert.ok((await bob.emit('game:draft', { id, cards: tentative, confirm: false })).ok);
  await sleep(5000); // une partie de l'échéance s'écoule avant l'arrêt
  alice.close(); bob.close();
  const tStop = Date.now();
  execSync(cmd, { stdio: 'inherit' });
  log(`   serveur redémarré pendant le choix en ${Date.now() - tStop} ms`);
  await alice.connect(); await bob.connect();
  alice.updates = []; alice.cursor = 0; bob.updates = []; bob.cursor = 0;
  const ja = await alice.join(id);
  jb = await bob.join(id);
  assert.ok(ja.view.draft && jb.view.draft, 'le choix survit au redémarrage');
  assert.deepEqual(ja.view.draft.mine, W, 'choix validé gardé');
  assert.deepEqual(jb.view.draft.mine, tentative, 'sélection provisoire gardée');
  assert.deepEqual(jb.view.draft.chosen, { w: true, b: false });
  assert.deepEqual(jb.view.state.hands, { w: [], b: [] }, 'toujours secret');
  if (jb.view.draft.msLeft < totalMs - 1000) problem(`redémarrage pendant le choix : échéance pas relancée (${jb.view.draft.msLeft} ms)`);
  else step(`choix des cartes repris après redémarrage, échéance relancée (${jb.view.draft.msLeft} ms)`);
  assert.ok((await bob.emit('game:draft', { id, cards: B })).ok);
  const u = await alice.next(x => x.event.type === 'reveal', 8000, 'révélation après redémarrage');
  assert.deepEqual(u.view.state.hands.w.map(h => h.card), W);
  assert.deepEqual(u.view.state.hands.b.map(h => h.card), B);
  step('mains révélées après le redémarrage');
  await alice.emit('game:abort', { id });
  alice.close(); bob.close();
}

// 5. Chute du drapeau sous le Sablier (1+0) : la pendule à ×2 tombe deux fois plus tôt, au bon moment.
async function drapeau() {
  log('\n== Chute du drapeau sous le Sablier fou (1+0) ==');
  const alice = await guest(); alice.label = 'Alice';
  const bob = await guest(); bob.label = 'Bob';
  const { id, hand } = await inviteWith(alice, h => h.includes('hourglass'), { tc: '1+0' });
  await seatBob(bob, id);
  await move(id, alice, bob, 'e2', 'e4');
  await move(id, bob, alice, 'e7', 'e5');
  const a = await alice.emit('game:card', { id, index: hand.indexOf('hourglass'), targets: [] });
  assert.ok(a.ok, a.error);
  await alice.next(x => x.event.type === 'card'); await bob.next(x => x.event.type === 'card');
  await move(id, alice, bob, 'g1', 'f3');
  const u = await move(id, bob, alice, 'b8', 'c6'); // arrivée
  const ua = alice.last();
  assert.equal(ua.view.clock.rate.w, 2);
  const left = ua.view.clock.w;
  const expectAt = ua.view.clock.serverNow + left / 2;
  log(`   Blancs : ${left} ms de pendule à ×2 → chute attendue dans ≈ ${Math.round(left / 2)} ms réelles`);
  const end = await alice.next(x => x.event.type === 'end', left / 2 + 5000, 'chute du drapeau');
  const lag = end.view.clock.serverNow - expectAt;
  log(`   fin : ${JSON.stringify(end.view.state.result)}, écart ${lag} ms, pendule blanche ${end.view.clock.w}`);
  assert.deepEqual(end.view.state.result, { winner: 'b', reason: 'timeout' });
  if (lag < -50 || lag > 600) problem(`drapeau sous le Sablier : écart ${lag} ms`);
  step('drapeau tombé au bon moment sous le Sablier (×2)');
  alice.close(); bob.close();
  void u;
}

/**
 * Le serveur fait-il choisir les cartes, et avec quelles règles crée-t-il ses parties ? Une invitation de test (clients
 * sans audit), annulée aussitôt.
 */
async function serverProbe() {
  const [a, b] = [new BaseClient(BASE), new BaseClient(BASE)];
  for (const c of [a, b]) { await c.api('/me'); await c.connect(); }
  const r = await a.api('/games', { mode: 'invite', tc: '3+2', color: 'w', catalog: 'climats', name: 'Sonde' });
  await a.emit('game:join', { id: r.data.id });
  const j = await b.emit('game:join', { id: r.data.id, name: 'Sonde' });
  await a.emit('game:abort', { id: r.data.id });
  a.close(); b.close();
  return { drafts: !!j.view.draft, rules: rulesOf(j.view.state) };
}

const run = async () => {
  const probe = await serverProbe();
  drawing = !probe.drafts;
  /** Scénario qui choisit une main précise : sauté si le serveur tire les mains. */
  const chosen = async (label, f) => (drawing ? log(`\n== ${label} : sauté (tirage partout, aucune main ne se choisit) ==`) : f());
  // Sablier et drapeau suivent un calendrier écrit coup par coup : carte avant le coup, arrivée du Présage deux
  // demi-coups plus tard. Avec d'autres règles (SPELLMATE_TEST_RULES), ils sont sautés ; ia suit les règles de chaque
  // partie.
  const timed = probe.rules.presageDelay === 2 && !probe.rules.cardEndsTurn;
  const scripted = async (label, f) =>
    timed ? chosen(label, f) : log(`\n== ${label} : sauté (calendrier écrit pour un Présage à 2 demi-coups, la carte avant le coup) ==`);
  if (WANT.has('drapeau')) await scripted('drapeau', drapeau);
  if (all || WANT.has('sablier')) await scripted('sablier', sablier);
  // Le Mur se pose avant le coup des Blancs : sauté si la carte remplace le coup.
  if (all || WANT.has('mur')) {
    await (probe.rules.cardEndsTurn ? log('\n== mur : sauté (scénario écrit pour la carte avant le coup) ==') : chosen('mur', mur));
  }
  if (all || WANT.has('ia')) await ia();
  if (WANT.has('redemarrage')) await chosen('redemarrage', redemarrage);
  log(`\n${problems.length ? `${problems.length} problème(s) :\n - ` + problems.join('\n - ') : 'Aucun problème relevé.'}`);
  process.exit(problems.length ? 1 : 0);
};
run().catch(e => { console.error(e); log(`problèmes relevés avant l'erreur : ${problems.length}`); for (const p of problems) log(' - ' + p); process.exit(2); });
