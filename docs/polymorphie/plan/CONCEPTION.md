# Spellmate : conception finale « polymorphe »

*Synthèse du juge à partir des conceptions « centralise », « ruleset » et « donnees », et des 8 audits. J'ai vérifié les points de divergence dans le code, en lecture seule (HEAD `6ae7064`). Je n'ai lancé que deux petits calculs node. Rien n'a été vérifié dans un navigateur ni en production.*

---

## 0. Verdict et vérifications

**Base retenue : « donnees ».** C'est la plus simple pour le fondateur : une constante correspond à un réglage. Elle garde le sens de `cardPlayed`, corrige le choix des cartes du côté serveur et bloque une configuration impossible au build.

**Greffes :**
- **De « centralise » :**
  - n'écrire les règles dans une partie que si elles diffèrent de `RULES_V1`, pour que zéro octet change au défaut ;
  - règles par contexte ;
  - cartes suspendues ;
  - mode maintenance ;
  - photographies de traces de parties ;
  - validation au démarrage du serveur.
- **De « ruleset » :**
  - témoins capturés avant toute modification (relevé du texte des pages) ;
  - serveur jetable ;
  - carte de propriété contrôlée par script ;
  - `dist` de référence hors git pour le banc final ;
  - en-tête PGN des règles ;
  - garde de version de protocole.

**Écartés :**
- le registre de jeux de règles à identifiants : trop de cérémonie pour « quelques constantes » ;
- l'activation des mains cachées dès cette passe ;
- les deux rangées pour la main adverse ;
- `SeatView.look`, sans besoin aujourd'hui.

### Ce que j'ai vérifié dans le code

| Point de divergence | Constat | Conséquence |
|---|---|---|
| Sens de `cardPlayed` | 20 occurrences dans `src` (10 dans `game.ts`). Les lecteurs du client (`CardHand:278`, `think.ts:32`, `shell/cards.ts:18`, `useLiveGame:362`, R4c `game.ts:1125`, `cardPrecheck:660`) l'utilisent tous au sens « peut-on encore lancer une carte ». Seuls `castThisTurn` et deux messages l'utilisent au sens « une carte a été lancée ». | On garde `cardPlayed` = « budget du tour épuisé » et on ajoute un compteur `cardsThisTurn`. À 1 carte par tour, rien ne change. À 2, les lecteurs restent justes. Seuls les messages se réécrivent. |
| Règles pendant le choix | `newRoom` crée l'état dès le choix (`createGame` avec des mains vides, `games.ts:623`). | Le nombre de cartes se lit dans `rulesOf(d.state)`. `DraftData.count` est inutile. |
| Fin du choix | `closeDraft` (`games.ts:474-489`) met dans `auto` tout camp sans validation, même si sa sélection provisoire était complète. Le client n'écoute jamais l'événement `reveal` (`GamePage.process`). | Le serveur doit envoyer `filled`, c'est-à-dire les camps qui ont réellement reçu une carte au hasard. |
| Identité de l'éventail adverse | En node, `3 - 0.1*2 + 0.17` vaut `2.9699999999999998`, alors que `(90*3+27)/100` vaut exactement `2.97`. Les poses `r = 7t`, `y = 14t²` redonnent exactement `FAN`. | On ne garde que les formules exactes, avec un test d'égalité. |
| Plafond du tirage | Pouvoirs : 5 Climats (dont le Sablier) et 3 non-Climats. Avec « au plus 2 Climats », la plus grande main valide fait 5 cartes dans chaque réserve. | Au-delà de 5, `checkRules` refuse avec un message clair. |
| Barrière de déploiement | `deploy/update.sh` : `set -euo pipefail`, puis `build` avant `up`. | Un `checkRules` qui échoue dans `vite build` empêche la mise en ligne. |
| Sonde des Présages | `presageRefusal` applique deux `tickEffects` en dur (`game.ts:941`). | La sonde boucle sur `presageDelay` en alternant les camps, ce qui donne un résultat identique pour 2. |
| Pool de l'IA | `bot-pool.ts` n'a pas d'écouteur `exit` : un fil mort n'est jamais retiré, et chaque demande qui lui est confiée attend 20 s. | Défaut confirmé par lecture, à corriger dans le lot 3. |
| Boucle de l'IA | `maybeBot` se relance tant que l'IA garde le trait (`games.ts:743-747`). | Plusieurs cartes par tour passent par une liste `cards[]`, appliquée une à une avec une pause. |
| Appelants de `createGame` | Tous ceux de `src` passent un catalogue. Seul `pgn.ts:67` (FEN de l'analyse) retombe sur `'duel'` par inférence. | Rendre le catalogue obligatoire est sans risque. L'inférence devient une aide nommée. |
| Tests figés | `climats-adverse.test.ts:427` fige les clés des **instantanés**, pas celles de `GameState`. | Ajouter des champs facultatifs à `GameState` ne casse rien. On n'ajoute rien à `Snapshot`. |
| Sauvegarde de l'accueil | `validState` tolère les champs en plus et exige `catalog === 'climats'` en dur. | Le format v1 est conservé. On compare au catalogue de `HOME`. |
| HTML servi | `site.ts` calcule le HTML de chaque page une seule fois au démarrage. | Injecter la marque, les interrupteurs et le SEO ne coûte rien à l'exécution. |

---

## 1. Décisions clés

1. **Trois natures de réglages.**
   - **Règles de partie** (elles touchent la légalité) : photographiées dans `GameState.rules`. Si le champ est absent, ce sont les règles historiques `RULES_V1`, gelées pour toujours.
   - **Mise en place** (choix ou tirage, durée, R9, poids, cadence, Elo) : lue à la création. Son résultat est déjà stocké.
   - **Plate-forme et contenu** (délais, file, fonctions, marque, registres) : globaux.
2. **La photographie n'est écrite que si elle diffère de `RULES_V1`.** Au défaut, aucune partie, aucune vue, aucune sauvegarde ne change d'un octet.
3. **Relectures, reprises et sauvegardes** rejouent avec `state.rules ?? RULES_V1`, jamais avec les règles du jour.
4. **`cardPlayed` signifie « plus de carte possible ce tour ».** `cardsThisTurn` n'est écrit que si la partie permet plus d'une carte par tour.
5. **Un tableau de bord sans import à l'exécution** (`src/shared/config/*`). Le pied de page du paquet principal le lit sans tirer `game.ts`.
6. **Les textes chiffrés sont dérivés** par `text/fr.ts` (grammaire) et `text/regles.ts` (phrases). Des tests de référence exigent la chaîne actuelle au caractère près. Un garde-fou traque les littéraux restants, avec une dette par lot.
7. **Mises en page « à branche d'identité ».** Pour N ≤ 3, aucune valeur ni règle CSS ne change. Au-delà, les cartes rétrécissent dans la place réservée aujourd'hui. L'échiquier ne bouge jamais avec N.
8. **Une configuration impossible est refusée** au build, au démarrage du serveur et dans les tests, avec une phrase en français.
9. **18 défauts confirmés** sont corrigés dans cette passe (§6). Les mentions légales de production attendent les valeurs du fondateur.
10. **11 lots** : deux moitiés de socle en parallèle, puis quatre vagues de deux lots aux fichiers disjoints, puis une intégration menée seule (banc de performance compris).

---

## 2. Architecture

### 2.1 Modules

*Tableau mis à jour au lot 9c, tel que le code est construit (le plan d'origine prévoyait un seul `rules.ts`, sans
`rulesCore.ts`, `skins/texts.ts`, `vfx/boardMarks.ts` ni `FriendSheet.tsx`). Le guide des réglages est
`docs/REGLAGES.md`.*

| Module | Contenu | Imports à l'exécution | Lot |
|---|---|---|---|
| `src/shared/config/index.ts` | **Tableau de bord** : réexporte `rules`, `features`, `brand`, `limits`, `timings`, `home` (pas `routes`) ; une ligne de commentaire par réglage, y compris ceux des autres fichiers | config seulement | 0b, complété au 9b |
| `src/shared/config/rules.ts` | `Rules`, `RULES_V1` (gelé), `GAME_RULES`, `RULES_BY_CONTEXT`, `RULES_CONTEXTS`, `DEAL`, `SUSPENDED_CARDS`, `BOUNDS`, `deepFreeze` | aucun (`import type`) | 0b |
| `src/shared/config/features.ts` | `Features`, `FEATURES` (défauts), `FEATURE_KEYS`, `featureEnvName`, `mergeFeatures`, `featuresDiff` | aucun | 0b |
| `src/shared/config/brand.ts` | `BRAND` : nom, capitales, accroches, couleurs, variante PGN et préfixe de stockage (ces deux derniers ne sont lus nulle part : rappel des identifiants techniques) ; `pageTitle` | aucun | 0b |
| `src/shared/config/limits.ts` | `GUEST_NAME`, `USERNAME`, `PASSWORD` : bornes, expression, mots réservés, phrases | aucun | 0b |
| `src/shared/config/timings.ts` | `CINEMATIC_MS` 1200, `BOT_CARD_PAUSE_MS` 2300, `BOT_TIMEOUT_MS` 20 000 (lus par le serveur ; le navigateur a sa propre copie du délai de l'IA) | aucun | 0b |
| `src/shared/config/home.ts` | `HOME` : catalogue, pendule, `vsBot`, couleur, niveau, fenêtre d'appariement, seuil de 4 demi-coups, « Visiteur », sauvegarde, rythme de l'Oracle, repos | aucun (`import type`) | 0b |
| `src/shared/config/routes.ts` | `ROUTES` (chemin, module, propriétés, interrupteur), `PAGE_MODULES`, `PageProps`, `ROUTE_TITLES`, `NOT_INDEXED`, `routeOpen` | aucun (`import type`) | 6 |
| `src/shared/rulesCore.ts` | **noyau** des règles, lu par le moteur, l'IA et le client : `rulesFor(ctx)`, `rulesOf(s)`, `stampRules`, `sameRules`, `tuneOf`, `castsLeft`, `cardEndsTurn`, `poolOf`, `validHand`, `maxValidHand`, `canComplete`, `completionTarget`, `basicFenError`, `setRulesOverride` (tests de bout en bout) | `cards.ts`, `chess.ts`, config | 1 |
| `src/shared/rules.ts` | réexporte le noyau ; **validation** : `checkRules`, `parseRules`, `settingsErrors`, `tuningErrors`, `rulesSummary`. Importé par le serveur, `pgn.ts` et les tests, jamais par le code de l'accueil | `rulesCore.ts`, `cards.ts`, `chess.ts`, `protocol.ts`, `text/fr.ts`, config | 0b puis 1 |
| `src/shared/text/fr.ts` | `enLettres(n, genre)`, `cap`, `pluriel`, `compte`, `possessif`, `duree`, `mmss`, `ordinal`, `ordinalLettres`, `romain`, `liste`, `prix`, `nombre`, `apostrophes`, `LOCALE` | aucun | 0b |
| `src/shared/text/regles.ts` | phrases de règles partagées par au moins deux domaines (§4.2) | `fr.ts`, `config/rules.ts` | 0b, puis 9a |
| `src/shared/text/libelles.ts` | `colorName`, `catalogLabel` (un seul repli), `modeLabel`, `cardName` | aucun (`import type`) | 0b |
| `src/shared/botProtocol.ts` | `BotRequest`, `BotReply { card, cards[], move, error? }` (types) | aucun | 0b |
| `src/server/settings.ts` | `TIMINGS`, `RATING`, `MATCHMAKING`, `RELAY`, `BOT_RUNTIME`, `DATABASE`, `BOT_THREADS`, `PERSIST`, `LIMITS`, `ACCOUNT`, `FEATURES` (défauts fusionnés avec `FEATURE_*`), `FEATURE_ERRORS`, `dealSettings` | config, `node:fs` | 0b puis 3 |
| `src/server/config.ts` | variables d'environnement validées par zod, `SPELLMATE_TEST_RULES`, avertissements, `rulesReport` (règles vérifiées au démarrage) | zod, config, `rules.ts`, `protocol.ts`, `settings.ts` | 3 |
| `src/client/storageKeys.ts` | `KEYS`, `KEY_STORE` : valeurs actuelles **inchangées** | aucun | 0b, 9a |
| `src/client/components/boardGeometry.ts` | `squareAt(x, y, orientation)`, `cellOf(sq, orientation)` | aucun | 0b |
| `src/shared/skins/slots.ts` | `SLOT_DEFS` : libellés, accords, rayon, vue de la cabine, visible par l'adversaire, objet par défaut, colonne SQL | aucun | 2 |
| `src/shared/skins/texts.ts` | phrases de la boutique, du compte et des e-mails : `SLOT_TEXTS`, `itemWithArticle`, `equippedMessage`, `whoSees`, `selectionLabel`, `sealsIn` (hors du morceau du catalogue que charge l'accueil) | `slots.ts`, `catalog.ts`, `text/fr.ts` | 9a |
| `src/client/vfx/cardFx.ts` | `CARD_FX` exhaustif : mise en scène de chaque carte | `vfx/config.ts` | 4 |
| `src/client/vfx/boardMarks.ts` | `BOARD_MARKS` exhaustif : marques d'un effet actif sur l'échiquier | aucun (`import type`) | 4 |
| `src/client/vfx/config.ts`, `vfx/sharing.ts` | constantes des effets (rendu, particules, durées couplées au CSS) ; délais du partage des scènes | aucun | 4 |
| `src/client/sound.ts` | `CARD_SOUND` exhaustif | `storageKeys.ts` | 4 |
| `src/client/motion.ts` | mouvement réduit : une seule `MediaQueryList`, abonnable | aucun | 4 |
| `src/client/odyssee/FriendSheet.tsx` | feuille « Défier un ami », chargée à la demande (les cadences et le pseudo d'invité hors du premier affichage de l'accueil) | React, `cards.ts`, `protocol.ts`, `api.ts`, `store.tsx`, `parts` | 9a |
| `test/coherence.test.ts` | registres par carte, cadences, niveaux de l'IA, durées JS = CSS, seuil mobile, paquet principal, dettes vides | — | 9b |
| `test/fonctions.mjs` | interrupteurs sur un vrai serveur (boutique et classé coupés, cadences archivées) | — | 9b |
| `test/reglages-doc.test.ts` | `docs/REGLAGES.md` comparé au code : chemins, noms, valeurs par défaut, contenus masqués, messages | — | 9c |

**Registres enrichis :**
- `CARDS` : `ranks`, `clockRate`, `genre`, `retired` ;
- `CATALOG_RULES` dans `cards.ts` ;
- `TIME_CONTROLS` : `short`, `quick`, `invite`, `archived` ;
- `BOT_LEVELS` et `DEFAULT_BOT_LEVEL` dans `bot.ts` ;
- `PLACES` : `anchor` ;
- `packProducts` : `display` ;
- `Item` : `badge`, `retired` ;
- `Collection` : `sealName`.

### 2.2 Types

```ts
// src/shared/config/rules.ts — import type seulement
import type { CardId, Family, Rarity } from '../cards';

export interface CardTuning { coups?: number; ranks?: readonly number[]; clockRate?: number }

/** Règles qui touchent la légalité : photographiées dans la partie si elles diffèrent de RULES_V1. */
export interface Rules {
  schema: 1;
  cardsPerPlayer: number;    // 3
  cardsPerTurn: number;      // 1
  cardEndsTurn: boolean;     // false : la carte s'ajoute au coup (sauf Rituel)
  handsVisible: boolean;     // true ; false refusé par checkRules dans cette passe
  presageDelay: number;      // 2, pair
  fiftyHalfmoves: number;    // 100
  repetitions: number;       // 3
  startFen: string | null;   // null : position standard (roque standard seulement)
  tuning: Readonly<Partial<Record<CardId, CardTuning>>>; // copié depuis CARDS à la création
}

/** ← LE réglage des nouvelles parties. Pas de `as const` (types littéraux). */
export const GAME_RULES: Omit<Rules, 'schema' | 'tuning'> = Object.freeze({
  cardsPerPlayer: 3, cardsPerTurn: 1, cardEndsTurn: false, handsVisible: true,
  presageDelay: 2, fiftyHalfmoves: 100, repetitions: 3, startFen: null,
});

/** Essayer une variante dans un seul contexte. Vide : mêmes règles partout. */
export type RulesContext = 'classee' | 'amicale' | 'invitation' | 'ia' | 'accueil';
export const RULES_BY_CONTEXT: Partial<Record<RulesContext, Partial<typeof GAME_RULES>>> = {};

/** Mise en place des nouvelles parties : lue à la création seulement (le résultat est stocké). */
export const DEAL = Object.freeze({
  draft: true,                 // choix des cartes ; false : tirage partout (l'accueil tire toujours)
  draftMs: 45_000,
  handLimits: { maxPerRarity: { 'légendaire': 1 }, maxPerFamily: { climat: 2 } } as HandLimits, // R9
  limitsInDraft: false,        // R9 appliquée aussi au choix
  rarityWeight: { commune: 4, rare: 3, 'épique': 2, 'légendaire': 1 } as Record<Rarity, number>,
  redrawAttempts: 64,
});
/** Cartes retirées des nouvelles réserves sans annuler les parties en cours (≠ `retired`). */
export const SUSPENDED_CARDS: readonly CardId[] = [];
export const BOUNDS = { cardsPerPlayer: [1, 6], cardsPerTurn: [1, 3], presageDelay: [2, 6] } as const;

/** Règles des parties d'avant le versionnement. NE JAMAIS MODIFIER (test de figement). */
export const RULES_V1: Rules = deepFreeze({ schema: 1, cardsPerPlayer: 3, cardsPerTurn: 1, cardEndsTurn: false,
  handsVisible: true, presageDelay: 2, fiftyHalfmoves: 100, repetitions: 3, startFen: null,
  tuning: { hourglass: { coups: 6, clockRate: 2 }, truce: { coups: 3 }, blood_moon: { coups: 3 }, ice_age: { coups: 4 },
            blast: { coups: 4 }, rift: { coups: 4, ranks: [3, 4] }, ice_wall: { ranks: [2, 3, 4, 5] }, tide: { ranks: [1, 2, 3, 4] } } });
```

```ts
// src/shared/rules.ts
export function rulesFor(ctx: RulesContext): Rules;             // GAME_RULES + RULES_BY_CONTEXT[ctx] + tuning lu dans CARDS ; gelé, mémorisé
export const rulesOf = (s: { rules?: Rules }): Rules => s.rules ?? RULES_V1;
export function stampRules(r: Rules): Rules | undefined;        // undefined si sameRules(r, RULES_V1)
export function tuneOf(s: GameState, id: CardId): CardTuning;   // rulesOf(s).tuning[id] ?? valeurs de CARDS (cartes du Duel)
export const castsLeft = (s: GameState) =>
  s.cardPlayed ? 0 : Math.max(0, rulesOf(s).cardsPerTurn - (s.cardsThisTurn ?? 0));
export const cardEndsTurn = (def: CardDef, r: Rules) => !!def.ritual || r.cardEndsTurn;
export function validHand(hand: readonly CardId[], l: HandLimits): boolean;
export function maxValidHand(pool: readonly CardId[], l: HandLimits): number;  // 5 aujourd'hui
export function checkRules(): string[];       // chaque contexte × chaque réserve ; [] si jouable
export function setRulesOverride(p: Partial<typeof GAME_RULES> | null): void; // serveur jetable, refusé en production
```

```ts
// src/shared/game.ts : ajouts facultatifs
interface GameState {
  /** Plus aucune carte possible ce tour (budget épuisé). Sens de lecture inchangé. */
  cardPlayed: boolean;
  /** Cartes jouées ce tour ; écrit seulement si rulesOf(s).cardsPerTurn > 1. */
  cardsThisTurn?: number;
  /** Règles photographiées ; absent : RULES_V1. */
  rules?: Rules;
}
type RefusalCode = 'game-over' | 'not-your-turn' | 'card-budget' | 'card-unknown' | 'card-used' | 'target-missing'
  | 'target-invalid' | 'needs-clock' | 'climate-pending' | 'no-pawn' | 'must-capture' | 'checks-king' | 'leaves-check'
  | 'no-move' | 'no-move-on-arrival';
type Outcome<I> = { ok: true; state: GameState; info: I } | { ok: false; error: string; code?: RefusalCode };
createGame(hands, timed, catalog /* obligatoire */, opts?: { rules?: Rules });
castsThisTurn(s, color): CardId[];            // cartes lancées depuis le dernier coup (remplace castThisTurn)
```

```ts
// src/shared/cards.ts
export const CATALOG_IDS = ['climats', 'duel', 'aucune'] as const;
export interface CatalogRules { offered: boolean; magicYields: boolean; globalEffects: boolean; draw: 'uniforme' | 'pondéré';
  wallAnyRank: boolean; snapshots: boolean; terrainMate: boolean; cinematicCredit: boolean }
export const CATALOG_RULES: Record<Catalog, CatalogRules>; // remplace les 7 comparaisons de game.ts et games.ts:369
export const DEFAULT_CATALOG = 'climats'; export const LEGACY_CATALOG = 'duel'; // LEGACY : états sans catalogue seulement
```

**Ajouts à `protocol.ts`, tous facultatifs, posés par le lot 0b puis gelés :**
- `PROTOCOL_VERSION = 1` ;
- `TimeControlDef` avec `short`, `quick`, `invite`, `archived` ;
- `QUICK_CONTROLS`, dérivé de `quick` (même liste) ;
- `DEFAULT_QUICK = '10+0'` ;
- `tcLabel(idOuPendule)`, un formateur unique à la place des 7 actuels ;
- `DraftView.totalMs?` ;
- événement `reveal` : `{ auto, filled? }` ;
- `MeResponse.features?` et `MeResponse.version?` ;
- événement `server:outdated` ;
- `PAYMENTS_MODES` et le type `PaymentsMode`.

### 2.3 Cycle de vie d'une partie

1. **Création.**
   - Serveur : `newRoom({ …, ctx })`. Accueil local : `newGame()` avec `'accueil'`.
   - Les deux appellent `createGame(…, { rules: rulesFor(ctx) })`, qui écrit `s.rules = stampRules(r)`. Au défaut, c'est `undefined`.
   - Les leçons, les problèmes, les démonstrations et la cabine passent `{ rules: RULES_V1 }` : leurs solutions ont été écrites pour ces règles.
2. **Choix des cartes.**
   - `draftView.count = rulesOf(d.state).cardsPerPlayer`, et `totalMs = DEAL.draftMs`.
   - À la clôture, le serveur envoie `reveal { auto, filled }`.
   - Après un redémarrage, l'échéance repart entière, comme aujourd'hui.
3. **Jeu.** Le moteur ne lit les règles que dans `game.ts` (`rulesOf`, `tuneOf`), aux points d'entrée. Jamais dans `chess.ts`, dans la recherche de l'IA ni dans `positionKey`.
4. **Vue.** L'état part tel quel. Le client s'adapte partie par partie avec `rulesOf(view.state)`.
5. **Reprise.** L'état porte ses règles, ou rien du tout s'il date d'avant : il suit alors V1. Un `schema` inconnu fait annuler la partie avec un message explicite.
6. **Relecture.**
   - `initialStateOf(final)` passe `rulesOf(final)`. L'Analyse des parties locales fait de même : `history.ts` garde `rules`.
   - L'export PGN ajoute `[SpellmateRules "…"]` seulement si les règles diffèrent. L'import relit cette balise.
7. **Revanche.**
   - Nouvelle partie, donc règles **du moment** de son contexte (voir la décision Q3).
   - Pendule reprise de `d.clock` (initial et incrément).
   - Mise en place ordinaire, comme avant la passe : la revanche d'une partie relayée de l'accueil est une partie
     amicale avec le choix des cartes, sans relais (lot 9f ; reprendre les mains tirées et le relais changeait le site
     au défaut).
8. **Sauvegarde de l'accueil.** Format v1 inchangé. `validState` rejette une sauvegarde si son catalogue diffère de `HOME.catalog`, si `sameRules(rulesOf(s), rulesFor('accueil'))` est faux, ou si les mains n'ont pas la bonne taille. La partie repart alors de zéro.
9. **Onglet resté ouvert.** Le client envoie `PROTOCOL_VERSION` à la connexion. En cas d'écart, le serveur répond `server:outdated` et le client recharge, avec la garde d'une minute de `main.tsx`. Un test fige `{ version, ids des cartes, catalogues, cadences, GAME_RULES, DEAL.draftMs }` : si l'un change sans montée de version, il échoue.

### 2.4 Cartes par tour, carte à la place du coup

**Lancement d'une carte.** On calcule `k = (s.cardsThisTurn ?? (s.cardPlayed ? 1 : 0)) + 1`, puis `n.cardPlayed = k >= cardsPerTurn`. `n.cardsThisTurn = k` n'est écrit que si `cardsPerTurn > 1`.

**Fin du tour.** `finishTurn` et la sonde des Présages remettent `cardPlayed` à faux et effacent `cardsThisTurn`. Les instantanés du Duel ne changent pas, car le Duel suit V1.

**Carte à la place du coup** (`cardEndsTurn`).
- On extrait `passTurn(n, color, { pawnPush })` du cas de la Marée (`game.ts:836-839`).
- Toute carte qui termine le tour appelle `passTurn` puis `finishTurn`, et subit les garde-fous du Rituel.
- `commitCard` décide de l'incrément avec `cardEndsTurn(CARDS[card], rulesOf(state))`. On n'ajoute aucun champ à l'information de la carte : au défaut, c'est exactement `info.ritual`.
- Une carte hors Marée compte comme un demi-coup pour la règle des 50 coups (décision Q6).

**IA.** `decideTurn(s, level, { cards = true })` est partagé par le serveur et le client. Il boucle tant que `castsLeft > 0` et qu'une carte est jugée utile, dans un seul budget de temps, et rend `{ cards[], move }`. Le fil de calcul répond `{ card: cards[0] ?? null, cards, move }`, ce qui reste compatible pendant la transition.

### 2.5 Validation

`checkRules()` vérifie :
- les bornes de `BOUNDS` ;
- `cardsPerTurn ≤ cardsPerPlayer` ;
- `cardEndsTurn` implique `cardsPerTurn === 1` ;
- `presageDelay` pair ;
- `handsVisible === true` (dans cette passe) ;
- `startFen` valide, avec roque standard ;
- les rangées entre 0 et 7 ;
- `cardsPerPlayer ≤ taille de la plus petite réserve` pour chaque contexte en choix des cartes ;
- `cardsPerPlayer ≤ maxValidHand(réserve, DEAL.handLimits)` pour chaque contexte tiré : l'accueil, toujours, et tous les contextes si `DEAL.draft` vaut faux.

Exemple de message : « 6 cartes par joueur à l'accueil : impossible avec au plus 2 Climats, la réserve n'a que 3 cartes qui ne sont pas des Climats (main valide maximale : 5). Relevez DEAL.handLimits.maxPerFamily.climat, ou réglez RULES_BY_CONTEXT.accueil. »

Elle est appelée à trois endroits :
- **au build**, par un greffon Vite (lot 6) : `deploy/update.sh` s'arrête alors avant de remplacer la version en ligne ;
- **au démarrage du serveur** (lot 3) : arrêt avec le message, et une ligne de journal qui résume les règles ;
- **dans les tests** (`config.test.ts`).

### 2.6 Interrupteurs, marque, paiements

**Interrupteurs.**
- Défauts dans `FEATURES` : `ranked`, `friendlyQueue`, `invites`, `botGames`, `guestPlay`, `live`, `homeDuel`, `homeRelay`, `puzzles`, `learn`, `analysis`, `shop`, `newGames` (maintenance). Ils sont tous vrais.
- Le serveur les fusionne avec `FEATURE_*` (validées par zod) et **refuse** ce qui est coupé.
- `site.ts` injecte `<meta name="sm-features">` **seulement si** une valeur diffère des défauts. Le client n'a donc aucun flash, et le HTML reste identique au défaut.
- `/api/me` renvoie aussi `features` (utile en développement). Le client lit `useFeature(k)`.

**Marque.**
- `BRAND` alimente `Layout`, un `useTitle` unique, le partage, le PGN, et le défaut de `config.appName`.
- Un greffon Vite produit `index.html` et le manifeste, **identiques octet pour octet** au défaut.
- Les identifiants techniques ne sont **jamais** renommés : `sm:`, `sm_session`, `sm_guest`, base `spellmate`, `/opt/spellmate`, variante PGN « Spellmate ».

**Paiements.** `PAYMENTS_MODE` est validé (une valeur inconnue est refusée). En mode `stripe` sans secret de webhook, le serveur avertit.

---

## 3. Ce qu'on change demain

| Scénario du fondateur | Changement | Ce qui suit tout seul | Garde-fous |
|---|---|---|---|
| 3 → 5 cartes (ou 1, 2) | `GAME_RULES.cardsPerPlayer = 5` | tirage, choix, IA, contrôles, vue, textes (« cinq cartes », « votre carte » pour 1), éventails, choix des cartes, mini-main | les parties en cours gardent 3 cartes ; 6 cartes sont refusées au build tant que R9 n'est pas relevée ; leçons et problèmes figés en V1 et masqués si `requires` contredit |
| 5 cartes en amicale seulement | `RULES_BY_CONTEXT.amicale = { cardsPerPlayer: 5 }` | — | validé comme les autres ; les files classée et amicale sont déjà séparées |
| 2 cartes par tour | `GAME_RULES.cardsPerTurn = 2` | moteur, IA (boucle), serveur (pause entre deux cartes), consignes, liste « sorts lancés » | matrice de tests ; unicité des problèmes jusqu'à 2 cartes |
| Carte à la place du coup | `GAME_RULES.cardEndsTurn = true` | pastilles « Remplace votre coup », messages, incrément | impose 1 carte par tour ; problèmes « carte puis coup » masqués |
| Choix en 30 s | `DEAL.draftMs = 30_000` | échéance, barre (`totalMs`), textes | à ne pas confondre avec `TIMINGS.firstMoveMs`, qui vaut aussi 45 s |
| Supprimer le choix, tirage partout | `DEAL.draft = false` | création, textes « vos cartes sont tirées au hasard » | — |
| 9e carte | entrée dans `DEFS` (`cards.ts`) ; le compilateur exige `CARD_FX`, la scène, l'art, le son, `DRAFT_VALUE` ; un `case` moteur si la mécanique est nouvelle ; `PROTOCOL_VERSION` +1 (le test le réclame) | « huit » devient « neuf », grille du choix à 5 colonnes, cabine, lieu de l'accueil, R9 revalidée | — |
| Suspendre une carte défectueuse | `SUSPENDED_CARDS = ['blast']` | réserves, tirage, choix | les parties en cours continuent |
| Retirer une carte | `retired: true` | sortie des réserves ; relectures complètes | ne jamais supprimer ni recycler l'identifiant |
| Nouveau catalogue | entrée `CATALOG_RULES` et `CATALOG_IDS`, `catalogs` sur ses cartes | zod, PGN, `offeredCatalog`, libellé | — |
| Mains cachées | réservé (§6.4) | — | `checkRules` refuse `false` |
| R9, poids du tirage | `DEAL.handLimits`, `DEAL.rarityWeight` ; R9 au choix : `DEAL.limitsInDraft = true` | tirage, IA, refus immédiat dans le choix, texte des Règles, fréquences attendues (calculées) | une main valide doit exister dans chaque réserve |
| Rééquilibrer une carte | `coups`, `ranks` ou `clockRate` dans `cards.ts` | textes des cartes, frise de la Trêve, leçons, phrase « qui reprend les captures le premier » (parité) | les anciennes parties gardent l'ancienne valeur ; rangées du Mur changées : nulle par matériel insuffisant en mode prudent |
| Nouvelle cadence | une ligne `TIME_CONTROLS` (`quick`, `invite`) | libellés partout, file, invitation | — |
| Retirer une cadence | `archived: true` | revanche et relecture la résolvent encore | une cadence inconnue est refusée (plus de partie « sans pendule » silencieuse) |
| Délais | `TIMINGS.*` ; échéance de revanche : `TIMINGS.rematchTtlMs` (null aujourd'hui) | vues (`claimAfterMs`, échéances) | tests qui importent les constantes |
| Classement | `RATING.*` ; couper le classé : `FEATURE_RANKED=0` ; appariement : `MATCHMAKING` | porte, menu, classement, carte de fin | le DEFAULT SQL n'est pas touché : l'INSERT passe la valeur |
| Niveau d'IA | entrée `BOT_LEVELS`, `BOT_PROFILES` ; le compilateur exige `DRAFT_NOISE`, `BOT_LOOK`, les descriptions | zod, grille de Jouer, « 4 niveaux », listes | un niveau inconnu dans une partie enregistrée prend le défaut ; plus de relance sans fin |
| Accueil | `HOME.*`, `RULES_BY_CONTEXT.accueil` ; nouveau lieu : `PLACES`, `PoseKey`, `poseFor`, une scène, un ciel | textes chiffrés, numéros des portes | ajouter un lieu reste un travail de design |
| Boutique | emplacement : `SLOT_DEFS`, une migration, un dessin ; rareté : `RARITY`, `PRICE` ; pack : `packProducts` avec `display` ; vente : `PAYMENTS_MODE` ; masquer : `FEATURE_SHOP=0` | rayons, panoplie, textes, e-mail, colonnes | Trésor : décision Q2 |
| Marque | `BRAND`, et `APP_NAME`, `PUBLIC_URL`, `MAIL_FROM`, `LEGAL_*` | index.html, manifeste, titres, pied de page, partage, canonical, og:url | image de partage régénérée seulement sur décision |
| Fonctions | `FEATURES` ou `FEATURE_*` ; maintenance : `FEATURE_NEW_GAMES=0` | serveur, menus, routes, liens | — |
| Position de départ | `GAME_RULES.startFen` | création, relecture, PGN, flèche d'invite | roque standard seulement |
| Traduction un jour | rien (repérage §4.4) | — | — |

---

## 4. Textes

### 4.1 Mécanisme

- **`text/fr.ts`** remplace les copies actuelles :
  - `WORDS` de `CardDraft`, féminin sans accord, d'où « vos une cartes » ;
  - les 3 `plural` ;
  - les 4 `mm:ss` ;
  - `PageScene.ordinal` ;
  - les chiffres romains en liste ;
  - les 17 `'fr-FR'` écrits en dur.
- **`text/regles.ts`** contient les phrases partagées par au moins deux domaines. Chaque fonction prend `r = rulesFor(...)` ou `rulesOf(state)`.
  - Les pages calculent leurs phrases **au niveau du module**.
  - La partie et l'accueil les mémoïsent par objet de règles.
  - Rien n'est calculé dans un rendu fréquent.
- **Phrases propres à un domaine** (choix des cartes, accueil, boutique) : elles vivent dans ce domaine, construites avec `fr.ts`, avec leurs propres tests de référence. Seul le lot 0b écrit `text/regles.ts`. Les doublons apparus en cours de route remontent au lot 9.
- **Textes des cartes** (lot 1). `description`, `duration` et `prompts` sont produits à la construction de `CARDS` par des gabarits :
  - `dureeEffet(3)` donne « 3 coups (vous, lui, vous) », et `dureeEffet(4)` « 4 coups (2 chacun) » ;
  - `quiReprend(coups)` change de phrase selon la parité ;
  - `arriveePresage(delay, genre)` ;
  - `rangees([2,3,4,5])` donne « entre la 3e et la 6e rangée ».

  La référence `test/fixtures/v1/cartes.json` doit être reproduite au caractère près. `cardText(id, rules)` sert aux bulles d'une partie dont l'équilibrage diffère.
- **Refus du moteur.** Ils gardent leur texte et gagnent un `code`. Le client teste le code (`shell/cards.ts:25` comparait le texte). `draftRefusal` devient `Choisissez ${compte(n, …)}.` : identique pour 3 cartes, « 1 carte » au lieu de « 1 cartes ».
- **Garde-fou.** `test/garde-fous/textes-chiffres.test.ts` parcourt `src`, `index.html` et le manifeste à la recherche de `trois (cartes|sorts)`, `un sort par tour`, `une seule carte par tour`, `45 secondes`, `huit (pouvoirs|cartes)`, `3 niveaux`, `deux Climats`.
  - Chaque occurrence doit figurer dans `dette-<lot>.txt`. Chaque lot vide la sienne.
  - Le motif `Spellmate` a sa liste d'exceptions **permanentes** : identifiants techniques, variante PGN, noms des fils de calcul.

### 4.2 Phrases partagées : sortie au défaut identique à aujourd'hui

| Fonction | Défaut | Exemple avec un autre réglage | Emplacements |
|---|---|---|---|
| `cartesDePouvoir(r)` | « trois cartes de pouvoir » | « une carte de pouvoir » | index.html:7, 14 ; manifeste:4 ; Layout:241 ; OdysseeHome:1202 ; Rules:213 ; Play:200 ; overlays:127 ; lessons:435 |
| `cartesChacun(r, cap?)` | « Trois cartes chacun » | « Une carte chacun » | Rules:22, 105 ; lessons:430 |
| `vosCartes(r)` | « vos trois cartes » | « votre carte » | Rules:25 ; Play:291 ; lessons:435 ; data.ts:149 |
| `vosSorts(r)` / `sortsEnMain(r)` | « Vos trois sorts » / « Trois sorts » | « Votre sort » | OdysseeHome:1234, 1242, 1334 |
| `sortParTour(r, cap?)` | « un sort par tour » | « deux sorts par tour » ; « un sort par tour, à la place du coup » | OdysseeHome:1202 ; Rules:32 ; data.ts:153 ; index.html:14 |
| `mainLabel(r)` | « Votre main · un sort par tour » | — | GameShell:593 ; GamePage:826 |
| `consigneTour(r)` | « Une seule carte par tour, toujours avant le coup. » | « Deux cartes au plus par tour, avant le coup. » | GamePage:576 |
| `refusBudget(r)` | « Une seule carte par tour. » | « Deux cartes par tour au plus. » | game.ts:660 ; OdysseeHome:1644, 1649 |
| `dejaLance(r)` | « Un seul sort par tour : vous en avez déjà lancé un. » | « Deux sorts par tour : vous les avez déjà lancés. » | shell/cards.ts:18 |
| `apresLancement(r, annonce, reste)` | « Sort lancé. Jouez maintenant votre coup. » / « Annoncé : arrive au début de votre prochain tour. Jouez maintenant votre coup. » | « Sort lancé. Un autre sort, ou jouez votre coup. » | shell/cards.ts:44-48 |
| `dureeChoix()` | « 45 secondes » | « 30 secondes » | Rules:117 ; Play:291 |
| `constitutionMains(r)` | phrase actuelle « vous choisissez… ; sur l'accueil, elles sont tirées au hasard » | avec `draft: false` : « vos trois cartes sont tirées au hasard » | Rules:25, 117, 121 ; Play:289-294 ; lessons:435 ; data.ts:149 |
| `limitesMain()` | « au plus deux Climats par main » | ajoute la Légendaire si une Légendaire existe | Rules:117 |
| `pouvoirs(n, cap?)` / `cartesDuCatalogue(n)` | « huit pouvoirs » / « huit cartes » | « neuf pouvoirs » | cards.ts:45 ; Rules:105, 117, 210, 218, 284, 287 ; lessons:456, 460, 464 ; Puzzles:110 |
| `niveauxIA(n)` / `nomsNiveaux()` | « 3 niveaux » / « Apprenti, Sorcier ou Archimage » | « 4 niveaux » | Play:34 ; data.ts:169-170 ; Layout:42 |
| `regle50(r)` / `repetition(r)` | « Règle des 50 coups » / « Triple répétition » | « Règle des 75 coups » | RESULT_TEXT ; Rules:18-19 |
| `vitesse(rate)` | « deux fois plus vite » | « trois fois plus vite » | parts:127 ; cardScenes:220 ; cards.ts:122 |

### 4.3 Défauts de texte corrigés (changement voulu)

« 1 étapes » et l'aria « 1 leçons terminées » (Learn.tsx:65, 82), « 1 coups » (MyGames.tsx:162). Restent latents, tant que N ne vaut pas 1 : « Choisissez 1 cartes. » et « vos une cartes ».

### 4.4 Traduction un jour : repérage, sans i18n

- **Moteur** : environ 30 refus, désormais codés ; `RESULT_TEXT` ; `describeCardPlay` ; contenu de `CARDS`.
- **Serveur** : environ 87 messages (games.ts 36, shop.ts 22, auth.ts 17, account.ts 9), les e-mails, la langue de Stripe (`locale 'fr'`).
- **Interface** : environ 280 lignes dans la partie, 130 sur l'accueil, 1 000 dans les pages.
- **Grammaire propre au français** : `fr.ts`, `deNom`, `country.ts`, la notation SAN française, des titres découpés autour de `<em>`.

Les préparatifs de cette passe : codes de refus, `fr.ts`, `LOCALE` unique, données de cartes et d'objets déjà centralisées.

---

## 5. Mises en page selon N (de 1 à 6)

**Règle commune.**
- `gameLayout(vw, vh)`, `desktopHandRight` et `DESKTOP_OPP_ROOM` ne changent pas : l'échiquier ne bouge jamais avec N, et `engine.ts` n'est pas touché.
- N se déduit des mains reçues (`max(hand.length, oppHand.length)`) : aucune prop nouvelle.
- Pour N ≤ 3, **aucun attribut, aucune variable, aucune classe nouvelle**. Au-delà, l'attribut `data-crowd` et des variables en ligne activent de **nouvelles** règles CSS, sans toucher aux règles existantes.

| Élément | Formule (N = 3 donne exactement l'existant) | Valeurs calculées pour N > 3 (à valider en capture) |
|---|---|---|
| Poses de l'éventail | `t = n ≤ 1 ? 0 : 2i/(n−1) − 1` ; `{ r: 7t, y: 14t² }` ; arrivée `28t` (remplace `FAN[i % 3]` et `[-28, 0, 28]`) | une carte seule devient droite (aujourd'hui −7°) |
| Votre main, ordinateur | `w(n) = (3,1·w₃ + 18(n−3)) / (n + 0,1)`, avec `w₃ = clamp(112, 9vw, 138)` et un chevauchement de −18 px inchangé | 1280 px de large : 91 / 77 / 67 px (N = 4 / 5 / 6) |
| Votre main, mobile | `w = max(60, min(88, (240 + 12(n−1))/n))` ; si la main ne tient pas, le chevauchement grandit ; même formule avec une base de 72 sur les écrans bas | 69 / 60 (chevauchement −15) / 60 (−24) |
| Main adverse, ordinateur | `oppFanSpan(n) = n ≤ 3 ? (90n+27)/100 : (70n+47)/100` ; borne basse 44 px, ou 36 au-delà de 3 ; `oppCardWidth(l, vw, n)` exportée de `layout.ts` (le test cesse de la recopier) | 1280 × 720 : 60 / 49 / 42 px |
| Main adverse, mobile | cartes de 34 px, rien à changer | — |
| Réserve du choix | `--cols = clamp(2, 5, ⌈réserve/2⌉)`, posé seulement si la réserve ≠ 8 | 9 cartes : 5 colonnes, sans défilement en 1280 × 720 |
| Révélation des mains | N > 3 : `--w = min(clamp(96, 10vw, 128), ((min(980, 100vw−32) − 72)/2 − 12(n−1))/n)` ; mobile : `min(92, (100vw − 32 − 12(n−1))/n)` ; donne `k·n + i` | 104 / 81 / 66 px |
| Raccourcis du choix | touches et numéros pour les 9 premières tuiles seulement | — |
| Mini-main de l'accueil | N > 3 : les cartes gardent leur taille et se chevauchent dans la largeur actuelle de 3 cartes ; sortie bornée sous 0,42 s | −23 px pour 5 cartes de 54 px |
| Grilles des pages | `repeat(var(--n, valeur actuelle))` pour les règles, la frise, les formules, les niveaux d'IA, la panoplie | — |

Des captures de revue pour N = 1, 2, 4, 5 et 6 sont fournies au fondateur, sur 1280 × 720, 1440 × 900, 375 × 667 et 360 × 640.

---

## 6. Stabilisation

### 6.1 Défauts confirmés corrigés dans cette passe

| # | Défaut | Lot |
|---|---|---|
| 1 | File d'attente : liste lue avant `await userById` (double appariement, entrée perdue, joueur parti apparié) | 3 |
| 2 | Assise d'une invitation écrasée après `await seatFor` | 3 |
| 3 | `pg.Pool` sans écouteur `'error'` : un redémarrage de Postgres fait tomber le processus | 3 |
| 4 | Spectateurs de `/live` comptés « sockets − 2 » | 3 |
| 5 | Fil de calcul de l'IA mort, gardé dans la rotation (confirmé à la lecture de `bot-pool.ts`) | 3 |
| 6 | Objet retiré par l'administrateur qui reste équipé | 2 |
| 7 | Salle d'attente avec cartes : « Partie sans cartes » sous « un sort par tour » | 5 |
| 8 | Fin du choix : « tirées au hasard » alors que la sélection était complète | 3 et 5 |
| 9 | Validation tardive : une carte tirée sans message (`auto` deviné) | 5, avec le 3 |
| 10 | Émotes : la minuterie de la première efface la seconde | 5 |
| 11 | Accueil avec les Noirs : halo et curseur sur la pièce adverse | 7 |
| 12 | `startDuel` : partie contre l'Oracle affichée retournée, mains inversées | 7 |
| 13 | Page blanche (pas de limite d'erreur ; `lazy` garde le rejet) | 6 |
| 14 | « Failed to fetch » affiché en anglais | 6 |
| 15 | Mentions légales de production restées en modèles | 3, puis le fondateur |
| 16-18 | « 1 étapes », « 1 leçons », « 1 coups » | 8 |

### 6.2 Fragilités traitées (valeur haute, risque maîtrisé)

- **Lot 1 :**
  - sonde des Présages couplée au délai ;
  - `WALL_MATE_PAIRS` utilisée seulement avec les rangées par défaut ;
  - 7 comparaisons d'identifiant de catalogue ;
  - `offeredCatalog` qui avale un catalogue inconnu ;
  - catalogue par défaut `'duel'` ;
  - décision de l'IA en double ;
  - refus comparés par leur texte ;
  - `CardDef.catalog` mort.
- **Lot 3 :**
  - cadence inconnue transformée en partie sans pendule ; revanche relue dans `d.tc` ;
  - relance sans fin de l'IA (niveau inconnu, échecs) : compteur d'échecs puis coup légal au hasard ;
  - configuration non validée ;
  - `verifyPassword` qui ignore le N stocké ;
  - `/api/health` qui crée un cookie ;
  - DEFAULT SQL de l'Elo et de l'équipement : valeurs explicites dans l'INSERT ;
  - version de protocole ;
  - `persistResult` jamais retenté (facultatif, en fin de lot).
- **Lot 4 :**
  - ambiances CSS retirées par une minuterie aveugle ;
  - `useVfx` sans `catch` ;
  - `playArrival` sans cibles.
- **Lot 5 :**
  - `CardHand` qui recopie la règle ;
  - `noIncrement` et `standIn` jamais affichés ;
  - libellés de cadence arrondis ; pendule sans heures ;
  - numérotation qui ignore `fullmove`.
- **Lot 6 :**
  - `api()` sans délai maximal ;
  - échec de `/api/me` pris pour une déconnexion ;
  - rechargement complet si three.js échoue ;
  - `emitAck` en `any` ;
  - cookie d'invité absent avant le socket : posé aussi sur le HTML.
- **Lot 7 :**
  - `dealHands` sans `vsBot` ;
  - `validState` avec le catalogue en dur ;
  - `hands.b` ;
  - état `thinking` inutile (deux rendus de tout l'accueil par tour de l'IA) ;
  - socket ouvert avant `/api/me`.
- **Lot 8 :** problème du jour qui change quand on ajoute un problème.
- **Lot 2 :**
  - pack absent de la boutique ;
  - bandeau du Trésor à 7 sceaux en dur ;
  - ordre de la cabine en dur.

### 6.3 Refontes faites maintenant

- règles photographiées ;
- `CATALOG_RULES` ;
- compteur de cartes ;
- `passTurn` ;
- `decideTurn` ;
- réglages du serveur nommés ;
- `elo()` pur et testé ;
- configuration zod ;
- interrupteurs ;
- textes dérivés ;
- fonctions d'éventail ;
- `SLOT_DEFS` et fonctions génériques d'emplacement ;
- marchandisage en données ;
- `PLACES` comme source unique (attributs `data-scene` et `data-place` **conservés**, générés) ;
- `CARD_FX` et `CARD_SOUND` exhaustifs ;
- traits des skins en tables ;
- registre des clés de stockage ;
- `ROUTES` (métadonnées ; les `import()` restent littéraux) ;
- code mort retiré : objets persistants des effets (environ 250 lignes), `SkinPreview` et `DemoBoard`, CSS orphelin, `levelName`, `shortDuration`, `premoveSources` ;
- `concepts/` sorti de la vérification de types principale.

### 6.4 Écartés ou différés

Voir la liste `deferred`. Les principaux :

- **Mains cachées.** Fuites par R4c et par le matériel insuffisant, IA qui voit tout, type `card: CardId | null` dans tout le client, dos de carte à dessiner. Il faudra un lot dédié.
- **Chess960.**
- **Découpage de `games.ts`**, après la passe.
- **Jetons de couleur.**
- **Hook commun `useCardPlay`.**
- **i18n complète.**
- **Densité des effets réglable.**

---

## 7. Plan en lots

### 7.1 Règles de travail

- **Worktrees.** Une branche `polymorphie/<lot>` par lot, partant de la branche d'intégration à jour.
- **Agents.** **Au plus 2 en même temps.**
- **Possession des fichiers.**
  - Chaque fichier appartient à un seul lot, à la fois. Exceptions : la colonne `sharedFiles`, où un fichier est touché par un lot puis cédé au suivant, toujours dans des vagues différentes.
  - `docs/polymorphie/LOTS.json` contient la carte de possession. `node scripts/verifier-lot.mjs <lot>` compare `git diff --name-only` à cette carte.
- **Fichiers gelés après le socle :** `protocol.ts`, `src/shared/config/*` (sauf `routes.ts`, créé par le lot 6) et `text/regles.ts`. Tout besoin nouveau est noté dans le rapport du lot et traité au lot 9.
- **Ordre dans un lot :**
  1. tests de caractérisation, verts sur le code d'avant ;
  2. refonte à comportement identique ;
  3. correctifs ;
  4. capacité nouvelle derrière un réglage.
- **« Fini » veut dire :**
  - `npx tsc --noEmit -p .` ;
  - `npm run test:rapide`, puis `npm test` avant de rendre ;
  - `verifier-lot` ;
  - dette du garde-fou vidée pour ses fichiers ;
  - relevé du texte et captures identiques aux témoins (sauf les corrections listées) pour les écrans touchés ;
  - aucune nouvelle dépendance.
- **Pas de banc de performance pendant les vagues.** Les captures, déterministes, sont permises. La campagne de mesure a lieu au lot 9, machine au repos.

### 7.2 Vagues

| Vague | Lots (en parallèle) | Fichiers |
|---|---|---|
| 0 | **0a** témoins et outillage ∥ **0b** contrats et réglages | 0a : `test/`, `scripts/`, `vite.config.ts` (bloc test), `package.json` ; 0b : `src/shared/config`, `text`, `rules.ts`, types, `protocol.ts` |
| 1 | **1** moteur et IA ∥ **2** boutique | disjoints |
| 2 | **3** serveur ∥ **4** effets, échiquier, sons | disjoints |
| 3 | **5** partie et coque ∥ **6** socle client, marque, routes, SEO | disjoints |
| 4 | **7** accueil ∥ **8** pages et contenu | disjoints |
| 5 | **9** intégration (seul) | liens entre lots, banc de performance |

### 7.3 Passages de fichiers d'un lot à l'autre

- `game.ts`, `cards.ts`, `bot.ts`, `shared/rules.ts` : 0b, puis 1.
- `catalog.ts` : 0b (type de `BOT_LOOK`), puis 2.
- `store.tsx` : 0b (`useFeature`), puis 6.
- `settings.ts` : 0b, puis 3.
- `vite.config.ts` : 0a, puis 6.
- `package.json` : 0a, puis 9.
- `kings.test.ts` : 2, puis 7.
- `auth.ts`, `games.ts` : 3, puis 9 (`SLOT_COLUMN` dérivé de `SLOT_DEFS`).

---

## 8. Stratégie de test

1. **Témoins pris avant toute modification** (lot 0a), sur le code actuel :
   - `test/fixtures/v1/` : textes des cartes ; géométrie ; 40 parties rejouables à graine fixe (Pouvoirs, Duel, Sans cartes, avec ou sans pendule, Rituel et Présages), avec leurs clés de position ; salles sérialisées (attente, choix en cours, partie active avec Présage, Mur et Faille, Duel avec instantanés, partie terminée, accueil en relais) ; sauvegarde de l'accueil v1 ; partie locale ; PGN ; 500 tirages et choix de l'IA ;
   - relevé du texte des pages (`innerText`, sur ordinateur et mobile, partie à 4 moments) ;
   - captures et boîtes des éléments clés ;
   - `dist` de référence.

   Les références visuelles et le `dist` sont gardés hors de git (`/home/user/spellmate-ref/`).
2. **Matrice paramétrée** (`test/regles-matrice.test.ts`, lots 1 et 3).
   - Paramètres croisés : cartes par joueur {1, 2, 3, 4, 5} × cartes par tour {1, 2} × carte à la place du coup {non, oui} × délai du Présage {2, 4} × choix ou tirage.
   - Tirage dans chaque réserve (taille, R9), ou refus explicite.
   - Choix, complément, choix de l'IA.
   - Parties au hasard menées jusqu'au bout, avec ces invariants : jamais plus de `cardsPerTurn` cartes dans un tour ; le trait passe si la carte remplace le coup ; R4a, b et c ; une seule fin ; clés stables ; **relecture complète avec les règles de l'état**.
   - `decideTurn` respecte le budget de cartes.
   - Serveur : `draftView.count`, `closeDraft`, reprise après redémarrage.
   - Projet Vitest `matrice` (variable `SPELLMATE_MATRICE`).
3. **Bout en bout.** `scripts/serveur-jetable.mjs` (PGlite temporaire, port libre, `SPELLMATE_TEST_RULES` refusé en production) lance `integration.mjs` et `ranked.mjs` dans ces cas : au défaut, avec 1 et 5 cartes, 2 cartes par tour, tirage partout, cadence archivée, fonctions coupées. Les suites lisent `view.draft.count`, `pool` et `msLeft` au lieu de recopier les valeurs.
4. **Identité au défaut :**
   - phrases de `regles.ts` au caractère près ;
   - textes des cartes ;
   - `currentRules` égal en profondeur à `RULES_V1` ;
   - **aucun champ `rules` ni `cardsThisTurn` écrit** ;
   - traces rejouées coup pour coup ;
   - vues JSON des salles ;
   - `index.html` et manifeste identiques octet pour octet ;
   - paquet principal à ±0,5 ko compressé ;
   - relevé du texte et captures (tolérance 0 sur les bancs déterministes : rois, échiquiers, sorts, coque) ;
   - boîtes des éléments clés des pages réelles.
5. **Compatibilité des parties enregistrées**, avec `GAME_RULES` volontairement modifié dans le test :
   - reprise des salles témoins en V1 (un choix en cours garde 3 cartes) ;
   - relecture complète ;
   - sauvegarde v1 de l'accueil ;
   - PGN aller-retour ;
   - un état sans `cardsThisTurn` est lu correctement ;
   - un client d'une autre version reçoit `server:outdated`.
6. **Invariants qui manquaient :**
   - complétude des registres par carte ;
   - `TIME_CONTROLS` (identifiants uniques, cadences rapides incluses, cadence par défaut présente) ;
   - niveaux d'IA couverts partout ;
   - `elo()` et l'appariement ;
   - durées JS = CSS ;
   - `ROUTES` ↔ chargeurs ↔ motifs de `site.ts` ;
   - `checkRules` au défaut ;
   - aucune lecture de réglage dans `chess.ts` ;
   - modules de configuration sans import à l'exécution ;
   - garde de protocole.
7. **Performance** (lot 9, seul) :
   - `test/perf/mesure.mjs` sur `ref` et `actuelle`, scénarios accueil, accueil-mobile, forêt, partie, jouer, apprendre, 3 passages ;
   - fil principal à ±5 % ;
   - zéro image au repos ;
   - aucune composition en échec ni repeinte de plus ;
   - IA à ±3 % (`scripts/banc-ia.mjs`).

---

## 9. Interdits et risques

**Performance de l'accueil.**
- Ne pas modifier la logique d'`engine.ts` ni de `scenery.tsx`.
- Aucun nouvel écouteur, aucune lecture de mise en page, aucun état React au niveau d'`OdysseeHome`, aucun contexte React de règles.
- Pour N = 3 : aucun attribut, aucune variable, aucun nœud nouveau.
- Ne pas changer l'identité des objets passés à `Board`.
- Ne pas changer l'ordre des appels à `Math.random` (scènes, décor).
- N'animer que `transform` et `opacity`, sans nouvelle animation.

**Paquet principal.** Ne jamais importer `game.ts`, `cards.ts`, `rules.ts` ou `chess.ts` depuis `Layout`, `App`, `main` ou `store`. On n'y utilise que `config/*` et `text/*`, ce qu'un test garde.

**Moteur.**
- Aucune lecture de réglage dans `chess.ts`, la recherche ou `positionKey`.
- Ne jamais cloner l'objet de règles : il est gelé et partagé.
- Ne jamais modifier `RULES_V1`.
- Ne pas écrire `rules` ni `cardsThisTurn` au défaut.
- Ne rien ajouter à `Snapshot`.

**Données.**
- Ne jamais recycler un identifiant de carte, d'objet, de cadence ou de niveau : on archive.
- Ne pas modifier d'anciennes migrations.
- Ne renommer ni clés de stockage, ni cookies, ni base, ni chemins de déploiement.
- Le serveur n'accepte jamais de règles venant d'un client.

**Organisation.**
- Ne pas toucher les fichiers gelés ni ceux d'un autre lot.
- Ne pas découper `games.ts`.
- Ne pas mesurer la performance pendant que des agents tournent.
- Ne pas présenter comme vérifié ce qui ne l'a pas été.

**Risques connus :**
- N = 5 ou 6 donne des cartes de 60 à 77 px, à valider en capture.
- L'IA à plusieurs cartes prend plus de temps : budget unique dans `decideTurn`.
- Le seuil de conservation des cartes de l'IA est calibré pour 3 cartes.
- Les onglets ouverts avant le premier déploiement de la version de protocole ne rechargent pas.
- Fusions : 11 lots, mais des fichiers disjoints par vague.

---

## 10. Décisions attendues du fondateur

- **Q1 (urgent).** Mentions légales de production : raison sociale, adresse, SIREN, TVA, directeur, contact, médiateur. `/api/legal` sert aujourd'hui les modèles.
- **Q2.** Trésor du Bazar : figer la liste actuelle, inclure les objets futurs, ou passer à un prix « compléter » ? Par défaut, rien ne change.
- **Q3.** Revanche : règles du moment (proposé) ou règles de la partie d'origine ?
- **Q4.** R9 au choix des cartes : garder « sans contrainte » ?
- **Q5.** Textes qui changeraient au défaut, à accepter un par un :
  - vouvoiement de 3 messages ;
  - « 10+0 » ou « 10 + 0 » ;
  - « Paiement sécurisé par Stripe » quand la vente est fermée ;
  - CGV sans les rois ni les collections ;
  - `og.jpg`, qui montre des cartes du Duel.
- **Q6.** Carte à la place du coup : compte-t-elle comme un demi-coup pour les 50 coups ? Proposé : oui.
- **Q7.** Fin au temps (`canStillMate`) : suivre la FIDE ?
- **Q8.** Signatures sonores propres aux 7 Pouvoirs ?
- **Q9.** Échéance de revanche (aucune aujourd'hui) ?
- **Q10.** Une CI minimale (tsc et tests rapides) ?
- **Q11.** Captures pour N ≠ 3 : taille des cartes et chevauchement acceptables ?
