#!/usr/bin/env bash
set -euo pipefail

repo_url="https://github.com/deepseek-ai/deepseek-harness.git"
locked_commit="b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"
target_dir="runtime/deepseek-harness-official"

if [[ -e "$target_dir" ]]; then
  echo "目标已存在，请先确认其中没有需要保留的修改：$target_dir" >&2
  exit 2
fi

mkdir -p runtime
git clone --filter=blob:none "$repo_url" "$target_dir"
git -C "$target_dir" fetch --depth 1 origin "$locked_commit"
git -C "$target_dir" checkout --detach "$locked_commit"

actual_commit="$(git -C "$target_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$locked_commit" ]]; then
  echo "提交校验失败：期望 $locked_commit，实际 $actual_commit" >&2
  exit 3
fi

test -f "$target_dir/LICENSE"
test -f "$target_dir/THIRD_PARTY_NOTICES.md"
test -f "$target_dir/package.json"

echo "DeepSeek Harness 已获取并锁定：$actual_commit"
