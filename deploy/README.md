# Production : chess-powers.com

Le serveur (Hetzner Cloud, Ubuntu 24.04) est créé et piloté par API, sans SSH : le port 22 est fermé par le pare-feu.

## Fonctionnement

- `cloud-init.yaml` installe Docker et un minuteur `spellmate-poll` qui, toutes les 2 minutes, lit
  `deploy/VERSION` sur la branche `claude/peaceful-hamilton-qr9cmc` du dépôt public.
- Si `deploy/VERSION` désigne un autre commit que celui déployé, le serveur l'extrait et lance `deploy/update.sh` :
  construction de l'image, vérification de la configuration dans la nouvelle image (`--check-config`, voir plus bas),
  `docker compose up`, attente de la santé. Les commits intermédiaires de la branche ne partent donc jamais en
  production : **déployer = changer `deploy/VERSION`**.
- En cas d'échec, ce commit est noté comme raté et n'est pas retenté. Si l'échec a lieu avant `docker compose up`
  (construction, règles impossibles, configuration refusée), la version précédente continue de tourner. Après
  (contrôle de santé), le conteneur a déjà été remplacé : le site reste hors ligne jusqu'au déploiement suivant.
- Retour arrière : `deploy/VERSION` doit désigner un commit **différent** de celui noté comme déployé (et de celui
  noté comme raté), sinon rien ne se passe. Pour revenir au code d'un commit déjà déployé, désigner un commit qui ne
  diffère de lui que par `deploy/VERSION` : pour 2e99cbc, `ee6fa2e` (même code).
- `deploy/report.sh` publie l'état (version, santé, conteneurs, disque, journaux récents) dans
  `/opt/spellmate/status`, servi par Caddy à `https://chess-powers.com/.well-known/spellmate-<jeton>/status.json`
  (aussi `deploy.log`, `app.log`, `caddy.log`, `ps.txt`). Le jeton est dans `/opt/spellmate/status-token` et dans
  l'étiquette `status-token` du serveur Hetzner.

## Secrets

- `/opt/spellmate/secrets.env` : mot de passe PostgreSQL et clé secrète, générés au premier déploiement sur le
  serveur. Ils ne quittent jamais le serveur.
- `/opt/spellmate/local.env` (optionnel) : clés Stripe ou SMTP, quand elles seront nécessaires. Jamais dans ce
  dépôt, qui est public.
- `deploy/production.env` : configuration non secrète (domaine, nom, mode de paiement, mentions légales).

## Configuration vérifiée avant la mise en ligne

- Une valeur illisible (`PORT`, `PAYMENTS_MODE`, `SMTP_PORT`, `DATABASE_POOL_MAX`, et hors de Compose `PUBLIC_URL` et
  `TRUST_PROXY`) arrête le serveur avec un message en français ; `SPELLMATE_TEST_RULES` (tests) est refusée en
  production. Sous Compose, `PUBLIC_URL` est tirée de `DOMAIN` et `TRUST_PROXY` vaut `true` si `.env` ne le donne pas
  (`docker-compose.yml`).
- `update.sh` vérifie la configuration dans la nouvelle image, avec le même `.env` et le même environnement que le
  service, avant `docker compose up` : `docker compose run --rm --no-deps -T app node dist/server/index.js
  --check-config` (rien d'autre n'est lancé, ni la base ni le serveur). Une configuration refusée arrête le
  déploiement à cette étape (message dans `deploy.log`), et la version en ligne continue de tourner. C'est le cas de
  `/opt/spellmate/local.env`, qui n'est pas dans ce dépôt : il est vérifié au premier déploiement qui le lit.
- Des règles de jeu impossibles (`checkRules` : par exemple 6 cartes par joueur avec au plus 2 Climats) arrêtent la
  construction (« Règles impossibles : construction arrêtée. », dans `deploy.log`) : `update.sh` s'arrête avant
  `docker compose up` et la version en ligne continue de tourner. L'arrêt au démarrage (« Règles impossibles :
  arrêt. ») ne concerne que les serveurs lancés hors de cette chaîne. Le journal résume les règles des nouvelles
  parties.
- Avertissements sans arrêt : mentions légales (`LEGAL_*`) encore à l'état de modèle, `PAYMENTS_MODE=stripe` sans
  `STRIPE_WEBHOOK_SECRET`, interrupteur `FEATURE_*` inconnu ou illisible.
- Interrupteurs (`FEATURE_*`, voir `.env.example`) : dans `deploy/production.env` (ou `/opt/spellmate/local.env`),
  pris en compte au déploiement suivant (un changement de `deploy/VERSION` ; `update.sh` assemble `.env`, reconstruit
  l'image, avec un site identique, et redémarre le conteneur, en quelques minutes). Maintenance avant une mise à jour
  délicate : `FEATURE_NEW_GAMES=0` (plus de nouvelle partie, celles en cours continuent).

## Sauvegardes

Sauvegardes quotidiennes du serveur chez Hetzner, plus un `pg_dump` quotidien dans `/opt/spellmate/backups`
(14 jours, `deploy/backup.sh`, minuteur `spellmate-backup`).
