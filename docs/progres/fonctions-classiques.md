# Journal : fonctions classiques (Apprendre, Problèmes, Analyse, Mes parties, Direct)

Agent 2 (reprise après redémarrage du conteneur). Fichiers : `src/client/pages/{Learn,Puzzles,Analysis,MyGames,Live}.tsx`,
`src/client/features/*`, `src/shared/{puzzles,pgn,lessons}.ts`, `test/{pgn,puzzles,lessons}.test.ts`.
Captures : `concepts/site-fonctions/` (scénarios dans `concepts/site-fonctions/scenarios/`).

## Fait
- (agent 1) `src/shared/pgn.ts` + test, `src/shared/puzzles.ts` (41 classiques + 5 à cartes) + test,
  `src/shared/lessons.ts` (20 leçons) + test. Vérifié à la reprise : tsc propre sur ces fichiers, 24 tests verts.

## État : TERMINÉ (voir les points d'étape en bas)
Infrastructure `src/client/features/`, cinq pages, captures bureau et mobile, tsc et npm test verts (120 tests).

## Décisions
- Notation affichée en français (R, D, T, F, C) ; PGN exporté en anglais (standard), import des deux.
- Moteur : Worker dédié (`features/engine.worker.ts`), tué et relancé si une nouvelle position arrive en cours de calcul.
  Vitesse mesurée : ~25 k nœuds/s → profondeur 3 en 0,3 s, 4 en 1,5 s, 5 en 5 s.
- Relecture : profondeur fixe 3 (0,9 s max par position) ; chute des chances de gain (échelle −1..1, formule lichess)
  ≥ 0,3 = gaffe « ?? », ≥ 0,2 = erreur « ? » (`features/review.ts`).
- Liste locale des parties (invités) : `features/history.ts`, clé `sm:parties` ; `rememberView(view)` à appeler par la
  page de partie (autre agent) en fin de partie ; l'Analyse l'appelle aussi quand un joueur revoit sa partie.
- Progression locale : `sm:apprendre`, `sm:problemes`.

## Vérification
- `npx tsc --noEmit -p .` (seule erreur hors de mes fichiers : concepts/galerie/data.ts)
- `npx vitest run test/pgn.test.ts test/puzzles.test.ts test/lessons.test.ts`

## Point d'étape (reprise +1 h)
- Fait : features/{storage,history,format,BoardStage,MiniBoard,CardHand,engine,engine.worker,ui,review,EvalViews,MoveTree,PositionEditor}.ts(x),
  features.css (base + problèmes) ; pages Learn.tsx et Puzzles.tsx terminées et capturées (learn-0*, puzzles-0*).
- En cours : pages/Analysis.tsx.

## Point d'étape (reprise +2 h)
- Fait : les 5 pages (Learn, Puzzles, Analysis, MyGames, Live) écrites et capturées bureau + mobile
  (concepts/site-fonctions/*.png ; scénarios dans concepts/site-fonctions/scenarios/).
- Relecture testée sur mon serveur 3150 (DATA_DIR scratchpad/data3150) avec une partie jouée par
  scratchpad/playgame.mts (q67sKqvvaj) : courbe, erreurs, carte Faille dans la liste : OK.
- Contournement CSS : `.page { padding: … 0 … }` de global.css efface la gouttière de `.container` ;
  `.ft-page` la rétablit (les autres pages ont le même défaut : à signaler).
- Reste : npm test complet, tsc final, arrêt du serveur 3150, résumé.

## Fin (reprise +2 h 30)
- Serveur 3150 arrêté ; captures finales refaites sur le port 3000 (pages sans données propres).
- Non testé dans l'interface : l'exercice « chasse » (mater un roi seul en N coups) ; sa logique partagée est testée.
- À intégrer par d'autres : `rememberView(view)` (page de partie, fin de partie) et `rememberLocalGame(state, …)`
  (accueil, partie locale finie) depuis `src/client/features/history.ts`, pour remplir « Mes parties » des invités.
