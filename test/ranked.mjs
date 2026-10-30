// Partie classée : file d'attente, appariement, Elo appliqué une seule fois.
// node test/ranked.mjs [http://localhost:3000]
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const sq = s => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const stamp = Date.now().toString(36);

async function player(name) {
  let cookie = '';
  const api = async (path, body) => {
    const res = await fetch(BASE + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]);
    if (set.length) cookie = [...new Map([...cookie.split('; ').filter(Boolean), ...set].map(kv => [kv.split('=')[0], kv])).values()].join('; ');
    return res.json();
  };
  await api('/auth/register', { email: `${name}-${stamp}@test.fr`, username: `${name}_${stamp}`, password: 'motdepasse123', acceptTerms: true });
  const socket = io(BASE, { transports: ['websocket'], extraHeaders: { cookie } });
  await new Promise(r => socket.on('connect', r));
  const emit = (ev, p) => new Promise(r => socket.emit(ev, p, r));
  return { api, socket, emit, username: `${name}_${stamp}` };
}

const a = await player('rouge');
const b = await player('bleu');
const matched = Promise.all([a, b].map(p => new Promise(r => p.socket.once('queue:matched', r))));
assert.ok((await a.emit('queue:join', { tc: '5+0' })).ok);
assert.ok((await b.emit('queue:join', { tc: '5+0' })).ok);
const [{ gameId }] = await matched;
const ja = await a.emit('game:join', { id: gameId });
const jb = await b.emit('game:join', { id: gameId });
assert.equal(ja.view.rated, true);
const white = ja.view.you === 'w' ? a : b;
const black = white === a ? b : a;
assert.ok((await white.emit('game:move', { id: gameId, from: sq('d2'), to: sq('d4') })).ok);
assert.ok((await black.emit('game:move', { id: gameId, from: sq('d7'), to: sq('d5') })).ok);
assert.equal((await black.emit('game:abort', { id: gameId })).ok, false, 'plus d’annulation après le premier coup de chacun');
assert.ok((await black.emit('game:resign', { id: gameId })).ok);
await new Promise(r => setTimeout(r, 600));
const pw = await white.api(`/users/${white.username}`);
const pb = await black.api(`/users/${black.username}`);
assert.equal(pw.profile.rating, 1220);
assert.equal(pb.profile.rating, 1180);
assert.equal(pw.profile.wins, 1);
assert.equal(pb.profile.losses, 1);
console.log('✓ file classée, appariement, Elo +20 / −20, une seule fois');
a.socket.close();
b.socket.close();
process.exit(0);
