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
  démarrage (« Règles impossibles : arrêt. »), ce qui fait échouer un déploiement fautif au contrôle de `/api/health`.
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
  de la boutique cachés quand elle est fermée. HTML construit identique au défaut.

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

## Reste à faire
1. Mesure de performance par l'orchestrateur, seul sur la machine (accueil, accueil mobile, Forêt, partie, Jouer,
   Apprendre ; banc de l'IA).
2. Lot 9c : `docs/REGLAGES.md` (« ce qu'on change demain » et table des réglages), README, rapport au fondateur.

Le script de vague (réaliser, deux relectures adverses, corriger) est réutilisable : une copie de travail par lot,
hors de `.claude`, branche `polymorphie/<lot>`.
