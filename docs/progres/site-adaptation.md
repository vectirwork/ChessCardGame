# Journal : adaptation du site au jeu final (8 pouvoirs, mains visibles)

Mission (30 octobre, après la refonte du moteur 4116dee) : leçons, problèmes, accueil, fonctions classiques,
DemoBoard, recherche des cartes retirées dans src/client. Captures : concepts/site-adaptation/.
Fichiers à moi : src/client/odyssee/*, src/client/pages/Home.tsx, src/client/ai/*, src/client/features/*,
src/client/pages/{Learn,Puzzles,Analysis,MyGames,Live}.tsx, src/shared/{lessons,puzzles,pgn}.ts,
test/{lessons,puzzles,pgn}.test.ts, src/client/components/DemoBoard.tsx, concepts/galerie/data.ts (typage seul).

## Fait
- Lecture du plan, du compte rendu de la refonte, des journaux accueil et fonctions classiques.
- Problèmes (src/shared/puzzles.ts) : les 5 problèmes Duel remplacés par 8 problèmes sur les pouvoirs :
  carte-mur-sauve, carte-mur-enferme, carte-faille, carte-ere-glaciaire, carte-maree, carte-lune (Lune noire
  déjà en jeu), carte-deflagration (Déflagration déjà en jeu, gain de matériel), carte-main-visible (Mur noir en main).
  Nouveautés : `effects` (pouvoir déjà en jeu, EffectSpec + withEffects), catalogue 'climats' pour les problèmes
  à cartes, Faille acceptée sur n'importe quelle case de la rangée (sameAction). test/puzzles.test.ts : 14 verts
  (unicité de la carte par énumération de toutes les cartes et cibles, mat confirmé par analyse()).
  Positions trouvées avec les scripts du scratchpad site/ (lab.ts, gen*.ts, show*.ts).

- Leçons (src/shared/lessons.ts) : groupe « Les cartes » refait : cartes (mains visibles, Mur en e5 permanent, Mur
  qui sauve sur la colonne h), catalogues (Pouvoirs / Sans cartes, familles), deux-camps (Mur noir qui bloque la
  tour blanche, Ère glaciaire noire), presage-rituel (textes corrigés), mur-magie (la magie cède, le Mur fond),
  mains-visibles (Faille noire en main). LessonStep.effects (même EffectSpec que les problèmes).
  test/lessons.test.ts : 9 verts.

## En cours
- Client : CardHand (main adverse visible), Learn, Puzzles.

## Reste à faire
1. Leçons des cartes (lessons.ts:438 Mur en 1re rangée, textes « 6 coups », Portails).
2. Problèmes à cartes : >= 6 sur les 8 pouvoirs, vérifiés par le moteur.
3. Accueil : main IA visible, textes des lieux, démos 8 pouvoirs, feuille « Défier un ami », rememberLocalGame,
   mobile 390x844.
4. Fonctions classiques : mains visibles, Mur permanent, cartes retirées tolérées, libellés.
5. DemoBoard.
6. Recherche coronation/cavalcade/portals/deja_vu/Duel/cachées dans src/client.

## Décisions

## Commandes de vérification
- npx tsc --noEmit -p .
- npm test
