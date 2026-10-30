# Progrès : flux A, moteur des cartes (catalogue « climats »)

Reprise (2e agent) après redémarrage du conteneur. Travail du 1er agent : instantanés git 1b302b6 et 1b4b50b.

## Fait (état évalué à la reprise)
- cards.ts (12 cartes, `catalogs: CardCatalog[]`, `catalog` gardé en déprécié = premier catalogue, `cardsOf`, `inCatalog`,
  `RARITY_WEIGHT`, `humanOnly`), chess.ts (Mods Climats, F_BLAST/F_PORTAL/F_RELAXED, roque avec modsAfter),
  game.ts (Présage, Rituel, R6, Déjà-vu, tirage pondéré, `viewState`, `clockRate`, `incrementSuspended`, `checkKind`,
  `modsSequence`), bot.ts (modificateurs par demi-coup, quiescence Trêve/Lune, chooseBotCard générique avec Présage),
  server/games.ts (commitMove/commitCard exportés : Sablier, Déjà-vu, cinématiques R10, restauration).
- tsc : seule erreur dans concepts/galerie/data.ts (Record<CardId,…> incomplet, fichier hors flux A).
- test/climats.test.ts : 51 tests verts. game/chess/bot : verts.
- test/climats-random.test.ts : tirage OK ; 300 parties Climats OK sauf l'assertion « relaxed > 0 » (R6 jamais atteint
  au hasard depuis la position initiale).

- test/climats-random.test.ts : R6 exercé par 200 positions bloquées au hasard (Ère glaciaire ou Murs) ; invariants
  enrichis (aucune vue ne révèle une carte cachée) ; fichier vert en ≈ 65 s.
- test/server-clock.test.ts : 6 tests verts (Sablier, Déjà-vu, Déjà-vu qui efface l'arrivée du Sablier, Marée, Duel,
  ancien état sans catalogue).

- bot.ts : coup nul en quiescence quand l'adversaire devra prendre au coup suivant (Lune de sang) : l'IA ne lance
  plus la Lune dans la position de la relecture (avant : elle la lançait et perdait le fou).
- test/bot.test.ts : 7 tests Climats (quiescence Lune, coup nul, Présage de Chevauchée, R6, R4c, Déjà-vu + decide(),
  Marée refusée dans l'Écossaise, budget de temps). Verts.
- bot-worker : commentaire Rituel/Déjà-vu.

## En cours
- test/integration.mjs : catalogue + carte globale ; vérifier sur ma propre instance (PORT 3157, DATA_DIR /tmp/...).

## Reste à faire
- npx tsc, npm test, résumé final.

## Décisions
- R5 (échec vu avec les effets du prochain coup adverse) s'applique à tous les catalogues (Duel compris).

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx tsc --noEmit -p .`
- `npx vitest run test/climats.test.ts test/climats-random.test.ts`
- `npm test`
