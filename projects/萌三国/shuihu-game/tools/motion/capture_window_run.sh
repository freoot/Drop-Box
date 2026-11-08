#!/usr/bin/env bash
# CMD-009 · 在 **Godot 真实窗口**（不是 --headless）里跑验证场景，留截图 + 录屏 + 环境日志。
#
# 与 tools/motion/capture_godot_stage.sh 的区别：
#   后者只存图；本脚本额外把 Godot 自报的 DisplayServer / GPU / 窗口尺寸 / 退出码
#   完整留档，用来证明「图是窗口渲染出来的」，而不是离屏或离线合成。
#
# 用法：
#   tools/motion/capture_window_run.sh                       # hero005 全套
#   HERO=hero013 tools/motion/capture_window_run.sh          # 换角色
#   MOVIE=0 tools/motion/capture_window_run.sh               # 只截图不录屏
#
# 产物落在 docs/evidence/CMD-009/window/。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
SCENE="res://godot/motion/hero_action_stage.tscn"
HERO="${HERO:-hero005}"
MOVIE="${MOVIE:-1}"
MOVIE_SECONDS="${MOVIE_SECONDS:-14}"
OUT="${ROOT}/docs/evidence/CMD-009/window"
LOG="${OUT}/godot-window-run.log"
mkdir -p "${OUT}"

MODEL="res://assets/releases/ART-002/r8/models/${HERO}.glb"

run_godot() { # run_godot <说明> <参数...>
  local label="$1"; shift
  echo "— ${label}"
  set +e
  "${GODOT}" --path "${ROOT}" "$@" >> "${LOG}" 2>&1
  local code=$?
  set -e
  echo "  退出码=${code}"
  if [[ ${code} -ne 0 ]]; then
    echo "  !! ${label} 退出码非 0，见 ${LOG}" >&2
    return "${code}"
  fi
}

: > "${LOG}"
echo "### Godot 窗口运行日志 — $(date '+%F %T')" >> "${LOG}"
echo "命令前缀：${GODOT} --path ${ROOT} ${SCENE}" >> "${LOG}"
echo "模型：${MODEL}" >> "${LOG}"
echo "版本：$("${GODOT}" --version 2>&1 | head -1)" >> "${LOG}"
echo >> "${LOG}"

shot() { # shot <action> <ms> <文件名>
  echo "— 窗口截图 ${1} @ ${2}ms"
  set +e
  "${GODOT}" --path "${ROOT}" "${SCENE}" --rendering-driver opengl3 \
    --resolution 1280x720 -- --model "${MODEL}" --action "${1}" --at-ms "${2}" \
    --shot "${OUT}/${3}" >> "${LOG}" 2>&1
  local code=$?
  set -e
  echo "  退出码=${code} → ${3}"
  [[ ${code} -eq 0 ]] || return "${code}"
}

shot idle   400  "${HERO}-idle-400ms.png"
shot walk   500  "${HERO}-walk-500ms.png"
shot attack 452  "${HERO}-attack-impact-452ms.png"
shot attack 1110 "${HERO}-attack-recovery-1110ms.png"
shot hit    4    "${HERO}-hit-impact-4ms.png"
shot death  800  "${HERO}-death-800ms.png"
shot death  1583 "${HERO}-death-end-1583ms.png"

if [[ "${MOVIE}" == "1" ]]; then
  echo "— 窗口录屏 ${MOVIE_SECONDS}s（--write-movie，真实渲染管线出片）"
  set +e
  "${GODOT}" --path "${ROOT}" --write-movie "${OUT}/${HERO}-window-movie.avi" \
    --fixed-fps 30 "${SCENE}" --rendering-driver opengl3 --resolution 1280x720 \
    -- --model "${MODEL}" --quit-after "${MOVIE_SECONDS}" >> "${LOG}" 2>&1
  local_code=$?
  set -e
  echo "  退出码=${local_code}"
  if [[ -f "${OUT}/${HERO}-window-movie.avi" ]]; then
    ffmpeg -y -loglevel error -i "${OUT}/${HERO}-window-movie.avi" \
      -c:v libx264 -pix_fmt yuv420p -crf 23 -an -movflags +faststart \
      "${OUT}/${HERO}-window-cycle.mp4"
    rm -f "${OUT}/${HERO}-window-movie.avi"
    echo "  → ${HERO}-window-cycle.mp4"
  fi
fi

echo
echo "=== Godot 自报环境（关键：display_server 必须是 macOS，headless 时为 headless）==="
grep -E "\[ENV\]" "${LOG}" | head -2
echo
echo "产物目录：${OUT}"
ls -1 "${OUT}"
