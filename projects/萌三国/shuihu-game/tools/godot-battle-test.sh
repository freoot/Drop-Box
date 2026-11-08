#!/usr/bin/env bash
# CMD-010 · 可操作战斗流程测试（headless，按键事件驱动）
#
# 跑 godot/tests/battle_flow_test.gd：移动 / 攻击命中扣血 / 受击 / 死亡 / 胜负 / 重开。
# 报告写入 docs/evidence/CMD-010/battle-flow-report.json。
#
# 用法：tools/godot-battle-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
LOG="${ROOT}/docs/evidence/CMD-010/battle-flow-test.log"
mkdir -p "$(dirname "${LOG}")"

set +e
"${GODOT}" --headless --path "${ROOT}" --script res://godot/tests/battle_flow_test.gd 2>&1 | tee "${LOG}"
code=${PIPESTATUS[0]}
set -e

echo
echo "退出码=${code}"
echo "日志：${LOG}"
exit "${code}"
