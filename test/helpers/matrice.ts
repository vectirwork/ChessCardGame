// Matrice des règles des tests paramétrés (projet Vitest « matrice », test/regles-matrice.test.ts aux lots 1 et 3).
//
// Le nombre de cartes par joueur parcouru se règle par la variable SPELLMATE_MATRICE (liste séparée par des
// virgules) : « 1,3,5 » par défaut (rapide), « 1,2,3,4,5 » pour la matrice complète (lot 9).
//   SPELLMATE_MATRICE=1,2,3,4,5 npm run test:matrice
// Les autres axes sont fixes : cartes par tour {1, 2}, carte à la place du coup {non, oui}, délai du Présage {2, 4},
// choix des cartes ou tirage. `combinaisons()` ne garde que les combinaisons jouables ; les autres, que checkRules
// (src/shared/rules.ts, lot 0b) doit refuser avec un message, sont dans `combinaisonsRefusees()`, chacune avec sa raison :
// plus de cartes par tour que de cartes en main ; carte à la place du coup avec plus d'une carte par tour ; plus de
// MAIN_MAX_TIRAGE cartes (R9 : la réserve des Pouvoirs n'a pas de main valide plus grande, et l'accueil tire toujours,
// quel que soit le choix des cartes des autres contextes ; designDoc §2.5).
//
// Ce module ne dépend pas de src/shared/config (posé en parallèle par le lot 0b) : il décrit des réglages bruts que
// les tests passent à setRulesOverride ou à createGame.

/** Défaut de SPELLMATE_MATRICE. */
export const MATRICE_DEFAUT = '1,3,5';

/**
 * Lit une liste de nombres de cartes par joueur (« 1,3,5 ») ; erreur claire si elle est invalide. 6 est accepté pour
 * les tests de refus : toutes ses combinaisons sont dans combinaisonsRefusees().
 */
export function lireMatrice(texte: string | undefined = MATRICE_DEFAUT): number[] {
  const brut = (texte ?? '').trim() || MATRICE_DEFAUT;
  const n = brut.split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (!n.length || n.some(x => !Number.isInteger(x) || x < 1 || x > 6)) {
    throw new Error(`SPELLMATE_MATRICE invalide : « ${texte} » (attendu : des entiers de 1 à 6 séparés par des virgules).`);
  }
  return [...new Set(n)].sort((a, b) => a - b);
}

/** Nombres de cartes par joueur de cette exécution (SPELLMATE_MATRICE, défaut 1,3,5). */
export const MATRICE: number[] = lireMatrice(process.env.SPELLMATE_MATRICE);

export const CARTES_PAR_TOUR = [1, 2] as const;
export const CARTE_A_LA_PLACE = [false, true] as const;
export const DELAIS_PRESAGE = [2, 4] as const;
export const CHOIX = [true, false] as const;

/** Une combinaison de la matrice : réglages de règles bruts, plus la mise en place (choix des cartes ou tirage). */
export interface Combinaison {
  cardsPerPlayer: number;
  cardsPerTurn: number;
  cardEndsTurn: boolean;
  presageDelay: number;
  /** Vrai : choix des cartes ; faux : tirage. */
  draft: boolean;
}

/** Nom lisible d'une combinaison (titres des tests). */
export function nomCombinaison(c: Combinaison): string {
  return [
    `${c.cardsPerPlayer} carte${c.cardsPerPlayer > 1 ? 's' : ''}`,
    `${c.cardsPerTurn} par tour`,
    c.cardEndsTurn ? 'à la place du coup' : 'en plus du coup',
    `Présage ${c.presageDelay}`,
    c.draft ? 'choix' : 'tirage',
  ].join(', ');
}

/**
 * Plus grande main tirable aujourd'hui : maxValidHand(réserve des 8 Pouvoirs, DEAL.handLimits) vaut 5 (R9 : une
 * légendaire, deux climats au plus). Au-delà, checkRules refuse (l'accueil tire toujours ses mains).
 */
export const MAIN_MAX_TIRAGE = 5;

/** Raison pour laquelle checkRules doit refuser cette combinaison, ou null si elle est jouable. */
export function raisonDuRefus(c: Combinaison): string | null {
  if (c.cardsPerTurn > c.cardsPerPlayer) return `${c.cardsPerTurn} cartes par tour pour une main de ${c.cardsPerPlayer}`;
  if (c.cardEndsTurn && c.cardsPerTurn > 1) return 'carte à la place du coup avec plus d’une carte par tour';
  if (c.cardsPerPlayer > MAIN_MAX_TIRAGE) return `R9 : aucune main valide de ${c.cardsPerPlayer} cartes (au plus ${MAIN_MAX_TIRAGE})`;
  return null;
}

/** Toutes les combinaisons des axes, jouables ou non (ordre stable). */
function toutes(cartes: readonly number[]): Combinaison[] {
  const out: Combinaison[] = [];
  for (const cardsPerPlayer of cartes) {
    for (const cardsPerTurn of CARTES_PAR_TOUR) {
      for (const cardEndsTurn of CARTE_A_LA_PLACE) {
        for (const presageDelay of DELAIS_PRESAGE) {
          for (const draft of CHOIX) out.push({ cardsPerPlayer, cardsPerTurn, cardEndsTurn, presageDelay, draft });
        }
      }
    }
  }
  return out;
}

/** Les combinaisons jouables pour les nombres de cartes donnés (ordre stable). */
export function combinaisons(cartes: readonly number[] = MATRICE): Combinaison[] {
  return toutes(cartes).filter(c => raisonDuRefus(c) === null);
}

/** Les combinaisons que checkRules doit refuser, avec leur raison (tests du « refus explicite », designDoc §8.2). */
export function combinaisonsRefusees(cartes: readonly number[] = MATRICE): (Combinaison & { raison: string })[] {
  return toutes(cartes).flatMap(c => {
    const raison = raisonDuRefus(c);
    return raison === null ? [] : [{ ...c, raison }];
  });
}

/** Règles et mise en place du défaut actuel (V1) : la seule combinaison qui doit reproduire exactement aujourd'hui. */
export const DEFAUT: Combinaison = { cardsPerPlayer: 3, cardsPerTurn: 1, cardEndsTurn: false, presageDelay: 2, draft: true };

export const estDefaut = (c: Combinaison) =>
  c.cardsPerPlayer === DEFAUT.cardsPerPlayer && c.cardsPerTurn === DEFAUT.cardsPerTurn &&
  c.cardEndsTurn === DEFAUT.cardEndsTurn && c.presageDelay === DEFAUT.presageDelay && c.draft === DEFAUT.draft;
