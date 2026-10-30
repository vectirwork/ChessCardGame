# Progrès : refonte des cartes (décision du fondateur du 30 octobre, 16 h 30)

Agent : ingénieur du moteur des cartes (flux A). Fichiers : src/shared/{cards,game,chess,bot,protocol}.ts,
src/server/{games,bot-worker,bot-pool}.ts, test/*.test.ts, test/integration.mjs, test/climats-serveur.mjs.
Pas de commit, pas de npm install, pas de redémarrage du serveur du port 3000.

## Fait
- (début, ≈ 16 h 40) lecture du plan, du journal cartes-moteur.md (phase 3).

- lecture du code (cards, game, chess, bot, games, tests). La phase 3 de cartes-moteur.md est sur le disque et
  commitée par l'orchestrateur (fff0f46) : checkKind par cause, Marée sous la Lune, presageRefusal, cardMateHelp,
  pendule au redémarrage, incrément du Déjà-vu.
- force brute (scratchpad/refonte/matewalls.ts, 5 min) : Roi + pièce mineure contre Roi avec des Murs sur les
  rangées 3 à 6 : aucun mat avec un seul Mur ; 16 paires de Murs permettent un mat (a3+a5, a4+a6, a3+b4, b3+a4…,
  bords a et h seulement).

## En cours
- force brute (2) : par type de pièce, et Faille + 0 ou 1 Mur (matewalls2.ts).
- modifications de cards.ts, chess.ts, game.ts.

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
