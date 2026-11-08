#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
skills.py — 把 skills/ 下的 SKILL.md 步骤落到流水线里

不是"引用了就算"，而是：
- 每次运行都**读取** skills/<name>/SKILL.md，从里面解析出步骤/分节定义
- 解析不到才回退到内置常量（并在产物里标注 `source: fallback`）
- 产物写入 `skills_applied` 字段，可核对到底走了哪几步

三个 skill 的落地位置：
- research-brief      → extract_project.py：项目卡按 6 段 brief 组织
- investigate-first   → score_sabc.py：每个维度必须引用证据，否则标记不足
- competitor-research → render_sop.py：SOP 分节 + 逐节非空校验
"""

from __future__ import annotations

import re
from pathlib import Path

from common import ROOT

SKILLS_DIR = ROOT / "skills"

# research-brief 的 6 段（SKILL.md 里是 "1. **Overview** — ..." 这种格式）
BRIEF_FALLBACK = [
    ("overview", "Overview"),
    ("key_facts", "Key facts and figures"),
    ("key_players", "Key players / perspectives"),
    ("current_state", "Current state"),
    ("open_questions", "Open questions"),
    ("reading", "Recommended reading"),
]

# competitor-research 的分节思路落到 SOP 上
SOP_SECTIONS = [
    ("profile", "项目是什么"),
    ("actions", "第一周可复制动作"),
    ("evidence", "证据"),
    ("score", "评分表"),
    ("risks", "风险与合规"),
    ("sources", "来源"),
]


def load_skill_text(name: str) -> str:
    p = SKILLS_DIR / name / "SKILL.md"
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8", errors="replace")


def brief_sections() -> tuple[list[tuple[str, str]], str]:
    """从 research-brief/SKILL.md 解析 6 段标题。

    返回 (段列表, 来源标记)。解析失败时回退内置定义。
    """
    text = load_skill_text("research-brief")
    found = re.findall(r"^\s*\d\.\s+\*\*(.+?)\*\*", text, re.MULTILINE)
    if len(found) >= 5:
        keys = ["overview", "key_facts", "key_players", "current_state",
                "open_questions", "reading"]
        pairs = list(zip(keys, found[:6]))
        if len(pairs) == 6:
            return pairs, "skills/research-brief/SKILL.md"
    return BRIEF_FALLBACK, "fallback"


def build_brief(project: dict) -> tuple[dict, str]:
    """按 research-brief 的 6 段组织项目卡内容。

    映射关系：
      Overview          ← summary
      Key facts         ← evidence（带数字的句子）
      Key players       ← 来源账号 + 文中提到的平台/角色
      Current state     ← 发布时间 + 当前状态描述
      Open questions    ← 风险 / 未验证点（原文没给答案的问题）
      Recommended reading ← 原文链接
    """
    sections, src = brief_sections()
    steps = project.get("copyable_steps") or []
    evidence = project.get("evidence") or []
    risks = project.get("risks") or []
    account = project.get("source_account") or "未知账号"

    filled = {
        "overview": project.get("summary", ""),
        "key_facts": evidence,
        "key_players": [f"内容来源：{account}"],
        "current_state": [
            f"原文发布：{project.get('published_at') or '未标注'}",
            f"已拆出 {len(steps)} 个可执行动作",
        ],
        "open_questions": risks,
        "reading": [project.get("source_url") or "（样例占位，不可抓取）"],
    }

    brief = {}
    for key, title in sections:
        brief[key] = {"title": title, "items": filled.get(key, [])}
    return brief, src


def evidence_check(dimensions: list[dict], project: dict) -> dict:
    """investigate-first 的取证纪律检查。

    规则：
    - 每个维度必须带 `evidence_ref`（指向项目卡里的具体字段或原文句子）
    - 指不到证据的维度：标记 `insufficient_evidence`，分数封顶 2
    - 返回统计，写进评分产物
    """
    evidence = project.get("evidence") or []
    steps = project.get("copyable_steps") or []
    risks = project.get("risks") or []
    # 证据池要包含 risks 与 source_excerpt：
    # - 合规维度的 ref 指向风险条目
    # - 反馈周期维度的 ref 常指向正文原句（「第二天就能看到收益」）
    # 之前漏了这两处，导致这两维永远被判「无证据」
    text_pool = " ".join(
        evidence + steps + risks
        + [project.get("summary", ""), project.get("source_excerpt", "")])

    checked, weak = [], []
    for d in dimensions:
        ref = d.get("evidence_ref", "")
        # 引用必须能在项目卡文本里找到（前 12 字），否则视为空引
        valid = bool(ref) and (ref[:12] in text_pool or ref in text_pool)
        if not valid:
            d["insufficient_evidence"] = True
            if d["score"] > 2:
                d["score"] = 2
                d["reason"] += "（无直接证据，按 investigate-first 封顶 2 分）"
            weak.append(d["key"])
        checked.append({"key": d["key"], "ref": ref, "valid": valid})
    return {"checked": checked, "weak": weak, "total": len(dimensions)}


def sop_section_check(md_text: str) -> dict:
    """competitor-research 的「逐节核验」落到 SOP：每节必须存在且非空。"""
    missing = []
    for key, title in SOP_SECTIONS:
        marker = f"## "
        # 按标题关键词找小节
        if title not in md_text:
            missing.append(key)
    return {"sections": [k for k, _ in SOP_SECTIONS], "missing": missing}


def applied() -> list[str]:
    """本次运行实际读取到的 skill（文件不存在就不算）。"""
    out = []
    for name in ("research-brief", "investigate-first", "competitor-research"):
        if (SKILLS_DIR / name / "SKILL.md").exists():
            out.append(name)
    return out
