#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/.devcontainer/runtime"
profile="$root/.env.development-mock.codespaces.local"
mkdir -p "$runtime"
cd "$root"

if [[ ! -f "$profile" ]]; then
  echo "Generated development profile is missing; run bash .devcontainer/bootstrap.sh" >&2
  exit 1
fi

start_process() {
  local name="$1"
  local marker="$2"
  shift 2
  local pid_file="$runtime/$name.pid"
  local log_file="$runtime/$name.log"
  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file")"
    if kill -0 "$existing_pid" 2>/dev/null \
      && tr '\0' ' ' <"/proc/$existing_pid/cmdline" | grep --fixed-strings --quiet "$marker"; then
      echo "$name is already running as PID $existing_pid"
      return
    fi
    rm -f "$pid_file"
  fi
  nohup "$@" >"$log_file" 2>&1 &
  echo "$!" >"$pid_file"
  echo "Started $name as PID $!"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local log_file="$runtime/$name.log"
  for attempt in $(seq 1 40); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      echo "$name is ready at $url"
      return
    fi
    sleep 1
  done
  echo "$name failed its readiness probe at $url" >&2
  tail -n 80 "$log_file" >&2 || true
  exit 1
}

start_process mock-gateway development-mock-gateway.mjs \
  env LEQU_DEVELOPMENT_MOCK_HOST=0.0.0.0 \
  node --env-file="$profile" tooling/development-mock-gateway.mjs
wait_for_url mock-gateway http://127.0.0.1:3399/health

start_process api apps/api/src/server.ts \
  env HOST=0.0.0.0 DATABASE_URL=postgres://postgres:postgres@postgres:5432/lequ_v6 \
  node --env-file="$profile" --import tsx apps/api/src/server.ts
wait_for_url api http://127.0.0.1:3000/ready

start_process workbench apps/workbench-web/server.mjs \
  env HOST=0.0.0.0 PORT=4173 LEQU_DEVELOPMENT_MOCKS=1 \
  WORKBENCH_API_PROXY_URL=http://127.0.0.1:3000 node apps/workbench-web/server.mjs
wait_for_url workbench http://127.0.0.1:4173/

echo "Development stack ready: open Workbench port 4173 at /__development/login"
