# Retours du fondateur à traiter

## 31 octobre : après la première prise en main du site

> « c'est pas mal mais le site est très gourmand, trouve des moyens d'optimisation de performance. Je n'ai pas réussi
> à utiliser certaines cartes : autant le Mur de glace ça va, mais les autres j'ai pas compris comment les actionner.
> On ne comprend pas qu'il faut cliquer sur une carte pour afficher sa description. Sur une carte, trop d'infos
> écrites : juste « Mur de glace », pas tout le tralala qui va avec. Sur les cartes justement, tu devrais écrire si
> cette carte passe notre tour ou si elle nous permet quand même de jouer ce tour ! Sinon c'est vraiment pas mal ! Je
> voudrais pouvoir capturer en glissant la pièce sur une pièce à capturer aussi. Mais surtout ce qui est gênant, c'est
> l'optimisation des performances au chargement de la page surtout. Pour l'instant ne fais rien, garde tout ça en
> mémoire. »

À faire, par ordre d'importance :

1. **Performance, surtout au chargement de la page** : le site est jugé très gourmand.
2. **Lancer une carte** : seul le Mur de glace a été compris. Il faut rendre évident comment actionner les autres
   cartes, en particulier les Climats sans cible.
3. **Description d'une carte** : on ne comprend pas qu'il faut cliquer sur une carte pour la voir. La rendre
   découvrable.
4. **Face de la carte épurée** : seulement le nom (par exemple « Mur de glace »), sans le reste du texte.
5. **Effet sur le tour, écrit sur la carte** : indiquer si la carte remplace votre coup (Grande Marée, Rituel) ou si
   vous jouez encore votre coup ensuite (toutes les autres).
6. **Capturer en glissant** une pièce sur la pièce adverse.

## 31 octobre, suite

> « aussi on ne comprend pas très bien où sont les cartes de mon adversaire : je devrais pouvoir voir les cartes de
> mon adversaire un peu comme les miennes, donc en haut à droite, à l'envers, avec écrit "cartes de mon adversaire".
> Au début d'une vraie partie (pas celle directe de l'accueil), je dois pouvoir choisir mes 3 cartes moi-même.
> Encore une fois, juste note. »

7. **Main adverse comme la mienne** : en haut à droite, les cartes en éventail comme les vôtres mais retournées
   (tête en bas, face à l'adversaire), avec l'intitulé « Cartes de votre adversaire ». Elles remplacent les petits
   bandeaux actuels, qu'on ne remarque pas.
8. **Choisir ses 3 cartes** au début d'une vraie partie (invitation, partie amicale, partie classée, IA depuis la
   page Jouer), à la place du tirage au hasard. La partie zéro clic de l'accueil garde le tirage.

## Traité (V2, 7 novembre)

Les points 1 à 8 sont traités : voir `docs/PLAN-V2.md` (décisions D1 à D6) et les journaux `docs/progres/v2-*.md`.
Vérifié en navigateur sans écran (Chromium, rendu logiciel), pas encore sur un vrai téléphone ni une vraie carte
graphique. La capture au glisser échouait à la souris dès le troisième glisser de suite (texte de la page
sélectionné) : corrigé, avec un test (`test/glisser.mjs`).

## 7 novembre : premiers essais sur téléphone (site en ligne)

> « il y a du flickering : quand j'appuie sur l'échiquier par exemple il devient bleu […] c'est l'indicateur de
> sélection de base, il faudrait enlever ça ; aussi les pièces se déplacent en instantané, il faudrait une animation
> smooth lors du déplacement (quasi invisible mais là !), même temps de déplacement si la pièce est loin ; même au
> repos il y a un peu de flickering, et surtout en scrollant vers le bas il y a pas mal de défauts. »

- [x] Surbrillance bleue au toucher retirée (Android : `-webkit-tap-highlight-color`), pas de sélection au toucher.
- [x] Pièces : glissement de 0,18 s, même durée quelle que soit la distance (la transition existait mais était
  annulée par un réordonnancement du DOM à chaque coup).
- [x] Scintillement au repos et défauts au défilement (vidéo du fondateur, Android + Chrome) : échiquier plat au
  repos (3D seulement pendant un sort), moins de calques GPU, bancs de nuées retirés sur téléphone, monde fixe à la
  hauteur de la grande fenêtre, flous d'arrière-plan remplacés. À confirmer sur le téléphone du fondateur.

## 7 novembre, suite : pendant la partie

> « afficher de manière claire quels sont les pouvoirs en cours […] nombre de coups restants, un petit dessin qui
> montre l'effet […] pas d'animation sur les pouvoirs en cours […] quand on passe la souris dessus là ça s'anime ;
> la Déflagration est trop forte ; sur mobile la section pour abandonner est difficilement accessible ; sur PC quand
> quelqu'un propose la nulle on ne le voit pas ; pré-coups sans limite, nombres écrits en petit ; pas de vidéos. »

Étape 1 (traitée) :

- [x] **Pouvoirs en cours** : sur ordinateur, une ligne par pouvoir dans la colonne de gauche (scène explicative en
  image fixe, nom, temps restant en points, qui l'a lancé, règle en une phrase) ; la scène s'anime seulement quand
  la souris passe sur la ligne. Sur téléphone, des pastilles ; toucher une pastille ouvre une fiche où la scène se
  joue. Écrans d'ordinateur bas (1280 × 720) : lignes resserrées.
- [x] **Actions de la partie** : sur ordinateur, barre toujours visible sous « Retour » (nulle, abandon, nouvelle
  partie) ; sur téléphone, bouton « ⋯ » en bas à droite, à portée de pouce, qui ouvre une fiche.
- [x] **Proposition de nulle, revanche, adversaire parti** : bandeau en haut de l'échiquier, des deux côtés.
- [x] **Déflagration revue** : chaque prise est un sacrifice (la pièce qui prend explose avec sa victime), les
  voisines sont épargnées, un roi prend normalement ; rareté épique. À l'écran, la pièce glisse jusqu'à sa victime
  et les deux éclatent.
- [x] Défaut trouvé en passant : sur un écran de 412 px (Pixel 7), l'échiquier de l'accueil pouvait sortir de
  l'écran (la page s'élargissait, le navigateur la dézoomait). Débordement horizontal coupé à la racine.

Étape 2 (traitée) :

- [x] **Pré-coups sans limite** : pendant le tour adverse (contre l'Oracle comme entre amis), on joue ses coups
  suivants au clic ou au glisser. Chacun apparaît en pièce fantôme avec un petit numéro (1, 2, 3…), cases teintées
  de bleu et flèche en pointillés ; ils s'enchaînent sur la position prévue (roque compris). À son tour, le premier
  se joue de lui-même s'il est légal, sinon tous s'annulent. Annuler : clic droit, toucher une case vide, ou
  « Annuler » dans le statut. Les cartes ne se préparent pas. Mention ajoutée dans les règles.

Étape 3 (traitée) :

- [x] **Mini-animations des cartes** (scènes dessinées, pas de vidéo) : dans la bulle d'une carte avant de la
  lancer (survol sur ordinateur, toucher sur mobile ; pas pendant le choix d'une case), dans le choix des 3 cartes
  (image fixe dans chaque tuile, animée au survol ou au dernier toucher) et dans la page des règles (animée au
  survol de la fiche ou au toucher de l'image).

Étape 4 (traitée) : accueil, mêmes concepts, en plus léger.

- [x] **Bancs de nuées rétablis sur téléphone** (retirés lors du premier correctif mobile). Les « blocs flous coupés
  net » de la vidéo venaient de l'image (1600 × 560) écrasée dans une boîte presque carrée : sur téléphone, le banc
  garde maintenant ses proportions (plus large que l'écran, calque coupé à la largeur de l'écran), un devant et un
  derrière par passage. Partout, chaque banc a un calque à sa taille, au lieu d'un calque plein écran prolongé ;
  idem pour les nuées sous l'Observatoire. Mesure (412 × 915, densité 2,6) : 2 à 3 Mpx de plus qu'avant, dans le
  budget de 25 à 35 Mpx du correctif mobile.
- [x] Premier écran mobile : la légende de l'échiquier ne touche plus son cadre ni le titre ; les noms des cartes ne
  se coupent plus (« Grande Marée »).

À confirmer sur le Pixel 7 du fondateur : défilement de l'accueil (nuées) sans scintillement.

## 7 novembre, soir : retours sur les étapes 1 à 4

> « j'aime pas les petites images en image fixe on ne comprend pas […] pas obligé de mettre des flèches jaunes
> partout […] deux images genre dame qui prend cavalier puis image 2 les deux ont disparu ; recommencer la partie sur
> l'accueil / trouver un nouvel adversaire ; deux personnes qui viennent d'arriver sur l'accueil jouent l'une contre
> l'autre […] connecté depuis le PAYS ; « en plus de votre coup » / remplacer ; actif direct ou annoncé ; animations
> jouées deux fois ; déployer seulement à la fin ; pré-coups sans flèches, plus transparents, numéros épurés ; idées
> de carte sacrifice ; le site peut m'oublier quand je recharge la page. »

- [x] **Scènes en deux images** (avant → après) : Déflagration (la dame prend le cavalier → les deux disparaissent,
  case roussie), Mur de glace, Ère glaciaire, Faille (points de coups possibles avant / après), Grande Marée, Sablier
  fou (pendule normale → ×2, +0 s). Trêve et Lune de sang inchangées. Une seule flèche fine, pour la prise de la
  Déflagration. L'image de droite rejoue l'action au survol (ou en boucle dans la bulle d'une carte).
- [x] **Faces des cartes** : en haut « ⚡ Immédiat » ou « ⏳ Au prochain tour » ; en bas « + En plus du coup » ou
  « Remplace le coup » (libellés entiers dans la bulle, le choix des cartes et les règles).
- [x] **Présages** : à l'annonce, un sceau discret du côté du lanceur ; la grande animation se joue quand le pouvoir
  devient actif (échiquier à plat : on peut jouer pendant). Bandeau « Vous annoncez… · Active au début de votre
  prochain tour ».
- [x] **Pré-coups** : plus de flèches, fantômes plus transparents, numéro dans une petite pastille noire.
- [x] **Accueil** : partie neuve à chaque visite, lien discret « Reprendre la partie d'avant (coup N) » ; « Nouvelle
  partie » et « Trouver un adversaire » directement sur la page.
- [x] **Partie en direct sur l'accueil** : deux visiteurs arrivés depuis moins de 30 s, l'échiquier du haut sous les
  yeux (partie contre l'Oracle à peine commencée), sont appariés et jouent l'un contre l'autre sur cet échiquier :
  « En direct : vous jouez contre une personne qui est aussi sur cette page, connectée depuis la France ». Le pays
  vient du fuseau horaire du navigateur (pas de géolocalisation par IP, mentionné dans la confidentialité). Mains tirées
  au hasard, sans pendule ; personne ne joue en 45 s : annulée, retour à l'Oracle. « Jouer plutôt contre l'Oracle »
  à tout moment ; si l'adversaire quitte la page, bandeau et victoire réclamable.

### À garder en mémoire : idées de carte « sacrifice »

Le principe des huit pouvoirs (ils touchent les deux camps) ne s'applique pas tel quel : un sacrifice est
asymétrique par nature, c'est son prix (du matériel, parfois le coup) qui l'équilibre.

1. **Bombe à retardement** (Présage) : vous marquez une de vos pièces (pas le roi), visible de tous. Au début de
   votre prochain tour, elle explose avec les pièces adverses voisines (le roi excepté). L'adversaire a un coup pour
   s'écarter, ou la prendre (elle explose alors sur sa case). Riche en parades : notre favorite.
2. **Tribut** (Rituel, symétrique) : vous sacrifiez une pièce ; votre adversaire doit en sacrifier une de valeur égale
   ou supérieure, de son choix. Fidèle au « tout le monde paie », intéressant quand ses pièces sont toutes utiles.
3. **Pacte de sang** (Rituel) : vous sacrifiez une pièce ; une pièce adverse de valeur strictement inférieure, choisie
   par vous, disparaît (le roi est intouchable). Perte de matériel et de temps contre un défenseur clé : fort, à tester.
4. **Offrande** (Présage) : sacrifier un cavalier gèle les cavaliers adverses 4 coups (de même pour chaque type de
   pièce). Plus original, plus difficile à lire.

Avant d'en ajouter une, mesurer l'équilibre comme pour les huit autres (parties IA contre IA), et se demander s'il
faut une neuvième carte ou en remplacer une.

## 7 novembre, nuit : l'IA en relais

> « garde l'IA pour la page d'accueil ; quand je joue contre l'IA il faut que ce soit indiqué clairement et que j'aie
> un bouton chercher une partie contre un vrai joueur […] laisse le système d'appariement : si au bout de 10 s la
> personne ne joue pas, ça passe sur une IA, ou mieux c'est l'IA qui joue et à tout moment la personne peut prendre
> la main. »

- [x] **Contre l'Oracle, c'est écrit** : « Contre [IA] l'Oracle, une intelligence artificielle », « Contre l'IA » dans
  la légende de l'échiquier et en plein écran (badge, surtitre).
- [x] **« Chercher un vrai joueur »** : bouton sur l'accueil et dans la barre d'actions (menu ⋯ sur téléphone). La
  recherche passe par la salle d'attente de l'accueil, sans limite de temps ; l'IA reste l'adversaire en attendant ;
  « Annuler » à tout moment. (Remplace « Trouver un adversaire », qui menait à une partie de 10 minutes sur une autre
  page.)
- [x] **L'IA en relais** (parties en direct de l'accueil) : un joueur qui ne joue pas (10 s pour son premier coup,
  ensuite 30 s sans toucher l'échiquier) est relayé par l'IA, côté serveur (même onglet fermé). Il reprend la main
  en jouant un coup ou avec « Prendre la main ». Chacun voit qui joue : « Vous ne jouiez pas : l'IA joue pour vous en
  attendant » / « Elle ne joue pas pour l'instant : l'IA joue à sa place ». L'IA ne joue jamais contre elle-même : si
  les deux joueurs sont absents, la partie s'arrête.
