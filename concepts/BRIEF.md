# Cahier des charges : refonte artistique de Spellmate (prototypes de concepts)

## Le produit

Spellmate : des échecs en ligne avec des cartes de pouvoir. Chaque joueur reçoit 3 cartes ; à son tour, avant son coup,
il peut lancer une carte (une par tour). Gratuit ; la monétisation vient uniquement de skins d'animation et de plateaux
(aucun pay-to-win). Le site actuel fonctionne (React + Vite + Express + Socket.IO, voir `README.md`) mais le
fondateur le trouve « trop simplet, un simple mur de sections ».

## Ce que le fondateur demande (ses mots, puis l'interprétation)

> « tu veux pas faire un truc sur une seule page et tu sais ça apparaît quand tu défiles avec du parallax par exemple ?
> et les différentes sections sont différents endroits sur la page ? et tu peux jouer contre un adversaire dès la page
> d'accueil genre jouer en anonyme tout de suite et ça met le jeu d'échecs en plein écran en étendant vers la gauche
> le jeu pour cacher le titre et les cartes mais de manière jolie et en fait tu vois encore les cartes […] inspire-toi
> des meilleurs sites internet les plus réussis et fais quelque chose de recherché et d'hyper sympa […] propose une
> démarche artistique recherchée, créative, pas un simple mur basique. J'attends un site web digne d'une grande
> entreprise. »

1. **Une seule page**, racontée par le défilement : apparitions au scroll, parallaxe, profondeur. Chaque section est
   un **lieu** (un endroit d'un monde, une salle, une région), pas un bloc empilé. On doit sentir qu'on voyage.
2. **Jouer immédiatement depuis l'accueil, en anonyme** : un appel à l'action « Jouer » fait passer l'échiquier en
   **plein écran** ; la mise en page s'étend vers la gauche et masque le titre et le texte avec élégance ; les cartes du
   joueur restent visibles (par exemple en éventail sur un bord). Transition fluide et mémorable (FLIP, GSAP). Un
   bouton permet de revenir à la page.
3. **Direction artistique de très haut niveau**, inspirée des meilleurs sites (niveau « Site of the Year » d'Awwwards :
   pages produit Apple, Lusion, Active Theory, Igloo Inc., Bruno Simon, Stripe, Linear, Arc…). Typographie, rythme,
   mise en scène, micro-interactions. Rien de générique ni de « template ».

## Exigences techniques pour chaque prototype

- Emplacement : `concepts/<slug>/index.html` + `concepts/<slug>/main.tsx` (+ fichiers CSS ou TSX dans le même dossier).
  Le serveur Vite déjà lancé le sert sur `http://localhost:3000/concepts/<slug>/` avec rechargement à chaud.
  **Ne redémarrez pas le serveur, n'installez aucun paquet, ne modifiez aucun fichier hors de votre dossier**
  (lecture libre partout). Les autres concepts sont construits en parallèle dans leurs propres dossiers.
- Bibliothèques déjà installées et autorisées : `react`, `gsap` (avec `ScrollTrigger`, gratuit), `lenis` (défilement
  doux), `three`, et les polices `@fontsource/cinzel`, `@fontsource-variable/inter`, `@fontsource/instrument-serif`,
  `@fontsource-variable/fraunces`, `@fontsource/cormorant-garamond`, `@fontsource-variable/space-grotesk`,
  `@fontsource/syne`, `@fontsource-variable/unbounded`, `@fontsource/italiana`, `@fontsource-variable/bricolage-grotesque`.
- Briques existantes à réutiliser (ne les recopiez pas, importez-les) :
  - `concepts/_shared/localGame.tsx` : `useLocalGame()` donne une **vraie partie jouable** contre une petite IA, avec
    les 3 cartes du joueur et les effets 3D. Voir `concepts/_sample/main.tsx` pour l'usage minimal.
  - `src/client/components/Board.tsx` (échiquier), `DemoBoard.tsx` (échiquier qui joue seul et lance des sorts en
    boucle, idéal pour une section), `SpellCard.tsx` (cartes, tailles `full`, `hand`, `mini`, et `CardBack`),
    `CardArt.tsx` (emblèmes SVG des cartes), `pieces.ts` (`pieceUrl`), `Layout.tsx` (`LogoMark`).
  - Styles de base : `src/client/styles/{global,cards,board,game}.css` (importez au moins `cards.css` et
    `board.css` ; `global.css` est optionnel si votre direction artistique a son propre socle).
  - Données : `CARDS`/`CARD_IDS` (`src/shared/cards.ts`), skins et plateaux `ITEMS` (`src/shared/catalog.ts`),
    sons `playSound`/`playCardSound` (`src/client/sound.ts`).
  - Les cartes actuelles (11) restent celles à montrer : une refonte vers des pouvoirs « globaux » est étudiée en
    parallèle et sera intégrée plus tard.
- Contenu à couvrir (textes en français, courts, percutants, ton premium) :
  1. Accueil avec l'appel à jouer immédiatement.
  2. Le principe : les échecs + 3 cartes, une par tour.
  3. Les pouvoirs (les 11 cartes, mises en scène).
  4. Les skins d'animation et plateaux (cosmétiques uniquement, promesse « zéro pay-to-win »), avec mise en valeur.
  5. Les modes : défier un ami par lien **sans compte**, IA à 3 niveaux, parties classées Elo.
  6. Une conclusion avec appel à l'action et un pied de page (liens légaux).
- Le mode jeu doit **fonctionner** : clic → transition → partie jouable (coups et cartes) → bouton de retour.
- Responsive : bureau 1440 × 900 en priorité, vérifiez aussi le mobile 390 × 844 (transition et jeu adaptés).
- Performance : animez `transform` et `opacity`, respectez `prefers-reduced-motion`, n'animez pas WebGL hors écran.
- Vérification : `npx tsc --noEmit -p .` doit passer (le dossier `concepts` est inclus dans la vérification).

## Captures d'écran (obligatoires)

Outil : `node concepts/_tools/shoot.cjs scenario.json` (voir l'en-tête du fichier). Rangez les captures dans
`concepts/<slug>/shots/`. À fournir au minimum :

1. l'accueil (bureau) ;
2. trois à quatre positions de défilement montrant des **lieux** différents ;
3. le mode jeu après la transition (bureau), idéalement une seconde capture avec une carte sélectionnée ou un sort ;
4. l'accueil et le mode jeu sur mobile.

Le rendu WebGL est logiciel dans ce bac à sable : la 3D y est lente (une capture peut prendre plusieurs secondes),
les animations y paraissent saccadées. Ce n'est pas le cas sur un vrai appareil ; jugez la composition, pas la fluidité.

## Critères d'évaluation

Direction artistique cohérente et distinctive ; effet « waouh » dès le premier écran ; sensation de voyage entre des
lieux ; qualité typographique ; clarté du produit (on comprend en 5 secondes) ; transition vers le jeu ; conformité
au cahier des charges ; finition ; mobile.
