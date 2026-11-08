#!/usr/bin/env bash
# import-work-guard.sh — Godot 导入副本工作目录的**路径安全护栏**
#
# 背景：tools/godot-import.sh 需要在独立副本目录里做导入。r1 版本允许调用者用
# IMPORT_WORK 直接指定目录并 rm -rf 它；r2 版本改为「带标记才能复用/清空」，但仍有两个
# 漏洞被复核指出：
#   (a) iw_norm 只删尾斜杠，不归一化 `..` / `.` / 重复斜杠 → 可用 `a/b/../..` 穿越到工程内；
#   (b) 标记文件可手工伪造 → iw_reset_work 会递归删除一个调用者的既有目录。
#
# r3 设计（当前版本）：
#   1. **始终 mktemp 新建本次独占子目录**，工作目录本身永远不由调用者指定
#   2. IMPORT_WORK 只作为**父目录**（可留空 → 系统临时目录），父目录必须已存在且为真实目录
#   3. **绝不清空、绝不删除任何既有目录**；清理只删本次由本函数创建的子目录
#   4. 清理前校验身份：目录内标记文件必须含本次生成的 **一次性 token**，
#      且路径必须等于本次记录的物理路径（token 不匹配 / 非本次创建 → 拒绝）
#   5. 路径先做**完整字符串归一化**（重复斜杠、`.`、`..`、尾斜杠），再逐段拒绝符号链接
#   6. 拒绝原工程及其祖先/后代，拒绝一组受保护顶层路径
#
# 用法（source 后调用）：
#   source tools/lib/import-work-guard.sh
#   WORK="$(iw_resolve_work "${IMPORT_WORK:-}" "$ROOT")" || exit 1
#   ...
#   iw_cleanup "$WORK" "$ROOT"
#
# 回归测试（哨兵文件保护，全程不做破坏性操作）：tools/tests/import-work-guard.test.sh

IW_MARKER=".shuihu-import-work-marker"

# 本次创建的目录与其一次性 token（供 iw_cleanup 校验身份）
IW_CREATED_WORK=""
IW_CREATED_TOKEN=""

iw_err() { printf '%s\n' "$*" >&2; }

# 完整字符串归一化：重复斜杠 → 单斜杠；去掉 `.`；解析 `..`；去尾斜杠（保留根 "/"）
# 说明：这里是**纯字符串**处理，不解析符号链接（符号链接由 iw_has_symlink_component 单独拒绝）
iw_norm() {
  local p="$1"
  [[ "$p" != /* ]] && p="${PWD}/${p}"
  local out=""
  local IFS='/'
  local seg
  for seg in $p; do
    [[ -z "${seg}" || "${seg}" == "." ]] && continue
    if [[ "${seg}" == ".." ]]; then
      out="${out%/*}"
      continue
    fi
    out="${out}/${seg}"
  done
  [[ -z "${out}" ]] && out="/"
  printf '%s' "${out}"
}

# 受保护的顶层/危险路径
iw_is_dangerous_root() {
  local p
  p="$(iw_norm "$1")"
  case "${p}" in
    /|/tmp|/private|/private/tmp|/var|/var/folders|/Users|/System|/Library|/Applications|/usr|/bin|/sbin|/opt|/etc|/Volumes|/Network|/cores|/dev)
      return 0 ;;
    "${HOME}")
      return 0 ;;
  esac
  return 1
}

# 路径任一段是符号链接 → 拒绝（避免穿透到别处）
iw_has_symlink_component() {
  local p
  p="$(iw_norm "$1")"
  local cur=""
  local IFS='/'
  local seg
  for seg in $p; do
    [[ -z "${seg}" ]] && continue
    cur="${cur}/${seg}"
    [[ -L "${cur}" ]] && return 0
  done
  return 1
}

# candidate 是否等于 target 或是 target 的祖先
iw_is_ancestor_or_equal() {
  local cand
  cand="$(iw_norm "$1")"
  local tgt
  tgt="$(iw_norm "$2")"
  [[ "${tgt}" == "${cand}" ]] && return 0
  [[ "${tgt}" == "${cand}"/* ]] && return 0
  return 1
}

# 校验一个**父目录**候选是否可用来放本次独占子目录
# $1 = 归一化前的父目录路径；$2 = 原工程 ROOT
iw_check_parent() {
  local parent
  parent="$(iw_norm "$1")"
  local root
  root="$(iw_norm "$2")"

  if iw_has_symlink_component "${parent}"; then
    iw_err "拒绝使用含符号链接的父目录：${parent}"
    return 1
  fi
  if iw_is_dangerous_root "${parent}"; then
    iw_err "拒绝使用受保护路径作为父目录：${parent}"
    return 1
  fi
  if iw_is_ancestor_or_equal "${parent}" "${root}"; then
    iw_err "拒绝使用原工程目录或其祖先作为父目录：${parent}（原工程：${root}）"
    return 1
  fi
  if iw_is_ancestor_or_equal "${root}" "${parent}"; then
    iw_err "拒绝使用原工程内部目录作为父目录：${parent}（原工程：${root}）"
    return 1
  fi
  if [[ ! -e "${parent}" ]]; then
    iw_err "父目录不存在：${parent}（本脚本不会创建父目录，请留空使用系统临时目录）"
    return 1
  fi
  if [[ ! -d "${parent}" ]]; then
    iw_err "父目录不是目录：${parent}"
    return 1
  fi
  return 0
}

# 核心：在合法父目录下 **mktemp 新建本次独占子目录**。
# $1 = 父目录（可为空 → ${TMPDIR:-/tmp}）；$2 = 原工程 ROOT
# 成功：打印子目录的物理绝对路径，并把 IW_CREATED_WORK / IW_CREATED_TOKEN 置位
iw_resolve_work() {
  local parent_in="${1:-}"
  local root="${2:-}"
  # 默认父目录取系统临时目录的**物理路径**（macOS 上 /var 是 /private/var 的符号链接，
  # 直接用逻辑路径会被下面的符号链接规则拒绝）
  local default_parent
  default_parent="$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)" || default_parent="/tmp"
  [[ -z "${default_parent}" ]] && default_parent="/tmp"
  local parent
  parent="$(iw_norm "${parent_in:-${default_parent}}")"

  iw_check_parent "${parent}" "${root}" || return 1

  local work
  work="$(mktemp -d "${parent}/shuihu-import-XXXXXX")" || {
    iw_err "在父目录下创建独占子目录失败：${parent}"
    return 1
  }
  # 物理路径：避免父目录所在层级存在符号链接时后续校验被绕开
  work="$(cd "${work}" && pwd -P)"

  local token
  token="shuihu-import-$(date +%s)-$$-${RANDOM}${RANDOM}"
  printf '%s\n' "${token}" >"${work}/${IW_MARKER}"

  IW_CREATED_WORK="${work}"
  IW_CREATED_TOKEN="${token}"
  printf '%s' "${work}"
}

# 清理：只删**本次由 iw_resolve_work 创建的**那个独占子目录。
# 校验项（任一不满足即拒绝，绝不删除）：
#   1. 路径等于本次记录的物理路径
#   2. 目录内标记文件的 token 等于本次生成的 token（防伪造标记）
#   3. 归一化后与传入值一致、无符号链接段、非受保护路径
#   4. 与原工程无包含关系
iw_cleanup() {
  local work="${1:-}"
  local root="${2:-}"

  [[ -n "${work}" ]] || { iw_err "拒绝清理：路径为空"; return 1; }
  [[ -n "${IW_CREATED_WORK}" ]] || { iw_err "拒绝清理：本次没有由本脚本创建的目录"; return 1; }
  if [[ "${work}" != "${IW_CREATED_WORK}" ]]; then
    iw_err "拒绝清理：${work} 不是本次创建的目录（本次为 ${IW_CREATED_WORK}）"
    return 1
  fi

  local marker="${work}/${IW_MARKER}"
  [[ -f "${marker}" ]] || { iw_err "拒绝清理：缺少标记文件 ${IW_MARKER}：${work}"; return 1; }
  if [[ "$(cat "${marker}" 2>/dev/null)" != "${IW_CREATED_TOKEN}" ]]; then
    iw_err "拒绝清理：标记 token 与本次不匹配（可能被手工伪造）：${work}"
    return 1
  fi

  local n
  n="$(iw_norm "${work}")"
  if [[ "${n}" != "${work}" ]]; then
    iw_err "拒绝清理：路径未归一化（${work} → ${n}）"
    return 1
  fi
  if iw_has_symlink_component "${work}"; then
    iw_err "拒绝清理含符号链接的路径：${work}"
    return 1
  fi
  if iw_is_dangerous_root "${work}"; then
    iw_err "拒绝清理受保护路径：${work}"
    return 1
  fi
  if [[ -n "${root}" ]]; then
    if iw_is_ancestor_or_equal "${work}" "${root}" || iw_is_ancestor_or_equal "${root}" "${work}"; then
      iw_err "拒绝清理：工作目录与原工程存在包含关系：${work} / ${root}"
      return 1
    fi
  fi

  rm -rf "${work}"
}
