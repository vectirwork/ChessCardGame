/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { tsImport } from 'tsx/esm/api';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Polices : aucun préchargement. Mesuré (4G simulée, CPU ÷4, médianes de 3) : précharger les 5 polices du premier écran
// (124 ko) retardait l'accueil (LCP 5,1 s contre 4,6 s sans), elles prennent la bande passante du JavaScript sans
// lequel rien ne s'affiche. Inter est de toute façon demandée tôt (texte du corps).

/**
 * Fichiers précompressés à côté des originaux (`.br` brotli 11 et `.gz` gzip 9) : le serveur les envoie tels quels
 * (src/server/site.ts). Brotli 11 donne 15 à 20 % de moins que la compression à la volée (brotli 4), sans coût CPU par
 * requête. Les formats déjà compressés (woff2, webp, png, jpg) ne sont pas touchés.
 */
export function precompress(): Plugin {
  const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|webmanifest|txt)$/;
  let outDir = 'dist/client';
  const br = promisify(brotliCompress);
  const gz = promisify(gzip);
  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])));
    return nested.flat();
  }
  return {
    name: 'spellmate:precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    // Après une construction en échec (règles impossibles…), rien à compresser : le dossier de sortie peut ne pas
    // exister (construction neuve, image Docker), et une erreur ENOENT remplacerait le message utile.
    async closeBundle(error) {
      if (error || !existsSync(outDir)) return;
      const files = (await walk(outDir)).filter(f => COMPRESSIBLE.test(f) && !f.includes(`${path.sep}.vite${path.sep}`));
      await Promise.all(
        files.map(async file => {
          if ((await stat(file)).size < 1024) return;
          const data = await readFile(file);
          const [b, g] = await Promise.all([
            br(data, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
            gz(data, { level: 9 }),
          ]);
          if (b.length < data.length * 0.95) await writeFile(`${file}.br`, b);
          if (g.length < data.length * 0.95) await writeFile(`${file}.gz`, g);
        }),
      );
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Marque, textes chiffrés et règles : figés au build depuis src/shared/config

/**
 * Modules de réglages lus par la construction. Chargés par tsx (comme le serveur en développement), pas importés en
 * tête de ce fichier : Vite assemble sa configuration lui-même, et les imports sans extension de src/ y sont
 * signalés comme incompatibles avec son futur chargeur natif (une quarantaine de lignes à chaque build et chaque test).
 */
interface Settings {
  keys: typeof import('./src/client/storageKeys');
  brand: typeof import('./src/shared/config/brand');
  rules: typeof import('./src/shared/config/rules');
  routes: typeof import('./src/shared/config/routes');
  protocol: typeof import('./src/shared/protocol');
  check: typeof import('./src/shared/rules');
  fr: typeof import('./src/shared/text/fr');
  regles: typeof import('./src/shared/text/regles');
  bot: typeof import('./src/shared/bot');
  limits: typeof import('./src/shared/config/limits');
}
let settings: Promise<Settings> | undefined;
export function loadSettings(): Promise<Settings> {
  const load = (p: string) => tsImport(p, import.meta.url);
  return (settings ??= Promise.all(
    ['./src/client/storageKeys.ts', './src/shared/config/brand.ts', './src/shared/config/rules.ts', './src/shared/config/routes.ts',
      './src/shared/protocol.ts', './src/shared/rules.ts', './src/shared/text/fr.ts', './src/shared/text/regles.ts',
      './src/shared/bot.ts', './src/shared/config/limits.ts'].map(load),
  ).then(([keys, brand, rules, routes, protocol, check, fr, regles, bot, limits]) => ({ keys, brand, rules, routes, protocol, check, fr, regles, bot, limits })));
}

/**
 * Constantes du paquet principal (en-tête, pied de page, titre des pages, rechargement, version du protocole), figées
 * au build depuis les réglages. Le code du paquet principal les lit en `__SM__.<nom>` (remplacé par la valeur à la
 * construction, en développement et sous Vitest) : il n'importe ainsi ni BRAND, ni KEYS, ni protocol.ts, ni les
 * phrases de règles, qui l'alourdiraient (BRAND : +0,1 ko compressé ; KEYS : +0,2 ko ; protocol.ts : un morceau de
 * plus à télécharger avant le premier rendu ; bot.ts : tout le moteur). Une page s'en sert aussi quand un import
 * ferait un morceau de plus ou chargerait du code pour une valeur fixe (bornes des pseudos : Jouer, Connexion, « Défier
 * un ami » ; durée du choix : Règles, Jouer ; marque du partage : partie). Ailleurs, importer directement BRAND, KEYS,
 * PROTOCOL_VERSION.
 * Ne s'écrit qu'avec une propriété : `__SM__.marque`, jamais `__SM__` seul (non défini à l'exécution). Le banc de la
 * coque (test/identite.mjs, assemblé par esbuild sans ces constantes) ne doit en lire aucune au chargement d'un module.
 */
export interface BuildConstants {
  /** BRAND.name : « Spellmate ». */
  marque: string;
  /** BRAND.nameCaps : logo. */
  marqueCapitales: string;
  /** BRAND.footerTagline : accroche du pied de page. */
  accrochePied: string;
  /** Fin du titre d'une page : pageTitle(t) = t + suffixeTitre (« · Spellmate »). */
  suffixeTitre: string;
  /** pageTitle() : titre de l'accueil, et des pages qui n'en posent pas. */
  titreAccueil: string;
  /** cartesDePouvoir(GAME_RULES) : « trois cartes de pouvoir » (pied de page). */
  cartesDePouvoir: string;
  /** Noms des niveaux de l'IA (BOT_LEVELS, BOT_PROFILES) : « Apprenti, Sorcier, Archimage » (menu). */
  niveauxIA: string;
  /** KEYS.reload : garde d'une minute du rechargement automatique. */
  cleRechargement: string;
  /** PROTOCOL_VERSION, annoncée à la connexion du socket. */
  protocole: number;
  /**
   * Pseudo d'invité (GUEST_NAME, config/limits.ts) : longueur maximale, forme complète (source et drapeaux de
   * l'expression `full`) et refus. Lu par Jouer et la feuille « Défier un ami » de l'accueil : un import de limits.ts
   * en ferait un morceau de plus, partagé avec la page de partie (une requête de plus pour ces pages).
   */
  pseudoInvite: { max: number; motif: string; drapeaux: string; invalide: string; invalideDetail: string };
  /** Pseudo d'un compte (USERNAME) : bornes, attribut `pattern` du champ (tiré de USERNAME.chars) et aide (Connexion). */
  pseudoCompte: { min: number; max: number; pattern: string; aide: string };
  /** Mot de passe (PASSWORD) : longueur minimale et aide (Connexion). */
  motDePasse: { min: number; aide: string };
  /**
   * dureeChoix() : durée du choix des cartes, « 45 secondes » (Règles, Jouer). Figée ici, elle laisse duree() de
   * text/fr.ts hors du code du client (le morceau fr, que charge l'accueil).
   */
  dureeChoix: string;
}

declare global {
  /** Constantes figées au build pour le paquet principal : voir BuildConstants (vite.config.ts). */
  const __SM__: Readonly<BuildConstants>;
}

/**
 * Attribut `pattern` d'un champ, tiré d'une expression ancrée (USERNAME.chars) : sans ses ancres, que le navigateur
 * ajoute, et avec le tiret final d'une classe échappé (le navigateur compile `pattern` avec le drapeau v, qui refuse
 * un « - » nu en fin de classe).
 */
export function inputPattern(re: RegExp): string {
  return re.source.replace(/^\^|\$$/g, '').replace(/-\]/g, '\\-]');
}

export function buildConstants({ brand, rules, regles, keys, protocol, bot, limits }: Settings): BuildConstants {
  const { GUEST_NAME, USERNAME, PASSWORD } = limits;
  return {
    marque: brand.BRAND.name,
    marqueCapitales: brand.BRAND.nameCaps,
    accrochePied: brand.BRAND.footerTagline,
    suffixeTitre: `${brand.BRAND.titleSeparator}${brand.BRAND.name}`,
    titreAccueil: brand.pageTitle(),
    cartesDePouvoir: regles.cartesDePouvoir(rules.GAME_RULES),
    niveauxIA: regles.nomsNiveaux(bot.BOT_LEVELS.map(l => bot.BOT_PROFILES[l].name), ','),
    cleRechargement: keys.KEYS.reload,
    protocole: protocol.PROTOCOL_VERSION,
    pseudoInvite: {
      max: GUEST_NAME.max,
      motif: GUEST_NAME.full.source,
      drapeaux: GUEST_NAME.full.flags,
      invalide: GUEST_NAME.invalid,
      invalideDetail: GUEST_NAME.invalidDetail,
    },
    pseudoCompte: { min: USERNAME.min, max: USERNAME.max, pattern: inputPattern(USERNAME.chars), aide: USERNAME.hint },
    motDePasse: { min: PASSWORD.min, aide: PASSWORD.hint },
    dureeChoix: regles.dureeChoix(rules.DEAL),
  };
}

/**
 * Valeurs des marqueurs %SM_…% de index.html et de public/manifest.webmanifest. Au réglage par défaut, les deux
 * fichiers construits sont identiques octet pour octet à ceux d'avant (test/marque.test.ts).
 */
export function brandMarkers({ brand, rules, regles, fr }: Settings): Record<string, string> {
  const { BRAND, pageTitle } = brand;
  return {
    TITRE: pageTitle(),
    NOM: BRAND.name,
    NOM_COURT: BRAND.shortName,
    ACCROCHE: BRAND.tagline,
    COULEUR_THEME: BRAND.themeColor,
    COULEUR_FOND: BRAND.backgroundColor,
    CARTES_DE_POUVOIR: regles.cartesDePouvoir(rules.GAME_RULES),
    VISIBLES: fr.pluriel(rules.GAME_RULES.cardsPerPlayer, 'visible'),
    SORT_PAR_TOUR: regles.sortParTour(rules.GAME_RULES),
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeJson = (s: string) => JSON.stringify(s).slice(1, -1);

/** Remplace les marqueurs %SM_…% d'un fichier ; un marqueur inconnu est une erreur (jamais de fichier à trous). */
export function fillMarkers(text: string, file: string, values: Record<string, string>, escape: (s: string) => string): string {
  return text.replace(/%SM_([A-Z_]+)%/g, (m, name: string) => {
    if (!Object.hasOwn(values, name)) throw new Error(`${file} : marqueur inconnu ${m} (marqueurs : ${Object.keys(values).join(', ')}).`);
    return escape(values[name]);
  });
}

/** robots.txt : l'API et les pages NOT_INDEXED (src/shared/config/routes.ts). */
export function robotsTxt({ routes }: Settings): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', ...routes.NOT_INDEXED.map(p => `Disallow: ${p}`), ''].join('\n');
}

/**
 * Greffon de la marque :
 * - index.html : marqueurs %SM_…% remplacés (construction et développement) ;
 * - manifest.webmanifest : modèle public/manifest.webmanifest, marqueurs remplacés, émis à la construction (il remplace
 *   la copie brute du dossier public) et servi tel quel en développement ;
 * - robots.txt : produit depuis NOT_INDEXED (src/shared/config/routes.ts) ;
 * - constantes du paquet principal (__SM__) ;
 * - règles : checkRules() à la construction ; une configuration impossible arrête le build avec ses messages, avant
 *   toute mise en ligne (deploy/update.sh construit avant de remplacer la version en ligne).
 * `check` remplace checkRules (tests).
 */
export function brand(opts: { check?: () => string[] } = {}): Plugin {
  let command: 'build' | 'serve' = 'serve';
  let manifestTemplate = '';
  let markers: Record<string, string> = {};
  let robots = '';
  const manifest = () => fillMarkers(readFileSync(manifestTemplate, 'utf8'), 'public/manifest.webmanifest', markers, escapeJson);
  return {
    name: 'spellmate:marque',
    async config() {
      const s = await loadSettings();
      markers = brandMarkers(s);
      robots = robotsTxt(s);
      const define: Record<string, string> = {};
      for (const [k, v] of Object.entries(buildConstants(s))) define[`__SM__.${k}`] = JSON.stringify(v);
      return { define };
    },
    configResolved(config) {
      command = config.command;
      manifestTemplate = path.join(config.publicDir || path.join(config.root, 'public'), 'manifest.webmanifest');
    },
    async buildStart() {
      if (command !== 'build') return;
      const errors = opts.check ? opts.check() : (await loadSettings()).check.checkRules();
      if (errors.length) this.error(`Règles impossibles : construction arrêtée.\n${errors.map(e => `- ${e}`).join('\n')}`);
    },
    transformIndexHtml: {
      order: 'pre',
      handler: html => fillMarkers(html, 'index.html', markers, escapeHtml),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === '/manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifest());
        } else if (url === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(robots);
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    },
  };
}

/** Tests lents (projet « lent ») et paramétrés par les réglages (projet « matrice ») ; le reste est « rapide ». */
const TESTS_LENTS = ['test/bot.test.ts'];
const TESTS_MATRICE = ['test/regles-matrice.test.ts', 'test/**/*.matrice.test.ts'];

export default defineConfig({
  plugins: [react(), brand(), precompress()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
    // dist/client/.vite/manifest.json : le serveur y lit le code et le CSS de chaque page pour les précharger dès le
    // HTML (src/server/site.ts). Jamais servi (dossier caché).
    manifest: true,
  },
  // Tests (Vitest) : trois projets. npm test les lance tous ; npm run test:rapide pendant le travail.
  // - rapide : toute la suite, sauf ce qui suit ;
  // - matrice : tests paramétrés par les réglages (SPELLMATE_MATRICE, test/helpers/matrice.ts) ;
  // - lent : l'IA à pleine profondeur (bot.test.ts).
  // Les témoins (test/fixtures/v1/generer.ts) ont leur propre configuration : npm run temoins.
  test: {
    projects: [
      { extends: true, test: { name: 'rapide', include: ['test/**/*.test.ts'], exclude: [...TESTS_LENTS, ...TESTS_MATRICE] } },
      { extends: true, test: { name: 'matrice', include: TESTS_MATRICE } },
      { extends: true, test: { name: 'lent', include: TESTS_LENTS } },
    ],
  },
});
