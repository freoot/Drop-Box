#!/usr/bin/env bash
# CMD-013/014 · 武松打虎教学闭环测试
#
# 跑 godot/tests/tiger_tutorial_test.gd，覆盖验收 A1–A14：
#   回合切换 / 怒气消耗 / 防重入 / 胜败重试 / 武松只奖励一次 /
#   编队与重启后持有 / 第二战使用武松 / 隔离存档 / 存档安全 /
#   无刀拳击动作接入 / 真实虎模型接入。
#
# 【隔离方式：独立临时项目副本】（CMD-014 r4）
#   本脚本**不在主项目里写任何配置文件**，也不修改主项目的 override.cfg。
#   它把 project.godot 复制到临时目录，assets/godot/.godot 以符号链接指回主项目
#   （复用 372MB 的导入缓存，不重新导入），并在**副本里**写 override.cfg
#   指定独立的 user 数据目录。
#   → 主项目目录：零写入、零删除
#   → 真实用户目录：只做逐文件 sha256 只读校验
#
# 【中断清理的真实行为】（不吹牛）
#   Godot 子进程的 PID 会被**真实记录**到 CHILD_PIDS；
#   收到 INT/TERM 时：先 kill 子进程 → wait 等它真正退出 → 再删本次临时目录。
#   最坏情况（kill 失败）可能残留一个临时目录，但**绝不会**碰真实存档或主项目配置。
#
# 用法：tools/godot-tiger-test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
LOG="${ROOT}/docs/evidence/CMD-013/tiger-tutorial-test.log"
mkdir -p "$(dirname "${LOG}")"

REAL_USER_DIR="$HOME/Library/Application Support/Godot/app_userdata/是好汉就上山"
MAIN_OVERRIDE="${ROOT}/override.cfg"

# 真实跟踪本次启动的子进程 PID（空格分隔）。空值 = 当前没有在跑的子进程。
CHILD_PIDS=""

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

# ---- 记录主项目与真实档的基线（只读）----
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

# ---- 建独立临时项目副本 ----
COPY="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-tiger-test.XXXXXX")"
ISO_NAME="shuihu_tiger_test_$$_$(date +%s)"
ISO_APP_DIR="$HOME/Library/Application Support/$ISO_NAME"
mkdir -p "$ISO_APP_DIR"

cp "${ROOT}/project.godot" "${COPY}/project.godot"
# 复用主项目的导入缓存与资源，避免重新导入 372MB
for link in assets godot .godot tools docs tests data; do
  [ -e "${ROOT}/${link}" ] && ln -s "${ROOT}/${link}" "${COPY}/${link}"
done
# 副本里写 override.cfg —— 主项目一个字节都不碰
cat > "${COPY}/override.cfg" <<EOF
[application]
config/use_custom_user_dir=true
config/custom_user_dir_name="${ISO_NAME}"
EOF

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
  # 注意：**不删主项目的 override.cfg**（本次从未创建过它）
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

echo "== 隔离测试环境 =="
echo "临时项目副本：$COPY"
echo "独立 user 目录：$ISO_APP_DIR"
echo "主项目 override.cfg：${MAIN_OVERRIDE_EXIST_BEFORE}（本次不写入、不修改）"
echo "真实用户目录（只读校验）：$REAL_USER_DIR"
echo "基线文件数：$(echo "$REAL_BEFORE" | grep -c '^[0-9a-f]\{64\}')"

# ---- 跑测试：后台启动并**真实记录 PID**，这样中断时能准确终止它 ----
LOG_PART="${LOG}.part"
"${GODOT}" --headless --path "${COPY}" \
  --script res://godot/tests/tiger_tutorial_test.gd -- --test-save > "${LOG_PART}" 2>&1 &
GODOT_PID=$!
track_child "${GODOT_PID}"
wait "${GODOT_PID}"
code=$?
untrack_child "${GODOT_PID}"
cat "${LOG_PART}"
# 把本次输出写回日志文件（r1 改写时漏了这一步，日志会一直是旧的，必须补）
cp "${LOG_PART}" "${LOG}"
rm -f "${LOG_PART}"

# ---- 校验主项目与真实档都没被碰 ----
REAL_AFTER="$(snapshot_real)"
MAIN_OVERRIDE_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && shasum -a 256 "$MAIN_OVERRIDE" || echo "<无 override.cfg>" )"
MAIN_OVERRIDE_EXIST_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && echo yes || echo no )"

echo
real_ok=0
if [ "$REAL_AFTER" = "$REAL_BEFORE" ]; then
  echo "ok   真实用户目录逐文件 sha256 完全一致（测试全程未触碰）"
else
  echo "FAIL 真实用户目录被改动了！"
  echo "--- 之前 ---"; echo "$REAL_BEFORE"
  echo "--- 之后 ---"; echo "$REAL_AFTER"
  real_ok=1
fi

if [ "$MAIN_OVERRIDE_AFTER" = "$MAIN_OVERRIDE_BEFORE" ] \
    && [ "$MAIN_OVERRIDE_EXIST_AFTER" = "$MAIN_OVERRIDE_EXIST_BEFORE" ]; then
  echo "ok   主项目 override.cfg 未被写入或删除"
else
  echo "FAIL 主项目 override.cfg 被改动（存在性 ${MAIN_OVERRIDE_EXIST_BEFORE}→${MAIN_OVERRIDE_EXIST_AFTER}）"
  real_ok=1
fi

echo
echo "退出码=${code}"
echo "日志：${LOG}"

if [ "$code" -ne 0 ]; then
  exit "$code"
fi
exit "$real_ok"
