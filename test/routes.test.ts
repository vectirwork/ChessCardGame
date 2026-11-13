// Routes du site (lot 6) : la table des pages du client (src/client/App.tsx) et les motifs du serveur
// (src/server/site.ts) désignent les mêmes pages, avec le même module de code.
//
// ATTENDU est la table d'avant la passe (commit 7274072), relevée dans App.tsx : chemin, module de src/client/pages,
// propriétés passées à la page. Le serveur est essayé en boîte noire sur un site construit factice (index.html et
// manifeste de Vite) : pour chaque chemin, le HTML servi doit précharger le code de la bonne page.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveBuiltSite } from '../src/server/site';

const ROOT = path.resolve(__dirname, '..');

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

/** Table des routes relevée dans le code source d'App.tsx (<Route path=… element={<Page …/>}/> et page(() => import(…))). */
function tableDApp(): Ligne[] {
  const src = readFileSync(path.join(ROOT, 'src/client/App.tsx'), 'utf8');
  const modules = new Map<string, string>();
  for (const m of src.matchAll(/const (\w+) = page(?:<[^>]*>)?\(\(\) => import\('\.\/pages\/(\w+)'\)/g)) modules.set(m[1], m[2]);
  const out: Ligne[] = [];
  for (const m of src.matchAll(/<Route path="([^"]+)" element=\{<(\w+)((?: \w+="[^"]*")*) \/>\} \/>/g)) {
    if (m[1] === '*') continue;
    const props = Object.fromEntries([...m[3].matchAll(/(\w+)="([^"]*)"/g)].map(p => [p[1], p[2]]));
    out.push(Object.keys(props).length ? [m[1], modules.get(m[2])!, props] : [m[1], modules.get(m[2])!]);
  }
  return out;
}

describe('table des routes du client', () => {
  it('App.tsx déclare exactement les pages d’avant la passe (chemin, module, propriétés)', () => {
    expect(tableDApp()).toEqual(ATTENDU);
  });
});

describe('site construit : motif de chaque route côté serveur (site.ts)', () => {
  let dist = '';
  let server: Server;
  let base = '';
  beforeAll(async () => {
    // Site construit factice : un morceau de code par page, le paquet principal sans import.
    dist = mkdtempSync(path.join(os.tmpdir(), 'spellmate-routes-'));
    mkdirSync(path.join(dist, '.vite'));
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html>\n<html lang="fr">\n  <head>\n    <title>Titre</title>\n  </head>\n  <body></body>\n</html>\n');
    const manifest: Record<string, unknown> = { 'index.html': { file: 'assets/index-AAAAAAAA.js', isEntry: true, src: 'index.html' } };
    for (const m of MODULES) manifest[`src/client/pages/${m}.tsx`] = { file: `assets/${m}-BBBBBBBB.js`, isDynamicEntry: true };
    writeFileSync(path.join(dist, '.vite/manifest.json'), JSON.stringify(manifest));
    const app = express();
    serveBuiltSite(app, dist);
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise(r => server?.close(r));
    if (dist) rmSync(dist, { recursive: true, force: true });
  });

  /** Module de page préchargé par le HTML servi pour ce chemin. */
  async function pageServie(chemin: string): Promise<{ module: string | undefined; status: number }> {
    const r = await fetch(base + chemin);
    const html = await r.text();
    return { module: html.match(/modulepreload" crossorigin href="\/assets\/(\w+)-BBBBBBBB\.js"/)?.[1], status: r.status };
  }

  it('chaque route du client a son motif : le HTML précharge le code de sa page', async () => {
    for (const [chemin, module] of ATTENDU) {
      const ex = exemple(chemin);
      const variantes = ex === '/' ? [ex] : [ex, `${ex}/`, ex.toUpperCase()];
      for (const v of variantes) expect((await pageServie(v)).module, v).toBe(module);
    }
  });
  it('un chemin inconnu précharge la page introuvable', async () => {
    for (const v of ['/inconnu', '/jouer/en-trop', '/boutique/demo', '/partie', '/joueur/a/b', '/favicon.ico']) {
      expect((await pageServie(v)).module, v).toBe('NotFound');
    }
  });
});
