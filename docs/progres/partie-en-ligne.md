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
## Reprise (2e agent, 18 h 30, après une coupure par limite d'utilisation)
- état vérifié : tout est commité (4116dee) ; tsc : seule erreur concepts/galerie/data.ts (pas à nous) ; captures
  01-05 refaites à 17 h 06, 06-19 datent d'avant les dernières retouches de parts.tsx et game.css (17 h 04).
- vu sur 04-mobile : « Main de … » en double (la règle `.gs.gp .gs-opp-hand-m` perd contre `.gs.is-mobile
  .gs-opp-hand-m` de shell.css, chargé après game.css) → à corriger ; rememberView(view) absent → à ajouter.
- corrigé (18 h 35) : double « Main de … » sur mobile (sélecteurs .gs.gp .gs-status > .gs-opp-hand-m et
  .gs.gp .gs-hud .gs-opponent > .gs-backs) ; rememberView(view) à la fin d'une partie pour les invités (useEffect sur
  l'id de la partie terminée, `me` absent) ; consignes « mains cachées » remplacées (mains visibles).
- duel.cjs : 1re relance annulée par le serveur (premier coup > 45 s : machine chargée, captures lentes) → les deux
  premiers coups sont joués entre les captures 05 et 04. Nouveau scénario fin.cjs (mat du berger inversé entre deux
  invités, Présage annoncé, bilan, « Mes parties » de l'invité).
- duel.cjs relancé (18 h 38-18 h 44) : parcours complet, aucune erreur console (Trêve lancée par A, Présage
  affiché, émote, nulle refusée, spectateur, abandon, revanche → même nouvelle partie pour A, B et C).
- retouches (18 h 45) : libellé des Présages selon qui regarde (« Votre Présage · arrive à votre prochain tour »,
  « Présage adverse · arrive après votre coup », « Présage des Blancs · arrive à leur prochain tour ») ; consigne
  pendant l'animation d'un sort (« Vous lancez Trêve. » + accroche de la carte) ; revanche : setWarm(false) au
  changement d'id (19-revanche montrait la coque figée en pleine arrivée : scène 3D créée tout de suite).
- fin.cjs OK (18 h 49) : Lune de sang annoncée (40, 41), mat 2… Dh4# (42, 43), « Mes parties » de l'invité
  rempli des deux côtés (sm:parties : vainqueur b, checkmate, 4 demi-coups, climats), page /parties (45).
  Il faut attendre la scène 3D des deux pages avant le premier coup (24 s ici) : sinon délai de 45 s dépassé.
- 18 h 52 : node test/integration.mjs (port 3000) : 11/11 étapes vertes. npm test : 159/160, seul échec
  test/lessons.test.ts (src/shared/lessons.ts:438, Mur hors des rangées 3 à 6 ; agent Fonctions classiques).
- jouer.cjs étendu : 1. e4 contre l'IA puis /jouer → « Vos parties en cours » (39) ; compte créé pour l'occasion →
  partie classée (39b) et file classée (39c), compte supprimé à la fin. Un échec passager (champ pseudo absent 30 s
  sur mobile, machine chargée) : diagnostic ajouté, OK à la relance.
- corrigé (19 h 10) : `.pl { padding: … 0 … }` écrasait la gouttière de .container (page Jouer collée au bord sur
  mobile, 20 px à 1280) → padding-top / padding-bottom seulement.
- 19 h 15-19 h 30 : relance finale duel.cjs (OK, aucune erreur console ; Grande Marée lancée par A, consigne
  « Vous lancez Grande Marée. », 19-revanche enfin complète, couleurs inversées) puis jouer.cjs (OK, gouttière
  corrigée sur 33 ; parties en cours ; classée avec compte). Cartes « Vos parties en cours » élargies
  (minmax(min(300px, 100%), 1fr)) : 39 recapturée seule (scratchpad dbg/mine.cjs).
- tsc final : seule erreur concepts/galerie/data.ts (hors flux).
## En cours
- rien : mission terminée, compte rendu rendu.
## Reste à faire
- (orchestrateur) voir les limites du compte rendu : lessons.ts, invites « Choisis » des cartes, /api/games/mine
  sans `rated` ni `catalog`, castSafely tant que playCast n'a pas de `default`.
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
- node concepts/site-partie/scenarios/{duel,fin,jouer}.cjs http://localhost:3000 (Playwright de /opt/node-tools)
