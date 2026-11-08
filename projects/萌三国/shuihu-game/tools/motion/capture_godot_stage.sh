#!/usr/bin/env bash
# CMD-007 · 采集 Godot 运行时（非离线渲染）的五动作截图与序列帧，并合成录屏。
#
# 用法：
#   tools/motion/capture_godot_stage.sh            # 截图 + 序列帧 + mp4
#   SHOTS_ONLY=1 tools/motion/capture_godot_stage.sh
#
# 产物全部落在 docs/evidence/CMD-007/motion/。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
SCENE="res://godot/motion/hero_action_stage.tscn"
OUT="${ROOT}/docs/evidence/CMD-007/motion"
FRAMES="${OUT}/frames"
mkdir -p "${OUT}" "${FRAMES}"

shot() { # shot <action> <ms> <name>
  echo "— 截图 ${1} @ ${2}ms → ${3}"
  "${GODOT}" --path "${ROOT}" "${SCENE}" --rendering-driver opengl3 \
    --resolution 1280x720 -- --action "${1}" --at-ms "${2}" --shot "${OUT}/${3}" 2>&1 \
    | grep -E "^SHOT|ERROR" || true
}

seq() { # seq <action> <duration_ms> <frames>
  local action="$1" dur="$2" n="$3"
  local dir="${FRAMES}/${action}"
  rm -rf "${dir}"
  mkdir -p "${dir}"
  echo "— 序列帧 ${action}：${n} 帧覆盖 ${dur}ms"
  "${GODOT}" --path "${ROOT}" "${SCENE}" --rendering-driver opengl3 \
    --resolution 1280x720 -- --action "${action}" --shot-dir "${dir}" \
    --duration-ms "${dur}" --frames "${n}" 2>&1 | grep -E "^SEQ_DONE|ERROR" || true
}

shot idle 400  "01-idle-400ms.png"
shot idle 1200 "02-idle-1200ms.png"
shot walk 500  "03-walk-500ms.png"
shot attack 452  "04-attack-impact-452ms.png"
shot attack 1000 "05-attack-native-end-1000ms.png"
shot attack 1110 "06-attack-recovery-1110ms.png"
shot hit 4     "07-hit-impact-4ms.png"
shot hit 375   "08-hit-375ms.png"
shot death 0   "09-death-0ms.png"
shot death 800 "10-death-800ms.png"
shot death 1583 "11-death-end-1583ms.png"

if [[ "${SHOTS_ONLY:-0}" != "1" ]]; then
  seq attack 1110 28
  seq death 1583 32
  FPS=24
  for action in attack death; do
    ffmpeg -y -loglevel error -framerate "${FPS}" -pattern_type glob \
      -i "${FRAMES}/${action}/${action}_*.png" \
      -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
      "${OUT}/${action}-roll.mp4"
    echo "— 录屏 ${OUT}/${action}-roll.mp4"
  done
fi

echo "完成：$(ls -1 "${OUT}" | wc -l | tr -d ' ') 个顶层文件"
