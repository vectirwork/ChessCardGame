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

## 8 novembre : vue mobile, lag et artefacts

> « Là la priorité c'est de fix les problèmes sur la page mobile ! Lag et artefacts à souhait ! […] c'est pas normal
> que ça lag sachant que le Pixel 7 est un bon téléphone. […] je cherche vraiment l'excellence de la performance en
> vue mobile sans sacrifier le visuel. »

Vidéo du fondateur (Pixel 7, 83 s) analysée image par image : dalles sombres et pièces debout sans plateau dans les
emplacements de l'échiquier (V1), rectangles de tuiles (V2), lieux vides qui surgissent tard (V3), saccades de 3 à 8
images figées par seconde (V4), barre dorée au bord de l'écran à l'entrée et à la sortie de la partie (V5).

Causes (mesures au banc et audit du code) :
- le décor et l'échiquier suivaient le doigt par un script, avec au moins une image de retard, et tout se figeait dès
  que le fil principal était pris (rendu complet de l'accueil à chaque seuil, ≈ 80 fois par descente) ;
- la mémoire graphique (tuiles) était presque pleine (≈ 230 à 250 Mo pour ≈ 256 Mo) : chaque calque SVG du décor
  faisait 3,5 fois la largeur du téléphone, les étoiles scintillantes occupaient deux calques plein écran, le lieu
  suivant était peint d'un coup au début de son fondu ; Chrome laissait alors des tuiles vides (V1, V2, V3) ;
- dans les emplacements, l'échiquier changeait de taille à chaque image (tout l'astre retramé) et son cadre formait
  un calque à part sous les cases : seul le cadre restait quand la mémoire manquait (la « dalle sombre ») ;
- Lenis (molette douce) posait des écouteurs tactiles non passifs : chaque début de geste attendait le fil principal.

- [x] **Défilement natif sur téléphone** : calques en parallaxe, fondus des lieux et des ciels, position, taille et
  opacité de l'échiquier sont des animations liées au défilement (ScrollTimeline), jouées par le compositeur avec le
  défilement lui-même. Mêmes valeurs qu'avant (les fondus « smooth » sont exactement cubic-bezier(1/3, 0, 2/3, 1)).
  L'échiquier est placé dans le document et défile avec son texte ; sa taille ne change plus pendant le geste.
- [x] **Lieux montés pendant la traversée des nuées** : mis en page à 1,7 écran, peints un demi-écran avant leur
  fondu, éteints à la fin de leur fondu de sortie ; au plus deux lieux peints. Nuées décodées d'avance.
- [x] **Mémoire graphique** : calques coupés à la largeur de l'écran ; étoiles scintillantes en petits points ;
  anneaux fixes peints sous l'anneau qui tourne ; rayons du Seuil sans fusion ; grain dans la vignette ; en-tête sans
  flou ; cartes, apparitions de texte et cadre de l'échiquier sans 3D permanente ; halo des cartes au repos.
  Calques composés : 80 à 163 avant, 38 (premier écran) à 55 (chapitre) après.
- [x] **Fil principal** : décors, chapitres, anneaux et échiquier de démonstration mémoïsés ; la barre d'adresse ne
  relance plus la mesure ; teinte du lieu écrite au repos ; sorts de démonstration lancés une fois le défilement
  arrêté ; scène 3D (three.js) préchargée au premier défilement ; pas de préchargement de page au toucher d'un lien ;
  plus de Lenis sur écran tactile.
- [x] **Rideau d'or** (V5) : sa lisière part et revient vraiment hors de l'écran (elle restait collée au bord droit) ;
  glissements joués par le compositeur ; sur téléphone, la page glisse sans fondu et le décor ne bouge pas.

- [x] **« Touchez l'échiquier pour jouer »** : l'échiquier posé dans le texte ouvre enfin la partie au toucher (le
  bouton qui devait le couvrir n'avait aucune surface, depuis le début).

Mesure comparative (banc Pixel 7 simulé : 412 × 915, densité 2,625, processeur ×4, mêmes gestes du pouce sur toute la
descente ; le GPU y est émulé par le processeur, la 3D des sorts y coûte bien plus que sur le téléphone) :

| | Avant | Après |
|---|---|---|
| Images du compositeur présentées / perdues | 4 369 / 1 407 (76 %) | 3 732 / 844 (82 %) |
| Images avec des tuiles manquantes | 4 | 0 |
| Images lentes du fil principal (> 33 ms) | 699 | 465 |
| Premier écran (fluidité) | 78 % | 98 % |
| Calques composés | 80 à 163 | 38 à 55 |

Rien n'a encore été vérifié sur le vrai Pixel 7 : une nouvelle vidéo dira si les dalles, rectangles et saccades ont
disparu.

### 8 novembre, suite : échec et mat, et lot « sans changer l'image »

> « Pour l'échec et mat à la fin il faut une petite animation, genre le roi tombe […] à l'horizontale sur sa case. »
> « Fais tout ce qui ne change pas l'image […] je suis pas au pixel près si visuellement ça ne change rien pour un
> humain c'est OK. »

- [x] **Échec et mat** : le roi maté vacille puis tombe couché sur sa case, avec un peu de poussière (côté de la chute
  figé pour la partie ; mouvement réduit respecté).
- [x] **Scène 3D des sorts** : un seul contexte WebGL pour l'accueil (partie et démonstration se le passent) ;
  programmes des effets préparés au repos (2 à 6 compilations bloquantes par sort auparavant, 0 désormais) ; tampon
  libéré entre deux sorts ; calque à la taille réelle de la fenêtre et qui défile avec l'échiquier posé dans le texte
  (les effets restaient décalés d'une image pendant le geste, et étirés quand la barre d'adresse était visible).
- [x] **Échiquier de démonstration** : une seule instance remise à neuf d'un lieu à l'autre (≈ 160 nœuds recréés et
  un plateau retramé en pleine nuée auparavant) ; ses coups attendent l'arrêt du défilement, comme ses sorts.
- [x] **Passage en partie** : le vol de l'échiquier est joué par le compositeur (plus d'écriture image par image
  pendant le moment le plus chargé) ; la coque de la partie est préparée pendant le glissement du rideau.
- [x] **Chargement** : Lenis (molette douce, ≈ 19 Ko) n'est plus téléchargé sur écran tactile ; la connexion temps
  réel de l'accueil s'ouvre au repos ou au premier geste (tout de suite si l'on cherche un joueur) ; la face
  italique du décor est demandée au repos, pas en pleine Forêt.
- [x] **Décor** : l'aurore floutée de la Forêt et les lueurs des éclairs des Pics sont remplacées, au repos, par
  leur propre image précalculée (un flou SVG était recalculé à chaque tramage ; écart de 3 à 7 niveaux sur 255) ;
  graduations des anneaux en un seul tracé (377 traits → 10).
- [x] **Rotation du téléphone pendant un sort** : la page ne s'élargit plus (elle restait bloquée en largeur
  paysage, dézoomée).
- Écarté après relecture et mesure : étoiles regroupées en tracés (en tramée GPU, celle des vrais appareils, des
  étoiles faibles perdaient la moitié de leur lumière, et la carte graphique travaillait 2,3 fois plus) ; nappes de
  neige, de sable et de poussières en particules (4 à 5 Mo de mémoire graphique gagnés sur téléphone, environ 2 %,
  pour 46 calques animés de plus et un compositeur un peu plus chargé : pas un gain net).

Mesure comparative avec la version en ligne (même banc Pixel 7 simulé que plus haut, processeur ×4, deux passages
de chaque, alternés) :

| | En ligne (4a6e022) | Après ce lot |
|---|---|---|
| Images lentes du fil principal (> 33 ms) | 707 et 763 | 549 et 564 |
| Images avec des tuiles manquantes | 3 et 4 | 1 et 0 |
| Premier écran (fluidité) | 90 % | 97 à 98 % |
| Images du compositeur présentées | 74 % | 73 à 75 % |
| Images lentes sans sort à l'écran | 17 % | 11 % |
| Images lentes avec un sort à l'écran | 67 % | 57 % |

Le chiffre global du compositeur ne bouge pas, et il était de 82 % ce matin : la différence vient des sorts de la
démonstration, qui partent maintenant à chaque arrêt du pouce (scène 3D prête d'avance), donc bien plus souvent
pendant le banc (735 images avec un sort à l'écran contre 546). Or le banc n'a pas de vraie carte graphique : la 3D
des sorts y est calculée par le processeur, déjà ralenti ×4, et fait à elle seule la plupart des images perdues. À
situation égale (avec ou sans sort à l'écran), chaque image est nettement plus souvent à l'heure qu'en ligne.

Rien n'a encore été vérifié sur le vrai Pixel 7.

## 8 novembre, soir : la version PC

> « C'est pas mal sur téléphone !! Et sur PC ? Je voudrais que tu transposes ce qui est transposable sur la version PC
> aussi. »

Mesures d'abord (banc ordinateur : 1440 × 900, molette avec Lenis, processeur ×4, sans vraie carte graphique), puis
audit en lecture seule (trois angles, un sceptique par angle, une synthèse). Ce qui coûtait sur PC :
- le fond « fixed » de la page (entièrement caché par le ciel de l'accueil) faisait repeindre toute la fenêtre à
  chaque image de défilement, et chaque fondu de ciel retramait le calque des ciels en plein écran ;
- des animations en boucle restaient « en cours » sans être visibles : le point « en direct » de la légende cachée de
  l'échiquier, et le contenu des lieux éteints d'un coup (leur mise en pause n'était jamais calculée). Invisibles,
  elles ne sont pas confiées à la carte graphique : le fil principal les faisait avancer et refaisait la mise en
  calques de toute la page à chaque image (téléphone compris) ;
- l'échelle de l'échiquier, réécrite à chaque image des traversées, restylait tout l'astre (300 à 500 éléments) alors
  qu'elle ne sert qu'à la pièce qu'on glisse ;
- l'échiquier jouable était réconcilié à chaque rendu de l'accueil (sa mémoïsation ne servait à rien) ;
- les liens passant sous une souris immobile pendant une glissade préchargeaient leur page en plein geste ; three.js
  (≈ 600 Ko) était analysé au premier cran de molette, en pleine glissade.

- [x] Fond fixe retiré sur l'accueil à toutes les tailles ; ciel visible dans son propre calque, ciels recouverts ni
  peints ni composés. Tramée d'une descente Observatoire → Forêt : 4,8 s → 1,3 s.
- [x] Lieu éteint : ses animations sont mises en pause pendant une image où son contenu est encore stylé, puis il est
  masqué ; point « en direct » de la légende cachée en pause. Mise en calques au Bazar pendant une glissade :
  1 040 → 5 ms.
- [x] Échelle de l'échiquier écrite seulement là où l'on joue (héros, partie) ; légende cachée immobile ; propriétés
  de l'échiquier jouable mémoïsées ; halo de survol dans son propre composant.
- [x] Préchargement des pages au vrai mouvement de la souris (ou à l'appui) ; scène 3D préparée à la première pause du
  lecteur (sans pause dans les 3 s, chargée comme avant).
- [x] Fondus des fonds et des anneaux dans leur calque le temps du fondu (sans gain mesurable au banc, gardé : il
  évite des retramages sur les grands écrans).

Mesure, même parcours à la molette, version en ligne puis cette version (fil principal, sur le passage) :

| | Sortie du héros | Chapitres | Pics → Sablier | Bazar |
|---|---|---|---|---|
| Calcul des styles | 1,71 → 1,08 s | 1,69 → 1,18 s | 1,52 → 0,86 s | 0,29 → 0,23 s |
| Mise en calques | 1,17 → 1,04 s | 1,28 → 1,05 s | 1,27 → 0,59 s | 1,05 → 0,00 s |
| Script (avec ce qu'il déclenche) | 3,25 → 2,27 s | 2,32 → 2,35 s | 1,54 → 1,30 s | stable |
| Peinture | 0,59 → 0,55 s | 0,69 → 0,57 s | 0,51 → 0,36 s | — |

Captures figées au même instant, avant / après, ordinateur et téléphone : identiques (au plus quelques pixels
d'anticrénelage ; seules les cartes tirées au hasard dans la main diffèrent).

Pas transposé : le décor joué par le compositeur (ScrollTimeline) comme sur téléphone. Avec Lenis, le fil principal
travaille de toute façon à chaque image : le gain serait faible pour un gros chantier. Il prendrait tout son sens sans
Lenis (défilement natif du navigateur), mais la molette perdrait sa douceur : décision du fondateur.

À proposer (changent l'image de façon imperceptible, déjà faits sur téléphone) : cartes inclinées en 3D seulement au
survol (≈ 11 calques permanents de moins), grain dans le calque de la vignette (un calque plein écran de moins), rayons
du Seuil sans fusion « screen ».

Rien n'a été vérifié sur un vrai PC.

## 9 novembre, nuit : à-coups au premier passage dans les nuages (PC)

> « Encore des problèmes de lag sur PC, surtout au premier défilement dans les nuages. »

Mesure d'une visite neuve à l'ordinateur (premier geste puis descente continue jusqu'à la Forêt, processeur ×4) :
- **le premier sort de la Forêt compilait tous les programmes 3D d'un coup**, en pleine descente : une tâche de
  500 ms au banc (dont 295 ms pour le premier rendu). La préparation « au calme » ne venait jamais pour qui descend
  sans s'arrêter, et une scène préparée était jetée au bout de 20 s. La compilation est réputée lente sur certains
  PC (Windows) : c'est l'à-coup du premier passage ;
- à chaque image d'un sort, la scène 3D relisait la position de l'échiquier et un style calculé au milieu des
  écritures du moteur : style et mise en page refaits sur-le-champ (0,7 s sur une glissade au banc).

- [x] À l'ordinateur, la scène 3D est préparée en entier (contexte, programmes, textures des lieux) au repos après le
  chargement, pendant la lecture du premier écran, et gardée jusqu'à ce que la démonstration la prenne (libérée si
  l'accueil est quitté avant). Pire image du premier passage : 517 → 267 ms au banc ; plus aucune tâche de
  compilation pendant la descente, même pour qui défile dès 1,5 s après l'arrivée.
- [x] Position de l'échiquier relevée juste après chaque image (gratuite), pour l'image suivante ; placement lu dans
  le style en ligne. Lectures forcées : 683 → 50 ms sur une glissade ; script du fil principal −23 à −37 %.

Ce qu'il reste de régulier : Lenis fait travailler le fil principal à chaque image (décor écrit par le script,
animations en boucle réévaluées). Le supprimer rendrait la molette moins douce : décision du fondateur.

## 9-10 novembre : la boutique et les skins

> « Retravaille la boutique : je veux qu'on puisse customiser son roi, l'échiquier, les sorts, et que ce soit plus
> visuel ; une vraie notion de skin. »

Atelier d'agents (directeur artistique, designer de la boutique, architecte, trois artistes, jury), puis réalisation
en lots parallèles relus par des relecteurs adverses, intégration et vérification.

- [x] **Trois emplacements** équipés séparément : le **Roi** (vu de l'adversaire et des spectateurs, pris à l'assise),
  l'**Échiquier** (vu de soi seulement) et les **Sorts** (vus des deux joueurs, avec chaque sort lancé).
- [x] **8 collections** (roi, échiquier et sorts assortis, rareté Offert / Rare / Épique / Légendaire) : Arcane (offerte),
  Jardin de jade, Néon 2084, Forge d'Inferno, Olympe, Cour écarlate, Néant, Voûte céleste. 7 rois dessinés en SVG
  léger (deux palettes chacun, lisibles à 36 px, même gabarit que le roi actuel : la chute du mat est la même),
  3 échiquiers nouveaux (Grille 2084, Horizon des événements, Carte du ciel) et des décors statiques (incrustation,
  frise, liseré, lueurs), 2 sorts nouveaux (Laurier, Écarlate). Une collection complète donne un **sceau** à côté du
  pseudo (en partie, au classement, au profil).
- [x] **Boutique** : cabine d'essayage (roi blanc et noir, échiquier avec son roi, sort qui joue ; tout s'essaie avant
  d'acheter), rayons Rois / Échiquiers / Sorts / Collections, achat et équipement d'un geste, prix « compléter la
  collection », Trésor du Bazar (tout), Grimoire des sorts ; texte corrigé : l'échiquier n'est vu que par soi.
- [x] **En partie** : chaque camp porte son roi ; l'Oracle joue avec le Roi éclipse ; préférence « rois adverses
  classiques » dans le compte. **Coup de grâce** : au mat, une gerbe aux couleurs des sorts du vainqueur accompagne la
  chute du roi.
- [x] Serveur : paiement au prix juste, achats d'un panier, promesses des anciens packs tenues (livrées une fois),
  remboursements génériques, e-mails regroupés.

Mesures (alternées, trois passages) : sur téléphone, aucune différence (fluidité 63 à 64 % dans les deux versions,
aucune tuile manquante) ; sur ordinateur, 5 à 10 % de travail du fil principal en plus pendant la descente (rois
dessinés et décors d'échiquier sur l'accueil).

À valider par le fondateur : la grille de prix (aucun prix existant ne monte), les nouveaux sorts et échiquiers offerts
aux acheteurs du Grimoire complet (pas les rois), l'Oracle en Roi éclipse, les cases d'Obsidienne éclaircies.
Plus tard : jeux de pièces complets, cadres et dos des cartes, particule « feuille » pour Laurier.
