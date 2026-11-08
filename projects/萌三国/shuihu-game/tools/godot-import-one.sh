#!/usr/bin/env bash
# CMD-016 · 定向导入单个资源（美术交新资产时用）。
#
# 为什么要有它：
#   tools/godot-import.sh 是**全量**重导入（先删 .godot 缓存再重建），
#   几百 MB、几分钟；美术每交一个新资产（比如 r12 虎）其实只需要导入那一个文件。
#   本脚本走同一条安全路线，但只把指定文件的产物拷回：
#     APFS 克隆副本 → 副本内排除 .blend（headless 导入会被 Blender 导入器带崩）
#     → 副本内 --import（复用 .godot 缓存，只补新的）→ 只拷回该文件的
#       .import 与 .godot/imported 产物 → 删除副本。
#
# 主工程 project.godot、既有资源、真实用户目录都不动。
#
# 用法：
#   tools/godot-import-one.sh assets/releases/ART-002/r12/models/tiger.glb
#   tools/godot-import-one.sh --clean assets/releases/ART-002/r12/models/tiger.glb
#      --clean 一并删掉该文件旧的 .godot/imported 缓存（换了内容时用）
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
CLEAN=0
if [ "${1:-}" = "--clean" ]; then
  CLEAN=1
  shift
fi
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "用法：tools/godot-import-one.sh [--clean] <相对工程根的资源路径>" >&2
  exit 2
fi
if [ ! -f "${ROOT}/${TARGET}" ]; then
  echo "找不到资源：${ROOT}/${TARGET}" >&2
  exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-imp1.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT INT TERM

echo "[1/4] 克隆副本：$WORK"
cp -Rc "${ROOT}/." "$WORK/"
rm -rf "$WORK/.godot"
cp -Rc "${ROOT}/.godot" "$WORK/.godot"

echo "[2/4] 副本内排除 .blend/.blend1（headless 导入器处理不了）"
find "$WORK/assets" \( -name '*.blend' -o -name '*.blend1' \) -print0 2>/dev/null |
  while IFS= read -r -d '' f; do rm -f "$f"; done
python3 - "$WORK/project.godot" <<'PY'
import sys
p = sys.argv[1]
lines = [l for l in open(p, encoding='utf-8') if not l.startswith('run/main_scene')]
open(p, 'w', encoding='utf-8').writelines(lines)
PY

echo "[3/4] 副本内导入（复用缓存，只补新文件）"
( cd "$WORK" && "$GODOT" --headless --import --rendering-driver opengl3 --path "$WORK" ) \
  > "$WORK/import.log" 2>&1
grep -cE "reimport" "$WORK/import.log" | xargs echo "    reimport 步骤数："

echo "[4/4] 拷回 ${TARGET} 的导入产物"
if [ ! -f "${WORK}/${TARGET}.import" ]; then
  echo "  !! 副本里没生成 ${TARGET}.import，导入可能失败，见副本日志" >&2
  tail -5 "$WORK/import.log" >&2
  exit 1
fi
cp "${WORK}/${TARGET}.import" "${ROOT}/${TARGET}.import"
# 从 .import 里读出产物路径，逐个拷回
python3 - "$WORK/${TARGET}.import" <<'PY' | while IFS= read -r f; do
import sys, re
txt = open(sys.argv[1], encoding='utf-8').read()
for m in re.finditer(r'res://\.godot/imported/([^\s"\]]+)', txt):
    print(m.group(1))
PY
  src="${WORK}/.godot/imported/$f"
  [ -f "$src" ] && cp "$src" "${ROOT}/.godot/imported/$f" && echo "    拷回 $f"
done
# 说明：导入产物名（<文件名>-<md5>.<ext>）里的 md5 是**按源文件路径**算的，
# 不是按内容——同一个路径永远落在同一个产物上，内容变了就是原地覆盖，
# 所以这里**不需要**清理旧产物（曾经按名字通配删除，把别的路径的产物也误删过）。
if [ "$CLEAN" = "1" ]; then
  echo "    （--clean 忽略：产物按路径命名，覆盖即可，无同名旧产物可清）"
fi

echo "完成：${TARGET}.import 已更新"
