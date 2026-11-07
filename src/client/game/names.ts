// Noms des joueurs dans les phrases : « Cartes d'Alice », « Au tour de Bruno », « Cartes de l'IA Sorcier ».

/** Le nom commence-t-il par une voyelle (accentuée ou non) ou un h (pris comme muet : Hélène, Hugo) ? */
const ELIDE = /^[aeiouhàâäéèêëîïôöùûüœæ]/i;

/**
 * « de » + nom, avec l'élision et les contractions du français : « d'Alice », « de Bruno », « de l'IA Sorcier »,
 * « des Blancs » (pour « Les Blancs »).
 */
export function deNom(name: string): string {
  const n = name.trim();
  if (/^les\s/i.test(n)) return `des ${n.slice(4)}`;
  if (/^le\s/i.test(n)) return `du ${n.slice(3)}`;
  if (/^IA(\s|$)/.test(n)) return `de l'${n}`;
  return ELIDE.test(n) ? `d'${n}` : `de ${n}`;
}
