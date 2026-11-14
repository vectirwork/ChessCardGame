// Marque du site. Aucun import.
//
// Lue par le greffon Vite (index.html et manifeste, identiques octet pour octet au défaut), Layout, le titre des
// pages, le partage et le nom d'application par défaut du serveur (APP_NAME l'emporte). pgnVariant et storagePrefix
// sont des rappels : lus nulle part, ils ne commandent rien (voir leur commentaire).
//
// Ne jamais renommer les identifiants techniques avec la marque : préfixe de stockage 'sm:', cookies sm_session et
// sm_guest, base « spellmate », /opt/spellmate, variante PGN « Spellmate », noms des fils de calcul. Les changer
// déconnecterait tout le monde, effacerait les préférences ou rendrait les PGN exportés illisibles.

export interface Brand {
  /** Nom affiché (titres, pied de page, e-mails, partage). */
  name: string;
  /** Nom en capitales du logo. */
  nameCaps: string;
  /** Nom court du manifeste (écran d'accueil d'un téléphone). */
  shortName: string;
  /** Accroche : titre de la page d'accueil, og:title, début de la description du manifeste. */
  tagline: string;
  /** Accroche du pied de page. */
  footerTagline: string;
  /** Séparateur des titres de page : « Apprendre · Spellmate ». */
  titleSeparator: string;
  /** Couleur de thème (barre du navigateur, manifeste). */
  themeColor: string;
  /** Couleur de fond du manifeste. */
  backgroundColor: string;
  /**
   * RAPPEL, lu nulle part : la variante des PGN exportés ([Variant "Spellmate"]) est écrite en dur dans
   * src/shared/pgn.ts (writePgn). Format d'échange : ne jamais la changer. La relier à ce champ changerait le site
   * construit (83 fichiers de dist/ sur 275, lot 9e) : elle ne l'est pas.
   */
  pgnVariant: string;
  /**
   * RAPPEL, lu nulle part : les clés du stockage local sont écrites en entier dans src/client/storageKeys.ts (« sm:… »,
   * et « spellmate:reload »). Identifiants techniques : ne jamais les changer. Changer ce champ ne change aucune clé.
   */
  storagePrefix: string;
}

/** ← Marque. */
export const BRAND: Readonly<Brand> = /* @__PURE__ */ Object.freeze({
  name: 'Spellmate',
  nameCaps: 'SPELLMATE',
  shortName: 'Spellmate',
  tagline: 'Les échecs ont appris la magie',
  footerTagline: 'Les échecs, avec un peu de magie.',
  titleSeparator: ' · ',
  themeColor: '#04050f',
  backgroundColor: '#04050f',
  pgnVariant: 'Spellmate',
  storagePrefix: 'sm:',
});

/** Titre d'une page : « Apprendre · Spellmate » ; sans titre, « Spellmate · Les échecs ont appris la magie ». */
export function pageTitle(title?: string | null): string {
  return title ? `${title}${BRAND.titleSeparator}${BRAND.name}` : `${BRAND.name}${BRAND.titleSeparator}${BRAND.tagline}`;
}
