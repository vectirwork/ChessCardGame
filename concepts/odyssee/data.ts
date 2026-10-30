// L'Odyssée : les lieux traversés pendant la descente, et ce que l'échiquier y joue.
import type { CardId } from '../../src/shared/cards';

export type PoseKey = 'hero' | 'foret' | 'pics' | 'sablier' | 'bazar' | 'seuil';

export interface Place {
  id: PoseKey;
  num: string;
  name: string;
  /** Altitude affichée par l'altimètre en arrivant dans le lieu. */
  alt: number;
  /** Plateau et skin de l'échiquier qui accompagne la descente. */
  theme: string;
  skin: string;
  /** Teinte du lieu (r g b), reprise par le rideau du mode jeu. */
  tint: string;
  /** Bancs de nuées traversés en arrivant dans le lieu. */
  cloud: 'frost' | 'storm' | 'sand' | 'rose' | 'dusk' | null;
}

export const PLACES: Place[] = [
  { id: 'hero', num: 'I', name: "L'Observatoire", alt: 9120, theme: 'board:arcane', skin: 'skin:celestial', tint: '120 92 255', cloud: null },
  { id: 'foret', num: 'II', name: 'La Forêt de givre', alt: 6480, theme: 'board:slate', skin: 'skin:arcane', tint: '94 214 240', cloud: 'frost' },
  { id: 'pics', num: 'III', name: "Les Pics de l'orage", alt: 4210, theme: 'board:arcane', skin: 'skin:void', tint: '150 110 255', cloud: 'storm' },
  { id: 'sablier', num: 'IV', name: 'Le Sablier', alt: 1730, theme: 'board:obsidian', skin: 'skin:inferno', tint: '240 150 70', cloud: 'sand' },
  { id: 'bazar', num: 'V', name: 'Le Bazar céleste', alt: 640, theme: 'board:marble', skin: 'skin:neon', tint: '236 120 180', cloud: 'rose' },
  { id: 'seuil', num: 'VI', name: 'Le Seuil', alt: 0, theme: 'board:arcane', skin: 'skin:celestial', tint: '243 201 105', cloud: 'dusk' },
];

export const placeById = (id: string) => PLACES.find(p => p.id === id) ?? PLACES[0];

/** Les pouvoirs, rangés par lieu. */
export const PLACE_CARDS: Partial<Record<PoseKey, CardId[]>> = {
  foret: ['ice_wall', 'freeze', 'phase'],
  pics: ['lightning', 'gravity', 'shield', 'knight_leap'],
  sablier: ['time_warp', 'rewind', 'revive', 'swap'],
};

/** Ce que l'échiquier lance quand on s'attarde dans un lieu sans carte active. */
export const IDLE_CASTS: Record<PoseKey, CardId[]> = {
  hero: ['lightning', 'ice_wall', 'freeze', 'shield', 'rewind'],
  foret: [],
  pics: ['lightning'],
  sablier: ['rewind'],
  bazar: ['lightning', 'ice_wall', 'shield', 'freeze'],
  seuil: ['shield', 'lightning'],
};

export const PRINCIPLE = [
  {
    n: '01',
    title: 'Les échecs, intacts.',
    text: 'Roque, prise en passant, promotion, pendule : toutes les règles, sans exception. Ton jeu reste ta meilleure arme.',
  },
  {
    n: '02',
    title: 'Trois cartes en main.',
    text: "Distribuées au hasard, cachées à l'adversaire. Chacune ne sert qu'une seule fois par partie.",
  },
  {
    n: '03',
    title: 'Un sort par tour.',
    text: 'Avant ton coup, lance une carte. Elle ne remplace pas ton coup : elle le prépare.',
  },
];

export const PLACE_COPY: Record<'foret' | 'pics' | 'sablier', { title: [string, string]; text: string; word: string }> = {
  foret: {
    title: ['Ici, le froid', 'est une arme.'],
    text: 'Sous les pins gelés, on apprend à fermer le jeu : figer une case, immobiliser une pièce, passer à travers ses propres rangs.',
    word: 'Givre',
  },
  pics: {
    title: ['Là-haut,', 'le ciel tranche.'],
    text: "Des sorts de force brute, nés dans l'orage : frapper, alourdir, protéger, bondir.",
    word: 'Orage',
  },
  sablier: {
    title: ['Le temps,', 'retourné.'],
    text: "Au cœur du désert, le grand sablier obéit aux audacieux : affoler la pendule, effacer un coup, relever une pièce tombée.",
    word: 'Temps',
  },
};

export const MODES = [
  {
    key: 'ami',
    title: 'Défier un ami',
    tag: 'Sans compte',
    text: 'Crée une partie, envoie le lien. Ton ami joue en un clic, sur mobile comme sur ordinateur.',
  },
  {
    key: 'ia',
    title: "Affronter l'IA",
    tag: '3 niveaux',
    text: 'Apprenti, Sorcier ou Archimage : une IA qui calcule et garde ses sorts pour le bon moment.',
  },
  {
    key: 'elo',
    title: 'Parties classées',
    tag: 'Elo',
    text: "Grimpe au classement et garde l'historique de tes parties. Un compte gratuit suffit.",
  },
];

export const PRICES: Record<string, string> = {
  'skin:arcane': 'Offert',
  'skin:inferno': '2,99 €',
  'skin:neon': '2,99 €',
  'skin:sakura': '2,99 €',
  'skin:celestial': '3,99 €',
  'skin:void': '3,99 €',
  'board:arcane': 'Offert',
  'board:wood': 'Offert',
  'board:slate': 'Offert',
  'board:marble': '1,99 €',
  'board:obsidian': '1,99 €',
  'board:jade': '1,99 €',
  'board:ruby': '1,99 €',
};

export const LEVELS = [
  { key: 'apprenti', name: 'Apprenti', text: 'Joue vite, lance ses sorts au hasard.' },
  { key: 'sorcier', name: 'Sorcier', text: 'Calcule, protège ses pièces, garde une carte pour la fin.' },
  { key: 'archimage', name: 'Archimage', text: 'Lit tes intentions et punit chaque sort gaspillé.' },
];

/** Pages de démonstration ouvertes en aperçu (liens du pied de page, connexion, modes). */
export const LEGAL: Record<string, { title: string; text: string }> = {
  mentions: {
    title: 'Mentions légales',
    text: "Spellmate est édité par son fondateur. L'hébergement, l'adresse de l'éditeur et le directeur de la publication figureront ici dans la version publique.",
  },
  cgu: {
    title: "Conditions d'utilisation",
    text: "Jouer est gratuit et ne demande aucun compte. Les règles de bonne conduite (pas de triche, pas d'insultes) et la gestion des comptes seront détaillées ici.",
  },
  cgv: {
    title: 'Conditions de vente',
    text: "Les achats ne portent que sur des éléments cosmétiques (skins et plateaux), sans effet sur la partie. Prix TTC, droit de rétractation et remboursements seront précisés ici.",
  },
  confidentialite: {
    title: 'Confidentialité',
    text: "Une partie anonyme ne collecte aucune donnée personnelle. Le compte, facultatif, ne sert qu'au classement et aux achats. La politique complète sera publiée ici.",
  },
};
