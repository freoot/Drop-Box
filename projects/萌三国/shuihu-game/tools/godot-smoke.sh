#!/usr/bin/env bash
# Godot 冒烟测试（可复现）。连续多次运行应稳定 exit 0 且输出 GODOT_SMOKE_OK。
#
# 用法：
#   tools/godot-smoke.sh                  # 跑 1 次
#   SMOKE_TIMES=3 tools/godot-smoke.sh    # 跑 3 次，验证稳定性
#   GODOT=/path/to/Godot tools/godot-smoke.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
TIMES="${SMOKE_TIMES:-1}"
LOG="${SMOKE_LOG:-/tmp/shuihu-smoke-run.log}"

if [[ ! -x "$ENGINE" ]]; then
  echo "找不到 Godot 可执行文件: ${ENGINE}（可用 GODOT=... 指定）" >&2
  exit 1
fi

fail=0
for i in $(seq 1 "$TIMES"); do
  echo "--- 第 $i/$TIMES 次 ---"
  ( cd "$ROOT" && "$ENGINE" --headless --rendering-driver opengl3 --path "$ROOT" \
      --script res://godot/tests/smoke_test.gd ) >"$LOG" 2>&1
  code=$?
  if [[ $code -eq 0 ]] && grep -q "GODOT_SMOKE_OK" "$LOG"; then
    echo "   exit 0 + GODOT_SMOKE_OK"
  else
    echo "   失败：exit=${code}，标记未出现"
    fail=1
  fi
  tail -6 "$LOG" | sed 's/^/     /'
done

echo "--- 最近一次完整日志：$LOG ---"
exit "$fail"
