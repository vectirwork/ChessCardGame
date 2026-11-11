// Socle des réglages : modules sans dépendance à l'exécution, valeurs identiques à celles du site, libellés uniques
// égaux aux copies qu'ils remplacent.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOT_LEVELS, BOT_PROFILES, DEFAULT_BOT_LEVEL, botLevelOr } from '../src/shared/bot';
import { CARDS, CATALOGS, CATALOG_IDS } from '../src/shared/cards';
import { BOT_LOOK } from '../src/shared/catalog';
import { BRAND, pageTitle } from '../src/shared/config/brand';
import { FEATURES, FEATURE_KEYS, featureEnvName, featuresDiff, mergeFeatures } from '../src/shared/config/features';
import { HOME } from '../src/shared/config/home';
import { GUEST_NAME, PASSWORD, USERNAME } from '../src/shared/config/limits';
import { BOT_CARD_PAUSE_MS, BOT_TIMEOUT_MS, CINEMATIC_MS } from '../src/shared/config/timings';
import * as dashboard from '../src/shared/config';
import {
  DEFAULT_QUICK, INVITE_CONTROLS, OFFERED_CONTROLS, PAYMENTS_MODES, PROTOCOL_VERSION, QUICK_CONTROLS, TIME_CONTROLS, tcDef,
  tcFromId, tcLabel,
} from '../src/shared/protocol';
import type { ClockView, TimeControl } from '../src/shared/protocol';
import { cardName, catalogLabel, colorName, modeLabel } from '../src/shared/text/libelles';
import { ACCOUNT, BOT_RUNTIME, LIMITS, MATCHMAKING, RATING, RELAY, TIMINGS, readFeatures } from '../src/server/settings';
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
  it('QUICK_CONTROLS : la liste actuelle', () => {
    expect(QUICK_CONTROLS).toEqual(['3+2', '5+0', '10+0', '15+10']);
  });
  it('INVITE_CONTROLS et libellés courts : ceux de « Défier un ami » (OdysseeHome.tsx:1800)', () => {
    expect(INVITE_CONTROLS).toEqual(['5+0', '10+0', '15+10', 'none']);
    expect(INVITE_CONTROLS.map(id => tcLabel(id, 'short'))).toEqual(['5 min', '10 min', '15 + 10', 'Sans limite']);
  });
  it('identifiants, défaut, cadences proposées', () => {
    expect(TIME_CONTROLS.map(t => t.id)).toEqual(['1+0', '3+2', '5+0', '10+0', '15+10', 'none']);
    expect(new Set(TIME_CONTROLS.map(t => t.id)).size).toBe(TIME_CONTROLS.length);
    expect(OFFERED_CONTROLS).toEqual(TIME_CONTROLS.map(t => t.id));
    expect(QUICK_CONTROLS).toContain(DEFAULT_QUICK);
    expect(tcFromId('3+2')).toEqual({ initial: 180, increment: 2 });
    expect(tcFromId('none')).toBeNull();
    expect(tcFromId('2+1')).toBeUndefined();
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
  it('libellés des 6 cadences', () => {
    expect(TIME_CONTROLS.map(t => tcLabel(t.id))).toEqual(['1 + 0', '3 + 2', '5 + 0', '10 + 0', '15 + 10', 'Sans limite']);
  });
  it('cadence non entière : plus d’arrondi trompeur', () => {
    expect(tcLabel({ initial: 90, increment: 0 })).toBe('1,5 + 0');
    expect(tcLabel({ initial: 90, increment: 2 }, 'long')).toBe('1 min 30 s + 2 s par coup');
    expect(tcLabel({ initial: 30, increment: 0 }, 'long')).toBe('30 s');
  });
});

describe('protocole', () => {
  it('version et modes de paiement', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(PAYMENTS_MODES).toEqual(['stripe', 'demo', 'off']);
  });
});

describe('IA', () => {
  it('niveaux', () => {
    expect(BOT_LEVELS).toEqual([1, 2, 3]);
    expect(DEFAULT_BOT_LEVEL).toBe(2);
    expect(Object.keys(BOT_PROFILES).map(Number)).toEqual([...BOT_LEVELS]);
    expect(Object.keys(BOT_LOOK).map(Number)).toEqual([...BOT_LEVELS]);
    expect(HOME.botLevel).toBe(DEFAULT_BOT_LEVEL);
    expect(RELAY.level).toBe(2);
  });
  it('botLevelOr : le niveau s’il est connu, sinon le défaut', () => {
    expect(botLevelOr(1)).toBe(1);
    expect(botLevelOr(3)).toBe(3);
    expect(botLevelOr(4)).toBe(2);
    expect(botLevelOr('2')).toBe(2);
    expect(botLevelOr(undefined)).toBe(2);
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

describe('valeurs actuelles du site', () => {
  it('marque (index.html, manifeste, Layout, titres)', () => {
    expect(pageTitle()).toBe('Spellmate · Les échecs ont appris la magie');
    expect(pageTitle('Apprendre')).toBe('Apprendre · Spellmate');
    expect(BRAND.nameCaps).toBe('SPELLMATE');
    expect(BRAND.footerTagline).toBe('Les échecs, avec un peu de magie.');
    expect(BRAND.themeColor).toBe('#04050f');
    expect(BRAND.pgnVariant).toBe('Spellmate');
    expect(BRAND.storagePrefix).toBe('sm:');
  });
  it('pseudos et mots de passe (games.ts, auth.ts, Play, overlays, OdysseeHome, Auth)', () => {
    const actuelle = /^[\p{L}\p{N} _.-]{2,20}$/u;
    for (const s of ['', 'a', 'ab', 'Fou du roi', 'x'.repeat(20), 'x'.repeat(21), 'é_è.-1', 'a/b', 'Magnus du 93']) {
      expect(GUEST_NAME.full.test(s), s).toBe(actuelle.test(s));
    }
    expect(GUEST_NAME.chars.source).toBe('^[\\p{L}\\p{N} _.-]+$');
    expect(GUEST_NAME.invalid).toBe('Choisissez un pseudo de 2 à 20 caractères.');
    expect(GUEST_NAME.invalidDetail).toBe('Choisissez un pseudo de 2 à 20 caractères (lettres, chiffres, espaces, . _ -).');
    expect(USERNAME.tooShort).toBe('Le pseudo doit faire au moins 3 caractères.');
    expect(USERNAME.tooLong).toBe('Le pseudo doit faire au plus 20 caractères.');
    expect(USERNAME.badChars).toBe('Lettres, chiffres, tirets et soulignés uniquement.');
    expect(USERNAME.isReserved).toBe('Ce pseudo est réservé.');
    expect(USERNAME.hint).toBe('3 à 20 caractères : lettres, chiffres, - et _');
    const reserve = /^(admin|administrateur|moderateur|support|bot|ia|spellmate|anonyme|invite)$/i;
    for (const s of ['admin', 'Spellmate', 'IA', 'invite', 'invité', 'bobo', 'administrateurs']) expect(USERNAME.reservedPattern.test(s), s).toBe(reserve.test(s));
    expect(PASSWORD.tooShort).toBe('Le mot de passe doit faire au moins 8 caractères.');
    expect(PASSWORD.hint).toBe('8 caractères minimum.');
    expect([PASSWORD.min, PASSWORD.max, USERNAME.min, USERNAME.max, GUEST_NAME.min, GUEST_NAME.max]).toEqual([8, 200, 3, 20, 2, 20]);
  });
  it('durées partagées (games.ts, bot-pool.ts, client/ai)', () => {
    expect([CINEMATIC_MS, BOT_CARD_PAUSE_MS, BOT_TIMEOUT_MS]).toEqual([1200, 2300, 20_000]);
    expect(BOT_TIMEOUT_MS).toBeGreaterThan(Math.max(...Object.values(BOT_PROFILES).map(p => p.thinkMs)));
  });
  it('accueil (useLiveGame.ts, OdysseeHome.tsx, games.ts)', () => {
    expect(HOME).toEqual({
      catalog: 'climats', timed: false, vsBot: true, playerColor: 'w', botLevel: 2, pairWindowMs: 30_000, readyMaxPly: 4,
      guestName: 'Visiteur', saveVersion: 1, saveMaxAgeMs: 30 * 24 * 3600 * 1000, oracleThinkMs: 520, oracleThinkJitterMs: 380,
      oracleAfterCastMs: 380, idleMs: 30_000, activityPingMs: 3000, duelAbortReturnMs: 2500,
    });
  });
  it('serveur (games.ts, auth.ts, account.ts, admin.ts, index.ts, shop.ts, bot-pool.ts)', () => {
    expect(TIMINGS).toMatchObject({
      firstMoveMs: 45_000, claimAfterMs: 60_000, botIdleMs: 30 * 60_000, untimedIdleMs: 3 * 86400_000, inviteTtlMs: 3 * 86400_000,
      endedRoomEvictMs: 10 * 60_000, housekeepingMs: 60_000, rematchTtlMs: null, saveDebounceMs: 250, flagMarginMs: 30, minPlyToStart: 2,
      cinematicMs: 1200,
    });
    expect(RATING).toEqual({ initial: 1200, kProvisional: 40, kEstablished: 20, provisionalGames: 30, scale: 400, floor: 100 });
    expect(MATCHMAKING).toMatchObject({ baseTolerance: 250, tolerancePerSecond: 25, entryTtlMs: 600_000, sweepMs: 30_000, anonymousPrefix: 'Anonyme-' });
    expect(RELAY).toEqual({ firstMoveMs: 10_000, idleMs: 30_000, abandonMs: 30_000, delayMinMs: 900, delayJitterMs: 700, level: 2 });
    expect(BOT_RUNTIME).toEqual({ pauseMinMs: 500, pauseJitterMs: 500, cardPauseMs: 2300, retryMs: 50, maxFailures: 3, maxThreads: 4, timeoutMs: 20_000 });
    expect(LIMITS).toMatchObject({
      maxOpenRooms: 8, socketBurst: 20, socketPerSecond: 8, createPerWindow: 40, createWindowMs: 600_000, authPerWindow: 30,
      checkoutPerMinute: 15, jsonBody: '100kb', webhookBody: '1mb', pingIntervalMs: 10_000, pingTimeoutMs: 8_000, liveList: 40,
      recentGames: 30, leaderboard: 100, profileGames: 20, purchases: 100, adminUsers: 50, adminPurchases: 15, adminDays: 30,
    });
    expect(ACCOUNT).toEqual({ sessionDays: 30, guestCookieDays: 365, verifyTokenMs: 3 * 86400_000, resetTokenMs: 3600_000 });
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
  it('tous ouverts par défaut', () => {
    expect(FEATURE_KEYS).toEqual(['ranked', 'friendlyQueue', 'invites', 'botGames', 'guestPlay', 'live', 'homeDuel', 'homeRelay',
      'puzzles', 'learn', 'analysis', 'shop', 'newGames']);
    expect(FEATURE_KEYS.every(k => FEATURES[k])).toBe(true);
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
    const r = readFeatures({ FEATURE_SHOP: '0', FEATURE_RANKED: 'non', FEATURE_LIVE: '1', FEATURE_LEARN: 'peut-être' });
    expect(r.features.shop).toBe(false);
    expect(r.features.ranked).toBe(false);
    expect(r.features.live).toBe(true);
    expect(r.features.learn).toBe(true);
    expect(r.errors).toEqual(['FEATURE_LEARN=peut-être : valeur inconnue (attendu 0 ou 1).']);
  });
  it('fusion côté client : même objet si rien ne change', () => {
    expect(mergeFeatures(FEATURES, undefined)).toBe(FEATURES);
    expect(mergeFeatures(FEATURES, { ...FEATURES })).toBe(FEATURES);
    expect(mergeFeatures(FEATURES, { shop: 'non', inconnu: false })).toBe(FEATURES);
    const sans = mergeFeatures(FEATURES, { shop: false });
    expect(sans.shop).toBe(false);
    expect(featuresDiff(sans)).toEqual({ shop: false });
  });
});
