// TABLEAU DE BORD DES RÉGLAGES DE SPELLMATE
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
// TIME_CONTROLS (protocol.ts) cadences : quick (files), invite (accueil), archived (retirée) ; DEFAULT_QUICK '10+0'
// PROTOCOL_VERSION            1      à monter quand cartes, catalogues, cadences ou règles par défaut changent
// BOT_LEVELS (shared/bot.ts)  [1, 2, 3] et BOT_PROFILES ; DEFAULT_BOT_LEVEL 2
//
// ── Accueil (config/home.ts) ────────────────────────────────────────────────────────────────────────────────────
// HOME                        Pouvoirs, sans pendule, contre l'IA, Blancs, Sorcier, appariement 30 s jusqu'au
//                             demi-coup 4, « Visiteur », sauvegarde v1 30 jours, Oracle 520 + 380 ms, repos 30 s
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
// TIMINGS (délais), RATING (Elo), MATCHMAKING (file), RELAY (accueil), BOT_RUNTIME (IA), LIMITS, ACCOUNT
// RELAY.level                 2      niveau de l'IA qui joue pour un visiteur parti (indépendant de HOME.botLevel)
//
// ── Client (src/client/storageKeys.ts) ──────────────────────────────────────────────────────────────────────────
// KEYS                        clés du stockage du navigateur : ne jamais les renommer

export * from './rules';
export * from './features';
export * from './brand';
export * from './limits';
export * from './timings';
export * from './home';
