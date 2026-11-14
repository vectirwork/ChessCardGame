# Réglages de Spellmate

Ce document dit où changer chaque aspect du site, et ce qui suit tout seul.
Il décrit le code tel qu'il est après la passe « polymorphe » (novembre 2026).
Le tableau de bord du code est `src/shared/config/index.ts` : une ligne de commentaire par réglage.
Les valeurs vivent dans les fichiers cités ici.

Sommaire :

1. [Les trois sortes de réglages](#1-les-trois-sortes-de-réglages)
2. [Faire un changement, pas à pas](#2-faire-un-changement-pas-à-pas)
3. [Ce qu'on change demain](#3-ce-quon-change-demain)
4. [Table des réglages](#4-table-des-réglages)
5. [Règles par contexte et règles de test](#5-règles-par-contexte-et-règles-de-test)
6. [Garde-fous](#6-garde-fous)
7. [Limites connues et décisions en attente](#7-limites-connues-et-décisions-en-attente)

---

## 1. Les trois sortes de réglages

| Sorte | Exemples | Quand le changement s'applique | Parties déjà créées |
|---|---|---|---|
| Règles de partie | `GAME_RULES`, `RULES_BY_CONTEXT`, équilibrage des cartes (`coups`, `ranks`, `clockRate`) | aux parties créées après la mise en ligne | elles gardent leurs règles |
| Mise en place | `DEAL` (choix ou tirage, durée du choix, contraintes du tirage), `SUSPENDED_CARDS`, cadence, niveau de l'IA | à la création d'une partie | le résultat (mains, échéance, pendule, niveau) est déjà enregistré |
| Plateforme et contenu | délais du serveur, classement, file d'attente, interrupteurs, marque, boutique, pages, textes | pour tout le monde, à la mise en ligne (au redémarrage pour une variable d'environnement) | rien à préserver |

Ce qu'il faut retenir sur les règles de partie :

- Une partie porte ses règles dans `GameState.rules`. Le moteur, l'IA et le client lisent `rulesOf(state)`.
- Une partie sans champ `rules` suit `RULES_V1` : les règles d'avant la passe. `RULES_V1` ne change jamais
  (test : `test/fixtures/rules-v1.json`, dans `test/config.test.ts`).
- Au réglage par défaut, les règles du jour égalent `RULES_V1`. Rien n'est alors écrit dans les parties.
- Dès que les règles d'un contexte diffèrent de `RULES_V1`, chaque nouvelle partie de ce contexte reçoit une copie
  complète de ses règles, équilibrage des cartes compris.
- Relectures, reprises après un redémarrage et PGN rejouent avec les règles de la partie, jamais avec celles du jour.
  Une sauvegarde de l'accueil faite sous d'autres règles repart de zéro.
- Le serveur n'accepte jamais de règles venant d'un navigateur.

---

## 2. Faire un changement, pas à pas

1. Essayez d'abord le changement sur une copie jetable du dépôt, sans rien toucher :
   `npm run essai-reglage -- --remplacer='<fichier>::<texte avant>::<texte après>'` (section 2.1). L'outil dit quels
   gardes échoueront et ce qu'il faudra mettre à jour.
2. Changez la valeur dans le fichier indiqué.
3. Lancez `npx tsc --noEmit -p .`. Un nom de réglage mal écrit est refusé (les littéraux sont écrits avec
   `satisfies`). Une table par carte ou par niveau incomplète l'est aussi.
4. Lancez `npm test`. Seuls des gardes échouent, exprès, chacun avec un message qui dit quoi mettre à jour :
   - `test/garde-fous/defauts.test.ts` : il photographie toutes les valeurs par défaut. Reportez la nouvelle valeur
     dans `test/garde-fous/defauts.json`.
   - `test/garde-fous/protocole.test.ts` : il suit les cartes, les catalogues, les cadences, les niveaux de l'IA,
     `GAME_RULES` et `DEAL.draftMs`. Montez `PROTOCOL_VERSION` dans `src/shared/protocol.ts`, puis mettez à jour
     `test/fixtures/protocole.json`. Un onglet resté ouvert sur l'ancienne version recevra `server:outdated` et
     rechargera la page.
   - `test/reglages-doc.test.ts` : il compare ce document au code. Reportez la nouvelle valeur dans la colonne
     « Défaut » de la section 4. Si `GAME_RULES` change, relisez aussi les listes « Masqués » des sections 3.5 à 3.8 :
     le test les recalcule à partir des règles du jour, donc ce que la nouvelle valeur masque déjà s'y ajoute.
   - `checkRules`, si la configuration est impossible (6 cartes par exemple) : « configuration du jour » de
     `test/config.test.ts` et « au défaut, la configuration est jouable » de `test/reglages-doc.test.ts`. Le message dit
     quel réglage changer ; la construction s'arrête aussi (étape 5).

   Les autres tests ne dépendent pas des valeurs par défaut : ils fixent leurs règles (`RULES_V1`, et `REGLAGES_V1`,
   `DEAL_V1` de `test/helpers/v1.ts`) ou calculent l'attendu à partir du réglage (au défaut, la phrase exacte d'avant ;
   sinon, la phrase dérivée). Un autre échec est donc à relire : un mécanisme qui ne suit pas le réglage, ou un test
   qui le photographie encore (cela n'a été vérifié que pour les essais de la section 2.1).

   À part de `npm test`, `npm run temoins` compare le moteur aux témoins pris au défaut avant la passe
   (`test/fixtures/v1`). Il échoue après un changement de valeur par défaut, et c'est attendu (section 2.1) : ses
   témoins sont des photographies du défaut d'alors, à ne jamais réécrire. Un écart voulu se déclare dans
   `ECARTS_VOULUS` de `test/fixtures/v1/generer.ts`.
5. Lancez `npm run build`. Des règles impossibles arrêtent la construction (`checkRules`), avec une phrase qui dit
   quel réglage changer. Le déploiement (`deploy/update.sh`) s'arrête alors avant de remplacer la version en ligne.
6. Regardez le résultat :
   - `npm run identite` et `npm run textes-pages` montrent ce qui change à l'écran et dans les textes. Leurs
     références ont été prises sur le code d'avant la passe : `npm run textes-pages` compare au dépôt
     (`test/fixtures/v1/textes`), `npm run identite` à un dossier hors du dépôt qui n'existe que sur la machine de la
     passe (`/home/user/spellmate-ref`). Ils montrent donc aussi les écarts déjà acceptés (« Partie sans cartes »
     retiré, « 1 étape » : rapport final de `docs/polymorphie/ETAT.md`) ;
   - pour ne voir que l'effet d'un réglage, ou sur une autre machine, prenez d'abord votre propre référence, sur le
     site construit au défaut : `npm run build && node test/identite.mjs --ecrire --sortie=<dossier>` (et
     `node test/textes-pages.mjs --ecrire --sortie=<dossier2>`). Après le changement :
     `npm run build && node test/identite.mjs --comparer=<dossier>` (et `node test/textes-pages.mjs --comparer=<dossier2>`).
     Prenez un dossier neuf : sans `--ecraser`, `--ecrire` refuse d'écrire sur des relevés existants ;
   - `node test/identite.mjs --seulement=bancs --n=5 --sortie=<dossier>` donne des captures de la coque de partie
     pour un autre nombre de cartes ;
   - `node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}` joue une partie complète sur un serveur
     neuf.

Essayer un réglage sans toucher au code, côté serveur seulement :
`SPELLMATE_TEST_RULES='{"cardsPerPlayer":5}' node scripts/serveur-jetable.mjs`. Le serveur reste ouvert jusqu'à
Ctrl+C. Les parties créées suivent ce réglage. Les textes des pages et la partie de l'accueil restent ceux du code :
ils sont lus dans le code construit, pas sur le serveur.

### 2.1 Essayer un réglage : `npm run essai-reglage`

`scripts/essai-reglage.mjs` copie le dépôt (les fichiers suivis par git et les nouveaux) dans un dossier temporaire,
y lie `node_modules`, y fait les changements demandés, puis lance `tsc` et les tests rapides
(`vitest run --project rapide`). Il range les échecs en deux listes : les GARDES ATTENDUS (section précédente, étape
4), chacun avec ce qu'il faut mettre à jour, et les AUTRES, à relire. Il rend le code 0 seulement s'il n'y a aucun
autre échec (un test sauté compte comme un échec : il vient d'un `beforeAll` en échec). Le dépôt n'est jamais touché,
et la copie est supprimée à la fin.

```bash
npm run essai-reglage -- --essai=cinq                     # un essai prêt à l'emploi
npm run essai-reglage -- --essai=tous --build --temoins   # les 7 essais, avec la construction et les témoins v1
npm run essai-reglage -- --essai=cinq+deuxParTour         # deux changements dans le même essai
npm run essai-reglage -- --remplacer='src/shared/config/rules.ts::  draftMs: 45_000,::  draftMs: 20_000,'
```

- `--remplacer=<fichier>::<texte avant>::<texte après>` (répétable) : remplacement exact, refusé si le texte avant
  n'apparaît pas exactement une fois (ajoutez du contexte ; un retour à la ligne s'écrit `$'…\n…'` dans le shell).
- `--essai=` : `cinq`, `deuxParTour`, `remplaceCoup`, `presage4`, `trente`, `mur`, `six`, ou `tous` (l'un après
  l'autre, chacun sur une copie neuve). Ils visent le bloc de `GAME_RULES`, de `DEAL` ou du Mur de glace dans `CARDS`.
- `--build` : lance aussi `npm run build` ; `--temoins` : `npm run temoins` (affiché à part, hors du code de sortie) ;
  `--tout` : tous les projets de Vitest (matrice des règles et IA lente comprises) ; `--details` : messages complets ;
  `--garder` : garde la copie ; `--json=<fichier>` : résultat en JSON.

Les 7 essais du lot 9c, avant et après le lot 9e (`--essai=tous --build --temoins`, projet rapide) :

| Changement essayé | Avant : en échec (hors gardes) | Après : en échec (hors gardes) | Gardes qui échouent après le lot | Construction | `npm run temoins` |
|---|---|---|---|---|---|
| `GAME_RULES.cardsPerPlayer` 3 → 5 (`cinq`) | 40 (37) | 3 (0) | `defauts`, `protocole`, `reglages-doc` (1) | réussie | arrêté : « Choix refusé : Choisissez 5 cartes. » |
| `GAME_RULES.cardsPerTurn` 1 → 2 (`deuxParTour`) | 32 (26) | 6 (0) | `defauts`, `protocole`, `reglages-doc` (4 : défaut, 3.6, 3.7, 3.8) | réussie | 72 fichiers en écart |
| `GAME_RULES.cardEndsTurn` false → true (`remplaceCoup`) | 101 (95) | 6 (0) | `defauts`, `protocole`, `reglages-doc` (4 : défaut, 3.5, 3.7, 3.8) | réussie | arrêté : « Coup g1-f3 refusé : Coup illégal. » |
| `GAME_RULES.presageDelay` 2 → 4 (`presage4`) | 55 (50) | 5 (0) | `defauts`, `protocole`, `reglages-doc` (3 : défaut, 3.5, 3.8) | réussie | 73 fichiers en écart |
| `DEAL.draftMs` 45 000 → 30 000 (`trente`) | 9 (6) | 3 (0) | `defauts`, `protocole`, `reglages-doc` (1) | réussie | 5 fichiers en écart |
| rangées du Mur de glace `[2, 3, 4, 5]` → `[2, 3, 4]` (`mur`) | 34 (32) | 2 (0) | `defauts`, `reglages-doc` (1) ; pas `protocole` | réussie | arrêté : « ice_wall : cible a6 impossible. » |
| `GAME_RULES.cardsPerPlayer` 3 → 6 (`six`) | 45 (39, et 3 tests sautés) | 5 (0) | `defauts`, `protocole`, `reglages-doc` (2 : défaut, configuration jouable), `checkRules` (`test/config.test.ts`) | arrêtée par `checkRules` (section 3.4) | arrêté : « Choix refusé : Choisissez 6 cartes. » |

Tests du projet rapide : 1 108 avant le lot, 1 115 après (7 tests des outils ajoutés), tous verts au défaut ; `tsc`
reste sans erreur dans tous les cas. « (hors gardes) » : les échecs qui ne sont pas des gardes attendus ; « défaut » :
le test des valeurs par défaut de ce document (section 4).

`npm run temoins` rejoue les témoins v1 avec la configuration du jour (nombre de cartes, règles écrites dans les
parties, textes des cartes) : après un changement de valeur par défaut, il s'arrête sur une partie ou une salle
témoin devenue injouable (choix de 3 cartes, carte puis coup, Mur en a6), ou il signale des fichiers en écart
(`deuxParTour` : les 40 parties, leur index, les salles, la sauvegarde de l'accueil, la partie locale et les PGN, où
les règles sont désormais écrites ; `presage4` : les mêmes, plus les textes des cartes ; `trente` : les constantes et
les deux salles en plein choix). C'est attendu : ses témoins décrivent le défaut d'avant la passe, et il ne sert qu'à
vérifier le défaut. Ne les réécrivez jamais ; il n'entre pas dans le code de sortie de `npm run essai-reglage`.

---

## 3. Ce qu'on change demain

### 3.1 Résumé

« Tests ciblés » : les tests à lancer d'abord (`npx vitest run <fichier>`, ou la commande indiquée). Finissez toujours
par `npm test` et `npm run build` (section 2).

| Besoin | Où changer | Ce qui suit tout seul | À faire en plus | Tests ciblés |
|---|---|---|---|---|
| 5 cartes par joueur | `GAME_RULES.cardsPerPlayer` | tirage, choix, IA, textes, éventails, mini-main de l'accueil | gardes, tests au défaut, captures (Q11) | `test/config.test.ts`, `test/regles-matrice.test.ts`, `test/choix-cartes.test.ts`, `test/coque-layout.test.ts` |
| 5 cartes dans un seul contexte | `RULES_BY_CONTEXT.amicale = { cardsPerPlayer: 5 }` | les parties amicales, l'aide de la porte correspondante de Jouer | `defauts.json` | `test/config.test.ts`, `test/server-regles.test.ts` |
| 6 cartes | `GAME_RULES.cardsPerPlayer` et une contrainte du tirage | comme pour 5 | refusé tant que l'accueil tire 6 cartes avec au plus 2 Climats | `test/config.test.ts` |
| 2 cartes par tour | `GAME_RULES.cardsPerTurn` | moteur, IA, pause du serveur entre deux cartes, consignes | trois problèmes masqués | `test/regles-matrice.test.ts`, `test/textes-regles.test.ts` |
| Une carte remplace le coup | `GAME_RULES.cardEndsTurn` | trait, incrément de pendule, règle des 50 coups, pastilles | impose 1 carte par tour ; leçons et problèmes masqués | `test/regles-matrice.test.ts` |
| Présage en 4 demi-coups | `GAME_RULES.presageDelay` | arrivée des Présages, textes des cartes, IA | formulation à valider ; leçon et problème masqués | `test/climats.test.ts`, `test/textes-regles.test.ts` |
| Rééquilibrer une carte | `coups`, `ranks` ou `clockRate` de la carte dans `DEFS` (`src/shared/cards.ts`) | moteur, textes de la carte | leçons et problèmes masqués ; `defauts.json` | `test/climats.test.ts`, `npm run temoins` |
| Choix des cartes en 30 s | `DEAL.draftMs` | échéance, barre du choix, « 30 secondes » | gardes | `test/server-draft.test.ts`, `test/server-regles.test.ts` |
| Plus de choix des cartes | `DEAL.draft = false` | tirage partout, textes | `defauts.json` | `test/server-regles.test.ts`, `test/regles-matrice.test.ts` |
| Contraintes du tirage (R9) | `DEAL.handLimits`, `DEAL.limitsInDraft`, `DEAL.rarityWeight` | tirage, choix, IA, texte des Règles | une main valide doit exister | `test/config.test.ts`, `test/frequences.test.ts`, `test/server-regles.test.ts` |
| Suspendre une carte | `SUSPENDED_CARDS` | réserves des nouvelles parties | `defauts.json` | `test/config.test.ts` |
| Retirer une carte pour de bon | `retired: true` dans `DEFS` | réserves, nombre de pouvoirs dans les textes | ne jamais supprimer l'identifiant | `npm run temoins` (anciennes parties) |
| Ajouter une carte | `DEFS` et le type `CardId` (`src/shared/cards.ts`) | textes qui comptent les cartes, grille du choix, accueil | registres par carte, moteur, `PROTOCOL_VERSION` | `test/coherence.test.ts` |
| Nouvelle cadence | une ligne de `TIME_CONTROLS` (`src/shared/protocol.ts`) | libellés, files, invitation | `PROTOCOL_VERSION` | `test/coherence.test.ts`, `test/socle.test.ts` |
| Retirer une cadence | `archived: true` | refus à la création, relectures | ne jamais recycler l'identifiant | `test/coherence.test.ts`, `test/socle.test.ts` |
| Niveau d'IA | `BOT_LEVELS`, `BOT_PROFILES` (`src/shared/bot.ts`) | menu, Jouer, accueil | `DRAFT_NOISE`, `BOT_LOOK`, `PROTOCOL_VERSION` | `test/coherence.test.ts`, `test/bot.test.ts` |
| Délais, classement, file | `src/server/settings.ts` | serveur | `defauts.json`, nouvelle version du serveur | `test/rating.test.ts`, `test/server-file.test.ts` |
| Couper la boutique | variable `FEATURE_SHOP=0` | page fermée, liens cachés, paiements refusés | redémarrage, sans reconstruire | `test/server-features.test.ts` ; `test/fonctions.mjs` sur un serveur jetable (section 6.3) |
| Fermer les paiements seulement | variable `PAYMENTS_MODE=off` | paiements refusés | redémarrage | `test/server-config.test.ts` |
| Mode maintenance | variable `FEATURE_NEW_GAMES=0` | plus de nouvelle partie ; les parties en cours continuent | redémarrage | `test/server-features.test.ts` |
| Changer le nom du site | `BRAND` (`src/shared/config/brand.ts`), `APP_NAME`, `MAIL_FROM` | `index.html`, manifeste, titres, en-tête, pied de page, partage, e-mails | images, mots réservés | `test/marque.test.ts`, `test/socle-client.test.ts` |
| Ajouter un emplacement de skin | `SLOT_DEFS` (`src/shared/skins/slots.ts`) | rayons, libellés, objet par défaut, colonne SQL | migration, phrases, vignette | `test/catalog.test.ts`, `test/server-kings.test.ts` |
| Modifier l'offre | `src/shared/catalog.ts`, `src/shared/skins/*` | rayons, packs, Trésor, e-mails | jamais de prix qui monte | `test/catalog.test.ts`, `test/server-shop.test.ts` |
| Ajouter une page | `ROUTES` (`src/shared/config/routes.ts`) | routeur, serveur, préchargement, 404 | chargeur dans `src/client/App.tsx` | `test/routes.test.ts` |
| Accueil | `HOME` (`src/shared/config/home.ts`), `RULES_BY_CONTEXT.accueil` | partie contre l'Oracle, appariement | les sauvegardes d'un autre réglage repartent de zéro | `test/accueil.test.ts` |
| Position de départ | `GAME_RULES.startFen` | création, relecture, PGN | roque standard seulement | `test/config.test.ts` |
| Bornes des pseudos | `src/shared/config/limits.ts` | serveur, formulaires, messages | `defauts.json`, reconstruire | `test/socle.test.ts` |
| Nouveau catalogue, ou reproposer le Duel | `CATALOG_IDS`, `CATALOG_RULES`, `CATALOGS`, `catalogs` des cartes (`src/shared/cards.ts`) | création, file d'attente, libellés, PGN, `checkRules` | `PROTOCOL_VERSION` ; pages écrites pour les Pouvoirs (section 3.19) | `test/climats.test.ts`, `test/garde-fous/protocole.test.ts` |
| Changer un texte | `src/shared/text/`, `TEMPLATES`, `SLOT_TEXTS`, pages (section 3.20) | — | références des textes, sur décision | `test/garde-fous/textes-chiffres.test.ts`, `npm run textes-pages` |
| Mentions légales | variables `LEGAL_*` | `/api/legal`, pages légales | décision Q1 | `test/server-config.test.ts` |

### 3.2 Passer à 5 cartes par joueur

- Fichier : `src/shared/config/rules.ts`. Réglage : `GAME_RULES.cardsPerPlayer = 5`. Bornes : 1 à 6.
- Ce qui suit tout seul :
  - le tirage et le choix des cartes (la vue du choix porte le nombre de cartes : `count`) ;
  - le choix et le jeu de l'IA ;
  - les textes dérivés : `index.html` et le manifeste (marqueurs du greffon de `vite.config.ts`), le pied de page,
    les pages Règles, Jouer et Apprendre, l'accueil, la coque de partie (par exemple « Cinq sorts », « Cinq cartes
    chacun ») ;
  - les mains de la partie : au-delà de 3 cartes, les cartes rapetissent dans la place prévue pour 3 ; la main
    adverse se chevauche. L'échiquier ne bouge pas ;
  - la mini-main de l'accueil : au-delà de 3 cartes, ses cartes gardent leur taille et se chevauchent dans la largeur
    de 3.
- Ce qui ne change pas :
  - les parties en cours gardent 3 cartes, un choix en cours aussi ;
  - leçons et problèmes : ils se jouent avec `RULES_V1`. Leurs mains sont tronquées au nombre de cartes du jour
    (`hand()` de `src/shared/puzzles.ts`), donc rien ne change au-delà de 3. Aucun n'est masqué par ce réglage ;
  - l'image de partage `public/og.jpg`.
- À faire en plus : `defauts.json`, `PROTOCOL_VERSION` et `protocole.json`, ce document (gardes de la section 2),
  captures.
- À regarder : décision Q11 (petites cartes sur mobile). Captures déjà faites pendant la passe, hors du dépôt : voir
  `docs/polymorphie/ETAT.md`.

### 3.3 Une variante dans un seul contexte

- Réglage : `RULES_BY_CONTEXT` dans `src/shared/config/rules.ts`, par exemple `{ amicale: { cardsPerPlayer: 5 } }`.
- Contextes : `classee`, `amicale`, `invitation`, `ia`, `accueil` (section 5).
- `checkRules` vérifie chaque contexte comme `GAME_RULES`. Un nom de contexte mal écrit est refusé.
- Les files classée et amicale sont séparées (clé de file : cadence, classée ou non, catalogue).
- La page Règles, les leçons et les problèmes décrivent `GAME_RULES`, pas les contextes.
  L'aide d'une porte de Jouer suit les règles de son contexte. La clause « sur l'accueil » des Règles et de la Forêt
  suit le nombre de cartes de l'accueil.
- Le garde de protocole ne suit pas `RULES_BY_CONTEXT`. `defauts.json` le suit.

### 3.4 Six cartes

- `GAME_RULES.cardsPerPlayer = 6` est refusé tel quel, au build, au démarrage et dans les tests. Message exact :
  « 6 cartes par joueur à l'accueil : impossible avec au plus 2 Climats, la réserve n'a que 3 cartes qui ne sont pas
  des Climats (main valide maximale : 5). Relevez DEAL.handLimits.maxPerFamily.climat, ou réglez
  RULES_BY_CONTEXT.accueil. »
- Raison : l'accueil tire toujours les mains, sans pendule et contre l'Oracle. Sa réserve a 7 cartes (le Sablier fou
  en est exclu) : 4 Climats et 3 autres. Avec au plus 2 Climats, une main valide a au plus 5 cartes.
- Deux sorties, toutes deux acceptées par `checkRules` :
  - relever `DEAL.handLimits.maxPerFamily.climat` ;
  - garder 5 cartes à l'accueil : `RULES_BY_CONTEXT = { accueil: { cardsPerPlayer: 5 } }`. Les autres contextes
    choisissent leurs cartes : seule la taille de la réserve compte (7 ou 8 cartes).
- Six cartes n'ont été vues que dans le banc de la coque, jamais dans une vraie partie.

### 3.5 Deux cartes par tour

- Réglage : `GAME_RULES.cardsPerTurn = 2`. Bornes : 1 à 3, et pas plus que le nombre de cartes en main.
- Ce qui suit : le compteur du moteur (`cardsThisTurn`, écrit seulement si plus d'une carte par tour), l'IA (elle peut
  jouer plusieurs cartes, réponse `cards`), la pause du serveur entre deux cartes de l'IA (`BOT_CARD_PAUSE_MS`), les
  consignes et le message après un sort (« Un autre sort, ou jouez votre coup. »).
- Masqués (leur solution n'est unique qu'à 1 carte par tour, `requires.cardsPerTurn`) : problèmes « Le Mur qui
  enferme », « La Faille qui coupe », « La marée descend ».

### 3.6 Une carte remplace le coup

- Réglage : `GAME_RULES.cardEndsTurn = true`. Impose `cardsPerTurn = 1` (sinon `checkRules` refuse).
- Ce qui suit : le trait passe après toute carte, comme pour la Grande Marée aujourd'hui ; la pendule la traite comme
  un coup (incrément) ; elle compte comme un demi-coup pour la règle des 50 coups (décision Q6) ; les pastilles
  « Remplace votre coup ».
- Masqués (`requires.cardBefore` : la carte, puis le coup dans le même tour) : leçons « Jouer une carte » et « Présage et Rituel » ;
  problèmes « Le Mur qui sauve », « Le Mur qui enferme », « La Faille qui coupe », « Le pion gelé ».

### 3.7 Présage en 4 demi-coups

- Réglage : `GAME_RULES.presageDelay = 4`. Bornes : 2 à 6, pair (un Présage arrive au début d'un tour de son
  lanceur).
- Ce qui suit : l'arrivée des Présages, la sonde du moteur qui refuse un Présage qui bloquerait son lanceur, les
  textes des cartes et le message après le lancement (« Annoncé : arrive au début de votre deuxième tour à venir. »).
- Masqués (`requires.presageDelay`) : leçon « Présage et Rituel » ; problème « Le pion gelé ».
- Décision en attente : la formulation « votre deuxième tour à venir » (section 7).

### 3.8 Rééquilibrer une carte

- Fichier : `src/shared/cards.ts`, entrée de la carte dans `DEFS`. Champs : `coups` (durée en demi-coups des deux
  camps), `ranks` (rangées, de 0 à 7), `clockRate` (vitesse des pendules sous le Sablier fou).
- Exemple, Mur de glace sur la 3e à la 5e rangée : `ranks: [2, 3, 4]` dans `ice_wall`.
- Ce qui suit :
  - les textes de la carte, produits par les gabarits `TEMPLATES` du même fichier ;
  - le moteur lit l'équilibrage de la partie (`tuneOf`) ;
  - les nouvelles parties portent une copie de l'équilibrage ; les anciennes gardent l'ancien.
- Contrôles (`checkRules`) : `coups` entier d'au moins 1 ; rangées de 0 à 7 ; Grande Marée de 1 à 5 seulement ;
  `clockRate` positif.
- Masqués (`requires.tuning`, contenu écrit pour l'équilibrage de `RULES_V1`) :

  | Carte rééquilibrée | Leçons masquées | Problèmes masqués |
  |---|---|---|
  | Mur de glace | « Jouer une carte » | « Le Mur qui sauve », « Le Mur qui enferme », « Lisez sa main » |
  | Faille | « Lire la main adverse » | « La Faille qui coupe » |
  | Trêve | « Présage et Rituel » | — |
  | Grande Marée | « Présage et Rituel » | « La marée descend » |
  | Ère glaciaire | — | « Le pion gelé » |

  Pour les garder, il faut les récrire.
- Rangées du Mur changées : la nulle par manque de matériel passe en mode prudent (un Mur posé ou en main suffit à
  rendre un mat possible), car la table `WALL_MATE_PAIRS` de `src/shared/game.ts` vaut pour les rangées d'origine.
- Le garde de protocole ne suit pas l'équilibrage : seul `defauts.json` est à mettre à jour.

### 3.9 Choix des cartes, tirage et contraintes

- Durée du choix : `DEAL.draftMs` (au moins 1 000 ms). Suit : l'échéance du serveur, la barre du choix (`totalMs`), la
  phrase « 45 secondes » des pages Règles et Jouer (figée à la construction : `__SM__.dureeChoix`). Ne pas confondre
  avec `TIMINGS.firstMoveMs`, qui vaut aussi 45 s : délai du premier coup.
- Plus de choix des cartes : `DEAL.draft = false`. Les mains sont alors tirées au hasard partout, et les textes
  disent « vos trois cartes sont tirées au hasard ». L'accueil tire toujours, quel que soit ce réglage.
- Contraintes du tirage (R9) : `DEAL.handLimits`. Aujourd'hui : au plus 2 Climats et au plus 1 Légendaire par main.
  Aucun Pouvoir n'est Légendaire aujourd'hui : la seconde contrainte ne joue pas.
- Contraintes aussi au choix des cartes : `DEAL.limitsInDraft = true` (refus immédiat dans l'écran du choix). Au
  défaut, le choix est libre (décision Q4).
- Poids du tirage : `DEAL.rarityWeight` (Commune 4, Rare 3, Épique 2, Légendaire 1).
- `checkRules` exige qu'une main valide existe dans chaque réserve tirée.

### 3.10 Suspendre, retirer ou ajouter une carte

- Suspendre une carte défectueuse : `SUSPENDED_CARDS = ['blast']` dans `src/shared/config/rules.ts`. Elle sort des
  réserves des nouvelles parties (tirage, choix, IA). Les parties en cours continuent avec elle. Les textes qui
  comptent les cartes (« huit pouvoirs ») ne changent pas. `checkRules` refuse un identifiant inconnu et une réserve
  devenue trop petite.
- Retirer une carte pour de bon : `retired: true` dans son entrée de `DEFS`. Elle sort des réserves et du compte
  des cartes dans les textes. Elle reste relue dans les anciennes parties. Ne jamais supprimer ni recycler son
  identifiant.
- Ajouter une carte :
  1. son identifiant dans le type `CardId` et son entrée dans `DEFS` (`src/shared/cards.ts`) ; pour un Pouvoir, son
     gabarit de textes dans `TEMPLATES` ;
  2. les registres que le compilateur exige : `CARD_FX` (`src/client/vfx/cardFx.ts`), `BOARD_MARKS`
     (`src/client/vfx/boardMarks.ts`), `CARD_SOUND` (`src/client/sound.ts`), `CARD_ART`
     (`src/client/components/CardArt.tsx`), `DRAFT_VALUE` (`src/shared/bot.ts`) ;
  3. sa scène explicative dans `CARD_SCENES` (`src/client/components/cardScenes.ts`) : le compilateur ne l'exige pas,
     `test/coherence.test.ts` si ;
  4. sa mécanique dans `src/shared/game.ts` si elle est nouvelle ;
  5. `PROTOCOL_VERSION` (le garde de protocole le demande) ;
  6. `checkRules` revérifie les contraintes du tirage avec la nouvelle réserve.
- Ce qui suit tout seul : « huit pouvoirs » devient « neuf pouvoirs », la grille du choix, le lieu de l'accueil qui
  la raconte (`placeCards` de `src/client/odyssee/data.ts` la range dans le lieu le moins fourni).

### 3.11 Cadences

- Fichier : `src/shared/protocol.ts`, table `TIME_CONTROLS`, dans l'ordre d'affichage.
- Nouvelle cadence : une ligne avec `id`, `label`, `short`, `tc`, `family`. `quick: true` la propose dans les files
  d'attente. `invite: true` la propose dans « Défier un ami ».
- Retirer une cadence : `archived: true`. Elle est refusée à la création et dans la file. Une revanche reprend la
  pendule de la partie d'origine. Libellés et relectures la résolvent encore.
- Ne jamais recycler un identifiant : il est enregistré dans les parties.
- `DEFAULT_QUICK` (`'10+0'`) doit rester dans les files et dans « Défier un ami » (`test/coherence.test.ts`).
- Le garde de protocole suit les identifiants des cadences : `PROTOCOL_VERSION`.

### 3.12 Niveaux de l'IA

- Fichier : `src/shared/bot.ts`. `BOT_LEVELS` (`[1, 2, 3]`), `BOT_PROFILES` (nom, classement affiché, profondeur,
  part de hasard, seuil des cartes, temps de réflexion), `DEFAULT_BOT_LEVEL` (`2`).
- Le compilateur et `test/coherence.test.ts` exigent aussi `DRAFT_NOISE` (`src/shared/bot.ts`) et `BOT_LOOK`
  (`src/shared/catalog.ts`) pour chaque niveau.
- Niveaux par défaut ailleurs : `HOME.botLevel` (Oracle de l'accueil), `RELAY.level` (relais du serveur).
- `BOT_TIMEOUT_MS` doit rester au-dessus du plus long temps de réflexion (`test/coherence.test.ts`).
- Ne jamais recycler un niveau : il est enregistré dans les sièges. Un niveau inconnu prend le défaut.
- Le garde de protocole suit `BOT_LEVELS`.

### 3.13 Couper une fonction, fermer la boutique, maintenance

- Sans reconstruire : une variable d'environnement du serveur, puis un redémarrage. `FEATURE_<NOM>=0` coupe,
  `=1` rouvre. Nom de la variable : `homeDuel` donne `FEATURE_HOME_DUEL`.
- Le serveur refuse ce qui est coupé (code `feature-off`). Le site le cache, sans clignotement : le HTML porte
  `<meta name="sm-features">` seulement si une valeur diffère des défauts.
- Exemples :
  - `FEATURE_SHOP=0` : la boutique affiche sa page fermée, ses liens sont cachés, les paiements répondent 503 ; le
    catalogue reste lisible (`GET /api/shop/catalog`) ;
  - `FEATURE_RANKED=0` : file classée refusée ; la page `/classement` devient introuvable (404), l'API du classement
    reste lisible ;
  - `FEATURE_NEW_GAMES=0` : maintenance, plus aucune nouvelle partie ; celles en cours continuent.
- Une variable `FEATURE_*` inconnue ou illisible est signalée au démarrage ; la valeur par défaut est gardée.
- Fermer seulement les paiements : `PAYMENTS_MODE=off`. C'est la valeur de la production aujourd'hui
  (`deploy/production.env`).
- Changer un défaut pour tous les déploiements : `FEATURES` dans `src/shared/config/features.ts` (reconstruire).

### 3.14 Changer le nom du site

- `BRAND` dans `src/shared/config/brand.ts` : nom, nom en capitales du logo, nom court, accroches, couleurs.
  Reconstruire : le nom est figé dans `index.html`, le manifeste et les constantes `__SM__` du client.
- Variables du serveur : `APP_NAME` (e-mails, `/api/legal`, journal ; défaut : `BRAND.name`) et `MAIL_FROM`. En
  production : `deploy/production.env`.
- Ce qui suit : `index.html`, manifeste, titres des pages, en-tête, pied de page, partage d'une partie, en-têtes des
  PGN exportés (`Event`, `Site`), nom du fichier d'export des données du compte.
- Ce qui ne suit pas :
  - le logo de l'en-tête et du pied de page : le dessin `LogoMark` (SVG écrit dans `src/client/components/Layout.tsx`) ;
    seul le nom en capitales qui l'accompagne suit `BRAND.nameCaps` ;
  - les images : `public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/og.jpg` ;
  - le mot réservé `spellmate` de `USERNAME` (`src/shared/config/limits.ts`) : ajoutez le nouveau nom ;
  - les mentions légales (raison sociale, contact…), qui viennent des variables `LEGAL_*`.
- Ne jamais changer les identifiants techniques : `BRAND.storagePrefix` (`sm:`), `BRAND.pgnVariant` (`Spellmate`)
  (deux rappels, lus nulle part : les changer ne change rien), les cookies `sm_session` et `sm_guest`, la base `spellmate`, le dossier `/opt/spellmate`, les clés de `KEYS`. Les
  changer déconnecterait tout le monde, effacerait les préférences ou rendrait les PGN exportés illisibles.

### 3.15 Ajouter un emplacement de skin

Un dos de carte, un jeu de pièces… Étapes (commentaire de `src/shared/skins/slots.ts`) :

1. une entrée dans `SLOT_DEFS` (`src/shared/skins/slots.ts`) : libellés, accords, rayon, vue de la cabine, vu ou non
   par l'adversaire, objet par défaut, colonne SQL ;
2. ses phrases dans `SLOT_TEXTS` (`src/shared/skins/texts.ts`) ;
3. une migration qui ajoute sa colonne `equipped_*` (`src/server/db.ts`) ; ne jamais modifier une migration ancienne ;
4. son prix dans chaque ligne de la grille `PRICE` (`src/shared/catalog.ts`) ; ses objets dans un fichier voisin de
   `src/shared/skins/`, ajoutés à `ITEMS` (`src/shared/catalog.ts`) ;
5. le dessin de sa vignette (`src/client/pages/shop/ItemThumb.tsx`).

Le compilateur signale les tables à compléter. Rayons, libellés, objet par défaut, champs du compte et requêtes SQL
(`SLOT_COLUMN` de `src/server/auth.ts`) en dérivent. Un emplacement vu en partie de façon générique reste à faire
(différé, voir `docs/polymorphie/plan/plan.json`).

### 3.16 Modifier l'offre de la boutique

- Prix : grille `PRICE` (`src/shared/catalog.ts`, centimes TTC, par rareté et par emplacement). Un objet peut la
  contredire par `priceCents`. Règle : un prix déjà pratiqué ne monte jamais.
- Nouvel objet : dans `src/shared/skins/kings.ts`, `boards.ts` ou `spells.ts`. Nouvelle collection :
  `src/shared/skins/collections.ts`. Mise en avant : `badge` (« Populaire ») ou `isNew` (« Nouveau »).
- Retirer un objet : `retired: true`. Il quitte les rayons, les packs et le Trésor. Les collections qui le contiennent
  ne se vendent plus. Qui le possède le garde. Ne jamais supprimer ni recycler l'identifiant.
- Packs : la liste `packProducts` de `src/shared/catalog.ts`. `display` dit où la boutique le montre (en tête d'un
  rayon, ou `'banner'` sous les collections) ; sans `display`, il n'est montré qu'au Bazar de l'accueil.
- Trésor du Bazar : `TRESOR`. `items: 'premium'` (tous les objets payants en vente) ou une liste figée ; `future` :
  les emplacements promis (« et les prochains offerts »). Le prix « compléter » n'existe pas (décision Q2).
- Objet essayé à la première visite : `SHOP_FEATURED` (`{ king: 'king:braise' }`).
- Monnaie et prestataire : `CURRENCY` (`'eur'`), `PAYMENT_PROVIDER` (`'Stripe'`) ; format des prix : `LOCALE`
  (`src/shared/text/fr.ts`).

### 3.17 Ajouter une page

Étapes (commentaire de `src/shared/config/routes.ts`) :

1. une entrée dans `ROUTES` : chemin, module, propriétés, interrupteur facultatif ;
2. son module dans `PAGE_MODULES` et son chargeur dans `src/client/App.tsx` (le compilateur le demande) ;
3. ses propriétés dans `PageProps` si elle en prend ;
4. son titre dans `ROUTE_TITLES` si la page en pose un ; `NOT_INDEXED` pour la cacher aux moteurs de recherche.

Le serveur (`src/server/site.ts`) en tire le motif du chemin, le préchargement du code, le titre initial, l'adresse
canonique et le 404 d'une page coupée. Un lien de menu porte son propre interrupteur (`src/client/components/Layout.tsx`) :
`test/routes.test.ts` vérifie qu'il couvre celui de sa page.

### 3.18 Accueil

- `HOME` (`src/shared/config/home.ts`) : catalogue, partie contre l'IA, couleur du visiteur, niveau de l'Oracle,
  fenêtre d'appariement, seuil d'appariement en demi-coups, nom des visiteurs, durée de la sauvegarde, rythme de
  l'Oracle, mise au repos.
- `HOME.timed` reste `false` : l'accueil n'a pas de pendule. À `true`, la partie contre l'Oracle serait marquée « avec
  pendule » (état de la partie, texte de l'accueil) sans qu'aucune pendule n'existe, et le relais du serveur crée de
  toute façon ses parties sans pendule (`src/server/games.ts`).
- Règles de l'accueil : `RULES_BY_CONTEXT.accueil`. L'accueil tire toujours ses mains.
- Une sauvegarde locale d'un autre catalogue, d'autres règles ou d'un autre nombre de cartes repart de zéro.
- Lieux de la descente : `PLACES` (`src/client/odyssee/data.ts`). Un lieu de plus demande sa pose (`poseFor`), sa
  scène et son ciel : c'est un travail de dessin.
- Ne pas toucher à la logique de `src/client/odyssee/engine.ts` ni de `src/client/odyssee/scenery.tsx` : elle porte
  la performance de l'accueil.

### 3.19 Catalogues de cartes

- Fichier : `src/shared/cards.ts`. Aujourd'hui : `climats` (« Pouvoirs ») et `aucune` (« Sans cartes »), proposés ;
  `duel` (l'ancien Duel), plus proposé, gardé pour relire et reprendre les parties créées avant.
- `CATALOG_IDS` : tous les catalogues connus du moteur. Ne jamais retirer ni recycler un identifiant : des parties le
  portent (champ `catalog`, en-tête PGN `Catalog`).
- `CATALOG_RULES` : ce qui distingue un catalogue (proposé ou non, « la magie cède », effets des deux camps, tirage
  uniforme ou pondéré, Mur sur toute case, instantanés, aide des Terrains au mat, temps crédité aux cinématiques). Le
  moteur lit ces données, jamais l'identifiant. Le compilateur exige une entrée par catalogue.
- `CATALOGS` : les catalogues proposés, dans l'ordre, avec leur libellé et leur description (Règles, Jouer, Apprendre,
  libellés des parties). Il doit lister exactement les catalogues `offered` de `CATALOG_RULES`
  (`test/climats.test.ts`).
- Les cartes d'un catalogue : le champ `catalogs` de chaque carte dans `DEFS`.
- Ce qui suit tout seul : la création d'une partie (le serveur ramène un catalogue non proposé au catalogue par
  défaut : `offeredCatalog`), les files d'attente (séparées par catalogue : `MATCHMAKING.splitByCatalog`), les
  libellés (`catalogLabel`), le PGN, `checkRules` (réserves de chaque catalogue proposé qui a des cartes).
- À faire en plus : `PROTOCOL_VERSION` (le garde de protocole suit `CATALOG_IDS` et les catalogues proposés). Les
  pages Règles, Apprendre et Problèmes, les leçons et la cabine de la boutique sont écrites pour les Pouvoirs
  (l'identifiant `climats` y est écrit en dur) : un nouveau catalogue n'y apparaît pas sans travail. L'accueil suit
  `HOME.catalog`.
- Reproposer le Duel : `offered: true` dans `CATALOG_RULES.duel` et une entrée dans `CATALOGS`. Aucun test ne le couvre
  aujourd'hui.

### 3.20 Changer un texte

- Où vivent les phrases :
  - phrases de règles qui dépendent des réglages (« trois cartes », « un sort par tour », « 45 secondes »…) :
    `src/shared/text/regles.ts` ; grammaire (nombres en lettres, pluriels, accords), dates, nombres et prix :
    `src/shared/text/fr.ts` ; libellés uniques (couleur, catalogue, nature d'une partie, nom de carte) :
    `src/shared/text/libelles.ts` ;
  - textes des Pouvoirs : gabarits `TEMPLATES` de `src/shared/cards.ts` (section 4.3) ;
  - phrases des emplacements de la boutique : `SLOT_TEXTS` (`src/shared/skins/texts.ts`) ;
  - accueil : surtout `src/client/odyssee/data.ts`, le reste dans `src/client/odyssee/OdysseeHome.tsx` ; autres
    pages : leur module dans `src/client/pages/` ;
  - nom du site et accroches : `BRAND` (section 3.14) ; `index.html` et le manifeste en dérivent à la construction.
- N'écrivez pas en dur un nombre de règle ni le nom du site : `test/garde-fous/textes-chiffres.test.ts` le refuse dans
  `src`, `index.html` et le manifeste. Passez par une phrase de `src/shared/text/regles.ts` ou par `BRAND`. Une
  exception permanente (identifiant technique, commentaire) s'inscrit dans `test/garde-fous/exceptions.txt`, avec sa
  raison.
- Un texte changé exprès fait échouer ses photographies : `npm run textes-pages` (référence `test/fixtures/v1/textes`),
  `test/marque.test.ts` pour `index.html` et le manifeste, les tests qui citent la phrase (`test/textes-regles.test.ts`,
  `test/choix-cartes.test.ts`…), et `npm run temoins` pour les textes des cartes. Ces références ne se réécrivent que
  sur décision (section 6.3).
- Textes en attente d'une décision : Q5 (section 7).

---

## 4. Table des réglages

Légende :

- **Portée.** *Partie* : copié dans la partie à sa création (`GameState.rules` s'il diffère de `RULES_V1`).
  *Création* : lu quand une partie est créée ; le résultat est enregistré. *Plateforme* : vaut pour tout le monde dès
  la mise en ligne. *Environnement* : variable du serveur, lue au démarrage, sans reconstruire.
- **Lu par.** Serveur, client (navigateur), construction (`vite build` : `index.html`, manifeste, constantes `__SM__`
  du client). Un réglage lu à la construction demande de reconstruire le site.
- **Vérifié par.** `checkRules` (construction, démarrage, tests) ; compilateur ; zod (démarrage du serveur) ; tests
  nommés. `defauts` : la valeur par défaut est photographiée par `test/garde-fous/defauts.test.ts`
  (`test/garde-fous/defauts.json`).
- **Ce que `test/reglages-doc.test.ts` compare au code** : l'existence de chaque réglage, les valeurs écrites en code
  de la colonne « Défaut », la marque `defauts` de la colonne « Vérifié par » et les bornes de `cardsPerPlayer`,
  `cardsPerTurn` et `presageDelay`. Les autres marques de « Vérifié par », les autres bornes, la colonne « Lu par »
  et les valeurs écrites en toutes lettres ont été relues à la main, sans test.

### 4.1 Règles des nouvelles parties : `src/shared/config/rules.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `GAME_RULES.cardsPerPlayer` | `3` | 1 à 6 ; au plus la taille de la réserve ; une main tirée valide | Partie | serveur, client, construction | `checkRules`, garde de protocole, `defauts` |
| `GAME_RULES.cardsPerTurn` | `1` | 1 à 3 ; au plus `cardsPerPlayer` | Partie | serveur, client, construction | `checkRules`, garde de protocole, `defauts` |
| `GAME_RULES.cardEndsTurn` | `false` | `true` impose `cardsPerTurn` = 1 | Partie | serveur, client, construction | `checkRules`, garde de protocole, `defauts` |
| `GAME_RULES.handsVisible` | `true` | `false` refusé (mains cachées pas encore prises en charge) | Partie | serveur, client | `checkRules`, garde de protocole, `defauts` |
| `GAME_RULES.presageDelay` | `2` | 2 à 6, pair | Partie | serveur, client | `checkRules`, garde de protocole, `defauts` |
| `GAME_RULES.fiftyHalfmoves` | `100` | entier, au moins 2 (en demi-coups) | Partie | serveur, client | `checkRules`, garde de protocole, `defauts` |
| `GAME_RULES.repetitions` | `3` | entier, au moins 2 | Partie | serveur, client | `checkRules`, garde de protocole, `defauts` |
| `GAME_RULES.startFen` | `null` | FEN valide, roque standard, position pas déjà finie ; `null` : position standard | Partie | serveur, client | `checkRules`, garde de protocole, `defauts` |
| `RULES_BY_CONTEXT` | `{}` | contextes `classee`, `amicale`, `invitation`, `ia`, `accueil` ; mêmes bornes | Partie | serveur, client | `checkRules`, compilateur, `defauts` |
| `RULES_V1` | gelé | ne jamais modifier | parties sans `rules` | serveur, client | `test/config.test.ts` (`test/fixtures/rules-v1.json`) |
| `BOUNDS.cardsPerPlayer` | `[1, 6]` | — | Plateforme | serveur, client | `defauts` |
| `BOUNDS.cardsPerTurn` | `[1, 3]` | — | Plateforme | serveur, client | `defauts` |
| `BOUNDS.presageDelay` | `[2, 6]` | — | Plateforme | serveur, client | `defauts` |

### 4.2 Mise en place des nouvelles parties : `src/shared/config/rules.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `DEAL.draft` | `true` | booléen ; l'accueil tire toujours | Création | serveur, client | `checkRules`, `defauts` |
| `DEAL.draftMs` | `45_000` | au moins 1 000 ms | Création | serveur, construction (`__SM__.dureeChoix`) | `checkRules`, garde de protocole, `defauts` |
| `DEAL.handLimits.maxPerFamily.climat` | `2` | entier positif ou nul ; une main valide doit exister | Création | serveur, client | `checkRules`, `defauts` |
| `DEAL.handLimits.maxPerRarity.légendaire` | `1` | entier positif ou nul | Création | serveur, client | `checkRules`, `defauts` |
| `DEAL.limitsInDraft` | `false` | booléen | Création (gardé par le choix en cours) | serveur, client | `checkRules`, `defauts` |
| `DEAL.rarityWeight` | `{ "commune": 4, "rare": 3, "épique": 2, "légendaire": 1 }` | poids positifs | Création | serveur, client | `checkRules`, `defauts` |
| `DEAL.redrawAttempts` | `64` | entier, au moins 1 | Création | serveur, client | `checkRules`, `defauts` |
| `SUSPENDED_CARDS` | `[]` | cartes connues ; réserves assez grandes | Création | serveur, client | `checkRules`, `defauts` |

### 4.3 Cartes et catalogues : `src/shared/cards.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `CARDS.hourglass.coups` | `6` | entier, au moins 1 | Partie (copié dans `Rules.tuning`) | serveur, client | `checkRules`, `defauts` |
| `CARDS.hourglass.clockRate` | `2` | positif | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.truce.coups` | `3` | entier, au moins 1 | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.blood_moon.coups` | `3` | entier, au moins 1 | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.ice_age.coups` | `4` | entier, au moins 1 | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.blast.coups` | `4` | entier, au moins 1 | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.rift.coups` | `4` | entier, au moins 1 | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.rift.ranks` | `[3, 4]` | rangées de 0 à 7 | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.ice_wall.ranks` | `[2, 3, 4, 5]` | rangées de 0 à 7 | Partie | serveur, client | `checkRules`, `defauts` |
| `CARDS.tide.ranks` | `[1, 2, 3, 4]` | rangées de 1 à 5 (relatives au camp du pion) | Partie | serveur, client | `checkRules`, `defauts` |
| `retired` (par carte) | absent | ne jamais supprimer l'identifiant | Création | serveur, client | — |
| `CATALOG_IDS` | `["climats", "duel", "aucune"]` | ne jamais retirer un identifiant | Partie (catalogue enregistré) | serveur, client | garde de protocole |
| `CATALOG_RULES` | Pouvoirs, Duel (plus proposé), Sans cartes | une entrée par catalogue | Partie | serveur, client | compilateur |
| `CATALOGS` | Pouvoirs, Sans cartes | catalogues proposés | Création | serveur, client | garde de protocole |
| `DEFAULT_CATALOG` | `"climats"` | — | Création | serveur, client | — |
| `LEGACY_CATALOG` | `"duel"` | parties enregistrées sans catalogue | Partie | serveur, client | — |

Les textes des Pouvoirs (`description`, `duration`, `prompts`) ne s'écrivent pas : ils sont produits par `TEMPLATES`
à partir de l'équilibrage et du délai du Présage. La référence `test/fixtures/v1/cartes.json` exige, au défaut, les
textes d'avant au caractère près.

### 4.4 Cadences et protocole : `src/shared/protocol.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `TIME_CONTROLS` | 1+0, 3+2, 5+0, 10+0, 15+10, sans limite | identifiants uniques, jamais recyclés | Création (pendule copiée dans la partie) | serveur, client | `test/coherence.test.ts`, garde de protocole, `defauts` |
| `QUICK_CONTROLS` (dérivé de `quick`) | `["3+2", "5+0", "10+0", "15+10"]` | — | Création | serveur, client | garde de protocole, `defauts` |
| `INVITE_CONTROLS` (dérivé de `invite`) | `["5+0", "10+0", "15+10", "none"]` | — | Création | tests (« Défier un ami » lit `invite` dans `TIME_CONTROLS`) | `defauts` |
| `DEFAULT_QUICK` | `"10+0"` | dans `QUICK_CONTROLS` et `INVITE_CONTROLS` | Plateforme | client | `test/coherence.test.ts`, `defauts` |
| `PROTOCOL_VERSION` | `1` | à monter quand le garde le demande | Plateforme | serveur, construction (`__SM__.protocole`) | `test/garde-fous/protocole.test.ts` |
| `PAYMENTS_MODES` | `["stripe", "demo", "off"]` | valeurs permises de `PAYMENTS_MODE` | Environnement | serveur, client | zod |

### 4.5 IA : `src/shared/bot.ts` et `src/shared/catalog.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `BOT_LEVELS` | `[1, 2, 3]` | jamais recycler un niveau | Création (niveau enregistré dans le siège) | serveur, client, construction | compilateur, garde de protocole, `defauts` |
| `DEFAULT_BOT_LEVEL` | `2` | un niveau de `BOT_LEVELS` | Plateforme | serveur, client | `test/coherence.test.ts`, `defauts` |
| `BOT_PROFILES` | Apprenti (800, profondeur 1, 350 ms), Sorcier (1300, 2, 700 ms), Archimage (1800, 5, 1500 ms) | un profil par niveau | Plateforme | serveur, client, construction (`__SM__.niveauxIA`) | compilateur, `test/coherence.test.ts`, `defauts` |
| `DRAFT_VALUE` | Mur de glace 5 … Sablier fou 1 | une valeur par Pouvoir | Plateforme | serveur, client | compilateur, `test/coherence.test.ts` |
| `DRAFT_NOISE` | `{ "1": 3, "2": 1.6, "3": 1 }` | une valeur par niveau | Plateforme | serveur, client | compilateur, `test/coherence.test.ts` |
| `BOT_LOOK` | Arcane ; Inferno et braise ; Néant et éclipse | un par niveau | Plateforme | serveur, client | compilateur, `test/coherence.test.ts` |
| `ORACLE_LOOK` | `{ "skin": "skin:void", "king": "king:eclipse" }` | objets connus | Plateforme | client | — |

### 4.6 Accueil : `src/shared/config/home.ts` et `src/client/odyssee/data.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `HOME.catalog` | `"climats"` | un catalogue de cartes | Création | serveur, client | `checkRules` (réserve de l'accueil), `defauts` |
| `HOME.timed` | `false` | ne pas changer : pas de pendule sur l'accueil (section 3.18) | Création | client ; serveur : `checkRules` seulement (le relais l'ignore) | `checkRules`, `defauts` |
| `HOME.vsBot` | `true` | booléen | Création | serveur (`checkRules`), client | `checkRules`, `defauts` |
| `HOME.playerColor` | `"w"` | `"w"` ou `"b"` | Création | client | compilateur, `defauts` |
| `HOME.botLevel` | `2` | un niveau de `BOT_LEVELS` | Création | client | `test/coherence.test.ts`, `defauts` |
| `HOME.pairWindowMs` | `30_000` | ms | Plateforme | serveur | `defauts` |
| `HOME.readyMaxPly` | `4` | demi-coups | Plateforme | client | `defauts` |
| `HOME.guestName` | `"Visiteur"` | — | Plateforme | serveur | `defauts` |
| `HOME.saveVersion` | `1` | format de la sauvegarde locale ; ne pas changer | Plateforme | client | compilateur (type `1`), `defauts` |
| `HOME.saveMaxAgeMs` | `2_592_000_000` | ms (30 jours) | Plateforme | client | `defauts` |
| `HOME.oracleThinkMs` | `520` | ms | Plateforme | client | `defauts` |
| `HOME.oracleThinkJitterMs` | `380` | ms | Plateforme | client | `defauts` |
| `HOME.oracleAfterCastMs` | `380` | ms | Plateforme | client | `defauts` |
| `HOME.idleMs` | `30_000` | ms | Plateforme | client | `defauts` |
| `HOME.activityPingMs` | `3000` | ms | Plateforme | client | `defauts` |
| `HOME.duelAbortReturnMs` | `2500` | ms | Plateforme | client | `defauts` |
| `PLACES` | 6 lieux, de l'Observatoire au Seuil | une pose et une scène par lieu | Plateforme | client | compilateur |

### 4.7 Boutique : `src/shared/catalog.ts` et `src/shared/skins/`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `CURRENCY` | `"eur"` | code ISO en minuscules | Plateforme | serveur, client | — |
| `PAYMENT_PROVIDER` | `"Stripe"` | — | Plateforme | client | — |
| `SHOP_FEATURED` | `{ "king": "king:braise" }` | objets connus | Plateforme | client | — |
| `TRESOR` | `{ "items": "premium", "future": [] }` | `'premium'` ou une liste d'objets | Plateforme | serveur, client | tests de la boutique |
| `PRICE` | rare 2,99 / 1,99 / 2,99 / 5,99 €, épique 3,99 / 2,49 / 3,99 / 7,99 €, légendaire 4,99 / 2,99 / 4,99 / 9,99 € (roi / échiquier / sorts / collection) | un prix déjà pratiqué ne monte jamais | Plateforme | serveur, client | tests de la boutique |
| `SLOT_DEFS` | roi, échiquier, sorts | une migration par emplacement ajouté | Plateforme | serveur, client | compilateur |
| `LOCALE` | `"fr-FR"` | — | Plateforme | serveur, client | — |

`SLOT_DEFS` est dans `src/shared/skins/slots.ts`, `LOCALE` dans `src/shared/text/fr.ts`.

### 4.8 Marque : `src/shared/config/brand.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `BRAND.name` | `"Spellmate"` | — | Plateforme | serveur, construction | `test/marque.test.ts`, `defauts` |
| `BRAND.nameCaps` | `"SPELLMATE"` | — | Plateforme | construction | `test/socle-client.test.ts`, `defauts` |
| `BRAND.shortName` | `"Spellmate"` | — | Plateforme | construction | `test/marque.test.ts`, `defauts` |
| `BRAND.tagline` | `"Les échecs ont appris la magie"` | — | Plateforme | construction | `test/marque.test.ts`, `defauts` |
| `BRAND.footerTagline` | `"Les échecs, avec un peu de magie."` | — | Plateforme | construction | `test/socle-client.test.ts`, `defauts` |
| `BRAND.titleSeparator` | `" · "` | — | Plateforme | serveur, construction | `test/marque.test.ts`, `defauts` |
| `BRAND.themeColor` | `"#04050f"` | — | Plateforme | construction | `test/marque.test.ts`, `defauts` |
| `BRAND.backgroundColor` | `"#04050f"` | — | Plateforme | construction | `test/marque.test.ts`, `defauts` |
| `BRAND.pgnVariant` | `"Spellmate"` | identifiant technique : ne jamais changer | — | rappel, lu nulle part : la variante est écrite en dur dans `src/shared/pgn.ts` (la relier changerait le site construit) | `defauts` |
| `BRAND.storagePrefix` | `"sm:"` | identifiant technique : ne jamais changer | — | rappel, lu nulle part : les clés sont écrites en entier dans `src/client/storageKeys.ts` | `defauts` |

### 4.9 Pages et interrupteurs : `src/shared/config/routes.ts` et `src/shared/config/features.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `ROUTES` | 28 chemins | un chargeur par module | Plateforme | serveur, client | compilateur, `test/routes.test.ts` |
| `ROUTE_TITLES` | titres des pages qui en posent un | — | Plateforme | serveur | `test/routes.test.ts` |
| `NOT_INDEXED` | `["/compte", "/admin"]` | — | Plateforme | construction (`robots.txt`) | `test/marque.test.ts` |
| `FEATURES` | tous à `true` : `ranked`, `friendlyQueue`, `invites`, `botGames`, `guestPlay`, `live`, `homeDuel`, `homeRelay`, `puzzles`, `learn`, `analysis`, `shop`, `newGames` | booléens | Plateforme (défauts du code) | serveur, client | `test/server-features.test.ts`, `defauts` |
| variables `FEATURE_*` | absentes | `0`, `false`, `off`, `non` / `1`, `true`, `on`, `oui` | Environnement | serveur | démarrage (avertissement) |

### 4.10 Pseudos, mots de passe et durées partagées : `src/shared/config/limits.ts` et `src/shared/config/timings.ts`

| Réglage | Défaut | Bornes | Portée | Lu par | Vérifié par |
|---|---|---|---|---|---|
| `GUEST_NAME.min` | `2` | — | Plateforme | serveur, client, construction | `defauts` |
| `GUEST_NAME.max` | `20` | — | Plateforme | serveur, client, construction | `defauts` |
| `USERNAME.min` | `3` | — | Plateforme | serveur, construction | `defauts` |
| `USERNAME.max` | `20` | — | Plateforme | serveur, construction | `defauts` |
| `USERNAME.reserved` | `["admin", "administrateur", "moderateur", "support", "bot", "ia", "spellmate", "anonyme", "invite"]` | — | Plateforme | serveur | `defauts` |
| `PASSWORD.min` | `8` | — | Plateforme | serveur, construction | `defauts` |
| `PASSWORD.max` | `200` | — | Plateforme | serveur | `defauts` |
| `CINEMATIC_MS` | `1200` | doit couvrir l'animation d'un sort | Plateforme | serveur | `defauts` |
| `BOT_CARD_PAUSE_MS` | `2300` | — | Plateforme | serveur | `defauts` |
| `BOT_TIMEOUT_MS` | `20_000` | au-dessus du plus long temps de réflexion | Plateforme | serveur (le navigateur a sa propre copie : `WORKER_TIMEOUT` de `src/client/ai/index.ts`) | `test/coherence.test.ts`, `defauts` |

Les bornes des pseudos et la durée du choix sont figées à la construction dans les constantes `__SM__` du client
(`vite.config.ts`) : changer `src/shared/config/limits.ts` demande de reconstruire.

### 4.11 Serveur : `src/server/settings.ts`

Lus par le serveur seulement. Portée : Plateforme (redémarrage). Vérifiés par `test/garde-fous/defauts.test.ts`, sauf
`DATABASE`, `BOT_THREADS` et `PERSIST`.

| Réglage | Défaut | Rôle |
|---|---|---|
| `TIMINGS.firstMoveMs` | `45_000` | personne n'a joué son premier coup : partie annulée |
| `TIMINGS.claimAfterMs` | `60_000` | adversaire déconnecté : victoire réclamable |
| `TIMINGS.botIdleMs` | `1_800_000` | partie contre l'IA abandonnée par l'humain (30 min) : annulée |
| `TIMINGS.untimedIdleMs` | `259_200_000` | partie sans pendule sans aucune action (3 jours) : annulée |
| `TIMINGS.inviteTtlMs` | `259_200_000` | invitation jamais acceptée (3 jours) : annulée |
| `TIMINGS.endedRoomEvictMs` | `600_000` | partie terminée sans spectateur (10 min) : retirée de la mémoire |
| `TIMINGS.housekeepingMs` | `60_000` | période du ménage |
| `TIMINGS.rematchTtlMs` | `null` | échéance d'une revanche ; `null` : aucune (décision Q9) |
| `TIMINGS.saveDebounceMs` | `250` | regroupement des sauvegardes |
| `TIMINGS.flagMarginMs` | `30` | marge de la minuterie du drapeau |
| `TIMINGS.minPlyToStart` | `2` | demi-coups au-delà desquels la partie a commencé |
| `RATING.initial` | `1200` | classement de départ (le DEFAULT SQL reste 1200 ; l'INSERT passe la valeur) |
| `RATING.kProvisional` | `40` | facteur K des `provisionalGames` premières parties classées |
| `RATING.kEstablished` | `20` | facteur K ensuite |
| `RATING.provisionalGames` | `30` | parties provisoires |
| `RATING.scale` | `400` | échelle de la formule Elo |
| `RATING.floor` | `100` | classement minimal |
| `MATCHMAKING.baseTolerance` | `250` | écart de classement accepté au départ (file classée) |
| `MATCHMAKING.tolerancePerSecond` | `25` | élargissement par seconde d'attente |
| `MATCHMAKING.entryTtlMs` | `600_000` | entrée oubliée après 10 min |
| `MATCHMAKING.sweepMs` | `30_000` | période du balayage de la file |
| `MATCHMAKING.splitByCatalog` | `true` | files séparées par catalogue |
| `MATCHMAKING.anonymousPrefix` | `"Anonyme-"` | pseudo d'un invité anonyme (de `anonymousMin` à `anonymousMax`) |
| `RELAY.firstMoveMs` | `10_000` | accueil : l'IA joue pour un visiteur qui n'a pas encore joué |
| `RELAY.idleMs` | `30_000` | puis après ce délai sans signe de présence |
| `RELAY.abandonMs` | `30_000` | les deux visiteurs partis : partie annulée |
| `RELAY.delayMinMs` | `900` | temps de jeu de l'IA relais, minimum (plus `delayJitterMs`, 700) |
| `RELAY.level` | `2` | niveau de l'IA relais (indépendant de `HOME.botLevel`) |
| `BOT_RUNTIME.pauseMinMs` | `500` | pause de l'IA avant de jouer (plus `pauseJitterMs`, 500) |
| `BOT_RUNTIME.cardPauseMs` | `2300` | pause entre une carte de l'IA et la suite (`BOT_CARD_PAUSE_MS`) |
| `BOT_RUNTIME.maxFailures` | `3` | échecs consécutifs avant un coup légal au hasard |
| `BOT_RUNTIME.maxThreads` | `4` | fils de calcul au plus (et au plus le nombre de processeurs moins un) |
| `BOT_RUNTIME.timeoutMs` | `20_000` | délai maximal d'une décision (`BOT_TIMEOUT_MS`) |
| `DATABASE.poolMax` | `10` | connexions PostgreSQL (variable `DATABASE_POOL_MAX`) |
| `DATABASE.connectionTimeoutMs` | `10_000` | ouverture d'une connexion |
| `BOT_THREADS.maxRestarts` | `5` | remplacements d'un fil de l'IA mort, par fenêtre |
| `BOT_THREADS.restartWindowMs` | `60_000` | fenêtre de ces remplacements |
| `PERSIST.attempts` | `5` | essais d'enregistrement d'une fin de partie |
| `PERSIST.retryMs` | `5_000` | délai entre deux essais |
| `LIMITS.maxOpenRooms` | `8` | parties non terminées par créateur |
| `LIMITS.socketBurst` | `20` | réserve de jetons d'un socket (recharge : `socketPerSecond`, 8) |
| `LIMITS.createPerWindow` | `40` | créations de parties par adresse et par 10 min |
| `LIMITS.authPerWindow` | `30` | connexions et inscriptions par adresse et par 10 min (1000 en développement) |
| `LIMITS.checkoutPerMinute` | `15` | paiements par adresse et par minute |
| `LIMITS.liveList` | `40` | parties en direct listées (et `recentGames` 30, `leaderboard` 100, `profileGames` 20, `purchases` 100) |
| `ACCOUNT.sessionDays` | `30` | durée d'une session |
| `ACCOUNT.guestCookieDays` | `365` | durée du cookie d'invité |
| `ACCOUNT.verifyTokenMs` | `259_200_000` | validité du lien de vérification de l'e-mail (3 jours) |
| `ACCOUNT.resetTokenMs` | `3_600_000` | validité du lien de nouveau mot de passe (1 h) |

### 4.12 Effets, sons et client

| Réglage | Fichier | Défaut | Note |
|---|---|---|---|
| `CARD_FX` | `src/client/vfx/cardFx.ts` | une fiche par carte | exigé par le compilateur |
| `BOARD_MARKS` | `src/client/vfx/boardMarks.ts` | une marque par carte (ou `null`) | exigé par le compilateur |
| `CARD_SOUND` | `src/client/sound.ts` | une signature par carte | décision Q8 sur les sons des Pouvoirs |
| `CARD_ART` | `src/client/components/CardArt.tsx` | un dessin par carte | exigé par le compilateur |
| `CARD_SCENES` | `src/client/components/cardScenes.ts` | une scène par Pouvoir | `test/coherence.test.ts` |
| `RENDER.maxRatio` | `src/client/vfx/config.ts` | `2` | densité de pixels du rendu WebGL (`modestRatio` 1,5 sur un appareil modeste) |
| `PARTICLE_CAPACITY` | `src/client/vfx/config.ts` | `2600` | particules par système |
| `POOL_KEEP_MS` | `src/client/vfx/sharing.ts` | `20000` | scène WebGL gardée sans échiquier |
| `IDLE_BEFORE_YIELD_MS` | `src/client/vfx/sharing.ts` | `1500` | repos avant de céder une scène |
| `HANDOFF_MS` | `src/client/vfx/sharing.ts` | `900` | délai avant de rendre une scène |
| `KEYS` | `src/client/storageKeys.ts` | `sm:sound`, `sm:odyssee:partie`… | ne jamais renommer une clé |
| `LIVE_DEPTH` | `src/client/features/engine.ts` | `12` | profondeur maximale de l'analyse continue (Analyse) |
| `LIVE_MS` | `src/client/features/engine.ts` | `6000` | temps alloué par position (analyse continue) |
| `REVIEW_DEPTH` | `src/client/features/engine.ts` | `3` | profondeur de la relecture d'une partie |

Les durées marquées « CSS » dans `src/client/vfx/config.ts` sont comparées aux feuilles par
`test/durees-css.test.ts`. Ces réglages ne sont pas photographiés par `defauts.json`.

### 4.13 Variables d'environnement du serveur : `src/server/config.ts`, `.env.example`

| Variable | Défaut | Contrôle au démarrage |
|---|---|---|
| `PORT` | 3000 | zod : entier de 1 à 65535 |
| `PUBLIC_URL` | `http://localhost:<port>` | zod : adresse http ou https |
| `APP_NAME` | `BRAND.name` | — |
| `MAIL_FROM` | `<BRAND.name> <no-reply@localhost>` | — |
| `SECRET_KEY` | `dev-secret-a-changer` hors production | au moins 32 caractères en production |
| `PAYMENTS_MODE` | `stripe` si `STRIPE_SECRET_KEY` est donnée, sinon `off` en production et `demo` ailleurs | zod : `stripe`, `demo` ou `off` ; avertissement si `stripe` sans `STRIPE_WEBHOOK_SECRET` |
| `LEGAL_COMPANY`, `LEGAL_ADDRESS`, `LEGAL_SIREN`, `LEGAL_VAT`, `LEGAL_DIRECTOR`, `LEGAL_CONTACT`, `LEGAL_HOST` | modèles entre crochets, `contact@example.com` | avertissement en production s'ils restent des modèles (décision Q1) |
| `DATABASE_URL` | vide : base PGlite intégrée dans `DATA_DIR` | — |
| `DATABASE_POOL_MAX` | `DATABASE.poolMax` (10) | zod : entier de 1 à 1000 |
| `TRUST_PROXY` | 1 en production, 0 ailleurs | zod : `true`, `false` ou un nombre |
| `FEATURE_*` | absentes | avertissement pour un nom ou une valeur inconnus |
| `SPELLMATE_TEST_RULES` | absente | refusée en production ; objet JSON aux clés connues |

Une valeur illisible d'une variable contrôlée par zod arrête le serveur avec un message en français. En production, la configuration vient de
`deploy/production.env`, puis des secrets du serveur (`/opt/spellmate/secrets.env`, `/opt/spellmate/local.env`).

---

## 5. Règles par contexte et règles de test

### 5.1 Contextes

Chaque partie est créée dans un contexte. Ses règles sont `GAME_RULES`, puis `RULES_BY_CONTEXT[contexte]`
(`rulesFor(ctx)` de `src/shared/rulesCore.ts`).

| Contexte | Parties | Qui choisit le contexte |
|---|---|---|
| `classee` | file classée | `contextOf` de `src/server/games.ts` |
| `amicale` | file amicale (partie rapide non classée) | `contextOf` |
| `invitation` | invitation par lien (Jouer, « Défier un ami ») | `contextOf` |
| `ia` | partie contre l'IA créée depuis Jouer | `contextOf` |
| `accueil` | accueil : contre l'Oracle dans le navigateur (`src/client/odyssee/useLiveGame.ts`), et partie en direct entre deux visiteurs (relais du serveur) | `contextOf` ; le client pour l'Oracle |

Cas particuliers :

- Catalogue Duel (plus proposé, anciennes parties seulement) : toujours `RULES_V1`.
- Leçons, problèmes, démonstrations de l'accueil et cabine de la boutique : `RULES_V1`. Leur contenu a été écrit pour
  ces règles. Ce que les règles du jour contrediraient est masqué (`requires`, jugé sur `GAME_RULES`).
- Revanche : nouvelle partie aux règles du moment de son contexte (décision Q3), avec la pendule de la partie
  d'origine, même si sa cadence a été retirée depuis.
- Le journal du serveur résume au démarrage les règles des nouvelles parties : une ligne, plus une par contexte qui
  diffère.

### 5.2 Règles de test : `SPELLMATE_TEST_RULES`

- Variable d'environnement du serveur, pour les tests de bout en bout seulement.
- Objet JSON. Clés permises : les réglages de `GAME_RULES` (`cardsPerPlayer`, `cardsPerTurn`, `cardEndsTurn`,
  `handsVisible`, `presageDelay`, `fiftyHalfmoves`, `repetitions`, `startFen`) et trois réglages de `DEAL` (`draft`,
  `draftMs`, `limitsInDraft`).
- Elle passe devant `GAME_RULES` et `RULES_BY_CONTEXT`, pour tous les contextes. Elle est vérifiée par `checkRules`
  comme le code.
- Refusée en production (`NODE_ENV=production`) : le serveur s'arrête avec un message.
- `scripts/serveur-jetable.mjs` la transmet et passe alors le serveur en `NODE_ENV=test`, en servant le site
  construit.
- Exemples :
  - `SPELLMATE_TEST_RULES='{"cardsPerPlayer":5,"cardsPerTurn":2}' node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}` ;
  - `SPELLMATE_TEST_RULES='{"draft":false}' node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}`.
- Elle ne change que le serveur. Le navigateur garde les règles du code pour ses textes et pour l'accueil.

---

## 6. Garde-fous

### 6.1 `checkRules` : des règles impossibles ne passent jamais

- Code : `checkRules()` de `src/shared/rules.ts`. Rend une liste de phrases en français ; vide si tout est jouable.
- Appelée à trois endroits :
  - à la construction : greffon `spellmate:marque` de `vite.config.ts` (« Règles impossibles : construction
    arrêtée. ») ;
  - au démarrage du serveur : `startupReport` de `src/server/index.ts` (« Règles impossibles : arrêt. ») ;
  - dans les tests : `test/config.test.ts`, `test/marque.test.ts`, `test/server-config.test.ts`.
- Vérifie, pour chaque contexte et chaque réserve (avec ou sans pendule, contre l'IA ou non) :
  - les noms (réglage, contexte, famille, rareté, carte suspendue) : une faute de frappe est une erreur ;
  - les bornes de `BOUNDS`, la parité du délai du Présage, `cardsPerTurn` ≤ `cardsPerPlayer`, la carte à la place du
    coup avec une seule carte par tour, les mains visibles ;
  - la règle des 50 coups, la répétition, la position de départ ;
  - l'équilibrage des cartes ;
  - la mise en place (`DEAL`) ;
  - la taille des réserves, et une main valide pour chaque réserve tirée.
- Les règles venues de l'extérieur sont relues par `parseRules`, avec les mêmes vérifications : en-tête PGN
  `SpellmateRules`, reprise d'une partie après un redémarrage, résumé d'une partie enregistrée. La sauvegarde de
  l'accueil est comparée aux règles de l'accueil : si elles diffèrent, la partie repart de zéro.
- Exemples de messages :
  - « GAME_RULES.cardEndsTurn (la carte remplace le coup) impose 1 carte par tour, mais GAME_RULES.cardsPerTurn vaut 2. »
  - « GAME_RULES.presageDelay vaut 3 : il doit être pair (un Présage arrive au début d'un tour de son lanceur). »
  - « RULES_BY_CONTEXT.amical : contexte inconnu (contextes : classee, amicale, invitation, ia, accueil). »
  - « DEAL.draftMs vaut 500 : une durée d'au moins 1000 ms est attendue. »

### 6.2 Tests gardiens

| Test | Ce qu'il garde | Quand il échoue |
|---|---|---|
| `test/garde-fous/defauts.test.ts` | toutes les valeurs par défaut des réglages (`test/garde-fous/defauts.json`) | à chaque valeur par défaut changée |
| `test/garde-fous/protocole.test.ts` | cartes, catalogues, cadences, niveaux de l'IA, `GAME_RULES`, `DEAL.draftMs` (`test/fixtures/protocole.json`) | si l'un change sans montée de `PROTOCOL_VERSION` |
| `test/garde-fous/textes-chiffres.test.ts` | aucun nombre de règle (« trois cartes », « un sort par tour », « 45 secondes »…) ni nom de marque écrit en dur dans `src`, `index.html` et le manifeste | à chaque nouvelle occurrence hors des exceptions (`test/garde-fous/exceptions.txt`) |
| `test/coherence.test.ts` | registres par carte, cadences, niveaux de l'IA, durées JS et CSS, seuil mobile, paquet principal, dettes du garde-fou vides | si un registre oublie une carte, un niveau ou une cadence |
| `test/config.test.ts` | `checkRules` au défaut et ses refus, `RULES_V1` gelé, `parseRules` | si la configuration devient impossible (« configuration du jour ») |
| `test/socle.test.ts` | modules de configuration sans import à l'exécution, identifiants jamais recyclés, réglages couplés | si un module de configuration importe du code |
| `test/marque.test.ts` | `index.html`, manifeste et `robots.txt` identiques au défaut (phrases des règles dérivées de `GAME_RULES` hors du défaut) ; construction arrêtée par des règles impossibles | à chaque changement de marque (`BRAND`) |
| `test/regles-matrice.test.ts` | parties au hasard menées au bout pour chaque combinaison de règles jouable | si une variante casse le moteur |
| `test/reglages-doc.test.ts` | ce document et `README.md` : chemins, commandes, noms, valeurs par défaut et bornes des tables, contenus masqués, messages de `checkRules` | à chaque valeur par défaut changée (colonne « Défaut ») ; si `GAME_RULES` change, aussi pour les listes « Masqués » des sections 3.5 à 3.8 |

Les autres tests ne dépendent pas des valeurs par défaut (lot 9e) : ils fixent leurs règles avec `RULES_V1`,
`REGLAGES_V1` et `DEAL_V1` (`test/helpers/v1.ts`), relisent les pages avec la configuration V1 (`relireAvecConfigV1`),
ou dérivent l'attendu du réglage du jour. `npm run essai-reglage` (section 2.1) le vérifie sur une copie jetable ;
`test/essai-reglage.test.ts` garde ses essais et sa liste de gardes.

Le garde-fou des textes chiffrés ne repère que ses motifs. Une tournure nouvelle peut lui échapper : relisez les
textes après un changement de règle. Ses dettes par lot (`test/garde-fous/dette-<lot>.txt`) sont toutes vides.

### 6.3 Témoins, bancs et suites de bout en bout

| Commande | Ce qu'elle fait | À ne jamais faire sans décision |
|---|---|---|
| `npm run temoins` | rejoue les témoins v1 (`test/fixtures/v1`) : textes des cartes, 40 parties, tirages, salles, sauvegarde de l'accueil, PGN | `TEMOINS_MODE=ecrire` ; un écart voulu se déclare dans `ECARTS_VOULUS` de `test/fixtures/v1/generer.ts` |
| `npm run identite` | captures, boîtes, DOM et textes comparés à la référence hors du dépôt (`/home/user/spellmate-ref`, sur la machine de la passe seulement ; votre propre référence : section 2, étape 6) | `--ecrire` sans `--sortie` (il vise la référence de la passe) |
| `npm run textes-pages` | texte des pages et d'une partie comparé à `test/fixtures/v1/textes` | `--ecrire` sans `--sortie` (il vise la référence du dépôt) |
| `SPELLMATE_MATRICE=1,2,3,4,5 npm run test:matrice` | matrice complète des règles (défaut : 1, 3 et 5 cartes) | — |
| `node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}` | parcours complet sur un serveur neuf (comptes, choix, parties, IA, boutique) | — |
| `node scripts/serveur-jetable.mjs -- node test/ranked.mjs {base}` | file classée et Elo | — |
| `node scripts/serveur-jetable.mjs --env=FEATURE_SHOP=0 -- node test/fonctions.mjs {base} shop=0` | interrupteurs (boutique, classé) | — |

`npm run identite` et `npm run textes-pages` refusent un site construit périmé (`--construire` le reconstruit) et un
environnement hors défaut (`SPELLMATE_TEST_RULES`, `FEATURE_*`, `APP_NAME`, `LEGAL_*`, fichier `.env` ;
`--hors-defaut` passe outre pour regarder).

---

## 7. Limites connues et décisions en attente

### 7.1 Décisions du fondateur

| Question | État au défaut | Où agir |
|---|---|---|
| Q1. Mentions légales de production (raison sociale, adresse, SIREN, TVA, directeur, contact, médiateur) | `/api/legal` sert les modèles ; le serveur l'avertit au démarrage, sans s'arrêter | variables `LEGAL_*` (`deploy/production.env`, ou `/opt/spellmate/local.env`) |
| Q2. Prix « compléter » du Trésor du Bazar | non fait : prix fixe, contenu `TRESOR` = tous les objets payants, aucune promesse | `TRESOR` et `tresorPack` (`src/shared/catalog.ts`) |
| Q5. Textes de marketing qui changeraient au défaut : vouvoiement de 3 messages, « 10+0 » ou « 10 + 0 », « Paiement sécurisé par Stripe » quand la vente est fermée, CGV sans rois ni collections, `public/og.jpg` (cartes du Duel), indication « Rois, échiquiers et sorts » du menu et exemples de cartes de la description d'`index.html` à dériver ou non | rien n'a changé | textes concernés |
| Q11. Petites cartes à 5 ou 6 cartes, surtout sur mobile | à 6 cartes, noms d'environ 3 px en 360 × 640 et 4 px en 412 × 915 ; la carte s'ouvre en grand au toucher | règles CSS sous `.gs-fan[data-crowd]` (`src/client/odyssee/shell/shell.css`) |
| Formulation du Présage à délai 4 : « Annoncé : arrive au début de votre deuxième tour à venir » | inactive au défaut (délai 2) | `prochainTour` (`src/shared/text/regles.ts`) |

Décisions prises par défaut pendant la passe : Q3 (revanche aux règles du moment), Q4 (contraintes du tirage
absentes du choix), Q6 (une carte à la place du coup compte pour les 50 coups) ; Q7, Q8 et Q9 : rien ne change ;
Q10 : pas d'intégration continue.

### 7.2 Limites du code

- Les mains cachées n'existent pas : `handsVisible: false` est refusé. Il faudra un lot dédié (affichage du dos des
  cartes, IA, fuites d'information par certaines règles).
- La position de départ n'accepte que le roque standard : pas de Chess960.
- L'accueil tire toujours ses mains : il n'a pas d'écran de choix des cartes.
- Le seuil de conservation des cartes de l'IA est calibré pour 3 cartes.
- Changer une valeur par défaut ne fait échouer que les gardes de la section 2 pour les 7 essais de la section 2.1
  (règles, durée du choix, rangées du Mur). Les autres réglages (cadences, IA, accueil, interrupteurs, marque, boutique,
  serveur) n'ont pas été essayés ainsi : des tests peuvent encore les photographier (`npm run essai-reglage` le dira).
  `npm run temoins` échoue après tout changement de règle par défaut (section 2.1).
- Le garde de protocole ne suit ni `RULES_BY_CONTEXT`, ni l'équilibrage des cartes, ni `DEAL.draft`.
- `SPELLMATE_TEST_RULES` ne change que le serveur.
- Aucun de ces réglages n'a été essayé en production, sur un vrai téléphone, ni dans des parties jouées par des
  humains : seulement par les tests, les suites de bout en bout et des captures.
