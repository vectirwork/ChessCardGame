# Progrès : vérification adverse des 8 pouvoirs (après la refonte du 30 octobre)

Agent : vérificateur indépendant (règles et moteur). Fichier à moi : test/pouvoirs-adverse.test.ts, ce journal.
Pas de commit, pas de npm install, pas de redémarrage du serveur du port 3000.

## Fait
- (début) lecture du plan (dont la décision du fondateur) et de cartes-refonte.md.

- lecture du code : src/shared/{cards,game,chess,bot}.ts, src/server/games.ts (reprise, viewFor), pgn.ts (relecture).
- force brute indépendante (scratchpad/verif/brute.ts, 3 s) : Roi + pièce mineure contre Roi, Murs (rangées 3 à 6)
  et Faille (rangée 4 ou 5). Résultats : 16 paires de Murs (identiques à WALL_MATE_PAIRS), aucun mat à un Mur,
  aucun mat à la Faille seule, Faille + 1 Mur toujours couverts. MAIS :
  - ÉCART 1 : 2 Murs posés hors paire (ex. c3 + e3) + Faille (posée ou en main) permettent un mat (Rd1, Cf2# contre
    Rd3) : evaluateEnd déclare « matériel insuffisant » (nulle prématurée), canStillMate faux.
  - ÉCART 2 : pour un fou, seules 8 paires valent selon la couleur de ses cases (clair : a3+a5 a3+b4 a5+b4 a5+b6
    g3+h4 g5+h4 g5+h6 h4+h6 ; foncé : a4+a6 a4+b3 a4+b5 a6+b5 g4+h3 g4+h5 g6+h5 h3+h5) : Roi + fou foncé et Murs a3 +
    a5 contre Roi : aucun mat possible, mais pas de nulle et canStillMate vrai (gain au temps).

## En cours
- écriture de test/pouvoirs-adverse.test.ts.

## Reste à faire
- écrire test/pouvoirs-adverse.test.ts (Mur permanent, Climats, mains visibles, tirage, anciens états, sérialisation,
  parties au hasard) ; laisser les tests qui échouent avec le préfixe « ÉCART ».

## Décisions

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx vitest run test/pouvoirs-adverse.test.ts`
