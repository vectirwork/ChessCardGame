# Plan : Spellmate version « Odyssée »

Document commun à tous les agents. Lisez-le en entier avant de commencer.

## Ce que veut le fondateur (ses mots)

> « je préfère […] Odyssée. Il ne faut pas de bouton jouer, il faut que directement on puisse jouer une partie contre
> un anonyme ou une IA sur le site, sur la page d'accueil, et que ce soit évident comment : il y a 0 clic, on joue
> direct ! Et donne-moi le site complet prêt à être exécuté en local sur mon PC, que je pourrais déployer facilement.
> Inclus tout ce qu'il y a sur un site d'échecs classique : tutoriels, moteur d'analyse… mais reste sobre : ces
> fonctions doivent exister si on les cherche. »

Plus tôt : une seule page racontée par le défilement (parallaxe, sections = lieux) ; quand on joue, l'échiquier passe
en plein écran en s'étendant vers la gauche et masque le titre avec élégance, les cartes restent visibles ; des
pouvoirs **globaux** (qui changent la partie pour les deux joueurs) ; un site « digne d'une grande entreprise ».

## Décisions

- **Direction artistique : L'Odyssée** (prototype de référence : `concepts/odyssee/`, captures dans
  `concepts/odyssee/shots/`). Nuit profonde, or, cyan arcanique, ciels par lieu ; Cormorant Garamond (titres, italique
  dorée), Cinzel (surtitres en capitales espacées), Inter (texte). Toutes les pages du site adoptent ce langage.
- **Accueil, zéro clic** : l'échiquier du premier écran est une vraie partie. Le visiteur joue les Blancs contre l'IA
  dès qu'il touche une pièce (glisser ou cliquer). Au premier coup, l'interface passe en mode immersif : l'échiquier
  s'agrandit, le titre et le décor glissent vers la gauche, la main de cartes reste visible. Une option discrète
  propose un adversaire humain anonyme (file amicale du serveur) à la place de l'IA. Pas de bouton « Jouer » à
  cliquer pour commencer.
- **Cartes** : catalogue par partie (`Catalog` dans `src/shared/cards.ts`) :
  - `climats` (par défaut) : les 12 cartes globales de `concepts/CARTES-GLOBALES.md`, avec **toutes ses
    recommandations retenues** (section 9) : Présage pour les Climats et les Portails ; Rituel pour la Grande Marée ;
    « la magie cède » ; Sablier fou ×2 sans incrément, ni contre l'IA ni sans pendule ; Couronnement en 7e rangée ;
    Déflagration atomique ; Déjà-vu conservé (même pièce interdite, temps rendu à l'adversaire) ; tirage pondéré
    4/3/2/1 avec au plus 1 Légendaire et 2 Climats par main ; Portails symétriques ; durées et vocabulaire proposés ;
    Double temps reporté en V2 ;
  - `duel` : les 11 cartes historiques (déjà implémentées) ;
  - `aucune` : échecs classiques sans cartes.
- **Fonctions classiques, sobres** : Apprendre (`/apprendre`), Problèmes (`/problemes`), Analyse (`/analyse`, avec
  moteur, import et export PGN ou FEN, relecture d'une partie `/analyse/:gameId`), Mes parties (`/parties`), Parties
  en direct (`/direct`). Accessibles depuis un menu discret (en-tête et pied de page), jamais au premier plan.
- **Lancement local** : `npm install` puis `npm run local` (base PGlite embarquée dans `data/`, aucune autre
  installation que Node.js 22). Déploiement serveur inchangé : Docker, PostgreSQL, Caddy.

## Contrat de données (déjà en place, à respecter)

- `src/shared/cards.ts` : `Catalog`, `CATALOGS`, `Family` ; `CardDef.catalog`, `family`, `presage?`, `ritual?`.
- `src/shared/game.ts` : `Effect.pending?` (Présage annoncé, pas encore actif), `Effect.squares?` ;
  `GameState.catalog?` (absent = `duel`) ; `dealHands(timed, mirror, rand, catalog)` ;
  `createGame(hands, timed, catalog)`.
- `src/shared/bot.ts` (IA partagée navigateur/serveur) : `chooseBotCard(state, level)`, `chooseBotMove(state, level)`,
  `BOT_PROFILES`, et `analyse(state, maxDepth, timeMs, onDepth)` → `{ depth, scoreWhite, mate, best, pv, nodes }`.
  Ces signatures ne changent pas.
- Serveur : `POST /api/games` accepte `catalog` ; `queue:join { tc, rated, name, catalog }` (`rated: false` = file
  amicale ouverte aux invités) ; `GET /api/games/live` (parties en cours) ; `GET /api/games/recent` (parties terminées
  du compte connecté).
- Routes client déjà déclarées dans `src/client/App.tsx` avec des pages provisoires : `/apprendre[/:lesson]`,
  `/problemes[/:puzzle]`, `/analyse[/:gameId]`, `/parties`, `/direct`.

## Répartition des fichiers (chaque agent n'écrit que dans les siens)

| Flux | Agent | Fichiers |
|---|---|---|
| A | Moteur des cartes | `src/shared/{chess,cards,game,bot}.ts`, `src/server/{games,bot-worker,bot-pool}.ts`, `src/shared/protocol.ts` (ajouts), `test/*.test.ts`, `test/integration.mjs` |
| A | Effets visuels des cartes | `src/client/vfx/*`, `src/client/components/{CardArt,SpellCard}.tsx`, `src/client/styles/cards.css` |
| A | Page Règles | `src/client/pages/Rules.tsx` |
| B | Accueil Odyssée | `src/client/odyssee/*` (nouveau), `src/client/ai/*` (nouveau), `src/client/pages/Home.tsx`, `src/client/components/Layout.tsx`, `src/client/App.tsx`, `src/client/main.tsx`, `src/client/styles/global.css`, `public/*` |
| B | Partie en ligne | `src/client/game/*`, `src/client/pages/Play.tsx`, `src/client/styles/game.css` |
| B | Fonctions classiques | `src/client/pages/{Learn,Puzzles,Analysis,MyGames,Live}.tsx`, `src/client/features/*` (nouveau), `src/shared/{puzzles,pgn,lessons}.ts` (nouveaux), `test/{pgn,puzzles,lessons}.test.ts` |
| B | Pages secondaires | `src/client/pages/{Shop,DemoCheckout,Auth,Account,Profile,Leaderboard,Admin,Legal,NotFound}.tsx`, `src/client/styles/pages.css` (et le style des pages des fonctions classiques, sans casser leur logique) |

Lecture libre partout. Si vous avez besoin d'un changement dans un fichier qui n'est pas à vous, contournez-le dans
vos fichiers ou notez-le dans vos limites : l'orchestrateur l'intégrera.

## Règles de cohabitation (plusieurs agents travaillent en même temps)

- Le serveur de développement sur `http://localhost:3000` appartient à l'orchestrateur : **ne le redémarrez pas**.
  Le client s'y recharge à chaud. Si vous modifiez du code serveur et devez le tester, lancez votre propre instance :
  `PORT=<port libre entre 3101 et 3199> DATA_DIR=<dossier à vous dans /tmp> npx tsx src/server/index.ts`
  (le port suivant est pris par le rechargement à chaud de Vite ; chaque instance doit avoir **son propre DATA_DIR**,
  la base embarquée n'accepte qu'un processus). Arrêtez-la à la fin.
- Pas de commit git, pas de `npm install`.
- `npx tsc --noEmit -p .` doit passer pour vos fichiers ; des erreurs dans les fichiers d'un autre agent en cours de
  travail ne sont pas à vous (mentionnez-les).
- `npm test` (vitest) doit passer pour vos tests.
- Captures : `node concepts/_tools/shoot.cjs scenario.json` (voir l'en-tête du fichier) ; lisez les PNG avec Read.
  WebGL est rendu en logiciel ici : la 3D est lente, jugez la composition.
- Textes de l'interface en français, ton premium et sobre. Accessibilité : contrastes, focus visibles, `alt`,
  `prefers-reduced-motion`.
