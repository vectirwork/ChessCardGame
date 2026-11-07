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
