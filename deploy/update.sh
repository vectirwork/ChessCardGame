#!/bin/bash
# Construit et relance la version extraite dans /opt/spellmate/repo. Lancé par spellmate-poll (root), qui a déjà
# extrait le commit indiqué dans deploy/VERSION.
set -euo pipefail
D=/opt/spellmate
cd "$D/repo"

# Secrets générés une fois sur le serveur, jamais dans le dépôt
umask 077
if [ ! -s "$D/secrets.env" ]; then
  printf 'POSTGRES_PASSWORD=%s\nSECRET_KEY=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > "$D/secrets.env"
fi
{
  cat deploy/production.env
  echo
  cat "$D/secrets.env"
  if [ -f "$D/local.env" ]; then cat "$D/local.env"; echo; fi
  echo "STATUS_TOKEN=$(cat "$D/status-token")"
} > .env
umask 022
mkdir -p "$D/backups" "$D/status"

COMPOSE="docker compose -p spellmate -f docker-compose.yml -f deploy/compose.prod.yml"
echo "== $(date -u +%FT%TZ) construction de $(git rev-parse --short HEAD)"
$COMPOSE build --pull app
# Configuration vérifiée dans la nouvelle image, avec le même .env et le même environnement que le service, AVANT de
# remplacer la version en ligne : une valeur refusée (config.ts) ou des règles impossibles arrêtent le déploiement
# ici (set -e), et la version en ligne continue de tourner. Rien d'autre n'est lancé (ni la base, ni le serveur).
echo "== configuration"
$COMPOSE run --rm --no-deps -T app node dist/server/index.js --check-config
echo "== lancement"
$COMPOSE up -d --remove-orphans
echo "== santé"
for i in $(seq 1 90); do
  if $COMPOSE exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done
$COMPOSE exec -T app wget -qO- http://127.0.0.1:3000/api/health
echo
docker image prune -f >/dev/null || true

# Sauvegarde quotidienne de la base (en plus des sauvegardes du serveur chez Hetzner)
install -m 644 deploy/systemd/spellmate-backup.service deploy/systemd/spellmate-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now spellmate-backup.timer
echo "== terminé"
