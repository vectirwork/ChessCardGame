#!/bin/bash
# Sauvegarde de la base PostgreSQL dans /opt/spellmate/backups (14 jours gardés).
set -euo pipefail
D=/opt/spellmate
cd "$D/repo"
f="$D/backups/spellmate-$(date +%F).sql.gz"
docker compose -p spellmate -f docker-compose.yml -f deploy/compose.prod.yml exec -T db pg_dump -U spellmate spellmate | gzip > "$f.tmp"
mv "$f.tmp" "$f"
find "$D/backups" -name 'spellmate-*.sql.gz' -mtime +14 -delete
