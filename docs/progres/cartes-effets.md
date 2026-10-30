# Progrès : flux C, effets visuels des 8 pouvoirs (cartes-effets)

Fichiers : src/client/vfx/*, src/client/components/{CardArt,SpellCard,Board}.tsx, src/client/styles/{cards,board}.css,
test/vfx.html, test/vfx-harness.tsx. Consigne du fondateur : une seule passe soignée, sans vérification exhaustive.

## Fait
- (19 h 40) Lecture du plan, de effects.ts, stage.ts, Board.tsx, SpellCard/CardArt, castSafely (accueil).
  Constat : playCast n'a aucun cas pour les 8 pouvoirs (promesse jamais résolue) ; CardArt sans emblème pour eux ;
  syncMarkers ignore la Faille (squares) et les Climats ; Board n'affiche pas la Faille.

- (20 h 05) 1. stage.ts : boucle protégée (try/catch par effet, remise à plat si erreur), `cinematic()` renvoie
  un identifiant, `release()` remet à plat même boucle arrêtée, `guard` (garde-fous temps réel, coupés au banc),
  rendu des objets immobiles seulement si le plateau bouge, syncMarkers : Faille (`squares`, reconstruite si
  elle rétrécit), arrivée d'un Présage (`arrivalFactory`), setOrientation reconstruit la Faille.
  effects.ts : playCast avec table SCENES + `genericScene` par défaut ; impact garanti (≤ impact + 1,2 s),
  fin garantie (≤ impact + 2,5 s), pièces masquées réaffichées, inclinaison retirée (garde à 2,6 s).
- 3. Scènes des 8 pouvoirs (hourglass, truce, blood_moon, ice_age, blast, ice_wall, rift, tide) + `playArrival`.
- 4. Board.tsx : `.sq.rift`, `.sq.iced` refait, `clim clim-<carte>` sur le plateau, pions `pawn`/`chilled`,
  attribut `data-at` sur les pièces. board.css : styles + ambiances `vfx-blood|frost|calm|blast|tide`.
  tsc vert.

- (20 h 40) 2. CardArt : 8 emblèmes SVG (+ cas par défaut). SpellCard : ligne « Climat · Présage » /
  « Terrain · Permanent » / « Événement · Rituel » (`cardKicker`), durée courte (`shortDuration`), taille
  `compact` (bandeau emblème + nom + famille, lisible sur mobile), état « Jouée » (grisé, bandeau). cards.css.
- Banc : test/vfx.html (?cards = galerie, ?live = temps réel, ?catalog=duel), `window.cast`, `window.moves(n)`,
  `window.rawCast` (carte inconnue). Script de captures : scratchpad/effets/shots.cjs.
- Corrections après captures : éclipse de la Lune (l'ombre s'efface), Grande Marée plus visible (nappe d'eau),
  Mur posé en massif compact et droit, teinte de la Lune adoucie, règles longues qui tiennent sur la carte.

- (21 h 05) 5. Planche : concepts/pouvoirs-vfx/planche.png (8 pouvoirs : lancement, impact, arrivée du Présage
  ou objet posé, Climat actif ; Foudre du Duel en contrôle), captures dans shots/, galerie des cartes
  shots/00-cartes.png et shots/00-cartes-mobile.png. Scripts : shots.cjs et planche.py (copiés dans le dossier).
  Banc : 9 sorts + carte inconnue terminés (impact appelé, promesse résolue, --tilt revenu à 0deg), aucune
  erreur console. tsc vert. Navigateurs fermés, aucun serveur lancé.

## Terminé. À intégrer par d'autres
- src/client/game/parts.tsx (HandRow) : `<SpellCard id={h.card} size="compact" used={h.used} />` pour la main
  adverse (nom lisible, aussi sur mobile) ; la branche CardBack n'est plus utile (mains visibles).
- src/client/odyssee/castSafely.ts peut rester (double sécurité), playCast tient seul ses garanties.

## Décisions
- Présage : l'animation de lancement annonce (sceau, horloge, lune, neige…) ; l'arrivée (pending → actif) joue
  une onde depuis le camp du lanceur (`playArrival`), sans inclinaison ni attente.
- Climat actif : teinte discrète des cases seulement (classe `clim-<carte>` sur .board-wrap) ; Ère glaciaire :
  pions givrés (`chilled`). Pas d'objet 3D permanent pour un Climat.
- Objets persistants immobiles : la scène ne redessine que si le plateau bouge (Mur permanent = pas de rendu
  continu pendant toute la partie).
- Pièces : attribut `data-at` (et non `data-sq`, réservé aux cases et utilisé par shoot.cjs).

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx tsc --noEmit -p .`
- Banc : http://localhost:3000/test/vfx.html?card=rift&targets=e4 (serveur de l'orchestrateur, rechargement à chaud)
