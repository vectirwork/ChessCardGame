# Journal : adaptation du site au jeu final (8 pouvoirs, mains visibles)

Mission (30 octobre, après la refonte du moteur 4116dee) : leçons, problèmes, accueil, fonctions classiques,
DemoBoard, recherche des cartes retirées dans src/client. Captures : concepts/site-adaptation/.
Fichiers à moi : src/client/odyssee/*, src/client/pages/Home.tsx, src/client/ai/*, src/client/features/*,
src/client/pages/{Learn,Puzzles,Analysis,MyGames,Live}.tsx, src/shared/{lessons,puzzles,pgn}.ts,
test/{lessons,puzzles,pgn}.test.ts, src/client/components/DemoBoard.tsx, concepts/galerie/data.ts (typage seul).

## Fait
- (rien encore) lecture du plan et des journaux.

## En cours
- Inventaire.

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
