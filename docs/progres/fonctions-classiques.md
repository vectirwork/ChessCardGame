# Journal : fonctions classiques (Apprendre, Problèmes, Analyse, Mes parties, Direct)

Agent 2 (reprise après redémarrage du conteneur). Fichiers : `src/client/pages/{Learn,Puzzles,Analysis,MyGames,Live}.tsx`,
`src/client/features/*`, `src/shared/{puzzles,pgn,lessons}.ts`, `test/{pgn,puzzles,lessons}.test.ts`.
Captures : `concepts/site-fonctions/` (scénarios dans `concepts/site-fonctions/scenarios/`).

## Fait
- (agent 1) `src/shared/pgn.ts` + test, `src/shared/puzzles.ts` (41 classiques + 5 à cartes) + test,
  `src/shared/lessons.ts` (20 leçons) + test. Vérifié à la reprise : tsc propre sur ces fichiers, 24 tests verts.

## En cours
- Infrastructure client `src/client/features/` puis pages.

## Reste à faire (dans l'ordre)
1. features : storage.ts, history.ts, format.ts, BoardStage.tsx (échiquier + flèches/étoiles/marques),
   MiniBoard.tsx, CardHand.tsx, EffectsLine.tsx, engine.ts + engine.worker.ts, features.css
2. Learn.tsx  3. Puzzles.tsx  4. Analysis.tsx (+ éditeur, arbre, courbe)  5. MyGames.tsx  6. Live.tsx
7. Captures bureau + mobile ; tsc ; npm test.

## Décisions
- Notation affichée en français (R, D, T, F, C) ; PGN exporté en anglais (standard), import des deux.
- Moteur : Worker dédié (`features/engine.worker.ts`), tué et relancé si une nouvelle position arrive en cours de calcul.
  Vitesse mesurée : ~25 k nœuds/s → profondeur 3 en 0,3 s, 4 en 1,5 s, 5 en 5 s.
- Relecture : erreurs graves = perte ≥ 300 cp (gaffe « ?? »), erreur 150 à 300 (« ? »), évaluations bornées à ±1500.
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
