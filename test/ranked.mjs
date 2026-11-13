// Partie classée : file d'attente, appariement, Elo appliqué une seule fois.
//   node test/ranked.mjs [http://localhost:3000]
//   node scripts/serveur-jetable.mjs -- node test/ranked.mjs {base}
//   SPELLMATE_TEST_RULES='{"cardsPerPlayer":5}' node scripts/serveur-jetable.mjs -- node test/ranked.mjs {base}
// Rien n'est recopié des réglages : le nombre de cartes et la réserve viennent de la vue du choix (view.draft.count,
// pool), ou des mains tirées si le serveur tire les mains (DEAL.draft faux) ; l'écart Elo vient de la vue de fin
// (ratingDiff), appliqué une seule fois au classement de départ lu dans le profil.
import assert from 'node:assert/strict';
import { baseUrl, compte, sleep, sq } from './lib/client.mjs';

const BASE = baseUrl(process.argv[2]);
const stamp = Date.now().toString(36);

async function player(name) {
  const username = `${name}_${stamp}`;
  const c = await compte(BASE, { email: `${name}-${stamp}@test.fr`, username });
  await c.connect();
  c.username = username;
  return c;
}
const profile = async c => (await c.api(`/users/${c.username}`)).data.profile;

const a = await player('rouge');
const b = await player('bleu');
const before = { a: await profile(a), b: await profile(b) };
assert.equal(before.a.rating, before.b.rating, 'même classement de départ');
const matched = Promise.all([a, b].map(p => new Promise(r => p.socket.once('queue:matched', r))));
assert.ok((await a.emit('queue:join', { tc: '5+0' })).ok);
assert.ok((await b.emit('queue:join', { tc: '5+0' })).ok);
const [{ gameId }] = await matched;
const ja = await a.emit('game:join', { id: gameId });
const jb = await b.emit('game:join', { id: gameId });
assert.equal(ja.view.rated, true);
const white = ja.view.you === 'w' ? a : b;
const black = white === a ? b : a;
let setup;
if (ja.view.draft) {
  // Choix des cartes (décision D5) : chacun valide `count` cartes de la réserve, puis les mains sont révélées.
  assert.ok(jb.view.draft, 'les deux joueurs voient le choix');
  const { count, pool } = ja.view.draft;
  const revealed = white.waitFor(u => u.event.type === 'reveal');
  assert.ok((await white.emit('game:draft', { id: gameId, cards: pool.slice(0, count) })).ok);
  assert.ok((await black.emit('game:draft', { id: gameId, cards: pool.slice(-count) })).ok);
  const rv = await revealed;
  assert.equal(rv.view.state.hands.w.length, count);
  assert.equal(rv.view.state.hands.b.length, count);
  setup = `choix de ${count} carte${count > 1 ? 's' : ''}`;
} else {
  // Tirage (DEAL.draft faux) : les mains sont déjà là, de même taille.
  assert.ok(ja.view.state.hands.w.length > 0, 'mains tirées');
  assert.equal(ja.view.state.hands.w.length, ja.view.state.hands.b.length);
  setup = `mains de ${ja.view.state.hands.w.length} tirées`;
}
assert.ok((await white.emit('game:move', { id: gameId, from: sq('d2'), to: sq('d4') })).ok);
assert.ok((await black.emit('game:move', { id: gameId, from: sq('d7'), to: sq('d5') })).ok);
assert.equal((await black.emit('game:abort', { id: gameId })).ok, false, 'plus d’annulation après le premier coup de chacun');
assert.ok((await black.emit('game:resign', { id: gameId })).ok);
const end = await white.waitFor(u => u.event.type === 'end');
const diff = end.view.ratingDiff;
assert.ok(diff && diff.w > 0 && diff.b === -diff.w, `écart Elo symétrique (${JSON.stringify(diff)})`);
await sleep(600);
const [pw, pb] = [await profile(white), await profile(black)];
const start = before.a.rating;
assert.equal(pw.rating, start + diff.w);
assert.equal(pb.rating, start + diff.b);
assert.equal(pw.wins, 1);
assert.equal(pb.losses, 1);
console.log(`✓ file classée, appariement (${setup}), Elo +${diff.w} / ${diff.b}, une seule fois`);
a.close();
b.close();
process.exit(0);
