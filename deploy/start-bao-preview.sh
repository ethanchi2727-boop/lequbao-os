#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile="$root/.env.development-mock.example"
worker_ready_marker=/tmp/lequ-worker-ready
cd "$root"

if [[ "${NODE_ENV:-}" != "development" || "${LEQU_DEVELOPMENT_MOCKS:-}" != "1" ]]; then
  echo 'bao.lequ.com preview requires explicit development mock mode' >&2
  exit 1
fi
if [[ "${LEQU_PUBLIC_PREVIEW:-}" != "1" || "${LEQU_PREVIEW_HOSTNAME:-}" != "bao.lequ.com" ]]; then
  echo 'bao.lequ.com preview hostname acknowledgement is missing' >&2
  exit 1
fi
: "${DATABASE_URL:?DATABASE_URL is required}"
rm -f "$worker_ready_marker"

pids=()
cleanup() {
  trap - EXIT INT TERM
  if [[ "${#pids[@]}" -gt 0 ]]; then kill "${pids[@]}" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

start() {
  "$@" &
  pids+=("$!")
}

wait_for_url() {
  local name="$1"
  local url="$2"
  for attempt in $(seq 1 60); do
    if node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$url"; then
      echo "$name ready"
      return
    fi
    sleep 1
  done
  echo "$name failed readiness at $url" >&2
  exit 1
}

start env LEQU_DEVELOPMENT_MOCK_HOST=127.0.0.1 \
  node --env-file="$profile" tooling/development-mock-gateway.mjs
wait_for_url mock-gateway http://127.0.0.1:3399/health

start env HOST=127.0.0.1 PORT=3000 DATABASE_URL="$DATABASE_URL" \
  node --env-file="$profile" --import tsx apps/api/src/server.ts
wait_for_url api http://127.0.0.1:3000/ready

worker_loop() {
  while true; do
    if env DATABASE_URL="$DATABASE_URL" \
      node --env-file="$profile" --import tsx apps/worker/src/main.ts; then
      touch "$worker_ready_marker"
    else
      echo 'Worker iteration failed; preview health will fail after the readiness marker expires' >&2
    fi
    sleep 5
  done
}
start worker_loop

start env HOST=0.0.0.0 PORT=8080 \
  WORKBENCH_API_PROXY_URL=http://127.0.0.1:3000 \
  LEQU_DEVELOPMENT_MOCKS=1 LEQU_PUBLIC_PREVIEW=1 LEQU_PREVIEW_HOSTNAME=bao.lequ.com \
  node apps/workbench-web/server.mjs
wait_for_url workbench http://127.0.0.1:8080/health

echo 'bao.lequ.com development-mock preview is ready on port 8080'
wait -n "${pids[@]}"
echo 'A preview process exited unexpectedly' >&2
exit 1
