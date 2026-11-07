# V2 : corrections finales (après recette QA et relecture)

Ingénieur chargé des corrections. Sources : comptes rendus QA (docs/progres/v2-qa.md) et relecture
(docs/progres/v2-revue.md, test/v2-revue.test.ts). Pas de commit, serveur 3000 non touché.

## Étapes
- [x] Lecture du plan, des retours, des journaux QA et revue.
- Outils : scratchpad `correction/` (sync-build.sh copie l'arbre et construit en production dans `cur/`, serve.sh
  PORT, stop.sh ; lib.cjs repris de la QA). Mon instance : port 3301. Référence f32af47 : build QA `qa/ref`
  relancé au besoin sur 3302.
- [x] Glisser à la souris (QA 1, bloquant) : board.css `.board-wrap` en user-select: none (+ -webkit-user-drag:
  none sur ses descendants), Board.tsx : preventDefault au pointerdown souris (focus extérieur rendu comme un clic
  normal) et onDragStart bloqué. Script drag5.cjs (5 glissers de suite) : f32af47 2/5, 2/5, 1/5 (dragstart +
  pointercancel) ; corrigé 5/5 sur partie contre l'IA, accueil, /analyse.
- [x] Bulle `.card-bubble.is-floating` (revue 1) : déplacée de shell.css vers cards.css (chargé partout).
- [x] Statut mobile écrasé (revue 2) et main adverse mobile qui touche le nom et l'avatar (QA 4) :
  - layout.ts : `MOBILE_BOARD_TOP` 112 → 118 (bande adverse descendue de 50 à 56 px), et l'échiquier mobile est
    borné par `MOBILE_BELOW` = 56 + 160 + 40 (bandeau, éventail avec invite, 40 px de statut minimum) ;
  - invite et message posés sur le haut de l'éventail (chevauchement de 18 px, z-index 2, sans bloquer le toucher)
    au lieu de 24 px au-dessus : has-fan-note ne retire plus que 14 px au statut (200 → 160 et 205 → 160) ;
  - téléphones ≤ 700 px de haut : l'éventail est déjà resserré (cartes de 72 px), le statut reprend la place
    (règles @media) et la consigne s'efface sous l'invite.
  - Mesures (375×667, IA) : statut 0 → 63 px avec l'invite, titre lisible ; échiquier 333 → 293 px. Cartes
    adverses y = 51 à 105, nom jusqu'à 48 (accueil 52), échiquier (cadre) à 108 : plus de contact.
  - test/v2-revue.test.ts : 7/7.
- [x] Main adverse sur ordinateur (QA 3) : nom jamais coupé dans un mot (`word-break: keep-all`, plus
  d'`overflow-wrap: anywhere`), taille calculée pour « Déflagration » (7,7 fois la taille du texte, mesuré en
  Cinzel 800 chargée) ; plusieurs mots → deux lignes au-delà de 72 % de la carte ; pastille courte sur une ligne
  pour les cartes adverses (« + coup », « Remplace », libellé entier « + son coup » en title et aria-label) ;
  chevauchement 16 % → 10 % ; layout.ts décale l'échiquier vers la gauche si besoin (DESKTOP_OPP_ROOM) : cartes
  adverses de 54 → 65 px en 1440×900 et 62 → 68 px en 1280×720. Script oppfan3.cjs (densité 3).
- [x] Petits défauts : EffectChips (« toute la partie » pour un effet permanent, fonction remainingText) ; accueil
  « Plus d'options (couleur, cadence) » ; invite masquée une fois la partie finie (`!p.result`) ; élision
  (`game/names.ts`, deNom : « d'Alice », « de Bruno », « de l'IA Sorcier », « des Blancs » ; corrige aussi
  « Cartes de des Blancs » et « Cartes de Les Blancs ») ; CardDraft : l'expiration et l'alerte des 10 s se
  réarment quand l'échéance repart (redémarrage du serveur) ; draft.css mobile : fond plein sous la barre collée.
- [x] Leçon « Jouer une carte » : consignes « la carte, puis « Lancer ce sort », puis la case » (étapes 2 et 3,
  indice de la Trêve) ; la main vient à l'écran si elle est sous le pli ; la bulle des leçons s'arrête sous
  l'en-tête collé (CardHand).
- [x] Héros de l'accueil : « remplace votre coup » à côté du nom d'un Rituel, consigne « Touchez-en un pour le lire
  et le lancer » (+ « les autres sorts s'ajoutent à votre coup » s'il y a un Rituel).
- [x] WebGL de /partie : plus de minuterie ; module vfx préchargé au repos seulement après le choix et dans une
  partie avec cartes ; scène créée à la première intention (survol, toucher ou choix d'une carte : nouveau
  `onCardIntent` de GameShell), au premier sort reçu (attente ≤ 1,2 s) ou si un effet persiste.
- [x] Repos : halo des cartes sans `filter: blur`, 3 respirations puis figé (infini au survol, ouvert, choisi) ;
  accueil : `data-still` après 30 s sans geste fige les décors en boucle, le premier geste les relance.
- [x] LCP de l'accueil : entrée du héros en CSS au premier rendu, le chapeau (élément LCP) jamais à opacité nulle.
  Sonde lcp.cjs (5 passages) : local 2 292 → 516 ms (= FCP) ; mobile 4G + CPU ÷4 : 3 400 → 2 736 ms (= FCP).
  StageBoard chargé à part (lazy, préchargé au repos ou au premier défilement).
- [x] Barre du haut sur ordinateur : `--gs-left` (bord gauche de l'échiquier) posé par GameShell ; `.gs-top` s'arrête
  avant l'échiquier, « Partie locale · aucun compte » passe sur deux lignes au lieu de toucher le cadre (vu sur les
  captures 1440×900 après le décalage de l'échiquier).
- [x] Tests : `test/v2-correction.test.ts` (11 tests : glisser, deNom, effets permanents, main adverse 1280 à 1920,
  bande mobile, leçon) ; `test/glisser.mjs <url>` (5 glissers de suite sur partie IA, accueil, /analyse ; échoue
  sur f32af47 dès le 1er glisser : texte sélectionné). `npx tsc` OK, `npm test` 14 fichiers, 245 tests verts.
- [x] `node test/integration.mjs http://localhost:3301` (production, base neuve) : tous passés.
- [x] Redémarrage pendant le choix (script de la revue) : après le retour du serveur, 0 carte bloquée, choix et
  validation possibles. WebGL /partie : aucun contexte ni module pendant le choix ; module préchargé après ; contexte
  créé au survol d'une carte. Bulle des leçons ouvertes directement : position fixed, visible (1280×720, 1024×600).
- [x] Captures finales : `concepts/v2/final/` (accueil, carte ouverte, main adverse, choix, mains révélées, partie ;
  1440, 1280, 390×844, 375×667) ; aucune erreur de page ni de console.
- [en cours] Mesure finale : `mesure.mjs` ref f32af47 (build QA, port 3302) contre l'actuelle (3301), 5 scénarios,
  3 passages + diagnostic (`correction/perf1`), puis accueil bureau et mobile en 4G + CPU ÷4 (`correction/perf4g`).
