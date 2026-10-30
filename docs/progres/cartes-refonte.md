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

- force brute (2), matewalls2.ts : les 16 paires valent pour le fou comme pour le cavalier ; une Faille (4e ou 5e
  rangée) peut fournir une case de la paire, jamais seule.
- cards.ts : 4 cartes retirées ; Mur permanent (`permanent`), CATALOGS = Pouvoirs + Sans cartes ;
  `offeredCatalog()` (Duel et inconnu -> climats).
- chess.ts : Portails, Chevauchée, Couronnement retirés (F_PORTAL, Move.via, Mods.portals/leapAll/crown).
- game.ts : Effect.permanent ; HandCard.card non nul, sans `revealed` ; viewState(s) sans masque ; instantanés
  seulement en Duel ; MoveRef.to obligatoire ; Mur rangées 3 à 6 (Duel : partout) ; checkKind 'now'|'melt'|'close' ;
  presageRefusal réduit à R4b à l'arrivée (les autres branches ne peuvent plus servir : aucun Climat ne change les
  attaques) ; matériel insuffisant : WALL_MATE_PAIRS + terrainMate (Pouvoirs), ancienne règle en Duel ;
  describeCardPlay tolère une carte retirée (anciens journaux).
- bot.ts, bot-worker.ts : Portails, Déjà-vu retirés.
- games.ts : TurnMark/turnMarks/noteIncrement retirés ; partie en cours avec une carte retirée (main ou effet) ->
  annulée à la reprise ; POST /api/games : 'duel' ramené à 'climats', inconnu -> 400 ; queue:join et revanche :
  offeredCatalog.
- test/climats.test.ts réécrit (52 tests verts).

- tests mis à jour et verts : climats.test.ts (52), climats-random.test.ts (6, ≈ 60 s), server-clock.test.ts (7),
  bot.test.ts (11), climats-adverse.test.ts (39, ≈ 70 s ; les 4 ÉCARTS : R4b corrigé, pat par magie et checkKind
  « arrivée » sans objet, matériel insuffisant revu ; 32 positions de mat de la force brute vérifiées).
- test/lessons.test.ts échoue : src/shared/lessons.ts:438 (leçon des cartes, étape 3) pose un Mur en f1…b1, hors des
  rangées 3 à 6 (fichier du flux B : signalé, non corrigé).

- test/integration.mjs et test/climats-serveur.mjs adaptés (mains visibles, Pouvoirs, Duel ramené, scénario
  « mur » à la place de « dejavu »). Verts sur mon instance (port 3163, scratchpad/refonte/start.sh et stop.sh,
  base dans scratchpad/refonte/data) : integration.mjs ; climats-serveur.mjs sablier mur ; ia (4 parties) ;
  drapeau redemarrage (THINK_MS=5000, RESTART_CMD="stop.sh && start.sh keep").
- scratchpad/refonte/legacy.mjs : base modifiée (Déjà-vu, Portails, Chevauchée, turnMarks) : partie en cours
  annulée à la reprise, partie terminée relue telle quelle, aucun plantage (server.log sans erreur).

- nettoyage : plus de `card!` ni `as CardId` (HandCard.card n'est plus nul) dans game.ts et bot.ts.
- `npx tsc --noEmit -p .` : seule erreur concepts/galerie/data.ts(200,14) (hors flux A, déjà signalée).
- `npm test` : 10 fichiers, 159 tests verts, 1 échec dans test/lessons.test.ts (leçon des cartes, étape 3 :
  src/shared/lessons.ts:438, Mur en f1…b1 hors des rangées 3 à 6 ; flux B).

## Reprise (3e agent, 18 h 28, après redémarrage du conteneur)
- état : tout est commité (4116dee) ; auto-jeu interrompu à 24 parties (sp1..3.jsonl) ; vérification tsc + npm test.
- 18 h 31 : tsc : seule erreur concepts/galerie/data.ts(200,14) ; npm test : 159 verts, 1 échec (lessons.test.ts, flux B), 75 s.
  Suite : instance 3163 (integration.mjs, climats-serveur.mjs), puis auto-jeu (≈ 100 parties de plus).
- 18 h 33 : instance 3163 : integration.mjs vert ; climats-serveur.mjs sablier mur ia vert (4 parties IA) ; drapeau
  redemarrage vert (THINK_MS=5000) ; legacy.mjs vert (partie en cours annulée, partie terminée relue) ; arrêtée.
- 18 h 34 : auto-jeu niveau 2 lancé : sp4..6.jsonl (3 × 34 parties, graines 40404, 50505, 60606).
- 18 h 51 : auto-jeu terminé : 126 parties au total (sp1..6.jsonl, `python3 stats.py sp*.jsonl`) ; 0 erreur,
  0 coup refusé, 0 blocage ; Blancs 51 %, Noirs 38 %, nulles 11 %. Jouée/distribuée : Déflagration 24/24,
  Mur 122/130, Faille 133/145, Lune 63/69, Ère glaciaire 76/122, Trêve 59/143, Marée 39/123. Détenteurs
  G-P-N : Lune 39-23-7 (la plus forte), Trêve 59-64-20, Marée 53-56-14, Mur 54-60-16, Faille 67-68-10,
  Ère 55-52-15, Déflagration 9-13-2.
- 18 h 52 : expérience « une seule carte » lancée (solo.ts, solo-run.sh, solo-stats.py ; 8 configurations ×
  20 parties : sans carte, puis chaque carte tenue par un seul camp, couleurs alternées) : 160 parties en 4 min,
  0 erreur ; trop peu pour conclure (écart type ≈ 11 points).
- 18 h 55 : 80 parties de plus par configuration (LOTS="3 4 5 6 7 8 9 10" ./solo-run.sh), ≈ 15 min.
- 19 h 09 : expérience terminée : 800 parties (100 par configuration), 0 erreur, 1 coup « la magie cède »,
  décision ≤ 1,1 s. Score du détenteur (G + N/2), écart type ≈ 5 points ; sans carte : 47 % (Blancs 38-44-18) :
  Déflagration 69,5 % (jouée 94/100), Mur 69 % (95), Faille 68 % (92), Ère glaciaire 56 % (63), Marée 54,5 % (17),
  Trêve 54 % (34), Lune 52,5 % (95). Les Terrains et la Déflagration pèsent ≈ +20 points entre IA de niveau 2,
  les autres ≈ +5 à +9 ; Trêve et Marée sont peu jouées par l'IA (mesure « carte + IA », pas la force intrinsèque).
- 19 h 10 : tsc final : seule erreur concepts/galerie/data.ts(200,14). Aucun fichier du flux A modifié par cette
  reprise (code et tests inchangés depuis 4116dee) ; pas de serveur ni d'auto-jeu en cours.

## En cours
- rien.

## Reste à faire
- (fait) résumé final rendu à l'orchestrateur (forOthers : lessons.ts, puzzles.ts, pgn.ts, client, concepts/galerie).

## Décisions
- Phase 3 : R4b à l'arrivée gardé (corrigé) ; Marée sous la Lune gardé ; pendule au redémarrage gardé ;
  matériel insuffisant revu pour les Murs des rangées 3 à 6 ; sans objet avec les cartes retirées : pat par magie
  (Chevauchée), checkKind « arrivée » (aucun Climat ne change les attaques), incrément du Déjà-vu, IA et Portails.
  Les branches mortes ont été retirées (R4a à l'arrivée, pat par magie, 'arrival', TurnMark).
- IA et mains visibles : pas d'heuristique ajoutée. L'exemple « pas de Trêve si l'adversaire a une Lune » ne se
  produit pas : un seul Climat annoncé à la fois, et un Climat adverse annoncé après l'arrivée du nôtre arrive
  deux demi-coups plus tard, quand la Trêve (3 coups) a fini. Il ne peut écourter que le 4e coup d'un Climat de
  4 coups. Modéliser les cartes adverses dans la recherche multiplierait les branches : noté en limite.
- Ancienne partie en cours avec une carte retirée : annulée à la reprise (`aborted`, sans classement). Partie
  terminée : servie telle quelle (le moteur ne la rejoue pas) ; describeCardPlay affiche l'identifiant.
- Duel demandé (POST /api/games, queue:join, revanche d'une partie Duel) : ramené aux Pouvoirs ; catalogue inconnu :
  400 à la création, Pouvoirs dans la file.
- Mur de glace : permanent dans les Pouvoirs (`permanent: true`, remaining = total = 0), rangées 3 à 6 ; Duel :
  3 coups adverses, n'importe quelle case. Un Mur posé avant la refonte (6 coups) garde son compte.
- Matériel insuffisant (Pouvoirs) : un mat avec une seule pièce mineure n'existe qu'avec une des 16 paires de Murs
  (une Faille peut tenir lieu d'une case) ; Murs posés + Murs en main des deux camps (mat aidé). Fous de même
  couleur : pas de nulle tant qu'un Terrain peut servir (prudence).

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx tsc --noEmit -p .`
- `npm test`
- Serveur à moi : `D=/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/refonte; $D/start.sh`
  (port 3163, base neuve ; `keep` pour la garder) puis `node test/integration.mjs http://localhost:3163`,
  `./node_modules/.bin/tsx test/climats-serveur.mjs http://localhost:3163 sablier mur ia`,
  `THINK_MS=5000 RESTART_CMD="$D/stop.sh && $D/start.sh keep" ./node_modules/.bin/tsx test/climats-serveur.mjs http://localhost:3163 drapeau redemarrage`,
  `node $D/legacy.mjs` (base neuve), puis `$D/stop.sh`.
- Auto-jeu : `cd $D && /home/user/ChessCardGame/node_modules/.bin/tsx selfplay.ts 34 40404 2 2 > spX.jsonl`
  puis `python3 stats.py sp*.jsonl` ; une seule carte : `LOTS="1 2" ./solo-run.sh` puis `python3 solo-stats.py`.
