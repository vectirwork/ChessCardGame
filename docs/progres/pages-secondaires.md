# Progrès : pages secondaires au style Odyssée

Agent : Pages secondaires (flux B). Fichiers à moi : src/client/pages/{Shop,DemoCheckout,Auth,Account,Profile,
Leaderboard,Admin,Legal,NotFound}.tsx, src/client/styles/pages.css (+ habillage des pages Learn, Puzzles, Analysis,
MyGames, Live via pages.css uniquement, sans toucher leur logique).
Captures : concepts/site-pages/. Pas de commit, pas de npm install, ne pas redémarrer le port 3000.

## Fait
- Lecture du plan, inventaire. Captures « avant » : concepts/site-pages/avant/ (script
  concepts/site-pages/scenarios/pages.cjs, compte de test créé à la volée).

- src/client/pages/PageScene.tsx (nouveau, à moi) : Sky (ciel fixe par lieu), PlacePage, PageHead, StarMark, useTitle.
- Shop.tsx réécrit : vitrine (lanternes = skins, étal = plateaux, fiche + achat/équipement), aperçu vivant par
  StageBoard (odyssee/StageBoard.tsx, catalogue courant = 8 pouvoirs, garde-fou castSafely), sceau CSS avant la 3D,
  grimoires (packs), engagements, récapitulatif d'achat. Captures bureau/mobile OK (concepts/site-pages/*boutique*).
- Auth (Seuil, 2 colonnes), DemoCheckout (caisse), Account (Cabinet, ?onglet=collection), Profile (Observatoire,
  « Revoir » → /analyse/:id), Leaderboard (podium), Admin, Legal (Archives + nav), NotFound (boussole) : réécrits.
- pages.css réécrit en entier (anciennes classes Play/Rules/Home conservées).

## En cours
- Captures de toutes les pages (concepts/site-pages/scenarios/pages.cjs), corrections visuelles.

## Reste à faire
- Boutique (Bazar céleste, aperçu animé, achat démo, équipement), DemoCheckout, Auth, Account, Profile,
  Leaderboard, Admin, Legal, NotFound, habillage fonctions classiques.
- Captures bureau + mobile, node test/integration.mjs, tsc, npm test.

## Décisions
- Chaque page intérieure est un « lieu » : Boutique = V · Le Bazar céleste (comme l'accueil), Auth/caisse = VI · Le
  Seuil, Compte = Le Cabinet, Profil/Classement = L'Observatoire/Le Hall, Légal = Les Archives, 404 = Hors de la carte.
- Ciel : calque fixe .pg-sky (z-index -1 dans #root), animations transform/opacity seulement.
- pages.css garde les classes utilisées par Play.tsx et Rules.tsx (play-grid, mode-card, level, rules-*, pulse-ring)
  et les anciennes de l'accueil utilisées par Home.tsx (preview-board, board-skeleton, hero-caption).
- Correctif `.container.page { padding-inline: gutter }` dans pages.css (défaut .page de global.css).
- Boutique : aperçu = Board statique + sceau animé en CSS tout de suite, puis StageBoard (vrai sort 3D, cartes du
  catalogue en jeu, décision du 30/10 : 8 pouvoirs) au repos (~1,6 s) ou au premier choix ; pause hors écran ;
  ?objet=<id> présélectionne ; #grimoires = packs. DemoBoard (cartes Duel) n'est plus utilisé par la boutique.
- Habillage des fonctions classiques : uniquement par CSS (#contenu:has(.ft-page)), sans toucher leur balisage.

## Vérification
- npx tsc --noEmit -p .
- npm test
- node test/integration.mjs (contre http://localhost:3000)
- node concepts/_tools/shoot.cjs concepts/site-pages/scenarios/<x>.json
