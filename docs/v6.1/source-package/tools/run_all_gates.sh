#!/usr/bin/env bash
set -euo pipefail

bash 06_测试验收与质量门禁/run_quality_gate.sh
node tools/build_page_matrix.mjs
python3 tools/verify_package.py
