#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_blend_sources.py — 用 Blender **独立进程重新打开** r8 源工程做验收

为什么需要这一步
----------------
build_r8_death.py 跑完只会说「我保存了」。但保存出来的文件到底能不能被
Blender 再次打开、里面是不是真的有 death 片段和 weapon.R 挂点骨，
必须用**另一个 Blender 进程**把文件读回来检查才算数 —— 否则验收只是在
相信上一次运行的内存状态。

检查项（逐角色）
----------------
1. 文件能被 bpy.ops.wm.open_mainfile 打开（读不回来直接判失败）
2. 场景里有 Armature
3. Action 列表含 idle / walk / attack / hit / death 五个
4. death 片段的起止帧 → 换算毫秒，必须≈1583.3ms（24fps 量化后的 1600ms）
5. 骨骼表含 weapon.R，且其父骨是 hand.R
6. 从 .blend **重新导出**一份 GLB 到临时目录，供外部脚本比对结构
   （证明「源工程 → GLB」这条路也走得通，不只是「GLB → GLB」）

用法
----
    /Applications/Blender.app/Contents/MacOS/Blender -b \
        -P tools/motion/verify_blend_sources.py -- --out <json> [--reexport-dir <dir>]

退出码：0 = 全部通过；1 = 有失败项。
"""

import json
import os
import sys

import bpy

ROOT = os.environ.get("SHUIHU_PROJECT_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
SRC_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r8", "source")
MODEL_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r8", "models")

REQUIRED_ACTIONS = ["idle", "walk", "attack", "hit", "death"]
FRAME_RATE = 24
DEATH_EXPECT_MS = 1600.0
# 24fps 量化：38.4 帧 → 落到 38 帧 = 1583.33ms，允许一个采样间隔的误差
DEATH_TOL_MS = 45.0


def clip_ms(action):
    """Action 的帧范围换算成毫秒（gltf 导出按 24fps 采样）。"""
    frames = action.frame_range
    return (frames[1] - frames[0]) / FRAME_RATE * 1000.0


def count_keyframes(action):
    """Blender 5.x 的 Action 是 layered（无顶层 .fcurves），走 layer/strip/channelbag。

    不同小版本的 API 名字略有出入（channelbags / channelbag(i) / channels），
    这里逐个尝试，都拿不到就返回 -1（不算失败，只影响诊断信息）。
    """
    def walk(strip):
        n = 0
        bags = getattr(strip, "channelbags", None)
        if bags is not None:
            for bag in bags:
                for fc in getattr(bag, "fcurves", []):
                    n += len(fc.keyframe_points)
            return n
        for idx in (0,):
            try:
                bag = strip.channelbag(idx)
            except Exception:                             # noqa: BLE001
                bag = None
            if bag is not None:
                for fc in getattr(bag, "fcurves", []):
                    n += len(fc.keyframe_points)
                return n
        return -1

    total = 0
    try:
        for layer in action.layers:
            for strip in layer.strips:
                got = walk(strip)
                if got < 0:
                    return -1
                total += got
    except Exception:                                     # noqa: BLE001
        return -1
    return total


def check_one(hero, reexport_dir):
    path = os.path.join(SRC_DIR, hero + ".blend")
    checks = []

    def add(name, ok, detail):
        checks.append({"check": name, "ok": bool(ok), "detail": detail})

    if not os.path.isfile(path):
        add("blend_exists", False, "源文件不存在：%s" % path)
        return {"hero": hero, "ok": False, "checks": checks}

    add("blend_exists", True, "%d bytes" % os.path.getsize(path))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=path)
    add("reopen", True, "Blender 成功重新打开并载入场景")

    armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    add("has_armature", len(armatures) == 1, "Armature 数=%d" % len(armatures))
    if not armatures:
        return {"hero": hero, "ok": False, "checks": checks}
    arm = armatures[0]

    actions = sorted(a.name for a in bpy.data.actions)
    missing = [a for a in REQUIRED_ACTIONS if a not in actions]
    add("five_actions", not missing, "Action=%s 缺=%s" % (actions, missing or "无"))

    death = bpy.data.actions.get("death")
    if death is None:
        add("death_duration", False, "无 death action")
    else:
        ms = clip_ms(death)
        # 源工程内部：起止帧 0→38.4 帧 = 1600ms（导出 GLB 时按整帧采样落到 38 帧
        # = 1583.3ms，那是量化结果，不是源文件里的时长）
        ok = abs(ms - DEATH_EXPECT_MS) <= DEATH_TOL_MS
        add("death_duration", ok,
            "%.1fms（帧范围 %.2f→%.2f，%d 个关键帧；导出 GLB 后量化为 1583.3ms）"
            % (ms, death.frame_range[0], death.frame_range[1], count_keyframes(death)))

    bones = [b.name for b in arm.data.bones]
    add("weapon_bone", "weapon.R" in bones, "骨骼表=%s" % bones)
    if "weapon.R" in bones:
        parent = arm.data.bones["weapon.R"].parent
        add("weapon_parent", parent is not None and parent.name == "hand.R",
            "weapon.R 父骨=%s" % (parent.name if parent else "无"))

    reexport = None
    if reexport_dir:
        os.makedirs(reexport_dir, exist_ok=True)
        out_glb = os.path.join(reexport_dir, hero + ".from_blend.glb")
        bpy.context.scene.render.fps = FRAME_RATE
        bpy.ops.export_scene.gltf(
            filepath=out_glb, export_format="GLB", export_animations=True,
            export_nla_strips=True, export_skins=True, export_force_sampling=True,
            export_frame_range=False, export_yup=True, export_image_format="AUTO",
        )
        reexport = os.path.relpath(out_glb, ROOT)
        add("reexport_glb", os.path.isfile(out_glb),
            "%d bytes" % (os.path.getsize(out_glb) if os.path.isfile(out_glb) else -1))

    return {
        "hero": hero,
        "ok": all(c["ok"] for c in checks),
        "blend_bytes": os.path.getsize(path),
        "actions": actions,
        "bones": bones,
        "reexport": reexport,
        "checks": checks,
    }


def cli_args():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/motion/ACT-007/probe/blend_reopen.json")
    ap.add_argument("--reexport-dir", default="")
    ap.add_argument("--heroes", default="")
    args = ap.parse_args(cli_args())

    heroes = [h.strip() for h in args.heroes.split(",") if h.strip()]
    if not heroes:
        heroes = sorted(f[:-6] for f in os.listdir(SRC_DIR) if f.endswith(".blend"))

    reexport_dir = ""
    if args.reexport_dir:
        reexport_dir = (args.reexport_dir if os.path.isabs(args.reexport_dir)
                        else os.path.join(ROOT, args.reexport_dir))

    results = [check_one(h, reexport_dir) for h in heroes]
    ok_count = sum(1 for r in results if r["ok"])
    total_checks = sum(len(r["checks"]) for r in results)
    ok_checks = sum(1 for r in results for c in r["checks"] if c["ok"])

    out = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({
            "schema": "act007-blend-reopen/1",
            "generator": "tools/motion/verify_blend_sources.py",
            "blender": bpy.app.version_string,
            "hero_count": len(heroes),
            "ok_count": ok_count,
            "checks_total": total_checks,
            "checks_ok": ok_checks,
            "results": results,
        }, f, ensure_ascii=False, indent=1)

    for r in results:
        print("%s %s（%d/%d 项）" % ("OK  " if r["ok"] else "FAIL", r["hero"],
                                 sum(1 for c in r["checks"] if c["ok"]), len(r["checks"])))
    print("\nBlender %s 重开验收：%d/%d 角色通过，断言 %d/%d"
          % (bpy.app.version_string, ok_count, len(heroes), ok_checks, total_checks))
    print("结果：%s" % os.path.relpath(out, ROOT))
    return 0 if ok_count == len(heroes) else 1


if __name__ == "__main__":
    sys.exit(main())
