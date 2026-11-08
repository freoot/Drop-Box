#!/bin/bash
# ============================================================================
# CMD-019 · 隔离试玩入口（人工真实鼠标键盘验收专用）
#
# 作用：用【独立 HOME】+【临时沙盒存档】启动带窗口的打虎首关，
#       保证人工试玩期间：
#         - 主工程正式存档 user://save.json 完全不被读写；
#         - 本次试玩的存档落在独立 HOME 下的沙盒目录，随用随弃；
#         - 退出后打印本次存档位置与启动参数，便于写验收记录。
#
# 用法：
#   tools/launch-tiger-prototype-isolated.sh                 # 新建沙盒启动
#   tools/launch-tiger-prototype-isolated.sh --keep-home     # 复用最近一次沙盒
#   tools/launch-tiger-prototype-isolated.sh --home <dir>    # 显式指定沙盒目录
#   tools/launch-tiger-prototype-isolated.sh --resolve-home  # 只解析并打印
#                                                            # 本次将用的沙盒，
#                                                            # 不启动游戏（回归用）
# 参数可组合，如 --keep-home --resolve-home。
#
# 返修说明（CMD-019 r2，PM 复核意见）：旧版先 mktemp 新建目录、再 ls -dt 选
# "最新"目录，必然选中本次新建的空目录，--keep-home 实际永远复用不到上次的
# 存档；PROBE_LOG/USER_DATA_DIR 也在选择前绑定。现改为：先解析全部参数 →
# 按规则确定沙盒目录（显式 --home > --keep-home 复用带标记的最近沙盒 > 新建）
# → 之后才创建/绑定路径。沙盒带标记文件 .tiger-manual-sandbox，
# ls -dt 只认带标记的目录，避免串到无关临时目录。
#
# 退出码：0 正常结束；2 找不到 Godot；3 参数错误；4 启动被拒（安全自检未过）
# ============================================================================
set -u

# ---- 先解析参数，再创建任何目录（返修核心） --------------------------------
KEEP_HOME=0
EXPLICIT_HOME=""
RESOLVE_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep-home)   KEEP_HOME=1 ;;
    --home)        [ -n "${2:-}" ] || { echo "[参数错误] --home 需要目录参数"; exit 3; }
                   EXPLICIT_HOME="$2"; shift ;;
    --resolve-home) RESOLVE_ONLY=1 ;;
    *) echo "[参数错误] 未知参数：$1（可用：--keep-home / --home <dir> / --resolve-home）"; exit 3 ;;
  esac
  shift
done

MARKER=".tiger-manual-sandbox"

# ---- 定位工程根（脚本在 tools/ 下） -----------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}" || exit 4

# ---- 沙盒选择：显式 > 复用 > 新建；选出后才创建/绑定一切路径 -----------------
resolve_sandbox() {
  # 1) 显式指定：允许人工/回归固定同一目录，彻底避免串到别次
  if [ -n "${EXPLICIT_HOME}" ]; then
    mkdir -p "${EXPLICIT_HOME}" && touch "${EXPLICIT_HOME}/${MARKER}"
    printf '%s' "${EXPLICIT_HOME}"
    return 0
  fi
  # 2) --keep-home：在带标记的历史沙盒里选最新（不新建，否则必然选到自己）
  if [ "${KEEP_HOME}" = "1" ]; then
    local found=""
    while IFS= read -r d; do
      d="${d%/}"
      if [ -f "${d}/${MARKER}" ]; then found="${d}"; break; fi
    done < <(ls -dt "${TMPDIR:-/tmp}"/tiger-manual-home.*/ 2>/dev/null)
    if [ -n "${found}" ]; then printf '%s' "${found}"; return 0; fi
    echo "[提示] 没有带标记的历史沙盒，本次将新建（下次再 --keep-home 即可复用）" >&2
  fi
  # 3) 新建
  local nh
  nh="$(mktemp -d "${TMPDIR:-/tmp}/tiger-manual-home.XXXXXX")"
  touch "${nh}/${MARKER}"
  printf '%s' "${nh}"
}

SANDBOX="$(resolve_sandbox)" || exit 4
ISOLATED_HOME="${SANDBOX}"

# ---- 只解析模式：打印将用的沙盒即退出（供回归脚本断言） ----------------------
if [ "${RESOLVE_ONLY}" = "1" ]; then
  echo "SANDBOX=${ISOLATED_HOME}"
  exit 0
fi

# ---- 找 Godot（在确定沙盒之后；--resolve-home 不需要引擎） -------------------
GODOT=""
for cand in \
  "/Applications/Godot.app/Contents/MacOS/Godot" \
  "$(command -v godot 2>/dev/null || true)"; do
  if [ -n "${cand}" ] && [ -x "${cand}" ]; then
    GODOT="${cand}"; break
  fi
done
if [ -z "${GODOT}" ]; then
  echo "[阻塞] 未找到 Godot 4.7+，请先安装：https://godotengine.org/download"
  exit 2
fi

# ---- 路径绑定（沙盒选定之后才发生） -----------------------------------------
PROBE_LOG="${ISOLATED_HOME}/launch.log"
USER_DATA_DIR="${ISOLATED_HOME}/Library/Application Support/Godot/app_userdata"

echo "[隔离试玩] 沙盒目录    : ${ISOLATED_HOME}"
if [ -n "${EXPLICIT_HOME}" ]; then
  echo "[隔离试玩] 来源         : --home 显式指定"
elif [ "${KEEP_HOME}" = "1" ]; then
  echo "[隔离试玩] 来源         : --keep-home 复用最近一次沙盒（上次存档应还在）"
else
  echo "[隔离试玩] 来源         : 新建沙盒（本次存档随用随弃）"
fi
echo "[隔离试玩] Godot        : ${GODOT}"
echo "[隔离试玩] 工程         : ${ROOT}"
echo "[隔离试玩] 存档将落在   : ${USER_DATA_DIR}/  （不在主工程 user 目录）"
echo
echo "[人工步骤] 窗口打开后，按验收单逐项操作："
echo "  1) 鼠标左键点击猛虎        → 预期：地圈+箭头锁定到虎"
echo "  2) 点「出拳」数次          → 预期：每次 +25 怒气；连点不重复扣血一次以上"
echo "  3) 怒气满 50 后点「虎影重击」→ 预期：35 伤害，顶部亮「就绪」横幅消失"
echo "  4) 虎败退 → 招募人物卡     → 预期：武松卡（蓝衣无刀肖像）出现，点「带上他」"
echo "  5) 编队界面把武松放上阵    → 预期：出战位显示「行者 · 武松」"
echo "  6) 第二战打完 → 小结       → 预期：图鉴 1/108"
echo "  7) 【关键】同一步骤连续快速点 3~5 次 → 预期：只结算一次，不重复行动"
echo "  8) 【关键】关窗后用 --keep-home（或 --home <同一目录>）重开直接查编队"
echo "     → 预期：武松仍在队（复用的是上一次的沙盒与存档）"
echo
echo "[启动] 关闭本终端或按 Ctrl+C 结束游戏；退出后存档位置会再打印一次。"
echo

HOME="${ISOLATED_HOME}" "${GODOT}" --path "${ROOT}" \
  res://godot/tiger_tutorial/tiger_tutorial.tscn 2>&1 | tee "${PROBE_LOG}"
RC=${PIPESTATUS[0]}

echo
echo "[结束] 退出码：${RC}"
echo "[结束] 本次试玩存档目录（验收记录可引用）："
find "${USER_DATA_DIR}" -name "*.json" -print 2>/dev/null || true
echo "[结束] 沙盒：${ISOLATED_HOME}"
if [ "${KEEP_HOME}" = "1" ] || [ -n "${EXPLICIT_HOME}" ]; then
  echo "[结束] 该沙盒已保留（复用/显式模式），重开请继续用 --keep-home 或 --home。"
else
  echo "[结束] 新建沙盒：确认记录完毕后可自行删除；要验证重启保留请下次用 --keep-home。"
fi
exit "${RC}"
