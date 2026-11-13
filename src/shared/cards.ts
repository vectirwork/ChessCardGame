// Catalogue des cartes de pouvoir. Les règles d'application sont dans game.ts.
// Deux catalogues de cartes (décision du fondateur du 30 octobre, docs/PLAN-ODYSSEE.md) :
// - 'climats' (« Pouvoirs ») : 8 pouvoirs qui touchent toujours les deux camps, mains visibles des deux côtés ;
// - 'duel' : les 11 cartes historiques, qui visent l'adversaire. Il n'est plus proposé : le moteur le garde
//   seulement pour relire ou reprendre les parties créées avant.
// Le Mur de glace appartient aux deux (permanent dans les Pouvoirs, 3 coups adverses dans le Duel).
//
// Ce qui distingue les catalogues (« la magie cède », effets des deux camps, tirage pondéré…) est décrit par des
// données, CATALOG_RULES : le moteur ne compare jamais un identifiant de catalogue.
// Les textes des Pouvoirs (description, durée, consignes) sont produits par des gabarits qui lisent l'équilibrage de
// la carte (coups, rangées, vitesse) et le délai du Présage (cardText) : changer `coups` change aussi le texte.

import { DEAL, GAME_RULES } from './config/rules';
import type { CardTuning, Rules } from './config/rules';
import { compte } from './text/fr';
import { arriveePresage, dureeEffet, etendueRangees, pouvoirs, premierApres, rangees, vitesse } from './text/regles';

export type CardId =
  // Pouvoirs : Climats
  | 'hourglass'
  | 'truce'
  | 'blood_moon'
  | 'ice_age'
  | 'blast'
  // Pouvoirs : Terrains (le Mur de glace sert aussi au catalogue Duel)
  | 'ice_wall'
  | 'rift'
  // Pouvoirs : Événement
  | 'tide'
  // Duel (cartes historiques)
  | 'time_warp'
  | 'gravity'
  | 'freeze'
  | 'shield'
  | 'swap'
  | 'rewind'
  | 'revive'
  | 'knight_leap'
  | 'lightning'
  | 'phase';

/** Cartes du seul catalogue Duel (historique, plus proposé). */
export type DuelCardId = 'time_warp' | 'gravity' | 'freeze' | 'shield' | 'swap' | 'rewind' | 'revive' | 'knight_leap' | 'lightning' | 'phase';
/** Cartes du catalogue Pouvoirs (le Mur de glace sert aussi au Duel). */
export type PowerCardId = Exclude<CardId, DuelCardId>;

export type Rarity = 'commune' | 'rare' | 'épique' | 'légendaire';

/**
 * Catalogue utilisé par une partie :
 * - 'climats' (« Pouvoirs », par défaut) : 8 pouvoirs qui touchent les deux camps ;
 * - 'duel' : les 11 cartes historiques ; plus proposé, gardé pour les parties créées avant ;
 * - 'aucune' : échecs classiques, sans cartes.
 */
export type Catalog = (typeof CATALOG_IDS)[number];
/** Tous les catalogues connus du moteur (proposés ou non). Ne jamais retirer un identifiant : des parties le portent. */
export const CATALOG_IDS = ['climats', 'duel', 'aucune'] as const;
/** Catalogue qui contient des cartes. */
export type CardCatalog = Exclude<Catalog, 'aucune'>;

/** Ce qui distingue un catalogue dans les règles : le moteur lit ces données, jamais l'identifiant du catalogue. */
export interface CatalogRules {
  /** Proposé pour une nouvelle partie (interface, création, file d'attente). */
  offered: boolean;
  /** « La magie cède » (R6) : un joueur privé de tout coup par les effets, hors échec, joue comme s'ils n'existaient pas. */
  magicYields: boolean;
  /** Effets des deux camps : décomptés sur les coups des deux camps (`coups`) ou permanents ; sinon, sur un camp (`turns`). */
  globalEffects: boolean;
  /** Tirage des mains : uniforme, ou pondéré par la rareté avec les contraintes du tirage (DEAL). */
  draw: 'uniforme' | 'pondéré';
  /** Le Mur de glace se pose sur n'importe quelle case vide (sinon, sur ses rangées : `ranks`). */
  wallAnyRank: boolean;
  /** Instantanés des deux dernières positions (Retour arrière). */
  snapshots: boolean;
  /** Matériel insuffisant : les Terrains posés ou en main peuvent aider à mater (sinon : aides du Duel). */
  terrainMate: boolean;
  /** Temps crédité à la pendule pour la cinématique d'une carte (R10, serveur). */
  cinematicCredit: boolean;
}

/** Règles propres à chaque catalogue. Un nouveau catalogue : une entrée ici, une dans CATALOG_IDS, et `catalogs` sur ses cartes. */
export const CATALOG_RULES: Readonly<Record<Catalog, Readonly<CatalogRules>>> = {
  climats: {
    offered: true, magicYields: true, globalEffects: true, draw: 'pondéré', wallAnyRank: false, snapshots: false,
    terrainMate: true, cinematicCredit: true,
  },
  duel: {
    offered: false, magicYields: false, globalEffects: false, draw: 'uniforme', wallAnyRank: true, snapshots: true,
    terrainMate: false, cinematicCredit: false,
  },
  aucune: {
    offered: true, magicYields: false, globalEffects: false, draw: 'uniforme', wallAnyRank: false, snapshots: false,
    terrainMate: true, cinematicCredit: false,
  },
};

/** Catalogue d'une nouvelle partie quand rien n'est précisé ou que la demande est inconnue (Pouvoirs). */
export const DEFAULT_CATALOG: Catalog = 'climats';
/** Catalogue des parties enregistrées sans champ `catalog` (créées avant les catalogues) : le Duel. Rien d'autre. */
export const LEGACY_CATALOG: Catalog = 'duel';

/** `x` est-il un identifiant de catalogue connu (proposé ou non) ? */
export function isCatalog(x: unknown): x is Catalog {
  return (CATALOG_IDS as readonly unknown[]).includes(x);
}

/**
 * Catalogue d'une nouvelle partie demandé par un client : un catalogue proposé est gardé tel quel ; le Duel (ancien
 * client, préférence enregistrée), comme toute valeur inconnue, est ramené au catalogue par défaut.
 */
export function offeredCatalog(c: unknown): Catalog {
  return isCatalog(c) && CATALOG_RULES[c].offered ? c : DEFAULT_CATALOG;
}

/** Famille d'une carte : Climat (règle globale), Terrain (cases), Événement (instantané), Duel (catalogue historique). */
export type Family = 'climat' | 'terrain' | 'evenement' | 'duel';

export const FAMILY_LABEL: Record<Family, string> = {
  climat: 'Climat',
  terrain: 'Terrain',
  evenement: 'Événement',
  duel: 'Duel',
};

export interface CardDef {
  id: CardId;
  name: string;
  /** Phrase d'accroche, affichée sous le nom. */
  tagline: string;
  /** Règle exacte. */
  description: string;
  /** Nombre de cases à désigner (0, 1 ou 2). */
  targets: 0 | 1 | 2;
  /** Consigne affichée pendant la sélection de chaque cible. */
  prompts: string[];
  /** Durée lisible. */
  duration: string;
  rarity: Rarity;
  /** Teinte principale (degrés HSL) pour l'interface. */
  hue: number;
  /** Carte jouable seulement dans une partie avec pendule. */
  timedOnly?: boolean;
  /** Carte exclue du tirage des parties contre l'IA (Sablier fou). */
  humanOnly?: boolean;
  /** Duel : durée de l'effet, en coups du camp concerné (absent pour un effet instantané). */
  turns?: number;
  /** Duel : l'effet se décompte sur les coups de l'adversaire (sinon sur ceux du lanceur). */
  countsOnOpponent?: boolean;
  /**
   * Pouvoirs : durée de l'effet en coups des deux camps (demi-coups), comptés à partir de son arrivée
   * (Présage) ou du coup du lanceur (effet immédiat). Absent pour un Événement et un effet permanent.
   */
  coups?: number;
  /** Pouvoirs : l'effet dure jusqu'à la fin de la partie (Mur de glace). */
  permanent?: boolean;
  /**
   * Pouvoirs : rangées concernées, de 0 à 7 (Mur de glace, Faille ; relatives au camp du pion pour la Grande Marée).
   * Copiées dans les règles de la partie à sa création (Rules.tuning) : le moteur lit celles de la partie (tuneOf).
   */
  ranks?: readonly number[];
  /** Pouvoirs : vitesse d'écoulement des pendules sous l'effet (Sablier fou : 2). Copiée dans Rules.tuning. */
  clockRate?: number;
  /** Genre grammatical du nom de la carte, pour les accords des textes (« Annoncée, elle arrive… »). */
  genre: 'm' | 'f';
  /**
   * Carte retirée du jeu pour de bon : plus dans aucune réserve, mais toujours relue dans les parties enregistrées.
   * Ne jamais supprimer ni recycler l'identifiant d'une carte. Absent : en jeu.
   */
  retired?: boolean;
  /** Catalogues auxquels la carte appartient (le Mur de glace est dans les deux) : `inCatalog`, `cardsOf`. */
  catalogs: CardCatalog[];
  family: Family;
  /** Présage : l'effet est annoncé et n'arrive qu'au début du tour suivant du lanceur. */
  presage?: boolean;
  /** Rituel : la carte remplace le coup du lanceur. */
  ritual?: boolean;
}

/** Textes d'une carte produits par un gabarit. */
type CardTexts = Pick<CardDef, 'description' | 'duration' | 'prompts'>;
/** Définition d'une carte : les Pouvoirs n'écrivent pas leurs textes, produits par TEMPLATES (cardText). */
type CardData = Omit<CardDef, keyof CardTexts> & Partial<CardTexts>;

const DEFS: Record<CardId, CardData> = {
  // -------------------------------------------------------------------------------------------
  // Climats : une règle pour tout le plateau, annoncée un tour à l'avance (Présage). Un seul Climat à la fois.
  hourglass: {
    id: 'hourglass',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Sablier fou',
    genre: 'm',
    tagline: 'Le temps s’emballe pour tout le monde.',
    targets: 0,
    rarity: 'rare',
    hue: 192,
    timedOnly: true,
    humanOnly: true,
    presage: true,
    coups: 6,
    clockRate: 2,
  },
  truce: {
    id: 'truce',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Trêve',
    genre: 'f',
    tagline: 'Les armes se taisent.',
    targets: 0,
    rarity: 'commune',
    hue: 85,
    presage: true,
    coups: 3,
  },
  blood_moon: {
    id: 'blood_moon',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Lune de sang',
    genre: 'f',
    tagline: 'Qui peut prendre, doit prendre.',
    targets: 0,
    rarity: 'épique',
    hue: 0,
    presage: true,
    coups: 3,
  },
  ice_age: {
    id: 'ice_age',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Ère glaciaire',
    genre: 'f',
    tagline: 'Le front se fige.',
    targets: 0,
    rarity: 'rare',
    hue: 222,
    presage: true,
    coups: 4,
  },
  blast: {
    id: 'blast',
    catalogs: ['climats'],
    family: 'climat',
    name: 'Déflagration',
    genre: 'f',
    tagline: 'Chaque prise est un sacrifice.',
    targets: 0,
    rarity: 'épique',
    hue: 25,
    presage: true,
    coups: 4,
  },

  // -------------------------------------------------------------------------------------------
  // Terrains : des cases transformées pour les deux camps.
  ice_wall: {
    id: 'ice_wall',
    catalogs: ['climats', 'duel'],
    family: 'terrain',
    name: 'Mur de glace',
    genre: 'm',
    tagline: 'Ici, plus personne ne passe.',
    targets: 1,
    rarity: 'commune',
    hue: 200,
    // Pouvoirs : permanent. Duel (anciennes parties) : 3 coups adverses, sur n'importe quelle case vide.
    permanent: true,
    turns: 3,
    countsOnOpponent: true,
    ranks: [2, 3, 4, 5],
  },
  rift: {
    id: 'rift',
    catalogs: ['climats'],
    family: 'terrain',
    name: 'Faille',
    genre: 'f',
    tagline: 'Le plateau se fend en deux.',
    targets: 1,
    rarity: 'commune',
    hue: 285,
    coups: 4,
    ranks: [3, 4],
  },

  // -------------------------------------------------------------------------------------------
  // Événements : agissent une fois.
  tide: {
    id: 'tide',
    catalogs: ['climats'],
    family: 'evenement',
    name: 'Grande Marée',
    genre: 'f',
    tagline: 'La mer avance pour tout le monde.',
    targets: 0,
    rarity: 'rare',
    hue: 172,
    ritual: true,
    ranks: [1, 2, 3, 4],
  },

  // -------------------------------------------------------------------------------------------
  // Duel : les cartes historiques.
  time_warp: {
    id: 'time_warp',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Distorsion temporelle',
    genre: 'f',
    tagline: 'Le temps file entre ses doigts.',
    description: "La pendule adverse s'écoule deux fois plus vite pendant ses 3 prochains coups.",
    targets: 0,
    prompts: [],
    duration: '3 coups adverses',
    rarity: 'rare',
    hue: 192,
    timedOnly: true,
    turns: 3,
    countsOnOpponent: true,
  },
  gravity: {
    id: 'gravity',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Gravité',
    genre: 'f',
    tagline: 'Chaque pas pèse une tonne.',
    description: 'La portée des tours, fous et dames adverses est divisée par deux : 3 cases au plus.',
    targets: 0,
    prompts: [],
    duration: '3 coups adverses',
    rarity: 'rare',
    hue: 268,
    turns: 3,
    countsOnOpponent: true,
  },
  freeze: {
    id: 'freeze',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Cryogénie',
    genre: 'f',
    tagline: 'Figée dans la glace éternelle.',
    description: 'Gèle une pièce adverse (sauf le roi) : elle ne peut ni bouger, ni capturer, ni protéger.',
    targets: 1,
    prompts: ['Choisissez une pièce adverse à geler'],
    duration: '2 coups adverses',
    rarity: 'commune',
    hue: 185,
    turns: 2,
    countsOnOpponent: true,
  },
  shield: {
    id: 'shield',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Égide',
    genre: 'f',
    tagline: 'Intouchable.',
    description: 'Une de vos pièces (sauf le roi) devient imprenable et insensible aux cartes adverses.',
    targets: 1,
    prompts: ['Choisissez une de vos pièces à protéger'],
    duration: '2 coups adverses',
    rarity: 'commune',
    hue: 44,
    turns: 2,
    countsOnOpponent: true,
  },
  swap: {
    id: 'swap',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Permutation',
    genre: 'f',
    tagline: 'Deux âmes, deux places.',
    description:
      "Échange instantanément la place de deux de vos pièces (sauf le roi). Un pion ne peut pas arriver sur la première ou la dernière rangée.",
    targets: 2,
    prompts: ['Choisissez la première pièce', 'Choisissez la pièce avec laquelle échanger'],
    duration: 'Instantané',
    rarity: 'rare',
    hue: 300,
  },
  rewind: {
    id: 'rewind',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Retour arrière',
    genre: 'm',
    tagline: 'Ce coup-là ? Il n’a jamais existé.',
    description: "Annule le dernier coup adverse. Votre adversaire doit rejouer, et pas le même coup.",
    targets: 0,
    prompts: [],
    duration: 'Instantané',
    rarity: 'légendaire',
    hue: 334,
  },
  revive: {
    id: 'revive',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Résurrection',
    genre: 'f',
    tagline: 'Les héros ne meurent jamais vraiment.',
    description:
      'Ramène votre meilleure pièce capturée (tour, puis fou, puis cavalier) sur une case vide de votre première rangée, ou un pion sur votre deuxième rangée.',
    targets: 1,
    prompts: ['Choisissez où faire renaître votre pièce'],
    duration: 'Instantané',
    rarity: 'épique',
    hue: 140,
  },
  knight_leap: {
    id: 'knight_leap',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Saut du cavalier',
    genre: 'm',
    tagline: "L'élan d'un destrier.",
    description: 'Pour ce tour, une de vos tours, fous ou dames peut aussi se déplacer comme un cavalier.',
    targets: 1,
    prompts: ['Choisissez la pièce qui pourra sauter'],
    duration: 'Ce tour',
    rarity: 'commune',
    hue: 28,
    turns: 1,
  },
  lightning: {
    id: 'lightning',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Foudre',
    genre: 'f',
    tagline: 'Le ciel a tranché.',
    description: 'Pulvérise un pion adverse, où qu’il soit sur l’échiquier.',
    targets: 1,
    prompts: ['Choisissez le pion adverse à foudroyer'],
    duration: 'Instantané',
    rarity: 'rare',
    hue: 52,
  },
  phase: {
    id: 'phase',
    catalogs: ['duel'],
    family: 'duel',
    name: 'Passe-muraille',
    genre: 'm',
    tagline: 'Vos rangs s’écartent comme de la brume.',
    description:
      'Pour ce tour, une de vos tours, fous ou dames traverse vos propres pièces. Une pièce adverse l’arrête toujours.',
    targets: 1,
    prompts: ['Choisissez la pièce qui deviendra spectrale'],
    duration: 'Ce tour',
    rarity: 'rare',
    hue: 250,
    turns: 1,
  },
};

/** Ce dont les gabarits ont besoin : le délai du Présage et l'équilibrage des cartes. */
export type CardTextRules = Pick<Rules, 'presageDelay'> & { tuning: Readonly<Partial<Record<CardId, CardTuning>>> };

/** Durée en coups d'un effet des Pouvoirs, au singulier ou au pluriel : « 3 coups », « 1 coup ». */
const coups = (n: number) => compte(n, 'coup');

/**
 * Gabarits des textes des Pouvoirs, à partir de l'équilibrage de la carte (`t` : coups, rangées, vitesse) et du délai
 * du Présage. Au réglage d'aujourd'hui, ils donnent les textes d'avant au caractère près (test/fixtures/v1/cartes.json).
 */
const TEMPLATES: Record<PowerCardId, (t: CardTuning, delay: number, genre: CardDef['genre']) => CardTexts> = {
  hourglass: (t, delay, genre) => ({
    description: `${arriveePresage(delay, genre)}. Pendant ${coups(t.coups!)}, les deux pendules s’écoulent ${vitesse(t.clockRate!)} et les coups ne rapportent plus d’incrément.`,
    duration: dureeEffet(t.coups!),
    prompts: [],
  }),
  truce: (t, delay, genre) => ({
    description:
      `${arriveePresage(delay, genre)}. Pendant ${coups(t.coups!)}, aucune capture n’est permise (prise en passant comprise), sauf pour sortir d’un échec. ` +
      (premierApres(t.coups!) === 'adversaire' ? 'L’adversaire reprend les captures le premier.' : 'Vous reprenez les captures le premier.'),
    duration: dureeEffet(t.coups!),
    prompts: [],
  }),
  blood_moon: (t, delay, genre) => ({
    description:
      `${arriveePresage(delay, genre)}. Pendant ${coups(t.coups!)}, un joueur qui peut capturer doit capturer ; il choisit la capture (prise en passant comprise). ` +
      (premierApres(t.coups!) === 'adversaire' ? 'L’adversaire retrouve le premier sa liberté.' : 'Vous retrouvez le premier votre liberté.'),
    duration: dureeEffet(t.coups!),
    prompts: [],
  }),
  ice_age: (t, delay, genre) => ({
    description: `${arriveePresage(delay, genre)}. Pendant ${coups(t.coups!)}, tous les pions des deux camps sont gelés : ils ne bougent ni ne capturent. Un roi ne peut toujours pas se placer sur une case qu’attaque un pion adverse.`,
    duration: dureeEffet(t.coups!),
    prompts: [],
  }),
  blast: (t, delay, genre) => ({
    description: `${arriveePresage(delay, genre)}. Pendant ${coups(t.coups!)}, toute prise fait exploser la pièce qui prend avec sa victime : les deux disparaissent. Les pièces voisines ne craignent rien. Un roi prend normalement.`,
    duration: dureeEffet(t.coups!),
    prompts: [],
  }),
  ice_wall: t => ({
    description: `Une case vide ${rangees(t.ranks!)} devient infranchissable pour les deux camps, jusqu’à la fin de la partie : aucune pièce ne peut s’y arrêter ni la traverser. Un cavalier peut sauter par-dessus.`,
    duration: 'Jusqu’à la fin de la partie',
    prompts: [`Choisissez une case vide ${rangees(t.ranks!)}`],
  }),
  rift: t => ({
    description: `Choisissez ${rangees(t.ranks!)}. Pendant ${coups(t.coups!)}, toutes ses cases vides deviennent un gouffre : aucune pièce ne peut s’y arrêter ni le traverser. Les cavaliers passent par-dessus.`,
    duration: dureeEffet(t.coups!),
    prompts: [`Choisissez ${rangees(t.ranks!)} (une case de la rangée)`],
  }),
  tide: t => ({
    description: `Rituel : la carte remplace votre coup. Tous les pions des deux camps qui sont sur ${t.ranks!.length > 1 ? 'leurs' : 'leur'} ${etendueRangees(t.ranks!)} avancent d’une case, si elle est libre. C’est ensuite à l’adversaire de jouer.`,
    duration: 'Instantané',
    prompts: [],
  }),
};

/** Équilibrage d'une définition de carte (coups, rangées, vitesse). */
const tuningOfDef = (d: CardData): CardTuning => ({ coups: d.coups, ranks: d.ranks, clockRate: d.clockRate });

/** Textes d'une définition, pour un équilibrage et un délai du Présage donnés. */
function textsOf(id: CardId, d: CardData, t: CardTuning, delay: number): CardTexts {
  const template = (TEMPLATES as Partial<Record<CardId, (typeof TEMPLATES)[PowerCardId]>>)[id];
  if (template) return template({ ...tuningOfDef(d), ...t }, delay, d.genre);
  return { description: d.description!, duration: d.duration!, prompts: d.prompts! };
}

/** Toutes les cartes, avec leurs textes au réglage du jour (délai du Présage de GAME_RULES, équilibrage de DEFS). */
export const CARDS = Object.fromEntries(
  (Object.entries(DEFS) as [CardId, CardData][]).map(([id, d]) => [id, { ...d, ...textsOf(id, d, {}, GAME_RULES.presageDelay) }]),
) as Record<CardId, CardDef>;

/** Toutes les cartes, Pouvoirs d'abord. Pour les cartes d'un seul catalogue : `cardsOf`. */
export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** La carte appartient-elle à ce catalogue ? (« Sans cartes » n'en contient aucune.) */
export function inCatalog(id: CardId, catalog: Catalog): boolean {
  return (CARDS[id].catalogs as readonly Catalog[]).includes(catalog);
}

/** Cartes d'un catalogue, dans l'ordre de présentation (vide pour 'aucune'). */
export function cardsOf(catalog: Catalog): CardId[] {
  return CARD_IDS.filter(id => inCatalog(id, catalog));
}

const textMemo = new WeakMap<object, Map<CardId, CardTexts>>();

/**
 * Textes d'une carte selon les règles d'une partie (bulles, aide d'une partie dont l'équilibrage ou le délai du
 * Présage diffèrent du réglage du jour) : `rulesOf(state)`. Mémorisé par objet de règles. Pour les règles du jour,
 * ce sont les textes de CARDS.
 */
export function cardText(id: CardId, rules: CardTextRules): CardTexts {
  let memo = textMemo.get(rules);
  if (!memo) textMemo.set(rules, (memo = new Map()));
  let t = memo.get(id);
  if (!t) {
    t = textsOf(id, DEFS[id], rules.tuning[id] ?? {}, rules.presageDelay);
    memo.set(id, t);
  }
  return t;
}

/** Cartes en jeu d'un catalogue (sans les cartes retirées), pour les textes qui les comptent. */
const inPlay = (catalog: Catalog) => cardsOf(catalog).filter(id => !CARDS[id].retired);

/** Catalogues proposés (interface, création de partie, file d'attente), le premier par défaut. */
export const CATALOGS: { id: Catalog; label: string; description: string }[] = [
  { id: 'climats', label: 'Pouvoirs', description: `${pouvoirs(inPlay('climats').length, true)}, visibles des deux joueurs, qui changent la partie pour les deux camps.` },
  { id: 'aucune', label: 'Sans cartes', description: 'Les échecs classiques, rien d’autre.' },
];

export const RARITY_LABEL: Record<Rarity, string> = {
  commune: 'Commune',
  rare: 'Rare',
  épique: 'Épique',
  légendaire: 'Légendaire',
};

/**
 * Poids du tirage pondéré (catalogue Pouvoirs) : les cartes rares sortent moins souvent.
 * @deprecated Alias de DEAL.rarityWeight (config/rules.ts), le réglage que lit le tirage ; retiré au lot 9.
 */
export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = DEAL.rarityWeight;

export function isCardId(x: unknown): x is CardId {
  return typeof x === 'string' && Object.hasOwn(CARDS, x);
}
