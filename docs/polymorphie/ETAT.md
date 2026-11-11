# Passe « polymorphe » : état d'avancement (11 novembre)

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

## Reste à faire (vagues 1 à 5)
1. Lot 1 (moteur, cartes, IA) ∥ lot 2 (boutique).
2. Lot 3 (serveur : règles par partie, concurrence, robustesse) ∥ lot 4 (effets, échiquier, sons).
3. Lot 5 (partie et coque) ∥ lot 6 (socle client, marque, routes).
4. Lot 7 (accueil) ∥ lot 8 (pages et contenus).
5. Lot 9 (intégration, mesure de performance, documentation), seul sur la machine.

Le script de vague (réaliser, deux relectures adverses, corriger) est réutilisable : une copie de travail par lot,
hors de `.claude`, branche `polymorphie/<lot>`.
