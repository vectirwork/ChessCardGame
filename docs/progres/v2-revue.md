# V2 : relecture de code (diff f32af47 -- src test)

Relecteur sceptique. Seul fichier de code écrit : test/v2-revue.test.ts (7 tests, tous en échec tant que les défauts
ne sont pas corrigés). Preuves navigateur : version de production construite hors du dépôt
(scratchpad/revue/site, port 3197 ; base f32af47 dans scratchpad/revue/base, port 3198), scripts Playwright dans
scratchpad/revue/*.cjs, captures dans scratchpad/revue/shots/. Serveurs arrêtés en fin de relecture.

## Étapes
- [x] serveur : phase de choix (games.ts, game.ts, protocol.ts, bot.ts) : aucun défaut trouvé (secret des vues et
      événements, hors phase, doublons, échéance, pendules, redémarrage, revanche, IA, classement, concurrence)
- [x] client : CardDraft, GamePage, Board (glisser), SpellCard/GameShell/CardHand
- [x] perf : App.tsx (lazy), main.tsx, site.ts (cache, 404), engine.ts, useVfx/stage.ts, CSS par page

## Défauts confirmés
1. [majeur] Bulle des cartes mal placée sur /apprendre, /problemes, /analyse ouverts directement :
   `.card-bubble.is-floating { position: fixed }` n'est que dans shell.css (chargé avec l'accueil et /partie).
   Bulle à -191 px (1280x720, page défilée), entièrement hors écran à 1024x600 ; normal après un passage par
   l'accueil. Scripts bulle2.cjs, lecon.cjs. Test : « bulle des cartes hors de la partie ».
2. [majeur] Panneau de statut écrasé sur petits téléphones (MOBILE_BOARD_TOP 76 → 112 et règles has-fan-note) :
   375x667 partie en ligne 55,5 → 19,5 px (0 avec l'invite), accueil 95,5 → 4,5 px ; 360x640 42 → 6 px (0).
   Titre « À vous de jouer », consigne, délai du premier coup et options invisibles. Scripts statut.cjs,
   accueil-statut.cjs. Test : « panneau de statut ».
3. [mineur] CardDraft reste verrouillé « Temps écoulé » après un redémarrage du serveur pendant le choix alors que
   le serveur redonne 45 s (`expired` jamais remis à faux). Script draft-restart.cjs.
4. [mineur] Leçon « Jouer une carte » : la consigne « choisissez la carte, puis la case » ne marche plus (il faut
   « Lancer ce sort » entre les deux). Script lecon-texte.cjs.
5. [mineur] Écran de choix sur mobile : la barre du bas laisse voir le texte des cartes derrière les emplacements et
   le compte à rebours (captures petit-360x640-choix.png et concepts/v2/choix/mobile-01-choix.png).
