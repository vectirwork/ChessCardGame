// Site construit (production), décision D6 : servir vite et peu.
// - Fichiers précompressés à la construction (vite.config.ts : `.br` brotli 11, `.gz` gzip 9) envoyés tels quels selon
//   Accept-Encoding ; sinon express.static (et la compression à la volée de index.ts pour le reste).
// - Cache : un an, immuable, pour /assets (noms avec empreinte) ; un jour pour les fichiers fixes de public/ (icônes,
//   manifeste) ; le HTML est revalidé à chaque visite (ETag).
// - HTML par page (table ROUTES, src/shared/config/routes.ts), calculé une fois par page au premier passage :
//   index.html enrichi des <link rel="modulepreload"> du code de la page demandée et des <link rel="stylesheet"> de
//   son CSS (lus dans le manifeste de Vite), du titre que la page pose (ROUTE_TITLES), de l'adresse canonique et de
//   og:url, d'og:image en adresse absolue (PUBLIC_URL), et des interrupteurs (<meta name="sm-features">) seulement si
//   l'un diffère des défauts. Le navigateur télécharge le code de la page en parallèle du paquet principal au lieu de
//   le découvrir après son exécution ; main.tsx attend ce code avant le premier rendu.
// - Statut 404 (page introuvable) pour un chemin inconnu ou une page coupée par son interrupteur.
// - Cookie d'invité (sm_guest) posé dès le HTML s'il manque : le socket, ouvert avant la réponse de /api/me, a ainsi
//   déjà son identité.
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pageTitle } from '../shared/config/brand';
import { featuresDiff } from '../shared/config/features';
import type { Features } from '../shared/config/features';
import { ROUTES, ROUTE_TITLES, routeOpen } from '../shared/config/routes';
import type { RouteDef } from '../shared/config/routes';
import { GUEST_COOKIE, guestCookieOptions, parseCookies } from './auth';
import { config } from './config';
import { randomToken, sign, unsign } from './security';
import { FEATURES } from './settings';

interface ManifestChunk {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  isEntry?: boolean;
}
type Manifest = Record<string, ManifestChunk>;

/**
 * Motif d'un chemin de ROUTES, comme React Router : « :param » vaut un segment, barre finale facultative, casse ignorée.
 */
export function routePattern(p: string): RegExp {
  if (p === '/') return /^\/$/;
  const re = p
    .split('/')
    .map(seg => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('\\/');
  return new RegExp(`^${re}\\/?$`, 'i');
}

/** Page introuvable : chemin inconnu, ou page coupée par son interrupteur. */
const NOT_FOUND: RouteDef = { path: '*', page: 'NotFound' };
const moduleOf = (r: RouteDef) => `src/client/pages/${r.page}.tsx`;

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

/** Réglages du HTML servi (les tests les changent). */
export interface SiteOptions {
  /** Interrupteurs du serveur (défaut : FEATURES de settings.ts). */
  features?: Readonly<Features>;
  /** Adresse publique du site, sans barre finale (défaut : PUBLIC_URL). */
  publicUrl?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Chemin canonique : celui de la route, ses paramètres pris dans la requête (sans barre finale, casse de la route). */
function canonicalPath(r: RouteDef, pathname: string): string {
  const parts = pathname.split('/');
  return r.path
    .split('/')
    .map((seg, i) => (seg.startsWith(':') ? parts[i] : seg))
    .join('/');
}

/** Place du chemin canonique dans le HTML mis en cache d'une page à paramètre. */
const PATH_SLOT = '\u0000chemin\u0000';

interface ServedPage {
  status: number;
  html: string;
  etag: string;
}

/** HTML de chaque page : calculé une fois par page (seule l'adresse canonique d'une page à paramètre suit le chemin). */
function pagesHtml(clientDist: string, opts: SiteOptions) {
  const features = opts.features ?? FEATURES;
  const publicUrl = opts.publicUrl ?? config.publicUrl;
  const raw = readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  const manifestFile = path.join(clientDist, '.vite/manifest.json');
  const manifest: Manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const inMain = new Set<string>();
  const addMain = (k: string) => {
    if (inMain.has(k) || !manifest[k]) return;
    inMain.add(k);
    for (const i of manifest[k].imports ?? []) addMain(i);
  };
  for (const [k, c] of Object.entries(manifest)) if (c.isEntry) addMain(k);

  // Commun à toutes les pages : og:image absolue ; interrupteurs, seulement s'ils diffèrent des défauts.
  const off = featuresDiff(features);
  const featuresMeta = Object.keys(off).length ? `<meta name="sm-features" content='${JSON.stringify(off)}'>` : '';
  const template = raw.replace(/(<meta property="og:image" content=")\//, `$1${escapeHtml(publicUrl)}/`);
  const patterns = ROUTES.map(r => [routePattern(r.path), r] as const);

  /** HTML d'une page ; `canonical` : chemin canonique, déjà échappé (null pour la page introuvable). */
  const build = (r: RouteDef, canonical: string | null) => {
    const key = moduleOf(r);
    const title = ROUTE_TITLES[r.path];
    const url = canonical === null ? null : escapeHtml(publicUrl) + canonical;
    const tags = [
      ...(url ? [`<link rel="canonical" href="${url}">`, `<meta property="og:url" content="${url}">`] : []),
      ...(featuresMeta ? [featuresMeta] : []),
      ...(manifest[key] ? [pageHints(manifest, key, inMain)].filter(Boolean) : []),
    ].join('\n    ');
    let html = title ? template.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(pageTitle(title))}</title>`) : template;
    if (tags) html = html.replace(/\s*<\/head>/, `\n    ${tags}\n  </head>`);
    return html;
  };
  const etagOf = (s: string) => createHash('sha1').update(s).digest('base64url').slice(0, 27);

  /** Pages déjà calculées ; celle d'une route à paramètre garde PATH_SLOT à la place de son chemin canonique. */
  const cache = new Map<RouteDef, ServedPage>();
  return (pathname: string): ServedPage => {
    const hit = patterns.find(([re]) => re.test(pathname))?.[1];
    const r = hit && routeOpen(hit, features) ? hit : NOT_FOUND;
    const withParams = r.path.includes(':');
    let p = cache.get(r);
    if (!p) {
      const html = r === NOT_FOUND ? build(r, null) : build(r, withParams ? PATH_SLOT : escapeHtml(r.path));
      p = { status: r === NOT_FOUND ? 404 : 200, html, etag: `W/"${etagOf(html)}"` };
      cache.set(r, p);
    }
    if (!withParams) return p;
    // Page à paramètre (/joueur/:username) : seule son adresse canonique suit le chemin demandé.
    const canonical = escapeHtml(canonicalPath(r, pathname));
    return { status: p.status, html: p.html.split(PATH_SLOT).join(canonical), etag: `W/"${etagOf(p.etag + canonical)}"` };
  };
}

/**
 * Cookie d'invité posé dès le HTML s'il manque ou ne se vérifie pas (nom, lecture, signature et options de identify,
 * src/server/auth.ts : GUEST_COOKIE, parseCookies, guestCookieOptions) : le socket, ouvert avant la réponse de
 * /api/me, a ainsi déjà son identité d'invité.
 */
function ensureGuestCookie(req: Request, res: Response) {
  if (unsign(parseCookies(req.headers.cookie)[GUEST_COOKIE])) return;
  res.cookie(GUEST_COOKIE, sign(randomToken(12)), guestCookieOptions());
}

export function serveBuiltSite(app: Express, clientDist: string, opts: SiteOptions = {}) {
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
  // l'import échoue et la limite d'erreur de la page recharge le site (App.tsx, PageBoundary).
  app.use('/assets', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Fichier introuvable.');
  });
  const htmlFor = pagesHtml(clientDist, opts);
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (req, res) => {
    const page = htmlFor(req.path);
    ensureGuestCookie(req, res);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', page.etag);
    // Statut posé avant le test de fraîcheur : une page introuvable (404) n'est jamais répondue en 304.
    res.status(page.status);
    if (req.fresh) {
      res.status(304).end();
      return;
    }
    res.type('html').send(page.html);
  });
}
