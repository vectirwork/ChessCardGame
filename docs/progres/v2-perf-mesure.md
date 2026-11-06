# V2 : mesure de performance (D6), journal

Mission : mesurer, pas optimiser. Référence f32af47 contre version actuelle du dépôt (copie de travail).
Aucun fichier du site modifié. Seuls fichiers écrits : ce journal et `test/perf/mesure.mjs`.

## Étapes

- [x] 1. Constructions de production (référence f32af47, actuelle) hors du dépôt
- [ ] 2. Script `test/perf/mesure.mjs`
- [ ] 3. Mesures référence / actuelle
- [ ] 4. Causes (profil CPU, couverture, polices, images, effets CSS, WebGL)

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
