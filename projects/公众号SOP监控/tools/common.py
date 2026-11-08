#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""四个工具共用的小函数：路径、JSON 读写、slug、日志。

刻意只用标准库，保证 `python tools/xxx.py` 在干净环境也能跑。
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SEEDS = DATA / "seeds"
RAW = DATA / "raw"
PROJECTS = DATA / "projects"
SOPS = DATA / "sops"
PROMPTS = ROOT / "prompts"

# 允许中文字符的 slug：只保留中日韩、字母数字，其余压成 -
_SLUG_KEEP = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff]+")


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: Path):
    with Path(path).open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, obj) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return path


def slugify(text: str, max_len: int = 48) -> str:
    """把标题压成文件名安全的短串，保留中文。"""
    text = unicodedata.normalize("NFKC", text or "").strip()
    text = _SLUG_KEEP.sub("-", text).strip("-")
    text = re.sub(r"-{2,}", "-", text)
    return (text[:max_len] or "untitled").strip("-")


def article_id_for(account_id: str, title: str) -> str:
    """稳定 id：账号 + 标题哈希前 8 位，便于去重。"""
    digest = hashlib.sha1((title or "").encode("utf-8")).hexdigest()[:8]
    return f"{account_id}-{digest}"


def log(msg: str) -> None:
    print(msg, flush=True)


def fail(msg: str, code: int = 1) -> None:
    print(f"错误：{msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def iter_json_files(target: Path):
    """target 既可以是单个 json，也可以是目录（取目录下 *.json）。"""
    target = Path(target)
    if target.is_file():
        yield target
        return
    if not target.exists():
        fail(f"路径不存在：{target}")
    for p in sorted(target.glob("*.json")):
        yield p
