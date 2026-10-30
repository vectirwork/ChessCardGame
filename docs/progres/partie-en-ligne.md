# Progression : Partie en ligne (flux B)

Mission : refaire /partie/:id (src/client/game/*) et /jouer (src/client/pages/Play.tsx) au style Odyssée, en
réutilisant la coque immersive de l'accueil (src/client/odyssee/shell). Fichiers : src/client/game/*,
src/client/pages/Play.tsx, src/client/styles/game.css. Captures : concepts/site-partie/.

## Fait
- Lecture du plan, de GamePage/parts/Play, de la coque (GameShell, EffectChips, layout, castSafely). tsc de départ :
  seule erreur concepts/galerie/data.ts (pas à nous).
- Écrits (tsc OK) : game/parts.tsx (pendules, pièces prises, coups, EffectsPanel avec Présages, libellés mode /
  catalogue / cadence), game/overlays.tsx (CastBanner, WaitingCard, JoinSheet, DrawOffer, AwayNotice,
  FirstMoveCountdown, EndCard), game/GamePage.tsx (GameShell + backdrop, html.is-immersive + gp-on, --gp-side,
  rail des coups, bloc « vous », castSafely, scène 3D différée), styles/game.css (réécrit : gp-*, pl-*),
  pages/Play.tsx (4 portes : IA, ami, amicale, classée ; catalogue ; parties en cours ; préchargement de GamePage).
- 1re passe de captures (duel.cjs) : tout le parcours fonctionne, aucune erreur console. Corrigé ensuite :
  avatar écrasé par les règles `.gs-opp-id span` de la coque (spécificité), bloc « vous » qui débordait à droite,
  fin de partie mobile sous le HUD (le .gs-stage fixe crée un contexte d'empilement → EndCard plein écran rendue
  hors de la coque sur mobile), statut trop long à 720 px (ligne catalogue retirée → kicker avec infobulle ;
  retourner/son en icônes dans le bloc « vous » sur ordinateur ; barre de défilement fine), liste des coups
  (un sort sur sa propre ligne), pastilles d'effets (point plein / pointillé pour un Présage), effets masqués en
  fin de partie, consigne masquée sur mobile au tour adverse.
- Pendant ma session, le flux A/C modifie les cartes (src/shared, tests) : erreurs tsc chez eux, aucune dans mes
  fichiers.
- Refonte des cartes du flux A en cours (16 h 30, docs/progres/cartes-refonte.md) : CATALOGS = Pouvoirs + Sans
  cartes (Duel retiré, la page Jouer lit CATALOGS), HandCard.card non nul (mains visibles), Effect.permanent (Mur).
  Adapté : catalogTag (« Pouvoirs », « sans cartes »), effet permanent, mains dessinées par la page (HandRow : faces
  quand le serveur les envoie, dos sinon ; la coque ne montre que des dos), carte inconnue du client neutralisée
  (known()) au lieu de faire tomber la page (SpellCard plantait sur « rarity » pendant la transition).
- Outils (retourner, son, message) sur leur propre ligne dans le bloc « vous » (le nom disparaissait faute de place).
- Partie annulée : texte « ne compte ni au classement ni dans l'historique » (le titre disait déjà « annulée »).
- Scène 3D différée à 1,6 s + repos (elle figeait l'animation d'arrivée dans le bac à sable).
- jouer.cjs : file amicale OK (deux invités → même /partie/:id, badge « Partie amicale · 10 + 0 »).
## En cours
- Passe finale de captures (duel.cjs, jouer.cjs), puis node test/integration.mjs, npm test, tsc.
## Reste à faire
- Refonte GamePage avec GameShell ; Présages + catalogue ; Play.tsx ; captures ; integration.mjs ; tsc ; npm test.
## Décisions
- Desktop : adversaire en haut à droite (coque, pendule dans `extra`), moi en bas à droite (bloc gp-self aligné sur
  le bas de l'échiquier), liste des coups dans une colonne droite si la place le permet (sinon action « Coups joués »).
- Mobile : pendule adverse en ligne à côté du nom (en haut), bandeau « moi + pendule » juste sous l'échiquier, statut
  décalé dessous, éventail centré en bas.
- Vouvoiement (comme l'accueil). Scène 3D différée (repos ~1 s après la vue, ou première carte choisie).
- Classes propres : gp-* (partie), pl-* (page Jouer) ; surcharges de la coque seulement sous `.gs.gp`.
## Commandes de vérification
- npx tsc --noEmit -p .
- npm test
- node test/integration.mjs (contre http://localhost:3000)
- node concepts/_tools/shoot.cjs concepts/site-partie/scenarios/<s>.json
