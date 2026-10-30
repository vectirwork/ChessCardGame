# Progrès : page Règles et cartes (/cartes)

Libellé : cartes-regles. Fichiers à moi : src/client/pages/Rules.tsx, src/client/pages/Rules.css (nouveau),
captures dans concepts/pouvoirs-regles/.

## Fait
- Lecture du plan (dont la décision du 30 octobre, 16 h 30).

- Lecture de Rules.tsx actuel, cards.ts, SpellCard, PageScene, jetons global.css, CARTES-GLOBALES (R1 à R10).
- Rules.tsx réécrit (lieu « observatoire », sections I à IV : l'essentiel, le temps des sorts + frise de la Trêve,
  les huit pouvoirs par famille avec SpellCard size="hand", deux formules + précisions + appel à jouer).
- Rules.css créé (préfixe rg-).

- tsc : code 0, aucune erreur (lancé après chaque modification).
- Planche de contrôle : concepts/pouvoirs-regles/regles-bureau.png (1440 px, tranches assemblées : la barre
  d'en-tête fixe apparaît à chaque raccord, c'est un artefact de capture) et regles-mobile.png (390 px, pleine
  page, aucun défilement horizontal : scrollWidth = 390). Aucune erreur console.
- Corrections après la planche : en-tête de famille au-dessus des cartes (plus de colonne collante), carte en
  taille normale sur mobile (à 92 px le surtitre de la carte débordait), libellés d'arrivée raccourcis.

## Reste à faire
- Rien. Non vérifié : lecteur d'écran, autres navigateurs.

## Décisions
- Passe rapide (demande du fondateur) : une planche de contrôle, pas de série de captures.
- Lieu « observatoire » (ciel violet, astrolabe). Règles exactes lues dans cards.ts (description, durée, rareté,
  famille) : la page suit le moteur. Duel jamais cité. SpellCard size="hand", API actuelle.
- Les anciennes classes .rules-grid, .rules-list, .rules-cards, .rule-card de pages.css ne servent plus
  (fichier d'un autre flux, non modifié).

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx tsc --noEmit -p .`
- Captures : `node <scratchpad>/regles/shoot.cjs http://localhost:3000/cartes <sortie> 1440 900` (tranches,
  animations figées ; la capture pleine page de concepts/_tools/shoot.cjs expire en bureau) et
  `node concepts/_tools/shoot.cjs <scratchpad>/regles/mob.json` pour le mobile.
