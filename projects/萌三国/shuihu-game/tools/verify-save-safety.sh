#!/usr/bin/env bash
# CMD-014 · 存档安全独立验收（CMD-014 r4 收敛版）
#
# 【设计要点】
#  · 本脚本**不在主项目里写任何配置文件**，不覆盖也不删除主项目的 override.cfg。
#  · 隔离靠**独立临时项目副本**：复制 project.godot 到临时目录，
#    assets/godot/.godot 以符号链接指回主项目（复用导入缓存，不重新导入），
#    在**副本里**写 override.cfg 指定独立 user 目录。
#  · 真实用户目录只做**逐文件 sha256 只读校验**，零写入。
#  · 清理前**先等子进程退出**（kill → wait），避免子进程还在用就被删目录。
#  · 覆盖场景：正常试玩 / 演示 / 真实失败重试 / **主项目预置 override** /
#    **进程中断（SIGTERM）** / 并发启动。
#
# 退出码：0 = 全过

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
SCENE="res://godot/tiger_tutorial/tiger_tutorial.tscn"
ROOT="$(pwd)"

REAL_USER_DIR="$HOME/Library/Application Support/Godot/app_userdata/是好汉就上山"
MAIN_OVERRIDE="${ROOT}/override.cfg"

FAIL=0
CHILD_PIDS=""

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

# ---- 建独立临时项目副本 ----
COPY="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-save-iso.XXXXXX")"
ISO_NAME="shuihu_save_iso_$$_$(date +%s)"
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
  # 先等所有子进程真正退出，再清理本次资源
  if [ -n "$CHILD_PIDS" ]; then
    for pid in $CHILD_PIDS; do kill -TERM "$pid" 2>/dev/null; done
    for pid in $CHILD_PIDS; do wait "$pid" 2>/dev/null; done
    CHILD_PIDS=""
  fi
  rm -rf "$COPY"
  rm -rf "$ISO_APP_DIR"
  # 注意：**不删主项目的 override.cfg**（本次从未在主项目创建/修改过它）
}
trap cleanup EXIT INT TERM

echo "== 存档安全独立验收（r4 收敛版） =="
echo "临时项目副本：$COPY"
echo "独立 user 目录：$ISO_APP_DIR"
echo "主项目 override.cfg：${OVERRIDE_EXIST_BEFORE}（本脚本不写入、不修改）"
echo "真实用户目录（只读校验）：$REAL_USER_DIR"
echo "真实目录基线文件数：$(echo "$REAL_BEFORE" | grep -c '^[0-9a-f]\{64\}')"

# ---- 在隔离环境里放哨兵存档 ----
cat > "$ISO_APP_DIR/save.json" <<'EOF'
{"owned": ["wusong"], "lineup": ["wusong"], "tutorial_done": true,
 "sentinel": "CMD-014-R4-ISOLATED"}
EOF
cat > "$ISO_APP_DIR/scratch_save.json" <<'EOF'
{"owned": ["historic"], "lineup": [], "tutorial_done": true}
EOF
ISO_SAVE="$ISO_APP_DIR/save.json"
ISO_SCRATCH="$ISO_APP_DIR/scratch_save.json"
ISO_HASH_BEFORE="$(shasum -a 256 "$ISO_SAVE" | awk '{print $1}')"
ISO_SCRATCH_HASH_BEFORE="$(shasum -a 256 "$ISO_SCRATCH" | awk '{print $1}')"

run_godot() {
  # 全部在**副本**里跑（副本的 override.cfg 指定独立 user 目录）
  "$GODOT" --headless --path "$COPY" "$SCENE" "$@" 2>&1
}

check_iso_unchanged() {
  local now
  now="$(shasum -a 256 "$ISO_SAVE" | awk '{print $1}')"
  if [ "$now" = "$ISO_HASH_BEFORE" ]; then
    echo "  ok   ${1} — 隔离环境正式档字节未变"
  else
    echo "  FAIL ${1} — 隔离环境正式档被改了"
    FAIL=1
  fi
}

check_real_untouched() {
  local now
  now="$(snapshot_real)"
  if [ "$now" = "$REAL_BEFORE" ]; then
    echo "  ok   ${1} — 真实用户目录逐文件 sha256 完全一致"
  else
    echo "  FAIL ${1} — 真实用户目录被改动了！"
    echo "--- 之前 ---"; echo "$REAL_BEFORE"
    echo "--- 之后 ---"; echo "$now"
    FAIL=1
  fi
}

echo ""
echo "-- 场景 A：正常试玩（无参数 → 正式档）"
OUT="$(run_godot -- --quit-after 3)"
echo "$OUT" | grep -E "\[ENV\]" | head -1
if echo "$OUT" | grep -q "save_path\":\"user://save.json"; then
  echo "  ok   场景 A — 无参数时使用正式存档"
else
  echo "  FAIL 场景 A — 无参数时未使用正式存档"
  FAIL=1
fi
check_iso_unchanged "场景 A"

echo ""
echo "-- 场景 B：--scratch-save 试玩（每次生成唯一新档）"
OUT="$(run_godot -- --scratch-save --quit-after 3)"
echo "$OUT" | grep -E "\[ENV\]" | head -1
if echo "$OUT" | grep -q "user://sessions/session_"; then
  echo "  ok   场景 B — 使用本次专属新档"
else
  echo "  FAIL 场景 B — 没有使用专属新档"
  FAIL=1
fi
check_iso_unchanged "场景 B"

echo ""
echo "-- 场景 C：--auto-demo 演示"
OUT="$(run_godot -- --auto-demo --quit-after 8)"
echo "$OUT" | grep -E "\[ENV\]" | head -1
if echo "$OUT" | grep -q "user://sessions/session_"; then
  echo "  ok   场景 C — 演示使用本次专属新档"
else
  echo "  FAIL 场景 C — 演示未使用专属新档"
  FAIL=1
fi
check_iso_unchanged "场景 C"

echo ""
echo "-- 场景 D：真实失败 → 重试（--demo-lose）"
OUT="$(run_godot -- --test-save --demo-lose --quit-after 45)"
LOSE_LINES="$(echo "$OUT" | grep -cE "失败（第 [0-9]+ 战）|战斗结束：失败")"
RETRY_LINES="$(echo "$OUT" | grep -cE "已执行重试|DEMO-LOSE.*重试")"
echo "  失败判定 ${LOSE_LINES} 次，重试 ${RETRY_LINES} 次"
echo "$OUT" | grep -E "DEMO-LOSE|失败（第" | head -4
if [ "$LOSE_LINES" -ge 1 ] && [ "$RETRY_LINES" -ge 1 ]; then
  echo "  ok   场景 D — 确实触发了失败判定与重试"
else
  echo "  FAIL 场景 D — 未触发失败/重试，不能算覆盖"
  FAIL=1
fi
check_iso_unchanged "场景 D"

echo ""
echo "-- 场景 E：项目里已存在 override.cfg（跑测试不得覆盖或删除它）"
# 改为在**第二个隔离副本**里预置 override.cfg 来模拟「用户本地已有配置」。
# 旧版这个场景是直接在主项目写一份 override.cfg 再删掉，与脚本头部
# 「本脚本不在主项目里写任何配置文件」的说法自相矛盾——已改。
COPY2="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-save-iso2.XXXXXX")"
ISO2_NAME="shuihu_save_iso2_$$_$(date +%s)"
ISO2_APP_DIR="$HOME/Library/Application Support/$ISO2_NAME"
mkdir -p "$ISO2_APP_DIR"
cp "${ROOT}/project.godot" "${COPY2}/project.godot"
for link in assets godot .godot tools docs tests data; do
  [ -e "${ROOT}/${link}" ] && ln -s "${ROOT}/${link}" "${COPY2}/${link}"
done
cat > "${COPY2}/override.cfg" <<EOF2
[application]
config/use_custom_user_dir=true
config/custom_user_dir_name="${ISO2_NAME}"
config/name="预置配置-不得被覆盖"
EOF2
PRE2_HASH="$(shasum -a 256 "${COPY2}/override.cfg" | awk '{print $1}')"
OUT2="$("${GODOT}" --headless --path "$COPY2" "$SCENE" -- --quit-after 2 2>&1)"
if [ -f "${COPY2}/override.cfg" ]; then
  POST2_HASH="$(shasum -a 256 "${COPY2}/override.cfg" | awk '{print $1}')"
  if [ "$PRE2_HASH" = "$POST2_HASH" ]; then
    echo "  ok   场景 E — 预置的 override.cfg 未被覆盖"
  else
    echo "  FAIL 场景 E — 预置的 override.cfg 被覆盖了"
    FAIL=1
  fi
else
  echo "  FAIL 场景 E — 预置的 override.cfg 被删除了"
  FAIL=1
fi
if echo "$OUT2" | grep -q "save_path\":\"user://save.json"; then
  echo "  ok   场景 E — 预置配置仍然生效（走它指定的独立 user 目录）"
else
  echo "  FAIL 场景 E — 预置配置未生效"
  FAIL=1
fi
rm -rf "$COPY2" "$ISO2_APP_DIR"
check_iso_unchanged "场景 E"

echo ""
echo "-- 场景 F：进程中断（SIGTERM）后不留半成品"
"$GODOT" --headless --path "$COPY" "$SCENE" -- --test-save --quit-after 600 >/dev/null 2>&1 &
CHILD_PIDS="$CHILD_PIDS $!"
sleep 3
kill -TERM $CHILD_PIDS 2>/dev/null
# **先等子进程真正退出**，再检查与清理
for pid in $CHILD_PIDS; do wait "$pid" 2>/dev/null; done
CHILD_PIDS=""
check_iso_unchanged "场景 F"
BAD_JSON=0
if [ -d "$ISO_APP_DIR/sessions" ]; then
  for f in "$ISO_APP_DIR/sessions"/*.json; do
    [ -f "$f" ] || continue
    if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" 2>/dev/null; then
      echo "  FAIL 场景 F — 留下半截 JSON：$f"
      BAD_JSON=1
    fi
  done
fi
if [ "$BAD_JSON" -eq 0 ]; then
  echo "  ok   场景 F — 中断后 sessions/ 下没有半截 JSON"
else
  FAIL=1
fi

echo ""
echo "-- 场景 G：并发启动两个实例（各自独立新档，互不干扰）"
run_godot -- --test-save --quit-after 4 >/tmp/_cc1.log 2>&1 &
P1=$!
run_godot -- --test-save --quit-after 4 >/tmp/_cc2.log 2>&1 &
P2=$!
CHILD_PIDS="$P1 $P2"
wait $P1; wait $P2
CHILD_PIDS=""
S1="$(grep -o 'save_path":"[^"]*"' /tmp/_cc1.log | head -1)"
S2="$(grep -o 'save_path":"[^"]*"' /tmp/_cc2.log | head -1)"
echo "  实例1 ${S1}"
echo "  实例2 ${S2}"
if [ -n "$S1" ] && [ -n "$S2" ] && [ "$S1" != "$S2" ]; then
  echo "  ok   场景 G — 两个实例用了不同的专属新档"
else
  echo "  FAIL 场景 G — 两个实例的存档路径相同或缺失"
  FAIL=1
fi
check_iso_unchanged "场景 G"

echo ""
echo "-- 场景 H：历史 scratch 不得被删"
if [ -f "$ISO_SCRATCH" ]; then
  SH="$(shasum -a 256 "$ISO_SCRATCH" | awk '{print $1}')"
  if [ "$SH" = "$ISO_SCRATCH_HASH_BEFORE" ]; then
    echo "  ok   场景 H — 历史 scratch 仍在且内容未变"
  else
    echo "  FAIL 场景 H — 历史 scratch 被改动或删除"
    FAIL=1
  fi
else
  echo "  FAIL 场景 H — 历史 scratch 被删除了"
  FAIL=1
fi

echo ""
check_real_untouched "全流程后"

OVERRIDE_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && shasum -a 256 "$MAIN_OVERRIDE" || echo "<无>" )"
OVERRIDE_EXIST_AFTER="$( [ -f "$MAIN_OVERRIDE" ] && echo yes || echo no )"
if [ "$OVERRIDE_AFTER" = "$OVERRIDE_BEFORE" ] \
    && [ "$OVERRIDE_EXIST_AFTER" = "$OVERRIDE_EXIST_BEFORE" ]; then
  echo "ok   主项目 override.cfg 全程未被写入或删除"
else
  echo "FAIL 主项目 override.cfg 被改动"
  FAIL=1
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "SAVE_SAFETY_OK: 8 类场景全过"
  echo "  → 隔离环境正式档字节一致；真实用户目录逐文件 sha256 完全一致"
  echo "  → 主项目 override.cfg 全程未被写入或删除"
  exit 0
fi
echo "SAVE_SAFETY_FAIL: 有场景未达标"
exit 1
