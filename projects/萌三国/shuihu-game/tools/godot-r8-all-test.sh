#!/usr/bin/env bash
# ACT-006 · 18 个 r8 角色在 Godot 运行时逐个加载并真实切换五动作（headless 断言）
#
# 用法：bash tools/godot-r8-all-test.sh
#       GODOT=/path/to/Godot bash tools/godot-r8-all-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
LOG="${ROOT}/docs/evidence/CMD-008-godot-all.log"

echo "运行：${GODOT} --headless --script res://godot/tests/r8_all_heroes_test.gd"
"${GODOT}" --headless --rendering-driver opengl3 --path "${ROOT}" \
  --script res://godot/tests/r8_all_heroes_test.gd 2>&1 | tee "${LOG}"
status="${PIPESTATUS[0]}"
echo "日志：${LOG}"
exit "${status}"
