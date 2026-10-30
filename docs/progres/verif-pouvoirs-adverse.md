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

- test/pouvoirs-adverse.test.ts écrit (38 tests, ≈ 30 s) : 35 verts, 3 ÉCARTS rouges (voulus) :
  - « ÉCART : Murs c3 et e3 (hors paire) et une Faille en main … » (nulle déclarée dès le Mur noir e3, alors que
    …Rd3, Faille a4, Cf2# est mat) ;
  - « ÉCART : même chose avec la Faille déjà posée … » (evaluateEnd = insufficient, canStillMate = false) ;
  - « ÉCART : Roi et Fou de cases foncées avec les Murs a3 et a5 … » (0 mat par force brute, mais evaluateEnd = null
    et canStillMate = true : gain au temps).
  Verts : Murs permanents (2 Murs 120 demi-coups, route d'un pion, double pas par la magie au-dessus d'un Mur sans
  prise en passant sur le Mur, roque, échec à travers un Mur, R4c avec rangées 3 à 6, cavaliers, pat, répétition),
  Climats (remplacement Ère glaciaire/Trêve, Présage puis Marée, Lune/Trêve, Ère glaciaire/Marée, Déflagration et
  Murs), mains visibles, tirage (30 000 tirages), anciens états (Duel, Mur à 6 coups, cartes retirées, relecture),
  160 parties au hasard (invariants + JSON/structuredClone) : aucun autre écart.
- tsc : seule erreur concepts/galerie/data.ts(200,14) (préexistante, hors flux A). Moteur inchangé depuis 4116dee.
- fin : compte rendu rendu à l'orchestrateur.

## En cours
- rien.

## Reste à faire
- (pour le flux A) corriger terrainMate : table des ensembles d'évasion minimaux (force brute scratchpad/verif/sets.ts :
  180 ensembles pour le Cavalier, 68 par couleur de fou) au lieu de WALL_MATE_PAIRS ; la Faille couvre toutes les
  cases de sa rangée ; la couleur du fou compte.

## Décisions
- Les ÉCARTS restent en place (préfixe « ÉCART ») : ce sont les preuves. Je n'ai touché à aucun fichier du moteur.

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx vitest run test/pouvoirs-adverse.test.ts` (3 ÉCARTS attendus en rouge)
- statistiques des parties au hasard : `STATS=1 npx vitest run test/pouvoirs-adverse.test.ts -t "160 parties" --silent=false`
- force brute : `./node_modules/.bin/tsx /tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/verif/brute.ts`
  et `.../scratchpad/verif/sets.ts` (≈ 3 s chacun)
