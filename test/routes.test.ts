// Routes du site (lot 6) : une seule table, src/shared/config/routes.ts, lue par le client (App.tsx : une <Route> et
// un chargeur par page), le serveur (site.ts : motif, code préchargé, titre, adresse canonique, statut) et la
// construction (robots.txt).
//
// ATTENDU est la table d'avant la passe (commit 7274072), relevée dans App.tsx : chemin, module de src/client/pages,
// propriétés passées à la page. Le serveur est essayé en boîte noire sur un site construit factice (index.html et
// manifeste de Vite) : pour chaque chemin, le HTML servi doit précharger le code de la bonne page.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV, SECTIONS } from '../src/client/components/Layout';
import { BOT_LEVELS, BOT_PROFILES } from '../src/shared/bot';
import { FEATURES } from '../src/shared/config/features';
import type { Features } from '../src/shared/config/features';
import { NOT_INDEXED, PAGE_MODULES, ROUTES, ROUTE_TITLES } from '../src/shared/config/routes';
import { routePattern, serveBuiltSite } from '../src/server/site';
import type { SiteOptions } from '../src/server/site';
import { identify } from '../src/server/auth';
import { sign } from '../src/server/security';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

type Ligne = [chemin: string, module: string, props?: Record<string, string>];

/** Pages du site avant la passe (App.tsx, commit 7274072). */
const ATTENDU: Ligne[] = [
  ['/', 'Home'],
  ['/jouer', 'Play'],
  ['/partie/:id', 'GameRoute'],
  ['/cartes', 'Rules'],
  ['/regles', 'Rules'],
  ['/boutique', 'Shop'],
  ['/boutique/demo/:id', 'DemoCheckout'],
  ['/connexion', 'Auth', { mode: 'login' }],
  ['/inscription', 'Auth', { mode: 'register' }],
  ['/mot-de-passe-oublie', 'Auth', { mode: 'forgot' }],
  ['/reinitialiser/:token', 'Auth', { mode: 'reset' }],
  ['/verifier/:token', 'Auth', { mode: 'verify' }],
  ['/compte', 'Account'],
  ['/joueur/:username', 'Profile'],
  ['/classement', 'Leaderboard'],
  ['/admin', 'Admin'],
  ['/apprendre', 'Learn'],
  ['/apprendre/:lesson', 'Learn'],
  ['/problemes', 'Puzzles'],
  ['/problemes/:puzzle', 'Puzzles'],
  ['/analyse', 'Analysis'],
  ['/analyse/:gameId', 'Analysis'],
  ['/parties', 'MyGames'],
  ['/direct', 'Live'],
  ['/cgu', 'Legal', { page: 'cgu' }],
  ['/cgv', 'Legal', { page: 'cgv' }],
  ['/confidentialite', 'Legal', { page: 'privacy' }],
  ['/mentions-legales', 'Legal', { page: 'mentions' }],
];
const MODULES = [...new Set([...ATTENDU.map(l => l[1]), 'NotFound'])];

/** Chemin d'exemple d'une route : chaque paramètre remplacé par une valeur. */
const exemple = (chemin: string) => chemin.replace(/:\w+/g, 'abc-12');

describe('table des routes', () => {
  it('ROUTES : exactement les pages d’avant la passe (chemin, module, propriétés), dans le même ordre', () => {
    expect(ROUTES.map(r => (r.props ? [r.path, r.page, r.props] : [r.path, r.page]))).toEqual(ATTENDU);
  });
  it('App.tsx : un chargeur à import() littéral par module de PAGE_MODULES (un morceau de code par page)', () => {
    const src = read('src/client/App.tsx');
    const chargeurs = [...src.matchAll(/^ {2}(\w+): page(?:<[^>]*>)?\(\(\) => import\('\.\/pages\/(\w+)'\)/gm)].map(m => [m[1], m[2]]);
    expect(chargeurs.map(([cle]) => cle).sort()).toEqual([...PAGE_MODULES].sort());
    for (const [cle, fichier] of chargeurs) expect(fichier, cle).toBe(cle);
    expect([...PAGE_MODULES].sort()).toEqual([...MODULES].sort());
  });
  it('chaque route a un motif côté serveur qui ne reconnaît qu’elle parmi les exemples', () => {
    for (const r of ROUTES) {
      const re = routePattern(r.path);
      const autres = ROUTES.filter(o => o.path !== r.path && re.test(exemple(o.path)));
      expect(re.test(exemple(r.path)), r.path).toBe(true);
      expect(autres.map(o => o.path), r.path).toEqual([]);
    }
  });
  it('titres (ROUTE_TITLES) : une route connue, et le titre que sa page pose (useTitle) au caractère près', () => {
    const chemins = new Set([...ROUTES.map(r => r.path), '*']);
    for (const [chemin, titre] of Object.entries(ROUTE_TITLES)) {
      expect(chemins.has(chemin), chemin).toBe(true);
      const page = chemin === '*' ? 'NotFound' : ROUTES.find(r => r.path === chemin)!.page;
      // Littéral de useTitle, ou des tables de titres d'Auth (titles) et de Legal (DOCS.short)
      expect(read(`src/client/pages/${page}.tsx`), `${chemin} : ${titre}`).toContain(`'${titre}'`);
    }
  });
  it('useTitle : même code dans features/ui.tsx et pages/PageScene.tsx (deux copies, pour le découpage en morceaux)', () => {
    const corps = (f: string) => read(f).match(/^export function useTitle\(title: string\) \{\n[\s\S]*?\n\}\n/m)?.[0];
    const ui = corps('src/client/features/ui.tsx');
    expect(ui).toContain('__SM__.suffixeTitre');
    expect(corps('src/client/pages/PageScene.tsx')).toBe(ui);
  });
  it('robots.txt : pages non indexées connues', () => {
    for (const p of NOT_INDEXED) expect(ROUTES.some(r => r.path === p), p).toBe(true);
  });
  it('liens des menus : l’interrupteur d’un lien couvre celui de sa page ; la boutique, « shop »', () => {
    for (const l of [...SECTIONS.flatMap(s => s.links), ...NAV]) {
      const page = ROUTES.find(r => r.path === l.to.split('?')[0]);
      expect(page, l.to).toBeDefined();
      if (page!.feature) expect(l.f, l.to).toBe(page!.feature);
      if (l.to.startsWith('/boutique')) expect(l.f, l.to).toBe('shop');
    }
    // Niveaux de l'IA dans le menu : tirés de BOT_LEVELS et BOT_PROFILES au build (__SM__.niveauxIA)
    expect(SECTIONS[0].links.find(l => l.to === '/jouer?mode=bot')?.hint).toBe(BOT_LEVELS.map(l => BOT_PROFILES[l].name).join(', '));
    expect(BOT_LEVELS.map(l => BOT_PROFILES[l].name).join(', ')).toBe('Apprenti, Sorcier, Archimage');
    // Chaque section du menu et du pied de page garde un lien sans interrupteur : elle ne disparaît jamais, et les
    // grilles gardent leurs quatre colonnes (Layout.tsx, global.css)
    for (const s of SECTIONS) expect(s.links.some(l => !l.f), s.title).toBe(true);
    // Page introuvable : ses liens vers Apprendre et la boutique suivent leurs interrupteurs
    const nf = read('src/client/pages/NotFound.tsx');
    expect(nf).toContain("useFeature('learn')");
    expect(nf).toContain("useFeature('shop')");
  });
});

/** Site construit factice : un morceau de code par page, le paquet principal sans import. */
function siteFactice(): string {
  const dist = mkdtempSync(path.join(os.tmpdir(), 'spellmate-routes-'));
  mkdirSync(path.join(dist, '.vite'));
  writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html>\n<html lang="fr">\n  <head>\n    <title>Accueil · Marque</title>\n    <meta property="og:image" content="/og.jpg" />\n  </head>\n  <body></body>\n</html>\n',
  );
  const manifest: Record<string, unknown> = { 'index.html': { file: 'assets/index-AAAAAAAA.js', isEntry: true, src: 'index.html' } };
  for (const m of MODULES) manifest[`src/client/pages/${m}.tsx`] = { file: `assets/${m}-BBBBBBBB.js`, isDynamicEntry: true };
  writeFileSync(path.join(dist, '.vite/manifest.json'), JSON.stringify(manifest));
  return dist;
}

/** Serveur du site factice, avec ces réglages. */
async function servir(dist: string, opts: SiteOptions): Promise<{ base: string; server: Server }> {
  const app = express();
  serveBuiltSite(app, dist, opts);
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

describe('site construit : HTML servi par site.ts', () => {
  let dist = '';
  let defaut: { base: string; server: Server };
  let coupe: { base: string; server: Server };
  const PUBLIC = 'https://jeu.example';
  const off: Features = { ...FEATURES, puzzles: false, shop: false };
  beforeAll(async () => {
    dist = siteFactice();
    defaut = await servir(dist, { publicUrl: PUBLIC });
    coupe = await servir(dist, { publicUrl: PUBLIC, features: off });
  });
  afterAll(async () => {
    for (const s of [defaut, coupe]) await new Promise(r => s?.server.close(r));
    if (dist) rmSync(dist, { recursive: true, force: true });
  });

  /** Page servie pour ce chemin : module préchargé, statut, HTML, cookie posé. */
  async function page(chemin: string, base = defaut.base, cookie?: string) {
    const r = await fetch(base + chemin, { headers: cookie ? { cookie } : {} });
    const html = await r.text();
    return {
      module: html.match(/modulepreload" crossorigin href="\/assets\/(\w+)-BBBBBBBB\.js"/)?.[1],
      status: r.status,
      html,
      cookie: r.headers.get('set-cookie'),
      etag: r.headers.get('etag'),
    };
  }

  it('chaque route du client a son motif : le HTML précharge le code de sa page (statut 200)', async () => {
    for (const [chemin, module] of ATTENDU) {
      const ex = exemple(chemin);
      const variantes = ex === '/' ? [ex] : [ex, `${ex}/`, ex.toUpperCase()];
      for (const v of variantes) {
        const p = await page(v);
        expect([p.module, p.status], v).toEqual([module, 200]);
      }
    }
  });
  it('un chemin inconnu précharge la page introuvable, avec le statut 404', async () => {
    for (const v of ['/inconnu', '/jouer/en-trop', '/boutique/demo', '/partie', '/joueur/a/b', '/favicon.ico']) {
      const p = await page(v);
      expect([p.module, p.status], v).toEqual(['NotFound', 404]);
      expect(p.html, v).toContain('<title>Page introuvable · ');
      expect(p.html, v).not.toContain('rel="canonical"');
    }
  });
  it('titre initial : celui que la page pose ; sans titre fixe, celui de l’accueil', async () => {
    expect((await page('/boutique')).html).toContain('<title>Boutique · Spellmate</title>');
    expect((await page('/cgu')).html).toContain('<title>Conditions d’utilisation · Spellmate</title>');
    expect((await page('/jouer')).html).toContain('<title>Accueil · Marque</title>');
    expect((await page('/joueur/bob')).html).toContain('<title>Accueil · Marque</title>');
  });
  it('adresse canonique et og:url absolues (forme de la route, paramètres de la requête) ; og:image absolue', async () => {
    const tags = (html: string) => [html.match(/rel="canonical" href="([^"]+)"/)?.[1], html.match(/property="og:url" content="([^"]+)"/)?.[1]];
    expect(tags((await page('/')).html)).toEqual([`${PUBLIC}/`, `${PUBLIC}/`]);
    expect(tags((await page('/BOUTIQUE/')).html)).toEqual([`${PUBLIC}/boutique`, `${PUBLIC}/boutique`]);
    expect(tags((await page('/Joueur/Bob/')).html)).toEqual([`${PUBLIC}/joueur/Bob`, `${PUBLIC}/joueur/Bob`]);
    expect(tags((await page('/joueur/%22%3E')).html)[0]).toBe(`${PUBLIC}/joueur/%22%3E`);
    expect((await page('/jouer')).html).toContain(`<meta property="og:image" content="${PUBLIC}/og.jpg" />`);
    // Deux profils : deux ETag
    expect((await page('/joueur/a')).etag).not.toBe((await page('/joueur/b')).etag);
  });
  it('interrupteurs : aucune meta au défaut ; coupés, la meta les porte et la page coupée répond 404', async () => {
    expect((await page('/problemes')).html).not.toContain('sm-features');
    const p = await page('/problemes/abc', coupe.base);
    expect([p.module, p.status]).toEqual(['NotFound', 404]);
    expect(p.html).toContain(`<meta name="sm-features" content='{"puzzles":false,"shop":false}'>`);
    // La boutique coupée affiche sa propre page fermée (Shop.tsx) : servie normalement
    expect((await page('/boutique', coupe.base)).status).toBe(200);
  });
  it('cookie d’invité posé sur le HTML s’il manque ou ne se vérifie pas, jamais sinon', async () => {
    const neuf = (await page('/jouer')).cookie;
    expect(neuf).toMatch(/^sm_guest=[\w-]+\.[\w-]+; Max-Age=31536000; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/);
    expect((await page('/jouer', defaut.base, 'sm_guest=faux.cookie')).cookie).toMatch(/^sm_guest=/);
    expect((await page('/jouer', defaut.base, `autre=1; sm_guest=${encodeURIComponent(sign('abc'))}`)).cookie).toBeNull();
    expect((await page('/inconnu')).cookie).toMatch(/^sm_guest=/);
  });
  it('cookie d’invité du HTML : mêmes nom et options que celui de l’API (identify, src/server/auth.ts)', async () => {
    const app = express();
    app.get('/api/x', identify, (_req, res) => void res.end());
    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    try {
      const api = (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/x`)).headers.get('set-cookie');
      const forme = (c: string | null) => c?.replace(/^sm_guest=[^;]+/, 'sm_guest=‹v›').replace(/Expires=[^;]+/, 'Expires=‹d›');
      expect(forme(api)).toMatch(/^sm_guest=‹v›; /);
      expect(forme((await page('/jouer')).cookie)).toBe(forme(api));
    } finally {
      await new Promise(r => server.close(r));
    }
  });
  it('304 si le HTML n’a pas changé (ETag), jamais pour une page introuvable', async () => {
    // node:http plutôt que fetch, qui ajoute « Cache-Control: no-cache » aux requêtes conditionnelles
    const statut = (chemin: string, etag: string) =>
      new Promise<number>((ok, ko) => get(defaut.base + chemin, { headers: { 'if-none-match': etag } }, r => {
        r.resume();
        ok(r.statusCode!);
      }).on('error', ko));
    expect(await statut('/regles', (await page('/regles')).etag!)).toBe(304);
    expect(await statut('/joueur/bob', (await page('/joueur/bob')).etag!)).toBe(304);
    expect(await statut('/inconnu', (await page('/inconnu')).etag!)).toBe(404);
  });
});
