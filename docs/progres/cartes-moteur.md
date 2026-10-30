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

- test/integration.mjs : catalogue Climats par défaut, carte globale (Présage public, Rituel, Déjà-vu), Duel et Sans
  cartes par invitation, catalogue inconnu refusé, file amicale Duel, pas de Sablier contre l'IA. Vérifié 12 fois sur
  ma propre instance (cartes jouées : tide, rift, portals, truce, blood_moon, ice_wall, blast, ice_age, cavalcade,
  hourglass) ; un échec isolé non reproduit au 4e passage sur la même instance (message d'erreur enrichi depuis).
  Instance : scratchpad/start-server.sh et stop-server.sh (PORT 3157, groupe de processus, PID noté).

- test/climats.test.ts : test « Cumul des Terrains » (Mur, Faille, Portails sur des cases distinctes).
- bot.ts : sans coup légal, chooseBotCard joue toujours une carte (R4c), même si le temps manque.
- Auto-jeu IA niveau 2 (6 parties, script scratchpad/selfplay.ts) : aucune exception, cartes jouées (Mur, Faille, Lune,
  Chevauchée, Couronnement, Déjà-vu).
- tsc : seule erreur concepts/galerie/data.ts (hors flux A). npm test : 9 fichiers, 119 tests verts (avant le test
  « Cumul »).

## Terminé (15 h 25)
- `npx tsc --noEmit -p .` : seule erreur concepts/galerie/data.ts:200 (Record<CardId,…> sans les 12 cartes Climats ;
  fichier hors flux A, à corriger par l'orchestrateur : Partial<Record<…>> ou entrées ajoutées).
- `npm test` : 9 fichiers, 120 tests verts, ≈ 67 s (climats-random ≈ 65 s à lui seul).
- Instance serveur arrêtée ; aucun navigateur lancé.

## Pour l'orchestrateur
- `CARDS[id].catalog` est déprécié (premier catalogue : le Mur de glace y vaut 'climats') : src/client/odyssee/data.ts
  (l. 45) et src/client/odyssee/StageBoard.tsx (l. 33) filtrent encore par `.catalog ===` : le Duel y perd le Mur de
  glace. Remplacer par `cardsOf(catalog)` / `inCatalog(id, catalog)`.
- Parties locales contre l’IA (src/client/odyssee/useLiveGame.ts l. 42) : sans pendule, le Sablier est déjà exclu ; avec
  une pendule, passer `{ vsBot: true }` à `dealHands`.

## Décisions
- R5 (échec vu avec les effets du prochain coup adverse) s'applique à tous les catalogues (Duel compris).

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx tsc --noEmit -p .`
- `npx vitest run test/climats.test.ts test/climats-random.test.ts`
- `npm test`

## Phase 3 : correctifs après vérification adverse (démarrée ≈ 16 h 15)
Problèmes à traiter (rapports verif-climats-regles.md et verif-climats-serveur-ia.md) :
1. Pat par magie (Chevauchée annoncée) ; 2. R4b contournée par Présage ; 3. matériel insuffisant avec Mur en main ;
4. checkKind 'melt' au lieu de 'arrival' ; 5. pendule au redémarrage ; 6. Marée sous la Lune ;
7. Déjà-vu : incrément du coup effacé gardé ; 8. IA : Portails jamais joués.
### Fait (phase 3)
- game.ts : checkKind attribue la cause (arrivée seule, puis fonte seule, puis fermeture seule, sinon priorité fixe) ;
  Grande Marée refusée sous la Lune si une capture est jouable (« La Lune de sang impose une capture. ») ;
  presageRefusal (dans validateAfterCard) : pat de l'adversaire à sa réponse (lanceur qui « passe ») et R4b à
  l'arrivée (les deux « passent »), chaque fois avec/sans le nouvel effet ; cardMateHelp : Mur (main ou posé),
  Chevauchée (main/annoncée/active) avec un fou, Résurrection -> pas de nulle par matériel, canStillMate vrai.
  Force brute (scratchpad/fix/mataid.ts) : Faille 0 mat avec une pièce mineure, Chevauchée + fou 396 mats.
- games.ts : stopClock renvoie l'incrément, TurnMark.inc ; Déjà-vu reprend l'incrément du coup effacé au lanceur ;
  flushRooms fige la pendule (settleClock exportée) ; saveRoom note savedAt ; resumeClock décompte
  (savedAt - since) x vitesse après un arrêt brutal.
- server-clock.test.ts : 10 tests verts (attentes Déjà-vu corrigées : -2 s d'incrément ; 15+10 ; Rituel effacé ;
  redémarrage normal ; arrêt brutal sous Sablier). Banc : marque du tour 0 ajoutée (begin() la crée en vrai).
- Les 4 tests ÉCART de climats-adverse.test.ts passent.
### En cours
- tests de règles (nouveaux cas dans climats.test.ts), puis IA Portails, puis npm test complet, puis serveur.
