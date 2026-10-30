# Progression : Partie en ligne (flux B)

Mission : refaire /partie/:id (src/client/game/*) et /jouer (src/client/pages/Play.tsx) au style Odyssée, en
réutilisant la coque immersive de l'accueil (src/client/odyssee/shell). Fichiers : src/client/game/*,
src/client/pages/Play.tsx, src/client/styles/game.css. Captures : concepts/site-partie/.

## Fait
- Lecture du plan, de GamePage/parts/Play, de la coque (GameShell, EffectChips, layout, castSafely). tsc de départ :
  seule erreur concepts/galerie/data.ts (pas à nous).
## En cours
- Écriture : game/parts.tsx (pendules, coups, effets/Présages, blocs joueurs), game/overlays.tsx (attente,
  invitation, fin, sort), game/GamePage.tsx (GameShell + backdrop, html.is-immersive), game.css (classes gp-*, pl-*).
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
