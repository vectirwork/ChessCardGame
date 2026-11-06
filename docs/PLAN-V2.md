# Plan V2 : retours du fondateur après la première prise en main

Document commun à tous les agents de cette passe. Lisez-le en entier, puis `docs/RETOURS-FONDATEUR.md` (les mots du
fondateur). `docs/PLAN-ODYSSEE.md` reste la référence pour la direction artistique, les 8 pouvoirs et les mains
visibles.

## Décisions

### D1. Face des cartes épurée
Sur la face d'une carte : l'emblème, le nom et **une seule pastille qui dit l'effet sur le tour** :
- « + votre coup » (vous lancez la carte, puis vous jouez votre coup) : toutes les cartes sauf les Rituels ;
- « Remplace votre coup » : les Rituels (aujourd'hui la Grande Marée ; se fonder sur `CardDef.ritual`).

Plus de rareté, de durée, de famille ni de description sur la face. Une carte jouée reste visible, grisée, avec
« Jouée ». Cela vaut partout où une main de cartes est affichée (accueil, partie en ligne, leçons, problèmes,
analyse, boutique). La page Règles et la boutique peuvent garder de grandes cartes descriptives à côté de la carte.

### D2. Lire et lancer une carte, évidemment
Le fondateur n'a compris que le Mur de glace et n'a pas vu qu'un clic affiche la description.
- Survol ou focus (ordinateur) : une bulle au-dessus de la carte donne sa règle, sa famille, sa durée, et le moment
  où elle agit (Présage : « annoncée maintenant, elle arrive au début de votre prochain tour »).
- Toucher ou clic : la carte se soulève et la même bulle s'ouvre, avec un grand bouton « Lancer ce sort » et
  « Annuler », à côté de la carte (pas seulement dans le panneau de statut, loin de la main). Carte sans cible : le
  bouton la lance. Carte à cible (Mur, Faille) : la consigne de ciblage s'affiche et les cases possibles brillent.
- Tant que le joueur n'a ouvert aucune carte, une petite invite au-dessus de la main : « Touchez une carte pour la
  lire et la lancer » (mémorisée dans localStorage).
- Après le lancement d'un Climat : message clair « Annoncé : arrive au début de votre prochain tour. Jouez
  maintenant votre coup. »

### D3. Cartes de l'adversaire, comme les vôtres
En haut à droite, en éventail comme votre main mais **retournées (rotation de 180°, tête en bas, comme tenues par
l'adversaire en face)**, un peu plus petites, avec l'intitulé « Cartes de votre adversaire » (accueil : « Cartes de
l'Oracle »). Faces visibles, cartes jouées grisées. Survol ou toucher : la bulle de description s'affiche à
l'endroit, lisible. Sur mobile : même principe en plus petit, en haut. Elles remplacent les bandeaux compacts actuels.

### D4. Capturer en glissant
Glisser une pièce et la lâcher sur une pièce adverse la capture (si le coup est légal), à la souris et au doigt,
sur tous les échiquiers du site.

### D5. Choisir ses 3 cartes au début d'une vraie partie
- Concerne : invitation par lien, partie amicale, partie classée, partie contre l'IA lancée depuis la page Jouer, et
  chaque revanche. La partie zéro clic de l'accueil garde le tirage au hasard. « Sans cartes » : pas de choix.
- Chaque joueur choisit **3 cartes différentes** parmi la réserve de la partie (les 8 pouvoirs ; Sablier fou exclu
  contre l'IA et sans pendule), sans autre contrainte.
- Les choix restent secrets jusqu'à ce que les deux joueurs aient choisi, puis les deux mains sont révélées (mains
  visibles comme avant).
- Limite : 45 secondes ; à l'échéance, le serveur complète au hasard les cartes manquantes. Les pendules et le délai
  du premier coup ne démarrent qu'après le choix.
- L'IA choisit tout de suite, avec une heuristique simple et un peu de hasard (pas toujours les mêmes cartes).
- Le mode miroir disparaît de l'interface (le serveur l'ignore).
- La page Règles, les leçons et les textes du site qui disent que les cartes sont tirées au hasard sont corrigés :
  « Au début d'une partie, vous choisissez vos trois cartes ; sur l'accueil, elles sont tirées au hasard. »

### D6. Performance
Le fondateur trouve le site « très gourmand », surtout au chargement de la page. Objectifs, mesurés sur la version
de production (`npm run build`, puis `node dist/server/index.js`), avant et après :
- un premier affichage de l'accueil rapide et léger : le moins possible de JavaScript, de CSS, de polices et
  d'images avant de pouvoir jouer ; rien de WebGL avant une intention de jouer ; découpage du code par page ;
- au repos, presque aucun calcul : pas de boucle d'animation qui tourne pour rien, tout ce qui est hors écran est en
  pause, pas d'effets CSS coûteux en continu (flous d'arrière-plan, ombres animées, filtres) ;
- aucune régression visible : la direction artistique reste la même.

## Répartition des fichiers

| Agent | Fichiers |
|---|---|
| Choix des cartes | `src/shared/{game,cards,protocol,bot}.ts` (ajouts), `src/server/games.ts`, `src/client/game/CardDraft.tsx` (nouveau) et les quelques lignes de `GamePage.tsx` qui l'affichent, `src/client/pages/Play.tsx`, `src/client/pages/Rules.tsx`, `src/shared/lessons.ts`, textes de `src/client/odyssee/data.ts`, `test/*` |
| Cartes et échiquier | `src/client/components/{SpellCard,CardArt,Board}.tsx`, `src/client/styles/{cards,board}.css`, `src/client/odyssee/shell/*`, la main de cartes et la main adverse dans `src/client/game/{GamePage,parts}.tsx` et `src/client/styles/game.css`, `src/client/features/CardHand.tsx` |
| Performance (passe suivante) | tout le reste, en coordination par leurs comptes rendus |

`GamePage.tsx` est partagé par les deux premiers agents : modifications petites et localisées, relisez le fichier
avant chaque modification (l'autre agent peut l'avoir changé).

## Règles de cohabitation

- Le serveur de développement `http://localhost:3000` appartient à l'orchestrateur : ne le redémarrez pas. Pour
  tester du code serveur : votre propre instance, `PORT=<31xx> DATA_DIR=<dossier à vous> npx tsx src/server/index.ts`
  (ou la version de production construite dans un dossier à vous).
- Pas de commit, pas de `npm install`, pas de nouvelle dépendance (si une dépendance est indispensable, dites-le dans
  forOthers).
- `npx tsc --noEmit -p .` et `npm test` doivent passer ; `node test/integration.mjs <url>` contre votre instance si
  vous touchez au serveur ou au protocole.
- Captures : Playwright (`require('/opt/node-tools/node_modules/playwright')`), WebGL logiciel (lent : jugez la
  composition). Rangez-les dans `concepts/v2/<votre sujet>/`.
- Journal de progression court dans `docs/progres/v2-<sujet>.md`, mis à jour à chaque étape (le conteneur ou la
  limite d'utilisation peuvent couper un agent).
- Textes en français, vouvoiement, ton sobre. Accessibilité : focus visibles, `aria-*`, `prefers-reduced-motion`.
