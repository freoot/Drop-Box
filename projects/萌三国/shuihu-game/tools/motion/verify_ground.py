#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_ground.py — 在 Blender 里复核**导出的 r8 GLB**：death 末帧是否真的贴地

为什么单独做
------------
构建时的贴地求解发生在内存场景里；这里重新从磁盘读 **r8/*.glb**，
把 death 播到末帧，测量蒙皮网格的世界最低点，确认导出的字节里确实贴地。

断言（每个角色）
----------------
1. death 片段存在，且末帧最低点 |minZ| <= 0.05（模型约 1.8~2.1 单位高）
2. 末帧最大高度 < 站立高度 * 0.7（确实躺下了，不是站着下沉）

只统计带 Armature 修改器的蒙皮网格：r7 资产里混有无关的 42 顶点 Icosphere
（包围盒固定 -1..1），算进来会让结果失真。

用法
----
    Blender -b -P tools/motion/verify_ground.py -- \
        --out docs/motion/ACT-006/probe/r8_ground.json
"""

import argparse
import glob
import json
import os
import sys

import bpy

ROOT = os.environ.get("SHUIHU_PROJECT_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".."))
R8_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r8", "models")

GROUND_TOL = 0.05
LYING_RATIO = 0.7


def cli():
    argv = sys.argv
    tail = argv[argv.index("--") + 1:] if "--" in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(
        ROOT, "docs", "motion", "ACT-006", "probe", "r8_ground.json"))
    ap.add_argument("--dir", default=R8_DIR)
    return ap.parse_args(tail)


def measure(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    sc = bpy.context.scene
    arm = next((o for o in sc.objects if o.type == "ARMATURE"), None)
    if arm is None:
        return None
    skinned = [o for o in sc.objects if o.type == "MESH"
               and any(m.type == "ARMATURE" and m.object == arm for m in o.modifiers)]

    def bbox_at(frame):
        sc.frame_set(int(frame), subframe=frame - int(frame))
        deps = bpy.context.evaluated_depsgraph_get()
        lo = hi = None
        for o in skinned:
            ev = o.evaluated_get(deps)
            me = ev.to_mesh()
            mw = ev.matrix_world
            for v in me.vertices:
                z = (mw @ v.co).z
                lo = z if lo is None else min(lo, z)
                hi = z if hi is None else max(hi, z)
            ev.to_mesh_clear()
        return lo, hi

    # 站立高度取 idle 首帧
    idle = bpy.data.actions.get("idle")
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = idle
    stand_lo, stand_hi = bbox_at(0)
    stand_h = (stand_hi - stand_lo) if (stand_lo is not None) else None

    death = bpy.data.actions.get("death")
    if death is None:
        return {"death": False, "stand_h": stand_h}
    arm.animation_data.action = death
    end = death.frame_range[1]
    lo, hi = bbox_at(end)
    return {
        "death": True,
        "death_end_frame": end,
        "death_ms": round(end / 24.0 * 1000.0, 1),
        "stand_h": None if stand_h is None else round(stand_h, 4),
        "death_min_z": None if lo is None else round(lo, 4),
        "death_max_z": None if hi is None else round(hi, 4),
        "lying_ratio": None if (stand_h is None or hi is None) else round(hi / stand_h, 4),
    }


def main():
    args = cli()
    files = sorted(glob.glob(os.path.join(args.dir, "*.glb")))
    if not files:
        print("!! 没有 GLB：%s" % args.dir)
        return 2
    print("%-9s %-8s %-9s %-9s %-7s %s" % ("hero", "minZ", "maxZ", "stand_h", "ratio", "judge"))
    print("-" * 70)
    out, fails = [], 0
    for path in files:
        hero = os.path.splitext(os.path.basename(path))[0]
        r = measure(path)
        if r is None or not r.get("death"):
            print("%-9s %s" % (hero, "缺 death 或骨架"))
            fails += 1
            out.append({"hero": hero, "ok": False, "reason": "no death clip"})
            continue
        ok_ground = r["death_min_z"] is not None and abs(r["death_min_z"]) <= GROUND_TOL
        ok_lying = r["lying_ratio"] is not None and r["lying_ratio"] < LYING_RATIO
        ok = ok_ground and ok_lying
        fails += 0 if ok else 1
        print("%-9s %+8.4f %8.4f %9s %7s %s"
              % (hero, r["death_min_z"], r["death_max_z"], r["stand_h"],
                 r["lying_ratio"], "PASS" if ok else "FAIL"))
        out.append({"hero": hero, "ok": ok,
                    "ground_ok": ok_ground, "lying_ok": ok_lying, **r})

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({
            "schema": "act006-r8-ground/1",
            "generator": "tools/motion/verify_ground.py",
            "ground_tol": GROUND_TOL,
            "lying_ratio_limit": LYING_RATIO,
            "hero_count": len(out),
            "fail_count": fails,
            "results": out,
        }, f, ensure_ascii=False, indent=1)
    print("-" * 70)
    print("角色 %d 个，FAIL %d 个；明细 %s"
          % (len(out), fails, os.path.relpath(args.out, ROOT)))
    if fails == 0:
        print("GROUND_OK: every r8 death ends lying on the floor (|minZ|<=%.2f)" % GROUND_TOL)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
