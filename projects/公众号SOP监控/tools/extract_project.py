#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_project.py — 把一篇 raw 文章提炼成「项目卡」

两种模式：
1. **LLM 模式**：设置 LLM_API_BASE + LLM_API_KEY 后，用 prompts/extract.md 调
   OpenAI 兼容的 /chat/completions 接口。
2. **规则/mock 模式**（默认）：没有 key、请求失败或返回不是合法 JSON 时自动回退，
   用关键词 + 章节结构 + 数字句抽取，保证离线也能跑通整条流水线。

输出：data/projects/<article_id>.project.json

用法
----
    python tools/extract_project.py --all
    python tools/extract_project.py --input data/raw/xxx.json
    python tools/extract_project.py --all --force          # 覆盖已有结果
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    PROJECTS, PROMPTS, RAW, iter_json_files, load_json, log, now_iso, write_json,
)
import skills as skill_lib  # noqa: E402  skills/ 下的步骤定义

# 与「公众号流量主 / 副业变现」相关的信号词；命中越多越可能是目标项目
SIGNAL_WORDS = [
    "流量主", "广告分成", "收益", "变现", "月入", "收入", "单价", "结算",
    "粉丝", "阅读量", "私域", "带货", "副业", "矩阵", "开通",
]
STEP_SECTION_HINTS = ["怎么做", "具体", "步骤", "方法", "操作", "执行", "流程"]
RISK_WORDS = ["搬运", "刷量", "侵权", "违规", "封号", "投诉", "限流", "抄袭", "风险", "坑"]

# 以 1. / 1、/ 第1步 开头的行
STEP_LINE = re.compile(r"^\s*(?:\d{1,2}\s*[.、)）]|第[一二三四五六七八九十\d]{1,3}步)")
# 动作词：编号行如果只是「地名：描述」这种清单项，不算可执行步骤
VERB_HINTS = [
    "选", "做", "写", "发", "找", "建", "开", "跑", "测", "整理", "收集", "设置",
    "加入", "发布", "联系", "准备", "记录", "复盘", "拆", "列", "定", "改", "换",
    "买", "卖", "注册", "申请", "导", "放", "控", "跟", "回", "聊", "拍", "剪",
    "用", "把", "每天", "固定", "先", "再",
]
# 章节标题：一、 / ## / 1.
SECTION_LINE = re.compile(r"^\s*(?:[一二三四五六七八九十]{1,3}\s*[、.]|#{1,3}\s)")
NUMBER_SENT = re.compile(r"\d+(?:\.\d+)?\s*(?:万|千|元|块|%|天|个月|小时|分钟|篇|条|个)")
SENT_SPLIT = re.compile(r"(?<=[。！？!?])\s*|\n+")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in SENT_SPLIT.split(text or "") if s and s.strip()]


def _sections(content: str) -> list[tuple[str, list[str]]]:
    """按章节标题粗切，返回 [(标题, 行列表)]；无标题时整体作为一节。"""
    lines = [ln.rstrip() for ln in (content or "").splitlines()]
    out: list[tuple[str, list[str]]] = []
    cur_title, cur_lines = "", []
    for ln in lines:
        if SECTION_LINE.match(ln) and len(ln) <= 40:
            if cur_lines or cur_title:
                out.append((cur_title, cur_lines))
            cur_title, cur_lines = ln.strip(), []
        else:
            cur_lines.append(ln)
    if cur_lines or cur_title:
        out.append((cur_title, cur_lines))
    return out or [("", lines)]


def _looks_like_action(text: str) -> bool:
    """编号行是否是「动作」。

    典型反例：「1. 芦苇荡营地：导航搜…」——编号只是清单序号，冒号前是名词短语，
    这种不算可执行步骤。判据：冒号前（没有冒号则整句）出现动作词。
    """
    head = text.split("：")[0] if "：" in text else text
    return any(v in head for v in VERB_HINTS)


def _rule_extract(article: dict) -> dict:
    """无 LLM 时的启发式提炼。结果不追求文采，只要求结构可用、可复算。"""
    title = article.get("title", "")
    content = article.get("content", "")
    digest = article.get("digest", "")
    text = f"{title}\n{digest}\n{content}"

    hits = [w for w in SIGNAL_WORDS if w in text]
    relevance = "high" if len(hits) >= 3 else ("medium" if len(hits) >= 1 else "low")

    # 步骤：优先取「怎么做/步骤」章节里的编号行，否则退回全文编号行
    steps: list[str] = []
    for sec_title, sec_lines in _sections(content):
        if any(h in sec_title for h in STEP_SECTION_HINTS):
            for ln in sec_lines:
                if STEP_LINE.match(ln):
                    steps.append(re.sub(r"^\s*(?:\d{1,2}\s*[.、)）]|第[一二三四五六七八九十\d]{1,3}步)\s*", "", ln).strip())
    if not steps:
        for ln in content.splitlines():
            if STEP_LINE.match(ln):
                steps.append(re.sub(r"^\s*(?:\d{1,2}\s*[.、)）]|第[一二三四五六七八九十\d]{1,3}步)\s*", "", ln).strip())
    # 过滤：长度合理 + 确实像动作（排除「地名：描述」这类清单）
    steps = [s for s in steps if 4 <= len(s) <= 120 and _looks_like_action(s)][:8]

    # 证据：含具体数字的句子。先去编号前缀（否则会带出「2. 每天固定发 3 条」这种半句），
    # 再让「带金额/百分比」的句子排在前面——它们比「20 分钟」更有说服力。
    evidence: list[str] = []
    for s in _sentences(content):
        clean = re.sub(
            r"^\s*(?:\d{1,2}\s*[.、)）]|第[一二三四五六七八九十\d]{1,3}[步月])\s*", "", s).strip()
        if clean and NUMBER_SENT.search(clean):
            evidence.append(clean[:120])
    money_first = sorted(
        evidence, key=lambda s: 0 if re.search(r"\d+\s*(?:元|块|万|%)", s) else 1)
    evidence = money_first[:6]

    # 风险：含风险词的句子；章节标题（如「四、踩过的坑」）不是风险内容，要排除
    risks = [
        re.sub(r"^\s*\d{1,2}\s*[.、)）]\s*", "", s)[:120]
        for s in _sentences(content)
        if any(w in s for w in RISK_WORDS) and not SECTION_LINE.match(s) and len(s) > 6
    ][:4]
    # 固定提示刻意不含「收益/变现」等词：这些词会进入评分文本，污染关键词统计
    risks.append("平台规则可能变化，执行前需自行核对最新政策；本卡不构成任何承诺。")

    summary = (digest or "").strip()
    if not summary:
        summary = "".join(_sentences(content)[:2])[:160]

    return {
        "project_name": re.sub(r"[：:｜|].*$", "", title).strip()[:40] or "未命名项目",
        "summary": summary,
        "copyable_steps": steps,
        "evidence": evidence,
        "risks": risks,
        "relevance": relevance,
        "signal_hits": hits,
    }


def _llm_extract(article: dict) -> dict | None:
    """调用 OpenAI 兼容接口；任何异常都返回 None 让调用方回退规则模式。"""
    base = os.getenv("LLM_API_BASE", "").strip()
    key = os.getenv("LLM_API_KEY", "").strip()
    if not (base and key):
        return None
    try:
        import requests  # 延迟导入：没装 requests 也能用规则模式
    except ImportError:
        log("  提示：未安装 requests，跳过 LLM 模式")
        return None

    prompt_path = PROMPTS / "extract.md"
    system = prompt_path.read_text(encoding="utf-8") if prompt_path.exists() else "你是内容分析助手。"
    payload = {
        "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps({
                "title": article.get("title", ""),
                "digest": article.get("digest", ""),
                "content": (article.get("content", "") or "")[:6000],
            }, ensure_ascii=False)},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = requests.post(
            f"{base.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload, timeout=60,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
        for k in ("project_name", "summary", "copyable_steps", "evidence", "risks"):
            if k not in data:
                raise ValueError(f"LLM 返回缺字段 {k}")
        data.setdefault("relevance", "high")
        data["extraction_mode"] = "llm"
        return data
    except Exception as exc:  # noqa: BLE001 —— 任何失败都回退，不让流水线中断
        log(f"  LLM 调用失败，回退规则模式：{exc}")
        return None


def extract_one(raw_path: Path, force: bool = False) -> Path | None:
    article = load_json(raw_path)
    aid = article.get("article_id") or raw_path.stem
    out = PROJECTS / f"{aid}.project.json"
    if out.exists() and not force:
        log(f"跳过（已存在）：{out.name}")
        return out

    data = _llm_extract(article)
    if data is None:
        data = _rule_extract(article)
        data["extraction_mode"] = "rule"
    data.update({
        "schema": "wechat-sop-project-card/1",
        "source_article_id": aid,
        "source_title": article.get("title", ""),
        "source_account": article.get("account_name", ""),
        "source_url": article.get("url", ""),
        "published_at": article.get("published_at", ""),
        # 正文摘录：评分需要看到原文里的「第二天」「红利」这类词，
        # 只靠结构化字段会漏判（曾把「当天次日见效」判成「未说明反馈周期」）
        "source_excerpt": (article.get("content") or "")[:800],
        "generated_at": now_iso(),
    })

    # skill: research-brief —— 把项目卡组织成固定 6 段，避免摘要写成无重点的复述
    brief, brief_src = skill_lib.build_brief(data)
    data["brief_sections"] = brief
    data["brief_source"] = brief_src
    data["skills_applied"] = skill_lib.applied()

    write_json(out, data)
    log(f"项目卡 {out.name}  相关度={data.get('relevance')}  步骤={len(data.get('copyable_steps', []))}  证据={len(data.get('evidence', []))}  模式={data['extraction_mode']}")
    log(f"  skill research-brief：6 段 brief 已生成（来源 {brief_src}）")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="把 raw 文章提炼成项目卡")
    ap.add_argument("--input", default="", help="单个 raw JSON 路径")
    ap.add_argument("--all", action="store_true", help="处理 data/raw/ 下全部 json")
    ap.add_argument("--force", action="store_true", help="覆盖已有项目卡")
    args = ap.parse_args()

    if not args.input and not args.all:
        ap.print_help()
        return 2

    targets = [Path(args.input)] if args.input else list(iter_json_files(RAW))
    targets = [p for p in targets if p.name != ".gitkeep"]
    if not targets:
        log("data/raw/ 里没有文章，先跑 tools/fetch_articles.py --from-seeds")
        return 1

    ok = 0
    for p in targets:
        if extract_one(p, args.force):
            ok += 1
    log(f"\n完成：{ok}/{len(targets)} 篇。输出目录 data/projects/")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
