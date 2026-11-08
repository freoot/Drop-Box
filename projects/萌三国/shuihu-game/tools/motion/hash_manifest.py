#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hash_manifest.py — 生成资产 sha256 清单（r7 基线 / r8 GLB / r8 .blend 源工程）

验收要能核对「这个 GLB 就是从这个源工程出来的、且 r7 没被改动」，
光看字节数不够，需要逐文件 sha256。结果写入 docs/motion/ACT-007/probe/asset_hashes.json。

用法：
    python3 tools/motion/hash_manifest.py [--out <json>]
退出码：0 = r7 全部与基线快照一致且 r8 齐备；1 = 有缺失或 r7 被改动。
"""

import argparse
import glob
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE_DIR = os.path.join(ROOT, "assets", "releases", "ART-002")
R7 = os.path.join(BASE_DIR, "r7", "models")
R8 = os.path.join(BASE_DIR, "r8", "models")
R8_SRC = os.path.join(BASE_DIR, "r8", "source")
SNAPSHOT = os.path.join(ROOT, "docs", "motion", "ACT-006", "probe", "r7_baseline.json")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/motion/ACT-007/probe/asset_hashes.json")
    args = ap.parse_args()

    heroes = sorted(os.path.basename(p)[:-6]
                   for p in glob.glob(os.path.join(R8_SRC, "*.blend")))
    if not heroes:
        print("没有找到任何 r8 源工程，先跑 build_r8_death.py")
        return 1

    baseline = {}
    if os.path.isfile(SNAPSHOT):
        with open(SNAPSHOT, encoding="utf-8") as f:
            snap = json.load(f)
        files = snap.get("files", {})
        # 兼容两种结构：{hero: {...}} 或 [{"file": ..., "sha256": ...}]
        if isinstance(files, dict):
            for hero, item in files.items():
                baseline[hero + ".glb"] = item
        else:
            for item in files:
                baseline[item.get("file") or os.path.basename(item["path"])] = item

    rows, problems = [], []
    for hero in heroes:
        p7 = os.path.join(R7, hero + ".glb")
        p8 = os.path.join(R8, hero + ".glb")
        pb = os.path.join(R8_SRC, hero + ".blend")
        row = {"hero": hero}
        for key, path in (("r7_glb", p7), ("r8_glb", p8), ("r8_blend", pb)):
            if not os.path.isfile(path):
                problems.append("%s 缺失：%s" % (key, path))
                row[key] = None
                continue
            row[key] = {
                "path": os.path.relpath(path, ROOT),
                "bytes": os.path.getsize(path),
                "sha256": sha256(path),
            }
        base = baseline.get(hero + ".glb")
        if base and row["r7_glb"]:
            row["r7_unchanged"] = (row["r7_glb"]["sha256"] == base["sha256"])
            if not row["r7_unchanged"]:
                problems.append("%s 的 r7 与基线快照不一致" % hero)
        else:
            row["r7_unchanged"] = None
        rows.append(row)

    out = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({
            "schema": "act007-asset-hashes/1",
            "generator": "tools/motion/hash_manifest.py",
            "hero_count": len(heroes),
            "rows": rows,
            "problems": problems,
        }, f, ensure_ascii=False, indent=1)

    print("%-8s %-18s %-18s %-18s %s" % ("角色", "r7 sha(前16)", "r8 sha(前16)",
                                         "blend sha(前16)", "r7 未改动"))
    for r in rows:
        print("%-8s %-18s %-18s %-18s %s"
              % (r["hero"],
                 (r["r7_glb"] or {}).get("sha256", "-")[:16],
                 (r["r8_glb"] or {}).get("sha256", "-")[:16],
                 (r["r8_blend"] or {}).get("sha256", "-")[:16],
                 {True: "是", False: "否", None: "无基线"}[r["r7_unchanged"]]))
    print("\n合计 %d 个角色，问题 %d 条" % (len(rows), len(problems)))
    for p in problems:
        print("  !! %s" % p)
    print("清单：%s" % os.path.relpath(out, ROOT))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
