// Témoins v1 : références du comportement d'AVANT la polymorphie (lot 0a), capturées sur le code de la branche
// d'intégration au commit 7148547, pour prouver l'identité au réglage par défaut lot après lot.
//
// Lancement (Vitest, pour l'horloge factice et les doublures de la base et du pool de l'IA, comme
// test/server-draft.test.ts) :
//   npm run temoins                          compare les témoins recalculés par le code actuel aux fichiers du dépôt
//                                            (aucune écriture ; échoue en listant les fichiers différents)
//   TEMOINS_MODE=ecrire npm run temoins      réécrit les fichiers de test/fixtures/v1 (seulement sur décision)
//   TEMOINS_MODE=ecrire TEMOINS_SORTIE=/tmp/x npm run temoins     écrit ailleurs (comparaison de deux exécutions)
// (npm run temoins = vitest run -c test/fixtures/v1/vitest.config.ts)
//
// Fichiers produits (tous déterministes : deux exécutions donnent les mêmes octets) :
// - cartes.json : name, tagline, description, duration et prompts de chaque carte de CARDS (ordre de CARD_IDS) ;
//   cartes-donnees.json : le reste de chaque CardDef (rareté, famille, coups, turns, cibles, catalogues…) ;
// - layout.json : gameLayout, desktopHandRight et la formule actuelle de GameShell.oppCardWidth pour 14 tailles
//   d'écran, de 320 × 568 à 2560 × 1440, plus les constantes de la coque (FAN, arrivée des cartes, OPP_FAN_SPAN…) ;
// - parties/*.json : 40 parties au hasard à graine fixe (Pouvoirs avec et sans pendule, Duel, Sans cartes ; Rituel
//   et Présages compris). Chaque fichier : mains, état de départ, actions (coup ou carte, avec l'info rendue par le
//   moteur et la positionKey après l'action), état final (journal = etat_final.log, suite des positionKey par tour =
//   etat_final.keys, résultat = etat_final.result). parties/index.json résume les 40 parties et la couverture ;
// - tirages.json : 500 dealHands, 500 completeDraft et 500 chooseBotDraft, chacun avec sa graine (mulberry32) ;
// - salles/*.json : RoomData sérialisées (ce que saveRoom écrit dans la colonne data) via newRoom et les fonctions
//   exportées de games.ts, à horloge factice ; salles/*.vues.json : viewFor des Blancs, des Noirs et d'un spectateur ;
// - accueil-v1.json : une sauvegarde locale de l'accueil (clé sm:odyssee:partie, format v1) ;
// - partie-locale.json : une PlayedGame (history.ts, rememberLocalGame) ;
// - pgn/*.pgn : exports PGN (partie locale, partie en ligne terminée, Rituel, Duel, sans cartes, analyse depuis une
//   FEN, prise qui explose, Sablier fou), et pgn/*.relu.json : ce que readPgn en relit (clés de la ligne principale,
//   en-têtes, réécriture identique ; ou l'erreur de relecture : aujourd'hui, une prise qui explose « fxg4* » et le
//   Sablier fou d'une partie à pendule ne sont pas relus) ;
// - constantes.json et textes-moteur.json : constantes et messages du moteur d'aujourd'hui (refus, résultats).
//
// Les fonctions de src sont appelées à travers des espaces de noms non typés (`any`) : ce fichier appartient au lot 0a
// et ne doit pas casser la vérification de types quand un lot change une signature. Il ne modifie rien dans src.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/server/db', () => ({
  q: vi.fn(async () => []),
  one: vi.fn(async () => null),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) })),
}));
vi.mock('../../../src/server/bot-pool', () => ({
  botPool: { decide: vi.fn(async () => ({ move: null, card: null })) },
}));

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cardsNs from '../../../src/shared/cards';
import * as gameNs from '../../../src/shared/game';
import * as botNs from '../../../src/shared/bot';
import * as pgnNs from '../../../src/shared/pgn';
import * as chessNs from '../../../src/shared/chess';
import * as protocolNs from '../../../src/shared/protocol';
import * as catalogNs from '../../../src/shared/catalog';
import * as layoutNs from '../../../src/client/odyssee/shell/layout';
import * as gamesNs from '../../../src/server/games';
import * as historyNs from '../../../src/client/features/history';
import * as formatNs from '../../../src/client/features/format';
import { mulberry32, pick } from '../../helpers/rng';
import { sq } from '../../helpers/sq';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const C: Any = cardsNs;
const G: Any = gameNs;
const B: Any = botNs;
const PG: Any = pgnNs;
const CH: Any = chessNs;
const P: Any = protocolNs;
const CAT: Any = catalogNs;
const L: Any = layoutNs;
const S: Any = gamesNs;
const H: Any = historyNs;
const F: Any = formatNs;

const ICI = path.dirname(fileURLToPath(import.meta.url));
const MODE = process.env.TEMOINS_MODE === 'ecrire' ? 'ecrire' : 'verifier';
const SORTIE = path.resolve(process.env.TEMOINS_SORTIE ?? ICI);

/** Heure figée des salles (la même que les tests du serveur). */
const T0 = 1_800_000_000_000;
/** Date des en-têtes PGN : midi UTC, même jour dans tous les fuseaux de −11 h à +11 h. */
const DATE_PGN = Date.UTC(2026, 10, 11, 12, 0, 0);
/** Skin passé au moteur pour les cartes jouées hors salle (il n'entre ni dans les clés ni dans les règles). */
const SKIN = 'skin:arcane';

// ---------------------------------------------------------------------------------------------
// Écriture

/** JSON lisible et stable : objets et tableaux courts sur une ligne, les autres déroulés. Champs undefined omis. */
function joli(v: unknown, indent = ''): string {
  const compact = JSON.stringify(v);
  if (compact === undefined) return 'null';
  if (v === null || typeof v !== 'object' || compact.length + indent.length <= 118) return compact;
  const next = indent + '  ';
  if (Array.isArray(v)) {
    const items = v.map(x => JSON.stringify(x) ?? 'null');
    if (items.every(t => t.length <= 40)) {
      // Petits éléments (cases de l'échiquier, nombres) : plusieurs par ligne.
      const rows: string[] = [];
      let cur = '';
      for (const t of items) {
        if (cur && next.length + cur.length + 1 + t.length > 117) {
          rows.push(cur);
          cur = t;
        } else cur = cur ? `${cur},${t}` : t;
      }
      rows.push(cur);
      return `[\n${rows.map(r => next + r).join(',\n')}\n${indent}]`;
    }
    return `[\n${v.map(x => next + joli(x, next)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && typeof x !== 'function');
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${joli(x, next)}`).join(',\n')}\n${indent}}`;
}

/** Copie JSON (ce que voit un client, ce que la base garde). */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const fichiers = new Map<string, string>();
function ecrire(rel: string, contenu: unknown) {
  const texte = typeof contenu === 'string' ? contenu : `${joli(contenu)}\n`;
  if (fichiers.has(rel)) throw new Error(`Témoin écrit deux fois : ${rel}`);
  fichiers.set(rel, texte);
}

// ---------------------------------------------------------------------------------------------
// Cartes, constantes et textes du moteur

function temoinsCartes() {
  const textes: Record<string, unknown> = {};
  const donnees: Record<string, unknown> = {};
  for (const id of C.CARD_IDS as string[]) {
    const d = C.CARDS[id];
    textes[id] = { name: d.name, tagline: d.tagline, description: d.description, duration: d.duration, prompts: d.prompts };
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) if (!['name', 'tagline', 'description', 'duration', 'prompts'].includes(k)) rest[k] = v;
    donnees[id] = rest;
  }
  ecrire('cartes.json', textes);
  ecrire('cartes-donnees.json', donnees);
}

function temoinsConstantes() {
  const pools: Record<string, unknown> = {};
  for (const catalog of ['climats', 'duel', 'aucune']) {
    for (const timed of [true, false]) {
      for (const vsBot of [false, true]) pools[`${catalog}|${timed ? 'pendule' : 'sans-pendule'}|${vsBot ? 'ia' : 'humain'}`] = G.cardPool(catalog, timed, { vsBot });
    }
  }
  ecrire('constantes.json', {
    CARDS_PER_PLAYER: G.CARDS_PER_PLAYER,
    DRAFT_MS: G.DRAFT_MS,
    CINEMATIC_MS: S.CINEMATIC_MS,
    HOME_WINDOW_MS: S.HOME_WINDOW_MS,
    TIME_CONTROLS: P.TIME_CONTROLS,
    QUICK_CONTROLS: P.QUICK_CONTROLS,
    tcFromId: Object.fromEntries(['3+2', '5+0', '10+0', '15+10', 'none', '1+0', 'inconnue'].map(id => [id, P.tcFromId(id) ?? 'undefined'])),
    EMOTES: P.EMOTES,
    BOT_PROFILES: B.BOT_PROFILES,
    BOT_LOOK: CAT.BOT_LOOK,
    ORACLE_LOOK: CAT.ORACLE_LOOK,
    DEFAULT_SKIN: CAT.DEFAULT_SKIN,
    DEFAULT_KING: CAT.DEFAULT_KING,
    DEFAULT_BOARD: CAT.DEFAULT_BOARD,
    RARITY_WEIGHT: C.RARITY_WEIGHT,
    RARITY_LABEL: C.RARITY_LABEL,
    FAMILY_LABEL: C.FAMILY_LABEL,
    CATALOGS: C.CATALOGS,
    CARD_IDS: C.CARD_IDS,
    cardsOf: Object.fromEntries(['climats', 'duel', 'aucune'].map(c => [c, C.cardsOf(c)])),
    cardPool: pools,
    offeredCatalog: Object.fromEntries(['climats', 'duel', 'aucune', 'inconnu', ''].map(c => [c || '(vide)', C.offeredCatalog(c)])),
  });
}

/** Messages du moteur : résultats, refus du choix, des coups et des cartes (ceux rencontrés dans les parties). */
function temoinsTextesMoteur(refusCartes: Map<string, unknown>) {
  const pool = G.cardPool('climats', true);
  const choix: [string, unknown, boolean][] = [
    ['3 cartes valides', ['ice_wall', 'rift', 'tide'], false],
    ['trois Climats', ['truce', 'blood_moon', 'blast'], false],
    ['2 cartes', ['ice_wall', 'rift'], false],
    ['4 cartes', ['ice_wall', 'rift', 'tide', 'truce'], false],
    ['doublon', ['ice_wall', 'ice_wall', 'tide'], false],
    ['carte du Duel', ['ice_wall', 'rift', 'freeze'], false],
    ['__proto__', ['ice_wall', 'rift', '__proto__'], false],
    ['nombre', ['ice_wall', 'rift', 42], false],
    ['pas un tableau', 'tide', false],
    ['provisoire vide', [], true],
    ['provisoire 1', ['tide'], true],
    ['provisoire doublon', ['tide', 'tide'], true],
    ['provisoire 4', ['ice_wall', 'rift', 'tide', 'truce'], true],
  ];
  const s0 = G.createGame({ w: ['tide', 'ice_wall', 'truce'], b: ['blast', 'rift', 'blood_moon'] }, true, 'climats');
  const fini = { ...s0, result: { winner: 'w', reason: 'resign' } };
  const coups = {
    'coup illégal': G.playMove(s0, sq('e2'), sq('e5')),
    'partie terminée': G.playMove(fini, sq('e2'), sq('e4')),
    'promotion invalide': G.playMove(
      G.createGameFromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1', { w: [], b: [] }, true, 'aucune'), sq('a7'), sq('a8'), 'k',
    ),
  };
  const cartes = {
    'pas votre tour': G.cardRefusal(s0, 'b', 0),
    'carte inconnue': G.cardRefusal(s0, 'w', 7),
    'cible manquante': G.cardRefusal(s0, 'w', 1),
    'cible invalide': G.cardRefusal(s0, 'w', 1, [sq('e1')]),
  };
  const apres = G.playCard(s0, 'w', 2, [], SKIN);
  const budget = apres.ok ? G.cardRefusal(apres.state, 'w', 1, [sq('d4')]) : apres.error;
  const used = apres.ok ? G.playMove(apres.state, sq('e2'), sq('e4')) : null;
  const usee = used?.ok ? G.cardRefusal({ ...used.state, pos: { ...used.state.pos, turn: 'w' }, cardPlayed: false }, 'w', 2) : null;
  const describe: Record<string, string> = {};
  for (const id of C.CARD_IDS as string[]) {
    const t = C.CARDS[id].targets;
    describe[id] = G.describeCardPlay(id, [sq('e4'), sq('d5')].slice(0, t));
  }
  describe['carte retirée (crown)'] = G.describeCardPlay('crown', []);
  ecrire('textes-moteur.json', {
    RESULT_TEXT: G.RESULT_TEXT,
    reasonText: Object.fromEntries(Object.keys(G.RESULT_TEXT).map(k => [k, F.reasonText(k)])),
    draftRefusal: choix.map(([nom, cards, partial]) => ({ nom, cards, partial, message: G.draftRefusal(pool, cards, partial) })),
    playMove: Object.fromEntries(Object.entries(coups).map(([k, r]: [string, Any]) => [k, r.ok ? 'ok' : r.error])),
    cardRefusal: { ...cartes, 'deuxième carte du tour': budget, 'carte déjà utilisée': usee },
    refusRencontres: Object.fromEntries([...refusCartes.entries()].sort(([a], [b]) => a.localeCompare(b))),
    describeCardPlay: describe,
  });
}

// ---------------------------------------------------------------------------------------------
// Géométrie de la coque

/** Formule actuelle de GameShell.oppCardWidth (non exportée : recopiée ici, comme test/v2-correction.test.ts). */
function oppCardWidth(l: Any, vw: number): number {
  if (l.mobile) return 34;
  const side = vw - (l.x + l.G / 2) - 34 - 20;
  return Math.floor(Math.max(44, Math.min(76, (side - 8) / L.OPP_FAN_SPAN)));
}

const TAILLES: [number, number][] = [
  [320, 568], [360, 640], [375, 667], [412, 915], [768, 1024], [820, 1180], [1024, 768],
  [1180, 820], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440],
];

function temoinsLayout() {
  ecrire('layout.json', {
    constantes: {
      MOBILE_MAX: L.MOBILE_MAX,
      MOBILE_BOARD_TOP: L.MOBILE_BOARD_TOP,
      MOBILE_BELOW: L.MOBILE_BELOW,
      OPP_FAN_SPAN: L.OPP_FAN_SPAN,
      DESKTOP_OPP_ROOM: L.DESKTOP_OPP_ROOM,
      // GameShell.tsx (non exportés) : poses de l'éventail et décalage d'arrivée des cartes, recopiés à la main.
      FAN: [{ r: -7, y: 14 }, { r: 0, y: 0 }, { r: 7, y: 14 }],
      ARRIVEE: [-28, 0, 28],
    },
    tailles: TAILLES.map(([vw, vh]) => {
      const l = L.gameLayout(vw, vh);
      return { vw, vh, mobile: L.isMobile(vw), gameLayout: l, desktopHandRight: L.desktopHandRight(vw), oppCardWidth: oppCardWidth(l, vw) };
    }),
  });
}

// ---------------------------------------------------------------------------------------------
// Parties au hasard

interface Spec {
  id: string;
  graine: number;
  catalog: 'climats' | 'duel' | 'aucune';
  timed: boolean;
  hands: Record<'w' | 'b', string[]>;
  maxActions: number;
  pCard: number;
  pCapture: number;
}

function specs(): Spec[] {
  const out: Spec[] = [];
  const add = (catalog: Spec['catalog'], timed: boolean, hands: Spec['hands'] | null, maxActions = 260) => {
    const n = out.length + 1;
    const graine = 1000 + n * 7919;
    const h = hands ?? G.dealHands(timed, false, mulberry32(graine ^ 0x5bd1e995), catalog);
    const nom = catalog === 'climats' ? 'pouvoirs' : catalog === 'duel' ? 'duel' : 'sans-cartes';
    out.push({
      id: `${String(n).padStart(2, '0')}-${nom}-${timed ? 'pendule' : 'sans-pendule'}`,
      graine, catalog, timed, hands: h, maxActions, pCard: catalog === 'aucune' ? 0 : 0.3, pCapture: 0.6,
    });
  };
  // Pouvoirs avec pendule : 8 tirages, 4 mains choisies (Rituel, Présages, trois Climats, Sablier fou).
  for (let i = 0; i < 8; i++) add('climats', true, null);
  add('climats', true, { w: ['tide', 'blast', 'ice_wall'], b: ['hourglass', 'rift', 'truce'] });
  add('climats', true, { w: ['blood_moon', 'ice_age', 'truce'], b: ['tide', 'ice_wall', 'rift'] });
  add('climats', true, { w: ['hourglass', 'tide', 'rift'], b: ['blast', 'blood_moon', 'ice_age'] }, 400);
  add('climats', true, { w: ['ice_wall', 'rift', 'tide'], b: ['ice_wall', 'rift', 'tide'] });
  // Pouvoirs sans pendule (comme l'accueil) : 7 tirages, 3 mains choisies.
  for (let i = 0; i < 7; i++) add('climats', false, null);
  add('climats', false, { w: ['tide', 'truce', 'blast'], b: ['tide', 'blood_moon', 'ice_wall'] });
  add('climats', false, { w: ['ice_age', 'rift', 'ice_wall'], b: ['truce', 'blast', 'tide'] }, 400);
  add('climats', false, { w: ['blood_moon', 'blast', 'truce'], b: ['ice_age', 'truce', 'blood_moon'] });
  // Duel (anciennes parties) : avec et sans pendule.
  for (let i = 0; i < 8; i++) add('duel', i % 2 === 0, null);
  add('duel', true, { w: ['rewind', 'time_warp', 'swap'], b: ['revive', 'lightning', 'phase'] });
  add('duel', false, { w: ['freeze', 'shield', 'knight_leap'], b: ['gravity', 'ice_wall', 'rewind'] });
  // Sans cartes.
  for (let i = 0; i < 8; i++) add('aucune', i % 2 === 0, { w: [], b: [] }, i < 2 ? 500 : 260);
  return out;
}

function partie(spec: Spec, refus: Map<string, unknown>) {
  const rand = mulberry32(spec.graine);
  let s = G.createGame(spec.hands, spec.timed, spec.catalog);
  const depart = json(s);
  const actions: unknown[] = [];
  for (let n = 0; n < spec.maxActions && !s.result; n++) {
    const color = s.pos.turn;
    let legal = G.legalMovesOf(s);
    const inHand = s.hands[color].some((h: Any) => !h.used);
    if (inHand && !s.cardPlayed && (legal.length === 0 || rand() < spec.pCard)) {
      // Messages de refus des cartes injouables (témoins des textes du moteur).
      s.hands[color].forEach((h: Any, i: number) => {
        const why = h.used ? null : G.cardRefusal(s, color, i);
        if (why && why !== 'Cible manquante.' && !refus.has(why)) refus.set(why, { partie: spec.id, demiCoup: s.ply, carte: h.card });
      });
      const jouables: number[] = s.hands[color].map((_: unknown, i: number) => i).filter((i: number) => G.cardPlayable(s, color, i));
      if (jouables.length) {
        const index = pick<number>(rand, jouables)!;
        const card = s.hands[color][index].card;
        const targets: number[] = [];
        for (let k = 0; k < C.CARDS[card].targets; k++) {
          const options = G.cardOptions(s, color, index, targets);
          if (!options.length) break;
          targets.push(pick<number>(rand, options)!);
        }
        const r = G.playCard(s, color, index, targets, SKIN);
        if (!r.ok) throw new Error(`${spec.id} : carte jouable refusée (${card}) : ${r.error}`);
        s = r.state;
        actions.push({ k: 'card', c: color, index, card, targets, info: r.info, cle: G.positionKey(s) });
        if (s.result || s.pos.turn !== color) continue;
        legal = G.legalMovesOf(s);
      }
    }
    if (s.result) break;
    if (!legal.length) throw new Error(`${spec.id} : aucun coup légal et aucune fin de partie (demi-coup ${s.ply}).`);
    const captures = legal.filter((m: Any) => m.flags & CH.F_CAPTURE);
    const m: Any = captures.length && rand() < spec.pCapture ? pick<Any>(rand, captures) : pick<Any>(rand, legal);
    const r = G.playMove(s, m.from, m.to, m.promo);
    if (!r.ok) throw new Error(`${spec.id} : coup légal refusé : ${r.error}`);
    s = r.state;
    actions.push({ k: 'move', c: color, from: m.from, to: m.to, promo: m.promo, info: r.info, cle: G.positionKey(s) });
  }
  return { s, depart, actions };
}

function temoinsParties() {
  const refus = new Map<string, unknown>();
  const index: unknown[] = [];
  const couverture = { rituels: 0, presagesAnnonces: 0, presagesArrives: 0, deflagrations: 0, murs: 0, failles: 0, retoursArriere: 0, finies: 0 };
  const raisons: Record<string, number> = {};
  const parties: Record<string, Any> = {};
  for (const spec of specs()) {
    const { s, depart, actions } = partie(spec, refus);
    const cartes = (actions as Any[]).filter(a => a.k === 'card');
    couverture.rituels += cartes.filter(a => a.info.ritual).length;
    couverture.presagesAnnonces += cartes.filter(a => C.CARDS[a.card].presage).length;
    couverture.presagesArrives += (actions as Any[]).filter(a => a.info.arrived?.length).length;
    couverture.deflagrations += (actions as Any[]).filter(a => a.info.blasted?.length).length;
    couverture.murs += cartes.filter(a => a.card === 'ice_wall').length;
    couverture.failles += cartes.filter(a => a.card === 'rift').length;
    couverture.retoursArriere += cartes.filter(a => a.card === 'rewind').length;
    if (s.result) {
      couverture.finies++;
      raisons[s.result.reason] = (raisons[s.result.reason] ?? 0) + 1;
    }
    parties[spec.id] = s;
    index.push({
      id: spec.id, graine: spec.graine, catalog: spec.catalog, timed: spec.timed, mains: spec.hands, actions: actions.length,
      cartesJouees: cartes.map(a => a.card), demiCoups: s.ply, resultat: s.result,
    });
    ecrire(`parties/${spec.id}.json`, {
      id: spec.id,
      graine: spec.graine,
      generateur: { maxActions: spec.maxActions, pCard: spec.pCard, pCapture: spec.pCapture, skin: SKIN },
      catalog: spec.catalog,
      timed: spec.timed,
      mains: spec.hands,
      depart,
      actions,
      resultat: s.result,
      etat_final: json(s),
    });
  }
  ecrire('parties/index.json', { couverture, raisons, parties: index });
  // Couverture minimale demandée par le plan (Rituel et Présages compris).
  if (!couverture.rituels || !couverture.presagesAnnonces || !couverture.presagesArrives || !couverture.murs || !couverture.failles) {
    throw new Error(`Couverture insuffisante des parties témoins : ${JSON.stringify(couverture)}`);
  }
  return { refus, parties };
}

// ---------------------------------------------------------------------------------------------
// Tirages

function temoinsTirages() {
  const catalogs = ['climats', 'climats', 'climats', 'duel', 'aucune'];
  const deal = [];
  for (let i = 0; i < 500; i++) {
    const graine = 50_000 + i;
    const timed = i % 2 === 0;
    const catalog = catalogs[i % catalogs.length];
    const vsBot = i % 3 === 0;
    const mirror = i % 50 === 7;
    deal.push({ graine, timed, mirror, catalog, vsBot, mains: G.dealHands(timed, mirror, mulberry32(graine), catalog, { vsBot }) });
  }
  const complete = [];
  for (let i = 0; i < 500; i++) {
    const graine = 60_000 + i;
    const pool = G.cardPool(i % 7 === 0 ? 'duel' : 'climats', i % 2 === 0, { vsBot: i % 3 === 0 });
    const order = mulberry32(graine ^ 0x9e3779b9);
    const partial = pool.filter(() => order() < 0.35).slice(0, i % 4);
    complete.push({ graine, pool, partial, main: G.completeDraft(pool, partial, mulberry32(graine)) });
  }
  const bot = [];
  const pools = [
    G.cardPool('climats', true), G.cardPool('climats', true, { vsBot: true }), G.cardPool('climats', false),
    G.cardPool('duel', true), ['hourglass', 'truce', 'blood_moon'], ['hourglass', 'truce', 'blood_moon', 'ice_age'],
    ['truce', 'blood_moon', 'ice_age', 'blast'], ['tide', 'rift'],
  ];
  for (let i = 0; i < 500; i++) {
    const graine = 70_000 + i;
    const level = 1 + (i % 3);
    const pool = pools[i % pools.length];
    bot.push({ graine, niveau: level, pool, main: B.chooseBotDraft(pool, level, mulberry32(graine)) });
  }
  ecrire('tirages.json', {
    note: 'rand = mulberry32(graine) de test/helpers/rng.ts ; dealHands(timed, mirror, rand, catalog, { vsBot }), completeDraft(pool, partial, rand), chooseBotDraft(pool, niveau, rand).',
    dealHands: deal,
    completeDraft: complete,
    chooseBotDraft: bot,
  });
}

// ---------------------------------------------------------------------------------------------
// Salles du serveur

/** Exécute `f` avec Math.random remplacé par mulberry32(graine). */
function avecHasard<T>(graine: number, f: () => T): T {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(graine));
  try {
    return f();
  } finally {
    spy.mockRestore();
  }
}

const invite = (guestId: string, name: string): Any => ({
  kind: 'guest', key: `g:${guestId}`, userId: null, name, username: null, rating: null, gamesPlayed: 0,
  skin: CAT.DEFAULT_SKIN, king: CAT.DEFAULT_KING, seal: null,
});
const compte = (id: string, name: string, rating: number, games: number, king = CAT.DEFAULT_KING, skin = CAT.DEFAULT_SKIN): Any => ({
  kind: 'user', key: `u:${id}`, userId: id, name, username: name, rating, gamesPlayed: games, skin, king, seal: null,
});

/** Cibles d'une carte : les cases nommées (vérifiées parmi les options du moteur), sinon les premières proposées. */
function cibles(s: Any, color: 'w' | 'b', index: number, noms: string[]): number[] {
  const card = s.hands[color][index].card;
  const targets: number[] = [];
  for (let k = 0; k < C.CARDS[card].targets; k++) {
    const options = G.cardOptions(s, color, index, targets);
    const voulue = noms[k] === undefined ? options[0] : sq(noms[k]);
    if (voulue === undefined || !options.includes(voulue)) throw new Error(`${card} : cible ${noms[k] ?? '(première)'} impossible.`);
    targets.push(voulue);
  }
  return targets;
}

/** Carte `card` de la main de `color` jouée sur les cases nommées (comme applyCard de games.ts, non exportée). */
function carte(room: Any, color: 'w' | 'b', card: string, ...noms: string[]) {
  const d = room.d;
  const index = d.state.hands[color].findIndex((h: Any) => h.card === card && !h.used);
  if (index < 0) throw new Error(`Carte ${card} absente de la main de ${color}.`);
  const targets = cibles(d.state, color, index, noms);
  const r = G.playCard(d.state, color, index, targets, d.seats[color]?.skin ?? CAT.DEFAULT_SKIN);
  if (!r.ok) throw new Error(`${card} refusée : ${r.error}`);
  S.commitCard(d, color, r.state, r.info);
}

function coup(room: Any, from: string, to: string) {
  const r = S.applyMove(room, room.d.state.pos.turn, sq(from), sq(to));
  if (!r.ok) throw new Error(`Coup ${from}-${to} refusé : ${r.error}`);
}

function choix(room: Any, color: 'w' | 'b', cards: string[], confirm = true) {
  const r = S.applyDraft(room, color, cards, confirm);
  if (!r.ok) throw new Error(`Choix refusé : ${r.error}`);
}

let heure = T0;
const avancer = (ms: number) => {
  heure += ms;
  vi.setSystemTime(heure);
};

function salle(nom: string, id: string, graine: number, construire: () => Any) {
  vi.useFakeTimers();
  heure = T0;
  vi.setSystemTime(heure);
  const room = avecHasard(graine, construire);
  room.d.id = id;
  ecrire(`salles/${nom}.json`, json(room.d));
  ecrire(`salles/${nom}.vues.json`, {
    maintenant: Date.now(),
    w: json(S.viewFor(room, 'w')),
    b: json(S.viewFor(room, 'b')),
    spectateur: json(S.viewFor(room, null)),
    draftView: { w: json(S.draftView(room.d, 'w')), b: json(S.draftView(room.d, 'b')), spectateur: json(S.draftView(room.d, null)) },
  });
  vi.clearAllTimers();
  vi.useRealTimers();
  return room;
}

function temoinsSalles() {
  const aurore = invite('aurore', 'Aurore');
  const basile = invite('basile', 'Basile');
  const salles: Record<string, Any> = {};

  salles.attente = salle('attente-invitation', 'TMNATTENTE', 11, () =>
    S.newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'climats', creator: aurore.key, seats: { w: aurore, b: null } }),
  );

  salles.choix = salle('choix-en-cours', 'TMNCHOIX01', 12, () => {
    const room = S.newRoom({ mode: 'invite', rated: false, tc: '3+2', catalog: 'climats', creator: aurore.key, seats: { w: aurore, b: basile } });
    avancer(9_000);
    choix(room, 'w', ['ice_wall', 'rift', 'tide']);
    avancer(4_000);
    choix(room, 'b', ['blast', 'truce'], false);
    avancer(2_500);
    return room;
  });

  salles.ia = salle('ia-choix', 'TMNIACHOIX', 13, () => {
    const room = S.newRoom({ mode: 'bot', rated: false, tc: '10+0', catalog: 'climats', creator: aurore.key, seats: { w: aurore, b: S.botSeat(2) } });
    avancer(6_000);
    return room;
  });

  salles.pouvoirs = salle('pouvoirs-en-cours', 'TMNPOUVOIR', 14, () => {
    const room = S.newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'climats', creator: aurore.key, seats: { w: aurore, b: basile } });
    avancer(12_000);
    choix(room, 'w', ['ice_wall', 'blast', 'tide']);
    avancer(3_000);
    choix(room, 'b', ['rift', 'truce', 'blood_moon']);
    avancer(2_000);
    coup(room, 'e2', 'e4');
    avancer(3_000);
    coup(room, 'e7', 'e5');
    avancer(4_000);
    carte(room, 'w', 'ice_wall', 'a6'); // Mur de glace (permanent)
    avancer(1_500);
    coup(room, 'g1', 'f3');
    avancer(5_000);
    carte(room, 'b', 'rift', 'a5'); // Faille sur la 5e rangée
    avancer(1_500);
    coup(room, 'b8', 'c6');
    avancer(6_000);
    carte(room, 'w', 'blast'); // Déflagration annoncée (Présage)
    avancer(1_200);
    coup(room, 'f1', 'c4');
    avancer(2_000);
    return room;
  });

  salles.duel = salle('duel-instantanes', 'TMNDUEL001', 15, () => {
    const room = S.newRoom({ mode: 'invite', rated: false, tc: '5+0', catalog: 'duel', creator: aurore.key, seats: { w: aurore, b: basile }, deal: true });
    // Mains fixées (la donne au hasard du Duel est déjà dans tirages.json) : Cryogénie, Retour arrière, Égide.
    room.d.state = G.createGame({ w: ['freeze', 'rewind', 'shield'], b: ['lightning', 'swap', 'gravity'] }, true, 'duel');
    avancer(2_000);
    coup(room, 'e2', 'e4');
    avancer(2_000);
    coup(room, 'e7', 'e5');
    avancer(2_000);
    coup(room, 'g1', 'f3');
    avancer(2_000);
    coup(room, 'b8', 'c6');
    avancer(2_000);
    carte(room, 'w', 'freeze'); // une carte jouée, pas encore de coup : cardPlayed vrai
    avancer(1_000);
    return room;
  });

  salles.terminee = salle('terminee-classee', 'TMNFINIE01', 16, () => {
    const a = compte('00000000-0000-4000-8000-000000000001', 'aurore', 1512, 42, 'king:eclipse', 'skin:void');
    const b = compte('00000000-0000-4000-8000-000000000002', 'basile', 1433, 12);
    const room = S.newRoom({ mode: 'quick', rated: true, tc: '3+2', catalog: 'climats', creator: a.key, seats: { w: a, b } });
    avancer(5_000);
    // Aucune carte des Blancs ne pare le mat (un Mur en g3 le parerait : R4c).
    choix(room, 'w', ['truce', 'blood_moon', 'tide']);
    choix(room, 'b', ['ice_wall', 'blast', 'rift']);
    avancer(2_000);
    coup(room, 'f2', 'f3');
    avancer(3_000);
    coup(room, 'e7', 'e5');
    avancer(3_000);
    coup(room, 'g2', 'g4');
    avancer(3_000);
    coup(room, 'd8', 'h4');
    avancer(1_000);
    return room;
  });

  salles.relais = salle('accueil-relais', 'TMNRELAIS1', 17, () => {
    const v1 = invite('visiteur1', 'Visiteur');
    const v2 = invite('visiteur2', 'Visiteur');
    const room = S.newRoom({ mode: 'quick', rated: false, tc: 'none', catalog: 'climats', creator: v1.key, seats: { w: v1, b: v2 }, deal: true, relay: true });
    avancer(4_000);
    coup(room, 'd2', 'd4');
    avancer(3_000);
    return room;
  });
  return salles;
}

// ---------------------------------------------------------------------------------------------
// Accueil, partie locale, PGN

function temoinsAccueil() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const rand = mulberry32(424242);
  let s = G.createGame(G.dealHands(false, false, rand, 'climats'), false, 'climats');
  for (const [from, to] of [['e2', 'e4'], ['c7', 'c5'], ['g1', 'f3']]) {
    const r = G.playMove(s, sq(from), sq(to));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  // L'Oracle (Noirs) lance sa première carte jouable, puis joue d7-d6.
  const i = s.hands.b.findIndex((_: unknown, k: number) => G.cardPlayable(s, 'b', k));
  if (i >= 0) {
    const card = s.hands.b[i].card;
    const targets: number[] = [];
    for (let k = 0; k < C.CARDS[card].targets; k++) targets.push(G.cardOptions(s, 'b', i, targets)[0]);
    const r = G.playCard(s, 'b', i, targets, CAT.ORACLE_LOOK.skin);
    if (r.ok) s = r.state;
  }
  const r = G.playMove(s, sq('d7'), sq('d6'));
  if (r.ok) s = r.state;
  ecrire('accueil-v1.json', { cle: 'sm:odyssee:partie', valeur: { v: 1, state: json(s), savedAt: Date.now() } });
  vi.useRealTimers();
}

/** Partie locale terminée (mat du berger inversé, avec une carte de chaque camp) ; renvoie l'état final. */
function partieLocaleFinie(): Any {
  const hands = { w: ['truce', 'ice_wall', 'tide'], b: ['blood_moon', 'rift', 'ice_age'] };
  let s = G.createGame(hands, false, 'climats');
  const jouer = (from: string, to: string) => {
    const r = G.playMove(s, sq(from), sq(to));
    if (!r.ok) throw new Error(`${from}-${to} : ${r.error}`);
    s = r.state;
  };
  const lancer = (color: 'w' | 'b', card: string, ...noms: string[]) => {
    const index = s.hands[color].findIndex((h: Any) => h.card === card);
    const r = G.playCard(s, color, index, cibles(s, color, index, noms), SKIN);
    if (!r.ok) throw new Error(`${card} : ${r.error}`);
    s = r.state;
  };
  jouer('e2', 'e4');
  jouer('e7', 'e5');
  lancer('w', 'ice_wall', 'a3');
  jouer('d1', 'h5');
  lancer('b', 'rift', 'a5');
  jouer('b8', 'c6');
  jouer('f1', 'c4');
  jouer('g8', 'f6');
  jouer('h5', 'f7');
  if (s.result?.reason !== 'checkmate') throw new Error(`Partie locale : mat attendu, obtenu ${JSON.stringify(s.result)}`);
  return s;
}

function temoinsPartieLocale(parties: Record<string, Any>, salles: Record<string, Any>) {
  vi.useFakeTimers();
  vi.setSystemTime(DATE_PGN);
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  const avant = (globalThis as Any).localStorage;
  (globalThis as Any).localStorage = ls;
  try {
    const fin = partieLocaleFinie();
    H.rememberLocalGame(fin, { white: 'Vous', black: 'L’Oracle', you: 'w', vsBot: true, kings: { w: 'king:arcane', b: CAT.ORACLE_LOOK.king } });
    const g = H.playedGames()[0];
    ecrire('partie-locale.json', { cle: H.HISTORY_KEY, partie: g });

    // PGN : comme l'Analyse (pages/Analysis.tsx) pour une partie locale…
    const pgns: Record<string, string> = {};
    {
      const start = G.createGame(g.local.hands, !!g.local.timed, g.local.catalog ?? 'duel');
      const { root } = PG.treeFromLog(start, g.local.log);
      const final = PG.mainline(root).at(-1).state;
      const result = g.winner === 'w' ? '1-0' : g.winner === 'b' ? '0-1' : g.winner === 'draw' ? '1/2-1/2' : PG.pgnResult(final);
      pgns['locale'] = PG.writePgn(
        { Event: 'Partie Spellmate (locale)', Site: 'Spellmate', Date: PG.pgnDate(new Date(g.at)), White: g.white, Black: g.black, Result: result },
        root, result,
      );
    }
    // … pour une partie en ligne terminée (vue du serveur)…
    {
      const v = json(S.viewFor(salles.terminee, null));
      const start = PG.initialStateOf(v.state);
      const { root } = PG.treeFromLog(start, v.state.log);
      const h: Record<string, string> = {
        Event: v.rated ? 'Partie classée Spellmate' : 'Partie Spellmate',
        Site: `https://chess-powers.com/partie/${v.id}`,
        Date: PG.pgnDate(new Date(DATE_PGN)),
        White: v.seats.w?.name ?? '?',
        Black: v.seats.b?.name ?? '?',
        Result: PG.pgnResult(v.state),
      };
      if (v.seats.w?.rating) h.WhiteElo = String(v.seats.w.rating);
      if (v.seats.b?.rating) h.BlackElo = String(v.seats.b.rating);
      if (v.clock) h.TimeControl = `${v.clock.initial}+${v.clock.increment}`;
      if (v.state.result) h.Termination = F.reasonText(v.state.result.reason);
      pgns['en-ligne-terminee'] = PG.writePgn(h, root, h.Result);
    }
    // … et pour des parties témoins (Rituel, Duel, sans cartes).
    const choisir = (pred: (s: Any) => boolean) => Object.entries(parties).find(([, s]) => pred(s));
    const explose = (s: Any) => s.log.some((e: Any) => e.k === 'move' && e.san.includes('*'));
    const joue = (s: Any, card: string) => s.log.some((e: Any) => e.k === 'card' && e.card === card);
    const avecRituel = choisir(s => !explose(s) && !joue(s, 'hourglass') && joue(s, 'tide'));
    const deflagration = choisir(s => explose(s));
    const sablier = choisir(s => !explose(s) && joue(s, 'hourglass'));
    const duel = choisir(s => s.catalog === 'duel' && s.log.some((e: Any) => e.k === 'card'));
    const sansCartes = choisir(s => s.catalog === 'aucune' && !!s.result);
    const temoins = [
      ['rituel', avecRituel], ['deflagration', deflagration], ['sablier', sablier], ['duel', duel], ['sans-cartes', sansCartes],
    ] as const;
    for (const [nom, entree] of temoins) {
      if (!entree) throw new Error(`Aucune partie témoin pour le PGN ${nom}.`);
      const [id, s] = entree;
      const { root, complete } = PG.treeFromLog(PG.initialStateOf(s), s.log);
      if (!complete) throw new Error(`Partie ${id} : relecture incomplète.`);
      pgns[nom] = PG.writePgn(
        { Event: `Témoin ${id}`, Site: 'Spellmate', Date: PG.pgnDate(new Date(DATE_PGN)), White: 'Blancs', Black: 'Noirs', Result: PG.pgnResult(s) },
        root, PG.pgnResult(s),
      );
    }
    // Analyse depuis une position (FEN) avec une variante et un commentaire.
    {
      const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
      const root = PG.makeRoot(PG.stateFromFen(fen, 'climats'));
      const a = PG.playFrom(root, sq('f1'), sq('b5'));
      const b = PG.playFrom(a, sq('a7'), sq('a6'));
      PG.playFrom(b, sq('b5'), sq('a4'));
      const v = PG.playFrom(a, sq('g8'), sq('f6'));
      v.comment = 'Défense berlinoise';
      pgns['analyse-fen'] = PG.writePgn({ Event: 'Analyse', Site: 'Spellmate', Date: PG.pgnDate(new Date(DATE_PGN)) }, root, '*');
    }
    for (const [nom, texte] of Object.entries(pgns)) {
      ecrire(`pgn/${nom}.pgn`, texte);
      let g2: Any;
      try {
        g2 = PG.readPgn(texte);
      } catch (e) {
        // Défauts d'aujourd'hui gardés tels quels dans les témoins : une prise qui explose (Déflagration) s'écrit
        // « fxg4* », que readPgn ne relit pas (cleanSan n'enlève pas l'astérisque) ; une partie à pendule où le Sablier
        // fou a été lancé ne se relit pas non plus (stateFromFen crée une partie sans pendule : carte refusée).
        ecrire(`pgn/${nom}.relu.json`, { erreur: (e as Error).message });
        continue;
      }
      const ligne = PG.mainline(g2.root);
      ecrire(`pgn/${nom}.relu.json`, {
        entetes: g2.headers,
        resultat: g2.result,
        catalogue: g2.root.state.catalog ?? null,
        cles: ligne.map((n: Any) => G.positionKey(n.state)),
        journal: ligne.slice(1).map((n: Any) => n.entry),
        reecritureIdentique: PG.writePgn(g2.headers, g2.root, g2.result) === texte,
      });
    }
  } finally {
    (globalThis as Any).localStorage = avant;
    vi.useRealTimers();
  }
}

// ---------------------------------------------------------------------------------------------

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe(`témoins v1 (${MODE === 'ecrire' ? `écriture dans ${SORTIE}` : 'vérification contre le dépôt'})`, () => {
  it('produit tous les témoins, de façon déterministe', () => {
    temoinsCartes();
    temoinsConstantes();
    temoinsLayout();
    const { refus, parties } = temoinsParties();
    temoinsTextesMoteur(refus);
    temoinsTirages();
    const salles = temoinsSalles();
    temoinsAccueil();
    temoinsPartieLocale(parties, salles);

    if (MODE === 'ecrire') {
      for (const [rel, texte] of fichiers) {
        const f = path.join(SORTIE, rel);
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, texte);
      }
      console.log(`${fichiers.size} témoins écrits dans ${SORTIE}`);
      return;
    }
    const ecarts: string[] = [];
    for (const [rel, texte] of fichiers) {
      const f = path.join(SORTIE, rel);
      if (!existsSync(f)) ecarts.push(`${rel} : absent du dépôt`);
      else if (readFileSync(f, 'utf8') !== texte) ecarts.push(`${rel} : différent`);
    }
    for (const dir of ['parties', 'salles', 'pgn']) {
      const d = path.join(SORTIE, dir);
      if (!existsSync(d)) continue;
      for (const n of readdirSync(d)) if (!fichiers.has(`${dir}/${n}`)) ecarts.push(`${dir}/${n} : plus produit`);
    }
    expect(ecarts, 'témoins v1 différents du code actuel').toEqual([]);
  });
});
