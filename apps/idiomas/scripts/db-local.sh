#!/usr/bin/env bash
# Crea una base Supabase LOCAL VACÍA (Postgres + shim de la plataforma) y aplica SOLO las
# migraciones y el contenido de Puente, como `postgres` sin superusuario (igual que en Supabase).
#   uso: bash scripts/db-local.sh [directorio-datos] [puerto]
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
DATOS="${1:-${TMPDIR:-/tmp}/puente-pg}"
PUERTO="${2:-54329}"
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
como_pg() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

if [ -f "$DATOS/postmaster.pid" ]; then como_pg "$BIN/pg_ctl -D '$DATOS' stop -m fast" >/dev/null || true; fi
rm -rf "$DATOS"; mkdir -p "$DATOS"
[ "$(id -u)" = "0" ] && chown postgres "$DATOS"
como_pg "$BIN/initdb -D '$DATOS' -U supabase_admin -A trust >/dev/null"
como_pg "$BIN/pg_ctl -D '$DATOS' -o '-p $PUERTO -k /tmp' -l '$DATOS/log' start >/dev/null"
for i in $(seq 1 20); do "$BIN/pg_isready" -h /tmp -p "$PUERTO" >/dev/null 2>&1 && break; sleep 0.5; done
psql -h /tmp -p "$PUERTO" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -c "create role postgres login createrole createdb bypassrls"
psql -h /tmp -p "$PUERTO" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -f "$APP/supabase/local/00_shim_supabase.sql"

PSQL="psql -h /tmp -p $PUERTO -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
shopt -s nullglob
echo "· Migraciones de Puente (como postgres, sin superusuario)"
for f in "$APP"/supabase/migrations/*.sql; do echo "  $(basename "$f")"; $PSQL -f "$f" >/dev/null; done
echo "· Contenido original"
for f in "$APP"/supabase/seed/*.sql; do echo "  $(basename "$f")"; $PSQL -f "$f" >/dev/null; done
for f in "$APP"/supabase/local/1*.sql; do echo "  (solo local) $(basename "$f")"; $PSQL -f "$f" >/dev/null; done
echo "Listo: postgresql://postgres@localhost:$PUERTO/postgres (socket /tmp)"
