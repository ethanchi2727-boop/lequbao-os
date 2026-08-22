#!/usr/bin/env bash
set -euo pipefail

psql --set=ON_ERROR_STOP=1 \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --file=/opt/lequ-database/schema.sql

psql --set=ON_ERROR_STOP=1 \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --set=development_seed=enabled \
  --file=/opt/lequ-database/development-seed.sql

psql --set=ON_ERROR_STOP=1 \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --file=/opt/lequ-database/development-seed-verify.sql
