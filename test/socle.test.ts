// Socle des réglages : modules sans dépendance à l'exécution, invariants (identifiants jamais recyclés, réglages
// couplés), libellés uniques égaux aux copies qu'ils remplacent. Les valeurs par défaut elles-mêmes sont gardées par
// test/garde-fous/defauts.test.ts : changer un réglage ne fait pas échouer ce fichier.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOT_LEVELS, BOT_PROFILES, DEFAULT_BOT_LEVEL, botLevelOr } from '../src/shared/bot';
import { CARDS, CATALOGS, CATALOG_IDS, cardsOf } from '../src/shared/cards';
import { BOT_LOOK } from '../src/shared/catalog';
import { BRAND, pageTitle } from '../src/shared/config/brand';
import { FEATURES, FEATURE_KEYS, featureEnvName, featuresDiff, mergeFeatures } from '../src/shared/config/features';
import { HOME } from '../src/shared/config/home';
import { GUEST_NAME, USERNAME } from '../src/shared/config/limits';
import { BOT_CARD_PAUSE_MS, BOT_TIMEOUT_MS, CINEMATIC_MS } from '../src/shared/config/timings';
import * as dashboard from '../src/shared/config';
import {
  DEFAULT_QUICK, INVITE_CONTROLS, OFFERED_CONTROLS, PAYMENTS_MODES, QUICK_CONTROLS, TIME_CONTROLS, tcDef, tcFromId, tcLabel,
} from '../src/shared/protocol';
import type { ClockView, TimeControl } from '../src/shared/protocol';
import { cardName, catalogLabel, colorName, modeLabel } from '../src/shared/text/libelles';
import { BOT_RUNTIME, RELAY, TIMINGS, readFeatures } from '../src/server/settings';
import { KEYS, KEY_STORE, PREF_PREFIX, STORED_EVENT } from '../src/client/storageKeys';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

/** Imports à l'exécution d'un module (les `import type` et `export type` sont effacés à la compilation). */
function runtimeImports(file: string): string[] {
  const src = read(file);
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^;]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gms;
  for (const m of src.matchAll(re)) {
    if (m[5]) out.push(m[5]);
    else if (!m[2]) out.push(m[4]);
  }
  return out;
}

describe('modules de réglages et de textes : aucun import à l’exécution hors de leurs dossiers', () => {
  const dossiers = ['src/shared/config', 'src/shared/text'];
  const permis = dossiers.map(d => path.join(ROOT, d));
  for (const d of dossiers) {
    for (const f of readdirSync(path.join(ROOT, d)).filter(x => x.endsWith('.ts'))) {
      it(`${d}/${f}`, () => {
        for (const spec of runtimeImports(`${d}/${f}`)) {
          const cible = path.resolve(ROOT, d, spec);
          expect(spec.startsWith('.') && permis.some(p => cible.startsWith(p)), `${d}/${f} importe ${spec}`).toBe(true);
        }
      });
    }
  }
  it('le magasin du client (paquet principal) ne tire pas le moteur', () => {
    const interdits = /shared\/(game|cards|rules|chess|bot|pgn|lessons|puzzles)$/;
    for (const spec of runtimeImports('src/client/store.tsx')) expect(interdits.test(spec), spec).toBe(false);
  });
  it('le tableau de bord réexporte chaque réglage', () => {
    for (const k of ['GAME_RULES', 'RULES_BY_CONTEXT', 'RULES_V1', 'DEAL', 'SUSPENDED_CARDS', 'BOUNDS', 'FEATURES', 'BRAND',
      'GUEST_NAME', 'USERNAME', 'PASSWORD', 'CINEMATIC_MS', 'BOT_CARD_PAUSE_MS', 'BOT_TIMEOUT_MS', 'HOME']) {
      expect(dashboard, k).toHaveProperty(k);
    }
  });
});

describe('cadences', () => {
  /** Cadences du site avant la passe : identifiants enregistrés dans les parties, jamais recyclés ni retirés. */
  const HISTORIQUES = ['1+0', '3+2', '5+0', '10+0', '15+10', 'none'];
  it('QUICK_CONTROLS, INVITE_CONTROLS et OFFERED_CONTROLS : dérivés des drapeaux de TIME_CONTROLS', () => {
    const ouvertes = TIME_CONTROLS.filter(t => !t.archived);
    expect(QUICK_CONTROLS).toEqual(ouvertes.filter(t => t.quick).map(t => t.id));
    expect(INVITE_CONTROLS).toEqual(ouvertes.filter(t => t.invite).map(t => t.id));
    expect(OFFERED_CONTROLS).toEqual(ouvertes.map(t => t.id));
  });
  it('libellés courts des cadences historiques : ceux de « Défier un ami » (OdysseeHome.tsx:1800)', () => {
    expect(['5+0', '10+0', '15+10', 'none'].map(id => tcLabel(id, 'short'))).toEqual(['5 min', '10 min', '15 + 10', 'Sans limite']);
  });
  it('identifiants uniques, jamais retirés (archivés), défaut parmi les cadences rapides', () => {
    expect(new Set(TIME_CONTROLS.map(t => t.id)).size).toBe(TIME_CONTROLS.length);
    expect(TIME_CONTROLS.map(t => t.id)).toEqual(expect.arrayContaining(HISTORIQUES));
    expect(QUICK_CONTROLS).toContain(DEFAULT_QUICK);
    expect(INVITE_CONTROLS).toContain(DEFAULT_QUICK);
    expect(tcFromId('3+2')).toEqual({ initial: 180, increment: 2 });
    expect(tcFromId('none')).toBeNull();
    expect(tcFromId('inconnue')).toBeUndefined();
    expect(tcDef({ initial: 600, increment: 0 })?.id).toBe('10+0');
  });

  // Copies actuelles des formateurs de cadence, telles quelles (commit 7148547), pour comparaison.
  const parts = (clock: TimeControl | null) => {
    if (!clock) return 'Sans limite';
    const t = TIME_CONTROLS.find(x => x.tc && x.tc.initial === clock.initial && x.tc.increment === clock.increment);
    if (t) return t.label;
    return `${Math.round(clock.initial / 60)} + ${clock.increment}`;
  };
  const tcLong = (clock: TimeControl | null) => {
    if (!clock) return 'sans limite de temps';
    const m = Math.round(clock.initial / 60);
    return clock.increment ? `${m} min + ${clock.increment} s par coup` : `${m} min`;
  };
  const myGames = (id: string | undefined) => (!id ? '' : TIME_CONTROLS.find(t => t.id === id)?.label ?? id);
  const live = (id: string) => {
    const t = TIME_CONTROLS.find(x => x.id === id);
    return t ? (t.tc ? `${t.family} ${t.label}` : t.label) : id;
  };
  const play = (id: string) => TIME_CONTROLS.find(t => t.id === id)?.label ?? id;
  const history = (clock: TimeControl | null) => (clock ? `${Math.round(clock.initial / 60)}+${clock.increment}` : 'Sans limite');
  const clocks: (TimeControl | null)[] = [...TIME_CONTROLS.map(t => t.tc), { initial: 420, increment: 3 }];
  const ids = [...TIME_CONTROLS.map(t => t.id), '2+1'];

  it('tcLabel = parts.tsx tcLabel (pendule de la partie)', () => {
    for (const c of clocks) expect(tcLabel(c)).toBe(parts(c));
    const vue: ClockView = { initial: 180, increment: 2, w: 0, b: 0, running: null, serverNow: 0, rate: { w: 1, b: 1 } };
    expect(tcLabel(vue)).toBe('3 + 2');
  });
  it('tcLabel long = parts.tsx tcLong', () => {
    for (const c of clocks) expect(tcLabel(c, 'long')).toBe(tcLong(c));
  });
  it('tcLabel = MyGames, Profile, Play (identifiant)', () => {
    for (const id of ids) {
      expect(tcLabel(id)).toBe(myGames(id));
      expect(tcLabel(id)).toBe(play(id));
    }
    expect(tcLabel(undefined)).toBe(myGames(undefined));
    expect(tcLabel('')).toBe(myGames(''));
  });
  it('tcLabel family = Live', () => {
    for (const id of ids) expect(tcLabel(id, 'family')).toBe(live(id));
  });
  it('tcLabel compact = history.ts et Analysis.tsx', () => {
    for (const c of clocks) expect(tcLabel(c, 'compact')).toBe(history(c));
  });
  it('libellés des cadences historiques', () => {
    expect(HISTORIQUES.map(id => tcLabel(id))).toEqual(['1 + 0', '3 + 2', '5 + 0', '10 + 0', '15 + 10', 'Sans limite']);
    expect(TIME_CONTROLS.map(t => tcLabel(t.id))).toEqual(TIME_CONTROLS.map(t => t.label));
  });
  it('cadence non entière : plus d’arrondi trompeur', () => {
    expect(tcLabel({ initial: 90, increment: 0 })).toBe('1,5 + 0');
    expect(tcLabel({ initial: 90, increment: 2 }, 'long')).toBe('1 min 30 s + 2 s par coup');
    expect(tcLabel({ initial: 30, increment: 0 }, 'long')).toBe('30 s');
  });
});

describe('protocole', () => {
  it('modes de paiement (la version est suivie par test/garde-fous/protocole.test.ts)', () => {
    expect(PAYMENTS_MODES).toEqual(['stripe', 'demo', 'off']);
  });
});

describe('IA', () => {
  it('niveaux : jamais retirés, couverts partout, défauts connus', () => {
    expect(BOT_LEVELS).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(Object.keys(BOT_PROFILES).map(Number)).toEqual([...BOT_LEVELS]);
    expect(Object.keys(BOT_LOOK).map(Number)).toEqual([...BOT_LEVELS]);
    for (const l of [DEFAULT_BOT_LEVEL, HOME.botLevel, RELAY.level]) expect(BOT_LEVELS).toContain(l);
  });
  it('botLevelOr : le niveau s’il est connu, sinon le défaut', () => {
    expect(botLevelOr(1)).toBe(1);
    expect(botLevelOr(3)).toBe(3);
    expect(botLevelOr(99)).toBe(DEFAULT_BOT_LEVEL);
    expect(botLevelOr('2')).toBe(DEFAULT_BOT_LEVEL);
    expect(botLevelOr(undefined)).toBe(DEFAULT_BOT_LEVEL);
    expect(botLevelOr(null, 1)).toBe(1);
  });
});

describe('libellés uniques = copies actuelles', () => {
  it('colorName (parts.tsx)', () => {
    expect(colorName('w')).toBe('Blancs');
    expect(colorName('b')).toBe('Noirs');
    expect(colorName('w', 'des')).toBe('des Blancs');
  });
  it('catalogLabel : parts.tsx (repli « Duel ») et format.ts (repli « Duel (ancienne formule) »)', () => {
    const parts = (c: string) => CATALOGS.find(x => x.id === c)?.label ?? 'Duel';
    const format = (c: string | undefined | null) => CATALOGS.find(x => x.id === c)?.label ?? 'Duel (ancienne formule)';
    for (const c of [...CATALOG_IDS, 'inconnu']) {
      expect(catalogLabel(c, CATALOGS)).toBe(parts(c));
      expect(catalogLabel(c, CATALOGS, true)).toBe(format(c));
    }
    expect(catalogLabel(undefined, CATALOGS, true)).toBe(format(undefined));
  });
  it('modeLabel : badge (parts.tsx) et liste (MyGames.tsx)', () => {
    const parts = (mode: string, rated: boolean) => (mode === 'bot' ? "Contre l'IA" : mode === 'invite' ? 'Entre amis' : rated ? 'Partie classée' : 'Partie amicale');
    const MODE: Record<string, string> = { bot: 'Contre l’IA', quick: 'Partie rapide', invite: 'Invitation' };
    const liste = (mode: string, rated: boolean) => (rated ? 'Classée' : MODE[mode] ?? '');
    for (const mode of ['bot', 'invite', 'quick'] as const) {
      for (const rated of [false, true]) {
        expect(modeLabel(mode, rated)).toBe(parts(mode, rated));
        expect(modeLabel(mode, rated, 'liste')).toBe(liste(mode, rated));
      }
    }
  });
  it('cardName (format.ts)', () => {
    expect(cardName('truce', CARDS)).toBe('Trêve');
    expect(cardName('coronation', CARDS)).toBe('coronation');
    expect(cardName('toString', CARDS)).toBe('toString');
  });
});

describe('réglages couplés et identifiants techniques', () => {
  it('marque : titres dérivés de BRAND ; identifiants techniques inchangés', () => {
    expect(pageTitle()).toBe(`${BRAND.name}${BRAND.titleSeparator}${BRAND.tagline}`);
    expect(pageTitle('Apprendre')).toBe(`Apprendre${BRAND.titleSeparator}${BRAND.name}`);
    // Formats d'échange et de stockage : ne jamais les changer avec la marque.
    expect(BRAND.pgnVariant).toBe('Spellmate');
    expect(BRAND.storagePrefix).toBe('sm:');
  });
  it('pseudos : longueur et caractères selon les bornes, mots réservés quelle que soit la casse', () => {
    const { min, max } = GUEST_NAME;
    for (const [s, ok] of [['x'.repeat(min), true], ['x'.repeat(min - 1), false], ['x'.repeat(max), true], ['x'.repeat(max + 1), false],
      ['é_è.-1', true], ['Magnus du 93', true], ['a/b', false]] as const) {
      expect(GUEST_NAME.full.test(s), s).toBe(ok);
    }
    for (const s of USERNAME.reserved) {
      expect(USERNAME.reservedPattern.test(s), s).toBe(true);
      expect(USERNAME.reservedPattern.test(s.toUpperCase()), s).toBe(true);
      expect(USERNAME.reservedPattern.test(`${s}s`), s).toBe(false);
    }
  });
  it('durées couplées entre client et serveur', () => {
    expect(BOT_TIMEOUT_MS).toBeGreaterThan(Math.max(...Object.values(BOT_PROFILES).map(p => p.thinkMs)));
    expect(TIMINGS.cinematicMs).toBe(CINEMATIC_MS);
    expect(BOT_RUNTIME.cardPauseMs).toBe(BOT_CARD_PAUSE_MS);
    expect(BOT_RUNTIME.timeoutMs).toBe(BOT_TIMEOUT_MS);
  });
  it('accueil : un catalogue avec des cartes', () => {
    expect(cardsOf(HOME.catalog).length).toBeGreaterThan(0);
  });
  it('clés du stockage du navigateur (inchangées)', () => {
    expect(KEYS).toEqual({
      sound: 'sm:sound', guestName: 'sm:guestName', history: 'sm:parties', cardsSeen: 'sm:cartes:lues', puzzles: 'sm:problemes',
      learn: 'sm:apprendre', analysisEngine: 'sm:analyse:moteur', homeGame: 'sm:odyssee:partie', homeLevel: 'sm:odyssee:niveau',
      classicKings: 'sm:rois-classiques', reload: 'spellmate:reload', intro: 'sm:intro', trial: 'sm:essai', delivery: 'sm:livraison',
    });
    expect(Object.keys(KEY_STORE).sort()).toEqual(Object.keys(KEYS).sort());
    expect(KEYS.classicKings).toBe(`${PREF_PREFIX}rois-classiques`);
    expect(STORED_EVENT).toBe('sm:stored');
  });
});

describe('interrupteurs', () => {
  it('noms des interrupteurs ; aucun écart au défaut', () => {
    expect(FEATURE_KEYS).toEqual(['ranked', 'friendlyQueue', 'invites', 'botGames', 'guestPlay', 'live', 'homeDuel', 'homeRelay',
      'puzzles', 'learn', 'analysis', 'shop', 'newGames']);
    expect(FEATURE_KEYS.every(k => typeof FEATURES[k] === 'boolean')).toBe(true);
    expect(featuresDiff(FEATURES)).toEqual({});
  });
  it('noms des variables d’environnement', () => {
    expect(featureEnvName('shop')).toBe('FEATURE_SHOP');
    expect(featureEnvName('homeDuel')).toBe('FEATURE_HOME_DUEL');
    expect(featureEnvName('newGames')).toBe('FEATURE_NEW_GAMES');
    expect(featureEnvName('friendlyQueue')).toBe('FEATURE_FRIENDLY_QUEUE');
  });
  it('lecture de l’environnement du serveur', () => {
    expect(readFeatures({}).features).toEqual(FEATURES);
    expect(readFeatures({}).errors).toEqual([]);
    const r = readFeatures({ FEATURE_SHOP: '0', FEATURE_RANKED: 'non', FEATURE_LIVE: '1', FEATURE_LEARN: 'peut-être', PATH: '/bin' });
    expect(r.features.shop).toBe(false);
    expect(r.features.ranked).toBe(false);
    expect(r.features.live).toBe(true);
    expect(r.features.learn).toBe(FEATURES.learn);
    expect(r.errors).toEqual(['FEATURE_LEARN=peut-être : valeur inconnue (attendu 0 ou 1).']);
  });
  it('variable FEATURE_* inconnue (faute de frappe) : signalée, rien ne change', () => {
    const r = readFeatures({ FEATURE_SHOPP: '0' });
    expect(r.features).toEqual(FEATURES);
    expect(r.errors).toEqual([`FEATURE_SHOPP : interrupteur inconnu (interrupteurs : ${FEATURE_KEYS.map(featureEnvName).join(', ')}).`]);
  });
  it('fusion côté client : même objet si rien ne change', () => {
    expect(mergeFeatures(FEATURES, undefined)).toBe(FEATURES);
    expect(mergeFeatures(FEATURES, { ...FEATURES })).toBe(FEATURES);
    expect(mergeFeatures(FEATURES, { shop: 'non', inconnu: false })).toBe(FEATURES);
    const sans = mergeFeatures(FEATURES, { shop: !FEATURES.shop });
    expect(sans.shop).toBe(!FEATURES.shop);
    expect(featuresDiff(sans)).toEqual({ shop: !FEATURES.shop });
  });
});
