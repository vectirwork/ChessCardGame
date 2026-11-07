# V2 : mesure finale de performance

Référence f32af47 (avant la V2) contre la version finale (c780567), versions de production sur base neuve,
Chromium sans écran avec rendu logiciel, médianes de 3 passages, réseau local sans limitation.
Commande : `node test/perf/mesure.mjs ref=<url> actuelle=<url> --scenarios=accueil,accueil-mobile,jouer,partie,apprendre --passages=3`.


## Accueil (bureau 1440 × 900)

| Mesure (médiane de 3) | ref | actuelle |
|---|---:|---:|
| Requêtes (chargement) | 29 | 33 |
| Transféré total | 1068 ko | 523 ko |
| Décompressé total | 1993 ko | 1005 ko |
|   JS transféré / décompressé | 340 ko / 1148 ko | 189 ko / 586 ko |
|   CSS transféré / décompressé | 39 ko / 175 ko | 27 ko / 122 ko |
|   Polices (nombre) | 9 | 9 |
|   Polices transféré | 211 ko | 211 ko |
|   Images (nombre) | 10 | 2 |
|   Images transféré | 475 ko | 93 ko |
| FCP | 624 ms | 556 ms |
| LCP | 2424 ms | 556 ms |
| Script exécuté au chargement | 234 ms | 208 ms |
| Styles + mise en page (chargement) | 314 ms | 200 ms |
| Tâches longues (somme, chargement) | 497 ms | 382 ms |
| Temps de blocage (Σ excès > 50 ms) | 297 ms | 232 ms |
| CPU fil principal, 10 premières s | 1149 ms | 659 ms |
| CPU processus de rendu, chargement | 2810 ms | 2250 ms |
| CPU GPU logiciel, chargement | 9120 ms | 9240 ms |
| Repos : CPU fil principal (ms/s) | 76 | 8 |
| Repos : CPU compositeur (ms/s) | 46 | 43 |
| Repos : CPU processus de rendu (ms/s) | 143 | 64 |
| Repos : CPU GPU logiciel (ms/s) | 949 | 978 |
| Repos : images composées /s | 14.2 | 14.9 |
| Repos : images voulues /s | 59.9 | 60.0 |
| Repos : images du fil principal /s | 14.2 | 5.7 |
| Repos : peintures /s | 28.4 | 0.4 |
| Repos : styles recalculés /s | 14.2 | 5.7 |
| Repos : mises en page /s | 14.2 | 0.1 |
| Repos : dont forcées dans un rAF /s | 14.1 | 0.0 |
| Repos : coût d’une image, fil principal | 5.4 ms | 1.5 ms |
| Repos : projection à 60 images/s (ms/s) | 324 | 0 |
| Repos : rAF appelés /s | 14.2 | 1.3 |
| Repos : animations CSS en cours | 50 | 12 |
| Repos : dont infinies visibles | 15 | 12 |
| Contextes WebGL créés | 1 | 0 |
| Contextes WebGL vivants | 1 | 0 |
| Nœuds DOM | 2972 | 2972 |

## Accueil (mobile Pixel 7)

| Mesure (médiane de 3) | ref | actuelle |
|---|---:|---:|
| Requêtes (chargement) | 29 | 33 |
| Transféré total | 1068 ko | 523 ko |
| Décompressé total | 1993 ko | 1005 ko |
|   JS transféré / décompressé | 340 ko / 1148 ko | 189 ko / 586 ko |
|   CSS transféré / décompressé | 39 ko / 175 ko | 27 ko / 122 ko |
|   Polices (nombre) | 9 | 9 |
|   Polices transféré | 211 ko | 211 ko |
|   Images (nombre) | 10 | 2 |
|   Images transféré | 475 ko | 93 ko |
| FCP | 492 ms | 416 ms |
| LCP | 2124 ms | 416 ms |
| Script exécuté au chargement | 237 ms | 194 ms |
| Styles + mise en page (chargement) | 349 ms | 198 ms |
| Tâches longues (somme, chargement) | 273 ms | 225 ms |
| Temps de blocage (Σ excès > 50 ms) | 173 ms | 127 ms |
| CPU fil principal, 10 premières s | 1631 ms | 790 ms |
| CPU processus de rendu, chargement | 3370 ms | 2380 ms |
| CPU GPU logiciel, chargement | 8600 ms | 9130 ms |
| Repos : CPU fil principal (ms/s) | 117 | 6 |
| Repos : CPU compositeur (ms/s) | 68 | 66 |
| Repos : CPU processus de rendu (ms/s) | 222 | 93 |
| Repos : CPU GPU logiciel (ms/s) | 892 | 954 |
| Repos : images composées /s | 31.4 | 36.5 |
| Repos : images voulues /s | 60.0 | 59.9 |
| Repos : images du fil principal /s | 31.4 | 5.1 |
| Repos : peintures /s | 0.0 | 0.6 |
| Repos : styles recalculés /s | 31.4 | 5.2 |
| Repos : mises en page /s | 0.0 | 0.2 |
| Repos : dont forcées dans un rAF /s | 0.0 | 0.0 |
| Repos : coût d’une image, fil principal | 3.7 ms | 1.2 ms |
| Repos : projection à 60 images/s (ms/s) | 222 | 0 |
| Repos : rAF appelés /s | 31.4 | 0.0 |
| Repos : animations CSS en cours | 47 | 10 |
| Repos : dont infinies visibles | 13 | 10 |
| Contextes WebGL créés | 1 | 0 |
| Contextes WebGL vivants | 1 | 0 |
| Nœuds DOM | 2991 | 2972 |

## Jouer (/jouer, bureau)

| Mesure (médiane de 3) | ref | actuelle |
|---|---:|---:|
| Requêtes (chargement) | 20 | 31 |
| Transféré total | 426 ko | 376 ko |
| Décompressé total | 955 ko | 797 ko |
|   JS transféré / décompressé | 212 ko / 613 ko | 175 ko / 527 ko |
|   CSS transféré / décompressé | 39 ko / 175 ko | 25 ko / 103 ko |
|   Polices (nombre) | 7 | 7 |
|   Polices transféré | 172 ko | 172 ko |
|   Images (nombre) | 0 | 0 |
|   Images transféré | 0.0 ko | 0.0 ko |
| FCP | 200 ms | 156 ms |
| LCP | 336 ms | 256 ms |
| Script exécuté au chargement | 94 ms | 72 ms |
| Styles + mise en page (chargement) | 62 ms | 34 ms |
| Tâches longues (somme, chargement) | 93 ms | 0 ms |
| Temps de blocage (Σ excès > 50 ms) | 18 ms | 0 ms |
| CPU fil principal, 10 premières s | 166 ms | 122 ms |
| CPU processus de rendu, chargement | 1010 ms | 670 ms |
| CPU GPU logiciel, chargement | 80 ms | 70 ms |
| Repos : CPU fil principal (ms/s) | 0 | 0 |
| Repos : CPU compositeur (ms/s) | 0 | 0 |
| Repos : CPU processus de rendu (ms/s) | 0 | 1 |
| Repos : CPU GPU logiciel (ms/s) | 2 | 1 |
| Repos : images composées /s | 0.0 | 0.0 |
| Repos : images voulues /s | 0.0 | 0.0 |
| Repos : images du fil principal /s | 0.0 | 0.0 |
| Repos : peintures /s | 0.0 | 0.0 |
| Repos : styles recalculés /s | 0.0 | 0.0 |
| Repos : mises en page /s | 0.0 | 0.0 |
| Repos : dont forcées dans un rAF /s | 0.0 | 0.0 |
| Repos : coût d’une image, fil principal | – | – |
| Repos : projection à 60 images/s (ms/s) | 0 | 0 |
| Repos : rAF appelés /s | 0.0 | 0.0 |
| Repos : animations CSS en cours | 0 | 0 |
| Repos : dont infinies visibles | 0 | 0 |
| Contextes WebGL créés | 0 | 0 |
| Contextes WebGL vivants | 0 | 0 |
| Nœuds DOM | 212 | 224 |

## Partie en cours contre l'IA (/partie/:id, bureau)

| Mesure (médiane de 3) | ref | actuelle |
|---|---:|---:|
| Requêtes (chargement) | 19 | 30 |
| Transféré total | 559 ko | 483 ko |
| Décompressé total | 1513 ko | 1358 ko |
|   JS transféré / décompressé | 354 ko / 1179 ko | 292 ko / 1095 ko |
|   CSS transféré / décompressé | 39 ko / 175 ko | 25 ko / 103 ko |
|   Polices (nombre) | 7 | 7 |
|   Polices transféré | 164 ko | 164 ko |
|   Images (nombre) | 0 | 0 |
|   Images transféré | 0.0 ko | 0.0 ko |
| FCP | 168 ms | 180 ms |
| LCP | 540 ms | 632 ms |
| Script exécuté au chargement | 116 ms | 128 ms |
| Styles + mise en page (chargement) | 86 ms | 96 ms |
| Tâches longues (somme, chargement) | 143 ms | 234 ms |
| Temps de blocage (Σ excès > 50 ms) | 43 ms | 84 ms |
| CPU fil principal, 10 premières s | 298 ms | 325 ms |
| CPU processus de rendu, chargement | 2070 ms | 2340 ms |
| CPU GPU logiciel, chargement | 4420 ms | 4380 ms |
| Repos : CPU fil principal (ms/s) | 1 | 1 |
| Repos : CPU compositeur (ms/s) | 77 | 18 |
| Repos : CPU processus de rendu (ms/s) | 104 | 28 |
| Repos : CPU GPU logiciel (ms/s) | 377 | 85 |
| Repos : images composées /s | 60.0 | 14.4 |
| Repos : images voulues /s | 60.0 | 14.4 |
| Repos : images du fil principal /s | 1.1 | 0.6 |
| Repos : peintures /s | 0.0 | 0.4 |
| Repos : styles recalculés /s | 1.1 | 0.5 |
| Repos : mises en page /s | 0.0 | 0.1 |
| Repos : dont forcées dans un rAF /s | 0.0 | 0.0 |
| Repos : coût d’une image, fil principal | 0.9 ms | 1.1 ms |
| Repos : projection à 60 images/s (ms/s) | 0 | 0 |
| Repos : rAF appelés /s | 0.0 | 0.0 |
| Repos : animations CSS en cours | 3 | 0 |
| Repos : dont infinies visibles | 3 | 0 |
| Contextes WebGL créés | 1 | 0 |
| Contextes WebGL vivants | 1 | 0 |
| Nœuds DOM | 389 | 429 |

## Apprendre (/apprendre, bureau)

| Mesure (médiane de 3) | ref | actuelle |
|---|---:|---:|
| Requêtes (chargement) | 21 | 26 |
| Transféré total | 444 ko | 349 ko |
| Décompressé total | 1003 ko | 743 ko |
|   JS transféré / décompressé | 224 ko / 640 ko | 148 ko / 456 ko |
|   CSS transféré / décompressé | 45 ko / 196 ko | 27 ko / 120 ko |
|   Polices (nombre) | 7 | 7 |
|   Polices transféré | 172 ko | 172 ko |
|   Images (nombre) | 0 | 0 |
|   Images transféré | 0.0 ko | 0.0 ko |
| FCP | 216 ms | 184 ms |
| LCP | 348 ms | 304 ms |
| Script exécuté au chargement | 90 ms | 91 ms |
| Styles + mise en page (chargement) | 71 ms | 61 ms |
| Tâches longues (somme, chargement) | 56 ms | 0 ms |
| Temps de blocage (Σ excès > 50 ms) | 6 ms | 0 ms |
| CPU fil principal, 10 premières s | 185 ms | 167 ms |
| CPU processus de rendu, chargement | 1080 ms | 880 ms |
| CPU GPU logiciel, chargement | 1970 ms | 820 ms |
| Repos : CPU fil principal (ms/s) | 1 | 0 |
| Repos : CPU compositeur (ms/s) | 15 | 7 |
| Repos : CPU processus de rendu (ms/s) | 28 | 17 |
| Repos : CPU GPU logiciel (ms/s) | 234 | 92 |
| Repos : images composées /s | 60.0 | 18.0 |
| Repos : images voulues /s | 60.0 | 18.0 |
| Repos : images du fil principal /s | 0.1 | 0.1 |
| Repos : peintures /s | 0.0 | 0.0 |
| Repos : styles recalculés /s | 0.1 | 0.1 |
| Repos : mises en page /s | 0.0 | 0.0 |
| Repos : dont forcées dans un rAF /s | 0.0 | 0.0 |
| Repos : coût d’une image, fil principal | 5.6 ms | 3.3 ms |
| Repos : projection à 60 images/s (ms/s) | 0 | 0 |
| Repos : rAF appelés /s | 0.0 | 0.0 |
| Repos : animations CSS en cours | 1 | 1 |
| Repos : dont infinies visibles | 1 | 1 |
| Contextes WebGL créés | 0 | 0 |
| Contextes WebGL vivants | 0 | 0 |
| Nœuds DOM | 1910 | 1915 |