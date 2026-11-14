// Marque et fichiers construits (lot 6) : au réglage par défaut, `vite build` produit index.html, le manifeste et
// robots.txt identiques octet pour octet à ceux d'avant la passe (noms de fichiers hachés normalisés). La liste des
// <link rel="modulepreload"> du paquet principal fait partie de la comparaison : un module qui changerait de morceau
// (api-*.js fondu dans le paquet principal, protocol-*.js tiré par le client…) la change.
// Les mêmes fichiers sont servis en développement (greffon spellmate:marque, vite.config.ts), et des règles
// impossibles arrêtent la construction avec les messages de checkRules.
//
// Le build est fait ici, dans un dossier temporaire, avec la vraie configuration (vite.config.ts) : quelques secondes.
// NODE_ENV vaut « test » sous Vitest : il est mis à « production » le temps du build (sinon React construit sa
// version de développement, jsx-dev-runtime).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GAME_RULES, RULES_V1 } from '../src/shared/config/rules';
import { checkRules } from '../src/shared/rules';
import { pluriel } from '../src/shared/text/fr';
import { cartesDePouvoir, sortParTour } from '../src/shared/text/regles';
import { brand, fillMarkers, precompress } from '../vite.config';

const ROOT = path.resolve(__dirname, '..');

/** Empreintes des noms de fichiers construits (8 caractères) remplacées : seule la structure compte. */
const normaliser = (html: string) => html.replace(/-[A-Za-z0-9_-]{8}\.(js|css)\b/g, '-‹h›.$1');

/** dist/client/index.html au commit 7274072 (avant le lot 6), empreintes normalisées. */
const INDEX_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Spellmate · Les échecs ont appris la magie</title>
    <meta name="description" content="Jouez aux échecs avec trois cartes de pouvoir qui changent la partie pour les deux camps : Trêve, Lune de sang, Mur de glace… Gratuit, en ligne, sans inscription, contre l’IA ou un ami." />
    <meta name="theme-color" content="#04050f" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Spellmate · Les échecs ont appris la magie" />
    <meta property="og:description" content="Une vraie partie d’échecs, trois cartes de pouvoir visibles des deux joueurs, un sort par tour. Gratuit, en ligne, avec ou sans compte." />
    <meta property="og:image" content="/og.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="module" crossorigin src="/assets/index-‹h›.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/jsx-runtime-‹h›.js">
    <link rel="modulepreload" crossorigin href="/assets/api-‹h›.js">
    <link rel="stylesheet" crossorigin href="/assets/index-‹h›.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

/** dist/client/manifest.webmanifest au commit 7274072. */
const MANIFESTE = `{
  "name": "Spellmate",
  "short_name": "Spellmate",
  "description": "Les échecs ont appris la magie : une vraie partie, trois cartes de pouvoir. Gratuit, sans compte.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#04050f",
  "theme_color": "#04050f",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "lang": "fr"
}
`;

/**
 * Fichiers attendus au nombre de cartes et aux cartes par tour du jour (GAME_RULES) : ceux d'avant la passe au défaut
 * (mêmes valeurs que RULES_V1), sinon les mêmes avec les phrases dérivées (« cinq cartes de pouvoir », « deux sorts
 * par tour »), comme les marqueurs %SM_CARTES_DE_POUVOIR%, %SM_VISIBLES% et %SM_SORT_PAR_TOUR% (vite.config.ts).
 */
function auJour(fichier: string): string {
  const r = GAME_RULES;
  if (r.cardsPerPlayer === RULES_V1.cardsPerPlayer && r.cardsPerTurn === RULES_V1.cardsPerTurn && r.cardEndsTurn === RULES_V1.cardEndsTurn) {
    return fichier;
  }
  return fichier
    .replace('trois cartes de pouvoir visibles des deux', `${cartesDePouvoir(r)} ${pluriel(r.cardsPerPlayer, 'visible')} des deux`)
    .replaceAll('trois cartes de pouvoir', cartesDePouvoir(r))
    .replace('un sort par tour.', `${sortParTour(r)}.`);
}

/** dist/client/robots.txt au commit 7274072. */
const ROBOTS = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /compte
Disallow: /admin
`;

describe('construction au réglage par défaut : fichiers identiques', () => {
  let out = '';
  // Configuration du jour impossible (checkRules, par exemple 6 cartes) : la construction doit s'arrêter avec ses
  // messages, et il n'y a pas de fichier à comparer. C'est le garde voulu (test/config.test.ts le signale aussi).
  const erreurs = checkRules();
  let refus: unknown = null;
  beforeAll(async () => {
    out = mkdtempSync(path.join(os.tmpdir(), 'spellmate-marque-'));
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const fait = build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'production', logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
      if (erreurs.length) refus = await fait.catch((e: unknown) => e);
      else await fait;
    } finally {
      vi.unstubAllEnvs();
    }
  }, 120_000);
  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });
  const lire = (f: string) => readFileSync(path.join(out, f), 'utf8');
  /** Règles du jour impossibles : la construction s'est arrêtée sur les messages de checkRules (rien à comparer). */
  const arretee = () => {
    if (!erreurs.length) return false;
    expect(String((refus as Error | null)?.message)).toContain('Règles impossibles : construction arrêtée.');
    for (const m of erreurs) expect(String((refus as Error).message)).toContain(m);
    return true;
  };

  it('index.html (empreintes normalisées), modulepreload du paquet principal compris', () => {
    if (arretee()) return;
    expect(normaliser(lire('index.html'))).toBe(auJour(INDEX_HTML));
  });
  it('manifeste', () => {
    if (arretee()) return;
    expect(lire('manifest.webmanifest')).toBe(auJour(MANIFESTE));
  });
  it('robots.txt', () => {
    if (arretee()) return;
    expect(lire('robots.txt')).toBe(ROBOTS);
  });
});

describe('développement : mêmes fichiers servis par le serveur de Vite', () => {
  let server: ViteDevServer;
  let base = '';
  beforeAll(async () => {
    // Port de la plage du lot 6 (3860 à 3869), le suivant libre sinon
    server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'silent', server: { port: 3866, hmr: false } });
    await server.listen();
    base = server.resolvedUrls!.local[0].replace(/\/$/, '');
  }, 60_000);
  afterAll(async () => {
    await server?.close();
  });
  it('index.html : marqueurs remplacés, comme à la construction', async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).not.toContain('%SM_');
    // Chaque ligne de l'en-tête construit (titre, description, couleur, partage), à l'identique ; les balises du paquet
    // principal n'existent qu'à la construction, et Vite ajoute les siennes en développement.
    const lignes = auJour(INDEX_HTML).split('\n').filter(l => /<(title|meta|link rel="(icon|apple-touch-icon|manifest)")/.test(l));
    expect(lignes.length).toBe(13);
    for (const l of lignes) expect(html, l).toContain(l);
  });
  it('manifeste et robots.txt', async () => {
    expect(await (await fetch(`${base}/manifest.webmanifest`)).text()).toBe(auJour(MANIFESTE));
    expect(await (await fetch(`${base}/robots.txt`)).text()).toBe(ROBOTS);
  });
});

describe('règles impossibles : la construction s’arrête', () => {
  let racine = '';
  beforeAll(() => {
    racine = mkdtempSync(path.join(os.tmpdir(), 'spellmate-regles-'));
    mkdirSync(path.join(racine, 'public'));
    writeFileSync(path.join(racine, 'index.html'), '<!doctype html>\n<html><head><title>%SM_TITRE%</title></head><body></body></html>\n');
    writeFileSync(path.join(racine, 'public/manifest.webmanifest'), '{"name":"%SM_NOM%"}\n');
  });
  afterAll(() => {
    if (racine) rmSync(racine, { recursive: true, force: true });
  });
  const construire = (check: () => string[]) =>
    build({ root: racine, configFile: false, logLevel: 'silent', plugins: [brand({ check })], build: { outDir: path.join(racine, 'dist'), emptyOutDir: true } });

  it('checkRules en erreur : build rejeté avec ses messages', async () => {
    const erreurs = checkRules({ game: { ...GAME_RULES, cardsPerPlayer: 9 } });
    expect(erreurs.length).toBeGreaterThan(0);
    const e = await construire(() => erreurs).catch((x: Error) => x);
    expect(e).toBeInstanceOf(Error);
    expect(String((e as Error).message)).toContain('Règles impossibles : construction arrêtée.');
    for (const m of erreurs) expect(String((e as Error).message)).toContain(m);
  }, 60_000);
  it('construction neuve (dossier de sortie absent, comme dans l’image Docker) : le message de checkRules reste visible', async () => {
    // Avec la compression des fichiers construits (precompress, vite.config.ts), qui ne doit rien lire après un échec
    const sortie = path.join(racine, 'neuf', 'client');
    const e = await build({
      root: racine, configFile: false, logLevel: 'silent', plugins: [brand({ check: () => ['6 cartes par joueur : impossible.'] }), precompress()],
      build: { outDir: sortie, emptyOutDir: true },
    }).catch((x: Error) => x);
    expect(e).toBeInstanceOf(Error);
    expect(String((e as Error).message)).toContain('Règles impossibles : construction arrêtée.\n- 6 cartes par joueur : impossible.');
    expect(String((e as Error).message)).not.toContain('ENOENT');
  }, 60_000);
  it('règles jouables : la même construction aboutit, marqueurs remplacés', async () => {
    await construire(() => []);
    expect(readFileSync(path.join(racine, 'dist/index.html'), 'utf8')).toContain('<title>Spellmate · Les échecs ont appris la magie</title>');
    expect(readFileSync(path.join(racine, 'dist/manifest.webmanifest'), 'utf8')).toBe('{"name":"Spellmate"}\n');
  }, 60_000);
  it('marqueur inconnu : erreur, jamais de fichier à trous', () => {
    expect(() => fillMarkers('<b>%SM_INCONNU%</b>', 'index.html', { NOM: 'x' }, s => s)).toThrow('index.html : marqueur inconnu %SM_INCONNU%');
  });
});
