#!/usr/bin/env bash
set -euo pipefail

if [[ "${LEQU_DEVELOPMENT_MOCKS:-}" != "1" || "${LEQU_PUBLIC_PREVIEW:-}" != "1" ]]; then
  echo 'preview database migration requires explicit development mock acknowledgement' >&2
  exit 1
fi

psql_base=(
  psql
  --set=ON_ERROR_STOP=1
  --host="${PGHOST:?PGHOST is required}"
  --username="${PGUSER:?PGUSER is required}"
  --dbname="${PGDATABASE:?PGDATABASE is required}"
)

applied="$(${psql_base[@]} --tuples-only --no-align --command="
  SELECT count(*) FROM schema_migrations
   WHERE version='0027_platform_consumer_identity_exchange'
")"
if [[ "$applied" = "0" ]]; then
  "${psql_base[@]}" --file=/opt/lequ-database/migrations/0027_platform_consumer_identity_exchange.sql
fi

"${psql_base[@]}" \
  --set=development_seed=enabled \
  --file=/opt/lequ-database/development-seed.sql
"${psql_base[@]}" --file=/opt/lequ-database/development-seed-verify.sql
