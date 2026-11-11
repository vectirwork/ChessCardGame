// Matrice des règles des tests paramétrés (projet Vitest « matrice », test/regles-matrice.test.ts aux lots 1 et 3).
//
// Le nombre de cartes par joueur parcouru se règle par la variable SPELLMATE_MATRICE (liste séparée par des
// virgules) : « 1,3,5 » par défaut (rapide), « 1,2,3,4,5 » pour la matrice complète (lot 9).
//   SPELLMATE_MATRICE=1,2,3,4,5 npm run test:matrice
// Les autres axes sont fixes : cartes par tour {1, 2}, carte à la place du coup {non, oui}, délai du Présage {2, 4},
// choix des cartes ou tirage. Les combinaisons impossibles (refusées par checkRules) sont écartées : plus de cartes
// par tour que de cartes en main, carte à la place du coup avec plus d'une carte par tour.
//
// Ce module ne dépend pas de src/shared/config (posé en parallèle par le lot 0b) : il décrit des réglages bruts que
// les tests passent à setRulesOverride ou à createGame.

/** Défaut de SPELLMATE_MATRICE. */
export const MATRICE_DEFAUT = '1,3,5';

/** Lit une liste de nombres de cartes par joueur (« 1,3,5 ») ; erreur claire si elle est invalide. */
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

/** Toutes les combinaisons jouables pour les nombres de cartes donnés (ordre stable). */
export function combinaisons(cartes: readonly number[] = MATRICE): Combinaison[] {
  const out: Combinaison[] = [];
  for (const cardsPerPlayer of cartes) {
    for (const cardsPerTurn of CARTES_PAR_TOUR) {
      if (cardsPerTurn > cardsPerPlayer) continue;
      for (const cardEndsTurn of CARTE_A_LA_PLACE) {
        if (cardEndsTurn && cardsPerTurn > 1) continue;
        for (const presageDelay of DELAIS_PRESAGE) {
          for (const draft of CHOIX) out.push({ cardsPerPlayer, cardsPerTurn, cardEndsTurn, presageDelay, draft });
        }
      }
    }
  }
  return out;
}

/** Règles du défaut actuel (V1), pour repérer la combinaison qui doit reproduire exactement aujourd'hui. */
export const DEFAUT: Combinaison = { cardsPerPlayer: 3, cardsPerTurn: 1, cardEndsTurn: false, presageDelay: 2, draft: true };

export const estDefaut = (c: Combinaison) =>
  c.cardsPerPlayer === DEFAUT.cardsPerPlayer && c.cardsPerTurn === DEFAUT.cardsPerTurn &&
  c.cardEndsTurn === DEFAUT.cardEndsTurn && c.presageDelay === DEFAUT.presageDelay;
