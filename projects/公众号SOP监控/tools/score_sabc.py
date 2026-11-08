#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
score_sabc.py — 对项目卡打 SABC 分（十维，每维 1–5 分）

十维（缺一不可，定义见 prompts/score.md 与 README）
----------------------------------------------------
1. market_size      容量：需求盘子够不够大、能不能长期产出内容
2. beginner         新手友好：零基础能否照做，步骤是否有技术门槛
3. funnel           链路：从内容到用户/成交有没有完整路径
4. monetization     变现路径：收益方式是否明确、是否可结算
5. timing           趋势窗口：是否处在规则/平台红利期
6. evidence         证据强度：是否有具体数字、可核对的样本
7. sop_ability      可SOP化：能否拆成可重复执行的固定动作
8. feedback         反馈周期：多久能看到第一次结果
9. differentiation  差异化：是否避开红海、有明确窄口
10. compliance      合规/可复制稳定性：是否踩平台红线、是否依赖灰产手段

总分 = 十维之和（10–50）
等级：S ≥ 42 ｜ A ≥ 34 ｜ B ≥ 26 ｜ C < 26

用法
----
    python tools/score_sabc.py --all
    python tools/score_sabc.py --input data/projects/xxx.project.json
    python tools/score_sabc.py --all --force
输出：与项目卡同目录的 <stem>.score.json（旁路，不改原卡）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROJECTS, iter_json_files, load_json, log, now_iso, write_json  # noqa: E402
import skills as skill_lib  # noqa: E402  investigate-first 的取证纪律

GRADE_S, GRADE_A, GRADE_B = 42, 34, 26
MAX_PER_DIM = 5

DIMENSION_NAMES = {
    "market_size": "容量",
    "beginner": "新手友好",
    "funnel": "链路",
    "monetization": "变现路径",
    "timing": "趋势窗口",
    "evidence": "证据强度",
    "sop_ability": "可SOP化",
    "feedback": "反馈周期",
    "differentiation": "差异化",
    "compliance": "合规/可复制稳定性",
}


def _has(text: str, words: list[str]) -> list[str]:
    return [w for w in words if w in text]


def _bad_usage(text: str, words: list[str]) -> list[str]:
    """找出「确实在做」的高风险手段。

    原文里「不要搬运」「避免刷量」是在提醒别做，不能当成违规证据。
    判据：命中词前 8 个字内出现否定词就跳过。
    """
    hits: list[str] = []
    for w in words:
        for m in re.finditer(re.escape(w), text):
            ctx = text[max(0, m.start() - 8):m.start()]
            if re.search(r"(不要|别|禁止|避免|切勿|不能|严禁|勿)", ctx):
                continue
            hits.append(w)
            break
    return hits


def score_project(project: dict) -> dict:
    text = json.dumps(project, ensure_ascii=False)
    steps = project.get("copyable_steps") or []
    evidence = project.get("evidence") or []
    risks = project.get("risks") or []
    relevance = project.get("relevance", "medium")
    dims: list[dict] = []

    def add(key: str, score: int, reason: str, ref: str = "") -> None:
        """ref = evidence_ref：这一维依据项目卡里的哪句话。

        investigate-first 要求「先证据后结论」，所以每维都要能指回原文；
        指不到的由 skill_lib.evidence_check() 统一封顶并标记。
        """
        dims.append({
            "key": key, "name": DIMENSION_NAMES[key],
            "score": max(1, min(MAX_PER_DIM, score)), "max": MAX_PER_DIM,
            "reason": reason, "evidence_ref": ref,
        })

    def pick(items: list[str], keywords: list[str]) -> str:
        for it in items:
            if any(k in it for k in keywords):
                return it[:80]
        return ""

    ev = project.get("evidence") or []
    st = steps or []
    # 原文摘录按句切分后一并纳入引用池：
    # 「第二天就能看到收益」这类信息在正文里，不在 evidence 里，
    # 只看结构化字段会把反馈周期误判成「未说明」
    excerpt_sents = [x.strip() for x in re.split(r"[。！？\n]", project.get("source_excerpt", ""))
                     if len(x.strip()) > 4]
    pool = ev + excerpt_sents

    # 1 容量
    s, why = 2, "未见到需求规模描述"
    hit = _has(text, ["流量主", "广告", "副业", "矩阵", "全国", "行业"])
    if hit:
        s, why = 3, f"命中规模相关词：{'、'.join(hit[:3])}"
    if re.search(r"\d+\s*万", text) or re.search(r"粉丝\s*\d{3,}", text):
        s, why = 4, why + "；出现万级/千级体量数字"
    if relevance == "high":
        s += 1
        why += "；与目标赛道高相关"
    add("market_size", s, why, pick(ev, ["万", "千", "粉丝", "阅读"]))

    # 2 新手友好
    tech = _has(text, ["编程", "代码", "API", "爬虫", "服务器", "部署"])
    if not steps:
        add("beginner", 1, "没有可执行步骤，新手无从下手")
    elif tech:
        add("beginner", 3, f"有 {len(steps)} 步，但含技术门槛词：{'、'.join(tech[:3])}", st[0] if st else "")
    elif len(steps) <= 6:
        add("beginner", 5, f"{len(steps)} 步以内、无技术门槛，可直接照做", st[0] if st else "")
    else:
        add("beginner", 4, f"{len(steps)} 步偏多，需要筛选执行", st[0] if st else "")

    # 3 链路
    s, why = 1, "没有从内容到用户的路径描述"
    funnel_hit = _has(text, ["引流", "导进", "转化", "私域", "闭环", "进群", "关注"])
    if funnel_hit:
        s, why = 3, f"命中链路词：{'、'.join(funnel_hit[:3])}"
        if _has(text, ["成交", "付费", "下单", "报名"]):
            s, why = 4, why + "；且有成交动作"
    add("funnel", s, why, pick(ev + st, ["导进", "引流", "转化", "私域", "进群"]))

    # 4 变现路径
    s, why = 1, "没有明确收益方式"
    money_hit = _has(text, ["流量主", "广告分成", "收益", "变现", "月入", "收入"])
    if money_hit:
        s, why = 3, f"命中变现词：{'、'.join(money_hit[:3])}"
    if re.search(r"\d+\s*(?:元|块)", text):
        s, why = 4, why + "；给出具体金额"
    if re.search(r"\d+\s*(?:元|块)", text) and _has(text, ["结算", "单价", "分成"]):
        s, why = 5, why + "；且说明结算/单价"
    add("monetization", s, why, pick(pool, ["元", "块", "收益", "分成"]))

    # 5 趋势窗口
    # 注意：不要把年份当红利信号——文章发布日期里必然有年份，会全员误判
    s, why = 2, "未提及时间窗口"
    timing_hit = _has(text, ["红利", "新规", "刚上线", "窗口期", "风口", "政策变化", "今年起"])
    if timing_hit:
        s, why = 4, f"命中窗口词：{'、'.join(timing_hit[:3])}"
    add("timing", s, why, pick(pool, ["红利", "新规", "窗口", "风口"]))

    # 6 证据强度
    n = len(evidence)
    if n >= 5:
        add("evidence", 5, f"{n} 条含具体数字的证据", ev[0])
    elif n >= 3:
        add("evidence", 4, f"{n} 条含具体数字的证据", ev[0])
    elif n >= 1:
        add("evidence", 2, f"仅 {n} 条证据，样本偏少", ev[0])
    else:
        add("evidence", 1, "没有任何可核对数字")

    # 7 可SOP化
    n = len(steps)
    if n >= 5:
        add("sop_ability", 5, f"可拆成 {n} 个固定动作", st[0] if st else "")
    elif n >= 3:
        add("sop_ability", 4, f"{n} 个动作，基本可流程化", st[0] if st else "")
    elif n >= 1:
        add("sop_ability", 2, f"仅 {n} 个动作，难以复用", st[0] if st else "")
    else:
        add("sop_ability", 1, "无步骤，不可SOP化")

    # 8 反馈周期
    s, why = 2, "未说明多久见效"
    fb_hit = _has(text, ["当天", "第二天", "一周", "7 天", "30 天", "即时", "马上"])
    if fb_hit:
        s, why = 5 if _has(text, ["当天", "第二天", "即时"]) else 4, \
            f"命中反馈周期词：{'、'.join(fb_hit[:3])}"
    add("feedback", s, why, pick(pool, ["当天", "第二天", "一周", "即时"]))

    # 9 差异化
    s, why = 2, "未体现差异化"
    diff_hit = _has(text, ["小众", "蓝海", "差异化", "独家", "足够窄", "竞争小", "垂直"])
    if diff_hit:
        s, why = 4, f"命中差异化词：{'、'.join(diff_hit[:3])}"
    if len(diff_hit) >= 2:
        s, why = 5, why + "；多处强调窄口"
    add("differentiation", s, why, pick(ev + st, ["窄", "差异化", "小众", "垂直"]))

    # 10 合规/可复制稳定性（分数越高越安全）
    bad = _bad_usage(text, ["搬运", "刷量", "侵权", "抄袭", "绕过", "灰产"])
    if bad:
        add("compliance", 2, f"出现高风险词：{'、'.join(bad[:3])}，需人工复核", pick(risks, ["搬运", "刷量", "侵权"]))
    elif len(risks) <= 2:
        add("compliance", 5, "风险条目少，未见违规手段", risks[0] if risks else "")
    elif len(risks) <= 4:
        add("compliance", 4, f"{len(risks)} 条风险已列明，可评估后执行", risks[0] if risks else "")
    else:
        add("compliance", 3, f"{len(risks)} 条风险偏多，执行成本高", risks[0] if risks else "")

    # skill: investigate-first —— 指不到证据的维度封顶 2 分并标记
    ev_check = skill_lib.evidence_check(dims, project)

    total = sum(d["score"] for d in dims)
    if total >= GRADE_S:
        grade = "S"
    elif total >= GRADE_A:
        grade = "A"
    elif total >= GRADE_B:
        grade = "B"
    else:
        grade = "C"

    strongest = max(dims, key=lambda d: d["score"])
    weakest = min(dims, key=lambda d: d["score"])
    return {
        "schema": "wechat-sop-sabc/1",
        "project_name": project.get("project_name", ""),
        "source_article_id": project.get("source_article_id", ""),
        "relevance": relevance,
        "dimensions": dims,
        "total": total,
        "max_total": MAX_PER_DIM * len(dims),
        "grade": grade,
        "summary": f"总分 {total}/{MAX_PER_DIM * len(dims)} → {grade} 级；"
                   f"最强「{strongest['name']}」{strongest['score']} 分，"
                   f"最弱「{weakest['name']}」{weakest['score']} 分。",
        "evidence_check": ev_check,
        "skills_applied": skill_lib.applied(),
        "generated_at": now_iso(),
    }


def score_one(path: Path, force: bool = False) -> Path | None:
    project = load_json(path)
    stem = path.name.replace(".project.json", "").replace(".json", "")
    out = path.with_name(f"{stem}.score.json")
    if out.exists() and not force:
        log(f"跳过（已存在）：{out.name}")
        return out
    result = score_project(project)
    write_json(out, result)
    log(f"评分 {out.name}  {result['total']}/50 → {result['grade']} 级")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="SABC 十维评分")
    ap.add_argument("--input", default="", help="单个项目卡 JSON")
    ap.add_argument("--all", action="store_true", help="处理 data/projects/ 下全部 *.project.json")
    ap.add_argument("--force", action="store_true", help="覆盖已有评分")
    args = ap.parse_args()

    if not args.input and not args.all:
        ap.print_help()
        return 2

    if args.input:
        targets = [Path(args.input)]
    else:
        targets = [p for p in iter_json_files(PROJECTS) if p.name.endswith(".project.json")]
    if not targets:
        log("没有项目卡，先跑 tools/extract_project.py --all")
        return 1

    ok = 0
    for p in targets:
        if score_one(p, args.force):
            ok += 1
    log(f"\n完成：{ok}/{len(targets)} 个评分。")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
