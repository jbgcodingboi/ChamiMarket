#!/usr/bin/env bash
# Runs supabase/tests/schema.test.sql against a throwaway local Postgres (16+),
# using supabase/tests/supabase-stub.sql in place of Supabase's auth schema.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$BIN/initdb" ] || { echo "Postgres not found; set PG_BIN to its bin directory." >&2; exit 1; }
DIR="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"
RUN=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN=(runuser -u postgres --); fi
cleanup() { "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
# UTF-8 like Supabase, so text checks behave the same as in production.
"${RUN[@]}" "$BIN/initdb" -D "$DIR/data" -U postgres -A trust -E UTF8 --locale=C >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses='' -c wal_level=logical" -l "$DIR/log" -w start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$BIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase-stub.sql"
"${PSQL[@]}" -f "$ROOT/supabase/schema.sql"
# Applying twice checks the file is safe to re-run after an update.
"${PSQL[@]}" -f "$ROOT/supabase/schema.sql"
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/schema.test.sql" 2>&1 | sed -e 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /' -e 's/^NOTICE:  /  /'
