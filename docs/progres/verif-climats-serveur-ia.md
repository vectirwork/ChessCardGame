# Progrès : vérification indépendante (serveur, IA, jeu réel) du catalogue Climats

Vérificateur sceptique, ne modifie aucun fichier de l'auteur. Fichiers à moi : ce journal,
test/climats-serveur.mjs (script de parties réelles), scripts dans le scratchpad.

## Fait
- lecture du plan, de CARTES-GLOBALES.md (R1-R10, 3.1, 3.12, 4.x, 6, 8), games.ts, game.ts, bot.ts, bot-worker.
- instance à moi : scratchpad/verif-srv/start.sh (PORT 3171, DATA_DIR scratchpad/verif-srv/data ; `keep` garde
  la base) et stop.sh (SIGTERM au groupe de MON PID seulement). Journal : scratchpad/verif-srv/server.log.
- test/climats-serveur.mjs (à moi) : `npx tsx test/climats-serveur.mjs http://localhost:3171 sablier|dejavu|ia|redemarrage`
  audit de non-fuite à chaque mise à jour (objet + JSON brut).
- sablier : OK (Présage public aux 2 joueurs + spectateur, ×1 avec incrément avant l'arrivée, ×2 sans incrément
  pendant 6 coups mesurés à ±5 ms, retour ×1). Dxf7 : pas mat si les Noirs ont une carte qui sauve (R4c, voulu).
- dejavu : OK (temps des Noirs rendu exactement, lanceur non, cinématique créditée, pièce interdite entière,
  carte noire du tour effacé rendue face visible et rejouable).

- ia : 10 parties contre l'IA (niveaux 2 et 3, 10+0 et sans pendule) : l'IA joue ses cartes (Mur, Faille,
  Ère glaciaire, Chevauchée, Déflagration…), réponse moyenne 1,0 à 2,2 s, max 5,7 s (carte + pause 2,3 s),
  aucune erreur dans server.log, jamais de Sablier distribué. (Bug de MON script corrigé : fin de partie vue
  dans la mise à jour 'move' avant 'end'.)
- redemarrage : état identique (clés réordonnées par JSONB, comparaison canonique), Présage arrive au bon coup,
  IA rejoue après redémarrage. PROBLÈME : pendule du camp au trait : tout le temps de réflexion du tour avant
  l'arrêt est rendu (12 s pensées, 0,47 s décomptées ; THINK_MS=12000). Cause : flushRooms sauve la pendule
  sans la figer (since = début du tour), resumeRoom remet since = now. Préexistant (pas propre aux Climats).
- Note : un `npx tsx` lancé depuis le scratchpad a téléchargé tsx dans le cache npx (pas dans le projet).
  Ensuite : ./node_modules/.bin/tsx depuis le projet.

- auto-jeu IA contre IA (selfplay.ts, chemin bot-worker.decide du serveur), 36 parties niveau 2 contre 2
  (sp1..3.jsonl, stats.py) : Blancs 44 %, Noirs 47 %, nulles 8 % (répétition) ; 90 demi-coups en moyenne,
  20,6 s par partie, décision moyenne 249 ms (max 1,6 s) ; 0 erreur, 0 coup refusé, 0 blocage, 0 coup R6.
  Cartes jouées / distribuées : Mur 31/31, Faille 34/34, Chevauchée 19/19, Lune 12/12, Déjà-vu 10/11,
  Déflagration 6/7, Ère 7/13, Couronnement 7/14, Trêve 15/33 (lanceur 4-11), Marée 4/20, Portails 1/22.
  Lune : lanceur 9-3. Déflagration lancée dès le 2e demi-coup (Cc3, Cb5, Cxc7* emporte la dame d8).
- portals.ts : sur 46 positions (milieu de partie), Portails jouables partout (19 cibles), choisis 0 fois.
- drapeau : chute du drapeau sous le Sablier (1+0) à 32 ms près de l'heure attendue (×2). OK.
- file amicale sans catalogue : Climats, mains adverses cachées ; /api/games/live sans mains. OK.
- vitest server-clock + bot : 17 verts.

- auto-jeu niveau 1 (8 parties : 4 pats, 2 nulles des 50 coups, 2 gains noirs ; toutes les cartes jouées) et
  niveau 3 (4 parties : 3 gains noirs, 1 nulle ; décision moyenne 1,4 s) : 0 erreur. Total 48 parties, 0 erreur.
- dejavu-incr.mts (horloge simulée, fonctions du serveur) : en 15+10, après Déjà-vu le lanceur a +9,2 s par
  rapport au début du tour effacé (incrément du coup effacé gardé).
- passage final (final.log) : drapeau, sablier, dejavu, ia ×2, redemarrage (THINK_MS=5000) : tout vert sauf la
  pendule au redémarrage (5,0 s pensées, 0,66 s décomptées). server.log sans erreur.

## Terminé (≈ 16 h 05)
- instance 3171 arrêtée (stop.sh), aucun navigateur lancé, aucun processus restant.
- aucun fichier de l'auteur modifié ; fichiers à moi : ce journal, test/climats-serveur.mjs.

## Reste à faire
- rien (éventuel : Déjà-vu qui efface l'arrivée d'un Sablier sur le vrai serveur ; main à 2 % : non tenté).

## Problèmes trouvés
1. Redémarrage : temps de réflexion du tour en cours rendu (voir Fait). Correctif : figer la pendule
   (settleClock) dans flushRooms avant saveRoom ; pour un arrêt brutal, sauver `savedAt` et décompter
   (savedAt − since) × rate dans resumeRoom.
2. Grande Marée sous la Lune de sang : le Rituel (qui « est » le coup) est accepté alors qu'une capture est
   obligatoire (seul coup légal Fxb5) : scratchpad/verif-srv/lune-maree.ts. L'IA le fait en auto-jeu (partie
   g=2 de sp3). Le document ne tranche pas ; à trancher (refuser la Marée si mustCapture et capture légale).
3. Déjà-vu : le lanceur garde l'incrément de son coup effacé (+2 s en 3+2, +10 s en 15+10) ; vu au serveur
   (scénario dejavu) et inscrit dans server-clock.test.ts (wAfter − 5000 + CINEMATIC). Mineur, à trancher.
4. IA : Portails quasi jamais joués (1/22 en auto-jeu niveau 2 ; 0/46 positions jouables dans portals.ts).

## Commandes de vérification
- `D=/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/verif-srv; $D/start.sh`
- `IA_GAMES=2 THINK_MS=5000 RESTART_CMD="$D/stop.sh && $D/start.sh keep" ./node_modules/.bin/tsx test/climats-serveur.mjs http://localhost:3171 sablier dejavu ia redemarrage drapeau`
- `$D/stop.sh`
- auto-jeu : `CAP=300 ./node_modules/.bin/tsx $D/selfplay.ts 12 7919 2 2 > $D/sp1.jsonl` puis `python3 $D/stats.py $D/sp*.jsonl`
- `./node_modules/.bin/tsx $D/lune-maree.ts`, `./node_modules/.bin/tsx $D/dejavu-incr.mts`, `./node_modules/.bin/tsx $D/portals.ts`
