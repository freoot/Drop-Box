#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_r8_all.py — 逐角色复核 r8（ACT-006，17 个新角色 + hero005 对照）

断言（每个角色独立，任一 FAIL 则退出码非 0）
--------------------------------------------
1. r8 文件存在且可解析
2. r8 存在原生 death clip，且实测时长 ≈ 1600ms
3. r7 原有的 4 个 clip（idle/walk/attack/hit）全部保留，时长与 r7 一致
4. r8 clip 集合 = r7 clip 集合 ∪ {death}（没有丢片段、没有多出别的片段）
5. 存在 weapon.R 挂点节点，父级 hand.R，且属于 skin joint
6. r8 骨骼集合 = r7 骨骼集合 ∪ {weapon.R}（没有改动既有骨架）
7. r7 文件字节数与 sha256 与开工前基线一致（证明 r7 未被改动）

用法
----
    python3 tools/motion/verify_r8_all.py
    python3 tools/motion/verify_r8_all.py --out docs/motion/ACT-006/probe/r8_verify_all.json

约束
----
- 只读：不修改 assets/ 下任何文件；所有数字来自实际字节。
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
R7_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r7", "models")
R8_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r8", "models")
BASELINE = os.path.join(ROOT, "docs", "motion", "ACT-006", "probe", "r7_baseline.json")

DEATH_TARGET_MS = 1600.0
TOL_MS = 40.0            # 24fps 单帧 41.7ms
KEEP_CLIPS = ["idle", "walk", "attack", "hit"]
WEAPON_BONE = "weapon.R"
PARENT_BONE = "hand.R"


def clip_map(probe):
    return {a.get("name"): a.get("duration_ms") for a in probe.get("animations", [])}


def joints_of(probe):
    out = []
    for skin in probe.get("skins", []):
        out += [j["name"] for j in skin.get("joints", [])]
    return sorted(set(out))


def verify_hero(hero, base):
    checks = []

    def check(label, ok, detail):
        checks.append({"item": label, "pass": bool(ok), "detail": detail})
        return ok

    r7 = os.path.join(R7_DIR, hero + ".glb")
    r8 = os.path.join(R8_DIR, hero + ".glb")
    if not os.path.isfile(r8):
        check("r8 文件存在", False, "缺失 %s" % os.path.relpath(r8, ROOT))
        return checks, None, None
    check("r8 文件存在", True, "%d bytes" % os.path.getsize(r8))

    p7 = probe_glb.probe_file(r7)
    p8 = probe_glb.probe_file(r8)
    c7, c8 = clip_map(p7), clip_map(p8)
    j7, j8 = joints_of(p7), joints_of(p8)

    # 1. 原生 death
    check("r8 存在原生 death clip", "death" in c8, "clips=%s" % sorted(c8))
    if "death" in c8:
        d = c8["death"]
        check("death 时长 ≈ %dms" % DEATH_TARGET_MS,
              d is not None and abs(d - DEATH_TARGET_MS) <= TOL_MS,
              "实测 %s ms（容差 ±%d）" % (d, TOL_MS))

    # 2. 既有 clip 时长不变（以该角色自己的 r7 为基准）
    for name in KEEP_CLIPS:
        a, b = c7.get(name), c8.get(name)
        ok = (b is not None and a is not None and abs(b - a) <= TOL_MS)
        check("保留 clip %s 且时长未变" % name, ok, "r7=%s ms → r8=%s ms" % (a, b))

    # 3. clip 集合 = r7 ∪ {death}
    check("clip 集合 = r7 ∪ {death}", set(c8) == set(c7) | {"death"},
          "r7=%s → r8=%s" % (sorted(c7), sorted(c8)))

    # 4. 武器挂点
    nodes8 = p8.get("nodes", [])
    wp = [n for n in nodes8 if (n.get("name") or "") == WEAPON_BONE]
    check("存在挂点节点 %s" % WEAPON_BONE, bool(wp),
          "命中=%s" % [(n["name"], n.get("parent_name")) for n in wp])
    check("挂点父级为 %s" % PARENT_BONE,
          any(n.get("parent_name") == PARENT_BONE for n in wp),
          "父级=%s" % [n.get("parent_name") for n in wp])
    check("挂点属于 skin joint（会跟随手部）",
          any(n.get("is_skin_joint") for n in wp),
          "is_skin_joint=%s" % [n.get("is_skin_joint") for n in wp])

    # 5. 骨骼集合
    check("骨骼集合 = r7 ∪ {weapon.R}", set(j8) == set(j7) | {WEAPON_BONE},
          "r7=%d 根 → r8=%d 根，新增=%s" % (len(j7), len(j8), sorted(set(j8) - set(j7))))

    # 6. r7 未被改动（对照开工前基线，而非 r7 自身的自洽）
    sha_now = p7.get("sha256")
    bytes_now = p7.get("size_bytes")
    check("r7 sha256 与基线一致",
          base is not None and sha_now == base.get("sha256"),
          "基线=%s 现=%s" % ((base or {}).get("sha256", "")[:16], (sha_now or "")[:16]))
    check("r7 字节数与基线一致",
          base is not None and bytes_now == base.get("bytes"),
          "基线=%s 现=%s" % ((base or {}).get("bytes"), bytes_now))

    summary = {
        "hero": hero,
        "r7": {"bytes": bytes_now, "sha256": sha_now, "clips": c7, "joints": j7},
        "r8": {"bytes": p8.get("size_bytes"), "sha256": p8.get("sha256"),
               "clips": c8, "joints": j8,
               "weapon": [{"name": n["name"], "parent": n.get("parent_name"),
                           "is_joint": n.get("is_skin_joint")} for n in wp]},
    }
    return checks, summary, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default=BASELINE)
    ap.add_argument("--out", default=os.path.join(
        ROOT, "docs", "motion", "ACT-006", "probe", "r8_verify_all.json"))
    args = ap.parse_args()

    if not os.path.isfile(args.baseline):
        print("!! 缺少 r7 基线：%s\n   先跑 python3 tools/motion/snapshot_assets.py" % args.baseline)
        return 2
    base_all = json.load(open(args.baseline, encoding="utf-8"))
    bases = base_all.get("files", {})

    heroes = sorted(os.path.splitext(os.path.basename(p))[0]
                    for p in glob.glob(os.path.join(R8_DIR, "*.glb")))
    if not heroes:
        print("!! r8 目录没有 GLB：%s" % R8_DIR)
        return 2

    print("复核查验 %d 个角色（基线 %d 个）\n" % (len(heroes), len(bases)))
    print("%-9s %-5s %-7s %-8s %-30s %s"
          % ("hero", "items", "pass", "fail", "clips(r8)", "weapon.R→parent"))
    print("-" * 100)

    results, total_fail = [], 0
    for hero in heroes:
        checks, summary, _ = verify_hero(hero, bases.get(hero))
        fails = [c for c in checks if not c["pass"]]
        total_fail += len(fails)
        clips = (summary or {}).get("r8", {}).get("clips") or {}
        wp = (summary or {}).get("r8", {}).get("weapon") or []
        print("%-9s %-5d %-7d %-8d %-30s %s"
              % (hero, len(checks), len(checks) - len(fails), len(fails),
                 ",".join("%s=%.0f" % (k, v) for k, v in sorted(clips.items())),
                 ",".join("%s←%s" % (w["name"], w["parent"]) for w in wp)))
        for c in fails:
            print("    [FAIL] %s — %s" % (c["item"], c["detail"]))
        results.append({"hero": hero, "checks": checks, "summary": summary})

    payload = {
        "schema": "act006-r8-verify-all/1",
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "generator": "tools/motion/verify_r8_all.py",
        "baseline": os.path.relpath(args.baseline, ROOT),
        "hero_count": len(heroes),
        "check_count": sum(len(r["checks"]) for r in results),
        "fail_count": total_fail,
        "results": results,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    print("-" * 100)
    print("角色 %d 个，断言 %d 项，FAIL %d 项" % (
        len(heroes), payload["check_count"], total_fail))
    print("明细：%s" % os.path.relpath(args.out, ROOT))
    if total_fail:
        return 1
    print("R8_ALL_OK: every hero has native death + weapon.R, r7 untouched")
    return 0


if __name__ == "__main__":
    sys.exit(main())
