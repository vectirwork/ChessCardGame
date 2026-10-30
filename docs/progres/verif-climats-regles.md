# Progrès : vérification adverse, règles et moteur des Climats

Libellé : verif-climats-regles. Fichier de tests à moi : test/climats-adverse.test.ts (aucun autre fichier modifié).

## Fait
- Lecture du plan (docs/PLAN-ODYSSEE.md) et du journal cartes-moteur.md.

- Lecture de CARTES-GLOBALES.md, cards.ts, chess.ts, game.ts, tests existants.
- Sondes jetables dans scratchpad/verif (probe1.ts, fuzz.ts ; `npx tsx <fichier>` depuis le dépôt).
- Trouvé (prouvé en sonde) : (1) matériel insuffisant déclaré alors qu'un Mur en main permet Fd4# (K+F contre R) ;
  (2) checkKind dit 'melt' quand un Mur sans rapport fond alors que l'échec vient de la Chevauchée qui arrive.
- Fuzz 40 parties (cartes dès que possible) : aucune violation d'invariant.

- Fuzz 1000 parties (113 000 demi-coups) et 3000 positions clairsemées chargées de Murs : aucune violation d'invariant.
- Trouvé aussi (sonde probe2.ts) : (3) R4b contournée par un Présage d'Ère glaciaire (le lanceur réduit aux coups de
  pion pousse ensuite ses pions par R6, ceux de l'adversaire gelés) ; (4) Chevauchée annoncée => pat immédiat de
  l'adversaire (« pat par magie », Rh8 contre Ta7 Fh6).
- test/climats-adverse.test.ts écrit (tests ciblés + 2 fuzz agressifs). ÉCARTS attendus en échec : R4b/Présage,
  pat par Chevauchée, matériel insuffisant avec Mur, checkKind.

## Terminé
- test/climats-adverse.test.ts : 59 tests, 55 verts, 4 « ÉCART » en échec voulu (preuves) ; ≈ 63 s sous charge
  (parties au hasard : 130 depuis la position initiale + 300 positions clairsemées, cartes dès que possible).
- tsc : aucune erreur dans mon fichier (seule erreur connue : concepts/galerie/data.ts, hors flux).
- Aucun serveur ni navigateur lancé. Les processus `scratchpad/verif-srv/*` ne sont pas à moi (autre vérificateur).

## Écarts prouvés (tests « ÉCART »)
1. Pat par magie : Chevauchée annoncée, Noirs Rh8 contre Ta7 Fh6 : pat déclaré après Rc1-d1 (Rg8 jouable sans effet).
2. R4b contournée par le Présage : Ère glaciaire annoncée par un camp réduit aux coups de pion => ses pions avancent
   (R6) jusqu'à d8=D pendant que ceux de l'adversaire sont gelés.
3. Matériel insuffisant : R+F contre R déclaré nul (et canStillMate faux) alors qu'un Mur en main permet Mur g8 + Fd4#.
4. checkKind : 'melt' au lieu de 'arrival' quand un Mur sans rapport fond pendant l'arrivée d'une Chevauchée.

## Reste à faire
- Rien pour ce flux de vérification ; rapport rendu à l'orchestrateur.

## Décisions
- Les tests ÉCART acceptent les deux correctifs possibles quand il y en a deux (carte refusée, ou coup rendu).
- Invariants vérifiés au hasard : un roi par camp, pièces conservées (32), journal/ply/fullmove/keys cohérents,
  droits de roque et case e.p. cohérents, aucune pièce sur case bloquée, un Climat actif et un annoncé au plus,
  Terrains disjoints, aucune fuite de carte (vues, instantanés), roi du camp sans le trait jamais en prise,
  pas de coup en double, Trêve/Lune/Ère glaciaire respectées hors R6, hasLegalMove == legalMoves non vide,
  make/unmake exact (explosions comprises), explosions et Couronnement conformes, drapeau d'échec == sideInCheck,
  clé de position, aller-retour JSON.

## Commandes de vérification
- `cd /home/user/ChessCardGame && npx vitest run test/climats-adverse.test.ts`
- `npx vitest run test/climats-adverse.test.ts -t ÉCART` (les 4 preuves seules, < 1 s)
