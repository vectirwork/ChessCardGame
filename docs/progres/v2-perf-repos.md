# V2 : performance au repos et pendant le jeu (D6), journal

Mission : site sobre au repos et pendant le jeu sans changer l'apparence. Fichiers : `src/client/odyssee/*`,
`src/client/vfx/*`, `src/client/pages/PageScene.tsx`, effets continus de `src/client/styles/pages.css`,
`src/client/components/DemoBoard.tsx`. Mesure de départ : `docs/progres/v2-perf-mesure.md`.

## Étapes

- [x] 1. Lecture du code (engine.ts, OdysseeHome, scenery, StageBoard, vfx, PageScene, pages.css, DemoBoard)
- [x] 2. Construction de référence (avant) dans le scratchpad, captures avant
- [x] 3. Correctifs
- [x] 4. Construction après, mesures avant/après, captures après
- [x] 5. tsc, npm test, journal final

## Journal

- Démarrage : pas de journal précédent, lecture de PLAN-V2, RETOURS-FONDATEUR, v2-perf-mesure.
- Étape 1 faite (lecture). Points d'action relevés : boucle gsap.ticker permanente (engine.ts) qui lit `scrollY` à
  chaque image ; ~35 animations CSS infinies invisibles (scènes cachées, sceau du Bazar, halos) ; préchauffage WebGL
  minuté (OdysseeHome) ; StageBoard qui joue sans fin ; boucle rAF de la scène vfx tant qu'un objet persistant
  (Mur de glace, Faille) existe ; rotation 200 s d'/apprendre et décors infinis des pages intérieures (pages.css).
- Étape 2 : instantané de l'arbre de travail (20 h 27, HEAD 2f1aeb6, arbre propre) copié dans
  `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf-repos/avant`, construit
  (`vite build --sourcemap`), servi sur le port 3191 (`serveur-avant.pid`). « Après » = même instantané + mes seuls
  fichiers recopiés (dossier `apres`, port 3192), pour isoler mes changements de ceux de l'agent « chargement ».
  Script de captures : `…/scratchpad/perf-repos/outils/captures.cjs` ; captures avant dans `concepts/v2/perf/repos/avant/`.
- Témoins au banc (`…/perf-repos/outils/temoin-svg.mjs`, `temoin-steps.mjs`) : (1) sans boucle rAF, une rotation CSS sur
  un `<svg>` est composée comme sur un `<div>` (0 au fil principal) ; mais dès qu'une image du fil principal a lieu
  (défilement, boucle rAF), un `<svg>` qui tourne est remis en page et repeint à chaque image (60 mises en page et
  420 peintures/s pour 6 anneaux), un `<div>` qui tourne avec le même SVG dedans : 0 ; même caché (visibility). En pause :
  rien. (2) Une rotation lente en paliers (`steps`) : le compositeur ne dessine qu'aux changements (2 paliers/s :
  2 images/s, GPU logiciel 115 → 15 ms/s).
- Étape 3 en cours, fichiers modifiés : engine.ts (boucle gsap à la demande : réveillée par défilement, molette,
  souris, éveil, transitions, remesure ; endormie après 250 ms sans changement ; position lue dans Lenis au lieu de
  `window.scrollY` ; scènes et calques cachés ou hors écran en pause `o-paused` ; nuées posées à l'approche du lieu,
  après le chargement ; rien recalculé sous le rideau de la partie), scenery.tsx (nuées en `data-bg`, cadran du
  Sablier tourné par un `<div>`), parts.tsx (anneaux de l'astrolabe tournés par des `<div>`), OdysseeHome.tsx (plus
  de préchauffage WebGL minuté : intention réelle seulement, plus survol ou focus des cartes ; lieux et chapitres hors
  écran en pause via `data-offscreen` ; classe `is-game` ; sceau tourné par un `<div>`), odyssee.css (règles de pause,
  décor masqué sous le rideau), StageBoard.tsx (scène 3D partagée entre les lieux, minuterie d'inclinaison seulement
  pendant un sort, pause après 30 s sans geste), vfx/stage.ts (boucle arrêtée avec des objets immobiles, ralentie pour
  ceux qui scintillent, densité bornée sur appareil modeste, GPU par défaut, contexte libéré au
  démontage, attach/detach), vfx/particles.ts (rien envoyé au GPU sans particule), vfx/useVfx.ts (scène gardée 20 s
  pour l'échiquier suivant), pages.css (anneau d'/apprendre en paliers d'un dixième de degré).
- Construction « après » (instantané + mes fichiers, `outils/maj-apres.sh`), servie sur le port 3192.
- Essais intermédiaires (1 passage, `…/perf-repos/essai1`, `essai2`) : accueil au repos 80 → 7 ms/s (bureau), 125 → 6
  (mobile) ; plus de contexte WebGL ni de vfx (147 ko) sans intention ; 2 images de nuées au lieu de 10 ; fil principal
  sur 10 s de chargement ≈ divisé par deux.
- Ajouts après ces essais : Lenis `autoResize: false` + `lenis.resize()` dans measure() (≈ 120 ms de mise en page
  forcée au chargement) ; lieux 2 à 6 non rendus tant qu'ils sont cachés (`content-visibility: hidden` sur
  `.o-scene.o-paused`, nuées préchargées par `new Image()`) ; `scrollTo` réveille la boucle (sinon l'altimètre ne
  défilait plus) ; parallaxe en temps réel (constante 0,27 s = 6 %/image à 60 Hz) avec arrêt à 0,05 px ; gsap endormi
  dès qu'il n'a plus rien à jouer ; DemoBoard (non monté aujourd'hui) sans 3D tant qu'il n'est pas vu, en pause hors
  écran.
- Vérifications fonctionnelles (`outils/gestes.cjs`, `repos-long.cjs`, `sorts.cjs`, `sorts-mobile.cjs`,
  `retour.cjs`) : molette douce, bouton de l'altimètre, parallaxe, retour au repos à 0 rAF/s ; Pics : démonstration
  jouée, puis 1 rAF/s après 35 s sans geste ; Mur de glace lancé dans la partie de l'accueil : animé, puis posé,
  rAF 5,3 → 1,3-2/s (veille), suit l'échiquier au redimensionnement ; entrée et retour de la partie corrects.
- Essai écarté : MSAA coupé au-delà d'une densité 1,5 → arêtes des cristaux visiblement crénelées sur mobile. Gardé
  partout ; seule la densité est bornée à 1,5 sur appareil modeste (≤ 4 cœurs ou ≤ 4 Go).
- npm test : 12 fichiers, 227 tests passés ; `npx tsc --noEmit -p .` : sans erreur (arbre commun, avec les changements
  de l'agent « chargement »).

## Pour les autres agents (hors de mes fichiers)

- Cartes (`styles/cards.css`) : `.sc-halo` (halo 4 s infinite, `filter: blur(2px)`) garde le compositeur à 60 images/s
  sur /partie (A/B de la mesure : GPU 368 → 0 une fois figé). Réserver le halo à la carte survolée ou jouable, ou le
  mettre en pause hors de la main du joueur actif.
- `game/GamePage.tsx` : `warm` crée la scène 3D 1,6 s après l'arrivée sans aucun sort. Elle peut attendre la première
  carte touchée ou le premier sort reçu (le module peut être préchargé au repos sans créer de contexte WebGL :
  `import('../vfx/index')`). Depuis ce passage, la scène ne tourne plus en continu avec un Mur de glace ou une Faille
  posés (veille, 2 vérifications/s) et libère son contexte au démontage.
- LCP de l'accueil : la classe `.in` du chapeau (`p.o-lede`) arrive vers 0,4-0,5 s, mais Chrome ne compte le LCP qu'à
  la fin du fondu d'ouverture (≈ 2 s plus tard) : c'est la révélation animée (direction artistique), pas le chargement.
  Raccourcir ce fondu ou le retirer du premier écran est une décision de design.
- Campagne finale lancée à 21 h 39 (6 scénarios, 3 passages alternés, diagnostic), sortie
  `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf-repos/campagne/`.

## Résultats (campagne finale, médianes de 3 passages alternés, `…/perf-repos/campagne/synthese.md`)

Avant = instantané 2f1aeb6 (arbre propre à 20 h 27) ; après = même instantané + mes seuls fichiers (les changements de
l'agent « chargement » n'y sont pas). Chromium 153 headless, composition et WebGL logiciels (SwiftShader), bureau
1440 × 900, mobile Pixel 7. Charge de la machine 2 à 2,5 (d'autres agents tournaient).

| Mesure | Accueil bureau | Accueil mobile | Forêt (lieu II) | /apprendre | /partie | /jouer |
|---|---:|---:|---:|---:|---:|---:|
| Repos, fil principal (ms/s) | 71 → 7 | 121 → 5 | 61 → 25 | 0 → 0 | 1 → 1 | 0 → 0 |
| Repos, images du fil principal /s | 16,8 → 4,0 | 34 → 4,6 | 12,7 → 8,1 | 0,1 → 0,1 | 1,1 → 1,1 | 0 → 0 |
| Repos, projection à 60 Hz (ms/s) | 258 → 0 | 216 → 0 | 288 → 0 | – | – | – |
| Repos, mises en page /s (dont forcées) | 16,8 (16,4) → 0 | 0 → 0 | 14,9 (12,6) → 2,2 (0,8) | 0 | 0 | 0 |
| Repos, rAF /s | 16,8 → 0 | 34 → 0 | 13,6 → 1,7 | 0 | 0 | 0 |
| Repos, animations CSS en cours | 50 → 15 | 47 → 13 | 51 → 18 | 1 → 1 | 3 → 3 | 0 |
| Repos, images voulues au compositeur /s | 60 → 60 | 60 → 60 | 61 → 60 | 60 → 18 | 60 → 60 | 0 → 0 |
| Repos, GPU logiciel (ms/s) | 945 → 972 | 880 → 946 | 955 → 979 | 205 → 80 | 357 → 364 | 1 → 1 |
| Contextes WebGL | 1 → 0 | 1 → 0 | 2 → 1 | 0 | 1 → 1 | 0 |
| Transféré (ko) | 1 072 → 544 | 1 072 → 544 | 1 072 → 544 | 449 → 450 | 571 → 572 | 438 → 439 |
| dont JS / images (ko) | 344 / 475 → 197 / 93 | idem | idem | – | – | – |
| Fil principal, 10 premières s (ms) | 1 052 → 631 | 1 643 → 805 | 1 110 → 657 | 187 → 177 | 303 → 308 | 147 → 142 |
| Styles + mise en page au chargement (ms) | 272 → 193 | 340 → 211 | 294 → 204 | 94 → 62 | 127 → 121 | 58 → 65 |
| Blocage (ms) | 353 → 275 | 183 → 176 | 411 → 303 | 17 → 3 | 173 → 136 | 25 → 7 |
| FCP / LCP (ms) | 592 / 2 404 → 572 / 2 340 | 548 / 2 188 → 536 / 2 176 | 716 / 2 476 → 604 / 2 376 | 244 / 420 → 256 / 392 | 224 / 860 → 232 / 760 | 248 / 380 → 268 / 416 |

Lecture :
- Accueil au repos : le fil principal ne travaille presque plus (7 et 5 ms/s, contre 270 et 216 ms/s projetés à 60 Hz
  avant). Il reste ≈ 4 images/s du fil principal à 1,2-1,4 ms : les 13 à 15 animations visibles (anneaux, étoiles,
  halos des trois cartes, flèche) demandent périodiquement leur style ; aucune mise en page ni peinture.
- Le GPU logiciel au repos ne baisse pas sur l'accueil : il compose à 60 images/s les animations visibles, gardées
  telles quelles (direction artistique). Sur /apprendre, l'anneau en paliers ramène la composition de 60 à 18 images/s
  (GPU logiciel 205 → 80 ms/s).
- Forêt : la démonstration joue (un coup par seconde, un sort toutes les ≈ 5 s) ; 25 ms/s est son coût pendant
  qu'elle joue. Après 30 s sans geste elle s'arrête (Pics, 35 s sans geste : rAF 18,8 → 1 /s, mesuré à part avec
  `outils/repos-long.cjs`).
- Chargement de l'accueil : −528 ko (vfx/three.js 147 ko jamais chargé sans intention, 8 images de nuées sur 10
  différées), fil principal sur 10 s divisé par 1,7 (bureau) à 2 (mobile). LCP inchangé : il est fixé par le fondu
  d'ouverture du chapeau (voir « Pour les autres agents »).
- /partie : inchangé (halos des cartes en CSS de l'agent Cartes ; scène 3D créée par GamePage). /jouer : inchangé.

Captures : `concepts/v2/perf/repos/{avant,apres}` (PNG, non suivis par git) et planches côte à côte dans
`concepts/v2/perf/repos/comparaison/` (avant | après | différence ×4, `ecarts.txt`). Accueil et pages intérieures
identiques (écart moyen < 1/255 bureau, < 2/255 mobile) ; les lieux et la partie diffèrent par l'état des
démonstrations et des mains tirées au hasard. Comparaison contrôlée du Mur de glace (même position, même main) :
identique sur bureau, quasi identique sur mobile (densité 1,5 au lieu de 2 sur appareil modeste, conteneur à 4
cœurs). Les sorts s'animent toujours (Forêt, partie de l'accueil, Mur de glace ; `captures.log`).

Version commune (arbre de travail avec les changements de l'agent « chargement », construite à part, port 3193) :
gestes, Mur de glace, entrée et retour de la partie vérifiés, sans erreur.

## État final

- Fichiers modifiés : `src/client/odyssee/{engine.ts,OdysseeHome.tsx,odyssee.css,parts.tsx,scenery.tsx,StageBoard.tsx}`,
  `src/client/vfx/{stage.ts,particles.ts,useVfx.ts}`, `src/client/styles/pages.css` (une règle),
  `src/client/components/DemoBoard.tsx`. `PageScene.tsx` non modifié par moi (l'agent « chargement » y a ajouté
  l'import de pages.css). Pas de commit, pas de npm install, serveur 3000 non touché.
- Serveurs 3191, 3192, 3193 arrêtés, navigateurs fermés. Outils de mesure et de vérification dans
  `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf-repos/outils/`.
- Rien n'a été vérifié sur un vrai appareil ni un vrai GPU.
