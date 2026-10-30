# Journal : adaptation du site au jeu final (8 pouvoirs, mains visibles)

Mission (30 octobre, après la refonte du moteur 4116dee) : leçons, problèmes, accueil, fonctions classiques,
DemoBoard, recherche des cartes retirées dans src/client. Captures : concepts/site-adaptation/.
Fichiers à moi : src/client/odyssee/*, src/client/pages/Home.tsx, src/client/ai/*, src/client/features/*,
src/client/pages/{Learn,Puzzles,Analysis,MyGames,Live}.tsx, src/shared/{lessons,puzzles,pgn}.ts,
test/{lessons,puzzles,pgn}.test.ts, src/client/components/DemoBoard.tsx, concepts/galerie/data.ts (typage seul).

## Fait
- Lecture du plan, du compte rendu de la refonte, des journaux accueil et fonctions classiques.
- Problèmes (src/shared/puzzles.ts) : les 5 problèmes Duel remplacés par 8 problèmes sur les pouvoirs :
  carte-mur-sauve, carte-mur-enferme, carte-faille, carte-ere-glaciaire, carte-maree, carte-lune (Lune noire
  déjà en jeu), carte-deflagration (Déflagration déjà en jeu, gain de matériel), carte-main-visible (Mur noir en main).
  Nouveautés : `effects` (pouvoir déjà en jeu, EffectSpec + withEffects), catalogue 'climats' pour les problèmes
  à cartes, Faille acceptée sur n'importe quelle case de la rangée (sameAction). test/puzzles.test.ts : 14 verts
  (unicité de la carte par énumération de toutes les cartes et cibles, mat confirmé par analyse()).
  Positions trouvées avec les scripts du scratchpad site/ (lab.ts, gen*.ts, show*.ts).

- Leçons (src/shared/lessons.ts) : groupe « Les cartes » refait : cartes (mains visibles, Mur en e5 permanent, Mur
  qui sauve sur la colonne h), catalogues (Pouvoirs / Sans cartes, familles), deux-camps (Mur noir qui bloque la
  tour blanche, Ère glaciaire noire), presage-rituel (textes corrigés), mur-magie (la magie cède, le Mur fond),
  mains-visibles (Faille noire en main). LessonStep.effects (même EffectSpec que les problèmes).
  test/lessons.test.ts : 9 verts.

- Client des fonctions classiques (commit d55777c) : CardHand (HandView : main adverse visible, cartes jouées grisées,
  carte retirée tolérée), EffectsLine (Mur « jusqu'à la fin de la partie », case), MoveTree, format.catalogLabel
  (« Pouvoirs » / « Sans cartes » / « Duel (ancienne formule) »), Analysis (deux mains, cartes retirées écartées),
  Learn et Puzzles (main adverse visible), MyGames (libellé).
- Reprise (2e agent, 30 oct. soir) : accueil.
  - shell/GameShell.tsx + shell.css : main adverse face visible (emblème + nom, jouées grisées et barrées), mobile en
    pastilles.
  - data.ts : liveCatalog() = 'climats' ; LAYOUT des 8 pouvoirs (forêt : Ère glaciaire, Mur, Faille ; pics :
    Déflagration, Lune, Trêve ; sablier : Sablier fou, Grande Marée) ; textes des lieux, interlude, principe 02
    (« Trois cartes, visibles »).
  - StageBoard.tsx : démo aux Pouvoirs (cardsOf), plus de branche 'revive'.
  - OdysseeHome.tsx : ligne « L'Oracle tient … » (main IA visible) sous la main du joueur ; FriendSheet : choix
    « Pouvoirs » / « Sans cartes ».
  - useLiveGame.ts : rememberLocalGame à la fin de partie ; sauvegarde non 'climats' rejetée.
  - DemoBoard : seulement monté par SkinPreview (Home.tsx), importé nulle part ; passé aux 8 pouvoirs quand même.

- pgn.ts : commentaires (Duel, cartes retirées) ; le repli `h.card === null` reste pour les anciennes parties Duel.
- Captures concepts/site-adaptation/ : 01 accueil bureau, 02 partie bureau (main de l'Oracle visible en haut à droite),
  10/12/13 accueil mobile 390x844, 11 partie mobile (main de l'Oracle en pastilles).
- Mobile : premier écran correct (titre sous l'échiquier, rien ne le recouvre). La capture blanche
  concepts/site-accueil/30-mobile-accueil.png (s9-mobile-accueil.json) n'est pas reproduite avec le même scénario
  (12-mobile-accueil-apres-rechargement.png est normale) : artefact de capture (prise pendant le rechargement /
  une reconstruction du serveur de dev), pas un défaut du site.

## Terminé (30 oct., 19 h 58)
- tsc vert ; vitest lessons+puzzles+pgn : 35/35 ; npm test complet : 206/209, les 3 échecs sont dans
  test/pouvoirs-adverse.test.ts (tests « ÉCART » de la contre-vérification, hors de mes fichiers ; matériel
  insuffisant avec Murs et Faille).

## Décisions
- Accueil : une ancienne sauvegarde locale (catalogue autre que 'climats') repart sur une partie neuve.
- DemoBoard gardé (SkinPreview l'utilise, mais rien n'importe SkinPreview) et passé aux 8 pouvoirs.

## Commandes de vérification
- npx tsc --noEmit -p .
- npx vitest run test/lessons.test.ts test/puzzles.test.ts test/pgn.test.ts
- npm test
- node concepts/_tools/shoot.cjs <scénario> (scénarios et play.cjs dans le scratchpad shots/)
