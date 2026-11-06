# V2 : performance du chargement (D6), journal

Mission : rendre le chargement de l'accueil et des autres pages rapide et léger, sans changer l'apparence.
Hors de mon périmètre (agent « sobriété au repos ») : `src/client/odyssee/{OdysseeHome,StageBoard,scenery,engine}.tsx`,
`src/client/vfx/*`, `odyssee.css`. Pas de commit, pas de npm install, serveur 3000 non touché.

## Étapes

- [x] 1. Lecture du code (App, main, Layout, vite.config, index.html, serveur, styles)
- [x] 2. Construction de référence (arbre de travail au démarrage) dans le scratchpad, captures « avant »
- [x] 3. Changements (découpage, CSS par page, serveur : précompression, cache, préchargements ; polices : préchargement essayé puis retiré ; socket.io : hors de mes fichiers, voir plus bas)
- [x] 4. Mesures après, captures « après », tests

## Journal

- Démarrage (6 nov.) : lecture de PLAN-V2, RETOURS-FONDATEUR, v2-perf-mesure. Pas de journal précédent.
- Étape 2 : instantané de l'arbre de travail à 20 h 26 (`INSTANTANE`) copié dans
  `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf-chargement/avant` (node_modules en liens
  durs), `vite build --sourcemap` + serveur esbuild ; serveur « avant » sur le port 3181 (`serveur-avant.pid`).
  Méthode pour « après » : même instantané + mes seuls fichiers recopiés (dossier `apres`, port 3182), pour isoler mes
  changements de ceux de l'agent « repos » qui travaille en parallèle.
- Mesure de départ (1 passage, `scratchpad/perf-chargement/mesure-avant/`) : accueil 1 072 ko, FCP 608 ms, LCP 2 476 ms ;
  /jouer 438 ko ; /apprendre 449 ko ; /partie 571 ko. La compression dynamique est déjà en brotli (qualité 4).
- Composition de `index-*.js` (532 ko) : react-dom 202, gsap 69, react-router 38, OdysseeHome 33, scenery 26,
  engine.io+socket.io ≈ 40, lenis 18, CardArt 12, GameShell 11, engine 10… Brotli 11 : 147 ko au lieu de 177.
- Règles CSS réellement utilisées par page (outil `outils/regles-utilisees.cjs`) : accueil = global, cards, board,
  odyssee (ni game, ni pages, ni shell au repos) ; /jouer = global + game ; pages « ft- » = global + 8 règles de pages
  + features ; pages PageScene = global + pages (+ cards, board, Rules). Conflits d'ordre possibles entre feuilles
  (`outils/css-conflits.cjs`) : game/shell (2 règles, neutralisées par des règles plus spécifiques de game.css),
  le reste faux positifs. odyssee.css est entièrement sous `.ody` / `html.ody-home` (sauf `.o-pip-play`, accueil).
- Polices du premier écran, toutes pages : Inter, Cinzel 400 et 600, Cormorant 300 et 400 italique (latin).
  Je ne retire aucune graisse ni sous-ensemble (les invités peuvent avoir des noms en cyrillique, etc.).
- Plan : (1) accueil en lazy + rendu après chargement du code de la page (pas d'écran d'attente) ; (2) CSS : pages.css
  chargé par PageScene et features/ui, game.css par Play et la route /partie ; (3) serveur : fichiers précompressés
  brotli 11 + gzip 9, cache, HTML par page avec modulepreload du code de la page ; (4) préchargement des 5 polices.
  socket.io hors du paquet principal demanderait store.tsx et socket.ts (hors de mes fichiers) : forOthers.
- Étape 3 faite (premier jet) : `App.tsx` (pages à la demande avec `preload()`, accueil compris ; `preloadRoute()`),
  `main.tsx` (premier rendu après le code de la page ; seuls global, cards, board restent communs),
  `pages/GameRoute.tsx` (nouveau : game.css + GamePage), `Play.tsx` (game.css, préchargement de GameRoute),
  `PageScene.tsx` et `features/ui.tsx` (pages.css), `vite.config.ts` (manifeste, `.br`/`.gz` précompressés,
  préchargement des 5 polices), `src/server/site.ts` (nouveau) + `index.ts` (précompressés, cache, HTML par page avec
  modulepreload et CSS de la page). Construction « après » : `outils/construire-apres.sh`, serveur port 3182.
- Paquet principal : 545 → 309 ko (brotli 11 : 147 → 82 ko) ; CSS principal 183 → 61 ko. Accueil : Home 105 ko +
  shell (gsap + GameShell) 82 ko + petits morceaux, tous préchargés dès le HTML.
- Comparaison des styles calculés avant/après (`outils/styles-compares.cjs`, animations figées, 7 parcours avec
  navigations internes dans les deux sens, bureau et mobile) : /partie, /jouer, /apprendre, /problemes, /analyse,
  /cgu, 404, /inscription, /classement : 0 différence ; écarts restants dus au hasard (mains tirées à l'accueil, cases
  gelées de la boutique, parties en direct) et aux identifiants useId. Relance avec Math.random amorcé en cours.
- Comparaison des styles, hasard amorcé (`styles-compares-1.txt`) : 0 différence sur 7 parcours (accueil bureau et
  mobile, /jouer, /partie avec et sans cartes, /apprendre, /problemes, /analyse, /parties, /boutique, /cartes,
  /connexion, /cgu, 404, /inscription, /classement ; navigations internes dans les deux sens) hormis /direct (parties
  en cours différentes) et une marge de la boutique qui oscille entre 0 et 100 px dans les deux versions (mesure
  instable, préexistante). Polices chargées identiques partout.
- Ajout : préchargement à l'intention (survol ou focus d'un lien interne → `preloadRoute`) dans App.tsx.
- Captures dans `concepts/v2/perf/chargement/` (préfixe `chargement-avant-` / `chargement-apres-`) : premiers écrans
  identiques au pixel près pour /jouer, /apprendre (bureau et mobile) ; accueil et boutique : écarts dus aux
  animations en cours. Bandes de chargement 4G + CPU ÷4 : mobile identique ; bureau, l'accueil apparaît à 2,5 s au
  lieu de 2 s sur une prise. Hypothèse : les 5 polices préchargées (124 ko) concurrencent le JS. Variante sans
  préchargement de polices (port 3183) mesurée contre avant et après (`mesure-4g/`).
- Mesure 4G + CPU ÷4, accueil, médianes de 3 (`mesure-4g/`, charge machine 2 à 7 : autres agents actifs) :
  | | FCP bureau | LCP bureau | FCP mobile | LCP mobile |
  |---|---:|---:|---:|---:|
  | avant | 3 124 | 4 780 | 3 204 | 4 428 |
  | après, 5 polices préchargées | 3 352 | 5 132 | 3 096 | 4 828 |
  | après, sans préchargement de polices | 2 908 | 4 560 | 2 860 | 4 308 |
  → préchargement des polices retiré (il prend la bande passante du JS, sans lequel rien ne s'affiche).
- Ordre des feuilles : Vite met une feuille partagée (game.css, pages.css) après la feuille propre de la page
  (features avant pages, draft avant game), même via un petit module intermédiaire (morceaux « CSS seul » fusionnés).
  Sans effet (aucun conflit statique réel, 0 différence à l'exécution) ; ordre des imports de features/ui aligné sur
  la construction, règle écrite dans main.tsx.
- `npm test` : 12 fichiers, 227 tests passés. `node test/integration.mjs http://localhost:3182` : tout passe.
- Serveur : négociation vérifiée (br, gzip, identity, `br;q=0`), 304 sur le HTML, HEAD. Ajouts : 404 franc pour un
  fichier /assets absent (au lieu du HTML en 200) et, côté client, rechargement unique si un morceau a disparu après
  une mise en ligne (`vite:preloadError`, au plus une fois par minute).
- Campagne finale lancée (avant 3181 / après 3182, 5 scénarios × 3 passages + diagnostic, `campagne/`).

- Captures finales (`concepts/v2/perf/chargement/`, planches `chargement-comparaison-*.png`) : premiers écrans
  identiques au pixel près (/jouer, /apprendre, bureau et mobile ; /cartes à 1 px), accueil et boutique : écarts dus
  aux animations en cours. Bandes 4G + CPU ÷4 : accueil et /jouer complets à 1,5 s au lieu de 2 s, même rendu final.
- Version intégrée (arbre de travail avec les changements de l'agent repos) construite dans `integre/`, port 3184 :
  11 pages sans erreur console, préchargement au survol vérifié ; morceau disparu → un seul rechargement, pas de
  boucle. `npx tsc --noEmit -p .` OK, `npm test` 227/227 (état final).
- Serveurs 3181, 3182, 3183, 3184 arrêtés ; navigateurs de mes scripts fermés (celui qui reste est aux captures de
  l'agent repos). Rien de vérifié sur un vrai appareil ni derrière Caddy (HTTP/2) : mesures en local, HTTP/1.1.

## État final

Fichiers : `vite.config.ts`, `src/client/{App,main}.tsx`, `src/client/pages/{GameRoute (nouveau),Play,PageScene}.tsx`,
`src/client/features/ui.tsx` (imports), `src/server/{site.ts (nouveau),index.ts}`. Aucun commit.

## À transmettre (hors de mes fichiers)

- socket.io hors du paquet principal (≈ 40 ko, 13 % de `index-*.js`, ≈ 12 ko brotli) : `store.tsx` importe
  `resetSocket` de `socket.ts`, qui importe socket.io-client. Correctif : petit module `socketReset.ts` (référence de la
  connexion + `resetSocket()`), `socket.ts` y enregistre sa connexion et le réexporte, `store.tsx` importe de là.
- Accueil (agent repos) : texte du héros (`.o-rv`, `p.o-lede`) en `opacity: 0` jusqu'à la timeline JS = LCP ; nuages
  (475 ko) posés d'emblée ; préchauffage WebGL minuté ; `StageBoard` importé statiquement (lieux II à V).
- /partie (`game/GamePage.tsx`) : `warm` charge three.js 1,6 s après l'arrivée, sans sort ; à charger au premier sort.
- Nouvelle page : l'ajouter dans `App.tsx` (Routes **et** PAGES) et dans `src/server/site.ts` (PAGES) pour qu'elle soit
  préchargée dès le HTML (sinon elle marche, après un écran d'attente).
- CSS : les feuilles de page arrivent avec leur page, dans un ordre variable ; ne jamais compter sur l'ordre des
  feuilles pour départager deux règles de même spécificité (règle écrite dans main.tsx).
- Campagne 1 (`campagne/`, charge 1 à 5,6) : transferts accueil 1 072 → 1 024 ko, /jouer 438 → 376, /partie 571 → 483,
  /apprendre 449 → 349 ; CSS chargé accueil 179 → 119 ko, /jouer 189 → 101, /apprendre 200 → 119 ; JS chargé /jouer
  632 → 525, /apprendre 651 → 454, /partie 1 199 → 1 091. LCP /jouer 484 → 416, /apprendre 360 → 272, mais FCP des
  pages intérieures +50 ms et /partie LCP 784 → 852 : attendre le code avant le premier rendu retardait /api/me et la
  session. Correctif : seul l'accueil attend son code (comme avant, il s'affichait d'un coup) ; les autres pages
  s'affichent comme avant (en-tête + attente), leur code étant préchargé dès le HTML. Reconstruit, à remesurer.
- Campagne 2 (`campagne2/`, charge 1,1 à 2,8, médianes de 3, local sans limitation) après ce correctif :
  /jouer FCP 264 → 240, LCP 400 → 376 ; /apprendre FCP 284 → 256, LCP 464 → 396 ; accueil FCP 704 → 656,
  LCP 2 476 → 2 420, fil principal au chargement 1 114 → 1 044 ms ; /partie égal au bruit près (LCP 776 / 820,
  étendues 716-824 / 668-888). Série 4G + CPU ÷4 finale lancée (`campagne-4g/`).
- Série finale 4G simulée + CPU ÷4 (`campagne-4g/`, médianes de 3, ms) :
  | | FCP avant → après | LCP avant → après | blocage avant → après |
  |---|---|---|---|
  | accueil bureau | 3 364 → 3 068 | 4 668 → 4 564 | 1 613 → 1 483 |
  | accueil mobile | 3 024 → 2 840 | 4 272 → 4 320 (bruit) | 1 232 → 1 131 |
  | /jouer | 2 004 → 1 468 | 2 340 → 1 828 | 118 → 92 |
  | /apprendre | 2 028 → 1 704 | 2 768 → 2 192 | 338 → 245 |
  | /partie | 2 012 → 1 788 | 3 036 → 2 740 | 572 → 424 |
  Le LCP de l'accueil reste fixé par le fondu JS du héros (hors de mes fichiers).
