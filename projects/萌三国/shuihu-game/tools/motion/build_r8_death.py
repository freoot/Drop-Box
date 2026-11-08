#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_r8_death.py — 用 Blender 后台模式在 r7 资产基础上生成 r8 新版本

做什么
------
1. 导入 assets/releases/ART-002/r7/models/<hero>.glb（**只读**，不改动 r7 任何文件）。
2. 在既有 Armature 上新增一个**原生**名为 ``death`` 的 Action（真实骨骼姿态关键帧，
   不是离线合成），总时长 1600ms（对齐 ACT-004 timing_unified.json 的 death 判定）。
3. 新增武器挂点骨 ``weapon.R``，父级为 ``hand.R``（ACT-004 实测 hand.R 为骨骼）。
4. 导出为 assets/releases/ART-002/r8/models/<hero>.glb，原有 idle/walk/attack/hit
   四个 clip 必须保留且时长不变。
5. 打印诊断信息，供 verify_r8_all.py 复核。

用法
----
    # 单个角色（默认 hero005）；默认按包围盒自动贴地，--sink 0.1 可复现 ACT-005 旧值
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py

    # 指定角色；不给 --sink 时按该角色实际包围盒自动求解沉降，保证末帧贴地
    ... -b -P tools/motion/build_r8_death.py -- --hero hero002

    # 批量（ACT-006：其余 17 个角色）
    ... -b -P tools/motion/build_r8_death.py -- --heroes hero002,hero007,... --batch-log <json>

约束
----
- 只写 assets/releases/ART-002/r8/，绝不修改 r7/。
- 所有数字（帧率、时长、关键帧数、沉降量）在脚本中显式定义并打印，便于复核。
"""

import argparse
import json
import os
import sys

import bpy  # Blender 内置，仅在本脚本被 Blender 调用时可用

# ---------------------------------------------------------------- 常量（可复核）
ROOT = os.environ.get("SHUIHU_PROJECT_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
R7_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r7", "models")
R8_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r8", "models")
# 源工程目录：r7 的惯例是每角色一份 source/<hero>.blend，r8 同样要留下
# 可再次打开、可再次编辑的 .blend，而不只交一个二进制 GLB。
R8_SRC_DIR = os.path.join(ROOT, "assets", "releases", "ART-002", "r8", "source")

DEFAULT_HERO = "hero005"
DEATH_CLIP = "death"
DEATH_TOTAL_MS = 1600
# 帧率必须与原资产一致：r7 实测 idle=2000ms/49 个时间戳、hit=750ms/19 个 → 24fps。
# 若按 30fps 重导出，既有 clip 会被压缩 0.8 倍（2000→1600ms），故固定 24fps。
FRAME_RATE = 24
TOTAL_FRAMES = DEATH_TOTAL_MS / 1000.0 * FRAME_RATE   # 38.4 帧（浮点帧，保 1600ms 精确）
IMPACT_FRAME = 250 / 1000.0 * FRAME_RATE              # 6.0 帧（受击末段 250ms）
# hero005 在 ACT-005 用的是固定 0.1：root 骨位于脚底，绕脚部前倾 78° 后身体已基本贴地
# （头高约 0.26 单位），再下沉 0.9 会把模型压到地面以下，故取 0.1 做轻微沉降。
# 其余角色身高不同，固定值会悬空或埋地 —— 因此 ACT-006 起默认走「自动贴地」：
# 先按 sink=0 / 0.2 各测一次网格世界包围盒最低点，线性求解使 minZ≈0 的 sink。
SINK_UNITS = 0.1
SINK_PROBE = (0.0, 0.2)
# 正数=沿 root 骨局部 Y（世界 -Z）下沉，负数=整体上抬。
# 不同角色的 root 枢轴与身高不同：hero005 需要 +0.1 轻微下沉，
# hero002（2.14 单位高）前倾 78° 后身体有 0.48 埋在地面以下，需要 -0.48 抬起来。
SINK_CLAMP = (-0.9, 0.9)
GROUND_TOL = 0.02                    # 末帧最低点允许离地 ±2cm（模型约 1.8 单位高）
TILT_DEG = 78.0                      # 对齐 ACT-004 death_tilt_deg
WEAPON_BONE = "weapon.R"
PARENT_BONE = "hand.R"

LOG = []


def log(msg):
    print(msg, flush=True)
    LOG.append(msg)


def paths_for(hero):
    return (os.path.join(R7_DIR, hero + ".glb"),
            R8_DIR,
            os.path.join(R8_DIR, hero + ".glb"))


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    return list(bpy.context.scene.objects)


def find_armature(objects):
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def dump_diagnostics(armature):
    log("=== 导入诊断 ===")
    log("Armature: %s (data=%s)" % (armature.name, armature.data.name))
    bones = [b.name for b in armature.data.bones]
    log("骨骼数=%d: %s" % (len(bones), bones))
    log("现有 Action: %s" % [a.name for a in bpy.data.actions])
    if armature.animation_data:
        log("animation_data.action = %s" % (
            armature.animation_data.action.name if armature.animation_data.action else None))
        tracks = armature.animation_data.nla_tracks
        log("NLA tracks: %s" % [(t.name, [s.name for s in t.strips]) for t in tracks])
    else:
        log("NLA tracks: 无（animation_data 为空）")
    log("父级对象: %s" % [(o.name, o.type, o.parent.name if o.parent else None) for o in bpy.context.scene.objects])


def ensure_nla(armature):
    """确保既有 clip 都能被导出：无 NLA 时用当前 action 建轨道。"""
    if armature.animation_data is None:
        armature.animation_data_create()
    existing = {t.name for t in armature.animation_data.nla_tracks}
    for action in list(bpy.data.actions):
        if action.name == DEATH_CLIP:
            continue
        if action.name in existing:
            continue
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 1, action)


def build_death_action(armature, sink_units):
    """新增原生 death Action：受击后仰 → 前倾倒地 → 下沉，总时长 1600ms。"""
    import math
    from mathutils import Euler

    old = bpy.data.actions.get(DEATH_CLIP)
    if old is not None:
        bpy.data.actions.remove(old)

    action = bpy.data.actions.new(DEATH_CLIP)
    action.use_fake_user = True
    if armature.animation_data is None:
        armature.animation_data_create()
    # 关键：必须先把新 action 设为激活，否则 keyframe_insert 会写进当前激活的 idle
    armature.animation_data.action = action

    pose = armature.pose
    bones_present = {b.name for b in armature.data.bones}

    targets = ["root", "body", "head", "arm.L", "hand.L", "arm.R", "hand.R",
               "leg.L", "foot.L", "leg.R", "foot.R"]
    used = [t for t in targets if t in bones_present]
    missing = [t for t in targets if t not in bones_present]
    log("death 参与骨骼=%d，缺失=%s" % (len(used), missing))
    modes = {}
    for b in used:
        modes[b] = pose.bones[b].rotation_mode
    log("骨骼旋转模式：%s" % modes)

    tilt = math.radians(TILT_DEG)

    def key_loc(bone_name, frame, value, index):
        pb = pose.bones.get(bone_name)
        if pb is None:
            return
        pb.location[index] = value
        pb.keyframe_insert(data_path="location", frame=frame, index=index)

    def key_rot(bone_name, frame, ex, ey, ez):
        """按骨骼自身的 rotation_mode 写通道：QUATERNION 就写 rotation_quaternion。"""
        pb = pose.bones.get(bone_name)
        if pb is None:
            return
        if pb.rotation_mode == "QUATERNION":
            pb.rotation_quaternion = Euler((ex, ey, ez), "XYZ").to_quaternion()
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        elif pb.rotation_mode == "AXIS_ANGLE":
            pb.rotation_axis_angle = Euler((ex, ey, ez), "XYZ").to_quaternion().to_axis_angle()[0] \
                + (Euler((ex, ey, ez), "XYZ").to_quaternion().angle,)
            pb.keyframe_insert(data_path="rotation_axis_angle", frame=frame)
        else:
            pb.rotation_euler = (ex, ey, ez)
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)

    def key_scale(bone_name, frame, v):
        pb = pose.bones.get(bone_name)
        if pb is None:
            return
        pb.scale = (v, v, v)
        pb.keyframe_insert(data_path="scale", frame=frame)

    # 帧 0：起始（接近 idle 的自然站姿）
    for b in used:
        key_loc(b, 0, 0.0, 0)
        key_loc(b, 0, 0.0, 1)
        key_loc(b, 0, 0.0, 2)
        key_rot(b, 0, 0.0, 0.0, 0.0)
        key_scale(b, 0, 1.0)

    # 帧 6.0（250ms）：受击后仰——上身略后仰、双臂张开
    key_rot("root", IMPACT_FRAME, math.radians(-12.0), 0.0, 0.0)
    key_rot("body", IMPACT_FRAME, math.radians(-10.0), 0.0, 0.0)
    key_rot("head", IMPACT_FRAME, math.radians(-8.0), 0.0, 0.0)
    key_rot("arm.L", IMPACT_FRAME, 0.0, 0.0, math.radians(-25.0))
    key_rot("arm.R", IMPACT_FRAME, 0.0, 0.0, math.radians(25.0))
    key_loc("root", IMPACT_FRAME, -0.08, 1)

    # 帧 19.2（800ms）：前倾过半
    mid = TOTAL_FRAMES * 0.5
    key_rot("root", mid, tilt * 0.5, 0.0, 0.0)
    key_loc("root", mid, -sink_units * 0.35, 1)
    key_rot("body", mid, math.radians(10.0), 0.0, 0.0)
    key_rot("head", mid, math.radians(18.0), 0.0, 0.0)
    key_rot("arm.L", mid, 0.0, 0.0, math.radians(-5.0))
    key_rot("arm.R", mid, 0.0, 0.0, math.radians(5.0))
    key_rot("leg.L", mid, math.radians(-15.0), 0.0, 0.0)
    key_rot("leg.R", mid, math.radians(-12.0), 0.0, 0.0)

    # 帧 38.4（1600ms）：完全倒地——前倾 78°、下沉 sink_units、肢体松垂
    # 注意：骨骼局部 Y 轴沿骨骼自身方向（root 由脚底向上），所以「下沉」写 index 1；
    # 写 index 2 会变成沿局部 Z 前后平移，表现为整体悬空前移（已修正一次）。
    key_rot("root", TOTAL_FRAMES, tilt, 0.0, 0.0)
    key_loc("root", TOTAL_FRAMES, -sink_units, 1)
    key_rot("body", TOTAL_FRAMES, math.radians(14.0), 0.0, 0.0)
    key_rot("head", TOTAL_FRAMES, math.radians(26.0), 0.0, 0.0)
    key_rot("arm.L", TOTAL_FRAMES, 0.0, 0.0, math.radians(2.0))
    key_rot("arm.R", TOTAL_FRAMES, 0.0, 0.0, math.radians(-2.0))
    key_rot("leg.L", TOTAL_FRAMES, math.radians(-8.0), 0.0, 0.0)
    key_rot("leg.R", TOTAL_FRAMES, math.radians(-6.0), 0.0, 0.0)
    key_rot("foot.L", TOTAL_FRAMES, math.radians(12.0), 0.0, 0.0)
    key_rot("foot.R", TOTAL_FRAMES, math.radians(10.0), 0.0, 0.0)

    # Blender 4.4+ / 5.x 使用 layered Action（无 .fcurves），按版本兼容统计通道数
    n_channels = 0
    try:
        n_channels = len(action.fcurves)          # 旧 API
        api = "legacy-fcurves"
    except AttributeError:
        try:
            for layer in action.layers:           # 新 API
                for strip in layer.strips:
                    for cb in getattr(strip, "channelbags", []):
                        n_channels += len(cb.fcurves)
            api = "layered-channelbags"
        except Exception:
            api = "unknown"
    log("death action 创建完成：帧 0..%s（目标 %dms @ %dfps），通道数=%d（API=%s），sink=%.4f"
        % (TOTAL_FRAMES, DEATH_TOTAL_MS, FRAME_RATE, n_channels, api, sink_units))
    return action


def measure_world_z(armature):
    """在 death 末帧测量**蒙皮网格**的世界包围盒（最低点 / 最高点）。

    只统计带 Armature 修改器且指向本骨架的 mesh：r7 资产里混有与本角色无关的
    遗留对象（如无蒙皮的 42 顶点 ``Icosphere``，包围盒固定 -1..1），
    把它算进来会让贴地求解完全失真。
    """
    scene = bpy.context.scene
    scene.frame_set(int(TOTAL_FRAMES), subframe=TOTAL_FRAMES - int(TOTAL_FRAMES))
    deps = bpy.context.evaluated_depsgraph_get()
    lo, hi = None, None
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        if not any(m.type == "ARMATURE" and m.object == armature for m in obj.modifiers):
            continue
        ev = obj.evaluated_get(deps)
        try:
            mesh = ev.to_mesh()
        except Exception:
            continue
        mw = ev.matrix_world
        for v in mesh.vertices:
            z = (mw @ v.co).z
            lo = z if lo is None else min(lo, z)
            hi = z if hi is None else max(hi, z)
        ev.to_mesh_clear()
    return lo, hi


def fit_sink(armature):
    """线性求解让 death 末帧最低点贴地（minZ≈0）的沉降量。

    先用 sink=0 与 sink=SINK_PROBE[1] 各建一次 action 测最低点，得 z(s) = a + b*s，
    再取 s = -a/b。root 骨局部 Y 近似世界 +Z，关系基本线性，一次求解足够；
    求解后再实测一次，偏差超 GROUND_TOL 则按残差补偿一次。
    """
    samples = []
    for s in SINK_PROBE:
        build_death_action(armature, s)
        lo, hi = measure_world_z(armature)
        samples.append((s, lo))
        log("贴地采样：sink=%.2f → minZ=%s maxZ=%s" % (s, _fmt(lo), _fmt(hi)))
    (s0, z0), (s1, z1) = samples
    if z0 is None or z1 is None or abs(s1 - s0) < 1e-9:
        log("!! 贴地采样失败，回退固定 sink=%.2f" % SINK_UNITS)
        build_death_action(armature, SINK_UNITS)
        return SINK_UNITS, None
    slope = (z1 - z0) / (s1 - s0)
    if abs(slope) < 1e-9:
        log("!! 沉降对包围盒无影响（斜率≈0），无法自动贴地，回退 sink=%.2f" % SINK_UNITS)
        build_death_action(armature, SINK_UNITS)
        lo, hi = measure_world_z(armature)
        return SINK_UNITS, (lo, hi)
    sink = -z0 / slope
    sink = max(SINK_CLAMP[0], min(SINK_CLAMP[1], sink))
    log("贴地求解：z0=%.4f z1=%.4f 斜率=%.4f → sink=%.4f" % (z0, z1, slope, sink))
    build_death_action(armature, sink)
    lo, hi = measure_world_z(armature)
    # 残差补偿一次（避免骨骼轴不完全平行世界 Z）
    if lo is not None and abs(lo) > GROUND_TOL and abs(slope) > 1e-9:
        sink2 = max(SINK_CLAMP[0], min(SINK_CLAMP[1], sink - lo / slope))
        log("残差 %.4f 超差，补偿 sink %.4f → %.4f" % (lo, sink, sink2))
        sink = sink2
        build_death_action(armature, sink)
        lo, hi = measure_world_z(armature)
    log("贴地结果：sink=%.4f → minZ=%s maxZ=%s（容差 ±%.2f）"
        % (sink, _fmt(lo), _fmt(hi), GROUND_TOL))
    return sink, (lo, hi)


def _fmt(v):
    return "None" if v is None else "%.4f" % v


def add_weapon_bone(armature):
    """新增 weapon.R 骨，父级 hand.R；并挂一个空物体保证导出时节点不被丢弃。"""
    if WEAPON_BONE in armature.data.bones:
        log("weapon.R 已存在，跳过创建")
        return False
    prev_mode = bpy.context.object.mode if bpy.context.object else "OBJECT"
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    eb = armature.data.edit_bones
    parent = eb.get(PARENT_BONE)
    if parent is None:
        bpy.ops.object.mode_set(mode="OBJECT")
        log("!! 未找到父骨 %s，无法创建 %s" % (PARENT_BONE, WEAPON_BONE))
        return False
    new_bone = eb.new(WEAPON_BONE)
    new_bone.parent = parent
    # 相对 hand.R：沿手的前方伸出约 0.12 单位（Blender 单位，模型约 1.8 高）
    new_bone.head = parent.tail
    new_bone.tail = (parent.tail[0], parent.tail[1] + 0.12, parent.tail[2])
    bpy.ops.object.mode_set(mode="OBJECT")
    log("已创建骨骼 %s（父=%s，head=%s）" % (WEAPON_BONE, PARENT_BONE,
                                          tuple(round(v, 4) for v in new_bone.head)))
    try:
        bpy.ops.object.mode_set(mode=prev_mode)
    except Exception:
        pass
    return True


def export_glb(path):
    bpy.context.scene.render.fps = FRAME_RATE
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = max(TOTAL_FRAMES, 60)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        export_force_sampling=True,
        export_frame_range=False,
        export_yup=True,
        export_image_format="AUTO",
    )


def save_blend(hero, armature):
    """把当前场景存成可再次打开、可再次编辑的 .blend 源工程。

    GLB 是给引擎用的二进制产物，.blend 才是美术能接着改的工程文件：
    里面保留 Armature、全部 Action（含 death）、NLA 轨道与 weapon.R 骨。
    导出前为了只走 NLA 曾把激活 action 置空，这里恢复成 death，方便打开即编辑。
    """
    os.makedirs(R8_SRC_DIR, exist_ok=True)
    out = os.path.join(R8_SRC_DIR, hero + ".blend")
    if os.path.isfile(out):
        os.remove(out)
    death = bpy.data.actions.get(DEATH_CLIP)
    if death is not None and armature.animation_data is not None:
        armature.animation_data.action = death
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    if not os.path.isfile(out):
        raise RuntimeError("保存源工程失败：%s" % out)
    log("已保存源工程：%s（%d 字节）" % (os.path.relpath(out, ROOT), os.path.getsize(out)))
    return out


def build_one(hero, sink=None, log_path=None):
    """对一个角色跑完整流程，返回报告 dict；失败抛 RuntimeError。"""
    LOG.clear()
    src, out_dir, out_glb = paths_for(hero)
    log("=== %s ===" % hero)
    log("SHUIHU build_r8_death.py 启动")
    log("源（只读）: %s" % os.path.relpath(src, ROOT))
    log("目标: %s" % os.path.relpath(out_glb, ROOT))
    if not os.path.isfile(src):
        raise RuntimeError("源 GLB 不存在：%s" % src)

    src_size = os.path.getsize(src)
    clear_scene()
    objects = import_glb(src)
    log("导入对象数=%d：%s" % (len(objects), [o.name for o in objects]))

    armature = find_armature(objects)
    if armature is None:
        raise RuntimeError("未找到 Armature")

    dump_diagnostics(armature)
    log("导入后 Action 列表：%s" % sorted(a.name for a in bpy.data.actions))

    ensure_nla(armature)

    if sink is None:
        log("沉降模式：自动贴地（按该角色包围盒求解）")
        sink_used, ground = fit_sink(armature)
        sink_mode = "auto-ground-fit"
    else:
        log("沉降模式：固定 %.4f" % sink)
        build_death_action(armature, sink)
        ground = measure_world_z(armature)
        sink_used = sink
        sink_mode = "fixed"

    # death 也进 NLA，保证与既有 clip 一并导出
    tracks = {t.name for t in armature.animation_data.nla_tracks}
    if DEATH_CLIP not in tracks:
        track = armature.animation_data.nla_tracks.new()
        track.name = DEATH_CLIP
        strip = track.strips.new(DEATH_CLIP, 1, bpy.data.actions[DEATH_CLIP])
        strip.frame_start = 1
        strip.frame_end = 1 + TOTAL_FRAMES
    # 导出只走 NLA：清掉激活 action，避免与 NLA 叠加导致动作被混合
    armature.animation_data.action = None
    log("已清空激活 action，导出仅依赖 NLA 轨道：%s"
        % [t.name for t in armature.animation_data.nla_tracks])
    added = add_weapon_bone(armature)
    log("武器挂点骨创建结果：%s" % added)

    os.makedirs(out_dir, exist_ok=True)
    export_glb(out_glb)

    # 保存源工程：导出时清空了激活 action（只走 NLA），这里恢复成 death，
    # 使 .blend 打开后能直接在 Dope Sheet / Action Editor 里继续编辑死亡片段。
    out_blend = save_blend(hero, armature)
    out_blend_size = os.path.getsize(out_blend) if os.path.isfile(out_blend) else -1

    out_size = os.path.getsize(out_glb) if os.path.isfile(out_glb) else -1
    log("=== 导出完成 ===")
    log("r7 %s.glb 字节=%d（未改动）" % (hero, src_size))
    log("r8 %s.glb 字节=%d" % (hero, out_size))
    log("r8 源工程 %s 字节=%d" % (os.path.relpath(out_blend, ROOT), out_blend_size))
    log("导出后 Action 列表：%s" % sorted(a.name for a in bpy.data.actions))
    log("骨骼全表：%s" % [b.name for b in armature.data.bones])

    report = {
        "hero": hero,
        "source": os.path.relpath(src, ROOT),
        "source_bytes": src_size,
        "output": os.path.relpath(out_glb, ROOT),
        "output_bytes": out_size,
        "blend_source": os.path.relpath(out_blend, ROOT),
        "blend_bytes": out_blend_size,
        "death_clip_ms": DEATH_TOTAL_MS,
        "frame_rate": FRAME_RATE,
        "total_frames": TOTAL_FRAMES,
        "impact_frame": IMPACT_FRAME,
        "sink_mode": sink_mode,
        "sink_units": round(sink_used, 4),
        "ground_min_z": None if ground[0] is None else round(ground[0], 4),
        "ground_max_z": None if ground[1] is None else round(ground[1], 4),
        "tilt_deg": TILT_DEG,
        "weapon_bone": WEAPON_BONE if added else None,
        "parent_bone": PARENT_BONE,
        "actions": sorted(a.name for a in bpy.data.actions),
        "bones": [b.name for b in armature.data.bones],
        "log": list(LOG),
    }
    if log_path:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
    return report


def cli_args():
    argv = sys.argv
    if "--" in argv:
        return argv[argv.index("--") + 1:]
    return []


def main():
    ap = argparse.ArgumentParser(prog="build_r8_death.py")
    ap.add_argument("--hero", default=DEFAULT_HERO, help="单个角色 id，如 hero002")
    ap.add_argument("--heroes", default="", help="逗号分隔的批量角色 id")
    ap.add_argument("--sink", type=float, default=None,
                    help="固定沉降量；不给则按包围盒自动贴地")
    ap.add_argument("--batch-log", default="", help="批量汇总 JSON 输出路径（相对仓库根）")
    args = ap.parse_args(cli_args())

    heroes = [h.strip() for h in args.heroes.split(",") if h.strip()] or [args.hero]
    # 默认自动贴地（按该角色包围盒求解）；要精确复现 ACT-005 的旧数值请显式 --sink 0.1
    sink = args.sink
    print("沉降模式：%s" % ("固定 %.3f" % sink if sink is not None else "自动贴地"))

    reports, failures = [], []
    for hero in heroes:
        log_path = os.path.join(R8_DIR, "build_log.json" if hero == DEFAULT_HERO
                                else "build_log_%s.json" % hero)
        try:
            rep = build_one(hero, sink=sink, log_path=log_path)
            reports.append(rep)
            print("OK %s → %s（%d bytes，sink=%.3f，minZ=%s）"
                  % (hero, rep["output"], rep["output_bytes"], rep["sink_units"],
                     rep["ground_min_z"]))
        except Exception as exc:                     # noqa: BLE001
            failures.append({"hero": hero, "error": str(exc)})
            print("FAIL %s：%s" % (hero, exc))

    if args.batch_log and len(heroes) > 1:
        out = args.batch_log if os.path.isabs(args.batch_log) else os.path.join(ROOT, args.batch_log)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump({
                "schema": "act006-r8-batch-build/1",
                "generator": "tools/motion/build_r8_death.py",
                "hero_count": len(heroes),
                "ok_count": len(reports),
                "fail_count": len(failures),
                "sink_mode": "auto-ground-fit" if sink is None else "fixed",
                "reports": reports,
                "failures": failures,
            }, f, ensure_ascii=False, indent=1)
        print("批量汇总：%s" % os.path.relpath(out, ROOT))

    print("\n合计 %d 个角色，成功 %d，失败 %d" % (len(heroes), len(reports), len(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
