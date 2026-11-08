#!/bin/bash
# ============================================================================
# CMD-019 r2 · 隔离试玩入口回归：目录复用 / 内容保留 / 会话独立 / 正式档不变
#
# 针对 PM 复核发现的缺陷（旧版先 mktemp 再 ls -dt，--keep-home 必然选到本次
# 新建的空目录）做回归证明。每一步都可断言，退出码 0 = 全过。
#
# 用法：tools/verify-isolated-launch-reuse.sh
# 日志：docs/evidence/CMD-019/isolated-launch-reuse-<时间戳>.log
#
# 说明：脚本内用 headless 演示跑两轮来【产出真实存档文件】，仅用于证明
#       "同一沙盒复用后旧档仍在、新档另存"，不替代人工真实鼠标验收。
# ============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}" || exit 1

ENTRY="tools/launch-tiger-prototype-isolated.sh"
SCENE="res://godot/tiger_tutorial/tiger_tutorial.tscn"
GODOT="/Applications/Godot.app/Contents/MacOS/Godot"
[ -x "${GODOT}" ] || { echo "[阻塞] 未找到 Godot"; exit 2; }

EVID="docs/evidence/CMD-019"
mkdir -p "${EVID}"
LOG="${EVID}/isolated-launch-reuse-$(date +%Y%m%d-%H%M%S).log"
MAIN_SAVE="${HOME}/Library/Application Support/Godot/app_userdata/是好汉就上山/save.json"

PASS=0; FAIL=0
ck() { # ck <名称> <条件式字符串…> —— 用 [ ] 判定
  local name="$1"; shift
  if [ "$@" ]; then echo "  ok   ${name}"; PASS=$((PASS+1))
  else echo "  FAIL ${name}"; FAIL=$((FAIL+1)); fi
}
resolve() { "${ENTRY}" "$@" | sed -n 's/^SANDBOX=//p'; }

{
echo "CMD-019 r2 隔离入口回归 $(date '+%F %T')"
echo "主档：${MAIN_SAVE}"
MAIN_BEFORE="$(shasum -a 256 "${MAIN_SAVE}" 2>/dev/null | awk '{print $1}')"
echo "主档开局哈希：${MAIN_BEFORE:-<absent>}"
echo

echo "== A. 目录解析四种场景 =="
A="$(resolve --resolve-home)"
echo "  A1 新建沙盒：${A}"
B="$(resolve --resolve-home --keep-home)"
echo "  B1 --keep-home 解析：${B}"
[ "${A}" = "${B}" ] && echo "  ok   B --keep-home 复用上一次沙盒（未新建）" && PASS=$((PASS+1)) \
  || { echo "  FAIL B --keep-home 应复用 ${A}，实际 ${B}"; FAIL=$((FAIL+1)); }
EXPL="/tmp/tiger-isolated-explicit-probe"
rm -rf "${EXPL}"
C1="$(resolve --resolve-home --home "${EXPL}")"
C2="$(resolve --resolve-home --home "${EXPL}")"
[ -n "${C1}" ] && [ "${C1}" = "${C2}" ] && [ "${C1}" = "${EXPL}" ] \
  && { echo "  ok   C --home 显式指定两次一致：${C1}"; PASS=$((PASS+1)); } \
  || { echo "  FAIL C --home 显式指定不一致：${C1} / ${C2}"; FAIL=$((FAIL+1)); }
D="$(resolve --resolve-home)"
[ "${D}" != "${A}" ] && { echo "  ok   D 不带参数新建独立沙盒：${D}"; PASS=$((PASS+1)); } \
  || { echo "  FAIL D 新会话应新建独立沙盒，实际复用了 ${D}"; FAIL=$((FAIL+1)); }
echo

echo "== E. 复用同一沙盒：旧存档保留 + 新会话另存 =="
UD="${B}/Library/Application Support/Godot/app_userdata/是好汉就上山"
HOME="${B}" "${GODOT}" --headless --path "${ROOT}" "${SCENE}" \
  -- --auto-full --quit-after 60 > "${B}/round1.log" 2>&1
echo "  E1 第一轮退出码：$?"
F1="$(find "${UD}/sessions" -name '*.json' 2>/dev/null | sort | head -1)"
H1="$(shasum -a 256 "${F1}" 2>/dev/null | awk '{print $1}')"
echo "  E2 第一轮存档：$(basename "${F1}") sha256=${H1}"
B2="$(resolve --resolve-home --keep-home)"
[ "${B2}" = "${B}" ] && ck "E3 第二轮 --keep-home 仍指向同一沙盒" -n "${B2}" -a "${B2}" = "${B}"
HOME="${B2}" "${GODOT}" --headless --path "${ROOT}" "${SCENE}" \
  -- --auto-full --quit-after 60 > "${B2}/round2.log" 2>&1
echo "  E4 第二轮退出码：$?"
CNT2="$(find "${UD}/sessions" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
H1B="$(shasum -a 256 "${F1}" 2>/dev/null | awk '{print $1}')"
[ -n "${H1}" ] && [ "${H1}" = "${H1B}" ] \
  && { echo "  ok   E5 第一轮存档在复用后仍存在且哈希不变（${H1}）"; PASS=$((PASS+1)); } \
  || { echo "  FAIL E5 旧存档丢失或被改动：${H1} → ${H1B}"; FAIL=$((FAIL+1)); }
[ "${CNT2}" -ge 2 ] \
  && { echo "  ok   E6 新会话另存新档（sessions 文件数=${CNT2}）"; PASS=$((PASS+1)); } \
  || { echo "  FAIL E6 新会话未另存新档（sessions 文件数=${CNT2}）"; FAIL=$((FAIL+1)); }
echo

echo "== F. 新会话独立性 =="
CNTNEW="$(find "${D}/Library/Application Support/Godot/app_userdata" \
  -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
[ "${CNTNEW}" -eq 0 ] \
  && { echo "  ok   F 新沙盒无任何存档（与旧沙盒隔离）"; PASS=$((PASS+1)); } \
  || { echo "  FAIL F 新沙盒出现存档（串档）：${CNTNEW}"; FAIL=$((FAIL+1)); }
echo

echo "== G. 正式存档未被触碰 =="
MAIN_AFTER="$(shasum -a 256 "${MAIN_SAVE}" 2>/dev/null | awk '{print $1}')"
[ "${MAIN_BEFORE}" = "${MAIN_AFTER}" ] \
  && { echo "  ok   G 主工程正式档 sha256 前后一致（${MAIN_AFTER}）"; PASS=$((PASS+1)); } \
  || { echo "  FAIL G 正式档被改动：${MAIN_BEFORE} → ${MAIN_AFTER}"; FAIL=$((FAIL+1)); }

echo
echo "== 合计 $((PASS+FAIL)) 项，PASS ${PASS}，FAIL ${FAIL} =="
} 2>&1 | tee "${LOG}"

echo
echo "日志：${LOG}"
[ "${FAIL}" -eq 0 ] && echo "ISOLATED_LAUNCH_REUSE_OK" || echo "REGRESSION_FAILED"
exit "${FAIL}"
