# Spellmate : les échecs ont des pouvoirs

Site complet d'échecs en ligne avec des **cartes de pouvoir** : chaque joueur reçoit trois sorts (Mur de glace, Foudre,
Retour arrière…) qu'il peut lancer avant son coup, avec une mise en scène 3D. Le jeu est gratuit ; la boutique vend
uniquement des **skins d'animation** et des **plateaux** (aucun pay-to-win).

## Ce qui est inclus

| Domaine | Contenu |
|---|---|
| Jeu | Règles complètes des échecs (validées par les tests « perft » de référence), 11 cartes, pendules arbitrées par le serveur, nulle, abandon, revanche, reconnexion, reprise des parties après redémarrage du serveur |
| Modes | Contre l'IA (3 niveaux, elle utilise aussi ses cartes), invitation par lien **sans compte**, parties classées Elo avec file d'attente |
| Effets | Couche WebGL (Three.js) parfaitement alignée sur l'échiquier qui bascule en 3D pendant les sorts ; 6 skins (Arcane offert, Inferno, Néon 2084, Céleste, Néant, Sakura) ; sons synthétisés |
| Comptes | Inscription, connexion, e-mail de vérification, mot de passe oublié, changement d'e-mail ou de mot de passe, déconnexion de tous les appareils, export des données et suppression du compte (RGPD), profils publics, classement |
| Paiement | Stripe Checkout (page de paiement hébergée par Stripe), webhook signé et idempotent, remboursements (objets retirés automatiquement), renonciation au droit de rétractation, mode démo sans Stripe |
| Administration | `/admin` : chiffre d'affaires, ventes, inscriptions, parties en cours, recherche de joueurs, objets offerts ou retirés |
| Légal | Mentions légales, CGU, CGV, politique de confidentialité (modèles à faire relire, remplis depuis la configuration) |

Le site est en français, responsive (ordinateur, tablette, mobile) et ne dépose que des cookies strictement nécessaires
(pas de bandeau de consentement requis). Les polices sont hébergées sur votre serveur.

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
- **Cartes** (textes, durées) : `src/shared/cards.ts` ; leurs règles : `src/shared/game.ts` ; leurs effets visuels :
  `src/client/vfx/effects.ts`.
- **Nom du site** : `APP_NAME` dans `.env`, plus le logo dans `src/client/components/Layout.tsx`.

## Développement

Prérequis : Node.js 22 et PostgreSQL 16 (ou `docker compose up -d db` en exposant le port 5432).

```bash
npm install
npm run dev        # http://localhost:3000, paiements en mode démo
npm test           # moteur d'échecs (perft), cartes
npm run typecheck
npm run build && NODE_ENV=production SECRET_KEY=... npm start
```

Par défaut la base attendue est `postgres://spellmate:spellmate@localhost:5432/spellmate` (variable `DATABASE_URL`).

### Architecture

```
src/shared/   règles partagées navigateur/serveur : moteur d'échecs, cartes, catalogue, protocole
src/server/   Express + Socket.IO + PostgreSQL : comptes, salles de jeu, pendules, IA (threads), Stripe, admin
src/client/   React : pages, échiquier, cartes, moteur d'effets Three.js (chargé à la demande), sons
```

Le serveur est l'arbitre : chaque coup et chaque carte sont revalidés côté serveur, le navigateur ne fait qu'afficher.
Les parties en cours vivent en mémoire et sont sauvegardées en base à chaque action.

### Monter en charge

Une instance tient plusieurs milliers de parties simultanées. Au-delà, il faudra répartir les salles entre plusieurs
instances (adaptateur Redis de Socket.IO et affinité de session par partie).

## Limites connues

- Les textes légaux sont des modèles : faites-les relire, et complétez le médiateur de la consommation dans les CGV.
- Pas encore de connexion Google/Apple, de chat libre (seulement des émotes, pour éviter la modération) ni de
  traduction anglaise.
