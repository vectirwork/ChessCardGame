// Essai d'un réglage sans toucher au dépôt : copie le dépôt dans un dossier temporaire, y change une ou plusieurs
// valeurs, puis lance tsc, les tests rapides (et, sur demande, la construction et les témoins v1). Affiche les tests
// en échec, en séparant les GARDES ATTENDUS (ceux qui doivent échouer quand une valeur par défaut change, avec ce qu'il
// faut mettre à jour) des AUTRES (à relire : en principe, il n'y en a aucun).
//
//   npm run essai-reglage -- --essai=cinq
//   npm run essai-reglage -- --essai=tous --build
//   npm run essai-reglage -- --remplacer='src/shared/config/rules.ts::  draftMs: 45_000,::  draftMs: 20_000,'
//   node scripts/essai-reglage.mjs --essai=cinq+deuxParTour --temoins
//
// Options :
//   --essai=<nom>         essai prêt à l'emploi (liste plus bas). `a,b` : deux essais l'un après l'autre, chacun sur
//                         une copie neuve ; `a+b` : les deux changements dans un même essai ; `tous` : les 7 essais.
//   --remplacer=<fichier>::<texte avant>::<texte après>
//                         remplacement exact dans un fichier (chemin depuis la racine du dépôt). Répétable. Refusé si
//                         le texte avant n'apparaît pas exactement une fois. Avec --essai, ajouté à chaque essai.
//                         Un retour à la ligne s'écrit avec la syntaxe du shell : $'…\n…'.
//   --build               lance aussi `npm run build` (des règles impossibles arrêtent la construction : checkRules).
//   --temoins             lance aussi `npm run temoins` (comparaison aux témoins v1 : voir plus bas).
//   --tout                tous les projets de Vitest (rapide, matrice, lent) au lieu du seul projet rapide.
//   --sans-tests          ni tsc ni Vitest (avec --build ou --temoins : seulement la construction ou les témoins).
//   --details             message complet de chaque échec (sinon sa première ligne).
//   --garder              garde la copie (dossier affiché) ; sinon elle est supprimée à la fin.
//   --dossier=<d>         dossier où créer la copie (défaut : dossier temporaire du système).
//   --json=<fichier>      écrit aussi le résultat de chaque essai en JSON.
//
// Code de sortie : 0 si aucun essai n'a d'échec hors des gardes attendus (tsc, tests, construction, témoins), 1 sinon,
// 2 pour une erreur d'usage (option inconnue, texte à remplacer absent ou en double).
//
// Gardes attendus (GARDES ci-dessous) : la photographie des valeurs par défaut (test/garde-fous/defauts.test.ts),
// le garde de protocole (test/garde-fous/protocole.test.ts), le test de docs/REGLAGES.md (test/reglages-doc.test.ts)
// et les tests qui exigent une configuration jouable (checkRules), avec la construction qu'un réglage impossible arrête.
//
// Témoins v1 (--temoins) : `npm run temoins` rejoue les parties, les tirages et les textes des cartes pris avant la
// passe « polymorphe », au réglage d'alors. Les parties et les salles témoins gardent leurs règles (RULES_V1) ;
// les tirages et le choix de l'IA suivent la mise en place du jour (nombre de cartes) et les textes des cartes suivent
// l'équilibrage du jour : ils s'écartent des témoins quand ces réglages changent. Ses écarts ne comptent pas dans le
// code de sortie (ce sont des photographies du défaut d'avant la passe) ; ils sont affichés à part.
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES = 'src/shared/config/rules.ts';
const CARDS = 'src/shared/cards.ts';

/**
 * Essais prêts à l'emploi : ceux du lot 9c (docs/REGLAGES.md, section 2). `dans` et `fin` : le remplacement porte sur
 * le bloc qui va du repère `dans` (unique) au premier `fin` qui le suit, pour viser GAME_RULES et non RULES_V1, qui a
 * les mêmes lignes. Si la valeur par défaut a déjà changé, le texte avant manque : l'essai est refusé (code 2).
 */
const BLOC_REGLES = { fichier: RULES, dans: 'export const GAME_RULES', fin: '} satisfies GameRulesSettings);' };
const BLOC_DEAL = { fichier: RULES, dans: 'export const DEAL', fin: '} satisfies DealSettings);' };
const BLOC_MUR = { fichier: CARDS, dans: "  ice_wall: {\n    id: 'ice_wall',", fin: '\n  },' };
export const ESSAIS = {
  cinq: { titre: 'GAME_RULES.cardsPerPlayer 3 → 5', changements: [{ ...BLOC_REGLES, avant: '  cardsPerPlayer: 3,', apres: '  cardsPerPlayer: 5,' }] },
  deuxParTour: { titre: 'GAME_RULES.cardsPerTurn 1 → 2', changements: [{ ...BLOC_REGLES, avant: '  cardsPerTurn: 1,', apres: '  cardsPerTurn: 2,' }] },
  remplaceCoup: { titre: 'GAME_RULES.cardEndsTurn false → true', changements: [{ ...BLOC_REGLES, avant: '  cardEndsTurn: false,', apres: '  cardEndsTurn: true,' }] },
  presage4: { titre: 'GAME_RULES.presageDelay 2 → 4', changements: [{ ...BLOC_REGLES, avant: '  presageDelay: 2,', apres: '  presageDelay: 4,' }] },
  trente: { titre: 'DEAL.draftMs 45 000 → 30 000', changements: [{ ...BLOC_DEAL, avant: '  draftMs: 45_000,', apres: '  draftMs: 30_000,' }] },
  mur: { titre: 'rangées du Mur de glace [2, 3, 4, 5] → [2, 3, 4]', changements: [{ ...BLOC_MUR, avant: '    ranks: [2, 3, 4, 5],', apres: '    ranks: [2, 3, 4],' }] },
  six: { titre: 'GAME_RULES.cardsPerPlayer 3 → 6 (impossible : checkRules)', changements: [{ ...BLOC_REGLES, avant: '  cardsPerPlayer: 3,', apres: '  cardsPerPlayer: 6,' }] },
};

const CHECKRULES = 'checkRules refuse la configuration du jour (le message dit quel réglage changer) ; la construction et le démarrage du serveur s’arrêtent aussi';

/**
 * Gardes attendus : ils échouent exprès quand une valeur par défaut change, et disent quoi mettre à jour. `test` :
 * seulement les tests dont le nom complet correspond (sinon tout le fichier) ; le premier garde qui convient l'emporte.
 */
export const GARDES = [
  { fichier: 'test/config.test.ts', test: /checkRules : aucune erreur/, quoi: CHECKRULES },
  { fichier: 'test/reglages-doc.test.ts', test: /au défaut, la configuration est jouable/, quoi: CHECKRULES },
  { fichier: 'test/garde-fous/defauts.test.ts', quoi: 'photographie des valeurs par défaut : reportez la nouvelle valeur dans test/garde-fous/defauts.json' },
  { fichier: 'test/garde-fous/protocole.test.ts', quoi: 'montez PROTOCOL_VERSION (src/shared/protocol.ts), puis mettez à jour test/fixtures/protocole.json' },
  { fichier: 'test/reglages-doc.test.ts', quoi: 'reportez la nouvelle valeur dans docs/REGLAGES.md (section 4, et listes « Masqués » des sections 3.5 à 3.8)' },
];

const MESSAGE_CHECKRULES = 'Règles impossibles : construction arrêtée.';

// ---------------------------------------------------------------------------------------------
// Options

const args = process.argv.slice(2);
const valeurs = name => args.filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(name.length + 3));
const opt = name => valeurs(name).at(-1);
const has = name => args.includes(`--${name}`);
const OPTIONS_VALEUR = ['essai', 'remplacer', 'dossier', 'json'];
const OPTIONS_SEULES = ['build', 'temoins', 'tout', 'sans-tests', 'details', 'garder', 'aide'];

function usage(message) {
  if (message) console.error(`essai-reglage : ${message}`);
  console.error(`Usage : node scripts/essai-reglage.mjs --essai=<${Object.keys(ESSAIS).join('|')}|tous>[,…|+…] [--remplacer=<fichier>::<avant>::<après>]… [--build] [--temoins] [--tout] [--details] [--garder] [--dossier=<d>] [--json=<f>]`);
  process.exit(2);
}

/** Les essais demandés : liste d'essais, chacun une liste de changements. */
function essaisDemandes() {
  const inconnues = args.filter(a => !OPTIONS_SEULES.some(o => a === `--${o}`) && !OPTIONS_VALEUR.some(o => a.startsWith(`--${o}=`)));
  if (inconnues.length) usage(`option inconnue ${inconnues.join(' ')}`);
  if (has('aide')) usage();
  const libres = valeurs('remplacer').map(v => {
    const morceaux = v.split('::');
    if (morceaux.length !== 3) usage(`--remplacer attend <fichier>::<texte avant>::<texte après> (reçu : ${v})`);
    const [fichier, avant, apres] = morceaux;
    if (!avant) usage(`--remplacer : texte avant vide (${v})`);
    return { fichier, avant, apres };
  });
  const noms = valeurs('essai').flatMap(v => v.split(',')).map(s => s.trim()).filter(Boolean);
  const liste = noms.flatMap(n => (n === 'tous' ? Object.keys(ESSAIS) : [n]));
  if (!liste.length && !libres.length) usage('rien à essayer : --essai ou --remplacer.');
  if (!liste.length) return [{ nom: 'remplacements', titre: libres.map(c => `${c.fichier} : ${c.avant.trim()} → ${c.apres.trim()}`).join(' ; '), changements: libres }];
  return liste.map(nom => {
    const parts = nom.split('+');
    for (const p of parts) if (!ESSAIS[p]) usage(`essai inconnu « ${p} » (essais : ${Object.keys(ESSAIS).join(', ')}, tous)`);
    const titre = [...parts.map(p => ESSAIS[p].titre), ...libres.map(c => `${c.fichier} : ${c.avant.trim()} → ${c.apres.trim()}`)].join(' ; ');
    return { nom, titre, changements: [...parts.flatMap(p => ESSAIS[p].changements), ...libres] };
  });
}

// ---------------------------------------------------------------------------------------------
// Copie et remplacements

/** Copie les fichiers suivis par git (et les nouveaux non ignorés) ; node_modules est lié, pas copié. */
function copierDepot(parent) {
  const dossier = mkdtempSync(path.join(parent, 'essai-reglage-'));
  const fichiers = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: DEPOT, encoding: 'utf8', maxBuffer: 64 << 20 })
    .split('\0')
    .filter(Boolean);
  const dossiers = new Set();
  for (const f of fichiers) {
    const src = path.join(DEPOT, f);
    if (!existsSync(src)) continue; // supprimé de la copie de travail
    const dst = path.join(dossier, f);
    const d = path.dirname(dst);
    if (!dossiers.has(d)) {
      mkdirSync(d, { recursive: true });
      dossiers.add(d);
    }
    copyFileSync(src, dst);
  }
  symlinkSync(realpathSync(path.join(DEPOT, 'node_modules')), path.join(dossier, 'node_modules'), 'dir');
  return dossier;
}

/** Nombre d'occurrences de `aiguille` dans `texte`. */
function occurrences(texte, aiguille) {
  let n = 0;
  for (let i = texte.indexOf(aiguille); i >= 0; i = texte.indexOf(aiguille, i + aiguille.length)) n++;
  return n;
}

/**
 * Applique un changement à un texte : remplace l'unique occurrence de `avant` ou, avec `dans` et `fin`, l'unique
 * occurrence du bloc qui va du repère `dans` (unique) au premier `fin` qui le suit. Lève ErreurUsage si un texte
 * manque ou n'est pas unique. Rend { texte, ligne }.
 */
export function remplacer(texte, c) {
  let debut = 0;
  if (c.dans) {
    const n = occurrences(texte, c.dans);
    if (n !== 1) throw new ErreurUsage(`${c.fichier} : le repère « ${c.dans} » apparaît ${n} fois (1 attendue).`);
    debut = texte.indexOf(c.dans);
    const finBloc = c.fin ? texte.indexOf(c.fin, debut) : texte.length;
    if (finBloc < 0) throw new ErreurUsage(`${c.fichier} : la fin « ${c.fin} » du bloc « ${c.dans} » manque.`);
    const n2 = occurrences(texte.slice(debut, finBloc), c.avant);
    if (n2 !== 1) {
      throw new ErreurUsage(
        `${c.fichier} : « ${c.avant} » apparaît ${n2} fois dans le bloc « ${c.dans} » (1 attendue)${n2 ? '' : ' : la valeur par défaut a-t-elle déjà changé ?'}`,
      );
    }
  } else {
    const n = occurrences(texte, c.avant);
    if (n !== 1) throw new ErreurUsage(`${c.fichier} : « ${c.avant} » apparaît ${n} fois (exactement 1 attendue ; ajoutez du contexte).`);
  }
  const i = texte.indexOf(c.avant, debut);
  return { texte: texte.slice(0, i) + c.apres + texte.slice(i + c.avant.length), ligne: texte.slice(0, i).split('\n').length };
}

/** Applique les changements dans la copie ; lève ErreurUsage si un texte manque ou n'est pas unique. */
function appliquer(dossier, changements) {
  const diffs = [];
  for (const c of changements) {
    const f = path.join(dossier, c.fichier);
    if (!existsSync(f)) throw new ErreurUsage(`${c.fichier} : fichier introuvable.`);
    const { texte, ligne } = remplacer(readFileSync(f, 'utf8'), c);
    writeFileSync(f, texte);
    diffs.push(`${c.fichier}:${ligne} : ${c.avant.trim()} → ${c.apres.trim()}`);
  }
  return diffs;
}

export class ErreurUsage extends Error {}

// ---------------------------------------------------------------------------------------------
// Commandes

/** Lance une commande dans la copie ; sortie complète dans un journal. Rend { code, sortie }. */
function lancer(dossier, nom, cmd, cmdArgs) {
  const journal = path.join(dossier, `.essai-${nom}.log`);
  return new Promise(resolve => {
    const enfant = spawn(cmd, cmdArgs, { cwd: dossier, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    enfantEnCours = enfant;
    let sortie = '';
    enfant.stdout.on('data', d => (sortie += d));
    enfant.stderr.on('data', d => (sortie += d));
    enfant.on('close', code => {
      enfantEnCours = null;
      writeFileSync(journal, sortie);
      resolve({ code: code ?? 1, sortie, journal });
    });
  });
}

const bin = (dossier, nom) => path.join(dossier, 'node_modules/.bin', nom);

/** Rapport JSON de Vitest → échecs { fichier, test, message } et totaux. */
function lireRapport(dossier, fichierJson) {
  if (!existsSync(fichierJson)) return null;
  const r = JSON.parse(readFileSync(fichierJson, 'utf8'));
  const echecs = [];
  const sautes = [];
  for (const f of r.testResults ?? []) {
    const fichier = path.relative(dossier, f.name).split(path.sep).join('/');
    const enEchec = (f.assertionResults ?? []).filter(a => a.status === 'failed');
    // Aucun test n'est sauté au défaut : un test sauté vient d'un crochet (beforeAll…) en échec.
    for (const a of (f.assertionResults ?? []).filter(x => ['skipped', 'pending', 'todo', 'disabled'].includes(x.status))) {
      sautes.push({ fichier, test: a.fullName, message: 'sauté : un crochet (beforeAll, beforeEach…) a échoué' });
    }
    for (const a of enEchec) echecs.push({ fichier, test: a.fullName, message: (a.failureMessages ?? []).join('\n') });
    // Fichier qui n'a pas pu se charger (erreur à l'import) : aucun test, mais un message.
    if (f.status === 'failed' && !enEchec.length) echecs.push({ fichier, test: '(fichier entier : erreur au chargement)', message: f.message ?? '' });
  }
  return { total: r.numTotalTests, echoues: r.numFailedTests, sautes, echecs };
}

const gardeDe = e => GARDES.find(g => g.fichier === e.fichier && (!g.test || g.test.test(e.test)));

// ---------------------------------------------------------------------------------------------
// Un essai

async function essayer(essai, parent) {
  const res = { nom: essai.nom, titre: essai.titre, changements: [], tsc: null, tests: null, build: null, temoins: null, autres: 0, gardes: 0 };
  console.log(`\n=== Essai « ${essai.nom} » : ${essai.titre}`);
  const dossier = copierDepot(parent);
  dossierEnCours = dossier;
  try {
    res.changements = appliquer(dossier, essai.changements);
    for (const d of res.changements) console.log(`  changé : ${d}`);

    if (!has('sans-tests')) await tscEtTests(dossier, res);

    if (has('build')) {
      process.stdout.write('  npm run build… ');
      const b = await lancer(dossier, 'build', 'npm', ['run', 'build']);
      const refus = b.sortie.includes(MESSAGE_CHECKRULES);
      res.build = { code: b.code, checkRules: refus };
      if (b.code === 0) console.log('réussie');
      else if (refus) {
        res.gardes++;
        console.log('arrêtée par checkRules (garde attendu) :');
        const i = b.sortie.indexOf(MESSAGE_CHECKRULES);
        console.log(indenter(b.sortie.slice(i).split('\n').filter(l => l.startsWith('- ') || l.includes(MESSAGE_CHECKRULES)).join('\n'), '    '));
      } else {
        res.autres++;
        console.log(`ÉCHEC (code ${b.code}) :\n${indenter(b.sortie.trim().split('\n').slice(-20).join('\n'), '    ')}`);
      }
    }

    if (has('temoins')) {
      process.stdout.write('  npm run temoins… ');
      const rapportTemoins = path.join(dossier, '.essai-temoins.json');
      // Rapporteur par défaut en plus du JSON : le générateur écrit la liste des fichiers en écart dans le journal.
      const t = await lancer(dossier, 'temoins', bin(dossier, 'vitest'), [
        'run', '-c', 'test/fixtures/v1/vitest.config.ts', '--reporter=default', '--reporter=json', `--outputFile.json=${rapportTemoins}`,
      ]);
      const r = lireRapport(dossier, rapportTemoins);
      res.temoins = r ? { code: t.code, total: r.total, echoues: r.echoues, echecs: r.echecs.map(e => ({ test: e.test })) } : { code: t.code, erreur: 'pas de rapport' };
      if (!r) console.log(`aucun rapport (code ${t.code})`);
      else {
        const fichiers = fichiersEcartes(t.sortie, r.echecs.map(e => e.message));
        // Sans liste de fichiers, le générateur s'est arrêté avant la comparaison (partie témoin injouable…) : sa cause.
        const arret = fichiers.length ? null : r.echecs.map(e => premiereLigne(e.message)).join(' ; ');
        res.temoins.fichiers = fichiers;
        res.temoins.arret = arret;
        const quoi = fichiers.length ? `${fichiers.length} fichier(s) en écart : ${fichiers.join(' ; ')}` : `générateur arrêté : ${arret}`;
        console.log(r.echoues ? `écarts aux témoins v1 (photographies d'avant la passe, hors code de sortie) : ${quoi}` : 'aucun écart');
        if (has('details')) for (const e of r.echecs) console.log(indenter(e.message, '    '));
      }
    }
  } finally {
    dossierEnCours = null;
    if (has('garder')) console.log(`  copie gardée : ${dossier}`);
    else rmSync(dossier, { recursive: true, force: true });
  }
  return res;
}

/**
 * Fichiers témoins en écart, d'après le journal de `npm run temoins` (« Témoins v1, écarts (n) : », une ligne par
 * fichier) ou, à défaut, d'après le message de l'assertion (« tirages.json : 1500 chemin(s) différent(s) »).
 */
function fichiersEcartes(sortie, messages) {
  const lignes = sortie.split('\n');
  const i = lignes.findIndex(l => l.startsWith('Témoins v1, écarts ('));
  const out = [];
  if (i >= 0) {
    for (const l of lignes.slice(i + 1)) {
      if (!l.startsWith('  ')) break;
      if (/^  \S/.test(l)) out.push(l.trim());
    }
    return out;
  }
  for (const m of messages.join('\n').matchAll(/([\w./-]+\.(?:json|pgn|txt)) : ([^\n'"\\]*?(?:chemin\(s\) différent\(s\)|absent du dépôt|plus produit|différent[^\n'"\\]*))/g)) {
    const e = `${m[1]} : ${m[2]}`;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** tsc puis Vitest dans la copie ; échecs rangés dans `res` (gardes attendus, autres). */
async function tscEtTests(dossier, res) {
  process.stdout.write('  tsc… ');
  const tsc = await lancer(dossier, 'tsc', bin(dossier, 'tsc'), ['--noEmit', '-p', '.']);
  const erreursTsc = (tsc.sortie.match(/error TS\d+/g) ?? []).length;
  res.tsc = { code: tsc.code, erreurs: erreursTsc };
  console.log(tsc.code === 0 ? 'sans erreur' : `${erreursTsc} erreur(s)`);
  if (tsc.code !== 0) {
    res.autres++;
    console.log(indenter(tsc.sortie.trim().split('\n').slice(0, 20).join('\n'), '    '));
  }

  const projets = has('tout') ? [] : ['--project', 'rapide'];
  process.stdout.write(`  vitest${has('tout') ? '' : ' (projet rapide)'}… `);
  const rapportTests = path.join(dossier, '.essai-vitest.json');
  const vt = await lancer(dossier, 'vitest', bin(dossier, 'vitest'), ['run', ...projets, '--reporter=json', `--outputFile=${rapportTests}`]);
  const tests = lireRapport(dossier, rapportTests);
  if (!tests) {
    res.tests = { code: vt.code, erreur: 'pas de rapport' };
    res.autres++;
    console.log(`aucun rapport (code ${vt.code}) :\n${indenter(vt.sortie.trim().split('\n').slice(-20).join('\n'), '    ')}`);
  } else {
    const gardes = tests.echecs.filter(gardeDe);
    const autres = [...tests.echecs.filter(e => !gardeDe(e)), ...tests.sautes];
    res.tests = {
      total: tests.total, echoues: tests.echoues, sautes: tests.sautes.length,
      gardes: gardes.map(e => ({ fichier: e.fichier, test: e.test })), autres: autres.map(e => ({ fichier: e.fichier, test: e.test })),
    };
    res.gardes += gardes.length;
    res.autres += autres.length;
    console.log(`${tests.total} tests, ${tests.echoues} en échec (gardes attendus : ${gardes.length} ; autres : ${autres.length})${tests.sautes.length ? `, ${tests.sautes.length} sautés` : ''}`);
    afficherGardes(gardes);
    afficherAutres(autres, '  AUTRES ÉCHECS (à relire) :');
  }
}

function indenter(texte, pref) {
  return texte.split('\n').map(l => pref + l).join('\n');
}

function premiereLigne(m) {
  const l = m.split('\n').find(x => x.trim()) ?? '';
  return l.length > 220 ? `${l.slice(0, 217)}…` : l;
}

function parFichier(echecs) {
  const m = new Map();
  for (const e of echecs) m.set(e.fichier, [...(m.get(e.fichier) ?? []), e]);
  return m;
}

function afficherGardes(gardes) {
  if (!gardes.length) return;
  console.log('  GARDES ATTENDUS (échouent exprès) :');
  for (const [fichier, liste] of parFichier(gardes)) {
    console.log(`    ${fichier} (${liste.length}) → ${gardeDe(liste[0]).quoi}`);
    for (const e of liste) console.log(`      - ${e.test}`);
  }
}

function afficherAutres(autres, titre) {
  if (!autres.length) return;
  console.log(titre);
  for (const [fichier, liste] of parFichier(autres)) {
    console.log(`    ${fichier} (${liste.length})`);
    for (const e of liste) {
      console.log(`      ✗ ${e.test}`);
      if (e.message) console.log(indenter(has('details') ? e.message : premiereLigne(e.message), '          '));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Programme

let dossierEnCours = null;
let enfantEnCours = null;

async function main() {
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      enfantEnCours?.kill('SIGTERM');
      if (dossierEnCours && !has('garder')) rmSync(dossierEnCours, { recursive: true, force: true });
      process.exit(130);
    });
  }

  const essais = essaisDemandes();
  const parent = path.resolve(opt('dossier') ?? os.tmpdir());
  if (!existsSync(parent)) usage(`--dossier : ${parent} n'existe pas.`);
  if (!existsSync(path.join(DEPOT, 'node_modules'))) usage('node_modules absent : lancez npm install.');

  const resultats = [];
  try {
    for (const e of essais) resultats.push(await essayer(e, parent));
  } catch (e) {
    if (e instanceof ErreurUsage) usage(e.message);
    throw e;
  }

  console.log('\n=== Résumé');
  console.log('| Essai | tsc | Tests | Gardes attendus | Autres échecs | Construction | Témoins v1 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of resultats) {
    const t = !r.tsc ? 'non lancés' : r.tests && !r.tests.erreur ? `${r.tests.total} (${r.tests.echoues} en échec)` : 'sans rapport';
    const g = r.tests?.gardes ? [...new Set(r.tests.gardes.map(x => x.fichier.replace(/^test\/(garde-fous\/)?/, '').replace(/\.test\.ts$/, '')))].join(', ') || '—' : '—';
    const b = !r.build ? 'non lancée' : r.build.code === 0 ? 'réussie' : r.build.checkRules ? 'arrêtée (checkRules)' : 'ÉCHEC';
    const tm = !r.temoins ? 'non lancés' : r.temoins.erreur ? 'sans rapport' : !r.temoins.echoues ? 'aucun écart'
      : r.temoins.fichiers.length ? `${r.temoins.fichiers.length} fichier(s) en écart` : 'générateur arrêté';
    const tsc = !r.tsc ? 'non lancé' : r.tsc.code === 0 ? 'ok' : `${r.tsc.erreurs} erreur(s)`;
    console.log(`| ${r.nom} | ${tsc} | ${t} | ${r.tests?.gardes?.length ?? 0} (${g}) | ${r.autres} | ${b} | ${tm} |`);
  }
  if (opt('json')) writeFileSync(path.resolve(opt('json')), `${JSON.stringify(resultats, null, 2)}\n`);
  const ok = resultats.every(r => r.autres === 0);
  console.log(ok ? '\nAucun échec hors des gardes attendus.' : '\nDes échecs hors des gardes attendus : à relire (liste « AUTRES ÉCHECS » plus haut).');
  process.exit(ok ? 0 : 1);
}

// Lancé directement (pas importé par un test, qui ne lit que ESSAIS, GARDES et remplacer).
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
