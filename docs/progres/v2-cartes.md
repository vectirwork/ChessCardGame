# V2 cartes et échiquier (D1 à D4) : journal

Agent « Cartes et échiquier ». Fichiers : SpellCard, CardArt, Board, cards.css, board.css, odyssee/shell/*,
main et main adverse dans game/{GamePage,parts}.tsx et game.css, features/CardHand.tsx.

## Étapes
- [x] 1. Lecture du plan, exploration du code
- [x] 2. Parcours actuel rejoué (accueil + en ligne), notes sur ce qui déroute
- [x] 3. D1 face épurée + pastille de tour (SpellCard, cards.css, CardHand)
- [x] 4. D2 bulle + bouton « Lancer ce sort » + invite + message Présage (SpellCard.CardBubble, GameShell, shell/cards.ts, CardHand)
- [x] 5. D3 main adverse en éventail retourné (GameShell ; mobile : bande au-dessus de l'échiquier, MOBILE_BOARD_TOP = 112)
- [x] 6. D4 capture au glisser (Board : case et pièce visées signalées pendant le glisser ; lâcher refusé expliqué : Trêve, Lune de sang, Ère glaciaire, pièce gelée/protégée)
- [x] 7. Captures bureau/mobile (concepts/v2/cartes, 37 images), tsc OK, npm test OK (12 fichiers, 227 tests)

## Notes
### Parcours actuel rejoué (avant modification)
- Accueil 1280 × 720, carte Climat (Déflagration) touchée : la règle s'affiche dans le panneau de statut, en haut à
  gauche, loin de la main ; le bouton « Lancer le sort » est **sous le pli du panneau** (panneau à hauteur limitée,
  barre de défilement masquée : bouton à y = 466, panneau coupé à y = 390). C'est la cause directe du « je n'ai pas
  compris comment actionner les autres cartes » : le bouton est invisible. Le Mur de glace marche parce que les
  cases brillent et qu'un clic sur une case lance la carte.
- Face des cartes : rareté, nom tronqué (« MUR DE GLAC »), famille et mot-clé tronqués (« TERRAIN · PERMANEN »).
- Main adverse : trois bandeaux à droite ; la carte jouée affiche « JOUÉE » rogné, peu lisible.
- Partie en ligne (invitation sans compte, Alice 1280 × 720 contre Bruno 390 × 844) : même panneau de statut ; sur
  mobile la main adverse est une ligne de bandeaux dans le statut, la main du joueur chevauche « Options de la partie ».
- Capture au glisser : **fonctionne déjà** dans les cas testés (souris et doigt, accueil en mode jeu et en mode page,
  partie en ligne : exd5 joué en glissant). Hypothèse la plus probable pour le retour du fondateur : un lâcher refusé
  en silence (Trêve active, pièce clouée, Lune de sang qui oblige une autre prise) : la pièce revient sans
  explication, et rien ne signale pendant le glisser que la pièce survolée sera prise. À faire : retour visuel net
  sur la cible prenable pendant le glisser, et une explication courte quand le lâcher est refusé.

### Conception retenue
- Un seul geste pour toutes les cartes : toucher la carte ouvre la bulle (règle, famille, durée, moment d'action) avec
  « Lancer ce sort » et « Annuler ». Sans cible : le bouton lance. Avec cible : la bulle se réduit à la consigne et
  les cases brillent. La bulle est à côté de la carte (au-dessus de l'éventail), plus dans le panneau de statut.
- Survol et focus : la même bulle en lecture seule. Carte non jouable : la bulle dit pourquoi (déjà jouée, à votre
  tour, un sort par tour, refus du moteur via `cardRefusal`).
- Message après un Présage au-dessus de la main ; invite « Touchez une carte… » mémorisée (localStorage).
- Main adverse : éventail retourné de 180° dans la coque (en haut à droite ; mobile : bande au-dessus de
  l'échiquier, l'échiquier descend un peu), bulle à l'endroit.

### Fichiers touchés (état)
- SpellCard.tsx : face épurée, TurnPill, turnEffect, cardTiming, CardBubble (exportés). Taille 'full' gardée
  comme grande carte descriptive (annonce d'un sort, chapitres de l'accueil).
- cards.css : pastille, tailles, bulle (.card-bubble, .cbub-*), styles des mains de leçons (.ft-turn…).
- shell/GameShell.tsx, shell.css, shell/cards.ts (handNotes, castThisTurn, castMessage), shell/layout.ts.
- GamePage.tsx : main adverse et main du spectateur passées à la coque, notes, cast ; HandRow retiré.
- parts.tsx : HandRow supprimé. game.css : anciens bandeaux supprimés.
- OdysseeHome.tsx (hors liste, quelques lignes) : handLabel « Cartes de l'Oracle », notes, cast, message.
- CardHand.tsx : face + bulle + invite.

### Vérifications faites (captures de travail dans le scratchpad, copies finales dans concepts/v2/cartes)
- Accueil 1280 × 720 et 390 × 844 : invite, bulle au survol, bulle ouverte (bouton visible), Présage annoncé,
  main adverse retournée, bulle adverse. Bouton « Lancer ce sort » toujours visible (actions hors de la zone qui
  défile).
- Partie en ligne Alice 1280 × 720 / Bruno 390 × 844 : capture au glisser à la souris (exd5) et au doigt (Dxd5),
  Présage lancé au doigt, main adverse grisée après usage. Main adverse : x 1072 à 1246, bas 284 ; liste des coups
  à 300 ; pendule 81 à 127 ; échiquier jusqu'à 1050 : aucun chevauchement. Mobile : bande 52 à 101, échiquier à 108.
- Accueil : glisser e4 sur d5 (souris et doigt), clic-clic, et refus pendant la Trêve (« Trêve : aucune capture
  pendant ce Climat. ») : OK.
- Le serveur du port 3000 ne présentait pas encore l'écran de choix des cartes pendant mes essais (mains tirées).

### Fin de passe
- Taille 'full' de SpellCard : même face en grand (emblème, nom, pastille), sans accroche ni règle (chapitres de
  l'accueil et annonce d'un sort ont la règle écrite à côté).
- Clavier : Tab jusqu'à la carte (bulle en lecture, aria-describedby), Entrée ouvre (focus sur « Lancer ce sort »),
  Échap ferme et rend le focus à la carte ; mêmes règles dans les leçons. prefers-reduced-motion : bulle, invite,
  message et note de l'échiquier sans animation.
- Remarques pour les autres : sur l'accueil, le contenu de la page reste dans l'ordre de tabulation derrière la
  partie (il faudrait `inert` sur la page en mode jeu, OdysseeHome) ; textes de la leçon « Jouer une carte »
  (« choisissez la carte, puis la case ») à ajuster : « touchez la carte, Lancer ce sort, puis la case ».
