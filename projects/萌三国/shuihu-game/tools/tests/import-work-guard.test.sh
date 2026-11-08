#!/usr/bin/env bash
# import-work-guard 的**哨兵文件保护测试**（r3）。
#
# 被测设计：工作目录始终是本次 mktemp 新建的独占子目录；IMPORT_WORK 只作父目录；
# 绝不清空/删除既有目录；清理只删本次创建的子目录且校验一次性 token。
#
# 本测试**全程不做破坏性删除**：它只调用 guard 的解析/清理函数，并在每一步之后断言
# 哨兵文件与嵌套目录仍然完好。对真实项目目录只做「应当被拒绝」的断言，不执行删除。
#
# 用法：tools/tests/import-work-guard.test.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD="${ROOT}/tools/lib/import-work-guard.sh"
# shellcheck source=../lib/import-work-guard.sh
source "${GUARD}"

PASS=0
FAIL=0
SANDBOX=""
SENTINEL_DIR=""

cleanup_sandbox() {
  if [[ -n "${SANDBOX}" && -f "${SANDBOX}/.sandbox-marker" ]]; then
    rm -rf "${SANDBOX}"
  fi
}
trap cleanup_sandbox EXIT

ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

# 断言：iw_resolve_work 应当拒绝该父目录
expect_reject() {
  local label="$1" cand="$2"
  local out="" rc=0
  out="$(iw_resolve_work "${cand}" "${ROOT}" 2>&1)" || rc=$?
  if [[ "${rc}" -ne 0 ]]; then
    ok "${label} → 已拒绝"
  else
    bad "${label} → 本应拒绝，却被接受为 ${out}"
  fi
}

# 断言：iw_resolve_work 应当接受该父目录，结果放进 ACCEPTED。
# 注意：必须在**当前 shell** 调用 iw_resolve_work（不能用命令替换，否则它设置的
# IW_CREATED_WORK / IW_CREATED_TOKEN 会留在子 shell 里，后续 iw_cleanup 无法校验身份），
# 因此这里把 stdout 重定向到文件再读回。
ACCEPTED=""
expect_accept() {
  local label="$1" cand="$2"
  local out="" rc=0
  IW_CREATED_WORK=""
  IW_CREATED_TOKEN=""
  iw_resolve_work "${cand}" "${ROOT}" >"${SANDBOX}/.work-out" 2>"${SANDBOX}/.work-err" || rc=$?
  out="$(cat "${SANDBOX}/.work-out" 2>/dev/null)"
  if [[ "${rc}" -eq 0 && -n "${out}" && -d "${out}" ]]; then
    ACCEPTED="${out}"
    ok "${label} → 已接受（${out}）"
  else
    ACCEPTED=""
    bad "${label} → 本应接受，实际 rc=${rc} err=$(cat "${SANDBOX}/.work-err" 2>/dev/null)"
  fi
}

# 断言：iw_cleanup 应当拒绝
expect_cleanup_reject() {
  local label="$1" target="$2"
  if iw_cleanup "${target}" "${ROOT}" >/dev/null 2>&1; then
    bad "${label} → 本应拒绝清理，却执行了删除"
  else
    ok "${label} → 已拒绝清理"
  fi
}

sentinel_alive() {
  [[ -n "${SENTINEL_DIR}" && -f "${SENTINEL_DIR}/SENTINEL-do-not-delete.txt" && -d "${SENTINEL_DIR}/keep" && -f "${SENTINEL_DIR}/keep/inner.txt" ]]
}

echo "== import-work-guard 哨兵保护测试（r3）=="
echo "原工程 ROOT：${ROOT}"

# ---- 准备沙盒与哨兵 ----
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/shuihu-guard-test-XXXXXX")"
SANDBOX="$(cd "${SANDBOX}" && pwd -P)"
: >"${SANDBOX}/.sandbox-marker"
SENTINEL_DIR="${SANDBOX}/sentinel"
mkdir -p "${SENTINEL_DIR}/keep"
printf 'DO NOT DELETE\n' >"${SENTINEL_DIR}/SENTINEL-do-not-delete.txt"
printf 'nested\n' >"${SENTINEL_DIR}/keep/inner.txt"
echo "哨兵目录：${SENTINEL_DIR}"

echo
echo "-- 1. 路径归一化（重复斜杠 / . / .. ）--"
N1="$(iw_norm "${SANDBOX}//./sub/../sentinel")"
[[ "${N1}" == "${SANDBOX}/sentinel" ]] && ok "重复斜杠与 . / .. 被正确归一化" || bad "归一化结果错误：${N1}"
N2="$(iw_norm "/tmp/../tmp/./x//y")"
[[ "${N2}" == "/tmp/x/y" ]] && ok "绝对路径归一化（${N2}）" || bad "归一化结果错误：${N2}"
N3="$(iw_norm "/..")"
[[ "${N3}" == "/" ]] && ok "/.. 归一化为 /（不会逃逸出根）" || bad "/.. 归一化错误：${N3}"

echo
echo "-- 2. 危险父目录必须被拒绝 --"
expect_reject "原工程目录"                 "${ROOT}"
expect_reject "原工程父目录"               "$(cd "${ROOT}/.." && pwd)"
expect_reject "原工程子目录"               "${ROOT}/docs"
expect_reject "根路径"                     "/"
expect_reject "/tmp"                       "/tmp"
expect_reject "\$HOME"                     "${HOME}"
expect_reject "/Users"                     "/Users"
expect_reject "/System"                    "/System"
expect_reject "不存在的父目录"             "${SANDBOX}/no-such-parent"
printf 'file\n' >"${SANDBOX}/a-file.txt"
expect_reject "文件当作父目录"             "${SANDBOX}/a-file.txt"

echo
echo "-- 3. 穿越与符号链接必须被拒绝 --"
# 用 .. 穿越回原工程：归一化后等于 ROOT，必须被拒（旧版 iw_norm 不处理 .. 会漏掉）
expect_reject ".. 穿越回原工程"            "${ROOT}/docs/.."
expect_reject ".. 穿越回原工程（带 . 段）" "${ROOT}/./docs/../docs/.."
expect_reject "沙盒外穿越到原工程"         "${SANDBOX}/../$(basename "${ROOT}")/../$(basename "$(dirname "${ROOT}")")/$(basename "$(dirname "${ROOT}")")/$(basename "${ROOT}")"
ln -s "${SANDBOX}" "${SANDBOX}/link-to-sandbox"
expect_reject "符号链接父目录"             "${SANDBOX}/link-to-sandbox"

echo
echo "-- 4. 哨兵在上述拒绝后仍然完好 --"
if sentinel_alive; then ok "哨兵文件与嵌套目录未被删除"; else bad "哨兵内容丢失！"; fi

echo
echo "-- 5. 合法父目录：只在其下新建独占子目录，不碰既有内容 --"
expect_accept "系统临时目录（留空）"        ""
if [[ -n "${ACCEPTED}" && -f "${ACCEPTED}/${IW_MARKER}" ]]; then
  ok "新建目录带标记 ${IW_MARKER}"
else
  bad "新建目录缺少标记文件"
fi
TMP1="${ACCEPTED}"
if [[ -n "${TMP1}" ]]; then
  if iw_cleanup "${TMP1}" "${ROOT}" >/dev/null 2>&1; then ok "清理本次新建目录成功"; else bad "清理本次新建目录失败"; fi
fi

# 哨兵目录作为父目录：允许在其下新建独占子目录（这不属于删除），但哨兵内容必须完好
expect_accept "哨兵目录作父目录"            "${SENTINEL_DIR}"
if sentinel_alive; then ok "在其下新建子目录后哨兵仍完好"; else bad "哨兵内容被破坏！"; fi
if [[ -n "${ACCEPTED}" ]]; then
  if iw_cleanup "${ACCEPTED}" "${ROOT}" >/dev/null 2>&1; then ok "只删除本次子目录"; else bad "清理本次子目录失败"; fi
  [[ ! -d "${ACCEPTED}" ]] && ok "本次子目录已删除" || bad "本次子目录仍存在"
fi
if sentinel_alive; then ok "清理子目录后哨兵仍完好"; else bad "哨兵内容被破坏！"; fi

echo
echo "-- 6. 伪标记目录：手工伪造标记也不能被清理 --"
FAKE="${SANDBOX}/fake-marker-dir"
mkdir -p "${FAKE}"
printf 'shuihu-import-forged\n' >"${FAKE}/${IW_MARKER}"
printf 'precious\n' >"${FAKE}/precious.txt"
expect_cleanup_reject "伪标记目录（token 不匹配）" "${FAKE}"
expect_cleanup_reject "本次子目录的父目录"        "${SANDBOX}"
expect_cleanup_reject "哨兵目录"                  "${SENTINEL_DIR}"
expect_cleanup_reject "原工程目录"                "${ROOT}"
if [[ -f "${FAKE}/precious.txt" ]] && sentinel_alive; then
  ok "伪标记目录与哨兵内容均未被删除"
else
  bad "伪标记目录或哨兵内容丢失！"
fi

echo
echo "-- 7. 未创建过目录时清理必须拒绝 --"
IW_CREATED_WORK=""
IW_CREATED_TOKEN=""
expect_cleanup_reject "未创建时清理任意路径"      "${SANDBOX}/anything"

echo
echo "-- 8. 最终哨兵校验 --"
if sentinel_alive; then ok "全程哨兵未被破坏"; else bad "哨兵在测试过程中被破坏"; fi

echo
echo "结果：pass=${PASS} fail=${FAIL}"
[[ "${FAIL}" -eq 0 ]] || exit 1
