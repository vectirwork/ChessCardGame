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

## Reste à faire (vagues 2 à 5)
2. Lot 3 (serveur : règles par partie, concurrence, robustesse) ∥ lot 4 (effets, échiquier, sons).
3. Lot 5 (partie et coque) ∥ lot 6 (socle client, marque, routes).
4. Lot 7 (accueil) ∥ lot 8 (pages et contenus).
5. Lot 9 (intégration, mesure de performance, documentation), seul sur la machine.

Le script de vague (réaliser, deux relectures adverses, corriger) est réutilisable : une copie de travail par lot,
hors de `.claude`, branche `polymorphie/<lot>`.
