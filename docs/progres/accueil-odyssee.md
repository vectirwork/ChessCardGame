# Progression : Accueil Odyssée (flux B)

Mission : porter concepts/odyssee/ dans src/client/odyssee/, IA en Worker (src/client/ai/), Layout, global.css,
App.tsx, main.tsx, public/. Captures dans concepts/site-accueil/.

## Historique
- Agent 1 (interrompu par redémarrage) : a écrit src/client/ai/*, src/client/odyssee/* (OdysseeHome, StageBoard,
  engine, scenery, data, parts, shell/GameShell, useLiveGame, useHumanQueue, odyssee.css), Layout.tsx, global.css,
  App.tsx, main.tsx, Home.tsx. Captures 01 à 08. Coupé pendant le scénario s2-sort-et-retour.
- Agent 2 (reprise) : en cours.

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
## En cours
- Captures lieux et mobile.
## Reste à faire
- Captures lieux (forêt, bazar, seuil), mobile 390 × 844 (accueil, jeu, carte), mouvement réduit.
- Vérifier en-tête / pied de page sur d'autres pages (/boutique, /apprendre).
- forOthers : documenter GameShell, jetons de global.css.
## Décisions
## Commandes de vérification
- npx tsc --noEmit -p .
- npm test
- node concepts/_tools/shoot.cjs concepts/site-accueil/scenarios/<s>.json
