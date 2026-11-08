#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_r8.py — 复核 r8 新资产是否真正包含「原生 death 片段」与「武器挂点」（ACT-005）

做什么
------
1. 复用 tools/motion/probe_glb.py 的 GLB 解析能力（只读引用，不修改该文件），
   分别探测 r7 与 r8 的 hero005.glb。
2. 逐项断言并输出 PASS/FAIL（退出码非 0 表示有 FAIL）：
   - r8 是否存在名为 death 的 clip
   - death 实测时长是否 ≈ 1600ms
   - 原有 idle/walk/attack/hit 四个 clip 是否都还在、时长是否与 r7 一致
   - 是否存在武器/道具专用挂点节点（weapon/prop/sword/blade/spear/staff/axe 语义）
   - 该挂点的父节点是否为 hand.R
   - r7 文件字节与 sha256 是否未被改动
3. 产出 docs/motion/ACT-005/probe/r8_hero005_probe.json（机器可读）。

用法
----
    python3 tools/motion/verify_r8.py

约束
----
- 只读：不修改 assets/ 下任何文件；所有数字来自实际字节。
"""

from __future__ import annotations

import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)           # 引用同目录的 probe_glb.py

import probe_glb  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
R7 = os.path.join(ROOT, "assets", "releases", "ART-002", "r7", "models", "hero005.glb")
R8 = os.path.join(ROOT, "assets", "releases", "ART-002", "r8", "models", "hero005.glb")
OUT_DIR = os.path.join(ROOT, "docs", "motion", "ACT-005", "probe")

WEAPON_WORDS = ["weapon", "prop", "sword", "blade", "spear", "staff", "axe"]
DEATH_TARGET_MS = 1600.0
TOL_MS = 40.0          # 24fps 单帧 41.7ms，取 40ms 容差（采样重编码会有量化误差）

results = []


def check(label, ok, detail):
    results.append({"item": label, "pass": bool(ok), "detail": detail})
    print("[%s] %s — %s" % ("PASS" if ok else "FAIL", label, detail), flush=True)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def clip_index(probe):
    """返回 {clip名: duration_ms}"""
    out = {}
    for anim in probe.get("animations", []):
        name = anim.get("name")
        out[name] = anim.get("duration_ms")
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    p7 = probe_glb.probe_file(R7)
    p8 = probe_glb.probe_file(R8)

    r7_sha = sha256_of(R7)
    r8_sha = sha256_of(R8)
    r7_bytes = os.path.getsize(R7)
    r8_bytes = os.path.getsize(R8)

    print("r7: %s bytes  sha256=%s" % (r7_bytes, r7_sha[:16]))
    print("r8: %s bytes  sha256=%s" % (r8_bytes, r8_sha[:16]))

    c7 = clip_index(p7)
    c8 = clip_index(p8)
    print("r7 clips: %s" % c7)
    print("r8 clips: %s" % c8)

    # --- 断言 1：r8 有原生 death ---
    has_death = "death" in c8
    check("r8 存在原生 death clip", has_death,
          "r8 clip 列表=%s" % sorted(c8.keys()))

    if has_death:
        d = c8["death"]
        ok = d is not None and abs(d - DEATH_TARGET_MS) <= TOL_MS
        check("death 实测时长 ≈ %dms" % DEATH_TARGET_MS, ok,
              "实测 %s ms（容差 ±%dms）" % (d, TOL_MS))

    # --- 断言 2：原 4 clip 仍在且时长未变 ---
    for name in ["idle", "walk", "attack", "hit"]:
        in8 = name in c8
        same = in8 and c7.get(name) is not None and abs(c8[name] - c7[name]) <= TOL_MS
        check("r8 保留 clip %s 且时长未变" % name, same,
              "r7=%s ms → r8=%s ms" % (c7.get(name), c8.get(name)))

    # --- 断言 3：武器挂点 ---
    nodes8 = p8.get("nodes", [])
    weapon_nodes = [n for n in nodes8
                    if any(w in (n.get("name") or "").lower() for w in WEAPON_WORDS)]
    check("r8 存在武器/道具专用挂点节点", len(weapon_nodes) > 0,
          "命中节点=%s" % [(n["name"], n.get("parent_name")) for n in weapon_nodes])

    parent_ok = any((n.get("parent_name") == "hand.R") for n in weapon_nodes)
    check("武器挂点父级为 hand.R", parent_ok,
          "父级=%s" % [n.get("parent_name") for n in weapon_nodes])

    # r7 对照：应当仍然没有挂点
    nodes7 = p7.get("nodes", [])
    w7 = [n for n in nodes7 if any(w in (n.get("name") or "").lower() for w in WEAPON_WORDS)]
    check("r7 仍无武器挂点（未被改动）", len(w7) == 0,
          "r7 命中=%s" % [n["name"] for n in w7])

    # --- 断言 4：r7 未被改动 ---
    check("r7 文件字节与 sha256 未变",
          r7_bytes == p7.get("size_bytes") and r7_sha == p7.get("sha256"),
          "字节=%d sha=%s" % (r7_bytes, r7_sha[:16]))

    # --- death clip 驱动节点明细 ---
    death_detail = None
    for anim in p8.get("animations", []):
        if anim.get("name") == "death":
            death_detail = anim
    if death_detail:
        print("death 通道数=%s 关键帧数=%s 驱动节点=%s"
              % (death_detail.get("channel_count"),
                 death_detail.get("keyframe_count"),
                 sorted(death_detail.get("target_nodes", []) or [])))

    payload = {
        "schema": "act005-r8-verify/1",
        "r7": {"path": R7, "bytes": r7_bytes, "sha256": r7_sha, "clips": c7,
               "nodes": len(nodes7), "weapon_nodes": [n["name"] for n in w7]},
        "r8": {"path": R8, "bytes": r8_bytes, "sha256": r8_sha, "clips": c8,
               "nodes": len(nodes8),
               "weapon_nodes": [{"name": n["name"], "parent": n.get("parent_name"),
                                 "is_joint": n.get("is_skin_joint")} for n in weapon_nodes]},
        "death_clip_detail": death_detail,
        "checks": results,
        "probe_raw": {"r7": p7, "r8": p8},
    }
    with open(os.path.join(OUT_DIR, "r8_hero005_probe.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    failed = [r for r in results if not r["pass"]]
    print("\n合计 %d 项，PASS %d，FAIL %d" % (len(results), len(results) - len(failed), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
