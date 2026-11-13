// Emplacements équipables (roi, échiquier, sorts) : une entrée par emplacement, dans l'ordre d'affichage. Aucun import
// à l'exécution. Tout ce qui nomme, range, montre ou enregistre un emplacement en est dérivé : SLOTS, libellés, rayons
// de la boutique, notes, « qui voit quoi », objets par défaut, champs du compte, colonnes SQL (catalog.ts, boutique,
// compte, e-mails).
//
// Ajouter un emplacement (un dos de carte, un jeu de pièces) : une entrée ici, une migration (sa colonne equipped_*,
// src/server/db.ts), le dessin de sa vignette (ItemThumb) et ses données (un fichier voisin, PRICE dans catalog.ts).
// Le compilateur signale les tables à compléter (ItemKind est la liste des clés de SLOT_DEFS).

export interface SlotDef {
  /** Libellé : « Roi », « Échiquier », « Sorts ». Aussi devant le nom d'un objet (itemLabel), sauf si `named`. */
  label: string;
  /** Pluriel (titre de rayon, collection du compte) : « Rois », « Échiquiers », « Sorts ». */
  plural: string;
  /** L'emplacement dans une phrase (« roi, échiquier et sorts ») et au pluriel (« 7 sorts : … »). */
  word: string;
  words: string;
  /** Le mot porte un pluriel grammatical (« vos sorts » : les). */
  pl: boolean;
  /** Unité comptée : « 1 sort », « 5 sorts ». */
  unit: readonly [string, string];
  /** Le nom des objets contient déjà le mot (« Roi de braise ») : pas de libellé devant. */
  named: boolean;
  /** Article devant le mot, ou devant le nom d'un objet `named` : « l’échiquier Rubis », « le roi de braise ». */
  article: string;
  /** Possessif : « votre roi », « vos sorts ». */
  mine: string;
  /** Accord de « équipé » : « Sorts Inferno équipés ». */
  equipped: string;
  /** Fin du message après équipement (« Roi de braise équipé » + fin). */
  equippedTail: string;
  /** Rayon de la boutique : identifiant d'adresse (?rayon=). */
  rayon: string;
  /** Vue de la cabine qui montre l'emplacement : le portrait du roi, ou l'échiquier en partie. */
  view: 'roi' | 'partie';
  /** Note sous le rayon et dans la collection du compte. */
  note: string;
  /** Vu par l'adversaire en partie (pris à l'assise) ; sinon chacun voit le sien (« il vous suit… »). */
  seen: boolean;
  /** Objet non vu par l'adversaire : ce qu'il fait (« vous suit dans toutes vos parties »), pronom et « le leur ». */
  follows?: { verb: string; pronoun: string; theirs: string };
  /** Objet porté par défaut (invités, nouveaux comptes, identifiant inconnu, retour après remboursement). */
  default: string;
  /** Colonne de l'objet porté (table users). Lue par auth.ts (SLOT_COLUMN) à partir du lot 9. */
  column: string;
  /** Champ de l'objet porté dans MeUser (protocol.ts). */
  meField: string;
}

/** ← Emplacements, dans l'ordre d'affichage. */
export const SLOT_DEFS = {
  king: {
    label: 'Roi',
    plural: 'Rois',
    word: 'roi',
    words: 'rois',
    pl: false,
    unit: ['roi', 'rois'],
    named: true,
    article: 'le ',
    mine: 'votre roi',
    equipped: 'équipé',
    equippedTail: '. Vos adversaires le verront dès votre prochaine partie.',
    rayon: 'rois',
    view: 'roi',
    note: 'Votre roi vous représente : vos adversaires le voient en face d’eux.',
    seen: true,
    default: 'king:arcane',
    column: 'equipped_king',
    meField: 'equippedKing',
  },
  board: {
    label: 'Échiquier',
    plural: 'Échiquiers',
    word: 'échiquier',
    words: 'échiquiers',
    pl: false,
    unit: ['échiquier', 'échiquiers'],
    named: false,
    article: 'l’',
    mine: 'votre échiquier',
    equipped: 'équipé',
    equippedTail: ' : il vous suit dans toutes vos parties.',
    rayon: 'echiquiers',
    view: 'partie',
    note: 'Votre échiquier vous suit dans toutes vos parties. Vos adversaires gardent le leur.',
    seen: false,
    follows: { verb: 'vous suit dans toutes vos parties', pronoun: 'il', theirs: 'le leur' },
    default: 'board:arcane',
    column: 'equipped_board',
    meField: 'equippedBoard',
  },
  skin: {
    label: 'Sorts',
    plural: 'Sorts',
    word: 'sorts',
    words: 'sorts',
    pl: true,
    unit: ['sort', 'sorts'],
    named: false,
    article: 'les ',
    mine: 'vos sorts',
    equipped: 'équipés',
    equippedTail: ' : vos adversaires les verront à chacun de vos sorts.',
    rayon: 'sorts',
    view: 'partie',
    note: 'Vos sorts s’animent avec ce skin, chez vous comme chez votre adversaire.',
    seen: true,
    default: 'skin:arcane',
    column: 'equipped_skin',
    meField: 'equippedSkin',
  },
} as const satisfies Record<string, SlotDef>;

/** Emplacement d'un objet. `skin` désigne les sorts (identifiant technique gardé : `skin:*` est déjà en base). */
export type ItemKind = keyof typeof SLOT_DEFS;
/** Rayon d'un emplacement (« rois », « echiquiers », « sorts »). */
export type SlotRayon = (typeof SLOT_DEFS)[ItemKind]['rayon'];
