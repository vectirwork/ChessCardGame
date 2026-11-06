# V2 : mesure de performance (D6), journal

Mission : mesurer, pas optimiser. Référence f32af47 contre version actuelle du dépôt (copie de travail).
Aucun fichier du site modifié. Seuls fichiers écrits : ce journal et `test/perf/mesure.mjs`.

## Étapes

- [x] 1. Constructions de production (référence f32af47, actuelle) hors du dépôt
- [x] 2. Script `test/perf/mesure.mjs`
- [x] 3. Mesures référence / actuelle
- [x] 4. Causes (profil CPU, couverture, polices, images, effets CSS, WebGL)

## Journal

- Démarrage : lecture de PLAN-V2 et RETOURS-FONDATEUR. Pas de journal précédent.
- Étape 1 faite : constructions dans `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf/{ref,cur}` (ref = `git archive f32af47`, cur = copie de l'arbre de travail
  du 2026-11-06T19:11:14+00:00, modifications non validées des agents Cartes et Choix incluses ; node_modules en liens
  durs). Serveurs : ref sur le port 3171, cur sur 3172, `NODE_ENV=production`, DATA_DIR dans `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf/data-*`.
- Constructions refaites avec `--sourcemap` (code JS identique au caractère près, seul le commentaire final change)
  pour attribuer CPU et couverture à chaque module. Navigateur : Chromium 153 headless shell, WebGL **et
  composition** en SwiftShader (logiciel) : le processus GPU prend ~5 s de CPU sur 6 s à l'accueil, à séparer.
- Lecture du code : `App.tsx` importe `Home` (OdysseeHome, scenery, engine, GameShell, StageBoard, gsap, lenis,
  odyssee.css) statiquement, donc dans le paquet principal de toutes les pages. three.js (593 ko) est dans `vfx-*.js`,
  chargé à l'intention de jouer (accueil), au montage d'un StageBoard (lieux 1 à 5), ou 1,6 s après l'arrivée sur
  `/partie` (GamePage, `warm`). Boucle gsap.ticker permanente (engine.ts) qui appelle Lenis à chaque image.
- Étape 2 en cours : écriture de `test/perf/mesure.mjs`.
- Étape 2 faite : `test/perf/mesure.mjs` (trace Chromium, CDP Performance/SystemInfo/Profiler, couverture, crochets
  rAF/WebGL, cartes de source). Témoins au banc (pages minimales) pour calibrer : animation `transform` seule = 0 au fil
  principal ; boucle rAF vide = 60 images/s au fil principal ; boucle rAF + 50 animations `transform` (visibles ou
  `visibility: hidden`) = 37 ms/s et 60 recalculs de style/s ; `box-shadow` ou `filter: blur` animés = 60 images/s
  au fil principal même cachés.
- Premières causes trouvées à l'accueil : (1) WebGL préchauffé sans intention (`OdysseeHome.tsx` l. 149-164, minuterie
  3,4 s + requestIdleCallback) ; (2) boucle gsap.ticker permanente, et `engine.ts:440` lit `window.scrollY` à chaque
  image : style + mise en page forcés dans le rAF, racine `svg.o-seal-text` (sceau tournant du Seuil, 8 600 px sous
  l'écran) remis en page et repeint à chaque image ; (3) 10 images de nuages (475 ko) chargées d'emblée.
- Étape 3 en cours : campagne de mesures (3 passages, médiane, ref et cur alternés).
- Diagnostic d'essai (accueil, cur) : JS utilisé 550 ko sur 1 157 ko chargés (48 %), dont three 88/392 ko (inutile
  sans intention) ; CSS utilisé 49/179 ko (27 %) ; le CSS principal embarque pour toutes les pages 43 ko de règles
  `.ody` (accueil), 22 ko des pages intérieures, 14 ko de 40 `@font-face`. Polices : 40 déclarées, 9 chargées (211 ko).
  Profil de chargement : `frame` (engine.ts) 203 ms et `onContentResize` (Lenis) 118 ms = mises en page forcées.
  50 animations CSS infinies en cours au repos dont 35 invisibles ; 32 pièces avec `will-change: transform` + `drop-shadow`.
  LCP = `p.o-lede` (texte du héros en `opacity: 0` jusqu'à l'exécution du JS, puis fondu 1,1 s).
- Campagne 1 lancée (6 scénarios × 3 passages × 2 versions + diagnostics), sortie
  `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf/campagne1/`.
- Campagne 1, premiers résultats (médianes à confirmer dans la synthèse) : accueil bureau ref/cur quasi identiques
  (1 068/1 072 ko transférés, FCP ≈ 0,6 s, LCP ≈ 2,4 s, fil principal ≈ 1,1 s sur 10 s, repos 60 à 75 ms/s à ≈ 15 i/s,
  ≈ 5 ms par image). Mobile (Pixel 7) : fil principal ≈ 1,7 s, repos ≈ 131 ms/s à ≈ 37 i/s (3,5 ms par image, surtout
  `Layerize` et styles des 47 animations), GPU logiciel ≈ 880 ms/s. Le compositeur logiciel bride la cadence : sur un
  vrai écran à 60 Hz, projeter coût par image × 60.
- Étape 3 faite (campagne 1, synthèse dans `…/scratchpad/perf/campagne1/synthese.md`) : ref et cur quasi identiques
  partout (+4 à +12 ko transférés pour cur, dus au choix des cartes : `GamePage-*.css` 10 ko, CardDraft) ; rien de
  mesurable sur les temps. Les problèmes D6 sont antérieurs à f32af47. `/jouer` et `/apprendre` : 0 au repos (fil
  principal), mais 34 à 36 % du JS et 5 à 7 % du CSS chargés utilisés. `/partie` : three.js + WebGL à 2 s, 3 halos
  de cartes = 60 images/s au compositeur. `/apprendre` : `#contenu:has(> .ft-page)::after` (`pg-spin 200s`) = 60 i/s.
- Séries complémentaires lancées : `--sans-webgl` (accueil, forêt, partie) et `--reseau=4g --cpu=4` (accueil, mobile).
- Série `--sans-webgl` (accueil, forêt, partie) : chiffres inchangés (GPU logiciel ≈ 9 s au chargement, ≈ 930 ms/s au
  repos ; fil principal identique). Le coût GPU vient de la composition logicielle des couches DOM animées, pas du WebGL.
  Le préchauffage WebGL coûte surtout réseau (151 ko), compilation de three et mémoire GPU.
- Série `--reseau=4g --cpu=4` : mobile FCP ≈ 3,0 s, LCP ≈ 4,3 s, blocage ≈ 1,2 s, fil principal 5,5 s sur 10 s,
  repos ≈ 515 ms/s ; bureau FCP ≈ 3,2 s, LCP ≈ 4,6 s, blocage 1,6 à 1,9 s, repos ≈ 255 ms/s.
- Essais A/B au repos en cours (`proto/ab.mjs`, version actuelle) : chaque cause neutralisée par injection.

## Résultats (médianes de 3 passages, ref = f32af47 / cur = arbre de travail du 6 nov. 19 h 11)

Chromium 153 headless, localhost sans limitation sauf mention, bureau 1440 × 900, mobile = Pixel 7 (412 × 839, ×2,625).
« Repos » = 10 s sans aucune entrée, après 10 s de chargement. GPU = processus GPU en SwiftShader (logiciel).

| Mesure | Accueil bureau | Accueil mobile | Mobile 4G CPU÷4 | /jouer | /partie | /apprendre |
|---|---:|---:|---:|---:|---:|---:|
| Transféré (ref / cur) | 1068 / 1072 ko | 1068 / 1072 ko | idem | 426 / 438 ko | 559 / 571 ko | 444 / 449 ko |
| JS transféré / décompressé (cur) | 344 / 1157 ko | idem | idem | 219 / 633 ko | 361 / 1199 ko | 228 / 652 ko |
| CSS décompressé (cur) | 179 ko | 179 ko | 179 ko | 189 ko | 189 ko | 200 ko |
| Polices / images (cur) | 9 (211 ko) / 10 (475 ko) | idem | idem | 7 (172 ko) / 0 | 7 (164 ko) / 0 | 7 (172 ko) / 0 |
| JS / CSS réellement utilisés (cur) | 47 % / 27 % | 48 % / 29 % | – | 34 % / 7 % | 43 % / 10 % | 36 % / 5 % |
| FCP (ref / cur) | 680 / 628 ms | 440 / 468 ms | 3016 / 2940 ms | 216 / 216 ms | 204 / 184 ms | 236 / 236 ms |
| LCP (ref / cur) | 2504 / 2356 ms | 2072 / 2104 ms | 4268 / 4288 ms | 324 / 324 ms | 644 / 632 ms | 364 / 384 ms |
| Blocage Σ(tâche − 50 ms) (ref / cur) | 368 / 386 ms | 116 / 140 ms | 1298 / 1199 ms | 0 / 0 | 79 / 74 ms | 0 / 8 ms |
| Fil principal, 10 premières s (ref / cur) | 1110 / 1107 ms | 1714 / 1699 ms | 5520 / 5450 ms | 140 / 147 ms | 337 / 348 ms | 196 / 202 ms |
| Repos, fil principal (ref / cur) | 72 / 69 ms/s | 131 / 133 ms/s | 513 / 515 ms/s | 0 / 0 | 1 / 1 ms/s | 1 / 1 ms/s |
| Repos, images du fil principal /s (cur) | 15,5 | 38,6 | 28,6 | 0 | 1,1 | 0,1 |
| Repos, coût d'une image (cur) → projection 60 Hz | 4,5 ms → 270 ms/s | 3,4 ms → 204 ms/s | → saturé | – | – | – |
| Repos, compositeur / GPU logiciel (cur) | 46 / 934 ms/s | 70 / 905 ms/s | – | 0 / 1 ms/s | 82 / 381 ms/s | 14 / 220 ms/s |
| Repos, images composées voulues /s | 60 | 60 | – | 0 | 60 | 60 |
| Animations CSS en cours (visibles) | 50 (15) | 47 (13) | – | 0 | 3 (3) | 1 (1) |
| Contextes WebGL créés sans intention | 1 (≈ 3,7 s) | 1 | 1 | 0 | 1 (≈ 2 s) | 0 |

Forêt (lieu II, StageBoard) : comme l'accueil, plus un 2ᵉ contexte WebGL ; repos 63 ms/s, GPU 970 ms/s.
Sans WebGL (`--disable-webgl`) : mêmes chiffres partout, le WebGL n'explique pas le coût du GPU logiciel.
Bureau 4G CPU÷4 : FCP ≈ 3,2 s, LCP ≈ 4,6 s, blocage 1,6 à 1,9 s, repos ≈ 255 ms/s.

## Essais A/B au repos (cur, médiane de 3, cause neutralisée par CSS injecté ou rAF coupé, ms/s)

| Variante | Fil principal | Processus de rendu | GPU logiciel |
|---|---:|---:|---:|
| Accueil bureau, normal | 74 à 77 | 135 | 932 |
| … boucle rAF (gsap) coupée | 45 | 103 | 932 |
| … sceau `o-seal-text` figé | 51 | 98 | 950 |
| … animations invisibles en pause (scènes cachées, sceau, halos) | 16 | 72 | 958 |
| … rAF coupé + animations invisibles en pause | 5 | 60 | 972 |
| … toutes les animations CSS en pause | 12 | 23 | 10 |
| … `will-change` des pièces retiré | 78 | 135 | 923 (aucun effet : hypothèse écartée) |
| Accueil mobile, normal | 131 à 136 | 210 | 870 |
| … boucle rAF coupée | 51 | 130 | 922 |
| … animations invisibles en pause | 26 | 110 | 950 |
| … rAF coupé + invisibles en pause | 5 | 90 | 958 |
| /apprendre normal → rotation `#contenu::after` figée | 1 → 0 | 22 → 0 | 198 → 0 |
| /apprendre, flou de l'en-tête retiré | 1 | 20 | 200 (aucun effet) |
| /partie normal → halos `sc-halo` figés | 1 → 0 | 102 → 0 | 368 → 0 |
| /partie, flou des halos retiré | 1 | 97 | 348 (effet faible) |

Le GPU logiciel au repos de l'accueil vient des animations **visibles** (composées à 60 images/s) : il ne baisse que si
elles s'arrêtent. Sur un vrai GPU ce coût est bien plus faible, mais il garde l'écran et le GPU actifs en continu.

## Causes (impact, domaine, preuve, correctif proposé)

1. **Fort, repos — animations invisibles restylées à chaque image.** 50 animations CSS infinies à l'accueil, dont
   35 invisibles (lanternes `o-rise` ×9, faisceaux `o-beam` ×6, éclairs, neige, pluie, sable, aurore dans les scènes en
   `visibility: hidden` ; 8 halos `sc-halo` de cartes masquées) + le sceau `svg.o-seal-text` (odyssee.css:1554) à
   8 600 px sous l'écran, dont le texte SVG est remis en page et repeint à chaque image (100 % des mises en page du
   repos). Dès qu'une image du fil principal a lieu, Blink recalcule le style de toutes les animations en cours, même
   cachées (témoin : 50 animations `transform` + rAF = 37 ms/s contre 0,5 sans rAF). A/B : 77 → 16 ms/s (bureau),
   136 → 26 ms/s (mobile). Correctif : `animation-play-state: paused` (classe posée par engine.ts quand `sc.shown` est
   faux ou l'opacité nulle, IntersectionObserver pour le sceau et les cartes), ou `content-visibility: hidden` des
   scènes lointaines ; faire tourner un conteneur HTML plutôt que le `<svg>` du sceau (ou texte en chemins).
2. **Fort, repos — boucle gsap.ticker permanente** (engine.ts:170, `tick` → `lenis.raf` + `frame`), jamais arrêtée,
   et `frame()` lit `window.scrollY` en première ligne (engine.ts:440) : style + mise en page forcés dans le rAF
   (15 rAF/s bureau, 37/s mobile, seule source rAF ; profil de repos : `frame` ≈ 95 % du JS). Coût par image 4,5 ms
   (bureau) / 3,4 ms (mobile) → 270 / 204 ms/s projetés à 60 Hz ; 4G CPU÷4 : 515 ms/s mobile. A/B : 74 → 45 ms/s
   seule, 16 → 5 ms/s combinée au 1. Correctif : ticker démarré sur `scroll`/`wheel`/`pointermove`/`resize`/
   transition et retiré quand position, souris et éveil sont stables (~200 ms) ; position lue dans l'événement
   `scroll` de Lenis ou mise en cache au lieu de `window.scrollY`.
3. **Fort, chargement — paquet principal monolithique.** `App.tsx` importe `Home` statiquement : `index-*.js`
   545 ko (177 ko compressés) contient react-dom, react-router, gsap (68 ko), lenis, socket.io + engine.io (importé
   par `store.tsx` → `resetSocket`), tout l'accueil (OdysseeHome, scenery, engine, GameShell, StageBoard, CardArt,
   shared/bot) ; CSS principal 179 ko avec 43 ko de `.ody`, 22 ko des pages intérieures, 12 ko `.gs-`, 14 ko de 40
   `@font-face`. Utilisé : accueil 47 % JS / 27 % CSS, /jouer 34 % / 7 %, /apprendre 36 % / 5 %. Correctif :
   `lazy()` pour Home (odyssee.css suivra), gsap/lenis dans le fragment de l'accueil, socket.io en import dynamique,
   CSS par page.
4. **Fort, chargement — LCP tardif.** LCP = `p.o-lede` à ≈ 2,4 s (bureau local) pour un FCP à ≈ 0,6 s ; 4,3 s sur
   mobile 4G CPU÷4. Le texte du héros est en `opacity: 0` (`.o-rv`, odyssee.css:1113) jusqu'à l'exécution du JS,
   au montage React et à la timeline d'ouverture (OdysseeHome l. 222-243, fondu 1,1 s). 3 à 4 tâches longues de 130 à
   210 ms, blocage ≈ 370 ms (1,2 à 1,9 s en 4G CPU÷4). Correctif : titre et chapeau visibles sans JS (fondu CSS pur
   ou pas de masquage), ouverture animée réservée à l'astrolabe ; HTML pré-rendu du premier écran.
5. **Moyen, chargement — WebGL préchauffé sans intention.** OdysseeHome l. 149-164 : `setIntent(true)` 3,4 s après
   l'ouverture → `vfx-*.js` (147 ko transférés, 579 ko décompressés, 43 % du JS transféré de l'accueil) et un contexte
   WebGL2 à ≈ 3,7 s, mobile compris ; three utilisé à 88/392 ko. /partie : GamePage l. 125-137, contexte à ≈ 2 s sans
   sort. Forêt : 2ᵉ contexte (StageBoard), recréé à chaque lieu. `--sans-webgl` : temps CPU inchangés, le coût est
   réseau, compilation et mémoire GPU. Contraire à D6. Correctif : charger vfx au premier geste réel (pointerdown ou
   survol prolongé d'une pièce, carte, bouton Jouer), au premier sort en partie ; une seule scène partagée.
6. **Moyen, chargement — 10 images de nuages (475 ko, 44 % des octets de l'accueil)** posées en `backgroundImage`
   en ligne sur toutes les scènes (scenery.tsx:217), demandées à 200-300 ms ; la scène du premier écran
   (SceneObservatoire) n'en utilise aucune. Correctif : poser l'image quand la scène approche (engine.ts connaît
   `sc.shown`), ou `<img loading="lazy">`.
7. **Moyen, chargement — polices.** 40 `@font-face` (14 ko de CSS), 9 fichiers au premier écran (211 ko, 20 % des
   octets) : Cormorant ×5 (115 ko), Cinzel ×3 (47 ko), Inter variable 48 ko ; découverts après le CSS (≈ 230-300 ms),
   aucun préchargement. Correctif : 2 ou 3 graisses, `preload` des 2 polices du héros, retirer Cinzel 700 (jamais
   chargée) et les autres graisses inutiles.
8. **Moyen, chargement — mises en page forcées pendant l'ouverture.** Profil de chargement : `frame` (engine.ts)
   203 ms bureau / 271 ms mobile, Lenis `onContentResize`/`onWrapperResize` 100 à 118 ms. Correctif : 2 ci-dessus,
   Lenis `autoResize: false` + `lenis.resize()` après `document.fonts.ready` et au redimensionnement.
9. **Moyen, repos — décors infinis visibles qui imposent 60 images/s au compositeur.** /partie : 3 halos `sc-halo`
   (cards.css:101) → compositeur 82 ms/s, GPU logiciel 368 ms/s, 0 une fois figés ; /apprendre :
   `#contenu:has(> .ft-page)::after` (`pg-spin 200s`, quasi imperceptible) → GPU logiciel 198 ms/s, 0 une fois figé ;
   accueil : 15 animations visibles. Correctif : halo seulement sur la carte survolée ou jouable, rotation lente
   supprimée ou remplacée par une image fixe, animations décoratives arrêtées après quelques cycles.
10. **Faible, repos — StageBoard des lieux II à V** en lecture automatique sans fin (minuteries 2,3/s, sorts WebGL) :
    repos 63 ms/s (comme le héros), GPU 970 ms/s. Correctif : pause après un cycle ou sans défilement depuis 10 s.
11. **Écartés par mesure** : `will-change: transform` des pièces (A/B sans effet), `backdrop-filter` (aucun actif
    sur les pages mesurées hors pseudo-élément d'en-tête ; A/B sans effet), animations `box-shadow`/`filter`
    infinies (`card-pulse`, `shield-spin` : seulement carte sélectionnée ou bouclier).

## État final

- Fichiers écrits : `test/perf/mesure.mjs`, ce journal. Aucun fichier du site modifié, aucun commit.
- Serveurs 3171/3172 arrêtés, navigateurs fermés. Copies de construction, résultats JSON, profils `.cpuprofile` et
  scripts d'essai (témoins, A/B) dans `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/`
  (`perf/campagne1`, `perf/sans-webgl`, `perf/lent`, `perf/ab.md`, `perf/ab2.md`, `proto/`).
- Rien n'a été vérifié sur un vrai appareil ni un vrai GPU : composition et WebGL sont logiciels ici. Le fil
  principal se transpose ; le GPU logiciel ne sert que d'indicateur relatif.
- Pour remesurer après optimisation : reconstruire les deux versions comme à l'étape 1, puis
  `node test/perf/mesure.mjs ref=http://localhost:3171 cur=http://localhost:3172 --scenarios=tous --diagnostic`.
