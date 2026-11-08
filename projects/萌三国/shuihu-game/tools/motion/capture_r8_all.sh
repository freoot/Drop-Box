#!/usr/bin/env bash
# ACT-006 · 逐个角色在 Godot 运行时截图（死亡末帧 + 少量待机），用于人工复核
#
# 用法：bash tools/motion/capture_r8_all.sh
# 产物：docs/evidence/CMD-008/motion/<hero>-death-end.png 等
#
# 说明：不是离线渲染，是 Godot 真实加载 r8 GLB、seek 到指定毫秒后的实拍。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
SCENE="res://godot/motion/hero_action_stage.tscn"
OUT="${ROOT}/docs/evidence/CMD-008/motion"
mkdir -p "${OUT}"

shot() { # shot <hero> <action> <ms> <name>
  local hero="$1" action="$2" ms="$3" name="$4"
  local model="res://assets/releases/ART-002/r8/models/${hero}.glb"
  printf '— %-8s %-6s @ %sms → %s ' "${hero}" "${action}" "${ms}" "${name}"
  "${GODOT}" --path "${ROOT}" "${SCENE}" --rendering-driver opengl3 \
    --resolution 1280x720 -- --model "${model}" --action "${action}" --at-ms "${ms}" \
    --shot "${OUT}/${name}" 2>&1 | grep -E "^SHOT" | sed 's/.*err=/err=/' || echo "(无输出)"
}

heroes=$(cd "${ROOT}/assets/releases/ART-002/r8/models" && ls hero*.glb | sed 's/\.glb$//')
for h in ${heroes}; do
  shot "${h}" death 1583 "${h}-death-end.png"
done

# 三个代表角色的待机，便于横向对比体型/姿态
for h in hero002 hero013 hero024; do
  shot "${h}" idle 400 "${h}-idle-400ms.png"
done

echo "完成：$(ls "${OUT}" | wc -l | tr -d ' ') 张 → ${OUT}"
