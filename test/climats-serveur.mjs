// Vérification indépendante du catalogue Climats sur un vrai serveur (vérificateur, flux A).
// Usage : ./node_modules/.bin/tsx test/climats-serveur.mjs http://localhost:3171 [sablier] [dejavu] [ia] [redemarrage] [drapeau]
// (sans scénario : sablier, dejavu, ia ; « redemarrage » et « drapeau » seulement sur demande)
// (tsx : le script importe le moteur partagé pour choisir des coups légaux.)
// Variables : RESTART_CMD (commande qui redémarre l'instance en gardant sa base, pour « redemarrage »),
//             IA_GAMES (nombre de parties contre l'IA, 4 par défaut), IA_PLIES (120), THINK_MS (réflexion avant
//             l'arrêt du serveur, 2000).
// Chaque mise à jour reçue passe par un audit de non-fuite : aucune carte adverse cachée dans la vue, ni dans
// l'objet, ni dans le JSON brut.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { legalMovesOf, cardOptions, cardPlayable } from '../src/shared/game.ts';
import { CARDS } from '../src/shared/cards.ts';
import { chooseBotMove } from '../src/shared/bot.ts';

const BASE = process.argv[2] ?? 'http://localhost:3171';
const WANT = new Set(process.argv.slice(3));
const all = WANT.size === 0;
const sq = s => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const name = i => String.fromCharCode(97 + (i & 7)) + ((i >> 3) + 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const problems = [];
const problem = (msg) => { problems.push(msg); console.log('PROBLÈME :', msg); };

/** Vérité : main réelle de chaque camp, apprise de la vue de son propriétaire. */
const truth = new Map(); // gameId -> { w: string[]|null, b: string[]|null }

class Client {
  constructor(label) { this.label = label; this.cookies = new Map(); this.updates = []; this.cursor = 0; }
  cookie() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async api(path, body, method) {
    const res = await fetch(BASE + '/api' + path, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), cookie: this.cookie(), origin: BASE },
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

/** Audit de non-fuite d'une vue reçue par `client`. */
function audit(client, view, where) {
  const s = view.state;
  const you = view.you;
  const t = truth.get(view.id) ?? { w: null, b: null };
  truth.set(view.id, t);
  if (you) t[you] = s.hands[you].map(h => h.card);
  for (const x of s.snaps ?? []) if ('hands' in x) problem(`${client.label} ${where} : un instantané contient des mains`);
  if (view.status === 'ended') return; // mains révélées en fin de partie (voulu)
  for (const c of ['w', 'b']) {
    if (c === you) continue;
    s.hands[c].forEach((h, i) => {
      if (!h.used && !h.revealed && h.card !== null) problem(`${client.label} ${where} : carte adverse cachée visible (${c}[${i}] = ${h.card})`);
    });
  }
  // JSON brut : les cartes cachées de l'adversaire (connues par sa propre vue) n'apparaissent nulle part,
  // sauf si le même identifiant est légitimement présent (ma main, journal, effets, carte jouée ou rendue).
  const json = JSON.stringify(view);
  for (const c of ['w', 'b']) {
    if (c === you || !t[c]) continue;
    const legit = new Set([
      ...(you ? s.hands[you].map(h => h.card) : []),
      ...s.hands[c].filter(h => h.card).map(h => h.card),
      ...s.log.filter(e => e.k === 'card').map(e => e.card),
      ...s.effects.map(e => e.card),
    ]);
    for (const card of t[c]) {
      if (card && !legit.has(card) && json.includes(`"${card}"`)) problem(`${client.label} ${where} : l'identifiant caché « ${card} » (${c}) figure dans le JSON de la vue`);
    }
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

/** Crée des invitations jusqu'à obtenir une main blanche qui vérifie `pred` (mains au hasard, R9). */
async function inviteWith(creator, pred, opts = {}) {
  for (let k = 0; k < 30; k++) {
    const r = await creator.api('/games', { mode: 'invite', tc: opts.tc ?? '3+2', color: 'w', catalog: 'climats', mirror: !!opts.mirror, name: 'Alice' });
    if (r.status !== 200) throw new Error(`création refusée : ${r.status} ${JSON.stringify(r.data)}`);
    const id = r.data.id;
    const j = await creator.join(id);
    assert.equal(j.ok, true);
    const hand = j.view.state.hands.w.map(h => h.card);
    if (pred(hand)) return { id, hand };
    const a = await creator.emit('game:resign', { id });
    assert.equal(a.ok, true, `annulation de l’invitation : ${a.error}`);
    creator.emit('game:leave', { id });
    await sleep(400); // limiteur par socket (20 actions, 8 par seconde)
  }
  throw new Error('main voulue introuvable en 30 essais');
}

async function seatBob(bob, id) {
  let j = await bob.join(id);
  if (j.needName) j = await bob.join(id, 'Bob');
  assert.equal(j.view.status, 'active');
  assert.equal(j.view.you, 'b');
  return j;
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
  assert.ok(js.view.state.hands.w.every(h => h.card === null) && js.view.state.hands.b.every(h => h.card === null), 'spectateur : mains cachées');
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
    assert.ok(e && e.pending && e.delay === 2, `${who} voit le Présage du Sablier avec son délai`);
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
  if (mv.view.status === 'active') {
    // R4c : les Noirs ont une carte qui sauve du mat (Mur, Faille, Marée, Déjà-vu) : la partie continue.
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
  assert.ok(end.view.state.hands.w.every(h => h.card), 'mains révélées en fin de partie');
  const endA = await alice.next(x => x.event.type === 'end', 8000, 'fin (Alice)');
  log(`   pendule blanche à la fin : ${endA.view.clock.w} ms (avant : ${b0})`);
  step('mat Dxf7#, résultat et mains révélées en fin de partie');
  for (const c of [alice, bob, spec]) c.close();
}

// ---------------------------------------------------------------------------------------------
// 2. Déjà-vu : temps rendu à l'adversaire (pas au lanceur), pièce interdite, carte adverse rendue face visible.
async function dejavu() {
  log('\n== Déjà-vu (3+2) ==');
  const alice = await guest(); alice.label = 'Alice';
  const bob = await guest(); bob.label = 'Bob';
  const { id, hand } = await inviteWith(alice, h => h.includes('deja_vu'));
  const dIdx = hand.indexOf('deja_vu');
  log(`   partie ${id}, main blanche ${hand.join(', ')}`);
  const jb = await seatBob(bob, id);
  const bobHand = jb.view.state.hands.b.map(h => h.card);
  log(`   main noire ${bobHand.join(', ')}`);
  await move(id, alice, bob, 'e2', 'e4');
  await move(id, bob, alice, 'e7', 'e5');
  let u = await move(id, alice, bob, 'g1', 'f3');
  const bobStart = u.view.clock.b; // temps des Noirs au début de leur tour (coup qui sera effacé)
  const aliceAfterNf3 = u.view.clock.w;
  // Bob réfléchit 3 s, joue une carte immédiate (Mur ou Faille) si possible, puis Cc6.
  await sleep(1500);
  const vb = bob.last().view.state;
  let bobCard = null;
  for (const [i, h] of vb.hands.b.entries()) {
    if (h.used || ['tide', 'deja_vu'].includes(h.card) || !cardPlayable(vb, 'b', i)) continue;
    const opts = cardOptions(vb, 'b', i);
    const t = CARDS[h.card].targets === 0 ? [] : [h.card === 'ice_wall' ? opts.find(q => q === sq('h4')) ?? opts[0] : h.card === 'rift' ? opts.find(q => q >> 3 === 4) ?? opts[0] : opts[0]];
    const a = await bob.emit('game:card', { id, index: i, targets: t });
    if (a.ok) { bobCard = { i, card: h.card }; await alice.next(x => x.event.type === 'card'); await bob.next(x => x.event.type === 'card'); break; }
  }
  log(`   carte noire jouée pendant le tour effacé : ${bobCard?.card ?? 'aucune'}`);
  await sleep(1500);
  u = await move(id, bob, alice, 'b8', 'c6');
  const bobAfter = u.view.clock.b;
  const thinkB = bobStart - bobAfter;
  log(`   Noirs : ${bobStart} → ${bobAfter} ms (temps consommé moins incrément : ${thinkB})`);
  // Alice réfléchit 1 s puis joue Déjà-vu.
  const aBefore = u.view.clock.w; const s0 = u.view.clock.serverNow;
  await sleep(1000);
  const a = await alice.emit('game:card', { id, index: dIdx, targets: [] });
  assert.equal(a.ok, true, `Déjà-vu refusé : ${a.error}`);
  const ua = await alice.next(x => x.event.type === 'card');
  const ub = await bob.next(x => x.event.type === 'card');
  const v = ub.view;
  assert.equal(v.state.ply, 2, 'retour à la position après 1…e5');
  assert.equal(v.state.pos.turn, 'w');
  near(v.clock.b, bobStart, 60, 'Noirs : temps rendu = temps au début du coup effacé');
  near(aBefore - ua.view.clock.w, (ua.view.clock.serverNow - s0) - 1200, 150, 'Blancs (lanceur) : temps non rendu, cinématique créditée');
  assert.equal(v.state.hands.w[dIdx].card, 'deja_vu', 'le Déjà-vu joué est visible');
  if (bobCard) {
    const h = ua.view.state.hands.b[bobCard.i];
    assert.equal(h.used, false, 'la carte noire du tour effacé est rendue');
    assert.equal(h.revealed, true, 'rendue face visible');
    assert.equal(h.card, bobCard.card, 'Alice voit la carte rendue (déjà vue)');
    assert.ok(!v.state.effects.some(e => e.card === bobCard.card && e.caster === 'b'), "l'effet de la carte effacée a disparu");
  }
  // Pièce interdite : le cavalier g1.
  let r = await alice.emit('game:move', { id, from: sq('g1'), to: sq('f3') });
  assert.equal(r.ok, false, 'la pièce du coup effacé est interdite');
  r = await alice.emit('game:move', { id, from: sq('g1'), to: sq('h3') });
  assert.equal(r.ok, false, 'toute la pièce est interdite, pas seulement le coup');
  r = await alice.emit('game:card', { id, index: (dIdx + 1) % 3, targets: [] });
  assert.equal(r.ok, false, 'le Déjà-vu compte comme la carte du tour');
  step('Déjà-vu : position et effets restaurés, temps rendu aux Noirs seulement, pièce interdite, carte rendue face visible');
  u = await move(id, alice, bob, 'd2', 'd4');
  // Bob relance sa carte rendue s'il en avait une : elle doit être jouable à nouveau.
  if (bobCard) {
    const vb2 = bob.last().view.state;
    const opts = cardOptions(vb2, 'b', bobCard.i);
    const tg = CARDS[bobCard.card].targets === 0 ? [] : [opts[0]];
    const ok = cardPlayable(vb2, 'b', bobCard.i) ? (await bob.emit('game:card', { id, index: bobCard.i, targets: tg })).ok : false;
    log(`   carte rendue rejouée : ${ok}`);
    if (ok) { await alice.next(x => x.event.type === 'card'); await bob.next(x => x.event.type === 'card'); }
  }
  await move(id, bob, alice, 'd7', 'd5');
  // Fin par abandon des Noirs.
  r = await bob.emit('game:resign', { id });
  assert.ok(r.ok);
  const end = await alice.next(x => x.event.type === 'end');
  assert.deepEqual(end.view.state.result, { winner: 'w', reason: 'resign' });
  step('abandon : fin de partie');
  alice.close(); bob.close();
}

// ---------------------------------------------------------------------------------------------
// 3. Contre l'IA, catalogue Climats : l'humain joue au hasard (coups et cartes), on mesure l'IA.
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
  const stats = { id, level, tc, you, botCards: [], humanCards: [], botMs: [], plies: 0, result: null, errors: [], relaxed: 0 };
  let view = j.view;
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
        if (u.event.type === 'card' && u.event.info.caster === bot) stats.botCards.push(u.event.info.card);
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
      if (u.event.type === 'card' && u.event.info.caster === bot) stats.botCards.push(u.event.info.card);
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
  log('\n== Parties contre l’IA, catalogue Climats ==');
  const n = Number(process.env.IA_GAMES ?? 4);
  const jobs = [];
  for (let k = 0; k < n; k++) jobs.push(botGame(k % 2 ? 3 : 2, k % 2 ? 'none' : '10+0', Number(process.env.IA_PLIES ?? 120)));
  const res = await Promise.all(jobs);
  for (const s of res) {
    const ms = s.botMs.slice().sort((a, b) => a - b);
    const avg = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
    log(`   ${s.id} IA${s.level} ${s.tc} humain=${s.you} plies=${s.plies} résultat=${JSON.stringify(s.result)} durée=${s.durationS}s`);
    log(`     cartes IA : ${s.botCards.join(', ') || 'aucune'} | humain : ${s.humanCards.join(', ') || 'aucune'} | mains : w=${s.hands.w} b=${s.hands.b}`);
    log(`     réponse IA : moy ${Math.round(avg)} ms, médiane ${ms[ms.length >> 1]} ms, max ${ms[ms.length - 1]} ms (${ms.length} coups) ; coups « la magie cède » de l'IA : ${s.relaxed}`);
    for (const e of s.errors) problem(`partie IA ${s.id} : ${e}`);
  }
  return res;
}

// ---------------------------------------------------------------------------------------------
// 4. Redémarrage du serveur en cours de partie, effets actifs (Terrain) et annoncé (Présage).
async function redemarrage() {
  log('\n== Redémarrage du serveur en cours de partie ==');
  const cmd = process.env.RESTART_CMD;
  assert.ok(cmd, 'RESTART_CMD manquant');
  let alice = await guest(); alice.label = 'Alice';
  let bob = await guest(); bob.label = 'Bob';
  const terr = h => h.includes('ice_wall') || h.includes('rift');
  const pres = ['truce', 'ice_age', 'coronation', 'blast', 'cavalcade', 'blood_moon', 'hourglass'];
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
  const preState = canon({ pos: pre.state.pos, effects: pre.state.effects, ply: pre.state.ply, hands: pre.state.hands.w, turnMarks: null });
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
  const postState = canon({ pos: post.state.pos, effects: post.state.effects, ply: post.state.ply, hands: post.state.hands.w, turnMarks: null });
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
  await me.join(bid);
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

const run = async () => {
  if (WANT.has('drapeau')) await drapeau();
  if (all || WANT.has('sablier')) await sablier();
  if (all || WANT.has('dejavu')) await dejavu();
  if (all || WANT.has('ia')) await ia();
  if (WANT.has('redemarrage')) await redemarrage();
  log(`\n${problems.length ? `${problems.length} problème(s) :\n - ` + problems.join('\n - ') : 'Aucun problème relevé.'}`);
  process.exit(problems.length ? 1 : 0);
};
run().catch(e => { console.error(e); log(`problèmes relevés avant l'erreur : ${problems.length}`); for (const p of problems) log(' - ' + p); process.exit(2); });
