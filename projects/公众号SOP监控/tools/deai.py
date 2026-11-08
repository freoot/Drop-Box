#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deai.py — 去 AI 味（流水线强制最后一步）

规则来自 prompts/deai.md：
1. 删套话短语（赋能/抓手/闭环/生态/全面提升…）
2. 删句首连接词（首先/其次/值得注意的是/综上所述…）
3. 长句拆分（>40 字按逗号断）
4. 清理重复标点与多余空格

处理对象：
- data/projects/*.project.json 的 summary / copyable_steps（就地更新）
- data/sops/*.md 的正文（输出 <name>.deai.md）

用法
----
    python3 tools/deai.py --all
    python3 tools/deai.py --input data/sops/SOP-xxx.md
    python3 tools/deai.py --all --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROJECTS, SOPS, iter_json_files, load_json, log, now_iso, write_json  # noqa: E402

# 套话短语：整段删掉，不做同义替换
BUZZWORDS = [
    "深度融合", "全面提升", "降本增效", "形成合力", "有效衔接", "持续发力",
    "底层逻辑", "顶层设计", "组合拳", "护城河", "生态位",
    "赋能", "抓手", "闭环", "生态", "助力", "打造", "一站式",
    "全方位", "多维度", "颗粒度", "对齐",
]

# 句首连接词：删掉，直接说事
LEAD_CONNECTIVES = [
    "值得注意的是，", "值得注意的是", "不难看出，", "不难看出",
    "综上所述，", "综上所述", "总而言之，", "总而言之",
    "由此可见，", "由此可见", "换言之，", "换言之", "也就是说，",
    "首先，", "首先", "其次，", "其次", "再次，", "再次", "最后，", "最后",
]

MAX_SENTENCE = 40          # 超过就拆
SENT_END = "。！？；"

# 中文 AI 味模式。分类参考 skills/humanizer（blader，MIT）与 skills/no-ai-slop
# （petergyang，MIT）的模式目录，做了中文映射；英文原模式不能直接套中文文本。
PATTERNS = [
    {"key": "binary_contrast", "name": "二元对比", "fix": "直接说是什么，别用「不是…而是…」",
     "regex": r"不是[^，。；]{2,16}[，,]?\s*而是"},
    {"key": "fake_profound", "name": "假深刻", "fix": "说清楚具体是什么，别用「不仅…更是…」",
     "regex": r"不仅是[^，。；]{2,16}[，,]?\s*更是"},
    {"key": "rule_of_three", "name": "三段式排比", "fix": "删序数，只留具体动作",
     "regex": r"第一[，、][^。]{0,24}第二[，、][^。]{0,24}第三"},
    {"key": "empty_ending", "name": "空洞收尾", "fix": "删掉，用具体下一步代替",
     "regex": r"(让我们拭目以待|未来可期|值得期待|大有可为|前景广阔)"},
    {"key": "meta_comment", "name": "元评论", "fix": "删掉，直接说事",
     "regex": r"(值得一提的是|不得不说|客观来讲|众所周知|不难发现)"},
    {"key": "hedge", "name": "模糊限定", "fix": "删掉，或换成具体程度",
     "regex": r"(一定程度上|某种程度上|相对而言|在某种意义上|总体来说)"},
    {"key": "dash_spam", "name": "破折号堆叠", "fix": "拆成两句",
     "regex": r"——[^。]{2,30}——"},
    {"key": "vague_improve", "name": "空洞提升", "fix": "换成具体数字",
     "regex": r"(显著提升|大幅优化|全面提升|有效改善|持续赋能)"},
]


def detect(text: str) -> list[dict]:
    """检测 AI 味模式（对应 no-ai-slop 的 detect 模式：只报不改）。"""
    hits: list[dict] = []
    if not text:
        return hits
    for p in PATTERNS:
        for m in re.finditer(p["regex"], text):
            hits.append({"key": p["key"], "name": p["name"],
                         "line": m.group(0)[:60], "fix": p["fix"]})
    for w in BUZZWORDS:
        if w in text:
            hits.append({"key": "buzzword", "name": "套话", "line": w, "fix": "直接删"})
    return hits


def clean_text(text: str) -> tuple[str, list[str]]:
    """清洗一段文本，返回 (结果, 改动记录)。"""
    if not text:
        return text, []
    changes: list[str] = []
    out = text

    for w in BUZZWORDS:
        if w in out:
            out = out.replace(w, "")
            changes.append(f"删套话「{w}」")

    # 句式模式：二元对比/假深刻保留后半句，其余整段删除
    for p in PATTERNS:
        if re.search(p["regex"], out):
            if p["key"] in ("binary_contrast", "fake_profound"):
                out = re.sub(p["regex"], "", out)
            else:
                out = re.sub(p["regex"], "", out)
            changes.append(f"删「{p['name']}」")

    for c in LEAD_CONNECTIVES:
        if out.startswith(c):
            out = out[len(c):]
            changes.append(f"删句首连接词「{c}」")
            break

    # 长句拆分：只在逗号处断，断完要补句号，否则文本还是连在一起（等于没拆）
    if len(out) > MAX_SENTENCE:
        parts = re.split(r"(?<=[，,])", out)
        rebuilt, buf = [], ""
        for p in parts:
            if len(buf) + len(p) > MAX_SENTENCE and buf:
                rebuilt.append(buf)
                buf = p
            else:
                buf += p
        if buf:
            rebuilt.append(buf)
        if len(rebuilt) > 1:
            fixed = []
            for seg in rebuilt:
                seg = seg.rstrip("，,")
                if seg and seg[-1] not in SENT_END:
                    seg += "。"
                fixed.append(seg)
            out = "".join(fixed)
            changes.append(f"长句拆为 {len(rebuilt)} 段")

    out = re.sub(r"[，,]{2,}", "，", out)
    out = re.sub(r"[。！？]{2,}", "。", out)
    out = re.sub(r"\s{2,}", " ", out).strip()
    if out != text:
        changes.append("清理重复标点/空格")
    return out, changes


# 删词之后容易出现的病句特征：连续标点、空宾语、超短残句
BROKEN_PATTERNS = [
    r"^[，,。；;]",              # 句首标点（删词把主语删掉了）
    r"[，,。；;]{2,}",           # 连续标点
    r"的[，,。；;]",             # 「…的，」
    r"[，,]\s*[。；]",           # 逗号后直接句号
    r"通过[^，。]{0,10}[，,]\s*[^，。]{0,6}。",   # 「通过X，Y。」缺谓语
]


def is_broken(text: str) -> bool:
    if not text:
        return True
    for p in BROKEN_PATTERNS:
        if re.search(p, text):
            return True
    # 残句：去掉标点后不足 8 个字
    if len(re.sub(r"[，,。；;、\s]", "", text)) < 8:
        return True
    return False


def clean_text_safe(text: str) -> tuple[str, list[str], bool]:
    """先清洗，再检查是否把句子改坏了。

    规则删除只能"减"不能"重写"。像
    「本项目致力于通过深度融合内容运营…，打造一站式…，全面提升…」
    删完套话后会变成病句。这种情况下**回退原文**，并标记需要人工/LLM 重写，
    而不是把病句写进 SOP。

    返回 (文本, 改动记录, 是否回退)。
    """
    cleaned, changes = clean_text(text)
    if cleaned == text:
        return text, [], False
    if is_broken(cleaned):
        return text, ["需重写：删词后句子不完整，已保留原文"], True
    return cleaned, changes, False


def deai_project(path: Path, dry_run: bool = False) -> dict:
    data = load_json(path)
    before = json.dumps(data, ensure_ascii=False)
    all_changes: list[str] = []
    # 改之前先检测一遍，记录命中哪些模式（对应 no-ai-slop 的 detect 模式）
    hits = detect(data.get("summary", ""))
    for s in data.get("copyable_steps") or []:
        hits += detect(s)

    summary, ch, rolled = clean_text_safe(data.get("summary", ""))
    data["summary"] = summary
    all_changes += ch
    needs_rewrite = 1 if rolled else 0

    steps = []
    for s in data.get("copyable_steps") or []:
        cleaned, ch2, rolled2 = clean_text_safe(s)
        steps.append(cleaned)
        all_changes += ch2
        needs_rewrite += 1 if rolled2 else 0
    data["copyable_steps"] = steps
    data["deai_needs_rewrite"] = needs_rewrite

    data["deai_applied"] = True
    data["deai_changes"] = len(all_changes)
    data["deai_at"] = now_iso()

    if not dry_run and json.dumps(data, ensure_ascii=False) != before:
        write_json(path, data)
    return {"file": str(path), "changes": len(all_changes), "detail": all_changes,
            "patterns_hit": hits}


def deai_markdown(path: Path, dry_run: bool = False) -> dict:
    text = path.read_text(encoding="utf-8")
    all_changes: list[str] = []
    hits = detect(text)
    lines = []
    for ln in text.splitlines():
        # 标题、表格、代码块、引用、HTML 注释都不动（避免破坏结构）
        if (ln.startswith("#") or ln.startswith("|") or ln.startswith("```")
                or ln.startswith("> ") or ln.startswith("<!--")):
            lines.append(ln)
            continue
        cleaned, ch, _rolled = clean_text_safe(ln)
        lines.append(cleaned)
        all_changes += ch
    out = "\n".join(lines) + "\n"
    out_path = path.with_suffix(".deai.md")
    if not dry_run:
        out_path.write_text(out, encoding="utf-8")
    return {"file": str(path), "output": str(out_path),
            "changes": len(all_changes), "detail": all_changes,
            "patterns_hit": hits}


def main() -> int:
    ap = argparse.ArgumentParser(description="去 AI 味（强制最后一步）")
    ap.add_argument("--input", default="", help="单个文件（.json 或 .md）")
    ap.add_argument("--all", action="store_true", help="处理 projects 与 sops")
    ap.add_argument("--dry-run", action="store_true", help="只统计不写盘")
    args = ap.parse_args()

    if not args.input and not args.all:
        ap.print_help()
        return 2

    targets: list[Path] = []
    if args.input:
        targets = [Path(args.input)]
    else:
        targets += [p for p in iter_json_files(PROJECTS) if p.name.endswith(".project.json")]
        targets += [p for p in sorted(SOPS.glob("*.md")) if not p.name.endswith(".deai.md")]

    if not targets:
        log("没有可处理文件，先跑前面几步。")
        return 1

    reports = []
    for p in targets:
        if p.suffix == ".json":
            reports.append(deai_project(p, args.dry_run))
        else:
            reports.append(deai_markdown(p, args.dry_run))

    total = sum(r["changes"] for r in reports)
    for r in reports:
        log(f"{Path(r['file']).name}：{r['changes']} 处改动"
            + (f" → {Path(r['output']).name}" if "output" in r else ""))
    log(f"\n完成：{len(reports)} 个文件，共 {total} 处改动。")

    if not args.dry_run:
        write_json(PROJECTS.parent / "deai-report.json", {
            "schema": "wechat-sop-deai/1",
            "generated_at": now_iso(),
            "files": len(reports),
            "total_changes": total,
            "reports": reports,
        })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
