# V2 : recette du fondateur (QA)

Testeur exigeant dans la peau du fondateur. Aucun fichier du site modifié. Captures : `concepts/v2/qa/`.

## Étapes
- [en cours] Lecture du plan et des retours ; construction de la version de production dans le scratchpad.
- [x] Constructions de production (vite build --sourcemap + build-server) dans le scratchpad `qa/cur` (copie de l'arbre
  de travail du 2026-11-06T22:13:54Z) et `qa/ref` (git archive f32af47). Serveurs : cur sur 3271, ref sur 3272,
  NODE_ENV=production, bases neuves `qa/data-*`. Script de lancement `qa/serve.sh`.
- [en cours] Campagne `mesure.mjs` ref/cur, tous scénarios, 3 passages + diagnostic, sortie `qa/perf1/` (≈ 30 min).
  Pas de Playwright pendant ce temps : lecture du code.
- Scripts Playwright écrits dans le scratchpad `qa/` : `lib.cjs` (outils, trames socket), `t-accueil.cjs` (accueil,
  8 cartes, bulles, main de l'Oracle), `t-invite.cjs` (invitation entre deux navigateurs : choix secret, révélation,
  glisser souris/doigt, lancer les cartes en ligne), `t-modes.cjs` (ia, amicale, classee+revanche, echeance,
  sanscartes, redemarrage), `t-autres.cjs` (glisser sur /analyse, leçon). Serveur fonctionnel prévu : cur sur 3273.
- Lecture du code : restes du mode miroir (OdysseeHome l. 1194 « Plus d'options (couleur, mode miroir) »,
  overlays.tsx, badge GamePage) ; leçon « Jouer une carte » : consigne « choisissez la carte, puis la case » alors
  que le geste passe par « Lancer ce sort » ; `warm` de GamePage crée WebGL 1,6 s après l'arrivée (pendant le choix).
  À confirmer en vrai.
- Campagne perf en cours (premiers chiffres, médianes à confirmer) : accueil bureau transféré 1 068 → 522 ko, fil
  principal au chargement ≈ 1 130 → 650 ms, repos 72 → 6 ms/s ; mobile repos 130 → 5 ms/s ; **LCP inchangé**
  (≈ 2,35 → 2,25 s, chapeau `.o-rv` en fondu JS). Script `t-film.cjs` prêt (bande de chargement ref/actuelle).
- Serveur fonctionnel lancé : cur sur 3273, base neuve.
- [x] Campagne perf terminée (`qa/perf1/synthese.md`, 3 passages + diagnostic, charge 0,3 à 1,8). Accueil bureau :
  1 068 → 522 ko, FCP 576 → 528 ms, LCP 2 352 → 2 272 ms, fil principal 10 s 1 150 → 661 ms, repos 72 → 6 ms/s,
  WebGL 1 → 0 ; polices 211 ko inchangées (40 % de l'accueil). Mobile : repos 130 → 5 ms/s, LCP 2 100 → 2 060.
  /partie : repos 60 images/s et GPU 355 ms/s inchangés (halos), 1 contexte WebGL sans sort. /apprendre 60 → 18 i/s.
  Requêtes /jouer 20 → 31, /partie 19 → 30.
- [x] Campagne 4G + CPU ÷4 (`qa/perf4g/`) : accueil bureau FCP 2 984 → 2 844, LCP 4 600 → 3 668 ; mobile FCP
  2 908 → 2 716, LCP 4 220 → 3 400, blocage 1 218 → 1 081 ms, repos 444 → 20 ms/s ; /partie LCP 2 928 → 2 604.
- [en cours] Recette fonctionnelle (serveur 3273).
- [x] Accueil 1280, 1440 (2 parties), 390 (2 parties) : les 7 cartes de l'accueil lancées sans aide (bulle + « Lancer
  ce sort », ciblage, message du Présage), capture au glisser souris et doigt OK, bulle adverse OK.
  Constats : puce « Mur de glace · encore 0 coup » pour un Mur permanent (EffectChips, préexistant) ; mobile : la
  main de l'Oracle touche « IA · niveau Sorcier » (cartes y 45-97, texte 35-48) et l'avatar ; texte du héros
  « Touchez-en un pour le lancer avant votre coup » sans pastille de tour (faux pour la Grande Marée).
- [x] Invitation Alice (1440) / Bruno (390), 10+0 : réserve de 8, pendules à l'arrêt pendant le choix (600 000 /
  running null), 4e carte refusée, attente, « Alice a choisi ses cartes », révélation exacte, aucune carte adverse dans
  les trames avant la révélation (sélection provisoire de Bruno envoyée en confirm:false, jamais renvoyée à Alice),
  exd5 souris et Dxd5 doigt OK, 6 cartes lancées en ligne (Rituel : tour passé). Mobile : main adverse touche
  l'avatar et « Invité · Blancs » (cartes y 45, bloc nom jusqu'à 48).
- [x] IA depuis /jouer (1280×720) : 7 pouvoirs sans Sablier fou, IA a déjà choisi, révélation à la validation (2 s),
  cartes propres à l'IA absentes des trames, Ère glaciaire et Déflagration lancées. Amicale (deux invités) : OK.
  Classée (deux comptes) : rated, pendules pleines, Elo ±20 après abandon ; revanche classée avec un nouveau choix
  vide. Échéance 45 s : carte provisoire gardée, le reste au hasard, message des deux côtés, pendules intactes.
  Sans cartes : pas de choix. Constat : après la fin de partie, l'invite « Touchez une carte… » reste affichée.
- [x] Redémarrage du serveur (SIGTERM) pendant le choix : sélection provisoire et choix validé gardés, échéance
  repartie entière, mains justes. Spectateur : aucune carte dans ses trames avant la révélation. Partie en ligne
  1280 et 1440 : main adverse sans chevauchement, bulle adverse dans l'écran.
- **Bug trouvé (D4, souris)** : 3e glisser successif refusé sur tous les échiquiers (partie en ligne, accueil,
  analyse) : le glisser sélectionne le texte des coordonnées (user-select auto), le glisser suivant démarre un
  glisser-déposer natif (pointerdown → dragstart → pointercancel), la pièce revient sans explication. Présent aussi
  sur f32af47 (`qa/probe-drag-seq.cjs`, `qa/proof-drag.cjs`, captures glisser-refuse-1280-*).
- Autres constats prouvés : main adverse à 1280/1440 : « DÉFLAGRATI/ON » coupé, pastilles tronquées
  (« Remplac », « + votre ») ; WebGL et three.js chargés pendant l'écran de choix ; « Plus d'options (couleur, mode
  miroir) » sur l'accueil ; leçon « Jouer une carte » (consigne sans « Lancer ce sort », main sous le pli à 720) ;
  « Cartes de Alice » ; barre collée du choix mobile translucide sur le texte.
- [x] Serveurs 3271, 3272, 3273 arrêtés, navigateurs fermés, serveur 3000 non touché, aucun fichier du site modifié.
