#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_weapon_frames.py — 逐帧验证武器「不脱手、不穿地」

判据
----
1. **不脱手**：武器 100% 蒙皮在 weapon.R 上，那么每帧把武器顶点变换到 weapon.R
   的局部空间后，坐标必须与第 0 帧完全一致（浮点容差 1e-5）。若中途改绑或权重错，
   这个偏差会立刻放大到厘米级。
2. **不穿地**：每帧武器求值网格的世界包围盒最低点 ≥ -GROUND_TOL；
   同时检查角色本体网格，防止身体穿地。
3. 覆盖 attack（0→1000ms）与 death（0→1583ms）的**每一帧**，不是只抽几个时刻。

用法
----
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/verify_weapon_frames.py -- \
        --blend assets/releases/ART-002/r9/source/hero005.blend \
        --out docs/motion/ACT-008/probe/weapon_frames.json
退出码：0 = 全部通过；1 = 有穿地或脱手
"""

import json
import os
import sys

import bpy

ROOT = os.environ.get("SHUIHU_PROJECT_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
ARMATURE_NAME = "hero005_rig"
WEAPON_NAME = "hero005_weapon"
BODY_NAME = "hero005_costume_and_body"
WEAPON_BONE = "weapon.R"
GROUND_TOL = 0.02          # 模型高约 1.8 单位，允许 2cm 误差
SLIP_TOL = 1e-5            # 局部坐标允许偏差（浮点级）
CLIPS = ["attack", "death"]


def log(msg):
    print(msg, flush=True)


def world_min_z(obj, deps):
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    mw = ev.matrix_world
    if not me.vertices:
        ev.to_mesh_clear()
        return None, 0
    zs = [(mw @ v.co).z for v in me.vertices]
    ev.to_mesh_clear()
    return min(zs), len(zs)


def world_points(obj, deps):
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    mw = ev.matrix_world
    pts = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def cli_args():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", default="assets/releases/ART-002/r9/source/hero005.blend")
    ap.add_argument("--out", default="docs/motion/ACT-008/probe/weapon_frames.json")
    args = ap.parse_args(cli_args())

    blend = args.blend if os.path.isabs(args.blend) else os.path.join(ROOT, args.blend)
    if not os.path.isfile(blend):
        log("源工程不存在：%s" % blend)
        return 1

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=blend)
    scene = bpy.context.scene
    scene.render.fps = 24

    arm = bpy.data.objects.get(ARMATURE_NAME)
    weapon = bpy.data.objects.get(WEAPON_NAME)
    body = bpy.data.objects.get(BODY_NAME)
    if not (arm and weapon and body):
        log("场景缺对象：arm=%s weapon=%s body=%s" % (bool(arm), bool(weapon), bool(body)))
        return 1

    # 只用 action，不让 NLA 叠加
    for track in arm.animation_data.nla_tracks:
        track.mute = True

    results = {}
    failures = []

    for clip in CLIPS:
        action = bpy.data.actions.get(clip)
        if action is None:
            failures.append("缺少 action：%s" % clip)
            continue
        arm.animation_data.action = action
        f0, f1 = action.frame_range
        frames = []
        # 逐帧（含末帧小数部分）
        steps = []
        f = f0
        while f < f1 - 1e-6:
            steps.append(round(f, 4))
            f += 1.0
        steps.append(round(f1, 4))

        ref_local = None
        min_weapon_z = 1e9
        min_body_z = 1e9
        max_slip = 0.0
        for fr in steps:
            base = int(fr)
            scene.frame_set(base, subframe=fr - base)
            deps = bpy.context.evaluated_depsgraph_get()
            pb = arm.pose.bones[WEAPON_BONE]
            bone_world = arm.matrix_world @ pb.matrix
            inv = bone_world.inverted()
            pts = world_points(weapon, deps)
            local = [inv @ p for p in pts]
            if ref_local is None:
                ref_local = local
            else:
                for a, b in zip(local, ref_local):
                    d = (a - b).length
                    if d > max_slip:
                        max_slip = d
            wz, wn = world_min_z(weapon, deps)
            bz, bn = world_min_z(body, deps)
            min_weapon_z = min(min_weapon_z, wz)
            min_body_z = min(min_body_z, bz)
            frames.append({
                "frame": fr,
                "ms": round((fr - f0) / 24.0 * 1000.0, 1),
                "weapon_min_z": round(wz, 4),
                "body_min_z": round(bz, 4),
                "slip": round(max_slip, 8),
            })

        ok_slip = max_slip <= SLIP_TOL
        ok_weapon_ground = min_weapon_z >= -GROUND_TOL
        ok_body_ground = min_body_z >= -GROUND_TOL
        if not ok_slip:
            failures.append("%s：武器脱手，最大局部偏差 %.6f" % (clip, max_slip))
        if not ok_weapon_ground:
            failures.append("%s：武器穿地，最低点 %.4f" % (clip, min_weapon_z))
        if not ok_body_ground:
            failures.append("%s：身体穿地，最低点 %.4f" % (clip, min_body_z))

        results[clip] = {
            "frames": len(frames),
            "duration_ms": round((f1 - f0) / 24.0 * 1000.0, 1),
            "max_slip": round(max_slip, 8),
            "min_weapon_z": round(min_weapon_z, 4),
            "min_body_z": round(min_body_z, 4),
            "ok_slip": ok_slip,
            "ok_weapon_ground": ok_weapon_ground,
            "ok_body_ground": ok_body_ground,
            "per_frame": frames,
        }
        log("== %s ==  帧数 %d（%.1fms）  脱手偏差 %.8f  武器最低 %.4f  身体最低 %.4f  → %s"
            % (clip, len(frames), results[clip]["duration_ms"], max_slip,
               min_weapon_z, min_body_z, "PASS" if (ok_slip and ok_weapon_ground
                                                    and ok_body_ground) else "FAIL"))

    out = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({
            "schema": "act008-weapon-frames/1",
            "generator": "tools/motion/verify_weapon_frames.py",
            "blender": bpy.app.version_string,
            "blend": os.path.relpath(blend, ROOT),
            "tolerances": {"ground": GROUND_TOL, "slip": SLIP_TOL},
            "clips": results,
            "failures": failures,
        }, f, ensure_ascii=False, indent=1)

    log("\n结果：%s" % os.path.relpath(out, ROOT))
    if failures:
        for x in failures:
            log("  !! %s" % x)
        return 1
    log("WEAPON_FRAMES_OK: 逐帧不脱手、不穿地（%s）" % ", ".join(CLIPS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
