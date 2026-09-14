#!/usr/bin/env bash
# ---------------------------------------------------------------------
#  Kjører prøvene på budmotoren i en midlertidig PostgreSQL.
#  Rører ikke Supabase-prosjektet ditt i det hele tatt.
#
#  Krever:  postgresql-16 (sudo apt install postgresql)
#  Bruk:    bash tests/run.sh
# ---------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "Fant ikke PostgreSQL. Installer med: sudo apt install postgresql"; exit 1; }

PORT=${PGPORT:-5433}
DATA=${PGTESTDATA:-/tmp/dueauksjon-test-pgdata}
SOCK=/tmp

cleanup() { pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$DATA"
initdb -D "$DATA" -A trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$DATA" -l "$DATA/server.log" -o "-k $SOCK -p $PORT -c listen_addresses=" -w start >/dev/null

PSQL="psql -h $SOCK -p $PORT -d duetest -v ON_ERROR_STOP=1 -q"
createdb -h $SOCK -p $PORT duetest

$PSQL -f tests/00_supabase_stub.sql  >/dev/null 2>&1
$PSQL -f supabase/01_schema.sql      >/dev/null 2>&1
$PSQL -f supabase/02_functions.sql   >/dev/null 2>&1
$PSQL -f supabase/03_policies.sql    >/dev/null 2>&1

echo "Skjemaet lastet. Kjører prøvene:"
echo
for prove in tests/01_bidding_test.sql tests/02_tilgang_test.sql; do
  if ! psql -h $SOCK -p $PORT -d duetest -q -f "$prove" 2>&1 \
       | sed 's/.*NOTICE:  //' | grep -v '^psql:'; then
    echo "PRØVER FEILET i $prove"; exit 1
  fi
done
