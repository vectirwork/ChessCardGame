// Site construit (production), décision D6 : servir vite et peu.
// - Fichiers précompressés à la construction (vite.config.ts : `.br` brotli 11, `.gz` gzip 9) envoyés tels quels selon
//   Accept-Encoding ; sinon express.static (et la compression à la volée de index.ts pour le reste).
// - Cache : un an, immuable, pour /assets (noms avec empreinte) ; un jour pour les fichiers fixes de public/ (icônes,
//   manifeste) ; le HTML est revalidé à chaque visite (ETag).
// - HTML par page : index.html enrichi des <link rel="modulepreload"> du code de la page demandée et des <link
//   rel="stylesheet"> de son CSS (lus dans le manifeste de Vite). Le navigateur les télécharge en parallèle du paquet
//   principal au lieu de les découvrir après son exécution ; main.tsx attend ce code avant le premier rendu.
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

interface ManifestChunk {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  isEntry?: boolean;
}
type Manifest = Record<string, ManifestChunk>;

/**
 * Pages du site (src/client/App.tsx) et module source de leur code. Une page absente d'ici fonctionne normalement :
 * son code est seulement découvert plus tard (après le paquet principal).
 */
const PAGES: [RegExp, string][] = [
  [/^\/$/, 'src/client/pages/Home.tsx'],
  [/^\/jouer\/?$/i, 'src/client/pages/Play.tsx'],
  [/^\/partie\/[^/]+\/?$/i, 'src/client/pages/GameRoute.tsx'],
  [/^\/(cartes|regles)\/?$/i, 'src/client/pages/Rules.tsx'],
  [/^\/boutique\/?$/i, 'src/client/pages/Shop.tsx'],
  [/^\/boutique\/demo\/[^/]+\/?$/i, 'src/client/pages/DemoCheckout.tsx'],
  [/^\/(connexion|inscription|mot-de-passe-oublie|reinitialiser\/[^/]+|verifier\/[^/]+)\/?$/i, 'src/client/pages/Auth.tsx'],
  [/^\/compte\/?$/i, 'src/client/pages/Account.tsx'],
  [/^\/joueur\/[^/]+\/?$/i, 'src/client/pages/Profile.tsx'],
  [/^\/classement\/?$/i, 'src/client/pages/Leaderboard.tsx'],
  [/^\/admin\/?$/i, 'src/client/pages/Admin.tsx'],
  [/^\/apprendre(\/[^/]+)?\/?$/i, 'src/client/pages/Learn.tsx'],
  [/^\/problemes(\/[^/]+)?\/?$/i, 'src/client/pages/Puzzles.tsx'],
  [/^\/analyse(\/[^/]+)?\/?$/i, 'src/client/pages/Analysis.tsx'],
  [/^\/parties\/?$/i, 'src/client/pages/MyGames.tsx'],
  [/^\/direct\/?$/i, 'src/client/pages/Live.tsx'],
  [/^\/(cgu|cgv|confidentialite|mentions-legales)\/?$/i, 'src/client/pages/Legal.tsx'],
];
const NOT_FOUND = 'src/client/pages/NotFound.tsx';

/**
 * Code chargé à la demande par une page, mais seulement sur certains appareils : préchargé dès le HTML avec une requête
 * média (le navigateur ne le télécharge que si elle est vraie). Lenis (adoucissement de la molette, odyssee/engine.ts) :
 * pointeur fin, hors mouvement réduit, comme la condition du moteur. Il arrive ainsi avec le reste de la page, comme
 * quand il en faisait partie, au lieu d'être demandé à l'exécution de l'accueil (la molette n'aurait pas été adoucie
 * pendant ce délai).
 */
const MEDIA_PRELOADS: Record<string, [RegExp, string][]> = {
  'src/client/pages/Home.tsx': [[/(^|\/)node_modules\/lenis\//, '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)']],
};

const YEAR = 'public, max-age=31536000, immutable';
const DAY = 'public, max-age=86400';

function cacheControl(rel: string) {
  return rel.startsWith('/assets/') ? YEAR : DAY;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? (e.name.startsWith('.') ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)],
  );
}

/** Encodages acceptés par le client (q > 0). */
function accepted(header: string | undefined) {
  const out = new Set<string>();
  for (const part of (header ?? '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) out.add(name);
  }
  return out;
}

/** Envoie la variante précompressée d'un fichier du site si elle existe et que le client l'accepte. */
function precompressed(root: string) {
  const variants = new Set(walk(root).filter(f => /\.(br|gz)$/.test(f)).map(f => '/' + path.relative(root, f).split(path.sep).join('/')));
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.includes('..')) return next();
    const rel = req.path;
    const hasBr = variants.has(`${rel}.br`);
    const hasGz = variants.has(`${rel}.gz`);
    if (!hasBr && !hasGz) return next();
    res.vary('Accept-Encoding');
    const enc = accepted(req.headers['accept-encoding']);
    const pick = hasBr && enc.has('br') ? 'br' : hasGz && enc.has('gzip') ? 'gzip' : null;
    if (!pick) return next();
    res.type(path.extname(rel));
    res.setHeader('Content-Encoding', pick);
    res.setHeader('Cache-Control', cacheControl(rel));
    res.sendFile(path.join(root, `${rel}.${pick === 'br' ? 'br' : 'gz'}`), { acceptRanges: false, cacheControl: false, dotfiles: 'deny' }, err => {
      if (err) next(err);
    });
  };
}

/** Balises de préchargement du code et du CSS d'une page (hors paquet principal, déjà dans index.html). */
function pageHints(manifest: Manifest, key: string, inMain: Set<string>) {
  const seen = new Set<string>();
  const js: string[] = [];
  const css: string[] = [];
  // Même ordre que le chargement à la demande de Vite : d'abord les morceaux importés (et leur CSS), puis la page.
  const visit = (k: string) => {
    if (seen.has(k) || inMain.has(k) || !manifest[k]) return;
    seen.add(k);
    const chunk = manifest[k];
    for (const i of chunk.imports ?? []) visit(i);
    js.push(chunk.file);
    for (const f of chunk.css ?? []) if (!css.includes(f)) css.push(f);
  };
  visit(key);
  // Code à la demande des morceaux de la page, préchargé seulement si sa requête média est vraie (MEDIA_PRELOADS)
  const media: string[] = [];
  for (const [re, query] of MEDIA_PRELOADS[key] ?? []) {
    const dyn = [...seen].flatMap(k => manifest[k].dynamicImports ?? []).find(d => re.test(d) && !inMain.has(d) && manifest[d]);
    if (dyn) media.push(`<link rel="modulepreload" crossorigin href="/${manifest[dyn].file}" media="${query}">`);
  }
  return [
    ...css.map(f => `<link rel="stylesheet" crossorigin href="/${f}">`),
    ...js.map(f => `<link rel="modulepreload" crossorigin href="/${f}">`),
    ...media,
  ].join('\n    ');
}

/** HTML de chaque page, calculé une fois au démarrage. */
function pagesHtml(clientDist: string) {
  const template = readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  const manifestFile = path.join(clientDist, '.vite/manifest.json');
  const manifest: Manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const inMain = new Set<string>();
  const addMain = (k: string) => {
    if (inMain.has(k) || !manifest[k]) return;
    inMain.add(k);
    for (const i of manifest[k].imports ?? []) addMain(i);
  };
  for (const [k, c] of Object.entries(manifest)) if (c.isEntry) addMain(k);
  const cache = new Map<string, { html: string; etag: string }>();
  return (pathname: string) => {
    const key = PAGES.find(([re]) => re.test(pathname))?.[1] ?? NOT_FOUND;
    let page = cache.get(key);
    if (!page) {
      const hints = manifest[key] ? pageHints(manifest, key, inMain) : '';
      const html = hints ? template.replace(/\s*<\/head>/, `\n    ${hints}\n  </head>`) : template;
      page = { html, etag: `W/"${createHash('sha1').update(html).digest('base64url').slice(0, 27)}"` };
      cache.set(key, page);
    }
    return page;
  };
}

export function serveBuiltSite(app: Express, clientDist: string) {
  app.use(precompressed(clientDist));
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, file) {
        res.setHeader('Cache-Control', cacheControl('/' + path.relative(clientDist, file).split(path.sep).join('/')));
      },
    }),
  );
  // Fichier à empreinte absent (onglet resté ouvert sur une ancienne version) : 404 franc plutôt que le HTML du site,
  // le client recharge alors la page (main.tsx, vite:preloadError).
  app.use('/assets', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Fichier introuvable.');
  });
  const htmlFor = pagesHtml(clientDist);
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (req, res) => {
    const page = htmlFor(req.path);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', page.etag);
    if (req.fresh) {
      res.status(304).end();
      return;
    }
    res.type('html').send(page.html);
  });
}
