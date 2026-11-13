#!/usr/bin/env node
// Banc de l'IA : temps de décision sur des positions fixes (médianes de plusieurs passages) et décisions rendues, pour
// comparer deux versions du code (critère de la passe « polymorphe » : médianes à ±3 % de la référence, décisions
// identiques au réglage par défaut).
//
//   node scripts/banc-ia.mjs [--racine=<dépôt>] [--passages=7] [--sortie=<fichier.json>] [--comparer=<ref.json>]
//                            [--scenarios=coup3,coup5,carte] [--rapide]
//
// - --racine : dépôt dont on mesure le code (défaut : ce dépôt). Pour la référence, une copie de travail au commit
//   d'avant (git worktree add --detach <dossier> 7148547, puis npm ci ou un lien vers node_modules) ;
// - --passages : passages mesurés par scénario et par position (défaut 7 ; un passage de chauffe en plus, non compté) ;
// - --sortie : résultats en JSON (médianes, min, max, décisions) ;
// - --comparer : résultats d'une autre version (JSON de --sortie) ; affiche l'écart des médianes (en %) et signale
//   toute décision différente ; code de sortie 1 si une décision diffère ou si une médiane sort de ±3 % ;
// - --rapide : 1 passage, sans chauffe, scénarios coup3 et carte seulement (vérifier que le banc tourne : ce n'est
//   pas une mesure).
//
// Scénarios (niveau 3, Archimage : aucun bruit, donc décisions reproductibles) :
// - coup3, coup5 : chooseBotMove avec la profondeur réglée à 3 ou 5 et un budget de temps de 60 s, pour que la
//   recherche aille au bout : on mesure une recherche complète, pas un budget ;
// - carte : chooseBotCard avec un budget de 60 s : chaque carte de la main et ses meilleures cibles sont évaluées.
// Seules des fonctions communes à toutes les versions sont appelées (createGameFromFen(fen, mains, pendule, catalogue),
// chooseBotMove(état, niveau), chooseBotCard(état, niveau), BOT_PROFILES).
//
// Le code est assemblé par esbuild (comme en production : un seul module, sans transformation au vol). Mesurer sur
// une machine au repos : aucune autre mesure, construction ou suite de tests en même temps (la charge moyenne du
// système est notée dans les résultats). Durée : quelques minutes avec 7 passages.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (nom, defaut) => {
  const a = args.find(x => x.startsWith(`--${nom}=`));
  return a ? a.slice(nom.length + 3) : defaut;
};
const RAPIDE = args.includes('--rapide');
const RACINE = path.resolve(opt('racine', path.join(ICI, '..')));
const PASSAGES = RAPIDE ? 1 : Math.max(1, Number(opt('passages', '7')));
const CHAUFFE = RAPIDE ? 0 : 1;
const SCENARIOS = opt('scenarios', RAPIDE ? 'coup3,carte' : 'coup3,coup5,carte').split(',').filter(Boolean);
const TOLERANCE = 0.03;

/** Positions fixes : ouverture, milieu de partie, finale, et mains de Pouvoirs (l'IA évalue ses cartes). */
const POSITIONS = [
  { nom: 'ouverture', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', w: ['ice_wall', 'truce', 'rift'] },
  { nom: 'italienne', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5', b: ['blood_moon', 'tide', 'ice_wall'] },
  { nom: 'milieu', fen: 'r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10', w: ['truce', 'rift', 'ice_wall'] },
  { nom: 'tactique', fen: '6k1/2q2ppp/8/1B6/8/7P/5PP1/3R2K1 w - - 0 30', w: ['blood_moon', 'ice_age', 'blast'] },
  { nom: 'finale', fen: '8/5pk1/6p1/8/3R4/6P1/5PKP/2r5 w - - 0 40', w: ['ice_wall', 'tide', 'truce'] },
  { nom: 'mat-ou-mur', fen: 'k6r/8/8/8/6P1/6PK/6P1/8 w - - 0 40', w: ['hourglass', 'truce', 'ice_wall'] },
];

/** Assemble les modules du moteur et de l'IA de `racine` en un seul fichier ESM, et l'importe. */
async function charger(racine) {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'banc-ia-'));
  const entree = path.join(dossier, 'entree.ts');
  const sortie = path.join(dossier, 'ia.mjs');
  writeFileSync(
    entree,
    `export * as bot from ${JSON.stringify(path.join(racine, 'src/shared/bot.ts'))};\n` +
      `export * as game from ${JSON.stringify(path.join(racine, 'src/shared/game.ts'))};\n`,
  );
  await build({ entryPoints: [entree], bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: sortie, logLevel: 'error' });
  const m = await import(pathToFileURL(sortie).href);
  rmSync(dossier, { recursive: true, force: true });
  return m;
}

const caseNom = q => 'abcdefgh'[q & 7] + ((q >> 3) + 1);
const uci = m => (m ? caseNom(m.from) + caseNom(m.to) + (m.promo ?? '') : '—');
const mediane = xs => {
  const t = [...xs].sort((a, b) => a - b);
  return t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2;
};

async function mesurer() {
  const { bot, game } = await charger(RACINE);
  const profil = bot.BOT_PROFILES[3];
  const origine = { ...profil };
  const etat = p => {
    const s = game.createGameFromFen(p.fen, { w: p.w ?? [], b: p.b ?? [] }, true, 'climats');
    s.ply = 30; // milieu de partie : l'IA ne garde pas ses cartes par principe
    return s;
  };
  const scenarios = {
    coup3: s => {
      Object.assign(profil, { depth: 3, thinkMs: 60_000 });
      return uci(bot.chooseBotMove(s, 3));
    },
    coup5: s => {
      Object.assign(profil, { depth: 5, thinkMs: 60_000 });
      return uci(bot.chooseBotMove(s, 3));
    },
    carte: s => {
      Object.assign(profil, { thinkMs: 60_000 });
      const c = bot.chooseBotCard(s, 3);
      return c ? [s.hands[s.pos.turn][c.index].card, ...c.targets.map(caseNom)].join(' ') : '—';
    },
  };
  const resultats = [];
  try {
    for (const nom of SCENARIOS) {
      const f = scenarios[nom];
      if (!f) throw new Error(`Scénario inconnu : ${nom} (scénarios : ${Object.keys(scenarios).join(', ')})`);
      for (const p of POSITIONS) {
        const temps = [];
        let decision = null;
        for (let k = 0; k < CHAUFFE + PASSAGES; k++) {
          const s = etat(p);
          const t0 = process.hrtime.bigint();
          const d = f(s);
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          Object.assign(profil, origine);
          if (decision !== null && d !== decision) throw new Error(`${nom}/${p.nom} : décision instable (${decision} puis ${d}).`);
          decision = d;
          if (k >= CHAUFFE) temps.push(ms);
        }
        const r = { scenario: nom, position: p.nom, decision, mediane: mediane(temps), min: Math.min(...temps), max: Math.max(...temps), passages: temps.length };
        resultats.push(r);
        console.log(`${nom.padEnd(6)} ${p.nom.padEnd(11)} ${r.decision.padEnd(18)} médiane ${r.mediane.toFixed(1).padStart(8)} ms  (min ${r.min.toFixed(1)}, max ${r.max.toFixed(1)})`);
      }
    }
  } finally {
    Object.assign(profil, origine);
  }
  return { racine: RACINE, date: new Date().toISOString(), charge: os.loadavg(), passages: PASSAGES, rapide: RAPIDE, resultats };
}

const res = await mesurer();
const fichier = opt('sortie');
if (fichier) writeFileSync(fichier, `${JSON.stringify(res, null, 2)}\n`);
console.log(`Charge moyenne du système (1, 5, 15 min) : ${res.charge.map(x => x.toFixed(2)).join(', ')}${RAPIDE ? ' — mode rapide : pas une mesure.' : ''}`);

const ref = opt('comparer');
if (ref) {
  const autre = JSON.parse(readFileSync(ref, 'utf8'));
  let ecarts = 0;
  console.log(`\nComparaison à ${ref} (${autre.racine}) :`);
  for (const r of res.resultats) {
    const a = autre.resultats.find(x => x.scenario === r.scenario && x.position === r.position);
    if (!a) {
      console.log(`  ${r.scenario}/${r.position} : absent de la référence`);
      continue;
    }
    const ratio = r.mediane / a.mediane - 1;
    const memeDecision = a.decision === r.decision;
    const horsTolerance = !RAPIDE && !autre.rapide && Math.abs(ratio) > TOLERANCE;
    if (!memeDecision || horsTolerance) ecarts++;
    console.log(
      `  ${r.scenario.padEnd(6)} ${r.position.padEnd(11)} ${(ratio >= 0 ? '+' : '') + (ratio * 100).toFixed(1)} %` +
        `${horsTolerance ? ' (hors de ±3 %)' : ''}${memeDecision ? '' : `  DÉCISION DIFFÉRENTE : ${a.decision} → ${r.decision}`}`,
    );
  }
  if (ecarts) process.exitCode = 1;
}
