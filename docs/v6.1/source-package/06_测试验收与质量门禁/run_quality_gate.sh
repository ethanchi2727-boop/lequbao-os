#!/usr/bin/env bash
set -euo pipefail

gate_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_dir="$(cd "${gate_dir}/.." && pwd)"

python3 "${gate_dir}/validate_contracts.py"

node --check "${package_dir}/03_UIUX原型效果图与设计资产/乐趣宝与乐趣生活可运行原型/app.js"
node --check "${package_dir}/03_UIUX原型效果图与设计资产/乐趣宝与乐趣生活可运行原型/app-v6.1.js"
node --check "${package_dir}/tools/build_page_matrix.mjs"

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "ERROR: TEST_DATABASE_URL is set but psql is unavailable" >&2
    exit 1
  fi
  case "${TEST_DATABASE_URL}" in
    *prod*|*production*)
      echo "ERROR: refusing a database URL that appears to be production" >&2
      exit 1
      ;;
  esac
  psql "${TEST_DATABASE_URL}" \
    -v ON_ERROR_STOP=1 \
    -f "${package_dir}/05_数据API事件权限与安全/database/schema.sql"
  echo "PASS: schema.sql executed on disposable test database"
else
  echo "INFO: TEST_DATABASE_URL not set; PostgreSQL execution test skipped"
fi

echo "PASS: technical contract quality gate"
