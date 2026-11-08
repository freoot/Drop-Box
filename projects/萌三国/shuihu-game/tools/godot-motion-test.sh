#!/usr/bin/env bash
# CMD-007 · 一角色五动作 Godot 运行时断言（headless）。
#
# 断言全部来自运行时真实加载的 GLB 片段：5 个片段是否存在、death 是否原生、
# weapon.R 挂点父级、attack 命中时点（实测）与收招总时长（1110ms）。
#
# 用法：tools/godot-motion-test.sh
#       GODOT=/path/to/Godot tools/godot-motion-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
LOG="${ROOT}/docs/evidence/CMD-007-motion-test.log"
mkdir -p "$(dirname "${LOG}")"

echo "运行：${GODOT} --headless --script res://godot/tests/motion_action_test.gd"
"${GODOT}" --headless --rendering-driver opengl3 --path "${ROOT}" \
  --script res://godot/tests/motion_action_test.gd 2>&1 | tee "${LOG}"
status="${PIPESTATUS[0]}"
echo "日志：${LOG}"
exit "${status}"
