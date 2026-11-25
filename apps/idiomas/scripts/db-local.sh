#!/usr/bin/env bash
# Levanta un Postgres 16 local, aplica el shim de Supabase, las migraciones EXISTENTES de Control de
# Costales (para probar que conviven) y las migraciones + datos de la app de idiomas.
#   uso: apps/idiomas/scripts/db-local.sh [directorio-datos] [puerto]
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
APP="$RAIZ/apps/idiomas"
DATOS="${1:-${TMPDIR:-/tmp}/idiomas-pg}"
PUERTO="${2:-54329}"
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"

como_pg() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

if [ -f "$DATOS/postmaster.pid" ]; then como_pg "$BIN/pg_ctl -D '$DATOS' stop -m fast" || true; fi
rm -rf "$DATOS"; mkdir -p "$DATOS"
[ "$(id -u)" = "0" ] && chown postgres "$DATOS"
como_pg "$BIN/initdb -D '$DATOS' -U postgres -A trust >/dev/null"
como_pg "$BIN/pg_ctl -D '$DATOS' -o '-p $PUERTO -k /tmp' -l '$DATOS/log' start >/dev/null"
for i in $(seq 1 20); do "$BIN/pg_isready" -h /tmp -p "$PUERTO" >/dev/null 2>&1 && break; sleep 0.5; done

PSQL="psql -h /tmp -p $PUERTO -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f "$APP/supabase/local/00_shim_supabase.sql"
shopt -s nullglob
echo "· Migraciones de Control de Costales"
for f in "$RAIZ"/supabase/migrations/*.sql; do $PSQL -f "$f" >/dev/null; done
echo "· Migraciones de Idiomas"
for f in "$APP"/supabase/migrations/*.sql; do echo "  $(basename "$f")"; $PSQL -f "$f" >/dev/null; done
echo "· Datos originales del piloto"
for f in "$APP"/supabase/seed/*.sql; do echo "  $(basename "$f")"; $PSQL -f "$f" >/dev/null; done
for f in "$APP"/supabase/local/1*.sql; do echo "  (solo local) $(basename "$f")"; $PSQL -f "$f" >/dev/null; done
echo "Listo: postgresql://postgres@localhost:$PUERTO/postgres (socket /tmp)"
