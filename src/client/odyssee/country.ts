// Pays de l'adversaire d'une partie de l'accueil, en français : « depuis la France », « depuis le Canada »,
// « depuis les États-Unis », « depuis l'Espagne », « depuis Israël ».

/** Pays sans article (îles, cités-États…). */
const BARE = new Set(['IL', 'MC', 'SG', 'CU', 'MG', 'MT', 'CY', 'TW', 'HT', 'BH', 'OM', 'QA', 'KW', 'DJ', 'SM', 'AD', 'JM', 'HK', 'MO', 'TO', 'NR', 'TV', 'BB', 'CV', 'ST', 'MU', 'BN', 'GU', 'PR', 'RE', 'MQ', 'GP', 'YT', 'NC', 'PF']);
/** Pays au pluriel. */
const PLURAL = new Set(['US', 'NL', 'PH', 'AE', 'KM', 'MV', 'SC', 'BS', 'FJ', 'SB', 'MH', 'VG', 'VI', 'KY', 'TC', 'FK', 'FO', 'CC', 'UM']);
/** Pays masculins qui finissent par « e ». */
const MASC_E = new Set(['MX', 'KH', 'MZ', 'ZW', 'BZ', 'GE']);

export function countryName(cc: string): string | null {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(cc) ?? null;
  } catch {
    return null;
  }
}

/** « depuis la France » ; null si le pays est inconnu. */
export function fromCountry(cc: string | null): string | null {
  if (!cc) return null;
  const name = countryName(cc);
  if (!name || name === cc) return null;
  if (BARE.has(cc)) return `depuis ${name}`;
  if (PLURAL.has(cc)) return `depuis les ${name}`;
  if (/^[aeiouyâàéèêëîïôöûüœh]/i.test(name)) return `depuis l’${name}`;
  const fem = /e$/.test(name) && !MASC_E.has(cc);
  return `depuis ${fem ? 'la' : 'le'} ${name}`;
}
