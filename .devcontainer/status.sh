#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/.devcontainer/runtime"

for name in mock-gateway api workbench; do
  pid_file="$runtime/$name.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name: running (PID $(cat "$pid_file"))"
  else
    echo "$name: stopped"
  fi
done
