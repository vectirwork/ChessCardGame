#!/usr/bin/env node
// Banc de mesure de performance (décision D6 du plan V2) : chargement et repos des pages, sur la version de production.
// Ne modifie rien : il ouvre les pages dans Chromium (Playwright) et lit les compteurs par CDP et par une trace.
//
// Usage :
//   node test/perf/mesure.mjs ref=http://localhost:3171 actuelle=http://localhost:3172 [options]
//   node test/perf/mesure.mjs http://localhost:3172 --scenarios=accueil --passages=1
//
// Chaque site se lance à part, en production : npm run build, puis
//   NODE_ENV=production PORT=31xx DATA_DIR=<dossier> SECRET_KEY=<32 caractères ou plus> node dist/server/index.js
// Avec `vite build --sourcemap`, le diagnostic attribue CPU et couverture à chaque module source (le code servi est
// identique, seul le commentaire final change).
//
// Options :
//   --scenarios=a,b    accueil, accueil-mobile, accueil-foret, jouer, partie, apprendre (défaut : tous sauf
//                      accueil-foret ; « tous » pour tous)
//   --passages=3       passages de mesure par scénario et par site ; on garde la médiane. Les sites alternent.
//   --chargement=10    fenêtre de chargement, en secondes depuis le début de la navigation
//   --repos=10         fenêtre de repos (page immobile, aucun événement de souris envoyé), en secondes
//   --diagnostic       un passage de plus par scénario et par site : profil CPU (chargement et repos), couverture
//                      JS et CSS par fichier et par module, polices, images, effets CSS, animations en cours, boucles
//                      requestAnimationFrame par module, trace de 3 s des invalidations (style, mise en page, peinture)
//   --sans-webgl       Chromium lancé avec --disable-webgl : sépare ce qui dépend du WebGL (logiciel en bac à sable)
//   --reseau=4g        réseau mobile simulé (latence 150 ms, 1,6 Mbit/s descendant) ; --cpu=4 : CPU ralenti 4 fois
//   --sortie=<dossier> resultats.json, synthese.md, profils .cpuprofile (défaut : dossier temporaire du système)
//   --relire=<resultats.json>  réimprime la synthèse d'une campagne déjà mesurée (mêmes sites et --scenarios)
//   --visible          navigateur visible (headless par défaut)
//
// Durée : ≈ 35 s par passage (trace comprise), ≈ 45 s par diagnostic. Ne pas mesurer pendant qu'une construction ou
// une autre campagne tourne sur la machine : la charge moyenne du système est notée dans chaque résultat.
//
// Lecture des résultats :
// - « fil principal » : temps CPU des tâches du fil principal du rendu (JavaScript, styles, mise en page, peinture).
//   C'est la mesure qui se transpose le mieux sur un vrai appareil.
// - « GPU (logiciel) » : processus GPU de Chromium. Dans un conteneur sans carte graphique, la composition, la
//   rastérisation et le WebGL y passent par SwiftShader, sur le CPU : ce chiffre surestime beaucoup le coût réel
//   sur une machine équipée, mais il varie avec la quantité de pixels repeints (bon indicateur relatif).
// - « images/s » : images composées par le compositeur du rendu (DrawFrame) ; « voulues » ajoute les images
//   abandonnées (DroppedFrame), c'est-à-dire ce que la page demande de repeindre. Une page au repos devrait être à 0.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
function chargerPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try {
      return require(p);
    } catch {
      // essai suivant
    }
  }
  throw new Error('Playwright introuvable (ni dans node_modules, ni dans /opt/node-tools).');
}
const { chromium, devices } = chargerPlaywright();

// ---------------------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (nom, defaut) => {
  const a = args.find(x => x === `--${nom}` || x.startsWith(`--${nom}=`));
  if (!a) return defaut;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : true;
};
const sites = args
  .filter(a => !a.startsWith('--'))
  .map((a, i) => {
    const m = a.match(/^([\w-]+)=(https?:\/\/.+)$/);
    return m ? { nom: m[1], base: m[2].replace(/\/$/, '') } : { nom: `site${i + 1}`, base: a.replace(/\/$/, '') };
  });
if (!sites.length) {
  console.error('Usage : node test/perf/mesure.mjs [nom=]http://hote:port [...] [--scenarios=…] [--passages=3] [--diagnostic]');
  process.exit(1);
}
const PASSAGES = Number(opt('passages', 3));
const CHARGEMENT = Number(opt('chargement', 10)) * 1000;
const REPOS = Number(opt('repos', 10)) * 1000;
const DIAGNOSTIC = !!opt('diagnostic', false);
const SANS_WEBGL = !!opt('sans-webgl', false);
const RESEAU = opt('reseau', '');
const CPU = Number(opt('cpu', 1));
const SORTIE = String(opt('sortie', path.join(os.tmpdir(), `spellmate-perf-${new Date().toISOString().replace(/[:.]/g, '-')}`)));
mkdirSync(SORTIE, { recursive: true });

const BUREAU = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOBILE = devices['Pixel 7']; // 412 × 839, densité 2,625, tactile

/** Scénarios : chemin (ou préparation qui le renvoie), appareil, action avant le repos. */
const SCENARIOS = {
  accueil: { titre: 'Accueil (bureau 1440 × 900)', chemin: '/', appareil: BUREAU },
  'accueil-mobile': { titre: 'Accueil (mobile Pixel 7)', chemin: '/', appareil: MOBILE },
  'accueil-foret': {
    titre: 'Accueil, lieu II (Forêt de givre, échiquier de démonstration)',
    chemin: '/',
    appareil: BUREAU,
    // Descente jusqu'au deuxième lieu : un StageBoard s'y monte et joue seul (sorts en WebGL)
    async action(page) {
      await page.evaluate(() => {
        const el = document.querySelectorAll('[data-pose]')[1];
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
      });
      await page.waitForTimeout(4000);
    },
  },
  jouer: { titre: 'Jouer (/jouer, bureau)', chemin: '/jouer', appareil: BUREAU },
  partie: { titre: "Partie en cours contre l'IA (/partie/:id, bureau)", preparer: preparerPartie, appareil: BUREAU },
  apprendre: { titre: 'Apprendre (/apprendre, bureau)', chemin: '/apprendre', appareil: BUREAU },
};
const demandes = String(opt('scenarios', 'accueil,accueil-mobile,jouer,partie,apprendre'));
const scenarios = (demandes === 'tous' ? Object.keys(SCENARIOS) : demandes.split(',')).map(s => s.trim()).filter(Boolean);
for (const s of scenarios) if (!SCENARIOS[s]) throw new Error(`Scénario inconnu : ${s} (connus : ${Object.keys(SCENARIOS).join(', ')})`);

const CATEGORIES_TRACE = [
  'toplevel',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'loading',
  'blink.animations',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const mediane = xs => {
  const v = xs.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const ko = n => (n == null ? '–' : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} ko`);
const ms = n => (n == null ? '–' : `${Math.round(n)} ms`);

// ---------------------------------------------------------------------------------------------------------------
// Crochets injectés avant tout script de la page
// ---------------------------------------------------------------------------------------------------------------
function crochets() {
  if (window.__perf) return;
  const P = (window.__perf = { fcp: null, lcp: null, lcpInfo: '', cls: 0, lt: [], gl: [], c2d: 0, raf: { appels: 0, src: {} }, attente: new Map() });
  const desc = el => {
    if (!el || !el.tagName) return el && el.nodeName ? el.nodeName : '';
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const c = typeof el.className === 'string' ? el.className : el.className && el.className.baseVal;
    if (c && c.trim()) s += `.${c.trim().split(/\s+/).slice(0, 3).join('.')}`;
    return s;
  };
  const visible = el => {
    if (!el || !el.isConnected || !el.getBoundingClientRect) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  const obs = (type, fn) => {
    try {
      new PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true });
    } catch {
      // type non pris en charge
    }
  };
  obs('paint', e => {
    if (e.name === 'first-contentful-paint') P.fcp = e.startTime;
  });
  obs('largest-contentful-paint', e => {
    P.lcp = e.startTime;
    P.lcpInfo = `${desc(e.element)} ${e.url ? e.url.split('/').pop() : ''} (${Math.round(e.size)} px²)`.replace(/\s+/g, ' ');
  });
  obs('longtask', e => P.lt.push([Math.round(e.startTime), Math.round(e.duration)]));
  obs('layout-shift', e => {
    if (!e.hadRecentInput) P.cls += e.value;
  });

  // requestAnimationFrame : qui demande des images, et combien sont en attente
  const origine = pile => {
    for (const l of String(pile || '').split('\n').slice(1)) {
      if (l.includes('__perfRaf')) continue;
      const m = l.match(/at (?:(.*?) \()?(\S+?):(\d+):(\d+)\)?\s*$/);
      if (m) return `${m[2].split('/').pop()}:${m[3]}:${m[4]}${m[1] ? ` ${m[1]}` : ''}`;
    }
    return '?';
  };
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const sources = new WeakMap();
  window.requestAnimationFrame = function __perfRaf(cb) {
    let s = typeof cb === 'function' ? sources.get(cb) : '?';
    if (!s) {
      s = origine(new Error().stack);
      if (typeof cb === 'function') sources.set(cb, s);
    }
    P.raf.appels++;
    P.raf.src[s] = (P.raf.src[s] || 0) + 1;
    const id = raf(t => {
      P.attente.delete(id);
      cb(t);
    });
    P.attente.set(id, s);
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    P.attente.delete(id);
    return caf(id);
  };

  // Contextes WebGL et 2D créés
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...reste) {
    const ctx = getContext.call(this, type, ...reste);
    if (ctx && !this.__perfCtx) {
      this.__perfCtx = true;
      if (/webgl/i.test(type)) P.gl.push({ type, t: Math.round(performance.now()), canvas: new WeakRef(this), ctx: new WeakRef(ctx), desc: desc(this) });
      else if (type === '2d') P.c2d++;
    }
    return ctx;
  };

  /** Instantané léger (passages de mesure). `remise` : remet à zéro les compteurs de requestAnimationFrame. */
  P.instantane = remise => {
    let enCours = 0, infinies = 0, infiniesVisibles = 0;
    const anims = document.getAnimations();
    for (const a of anims) {
      if (a.playState !== 'running') continue;
      enCours++;
      const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
      if (t.iterations === Infinity) {
        infinies++;
        if (visible(a.effect.target)) infiniesVisibles++;
      }
    }
    const rafEnAttente = {};
    for (const s of P.attente.values()) rafEnAttente[s] = (rafEnAttente[s] || 0) + 1;
    const out = {
      fcp: P.fcp,
      lcp: P.lcp,
      lcpInfo: P.lcpInfo,
      cls: P.cls,
      lt: P.lt.slice(),
      raf: { appels: P.raf.appels, src: { ...P.raf.src } },
      rafEnAttente,
      gl: P.gl.map(g => {
        const c = g.canvas.deref();
        const x = g.ctx.deref();
        return { type: g.type, t: g.t, desc: g.desc, vivant: !!(c && c.isConnected && x && !x.isContextLost()), affiche: !!(c && c.isConnected && getComputedStyle(c).display !== 'none') };
      }),
      c2d: P.c2d,
      animations: { total: anims.length, enCours, infinies, infiniesVisibles },
      noeuds: document.getElementsByTagName('*').length,
      canvas: document.getElementsByTagName('canvas').length,
      echiquiers: document.querySelectorAll('.board').length,
      defilement: Math.round(scrollY),
      hauteur: document.documentElement.scrollHeight,
    };
    if (remise) {
      P.raf.appels = 0;
      P.raf.src = {};
    }
    return out;
  };

  /** Inventaire complet (diagnostic) : effets CSS coûteux, animations en cours, polices déclarées. */
  P.inventaire = () => {
    const groupes = {};
    const ajouter = (cat, cle, vis, valeur) => {
      const g = (groupes[cat] = groupes[cat] || {});
      const r = (g[cle] = g[cle] || { n: 0, visibles: 0, valeur });
      r.n++;
      if (vis) r.visibles++;
    };
    const tous = document.querySelectorAll('*');
    for (const el of tous) {
      const cs = getComputedStyle(el);
      const bf = cs.backdropFilter, f = cs.filter, wc = cs.willChange, mb = cs.mixBlendMode;
      const a = bf && bf !== 'none', b = f && f !== 'none', c = wc && wc !== 'auto', d = mb && mb !== 'normal';
      if (!(a || b || c || d)) continue;
      const vis = visible(el);
      const k = desc(el);
      if (a) ajouter('backdropFilter', k, vis, bf);
      if (b) ajouter('filter', k, vis, f.slice(0, 90));
      if (c) ajouter('willChange', k, vis, wc);
      if (d) ajouter('mixBlendMode', k, vis, mb);
    }
    const animations = {};
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue;
      const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
      const nom = a.animationName ? `@${a.animationName}` : a.transitionProperty ? `transition ${a.transitionProperty}` : 'waapi';
      const props = [...new Set((a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : []).flatMap(k => Object.keys(k)).filter(k => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))];
      const r = (animations[nom] = animations[nom] || { n: 0, visibles: 0, infinie: t.iterations === Infinity, duree: Math.round(Number(t.duration) || 0), props: props.join(','), exemple: desc(a.effect && a.effect.target) });
      r.n++;
      if (visible(a.effect && a.effect.target)) r.visibles++;
    }
    const polices = [...document.fonts].map(f => ({ famille: f.family.replace(/"/g, ''), poids: f.weight, style: f.style, etat: f.status, plage: f.unicodeRange.slice(0, 24) }));
    return { groupes, animations, polices, noeuds: tous.length };
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Réseau
// ---------------------------------------------------------------------------------------------------------------
function collecteurReseau(cdp) {
  const req = new Map();
  cdp.on('Network.requestWillBeSent', e => {
    if (!req.has(e.requestId)) req.set(e.requestId, { url: e.request.url, type: e.type, debut: e.timestamp, transfere: 0, taille: 0, fin: null, mime: '', statut: 0, encodage: '' });
  });
  cdp.on('Network.responseReceived', e => {
    const r = req.get(e.requestId);
    if (!r) return;
    r.mime = e.response.mimeType;
    r.statut = e.response.status;
    const h = e.response.headers || {};
    r.encodage = h['content-encoding'] || h['Content-Encoding'] || '';
    if (!r.type) r.type = e.type;
  });
  cdp.on('Network.dataReceived', e => {
    const r = req.get(e.requestId);
    if (r) r.taille += e.dataLength;
  });
  cdp.on('Network.loadingFinished', e => {
    const r = req.get(e.requestId);
    if (r) {
      r.transfere = e.encodedDataLength;
      r.fin = e.timestamp;
    }
  });
  cdp.on('Network.loadingFailed', e => {
    const r = req.get(e.requestId);
    if (r) {
      r.echec = e.errorText;
      r.fin = e.timestamp;
    }
  });
  cdp.on('Network.webSocketCreated', e => req.set(`ws:${e.requestId}`, { url: e.url, type: 'WebSocket', debut: null, transfere: 0, taille: 0 }));
  return req;
}

function categorie(r) {
  const u = r.url, m = r.mime || '';
  if (u.startsWith('data:') || u.startsWith('blob:')) return 'inline';
  if (r.type === 'WebSocket' || u.includes('/socket.io/')) return 'socket';
  if (r.type === 'Document') return 'html';
  if (r.type === 'Script' || /javascript/.test(m) || /\.m?js(\?|$)/.test(u)) return 'js';
  if (r.type === 'Stylesheet' || m === 'text/css') return 'css';
  if (r.type === 'Font' || /^font\//.test(m) || /\.woff2?(\?|$)/.test(u)) return 'polices';
  if (r.type === 'Image' || /^image\//.test(m)) return 'images';
  if (r.type === 'Fetch' || r.type === 'XHR' || u.includes('/api/')) return 'api';
  return 'autres';
}

/** Résumé des requêtes lancées entre `de` et `a` (secondes, horloge CDP). */
function resumeReseau(req, de, a) {
  const parCat = {};
  const liste = [];
  let derniere = 0;
  for (const r of req.values()) {
    if (r.debut == null || r.debut < de || r.debut > a) continue;
    const c = categorie(r);
    const p = (parCat[c] = parCat[c] || { n: 0, transfere: 0, taille: 0 });
    p.n++;
    p.transfere += r.transfere;
    p.taille += r.taille;
    if (c !== 'socket' && r.fin) derniere = Math.max(derniere, r.fin - de);
    liste.push({ url: r.url.startsWith('data:') ? `${r.url.slice(0, 40)}…` : r.url.replace(/^https?:\/\/[^/]+/, ''), cat: c, transfere: r.transfere, taille: r.taille, debut: Math.round((r.debut - de) * 1000), statut: r.statut, encodage: r.encodage });
  }
  const total = { n: 0, transfere: 0, taille: 0 };
  for (const [c, p] of Object.entries(parCat)) {
    if (c === 'inline') continue;
    total.n += p.n;
    total.transfere += p.transfere;
    total.taille += p.taille;
  }
  return { parCat, total, derniere: Math.round(derniere * 1000), liste: liste.sort((x, y) => y.transfere - x.transfere) };
}

// ---------------------------------------------------------------------------------------------------------------
// Trace : temps CPU par fil, tâches longues, images, animations
// ---------------------------------------------------------------------------------------------------------------
const TACHES = new Set(['ThreadControllerImpl::RunTask', 'RunTask', 'ThreadPool_RunTask', 'TaskGraphRunner::RunTask']);
const NOMS_PRINCIPAL = ['FireAnimationFrame', 'TimerFire', 'FunctionCall', 'EventDispatch', 'EvaluateScript', 'v8.compile', 'ParseHTML', 'ParseAuthorStyleSheet', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'HitTest', 'IntersectionObserverController::computeIntersections', 'MajorGC', 'MinorGC'];

// Motifs d'échec de composition d'une animation (CompositorAnimations::FailureReason, Blink). Vérifiés au banc :
// box-shadow animé → 1<<13 (+1<<5), filter: blur animé → 1<<12, transform d'un élément caché → 1<<17.
const MOTIFS = [
  [1 << 0, 'animations accélérées désactivées'],
  [1 << 1, 'suspendue par DevTools'],
  [1 << 2, 'animation ou effet invalide'],
  [1 << 3, 'paramètres de temps non pris en charge'],
  [1 << 4, 'mode composite autre que replace'],
  [1 << 5, 'cible sans état de composition valide'],
  [1 << 6, 'animations incompatibles sur la cible'],
  [1 << 7, 'cible avec offset CSS'],
  [1 << 9, 'propriétés non CSS'],
  [1 << 10, 'transform non accélérable sur la cible'],
  [1 << 11, 'transform dépendant de la taille de la boîte'],
  [1 << 12, 'filtre qui peut déplacer des pixels'],
  [1 << 13, 'propriété CSS non composable'],
  [1 << 15, 'images clés de types mélangés'],
  [1 << 16, 'source de chronologie non composée'],
  [1 << 17, 'sans effet visible (élément caché)'],
  [1 << 18, 'propriété !important'],
  [1 << 19, 'cible SVG avec transform indépendant'],
];
const SANS_EFFET = 1 << 17;
const raisonsEchec = m => MOTIFS.filter(([b]) => m & b).map(([, t]) => t).join(' + ') || String(m);

function analyserTrace(buf, base) {
  const brut = JSON.parse(buf.toString('utf8'));
  const ev = Array.isArray(brut) ? brut : brut.traceEvents;
  const fil = new Map();
  const proc = new Map();
  for (const e of ev) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') fil.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.name === 'process_name') proc.set(e.pid, e.args.name);
  }
  const navs = ev.filter(e => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame && String(e.args.data.documentLoaderURL || '').startsWith(base));
  if (!navs.length) return { erreur: 'navigationStart introuvable dans la trace' };
  const nav = navs[navs.length - 1];
  const rpid = nav.pid;
  const mtid = nav.tid;
  const marque = n => ev.find(e => e.name === n && e.pid === rpid)?.ts ?? null;
  const t0 = nav.ts;
  const chargeFin = marque('perf:charge-fin') ?? t0 + CHARGEMENT * 1000;
  const reposDebut = marque('perf:repos-debut');
  const reposFin = marque('perf:repos-fin');
  const gpuPids = new Set([...proc].filter(([, n]) => /GPU/i.test(n)).map(([p]) => p));
  const navPid = [...proc].find(([, n]) => n === 'Browser')?.[0];

  // Tâches de premier niveau, par fil
  const parFil = new Map();
  for (const e of ev) {
    if (e.ph !== 'X' || !TACHES.has(e.name)) continue;
    const k = `${e.pid}:${e.tid}`;
    if (!parFil.has(k)) parFil.set(k, []);
    parFil.get(k).push(e);
  }
  for (const l of parFil.values()) l.sort((a, b) => a.ts - b.ts);
  const occupation = (liste, a, b) => {
    let fin = -Infinity, mur = 0, cpu = 0;
    for (const e of liste) {
      const s = e.ts, f = e.ts + (e.dur || 0);
      if (s < fin) continue; // tâche imbriquée
      fin = f;
      const s2 = Math.max(s, a), f2 = Math.min(f, b);
      if (f2 <= s2) continue;
      const k = (f2 - s2) / Math.max(1, f - s);
      mur += f2 - s2;
      cpu += (e.tdur ?? e.dur ?? 0) * k;
    }
    return { mur: mur / 1000, cpu: cpu / 1000 };
  };
  const classe = (pid, tid) => {
    const n = fil.get(`${pid}:${tid}`) || '';
    if (pid === rpid) {
      if (tid === mtid) return 'principal';
      if (n === 'Compositor') return 'compositeur';
      if (/DedicatedWorker|Worker thread/i.test(n) && !/ThreadPool/.test(n)) return 'workers';
      return 'rendu_autres';
    }
    if (gpuPids.has(pid)) return 'gpu';
    if (pid === navPid) return 'navigateur';
    return 'autres';
  };
  // Animations (événements asynchrones « Animation ») sur toute la trace : nom, nœud, motif d'échec de composition
  const animations = new Map();
  for (const e of ev) {
    if (e.name !== 'Animation' || e.pid !== rpid) continue;
    const id = e.id2?.local ?? e.id;
    const r = animations.get(id) || { nom: '', noeud: '', echec: 0, debut: e.ts, fin: null };
    const d = e.args?.data || {};
    if (d.displayName) r.nom = d.displayName;
    if (d.nodeName) r.noeud = d.nodeName;
    if (d.compositeFailed) r.echec |= d.compositeFailed;
    if (e.ph === 'e') r.fin = e.ts;
    animations.set(id, r);
  }
  const fenetre = (a, b) => {
    if (a == null || b == null || b <= a) return null;
    const s = (b - a) / 1e6;
    const fils = {};
    for (const [k, liste] of parFil) {
      const [pid, tid] = k.split(':').map(Number);
      const c = classe(pid, tid);
      const o = occupation(liste, a, b);
      fils[c] = (fils[c] || 0) + o.cpu;
    }
    // Tâches longues du fil principal (durée murale)
    const principal = parFil.get(`${rpid}:${mtid}`) || [];
    const longues = [];
    let fin = -Infinity;
    for (const e of principal) {
      if (e.ts < fin) continue;
      fin = e.ts + (e.dur || 0);
      if (e.ts < a || e.ts > b) continue;
      if ((e.dur || 0) > 50000) longues.push(Math.round(e.dur / 1000));
    }
    // Compteurs d'événements du rendu ; styles et mises en page forcés dans un rappel requestAnimationFrame
    const n = {};
    const duree = {};
    const rafs = [];
    for (const e of ev) if (e.pid === rpid && e.tid === mtid && e.ph === 'X' && e.name === 'FireAnimationFrame' && e.ts >= a && e.ts <= b) rafs.push(e);
    let iRaf = 0;
    const dansRaf = e => {
      while (iRaf < rafs.length && rafs[iRaf].ts + rafs[iRaf].dur < e.ts) iRaf++;
      return iRaf < rafs.length && e.ts >= rafs[iRaf].ts;
    };
    const forces = { UpdateLayoutTree: 0, Layout: 0 };
    const principalTrie = ev.filter(e => e.pid === rpid && e.tid === mtid && e.ph === 'X' && (e.name === 'UpdateLayoutTree' || e.name === 'Layout') && e.ts >= a && e.ts <= b).sort((x, y) => x.ts - y.ts);
    for (const e of principalTrie) if (dansRaf(e)) forces[e.name]++;
    for (const e of ev) {
      if (e.pid !== rpid || e.ts < a || e.ts > b) continue;
      if (e.name === 'DrawFrame' || e.name === 'DroppedFrame' || e.name === 'BeginMainThreadFrame' || e.name === 'Paint' || e.name === 'Layout' || e.name === 'UpdateLayoutTree' || e.name === 'FireAnimationFrame' || e.name === 'TimerFire' || e.name === 'Commit') n[e.name] = (n[e.name] || 0) + 1;
      if (e.tid === mtid && e.ph === 'X' && NOMS_PRINCIPAL.includes(e.name)) duree[e.name] = (duree[e.name] || 0) + (e.dur || 0) / 1000;
    }
    // Animations CSS vivantes dans la fenêtre, et celles que le compositeur refuse (elles tournent sur le fil principal)
    const nonComposees = {};
    let vivantes = 0;
    for (const r of animations.values()) {
      if (r.debut > b || (r.fin != null && r.fin < a)) continue;
      vivantes++;
      if (!r.echec || r.echec === SANS_EFFET) continue;
      const k = `${r.nom || '?'} · ${r.noeud} · ${raisonsEchec(r.echec)}`;
      nonComposees[k] = (nonComposees[k] || 0) + 1;
    }
    const parS = x => (x || 0) / s;
    return {
      duree: s,
      cpu: Object.fromEntries(Object.entries(fils).map(([k, v]) => [k, Math.round(v)])),
      cpuParS: Object.fromEntries(Object.entries(fils).map(([k, v]) => [k, Math.round(parS(v))])),
      longues,
      sommeLongues: longues.reduce((x, y) => x + y, 0),
      blocage: longues.reduce((x, y) => x + y - 50, 0),
      images: Math.round(parS(n.DrawFrame) * 10) / 10,
      imagesVoulues: Math.round(parS((n.DrawFrame || 0) + (n.DroppedFrame || 0)) * 10) / 10,
      imagesPrincipal: Math.round(parS(n.BeginMainThreadFrame) * 10) / 10,
      peintures: Math.round(parS(n.Paint) * 10) / 10,
      styles: Math.round(parS(n.UpdateLayoutTree) * 10) / 10,
      miseEnPage: Math.round(parS(n.Layout) * 10) / 10,
      rafParS: Math.round(parS(n.FireAnimationFrame) * 10) / 10,
      minuteriesParS: Math.round(parS(n.TimerFire) * 10) / 10,
      dureesPrincipal: Object.fromEntries(Object.entries(duree).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1])),
      stylesForcesRaf: Math.round(parS(forces.UpdateLayoutTree) * 10) / 10,
      miseEnPageForceeRaf: Math.round(parS(forces.Layout) * 10) / 10,
      coutImagePrincipal: n.BeginMainThreadFrame ? Math.round(((fils.principal || 0) / n.BeginMainThreadFrame) * 10) / 10 : null,
      animationsVivantes: vivantes,
      nonComposees: Object.fromEntries(Object.entries(nonComposees).sort((x, y) => y[1] - x[1])),
    };
  };
  const fcpEv = ev.find(e => e.name === 'firstContentfulPaint' && e.pid === rpid && e.ts >= t0);
  return {
    pidRendu: rpid,
    fcp: fcpEv ? Math.round((fcpEv.ts - t0) / 1000) : null,
    chargement: fenetre(t0, chargeFin),
    repos: fenetre(reposDebut, reposFin),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Cartes de source : attribution aux modules
// ---------------------------------------------------------------------------------------------------------------
const B64 = new Map([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]));
function decoderMappings(mappings) {
  const lignes = [];
  let src = 0, sl = 0, sc = 0;
  for (const ligne of mappings.split(';')) {
    const segs = [];
    let col = 0;
    if (ligne) {
      for (const seg of ligne.split(',')) {
        if (!seg) continue;
        const v = [];
        let val = 0, dec = 0;
        for (const ch of seg) {
          const d = B64.get(ch);
          val += (d & 31) << dec;
          if (d & 32) dec += 5;
          else {
            v.push(val & 1 ? -(val >>> 1) : val >>> 1);
            val = 0;
            dec = 0;
          }
        }
        col += v[0];
        if (v.length >= 4) {
          src += v[1];
          sl += v[2];
          sc += v[3];
          segs.push([col, src]);
        } else segs.push([col, -1]);
      }
    }
    lignes.push(segs);
  }
  return lignes;
}
function nomModule(source) {
  const s = source.replace(/^(\.\.\/)+/, '').replace(/^\/?/, '');
  const i = s.lastIndexOf('node_modules/');
  if (i >= 0) {
    const r = s.slice(i + 13).split('/');
    return r[0].startsWith('@') ? `${r[0]}/${r[1]}` : r[0];
  }
  return s;
}
const cartes = new Map();
async function carteDe(requete, url) {
  if (!/\.js(\?|$)/.test(url)) return null;
  if (cartes.has(url)) return cartes.get(url);
  let carte = null;
  try {
    const r = await requete.get(`${url.split('?')[0]}.map`);
    if (r.ok()) {
      const m = await r.json();
      carte = { lignes: decoderMappings(m.mappings), modules: m.sources.map(nomModule) };
    }
  } catch {
    carte = null;
  }
  cartes.set(url, carte);
  return carte;
}
function moduleA(carte, ligne, col) {
  const segs = carte?.lignes[ligne];
  if (!segs?.length) return null;
  let lo = 0, hi = segs.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (segs[m][0] <= col) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  if (r < 0 || segs[r][1] < 0) return null;
  return carte.modules[segs[r][1]];
}

/** « fichier.js:ligne:colonne fonction » (pile d'appel) → module source, si la carte est servie. */
async function localiser(requete, base, cle) {
  const m = cle.match(/^(\S+\.js):(\d+):(\d+)/);
  if (!m) return null;
  const carte = await carteDe(requete, `${base}/assets/${m[1]}`);
  return moduleA(carte, Number(m[2]) - 1, Number(m[3]) - 1);
}

/** Trace courte avec suivi des invalidations : qui oblige à recalculer styles, mise en page et peinture. */
function analyserInvalidations(buf) {
  const brut = JSON.parse(buf.toString('utf8'));
  const ev = Array.isArray(brut) ? brut : brut.traceEvents;
  const d = ev.find(e => e.name === 'perf:inval-debut');
  const f = ev.find(e => e.name === 'perf:inval-fin');
  if (!d || !f) return null;
  const s = (f.ts - d.ts) / 1e6;
  const out = {};
  for (const e of ev) {
    if (e.pid !== d.pid || e.ts < d.ts || e.ts > f.ts || !/InvalidationTracking$/.test(e.name)) continue;
    const x = e.args?.data || {};
    const k = `${e.name.replace('InvalidationTracking', '')} · ${x.nodeName || '?'} · ${x.reason || x.invalidationList?.[0]?.classes?.join(' ') || ''}`.trim();
    out[k] = (out[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round((v / s) * 10) / 10]).sort((a, b) => b[1] - a[1]).slice(0, 30));
}

// ---------------------------------------------------------------------------------------------------------------
// Profil CPU et couverture
// ---------------------------------------------------------------------------------------------------------------
async function resumeProfil(profil, requete) {
  const parNoeud = new Map(profil.nodes.map(n => [n.id, n]));
  const soi = new Map();
  const { samples, timeDeltas } = profil;
  for (let i = 0; i < samples.length; i++) {
    const d = (timeDeltas[i + 1] ?? timeDeltas[i] ?? 0) / 1000;
    soi.set(samples[i], (soi.get(samples[i]) || 0) + d);
  }
  const parModule = {};
  const parFonction = {};
  const speciaux = {};
  let js = 0;
  for (const [id, t] of soi) {
    const n = parNoeud.get(id);
    const cf = n.callFrame;
    if (!cf.url) {
      const k = cf.functionName || '(natif)';
      speciaux[k] = (speciaux[k] || 0) + t;
      if (!/^\((idle|program|root|garbage collector)\)$/.test(k)) js += t;
      continue;
    }
    js += t;
    const carte = await carteDe(requete, cf.url);
    const mod = moduleA(carte, cf.lineNumber, cf.columnNumber) || cf.url.split('/').pop().split('?')[0];
    parModule[mod] = (parModule[mod] || 0) + t;
    const f = `${cf.functionName || '(anonyme)'} · ${mod}`;
    parFonction[f] = (parFonction[f] || 0) + t;
  }
  const tri = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10) / 10]).sort((a, b) => b[1] - a[1]).slice(0, 25));
  return { js: Math.round(js), speciaux: tri(speciaux), parModule: tri(parModule), parFonction: tri(parFonction) };
}

/** Octets utilisés d'un script d'après la couverture par blocs de V8 (les plages internes l'emportent). */
function octetsUtilises(entree) {
  const n = entree.source?.length ?? 0;
  const u = new Uint8Array(n);
  const plages = entree.functions.flatMap(f => f.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of plages) u.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(n, r.endOffset));
  return u;
}

async function resumeCouvertureJS(entrees, requete) {
  const fichiers = [];
  const modules = {};
  for (const e of entrees) {
    if (!e.url.startsWith('http')) continue;
    const u = octetsUtilises(e);
    let utilises = 0;
    for (let i = 0; i < u.length; i++) utilises += u[i];
    fichiers.push({ fichier: e.url.split('/').pop(), total: u.length, utilises });
    const carte = await carteDe(requete, e.url);
    if (!carte) continue;
    const src = e.source;
    let debutLigne = 0;
    for (let l = 0; l < carte.lignes.length && debutLigne <= src.length; l++) {
      let finLigne = src.indexOf('\n', debutLigne);
      if (finLigne < 0) finLigne = src.length;
      const segs = carte.lignes[l];
      for (let k = 0; k < segs.length; k++) {
        if (segs[k][1] < 0) continue;
        const a = debutLigne + segs[k][0];
        const b = k + 1 < segs.length ? debutLigne + segs[k + 1][0] : finLigne;
        const mod = carte.modules[segs[k][1]];
        const m = (modules[mod] = modules[mod] || { total: 0, utilises: 0 });
        for (let i = a; i < b && i < u.length; i++) {
          m.total++;
          m.utilises += u[i];
        }
      }
      debutLigne = finLigne + 1;
    }
  }
  return {
    fichiers: fichiers.sort((a, b) => b.total - a.total),
    total: fichiers.reduce((x, f) => x + f.total, 0),
    utilises: fichiers.reduce((x, f) => x + f.utilises, 0),
    modules: Object.fromEntries(Object.entries(modules).sort((a, b) => b[1].total - a[1].total).slice(0, 30)),
  };
}

function resumeCouvertureCSS(entrees) {
  const fichiers = entrees
    .filter(e => e.url.startsWith('http'))
    .map(e => ({ fichier: e.url.split('/').pop(), total: e.text.length, utilises: e.ranges.reduce((x, r) => x + r.end - r.start, 0) }));
  return { fichiers, total: fichiers.reduce((x, f) => x + f.total, 0), utilises: fichiers.reduce((x, f) => x + f.utilises, 0) };
}

// ---------------------------------------------------------------------------------------------------------------
// Préparation d'une partie en cours (contre l'IA, sans pendule) : choix des cartes s'il y en a un, un coup chacun
// ---------------------------------------------------------------------------------------------------------------
async function preparerPartie(ctx, base) {
  // Version du protocole du serveur, annoncée à la connexion du socket comme le site (auth.v).
  const { version } = await (await ctx.request.get(`${base}/api/me`)).json().catch(() => ({}));
  const r = await ctx.request.post(`${base}/api/games`, { data: { mode: 'bot', tc: 'none', color: 'w', level: 1, name: 'Banc' }, headers: { origin: base } });
  if (!r.ok()) throw new Error(`création de partie refusée : ${r.status()} ${await r.text()}`);
  const { id } = await r.json();
  const cookie = (await ctx.cookies(base)).map(c => `${c.name}=${c.value}`).join('; ');
  const { io } = await import('socket.io-client');
  const s = io(base, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true, reconnection: false, auth: { v: version } });
  const maj = [];
  s.on('game:update', u => maj.push(u));
  await new Promise((ok, ko) => {
    s.once('connect', ok);
    s.once('connect_error', ko);
  });
  const emettre = (ev, p) => new Promise(ok => s.emit(ev, p, ok));
  const attendre = async (pred, delai = 15000) => {
    const t = Date.now();
    while (Date.now() - t < delai) {
      if (pred()) return true;
      await sleep(100);
    }
    return false;
  };
  try {
    const j = await emettre('game:join', { id, name: 'Banc' });
    if (j?.view?.draft) {
      const a = await emettre('game:draft', { id, cards: j.view.draft.pool.slice(0, 3) });
      if (!a?.ok) throw new Error(`choix des cartes refusé : ${a?.error}`);
      await attendre(() => maj.some(u => u.event?.type === 'reveal'));
    }
    const m = await emettre('game:move', { id, from: 12, to: 28 }); // e2-e4
    if (!m?.ok) throw new Error(`coup refusé : ${m?.error}`);
    if (!(await attendre(() => maj.some(u => u.event?.type === 'move' && u.event?.color === 'b')))) console.warn("  (l'IA n'a pas répondu à temps)");
  } finally {
    s.close();
  }
  return `/partie/${id}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Un passage
// ---------------------------------------------------------------------------------------------------------------
async function processus(bcdp) {
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
  return processInfo;
}
function deltaProcessus(p0, p1, pidRendu) {
  const avant = new Map(p0.map(p => [p.id, p.cpuTime]));
  const out = { rendu: 0, gpu: 0, navigateur: 0, autres: 0 };
  for (const p of p1) {
    const d = (p.cpuTime - (avant.get(p.id) ?? 0)) * 1000;
    const k = p.type === 'renderer' ? (p.id === pidRendu ? 'rendu' : 'autres') : p.type === 'GPU' ? 'gpu' : p.type === 'browser' ? 'navigateur' : 'autres';
    out[k] += d;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v)]));
}

async function passage(browser, bcdp, site, nomScenario, { diagnostic = false } = {}) {
  const sc = SCENARIOS[nomScenario];
  const ctx = await browser.newContext({ ...sc.appareil, serviceWorkers: 'block' });
  try {
    const chemin = sc.preparer ? await sc.preparer(ctx, site.base) : sc.chemin;
    const url = site.base + chemin;
    const page = await ctx.newPage();
    let erreurs = 0;
    page.on('pageerror', () => erreurs++);
    await page.addInitScript(crochets);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');
    // CPU ralenti : navigation préalable de même origine, pour que le ralentissement porte sur le bon processus de rendu
    // (la connexion HTTP est alors déjà ouverte : un aller-retour de moins au chargement mesuré)
    if (CPU > 1) {
      await page.goto(`${site.base}/robots.txt`);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    }
    if (RESEAU === '4g') await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    const req = collecteurReseau(cdp);
    // Aucun événement de souris n'est envoyé : pas de survol, pas de parallaxe (page vraiment immobile)

    if (diagnostic) {
      // Même origine avant la mesure : le profileur et la couverture restent sur le même processus de rendu
      if (CPU <= 1) await page.goto(`${site.base}/robots.txt`);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await page.coverage.startCSSCoverage({ resetOnNavigation: false });
      await cdp.send('Profiler.start');
    }
    const p0 = await processus(bcdp);
    if (!diagnostic) await browser.startTracing(page, { categories: CATEGORIES_TRACE });
    const tNav = Date.now();
    await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
    const debutDoc = [...req.values()].find(r => r.type === 'Document' && r.url.startsWith(url.split('#')[0]))?.debut ?? null;
    await sleep(Math.max(0, tNav + CHARGEMENT - Date.now()));
    await page.evaluate(() => performance.mark('perf:charge-fin'));
    const m1 = await cdp.send('Performance.getMetrics');
    const p1 = await processus(bcdp);
    const charge = await page.evaluate(() => window.__perf.instantane(false));
    const reseauCharge = resumeReseau(req, debutDoc ?? 0, (debutDoc ?? 0) + CHARGEMENT / 1000);

    const out = { site: site.nom, scenario: nomScenario, url, erreurs, chargeMoyenneSysteme: os.loadavg()[0] };
    if (diagnostic) {
      const { profile: profilCharge } = await cdp.send('Profiler.stop');
      out.couvertureJS = await resumeCouvertureJS(await page.coverage.stopJSCoverage(), ctx.request);
      out.couvertureCSS = resumeCouvertureCSS(await page.coverage.stopCSSCoverage());
      out.profilCharge = await resumeProfil(profilCharge, ctx.request);
      writeFileSync(path.join(SORTIE, `${site.nom}-${nomScenario}-chargement.cpuprofile`), JSON.stringify(profilCharge));
    }

    if (sc.action) await sc.action(page);
    // Début du repos : compteurs de requestAnimationFrame remis à zéro
    await page.evaluate(() => {
      window.__perf.instantane(true);
      performance.mark('perf:repos-debut');
    });
    if (diagnostic) await cdp.send('Profiler.start');
    const m2 = await cdp.send('Performance.getMetrics');
    const p2 = await processus(bcdp);
    const nbAvantRepos = req.size;
    await sleep(REPOS);
    await page.evaluate(() => performance.mark('perf:repos-fin'));
    const m3 = await cdp.send('Performance.getMetrics');
    const p3 = await processus(bcdp);
    const repos = await page.evaluate(() => window.__perf.instantane(false));
    const reqRepos = req.size - nbAvantRepos;

    const met = m => Object.fromEntries(m.metrics.map(x => [x.name, x.value]));
    const [a1, a2, a3] = [met(m1), met(m2), met(m3)];
    const sec = (x, y, k) => Math.round(((x[k] ?? 0) - (y?.[k] ?? 0)) * 1000);

    if (diagnostic) {
      const { profile: profilRepos } = await cdp.send('Profiler.stop');
      out.profilRepos = await resumeProfil(profilRepos, ctx.request);
      writeFileSync(path.join(SORTIE, `${site.nom}-${nomScenario}-repos.cpuprofile`), JSON.stringify(profilRepos));
      out.inventaire = await page.evaluate(() => window.__perf.inventaire());
      out.rafModules = {};
      for (const [cle, n] of Object.entries(repos.raf.src)) out.rafModules[`${cle} → ${(await localiser(ctx.request, site.base, cle)) ?? '?'}`] = Math.round((n / (REPOS / 1000)) * 10) / 10;
      // Trace courte, page toujours immobile, avec suivi des invalidations
      await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking', 'blink.user_timing'] });
      await page.evaluate(() => performance.mark('perf:inval-debut'));
      await sleep(3000);
      await page.evaluate(() => performance.mark('perf:inval-fin'));
      out.invalidationsParS = analyserInvalidations(await browser.stopTracing());
      out.reseau = reseauCharge;
      out.instantaneCharge = charge;
      out.instantaneRepos = repos;
      return out;
    }

    const trace = analyserTrace(await browser.stopTracing(), site.base);
    const pid = trace.pidRendu;
    Object.assign(out, {
      fcp: charge.fcp != null ? Math.round(charge.fcp) : trace.fcp,
      lcp: charge.lcp != null ? Math.round(charge.lcp) : null,
      lcpInfo: charge.lcpInfo,
      cls: Math.round(charge.cls * 1000) / 1000,
      reseau: reseauCharge,
      requetesAuRepos: reqRepos,
      chargement: {
        script: sec(a1, null, 'ScriptDuration'),
        compilation: sec(a1, null, 'V8CompileDuration'),
        styles: sec(a1, null, 'RecalcStyleDuration'),
        miseEnPage: sec(a1, null, 'LayoutDuration'),
        taches: sec(a1, null, 'TaskDuration'),
        tasJS: Math.round((a1.JSHeapUsedSize ?? 0) / 1024),
        processus: deltaProcessus(p0, p1, pid),
        trace: trace.chargement,
        longuesObservees: charge.lt,
        gl: charge.gl,
        rafAppels: charge.raf.appels,
      },
      repos: {
        script: sec(a3, a2, 'ScriptDuration'),
        styles: sec(a3, a2, 'RecalcStyleDuration'),
        miseEnPage: sec(a3, a2, 'LayoutDuration'),
        taches: sec(a3, a2, 'TaskDuration'),
        processus: deltaProcessus(p2, p3, pid),
        trace: trace.repos,
        rafParS: Math.round((repos.raf.appels / (REPOS / 1000)) * 10) / 10,
        rafSources: Object.fromEntries(Object.entries(repos.raf.src).map(([k, v]) => [k, Math.round((v / (REPOS / 1000)) * 10) / 10]).sort((x, y) => y[1] - x[1])),
        rafEnAttente: repos.rafEnAttente,
        animations: repos.animations,
        gl: repos.gl,
        c2d: repos.c2d,
        noeuds: repos.noeuds,
        canvas: repos.canvas,
        echiquiers: repos.echiquiers,
        defilement: repos.defilement,
      },
    });
    return out;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------------------------------------------
const CHAMPS = [
  ['Requêtes (chargement)', r => r.reseau.total.n, x => String(Math.round(x))],
  ['Transféré total', r => r.reseau.total.transfere, ko],
  ['Décompressé total', r => r.reseau.total.taille, ko],
  ['  JS transféré / décompressé', r => r.reseau.parCat.js?.transfere ?? 0, ko, r => r.reseau.parCat.js?.taille ?? 0],
  ['  CSS transféré / décompressé', r => r.reseau.parCat.css?.transfere ?? 0, ko, r => r.reseau.parCat.css?.taille ?? 0],
  ['  Polices (nombre)', r => r.reseau.parCat.polices?.n ?? 0, x => String(Math.round(x))],
  ['  Polices transféré', r => r.reseau.parCat.polices?.transfere ?? 0, ko],
  ['  Images (nombre)', r => r.reseau.parCat.images?.n ?? 0, x => String(Math.round(x))],
  ['  Images transféré', r => r.reseau.parCat.images?.transfere ?? 0, ko],
  ['FCP', r => r.fcp, ms],
  ['LCP', r => r.lcp, ms],
  ['Script exécuté au chargement', r => r.chargement.script, ms],
  ['Styles + mise en page (chargement)', r => r.chargement.styles + r.chargement.miseEnPage, ms],
  ['Tâches longues (somme, chargement)', r => r.chargement.trace?.sommeLongues, ms],
  ['Temps de blocage (Σ excès > 50 ms)', r => r.chargement.trace?.blocage, ms],
  ['CPU fil principal, 10 premières s', r => r.chargement.trace?.cpu.principal, ms],
  ['CPU processus de rendu, chargement', r => r.chargement.processus.rendu, ms],
  ['CPU GPU logiciel, chargement', r => r.chargement.processus.gpu, ms],
  ['Repos : CPU fil principal (ms/s)', r => r.repos.trace?.cpuParS.principal ?? 0, x => x.toFixed(0)],
  ['Repos : CPU compositeur (ms/s)', r => r.repos.trace?.cpuParS.compositeur ?? 0, x => x.toFixed(0)],
  ['Repos : CPU processus de rendu (ms/s)', r => r.repos.processus.rendu / (REPOS / 1000), x => x.toFixed(0)],
  ['Repos : CPU GPU logiciel (ms/s)', r => r.repos.processus.gpu / (REPOS / 1000), x => x.toFixed(0)],
  ['Repos : images composées /s', r => r.repos.trace?.images, x => x.toFixed(1)],
  ['Repos : images voulues /s', r => r.repos.trace?.imagesVoulues, x => x.toFixed(1)],
  ['Repos : images du fil principal /s', r => r.repos.trace?.imagesPrincipal, x => x.toFixed(1)],
  ['Repos : peintures /s', r => r.repos.trace?.peintures, x => x.toFixed(1)],
  ['Repos : styles recalculés /s', r => r.repos.trace?.styles, x => x.toFixed(1)],
  ['Repos : mises en page /s', r => r.repos.trace?.miseEnPage, x => x.toFixed(1)],
  ['Repos : dont forcées dans un rAF /s', r => r.repos.trace?.miseEnPageForceeRaf, x => x.toFixed(1)],
  ['Repos : coût d’une image, fil principal', r => r.repos.trace?.coutImagePrincipal, x => `${x.toFixed(1)} ms`],
  // Seulement pour une boucle soutenue (≥ 10 images/s du fil principal) : le compositeur logiciel du bac à sable bride la
  // cadence, un vrai écran à 60 Hz ferait 60 images/s au même coût unitaire
  ['Repos : projection à 60 images/s (ms/s)', r => (r.repos.trace?.imagesPrincipal >= 10 ? r.repos.trace.coutImagePrincipal * 60 : 0), x => x.toFixed(0)],
  ['Repos : rAF appelés /s', r => r.repos.rafParS, x => x.toFixed(1)],
  ['Repos : animations CSS en cours', r => r.repos.animations.enCours, x => String(Math.round(x))],
  ['Repos : dont infinies visibles', r => r.repos.animations.infiniesVisibles, x => String(Math.round(x))],
  ['Contextes WebGL créés', r => r.repos.gl.length, x => String(Math.round(x))],
  ['Contextes WebGL vivants', r => r.repos.gl.filter(g => g.vivant).length, x => String(Math.round(x))],
  ['Nœuds DOM', r => r.repos.noeuds, x => String(Math.round(x))],
];

function synthese(resultats) {
  const lignes = [];
  for (const sc of scenarios) {
    lignes.push(`\n## ${SCENARIOS[sc].titre}${SANS_WEBGL ? ' (sans WebGL)' : ''}${RESEAU ? ` (réseau ${RESEAU})` : ''}${CPU > 1 ? ` (CPU ÷${CPU})` : ''}\n`);
    lignes.push(`| Mesure (médiane de ${PASSAGES}) | ${sites.map(s => s.nom).join(' | ')} |`);
    lignes.push(`|---|${sites.map(() => '---:').join('|')}|`);
    for (const [nom, f, fmt, f2] of CHAMPS) {
      const cells = sites.map(s => {
        const rs = resultats.filter(r => r.site === s.nom && r.scenario === sc && !r.echec);
        const v = mediane(rs.map(r => {
          try {
            return f(r);
          } catch {
            return null;
          }
        }));
        if (v == null) return '–';
        if (!f2) return fmt(v);
        const v2 = mediane(rs.map(r => f2(r)));
        return `${fmt(v)} / ${fmt(v2)}`;
      });
      lignes.push(`| ${nom} | ${cells.join(' | ')} |`);
    }
  }
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Programme
// ---------------------------------------------------------------------------------------------------------------
const RELIRE = opt('relire', '');
if (RELIRE) {
  // Régénère la synthèse d'une campagne déjà mesurée : node test/perf/mesure.mjs ref=… cur=… --relire=<resultats.json>
  const { readFileSync } = await import('node:fs');
  const d = JSON.parse(readFileSync(String(RELIRE), 'utf8'));
  console.log(synthese(d.resultats));
  process.exit(0);
}
const lancement = {
  headless: !opt('visible', false),
  args: [...(SANS_WEBGL ? ['--disable-webgl', '--disable-3d-apis'] : []), '--enable-unsafe-swiftshader'],
};
const browser = await chromium.launch(lancement);
const bcdp = await browser.newBrowserCDPSession();
const resultats = [];
const diagnostics = [];
console.log(`Chromium ${browser.version()} · ${sites.map(s => `${s.nom}=${s.base}`).join(' · ')} · ${PASSAGES} passage(s) · chargement ${CHARGEMENT / 1000} s, repos ${REPOS / 1000} s${SANS_WEBGL ? ' · sans WebGL' : ''}`);
console.log(`Sortie : ${SORTIE}`);
try {
  for (const sc of scenarios) {
    for (let i = 0; i < PASSAGES; i++) {
      // Les sites alternent (ordre inversé un passage sur deux) pour répartir le bruit de la machine
      const ordre = i % 2 ? [...sites].reverse() : sites;
      for (const site of ordre) {
        const t = Date.now();
        try {
          const r = await passage(browser, bcdp, site, sc);
          r.passage = i + 1;
          resultats.push(r);
          console.log(`  ${sc} · ${site.nom} · passage ${i + 1} : FCP ${ms(r.fcp)}, LCP ${ms(r.lcp)}, ${ko(r.reseau.total.transfere)} transférés, fil principal ${ms(r.chargement.trace?.cpu.principal)} au chargement, ${r.repos.trace?.cpuParS.principal ?? '–'} ms/s au repos, ${r.repos.trace?.images ?? '–'} images/s (${Math.round((Date.now() - t) / 1000)} s, charge ${r.chargeMoyenneSysteme.toFixed(1)})`);
        } catch (e) {
          console.error(`  ${sc} · ${site.nom} · passage ${i + 1} : ÉCHEC ${e.stack || e}`);
          resultats.push({ site: site.nom, scenario: sc, passage: i + 1, echec: String(e) });
        }
        writeFileSync(path.join(SORTIE, 'resultats.json'), JSON.stringify({ sites, scenarios, PASSAGES, CHARGEMENT, REPOS, SANS_WEBGL, RESEAU, CPU, resultats, diagnostics }, null, 1));
      }
    }
    if (DIAGNOSTIC) {
      for (const site of sites) {
        try {
          const d = await passage(browser, bcdp, site, sc, { diagnostic: true });
          diagnostics.push(d);
          console.log(`  ${sc} · ${site.nom} · diagnostic : JS utilisé ${ko(d.couvertureJS.utilises)} sur ${ko(d.couvertureJS.total)}, CSS utilisé ${ko(d.couvertureCSS.utilises)} sur ${ko(d.couvertureCSS.total)}`);
        } catch (e) {
          console.error(`  ${sc} · ${site.nom} · diagnostic : ÉCHEC ${e.stack || e}`);
        }
        writeFileSync(path.join(SORTIE, 'resultats.json'), JSON.stringify({ sites, scenarios, PASSAGES, CHARGEMENT, REPOS, SANS_WEBGL, RESEAU, CPU, resultats, diagnostics }, null, 1));
      }
    }
  }
} finally {
  await browser.close();
}
const texte = synthese(resultats);
writeFileSync(path.join(SORTIE, 'synthese.md'), texte);
console.log(texte);
console.log(`\nDétails : ${path.join(SORTIE, 'resultats.json')}`);
