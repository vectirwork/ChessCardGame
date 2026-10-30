# Progression : Accueil Odyssée (flux B)

Mission : porter concepts/odyssee/ dans src/client/odyssee/, IA en Worker (src/client/ai/), Layout, global.css,
App.tsx, main.tsx, public/. Captures dans concepts/site-accueil/.

## Historique
- Agent 1 (interrompu par redémarrage) : a écrit src/client/ai/*, src/client/odyssee/* (OdysseeHome, StageBoard,
  engine, scenery, data, parts, shell/GameShell, useLiveGame, useHumanQueue, odyssee.css), Layout.tsx, global.css,
  App.tsx, main.tsx, Home.tsx. Captures 01 à 08. Coupé pendant le scénario s2-sort-et-retour.
- Agent 2 (reprise) : terminé (voir Fait).

## Fait
- État évalué (agent 2) : tsc OK sur nos fichiers (seule erreur : concepts/galerie/data.ts, prototype, pas à nous).
  npm test : 104/105, l'échec est test/climats-random.test.ts (flux A, « relaxed: expected 0 »), pas à nous.
  Captures 01 à 08 bonnes (accueil, éveil, pièce choisie, transition, immersif, réponse, carte, sort).
  Le catalogue 'climats' est déjà actif (Ère glaciaire, Grande Marée, Lune de sang en main).
- Coque : pendant le ciblage d'un sort, niveau / humain / actions masqués (ils chevauchaient l'éventail) ;
  voile sombre derrière la colonne de statut ; statut borné en hauteur (défile au-delà, jamais sur l'éventail).
- BUG corrigé : playCast (vfx, flux A) ne résout jamais pour une carte sans animation (cartes Climats : pas de
  `default` dans le switch) → la partie restait figée sur « Le sort se déploie… ». Garde-fou dans useLiveGame.runCast
  (CAST_WATCHDOG_MS = 4200 : l'état est appliqué même si l'animation ne rend pas la main).
- Nouveau composant shell/EffectChips.tsx (effets globaux et Présages en cours), branché dans le HUD de l'accueil.
- Consigne « Sort lancé : jouez maintenant votre coup » après un sort.
- Captures 07, 08, 09, 09b, 10, 11, 12 (s2-sort-et-retour, s3-sort-garde-fou-reprise) : OK, reprise au rechargement OK.
- castSafely.ts (garde-fou commun) branché aussi dans StageBoard (démos des lieux figées sinon).
- Bazar : colonne trop haute (débordait sur le Seuil) → liens boutique en ligne dans le texte, resserrage
  @media (max-height: 1000px). Bouton « Jouer / Reprendre · coup N » visible aussi sur ordinateur pendant la descente.
- Captures 20 à 28 (lieux, bazar, seuil, invitation, pied de page) : OK.
- Mobile (captures 30 à 35) : titre de l'accueil limité à 44vw par erreur (corrigé) ; dans la partie, le bouton
  « Lancer le sort » était caché sous l'éventail → coque : sur mobile, pendant un ciblage, le sort remplace le titre
  et ses boutons sont sur la ligne du nom ; niveau / humain / actions repliés sous « Options de la partie ».
  Nouvelle prop GameShell `info` (toujours visible : EffectChips).
- Mobile, premier écran : l'échiquier défile avec son texte (engine.scrollPose, heroShift) au lieu de rester posé
  sur les options ; la traversée des nuées attend la fin du texte (padding-bottom 26vh, fondus mobiles retardés).
- Rappel « Jouer / Reprendre · coup N » : ordinateur → portail dans l'en-tête (#header-slot ajouté dans Layout,
  juste avant le bouton Menu) ; mobile → bas centré.
- Mouvement réduit vérifié (captures 40 à 42, outil scratchpad shoot-reduced.cjs : playwright reducedMotion).
- En-tête / menu vérifiés sur /boutique et /apprendre (captures 50 à 52).
- File amicale testée de bout en bout : deux visiteurs → même /partie/:id (capture 60 ; script scratchpad queue-test.cjs).
- public/ : og.jpg refaite au style Odyssée (script concepts/site-accueil/scenarios/og.cjs), favicon et icônes
  192/512 redessinés (étoile d'or dans son cercle), manifeste aux couleurs --ink.
- npm test : 119/120 ; l'échec est test/climats-random.test.ts (flux A, tirage pondéré), pas à nous.
- Scène 3D de la partie (three.js) plus créée au chargement : à la première intention (survol d'une pièce jouable,
  toucher, carte, play()) ou au repos ~3,4 s après l'ouverture (requestIdleCallback). Mesuré : plus aucune tâche
  longue three.js au premier affichage. Dans le bac à sable (WebGL logiciel + charge), cette création bloque la page
  de 7 à 20 s : les scénarios attendent `scenarios/calme.js` avant le premier geste.
- Scénarios relus et repassés : s3 (sort du joueur, sort de l'IA « Faille », Présage, rechargement) OK.
## En cours
- Rien : mission terminée côté accueil (voir Reste à faire pour les suites possibles).
## Reste à faire (hors de nos fichiers ou suites possibles)
- vfx (flux A) : playCast n'a pas de `default` → sans castSafely, une carte non animée fige la partie.
- GamePage (partie en ligne) : badge « Classée » affiché pour toute partie `quick`, même amicale (rated: false).
- index.html (hors répartition) : titre / description encore « Les échecs ont des pouvoirs », theme-color #0a0b17.
## Décisions
- Coque GameShell : `info` toujours visible ; `statusExtra` + `actions` masqués pendant un ciblage, repliés sous
  « Options de la partie » sur mobile ; sur mobile, pendant un ciblage, le sort remplace le titre.
- Rappel de partie pendant la descente : portail dans #header-slot (ordinateur), bas centré (mobile).
## Commandes de vérification
- npx tsc --noEmit -p .
- npm test
- node concepts/_tools/shoot.cjs concepts/site-accueil/scenarios/<s>.json
