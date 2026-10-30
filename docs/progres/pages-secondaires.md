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

- Captures bureau + mobile de toutes les pages : concepts/site-pages/{bureau,mobile}-*.png (parcours complet :
  inscription, récapitulatif, caisse démo, achat, équipement, collection ; classement/profil/admin avec API simulée
  par page.route). Corrections : alignement mobile de la vitrine, bouton Payer, pastilles de la collection,
  ordinal « 1er », tableaux en cartes sur mobile, lien contact des Archives.

## En cours
- Rien : mission terminée (voir « Reprise » plus bas).

## Reste à faire
- Rien de mon côté. Hors périmètre, signalé : test/lessons.test.ts échoue (leçon Mur de glace en rangée 1, devenu
  interdit par la règle « rangées 3 à 6 ») ; concepts/galerie/data.ts (tsc) ; climats-random expire parfois sous charge.

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
- node concepts/_tools/shoot.cjs concepts/site-pages/scenarios/boutique.json (et boutique-mobile.json)
- node concepts/site-pages/scenarios/pages.cjs http://localhost:3000 concepts/site-pages [parcours] [bureau|mobile]
  (une capture à la fois : le WebGL logiciel sature avec deux navigateurs)

## Reprise (18 h 30, après coupure de l'agent précédent)
- tsc : seule erreur concepts/galerie/data.ts (hors périmètre). Captures blanches : bureau-mentions.png et
  mobile-fonctions-problemes.png (pages saines au contrôle : prises pendant un rechargement de Vite) → à refaire.
- Corrigé : accords « 1 objet premium », « 0 partie classée » (Account), « 1 partie » (podium du Classement) ;
  Shop utilise inCatalog (cards.ts : `catalog` déprécié au profit de `catalogs`).
- Refait : bureau-mentions.png, mobile-fonctions-*.png (aucune erreur console). node test/integration.mjs : 11/11 OK.
- Ajouté : boutique, arrivée avec ?objet= (retour de caisse, liens de l'accueil) → la fiche est amenée à l'écran
  si elle est sous le pli (mobile). À vérifier : parcours achat mobile.
- Vérifié : parcours achat mobile (fiche amenée à l'écran, « Équiper » visible) ; un pack acheté mène à
  /compte?onglet=collection (capture bureau-compte-collection-pack.png). mobile-boutique-achete.png remplacée
  (l'ancienne, noire, était prise pendant le défilement) ; pages.cjs attend 3 s sur mobile à cet endroit.
- Final : tsc → seule erreur concepts/galerie/data.ts (hors périmètre) ; npm test → 157/160, échecs hors périmètre
  (lessons.test.ts : Mur de glace f1…b1 refusé ; climats-random.test.ts : délai dépassé sous charge, passe seul) ;
  node test/integration.mjs → 11/11.
