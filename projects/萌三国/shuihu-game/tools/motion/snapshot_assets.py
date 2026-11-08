#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
snapshot_assets.py — 在批量生成前固定 r7 基线（字节数 / sha256 / clip 时长 / 节点）

做什么
------
1. 遍历 assets/releases/ART-002/r7/models/*.glb，记录每个文件的字节数、sha256、
   clip 名与实测时长、骨骼节点名、以及"是否已有武器挂点"。
2. 写入 docs/motion/ACT-006/probe/r7_baseline.json。
3. 之后 verify_r8_all.py 用这份基线逐角色比对，证明 r7 未被改动、
   且 r8 只新增 death / weapon.R，既有片段时长一字未变。

用法
----
    python3 tools/motion/snapshot_assets.py            # 默认 r7
    python3 tools/motion/snapshot_assets.py --release r7 --out docs/motion/ACT-006/probe/r7_baseline.json

约束
----
- 只读：不修改 assets/ 下任何文件。
"""

from __future__ import annotations

import argparse
import datetime
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import probe_glb  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def clip_map(probe):
    out = {}
    for anim in probe.get("animations", []):
        out[anim.get("name")] = anim.get("duration_ms")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", default="r7")
    ap.add_argument("--out", default=os.path.join(
        ROOT, "docs", "motion", "ACT-006", "probe", "r7_baseline.json"))
    args = ap.parse_args()

    model_dir = os.path.join(ROOT, "assets", "releases", "ART-002", args.release, "models")
    files = sorted(glob.glob(os.path.join(model_dir, "*.glb")))
    if not files:
        print("!! 没有找到 GLB：%s" % model_dir)
        return 2

    payload = {
        "schema": "act006-asset-baseline/1",
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "generator": "tools/motion/snapshot_assets.py",
        "release": args.release,
        "model_dir": os.path.relpath(model_dir, ROOT),
        "file_count": len(files),
        "files": {},
    }

    for path in files:
        hero = os.path.splitext(os.path.basename(path))[0]
        p = probe_glb.probe_file(path)
        joints = []
        for skin in p.get("skins", []):
            joints += [j["name"] for j in skin.get("joints", [])]
        weapon_nodes = [n["name"] for n in p.get("nodes", [])
                        if n.get("has_weapon_keyword")]
        payload["files"][hero] = {
            "file": os.path.basename(path),
            "bytes": p.get("size_bytes"),
            "sha256": p.get("sha256"),
            "clips": clip_map(p),
            "joints": sorted(joints),
            "weapon_nodes": weapon_nodes,
            "probe_ok": p.get("probe_ok"),
        }
        print("%-12s %8d  sha=%s  clips=%s"
              % (hero, p.get("size_bytes") or -1, (p.get("sha256") or "")[:16],
                 clip_map(p)))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print("\n写出 %s（%d 个文件）" % (os.path.relpath(args.out, ROOT), len(files)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
