# Progrès : refonte des cartes (décision du fondateur du 30 octobre, 16 h 30)

Agent : ingénieur du moteur des cartes (flux A). Fichiers : src/shared/{cards,game,chess,bot,protocol}.ts,
src/server/{games,bot-worker,bot-pool}.ts, test/*.test.ts, test/integration.mjs, test/climats-serveur.mjs.
Pas de commit, pas de npm install, pas de redémarrage du serveur du port 3000.

## Fait
- (début, ≈ 16 h 40) lecture du plan, du journal cartes-moteur.md (phase 3).

## En cours
- lecture du code (cards, game, chess, bot, games).

## Reste à faire
1. Phase 3 restante (tests de règles, IA Portails -> sans objet).
2. Retrait Couronnement, Chevauchée, Portails, Déjà-vu.
3. Mur de glace permanent (climats), durée ancienne en Duel.
4. Mains visibles (viewState).
5. Catalogues proposés : climats, aucune ; duel refusé/ramené.
6. Tirage pondéré pour 8 cartes.
7. IA : cartes adverses visibles.
8. Tests, tsc, npm test, integration.mjs, climats-serveur.mjs sur ma propre instance.

## Décisions

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx tsc --noEmit -p .`
- `npm test`
