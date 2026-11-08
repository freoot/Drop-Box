#!/usr/bin/env bash
# ART-002 r7 批次证据生成（可复现）。
#
# 产出 assets/releases/ART-002/r7/evidence/<batch>/：
#   headless.json        无图形验证（--batch-test），只比对骨骼姿态变化
#   runtime.json         图形验证（--batch-capture），读 Godot framebuffer
#   <hero>-actions.png   每人 4 动作 × 3 采样点的实拍图
#   page-NN.png          每页总览
#
# 两个 json 都由当前 godot/art_002/batch_review.gd 生成并带脚本 SHA-256，
# tests/art-002-r7.test.mjs 会逐一比对，因此**必须成对重新生成**，
# 只更新其中一个会导致哈希断言失败。
#
# 用法：
#   tools/art-002-capture.sh            # 默认 b1，先无图形后图形
#   BATCH=b2 tools/art-002-capture.sh
#   tools/art-002-capture.sh --headless-only   # 只跑无图形（无窗口环境）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
BATCH="${BATCH:-b1}"
HEADLESS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --headless-only) HEADLESS_ONLY=1 ;;
    *) echo "未知参数: $arg" >&2; exit 2 ;;
  esac
done

if [[ ! -x "$ENGINE" ]]; then
  echo "找不到 Godot 可执行文件: ${ENGINE}（可用 GODOT=... 指定）" >&2
  exit 1
fi

cd "$ROOT"

echo "[1/2] 无图形验证（--batch-test）→ headless.json"
"$ENGINE" --headless --rendering-driver opengl3 --path "$ROOT" \
  res://godot/art_002/batch_review.tscn -- --batch-test --batch="$BATCH"

if [[ "$HEADLESS_ONLY" -eq 1 ]]; then
  echo "--headless-only：跳过图形验证。注意 runtime.json 不会更新，测试会失败。"
  exit 0
fi

echo "[2/2] 图形验证（--batch-capture）→ runtime.json + 动作截图"
echo "     这一步会真实打开一个 Godot 窗口读取 framebuffer，耗时约 2 分钟。"
"$ENGINE" --path "$ROOT" res://godot/art_002/batch_review.tscn \
  --rendering-driver opengl3 -- --batch-capture --batch="$BATCH"

echo "产出目录：assets/releases/ART-002/r7/evidence/$BATCH"
ls -la "assets/releases/ART-002/r7/evidence/$BATCH"
