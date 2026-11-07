#!/bin/bash
# Publie l'état du serveur dans /opt/spellmate/status (servi par Caddy à l'adresse secrète) : version déployée,
# santé, conteneurs, disque, journaux récents. Lancé par spellmate-poll après chaque passage.
D=/opt/spellmate
S=$D/status
cd "$D/repo" || exit 0
COMPOSE="docker compose -p spellmate -f docker-compose.yml -f deploy/compose.prod.yml"
health=$($COMPOSE exec -T app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true)
$COMPOSE ps --all --format '{{.Service}} {{.State}} {{.Status}}' > "$S/ps.txt" 2>&1 || true
$COMPOSE logs --no-color --tail 300 app > "$S/app.log" 2>&1 || true
$COMPOSE logs --no-color --tail 100 caddy > "$S/caddy.log" 2>&1 || true
ls -1t "$D/backups" 2>/dev/null | head -5 > "$S/backups.txt" || true
python3 - "$S" "$health" <<'PY'
import json, os, shutil, subprocess, sys, time
s, health = sys.argv[1], sys.argv[2]
read = lambda f: open(os.path.join(s, f)).read().strip() if os.path.exists(os.path.join(s, f)) else None
disk = shutil.disk_usage('/')
json.dump({
  'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
  'deployed': read('deployed'), 'failed': read('failed'),
  'health': health or None,
  'containers': (read('ps.txt') or '').splitlines(),
  'disk_free_gb': round(disk.free / 1e9, 1),
  'uptime': subprocess.run(['uptime', '-p'], capture_output=True, text=True).stdout.strip(),
}, open(os.path.join(s, 'status.json'), 'w'), indent=1)
PY
chmod 644 "$S"/* 2>/dev/null || true
