#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_articles.py — 文章采集（本阶段为 **占位/mock**）

⚠️ 真实抓取未实现，且本仓库不会实现以下能力：
   - 批量枚举/爬取公众号历史文章
   - 绕过微信登录、验证码、风控或频率限制
   - 抓取非公开页面

当前行为：从 data/seeds/sample_articles.json 读样例文章，规范化后写入 data/raw/<article_id>.json。
将来接真实来源时，只允许接「已授权/公开可访问」的接口，并在 _fetch_one 里替换实现。

用法
----
    python tools/fetch_articles.py --from-seeds                 # 全部样例
    python tools/fetch_articles.py --from-seeds --limit 1       # 只取 1 条
    python tools/fetch_articles.py --account acc_demo_001       # 只取某账号
    python tools/fetch_articles.py --from-seeds --dry-run       # 只打印不落盘
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import RAW, SEEDS, article_id_for, load_json, log, now_iso, write_json  # noqa: E402

SAMPLE_PATH = SEEDS / "sample_articles.json"


def _normalize(article: dict) -> dict:
    """把来源数据整理成统一结构，方便下游稳定消费。"""
    account_id = article.get("account_id") or "unknown"
    title = (article.get("title") or "").strip()
    return {
        "article_id": article.get("article_id") or article_id_for(account_id, title),
        "account_id": account_id,
        "account_name": article.get("account_name", ""),
        "title": title,
        "url": article.get("url", ""),
        "published_at": article.get("published_at", ""),
        "digest": article.get("digest", ""),
        "content": article.get("content", ""),
        "source": "mock:sample_articles.json",
        "fetched_at": now_iso(),
        # 真实抓取时的元数据占位（阅读量/点赞等公开字段），本阶段为空
        "metrics": article.get("metrics", {}),
    }


def _fetch_one(account_id: str, limit: int | None = None) -> list[dict]:
    """占位实现：只读本地样例。

    真实接入时替换这里：调用**已授权**的接口拉取单篇/单账号文章，
    并保留限速、错误重试与「不绕过风控」的约束。
    """
    if not SAMPLE_PATH.exists():
        raise SystemExit(f"样例文件不存在：{SAMPLE_PATH}")
    payload = load_json(SAMPLE_PATH)
    items = payload.get("articles", [])
    if account_id:
        items = [a for a in items if a.get("account_id") == account_id]
    if limit is not None:
        items = items[:limit]
    return [_normalize(a) for a in items]


def main() -> int:
    ap = argparse.ArgumentParser(description="采集公众号文章（占位实现，仅读本地样例）")
    ap.add_argument("--account", default="", help="只取指定 account_id")
    ap.add_argument("--from-seeds", action="store_true", help="从 data/seeds 的样例文章读取")
    ap.add_argument("--limit", type=int, default=None, help="最多取几条")
    ap.add_argument("--dry-run", action="store_true", help="只打印，不写文件")
    args = ap.parse_args()

    if not args.from_seeds and not args.account:
        ap.print_help()
        log("\n提示：本阶段请用 --from-seeds 跑样例；真实抓取未实现。")
        return 2

    items = _fetch_one(args.account, args.limit)
    if not items:
        log("没有匹配的文章（检查 --account 或样例文件）。")
        return 1

    written = []
    for item in items:
        if args.dry_run:
            log(f"[dry-run] {item['article_id']}  {item['title']}")
            continue
        out = write_json(RAW / f"{item['article_id']}.json", item)
        written.append(out)
        log(f"写入 {out.relative_to(out.parents[2])}  ← {item['title']}")

    log(f"\n完成：{len(items)} 篇（落盘 {len(written)}）。")
    log("说明：本模块仅读取本地样例，未实现任何真实抓取/绕过风控的能力。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
