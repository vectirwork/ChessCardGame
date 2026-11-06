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
