// Bornes des pseudos et des mots de passe, partagées par les schémas du serveur (zod) et les formulaires du client.
// Aucun import. Les phrases sont construites ici à partir des bornes : changer une borne change aussi le message.

/** Pseudo d'invité (partie sans compte) : 2 à 20 caractères, lettres, chiffres, espace et « _ . - ». */
export const GUEST_NAME = /* @__PURE__ */ guestName(2, 20);

/** Pseudo d'un compte : 3 à 20 caractères [A-Za-z0-9_-], hors mots réservés. */
export const USERNAME = /* @__PURE__ */ username(3, 20, [
  'admin', 'administrateur', 'moderateur', 'support', 'bot', 'ia', 'spellmate', 'anonyme', 'invite',
]);

/** Mot de passe : 8 à 200 caractères. */
export const PASSWORD = /* @__PURE__ */ password(8, 200);

// ---------------------------------------------------------------------------------------------

function guestName(min: number, max: number) {
  return Object.freeze({
    min,
    max,
    /** Caractères permis (le serveur vérifie la longueur à part, après trim). */
    chars: /^[\p{L}\p{N} _.-]+$/u,
    /** Forme complète, longueur comprise, pour les formulaires (à tester sur le pseudo sans espaces autour). */
    full: new RegExp(`^[\\p{L}\\p{N} _.-]{${min},${max}}$`, 'u'),
    /** Refus du serveur et de l'accueil. */
    invalid: `Choisissez un pseudo de ${min} à ${max} caractères.`,
    /** Refus détaillé (page Jouer). */
    invalidDetail: `Choisissez un pseudo de ${min} à ${max} caractères (lettres, chiffres, espaces, . _ -).`,
  });
}

function username(min: number, max: number, reserved: readonly string[]) {
  return Object.freeze({
    min,
    max,
    chars: /^[A-Za-z0-9_-]+$/,
    reserved: Object.freeze([...reserved]),
    /** Mot réservé, quelle que soit la casse. */
    reservedPattern: new RegExp(`^(${reserved.join('|')})$`, 'i'),
    tooShort: `Le pseudo doit faire au moins ${min} caractères.`,
    tooLong: `Le pseudo doit faire au plus ${max} caractères.`,
    badChars: 'Lettres, chiffres, tirets et soulignés uniquement.',
    isReserved: 'Ce pseudo est réservé.',
    /** Aide sous le champ (inscription). */
    hint: `${min} à ${max} caractères : lettres, chiffres, - et _`,
  });
}

function password(min: number, max: number) {
  return Object.freeze({
    min,
    max,
    tooShort: `Le mot de passe doit faire au moins ${min} caractères.`,
    /** Aide sous le champ (inscription). */
    hint: `${min} caractères minimum.`,
  });
}
