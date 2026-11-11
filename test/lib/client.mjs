// Client de bout en bout d'un serveur Spellmate lancé (API HTTP et socket), factorisé depuis test/integration.mjs
// et les scripts de captures : cookies gardés d'une requête à l'autre, socket avec ces cookies, attente d'une mise à
// jour, cases nommées.
//
//   import { Client, sq } from './lib/client.mjs';
//   const a = new Client(BASE);
//   await a.api('/me');                                   // cookie d'invité
//   const { data } = await a.api('/games', { mode: 'invite', tc: '5+0', color: 'w', name: 'Aurore' });
//   await a.connect();
//   await a.emit('game:join', { id: data.id, name: 'Aurore' });
//   await a.waitFor(u => u.event.type === 'start');
//
// Les suites existantes (integration.mjs, ranked.mjs, climats-serveur.mjs) gardent pour l'instant leur propre copie :
// les lots 3 et 9 les migrent.
import { io } from 'socket.io-client';

/** Indice d'une case nommée (« e4 » → 28 ; a1 = 0, h8 = 63). */
export const sq = s => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);

/** Nom d'une case (28 → « e4 »). */
export const sqName = i => String.fromCharCode(97 + (i % 8)) + String(Math.floor(i / 8) + 1);

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Adresse de base : argument, sinon SPELLMATE_BASE (posée par scripts/serveur-jetable.mjs), sinon localhost:3000. */
export function baseUrl(arg) {
  return (arg ?? process.env.SPELLMATE_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
}

export class Client {
  /** @param {string} base adresse du serveur (sans / final) */
  constructor(base = baseUrl()) {
    this.base = base.replace(/\/$/, '');
    /** @type {Map<string, string>} */
    this.cookies = new Map();
    /** Mises à jour reçues sur le socket (game:update), dans l'ordre. */
    this.updates = [];
    this.socket = null;
  }

  /** En-tête Cookie des cookies reçus. */
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Cookies au format Playwright (context.addCookies), pour ouvrir un navigateur sous la même identité. */
  playwrightCookies() {
    const u = new URL(this.base);
    return [...this.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/' }));
  }

  /**
   * Requête à l'API (`path` sans le préfixe /api). Corps JSON : POST par défaut. Renvoie { status, data } ; les
   * cookies reçus sont gardés.
   */
  async api(path, body, method) {
    const res = await fetch(this.base + '/api' + path, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), cookie: this.cookieHeader() },
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

  /** Ouvre le socket avec les cookies reçus ; les mises à jour s'accumulent dans `updates`. */
  connect() {
    this.updates = [];
    this.socket = io(this.base, { transports: ['websocket'], extraHeaders: { cookie: this.cookieHeader() } });
    this.socket.on('game:update', u => this.updates.push(u));
    return new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });
  }

  /** Émet un événement avec accusé de réception (la réponse du serveur). */
  emit(ev, payload) {
    return new Promise(r => this.socket.emit(ev, payload, r));
  }

  /** Attend une mise à jour qui vérifie `pred` (déjà reçue ou à venir). */
  async waitFor(pred, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const u = this.updates.find(pred);
      if (u) return u;
      await sleep(50);
    }
    throw new Error(`Mise à jour attendue non reçue : ${pred}`);
  }

  /** Dernière vue reçue (ou null). */
  lastView() {
    return this.updates.at(-1)?.view ?? null;
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}

/** Crée un invité (cookie posé par /api/me) avec un pseudo. */
export async function invite(base, name) {
  const c = new Client(base);
  await c.api('/me');
  c.name = name;
  return c;
}

/** Inscription d'un compte (renvoie le client connecté et la réponse). */
export async function compte(base, { email, username, password = 'motdepasse123' }) {
  const c = new Client(base);
  const r = await c.api('/auth/register', { email, username, password, acceptTerms: true });
  if (r.status !== 200) throw new Error(`Inscription refusée (${r.status}) : ${JSON.stringify(r.data)}`);
  return c;
}
