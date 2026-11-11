// Marque du site. Aucun import.
//
// Lue par le greffon Vite (index.html et manifeste, identiques octet pour octet au défaut), Layout, le titre des
// pages, le partage, l'export PGN et le nom d'application par défaut du serveur (APP_NAME l'emporte).
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
  /** Variante écrite dans les PGN exportés ([Variant "Spellmate"]). Format d'échange : ne jamais changer. */
  pgnVariant: string;
  /** Préfixe des clés de stockage local. Identifiant technique : ne jamais changer. */
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
