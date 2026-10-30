# Cartes globales : proposition de nouveau catalogue (version 2)

> Statut : proposition de conception, révisée après deux relectures indépendantes. Aucun code n'a été modifié ; rien
> n'a été joué ni testé en partie réelle. Les positions marquées **(vérifié)** ont été contrôlées avec le moteur actuel
> (`src/shared/chess.ts`) sur un script jetable ; les fréquences de tirage viennent d'une simulation (400 000 mains).
> Le reste vient de la lecture du code : `src/shared/{cards,game,chess}.ts`, `src/server/{games,bot}.ts`,
> `src/client/vfx/{stage,effects}.ts`, `src/client/pages/Rules.tsx`.

## En une minute (pour le fondateur)

Aujourd'hui, presque toutes les cartes visent l'adversaire : « je gèle ta dame », « je foudroie ton pion ».
La proposition : **12 cartes qui changent la partie pour tout le monde** (le temps, les règles, le plateau). La carte
ne donne pas un pouvoir à son lanceur : elle change le monde, et le lanceur gagne parce qu'il a **choisi le moment**,
celui où ce nouveau monde l'arrange plus que l'adversaire.

- **Avant :** « Je gèle ta dame. »
- **Après :** « J'annonce l'hiver. Au prochain tour, tous les pions seront gelés. Les miens ne servaient à rien, les
  tiens tenaient toute ta défense. Tu as un coup pour t'y préparer. »

**Ce que la relecture a changé.** La première version laissait le lanceur frapper avant toute réponse : il lançait
la carte, puis exploitait aussitôt le nouveau monde (dame immédiate, téléportation matante, pièce gagnée au premier
coup). Trois règles nouvelles corrigent cela :

1. **Présage.** Un Climat (et les Portails) **s'annonce** : il arrive au début du tour suivant du lanceur, après la
   réponse adverse. L'adversaire voit venir le changement et a toujours un coup pour s'y préparer. Visuellement, c'est
   un cadeau : le ciel change en deux temps (le front approche, puis l'orage éclate).
2. **Rituel.** La Grande Marée **remplace le coup** du lanceur : l'adversaire profite le premier des contacts créés.
3. **La magie cède.** Un joueur que les effets privent de tout coup, sans être en échec, joue ce coup-là comme si les
   effets n'existaient pas pour ses pièces. Il n'y a plus de passe : la passe offrait deux coups d'affilée à
   l'adversaire.

S'y ajoutent un **tirage pondéré par rareté** et des corrections carte par carte (section 8).

Trois familles :

| Famille | Ce qu'elle fait | Quand | Cumul | Cartes |
|---|---|---|---|---|
| **Climat** | Change une règle sur tout le plateau | **Présage** : arrive au tour suivant | **Un seul à la fois** : le nouveau remplace l'ancien à son arrivée | Sablier fou, Trêve, Lune de sang, Ère glaciaire, Couronnement, Déflagration, Chevauchée |
| **Terrain** | Transforme des cases, pour les deux camps | Tout de suite (Portails : présage) | Se cumulent, sans se superposer | Mur de glace (conservé), Faille, Portails |
| **Événement** | Agit une fois | Tout de suite (Marée : remplace le coup) | n/a | Grande Marée, Déjà-vu |

| Carte | Famille | Rareté | Règle en une phrase | Arrivée | Durée |
|---|---|---|---|---|---|
| Sablier fou | Climat | Rare | Les **deux** pendules s'écoulent deux fois plus vite, sans incrément. *(entre humains, avec pendule)* | Présage | 6 coups (3 chacun) |
| Trêve | Climat | Commune | Aucune capture, sauf pour sortir d'un échec. | Présage | 3 coups (vous, lui, vous) |
| Lune de sang | Climat | Épique | Qui peut capturer doit capturer. | Présage | 3 coups (vous, lui, vous) |
| Ère glaciaire | Climat | Rare | Tous les pions sont gelés : ils ne bougent ni ne capturent. | Présage | 4 coups (2 chacun) |
| Couronnement | Climat | Épique | Un pion est promu dès qu'il atteint sa 7e rangée. | Présage | 4 coups |
| Déflagration | Climat | Légendaire | Chaque capture (sauf par un roi) explose et emporte les pièces voisines. | Présage | 4 coups |
| Chevauchée | Climat | Rare | Tours, fous et dames peuvent aussi sauter comme un cavalier. | Présage | 2 coups (vous, lui) |
| Mur de glace | Terrain | Commune | Une case vide devient infranchissable. *(conservée)* | Tout de suite | 6 coups |
| Faille | Terrain | Commune | La 4e ou la 5e rangée se fend : ses cases vides sont infranchissables. | Tout de suite | 4 coups |
| Portails | Terrain | Rare | Deux cases symétriques reliées : une pièce qui s'arrête sur l'une peut ressortir par l'autre. | Présage | 6 coups |
| Grande Marée | Événement | Rare | **Rituel** (remplace votre coup) : tous les pions avancent d'une case. | Rituel | Instantané |
| Déjà-vu | Événement | Légendaire | Le monde recule d'un tour : votre coup et la réponse adverse sont effacés. | Tout de suite | Instantané |

Un **coup** = le coup d'un joueur (un demi-coup, au sens technique). Les durées comptent les coups des deux camps,
affichés par des pastilles aux couleurs de celui qui les joue.

### Ce que deviennent les 11 cartes actuelles

| Actuelle | Devient | Pourquoi |
|---|---|---|
| Distorsion temporelle (pendule adverse ×2) | **Sablier fou** (les deux pendules ×2) | Le souhait exact du fondateur : le temps accélère pour tout le monde. |
| Mur de glace | **Mur de glace**, conservé | Déjà symétrique : la case est bloquée pour les deux camps. |
| Gravité (portée adverse ≤ 3) | Réserve : *Pesanteur* symétrique | Doublon de Faille et de Mur (cartes qui restreignent). Sa sphère et son halo servent de base à la lune de la Lune de sang. |
| Cryogénie (gèle une pièce adverse) | **Ère glaciaire** (gèle tous les pions) | Le gel devient un climat. |
| Égide (protège une pièce) | **Trêve** (plus personne ne capture) | La protection devient universelle. |
| Saut du cavalier (une pièce, ce tour) | **Chevauchée** (toutes les pièces longues) | Le même pouvoir, pour les deux armées. |
| Retour arrière (annule le coup adverse) | **Déjà-vu** (annule les deux derniers coups) | Le temps recule pour le monde entier, pas seulement pour l'adversaire. |
| Passe-muraille | Réserve : *Spectres* | Version globale coûteuse dans le moteur (rayons d'attaque à travers ses propres pièces). |
| Foudre, Permutation, Résurrection | Retirées | Purement unilatérales. Leurs effets visuels sont réemployés (éclair pour la Faille, arcs pour les Portails, colonne de lumière pour le Couronnement). |

---

## 1. Principes de conception

1. **Une règle pour le plateau, pas pour un joueur.** Le texte d'une carte ne dit jamais « l'adversaire » ni « vos
   pièces », sauf pour désigner une cible. Si on lit la règle sans savoir qui l'a lancée, elle reste vraie.
2. **Le moment, puis la réponse.** Le lanceur choisit *quand* (et, pour un Terrain, *où*). Une carte qui donne de
   nouveaux pouvoirs aux pièces s'annonce : l'adversaire a toujours un coup pour répondre avant que le monde change.
   Ensuite, chaque camp joue le même nombre de coups sous l'effet ; le lanceur ouvre, l'adversaire ferme. Seules
   exceptions : la Trêve et la Lune de sang, dont la règle porte sur la reprise ; celle-ci revient à l'adversaire.
3. **Chaque carte doit pouvoir se retourner contre son lanceur.** Une carte toujours bonne à jouer est ratée. Chaque
   fiche indique la position où la carte fait perdre celui qui la lance mal à propos.
4. **Contre-jeu visible.** Tout est public : Climat annoncé, effets actifs, durée restante, cases touchées.
   L'adversaire sait quand l'effet arrive et quand il finit, et peut s'y préparer.
5. **Lisible en une phrase, visible sur tout l'échiquier.** Chaque règle tient en une phrase. Le plateau entier
   (ciel, cases, pièces, pendules) change d'aspect pendant toute la durée.
6. **Les échecs restent les échecs.** Effets courts. Le roi est hors d'atteinte des cartes. Pas d'échec ni de pat
   par magie. Une partie se gagne par un coup (mat, temps, abandon), jamais par une carte seule. Pas de hasard dans
   les effets : le hasard se limite à la distribution des cartes.
7. **La rareté compte.** Les cartes les plus fortes sortent moins souvent, et une main mélange les familles.
8. **Le skin du lanceur colore le monde.** Un effet global offre au skin toute la surface de l'échiquier, ce qui le
   met bien plus en valeur qu'un effet sur une seule case.

## 2. Règles générales (nouvelles ou modifiées)

**R1. Trois familles.**
- *Climat* : change une règle pour tout le plateau. **Un seul Climat actif à la fois, et un seul annoncé.** Un Climat
  annoncé remplace le Climat actif au moment où il arrive : l'ancien s'arrête sans finir son compte. On ne peut pas
  annoncer un Climat tant qu'un autre est annoncé. On peut annoncer le même Climat que celui qui est actif (mode
  miroir) : il repart de zéro à son arrivée. Remplacer un Climat n'annule donc plus rien sur-le-champ : l'ancien
  s'applique encore à votre coup et à la réponse adverse.
- *Terrain* : transforme des cases. Les Terrains se cumulent, mais une case ne porte jamais deux Terrains (Mur, Faille
  et Portail s'excluent sur une même case). Une seule Faille et une seule paire de Portails à la fois.
- *Événement* : agit au lancement, puis ne laisse aucun effet actif.

**R2. Présage et durées.**
- *Présage* (Climats et Portails) : la carte est lancée avant votre coup, mais l'effet n'arrive qu'au début de votre
  tour suivant, après la réponse adverse. Entre-temps, il n'a aucun effet sur les règles, mais il est affiché pour
  tout le monde (« arrive dans 2 coups », puis « dans 1 coup »).
- Les autres cartes (Mur, Faille, Déjà-vu) agissent tout de suite. La Grande Marée est un Rituel (R3).
- *Durée* : un effet de N coups est actif pendant N coups, comptés sur les deux camps à partir de son arrivée (ou du
  coup du lanceur pour un effet immédiat). Le compteur baisse après chaque coup. Pour le Mur de glace, la durée reste
  exactement celle d'aujourd'hui : 6 coups = 3 coups adverses.

**R3. Une carte par tour, avant le coup** (inchangé), avec une exception : un **Rituel** (Grande Marée) *est* votre
coup. Il termine votre tour, comme un coup : pendule arrêtée avec incrément, effets décomptés, puis c'est à
l'adversaire.

**R4. Garde-fous (reformulés).**
- a) **Une carte ne met jamais le roi adverse en échec.** Pour une carte immédiate, on regarde la position juste
  après la carte. Pour une carte annoncée, on regarde la position actuelle comme si l'effet était déjà arrivé (en
  pratique, seule la Chevauchée peut créer une attaque). Un coup préparé par une carte peut, lui, donner échec,
  y compris un échec « à l'arrivée » (R5) : c'est le coup qui le donne.
- b) Après une carte (autre qu'un Rituel), le lanceur doit garder au moins un coup légal **sous les effets**. La règle
  R6 ne compte pas, sauf si le lanceur était déjà bloqué avant de jouer la carte. Sans cela, on pourrait se bloquer
  soi-même pour jouer ensuite comme si aucun effet n'existait.
- c) Une carte peut sauver du mat : sans coup légal, on doit jouer une carte qui en redonne un, s'il en existe une
  (inchangé). En pratique : le Mur de glace, la Faille, la Grande Marée et le Déjà-vu. Un Climat ne sauve jamais
  d'un mat, puisqu'il n'arrive qu'au tour suivant.
- d) Un coup n'est légal que si le roi de celui qui joue est à l'abri **après** le coup, avec les effets tels qu'ils
  seront à ce moment-là, arrivées et expirations comprises (mécanisme `modsAfter` actuel). Celui qui répond à un
  Présage doit donc mettre son roi à l'abri du monde qui arrive.
- e) L'arrivée d'un Climat peut mettre en échec le roi de son propre lanceur, jamais celui de l'adversaire (règle d).
  Le lanceur pare alors avec son coup.

**R5. Lecture de l'échec.** Un roi est en échec si l'adversaire pourra le prendre à son prochain coup, **avec les
effets tels qu'ils seront à ce moment-là** (le jeu de modificateurs `modsAfter` du camp au trait). C'est déjà le
critère de légalité ; il faut l'appliquer aussi à l'affichage de l'échec, au `+` de la notation et à la distinction
entre mat et pat. Quand l'échec ne vient que d'un changement à venir, l'interface le dit : « échec à l'arrivée »
(Chevauchée), « échec à la fonte » (Mur de glace), « échec à la fermeture » (Faille). Le halo du roi est alors en
pointillé, pas plein.

**R6 (nouveau). La magie cède : pas de pat par magie.** Si le camp au trait n'est pas en échec et que les effets lui
retirent tous ses coups alors que les échecs ordinaires lui en laisseraient, il joue ce coup-là **comme si les effets
n'existaient pas pour ses pièces** : un pion gelé avance, une capture interdite par la Trêve est permise, une pièce
franchit le gouffre. La sécurité de son roi reste jugée avec les effets (règle R4d). Si sa pièce s'arrête sur une
case de Mur ou de Faille, cette case redevient normale. Les effets reprennent ensuite pour tout le monde.
- Il ne passe jamais son tour : l'alternance des coups est conservée et l'adversaire ne gagne aucun temps.
- Il n'est pas obligé de dépenser une carte pour se débloquer : il a des coups, une carte reste facultative.
- Un joueur **en échec** n'en profite pas : un mat aidé par un effet reste un mat, puisque c'est le coup qui mate.
- Exemples **(vérifié)** :
  - Ère glaciaire ; Blancs Rh1, pions g2 et h2 ; Noirs Ce2. Sous l'effet, les Blancs n'ont aucun coup. Sans l'effet,
    ils ont g3, g4, h3 et h4 : ils jouent l'un de ces coups.
  - Blancs Rf7 et Ce5 ; Noirs Rh8 et pion h7. Sous l'effet, les Noirs n'ont aucun coup. Ils jouent h6 ou h5, au lieu
    de passer et de subir Cg6#.

**R7. Le roi est hors d'atteinte des cartes.** Aucun effet ne déplace, ne gèle ni ne détruit un roi, et une capture
faite par un roi ne déclenche aucun effet.

**R8. Tout est public.** Climat annoncé, Climat actif et Terrains s'affichent pour les deux joueurs et les
spectateurs, avec leur compteur. Les mains restent cachées jusqu'au lancement (inchangé).

**R9 (nouveau). Tirage pondéré.** Chaque carte est tirée avec un poids selon sa rareté : Commune 4, Rare 3, Épique 2,
Légendaire 1. Une main contient au plus 1 Légendaire et au plus 2 Climats. Le Sablier fou est exclu des parties sans
pendule et des parties contre l'IA. Le mode miroir donne toujours la même main aux deux joueurs.

Fréquences simulées, avec pendule et entre humains (sans le Sablier, les autres cartes montent de 2 à 4 points) :

| Carte | Dans une main donnée | Dans la partie (l'une des deux mains) |
|---|---|---|
| Mur de glace, Faille (Communes) | 40 % | 64 % |
| Trêve (Commune) | 32 % | 54 % |
| Portails, Grande Marée (Rares) | 31 % | 53 % |
| Sablier fou, Ère glaciaire, Chevauchée (Rares) | 24 % | 43 % |
| Lune de sang, Couronnement (Épiques) | 17 % | 30 % |
| Déjà-vu (Légendaire) | 10 % | 20 % |
| Déflagration (Légendaire) | 8 % | 15 % |

Avec le tirage uniforme actuel, chaque carte est dans 25 % des mains et dans 44 % des parties. Mains : 6 % sans
Climat, 41 % avec un Climat, 53 % avec deux Climats.

**R10 (nouveau). Les cinématiques ne coûtent pas de temps.** Pendant la cinématique d'un lancement, d'une arrivée ou
d'un Rituel, la pendule du camp au trait ne tourne pas : le serveur lui crédite une durée fixe (1,2 s).

### Cumul des effets

| Déjà actif → / Lancé ↓ | Climat actif | Climat annoncé | Terrain | Événement |
|---|---|---|---|---|
| **Climat** | Annoncé ; remplace l'ancien à son arrivée | **Refusé** (un seul annoncé à la fois) | Cumul | n/a |
| **Terrain** | Cumul | Cumul | Cumul (cases distinctes ; une Faille, une paire de Portails) | n/a |
| **Événement** | S'applique sous le Climat en cours | Le Présage continue | S'applique en tenant compte des Terrains | n/a |

Combinaisons impossibles par construction : Lune de sang et Trêve, Déflagration et Lune de sang (une seule humeur du
ciel). Combinaisons voulues : Faille et Chevauchée (seuls les sauts franchissent la Faille), Portails et Chevauchée,
Mur et Trêve.

### Textes proposés pour la page Règles (`Rules.tsx`, « Les règles en 7 points »)

1. **Une partie d'échecs normale.** Toutes les règles officielles s'appliquent : roque, prise en passant, promotion,
   pat, triple répétition, règle des 50 coups.
2. **Trois cartes chacun**, tirées au hasard (les plus rares sortent moins souvent), cachées jusqu'à ce qu'on les
   joue.
3. **Une carte par tour, avant votre coup.** Elle change le monde pour les deux joueurs : à vous de choisir le moment.
   Un Rituel, lui, remplace votre coup.
4. **Le ciel s'annonce, la terre agit tout de suite.** Un Climat arrive au début de votre tour suivant : votre
   adversaire a un coup pour s'y préparer. Un seul Climat à la fois : le nouveau remplace l'ancien quand il arrive.
   Les Terrains transforment des cases tout de suite (les Portails s'ouvrent au tour suivant). Les Événements
   agissent sur-le-champ.
5. **Durées en coups.** Les pastilles comptent les coups restants, aux couleurs de celui qui les jouera.
6. **Pas d'échec par magie.** Une carte ne peut pas mettre le roi adverse en échec, et vous devez garder un coup
   légal. Une carte peut vous sauver du mat.
7. **Pas de pat par magie.** Si les effets vous laissent sans aucun coup alors que vous n'êtes pas en échec, vous
   jouez comme s'ils n'existaient pas pour vos pièces.

---

## 3. Les 12 cartes

Conventions : *7e rangée* = rangée 7 pour les Blancs, rangée 2 pour les Noirs (rangée relative). Les durées sont en
coups (R2). Chaque fiche décrit l'identité, la règle exacte, l'intérêt stratégique, les interactions délicates, les
changements moteur et la mise en scène (présage, arrivée, pendant, fin). La ligne *Après relecture* résume ce qui a
changé et pourquoi.

### 3.1 Sablier fou (`hourglass`) : « Le temps s'emballe pour tout le monde. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte | Particularité |
|---|---|---|---|---|---|---|
| Climat | Rare | 0 | Présage | 6 coups (3 chacun) | 192 | Entre humains, avec pendule (`timedOnly`, `humanOnly`) |

**Règle.** Annoncé, il arrive au début de votre prochain tour. Pendant 6 coups, les deux pendules s'écoulent deux fois
plus vite, et les coups joués ne rapportent pas d'incrément.

**Précisions.** Le temps passé avant l'arrivée (votre coup, la réponse adverse) s'écoule au rythme normal. Chaque camp
joue 3 coups à ×2, vous d'abord. La cinématique d'arrivée ne coûte rien (R10).

*Après relecture :* lancé avant le coup du lanceur, l'effet donnait 3 coups accélérés à l'adversaire contre 2
« utiles » au lanceur, dont le premier coup était déjà réfléchi à ×1. Le Présage rétablit 3 contre 3. Contre l'IA,
qui joue en une seconde, la carte ne pénalisait que l'humain : elle sort du tirage dans ces parties. Les incréments
sont suspendus, sinon l'effet ne mordait pas en 3+2 ou en 15+10.

**Pourquoi c'est stratégique.**
- *Quand la jouer :* vous avez plus de temps que l'adversaire (3 min contre 1 min : il n'aura plus que 30 s réelles) ;
  vos prochains coups sont simples (finale technique, plan déjà préparé) et les siens demandent du calcul.
- *Quand elle se retourne :* chacun brûle autant de coups accélérés. Si l'adversaire trouve une suite simple, c'est
  vous qui êtes en zeitnot.
- *Contre-jeu :* jouer vite et simple ; annoncer un autre Climat, qui remplacera le Sablier à son arrivée.

**Interactions délicates.**
- Échec, mat, pat, roque, prise en passant, promotion : aucun effet sur l'échiquier.
- Chute du drapeau : règle actuelle (`canStillMate` : sans matériel pour mater, c'est nulle).
- Le rythme ne change pas pendant un tour : l'arrivée, l'expiration et le remplacement tombent tous entre deux coups,
  pendule arrêtée. Seule exception : un Déjà-vu restaure un état où le Sablier était (ou n'était pas) actif. Dans
  `applyCard`, **avant** `d.state = r.state`, recaler alors la pendule en marche :
  `if (ck?.running) { ck[ck.running] = remaining(room, ck.running); ck.since = now(); }`.
- Déjà-vu : le temps consommé n'est pas rendu au lanceur (voir 3.12 pour l'adversaire).
- Partie sans pendule ou contre l'IA : carte exclue du tirage (R9).

**Moteur.**
- `cards.ts` : `timedOnly: true`, `humanOnly: true` ; `dealHands` reçoit `vsBot` et filtre `humanOnly`.
- `game.ts` : `clockRate(s, c)` remplace `timeWarpOn` : 2 si un `hourglass` est actif (arrivé), sinon 1 ; même valeur
  pour les deux couleurs. `incrementSuspended(s)` : vrai si un `hourglass` est actif.
- `server/games.ts` : `rate()` appelle `clockRate`. Dans `applyMove`, l'incrément se décide sur l'état **avant** le
  coup : `stopClock(room, color, !incrementSuspended(before))`.
- Protocole : `ClockView.rate` existe déjà par couleur ; ajouter `noIncrement: boolean` pour barrer le « +2 » affiché.
- `bot.ts` : supprimer le cas `time_warp` de `chooseBotCard` (l'IA ne reçoit jamais cette carte).

**Mise en scène.**
- *Présage :* un anneau de graduations se dessine en filigrane sur le bord du cadre côté lanceur ; un tic-tac lointain ;
  les deux pendules portent une pastille « ×2 au prochain tour ».
- *Arrivée :* l'échiquier s'incline (`cinematic(…, 0.62)`), une horloge géante (`clockFace` × 2,5) se dresse au-dessus
  du plateau, ses aiguilles accélèrent jusqu'au flou ; à l'impact elle éclate en 12 éclats qui filent vers **les deux**
  pendules.
- *Ciel :* bleu nuit rayé de lignes de vitesse.
- *Pendant :* l'anneau tourne autour du cadre ; les deux pendules portent un badge « ×2 » qui pulse, l'incrément est
  barré ; tic-tac accéléré discret.
- *Fin :* l'anneau ralentit et s'effrite en sable.

### 3.2 Trêve (`truce`) : « Les armes se taisent. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Climat | Commune | 0 | Présage | 3 coups (vous, l'adversaire, vous) | 85 |

**Règle.** Annoncée, elle arrive au début de votre prochain tour. Pendant 3 coups, aucune capture n'est permise (prise
en passant comprise), sauf pour sortir d'un échec. L'adversaire reprend les captures le premier.

**Précisions.** L'échec n'est pas suspendu : on ne peut pas laisser son roi attaqué, et les pièces contrôlent toujours
leurs cases. En échec, toutes les parades légales sont permises, captures comprises (légitime défense). Le compteur
des 50 coups est figé pendant la Trêve.

*Après relecture :* avec 4 coups, la Trêve finissait après le 2e coup adverse et le lanceur reprenait toujours les
captures le premier. Un cavalier posé en g5 sous un pion h6 était intouchable, puis prenait en f7 à la reprise. Avec
3 coups, les pièces laissées en prise par le lanceur sont les premières exposées. Le compteur des 50 coups est figé,
car un défenseur à 96 coups sans prise pouvait lancer la Trêve pour faire tomber la nulle automatique.

**Pourquoi c'est stratégique.**
- *Quand la jouer :* l'adversaire prépare une attaque à coups de sacrifices et de captures en chaîne ; la Trêve la
  coupera après son prochain coup. Il vous faut deux coups tranquilles pour roquer, regrouper ou ramener un
  défenseur. Ou bien vous voulez chasser un Climat adverse (remplacement à l'arrivée).
- *Quand elle se retourne :* l'adversaire peut encore capturer une fois pendant le Présage, et il reprend les captures
  le premier : vos pièces mal placées pendant la Trêve tombent d'abord.
- *Contre-jeu :* utiliser la réponse au Présage pour faire l'échange ou la prise dont on a besoin ; pendant la Trêve,
  préparer deux menaces pour la reprise.

**Interactions délicates.**
- Échec et mat : inchangés. En échec, toutes les parades restent possibles : la Trêve ne crée ni ne supprime de mat.
- Blocage : si les seuls coups possibles sont des captures, la magie cède (R6) et la capture est permise.
- Roque : permis (ce n'est pas une capture).
- Prise en passant : interdite hors échec ; le droit se perd normalement après un coup.
- Promotion : par poussée, oui ; par capture, seulement pour sortir d'un échec.
- Règle des 50 coups : compteur figé pendant les 3 coups.
- Déjà-vu : restaure l'état d'avant, avec ou sans Trêve, annoncée ou non.
- Expiration : après votre 2e coup sous la Trêve ; l'adversaire joue le premier coup de la reprise.

**Moteur.**
- `Mods.truce: boolean` ; `modsFromEffects` le positionne (effets arrivés seulement).
- `chess.ts`, `legalMoves` et `hasLegalMove` : si `modsNow.truce` et que le camp n'est **pas** en échec selon R5
  (`inCheck(pos, us, modsAfter)`, calculé une fois avant la boucle), écarter les coups `F_CAPTURE` avant `makeMove`.
  Ne rien changer à `isAttacked`.
- `game.ts`, `playMove` : si `modsNow.truce`, `n.pos.halfmove = s.pos.halfmove` (compteur figé).
- `bot.ts`, quiescence : aucune capture hors échec quand `mods.truce`.

**Mise en scène.**
- *Présage :* une lumière blanche se rassemble au zénith ; un fin liseré d'hexagones se dessine sur le cadre.
- *Arrivée :* la lumière tombe ; un dôme hexagonal (le `shieldDome` de l'Égide, agrandi à tout l'échiquier) se referme
  sur le plateau ; une onde douce part du centre ; toutes les pièces s'inclinent légèrement (CSS `transform`, 300 ms).
- *Ciel :* aube nacrée.
- *Pendant :* le dôme est presque invisible et scintille sur les bords ; plumes ou pétales du skin tombent lentement.
- *Fin :* le dôme s'élève et se dissout en particules dorées, sur un gong sourd ; un éclat bref côté adverse signale
  qui reprend le premier.

### 3.3 Lune de sang (`blood_moon`) : « Qui peut prendre, doit prendre. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Climat | Épique | 0 | Présage | 3 coups (vous, l'adversaire, vous) | 0 |

**Règle.** Annoncée, elle arrive au début de votre prochain tour. Pendant 3 coups, un joueur qui peut capturer doit
capturer. Il choisit la capture, prise en passant comprise. L'adversaire retrouve le premier sa liberté.

**Précisions.** On regarde les coups légaux : s'il y en a au moins un qui capture, seuls ceux-là restent. En échec,
si une parade par capture existe, elle est obligatoire (au choix parmi les captures légales).

*Après relecture :* lancée avant le coup du lanceur, la carte imposait un mat sans décision. Exemple : Blancs Rg1, Te1,
Ff3, pions a2 b2 f2 g2 h2 ; Noirs Rg8, Td8, Fc8, pions a7 b6 f7 g7 h7. Les Blancs lancent la Lune, jouent 1.Fd5 ;
1...Txd5 est forcé, puis 2.Te8#. Avec le Présage, les Noirs voient l'appât un coup à l'avance et le refusent, comme
aux échecs ordinaires (1...Txd5 2.Te8# y est déjà mat) : 1...h6, par exemple. La Lune arrivée, c'est le lanceur qui
est contraint le premier : sa seule capture est 2.Fxf7+, qui donne le fou contre un pion **(vérifié)**. Avec 3 coups,
le dernier coup libre revient à l'adversaire.

**Pourquoi c'est stratégique.** C'est la carte du sacrifice forcé, empruntée aux dames et au « qui perd gagne ».
- *Quand la jouer :* les captures forcées des trois prochains coups vous arrangent : vos propres captures obligatoires
  seront des reprises saines, et les pièces adverses sont surchargées (un défenseur forcé de prendre quitte sa case).
- *Quand elle se retourne :* vous êtes le premier contraint. La réponse adverse au Présage peut vous tendre un appât
  empoisonné, et c'est l'adversaire qui joue librement le premier à la fin. Il faut compter les captures des deux
  camps.
- *Contre-jeu :* pendant le Présage, désamorcer les appâts, en poser un. Remplacer la Lune ne sert à rien : un Climat
  annoncé pendant la Lune arriverait après son dernier coup.

**Interactions délicates.**
- Mat, pat : l'obligation retire seulement les coups sans capture quand il existe une capture ; elle ne vide jamais la
  liste des coups. La carte ne crée donc ni mat ni pat.
- Roque : impossible tant qu'une capture est disponible.
- Prise en passant : c'est une capture ; si c'est la seule, elle est obligatoire.
- Promotion : une capture avec promotion compte comme une capture ; la pièce choisie reste libre.
- Déjà-vu : **un seul filtre, au même endroit** : on retire d'abord la pièce interdite, puis on applique l'obligation
  sur ce qui reste. Si le coup effacé était la seule capture, les coups calmes redeviennent jouables.
- Expiration : après votre 2e coup sous la Lune.

**Moteur.**
- `Mods.mustCapture: boolean`. Fonction `applyMustCapture(moves)` : `moves.some(isCapture) ? moves.filter(isCapture) : moves`.
- `chess.ts`, `legalMoves` **ne connaît pas** `mustCapture`. `game.ts`, `legalMovesOf` fait, dans cet ordre :
  `legalMoves` → retrait de la pièce interdite → `applyMustCapture` → repli R6. `hasLegal` reste cohérent : le filtre,
  appliqué après le retrait, ne vide jamais la liste. (La version 1 appliquait le filtre deux fois, dont une avant le
  retrait : un joueur pouvait se retrouver sans aucun coup jouable alors que le moteur lui en voyait.)
- `bot.ts` : la recherche applique `applyMustCapture` à chaque nœud. En quiescence, si `mustCapture` et qu'une capture
  légale existe, pas d'« immobilité » (stand pat) : on n'évalue que les captures. Sans cela, l'IA croit que
  l'adversaire peut refuser l'appât.
- Client : halo rouge sur les pièces qui doivent prendre et ombre rouge sur leurs cibles ; pendant la confirmation et
  le Présage, les captures qui seraient forcées pour **chaque** camp s'affichent en fantôme.

**Mise en scène.**
- *Présage :* un croissant rouge pointe à l'horizon derrière le plateau, côté lanceur ; un battement de cœur grave.
- *Arrivée :* le ciel vire au cramoisi ; la lune rouge (sphère et halo) se lève en entier ; trois battements de cœur,
  chacun lance un anneau rouge (`shockwave`) depuis le centre.
- *Pendant :* un vignettage rouge respire (opacité 0,15 à 0,3, toutes les 1,5 s) ; des braises rouges montent ; les
  pièces contraintes ont un liseré rouge qui pulse.
- *Fin :* la lune se couche ; le rouge se retire du centre vers les bords.

### 3.4 Ère glaciaire (`ice_age`) : « Le front se fige. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Climat | Rare | 0 | Présage | 4 coups (2 chacun) | 222 |

**Règle.** Annoncée, elle arrive au début de votre prochain tour. Pendant 4 coups, tous les pions des deux camps sont
gelés : ils ne bougent pas et ne capturent pas. Un roi ne peut toujours pas se placer sur une case qu'attaque un pion
adverse.

**Précisions.** Un pion gelé reste un obstacle et peut être capturé. Une pièce défendue seulement par un pion peut
être prise par une autre pièce sans reprise possible, mais pas par le roi.

*Après relecture :*
- **Présage et rareté.** Lancée avant le coup, la carte gagnait une pièce au 6e coup d'une Sicilienne
  (1.e4 c5 2.Cf3 Cc6 3.d4 cxd4 4.Cxd4 Cf6 5.Cc3 d6, Ère glaciaire, 6.Cxc6 : b7 est gelé, et le cavalier attaque en
  plus d8). Avec le Présage, les Noirs ont un coup pour parer (…Fd7, …Cxd4). La carte passe de Commune à Rare.
- **Les pions gelés gardent leurs cases contre le roi.** Un roi pouvait se coller à un pion adverse gelé. Tout Climat
  qui remplaçait l'Ère glaciaire dégelait alors ce pion et mettait le roi en échec : le remplacement devenait
  interdit. Au dégel, le roi se trouvait en échec par un pion encore pris dans la glace, ce qui était illisible.
  Désormais, aucun pion gelé ne peut donner échec, et l'Ère glaciaire n'est jamais verrouillée.

**Pourquoi c'est stratégique.**
- *Quand la jouer :* les pièces adverses ne sont défendues que par des pions ; votre jeu repose sur les pièces, le sien
  sur la chaîne de pions ; ses pions marchent sur votre roi, et le gel met l'assaut en pause.
- *Quand elle se retourne :* vos pièces défendues par des pions deviennent des cibles, et les cases que vos pions ne
  disputent plus (f3, g4 devant votre roque) accueillent ses cavaliers. Vous jouez le premier au dégel, mais
  l'adversaire a le dernier coup gelé pour parer les fourchettes de pion.
- *Contre-jeu :* pendant le Présage, protéger autrement les pièces tenues par des pions ; pendant le gel, occuper les
  avant-postes.

**Interactions délicates.**
- Échec : un pion gelé ne peut jamais donner échec, puisqu'un roi ne peut pas venir sur une case qu'il attaque.
- Mat : toujours possible avec les pièces.
- Blocage : si un camp n'a plus que des coups de pion, la magie cède (R6) : il joue un coup de pion. Exemples vérifiés
  en R6.
- Roque : les cases attaquées par des pions l'empêchent toujours (même règle que pour le roi).
- Prise en passant : impossible pendant le gel ; un droit ouvert à l'arrivée est perdu.
- Promotion : aucune (les pions ne bougent pas).
- Règle des 50 coups : compteur figé (aucun coup de pion n'est possible).
- Grande Marée : n'emporte pas les pions gelés, donc injouable pendant l'Ère glaciaire.
- Expiration : après le 2e coup adverse ; vous jouez le premier coup du dégel.

**Moteur.**
- `Mods.pawnsFrozen: boolean`.
- `chess.ts`, `pseudoMoves` : ignorer les pions. **`isAttacked` ne change pas** : c'est ce qui garde les cases des
  pions contre le roi et pour le roque.
- `game.ts`, `playMove` : compteur des 50 coups figé quand `modsNow.pawnsFrozen`.
- `Board.tsx` : classe « gelé » sur tous les pions ; fines marques de givre sur les cases qu'ils interdisent aux rois.

**Mise en scène.**
- *Présage :* le givre gagne le cadre depuis les coins du lanceur ; la buée des pièces devient visible ; un vent froid.
- *Arrivée :* le givre envahit les cases (voile en shader, masque de bruit qui grandit) ; une neige oblique traverse
  le plateau ; chaque pion se fait enfermer dans un bloc de glace (`iceCube` à 0,8, en cascade de la colonne a à la
  colonne h, un craquement par colonne).
- *Ciel :* aurore boréale bleu acier.
- *Pendant :* neige légère (150 particules au plus), blocs de glace sur les pions, marques de givre en diagonale
  devant eux.
- *Fin :* les blocs éclatent en vague (`shatter`, 40 ms de décalage par colonne) ; le givre se retire vers les coins.

### 3.5 Couronnement (`coronation`) : « La septième rangée suffit. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Climat | Épique | 0 | Présage | 4 coups (2 chacun) | 48 |

**Règle.** Annoncé, il arrive au début de votre prochain tour. Pendant 4 coups, un pion qui arrive sur sa 7e rangée
est promu immédiatement (dame, tour, fou ou cavalier, au choix).

**Précisions.** Valable pour la poussée et la capture. La prise en passant arrive sur la 6e rangée : elle ne couronne
jamais. Un pion déjà sur sa 7e rangée se promeut normalement en avançant. Un pion déplacé par la Grande Marée n'est
jamais promu.

*Après relecture :* en 6e rangée et sans délai, la carte donnait une dame immédiate. Exemple : Blancs Rf1, Fe4, pions
d5 f2 g2 h2 ; Noirs Rg8, Cb6, pions f7 g7 h7. Couronnement, puis 1.d6=D. Le Présage seul ne suffit pas : depuis b6,
le cavalier ne peut pas atteindre d6 en un coup, et …Cxd5 perd la pièce. En 7e rangée, les Noirs ont le temps :
d6, puis …Cd7 bloque. En milieu de partie, la 6e rangée faisait de chaque « exf6 » une dame. La 7e rangée réserve
la carte aux finales et aux pions passés, et supprime le cas de la prise en passant qui couronne.

**Pourquoi c'est stratégique.**
- *Quand la jouer :* vous avez un pion sur votre 6e rangée, ou sur la 5e avec la voie libre pour deux coups, et
  l'adversaire n'en a pas.
- *Quand elle se retourne :* les pions adverses couronnent aussi, avec autant de coups que les vôtres. Un pion adverse
  sur sa 6e rangée qui peut capturer une pièce posée sur votre 2e rangée couronne en capturant.
- *Contre-jeu :* pendant le Présage, bloquer la case de couronnement ou attaquer le pion ; préparer son propre
  couronnement.

**Interactions délicates.**
- Échec : la carte ne change pas le plateau, donc ne peut pas donner échec. Une promotion peut donner échec : c'est
  un coup ordinaire.
- Promotion ordinaire en 8e rangée : inchangée.
- Expiration : les pièces promues restent ; les pions non promus restent des pions.
- Déjà-vu : une pièce promue pendant le tour effacé redevient un pion.

**Moteur.**
- `Mods.crown: boolean`.
- `chess.ts`, `pseudoMoves` (pions) : `const promote = r1 === last || (mods.crown && rel(r1) === 6)` avec
  `rel(r) = us === 'w' ? r : 7 - r`, passé à `pushPawnMove`. La prise en passant ne change pas.
- Notation : `e7=D`. IA : rien (génération de coups).
- Client : le sélecteur de promotion (`PromotionPicker`, `Board.tsx`) s'ancre aujourd'hui au bord du plateau. Il doit
  s'ancrer sur la case d'arrivée et s'ouvrir vers le centre, pour toutes les promotions.

**Mise en scène.**
- *Présage :* deux fils d'or se tendent sur les rangées 2 et 7 ; une couronne scintille au-dessus des pions capables
  de les atteindre.
- *Arrivée :* lever de soleil doré ; deux bandes de lumière balaient le plateau depuis les bords et se posent sur les
  fils, qui deviennent les « lignes de couronnement ».
- *Ciel :* aube dorée.
- *Pendant :* les lignes vibrent doucement, une poussière d'or monte. À chaque couronnement : colonne de lumière
  (`beam`, reprise de la Résurrection), éclat de couronne, flash, accord majeur.
- *Fin :* les lignes s'éteignent des bords vers le centre.

### 3.6 Déflagration (`blast`) : « Chaque prise fait sauter le quartier. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Climat | Légendaire | 0 | Présage | 4 coups (2 chacun) | 25 |

**Règle.** Annoncée, elle arrive au début de votre prochain tour. Pendant 4 coups, toute capture faite par une autre
pièce qu'un roi explose sur la case d'arrivée. La pièce qui capture est détruite avec sa victime, ainsi que toutes les
pièces des 8 cases voisines, des deux camps, sauf les pions et les rois, qui résistent au souffle. **Un roi capture
normalement, sans explosion.**

**Précisions.**
- Un pion qui capture explose (c'est la pièce qui capture) ; un pion capturé disparaît (c'est la victime) ; un pion
  voisin survit.
- Prise en passant : explosion centrée sur la case d'arrivée du pion.
- Capture qui atteindrait la dernière rangée : un seul coup, sans choix de promotion, puisque le pion explose
  (notation `bxc8*`).
- Toutes les pièces détruites rejoignent les pièces capturées de leur camp.

C'est la variante « atomique » des échecs, limitée à quatre coups, sans danger pour les rois.

*Après relecture :*
- **Le roi ne fait plus exploser.** Avec « un roi qui capture survit », le roi devenait une bombe gratuite. Exemple :
  Blancs Rf1 ; Noirs Te2, Dd3, Rg8. Rxe2 est illégal aux échecs **(vérifié)**, mais il devenait légal, puisque
  l'explosion détruisait la dame qui défend e2. Le mat De7-g7 soutenu par Fh6 disparaissait aussi (Rxg7 faisait sauter
  h6). Désormais, le roi capture comme aux échecs : jamais une pièce défendue.
- **Présage.** La première détonation, avantage décisif connu des échecs atomiques, revenait au lanceur sans
  préavis. L'adversaire a désormais un coup pour disperser ses pièces.

**Pourquoi c'est stratégique.**
- *Quand la jouer :* une de vos captures fera sauter plus de valeur adverse que la vôtre (un cavalier prend un pion
  collé à la dame et à une tour adverses) ; les pièces adverses sont groupées autour du roque et ne pourront pas toutes
  s'écarter en un coup ; les vôtres sont dispersées.
- *Quand elle se retourne :* vos pièces groupées sont des cibles ; un échange normal devient un double sacrifice ;
  l'adversaire détone autant de fois que vous.
- *Contre-jeu :* disperser ses pièces pendant le Présage ; menacer une détonation plus rentable.

**Interactions délicates.**
- Échec : les rois ne sautent jamais, l'échec se lit normalement. Une capture dont l'explosion détruit un de vos
  défenseurs et expose votre roi est illégale (vérifiée comme tout coup). Une explosion qui emporte une pièce adverse
  placée sur une ligne peut découvrir un échec : c'est le coup qui le donne, c'est donc permis.
- Mat : possible, notamment par découverte. Pat : une explosion change réellement le plateau. Si l'adversaire n'a plus
  de coup sans être en échec, c'est un vrai pat : la Déflagration ne retire aucun coup, donc R6 ne s'applique pas.
- Roque : une tour détruite sur sa case de départ perd son droit de roque.
- 50 coups : remis à zéro par chaque capture. Matériel insuffisant : évalué après chaque coup (les explosions peuvent
  vider le plateau et mener à la nulle).
- Déjà-vu : toutes les pièces reviennent.
- Expiration : après le 2e coup adverse.

**Moteur.**
- `Mods.blast: boolean`. Nouveau drapeau `F_BLAST = 256`, posé par `pseudoMoves` sur toute capture **qui n'est pas un
  coup de roi** quand `mods.blast` : le coup sait qu'il explose, et `makeMove` n'a pas besoin des modificateurs. Une
  capture de pion vers la dernière rangée produit un seul coup `F_CAPTURE | F_BLAST`, sans `F_PROMO`.
- `makeMove` : après la capture, retirer la pièce qui capture et les voisines qui ne sont ni pions ni rois ;
  `Undo.blasted: { sq: number; piece: Piece }[]` ; effacer les droits de roque des tours détruites sur leur case de
  départ (`ROOK_HOME_BITS`). `unmakeMove` : tout remettre en place.
- `game.ts`, `playMove` : ajouter chaque pièce détruite à `captured` ; `MoveInfo.blasted: number[]` (identifiants)
  pour l'animation.
- Notation : suffixe `*` (ex. `Cxe5*`). IA : rien de plus, la recherche joue les coups avec `makeMove`.

**Mise en scène.**
- *Présage :* une mèche s'allume dans le coin du cadre côté lanceur et commence à brûler.
- *Arrivée :* la mèche fait le tour de l'échiquier dans une gerbe d'étincelles ; toutes les pièces prennent une lueur
  orange intérieure, comme chargées.
- *Ciel :* cendre et braise.
- *Pendant :* des cendres tombent ; un léger miroitement de chaleur flotte sur le plateau (voile en shader) ; la mèche
  continue de brûler sur le cadre et sert de compteur.
- *À chaque capture :* boule de feu (`burst` de 160 particules et `shockwave` d'un rayon de 1,6 case, qui couvre le
  carré 3 × 3), traces de brûlure (`scorch`) sur les 9 cases, pièces détruites projetées (DOM : `transform` et
  `opacity`), forte secousse, flash. Une capture par un roi ne produit qu'une étincelle.
- *Fin :* la mèche s'éteint dans un panache de fumée.

### 3.7 Chevauchée (`cavalcade`) : « Toutes les lignes ont des sabots. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Climat | Rare | 0 | Présage | 2 coups (vous, puis l'adversaire) | 130 |

**Règle.** Annoncée, elle arrive au début de votre prochain tour. Pendant 2 coups (le vôtre, puis la réponse
adverse), les tours, fous et dames des deux camps peuvent aussi se déplacer et capturer comme un cavalier.

**Précisions.** Le saut ignore les pièces sur le chemin ; il ne peut pas arriver sur un Mur ou sur une case du
gouffre. Un saut qui s'arrête sur un portail ouvert peut l'emprunter. Rien ne change pour les cavaliers, les pions et
les rois.

*Après relecture :* la carte est passée au Présage comme tous les Climats. L'un des vérificateurs craignait surtout
l'inverse d'un abus : un joueur occasionnel ne peut pas vérifier de tête une quarantaine de sauts adverses. D'où
l'affichage des sauts possibles des deux camps pendant le Présage et la confirmation.

**Pourquoi c'est stratégique.** Chaque camp aura exactement un coup avec ce pouvoir : vous d'abord, l'adversaire
ensuite, qui répond en connaissant votre coup. Vos sauts *menacés* ne comptent pas (l'effet aura expiré avant votre
coup suivant) ; seul un saut *joué* compte. En revanche, les sauts de l'adversaire menacent vraiment votre position
pendant sa réponse.
- *Quand la jouer :* une de vos pièces longues pourra, en sautant, prendre une pièce ou faire une fourchette
  impossible autrement, et l'adversaire ne pourra pas tout parer en un coup pendant le Présage.
- *Quand elle se retourne :* après votre saut, votre roi et vos pièces doivent être à l'abri des sauts adverses ;
  une dame adverse à un saut de votre roi devient un danger immédiat.
- *Contre-jeu :* pendant le Présage, retirer les cibles et garder les cases d'arrivée ; répondre par un saut.

**Interactions délicates.**
- Échec : la carte est refusée si, dans la position actuelle et Chevauchée arrivée, une de vos pièces longues pouvait
  prendre le roi adverse par un saut (R4a). Si votre coup du Présage crée une telle attaque, c'est un « échec à
  l'arrivée » (R5) : l'adversaire doit le parer par sa réponse. Après votre saut, votre roi doit être à l'abri des
  sauts adverses (`modsAfter` contient encore l'effet). Après la réponse adverse, l'effet a expiré : un « échec par
  saut » n'existe plus.
- Roque : impossible si le roi part d'une case, ou passe par une case, qu'une pièce adverse pourra attaquer en sautant
  à son prochain coup. Suivant R5, `castleMoves` doit tester les attaques avec `modsAfter` (il reçoit aujourd'hui
  `modsNow`).
- Faille : seuls les sauts la franchissent. Portails : un saut peut s'arrêter sur un portail et ressortir.
- Déjà-vu : restaure. Expiration : après la réponse adverse.

**Moteur.**
- `Mods.leapAll: boolean` (remplace l'ensemble `leap` par pièce, qui disparaît avec le Saut du cavalier).
- `chess.ts`, `pseudoMoves` (pièces longues) : `if (mods.leapAll) jumpMoves(pos, mods, from, KNIGHT, out, F_LEAP)`.
- `isAttacked`, boucle des cavaliers : accepter aussi `mods.leapAll && isSlider(p.t)`. Aujourd'hui `isAttacked` ignore
  les sauts, ce qui ne posait pas de problème tant que le saut expirait avant le coup adverse ; ce n'est plus le cas.
- `Board.tsx` : marquer toutes les pièces longues (rendu actuel de `leap`) ; arcs en L des sauts possibles des deux
  camps pendant le Présage et la confirmation.
- Levier de réglage : si les parties IA contre IA donnent moins de 50 % de victoires au lanceur, passer à 3 coups
  (vous, l'adversaire, vous).

**Mise en scène.**
- *Présage :* un grondement de sabots lointain ; de la poussière se lève au bord du plateau côté lanceur ; des arcs en
  L fantômes partent de chaque pièce longue des deux camps.
- *Arrivée :* des chevaux spectraux faits de particules traversent l'échiquier au galop (deux ou trois longues
  trajectoires en arc) ; les arcs fantômes deviennent pleins.
- *Ciel :* nuit d'orage, éclairs lointains.
- *Pendant :* une crinière de lumière flotte au-dessus des pièces longues ; un peu de poussière au sol.
- *Fin :* une dernière cavalcade sort par un bord du plateau.

### 3.8 Mur de glace (`ice_wall`), conservé : « Ici, personne ne passe. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Terrain | Commune | 1 case vide | Tout de suite | 6 coups (3 chacun, comme aujourd'hui) | 205 |

**Règle.** Une case vide devient infranchissable pour les deux camps : aucune pièce ne peut s'y arrêter ni la
traverser. Un cavalier peut sauter par-dessus.

**Pourquoi c'est stratégique.** Couper une diagonale ou une colonne (contre un clouage, une batterie, un mat du
couloir), boucher une case de fuite pour mater, arrêter un pion passé. Le mur gêne aussi vos propres lignes. L'heure
de la fonte est connue de tous : l'adversaire peut s'y préparer.

**Interactions délicates** (déjà couvertes par les tests). Le roque est bloqué si une case du trajet est murée. La
carte peut sauver du mat (elle coupe la ligne d'un échec). Un mur qui fond ne peut pas exposer le roi de celui qui
joue ; l'interface affiche « échec à la fonte » quand le roi adverse sera attaqué une fois le mur fondu (R5). Si la
case de prise en passant est murée, pas de prise en passant. Pas de mur sur une Faille ni sur un Portail. Si un camp
n'a plus aucun coup à cause des murs, la magie cède (R6) et la glace de la case où il s'arrête fond. Déjà-vu restaure.

**Moteur.** Déjà en place (`Mods.blocked`). À changer : décompte global (R2), libellé « pour les deux camps »,
`rawCandidates` exclut les cases qui portent déjà un Terrain.

**Mise en scène.** Celle d'aujourd'hui (amas de cristaux). Un Terrain ne change pas le ciel : seulement un léger givre
sur les 8 cases voisines. À la fonte : goutte, craquement, flaque qui s'évapore.

### 3.9 Faille (`rift`) : « Le plateau se fend en deux. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Terrain | Commune | 1 case de la 4e ou de la 5e rangée (elle désigne sa rangée) | Tout de suite | 4 coups (2 chacun) | 285 |

**Règle.** Choisissez la 4e ou la 5e rangée, les deux rangées centrales. Pendant 4 coups, toutes ses cases vides
deviennent un gouffre : aucune pièce ne peut s'y arrêter ni le traverser. Les cavaliers (et les sauts de la
Chevauchée) passent par-dessus.

**Précisions.** Les cases occupées au lancement restent des îlots normaux : leurs pièces bougent librement, et la case
reste normale après leur départ. Les cases du gouffre sont fixées au lancement. Une case qui porte déjà un Terrain
n'en fait pas partie. Une seule Faille à la fois.

*Après relecture :* les rangées 3 et 6 sont retirées. **(vérifié)** Une Faille en 6e rangée, lancée par les Blancs
avant 1.e4, laissait les Noirs sans aucun coup : tous leurs pions et leurs cavaliers étaient enfermés. En 3e rangée,
elle enfermait de même le développement blanc. Une règle « symétrique » qui n'enferme qu'un camp ne l'est pas. Depuis
la position initiale, une Faille en 4e ou en 5e rangée laisse 12 coups au camp dont elle coupe le double pas, et 20 à
l'autre **(vérifié)**.

**Pourquoi c'est stratégique.**
- *Quand la jouer :* des pièces adverses sont passées dans votre camp et vous les coupez de leurs renforts (ou
  l'inverse : les vôtres sont déjà chez lui) ; vous fermez pour deux coups toutes les lignes d'attaque vers votre
  roi ; vous arrêtez un pion passé.
- *Quand elle se retourne :* la Faille coupe aussi vos lignes ; vos pièces restées de l'autre côté sont isolées.
- *Contre-jeu :* les cavaliers, les îlots, et l'heure de fermeture, connue.

**Interactions délicates.**
- Échec : un gouffre ne fait que couper des lignes, la carte ne peut donc pas donner échec. Elle peut en parer un, et
  donc sauver d'un mat.
- Blocage : la magie cède (R6) ; une pièce qui s'arrête dans le gouffre y pose un pont, et la case redevient normale.
- Roque : jamais touché.
- Prise en passant : pas de double pas à travers le gouffre (`pseudoMoves` vérifie déjà la case traversée) ni de prise
  en passant sur une case du gouffre.
- Mur, Portails : pas de superposition.
- Expiration : après le 2e coup adverse ; celui qui joue ce coup ne peut plus compter sur la Faille pour couvrir son
  roi (R4d). L'interface affiche « échec à la fermeture » le cas échéant.

**Moteur.**
- `Effect.squares?: number[]` (nouveau champ) ; `modsFromEffects` : `for (const q of e.squares) mods.blocked[q] = true`.
- `rawCandidates` : cases des rangées d'index 3 et 4 dont la rangée contient au moins une case vide sans Terrain, et
  aucune Faille active. `applyCardRaw` calcule `squares`.
- `positionKey` : inclure `squares`.
- `Board.tsx` : classe `rift` sur ces cases.
- `VfxStage.syncMarkers` : accepter les marqueurs multicases (`e.square ?? e.squares?.[0]`, objet positionné en
  coordonnées absolues, recréé quand l'orientation change).

**Mise en scène.**
- *Lancement :* longue secousse ; une fissure lumineuse zigzague d'un bord à l'autre de la rangée (`lightningPath`
  couché sur le plateau, cœur sombre, liseré aux couleurs du skin) ; les cases vides s'ouvrent : les dalles
  s'enfoncent (échelle en z), le gouffre noir s'éclaire sur ses bords, des débris tombent.
- *Pendant :* une lueur pulse au fond (magma ou néant selon le skin) ; braises ou fumées montent ; un grondement grave,
  très bas.
- *Fin :* grondement ; les dalles remontent ; nuage de poussière.

### 3.10 Portails (`portals`) : « Ici, et là-bas. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Terrain | Rare | 1 case vide des rangées 3 à 6 ; la seconde est son symétrique | Présage | 6 coups (3 chacun) | 255 |

**Règle.** Choisissez une case vide entre la 3e et la 6e rangée. Son symétrique par rapport au centre de l'échiquier
devient l'autre portail (c3 ⇄ f6, b4 ⇄ g5, d3 ⇄ e6). Les portails s'ouvrent au début de votre prochain tour et
restent ouverts 6 coups. Un cavalier, un fou, une tour ou une dame, de l'un ou l'autre camp, qui s'arrête sur un
portail peut ressortir aussitôt par l'autre, si celui-ci est libre.

**Précisions.**
- Passer un portail n'est jamais une capture : la sortie doit être libre.
- Toute pièce peut s'arrêter sur un portail sans voyager. Les rois et les pions ne voyagent jamais : ils s'y arrêtent
  comme sur une case ordinaire.
- Un portail occupé ferme la paire : on ne voyage que si les deux portails sont libres.
- Les portails ne bloquent rien : une pièce longue passe par-dessus sans les emprunter.
- Au lancement, les deux cases doivent être vides et aucune ne doit toucher un roi (8 cases voisines).
- Une seule paire de Portails à la fois.

*Après relecture :* la première version laissait le lanceur choisir deux cases libres, puis voyager aussitôt.
Exemple : Blancs Rg1, De2 ; Noirs Rg8, pions f7 g7 h7 ; Portails d3 ⇄ e8, puis De2-d3 → e8#. C'était une
téléportation réservée au lanceur, la carte la moins globale du catalogue. Le portail libre interdit au roi servait
en plus de mur pour fermer une case de fuite. Désormais :
- **Cases symétriques :** chaque camp a une entrée dans sa moitié, vers la moitié adverse ; la symétrie centrale
  conserve la couleur des cases.
- **Présage :** l'adversaire a un coup pour garder ou occuper la sortie.
- **Rois et pions :** ils s'arrêtent sur un portail, qui n'est plus jamais un mur.
- **Une seule paire à la fois :** la version 1 ne savait pas gérer deux paires simultanées.

Une règle « un passage ne peut pas donner échec » a été envisagée puis écartée, parce qu'elle est arbitraire et que
le Présage et la symétrie suffisent.

**Pourquoi c'est stratégique.** Un raccourci pour les deux armées : votre entrée mène chez lui, la sienne chez vous.
- *Quand la jouer :* vos pièces sont mieux placées que les siennes pour emprunter le raccourci, ou la moitié adverse
  autour de la sortie est mal défendue.
- *Quand elle se retourne :* l'adversaire emprunte le chemin dans l'autre sens ; pendant le Présage, il peut poser un
  pion ou son roi sur un portail pour fermer la paire.
- *Contre-jeu :* occuper un portail (la paire se ferme pour tout le monde), garder la sortie, emprunter le portail.

**Interactions délicates.**
- Échec : un portail ne crée ni ne coupe aucune ligne, et un passage n'est jamais une capture ; la carte ne peut donc
  pas donner échec. Un coup qui passe par un portail peut donner échec : c'est un coup ordinaire.
- Roque : jamais touché (rangées 3 à 6).
- Prise en passant, promotion : un pion s'arrête sur un portail comme ailleurs ; aucune promotion sur ces rangées.
- Chevauchée : un saut peut s'arrêter sur un portail et ressortir.
- Faille, Mur : pas de superposition.
- Expiration : une pièce posée sur une sortie y reste.
- Déjà-vu : restaure (y compris un Présage de Portails).

**Moteur.**
- `Mods.portals: [number, number] | null` (une seule paire, ouverte seulement).
- `Move.via?: number` et drapeau `F_PORTAL = 512`. Le coup est `{ from, to: sortie, via: entrée }` : **`makeMove` et
  `unmakeMove` ne changent pas**, puisque la pièce va de `from` à `to`.
- `jumpMoves` et `slideMoves` : quand une pièce N, B, R ou Q peut s'arrêter sur un portail et que l'autre est libre,
  émettre aussi le coup de passage, sauf si la sortie est déjà atteignable directement ; le rayon continue au-delà.
- `rawCandidates` : cases vides des rangées d'index 2 à 5 dont le symétrique `63 - i` est vide, sans Terrain sur
  aucune des deux, loin des deux rois, sans Portails déjà ouverts ou annoncés.
- Notation : `Td3→e6` (entrée, puis sortie). `MoveInfo.via` sert à l'animation.
- IA : 32 candidats au plus, aucune heuristique particulière.
- `Board.tsx` : deux marqueurs ; au survol d'une entrée, l'ombre de la pièce apparaît à la sortie.

**Mise en scène.**
- *Présage :* deux sceaux runiques se gravent sur les cases et tournent lentement, fermés ; un arc pointillé les relie.
- *Ouverture :* les sceaux s'ouvrent en vortex (`flourish` « vortex », plus un anneau dressé face à la caméra) ; l'arc
  devient un flux de lumière haut au-dessus du plateau (`arcStream`, hauteur 3).
- *Pendant :* les anneaux tournent et pulsent ; un fil de particules circule dans l'arc ; un portail occupé s'éteint.
- *Passage d'une pièce :* elle se dissout à l'entrée (opacité), une comète suit l'arc, elle se reforme à la sortie
  (crochets `hide`/`show` déjà utilisés par la Permutation).
- *Fin :* les vortex se referment en spirale.

### 3.11 Grande Marée (`tide`), Rituel : « La mer avance pour tout le monde. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Événement | Rare | 0 | Rituel : remplace votre coup | Instantané | 172 |

**Règle.** Rituel : la carte est votre coup. Tous les pions des deux camps qui sont sur leurs 2e à 5e rangées avancent
d'une case, si cette case est libre. C'est ensuite à l'adversaire de jouer.

**Précisions.**
- Tout se calcule sur la position d'avant la marée (déplacement simultané) : un pion bloqué par un pion qui avance
  reste sur place. Si deux pions adverses visent la même case, aucun ne bouge.
- Un pion n'avance pas sur un Mur ni sur une case du gouffre. Il peut s'arrêter sur un portail, qu'il ferme. Pas de
  double pas.
- Les pions des 6e et 7e rangées ne bougent pas : la marée ne couronne jamais.
- Après la marée : plus aucune prise en passant, et la règle des 50 coups repart à zéro.
- La marée ne peut pas mettre le roi adverse en échec (carte refusée), ni laisser le vôtre en échec (comme tout coup).
- Au moins un pion doit avancer.

*Après relecture :* lancée avant le coup, la marée laissait le lanceur prendre le premier les contacts qu'elle crée.
Exemple, dans l'Écossaise 1.e4 e5 2.Cf3 Cc6 3.d4 exd4 4.Cxd4 Cf6 5.Cc3 Fb4 : la marée crée a3 contre b4 et e5 contre
f6, et 6.axb4 gagnait une pièce. Devenue Rituel, la marée rend la main aux Noirs dans cette même position, et le pari
s'inverse **(vérifié)** : 6…Fxc3+ (d2 est vide, et aucune pièce blanche ne peut reprendre en c3) 7.Fd2 Fxd2+ 8.Dxd2
dxe5. Les Noirs gagnent une pièce, et leur pion e5 attaque en plus le cavalier d4. Le lanceur doit désormais compter
les contacts des deux camps.

**Pourquoi c'est stratégique.**
- *Quand la jouer :* la marée ouvre la position devant le roi adverse plus que devant le vôtre, libère vos pièces
  bloquées ou pousse votre pion passé, et les contacts créés vous restent favorables même si l'adversaire joue le
  premier.
- *Quand elle se retourne :* vous avez dépensé votre coup ; l'adversaire prend le premier ; le bouclier de votre roi
  s'effrite aussi.
- *Contre-jeu :* l'adversaire joue juste après : il exploite le premier les nouveaux contacts.

**Interactions délicates.**
- Échec : refusée si elle met le roi adverse en échec (R4a) ; illégale si elle laisse le vôtre en échec.
- Mat : comme coup, elle peut parer un échec (un pion s'interpose) et donc sauver d'un mat.
- Une seule carte par tour : on ne peut pas lancer une autre carte puis la Marée.
- Roque : droits conservés. Prise en passant : tout droit en cours est annulé. Promotion : jamais.
- Ère glaciaire : les pions gelés ne bougent pas (carte injouable). Couronnement : la marée ne couronne pas.
- Pendule : arrêtée avec incrément, comme après un coup ; la Marée compte comme un coup pour le démarrage de la partie
  (`d.started`) et pour le délai du premier coup.
- Déjà-vu : une Marée est un coup, que Déjà-vu peut effacer.

**Moteur.**
- `cards.ts` : `ritual: true`.
- `game.ts` : `applyCardRaw` calcule la marée sur une copie du plateau, puis l'applique (`pos.ep = -1`,
  `pos.halfmove = 0`, `info.pieces` = pions déplacés, `info.targets` = cases d'arrivée). Puis `playCard` termine le
  tour avec la fonction commune à `playMove`, `finishTurn(n, mover)` : instantané pour Déjà-vu, décompte des effets,
  `ply++`, `cardPlayed = false`, trait à l'adversaire, `fullmove` après un Rituel noir, clé de position,
  `evaluateEnd`.
- `server/games.ts` : `applyCard` gère déjà `turnChanges` ; pour un Rituel, `stopClock(room, color, true)`
  (avec incrément) et `d.started` comme dans `applyMove`.
- Aucun changement dans `chess.ts`.

**Mise en scène.**
- *Rituel :* l'échiquier s'incline ; deux vagues translucides (plans avec un shader d'écume) se lèvent derrière chaque
  rangée de départ et balaient le plateau l'une vers l'autre ; les pions glissent d'une case, portés par la vague
  (`transform`, 500 ms, décalés par colonne) ; les vagues se rencontrent au centre dans une gerbe d'embruns (`burst`
  bleu et blanc vers le haut) ; légère secousse, bruit de ressac.
- *Après :* reflet mouillé sur les cases, qui s'estompe en 2 s, pendant que l'adversaire réfléchit.

### 3.12 Déjà-vu (`deja_vu`) : « Tout ceci est déjà arrivé. »

| Famille | Rareté | Cibles | Arrivée | Durée | Teinte |
|---|---|---|---|---|---|
| Événement | Légendaire | 0 | Tout de suite | Instantané | 330 |

**Règle.** Le monde recule d'un tour : votre dernier coup et la réponse adverse sont annulés. Vous rejouez, **sans
pouvoir bouger la même pièce**.

**Précisions.**
- Jouable seulement si les deux derniers coups sont votre coup (ou votre Rituel), puis celui de l'adversaire.
- Position, effets (annoncés et actifs, avec leurs compteurs) et pièces capturées reviennent à leur état d'alors.
- Les cartes jouées par l'adversaire pendant le tour effacé lui sont rendues, face visible : elles restent connues.
  Les vôtres restent dépensées, y compris un Rituel effacé.
- Le temps que l'adversaire a passé sur le coup effacé lui est rendu ; le vôtre ne l'est pas.
- Déjà-vu compte comme la carte de ce tour.

*Après relecture :*
- **Une pièce interdite, pas un coup.** Interdire « le même coup » ne gênait pas : e8=T remplaçait e8=D, Ce5
  remplaçait Cg5.
- **Temps rendu à l'adversaire.** Son temps de réflexion sur le coup effacé (40 s en blitz) était perdu sans qu'il y
  puisse rien.
- **Fuite des mains corrigée.** Les instantanés ne gardent plus les mains : la version 1 les y mettait, et le serveur
  les envoyait à l'adversaire.
- **Lune de sang.** L'interaction passe par un filtre unique (voir 3.3).

**Pourquoi c'est stratégique.** Une seconde chance, en connaissant la réponse adverse.
- *Quand la jouer :* l'adversaire a trouvé une réfutation de votre dernier coup (fourchette, mat en préparation), ou
  vient de vous mater : Déjà-vu peut effacer un mat. Il faut trouver un autre plan avec une autre pièce.
- *Quand elle se retourne :* l'adversaire a vu votre plan lui aussi, et la carte ne sert qu'à réparer, jamais à
  attaquer.
- *Contre-jeu :* aucune parade directe, mais personne ne peut relancer un Déjà-vu juste après : l'historique est vidé.

**Interactions délicates.**
- Mat : si l'adversaire vient de mater, la partie continue tant que vous pouvez jouer Déjà-vu (règle « une carte peut
  sauver du mat », déjà en place pour Retour arrière).
- Effets : restaurés. Un Climat annoncé par l'adversaire pendant le tour effacé disparaît et sa carte lui revient.
- Roque, prise en passant : droits restaurés.
- Pièce interdite : si c'était votre seule pièce mobile, la carte est injouable. Après un Rituel effacé, aucune pièce
  n'est interdite.
- Lune de sang : la pièce interdite est retirée avant l'obligation de capture. R6 : la pièce interdite le reste
  aussi pour les coups de « la magie cède ».

**Moteur.**
- `Snapshot` gagne `used: { w: boolean[]; b: boolean[] }` (les drapeaux seulement) : l'identité des cartes ne change
  jamais, et `viewFor` envoie `state.snaps` tel quel. Ajouter un test : aucune vue envoyée à un joueur ne contient
  l'identifiant d'une carte adverse non jouée, ni dans `hands` ni dans `snaps`.
- `applyCardRaw`, cas `deja_vu` : A = `snaps[n-2]` (avec `A.pos.turn === color`), B = `snaps[n-1]` (avec
  `B.pos.turn === them`).
  - Restaurer `pos`, `effects`, `captured` et `ply` depuis A.
  - Cartes : `used[them]` revient à celui de A ; `used[color]` garde l'état actuel, plus Déjà-vu.
  - `cardPlayed = true` ; `keys = keys.slice(0, A.keysLen)` ; `snaps = snaps.slice(0, -2)`.
  - `forbidden = { from: A.next.from }`, ou `null` si A.next était un Rituel.
  - Marquer `undone` les deux coups du journal et les cartes jouées entre eux (`LogEntry` de carte gagne `undone?`).
- `MoveRef` interdit devient `{ from: number }` ; le filtre devient `m.from !== forbidden.from`.
- `server/games.ts` : garder, pour les deux derniers coups, la pendule de chaque camp au début du coup ; au Déjà-vu,
  remettre celle de l'adversaire à sa valeur au début du coup effacé.
- `info.targets = [B.to, B.from, A.to, A.from]` pour l'animation ; `validateAfterCard` comme pour `rewind`
  (`hasLegal`). La carte remplace `rewind`.

**Mise en scène.**
- *Lancement :* toute la scène se désature (calque gris dont on anime l'opacité) ; l'effet de parasites actuel
  (`vfx-rewind`) ; une horloge géante dont les aiguilles tournent à l'envers ; les deux coups se rejouent à l'envers en
  traînées fantômes (la pièce adverse d'abord, puis la vôtre) ; les pièces capturées réapparaissent en fondu ; la
  pièce interdite reste grise.
- *Fin :* les couleurs reviennent d'un coup, avec un petit flash.

---

## 4. Changements transversaux du moteur

### 4.1 Données (`src/shared/cards.ts`)

```ts
export type CardKind = 'climat' | 'terrain' | 'evenement';
export type CardId =
  | 'hourglass' | 'truce' | 'blood_moon' | 'ice_age' | 'coronation' | 'blast' | 'cavalcade'
  | 'ice_wall' | 'rift' | 'portals'
  | 'tide' | 'deja_vu';

export interface CardDef {
  // … champs actuels (name, tagline, description, targets, prompts, rarity, hue, timedOnly)
  kind: CardKind;
  /** Présage : l'effet arrive au début du tour suivant du lanceur (Climats, Portails). */
  presage?: boolean;
  /** Rituel : la carte remplace le coup (Grande Marée). */
  ritual?: boolean;
  /** Durée active, en coups (demi-coups) ; absente pour un Événement. */
  coups?: number;
  /** Exclue des parties contre l'IA (Sablier fou). */
  humanOnly?: boolean;
  // supprimés : turns, countsOnOpponent ; `duration` se déduit de `presage` et `coups`
}

export const RARITY_WEIGHT: Record<Rarity, number> = { commune: 4, rare: 3, épique: 2, légendaire: 1 };
```

### 4.2 Règles (`src/shared/game.ts`)

- **`Effect`** : supprimer `countsOn` et `pieceId` (plus aucun effet n'est attaché à une pièce : `dropOrphanEffects`
  devient inutile) ; ajouter `delay: number` (coups avant l'arrivée : 2 au lancement d'un Présage, 0 sinon) et
  `squares?: number[]`. `remaining` et `total` sont comptés en coups.
- **`modsFromEffects`** ignore les effets dont `delay > 0`. Le Climat annoncé n'a donc aucun effet avant son arrivée.
- **`tickEffects(effects)`** (paramètre `mover` supprimé), après chaque coup des deux camps :
  - un effet annoncé perd 1 de `delay` ;
  - quand `delay` atteint 0, l'effet arrive, et un Climat qui arrive retire le Climat actif ;
  - sinon, `remaining` perd 1 ; à 0, l'effet est retiré.

  `legalMovesOf` et `hasLegal` gardent leur logique `now`/`after`, qui couvre désormais les arrivées (R4d, R5) sans
  code supplémentaire.
- **`legalMovesOf`**, une seule chaîne pour tout le monde (client, serveur, IA à la racine) :
  1. `legalMoves(pos, now, after)` : Trêve, gel, sauts, portails, explosions ;
  2. retrait de la pièce interdite (Déjà-vu) ;
  3. `applyMustCapture` si `now.mustCapture` ;
  4. si la liste est vide et que le camp n'est pas en échec (R5) : coups de « la magie cède »,
     `legalMoves(pos, NO_MODS, after)` moins la pièce interdite, marqués `F_RELAXED = 1024`.

  `hasLegal` suit la même logique. `hasStrictLegal` s'arrête à l'étape 3 : c'est elle que `validateAfterCard` utilise
  pour R4b.
- **`validateAfterCard`** :
  - Présage : R4a se calcule sur la position actuelle avec l'effet déjà arrivé (copie des effets, `delay` mis à 0,
    Climat actif retiré).
  - R4b : refus si `!hasLegal(après)` (aucun coup, même avec R6 : c'est le cas d'un mat que la carte ne sauve pas),
    ou si `!hasStrictLegal(après)` alors que `hasStrictLegal(avant)` était vrai (la carte a elle-même bloqué son
    lanceur).
  - Annonce refusée si un Climat est déjà annoncé (R1).
- **Rituel** : `finishTurn(n, mover)` est extraite de `playMove` et partagée. Un Rituel passe par `playCard`, puis par
  `finishTurn`.
- **`playMove`** : compteur des 50 coups figé si `now.truce || now.pawnsFrozen`. Un coup `F_RELAXED` qui s'arrête sur
  une case bloquée retire cette case de son Terrain (le Mur fond, la Faille reçoit un pont).
- **`Snapshot`** : `used` au lieu des mains ; `next` accepte un Rituel (`from: -1`).
- **`sideInCheck(s, c)`** : `modsFromEffects(tickEffects(s.effects))` pour le camp au trait (R5). Même chose pour
  l'indicateur `check` de `playMove` (vu depuis le camp qui va jouer) et pour `evaluateEnd`. Nouvel indicateur
  `checkKind: 'now' | 'arrival' | 'melt'` pour l'affichage.
- **`evaluateEnd`** : sans coup strict, mais avec des coups de la magie cède, la partie continue. Sinon : carte qui
  sauve (R4c), puis mat si échec (R5), pat sinon. Aucune passe, donc rien à changer à `d.started`, à la pendule, au
  journal ni au protocole.
- **`dealHands(timed, mirror, vsBot, rand)`** : tirage pondéré sans remise (R9), recommencé si la main a plus d'une
  Légendaire ou plus de deux Climats ; filtre `timedOnly` et `humanOnly`.
- **`positionKey`** : retirer `countsOn` et `pieceId` ; ajouter `delay` et `squares`.
- **`insufficientMaterial`** et **`canStillMate`** : retirer la logique de Résurrection.
- **`describeCardPlay`** : Faille (« Faille, rangée 4 »), Portails (« Portails c3 ⇄ f6 »), Grande Marée, Déjà-vu.

### 4.3 Moteur d'échecs (`src/shared/chess.ts`)

```ts
export interface Mods {
  blocked: boolean[];                 // Mur de glace, Faille
  portals: [number, number] | null;   // Portails (une seule paire, ouverte)
  pawnsFrozen: boolean;               // Ère glaciaire (pseudoMoves seulement)
  leapAll: boolean;                   // Chevauchée
  truce: boolean;                     // Trêve
  mustCapture: boolean;               // Lune de sang (filtre appliqué par legalMovesOf et par l'IA)
  blast: boolean;                     // Déflagration
  crown: boolean;                     // Couronnement (7e rangée)
  range: Record<Color, number>;       // conservé (réserve : Pesanteur)
}
```

| Fonction | Changement |
|---|---|
| `pseudoMoves` | pions ignorés si `pawnsFrozen` ; promotion en 7e rangée si `crown` ; `F_BLAST` sur les captures qui ne sont pas des coups de roi si `blast` (sans promotion) ; sauts des pièces longues si `leapAll` ; coups de passage des portails ; reçoit aussi `modsAfter` pour le roque |
| `jumpMoves`, `slideMoves` | portails (`via`, `F_PORTAL`, le rayon continue, pas de doublon avec un coup direct) |
| `castleMoves` | attaques testées avec `modsAfter` (R5) |
| `isAttacked` | sauts des pièces longues si `leapAll`. **Inchangé** pour les pions gelés et les portails |
| `legalMoves`, `hasLegalMove` | filtre Trêve (captures seulement en échec) ; **pas** de filtre de capture obligatoire |
| `makeMove`, `unmakeMove` | explosions (`Undo.blasted`, droits de roque) ; rien pour les portails |
| `toSan` | `*` pour une explosion, `Td3→e6` pour un passage |

Nouveaux drapeaux : `F_BLAST = 256`, `F_PORTAL = 512`, `F_RELAXED = 1024`. Les tests perft (`test/chess.test.ts`)
tournent avec `NO_MODS` : ils doivent rester verts sans modification. C'est la garantie que les échecs classiques ne
bougent pas.

### 4.4 Serveur et IA

- `server/games.ts` :
  - pendule : `rate` passe par `clockRate` ; incrément suspendu sous le Sablier ; cinématiques créditées (R10) ;
  - Rituel : traité comme un coup (incrément, `d.started`, délai du premier coup) ;
  - Déjà-vu : temps de l'adversaire restauré.
- `viewFor` : rien à masquer dans `snaps`, qui ne contiennent plus les mains. Test de non-fuite (3.12).
- `dealHands` reçoit `vsBot`.
- **Parties sauvegardées** : les parties en cours enregistrées en base contiennent les anciens identifiants de carte.
  Au déploiement, soit attendre qu'aucune partie ne soit active, soit annuler à la restauration (`restoreRooms`) les
  parties qui contiennent une carte inconnue (`aborted`, sans effet sur l'Elo).
- `server/bot.ts` :
  - **Modificateurs par profondeur.** La classe `Search` reçoit une suite de modificateurs
    (`mods[k] = modsFromEffects(tickEffects^k(effects))`) au lieu d'un jeu fixe. Sans cela, l'IA croit qu'une
    Chevauchée ou une Trêve dure toute sa recherche, ou qu'un Climat annoncé n'arrivera jamais.
  - **Coups à chaque nœud :** `legalMoves(pos, mods[k], mods[k+1])`, puis `applyMustCapture`, puis le repli R6.
  - **Quiescence :** pas d'immobilité (stand pat) quand une capture est obligatoire ; aucune capture hors échec
    sous la Trêve.
  - **Choix de carte :** il reste générique (« jouer la carte, puis chercher ») ; l'IA ne reçoit jamais le Sablier.

### 4.5 Client

- `Board.tsx` : décorations de cases et de pièces :
  - sur le plateau : gouffre, sceaux puis vortex des Portails, pions gelés et cases qu'ils interdisent aux rois ;
  - sur les pièces : pièces longues qui sautent, captures obligatoires ;
  - signalements : coups de « la magie cède » (petit éclat), halo d'échec en pointillé pour un échec à l'arrivée ou à
    la fonte.
- `PromotionPicker` : ancré sur la case d'arrivée, ouvert vers le centre.
- **Confirmation d'une carte** (aperçu avant de valider), pour les deux camps :
  - Lune de sang : captures qui seraient forcées ;
  - Chevauchée : sauts possibles ;
  - Ère glaciaire : pièces qui perdraient leur défense de pion ;
  - Grande Marée : pions fantômes ;
  - Portails : case symétrique.
- `game/parts.tsx`, `EffectsList` :
  - bandeau « Climat » avec le Climat actif et, au-dessus, le Climat annoncé (« arrive dans 1 coup », pastilles
    creuses) ;
  - puis les Terrains.

  Les pastilles alternent les couleurs, pour qu'on voie à qui appartient chaque coup restant.
- `CardArt.tsx` : 12 emblèmes. `SpellCard.tsx` : pictogramme de famille (ciel, case, onde) et mot-clé « Présage » ou
  « Rituel ».
- `sound.ts` : un son par carte, et un son de présage distinct de celui de l'arrivée.
- `DemoBoard.tsx` : nouveaux ordres de démonstration ; des positions où chaque carte est jouable (Déjà-vu demande deux
  coups d'historique, le Couronnement des pions avancés) ; le Présage doit se voir dans la démo.
- `Rules.tsx` : textes de la section 2.
- `concepts/_shared/localGame.tsx` suivra sans changement (il passe par `CARD_IDS`).

### 4.6 Tests à écrire (`test/game.test.ts`, positions FEN comme aujourd'hui)

Les positions des relectures deviennent des tests de non-régression.

- **Présage :**
  - un Climat annoncé n'a aucun effet sur le coup du lanceur ni sur la réponse adverse, et arrive au tour suivant ;
  - il remplace le Climat actif à son arrivée ;
  - un second Climat annoncé est refusé ;
  - la réponse adverse doit mettre le roi à l'abri du monde qui arrive.
- **Durées :** la Trêve et la Lune durent 3 coups et l'adversaire reprend le premier ; les autres Climats durent un
  nombre pair de coups.
- **R4a :** une Chevauchée est refusée quand une pièce longue est à un saut du roi adverse ; un coup du Présage qui
  crée cette attaque donne un « échec à l'arrivée ».
- **R6 :**
  - Ère glaciaire, Rh1 g2 h2 contre Ce2 : g3, g4, h3, h4 jouables ;
  - Rf7 Ce5 contre Rh8 h7 : h6, h5 jouables ;
  - un vrai pat reste un pat ;
  - un mat aidé par un Mur reste un mat ;
  - le lanceur ne peut pas se bloquer lui-même (R4b).
- **Lune de sang :**
  - obligation de capturer, avec le choix de la capture ; prise en passant obligatoire si c'est la seule ; pas de
    roque ;
  - position de la relecture : après 1.Fd5 h6 et l'arrivée de la Lune, seul Fxf7+ est jouable ;
  - avec Déjà-vu : le coup effacé était la seule capture, et la liste des coups contient les coups calmes.
- **Non-fuite :** aucune vue ne contient une carte adverse non jouée (`hands`, `snaps`).
- **Faille :** rangées 4 et 5 seulement ; depuis la position initiale, 12 et 20 coups ; îlots ; double pas bloqué.
- **Déflagration :**
  - Rf1 contre Te2, Dd3 : Rxe2 refusé ;
  - voisins détruits, pions et rois épargnés ;
  - explosion qui exposerait son propre roi refusée ;
  - droit de roque perdu ;
  - capture vers la dernière rangée sans choix de promotion.
- **Couronnement :** promotion en 7e rangée ; la prise en passant ne couronne pas.
- **Trêve :** pas de capture hors échec ; capture de la pièce qui donne échec permise ; compteur des 50 coups figé.
- **Ère glaciaire :** un roi ne peut pas se placer sur une case attaquée par un pion gelé ; le remplacement par un
  autre Climat n'est jamais refusé.
- **Portails :**
  - symétrie, et refus au contact d'un roi ;
  - un roi ou un pion s'y arrête sans voyager et ferme la paire ;
  - un passage ne capture jamais ;
  - une seule paire ;
  - un passage peut parer un échec.
- **Grande Marée :**
  - le trait passe à l'adversaire ;
  - dans l'Écossaise citée, 6…Fxc3+ est légal ;
  - refusée si elle donne échec ;
  - simultanéité, conflit sur une même case.
- **Déjà-vu :**
  - restauration complète ;
  - même pièce interdite ;
  - cartes rendues à l'adversaire ;
  - un Rituel effacé reste dépensé ;
  - mat effacé ;
  - temps de l'adversaire rendu (test serveur).
- **Sablier fou :** absent du tirage contre l'IA ; ×2 pour les deux camps ; pas d'incrément.
- **Tirage :** jamais deux Légendaires ni trois Climats dans une main ; fréquences proches de la table R9.
- **IA :** sous la Lune de sang, la quiescence ne s'arrête pas sur une position où une capture est obligatoire.

## 5. Mise en scène globale : le système

Une carte globale doit transformer **tout l'écran de jeu**, pas une case. On ajoute à la scène actuelle (`VfxStage`)
cinq couches, de la plus lointaine à la plus proche :

| Couche | Technique | Rôle | Coût |
|---|---|---|---|
| **Ciel** | DOM/CSS derrière l'échiquier (`data-climat` sur la page de jeu) | Couleur et lumière du monde (aube, lune de sang, aurore, cendre…) | Fondus d'opacité entre calques préparés : quasi nul |
| **Front** | Bande du ciel suivant, côté lanceur, masquée par un dégradé (`transform` et `opacity` seulement) | Le Présage : le monde qui vient approche par le bord | Un calque de plus pendant 2 coups |
| **Voile** | WebGL, un plan 8 × 8 posé sur le plateau (un seul `ShaderMaterial`) | Teinte et matière des cases (givre, chaleur, or, reflet mouillé) | Un appel de dessin |
| **Météo** | Particules sur tout le plateau (système `Particles` existant, forme du skin) | Neige, braises, cendres, poussière d'or | 250 particules vivantes au plus |
| **Repères** | Marqueurs par case (`syncMarkers`) | Cristaux, gouffre, sceaux et portails, blocs de glace, lignes de couronnement, arcs de saut | Comme aujourd'hui |

Plus l'interface : bandeau de Climat (actif et annoncé), pendules (badge ×2, incrément barré), halo des pièces
concernées, aperçu de confirmation.

- **Cycle d'un Climat, en deux temps :**
  - *lancement* (0,6 à 0,8 s : la carte s'envole, un sceau se pose sur le cadre) ;
  - *présage* : le front s'installe au bord du plateau, côté lanceur, avec un son lointain ; discret mais lisible
    pendant le coup du lanceur et la réponse adverse ;
  - *arrivée* (cinématique de 1,2 à 2 s, hors pendule : inclinaison, flash, secousse, comme aujourd'hui) : le front
    balaie le plateau ;
  - *état persistant* ;
  - *sortie* (0,4 à 0,8 s).

  Quand un Climat en remplace un autre, l'ancien sort pendant que le nouveau entre : on voit le ciel basculer d'un
  bord à l'autre.
- **Terrain immédiat** (Mur, Faille) : lancement, état persistant, sortie. Les Portails suivent le cycle d'un Climat
  à l'échelle de deux cases (sceaux, puis vortex).
- **Rituel** : la cinématique tient lieu d'animation de coup ; l'adversaire voit le résultat se poser pendant que sa
  pendule est créditée (R10).
- **La magie cède** : sous la pièce qui bouge, un éclat bref (la glace craque, un pont de lumière enjambe le
  gouffre), pour qu'on comprenne pourquoi le coup était permis.
- **Nouvel objet de scène :** `VfxStage.syncClimate(effects, pos)`, sur le modèle de `syncMarkers` : un Climat actif
  et un Climat annoncé au plus, avec `presage`, `enter`, `update` et `exit`, fournis par
  `createClimate(stage, effect, skin)` dans `effects.ts`.
- **Performance :**
  - l'état persistant et le front passent par la cadence réduite déjà prévue pour les marqueurs (rendu toutes les
    45 ms quand rien d'autre ne bouge) ;
  - animations CSS limitées à `transform` et `opacity` ;
  - le ciel et le front restent en CSS, pour ne pas faire peindre tout l'écran par WebGL ;
  - aucune animation WebGL hors écran.
- **`prefers-reduced-motion` :** ciel, front et voile statiques, pas de météo ni de secousse, lancement et arrivée
  réduits à un fondu (le mode `reduced` actuel).
- **Skins :** toutes les couches prennent les couleurs, les formes de particules et les ornements du skin du lanceur
  (`SkinStyle.primary/secondary/accent/particle/flourish`). Une Lune de sang en Sakura fait tomber des pétales rouges ;
  une Faille en Néant s'ouvre sur du vide, en Inferno sur du magma.
- **Réemploi :**
  - `clockFace` : Sablier, Déjà-vu ;
  - `shieldDome` : Trêve ;
  - `iceCube` et `shatter` : Ère glaciaire ;
  - cristaux : Mur ;
  - `lightningPath` : Faille ;
  - `scorch` : Déflagration ;
  - `beam` : Couronnement ;
  - `arcStream` et `flourishDisk` « vortex » : Portails, Chevauchée ;
  - `vfx-rewind` : Déjà-vu.

## 6. Équilibrage et validation

- **Parties IA contre IA :** un script `test/selfplay.ts` fait jouer l'IA de niveau 2 contre elle-même : 200 parties
  par carte, la carte imposée dans une seule main, couleurs alternées.
  - *Taux de victoire du détenteur :* cible de 52 à 58 %. Au-delà, la carte décide trop ; en deçà, elle ne vaut rien.
  - *Autres mesures :* part des parties où la carte est jouée, coup moyen du lancement, fréquence des refus (R4a) et
    des coups de « la magie cède » (R6).
  - *Sablier fou :* mesuré entre humains seulement, puisqu'il est exclu des parties contre l'IA.
- **Positions de non-régression :** toutes les positions citées par les relectures (section 4.6) sont rejouées
  avant chaque changement de règle.
- **Leviers de réglage, dans l'ordre :** la durée, puis les conditions de lancement, puis la rareté (poids du tirage).
  Leviers déjà identifiés :

  | Carte | Si la carte est trop faible ou trop forte |
  |---|---|
  | Chevauchée | 2 → 3 coups si le lanceur gagne moins de 50 % |
  | Déflagration | version « kamikaze » (seules la pièce qui capture et sa victime disparaissent) si elle reste trop chaotique |
  | Couronnement | retour à la 6e rangée seulement si elle est trop faible |
  | Sablier fou | incréments rétablis si l'effet est trop dur |
- **En production :** journaliser par carte le taux de lancement et le taux de victoire du lanceur (page `/admin`).

## 7. Réserve (écartées pour cette version)

| Idée | Règle | Pourquoi pas maintenant |
|---|---|---|
| **Double temps** | Pendant un tour, chaque camp joue deux coups d'affilée (l'adversaire d'abord) ; un échec au premier coup annule le second (règle des échecs marseillais) | L'« accélération » la plus spectaculaire, mais le trait n'alterne plus : pendules, `snaps`, IA, protocole à revoir. Bonne Légendaire pour une V2. |
| **Pesanteur** | Portée des pièces longues limitée à 3 cases pour tous | Fait doublon avec la Faille et le Mur. Facile : `Mods.range` existe déjà. |
| **Brouillard** | Chacun ne voit que les cases que ses pièces contrôlent | Le serveur devrait masquer la position et envoyer les coups légaux : chantier lourd. |
| **Spectres** | Toutes les pièces longues traversent leurs propres pièces | `isAttacked` devient complexe (rayons qui traversent un camp et pas l'autre). |
| **Sanctuaire** | Aucune capture dans une zone de 3 × 3 cases | Fait doublon avec la Trêve. |
| **Contre-courant** | Pions des échecs Berolina : ils avancent en diagonale et capturent tout droit | Très original, mais lourd à lire pour un joueur occasionnel. |
| **Ressac** | Tous les pions reculent d'une case (Rituel) | Miroir de la Grande Marée ; à garder si la Marée plaît. |
| **Tourbillon** | Les pièces d'un carré de 3 × 3 cases tournent d'un quart de tour | Trop ciblé, presque unilatéral. |
| **Passe** (ancienne R6) | Un camp bloqué par un effet passe son tour | Écartée : elle offrait deux coups d'affilée à l'adversaire, donc le Double temps par la petite porte. |
| **Remplacer un Climat coûte le coup** | La carte de remplacement tient lieu de coup | Écartée : le Présage rend déjà le remplacement non immédiat, sans ajouter une seconde exception à R3. |
| **Pas d'échec par passage de portail** | Un passage ne peut pas donner échec | Écartée : règle arbitraire ; le Présage, la symétrie et la distance aux rois suffisent. |

## 8. Retours de relecture : décisions

Deux vérificateurs indépendants ont éprouvé la version 1 (lecture du moteur, deux positions rejouées avec le moteur
actuel). Chaque problème est corrigé ou explicitement maintenu.

| # | Problème | Gravité | Décision |
|---|---|---|---|
| 1 | Lune de sang + Déjà-vu : filtre de capture appliqué deux fois, dont une avant le retrait du coup interdit ; joueur sans coup jouable, IA qui boucle | Bloquant | Un seul filtre, dans `legalMovesOf`, après le retrait de la pièce interdite ; l'IA l'applique elle-même à chaque nœud ; test FEN (3.3, 4.2). |
| 2 | Mains adverses envoyées aux clients via `Snapshot.hands` | Bloquant | Les instantanés ne gardent que les drapeaux `used` ; test de non-fuite (3.12). |
| 3 | Faille en 6e rangée : 0 coup noir après 1.e4 ; la passe offrait trois coups blancs d'affilée | Bloquant | Faille limitée aux rangées 4 et 5 (12 et 20 coups au départ, vérifié) ; passe supprimée, remplacée par « la magie cède » (R6). |
| 4 | Portails : téléportation réservée au lanceur, mat à distance, portail libre servant de mur au roi | Bloquant | Présage, cases symétriques, pas au contact d'un roi, rois et pions s'y arrêtent, une seule paire (3.10). |
| 5 | Le lanceur exploite l'effet avant toute réponse (Couronnement, Ère glaciaire, Déflagration, Lune, Portails) | Majeur | Présage pour tous les Climats et les Portails (R2). |
| 6 | Remplacement gratuit des Climats ; 95 % des mains ont un Climat ; on garde ses Climats pour répondre | Majeur | Le remplacement n'a lieu qu'à l'arrivée ; un seul Climat annoncé ; au plus 2 Climats par main (R1, R9). Les 7 Climats sont maintenus : sans annulation gratuite, leur nombre n'est plus un problème, et ils portent l'idée « le monde change ». |
| 7 | La passe contre R4c : un joueur bloqué doit dépenser une carte | Majeur | Avec la magie cède, il a des coups ; la carte reste facultative (R6). |
| 8 | Déflagration : le roi bombe immortelle | Majeur | Le roi capture sans explosion, donc jamais une pièce défendue (3.6). |
| 9 | Couronnement : dame immédiate | Majeur | Présage et 7e rangée (3.5). |
| 10 | Ère glaciaire : une pièce gagnée au 6e coup d'une Sicilienne | Majeur | Présage ; Rare au lieu de Commune (3.4). |
| 11 | Grande Marée : double attaque de pions exploitée la première par le lanceur | Majeur | Rituel : elle remplace le coup ; dans la position citée, le pari se retourne (vérifié) (3.11). |
| 12 | Lune de sang : mat en 2 imposé | Majeur | Présage et 3 coups (3.3). |
| 13 | Trêve : la reprise revient toujours au lanceur | Majeur | 3 coups, la reprise revient à l'adversaire ; compteur des 50 coups figé (3.2). |
| 14 | Sablier fou contre l'IA ; effet faible avec incrément | Majeur | Exclu des parties contre l'IA ; incréments suspendus (3.1). |
| 15 | Tirage uniforme : la rareté ne sert à rien | Majeur | Tirage pondéré 4/3/2/1, au plus 1 Légendaire et 2 Climats par main ; fréquences simulées (R9). |
| 16 | Sablier fou : 3 coups accélérés contre 2 ; pendule pas encore lancée au 1er coup | Mineur | Présage : 3 contre 3, toujours après le démarrage des pendules ; cinématiques hors pendule (R10). |
| 17 | Remplacement d'un Climat verrouillé par un roi collé à un pion gelé | Mineur | Les pions gelés gardent leurs cases contre le roi ; le Présage laisse un coup pour s'écarter (3.4). |
| 18 | Deux paires de Portails écrasées dans `Mods` | Mineur | Une seule paire à la fois (3.10). |
| 19 | Promotion inutile sous Déflagration | Mineur | Un seul coup sans choix, `bxc8*` (3.6). |
| 20 | Sélecteur de promotion ancré au bord du plateau | Mineur | Ancré sur la case d'arrivée ; la prise en passant ne couronne plus (3.5, 4.5). |
| 21 | Quiescence de l'IA sous la Lune de sang | Mineur | Pas d'immobilité quand une capture est obligatoire (3.3, 4.4). |
| 22 | Comptes de la passe ; Trêve et nulle des 50 coups | Mineur | Plus de passe ; compteur figé sous la Trêve et l'Ère glaciaire (3.2, 3.4). |
| 23 | Faille en 3e rangée qui n'enferme qu'un camp | Mineur | Rangées 4 et 5 seulement (3.9). |
| 24 | Échec par un pion encore gelé, ou par un Mur qui fond, illisible | Mineur | Les pions gelés ne donnent jamais échec ; « échec à la fonte » et « à la fermeture » affichés (R5). |
| 25 | Chevauchée : quarante sauts adverses à vérifier de tête | Mineur | Arcs affichés pendant le Présage et la confirmation ; levier vers 3 coups (3.7). |
| 26 | Déjà-vu : interdiction symbolique, temps adverse perdu, carte rendue mais dévoilée | Mineur | Même pièce interdite ; temps rendu à l'adversaire ; la carte rendue reste visible, c'est assumé (3.12). |

Maintenus en connaissance de cause :
- **Déjà-vu efface un mat.** C'est déjà le cas avec Retour arrière, la carte est Légendaire, et la pièce interdite
  oblige à trouver une autre défense.
- **Déflagration atomique.** Elle emporte toujours les voisines ; la version « kamikaze » reste un levier (section 6).
- **« Un passage de portail ne peut pas donner échec »** n'est pas adopté (section 7).
- **« Remplacer un Climat coûte le coup »** n'est pas adopté : le Présage règle déjà le problème (section 7).

## 9. Points à valider par le fondateur

Choix de design encore ouverts, avec la recommandation de cette proposition.

1. **Le Présage.** Tous les Climats (et les Portails) s'annoncent un tour à l'avance. *Recommandé :* oui. C'est la
   correction structurelle principale, et elle donne deux temps forts visuels au lieu d'un. *Alternative :* effet
   immédiat, mais la carte remplace le coup (plus simple, mais chaque Climat coûte alors un temps).
2. **Tout global, ou un mélange ?** Garder deux ou trois cartes ciblées (Foudre, Égide) pour le piquant, ou proposer
   l'ancien catalogue dans un mode « Duel » pendant la transition. *Recommandé :* tout global, et l'ancien catalogue
   en mode « Duel » le temps de la transition.
3. **Pas de pat par magie : « la magie cède ».** Un joueur bloqué par les effets joue comme s'ils n'existaient pas
   pour ses pièces. *Alternatives :* garder le pat (un joueur perdant peut annuler la partie en gelant tout), ou la
   passe (écartée, section 7).
4. **Sablier fou.** ×2 et incréments suspendus ; exclu contre l'IA et sans pendule. Faut-il, sans pendule, un chrono
   par coup pendant l'effet ? Préférez-vous la variante « chaque seconde au-delà de 5 s compte triple », plus mordante
   mais plus dure à lire ?
5. **Couronnement en 7e rangée** (recommandé, carte de finale) ou en 6e (plus spectaculaire, mais une dame presque
   gratuite en milieu de partie).
6. **Déflagration.** Version atomique (les voisines sautent, recommandée) ou kamikaze (seules la pièce qui capture
   et sa victime disparaissent). Et, plus largement : faut-il exclure les Légendaires (Déflagration, Déjà-vu) des
   parties classées ?
7. **Déjà-vu.** Garde-t-on une carte d'annulation, qui récompense la réparation plus que l'anticipation ? Si oui :
   même pièce interdite et temps rendu à l'adversaire, d'accord ?
8. **Tirage pondéré.** Poids 4/3/2/1, au plus 1 Légendaire et 2 Climats par main : les Légendaires sortent dans 15 à
   21 % des parties au lieu de 44 %. D'accord avec ces proportions ?
9. **Portails symétriques.** Moins de liberté pour le lanceur, mais un vrai raccourci pour les deux armées. Ou
   Portails libres, avec le seul Présage ?
10. **Durées.** Trêve et Lune de sang en 3 coups (reprise à l'adversaire), les autres Climats en nombre pair (autant de
    coups chacun) : ce principe est-il assez lisible, ou faut-il une durée unique pour tous les Climats ?
11. **Vocabulaire.** « Coups » et pastilles dans l'interface ; mots-clés « Présage » et « Rituel » ; nom de la règle
    « la magie cède ». À valider ou à renommer.
12. **Double temps** (deux coups d'affilée) : à prototyper tout de suite comme Légendaire, malgré le coût moteur, ou
    à garder pour une V2 ?
