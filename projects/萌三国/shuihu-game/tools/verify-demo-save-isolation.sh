#!/usr/bin/env bash
# CMD-017 · 演示模式存档隔离验收
#
# 【要封的洞】
#   `_resolve_save_path()` 原来只认 --test-save / --scratch-save / --auto-demo，
#   于是**单独跑** --auto-full / --showcase / --demo-lose 会走**正式档**
#   user://save.json —— 演示就会污染真存档（已经真发生过一次）。
#   现在：所有演示/试玩模式一律走本次专属新档；--auto-flow 只允许隔离副本，
#   缺隔离条件时**直接拒绝执行**（退出码 3）。
#
# 【本脚本怎么验】
#   1) 在**隔离副本 + 独立 user 目录**里预置一份**有内容的正式档**
#      （owned/lineup/sentinel/进度都有），记 sha256；
#   2) 逐个跑演示模式，验证：正式档 sha256 **一字未变**，且本次运行用的是
#      user://sessions/ 下的专属新档（证明它确实写了自己的档，没碰正式档）；
#   3) 验证 --auto-flow 在**非隔离环境**下**拒绝执行**（退出码 3 + REFUSED）；
#      这一步用 **HOME 重定向到临时目录**做，绝不碰真实用户目录；
#   4) 收尾只读校验：真实用户目录与主项目 override.cfg 逐字节未变。
#
# 【硬规矩】**禁止在真档上复现**：任何会写档的运行都在隔离副本里做。
#
# 退出码：0 = 全过
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
SCENE="res://godot/tiger_tutorial/tiger_tutorial.tscn"
EVIDENCE="${ROOT}/docs/evidence/CMD-017"
LOG="${EVIDENCE}/demo-save-isolation.log"
mkdir -p "${EVIDENCE}"

REAL_USER_DIR="$HOME/Library/Application Support/Godot/app_userdata/是好汉就上山"
MAIN_OVERRIDE="${ROOT}/override.cfg"

FAIL=0
CHILD_PIDS=""

track_child() { CHILD_PIDS="${CHILD_PIDS} $1"; }
untrack_child() {
  local pid="$1" keep="" p
  for p in $CHILD_PIDS; do [ "$p" = "$pid" ] || keep="${keep} ${p}"; done
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
OVERRIDE_BEFORE="$( [ -f "$MAIN_OVERRIDE" ] && shasum -a 256 "$MAIN_OVERRIDE" || echo "<无>" )"
OVERRIDE_EXIST_BEFORE="$( [ -f "$MAIN_OVERRIDE" ] && echo yes || echo no )"

# ---- 隔离副本 + 独立 user 目录 ----
COPY="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-demo-iso.XXXXXX")"
ISO_NAME="shuihu_demo_iso_$$_$(date +%s)"
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

cleanup() {
  local pid
  if [ -n "${CHILD_PIDS}" ]; then
    for pid in ${CHILD_PIDS}; do kill -TERM "$pid" 2>/dev/null; done
    for pid in ${CHILD_PIDS}; do wait "$pid" 2>/dev/null; done
    CHILD_PIDS=""
  fi
  rm -rf "$COPY"
  rm -rf "$ISO_APP_DIR"
}
on_signal() {
  echo ""
  echo "[中断] 终止子进程 → 等待退出 → 清理本次临时目录"
  cleanup
  trap - EXIT INT TERM
  exit 130
}
trap cleanup EXIT
trap on_signal INT TERM

# ---- 预置一份「有内容」的正式档 ----
ISO_SAVE="${ISO_APP_DIR}/save.json"
cat > "$ISO_SAVE" <<'EOF'
{
  "owned": ["wusong", "linchong"],
  "lineup": ["wusong"],
  "tutorial_done": true,
  "sentinel": "CMD-017-DO-NOT-TOUCH",
  "rounds_played": 7
}
EOF
BASE_HASH="$(shasum -a 256 "$ISO_SAVE" | awk '{print $1}')"
BASE_SIZE="$(wc -c < "$ISO_SAVE" | tr -d ' ')"

echo "== 演示模式存档隔离验收 =="
echo "隔离副本：$COPY"
echo "独立 user 目录：$ISO_APP_DIR"
echo "预置正式档：${ISO_SAVE}（${BASE_SIZE} 字节，含 owned/lineup/sentinel/进度）"
echo "正式档基线 sha256：$BASE_HASH"
echo ""

run_in_copy() {   # run_in_copy <日志> <参数...>
  local log="$1"; shift
  "${GODOT}" --headless --path "${COPY}" "$SCENE" "$@" > "${log}" 2>&1 &
  local pid=$!
  track_child "$pid"
  wait "$pid"
  local code=$?
  untrack_child "$pid"
  return $code
}

check_demo_mode() {   # check_demo_mode <参数> <说明> <秒数>
  local flag="$1" desc="$2" secs="$3"
  local log="${EVIDENCE}/run_${flag#--}.log"
  echo "-- 模式 ${flag}（${desc}）"
  run_in_copy "$log" -- "$flag" --quit-after "$secs"
  local code=$?
  local now_hash now_size
  now_hash="$(shasum -a 256 "$ISO_SAVE" | awk '{print $1}')"
  now_size="$(wc -c < "$ISO_SAVE" | tr -d ' ')"
  local save_path_line
  save_path_line="$(grep -o '"save_path":"[^"]*"' "$log" | head -1)"
  echo "   退出码=${code}  ${save_path_line}"

  if [ "$now_hash" = "$BASE_HASH" ] && [ "$now_size" = "$BASE_SIZE" ]; then
    echo "   ok   正式档 sha256 与字节数完全未变"
  else
    echo "   FAIL 正式档被改动了！"
    echo "        之前：${BASE_HASH} (${BASE_SIZE}B)"
    echo "        之后：${now_hash} (${now_size}B)"
    FAIL=1
  fi
  case "$save_path_line" in
    *user://sessions/session_*)
      echo "   ok   本次运行用的是专属新档（没碰正式档）" ;;
    *)
      echo "   FAIL 本次运行没有走专属新档：${save_path_line}"
      FAIL=1 ;;
  esac
  if [ -d "${ISO_APP_DIR}/sessions" ]; then
    local n
    n="$(find "${ISO_APP_DIR}/sessions" -name '*.json' -type f | wc -l | tr -d ' ')"
    echo "   ok   sessions/ 下已生成 ${n} 份专属新档"
  fi
  echo ""
}

check_demo_mode "--auto-full" "完整闭环演示（战斗→招募→编队→再战）" 60
check_demo_mode "--showcase" "慢镜头演示（蓄力→出拳→虎影→收招）" 60
check_demo_mode "--demo-lose" "失败→重试演示" 70
check_demo_mode "--auto-demo" "自动演示一局" 60

# ---- --auto-flow 在非隔离环境下必须拒绝执行 ----
# 用 **HOME 重定向**到临时目录做：Godot 的 user 目录从 HOME 推导，
# 于是这个副本会落到「和正式档同款目录名」的非隔离路径上，
# 场景应当拒绝执行——而真实用户目录一个字节都不会被碰。
echo "-- 模式 --auto-flow（非隔离环境应拒绝执行）"
FAKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-fakehome.XXXXXX")"
COPY2="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-demo-iso2.XXXXXX")"
cp "${ROOT}/project.godot" "${COPY2}/project.godot"
for link in assets godot .godot tools docs tests data; do
  [ -e "${ROOT}/${link}" ] && ln -s "${ROOT}/${link}" "${COPY2}/${link}"
done
# 故意**不写** override.cfg → user 目录走默认（= 正式档那种目录名）
HOME="${FAKE_HOME}" "${GODOT}" --headless --path "${COPY2}" "$SCENE" \
  -- --auto-flow --quit-after 30 > "${EVIDENCE}/run_auto-flow-refused.log" 2>&1
FLOW_CODE=$?
REFUSED_LINE="$(grep -c 'REFUSED' "${EVIDENCE}/run_auto-flow-refused.log")"
echo "   退出码=${FLOW_CODE}　REFUSED 行数=${REFUSED_LINE}"
if [ "$FLOW_CODE" = "3" ] && [ "$REFUSED_LINE" -ge 1 ]; then
  echo "   ok   非隔离环境下 --auto-flow 已拒绝执行（退出码 3）"
else
  echo "   FAIL --auto-flow 没有按预期拒绝（退出码=${FLOW_CODE}）"
  FAIL=1
fi
if [ -z "$(find "${FAKE_HOME}/Library/Application Support/Godot/app_userdata" -name 'save.json' 2>/dev/null)" ]; then
  echo "   ok   拒绝路径没有写出任何存档"
else
  echo "   FAIL 拒绝路径竟然写出了存档"
  FAIL=1
fi
rm -rf "${FAKE_HOME}" "${COPY2}"
echo ""

# ---- 收尾：真实目录与主项目配置必须零改动 ----
REAL_AFTER="$(snapshot_real)"
OVERRIDE_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && shasum -a 256 "$MAIN_OVERRIDE" || echo "<无>" )"
OVERRIDE_EXIST_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && echo yes || echo no )"
if [ "$REAL_AFTER" = "$REAL_BEFORE" ]; then
  echo "ok   真实用户目录逐文件 sha256 完全一致"
else
  echo "FAIL 真实用户目录被改动了！"
  echo "--- 之前 ---"; echo "$REAL_BEFORE"
  echo "--- 之后 ---"; echo "$REAL_AFTER"
  FAIL=1
fi
if [ "$OVERRIDE_AFTER" = "$OVERRIDE_BEFORE" ] \
    && [ "$OVERRIDE_EXIST_AFTER" = "$OVERRIDE_EXIST_BEFORE" ]; then
  echo "ok   主项目 override.cfg 未被写入或删除"
else
  echo "FAIL 主项目 override.cfg 被改动"
  FAIL=1
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "DEMO_SAVE_ISOLATION_OK: 4 个演示模式都没碰正式档，--auto-flow 在非隔离环境被拒绝"
  echo "  日志：${EVIDENCE}/"
  exit 0
fi
echo "DEMO_SAVE_ISOLATION_FAIL: 有场景未达标"
exit 1
