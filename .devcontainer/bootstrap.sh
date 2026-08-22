#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

echo "Installing the frozen workspace dependencies"
pnpm install --frozen-lockfile
pnpm --filter @lequ/contracts build

echo "Waiting for PostgreSQL 15"
for attempt in $(seq 1 30); do
  if pg_isready --host="${PGHOST:-postgres}" --port="${PGPORT:-5432}" \
    --username="${PGUSER:-postgres}" --dbname="${PGDATABASE:-lequ_v6}" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

table_count="$(psql --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT count(*) FROM pg_tables WHERE schemaname='public'")"
migration_table="$(psql --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT to_regclass('public.schema_migrations') IS NOT NULL")"

if [[ "$table_count" == "0" ]]; then
  echo "Applying the clean V6.1 development schema"
  psql --set=ON_ERROR_STOP=1 --file=database/schema.sql
elif [[ "$migration_table" != "t" ]]; then
  echo "Refusing a partially initialized database without schema_migrations" >&2
  echo "Rebuild only the dedicated Dev Container volume, then reopen the workspace" >&2
  exit 1
fi

migration_count="$(psql --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command='SELECT count(*) FROM schema_migrations')"
if [[ "$migration_count" != "26" ]]; then
  echo "Expected 26 V6.1 migrations, found $migration_count; refusing an ambiguous database" >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 --set=development_seed=enabled --file=database/development-seed.sql
psql --set=ON_ERROR_STOP=1 --file=database/development-seed-verify.sql

cp .env.development-mock.example .env.development-mock.codespaces.local
sed -i \
  's#DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/lequ_v6#DATABASE_URL=postgres://postgres:postgres@postgres:5432/lequ_v6#' \
  .env.development-mock.codespaces.local

echo "Development database and explicit mock profile are ready"
