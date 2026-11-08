#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_sop.py — 把高分项目渲染成可复制 SOP（Markdown）

输入：data/projects/<stem>.score.json（同目录需有 <stem>.project.json）
输出：data/sops/SOP-<slug>.md

只渲染等级 ≥ --min-grade 的项目（默认 A，即 S/A）。

用法
----
    python tools/render_sop.py --all
    python tools/render_sop.py --all --min-grade B
    python tools/render_sop.py --input data/projects/xxx.score.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    PROJECTS, SOPS, iter_json_files, load_json, log, now_iso, slugify,
)
import skills as skill_lib  # noqa: E402  competitor-research 的分节校验
from deai import clean_text_safe  # noqa: E402  渲染前先过一遍去 AI 味

GRADE_ORDER = {"S": 4, "A": 3, "B": 2, "C": 1}
WEEK_DAYS = 7


def _project_for(score_path: Path) -> Path:
    return score_path.with_name(score_path.name.replace(".score.json", ".project.json"))


def render(score: dict, project: dict) -> str:
    name = project.get("project_name") or score.get("project_name") or "未命名项目"
    # 渲染前先过 deai：摘要与动作必须短、具体、无套话
    summary_clean, _, _ = clean_text_safe(project.get("summary", ""))
    steps = [clean_text_safe(s)[0] for s in (project.get("copyable_steps") or [])]
    evidence = project.get("evidence") or []
    risks = project.get("risks") or []
    dims = score.get("dimensions") or []

    lines: list[str] = []
    lines.append(f"# SOP · {name}")
    lines.append("")
    lines.append(f"> {summary_clean.strip() or '（无一句话摘要）'}")
    lines.append(">")
    lines.append(
        f"> 等级 **{score.get('grade')}（{score.get('total')}/{score.get('max_total')}）**"
        f" ｜ 来源：{project.get('source_account') or '未知账号'}"
        f" ｜ 生成：{now_iso()}"
    )
    lines.append("")

    lines.append("## 一、项目是什么")
    lines.append("")
    lines.append(summary_clean.strip() or "（待补充）")
    lines.append("")

    lines.append("## 二、第一周可复制动作")
    lines.append("")
    if steps:
        for i, step in enumerate(steps[:WEEK_DAYS], start=1):
            lines.append(f"- [ ] **Day {i}**：{step}")
        if len(steps) > WEEK_DAYS:
            lines.append("")
            lines.append("> 剩余动作（第 2 周起）：")
            for step in steps[WEEK_DAYS:]:
                lines.append(f"- [ ] {step}")
    else:
        lines.append("_该项目的动作未拆解出来，需人工补充。_")
    lines.append("")

    lines.append("## 三、证据")
    lines.append("")
    if evidence:
        for e in evidence:
            lines.append(f"- {e}")
    else:
        lines.append("_无数字证据，建议先小样本验证再投入。_")
    lines.append("")

    lines.append("## 四、评分表")
    lines.append("")
    lines.append("| 维度 | 分数 | 理由 |")
    lines.append("|---|---|---|")
    for d in dims:
        lines.append(f"| {d['name']} | {d['score']}/{d['max']} | {d['reason']} |")
    lines.append(f"| **总分** | **{score.get('total')}/{score.get('max_total')}** | {score.get('grade')} 级 |")
    lines.append("")

    lines.append("## 五、风险与合规")
    lines.append("")
    for r in risks:
        lines.append(f"- {r}")
    lines.append("- 本 SOP 由样例流水线生成，执行前请自行核对平台最新规则。")
    lines.append("")

    lines.append("## 六、来源")
    lines.append("")
    lines.append(f"- 文章：{project.get('source_title', '')}")
    lines.append(f"- 账号：{project.get('source_account', '')}")
    lines.append(f"- 链接：{project.get('source_url', '') or '（样例占位，不可抓取）'}")
    lines.append(f"- 文章 ID：`{project.get('source_article_id', '')}`")
    lines.append("")
    return "\n".join(lines)


def render_one(score_path: Path, min_grade: str, force: bool = True) -> Path | None:
    score = load_json(score_path)
    grade = score.get("grade", "C")
    if GRADE_ORDER.get(grade, 0) < GRADE_ORDER[min_grade]:
        log(f"跳过（{grade} 级 < {min_grade}）：{score_path.name}")
        return None

    proj_path = _project_for(score_path)
    if not proj_path.exists():
        log(f"缺少项目卡：{proj_path.name}")
        return None
    project = load_json(proj_path)

    name = project.get("project_name") or score_path.stem
    out = SOPS / f"SOP-{slugify(name)}.md"
    if out.exists() and not force:
        log(f"跳过（已存在）：{out.name}")
        return out
    md = render(score, project)
    # skill: competitor-research —— 逐节核验，缺节要报出来
    check = skill_lib.sop_section_check(md)
    if check["missing"]:
        log(f"  警告：SOP 缺小节 {check['missing']}")
    header = (f"<!-- skills: {', '.join(skill_lib.applied())} ｜ "
              f"sections_ok: {not check['missing']} -->\n\n")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(header + md, encoding="utf-8")
    log(f"SOP {out.name}  ← {grade} 级 {score.get('total')} 分"
        + ("（分节校验通过）" if not check["missing"] else "（分节缺失）"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="渲染 SOP Markdown")
    ap.add_argument("--input", default="", help="单个 score JSON")
    ap.add_argument("--all", action="store_true", help="处理 data/projects/ 下全部 *.score.json")
    ap.add_argument("--min-grade", default="A", choices=["S", "A", "B", "C"], help="最低渲染等级")
    args = ap.parse_args()

    if not args.input and not args.all:
        ap.print_help()
        return 2

    if args.input:
        targets = [Path(args.input)]
    else:
        targets = [p for p in iter_json_files(PROJECTS) if p.name.endswith(".score.json")]
    if not targets:
        log("没有评分结果，先跑 tools/score_sabc.py --all")
        return 1

    made = [p for p in (render_one(t, args.min_grade) for t in targets) if p]
    log(f"\n完成：生成 {len(made)} 份 SOP，输出目录 data/sops/")
    return 0 if made else 1


if __name__ == "__main__":
    raise SystemExit(main())
