#!/usr/bin/env bash
# Godot 4.7.2 资源导入（可复现）。
#
# 背景：工程 assets/ 下存在大量 .blend。Godot 4.7 的 Blender 场景导入器在
# headless 模式下无法配置 Blender 路径，会报错并中止整轮 reimport（不只是跳过
# .blend，而是其余资源一并不导入）。详见 docs/pipeline/05_import_notes.md。
#
# 因此本脚本在**独立副本**中导入：排除 .blend/.blend1、移除 run/main_scene，
# 导入完成后只把导入产物拷回原工程。原工程 project.godot 不被修改。
#
# 用法：
#   tools/godot-import.sh                      # 默认引擎路径，工作目录由 mktemp 分配
#   GODOT=/path/to/Godot tools/godot-import.sh
#   IMPORT_WORK=/abs/existing-parent-dir tools/godot-import.sh  # 只作**父目录**
#   tools/godot-import.sh --no-copy-back       # 只导入不拷回（用于验证）
#   tools/godot-import.sh --keep-work          # 结束后保留副本目录（排查用）
#
# 路径安全（tools/lib/import-work-guard.sh）：
#   - 工作目录**始终**是本次 mktemp 新建的独占子目录，不由调用者指定
#   - IMPORT_WORK 只作父目录，必须已存在且为真实目录；留空则用系统临时目录
#   - 绝不清空/删除任何既有目录；清理只删本次新建的子目录，且校验一次性 token
#   - 路径先完整归一化（重复斜杠 / `.` / `..`），再拒绝符号链接、原工程及其祖先/后代、
#     受保护顶层路径
#   回归测试：tools/tests/import-work-guard.test.sh（哨兵文件保护，20+ 项）
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="${ROOT}/tools/lib/import-work-guard.sh"
ENGINE="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
COPY_BACK=1
KEEP_WORK="${KEEP_WORK:-0}"
for arg in "$@"; do
  case "${arg}" in
    --no-copy-back) COPY_BACK=0 ;;
    --keep-work) KEEP_WORK=1 ;;
    *) echo "未知参数: ${arg}" >&2; exit 2 ;;
  esac
done

if [[ ! -f "${GUARD}" ]]; then
  echo "缺少路径安全护栏：${GUARD}" >&2
  exit 1
fi
# shellcheck source=lib/import-work-guard.sh
source "${GUARD}"

if [[ ! -x "${ENGINE}" ]]; then
  echo "找不到 Godot 可执行文件: ${ENGINE}（可用 GODOT=... 指定）" >&2
  exit 1
fi

echo "[1/6] 版本核验"
"${ENGINE}" --version

echo "[2/6] 在合法父目录下新建本次独占副本目录（护栏校验，绝不删除调用者既有目录）"
WORK="$(iw_resolve_work "${IMPORT_WORK:-}" "${ROOT}")" || exit 1
echo "   本次副本目录：${WORK}"

echo "[3/6] 创建导入副本（APFS 克隆，不动原工程）"
cp -Rc "${ROOT}/." "${WORK}/"
rm -rf "${WORK}/.godot"

echo "[4/6] 副本内移除 run/main_scene 并排除 .blend/.blend1"
python3 - "${WORK}/project.godot" <<'PY'
import sys
p = sys.argv[1]
lines = [l for l in open(p, encoding='utf-8') if not l.startswith('run/main_scene')]
open(p, 'w', encoding='utf-8').writelines(lines)
PY
STASH="${WORK}/.blend-stash"
mkdir -p "${STASH}"
find "${WORK}/assets" \( -name '*.blend' -o -name '*.blend1' \) -print0 2>/dev/null |
  while IFS= read -r -d '' f; do
    rel="${f#"${WORK}"/}"
    mkdir -p "${STASH}/$(dirname "${rel}")"
    mv "${f}" "${STASH}/${rel}"
  done
echo "   已排除 $(find "${STASH}" -type f | wc -l | tr -d ' ') 个 blend 源文件"

DONE=0
cleanup() {
  if [[ "${DONE}" -eq 1 && "${KEEP_WORK}" -ne 1 ]]; then
    iw_cleanup "${WORK}" "${ROOT}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[5/6] 执行导入（headless + opengl3）"
( cd "${WORK}" && "${ENGINE}" --headless --import --rendering-driver opengl3 --path "${WORK}" )
echo "   副本产物：$(find "${WORK}" -name '*.import' -not -path '*/.git/*' | wc -l | tr -d ' ') 个 .import，$(ls "${WORK}/.godot/imported" 2>/dev/null | wc -l | tr -d ' ') 个导入缓存"

if [[ "${COPY_BACK}" -eq 0 ]]; then
  echo "[6/6] --no-copy-back：跳过拷回，副本保留在 ${WORK}"
  DONE=1
  exit 0
fi

echo "[6/6] 拷回导入产物到原工程"
mkdir -p "${ROOT}/.godot/imported"
# 6a. 各资源旁边的 .import 元数据（按相对路径还原）
find "${WORK}" -name '*.import' -not -path '*/.git/*' -print0 |
  while IFS= read -r -d '' f; do
    rel="${f#"${WORK}"/}"
    mkdir -p "${ROOT}/$(dirname "${rel}")"
    cp "${f}" "${ROOT}/${rel}"
  done
# 6b. .godot/imported 缓存
if [[ -d "${WORK}/.godot/imported" ]]; then
  cp -R "${WORK}/.godot/imported/." "${ROOT}/.godot/imported/"
fi
# 6c. Godot 4.x 的 .uid 与 uid_cache.bin
find "${WORK}" -name '*.uid' -not -path '*/.git/*' -print0 |
  while IFS= read -r -d '' f; do
    rel="${f#"${WORK}"/}"
    mkdir -p "${ROOT}/$(dirname "${rel}")"
    cp "${f}" "${ROOT}/${rel}"
  done
[[ -f "${WORK}/.godot/uid_cache.bin" ]] && cp "${WORK}/.godot/uid_cache.bin" "${ROOT}/.godot/uid_cache.bin"

echo "   原工程现有：$(find "${ROOT}" -name '*.import' -not -path '*/.git/*' | wc -l | tr -d ' ') 个 .import，$(ls "${ROOT}/.godot/imported" 2>/dev/null | wc -l | tr -d ' ') 个导入缓存"
DONE=1
if [[ "${KEEP_WORK}" -eq 1 ]]; then
  echo "   --keep-work：副本保留在 ${WORK}"
fi
echo "完成。注意：导入产物被仓库 .gitignore 忽略，他人 clone 后需重跑本脚本。"
