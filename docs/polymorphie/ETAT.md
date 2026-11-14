# Passe « polymorphe » : état d'avancement (13 novembre)

Plan complet : `plan/CONCEPTION.md` (conception finale), `plan/lots/*.md` (un fichier par lot), `plan/plan.json`
(table des réglages, défauts à corriger, différés) et `plan/audits.json` (audits par domaine, avec les emplacements).

## Fait et fusionné (vague 0)
- **Lot 0a, témoins et outillage** : références v1 dans `test/fixtures/v1` (textes des cartes, géométrie, 40 parties,
  tirages, salles, sauvegarde de l'accueil, PGN, textes des pages) ; `scripts/serveur-jetable.mjs` ; `test/identite.mjs`
  et `test/textes-pages.mjs` (comparaison à la référence, hors git dans `/home/user/spellmate-ref`, à régénérer dans
  une nouvelle session avec `--ecrire` sur le code d'avant la vague 1, c'est-à-dire le commit de fusion de 0b) ;
  `scripts/verifier-lot.mjs` et `LOTS.json` (possession des fichiers par lot).
- **Lot 0b, socle** : tableau de bord `src/shared/config/` (règles, mise en place, interrupteurs, marque, limites,
  délais, accueil), `src/shared/rules.ts` (règles d'une partie, `checkRules`), `src/shared/text/` (aides françaises et
  phrases de règles dérivées, identiques au caractère près au défaut), ajouts au protocole, `src/server/settings.ts`,
  garde-fou des textes chiffrés. Rien ne consomme encore ces modules : comportement inchangé.

Contrôles après fusion : `tsc` sans erreur, 576 tests verts. Rien n'est déployé.

## Fait et fusionné (vague 1)
- **Lot 1, moteur, cartes et IA** : le moteur lit les règles figées dans chaque partie (`GameState.rules`, absentes au
  défaut). Capacités nouvelles : plusieurs cartes par tour (`cardsPerTurn`), carte à la place du coup (`cardEndsTurn`,
  compté pour la règle des 50 coups), délai du Présage, rangées de la Marée et de la Faille, équilibrage (`tuneOf`),
  seuils des 50 coups et de la répétition. Catalogues en données (`CATALOG_RULES`), textes des Pouvoirs tirés de
  gabarits, codes de refus, tirage contraint toujours complétable, décision de l'IA unique (`decideTurn`, la réponse porte
  `cards`). Nouveau noyau `src/shared/rulesCore.ts` (sans la validation, pour l'accueil) ; `rules.ts` garde la
  validation. Tests : témoins v1 rejoués coup pour coup, matrice des règles, fréquences exactes du tirage.
- **Lot 2, boutique et équipement** : emplacements décrits une fois (`src/shared/skins/slots.ts`, `SLOT_DEFS`), packs et
  bandeau du Trésor génériques (`TRESOR`, `tresorPack`), `CURRENCY`, `LOCALE`, `PAYMENT_PROVIDER`, `SHOP_FEATURED`. La
  boutique coupée (`FEATURE_SHOP=0`) refuse aussi les paiements côté serveur (503). Réponse publique du catalogue
  identique à l'octet. Captures de la boutique et des échiquiers rendues reproductibles.

Défauts corrigés dans cette vague : un objet retiré par l'administrateur est déséquipé et n'est plus vendu (seul, en
panier ou par sa collection) ; un PGN exporté avec une prise qui explose (Déflagration) se relit ; un PGN de partie à
pendule avec le Sablier fou se relit. Décision de l'orchestrateur pour ces deux derniers, signalés par le lot 0a hors du
plan : ils ne changent que des PGN refusés avant (banc différentiel de 120 parties), donc rien au défaut.

Contrôles après fusion (b16f79a) : `tsc` sans erreur, 786 tests verts, `npm run temoins` vert, build réussi,
`npm run textes-pages` et `npm run identite` identiques à la référence. Aucune mesure de performance (lot 9).

Points ouverts :
- Poids de l'accueil : environ +4,3 ko gzip sur les morceaux game, cards et bot, +1,9 ko gzip sur catalog ; `index.js`
  quasi identique (+26 o). À mesurer au lot 9, avec des pistes pour le réduire si besoin.
- Fondateur : prix « compléter » du Trésor (Q2), non fait ; formulation de l'annonce d'un Présage à délai 4.
- Rien n'a été vérifié en partie réelle par un humain : les capacités nouvelles ne sont couvertes que par les tests.

## Fait et fusionné (vague 2)
- **Lot 3, serveur** : les parties naissent avec les règles de leur contexte (photographiées seulement si elles diffèrent
  de `RULES_V1`) ; choix des cartes à N cartes (`draftView.count`, `reveal { auto, filled }`), revanche aux règles du
  moment (Q3) avec la pendule d'origine, IA qui joue toutes ses cartes (`reply.cards`). Réglages nommés lus partout
  (`settings.ts`), `elo()` pur, configuration validée par zod, interrupteurs appliqués côté serveur (code
  `feature-off`), version du protocole au handshake (`server:outdated`). Des règles impossibles arrêtent le serveur au
  démarrage (« Règles impossibles : arrêt. »), ce qui fait échouer un déploiement fautif au contrôle de `/api/health`
  (depuis le lot 6, la construction les refuse d'abord : le déploiement s'arrête avant de remplacer la version en
  ligne ; depuis le lot 9f, une configuration refusée aussi, par `--check-config`).
- **Lot 4, effets, échiquier et sons** : fiches d'effet des cartes (`vfx/cardFx.ts`, `vfx/boardMarks.ts`), sons en table,
  traits des skins en données, code mort des effets retiré, `vfx/config.ts`, `motion.ts`, Saut du cavalier en cases de
  N. Annonce neutre préparée pour des mains cachées (inactive). Captures des sorts reproductibles et reprises.

Défauts corrigés dans cette vague : file d'attente et assise sous concurrence (deux joueurs au même moment), pool pg sans
écouteur d'erreur ni délai de connexion, spectateurs de `/live` mal comptés, fil de l'IA mort jamais remplacé, fin de
partie perdue si la base ne répond pas (nouvel essai, classement rattrapé au démarrage), échec de création d'une partie
appariée qui faisait perdre sa place à celui qui attendait, `.env` lu trop tard pour les interrupteurs.

Contrôles après fusion (3be9010) : `tsc` sans erreur, 930 tests verts, `npm run temoins` vert, build réussi,
`npm run textes-pages` et `npm run identite` identiques à la référence ; `integration.mjs` vert au défaut, avec
`{"cardsPerPlayer":5,"cardsPerTurn":2}` et avec `{"cardsPerPlayer":1}` ; `ranked.mjs` vert.

Points ouverts ajoutés : poids de l'accueil, environ +0,6 ko gzip de plus (lot 4) ; contact légal par défaut gardé
(`contact@example.com`, identité) en attendant les vraies mentions (Q1).

## Fait et fusionné (vague 3)
- **Lot 5, partie en ligne et coque** : la coque, le choix des cartes et la partie suivent N, le budget de cartes par
  tour, le moment de la carte et le délai des Présages ; textes dérivés (singulier pour 1 carte, « Remplace votre
  coup », « Dans deux tours »…) ; petites cartes au-delà de 3 (moment en icône, pastille courte) ; un seul écouteur de
  redimensionnement. Identique au défaut, à 3 cartes.
- **Lot 6, socle client, marque, routes et SEO** : table des routes partagée (`src/shared/config/routes.ts`), marque
  pliée au build (`index.html` tiré de `BRAND`), greffon Vite qui refuse des règles impossibles, limite d'erreur par
  page avec rechargement quand le code d'une page manque, réseau avec délai maximal, interrupteurs sans flash, liens
  de la boutique cachés quand elle est fermée. `index.html` construit identique au défaut ; HTML servi enrichi (titre,
  canonical, statut 404… : « Écarts voulus au défaut » du rapport final).

Défauts corrigés dans cette vague : « Partie sans cartes » affiché à tort dans l'attente et le choix des cartes (seul
écart, voulu, avec la référence des bancs) ; minuterie d'émote commune aux deux camps ; note de révélation du choix
devinée côté client au lieu d'être donnée par le serveur ; numérotation des coups après une Grande Marée des Noirs ;
page blanche quand le code d'une page manque après une mise en ligne.

Contrôles après fusion : `tsc` sans erreur, 1 115 tests verts, `npm run temoins` vert, build réussi ; bancs d'identité
et de textes identiques à la référence hors l'écart voulu ci-dessus ; `integration.mjs` vert au défaut, avec 5 cartes
et 2 par tour, avec 1 carte, avec la carte à la place du coup ; `ranked.mjs` vert.

Points ouverts ajoutés :
- Q11 (fondateur) : captures des variantes (1, 5, 6 cartes, 2 par tour, carte à la place du coup, Présage à 4) ; au
  lot 9, noms coupés sur les petites cartes du bureau et bulle de consigne qui recouvre les cartes sur mobile au-delà de
  3 cartes.
- Paquet principal : +765 o gzip face à 6ae7064 (marge prévue ±0,5 ko) ; le lot 9 retire les reliquats (`usePref` de
  `store.tsx`, surcharges de `emitAck`) puis mesure.

## Fait et fusionné (vague 4)
- **Lot 7, accueil** : l'accueil lit `HOME`, `PLACES`, les règles de l'accueil et les interrupteurs (catalogue, pendule,
  couleur, niveau et rythme de l'Oracle, sauvegarde v1, portes, lieux, Bazar, « Défier un ami ») ; textes dérivés ;
  l'Oracle joue toutes ses cartes ; mini-main chevauchée au-delà de 3 cartes. `engine.ts` ne gagne qu'un export
  (`SLOT_TILT`) et `scenery.tsx` une sélection par identifiant : logique des chemins chauds inchangée.
- **Lot 8, pages et contenus** : Règles, Jouer, Apprendre, Problèmes, Classement, Connexion et Mes parties tirés des
  réglages ; leçons et problèmes figés en `RULES_V1` et masqués quand les règles du jour les rendraient faux
  (`requires`) ; problème du jour stable ; l'historique garde les règles d'une partie hors défaut et l'Analyse la rejoue
  avec elles ; SkinPreview, DemoBoard et environ 200 lignes de CSS mort supprimés.

Défauts corrigés dans cette vague : halo et curseur de l'accueil faux pour un visiteur aux Noirs ; position d'une partie
précédente montrée en attendant l'adversaire ; socket de l'accueil ouvert avant `/api/me` ; « Partie sans cartes »
entrevu pendant l'appariement ; pluriels « 1 étapes », « 1 leçon terminées », « 1 coups ».

Contrôles après fusion (f6422b5) : `tsc` sans erreur, 1 175 tests verts, `npm run temoins` vert, build réussi ; bancs
d'identité et de textes identiques à la référence hors les écarts voulus (« Partie sans cartes », « 1 étape ») ;
`integration.mjs` vert au défaut, avec 5 cartes et 2 par tour, 1 carte, la carte à la place du coup et un Présage à 4 ;
`ranked.mjs` vert.

Poids mesuré après la vague 4 (gzip -9, fermeture des imports statiques) : accueil 222 036 → 235 015 o (+5,8 %),
paquet principal 100 989 → 101 843 o, page de partie 197 449 → 207 193 o. Le lot 9a doit le réduire avant la mesure de
performance.

Le lot 9 est découpé en 9a (client : poids, reliquats, mises en page hors défaut) ∥ 9b (serveur, protocole, moteur,
outillage, cohérence, bout en bout), puis mesure de performance par l'orchestrateur seul, puis 9c (documentation,
rapport). Plans : `plan/lots/9a.md`, `plan/lots/9b.md`.

## Fait et fusionné (vague 5 : lots 9a et 9b)
- **Lot 9a, client** : feuille « Défier un ami » chargée à part (le protocole n'est plus préchargé par l'accueil),
  textes de la boutique hors du morceau du catalogue (`skins/texts.ts`), bornes des pseudos et durée du choix figées au
  build, `usePref` et `emitAck` migrés (surcharges dépréciées retirées), reliquats des lots 5 à 8 retirés ; au-delà de 3
  cartes, noms des petites cartes lisibles au bureau et invite posée au-dessus des cartes sur mobile.
- **Lot 9b, serveur et outillage** : `SLOT_COLUMN` tiré de `SLOT_DEFS`, cookie d'invité unique, alias et paramètre
  miroir retirés, `rulesSummary` avec la mise en place ; résumé d'une partie avec ses règles et cause d'une annulation
  (champs facultatifs, jamais écrits au défaut, version du protocole inchangée) ; tableau de bord complété
  (`config/index.ts`), `test/coherence.test.ts`, maquettes réparées (`npm run typecheck:concepts` à 0 erreur), banc
  d'identité plus strict sur le bruit faible, suites de bout en bout étendues (`test/fonctions.mjs` : boutique et classé
  coupés, cadence archivée ; IA à deux cartes).
- Raccords de l'orchestrateur après la fusion : le serveur importe les textes de la boutique de `skins/texts.ts`,
  alias `RARITY_WEIGHT` retiré, leçon « Les cartes » avec les mains de l'accueil, profil public libellé avec les
  règles de chaque partie, message de l'accueil quand un premier coup manque (relais coupé seulement).

Contrôles après fusion (094b638) : `tsc` et `typecheck:concepts` sans erreur, 1 215 tests verts, matrice complète
(194), `npm run temoins` vert, build réussi, `index.html` identique ; bancs d'identité et de textes identiques à la
référence hors les écarts voulus ; `integration.mjs` vert au défaut, avec 5 cartes et 2 par tour, 1 carte, la carte à
la place du coup, un Présage à 4 et le tirage partout ; `ranked.mjs` vert ; `fonctions.mjs` vert au défaut, boutique
coupée et classé coupé.

Poids final (gzip -9, fermeture des imports statiques, face à 6ae7064) : accueil 222 036 → 232 979 o (+4,9 %),
paquet principal 100 989 → 101 774 o (+0,8 %), page de partie 197 449 → 206 200 o (+4,4 %).

## Reste à faire (après la vague 5)
1. Mesure de performance par l'orchestrateur, seul sur la machine : faite (résultats dans le rapport final).
2. Lot 9c : `docs/REGLAGES.md`, README, tableau des modules de `plan/CONCEPTION.md`, rapport final : fait.

Le script de vague (réaliser, deux relectures adverses, corriger) est réutilisable : une copie de travail par lot,
hors de `.claude`, branche `polymorphie/<lot>`.

## Rapport final

### Ce qui a été fait

La passe rend le site modifiable par quelques constantes, sans changer le site au réglage par défaut (hors les
corrections listées plus bas). Treize lots (0a, 0b, 1 à 8, 9a, 9b, 9c) en sept vagues ; chaque lot de code a été relu
deux fois avant sa fusion.

- **Tableau de bord des réglages** : `src/shared/config/` (règles, mise en place, accueil, marque, interrupteurs,
  pages, bornes, durées) et `src/server/settings.ts` (délais, classement, file, relais, IA, limites, comptes). Une
  ligne de commentaire par réglage dans `src/shared/config/index.ts`.
- **Règles par partie** : nombre de cartes, cartes par tour, carte à la place du coup, délai du Présage, règles des
  50 coups et de la répétition, position de départ, équilibrage des cartes. Elles sont photographiées dans la partie
  si elles diffèrent des règles d'avant (`RULES_V1`) : au défaut, aucune règle n'est écrite, parties et sauvegardes
  sont identiques à l'octet ; les vues et `/api/me` gagnent des champs facultatifs (`DraftView.totalMs`,
  `reveal.filled`, `features`, `version`) et le serveur écrit au démarrage une ligne des règles. Variantes par
  contexte (`RULES_BY_CONTEXT`).
- **Textes dérivés des réglages** (`src/shared/text/`) : identiques au caractère près au défaut ; « une carte »,
  « cinq cartes », « deux sorts par tour »… ailleurs.
- **Mises en page de 1 à 6 cartes** sans rien changer à 3 cartes (aucun attribut, variable, classe ni nœud nouveau).
- **Interrupteurs** (`FEATURE_*`), **marque** (`BRAND`), **pages** (`ROUTES`), **boutique en données** (`SLOT_DEFS`,
  `TRESOR`, packs), **cadences** et **niveaux de l'IA** en registres.
- **Garde-fous** : `checkRules` (construction, démarrage, tests), garde des valeurs par défaut, garde de protocole,
  garde-fou des textes chiffrés, test de cohérence, témoins v1, bancs d'identité, matrice des règles, suites de bout
  en bout sur serveur jetable.
- **Documentation** (lot 9c) : `docs/REGLAGES.md` (ce qu'on change demain, table des réglages, contextes, garde-fous,
  limites), README (section « Réglages », offre, commandes), tableau des modules de `plan/CONCEPTION.md`, et
  `test/reglages-doc.test.ts`, qui compare la documentation au code (chemins, noms, valeurs par défaut et bornes des
  tables, contenus masqués, messages de `checkRules`).

### Défauts corrigés

| Défaut | Lot |
|---|---|
| File d'attente sous concurrence : double appariement, entrée perdue, joueur parti apparié (aussi pendant la lecture des sièges, après l'appariement : 9f) | 3, 9f |
| Assise d'une invitation écrasée par un second joueur | 3 |
| Pool PostgreSQL sans écouteur d'erreur ni délai de connexion (un redémarrage de la base faisait tomber le serveur) | 3 |
| Spectateurs de `/live` mal comptés | 3 |
| Fil de calcul de l'IA mort gardé dans la rotation | 3 |
| Fin de partie perdue si la base ne répond pas : nouveaux essais, classement rattrapé au démarrage (3) ; au-delà des essais, la salle terminée n'est plus évincée (relue en base, elle y était encore en cours, et le perdant pouvait réclamer la victoire) et le ménage relance l'enregistrement jusqu'au retour de la base (9f) | 3, 9f |
| Échec de création d'une partie appariée qui faisait perdre sa place à celui qui attendait | 3 |
| Fichier `.env` lu trop tard pour les interrupteurs | 3 |
| Cadence inconnue transformée en partie sans pendule ; relance sans fin de l'IA | 3 |
| Objet retiré par l'administrateur resté équipé et encore vendu | 2 |
| PGN avec une prise qui explose (Déflagration) ou avec le Sablier fou d'une partie à pendule : illisibles | 1 |
| « Partie sans cartes » affiché à tort dans l'attente et le choix des cartes, et entrevu pendant l'appariement | 5, 7 |
| Fin du choix : « tirées au hasard » alors que la sélection était complète ; carte tirée sans message | 3, 5 |
| Minuterie d'émote commune aux deux camps | 5 |
| Numérotation des coups après une Grande Marée des Noirs | 5 |
| Page blanche quand le code d'une page manque ; « Failed to fetch » en anglais | 6 |
| Rechargement de tout le site quand un module secondaire manque après une mise en ligne (effets, Lenis, survol d'un lien, y compris en pleine partie) : seuls le code d'une page (PageBoundary) et l'échiquier des lieux de l'accueil (DecorBoundary, 9f) rechargent, au plus une fois par minute | 6, 9f |
| Échec de `/api/me` pris pour une déconnexion (nouveaux essais après 1, 3, 9 s puis toutes les 10 s) ; requêtes sans délai maximal (20 s) ; Mentions légales en attente sans fin (message et « Réessayer ») ; « Défier un ami » qui ne se charge pas (message) | 6, 9a |
| Incrément suspendu par le Sablier fou jamais signalé : « +2 » barré sur les pendules | 5 |
| Relais de l'IA invisible sur la page de partie : « L’IA joue pour X. » | 5 |
| Choix des cartes : « vos cartes manquantes » quand il n'en manque qu'une (singulier au défaut à 3 cartes ; la note de révélation reste au pluriel) | 5 |
| Choix de promotion lu « q », « r », « b », « n » au lecteur d'écran (« dame », « tour »…) | 4 |
| Invitation déjà en attente ouverte par un second joueur malgré la maintenance (`FEATURE_NEW_GAMES=0`) ou les invitations coupées | 9f |
| Accueil aux Noirs : halo et curseur sur la pièce adverse ; position d'une partie précédente montrée en attendant l'adversaire ; socket ouvert avant `/api/me` | 7 |
| « 1 étapes », « 1 leçon terminées », « 1 coups » | 8 |

Mentions légales de production : non corrigé. En production, le serveur avertit au démarrage tant qu'elles sont des
modèles ; les valeurs attendent le fondateur (Q1).

### Écarts voulus au défaut

Les bancs d'identité (`npm run identite`) et de textes (`npm run textes-pages`) ne montrent que ces écarts avec la
référence d'avant la passe :

- « Partie sans cartes » retiré de l'écran d'attente et de l'écran du choix des cartes (défaut corrigé) ;
- « 1 étape » au lieu de « 1 étapes » sur la page Apprendre (de même « 1 leçon terminée » et, dans Mes parties,
  « 1 coup »).

Autres changements visibles seulement dans des cas précis : numérotation des coups après une Grande Marée des Noirs ;
PGN refusés avant, relus maintenant ; et les corrections du tableau ci-dessus (pendule sous le Sablier fou, « L’IA
joue pour X. », message du choix pour une carte, rechargements, échecs réseau, libellés de promotion).

HTML servi (lot 6, prévu au plan) : statut 404 pour un chemin inconnu (200 avant) ; titre de chaque page dès le HTML
(« Boutique · Spellmate »…, au lieu du titre de l'accueil jusqu'à l'exécution du script) ; `<link rel="canonical">` et
`og:url` ; `og:image` en adresse absolue tirée de `PUBLIC_URL` (`https://chess-powers.com/og.jpg` en production) ;
cookie d'invité `sm_guest` posé dès le HTML ; `/api/health` ne pose plus de cookie. Le fichier `dist/client/index.html`
est inchangé : ces écarts n'apparaissent qu'au service. Aucune sonde du déploiement ne lit le HTML (elles
n'interrogent que `/api/health`) ; effet sur les robots d'aperçu non vérifié.

Réponses JSON et journal : au défaut, les vues et `/api/me` gagnent des champs facultatifs (`DraftView.totalMs`,
`reveal.filled`, `features` et `version` de `/api/me`), et le serveur écrit au démarrage une ligne des règles des
nouvelles parties. Aucun effet visible (le client lit `totalMs` = 45 000, comme l'ancienne constante).

Revenu au comportement d'avant la passe (lot 9f) : la revanche d'une partie en direct de l'accueil, demandée depuis
la page de partie, est une partie amicale avec le choix des cartes, sans relais (la passe lui donnait des mains tirées
et le relais de l'IA) ; la déconnexion ne fait passer l'interface en invité qu'avec l'accord du serveur (la passe le
faisait aussi en cas d'échec, alors que le serveur voyait toujours le compte, et le menu ramenait à l'accueil :
maintenant, comme avant la passe, l'utilisateur reste connecté sur sa page, avec en plus un message d'erreur). Le
lot 9c n'a rien changé au site : le site construit est identique octet pour octet avant et après lui (empreintes de
`dist/`).

Contrôles du lot 9c après sa relecture (commit de départ 2a28d09) : `tsc` sans erreur ; 1 236 tests verts
(54 fichiers, dont les 21 de `test/reglages-doc.test.ts`) ; `npm run temoins` vert ; build réussi, `dist/` identique
(275 fichiers, mêmes empreintes SHA-256), avec et sans le commentaire ajouté à `src/shared/config/index.ts` (ce module
n'est importé que par `test/socle.test.ts`). `node scripts/verifier-lot.mjs 9c` accepte la documentation et le test,
et refuse `src/shared/config/index.ts` à cause du défaut de l'outil décrit plus bas. Aucune mesure de performance dans
ce lot.

### Mesures de performance

Mesures de l'orchestrateur, machine au repos, aucun autre agent (notes de la vague 5). Site construit en production ;
référence : le code d'avant la passe (7148547). Banc `test/perf/mesure.mjs`.

- Campagne de 3 passages, tous scénarios : au repos, tout est identique (processeur, images, peintures, animations,
  rAF). Au chargement, accueil sur ordinateur, Forêt, Jouer, partie et Apprendre : dans le bruit.
- Accueil sur mobile : 7 passages laissaient voir +40 ms de premier affichage. Une mesure de la même version contre
  elle-même donne 8 ms d'écart. Une campagne de 11 passages, référence contre version finale : premier affichage 488
  et 484 ms, script 243 et 246 ms, fil principal 845 et 840 ms, temps de blocage 181 et 182 ms. Identique.
- Poids (gzip -9, fermeture des imports statiques) : accueil 222 036 → 232 979 o (+4,9 %), paquet principal 100 989 →
  101 774 o, partie 197 449 → 206 200 o ; 3 requêtes de plus sur l'accueil. Sans effet mesurable sur la machine de
  mesure (réseau local) ; sur un réseau mobile lent, environ 14 ko de plus à télécharger.
- IA (`scripts/banc-ia.mjs`) : décisions identiques partout. Exécutions séparées trop bruitées ; en mode entrelacé
  (`--entrelacer`), position de milieu de partie −0,4 % (profondeur 3) et −0,5 % (profondeur 5), presque tout dans
  ±3 %, les rares écarts dans les deux sens. Code de la recherche identique à l'octet près, allocations identiques.
- Non mesuré : banc des effets (`compositeFailed`, images par sort) au-delà des captures identiques de
  `test/sorts.mjs` ; vrais téléphones ; production.

### Ce qui n'a pas été vérifié

- **Production** : rien n'est déployé. Aucune vérification sur chess-powers.com.
- **Vrais téléphones et vraies cartes graphiques** : les mesures et les captures tournent dans Chromium sans écran,
  avec un rendu 3D logiciel.
- **Parties réelles jouées par des humains avec les variantes** (5 ou 6 cartes, 2 cartes par tour, carte à la place
  du coup, Présage à 4) : seulement les tests, la matrice des règles, les suites de bout en bout et des captures.
- **Stripe réel** et envoi réel d'e-mails : aucun paiement réel, aucun e-mail réel ; la boutique de production est
  fermée (`PAYMENTS_MODE=off`).
- **Changement d'une valeur par défaut** : essayé sur une copie jetable (lot 9c) pour compter les tests qui échouent
  (`docs/REGLAGES.md`, section 2), pas mené jusqu'au bout (tests mis à jour, captures, mise en ligne).

Captures de revue des variantes, faites pendant la passe et gardées hors du dépôt, dans le dossier de travail de la
session (`scratchpad/poly/lots/5/captures-variantes` : 1, 5 cartes, 5 cartes et 2 par tour, carte à la place du coup,
Présage à 4 ; `scratchpad/poly/lots/9a/captures-variantes` : 1 et 5 cartes après les retouches, banc de la coque de 1
à 6 cartes). Elles se refont avec `node test/identite.mjs --seulement=bancs --n=1,2,4,5,6 --sortie=<dossier>`.

### Décisions qui restent au fondateur

| Question | Aujourd'hui |
|---|---|
| Q1. Mentions légales de production : raison sociale, adresse, SIREN, TVA, directeur, contact, médiateur | `/api/legal` sert les modèles ; avertissement au démarrage. Valeurs à mettre dans `LEGAL_*` (`/opt/spellmate/local.env` ou `deploy/production.env`) |
| Q2. Prix « compléter » du Trésor du Bazar | non fait ; prix fixe ; `TRESOR` permet déjà de figer la liste ou de promettre les prochains objets |
| Q5. Textes de marketing qui changeraient au défaut : vouvoiement de 3 messages, « 10+0 » ou « 10 + 0 », « Paiement sécurisé par Stripe » quand la vente est fermée, CGV sans rois ni collections, image de partage `og.jpg` (cartes du Duel), indication « Rois, échiquiers et sorts » du menu et exemples de cartes de la description d'`index.html` | rien n'a changé |
| Q11. Petites cartes à 5 ou 6 cartes, surtout sur mobile | à 6 cartes, noms d'environ 3 px en 360 × 640 ; la carte s'ouvre en grand au toucher. Accepter, ou masquer le nom sous un seuil |
| Formulation du Présage à délai 4 : « Annoncé : arrive au début de votre deuxième tour à venir » | inactive au défaut (délai 2) |

Décisions prises par défaut pendant la passe : Q3 (revanche aux règles du moment), Q4 (pas de contrainte du tirage au
choix des cartes), Q6 (une carte à la place du coup compte pour les 50 coups) ; Q7, Q8 et Q9 : rien ne change ; Q10 :
pas d'intégration continue.

### Points ouverts relevés par le lot 9c

Lot 9e (après ce rapport) : les quatre points ci-dessous sont traités. Les tests fixent leurs règles et leur mise en
place (`test/helpers/v1.ts`, `test/helpers/v1-serveur.ts`) ou dérivent l'attendu du réglage : les 10 essais prêts à
l'emploi de `docs/REGLAGES.md`, section 2.1 (les 7 du lot 9c, plus 1 carte, tirage partout et Faille en 6 coups), et
9 autres changements essayés une fois ne font plus échouer que les gardes voulus (0 autre échec au lieu de 6 à 95
pour les 7 du lot 9c), vérifié par le nouvel outil `npm run essai-reglage` (`--essai`, `--regle`, `--deal`, `--carte`,
`--remplacer`). Rien d'autre n'a été essayé : un autre réglage peut encore faire échouer d'autres tests. Les gardes
d'identité au défaut (aucune règle écrite, sauvegarde v1 de l'accueil, PGN, ligne de journal du serveur) suivent le
vrai chemin du défaut : une régression de `rulesFor` au défaut (Présage à 4 demi-coups hors de l'accueil, ou à
l'accueil seulement, ou équilibrage sans `clockRate`) fait échouer 7, 4 et 10 tests. `verifier-lot` calcule les gels
d'après les vagues ; le commentaire de `BOT_TIMEOUT_MS` est corrigé ; `BRAND.pgnVariant` et `BRAND.storagePrefix`
sont présentés comme des rappels (les relier changeait le site construit). Site construit identique (empreintes de
`dist/` : les 271 fichiers du client et le code du serveur ; seule la carte de source du serveur,
`dist/server/index.js.map`, non servie, suit les commentaires de `brand.ts` et `timings.ts`), 1 245 tests verts au
défaut (1 236 avant, 9 tests des outils ajoutés).

- Changer une valeur par défaut fait échouer de 9 à 101 tests sur 1 108 (essai sur une copie jetable,
  `docs/REGLAGES.md`, section 2). Ce compte comprend les deux gardes (`defauts`, `protocole`) et 1 à 4 tests de
  `test/reglages-doc.test.ts` ; les autres photographient le jeu d'aujourd'hui. Le commentaire de
  `test/garde-fous/defauts.test.ts` dit le contraire (« les autres tests […] continuent de passer quand un réglage
  change »). Piste : passer `RULES_V1` explicitement aux parties scriptées des tests du moteur, et conditionner les
  photographies du défaut à `sameRules(rulesFor(ctx), RULES_V1)`.
- `BOT_TIMEOUT_MS` (`src/shared/config/timings.ts`) n'est lu que par le serveur ; le navigateur garde sa propre copie
  (`WORKER_TIMEOUT` de `src/client/ai/index.ts`), contrairement à ce que dit le commentaire du réglage.
- `scripts/verifier-lot.mjs` compare la fin d'un gel par égalité (`lotId !== gele.jusqua`) : `src/shared/config/**` et
  `src/shared/protocol.ts`, gelés « jusqu'au lot 9b », restent refusés aux lots 9c et 9, qui viennent après 9b dans
  `vagues` (de même pour `text/regles.ts`, gelé jusqu'au lot 9a). La conception (`plan/CONCEPTION.md`, §7.1)
  renvoie pourtant au lot 9 les besoins sur ces fichiers. Correctif : comparer les rangs des lots dans `vagues`
  (refus seulement si rang(apres) < rang(lot) < rang(jusqua)). Tant qu'il n'est pas fait,
  `node scripts/verifier-lot.mjs 9c` refuse le renvoi vers `docs/REGLAGES.md` ajouté en commentaire dans
  `src/shared/config/index.ts` (fichier possédé par 9c, « commentaires seulement »).
- `BRAND.pgnVariant` et `BRAND.storagePrefix` ne sont lus nulle part : la variante PGN et le préfixe des clés sont
  écrits en dur (`src/shared/pgn.ts`, `src/client/storageKeys.ts`). Sans effet au défaut ; à relier ou à présenter
  comme de simples rappels.

### Relecture finale transversale (lot 9f)

Quatre relecteurs (déploiement, sécurité, compatibilité, identité) ont relu toute la passe ; chaque constat a été
vérifié par un sceptique. 20 constats confirmés, corrigés ou déclarés par le lot 9f (plan : `plan/lots/9f.md`).

Corrigés dans le code, chacun avec un test qui échoue sur le code d'avant :
- **Fin de partie non enregistrée** (base injoignable au-delà des essais de `persistResult`) : la salle terminée
  n'est plus évincée par le ménage tant que son résultat attend (`resultPending`) ; le ménage relance
  l'enregistrement, un seul à la fois (`persisting`), un essai par ménage, sans rien noter tant qu'il échoue (une
  ligne quand la base l'accepte). Avant, au bout de 10 minutes, la salle était relue en base
  « en cours », reprise, et le perdant d'une partie classée pouvait réclamer la victoire et les points
  (`test/server-fin-de-partie.test.ts`). Ce n'était pas une régression de la passe (un seul essai avant elle).
- **Revanche d'une partie relayée de l'accueil** : revenue au comportement d'avant la passe (choix des cartes, sans
  relais) ; pendule d'origine et règles du moment (Q3) gardées. Son refus éventuel suit la sorte de partie qu'elle
  crée (amicale), plus celle de l'accueil.
- **Configuration vérifiée avant le remplacement du site** : `node dist/server/index.js --check-config` (code 0, ou
  1 avec les messages, sans ouvrir la base), lancé par `deploy/update.sh` dans la nouvelle image entre la construction
  et `docker compose up`. Avant, une valeur refusée par la validation de la passe (par exemple `SMTP_PORT=587x` dans
  `/opt/spellmate/local.env`, que personne n'a relu) arrêtait le nouveau conteneur après l'arrêt de l'ancien.
  `test/deploiement.test.ts` passe la configuration de production du dépôt (`deploy/production.env`, secrets,
  `docker-compose.yml`, Dockerfile) à `parseEnv` : aucune erreur. `deploy/README.md` dit comment revenir en arrière
  (`deploy/VERSION` doit désigner un commit différent de celui noté comme déployé).
- **Maintenance et invitations coupées** : une invitation déjà en attente (reprise au démarrage) ne s'ouvre plus à
  un second joueur (`takeSeat` rend `'off'`, `game:join` relaie le refus). Identique au défaut.
- **File** : un joueur qui quitte la file pendant la lecture des sièges (après l'appariement) n'est plus apparié ;
  l'autre est apparié avec un joueur arrivé (ou revenu) entre-temps dans la même file, sinon il reprend sa place
  (`matchOrQueue`). Les joueurs en cours d'appariement sont suivis par leur entrée, pas par leur clé : un joueur parti
  puis apparié ailleurs par une nouvelle demande n'a plus deux parties. Identique au défaut sans départ.
- **Version du protocole** : un client qui n'annonce pas de version compte comme la version 1 (identique tant que
  `PROTOCOL_VERSION` vaut 1 ; `docs/REGLAGES.md`, section 2, dit ce qui change à la première montée). Les clients de
  test (`test/lib/client.mjs`, `test/climats-serveur.mjs`, `test/perf/mesure.mjs`) annoncent déjà la version lue dans
  `/api/me`.
- **Déconnexion** : l'interface ne passe en invité qu'avec l'accord du serveur, comme avant la passe. En cas
  d'échec : un message d'erreur (nouveau), toujours connecté, et l'erreur remonte comme avant la passe : le menu ne
  ramène pas à l'accueil (rejet non traité dans `Layout.tsx`, comme avant).
- **Rechargement quand un module manque** : l'échiquier des lieux de l'accueil recharge de nouveau le site (au plus
  une fois par minute), comme avant la passe ; commentaires de `main.tsx` et `App.tsx` exacts.
- `TRUST_PROXY` réglable dans `.env` sous Compose (`${TRUST_PROXY:-true}` : même valeur `"true"` au défaut, vérifié
  avec `docker compose config` sur la configuration de production). Une ligne `TRUST_PROXY` de
  `/opt/spellmate/local.env`, ignorée jusque-là, s'applique désormais : `deploy/README.md` demande de relire ce
  fichier avant le premier déploiement (une valeur illisible arrête le déploiement à `--check-config`).

Déclarés seulement (changements voulus, gardés) : HTML servi, incrément barré sous le Sablier fou, « L’IA joue pour
X. », message d'expiration du choix au singulier, politique de rechargement, échecs réseau, libellés de promotion,
champs JSON facultatifs et ligne de journal (tableau des défauts corrigés et « Écarts voulus au défaut » ci-dessus) ;
documentation du déploiement corrigée (des règles impossibles arrêtent la construction ; un interrupteur changé en
production passe par un déploiement, qui reconstruit l'image).

Non vérifié : `--check-config` n'a pas été lancé dans un vrai conteneur ni sur le serveur de production (seulement
`node` sur le code construit, et `docker compose config` sans démon) ; rien n'est déployé.

Contrôles du lot 9f (départ 6182cb6 : 1 245 tests verts) : `tsc` sans erreur ; 1 263 tests verts (18 de plus ; 15 tests
nouveaux ou modifiés échouent sur le code d'avant) ; `npm run temoins` vert ; build réussi ; `index.html` identique sauf l'empreinte du
paquet principal (son code change : `store.tsx`, `importFailed.ts`), CSS et polices identiques, les autres morceaux ne
changent que par les noms d'import ; poids (gzip -9, fermetures) : paquet principal 101 774 → 101 775 o, accueil
232 979 → 233 015 o, partie 206 200 → 206 224 o. `npm run identite` et `npm run textes-pages` : seuls les écarts
voulus déjà connus (« Partie sans cartes », « 1 étape »). Bout en bout au défaut sur serveur jetable :
`integration.mjs`, `ranked.mjs`, `fonctions.mjs` verts ; scénario de revanche d'une partie de l'accueil du relecteur
identique au serveur d'avant la passe (choix des cartes, mains vides, aucun relais, aucun coup joué 12 s plus tard).
`npm run essai-reglage -- --essai=tous` : aucun échec hors des gardes (après découplage du test de `--check-config`).
Aucune mesure de performance.

Relecture du lot 9f (deux relecteurs adverses, 9 constats mineurs, tous confirmés) : file d'attente (le joueur resté
après un départ pendant la lecture des sièges n'était que remis en file, à côté d'un joueur compatible arrivé ou revenu
entre-temps : il est maintenant apparié avec lui ; et un joueur parti puis apparié ailleurs par une nouvelle demande
était encore compté présent dans l'ancienne : les appariements en cours sont suivis par entrée) ; ménage (un essai
d'enregistrement par ménage, sans journal tant qu'il échoue) ; déconnexion en échec (l'erreur remonte de nouveau : le
menu ne ramène plus à l'accueil un utilisateur toujours connecté) ; `deploy/README.md` (`TRUST_PROXY` pris dans `.env`
sous Compose, `local.env` à relire) ; clients de test qui annoncent leur version (dont `test/perf/mesure.mjs`) ; tests
de l'arrêt « Règles impossibles » (`test/deploiement.test.ts`, `test/server-config.test.ts`) et du tirage
(`test/climats.test.ts`) découplés de `DEAL.handLimits`. Contrôles : `tsc` sans erreur ; 1 268 tests verts (7 tests
nouveaux ou modifiés échouent sur le code d'avant la relecture) ; `npm run temoins` vert ; build réussi, `index.html`
identique sauf l'empreinte du paquet principal ; fermetures (gzip -9) depuis 6182cb6 : paquet principal 101 774 →
101 784 o, accueil 232 979 → 233 025 o, partie 206 200 → 206 231 o ; `npm run textes-pages` : les mêmes écarts voulus
qu'au premier passage ; bout en bout au défaut sur serveur jetable : `integration.mjs`, `ranked.mjs`,
`fonctions.mjs`, `climats-serveur.mjs` verts, et la partie préparée par `test/perf/mesure.mjs` (fonction lancée seule,
sans mesure) ; `npm run essai-reglage -- --essai=tous` et l'essai `--deal=handLimits=…climat 3` (exemple de
l'outil, qui faisait échouer trois tests hors des gardes) : aucun échec hors des gardes. Aucune mesure de performance.
