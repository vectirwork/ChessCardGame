// Vérifie qu'un lot de la passe « polymorphe » ne touche que ses fichiers (carte : docs/polymorphie/LOTS.json).
//
//   node scripts/verifier-lot.mjs <lot> [--base=<réf>] [--branche=<réf>] [--integration=<branche>] [--sans-copie]
//                                       [--fichiers=a,b,…]
//   npm run verifier-lot -- 3
//
// Fichiers examinés : `git diff --name-only --no-renames <base>...<branche>` (un renommage compte pour ses deux chemins ;
// défaut de la base : le point de départ commun avec la branche d'intégration, sinon le commit « base » ; branche :
// HEAD), plus, sauf avec --sans-copie, les fichiers modifiés, ajoutés, supprimés ou renommés de la copie de travail
// (git status). --fichiers remplace tout cela par une liste.
//
// La carte n'est jamais lue dans la copie vérifiée (un lot pourrait s'y attribuer des fichiers) : elle est lue au bout de
// la branche d'intégration, sinon au commit de base ; seulement si aucun des deux ne la contient (première vague), dans
// la copie de travail, avec un avertissement. Une carte de la copie différente de la carte de référence est signalée.
//
// Un fichier est accepté s'il correspond à un motif « possede » ou « partage » du lot. Il est refusé :
// - hors du périmètre du lot (le message nomme le ou les lots qui le possèdent) ;
// - s'il est gelé (« geles » : protocol.ts, src/shared/config/*, text/regles.ts entre le lot 0b et le lot 9), même
//   pour un lot qui le partagerait.
// Code de sortie : 0 si tout est accepté, 1 sinon, 2 pour une erreur d'usage.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHEMIN_CARTE = 'docs/polymorphie/LOTS.json';
/** Branche d'intégration et point de départ de la passe (ne dépendent pas de la carte, que le lot pourrait modifier). */
const INTEGRATION = 'claude/peaceful-hamilton-qr9cmc';
const BASE_PASSE = '7148547';

const args = process.argv.slice(2);
const opt = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const lotId = args.find(a => !a.startsWith('--'));

/** Sortie brute d'une commande git (sans retirer les espaces de tête : ils comptent dans git status). */
const gitBrut = (...a) => execFileSync('git', a, { cwd: DEPOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const git = (...a) => gitBrut(...a).trim();
const essayer = f => {
  try {
    return f();
  } catch {
    return null;
  }
};

const integration = opt('integration') ?? INTEGRATION;
const branche = opt('branche') ?? 'HEAD';
let base = opt('base');
if (!base) {
  for (const ref of [integration, `origin/${integration}`]) {
    base = essayer(() => git('merge-base', ref, branche));
    if (base) break;
  }
  base ??= BASE_PASSE;
}

/** Carte de référence : bout de l'intégration, sinon base ; à défaut, la copie de travail (avertissement). */
function lireCarte() {
  for (const ref of [integration, `origin/${integration}`, base]) {
    const texte = essayer(() => gitBrut('show', `${ref}:${CHEMIN_CARTE}`));
    if (texte) return { carte: JSON.parse(texte), source: ref, texte };
  }
  const f = path.join(DEPOT, CHEMIN_CARTE);
  if (!existsSync(f)) {
    console.error(`Carte introuvable (${CHEMIN_CARTE}) : ni dans ${integration}, ni à la base ${base}, ni dans la copie.`);
    process.exit(2);
  }
  const texte = readFileSync(f, 'utf8');
  return { carte: JSON.parse(texte), source: null, texte };
}
const { carte, source: sourceCarte, texte: texteCarte } = lireCarte();
const lots = new Map(carte.lots.map(l => [l.id, l]));

if (!lotId || !lots.has(lotId)) {
  console.error(`Usage : node scripts/verifier-lot.mjs <lot> (lots : ${[...lots.keys()].join(', ')})`);
  process.exit(2);
}
const lot = lots.get(lotId);
if (sourceCarte === null) {
  console.log(`Attention : carte lue dans la copie de travail (absente de ${integration} et de la base ${base.slice(0, 10)}).`);
} else {
  const copie = essayer(() => readFileSync(path.join(DEPOT, CHEMIN_CARTE), 'utf8'));
  if (copie !== null && copie !== texteCarte) {
    console.log(`Attention : la carte de la copie de travail diffère de celle de ${sourceCarte} ; seule cette dernière fait foi.`);
  }
}

/** Motif de glob (*, **) en expression régulière, sur le chemin entier. */
export function motifRegex(motif) {
  let re = '';
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i];
    if (c === '*' && motif[i + 1] === '*') {
      // « **/ » : zéro ou plusieurs dossiers ; « ** » final : tout le reste
      if (motif[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const correspond = (fichier, motifs) => motifs.some(m => motifRegex(m.motif ?? m).test(fichier));

function fichiersExamines() {
  const liste = opt('fichiers');
  if (liste !== undefined) return { fichiers: liste.split(',').map(s => s.trim()).filter(Boolean), source: '--fichiers' };
  const out = new Set(git('diff', '--name-only', '--no-renames', `${base}...${branche}`).split('\n').filter(Boolean));
  const avecCopie = !args.includes('--sans-copie') && !opt('branche');
  if (avecCopie) {
    for (const ligne of gitBrut('status', '--porcelain', '--no-renames', '--untracked-files=all').split('\n').filter(Boolean)) {
      // « XY chemin » (avec --no-renames, un renommage donne une suppression et un ajout)
      for (const p of ligne.slice(3).split(' -> ')) out.add(p.replace(/^"|"$/g, ''));
    }
  }
  return { fichiers: [...out].sort(), source: `${base.slice(0, 10)}...${branche}${avecCopie ? ' + copie de travail' : ''}` };
}

const { fichiers, source } = fichiersExamines();
const permis = [...lot.possede, ...lot.partage];
const refus = [];
const partages = [];
for (const f of fichiers) {
  const gele = carte.geles.find(g => motifRegex(g.motif).test(f) && !(g.sauf ?? []).includes(f));
  if (gele && lotId !== gele.apres && lotId !== gele.jusqua) {
    refus.push(`${f} : gelé après le lot ${gele.apres}, jusqu'au lot ${gele.jusqua}`);
    continue;
  }
  if (correspond(f, lot.possede)) continue;
  if (correspond(f, lot.partage)) {
    const p = lot.partage.find(m => motifRegex(m.motif).test(f));
    partages.push(`${f}${p?.note ? ` (${p.note})` : ''}`);
    continue;
  }
  const proprietaires = carte.lots.filter(l => correspond(f, l.possede)).map(l => l.id);
  const partageurs = carte.lots.filter(l => correspond(f, l.partage)).map(l => l.id);
  const qui = [
    proprietaires.length ? `possédé par le lot ${proprietaires.join(', ')}` : null,
    partageurs.length ? `partagé par le lot ${partageurs.join(', ')}` : null,
  ].filter(Boolean).join(' ; ') || 'dans aucun lot';
  refus.push(`${f} : hors du périmètre du lot ${lotId} (${qui})`);
}

console.log(`Lot ${lotId} (${lot.titre}) : ${fichiers.length} fichier(s) examiné(s) [${source}], ${permis.length} motif(s) permis, carte de ${sourceCarte ?? 'la copie de travail'}.`);
if (partages.length) {
  console.log('Fichiers partagés touchés (vérifier que seule la partie indiquée change) :');
  for (const p of partages) console.log(`  ~ ${p}`);
}
if (refus.length) {
  console.log(`REFUSÉ : ${refus.length} fichier(s) hors périmètre :`);
  for (const r of refus) console.log(`  ✗ ${r}`);
  process.exit(1);
}
console.log('Accepté : tous les fichiers sont dans le périmètre du lot.');
