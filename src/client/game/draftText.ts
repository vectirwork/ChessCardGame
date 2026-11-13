// Choix des cartes (CardDraft) : phrases et décisions pures, sans React, testées par test/choix-cartes.test.ts.
//
// Les phrases suivent le nombre de cartes à choisir (`n`, DraftView.count) et la taille de la réserve. Au réglage par
// défaut, chacune rend la phrase d'avant au caractère près ; pour 1 carte, les accords
// (« Choisissez votre carte. », « Carte choisie : validez-la… ») remplacent « vos une cartes ».
import { CARDS } from '../../shared/cards';
import type { CardDef, CardId } from '../../shared/cards';
import type { Color } from '../../shared/chess';
import { cap, compte, enLettres, liste } from '../../shared/text/fr';
import { pouvoirs } from '../../shared/text/regles';

/** « deux cartes » ; 1 : « une carte ». */
const cartes = (n: number) => compte(n, 'carte', { lettres: true, genre: 'f' });

/** Titre du choix, découpé autour du mot mis en valeur (<em>) : « Choisissez vos <em>deux</em> cartes. ». */
export function titreChoix(n: number): { avant: string; em: string; apres: string } {
  return n === 1
    ? { avant: 'Choisissez votre ', em: 'carte', apres: '.' }
    : { avant: 'Choisissez vos ', em: enLettres(n, 'f'), apres: ' cartes.' };
}

/** Titre du choix pour un spectateur : « Les joueurs choisissent leurs <em>cartes</em>. ». */
export function titreSpectateur(n: number): { avant: string; em: string; apres: string } {
  return n === 1
    ? { avant: 'Les joueurs choisissent leur ', em: 'carte', apres: '.' }
    : { avant: 'Les joueurs choisissent leurs ', em: 'cartes', apres: '.' };
}

/** Une carte de trop : « Vous avez déjà deux cartes : retirez-en une pour en prendre une autre. ». */
export function dejaComplet(n: number): string {
  return n === 1
    ? 'Vous avez déjà votre carte : retirez-la pour en prendre une autre.'
    : `Vous avez déjà ${cartes(n)} : retirez-en une pour en prendre une autre.`;
}

/** Sélection complète : « Deux cartes choisies : validez-les quand vous êtes prêt. ». */
export function choixComplet(n: number): string {
  return n === 1 ? 'Carte choisie : validez-la quand vous êtes prêt.' : `${cap(cartes(n))} choisies : validez-les quand vous êtes prêt.`;
}

/** Sous le bouton de validation : « Encore deux cartes », « Encore une carte ». */
export function encore(k: number): string {
  return `Encore ${cartes(k)}`;
}

export interface SousTitre {
  spectator: boolean;
  vsBot: boolean;
  /** Cartes à choisir. */
  n: number;
  /** Taille de la réserve. */
  pool: number;
  /** Nom de l'adversaire (contre l'IA). */
  oppLabel: string;
  /** Cartes de la partie absentes de la réserve (excludedNote), commence par une espace ; '' sinon. */
  excluded: string;
}

/** Texte sous le titre : la réserve, combien en prendre, quand les mains sont révélées. */
export function sousTitre(o: SousTitre): string {
  if (o.spectator) return `Chacun prend ${cartes(o.n)} parmi ces ${pouvoirs(o.pool)}. Les mains seront révélées quand les deux auront choisi.`;
  const prenez = `${pouvoirs(o.pool, true)}, les mêmes pour vous deux. Lisez leur règle, prenez-en ${enLettres(o.n, 'f')}`;
  if (o.vsBot) {
    const siennes = o.n === 1 ? 'la sienne' : 'les siennes';
    return `${prenez} : ${o.oppLabel} a choisi ${siennes} en secret, et les deux mains seront révélées dès votre choix.${o.excluded}`;
  }
  return `${prenez} : votre choix reste secret jusqu’à ce que votre adversaire ait choisi aussi, puis les deux mains sont visibles de tous.${o.excluded}`;
}

/** Le choix est validé, l'adversaire choisit encore : « Vos cartes sont choisies. En attente de votre adversaire… ». */
export function attenteAdversaire(n: number): string {
  return n === 1 ? 'Votre carte est choisie. En attente de votre adversaire…' : 'Vos cartes sont choisies. En attente de votre adversaire…';
}

/** Où en est un joueur (spectateur) : « cartes choisies ». */
export function cartesChoisies(n: number): string {
  return n === 1 ? 'carte choisie' : 'cartes choisies';
}

/** « ses cartes » ; 1 : « sa carte ». */
export function sesCartes(n: number): string {
  return n === 1 ? 'sa carte' : 'ses cartes';
}

/** Libellé des emplacements et de votre main : « Vos cartes » ; 1 : « Votre carte ». */
export function vosCartesLabel(n: number): string {
  return n === 1 ? 'Votre carte' : 'Vos cartes';
}

/** Main d'un joueur à la révélation : « Cartes d'Alice » ; 1 : « Carte d'Alice ». `de` : « d'Alice » (deNom). */
export function cartesDe(n: number, de: string): string {
  return `${n === 1 ? 'Carte' : 'Cartes'} ${de}`;
}

/**
 * Temps écoulé avant la validation : ce que le serveur fait de la sélection. Complète, elle est gardée ; sinon, ce
 * qui manque est tiré au hasard.
 */
export function expiration(selected: number, n: number): string {
  const missing = n - selected;
  if (missing <= 0) return n === 1 ? 'Temps écoulé : votre carte est gardée…' : 'Temps écoulé : vos cartes sont gardées…';
  if (missing === n && n === 1) return 'Temps écoulé : votre carte est tirée au hasard…';
  if (missing === 1) return 'Temps écoulé : votre carte manquante est tirée au hasard…';
  return 'Temps écoulé : vos cartes manquantes sont tirées au hasard…';
}

/** Note de la révélation, quand des cartes ont été tirées au hasard pour vous. */
export function noteRevelation(n: number): string {
  return n === 1
    ? 'Le temps était écoulé : votre carte a été tirée au hasard.'
    : 'Le temps était écoulé : vos cartes manquantes ont été tirées au hasard.';
}

/** Fin du choix, telle que le serveur l'annonce (événement `reveal`). */
export interface RevealEvent {
  auto: Color[];
  /** Camps qui ont vraiment reçu des cartes au hasard. Absent : ancien serveur. */
  filled?: Color[];
}

/**
 * Faut-il dire au joueur que des cartes ont été tirées au hasard pour lui ? Le serveur le dit (`filled`) ; à défaut
 * (ancien serveur, événement manqué), `guess` : l'heuristique d'avant (pas de validation, révélation à l'échéance).
 */
export function revealNote(you: Color | null, ev: RevealEvent | null | undefined, guess: () => boolean): boolean {
  if (!you) return false;
  if (ev?.filled) return ev.filled.includes(you);
  return guess();
}

/** Verrou du choix avant l'échéance locale (ms) : plus de changement, la sélection part aussitôt au serveur. */
export const DRAFT_LOCK_MS = 500;

/** Le choix est-il verrouillé (moins de DRAFT_LOCK_MS avant l'échéance) ? */
export function draftClosing(deadline: number, now: number): boolean {
  return now >= deadline - DRAFT_LOCK_MS;
}

/** Colonnes de la réserve, grand écran : la moitié de la réserve, de 2 à 5. 4 colonnes pour 7 ou 8 cartes. */
export function poolColumns(pool: number): number {
  return Math.max(2, Math.min(5, Math.ceil(pool / 2)));
}

/**
 * Colonnes à imposer à la grille (data-cols, --cols), ou null si la feuille de style suffit : elle en met 4, ce
 * qu'il faut pour la réserve des Pouvoirs (8 cartes, 7 contre l'IA).
 */
export function gridColumns(pool: number): number | null {
  const c = poolColumns(pool);
  return c === 4 ? null : c;
}

/** Raccourcis clavier : touches 1 à 9, pour les 9 premières cartes de la réserve. */
export const MAX_SHORTCUTS = 9;

/** Nombre de raccourcis affichés (« 1 à 8 en raccourci ») et de cartes numérotées. */
export function shortcutCount(pool: number): number {
  return Math.min(MAX_SHORTCUTS, pool);
}

/** Carte visée par une touche (index dans la réserve), ou null. */
export function shortcutIndex(key: string, pool: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const i = Number(key) - 1;
  return i < pool ? i : null;
}

/** Ordre de la donne à la révélation (délai d'animation) : main k (0 ou 1), carte i, mains de n cartes. */
export function dealOrder(k: number, n: number, i: number): number {
  return k * n + i;
}

/** « le Sablier fou », « la Trêve », « l’Ère glaciaire ». */
function leNom(def: Pick<CardDef, 'name' | 'genre'>): string {
  if (/^[aeiouyhàâéèêëîïôöùûüœæ]/i.test(def.name)) return `l’${def.name}`;
  return `${def.genre === 'f' ? 'la' : 'le'} ${def.name}`;
}

function absentes(ids: readonly CardId[], where: string): string {
  if (!ids.length) return '';
  const fem = ids.every(id => CARDS[id].genre === 'f');
  const noms = cap(liste(ids.map(id => leNom(CARDS[id]))));
  const accord = `proposé${fem ? 'e' : ''}`;
  return ids.length === 1 ? ` ${noms} n’est pas ${accord} ${where}.` : ` ${noms} ne sont pas ${accord}s ${where}.`;
}

/**
 * Cartes de la partie absentes de la réserve, et pourquoi (pour qu'on ne les cherche pas) : « Le Sablier fou n’est
 * pas proposé contre l’IA. » (humanOnly), « … dans une partie sans pendule. » (timedOnly). Commence par une espace ;
 * '' si rien ne manque. `catalog` : les cartes du catalogue de la partie (cardsOf).
 */
export function excludedNote(catalog: readonly CardId[], pool: readonly CardId[], o: { vsBot: boolean; timed: boolean }): string {
  const missing = catalog.filter(id => CARDS[id] && !CARDS[id].retired && !pool.includes(id));
  const bot = missing.filter(id => o.vsBot && CARDS[id].humanOnly);
  const clock = missing.filter(id => !bot.includes(id) && !o.timed && CARDS[id].timedOnly);
  return absentes(bot, 'contre l’IA') + absentes(clock, 'dans une partie sans pendule');
}
