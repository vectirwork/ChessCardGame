// Vérifie qu'un lot de la passe « polymorphe » ne touche que ses fichiers (carte : docs/polymorphie/LOTS.json).
//
//   node scripts/verifier-lot.mjs <lot> [--base=<réf>] [--branche=<réf>] [--sans-copie] [--fichiers=a,b,…]
//   npm run verifier-lot -- 3
//
// Fichiers examinés : `git diff --name-only <base>...<branche>` (défaut : le point de départ commun avec la branche
// d'intégration, sinon le commit « base » de la carte ; branche : HEAD), plus, sauf avec --sans-copie, les fichiers
// modifiés, ajoutés ou supprimés de la copie de travail (git status). --fichiers remplace tout cela par une liste.
//
// Un fichier est accepté s'il correspond à un motif « possede » ou « partage » du lot. Il est refusé :
// - hors du périmètre du lot (le message nomme le ou les lots qui le possèdent) ;
// - s'il est gelé (« geles » : protocol.ts, src/shared/config/*, text/regles.ts entre le lot 0b et le lot 9), même
//   pour un lot qui le partagerait.
// Code de sortie : 0 si tout est accepté, 1 sinon, 2 pour une erreur d'usage.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARTE = path.join(DEPOT, 'docs/polymorphie/LOTS.json');

const args = process.argv.slice(2);
const opt = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const lotId = args.find(a => !a.startsWith('--'));
const carte = JSON.parse(readFileSync(CARTE, 'utf8'));
const lots = new Map(carte.lots.map(l => [l.id, l]));

if (!lotId || !lots.has(lotId)) {
  console.error(`Usage : node scripts/verifier-lot.mjs <lot> (lots : ${[...lots.keys()].join(', ')})`);
  process.exit(2);
}
const lot = lots.get(lotId);

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

/** Sortie brute d'une commande git (sans retirer les espaces de tête : ils comptent dans git status). */
const gitBrut = (...a) => execFileSync('git', a, { cwd: DEPOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const git = (...a) => gitBrut(...a).trim();

function fichiersExamines() {
  const liste = opt('fichiers');
  if (liste !== undefined) return { fichiers: liste.split(',').map(s => s.trim()).filter(Boolean), source: '--fichiers' };
  const branche = opt('branche') ?? 'HEAD';
  let base = opt('base');
  if (!base) {
    for (const ref of [carte.brancheIntegration, `origin/${carte.brancheIntegration}`]) {
      try {
        base = git('merge-base', ref, branche);
        break;
      } catch {
        // essai suivant
      }
    }
    base ??= carte.base;
  }
  const out = new Set(git('diff', '--name-only', `${base}...${branche}`).split('\n').filter(Boolean));
  if (!args.includes('--sans-copie') && !opt('branche')) {
    for (const ligne of gitBrut('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean)) {
      // « XY chemin » ou « XY ancien -> nouveau » (renommage : les deux comptent)
      for (const p of ligne.slice(3).split(' -> ')) out.add(p.replace(/^"|"$/g, ''));
    }
  }
  return { fichiers: [...out].sort(), source: `${base.slice(0, 10)}...${branche}${args.includes('--sans-copie') || opt('branche') ? '' : ' + copie de travail'}` };
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

console.log(`Lot ${lotId} (${lot.titre}) : ${fichiers.length} fichier(s) examiné(s) [${source}], ${permis.length} motif(s) permis.`);
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
