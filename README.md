# Spellmate : les échecs ont appris la magie

Site complet d'échecs en ligne avec des **cartes de pouvoir**. Chaque joueur reçoit trois cartes, **visibles des deux
joueurs**, et peut en lancer une par tour, avant son coup. Chaque pouvoir change la partie **pour les deux camps** :
les pions gèlent pour tout le monde, une case devient infranchissable jusqu'à la fin de la partie, les prises
deviennent interdites ou obligatoires… Le jeu est gratuit ; la boutique vend uniquement des **skins d'animation** et
des **plateaux** (aucun pay-to-win).

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
| Jeu | Règles complètes des échecs (validées par les tests « perft »), **8 pouvoirs**, pendules arbitrées par le serveur, nulle, abandon, revanche, reconnexion, spectateurs, reprise des parties après redémarrage du serveur |
| Pouvoirs | Climats annoncés un tour à l'avance (Sablier fou, Trêve, Lune de sang, Ère glaciaire, Déflagration), Terrains (Mur de glace permanent, Faille), Événement (Grande Marée). Formules « Pouvoirs » ou « Sans cartes » (échecs classiques) |
| Modes | IA à 3 niveaux (elle joue aussi ses cartes ; dans le navigateur sur l'accueil), invitation par lien **sans compte**, partie amicale ouverte aux invités, parties classées Elo |
| Fonctions classiques | Leçons interactives (`/apprendre`), 49 problèmes dont des problèmes à pouvoirs (`/problemes`, problème du jour), échiquier d'analyse avec moteur, import et export PGN ou FEN, éditeur de position, relecture des parties avec courbe d'évaluation (`/analyse`), historique (`/parties`), parties en direct (`/direct`), règles et cartes (`/cartes`), classement |
| Effets | Couche WebGL (Three.js) alignée sur l'échiquier, animation propre à chaque pouvoir ; 6 skins (Arcane offert, Inferno, Néon 2084, Céleste, Néant, Sakura) ; sons synthétisés |
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

### 6. E-mails

Sans SMTP, les e-mails (vérification, mot de passe oublié, confirmation d'achat) sont seulement écrits dans les logs.
Renseignez `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` et `MAIL_FROM` avec un service d'envoi (Brevo, Mailjet, Scaleway TEM,
OVH…). Pensez à configurer SPF et DKIM sur votre domaine pour ne pas finir en spam.

### 7. Sauvegardes

Toutes les données sont dans PostgreSQL. Sauvegarde quotidienne conseillée, par exemple avec une tâche cron :

```bash
docker compose exec -T db pg_dump -U spellmate spellmate | gzip > /root/sauvegardes/spellmate-$(date +%F).sql.gz
```

## Modifier l'offre

- **Prix, skins, plateaux, packs** : `src/shared/catalog.ts` (prix en centimes TTC).
- **Cartes** (textes, durées, raretés) : `src/shared/cards.ts` ; leurs règles : `src/shared/game.ts` ; leurs effets
  visuels : `src/client/vfx/effects.ts` ; leurs emblèmes : `src/client/components/CardArt.tsx`. La conception des
  pouvoirs est expliquée dans `concepts/CARTES-GLOBALES.md` et `docs/PLAN-ODYSSEE.md`.
- **Leçons et problèmes** : `src/shared/lessons.ts` et `src/shared/puzzles.ts` (les tests vérifient chaque solution
  avec le moteur).
- **Textes de l'accueil** : `src/client/odyssee/data.ts`.
- **Nom du site** : `APP_NAME` dans `.env`, plus le logo dans `src/client/components/Layout.tsx`.

## Développement

Prérequis : Node.js 22. Sans `DATABASE_URL`, la base intégrée (PGlite) est utilisée dans `data/dev/` ; avec
`DATABASE_URL`, PostgreSQL 16.

```bash
npm install
npm run dev        # http://localhost:3000, rechargement à chaud, paiements en mode démo
npm test           # moteur d'échecs (perft), règles des pouvoirs, IA, pendules, leçons, problèmes, PGN (≈ 2 min)
npm run typecheck
npm run build && npm start   # version de production (avec NODE_ENV=production et SECRET_KEY)
```

Tests contre un serveur lancé :

```bash
npm run test:integration          # comptes, invitation sans compte, mains visibles, pouvoirs, revanche, IA, boutique, RGPD
node test/ranked.mjs              # file classée et Elo
node test/stripe-webhook.mjs http://localhost:3100 whsec_test   # serveur lancé avec PAYMENTS_MODE=stripe
```

En développement, `http://localhost:3000/test/vfx.html?card=rift&targets=a5` est un banc d'essai des effets
(`window.cast('ice_wall', ['e4'], 'skin:inferno')` dans la console). Les prototypes de direction artistique sont dans
`concepts/` (`http://localhost:3000/concepts/odyssee/`).

### Architecture

```
src/shared/          règles partagées navigateur/serveur : moteur d'échecs, pouvoirs, IA, PGN, leçons, problèmes
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
- Le moteur d'analyse est un moteur maison (profondeur 4 à 6 en quelques secondes) : suffisant pour signaler les
  gaffes, loin de Stockfish.
- Pas encore de connexion Google/Apple, de chat libre (seulement des émotes, pour éviter la modération) ni de
  traduction anglaise.
