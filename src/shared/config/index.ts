// TABLEAU DE BORD DES RÉGLAGES DE SPELLMATE
// Guide complet (ce qu'on change demain, table des réglages, garde-fous) : docs/REGLAGES.md.
//
// Une ligne par réglage : où il se règle, sa valeur par défaut, ce qui suit tout seul. Les valeurs vivent dans les
// fichiers cités ; ce module les réexporte. Après tout changement : `npx tsc --noEmit -p .`, `npm test` et
// `npm run build` (une configuration impossible fait échouer la construction, avec une phrase qui dit quoi changer).
// Un nom de réglage mal écrit est refusé par TypeScript et par checkRules. `npm test` signale chaque valeur par défaut
// changée (test/garde-fous/defauts.test.ts) : si le changement est voulu, mettez à jour test/garde-fous/defauts.json ;
// s'il touche cartes, cadences ou règles, le garde de protocole demande aussi de monter PROTOCOL_VERSION.
// Les parties en cours, les relectures et les sauvegardes gardent leurs règles : seules les nouvelles parties suivent.
//
// ── Règles des nouvelles parties (config/rules.ts) ──────────────────────────────────────────────────────────────
// GAME_RULES.cardsPerPlayer   3      cartes par main : tirage, choix, IA, textes, éventails (1 à 6 ; 6 exige de relever R9)
// GAME_RULES.cardsPerTurn     1      cartes par tour (1 à 3)
// GAME_RULES.cardEndsTurn     false  true : toute carte remplace le coup (impose 1 carte par tour)
// GAME_RULES.handsVisible     true   false refusé dans cette version (mains cachées : lot dédié)
// GAME_RULES.presageDelay     2      demi-coups entre l'annonce d'un Présage et son arrivée (pair, 2 à 6)
// GAME_RULES.fiftyHalfmoves   100    règle des 50 coups, en demi-coups
// GAME_RULES.repetitions      3      nulle à la triple répétition
// GAME_RULES.startFen         null   position de départ (FEN, roque standard seulement) ; null : position standard
// RULES_BY_CONTEXT            {}     variante pour un seul contexte : classee, amicale, invitation, ia, accueil
// RULES_V1                    gelé   règles des parties sans champ `rules` : NE JAMAIS MODIFIER
// BOUNDS                      bornes acceptées par checkRules
//
// ── Mise en place (config/rules.ts) ─────────────────────────────────────────────────────────────────────────────
// DEAL.draft                  true   choix des cartes au début de la partie ; false : tirage partout (l'accueil tire toujours)
// DEAL.draftMs                45 000 durée du choix des cartes (ne pas confondre avec TIMINGS.firstMoveMs, aussi 45 s)
// DEAL.handLimits             au plus 1 Légendaire et 2 Climats par main tirée (R9)
// DEAL.limitsInDraft          false  R9 appliquée aussi au choix des cartes
// DEAL.rarityWeight           Commune 4, Rare 3, Épique 2, Légendaire 1 (tirage pondéré)
// DEAL.redrawAttempts         64     tirages recommencés avant un tirage contraint
// SUSPENDED_CARDS             []     cartes suspendues des nouvelles réserves (les parties en cours continuent)
//
// ── Cartes, catalogues, cadences, IA (hors de ce dossier) ───────────────────────────────────────────────────────
// CARDS (shared/cards.ts)     coups, ranks, clockRate, genre, retired de chaque carte ; textes des cartes
// CATALOG_IDS, CATALOG_RULES (shared/cards.ts) catalogues et leurs règles (proposé, la magie cède, effets des deux camps,
//                             tirage uniforme ou pondéré, Mur à toute rangée, instantanés…) ; un catalogue de plus : une
//                             entrée dans chacun, et `catalogs` sur ses cartes ; ne jamais retirer un identifiant
// DEFAULT_CATALOG 'climats'   catalogue des nouvelles parties ; LEGACY_CATALOG 'duel' : parties enregistrées sans catalogue
// TIME_CONTROLS (protocol.ts) cadences : quick (files), invite (accueil), archived (retirée) ; DEFAULT_QUICK '10+0'
// PROTOCOL_VERSION            1      à monter quand cartes, catalogues, cadences ou règles par défaut changent
// BOT_LEVELS (shared/bot.ts)  [1, 2, 3] et BOT_PROFILES ; DEFAULT_BOT_LEVEL 2
//
// DRAFT_VALUE (shared/bot.ts) valeur de chaque carte pour le choix de l'IA (exhaustive : le compilateur exige une carte
//                             ajoutée) ; DRAFT_NOISE par niveau ; BOT_LOOK et ORACLE_LOOK (shared/catalog.ts) : leur apparence
//
// ── Effets et sons des cartes (src/client ; une carte ajoutée : le compilateur exige son entrée partout) ──────────
// CARD_FX (vfx/cardFx.ts)     fiche d'effet de chaque carte : annonce, arrivée, ambiance, durées
// BOARD_MARKS (vfx/boardMarks.ts) marque laissée sur l'échiquier par un effet en cours (null : aucune)
// CARD_SOUND (sound.ts)       signature sonore de chaque carte
// CARD_ART (components/CardArt.tsx) dessin de la carte ; CARD_SCENES (components/cardScenes.ts) : sa mini-animation
//                             (bulle, choix des cartes, règles), diptyque avant / après (cartes des Pouvoirs)
// VFX (vfx/config.ts)         rendu WebGL des sorts : densité de pixels, particules, durées couplées au CSS
//                             (test/durees-css.test.ts les compare aux feuilles)
// vfx/sharing.ts              partage d'une scène entre échiquiers : garder 20 s, céder après 1,5 s, passer après 0,9 s
// motion.ts                   mouvement réduit (prefers-reduced-motion) : une seule MediaQueryList pour tout le client
//
// ── Accueil (config/home.ts) ────────────────────────────────────────────────────────────────────────────────────
// HOME                        Pouvoirs, sans pendule, contre l'IA, Blancs, Sorcier, appariement 30 s jusqu'au
//                             demi-coup 4, « Visiteur », sauvegarde v1 30 jours, Oracle 520 + 380 ms, repos 30 s
// PLACES (client/odyssee/data.ts) lieux de la descente, dans l'ordre (ancre, nom, altitude, échiquier, sorts, roi,
//                             teinte) ; un lieu de plus : sa pose (poseFor), sa scène (SCENES) et son ciel
//
// ── Boutique (shared/catalog.ts, shared/skins/*) ────────────────────────────────────────────────────────────────
// SLOT_DEFS (skins/slots.ts)  emplacements roi, échiquier, sorts : libellés, rayon, vu par l'adversaire, objet par
//                             défaut, colonne SQL (un emplacement de plus : une migration, db.ts)
// PRICE, RARITY               grille des prix (centimes TTC) et libellés des raretés
// packProducts (catalog.ts)   packs en vente ; `display` : en tête d'un rayon d'emplacement de la boutique ou en bandeau
//                             sous les collections (sans `display` : montré seulement au Bazar de l'accueil)
// TRESOR                      contenu du Trésor du Bazar : 'premium' (tous les objets payants) ; future : [] (aucune promesse)
// SHOP_FEATURED               { king: 'king:braise' } mis en essai à la première visite de la boutique
// CURRENCY 'eur' · PAYMENT_PROVIDER 'Stripe' · LOCALE 'fr-FR' (text/fr.ts : dates, nombres, prix)
// PAYMENTS_MODE               variable du serveur : stripe, demo ou off (PAYMENTS_MODES, protocol.ts) ; boutique
//                             entière coupée : FEATURE_SHOP=0 (catalogue lisible, paiements refusés)
//
// ── Pages (config/routes.ts) ────────────────────────────────────────────────────────────────────────────────────
// ROUTES                      chemin, module, interrupteur de chaque page ; ROUTE_TITLES (titres), NOT_INDEXED (robots.txt)
//
// ── Fonctions activables (config/features.ts) ───────────────────────────────────────────────────────────────────
// FEATURES                    tout ouvert ; pour couper une fonction en production, sans reconstruire : variable
//                             d'environnement du serveur FEATURE_SHOP=0, FEATURE_RANKED=0, FEATURE_NEW_GAMES=0…
//                             (un nom inconnu est signalé au démarrage)
//
// ── Marque (config/brand.ts) ────────────────────────────────────────────────────────────────────────────────────
// BRAND                       Spellmate, accroches, couleur #04050f ; jamais les identifiants techniques (sm:, sm_session…)
//
// ── Bornes des pseudos et mots de passe (config/limits.ts) ──────────────────────────────────────────────────────
// GUEST_NAME 2 à 20 · USERNAME 3 à 20 et mots réservés · PASSWORD 8 à 200
//
// ── Durées partagées entre client et serveur (config/timings.ts) ────────────────────────────────────────────────
// CINEMATIC_MS 1200 · BOT_CARD_PAUSE_MS 2300 · BOT_TIMEOUT_MS 20 000
//
// ── Serveur (src/server/settings.ts) ────────────────────────────────────────────────────────────────────────────
// TIMINGS (délais), RATING (Elo), MATCHMAKING (file), RELAY (accueil), BOT_RUNTIME (IA), LIMITS, ACCOUNT,
// DATABASE (pool PostgreSQL), BOT_THREADS (fils de calcul de l'IA), PERSIST (nouveaux essais d'une fin de partie)
// RELAY.level                 2      niveau de l'IA qui joue pour un visiteur parti (indépendant de HOME.botLevel)
// Variables d'environnement (.env.example, src/server/config.ts) : PORT, PUBLIC_URL, APP_NAME, MAIL_FROM, LEGAL_*,
//                             PAYMENTS_MODE, FEATURE_* ; SPELLMATE_TEST_RULES pour les tests (refusée en production)
//
// ── Client (src/client/storageKeys.ts) ──────────────────────────────────────────────────────────────────────────
// KEYS                        clés du stockage du navigateur : ne jamais les renommer

export * from './rules';
export * from './features';
export * from './brand';
export * from './limits';
export * from './timings';
export * from './home';
