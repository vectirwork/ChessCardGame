# V2 : choix des 3 cartes (D5)

Journal de l'agent « Choix des cartes ». Fichiers : `src/shared/{game,cards,protocol,bot}.ts` (ajouts),
`src/server/games.ts`, `src/client/game/CardDraft.tsx` (nouveau), quelques lignes de `GamePage.tsx`,
`src/client/pages/{Play,Rules}.tsx`, `src/shared/lessons.ts`, textes de `src/client/odyssee/data.ts`, `test/*`.

## Étapes
- [x] Lecture du code (moteur, serveur, protocole, GamePage)
- [x] Moteur : phase de choix (shared)
- [x] Serveur : événement, échéance 45 s, IA, persistance, abandon
- [x] Protocole : vue de partie
- [x] CardDraft.tsx + GamePage.tsx
- [x] Play.tsx (miroir retiré), textes (Règles, leçons, accueil)
- [x] Tests unitaires (test/server-draft.test.ts, 18 tests) + integration.mjs, ranked.mjs, climats-serveur.mjs
- [x] Captures concepts/v2/choix/ (25 fichiers)

## Notes

Conception (retenue) :
- Moteur (`game.ts`) : `cardPool`, `draftRefusal`, `completeDraft`, `withHands` ; `dealHands` passe par `cardPool`.
- IA (`bot.ts`) : `chooseBotDraft(pool, level, rand)` (valeur de base + bruit selon le niveau, au plus 2 Climats).
- Serveur : `RoomData.draft = { pool, deadline, picks, tentative }` créé par `newRoom` (parties avec cartes),
  échéance armée par `begin` (45 s, `DRAFT_MS`). Mains vides dans `state` jusqu'à la révélation : rien de secret
  dans la vue. Événement `game:draft { id, cards, confirm? }` (zod) : `confirm` (défaut) = 3 cartes, définitif,
  idempotent ; `confirm: false` = sélection provisoire secrète, complétée au hasard à l'échéance.
  Coups, cartes, IA refusés pendant le choix ; abandon/annulation pendant le choix = `aborted` ; réclamation refusée.
  Redémarrage : échéance relancée à `now + DRAFT_MS`. Événements : `draft` (un joueur a validé) et `reveal`.
- Vue : `GameView.draft: DraftView | null` (pool, count, deadline, msLeft, chosen, mine, confirmed).
- Client : `CardDraft.tsx` + `draft.css` (nouveaux), plein écran z-index 120 ; GamePage : `myTurn` exclut le choix,
  rendu du composant.

Étape serveur (faite) : `games.ts` exporte pour les tests `Room`, `newRoom`, `applyDraft`, `applyMove`,
`resignRoom`, `abortRoom`, `resumeRoom` et les fonctions pures `newDraft/openDraft/submitDraft/closeDraft/draftView`.
Réclamation de victoire refusée avant le premier coup de chacun (la partie est annulée par le délai du premier coup).
Suppression de compte pendant le choix : annulation.

Étape client (faite, à vérifier en captures) : `CardDraft.tsx` + `draft.css` ; GamePage : import, `myTurn` exclut
`view.draft`, `<CardDraft …/>` après `selfBlock` (3 endroits). Play : miroir retiré, mention du choix. Textes :
Rules (essentiel, formule, détails), lessons (leçon « Jouer une carte »), data.ts (principe 02).
Reste : integration.mjs, ranked.mjs, climats-serveur.mjs (ils supposaient des mains tirées), captures.

Vérifications contre mon instance (PORT=3171, DATA_DIR dans le scratchpad, script de redémarrage qui ne vise que
PORT=3171) : integration.mjs vert (45 s), ranked.mjs vert, climats-serveur (sablier, mur, ia ×2) sans problème,
climats-serveur redemarrage (nouveau : redémarrage pendant le choix) sans problème.
Reste : npm test complet, captures.

Captures (concepts/v2/choix/) : bureau 1440×900 (choix, deux cartes, 4e refusée, attente, adversaire a choisi, mains
révélées, début de partie Blancs et Noirs), mobile 390×844 (mêmes étapes + bas de liste), IA 1280×720 (choix, clavier,
mains révélées, début), spectateur, échéance (10 s, complétée au hasard). Corrigé après captures : fond opaque,
tuiles compactes (carte mini + nom + « + votre coup » / « Remplace votre coup », règle en dessous), barre du bas sur
toute la largeur, emblèmes seuls sur mobile, message « complétées au hasard » faux contre l'IA (corrigé : échéance +
validation locale), piège du focus (Tab) dans les dialogues.

## Fin (terminé)
- `npx tsc --noEmit -p .` : OK. `npm test` : 12 fichiers, 227 tests verts (dont test/server-draft.test.ts, 18 tests).
- Contre mon instance (3171) : integration.mjs vert (≈ 47 s ; pacé contre le limiteur par socket), ranked.mjs vert,
  climats-serveur.mjs (sablier, mur, ia, redemarrage dont le nouveau redémarrage pendant le choix) sans problème.
  Plusieurs passages de suite depuis la même adresse atteignent la limite de création de parties (40 / 10 min) :
  redémarrer l'instance ou attendre.
- Build client (vite build vers le scratchpad, pas `dist/`) : OK, draft.css dans le morceau GamePage.
- Instance 3171 arrêtée, navigateurs fermés.
- Le serveur de l'orchestrateur (3000, `tsx` sans watch) fait tourner l'ancien code : à redémarrer pour voir le choix.
- Hors de mes fichiers, à reprendre par leurs propriétaires : mentions du miroir dans overlays.tsx (WaitingCard,
  JoinSheet), badge « · miroir » de GamePage (mort pour les nouvelles parties), OdysseeHome.tsx l. 1187
  « Plus d'options (couleur, mode miroir) ».
