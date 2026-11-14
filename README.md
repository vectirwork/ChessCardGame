# Spellmate : les échecs ont appris la magie

Site complet d'échecs en ligne avec des **cartes de pouvoir**. Au début d'une partie, chaque joueur **choisit trois
cartes**, ensuite **visibles des deux joueurs**, et peut en lancer une par tour, avant son coup. Chaque pouvoir change la partie **pour les deux camps** :
les pions gèlent pour tout le monde, une case devient infranchissable jusqu'à la fin de la partie, les prises
deviennent interdites ou obligatoires… Le jeu est gratuit ; la boutique vend uniquement des **rois**, des **échiquiers**
et des **sorts** (animations des cartes) : aucun pay-to-win.

Ces nombres sont des réglages : cartes par joueur, cartes par tour, durées, cadences, IA, boutique, marque… Voir
[docs/REGLAGES.md](docs/REGLAGES.md).

## Lancer le site sur votre PC (5 minutes)

1. Installez **Node.js 22** (ou plus récent) depuis [nodejs.org](https://nodejs.org) : c'est la seule installation
   nécessaire (Windows, macOS ou Linux). La base de données est intégrée.
2. Dans un terminal, dans le dossier du projet :

```bash
npm install
npm run local
```

3. Ouvrez **http://localhost:3000**. La première fois, le site est construit (environ 30 secondes).

Les données (comptes, parties, achats) sont dans le dossier `data/`. Les paiements sont en **mode démo** (rien n'est
débité) tant qu'aucune clé Stripe n'est configurée. Autre port : `PORT=4000 npm run local` (sous Windows PowerShell :
`$env:PORT=4000; npm run local`). Après une mise à jour du code : `npm run local -- --rebuild`.

## Ce qui est inclus

| Domaine | Contenu |
|---|---|
| Accueil | Une seule page racontée par le défilement (L'Odyssée : six lieux, parallaxe). **Zéro clic** : l'échiquier du premier écran est une vraie partie contre l'IA ; on joue en touchant une pièce et l'échiquier passe en plein écran, la main de cartes reste visible. Option « Affronter un humain » (partie amicale anonyme) |
| Jeu | Règles complètes des échecs (validées par les tests « perft »), **8 pouvoirs**, **choix des 3 cartes** en début de partie (45 s, choix secret jusqu'à la révélation ; tirage au hasard sur l'accueil), pendules arbitrées par le serveur, nulle, abandon, revanche, reconnexion, spectateurs, reprise des parties après redémarrage du serveur |
| Pouvoirs | Climats annoncés un tour à l'avance (Sablier fou, Trêve, Lune de sang, Ère glaciaire, Déflagration), Terrains (Mur de glace permanent, Faille), Événement (Grande Marée). Cartes épurées (nom, emblème, « + votre coup » ou « Remplace votre coup »), règle dans une bulle au survol ou au toucher, bouton « Lancer ce sort » à côté de la carte, cartes de l'adversaire en éventail retourné. Formules « Pouvoirs » ou « Sans cartes » (échecs classiques) |
| Modes | IA à 3 niveaux (elle joue aussi ses cartes ; dans le navigateur sur l'accueil), invitation par lien **sans compte**, partie amicale ouverte aux invités, parties classées Elo |
| Fonctions classiques | Leçons interactives (`/apprendre`), 49 problèmes dont des problèmes à pouvoirs (`/problemes`, problème du jour), échiquier d'analyse avec moteur, import et export PGN ou FEN, éditeur de position, relecture des parties avec courbe d'évaluation (`/analyse`), historique (`/parties`), parties en direct (`/direct`), règles et cartes (`/cartes`), classement |
| Effets | Couche WebGL (Three.js) alignée sur l'échiquier, animation propre à chaque pouvoir ; sons synthétisés |
| Boutique | 8 rois, 10 échiquiers et 8 sorts, dont 5 objets offerts ; 7 collections premium ; packs (Grimoire des sorts, Trésor du Bazar) ; cabine d'essai ; panier |
| Comptes | Inscription, connexion, e-mail de vérification, mot de passe oublié, changement d'e-mail ou de mot de passe, déconnexion de tous les appareils, export des données et suppression du compte (RGPD), profils publics |
| Paiement | Stripe Checkout (page de paiement hébergée par Stripe), webhook signé et idempotent, remboursements (objets retirés automatiquement), renonciation au droit de rétractation, mode démo sans Stripe |
| Administration | `/admin` : chiffre d'affaires, ventes, inscriptions, parties en cours, recherche de joueurs, objets offerts ou retirés |
| Légal | Mentions légales, CGU, CGV, politique de confidentialité (modèles à faire relire, remplis depuis la configuration) |

Le site est en français, responsive (ordinateur, tablette, mobile), respecte `prefers-reduced-motion` et ne dépose que
des cookies strictement nécessaires (pas de bandeau de consentement requis). Les polices sont hébergées sur votre
serveur.

## Mettre en ligne (environ 20 minutes)

### 1. Un serveur

N'importe quel VPS Linux avec 2 Go de RAM suffit pour démarrer (Hetzner CX22, OVH VPS, Scaleway…, 4 à 6 € par mois).
Installez Docker :

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Le nom de domaine

Chez votre registraire, créez un enregistrement **A** (et **AAAA** si vous avez une IPv6) pour `votre-domaine.fr` et
`www.votre-domaine.fr` vers l'adresse IP du serveur. Le certificat HTTPS est ensuite obtenu automatiquement par Caddy.

### 3. Le code et la configuration

```bash
git clone https://github.com/vectirwork/ChessCardGame.git spellmate
cd spellmate
cp .env.example .env
openssl rand -hex 32   # à coller dans SECRET_KEY
nano .env              # remplissez DOMAIN, POSTGRES_PASSWORD, SECRET_KEY, ADMIN_EMAILS, mentions légales…
```

### 4. Lancement

```bash
docker compose up -d --build
```

C'est en ligne sur `https://votre-domaine.fr`. Les tables de la base sont créées automatiquement au premier démarrage.
Créez votre compte avec l'adresse indiquée dans `ADMIN_EMAILS` : vous aurez accès à `/admin`.

Mettre à jour plus tard : `git pull && docker compose up -d --build` (les parties en cours reprennent après le redémarrage).
Pour vérifier d'abord la configuration (`.env`) et les règles avec le nouveau code, sans arrêter la version en ligne :
`docker compose build app && docker compose run --rm --no-deps -T app node dist/server/index.js --check-config` (code
0 si tout est bon ; sinon le message dit quelle valeur corriger). Le déploiement de chess-powers.com le fait tout seul
(`deploy/update.sh`).

### 5. Stripe (pour encaisser)

1. Créez un compte sur [stripe.com](https://stripe.com) et activez-le (informations de la société, IBAN).
2. *Développeurs > Clés API* : copiez la **clé secrète** dans `STRIPE_SECRET_KEY`.
3. *Développeurs > Webhooks > Ajouter un endpoint* :
   - URL : `https://votre-domaine.fr/api/stripe/webhook`
   - Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
   - Copiez le **secret de signature** (`whsec_…`) dans `STRIPE_WEBHOOK_SECRET`.
4. `PAYMENTS_MODE=stripe` puis `docker compose up -d`.
5. TVA : pour vendre du numérique aux particuliers de l'UE, la TVA du pays de l'acheteur s'applique (guichet OSS).
   Le plus simple est d'activer **Stripe Tax** dans Stripe puis `STRIPE_AUTOMATIC_TAX=true`. Les prix affichés sont TTC.

Pour tester sans risque, utilisez d'abord une clé `sk_test_…` et la carte `4242 4242 4242 4242`.

Remboursements et promesses des packs :
- **Remboursement complet** (dans Stripe) : les objets de l'achat sont retirés automatiquement, et l'emplacement équipé
  revient à l'objet offert s'il n'est plus possédé.
- **Remboursement partiel** : rien n'est retiré automatiquement ; un avertissement est écrit dans le journal du serveur.
  Remboursez l'achat en entier, ou retirez l'objet à la main dans l'administration.
- **Promesses des packs** (« et les prochains offerts ») : les objets promis sont livrés une seule fois par achat (au
  démarrage du serveur, ou à la livraison d'un pack ancien) et notés dans `purchases.items`. Un objet retiré par
  l'administrateur ne revient donc pas au redémarrage suivant.

### 6. E-mails

Sans SMTP, les e-mails (vérification, mot de passe oublié, confirmation d'achat) sont seulement écrits dans les logs.
Renseignez `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` et `MAIL_FROM` avec un service d'envoi (Brevo, Mailjet, Scaleway TEM,
OVH…). Pensez à configurer SPF et DKIM sur votre domaine pour ne pas finir en spam.

### 7. Sauvegardes

Toutes les données sont dans PostgreSQL. Sauvegarde quotidienne conseillée, par exemple avec une tâche cron :

```bash
docker compose exec -T db pg_dump -U spellmate spellmate | gzip > /root/sauvegardes/spellmate-$(date +%F).sql.gz
```

## Réglages

Le guide complet est [docs/REGLAGES.md](docs/REGLAGES.md) : ce qu'on change demain (5 cartes par joueur, 2 cartes par
tour, une carte à la place du coup, rééquilibrer une carte, une nouvelle cadence, couper la boutique, changer le nom du
site…), la table de tous les réglages avec leur valeur par défaut, et les garde-fous. Le tableau de bord du code est
`src/shared/config/index.ts`.

En bref :

- **Règles des nouvelles parties** : `GAME_RULES` et `RULES_BY_CONTEXT` dans `src/shared/config/rules.ts`. Chaque
  partie garde ses règles : un changement ne touche que les parties créées ensuite.
- **Choix et tirage des cartes** : `DEAL` dans `src/shared/config/rules.ts`.
- **Fonctions** (boutique, parties classées, maintenance…) : variables `FEATURE_*` du serveur, sans reconstruire le site
  (`FEATURE_SHOP=0`, `FEATURE_NEW_GAMES=0`…).
- Des règles impossibles arrêtent la construction et le démarrage du serveur, avec une phrase qui dit quoi changer.

## Modifier l'offre

- **Prix** : grille `PRICE` de `src/shared/catalog.ts` (centimes TTC, par rareté et par emplacement). Un prix déjà
  pratiqué ne monte jamais.
- **Objets** (rois, échiquiers, sorts) et **collections** : `src/shared/skins/`. Retirer un objet de la vente :
  `retired: true` (jamais supprimer ni recycler un identifiant ; qui l'a acheté le garde).
- **Packs** : `packProducts` de `src/shared/catalog.ts` ; `display` dit où la boutique le montre. Contenu du **Trésor
  du Bazar** : `TRESOR`. Objet essayé à la première visite : `SHOP_FEATURED`.
- **Un emplacement de plus** (dos de carte, jeu de pièces…) : `SLOT_DEFS` de `src/shared/skins/slots.ts`, plus une
  migration (voir docs/REGLAGES.md).
- **Cartes** : définitions et équilibrage (durées, rangées) dans `src/shared/cards.ts` ; leurs textes sont produits
  par des gabarits du même fichier ; leurs règles : `src/shared/game.ts` ; leurs effets visuels :
  `src/client/vfx/cardFx.ts` et `src/client/vfx/effects.ts` ; leurs emblèmes : `src/client/components/CardArt.tsx`.
  La conception des pouvoirs est expliquée dans `concepts/CARTES-GLOBALES.md` et `docs/PLAN-ODYSSEE.md`.
- **Leçons et problèmes** : `src/shared/lessons.ts` et `src/shared/puzzles.ts` (les tests vérifient chaque solution
  avec le moteur). Ils se jouent avec les règles d'origine ; ceux que les règles du jour contrediraient sont masqués.
- **Textes de l'accueil** : `src/client/odyssee/data.ts`.
- **Nom du site** : `BRAND` dans `src/shared/config/brand.ts` (reconstruire), et `APP_NAME` et `MAIL_FROM` pour le
  serveur. Le logo est le dessin `LogoMark` de `src/client/components/Layout.tsx` ; l'icône, les images d'application
  et l'image de partage sont dans `public/`.

## Développement

Prérequis : Node.js 22. Sans `DATABASE_URL`, la base intégrée (PGlite) est utilisée dans `data/dev/` ; avec
`DATABASE_URL`, PostgreSQL 16.

```bash
npm install
npm run dev        # http://localhost:3000, rechargement à chaud, paiements en mode démo
npm test           # toute la suite : moteur, pouvoirs, choix des cartes, IA, pendules, serveur, leçons, problèmes, PGN, réglages
npm run test:rapide            # la suite sans l'IA à pleine profondeur ni la matrice des règles (pendant le travail)
SPELLMATE_MATRICE=1,2,3,4,5 npm run test:matrice   # matrice complète des règles (défaut : 1, 3 et 5 cartes)
npm run typecheck              # et npm run typecheck:concepts pour les maquettes de concepts/
npm run temoins                # témoins v1 du moteur : textes des cartes, parties, tirages, salles, PGN
npm run essai-reglage -- --regle=cardsPerPlayer=4   # essai d'un réglage sur une copie jetable (gardes et autres échecs)
npm run build && npm start     # version de production (avec NODE_ENV=production et SECRET_KEY)
```

Tests contre un serveur, de préférence un serveur jetable (site construit, base neuve, port libre) :

```bash
node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}   # comptes, invitation, choix des cartes, pouvoirs, revanche, IA, boutique, RGPD
SPELLMATE_TEST_RULES='{"cardsPerPlayer":5}' node scripts/serveur-jetable.mjs -- node test/integration.mjs {base}   # avec d'autres règles
node scripts/serveur-jetable.mjs -- node test/ranked.mjs {base}        # file classée et Elo
node scripts/serveur-jetable.mjs --env=FEATURE_SHOP=0 -- node test/fonctions.mjs {base} shop=0   # boutique coupée
npm run test:integration          # la même suite contre un serveur déjà lancé (http://localhost:3000)
node test/glisser.mjs http://localhost:3000   # glisser-déposer et capture au glisser, plusieurs fois de suite
node test/perf/mesure.mjs ref=<url> actuelle=<url>   # performance : chargement, repos, WebGL (versions de production)
node test/stripe-webhook.mjs http://localhost:3100 whsec_test   # serveur lancé avec PAYMENTS_MODE=stripe
```

Bancs d'identité (site construit, comparaison à une référence) : `npm run identite` (captures, boîtes et DOM ;
référence hors du dépôt, `/home/user/spellmate-ref`, présente sur la machine de la passe seulement) et
`npm run textes-pages` (texte des pages). Ils ne réécrivent jamais leur référence sans `--ecrire`, à ne lancer que sur
décision. Pour prendre votre propre référence avant un changement : docs/REGLAGES.md, section 2. `npm run verifier-lot -- <lot>` contrôle les
fichiers touchés par un lot de la passe « polymorphe » (`docs/polymorphie/LOTS.json`).

En développement, `http://localhost:3000/test/vfx.html?card=rift&targets=a5` est un banc d'essai des effets
(`window.cast('ice_wall', ['e4'], 'skin:inferno')` dans la console). Les prototypes de direction artistique sont dans
`concepts/` (`http://localhost:3000/concepts/odyssee/`).

### Architecture

```
src/shared/config/   tableau de bord des réglages : règles, mise en place, accueil, marque, interrupteurs, pages, bornes
src/shared/text/     phrases dérivées des réglages (« trois cartes », « un sort par tour »…) et grammaire française
src/shared/          règles partagées navigateur/serveur : moteur d'échecs, pouvoirs, IA, PGN, leçons, problèmes, boutique
src/server/          Express + Socket.IO + PostgreSQL ou PGlite : comptes, salles de jeu, pendules, IA (threads), Stripe
src/client/odyssee/  accueil (L'Odyssée), partie locale zéro clic, coque de partie plein écran
src/client/ai/       IA dans un Web Worker (partie de l'accueil)
src/client/features/ Apprendre, Problèmes, Analyse (moteur dans un Web Worker), Mes parties, En direct
src/client/          pages, échiquier, cartes, moteur d'effets Three.js (chargé à la demande), sons
```

Le serveur est l'arbitre : chaque coup et chaque carte sont revalidés côté serveur, le navigateur ne fait qu'afficher.
Les parties en cours vivent en mémoire et sont sauvegardées en base à chaque action.

### Monter en charge

Une instance tient plusieurs milliers de parties simultanées. Au-delà, il faudra répartir les salles entre plusieurs
instances (adaptateur Redis de Socket.IO et affinité de session par partie).

## Limites connues

- Les textes légaux sont des modèles : faites-les relire, et complétez le médiateur de la consommation dans les CGV.
- Rien n'a encore été vérifié sur de vrais appareils (téléphones, cartes graphiques) : les tests automatiques tournent
  dans un navigateur sans écran, avec un rendu 3D logiciel. Le vrai paiement Stripe et l'envoi réel d'e-mails n'ont
  pas été testés avec de vrais comptes.
- Les réglages autres que le défaut (5 cartes, 2 cartes par tour, carte à la place du coup…) n'ont été essayés que par
  les tests, les suites de bout en bout et des captures, jamais en production ni par des joueurs. Pour les
  changements essayés (nombre de cartes, cartes par tour, carte à la place du coup, délai du Présage, durée du choix,
  tirage partout, rangées du Mur, durée de la Faille…), seuls des gardes échouent, qui disent quoi mettre à jour ; un
  autre réglage peut encore faire échouer d'autres tests. `npm run essai-reglage` le dit avant tout changement
  (docs/REGLAGES.md, section 2).
- Le moteur d'analyse est un moteur maison : il approfondit jusqu'à 6 secondes par position (profondeur 12 au plus) ;
  sur la machine des tests automatiques, il atteint la profondeur 5 ou 6. La relecture d'une partie évalue chaque
  position à la profondeur 3. Suffisant pour signaler les gaffes, loin de Stockfish.
- Pas encore de connexion Google/Apple, de chat libre (seulement des émotes, pour éviter la modération) ni de
  traduction anglaise.
