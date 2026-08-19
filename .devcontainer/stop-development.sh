#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/.devcontainer/runtime"

stop_process() {
  local name="$1"
  local marker="$2"
  local pid_file="$runtime/$name.pid"
  [[ -f "$pid_file" ]] || return
  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    if ! tr '\0' ' ' <"/proc/$pid/cmdline" | grep --fixed-strings --quiet "$marker"; then
      echo "Refusing to stop unexpected PID $pid recorded for $name" >&2
      exit 1
    fi
    kill "$pid"
    echo "Stopped $name PID $pid"
  fi
  rm -f "$pid_file"
}

stop_process workbench apps/workbench-web/server.mjs
stop_process api apps/api/src/server.ts
stop_process mock-gateway development-mock-gateway.mjs
