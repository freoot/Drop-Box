#!/usr/bin/env bash
# CMD-015 · 真正跨进程的「保存 → 关闭 → 重开 → 读回」验收
#
# 【为什么必须有这个脚本】
#   主测试里的 A6 只是**同进程内**把场景 queue_free 再重新实例化一次，
#   它证明的是「同一进程里存档路径稳定、场景能回读自己的存档」，
#   **不等于**「关掉游戏再打开还能读回来」。
#   本脚本用**两个真正独立的 Godot 进程**验证后者：
#     进程 1：默认正式存档模式 → 打完虎 → 招募武松 → 编队 → 正常退出（退出码 0）
#     进程 2：默认正式存档模式 → 读回同一份存档 → 不重复发放奖励 → 正常退出（退出码 0）
#
# 【隔离方式：沿用既有框架，不重建】
#   独立临时项目副本（project.godot 复制过去，assets/godot/.godot 符号链接复用导入缓存）
#   + **副本内**写 override.cfg 指定独立 user 目录
#   → 正式档 user://save.json 落在隔离目录里，主项目与真实用户目录零写入。
#   → 主项目 override.cfg 与真实用户目录全程只读 sha256 校验。
#
# 【中断清理的真实行为】（不吹牛）
#   子进程 PID 会被**真实记录**到 CHILD_PIDS；
#   收到 INT/TERM 时：先 kill 子进程 → wait 等它真正退出 → 再删本次临时目录。
#   极端情况下（kill 失败）可能残留临时目录，但**绝不会**碰真实存档或主项目配置。
#
# 退出码：0 = 全过

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
SCENE="res://godot/tiger_tutorial/tiger_tutorial.tscn"
EVIDENCE_DIR="${ROOT}/docs/evidence/CMD-015"
LOG1="${EVIDENCE_DIR}/cross-process-run1.log"
LOG2="${EVIDENCE_DIR}/cross-process-run2.log"
REPORT="${EVIDENCE_DIR}/cross-process-report.txt"
mkdir -p "${EVIDENCE_DIR}"

REAL_USER_DIR="$HOME/Library/Application Support/Godot/app_userdata/是好汉就上山"
MAIN_OVERRIDE="${ROOT}/override.cfg"

FAIL=0
CHILD_PIDS=""     # 真实跟踪本次启动的子进程 PID（空格分隔）

track_child() {
  CHILD_PIDS="${CHILD_PIDS} $1"
}

untrack_child() {
  local pid="$1" keep="" p
  for p in $CHILD_PIDS; do
    [ "$p" = "$pid" ] || keep="${keep} ${p}"
  done
  CHILD_PIDS="${keep# }"
}

snapshot_real() {
  if [ -d "$REAL_USER_DIR" ]; then
    find "$REAL_USER_DIR" -type f -exec shasum -a 256 {} \; 2>/dev/null | sort
  else
    echo "<真实用户目录不存在>"
  fi
}

REAL_BEFORE="$(snapshot_real)"
MAIN_OVERRIDE_BEFORE="$( [ -f "$MAIN_OVERRIDE" ] && shasum -a 256 "$MAIN_OVERRIDE" || echo "<无 override.cfg>" )"
MAIN_OVERRIDE_EXIST_BEFORE="$( [ -f "$MAIN_OVERRIDE" ] && echo yes || echo no )"

# ---- 独立临时项目副本 ----
COPY="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-xproc.XXXXXX")"
ISO_NAME="shuihu_xproc_$$_$(date +%s)"
ISO_APP_DIR="$HOME/Library/Application Support/$ISO_NAME"
mkdir -p "$ISO_APP_DIR"

cp "${ROOT}/project.godot" "${COPY}/project.godot"
for link in assets godot .godot tools docs tests data; do
  [ -e "${ROOT}/${link}" ] && ln -s "${ROOT}/${link}" "${COPY}/${link}"
done
cat > "${COPY}/override.cfg" <<EOF
[application]
config/use_custom_user_dir=true
config/custom_user_dir_name="${ISO_NAME}"
EOF

ISO_SAVE="${ISO_APP_DIR}/save.json"

cleanup() {
  # 先终止并等待子进程真正退出，再清理本次资源
  local pid
  if [ -n "${CHILD_PIDS}" ]; then
    for pid in ${CHILD_PIDS}; do
      kill -TERM "$pid" 2>/dev/null
    done
    for pid in ${CHILD_PIDS}; do
      wait "$pid" 2>/dev/null
    done
    CHILD_PIDS=""
  fi
  rm -rf "$COPY"
  rm -rf "$ISO_APP_DIR"
  # 注意：**不删主项目的 override.cfg**（本次从未在主项目创建/修改过它）
}

on_signal() {
  echo ""
  echo "[中断] 收到信号：终止子进程 → 等待退出 → 清理本次临时目录"
  cleanup
  trap - EXIT INT TERM
  exit 130
}

trap cleanup EXIT
trap on_signal INT TERM

echo "== 跨进程保存/加载验收 =="
echo "临时项目副本：$COPY"
echo "独立 user 目录：$ISO_APP_DIR"
echo "隔离正式档：${ISO_SAVE}"
echo "主项目 override.cfg：${MAIN_OVERRIDE_EXIST_BEFORE}（本次不写入、不修改）"
echo "真实用户目录（只读校验）：$REAL_USER_DIR"
echo ""

# 在副本里跑一个**真正独立的进程**，默认正式存档模式（不加 --scratch-save/--test-save/--auto-demo）
run_flow() {
  local log="$1"
  "$GODOT" --headless --path "${COPY}" "$SCENE" \
    -- --auto-flow --quit-after 180 > "${log}" 2>&1 &
  local pid=$!
  track_child "$pid"
  wait "$pid"
  local code=$?
  untrack_child "$pid"
  return $code
}

# 读隔离正式档里的字段
json_count() {
  python3 - "$1" "$2" <<'PY' 2>/dev/null || echo "-1"
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
arr = d.get(sys.argv[2], [])
print(arr.count("wusong"))
PY
}

json_has() {
  python3 - "$1" "$2" "$3" <<'PY' 2>/dev/null || echo "no"
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
print("yes" if sys.argv[3] in d.get(sys.argv[2], []) else "no")
PY
}

echo "-- 进程 1：默认正式存档模式，打虎 → 招募 → 编队 → 正常退出"
run_flow "$LOG1"
CODE1=$?
echo "  退出码：${CODE1}"
grep -E "\[ENV\]|\[FLOW\]|\[RECRUIT\]|\[LINEUP\]" "$LOG1" | head -12 | sed 's/^/  | /'

if [ "$CODE1" -eq 0 ] && grep -q "\[FLOW\] DONE" "$LOG1"; then
  echo "  ok   进程 1 正常退出且流程跑完（退出码 0 + [FLOW] DONE）"
else
  echo "  FAIL 进程 1 未正常完成（退出码 ${CODE1}）"
  FAIL=1
fi
if grep -q "save_path\":\"user://save.json" "$LOG1"; then
  echo "  ok   进程 1 用的是正式存档路径 user://save.json"
else
  echo "  FAIL 进程 1 不是正式存档模式"
  FAIL=1
fi
if grep -q "\[RECRUIT\] 武松加入队伍（首次）" "$LOG1"; then
  echo "  ok   进程 1 首次招募到武松"
else
  echo "  FAIL 进程 1 没有招募到武松"
  FAIL=1
fi
if [ -f "$ISO_SAVE" ]; then
  echo "  ok   隔离正式档已落盘：${ISO_SAVE}"
else
  echo "  FAIL 隔离正式档不存在：${ISO_SAVE}"
  FAIL=1
fi
OWNED1="$(json_count "$ISO_SAVE" owned)"
LINEUP1="$(json_count "$ISO_SAVE" lineup)"
echo "  落盘内容：owned 里 wusong ×${OWNED1}，lineup 里 wusong ×${LINEUP1}"
if [ "$OWNED1" = "1" ] && [ "$LINEUP1" = "1" ]; then
  echo "  ok   落盘内容正确：武松恰好 1 个，且已进编队"
else
  echo "  FAIL 落盘内容不对（owned=${OWNED1} lineup=${LINEUP1}，都应为 1）"
  FAIL=1
fi
PID1="$(grep -o '"pid":[0-9]*' "$LOG1" | head -1 | cut -d: -f2)"
echo ""

echo "-- 进程 2：新的进程，读回同一份存档，不应重复发奖励"
run_flow "$LOG2"
CODE2=$?
echo "  退出码：${CODE2}"
grep -E "\[ENV\]|\[FLOW\]|\[RECRUIT\]|\[LINEUP\]" "$LOG2" | head -12 | sed 's/^/  | /'

if [ "$CODE2" -eq 0 ] && grep -q "\[FLOW\] DONE" "$LOG2"; then
  echo "  ok   进程 2 正常退出且流程跑完"
else
  echo "  FAIL 进程 2 未正常完成（退出码 ${CODE2}）"
  FAIL=1
fi
if grep -q "save_path\":\"user://save.json" "$LOG2"; then
  echo "  ok   进程 2 用的是同一份正式存档"
else
  echo "  FAIL 进程 2 不是正式存档模式"
  FAIL=1
fi
if grep -q "\[RECRUIT\] 武松已在队伍中，不重复发放" "$LOG2"; then
  echo "  ok   进程 2 读到已有武松，没有重复发放"
else
  echo "  FAIL 进程 2 没有出现「不重复发放」，说明没读回存档或重复发奖"
  FAIL=1
fi
OWNED2="$(json_count "$ISO_SAVE" owned)"
LINEUP2="$(json_count "$ISO_SAVE" lineup)"
echo "  跑完进程 2 后：owned 里 wusong ×${OWNED2}，lineup 里 wusong ×${LINEUP2}"
if [ "$OWNED2" = "1" ] && [ "$LINEUP2" = "1" ]; then
  echo "  ok   存档仍只有 1 个武松、1 个编队名额（未叠加）"
else
  echo "  FAIL 存档被叠加（owned=${OWNED2} lineup=${LINEUP2}，都应为 1）"
  FAIL=1
fi
PID2="$(grep -o '"pid":[0-9]*' "$LOG2" | head -1 | cut -d: -f2)"
if [ -n "$PID1" ] && [ -n "$PID2" ] && [ "$PID1" != "$PID2" ]; then
  echo "  ok   两段确实是两个进程（PID ${PID1} vs ${PID2}）"
else
  echo "  FAIL 无法确认是两个进程（PID1=${PID1} PID2=${PID2}）"
  FAIL=1
fi
echo ""

echo "-- 收尾：主项目与真实用户目录必须零改动"
REAL_AFTER="$(snapshot_real)"
MAIN_OVERRIDE_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && shasum -a 256 "$MAIN_OVERRIDE" || echo "<无 override.cfg>" )"
MAIN_OVERRIDE_EXIST_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && echo yes || echo no )"
if [ "$REAL_AFTER" = "$REAL_BEFORE" ]; then
  echo "  ok   真实用户目录逐文件 sha256 完全一致"
else
  echo "  FAIL 真实用户目录被改动了！"
  echo "--- 之前 ---"; echo "$REAL_BEFORE"
  echo "--- 之后 ---"; echo "$REAL_AFTER"
  FAIL=1
fi
if [ "$MAIN_OVERRIDE_AFTER" = "$MAIN_OVERRIDE_BEFORE" ] \
    && [ "$MAIN_OVERRIDE_EXIST_AFTER" = "$MAIN_OVERRIDE_EXIST_BEFORE" ]; then
  echo "  ok   主项目 override.cfg 未被写入或删除"
else
  echo "  FAIL 主项目 override.cfg 被改动"
  FAIL=1
fi

{
  echo "跨进程保存/加载验收报告"
  echo "生成时间：$(date '+%Y-%m-%d %H:%M:%S')"
  echo "隔离 user 目录：$ISO_APP_DIR"
  echo "进程1 PID=${PID1} 退出码=${CODE1}"
  echo "进程2 PID=${PID2} 退出码=${CODE2}"
  echo "owned wusong 计数：进程1后=${OWNED1}，进程2后=${OWNED2}"
  echo "lineup wusong 计数：进程1后=${LINEUP1}，进程2后=${LINEUP2}"
  echo "FAIL=${FAIL}"
} > "$REPORT"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "CROSS_PROCESS_OK: 进程1 招募编队 → 退出 → 进程2 读回且不重复奖励"
  echo "  日志：${LOG1} / ${LOG2}"
  echo "  报告：${REPORT}"
  exit 0
fi
echo "CROSS_PROCESS_FAIL: 有场景未达标"
exit 1
