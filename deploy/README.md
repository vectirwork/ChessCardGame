# Production : chess-powers.com

Le serveur (Hetzner Cloud, Ubuntu 24.04) est créé et piloté par API, sans SSH : le port 22 est fermé par le pare-feu.

## Fonctionnement

- `cloud-init.yaml` installe Docker et un minuteur `spellmate-poll` qui, toutes les 2 minutes, lit
  `deploy/VERSION` sur la branche `claude/peaceful-hamilton-qr9cmc` du dépôt public.
- Si `deploy/VERSION` désigne un autre commit que celui déployé, le serveur l'extrait et lance `deploy/update.sh` :
  construction de l'image, `docker compose up`, attente de la santé. Les commits intermédiaires de la branche ne
  partent donc jamais en production : **déployer = changer `deploy/VERSION`**.
- En cas d'échec, ce commit est noté comme raté et n'est pas retenté ; la version précédente continue de tourner
  si la construction a échoué avant le redémarrage.
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

## Sauvegardes

Sauvegardes quotidiennes du serveur chez Hetzner, plus un `pg_dump` quotidien dans `/opt/spellmate/backups`
(14 jours, `deploy/backup.sh`, minuteur `spellmate-backup`).
