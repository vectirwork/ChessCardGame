// Cohérence entre les registres et les réglages répartis dans le dépôt (lot 9 de la passe « polymorphe ») : ce qu'un
// réglage ou une carte ajoutée doit trouver partout, et ce qui est écrit deux fois (JS et CSS).
// - Registres par carte : fiche d'effet, marque d'échiquier, son, dessin (toutes les cartes du moteur), scène
//   explicative et valeur de choix de l'IA (chaque Pouvoir), équilibrage photographié (RULES_V1.tuning) ;
// - cadences (TIME_CONTROLS) et niveaux de l'IA (BOT_LEVELS) : couverts par chaque table qui en dépend ;
// - durées écrites en JS et en CSS (éclair, Retour arrière, chute du roi maté) ;
// - seuil mobile : MOBILE_MAX (layout.ts) contre les requêtes de média des feuilles et du code (819 px, 819,98 px,
//   820 px) ;
// - paquet principal : liste fermée des modules atteints par les imports statiques depuis main.tsx (le moteur n'y entre
//   jamais : designDoc §9) ;
// - dettes du garde-fou des textes chiffrés : toutes vides (dette-0a à dette-9).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOT_LEVELS, BOT_PROFILES, DEFAULT_BOT_LEVEL, DRAFT_NOISE, DRAFT_VALUE } from '../src/shared/bot';
import { CARD_IDS, CARDS, cardsOf } from '../src/shared/cards';
import type { CardId } from '../src/shared/cards';
import { BOT_LOOK } from '../src/shared/catalog';
import { HOME } from '../src/shared/config/home';
import { RULES_V1 } from '../src/shared/config/rules';
import { BOT_TIMEOUT_MS } from '../src/shared/config/timings';
import { DEFAULT_QUICK, INVITE_CONTROLS, OFFERED_CONTROLS, QUICK_CONTROLS, TIME_CONTROLS, tcFromId, tcLabel } from '../src/shared/protocol';
import { RELAY } from '../src/server/settings';

const ROOT = path.resolve(__dirname, '..');
const lire = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const sorted = (a: readonly string[]) => [...a].sort();

/** Fichiers d'un dossier, récursivement, dont le nom passe le filtre (chemins relatifs à la racine). */
function fichiers(dossier: string, filtre: RegExp): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(ROOT, dossier), { withFileTypes: true })) {
    const rel = `${dossier}/${e.name}`;
    if (e.isDirectory()) out.push(...fichiers(rel, filtre));
    else if (filtre.test(e.name)) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Registres par carte

describe('registres par carte : une carte ajoutée doit être partout', () => {
  const POWERS = cardsOf('climats');

  it('toutes les cartes du moteur (Duel compris, pour relire les anciennes parties) : fiche d’effet, marque, son, dessin', async () => {
    const { CARD_FX } = await import('../src/client/vfx/cardFx');
    const { BOARD_MARKS } = await import('../src/client/vfx/boardMarks');
    const { CARD_SOUND } = await import('../src/client/sound');
    const { CARD_ART } = await import('../src/client/components/CardArt');
    const registres: Record<string, Readonly<Record<string, unknown>>> = { CARD_FX, BOARD_MARKS, CARD_SOUND, CARD_ART };
    for (const [nom, reg] of Object.entries(registres)) expect(sorted(Object.keys(reg)), nom).toEqual(sorted(CARD_IDS));
    for (const id of CARD_IDS) {
      expect(typeof CARD_SOUND[id], `CARD_SOUND.${id}`).toBe('function');
      expect(typeof CARD_ART[id], `CARD_ART.${id}`).toBe('function');
    }
  });

  it('chaque Pouvoir : scène explicative, valeur de choix de l’IA, textes ; rien pour une carte inconnue', async () => {
    const { CARD_SCENES } = await import('../src/client/components/cardScenes');
    expect(POWERS.length).toBeGreaterThan(0);
    expect(sorted(Object.keys(CARD_SCENES))).toEqual(sorted(POWERS));
    expect(sorted(Object.keys(DRAFT_VALUE))).toEqual(sorted(POWERS));
    for (const id of POWERS) {
      expect(Number.isFinite(DRAFT_VALUE[id as keyof typeof DRAFT_VALUE]), id).toBe(true);
      const c = CARDS[id];
      for (const champ of ['name', 'description', 'duration'] as const) expect(c[champ], `${id}.${champ}`).toBeTruthy();
    }
  });

  it('équilibrage photographié (RULES_V1.tuning) : seulement des cartes connues', () => {
    for (const id of Object.keys(RULES_V1.tuning)) expect(CARD_IDS as readonly string[], id).toContain(id as CardId);
  });
});

// ---------------------------------------------------------------------------------------------
// Cadences et niveaux de l'IA

describe('cadences (TIME_CONTROLS)', () => {
  it('identifiants uniques, chacun résolu (tcFromId) et libellé ; listes dérivées sans cadence retirée', () => {
    const ids = TIME_CONTROLS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TIME_CONTROLS) {
      expect(tcFromId(t.id), t.id).toEqual(t.tc);
      expect(tcLabel(t.id), t.id).toBeTruthy();
      expect(tcLabel(t.id, 'short'), t.id).toBeTruthy();
    }
    const archivees = new Set(TIME_CONTROLS.filter(t => t.archived).map(t => t.id));
    for (const liste of [QUICK_CONTROLS, INVITE_CONTROLS, OFFERED_CONTROLS]) {
      for (const id of liste) {
        expect(ids, id).toContain(id);
        expect(archivees.has(id), id).toBe(false);
      }
    }
  });
  it('cadence par défaut proposée dans les files et dans « Défier un ami »', () => {
    expect(QUICK_CONTROLS).toContain(DEFAULT_QUICK);
    expect(INVITE_CONTROLS).toContain(DEFAULT_QUICK);
    expect(QUICK_CONTROLS.length).toBeGreaterThan(0);
  });
});

describe('niveaux de l’IA (BOT_LEVELS)', () => {
  it('chaque table par niveau couvre exactement BOT_LEVELS', () => {
    const niveaux = sorted(BOT_LEVELS.map(String));
    expect(sorted(Object.keys(BOT_PROFILES)), 'BOT_PROFILES').toEqual(niveaux);
    expect(sorted(Object.keys(BOT_LOOK)), 'BOT_LOOK').toEqual(niveaux);
    expect(sorted(Object.keys(DRAFT_NOISE)), 'DRAFT_NOISE').toEqual(niveaux);
  });
  it('niveaux par défaut connus : Jouer, accueil (Oracle), relais', () => {
    for (const [nom, l] of [['DEFAULT_BOT_LEVEL', DEFAULT_BOT_LEVEL], ['HOME.botLevel', HOME.botLevel], ['RELAY.level', RELAY.level]] as const) {
      expect(BOT_LEVELS as readonly number[], nom).toContain(l);
    }
  });
  it('délai maximal d’une décision au-dessus du plus long temps de réflexion (BOT_TIMEOUT_MS)', () => {
    expect(BOT_TIMEOUT_MS).toBeGreaterThan(Math.max(...BOT_LEVELS.map(l => BOT_PROFILES[l].thinkMs)));
  });
});

// ---------------------------------------------------------------------------------------------
// Durées écrites en JS et en CSS

describe('durées JS = CSS', () => {
  /** Durées (ms) de l'animation `nom` dans la feuille (`animation: <nom> <durée>s`). */
  const animationMs = (feuille: string, nom: string) =>
    [...lire(feuille).matchAll(new RegExp(`animation:\\s*${nom}\\s+([\\d.]+)s`, 'g'))].map(m => Math.round(Number(m[1]) * 1000));

  it('éclair plein écran, Retour arrière, chute du roi maté', async () => {
    const { FLASH_MS, REWIND_MS } = await import('../src/client/vfx/config');
    const { MATE_FALL_MS } = await import('../src/client/components/mate');
    const BOARD = 'src/client/styles/board.css';
    expect(animationMs(BOARD, 'vfx-flash')).toEqual([FLASH_MS]);
    expect(animationMs(BOARD, 'rewind-glitch')).toEqual([REWIND_MS]);
    const chutes = [...animationMs(BOARD, 'pi-fall-r'), ...animationMs(BOARD, 'pi-fall-l')];
    expect(chutes.length).toBeGreaterThan(0);
    for (const ms of chutes) expect(ms).toBe(MATE_FALL_MS);
  });
});

// ---------------------------------------------------------------------------------------------
// Seuil mobile

describe('seuil mobile : MOBILE_MAX (layout.ts) = requêtes de média des feuilles et du code', () => {
  it('max-width 819 px ou 819,98 px, min-width 820 px (largeur < MOBILE_MAX : mobile)', async () => {
    const { MOBILE_MAX, isMobile } = await import('../src/client/odyssee/shell/layout');
    expect([isMobile(MOBILE_MAX - 1), isMobile(MOBILE_MAX)]).toEqual([true, false]);
    const sources = fichiers('src', /\.(css|tsx?)$/);
    const vus: string[] = [];
    for (const f of sources) {
      for (const m of lire(f).matchAll(/\((max|min)-width:\s*([\d.]+)px\)/g)) {
        const v = Number(m[2]);
        // Seuils voisins de MOBILE_MAX seulement (les autres requêtes ont leur propre rôle : 1180 px, 640 px…).
        if (Math.abs(v - MOBILE_MAX) > 10) continue;
        vus.push(`${f} ${m[1]} ${v}`);
        if (m[1] === 'max') expect([MOBILE_MAX - 1, MOBILE_MAX - 0.02], `${f} : (max-width: ${v}px)`).toContain(v);
        else expect(v, `${f} : (min-width: ${v}px)`).toBe(MOBILE_MAX);
      }
    }
    expect(vus.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------------------------
// Paquet principal

/** Modules atteints par les imports STATIQUES depuis `entree` (les import() dynamiques sont des morceaux à part). */
function grapheStatique(entree: string, vus = new Set<string>()): Set<string> {
  if (vus.has(entree)) return vus;
  vus.add(entree);
  if (entree.endsWith('.css')) return vus;
  const src = readFileSync(entree, 'utf8');
  // `import type` n'entre pas dans le paquet ; les imports nommés mêlés de types, si.
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith('.')) continue;
    const base = path.resolve(path.dirname(entree), spec);
    const f = [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(
      x => existsSync(x) && /\.(tsx?|css)$/.test(x),
    );
    expect(f, `${path.relative(ROOT, entree)} importe ${spec}`).toBeDefined();
    if (f) grapheStatique(f, vus);
  }
  return vus;
}

describe('paquet principal (src/client/main.tsx) : liste fermée', () => {
  /**
   * Modules permis dans le paquet principal. En ajouter un alourdit chaque page : à décider (mesure du paquet, ±0,5 ko
   * compressé). Les réglages et les textes partagés (src/shared/config, src/shared/text) n'importent rien d'autre
   * (socle.test.ts) ; le moteur, les cartes, les règles, l'IA, le protocole n'y entrent jamais (designDoc §9).
   */
  const PERMIS = [
    'src/client/main.tsx',
    'src/client/App.tsx',
    'src/client/api.ts',
    'src/client/socket.ts',
    'src/client/store.tsx',
    'src/client/components/Layout.tsx',
    'src/client/styles/global.css',
    'src/client/styles/board.css',
    'src/client/styles/cards.css',
  ];
  const PARTAGES_PERMIS = /^src\/shared\/(config|text)\/[\w-]+\.ts$/;

  it('aucun module hors de la liste ; jamais le moteur', () => {
    const graphe = [...grapheStatique(path.join(ROOT, 'src/client/main.tsx'))].map(f => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(graphe).toContain('src/client/App.tsx');
    const hors = graphe.filter(f => !PERMIS.includes(f) && !PARTAGES_PERMIS.test(f));
    expect(hors, 'modules entrés dans le paquet principal').toEqual([]);
    for (const f of graphe) expect(f, f).not.toMatch(/^src\/shared\/(game|cards|rules|rulesCore|chess|bot|pgn|protocol|catalog|lessons|puzzles)\.ts$/);
  });
});

// ---------------------------------------------------------------------------------------------
// Dettes du garde-fou des textes chiffrés

describe('dettes du garde-fou des textes chiffrés (test/garde-fous/dette-*.txt) : toutes vides', () => {
  const LOTS = ['0a', '0b', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  it('une dette par lot, de dette-0a à dette-9, et aucune occurrence', () => {
    const presentes = readdirSync(path.join(ROOT, 'test/garde-fous')).filter(f => /^dette-.+\.txt$/.test(f));
    expect(sorted(presentes)).toEqual(sorted(LOTS.map(l => `dette-${l}.txt`)));
    for (const f of presentes) {
      const lignes = lire(`test/garde-fous/${f}`).split('\n').filter(l => l.trim() && !l.startsWith('#'));
      expect(lignes, f).toEqual([]);
    }
  });
});
