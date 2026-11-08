#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_ground_penetration.py — 修正 attack / death 的逐帧穿地

问题来源（verify_weapon_frames.py 实测）
----------------------------------------
- attack 全段最低 **-0.0235**，且第 0ms 就是 -0.0200：武器长杆末端在静止姿态
  本来就探到地面以下约 2cm，是模型固有状态，不是动画造成的。
- death 在 41.7–541.7ms 之间身体与武器一起沉到地面以下（身体 -0.0705、
  武器 -0.1473）：倒地绕脚底旋转，中段躯干必然扫过地面。此前只验末帧，未暴露。

为什么不用旋转修
----------------
武器最低点几乎就在 ``weapon.R`` 骨 head 的正下方（水平偏移很小）。
绕该骨旋转时这个点沿圆弧横摆，高度只按 1−cosθ 变化（二阶小量）：
实测 2° 只抬 0.0001，15° 也只抬 0.0016 —— 旋转不是有效手段。必须**平移**。

修正策略
--------
1. **全局**：把 ``weapon.R`` 骨沿世界 Z 平移 +0.026（武器整体抬高 2.6cm，
   相对 1.8 单位高的角色约 1.4%），解决 attack 全段的 -0.0235。
   手部网格不受影响（手绑 hand.R），视觉上只是握点略上移。
2. **death**：逐帧测量「身体 + 武器」最低点，用 root 骨做贴地补偿
   （逐帧插 location 关键帧，余量 2mm）。root 抬高后身体贴地而非穿地，
   武器作为后代一并抬起。
3. 保存 r9 源工程并重新导出 GLB；r8 保持不动。

用法
----
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/fix_ground_penetration.py -- \
        [--weapon-lift 0.026] [--margin 0.002]
退出码：0 = 成功
"""

import json
import os
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.environ.get("SHUIHU_PROJECT_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
BLEND = os.path.join(ROOT, "assets/releases/ART-002/r9/source/hero005.blend")
GLB = os.path.join(ROOT, "assets/releases/ART-002/r9/models/hero005.glb")
REPORT = os.path.join(ROOT, "docs/motion/ACT-008/probe/ground_fix.json")

ARMATURE_NAME = "hero005_rig"
WEAPON_NAME = "hero005_weapon"
BODY_NAME = "hero005_costume_and_body"
WEAPON_BONE = "weapon.R"
FRAME_RATE = 24


def log(msg):
    print(msg, flush=True)


def min_z(obj, deps):
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    if not me.vertices:
        ev.to_mesh_clear()
        return 1e9
    mw = ev.matrix_world
    z = min((mw @ v.co).z for v in me.vertices)
    ev.to_mesh_clear()
    return z


def scene_min_z(body, weapon):
    deps = bpy.context.evaluated_depsgraph_get()
    return min(min_z(body, deps), min_z(weapon, deps))


def frames_of(action):
    f0, f1 = action.frame_range
    out, f = [], f0
    while f < f1 - 1e-6:
        out.append(round(f, 4))
        f += 1.0
    out.append(round(f1, 4))
    return out


def cli_args():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--weapon-lift", type=float, default=0.026,
                    help="weapon.R 骨沿世界 Z 的平移量（默认 0.026）")
    ap.add_argument("--margin", type=float, default=0.002)
    args = ap.parse_args(cli_args())

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    scene = bpy.context.scene
    scene.render.fps = FRAME_RATE

    arm = bpy.data.objects[ARMATURE_NAME]
    body = bpy.data.objects[BODY_NAME]
    weapon = bpy.data.objects[WEAPON_NAME]
    for t in arm.animation_data.nla_tracks:
        t.mute = True

    report = {"schema": "act008-ground-fix/1", "weapon_lift": args.weapon_lift,
              "margin": args.margin, "clips": {}}

    # ---------------- 1) 全局：平移武器网格顶点（幂等，重复运行不会叠加） ----------------
    # 注意：不能平移 rest 骨 —— 蒙皮结果是 M_pose × M_rest⁻¹，rest 与 pose 同步平移后
    # 乘积仍是单位阵，顶点纹丝不动（实测平移骨后 minZ 完全没变）。必须直接改顶点。
    arm.animation_data.action = None
    applied = float(weapon.get("weapon_lift_applied", 0.0))
    if abs(applied) > 1e-9:
        log("武器顶点已平移过 %.4f，跳过（避免重复叠加）" % applied)
    else:
        mw3 = weapon.matrix_world.to_3x3()
        delta_local = mw3.inverted() @ Vector((0.0, 0.0, args.weapon_lift))
        for v in weapon.data.vertices:
            v.co += delta_local
        weapon.data.update()
        weapon["weapon_lift_applied"] = args.weapon_lift
        log("武器网格顶点沿世界 Z 平移 +%.4f（%d 个顶点，局部增量 %.4f）"
            % (args.weapon_lift, len(weapon.data.vertices), delta_local.z))

    # ---------------- 2) attack 全段复测 ----------------
    attack = bpy.data.actions["attack"]
    arm.animation_data.action = attack
    bpy.context.view_layer.update()
    worst_attack = 1e9
    for fr in frames_of(attack):
        base = int(fr)
        scene.frame_set(base, subframe=fr - base)
        worst_attack = min(worst_attack, scene_min_z(body, weapon))
    report["clips"]["attack"] = {"min_z_after": round(worst_attack, 4)}
    log("attack：平移后全段最低 %.4f" % worst_attack)

    # ---------------- 3) death：root 逐帧贴地补偿 ----------------
    death = bpy.data.actions["death"]
    arm.animation_data.action = death
    pb_root = arm.pose.bones["root"]
    mw = arm.matrix_world
    mw_inv = mw.inverted()
    lifts = []
    worst_before = 1e9
    for fr in frames_of(death):
        base = int(fr)
        scene.frame_set(base, subframe=fr - base)
        cur = scene_min_z(body, weapon)
        worst_before = min(worst_before, cur)
        delta = max(0.0, args.margin - cur)
        if delta > 1e-6:
            mat = mw @ pb_root.matrix
            pb_root.matrix = mw_inv @ (Matrix.Translation((0.0, 0.0, delta)) @ mat)
            bpy.context.view_layer.update()
            pb_root.keyframe_insert("location", frame=fr)
            lifts.append({"frame": fr, "lift": round(delta, 4)})
    worst_after = 1e9
    for fr in frames_of(death):
        base = int(fr)
        scene.frame_set(base, subframe=fr - base)
        worst_after = min(worst_after, scene_min_z(body, weapon))
    report["clips"]["death"] = {
        "min_z_before": round(worst_before, 4), "min_z_after": round(worst_after, 4),
        "lifted_frames": len(lifts), "lifts": lifts,
    }
    log("death：逐帧抬升 %d 帧，最低点 %.4f → %.4f"
        % (len(lifts), worst_before, worst_after))

    # ---------------- 4) 保存 + 导出 ----------------
    arm.animation_data.action = bpy.data.actions["attack"]
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    arm.animation_data.action = None
    scene.frame_start = 0
    scene.frame_end = 60
    bpy.ops.export_scene.gltf(
        filepath=GLB, export_format="GLB", export_animations=True,
        export_nla_strips=True, export_skins=True, export_force_sampling=True,
        export_frame_range=False, export_yup=True, export_image_format="AUTO",
    )
    report["blend_bytes"] = os.path.getsize(BLEND)
    report["glb_bytes"] = os.path.getsize(GLB)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    log("报告：%s" % os.path.relpath(REPORT, ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
