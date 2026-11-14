# Pouvoirs « méta » : réflexion du 14 novembre

Demande du fondateur : réfléchir, sans coder, à des pouvoirs qui n'agissent pas sur l'échiquier mais sur le cadre de
la partie. Ses exemples : le temps qui s'accélère (×2) ; 20 s pour jouer un coup, sinon un coup au hasard est joué ;
une carte qui affiche l'évaluation de la partie aux deux joueurs.

Méthode :
- six idéateurs, un angle chacun : temps, information, décision, règles, cartes, enjeu ;
- 82 idées, toutes en annexe ;
- un directeur de jeu les a regroupées en familles, en a retenu 15 et en a écarté d'autres avec la raison ;
- un joueur compétitif et cynique a cherché à casser chacune des 15, en blitz, contre l'IA et en partie classée, puis
  a proposé le correctif qui la rend saine.

**Rien n'est codé ni joué.** Toutes les durées et tous les chiffres sont des points de départ à mesurer, d'abord en
parties IA contre IA, puis en amicale.

## 1. Ce qu'est un pouvoir méta

Un pouvoir méta ne déplace aucune pièce et ne touche aucune case. Il agit sur ce qui entoure les coups. Spellmate en a
déjà un : le **Sablier fou** (les deux pendules vont deux fois plus vite).

Six leviers, un par angle de la réflexion :

| Levier | Ce qu'on peut toucher | Exemple retenu |
|---|---|---|
| Le temps | pendules, délais, rythme, ordre des tours | Équinoxe, Mèche |
| L'information | évaluation, menaces, pendules, mémoire de la partie | Clairvoyance, Cadran voilé |
| La décision | qui choisit le coup, et parmi quoi | Écho, Je coupe, tu choisis |
| Les règles | une ligne du règlement réécrite pour un temps | Second souffle, Dîme |
| Les cartes | le calendrier, le coût, le nombre des autres cartes | Ajournement, Dernier bal, Le Dilemme |
| L'enjeu | paris, promesses, prédictions publiques | Serment, Prémonition |

## 2. Ce que deviennent tes trois exemples

- **Le temps ×2** existe déjà : c'est le Sablier fou. Il ouvre une famille « Cadence » où la pendule devient une
  ressource. Deux nouvelles cartes en sont issues : Équinoxe (rapprocher les pendules) et Cadran voilé (cacher les
  chiffres).
- **20 s, sinon un coup au hasard** devient la **Mèche**. Le hasard est remplacé par l'Oracle : un coup au hasard peut
  offrir la dame et décider seul de la partie, alors qu'un coup de l'Oracle reste un vrai coup, légal même en échec. Le
  joueur cynique a aussi cassé la version « 20 s par coup » : la meilleure forme est une réserve de 20 s par joueur
  pour ses 3 coups.
- **La barre d'évaluation** devient la **Clairvoyance**. Elle est calculée par notre Oracle, qui connaît les pouvoirs,
  et non par Stockfish, qui les ignore : sous un Mur de glace ou une Faille, sa note serait fausse. La barre
  s'affiche après le coup du lanceur, pas avant. Sinon, c'est un bouton « il y a une combinaison ici ».

## 3. La sélection, après mise à l'épreuve

| Carte | Levier | En une phrase | Verdict | Classée ? |
|---|---|---|---|---|
| **Écho** | décision | Vous devez jouer le même type de pièce que l'adversaire. | à garder | oui, la plus saine pour la classée |
| **Ajournement** | cartes | Le Présage annoncé est repoussé, et sa carte revient en main. | à garder | oui |
| **Clairvoyance** | information | La barre d'évaluation, une décision chacun. | à garder, corrigée | après l'amicale |
| **Je coupe, tu choisis** | décision | Vous proposez deux coups, l'adversaire choisit. | à garder, corrigée | après correctif |
| **Second souffle** | règles | Les pions peuvent de nouveau avancer de deux cases. | à garder, corrigée | oui |
| **Mèche** | temps | 20 s de réflexion par joueur, sinon l'Oracle joue. | à garder, corrigée | non au début |
| **Dernier bal** | cartes | Dernière salve de cartes, puis la magie s'éteint. | à garder, corrigée | oui, avec un seuil |
| **Le Dilemme** | cartes | Je propose deux Climats, tu choisis lequel arrive. | à garder, corrigée | après correctif |
| **Serment** | enjeu | Je jure de prendre cette pièce ; si je mens, je paie. | à garder, corrigée | après correctif |
| **Prémonition** | enjeu | Prédire le coup adverse pour le bloquer. | à garder, corrigée | après correctif |
| **Dîme** | règles | Pendant un temps, chaque sort n'agit qu'au tour suivant. | à garder, corrigée | oui, priorité basse |
| **Équinoxe** | temps | Les pendules se rapprochent. | à garder, corrigée | dès 3 min de cadence |
| **Cadran voilé** | information | Les chiffres des pendules disparaissent. | à garder, corrigée | dès 3 min de cadence |
| Ellipse | décision | L'Oracle joue quelques coups pour les deux camps. | à écarter | non |
| Ultimatum | règles | Sans action, la partie devient nulle. | à écarter | non |

Les fiches ci-dessous donnent la version corrigée de chaque carte.

### 3.1 Prêtes à prototyper

**Écho** — *Ce que vous jouez, il doit le jouer.*
- Présage, 4 coups au départ (2 de chaque camp), 6 si les mesures le permettent. Elle prend la place du Climat : un
  seul à la fois.
- Chaque joueur doit déplacer une pièce du même type que celle que l'adversaire vient de déplacer. Un roque compte
  comme un coup de roi, une promotion comme un coup de pion.
- Un coup de roi n'impose rien, pour ne jamais forcer la perte du roque.
- Sans coup légal du type imposé, ou si aucun ne pare un échec, le joueur joue librement (« la magie cède »).
- Interface : un bandeau « Vous devez jouer : un fou », et les autres pièces grisées sur téléphone.
- Pourquoi : chaque coup a deux faces. Il doit être bon pour soi, et imposer à l'autre une pièce qu'il joue mal.
  C'est un filtre des coups légaux, comme la Lune de sang : l'Oracle la joue et la subit sans travail nouveau.
- À trancher : un Rituel (Grande Marée) peut-il remplacer un coup imposé ? Proposition : oui, au prix de la carte.

**Ajournement** — *Les augures attendront.*
- Immédiate, en plus du coup.
- Le Présage annoncé, quel que soit son camp, est annulé avant son arrivée, et sa carte revient non jouée dans la main
  de son lanceur.
- Sans Présage annoncé, elle raccourcit de 2 coups l'effet temporaire en cours (Climat ou Faille), pour n'être jamais
  une carte morte.
- Pourquoi : elle donne enfin un usage au tour d'annonce, qui devient le moment où l'on peut répondre à un Présage.
  Elle ne détruit rien, donc elle frustre peu, mais elle oblige l'adversaire à redépenser un tour de carte plus tard,
  dans une position qui ne s'y prête peut-être plus.
- Le joueur cynique n'a rien trouvé de grave : « la plus saine de la série ».

**Clairvoyance** — *Un instant, tout le monde voit qui gagne.*
- Immédiate, en plus du coup.
- Rien ne s'affiche au lancement. La barre apparaît après le coup du lanceur, donc l'adversaire décide avec elle.
  Elle reste après la réponse jusqu'au coup suivant du lanceur, qui décide avec elle à son tour. Chacun a exactement
  une décision éclairée.
- Cinq crans, de « Blancs nettement mieux » à « Noirs nettement mieux ». Aucun chiffre, pas de signal « mat en vue »,
  jamais le meilleur coup.
- Calculée par l'Oracle sur le serveur, à profondeur courte (environ 200 ms), pour que les deux camps et la relecture
  voient la même chose et que la pendule n'attende jamais la barre.
- Pourquoi : un indice qui lance une recherche, sans donner la réponse. Si la barre bascule, les deux savent qu'il y a
  quelque chose à trouver, sans savoir quoi.
- Limite : l'IA la subit sans problème, mais ne saura pas quand la lancer. Il lui faudra une règle simple.
- À trancher : Oracle (il connaît les pouvoirs mais il est moins fort) ou Stockfish (plus fort, mais il ignore les
  pouvoirs, et sa licence GPL est à vérifier). Recommandation : l'Oracle.

**Je coupe, tu choisis** — *Vous proposez, il dispose.*
- Présage, 4 coups (2 de chaque camp). Elle prend la place du Climat.
- À son tour, le joueur montre deux coups légaux différents, en fantômes numérotés 1 et 2. L'adversaire choisit lequel
  est joué, sur sa propre pendule, puis propose à son tour deux coups.
- Correctif essentiel : le joueur qui répond à une prise ou à un échec joue librement ce tour-là. Sinon, la carte
  devient un bouton « je gagne une pièce » : on échange les dames, l'adversaire doit proposer la reprise et un autre
  coup, et on choisit l'autre.
- Deux coups de la même pièce sont permis. Sur téléphone : un bouton « Valider la paire ». Les pré-coups sont désactivés
  pendant l'effet.
- Pourquoi : c'est le partage du gâteau. Il faut proposer deux coups qui se valent, ou un appât qui cache un piège.
  La carte récompense les positions solides.

**Second souffle** — *Les pions retrouvent leurs jambes.* (idée du fondateur)
- Présage, Climat, 6 coups (3 de chaque camp), pour les deux camps comme les 8 Pouvoirs.
- Un pion peut avancer de deux cases depuis sa 2e, 3e ou 4e rangée, si les deux cases sont libres et franchissables. Il
  arrive donc au plus en 6e rangée. Sans cette limite, un pion passé de 5e rangée saute en 7e : la carte déciderait
  trop souvent des courses de pions en finale.
- La prise en passant reste possible derrière lui, et la case est marquée à l'écran.
- Ce n'est pas vraiment une carte méta : c'est un Climat ordinaire, le miroir de l'Ère glaciaire. L'IA la comprend
  sans effort (même mécanisme que l'Ère glaciaire).

### 3.2 Fortes, mais à encadrer

**Mèche** — *Ne la tenez pas quand elle s'éteint.* (exemple du fondateur)
- Présage. À l'arrivée, chaque joueur reçoit une réserve de 20 s pour ses 3 prochains coups. Elle ne se recharge pas
  et ne brûle que pendant sa propre réflexion.
- La première réserve épuisée fait jouer ce coup par l'Oracle, au niveau le plus proche du classement du joueur, puis
  l'effet prend fin pour les deux.
- Un forfait d'une seconde par coup remplace la pause pendant les animations. Le serveur fait foi, avec une marge de
  latence d'une seconde.
- Corrigé : la mèche commune « patate chaude » se cassait par les pré-coups (le lanceur prépare son coup pendant
  l'annonce et joue en 0 s). L'Oracle au niveau Apprenti rendait la sanction trop aléatoire.
- Elle marche sans pendule, donc à l'accueil. En revanche, contre l'Oracle, qui répond en moins de 2 s, elle ne touche
  que l'humain : entre humains seulement (humanOnly), en amicale d'abord.

**Dernier bal** — *Une dernière danse, puis le silence.*
- Présage, jouable seulement à partir du 15e coup : la magie doit avoir eu le temps d'exister.
- Pendant 6 coups, chacun peut encore lancer ses cartes. À la fin, la magie s'éteint pour de bon : cartes non jouées
  perdues, Présage annulé, Climat, Faille et Murs de glace dissipés. La partie se termine en échecs classiques.
- L'interface annonce le moment exact : « la magie s'éteint après le coup des Noirs ».
- Corrigé : sans le seuil du 15e coup, un bon joueur d'échecs la lancerait au premier coup pour « fermer la boutique »
  et ramener Spellmate à des échecs.
- Pourquoi : elle répond au gel des mains (chacun garde ses cartes en attendant l'autre) et plaira aux joueurs qui
  veulent finir « pour de vrai ».

**Le Dilemme** — *Deux fléaux : à lui de choisir lequel.*
- Rituel : elle remplace le coup, c'est le prix de sa souplesse.
- Le lanceur désigne deux Climats parmi ceux encore en main de l'un ou l'autre joueur, sans les leur retirer. Le
  Sablier fou est exclu. L'adversaire choisit lequel arrive, en 15 s décomptées sur sa pendule. Le Climat choisi arrive
  au début du prochain tour du lanceur.
- Pourquoi : c'est le partage du gâteau appliqué aux Climats. Le lanceur compose une paire dont les deux issues
  l'arrangent ; l'adversaire lit l'échiquier et prend le moindre mal. L'Oracle sait déjà évaluer un Climat.

**Serment** — *Ce qui est juré doit être tenu.*
- Rituel : il remplace le coup, donc jurer coûte un tempo.
- Le lanceur désigne une de ses cartes non jouées comme mise. Il jure publiquement de prendre, pendant ses 3 prochains
  tours, une pièce adverse désignée, ni le roi ni un pion. Cette pièce ne doit être attaquée par aucune de ses pièces
  au moment où il jure : pas de serment sur une prise déjà gagnée.
- Serment tenu : l'adversaire brûle une de ses cartes non jouées, de son choix. Parjure : la mise du lanceur est
  brûlée, et l'adversaire récupère une de ses cartes jouées.
- Pourquoi : une intention publique qui coûte si elle est fausse. On jure sincèrement et l'on dévoile son plan, ou
  l'on jure pour leurrer et faire défendre une pièce pendant qu'on perce ailleurs.
- Limite : seul l'Oracle Archimage saurait jurer correctement.

**Prémonition** — *Je t'ai vu venir.*
- Présage, 6 coups, entre humains seulement, à partir de 3 minutes de cadence.
- En jouant son coup, chaque joueur peut sceller en secret une prédiction du prochain coup adverse. Si l'adversaire le
  joue exactement, son coup est refusé (« Prédit ! ») et il doit en jouer un autre, pendule en marche. Une seule
  réussite par joueur.
- Exclusions, que le serveur vérifie : aucune prise, aucune parade d'échec, aucune parade d'un mat en un, et aucun
  joueur qui a moins de 4 coups légaux. Sans ces exclusions, on bloque la seule parade et l'on mate.
- Un sceau visible montre qu'une prédiction est posée, sans dire laquelle. Le secret reste au serveur.
- Pourquoi : c'est le tir au but. Jouer son meilleur coup, peut-être trop évident, ou le deuxième pour esquiver ?

**Dîme** — *Chaque sort se paie.*
- Présage, 6 coups. Pendant l'effet, toute carte lancée devient un Présage : elle n'agit qu'au début du prochain tour
  de son lanceur. Un Rituel n'est pas touché.
- Corrigé : la version « chaque carte remplace le coup » faisait des cartes des « passes » en zugzwang. Taxer en délai
  garde l'idée (plus d'enchaînement surprise « Mur de glace puis attaque ») sans ce défaut.
- Priorité basse : utile, mais peu de saveur.

### 3.3 Pour les parties à pendule (blitz et plus)

Elles sont entre humains seulement (l'IA ne gère pas son temps) et réservées aux cadences de 3 minutes et plus. Elles
forment une famille « Cadence » avec le Sablier fou : un seul effet de temps à la fois.

**Équinoxe** — *Le jour et la nuit, à parts égales.*
- Présage. À l'arrivée, l'écart entre les deux pendules est réduit de moitié, avec un transfert plafonné à 10 % du
  temps initial (18 s en 3+0). Une animation montre les deux pendules qui bougent, avec le montant.
- Pourquoi : une carte de rattrapage qui se lit en une phrase. Visible dès le choix des cartes, elle dit à l'adversaire
  que son avance au temps est fragile. Elle fait contrepoids au Sablier fou, qui récompense le joueur rapide.
- Corrigé : sans plafond, on joue lentement exprès, puis l'on récupère son retard.

**Cadran voilé** — *Plus personne ne sait l'heure.*
- Présage, 8 coups. Les chiffres des deux pendules disparaissent pour les deux joueurs. Ils sont remplacés par un
  sablier à trois niveaux, dont le dernier vaut au moins 20 s. Sous 10 s, le sablier palpite. Le temps s'écoule
  normalement.
- Le serveur n'envoie que le niveau, sinon les outils du navigateur annulent la carte.
- Pourquoi : elle ne retire que de l'information, pas de temps, et reste parfaitement symétrique. Elle crée le
  réflexe « regarde bien pendant l'annonce ».

### 3.4 Écartées après l'épreuve

- **Ellipse** (l'Oracle joue 4 coups pour les deux camps, en avance rapide) : un très beau moment de cinéma, mais on
  ne joue plus contre l'adversaire. On joue contre un bot connu, dont on peut préparer les erreurs. À garder pour un
  mode « fête », hors classée.
- **Ultimatum** (sans prise, ni coup de pion, ni échec pendant 4 coups chacun, la partie est nulle) : un bouton
  « nulle » contre l'Oracle, et une nulle obtenue par une carte fausse l'Elo. Le besoin d'une carte pour le camp qui
  souffre est mieux servi par l'Ajournement et la Trêve.

## 4. Les fausses bonnes idées

| Idée | Pourquoi l'écarter |
|---|---|
| Le coup au hasard (la sanction littérale des 20 s) | Il peut offrir la dame et décider seul de la partie. Il amuse une fois, puis il est vécu comme une injustice. La Mèche garde l'idée avec l'Oracle. |
| Sablier renversé (échanger les temps) | Pendant l'annonce, les deux joueurs brûlent leur pendule et la partie finit en panique. |
| Volte-face (échanger les mains) | Un joueur passe de 0 à 3 cartes : la bascule est énorme. |
| Pièce touchée | Sur téléphone, un doigt qui glisse impose un coup. |
| Victoire au matériel, ou en trois échecs | Elles remplacent le mat et trahissent la promesse de « vrais échecs ». |
| Mat annoncé | C'est une prime au bluff, et une partie perdue pour une erreur de calcul. |
| Deux coups de suite, enchères de temps | Deux coups de suite décident la partie, et tout le moteur suppose qu'on joue à tour de rôle. |
| Cartes cachées, pièces masquées, brouillard | Elles contredisent les mains visibles et se trichent si le masque reste dans le navigateur. Leur place est dans un mode à part (section 7). |
| L'Oracle qui souffle trois coups | C'est une aide de moteur, contestable en classée. Un faux conseil ressemble à de la triche. |
| Vote des spectateurs, en tant que carte | Les amis d'un joueur votent pour lui, et presque aucune partie n'a de spectateurs. Leur place est dans un format de diffusion. |
| Dés, quitte ou double | Le hasard décide trop et fausse l'Elo. |
| Vertige, regards croisés | La nausée sur téléphone, un flux réseau continu, et aucun sens contre l'IA. |

## 5. Dix principes pour les cartes méta

1. **Déplacer la décision, jamais la supprimer.** Une carte méta confie, restreint ou chronomètre le choix, mais laisse
   toujours une décision autour (quand la lancer, comment s'y préparer). Quand un coup échappe au joueur, c'est
   l'Oracle qui le joue, jamais un tirage au hasard.
2. **Une règle pour les deux, ou un partage équitable.** Comme les 8 Pouvoirs. Sinon, un protocole de partage : je
   propose, tu choisis. Une asymétrie voulue se paie en public, par une mise ou un parjure.
3. **Ce qui cache ou contraint s'annonce ; ce qui montre peut être immédiat.** Le tour d'annonce est le moment de jeu
   de la carte méta : on regarde sa pendule, on met sa position à l'abri, on dépense ses cartes.
4. **Un indice, pas la réponse.** Un niveau de barre ou un sablier à trois niveaux lancent une recherche ; le meilleur
   coup ou un chiffre exact la remplacent.
5. **Chaque carte dit ce qu'elle récompense** : le calcul, la gestion du temps, la mémoire, ou la lecture de l'autre.
6. **Compter en coups de chaque camp, et montrer la frise.** « 6 coups (3 de chaque camp) », « s'arrête après le coup
   des Noirs ». Le chantier « coup et tour » doit passer avant les cartes méta : on ne joue bien avec le temps des sorts
   que s'il est parfaitement montré.
7. **Une seule couche de règles modifiées, toujours affichée.** Les règles changées par un effet ne sont jamais écrites
   dans les règles de la partie. Chaque changement s'affiche (« Cartes par tour : 1 → 2 »). Une carte méta ne copie,
   n'annule ni ne récupère jamais une autre carte méta.
8. **Le serveur est l'arbitre.** Secrets, minuteries et tirages vivent sur le serveur, sont enregistrés dans la partie
   et ne partent jamais vers un navigateur qui ne doit pas les voir.
9. **Chaque carte déclare où elle se joue** : avec ou sans pendule, contre l'IA, à l'accueil, en classée. Les barèmes
   de temps s'écrivent en pourcentage de la cadence.
10. **Respecter l'issue de la partie et le classement.** Une carte qui touche la nulle ou la victoire ne termine jamais
    la partie à son arrivée, et commence hors classée. Tout passe par des parties IA contre IA, puis amicales, avant la
    classée.

## 6. Ce que le code devra savoir faire

- **Une couche « règle effective »** : les règles de la partie, plus les effets actifs, lues partout où le moteur lit
  aujourd'hui les règles (moteur, IA, textes, interface). La passe « polymorphe » rend cela simple : cartes par tour,
  carte à la place du coup et délai du Présage sont déjà des réglages de la partie. Dîme et Dernier bal en sont des
  changements temporaires.
- **Le chantier « coup et tour »**, déjà noté, avant toute carte méta.
- **Des minuteries au serveur** (Mèche, Je coupe, Le Dilemme) et **des secrets au serveur** (Prémonition, Cadran
  voilé), avec un état filtré pour chaque joueur seulement pour ces deux cartes.
- **Une réserve par contexte** : chaque carte dit si elle va à l'accueil, contre l'IA, en classée (humanOnly,
  timedOnly existent déjà).
- **Mesurer avant de publier** : parties IA contre IA, taux de victoire du lanceur, comme pour les 8 Pouvoirs.

## 7. Au-delà des cartes : des formats

- **Saisons de Lois** : chaque saison, une règle méta (Second souffle, Dîme…) s'applique à toutes les parties d'un
  contexte, avec un classement de saison. Le moteur réglable devient un calendrier éditorial.
- **Spellmate Éclair pour l'accueil** : sans pendule, chaque coup sous une mèche de 20 s, et l'Oracle joue pour le
  joueur en retard.
- **Mode Brouillard** : un format à part, non classé, où le serveur envoie à chacun un état filtré (pièces masquées,
  Présages face cachée). Le secret a sa place là, pas dans la réserve commune.
- **Classée au videau** : des matchs en points avec un cube de doublement (tenir ou passer, plafonné à ×4), comme au
  backgammon, hors des cartes.
- **Parties à l'affiche** : pour les diffusions et les événements, le public reçoit deux Pouvoirs et vote (au moins
  3 votants, 10 s), avec l'Oracle en repli. Jamais en classée.
- **Choix des cartes en partage** : l'un sépare la réserve en deux tas, l'autre choisit le sien. Ou un grimoire commun
  où chacun puise à tour de rôle.
- **Tournois aller-retour** : chaque appariement joue deux fois, couleurs inversées, avec un départage. Et un défi
  quotidien de l'Ellipse : reprendre la main après l'avance rapide de l'Oracle et trouver le meilleur coup.

## 8. Questions pour le fondateur

1. Quelles cartes prototyper en premier ? Proposition : Écho, Ajournement et Clairvoyance. Ce sont les plus saines et
   les plus simples.
2. Les cartes méta entrent-elles dans la réserve des Pouvoirs (8 cartes aujourd'hui), ou forment-elles un catalogue à
   part (« Arcanes ») que l'on choisit au lancement d'une partie ?
3. Clairvoyance : l'Oracle (il connaît les pouvoirs) ou Stockfish (plus fort, mais il les ignore) ?
4. Mèche : la version recommandée (20 s pour 3 coups) ou ta version d'origine (20 s par coup) ?
5. Certaines cartes réservées aux parties entre humains (Mèche, Prémonition, la famille Cadence) : acceptable, alors
   que l'accueil se joue contre l'IA ?
6. Un format « fête » non classé, pour les idées spectaculaires mais déséquilibrées (Ellipse, vote du public) ?

---

## Annexe : les 82 idées brutes, par angle

Effets tels que proposés par les idéateurs, avant la synthèse et l'épreuve (certains sont coupés). Plusieurs idées
reviennent sous deux noms dans deux angles : c'est le signe qu'elles sont naturelles.

### Temps et rythme

- **Brume horaire** — *Plus personne ne sait l'heure.* Présage, 8 coups (les deux camps comptent), partie à pendule seulement. Les chiffres des deux pendules disparaissent pour les deux joueurs : chacun voit seulement, pour lui comme pour l'adversaire, un sablier à trois niveaux (plus du quart du temps…
- **Andante** — *Personne ne joue avant d'avoir regardé.* Présage, 6 coups. Au début de chaque coup, l'échiquier du joueur au trait reste verrouillé 8 s : sa pendule est arrêtée, et aucun coup ni pré-coup n'est possible. Ensuite, tout reprend normalement (pendule et incrément). Sans pendule, il ne reste que le…
- **Équinoxe** — *Le jour et la nuit, à parts égales.* Événement annoncé (Présage), partie à pendule. Au début du prochain tour du lanceur, chaque pendule prend la moyenne des deux temps restants. Un réglage de la carte peut rapprocher les pendules de moitié seulement.
- **Rançon** — *Chaque prise se paie en secondes.* Présage, 6 coups, partie à pendule. Chaque prise fait passer du temps de la pendule de la victime à celle du preneur, en pourcentage du temps initial de la cadence : 3 % pour un pion, 8 % pour un cavalier ou un fou, 12 % pour une tour, 20 % pour la dame.…
- **Couperet** — *Agissez, ou la partie s'éteint.* Présage, 10 coups. La règle des 50 coups devient celle des 3 coups : si 6 coups de suite passent sans prise, sans coup de pion et sans échec, la partie est nulle. Le compteur part de l'arrivée de la carte.
- **Contretemps** — *Le présage arrive une mesure trop tard.* Immédiat, en plus du coup. Chaque Présage déjà annoncé, et tout Présage lancé pendant les 6 coups suivants, arrive un coup plus tard : au début du tour de l'adversaire de son lanceur, au lieu du sien.
- **Pas de deux** — *Répondez dans la mesure de l'autre.* Présage, 6 coups. Pour chaque coup, on dispose du temps que l'adversaire a pris pour son dernier coup, plus 3 s, avec un minimum de 5 s. Au-delà, sa pendule s'écoule trois fois plus vite ; sans pendule, l'Oracle (niveau Apprenti) joue ce coup à sa place.
- **Mèche** — *Ne la tenez pas quand elle s'éteint.* Présage. À l'arrivée, une mèche commune de 20 s s'allume. Elle ne brûle que pendant la réflexion du joueur au trait, pas pendant les animations. Celui qui a le trait quand elle s'éteint voit l'Oracle (niveau Apprenti) jouer ce coup à sa place. Si elle…
- **Temps mort** — *Chacun peut laisser passer son tour, une fois.* Présage, 8 coups. Pendant l'effet, chaque joueur peut une seule fois passer son tour au lieu de jouer, sauf s'il est en échec ou s'il lance une carte ce tour-là. Un passage compte comme un coup pour les durées et pour la règle des 50 coups.
- **Sablier renversé** — *Votre temps devient le mien.* Événement annoncé (Présage), partie à pendule. Au début du prochain tour du lanceur, les deux joueurs échangent leurs temps restants.
- **Lumière des étoiles** — *Ce que vous voyez s'est déjà passé.* Présage, 6 coups, partie à pendule. Chaque coup n'apparaît chez l'adversaire que 4 s après avoir été joué, alors que sa pendule tourne déjà. Pendant ces 4 s, il peut jouer « dans le noir » sur la position qu'il voit : son coup s'exécute à l'apparition s'il…
- **Ellipse** — *Quelques coups plus tard…* Rituel : la carte remplace le coup du lanceur. L'Oracle (niveau Sorcier) joue aussitôt les 4 coups suivants, 2 pour chaque camp en commençant par le lanceur, en avance rapide et sans toucher aux pendules. La partie reprend ensuite, le lanceur au trait.
- **Prophétie** — *Chaque coup s'annonce un tour à l'avance.* Présage, 6 coups. Chaque coup joué est d'abord annoncé (pièce fantôme visible des deux joueurs) et ne s'exécute qu'au début du tour suivant de son auteur, juste avant qu'il annonce le suivant. Un coup devenu illégal s'évapore, et son auteur joue alors un…
- **Initiative** — *Qui a le temps a le trait.* Présage, 6 coups, partie à pendule. Le trait ne s'alterne plus : après chaque coup, c'est le joueur qui a le plus de temps à sa pendule qui joue. Chaque coup coûte au moins 8 s (prélevées même si l'on joue plus vite), et un coup qui donne échec rend…

### Information et perception

- **Cadran voilé** — *Plus personne ne sait l'heure.* Annoncée (Présage), elle arrive au début du prochain tour du lanceur. Pendant 6 coups (3 de chaque camp), les deux pendules sont cachées aux deux joueurs : à la place, une jauge à trois états, « large » (plus de 60 s), « juste » (20 à 60 s) ou « critique »…
- **Lanterne des veilleurs** — *Tout ce qui menace s'allume.* Immédiate, en plus du coup. Pendant 4 coups (2 de chaque camp), les deux joueurs voient les pièces en prise des deux camps cerclées de rouge (pièces attaquées et pas assez défendues, en comptant un échange simple), plus un signe discret sur toute pièce qui…
- **Eaux du Léthé** — *On oublie d'où l'on vient.* Annoncée (Présage). Pendant 6 coups (3 de chaque camp), l'interface oublie la partie pour les deux joueurs : la liste des coups est masquée, le dernier coup n'est plus surligné, les pièces prises et le bilan matériel disparaissent, et les compteurs des…
- **Arbitre muet** — *Plus personne ne vous dit ce qui est permis.* Annoncée (Présage). Pendant 6 coups (3 de chaque camp), l'interface n'aide plus personne : pas de points de coups possibles, pas de case du roi rougie en cas d'échec, pas de surlignage des cases interdites (Mur, Faille), pas de rappel « vous devez prendre…
- **Le Chœur** — *Chaque coup est jugé, à voix haute.* Immédiate. Pendant 4 coups (2 de chaque camp, en commençant par le coup que le lanceur joue juste après), l'Oracle annote chaque coup aux deux joueurs d'un signe : « !! », « ! », « ?! », « ? » ou « ?? », selon l'évaluation perdue par rapport à son meilleur…
- **Serment** — *Annonce la pièce que tu joueras. Puis tiens parole.* Annoncée (Présage). À son arrivée, et pour 2 serments par joueur, chaque joueur désigne publiquement, après son coup, une de ses pièces qui a au moins un coup légal : à son tour suivant, il doit la jouer si elle a encore un coup légal. En échec, le serment…
- **Prophétie** — *Écris son prochain coup. S'il le joue, tu l'avais vu.* Immédiate. Le lanceur scelle en secret une prédiction du prochain coup adverse (pièce et case, saisie comme un pré-coup) ; à son tour, avant de jouer, l'adversaire scelle la sienne sur le prochain coup du lanceur. Chaque prophétie est révélée juste après…
- **Trois murmures** — *L'Oracle souffle trois coups. Un seul est bon.* Immédiate. Pour le coup qu'il joue juste après la carte, le lanceur reçoit en privé trois flèches identiques, dans un ordre au hasard : le meilleur coup de l'Oracle, un coup jouable mais moyen, et un piège, c'est-à-dire le coup le plus naturel (prise,…
- **Augure muet** — *On sait qu'un orage vient. Pas lequel.* Immédiate, jusqu'à la fin de la partie. Les Présages des deux camps se lancent désormais face cachée : l'adversaire voit qu'un Climat est annoncé et quand il arrive, et sait seulement qu'il s'agit de l'un des Climats encore en main du lanceur. La carte…
- **Regards croisés** — *Ce que tu regardes, il le voit.* Immédiate. Pendant 4 coups (2 de chaque camp), chaque joueur voit en direct, sous forme d'une lueur discrète, la pièce que l'autre sélectionne ou soulève et la case qu'il survole en la glissant. Les pré-coups de l'autre deviennent visibles en fantômes.…
- **Bal masqué** — *Qui se cache sous le masque ?* Annoncée (Présage). Pendant 6 coups (3 de chaque camp), chaque joueur voit ses propres pièces normalement, mais les pièces adverses, hors roi et pions, portent toutes le même masque : on voit leur couleur, pas leur nature. Les déplacements trahissent en…
- **Brume** — *On ne voit que ce que ses pièces voient.* Annoncée (Présage). Pendant 6 coups (3 de chaque camp), chaque joueur ne voit que les cases qu'occupent ses pièces ou qu'elles peuvent atteindre ; le reste du plateau, pièces adverses comprises, est dans la brume. L'échec est toujours annoncé, la pièce qui…
- **Vertige** — *Le plateau tourne.* Annoncée (Présage). Pendant 4 coups (2 de chaque camp), l'échiquier s'affiche aux deux joueurs tourné d'un quart de tour (les Blancs jouent de gauche à droite), sans coordonnées. Version douce : retourné à 180°, chacun voit le jeu depuis le camp adverse.…

### Décision et contrôle

- **Pièce touchée** — *Ce qui est touché est joué.* Climat annoncé (Présage), 4 coups (2 chacun). La première pièce que vous sélectionnez (clic, toucher ou début de glisser) et qui a au moins un coup légal doit être jouée. La sélection s'affiche aussitôt chez l'adversaire (contour lumineux). Les pré-coups…
- **Écho** — *Ce que vous jouez, il doit le jouer.* Climat annoncé, 6 coups (3 chacun). Chaque joueur doit déplacer une pièce du même type que celle que l'adversaire vient de déplacer : un roque compte comme un coup de roi, une promotion comme un coup de pion. S'il n'a aucun coup légal de ce type, il joue…
- **Repentir** — *Un remords, un seul.* Climat annoncé, 6 coups. Chaque joueur reçoit un repentir : juste après la réponse adverse, avant son coup suivant, il peut reprendre son dernier coup et cette réponse, puis il rejoue un coup différent et l'adversaire répond librement. Le temps de pendule…
- **Coup sous enveloppe** — *Écrit avant, joué après.* Climat annoncé, 4 coups. À son premier coup sous l'effet, chaque joueur joue normalement, puis écrit en secret son coup suivant, avec le geste des pré-coups. À son tour suivant, ce coup est joué d'office, sans temps de pendule, s'il est légal ; sinon le…
- **Les dés sont jetés** — *Le sort choisit la pièce, vous choisissez le coup.* Climat annoncé, 4 coups. Avant chaque coup, un dé visible des deux joueurs désigne un type de pièce parmi ceux qui ont au moins un coup légal ; le joueur doit jouer une pièce de ce type. En échec, le dé ne tire que parmi les types qui parent l'échec.
- **Prémonition** — *Je t'ai vu venir.* Climat annoncé, 6 coups. Pendant le tour adverse, chaque joueur désigne en secret un coup de l'adversaire, avec le geste des pré-coups appliqué à ses pièces. Si l'adversaire joue exactement ce coup, il est refusé et révélé (« Prédit ! »), et il doit en…
- **Je coupe, tu choisis** — *Vous proposez, il dispose.* Climat annoncé, 4 coups (2 chacun). À son tour, chaque joueur montre deux coups légaux différents. Au début de son propre tour, l'adversaire choisit lequel est joué, puis joue à son tour sous la même règle. Un joueur qui n'a qu'un coup légal le joue.
- **Le Dilemme** — *Deux fléaux : à lui de choisir lequel.* Événement, en plus du coup. Le lanceur désigne deux Climats du catalogue, à condition qu'aucun Climat ne soit en cours ni annoncé. Au début de son tour, l'adversaire choisit lequel arrive. Le Climat choisi compte comme un Présage du lanceur : il arrive au…
- **Marionnettes** — *Il choisit la pièce, vous choisissez le pas.* Climat annoncé, 4 coups. À la fin de son coup, chaque joueur désigne une pièce adverse qui a au moins deux coups légaux (pas le roi, sauf s'il est seul à pouvoir bouger) : l'adversaire doit jouer cette pièce, où il veut. En échec, la désignation ne vaut…
- **Quitte ou double** — *Laissez le sort jouer, reprenez un sort.* Climat annoncé, 6 coups. Une fois pendant l'effet, chaque joueur peut, à son tour, laisser le sort jouer : un coup légal tiré au hasard est joué pour lui, et il récupère une de ses cartes déjà utilisées (pas celle-ci). Variante : au lieu de reprendre une…
- **Adjugé !** — *Le tempo est à vendre.* Présage, partie à pendule seulement. À l'arrivée, les deux joueurs misent en secret et en même temps (15 s) des secondes de leur pendule, au plus la moitié de leur temps. Le plus offrant paie sa mise et joue deux coups de suite à son prochain tour ; si le…
- **Somnambules** — *Pendant deux coups, l'Oracle rêve pour vous.* Climat annoncé, 4 coups. Les coups des deux camps sont joués par l'Oracle au niveau 1 (le plus faible, avec sa part de hasard), après une courte pause, pendules arrêtées. Les joueurs gardent leurs cartes : chacun peut encore en lancer une avant que…
- **Le Souffleur** — *Il vous parle à l'oreille. Mais qui l'a payé ?* Climat annoncé, 6 coups. Avant chaque coup, chaque joueur voit une flèche « conseil de l'Oracle » : le meilleur coup selon l'Oracle au niveau 2. Une fois pendant l'effet, chaque joueur peut, en plus de son coup, remplacer en secret le prochain conseil…
- **Vox populi** — *Le public a toujours raison.* Climat annoncé, 4 coups, dans les parties qui ont des spectateurs. Le joueur au trait montre trois coups, les spectateurs votent pendant 15 s, et le plus voté est joué. En cas d'égalité ou sans vote, l'Oracle tranche parmi les trois.

### Règles qui mutent

- **Dîme** — *Chaque sort se paie d'un coup.* Effet immédiat, en plus de votre coup. À partir du tour adverse et pendant 3 tours de chaque camp, toute carte lancée remplace le coup de son lanceur, comme la Grande Marée : le trait passe et la pendule donne l'incrément. Variante extrême, « Grand Silence…
- **Ajournement** — *Les augures attendront.* Événement immédiat, en plus du coup : le Présage annoncé, quel que soit son lanceur, est annulé avant d'arriver, et sa carte revient non jouée dans la main de son lanceur. Sans Présage annoncé, la carte ne peut pas être lancée.
- **Amendement** — *On ne change pas la loi : on change sa date.* Immédiat, en plus du coup. Choisissez un pouvoir actif ou annoncé, de n'importe quel camp : sa durée restante gagne 2 coups ou en perd 2 (il en reste au moins 1). Visé sur un Mur de glace, il cesse d'être permanent et fond au bout de 2 coups.
- **Litanie** — *Deux sorts d'un même souffle.* Immédiat. Pendant 3 tours de chaque camp, chacun peut lancer jusqu'à 2 cartes par tour. La Litanie compte comme la première carte de votre tour : vous pouvez en lancer une seconde aussitôt. La règle « un seul Climat annoncé à la fois » reste vraie.
- **Ressac** — *Ce qui a été lancé revient.* Événement immédiat : chaque camp reprend en main, utilisable une seconde fois, la dernière carte qu'il a jouée avant le Ressac. Les pouvoirs déjà en cours continuent normalement.
- **Ultimatum** — *Agissez, ou signez la paix.* Présage. À son arrivée et jusqu'à la fin de la partie, 10 coups de chaque camp sans prise ni coup de pion font nulle (au lieu de 50), et une position vue deux fois fait nulle (au lieu de trois) ; le compteur repart de zéro à l'arrivée. Carte miroir, « Sans…
- **Loi d'airain** — *Le pat n'est plus un refuge.* Présage. Pendant 8 coups après son arrivée, un joueur qui n'a plus aucun coup sans être en échec perd la partie : le pat compte comme un mat. « La magie cède » (R6) reste en vigueur : un blocage causé par les pouvoirs n'est toujours pas un pat.
- **Contrepoids** — *La magie aide celui qui souffre.* Immédiat, pendant 3 tours de chaque camp. Au début de chaque tour, le camp qui a le moins de matériel (pion 1, fou ou cavalier 3, tour 5, dame 9) peut lancer jusqu'à 2 cartes, et celui qui en a le plus ne peut en lancer aucune ; à égalité, c'est 1 carte…
- **Conjonction** — *Deux cieux au-dessus du même plateau.* Événement immédiat. Jusqu'à la fin de la partie, un Climat qui arrive ne remplace plus le Climat actif : il s'y ajoute, avec deux Climats actifs au plus (un troisième remplace le plus ancien). Les conflits suivent une table publique : la Trêve l'emporte…
- **Antithèse** — *Le ciel se retourne.* Événement immédiat : le Climat actif devient son contraire pour les coups qu'il lui reste. Trêve et Lune de sang s'échangent ; le Sablier fou fait tourner les pendules à demi-vitesse avec un incrément doublé ; l'Ère glaciaire devient Second souffle (tout…
- **Adoubement** — *C'est l'ennemi qui vous adoube.* Immédiat, jusqu'à la fin de la partie. Quand un pion atteint la dernière rangée, c'est l'adversaire qui choisit la pièce qu'il devient (dame, tour, fou ou cavalier), au début de son tour et sur sa propre pendule.
- **Trois sommations** — *Au troisième échec, le roi tombe.* Présage. À son arrivée s'ouvre une fenêtre de 10 coups (5 de chaque camp) où chaque échec donné est compté : le premier joueur qui donne 3 échecs dans la fenêtre gagne la partie. Les compteurs partent de zéro, et seuls les coups comptent : une carte ne…
- **Arbitrage** — *Je propose, tu disposes.* Rituel, qui remplace le coup. Le lanceur désigne deux Lois dans un recueil public (par exemple Dîme, Litanie, Ultimatum, Loi d'airain, Adoubement, « plus de roque »). Au début de son tour et sur sa pendule, l'adversaire choisit laquelle s'applique, pour 3…
- **Édit scellé** — *Une loi que vous seul connaissez.* Le lanceur choisit en secret une interdiction parmi trois affichées (par exemple « aucun pion ne prend », « aucune pièce ne recule », « la dame ne bouge pas ») ; elle s'applique aux deux camps pendant 6 coups. Un coup qui l'enfreint est refusé, l'Édit est…

### Cartes qui agissent sur les cartes

- **Dissipation** — *Ce qui fut annoncé n'adviendra pas.* Effet immédiat, qui s'ajoute à votre coup. Choisissez un Présage annoncé, de l'un ou l'autre camp, ou le Climat actif : il s'éteint aussitôt, sans effet, et la carte d'origine reste consommée. Elle ne touche ni les Terrains posés ni les cartes méta.
- **Clepsydre** — *Le temps des sorts coule à votre guise.* Effet immédiat, qui s'ajoute à votre coup. Choisissez un sort qui a une durée : un Climat actif, une Faille ou un Présage annoncé. Sur un sort actif : 2 coups de plus ou de moins (au minimum, il s'arrête après votre coup). Sur un Présage annoncé : il…
- **Édit** — *Par décret, cette magie se tait.* Effet immédiat. Nommez une famille : Climat, Terrain, Événement, ou Arcane (les cartes méta). Pendant 6 coups (3 de chaque camp), personne ne peut jouer de carte de cette famille. Les sorts déjà actifs ou annoncés continuent.
- **Écho** — *Ce qui vient d'être fait se refait.* Effet immédiat. Rejoue la dernière carte jouée dans la partie (par n'importe qui, cartes méta exclues) comme si elle sortait de votre main : vous en êtes le lanceur, vous choisissez ses cibles, et elle suit ses propres règles (Présage, Rituel qui remplace…
- **Renaissance** — *Rien ne se perd, tout revient.* Effet immédiat. Chaque joueur récupère, neuve dans sa main, la dernière carte qu'il a jouée (jamais Renaissance elle-même). Un joueur qui n'a encore rien joué ne reçoit rien.
- **Solennité** — *Désormais, chaque sort se paie d'un coup.* Présage : elle arrive au début de votre prochain tour. Pendant 6 coups (3 de chaque camp), toute carte jouée remplace le coup de son lanceur, comme un Rituel. C'est le réglage `cardEndsTurn` rendu vrai pour un temps.
- **Juste Partage** — *Je coupe, tu choisis.* Effet immédiat, qui s'ajoute à votre coup. Choisissez 2 cartes de la réserve de la partie (n'importe lesquelles, cartes méta exclues). Au début de son tour, votre adversaire en prend une et vous recevez l'autre ; les deux arrivent neuves en main.
- **Procession** — *Chacun dicte l'ordre de l'autre.* Le lanceur range dans l'ordre de son choix les cartes non jouées de l'adversaire ; au début de son tour, l'adversaire range de même celles du lanceur. Jusqu'à la fin de la partie, chacun ne peut jouer que la première carte de sa file, ou la défausser sans…
- **Volte-face** — *Vos grimoires changent de mains.* Effet immédiat. Les cartes non jouées des deux joueurs sont échangées d'un bloc, Volte-face étant consommée. Variante tempérée : on échange carte pour carte, autant de cartes que compte la plus petite main ; le joueur qui en avait le plus garde le reste, à…
- **Communion** — *Un seul grimoire pour deux.* Effet immédiat. Les cartes non jouées des deux mains forment un grimoire commun, posé au centre et visible. Jusqu'à la fin de la partie, chacun y prend la carte qu'il joue (toujours une par tour). L'adversaire choisit le premier, puisque son tour vient…
- **Contre-charme** — *Il sait qu'un piège l'attend. Pas où.* Elle se joue face cachée : vous nommez en secret une famille (Climat, Terrain ou Événement). La prochaine carte de cette famille jouée par l'adversaire dans les 10 coups est annulée sans effet et consommée ; le piège se révèle alors. Sinon, il s'évente et…
- **Fil rouge** — *Si tu tires, je tire.* Effet immédiat. Choisissez une carte non jouée dans chaque main : elles sont liées. Dès que l'une est jouée, l'autre se déclenche aussitôt pour son propriétaire, qui choisit ses cibles, sans que cela compte dans son budget de cartes. Si elle ne peut pas se…
- **Dernier bal** — *Une dernière danse, puis le silence.* Présage. À son arrivée, pendant 6 coups (3 de chaque camp), chacun peut jouer jusqu'à 2 cartes par tour. Ensuite, la magie s'éteint pour de bon : les cartes non jouées sont perdues, les sorts en cours (Murs de glace compris) se dissipent, et la partie se…
- **Nuit des masques** — *Vous les avez vues. Vous en souvenez-vous ?* Présage. À son arrivée, pendant 8 coups (4 de chaque camp), les deux mains se retournent : chacun ne voit plus les cartes de l'autre ni lesquelles il joue. Tout sort annoncé l'est face cachée (on sait qu'un Climat arrive, pas lequel) et se révèle à son…

### Enjeu, psychologie et spectacle

- **Lecture des âmes** — *Je sais déjà ce que tu vas jouer.* Immédiat, en plus du coup. Avant de jouer, le lanceur scelle le coup qu'il attend de l'adversaire (pièce et case d'arrivée). Au début de son tour, l'adversaire scelle à son tour le prochain coup qu'il attend du lanceur. Chaque pari est révélé juste après…
- **Serment** — *Ce qui est juré doit être tenu.* Immédiat, en plus du coup. Le lanceur jure en public un objectif pris dans une liste fermée, à atteindre dans ses 3 prochains tours : prendre une pièce adverse qu'il désigne, faire échec, ou promouvoir un pion. Serment tenu : il choisit une carte…
- **Télépathie** — *Ta main hésite. Je la vois.* Immédiat. Pendant 6 coups (3 de chaque camp), chaque joueur voit en direct sur son échiquier ce que l'autre touche : la pièce sélectionnée, la pièce soulevée et la case visée pendant un glisser. Les spectateurs voient les deux. Faut-il aussi montrer les…
- **Armageddon** — *La paix maintenant, ou la guerre jusqu'au bout.* Immédiat, en plus du coup. Le lanceur propose la nulle et l'adversaire répond avant de jouer. Nulle acceptée : la partie s'arrête. Refusée : jusqu'à la fin, toute nulle (pat, répétition, 50 coups, matériel insuffisant, accord) compte comme une victoire du…
- **Le Videau** — *Double ou rien. Tu tiens ?* Parties classées seulement. Immédiat, en plus du coup : le lanceur double l'enjeu Elo de la partie. L'adversaire répond avant de jouer. Il tient : l'enjeu passe à ×2 et il reçoit le videau, ce qui lui donne seul le droit de redoubler une fois (×4), même…
- **Encan** — *Tout se vend, même le temps.* Parties à pendule. Immédiat : les pendules s'arrêtent et chaque joueur mise en secret entre 0 s et le quart de son temps restant (10 s pour choisir). Le plus offrant paie sa mise et choisit : prendre une carte inutilisée de la main adverse, ou récupérer…
- **Cadeau empoisonné** — *Un présent pour toi. À ouvrir vite.* Immédiat, en plus du coup. Le lanceur choisit un Pouvoir sans cible absent des deux mains (un Climat ou la Grande Marée) et l'ajoute à la main adverse. L'adversaire doit le lancer pendant l'un de ses deux prochains tours, et ce lancement compte comme sa…
- **Le Couperet** — *Dans vingt coups, on compte les morts.* Immédiat. Un compte à rebours de 20 coups (10 de chaque camp) commence. Si la partie n'est pas finie à zéro, elle s'arrête : le camp qui a le plus de matériel gagne (pion 1, cavalier et fou 3, tour 5, dame 9) ; à égalité, c'est nulle.
- **Yeux bandés** — *Je n'ai pas besoin de voir pour te battre.* Immédiat. Le lanceur joue ses 4 prochains tours à l'aveugle : son échiquier n'affiche plus les pièces, seulement les cases du dernier coup et le journal en notation. Un bandeau sur son portrait le signale à l'adversaire et au public. Si, à la fin, il n'a…
- **Mat annoncé** — *Mat en trois. Tu peux abandonner.* Immédiat, en plus du coup. Le lanceur annonce en public « mat en N » (N de 2 à 5 de ses coups), sans montrer la suite. S'il mate dans le délai, la victoire est « annoncée » : mise en scène, et +50 % de gain Elo. Sinon, il perd la partie à son N-ième coup.
- **Manche retour** — *Tu crois être mieux ? Prouve-le des deux côtés.* Jouable seulement tant que l'Oracle juge la position équilibrée. Immédiat : la position est scellée (pièces, effets, mains et pendules). À la fin de la partie, une manche retour repart de cette position couleurs inversées ; le match se décide au total des…
- **Bal masqué** — *Ce soir, personne ne montre son jeu.* Immédiat. Chaque joueur rend ses cartes inutilisées à la réserve et en tire autant en secret ; les mains restent cachées jusqu'à la fin. Une carte cachée se lance face cachée sous le nom de n'importe quel Pouvoir, et c'est le nom annoncé qui agit.…
- **La Tribune** — *Le public veut du spectacle.* Immédiat. Le public reçoit une main de 2 Pouvoirs sans cible, tirés de la réserve et visibles de tous. Jusqu'à la fin, entre deux coups, les spectateurs peuvent en lancer un par vote (au moins 3 votants, 10 s). Sans public, c'est l'Oracle qui les lance, au…
