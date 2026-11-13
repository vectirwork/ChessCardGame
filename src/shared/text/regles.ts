// Phrases de règles partagées par au moins deux domaines (pages, partie, accueil, moteur, index.html).
//
// Chaque fonction reçoit les règles à décrire : `rulesFor(ctx)` ou `rulesOf(state)` (src/shared/rules.ts) pour une
// partie, GAME_RULES pour un texte général (pied de page, index.html). Au réglage par défaut, chaque phrase est
// la chaîne actuelle du site au caractère près (test/textes-regles.test.ts, qui sert de trace : changer un réglage
// change ce test).
//
// Conventions :
// - les fragments commencent par une minuscule ; `majuscule = true` les met en tête de phrase ;
// - les phrases complètes (consignes, refus) ont leur majuscule et leur point ;
// - apostrophe courbe (’) ; une page qui écrit l'apostrophe droite passe la phrase par apostrophes(s, 'droite') ;
// - aucune espace insécable dans ces phrases (le site n'en écrit qu'une à la main, hors règles : OdysseeHome.tsx,
//   « Essayez-les\u00a0: » ; prix() et nombre() de fr.ts en produisent par Intl) ;
// - rien n'est calculé dans un rendu fréquent : les pages calculent leurs phrases au niveau du module, la partie et
//   l'accueil les mémorisent par objet de règles.
//
// Aucun import à l'exécution hors de src/shared/config et src/shared/text.

import type { Family, Rarity } from '../cards';
import { DEAL } from '../config/rules';
import type { DealSettings, GameRulesSettings, HandLimits } from '../config/rules';
import { cap, compte, duree, enLettres, liste, nombre, ordinal, ordinalLettres, pluriel, possessif } from './fr';
import type { Genre } from './fr';

type Regles<K extends keyof GameRulesSettings> = Pick<GameRulesSettings, K>;

const maj = (s: string, m: boolean) => (m ? cap(s) : s);

// ---------------------------------------------------------------------------------------------
// Les mains

/** « trois cartes de pouvoir » ; 1 : « une carte de pouvoir ». */
export function cartesDePouvoir(r: Regles<'cardsPerPlayer'>, majuscule = false): string {
  const n = r.cardsPerPlayer;
  return maj(`${enLettres(n, 'f')} ${pluriel(n, 'carte')} de pouvoir`, majuscule);
}

/** « trois cartes chacun » (« Trois cartes chacun » en tête de phrase) ; 1 : « une carte chacun ». */
export function cartesChacun(r: Regles<'cardsPerPlayer'>, majuscule = false): string {
  const n = r.cardsPerPlayer;
  return maj(`${enLettres(n, 'f')} ${pluriel(n, 'carte')} chacun`, majuscule);
}

/** « Trois cartes, visibles. » ; 1 : « Une carte, visible. » */
export function cartesVisibles(r: Regles<'cardsPerPlayer'>): string {
  const n = r.cardsPerPlayer;
  return `${cap(enLettres(n, 'f'))} ${pluriel(n, 'carte')}, ${pluriel(n, 'visible')}.`;
}

/** « vos trois cartes » ; 1 : « votre carte ». */
export function vosCartes(r: Regles<'cardsPerPlayer'>, majuscule = false): string {
  return maj(possessif(r.cardsPerPlayer, 'carte', { genre: 'f' }), majuscule);
}

/** « vos trois sorts » (« Vos trois sorts ») ; 1 : « votre sort ». */
export function vosSorts(r: Regles<'cardsPerPlayer'>, majuscule = false): string {
  return maj(possessif(r.cardsPerPlayer, 'sort'), majuscule);
}

/** « trois sorts » (« Trois sorts en main ») ; 1 : « un sort ». */
export function sortsEnMain(r: Regles<'cardsPerPlayer'>, majuscule = false): string {
  const n = r.cardsPerPlayer;
  return maj(`${enLettres(n)} ${pluriel(n, 'sort')}`, majuscule);
}

/**
 * Comment les mains sont constituées : « vous choisissez vos trois cartes ; sur l’accueil, elles sont tirées au
 * hasard » ; sans choix des cartes (DEAL.draft faux) : « vos trois cartes sont tirées au hasard ».
 * `accueil` : règles de l'accueil (rulesFor('accueil')), qui tire toujours les mains. Si elles donnent un autre nombre
 * de cartes (RULES_BY_CONTEXT.accueil), la clause le dit : « … ; sur l’accueil, vos cinq cartes sont tirées au
 * hasard » (sans choix : « vos trois cartes sont tirées au hasard ; sur l’accueil, vos cinq cartes aussi »). Défaut :
 * `r` (même nombre de cartes : la phrase d'avant).
 */
export function constitutionMains(r: Regles<'cardsPerPlayer'>, d: Pick<DealSettings, 'draft'> = DEAL, accueil: Regles<'cardsPerPlayer'> = r): string {
  const n = r.cardsPerPlayer;
  const m = accueil.cardsPerPlayer;
  const tirees = (k: number) => (k === 1 ? 'est tirée' : 'sont tirées');
  if (!d.draft) return `${vosCartes(r)} ${tirees(n)} au hasard${m === n ? '' : ` ; sur l’accueil, ${vosCartes(accueil)} aussi`}`;
  const surAccueil = m === n ? (n === 1 ? 'elle est tirée' : 'elles sont tirées') : `${vosCartes(accueil)} ${tirees(m)}`;
  return `vous choisissez ${vosCartes(r)} ; sur l’accueil, ${surAccueil} au hasard`;
}

/** Durée du choix des cartes : « 45 secondes ». */
export function dureeChoix(d: Pick<DealSettings, 'draftMs'> = DEAL): string {
  return duree(d.draftMs);
}

const FAMILLE: Record<Family, { nom: readonly [string, string]; genre: Genre }> = {
  climat: { nom: ['Climat', 'Climats'], genre: 'm' },
  terrain: { nom: ['Terrain', 'Terrains'], genre: 'm' },
  evenement: { nom: ['Événement', 'Événements'], genre: 'm' },
  duel: { nom: ['carte du Duel', 'cartes du Duel'], genre: 'f' },
};
const RARETE: Record<Rarity, readonly [string, string]> = {
  commune: ['Commune', 'Communes'],
  rare: ['Rare', 'Rares'],
  épique: ['Épique', 'Épiques'],
  légendaire: ['Légendaire', 'Légendaires'],
};

/**
 * Contraintes du tirage qui jouent vraiment dans cette réserve (plus de cartes de cette sorte que la limite) :
 * « au plus deux Climats par main » ; si la réserve avait deux Légendaires : « au plus deux Climats et une
 * Légendaire par main ». null si aucune contrainte ne joue.
 * `pool` : les cartes de la réserve, par exemple cardsOf('climats').map(id => CARDS[id]).
 */
export function limitesMain(pool: readonly { family: Family; rarity: Rarity }[], limits: HandLimits = DEAL.handLimits): string | null {
  const auPlus: string[] = [];
  const aucun: string[] = [];
  const add = (max: number, nom: readonly [string, string], genre: Genre) => {
    if (max <= 0) aucun.push(`${genre === 'f' ? 'aucune' : 'aucun'} ${nom[0]}`);
    else auPlus.push(`${enLettres(max, genre)} ${pluriel(max, nom)}`);
  };
  for (const [f, max] of Object.entries(limits.maxPerFamily) as [Family, number | undefined][]) {
    if (max === undefined || pool.filter(c => c.family === f).length <= max) continue;
    add(max, FAMILLE[f].nom, FAMILLE[f].genre);
  }
  for (const [k, max] of Object.entries(limits.maxPerRarity) as [Rarity, number | undefined][]) {
    if (max === undefined || pool.filter(c => c.rarity === k).length <= max) continue;
    add(max, RARETE[k], 'f');
  }
  if (!auPlus.length && !aucun.length) return null;
  const parts = [...aucun, ...(auPlus.length ? [`au plus ${liste(auPlus)}`] : [])];
  return `${liste(parts)} par main`;
}

// ---------------------------------------------------------------------------------------------
// Le tour

/** Ce que fait une carte du tour : « avant le coup » ; si la carte remplace le coup : « à la place du coup ». */
export function momentCarte(r: Regles<'cardEndsTurn'>): string {
  return r.cardEndsTurn ? 'à la place du coup' : 'avant le coup';
}

/** « un sort par tour » ; 2 : « deux sorts par tour » ; carte à la place du coup : « un sort par tour, à la place du coup ». */
export function sortParTour(r: Regles<'cardsPerTurn' | 'cardEndsTurn'>, majuscule = false): string {
  const k = r.cardsPerTurn;
  const base = k === 1 ? 'un sort par tour' : `${enLettres(k)} sorts par tour`;
  return maj(r.cardEndsTurn ? `${base}, à la place du coup` : base, majuscule);
}

/** Libellé de la main : « Votre main · un sort par tour ». */
export function mainLabel(r: Regles<'cardsPerTurn' | 'cardEndsTurn'>): string {
  return `Votre main · ${sortParTour(r)}`;
}

/** « Un sort par tour au plus, toujours facultatif. » ; 2 : « Deux sorts par tour au plus, toujours facultatifs. » */
export function sortAuPlus(r: Regles<'cardsPerTurn' | 'cardEndsTurn'>): string {
  const k = r.cardsPerTurn;
  if (k === 1) return r.cardEndsTurn ? 'Un sort par tour au plus, à la place du coup, toujours facultatif.' : 'Un sort par tour au plus, toujours facultatif.';
  return `${cap(enLettres(k))} sorts par tour au plus, toujours facultatifs.`;
}

/**
 * Nombre de cartes par tour, en pronom (après « jouer une carte ») : « une par tour » ; `seule` : « une seule par
 * tour » ; 2 : « deux au plus par tour ».
 */
export function parTour(r: Regles<'cardsPerTurn'>, seule = false): string {
  const k = r.cardsPerTurn;
  if (k === 1) return seule ? 'une seule par tour' : 'une par tour';
  return `${enLettres(k, 'f')} au plus par tour`;
}

/** Consigne de la partie : « Une seule carte par tour, toujours avant le coup. » ; 2 : « Deux cartes au plus par tour, avant le coup. » */
export function consigneTour(r: Regles<'cardsPerTurn' | 'cardEndsTurn'>): string {
  const k = r.cardsPerTurn;
  if (k === 1) return r.cardEndsTurn ? 'Une seule carte par tour, à la place du coup.' : 'Une seule carte par tour, toujours avant le coup.';
  return `${cap(enLettres(k, 'f'))} cartes au plus par tour, ${momentCarte(r)}.`;
}

/** Refus quand le budget du tour est épuisé : « Une seule carte par tour. » ; 2 : « Deux cartes par tour au plus. » */
export function refusBudget(r: Regles<'cardsPerTurn'>): string {
  const k = r.cardsPerTurn;
  return k === 1 ? 'Une seule carte par tour.' : `${cap(enLettres(k, 'f'))} cartes par tour au plus.`;
}

/**
 * Pourquoi une carte de la main n'est plus jouable ce tour : « Un seul sort par tour : vous en avez déjà lancé un. » ;
 * 2 : « Deux sorts par tour : vous les avez déjà lancés. »
 */
export function dejaLance(r: Regles<'cardsPerTurn'>): string {
  const k = r.cardsPerTurn;
  return k === 1 ? 'Un seul sort par tour : vous en avez déjà lancé un.' : `${cap(enLettres(k))} sorts par tour : vous les avez déjà lancés.`;
}

/**
 * Tours d'avance d'un Présage : tours du lanceur entre l'annonce et l'arrivée, autant de coups pour l'adversaire
 * (délai en demi-coups, presageDelay) : 2 → 1 ; 4 → 2 ; 6 → 3 ; au moins 1. Le même compte pour tous les textes
 * (prochainTour, moment des cartes, Règles, accueil).
 */
export function toursPresage(delay: number): number {
  return Math.max(1, Math.round(delay / 2));
}

/**
 * Coups de l'adversaire du lanceur avant l'arrivée d'un Présage déjà annoncé, à partir des demi-coups qui restent
 * (Effect.delay) : 1 ou 2 → 1 ; 3 ou 4 → 2 (le coup en cours compris s'il a le trait).
 */
export function coupsAvantArrivee(restants: number): number {
  return Math.ceil(restants / 2);
}

/**
 * « votre prochain tour » (délai du Présage 2) ; 4 : « votre deuxième tour à venir » ; 6 : « votre troisième tour à
 * venir » (« à venir » : compté depuis l'annonce, pas depuis le début de la partie).
 */
export function prochainTour(delay: number): string {
  const k = toursPresage(delay);
  return k === 1 ? 'votre prochain tour' : `votre ${ordinalLettres(k)} tour à venir`;
}

/**
 * Message après un lancement, au-dessus de la main.
 * - `annonce` : la carte est un Présage ; `reste` : cartes encore permises ce tour.
 * - Défaut : « Sort lancé. Jouez maintenant votre coup. » ; Présage : « Annoncé : arrive au début de votre prochain
 *   tour. Jouez maintenant votre coup. » ; avec une autre carte permise : « Sort lancé. Un autre sort, ou jouez
 *   votre coup. » ; si la carte remplace le coup, la première phrase seule.
 */
export function apresLancement(r: Regles<'cardEndsTurn' | 'presageDelay'>, annonce: boolean, reste = 0): string {
  const lance = annonce ? `Annoncé : arrive au début de ${prochainTour(r.presageDelay)}.` : 'Sort lancé.';
  if (r.cardEndsTurn) return lance;
  return `${lance} ${reste > 0 ? 'Un autre sort, ou jouez votre coup.' : 'Jouez maintenant votre coup.'}`;
}

// ---------------------------------------------------------------------------------------------
// Fins de partie

/** « règle des 50 coups » (« Règle des 50 coups ») ; 150 demi-coups : « règle des 75 coups ». */
export function regle50(r: Regles<'fiftyHalfmoves'>, majuscule = false): string {
  const n = r.fiftyHalfmoves / 2;
  return maj(`règle des ${Number.isInteger(n) ? n : nombre(n)} coups`, majuscule);
}

const MULTIPLE = ['', '', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple'];

/** « triple répétition » (« Triple répétition ») ; 2 : « double répétition ». */
export function repetition(r: Regles<'repetitions'>, majuscule = false): string {
  const k = r.repetitions;
  return maj(MULTIPLE[k] ? `${MULTIPLE[k]} répétition` : `répétition (${k} fois)`, majuscule);
}

// ---------------------------------------------------------------------------------------------
// Catalogue, IA

/** « huit pouvoirs » (« Huit pouvoirs ») ; 9 : « neuf pouvoirs ». */
export function pouvoirs(n: number, majuscule = false): string {
  return maj(`${enLettres(n)} ${pluriel(n, 'pouvoir')}`, majuscule);
}

/** « huit cartes » ; 1 : « une carte ». */
export function cartesDuCatalogue(n: number, majuscule = false): string {
  return maj(`${enLettres(n, 'f')} ${pluriel(n, 'carte')}`, majuscule);
}

/** « 3 niveaux » ; 4 : « 4 niveaux ». */
export function niveauxIA(n: number): string {
  return compte(n, ['niveau', 'niveaux']);
}

/** Noms des niveaux de l'IA : « Apprenti, Sorcier ou Archimage » ; avec ',' : « Apprenti, Sorcier, Archimage ». */
export function nomsNiveaux(noms: readonly string[], conj: 'ou' | 'et' | ',' = 'ou'): string {
  return liste(noms, conj);
}

// ---------------------------------------------------------------------------------------------
// Équilibrage des cartes (gabarits des textes de cartes, des bulles et des leçons)

/** « deux fois plus vite » (pendules sous le Sablier fou) ; 3 : « trois fois plus vite » ; 1,5 : « une fois et demie plus vite ». */
export function vitesse(rate: number, majuscule = false): string {
  let s: string;
  if (rate === 1) s = 'à vitesse normale';
  else if (rate === 1.5) s = 'une fois et demie plus vite';
  else if (rate > 1) s = `${Number.isInteger(rate) ? enLettres(rate, 'f') : nombre(rate)} fois plus vite`;
  else if (rate > 0 && Number.isInteger(1 / rate)) s = `${enLettres(1 / rate, 'f')} fois moins vite`;
  else s = `${nombre(rate)} fois plus vite`;
  return maj(s, majuscule);
}

/**
 * Durée d'un effet des Pouvoirs, en coups des deux camps comptés depuis son arrivée (le lanceur joue le premier) :
 * 3 → « 3 coups (vous, lui, vous) » ; 4 → « 4 coups (2 chacun) » ; 6 → « 6 coups (3 chacun) » ;
 * 5 → « 5 coups (3 pour vous, 2 pour lui) » ; 1 → « 1 coup (le vôtre) ».
 */
export function dureeEffet(coups: number): string {
  const n = compte(coups, 'coup');
  if (coups === 1) return `${n} (le vôtre)`;
  if (coups === 3) return `${n} (vous, lui, vous)`;
  if (coups % 2 === 0) return `${n} (${coups / 2} chacun)`;
  return `${n} (${(coups + 1) / 2} pour vous, ${(coups - 1) / 2} pour lui)`;
}

/**
 * Qui joue le premier coup après la fin d'un effet de `coups` coups (le lanceur joue le premier coup de l'effet) :
 * nombre impair → l'adversaire (« L’adversaire reprend les captures le premier ») ; pair → vous.
 */
export function premierApres(coups: number): 'vous' | 'adversaire' {
  return coups % 2 === 1 ? 'adversaire' : 'vous';
}

/** Arrivée d'un Présage : « Annoncé, il arrive au début de votre prochain tour » ; au féminin : « Annoncée, elle arrive… ». */
export function arriveePresage(delay: number, genre: Genre): string {
  return genre === 'f'
    ? `Annoncée, elle arrive au début de ${prochainTour(delay)}`
    : `Annoncé, il arrive au début de ${prochainTour(delay)}`;
}

const contigu = (r: readonly number[]) => r.every((x, i) => i === 0 || x === r[i - 1] + 1);

/**
 * Rangées d'un Terrain (0 à 7, affichées de 1 à 8) : [2, 3, 4, 5] → « entre la 3e et la 6e rangée » (style 'de' :
 * « de la 3e à la 6e rangée ») ; [3, 4] → « la 4e ou la 5e rangée » ; [3] → « la 4e rangée » ;
 * [1, 3, 5] → « la 2e, la 4e ou la 6e rangée ».
 */
export function rangees(ranks: readonly number[], style: 'entre' | 'de' = 'entre'): string {
  const r = [...ranks].sort((a, b) => a - b);
  const o = r.map(x => ordinal(x + 1, 'f'));
  if (o.length >= 3 && contigu(r)) {
    return style === 'de' ? `de la ${o[0]} à la ${o[o.length - 1]} rangée` : `entre la ${o[0]} et la ${o[o.length - 1]} rangée`;
  }
  return `${liste(o.map(x => `la ${x}`), 'ou')} rangée`;
}

/** Rangées relatives d'un camp (Grande Marée) : [1, 2, 3, 4] → « 2e à 5e rangées » ; [1, 2] → « 2e et 3e rangées » ; [1] → « 2e rangée ». */
export function etendueRangees(ranks: readonly number[]): string {
  const r = [...ranks].sort((a, b) => a - b);
  const o = r.map(x => ordinal(x + 1, 'f'));
  if (o.length >= 3 && contigu(r)) return `${o[0]} à ${o[o.length - 1]} rangées`;
  return `${liste(o)} ${pluriel(o.length, 'rangée')}`;
}
