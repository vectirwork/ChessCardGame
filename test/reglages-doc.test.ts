// Documentation des réglages (docs/REGLAGES.md, lot 9c de la passe « polymorphe ») : ce qu'elle cite existe, et ce
// qu'elle affirme des valeurs est vrai dans le code. Une documentation qui se trompe est pire que pas de documentation.
// - Chemins du dépôt cités entre accents graves (src/…, test/…, scripts/…, docs/…, deploy/…, public/…, fichiers de la
//   racine) : ils existent. Fichiers cités par leur seul nom (`defauts.json`) : un fichier de ce nom existe.
// - Commandes `npm run <script>` : le script existe dans package.json.
// - Noms cités entre accents graves (constantes, fonctions, champs, variables d'environnement) : chacun de leurs
//   segments figure dans le code, les scripts, la configuration ou l'outillage des tests (une faute de frappe se
//   voit).
// - Tables de réglages (colonnes « Réglage » et « Défaut ») : chaque réglage existe ; une valeur écrite en code dans
//   « Défaut » est celle du code ; « `defauts` » figure dans « Vérifié par » si et seulement si
//   test/garde-fous/defauts.json photographie ce réglage.
// - Leçons et problèmes « masqués » par un réglage (sections 3.5 à 3.8) : exactement ceux que masque `requires`.
// - Messages de checkRules cités : identiques à ceux du code.
// Les chemins et les commandes de README.md sont vérifiés de la même façon.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as bot from '../src/shared/bot';
import * as cards from '../src/shared/cards';
import * as catalog from '../src/shared/catalog';
import * as brand from '../src/shared/config/brand';
import * as features from '../src/shared/config/features';
import * as home from '../src/shared/config/home';
import * as limits from '../src/shared/config/limits';
import * as routes from '../src/shared/config/routes';
import * as config from '../src/shared/config/rules';
import * as timings from '../src/shared/config/timings';
import { ALL_LESSONS, lessonsFor } from '../src/shared/lessons';
import * as protocol from '../src/shared/protocol';
import { ALL_PUZZLES, puzzlesFor } from '../src/shared/puzzles';
import type { ContentRules } from '../src/shared/puzzles';
import { checkRules, maxValidHand, poolOf } from '../src/shared/rules';
import * as fr from '../src/shared/text/fr';
import * as settings from '../src/server/settings';
import * as engine from '../src/client/features/engine';
import { PLACES } from '../src/client/odyssee/data';
import * as storage from '../src/client/storageKeys';
import { CARD_ART } from '../src/client/components/CardArt';
import { CARD_SCENES } from '../src/client/components/cardScenes';
import { CARD_SOUND } from '../src/client/sound';
import { BOARD_MARKS } from '../src/client/vfx/boardMarks';
import { CARD_FX } from '../src/client/vfx/cardFx';
import * as vfx from '../src/client/vfx/config';
import * as sharing from '../src/client/vfx/sharing';

const ROOT = path.resolve(__dirname, '..');
const lire = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const DOC = lire('docs/REGLAGES.md');
const README = lire('README.md');
/** Espaces et retours à la ligne ramenés à une espace (les phrases citées passent d'une ligne à l'autre). */
const plat = (s: string) => s.replace(/\s+/g, ' ');

/** Registre des réglages que les tables citent, par nom (FEATURES : les défauts du code, sans les FEATURE_*). */
const REGISTRE: Record<string, unknown> = {
  ...config, ...features, ...brand, ...limits, ...timings, ...home, ...routes, ...protocol, ...fr, ...storage, ...vfx,
  ...sharing, ...engine,
  CARDS: cards.CARDS, CATALOG_IDS: cards.CATALOG_IDS, CATALOG_RULES: cards.CATALOG_RULES, CATALOGS: cards.CATALOGS,
  DEFAULT_CATALOG: cards.DEFAULT_CATALOG, LEGACY_CATALOG: cards.LEGACY_CATALOG,
  BOT_LEVELS: bot.BOT_LEVELS, DEFAULT_BOT_LEVEL: bot.DEFAULT_BOT_LEVEL, BOT_PROFILES: bot.BOT_PROFILES,
  DRAFT_VALUE: bot.DRAFT_VALUE, DRAFT_NOISE: bot.DRAFT_NOISE,
  BOT_LOOK: catalog.BOT_LOOK, ORACLE_LOOK: catalog.ORACLE_LOOK, CURRENCY: catalog.CURRENCY,
  PAYMENT_PROVIDER: catalog.PAYMENT_PROVIDER, SHOP_FEATURED: catalog.SHOP_FEATURED, TRESOR: catalog.TRESOR,
  PRICE: catalog.PRICE, SLOT_DEFS: catalog.SLOT_DEFS,
  TIMINGS: settings.TIMINGS, RATING: settings.RATING, MATCHMAKING: settings.MATCHMAKING, RELAY: settings.RELAY,
  BOT_RUNTIME: settings.BOT_RUNTIME, DATABASE: settings.DATABASE, BOT_THREADS: settings.BOT_THREADS,
  PERSIST: settings.PERSIST, LIMITS: settings.LIMITS, ACCOUNT: settings.ACCOUNT,
  PLACES, CARD_FX, BOARD_MARKS, CARD_SOUND, CARD_ART, CARD_SCENES,
};
/** Cités dans une table mais propres à chaque carte (pas un réglage nommé). */
const PAR_CARTE = new Set(['retired']);
/** Réglages dont test/garde-fous/defauts.json photographie la valeur (noms de premier niveau de chaque groupe). */
const PHOTOGRAPHIES = new Set(
  Object.entries(JSON.parse(lire('test/garde-fous/defauts.json')) as Record<string, unknown>)
    .filter(([k]) => k !== '//')
    .flatMap(([, v]) => Object.keys(v as object)),
);

/** Valeur d'un nom pointé (« DEAL.handLimits.maxPerFamily.climat ») dans le registre. */
function valeur(nom: string): unknown {
  return nom.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), REGISTRE);
}

/** Code entre accents graves, hors blocs de code. */
function codes(md: string): string[] {
  return [...md.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim());
}

/** Fichiers du dépôt (sans node_modules, dist, data, .git), chemins relatifs. */
function fichiers(dossier = '.'): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(ROOT, dossier), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'data', '.git'].includes(e.name)) continue;
    const rel = dossier === '.' ? e.name : `${dossier}/${e.name}`;
    if (e.isDirectory()) out.push(...fichiers(rel));
    else out.push(rel);
  }
  return out;
}
const TOUS = fichiers();
const NOMS = new Set(TOUS.map(f => path.basename(f)));

/**
 * Texte où les noms cités doivent figurer : code, scripts, configuration, outillage des tests. Sans les fichiers de
 * tests eux-mêmes, qui écrivent exprès des noms faux (« cardPerPlayer » : refus d'une faute de frappe).
 */
const CORPUS = TOUS.filter(f => /^(src|scripts|deploy|test\/(helpers|lib))\//.test(f))
  .filter(f => /\.(ts|tsx|mjs|js|json|css|sh|env)$/.test(f))
  .concat(TOUS.filter(f => /^test\/[^/]+\.mjs$/.test(f)))
  .concat(['vite.config.ts', '.env.example', 'package.json', 'test/fixtures/v1/generer.ts'])
  .map(lire)
  .join('\n');

const DOSSIERS = /^(src|test|scripts|docs|deploy|public|concepts)\//;
/** Fichiers produits par la construction (dist/client), cités sans exister dans le dépôt. */
const CONSTRUITS = new Set(['robots.txt']);
const RACINE = new Set([
  'vite.config.ts', 'index.html', 'package.json', '.env.example', 'README.md', 'Dockerfile', 'tsconfig.json',
  'tsconfig.concepts.json', 'docker-compose.yml',
]);

/** Chemins cités (mots d'un code qui désignent un fichier ou un dossier du dépôt). */
function chemins(md: string): string[] {
  const out = new Set<string>();
  for (const c of codes(md)) {
    for (const mot of c.split(/\s+/)) {
      const m = mot.replace(/[,;:)]+$/, '');
      if ((DOSSIERS.test(m) || RACINE.has(m)) && !/[<{…]/.test(m)) out.add(m);
    }
  }
  return [...out];
}

function existe(p: string): boolean {
  if (p.includes('*')) return existsSync(path.join(ROOT, p.slice(0, p.indexOf('*'))));
  return existsSync(path.join(ROOT, p));
}

/** Tables Markdown : en-têtes et lignes, cellules nettoyées. */
function tables(md: string): { entetes: string[]; lignes: string[][] }[] {
  const out: { entetes: string[]; lignes: string[][] }[] = [];
  const lignes = md.split('\n').map(l => l.trim());
  const cellules = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  for (let i = 0; i < lignes.length - 1; i++) {
    if (!lignes[i].startsWith('|') || !/^\|[-|\s]+\|$/.test(lignes[i + 1].trim())) continue;
    const t = { entetes: cellules(lignes[i]), lignes: [] as string[][] };
    for (i += 2; i < lignes.length && lignes[i].startsWith('|'); i++) t.lignes.push(cellules(lignes[i]));
    out.push(t);
  }
  return out;
}

/** Valeur écrite en code au début d'une cellule (`3`, `45_000`, `"climats"`, `[1, 6]`, `{ … }`), ou undefined. */
function litteral(cellule: string): { ok: true; v: unknown } | { ok: false } {
  const m = /^`([^`]+)`/.exec(cellule);
  if (!m) return { ok: false };
  try {
    return { ok: true, v: JSON.parse(m[1].replace(/(\d)_(?=\d)/g, '$1')) };
  } catch {
    return { ok: false };
  }
}

/** Section du document, de son titre au titre suivant de même niveau ou plus haut. */
function section(titre: string): string {
  const debut = DOC.indexOf(titre);
  expect(debut, titre).toBeGreaterThanOrEqual(0);
  const niveau = /^#+/.exec(titre)![0].length;
  const suite = DOC.slice(debut + titre.length);
  const fin = suite.search(new RegExp(`\\n#{1,${niveau}} `));
  return fin < 0 ? suite : suite.slice(0, fin);
}

/** Titres entre guillemets « » d'une puce « - Masqués … » d'une section. */
function masquesCites(texte: string): string[] {
  const m = /\n- Masqués[\s\S]*?(?=\n- |\n\n|$)/.exec(texte);
  expect(m, 'puce « Masqués »').not.toBeNull();
  return [...plat(m![0]).matchAll(/«\s*([^»]+?)\s*»/g)].map(x => x[1]);
}

const titresMasques = (r: ContentRules) => [
  ...ALL_LESSONS.filter(l => !lessonsFor(r).includes(l)).map(l => l.title),
  ...ALL_PUZZLES.filter(p => !puzzlesFor(r).includes(p)).map(p => p.title),
];
const sorted = (a: readonly string[]) => [...a].sort();

describe('docs/REGLAGES.md et README.md : ce qui est cité existe', () => {
  it('chemins du dépôt', () => {
    for (const [doc, md] of [['REGLAGES', DOC], ['README', README]] as const) {
      const manquants = chemins(md).filter(p => !existe(p));
      expect(manquants, doc).toEqual([]);
    }
  });

  it('fichiers cités par leur seul nom', () => {
    const noms = codes(DOC).filter(c => /^[\w.-]+\.(ts|tsx|mjs|json|txt|css|html|md)$/.test(c) && !RACINE.has(c));
    expect(noms.filter(n => !NOMS.has(n) && !CONSTRUITS.has(n))).toEqual([]);
  });

  it('commandes npm run', () => {
    const scripts = (JSON.parse(lire('package.json')) as { scripts: Record<string, string> }).scripts;
    for (const md of [DOC, README]) {
      const cites = [...md.matchAll(/npm run ([\w:-]+)/g)].map(m => m[1]);
      expect(cites.length).toBeGreaterThan(0);
      expect(cites.filter(s => !(s in scripts))).toEqual([]);
    }
  });

  it('noms de constantes, de fonctions, de champs et de variables', () => {
    const NOM = /^[A-Za-z_$][\w$]*(\.[\p{L}\w$]+)*(\([\w, ]*\))?$/u;
    /**
     * Noms d'un code : le code entier s'il est un nom ; les clés d'un objet (`{ amicale: { cardsPerPlayer: 5 } }`) ; pour
     * une affectation (`DEAL.draft = false`), le nom affecté et les clés de l'objet affecté.
     */
    const noms = (c: string): string[] => {
      if (NOM.test(c)) return [c];
      const cles = (o: string) => [...o.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map(x => x[1]);
      if (c.startsWith('{')) return cles(c);
      const m = /^([\w$.]+)\s*=\s*(.*)$/u.exec(c);
      return m ? [m[1], ...cles(m[2])] : [];
    };
    const absents = new Set<string>();
    for (const c of codes(DOC)) {
      for (const nom of noms(c)) {
        for (const seg of nom.replace(/\(.*\)$/, '').split('.')) {
          if (['true', 'false', 'null'].includes(seg)) continue;
          const re = new RegExp(`(?<![\\p{L}\\p{N}_$])${seg.replace(/\$/g, '\\$')}(?![\\p{L}\\p{N}_$])`, 'u');
          if (!re.test(CORPUS)) absents.add(`${c} (${seg})`);
        }
      }
    }
    expect([...absents]).toEqual([]);
  });
});

describe('docs/REGLAGES.md : tables des réglages', () => {
  const lignes = tables(DOC).flatMap(t => {
    const nom = t.entetes.indexOf('Réglage');
    const defaut = t.entetes.indexOf('Défaut');
    const verifie = t.entetes.indexOf('Vérifié par');
    if (nom < 0 || defaut < 0) return [];
    return t.lignes
      .map(l => ({ cle: /`([^`]+)`/.exec(l[nom])?.[1] ?? '', defaut: l[defaut], verifie: verifie < 0 ? null : l[verifie] }))
      .filter(l => l.cle && !l.cle.includes('*'));
  });

  it('les tables sont lues (plus de cent réglages)', () => {
    expect(lignes.length).toBeGreaterThan(100);
  });

  it('chaque réglage existe', () => {
    const inconnus = lignes.filter(l => !PAR_CARTE.has(l.cle) && valeur(l.cle) === undefined).map(l => l.cle);
    expect(inconnus).toEqual([]);
  });

  it('valeurs par défaut écrites en code : celles du code', () => {
    let vues = 0;
    for (const l of lignes) {
      const lu = litteral(l.defaut);
      if (!lu.ok) continue;
      vues++;
      expect(valeur(l.cle), l.cle).toEqual(lu.v);
    }
    expect(vues).toBeGreaterThan(80);
  });

  it('« defauts » dans « Vérifié par » si et seulement si defauts.json photographie le réglage', () => {
    const faux = lignes
      .filter(l => l.verifie !== null)
      .filter(l => /`defauts`/.test(l.verifie!) !== PHOTOGRAPHIES.has(l.cle.split('.')[0]))
      .map(l => l.cle);
    expect(faux).toEqual([]);
  });

  it('réglages du serveur (4.11) : DATABASE, BOT_THREADS et PERSIST seuls hors de defauts.json', () => {
    const serveur = ['TIMINGS', 'RATING', 'MATCHMAKING', 'RELAY', 'BOT_RUNTIME', 'DATABASE', 'BOT_THREADS', 'PERSIST', 'LIMITS', 'ACCOUNT'];
    expect(serveur.filter(n => !PHOTOGRAPHIES.has(n))).toEqual(['DATABASE', 'BOT_THREADS', 'PERSIST']);
  });

  it('comptes cités : 28 chemins, 6 lieux', () => {
    expect(routes.ROUTES).toHaveLength(28);
    expect(DOC).toContain('28 chemins');
    expect(PLACES).toHaveLength(6);
    expect(DOC).toContain('6 lieux');
  });
});

describe('docs/REGLAGES.md : affirmations vérifiées dans le code', () => {
  const R = config.GAME_RULES;
  const tuning = config.RULES_V1.tuning;

  it('3.5 : problèmes masqués par 2 cartes par tour', () => {
    expect(sorted(masquesCites(section('### 3.5')))).toEqual(sorted(titresMasques({ ...R, cardsPerTurn: 2, tuning })));
  });

  it('3.6 : leçons et problèmes masqués par « la carte remplace le coup »', () => {
    expect(sorted(masquesCites(section('### 3.6')))).toEqual(sorted(titresMasques({ ...R, cardEndsTurn: true, tuning })));
  });

  it('3.7 : leçon et problème masqués par un Présage en 4 demi-coups', () => {
    expect(sorted(masquesCites(section('### 3.7')))).toEqual(sorted(titresMasques({ ...R, presageDelay: 4, tuning })));
  });

  it('3.8 : leçons et problèmes masqués quand une carte est rééquilibrée', () => {
    const t = tables(section('### 3.8')).find(x => x.entetes[0] === 'Carte rééquilibrée');
    expect(t).toBeDefined();
    const titres = (cellule: string) => [...cellule.matchAll(/«\s*([^»]+?)\s*»/g)].map(m => m[1]);
    /** Règles du jour avec la carte `id` rééquilibrée (n'importe quel autre équilibrage). */
    const reequilibre = (id: cards.CardId): ContentRules => ({ ...R, tuning: { ...tuning, [id]: { coups: 99, ranks: [0] } } });
    // Toutes les cartes dont l'équilibrage masque quelque chose sont dans la table.
    const ids = cards.cardsOf('climats').filter(id => titresMasques(reequilibre(id)).length);
    expect(sorted(t!.lignes.map(l => l[0]))).toEqual(sorted(ids.map(id => cards.CARDS[id].name)));
    for (const [nom, lecons, problemes] of t!.lignes) {
      const r = reequilibre(cards.cardsOf('climats').find(i => cards.CARDS[i].name === nom)!);
      const lecs = ALL_LESSONS.filter(l => !lessonsFor(r).includes(l)).map(l => l.title);
      const pbs = ALL_PUZZLES.filter(p => !puzzlesFor(r).includes(p)).map(p => p.title);
      expect(sorted(titres(lecons)), `${nom} : leçons`).toEqual(sorted(lecs));
      expect(sorted(titres(problemes)), `${nom} : problèmes`).toEqual(sorted(pbs));
    }
  });

  it('3.4 : six cartes refusées avec le message cité ; réserve de l’accueil et deux sorties acceptées', () => {
    const six = checkRules({ game: { ...R, cardsPerPlayer: 6 } });
    expect(six).toHaveLength(1);
    expect(plat(section('### 3.4'))).toContain(`« ${six[0]} »`);
    const reserve = poolOf(home.HOME.catalog, { timed: home.HOME.timed, vsBot: home.HOME.vsBot });
    expect(reserve).toHaveLength(7);
    expect(reserve.filter(id => cards.CARDS[id].family === 'climat')).toHaveLength(4);
    expect(maxValidHand(reserve, config.DEAL.handLimits)).toBe(5);
    expect(checkRules({ game: { ...R, cardsPerPlayer: 6 }, byContext: { accueil: { cardsPerPlayer: 5 } } })).toEqual([]);
    const climats3 = { ...config.DEAL, handLimits: { ...config.DEAL.handLimits, maxPerFamily: { climat: 3 } } };
    expect(checkRules({ game: { ...R, cardsPerPlayer: 6 }, deal: climats3 })).toEqual([]);
  });

  it('6.1 : exemples de messages de checkRules', () => {
    const exemples = [
      checkRules({ game: { ...R, cardEndsTurn: true, cardsPerTurn: 2 } }),
      checkRules({ game: { ...R, presageDelay: 3 } }),
      checkRules({ byContext: { amical: { cardsPerPlayer: 5 } } as never }),
      checkRules({ deal: { ...config.DEAL, draftMs: 500 } }),
    ];
    const texte = plat(section('### 6.1'));
    for (const e of exemples) {
      expect(e).toHaveLength(1);
      expect(texte).toContain(`« ${e[0]} »`);
    }
  });

  it('au défaut, la configuration est jouable', () => {
    expect(checkRules()).toEqual([]);
  });
});

// Garde : le test lit bien des fichiers du dépôt (et pas un dossier vide).
it('le dépôt est parcouru', () => {
  expect(TOUS.length).toBeGreaterThan(200);
  expect(statSync(path.join(ROOT, 'docs/REGLAGES.md')).isFile()).toBe(true);
});
