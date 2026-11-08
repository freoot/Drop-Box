#!/usr/bin/env python3
"""CMD-014 · 动作工作包：Q 版猛虎资产（r11）。

背景
----
之前战斗里的「虎」是 Godot 侧用 11 个方块拼的占位物，远景看就是一只方块箱子。
本脚本做**真实虎资产**：Blender 分件建模 + 骨骼 + 4 条动作，
沿用 r6 build_samples.py 的造型语言（ball/rod/plate/curve 分件 + 顶点组绑骨）。

产物
----
  assets/releases/ART-002/r11/models/tiger.glb        # Godot runtime
  assets/releases/ART-002/r11/source/tiger.blend      # 可编辑源工程
  assets/releases/ART-002/r11/tiger_manifest.json     # 清单

造型要点（Q 版猛虎，可辨识特征）
  · 宽额虎头 + 王字额纹 + 圆耳 + 白吻白胸
  · 四肢粗壮（虎是扑击型，前腿更粗）
  · 环尾（虎尾有环纹，是和狮尾的关键区别）
  · 躯干条纹（黑褐斑纹，非纯色）
  · 高度与武松 r10 对齐（武松 2.145 单位 → 虎肩高约 1.05，站立总高约 1.35）

动作
  idle   呼吸起伏（48 帧）
  walk   四足交替（25 帧）
  pounce 蓄力下蹲 → 腾空前扑 → 落地（33 帧，虎影扑击用这条）
  hit    受击后仰（25 帧）
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "assets/releases/ART-002/r11")
OUT_MODEL_DIR = os.path.join(OUT_DIR, "models")
OUT_SOURCE_DIR = os.path.join(OUT_DIR, "source")
FPS = 24

# 骨架：与 r6 英雄同风格（root/body/head + 四肢 + 尾）
# 骨架（Q 版虎：腿短但躯干高，整体像「猫科蹲踞」而非「爬行」）
BONES = {
    "root":  ((0, 0, 0), (0, 0, 0.30), None),
    "body":  ((0, 0, 0.30), (0, 0, 0.72), "root"),
    "head":  ((0, 0, 0.72), (0, 0, 1.02), "body"),
    "arm.L": ((-0.23, 0.12, 0.66), (-0.25, 0.12, 0.34), "body"),
    "hand.L": ((-0.25, 0.12, 0.34), (-0.26, 0.12, 0.08), "arm.L"),
    "arm.R": ((0.23, 0.12, 0.66), (0.25, 0.12, 0.34), "body"),
    "hand.R": ((0.25, 0.12, 0.34), (0.26, 0.12, 0.08), "arm.R"),
    "leg.L": ((-0.20, -0.20, 0.66), (-0.21, -0.20, 0.36), "body"),
    "foot.L": ((-0.21, -0.20, 0.36), (-0.21, -0.20, 0.06), "leg.L"),
    "leg.R": ((0.20, -0.20, 0.66), (0.21, -0.20, 0.36), "body"),
    "foot.R": ((0.21, -0.20, 0.36), (0.21, -0.20, 0.06), "leg.R"),
    "tail":  ((0, -0.44, 0.66), (0, -0.72, 0.90), "body"),
}

PALETTE = {
    "fur":     (0.82, 0.50, 0.16),
    "furDark": (0.52, 0.27, 0.08),
    "stripe":  (0.13, 0.09, 0.07),
    "cream":   (0.95, 0.91, 0.80),
    "eye":     (0.95, 0.72, 0.20),
    "nose":    (0.18, 0.10, 0.10),
}


def log(msg):
    print(msg, flush=True)


def material(name, rgb, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    return m


def attach(obj, name, mat, bone=None):
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.data.materials.append(mat)
    if bone:
        g = obj.vertex_groups.new(name=bone)
        g.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    return obj


def ball(name, loc, scale, mat, bone=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in o.data.polygons:
        p.use_smooth = True
    return attach(o, name, mat, bone)


def rod(name, a, b, r, mat, bone=None, r2=None):
    d = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cone_add(
        vertices=12, radius1=r, radius2=r if r2 is None else r2,
        depth=d.length, location=(Vector(a) + Vector(b)) / 2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return attach(o, name, mat, bone)


def box(name, loc, size, mat, bone=None, bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        m = o.modifiers.new("Bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
    return attach(o, name, mat, bone)


def curve(name, pts, r, mat, bone=None):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = r
    data.bevel_resolution = 2
    s = data.splines.new("BEZIER")
    s.bezier_points.add(len(pts) - 1)
    for p, co in zip(s.bezier_points, pts):
        p.co = co
        p.handle_left_type = "AUTO"
        p.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    o.select_set(False)
    return attach(o, name, mat, bone)


def build_rig():
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = "tiger_rig"
    bpy.ops.object.mode_set(mode="EDIT")
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    for name, (a, b, parent) in BONES.items():
        bone = rig.data.edit_bones.new(name)
        bone.head = a
        bone.tail = b
        if parent:
            bone.parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    return rig


def build_body(rig, m):
    """虎身（朝向 -Y，与武松一致；宽额虎头 + 环尾 + 条纹）。"""
    # 躯干：前胸略高，臀略低
    ball("TigerTorso", (0, 0.06, 0.66), (0.30, 0.46, 0.29), m["fur"], "body")
    ball("TigerChest", (0, -0.20, 0.64), (0.30, 0.24, 0.30), m["fur"], "body")
    ball("TigerBelly", (0, 0.10, 0.46), (0.27, 0.38, 0.22), m["cream"], "body")
    # 颈
    rod("TigerNeck", (0, -0.30, 0.70), (0, -0.44, 0.92), 0.19, m["fur"], "body")

    # 头：宽额、方吻
    ball("TigerHead", (0, -0.50, 0.98), (0.25, 0.24, 0.24), m["fur"], "head")
    ball("TigerBrow", (0, -0.60, 1.06), (0.27, 0.16, 0.15), m["fur"], "head")
    ball("TigerMuzzle", (0, -0.66, 0.88), (0.15, 0.14, 0.12), m["cream"], "head")
    ball("TigerNose", (0, -0.76, 0.90), (0.055, 0.045, 0.045), m["nose"], "head")
    # 圆耳
    ball("TigerEarL", (-0.15, -0.48, 1.17), (0.07, 0.04, 0.08), m["fur"], "head")
    ball("TigerEarR", (0.15, -0.48, 1.17), (0.07, 0.04, 0.08), m["fur"], "head")
    ball("TigerEarIL", (-0.15, -0.48, 1.17), (0.045, 0.025, 0.055), m["cream"], "head")
    ball("TigerEarIR", (0.15, -0.48, 1.17), (0.045, 0.025, 0.055), m["cream"], "head")
    # 眼
    ball("TigerEyeL", (-0.11, -0.66, 1.04), (0.05, 0.03, 0.045), m["eye"], "head")
    ball("TigerEyeR", (0.11, -0.66, 1.04), (0.05, 0.03, 0.045), m["eye"], "head")
    ball("TigerPupilL", (-0.11, -0.685, 1.04), (0.022, 0.015, 0.03), m["stripe"], "head")
    ball("TigerPupilR", (0.11, -0.685, 1.04), (0.022, 0.015, 0.03), m["stripe"], "head")
    # 王字额纹（三横一竖），虎的标志性特征
    for i, z in enumerate((1.14, 1.095, 1.05)):
        box("TigerBrowMark%d" % i, (0, -0.70 - i * 0.004, z),
            (0.17, 0.02, 0.022), m["stripe"], "head")
    box("TigerBrowStem", (0, -0.706, 1.095), (0.022, 0.02, 0.11), m["stripe"], "head")
    # 白颊毛
    for sx in (-1, 1):
        curve("TigerWhisker%d" % sx,
              [(sx * 0.13, -0.72, 0.92), (sx * 0.30, -0.80, 0.94),
               (sx * 0.42, -0.84, 0.97)], 0.014, m["cream"], "head")

    # 四肢：前腿粗壮（扑击型），后腿带股
    for side, sx in (("L", -1), ("R", 1)):
        ball("TigerShoulder%s" % side, (sx * 0.235, -0.14, 0.68),
             (0.115, 0.13, 0.14), m["fur"], "arm." + side)
        rod("TigerForeLeg%s" % side, (sx * 0.24, 0.12, 0.62),
            (sx * 0.25, 0.12, 0.30), 0.085, m["fur"], "arm." + side)
        ball("TigerForePaw%s" % side, (sx * 0.25, 0.12, 0.13),
             (0.105, 0.115, 0.075), m["cream"], "hand." + side)
        ball("TigerHaunch%s" % side, (sx * 0.21, 0.22, 0.64),
             (0.125, 0.16, 0.16), m["fur"], "leg." + side)
        rod("TigerHindLeg%s" % side, (sx * 0.20, -0.20, 0.64),
            (sx * 0.20, -0.20, 0.28), 0.095, m["fur"], "leg." + side)
        ball("TigerHindPaw%s" % side, (sx * 0.20, -0.20, 0.10),
             (0.11, 0.13, 0.07), m["cream"], "foot." + side)

    # 环尾（虎尾有环纹，与狮尾区分）
    tail_pts = [(0, -0.42, 0.66), (0, -0.64, 0.82), (0.03, -0.82, 0.96),
                (0.10, -0.94, 1.04)]
    curve("TigerTail", tail_pts, 0.055, m["fur"], "tail")
    for i, (t, pt) in enumerate(zip((0.18, 0.40, 0.62, 0.82), tail_pts)):
        band = ball("TigerTailRing%d" % i, pt, (0.062, 0.062, 0.062), m["stripe"], "tail")
        band.scale = (0.062, 0.062, 0.062)

    # 躯干条纹（虎的关键特征）
    for i in range(5):
        y = 0.26 - i * 0.16
        for sx in (-1, 1):
            box("TigerStripeB%d%d" % (i, sx > 0),
                (sx * 0.285, y, 0.74 - i * 0.02),
                (0.02, 0.055, 0.20), m["stripe"], "body")
    for sx in (-1, 1):
        for i in range(3):
            box("TigerStripeN%d%d" % (i, sx > 0),
                (sx * 0.16, -0.40 + i * 0.05, 0.86 - i * 0.05),
                (0.13, 0.02, 0.022), m["stripe"], "body")
    # 肩部白斑
    for sx in (-1, 1):
        ball("TigerShoulderSpot%s" % sx, (sx * 0.24, -0.10, 0.73),
             (0.055, 0.075, 0.07), m["cream"], "body")


def make_clip(rig, clip, frames, pose_fn, root_drop_fn=None):
    """K 一条动作。

    root_drop_fn（可选，CMD-016 加）：返回额外的**根骨下沉量**（世界单位，通常为负）。
    贴地修正只保证「最低的爪底踩在 z=0」；像「趴伏/倒地」这种要把身子压到地面的动作，
    光折腿不够——身体高度得自己降下去。默认 None = 行为与旧版完全一致。
    """
    rig.animation_data_create()
    rig.animation_data.action = None
    action = bpy.data.actions.new(clip)
    slot = action.slots.new(id_type="OBJECT", name=rig.name)
    rig.animation_data.action = action
    rig.animation_data.action_slot = slot

    contacts = []
    for f in range(1, frames + 1):
        t = (f - 1) / (frames - 1)
        for b in rig.pose.bones:
            b.rotation_mode = "XYZ"
            b.rotation_euler = (0, 0, 0)
            b.location = (0, 0, 0)
        pose_fn(rig, t, f)
        bpy.context.view_layer.update()
        # 贴地：把最低的爪底抬到 z=0
        deps = bpy.context.evaluated_depsgraph_get()
        zs = []
        for side in ("L", "R"):
            for part in ("ForePaw", "HindPaw"):
                o = bpy.data.objects.get("Tiger%s%s" % (part, side))
                if o is None:
                    continue
                ev = o.evaluated_get(deps)
                me = ev.to_mesh()
                if len(me.vertices):
                    zs.append(min((ev.matrix_world @ v.co).z for v in me.vertices))
                ev.to_mesh_clear()
        lift = -min(zs) if zs else 0.0
        rig.pose.bones["root"].location.z = lift
        if root_drop_fn is not None:
            rig.pose.bones["root"].location.z += root_drop_fn(t)
        for b in rig.pose.bones:
            b.keyframe_insert("rotation_euler", frame=f)
            b.keyframe_insert("location", frame=f)
        if f in (1, frames // 2, frames):
            contacts.append({"frame": f, "sole_min_z": round(min(zs) + lift, 5),
                             "root_correction": round(lift, 5)})

    action.name = clip
    action.use_fake_user = True
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    strip.action_slot = slot
    track.mute = True
    rig.animation_data.action = None
    return action, contacts


def pose_idle(rig, t, f):
    s = math.sin(t * math.tau)
    rig.pose.bones["body"].rotation_euler.x = 0.02 * s
    rig.pose.bones["head"].rotation_euler.x = -0.03 * s
    rig.pose.bones["tail"].rotation_euler.y = 0.16 * s
    for side, sg in (("L", 1), ("R", -1)):
        rig.pose.bones["arm." + side].rotation_euler.x = 0.02 * s * sg
        rig.pose.bones["leg." + side].rotation_euler.x = -0.02 * s * sg


def pose_walk(rig, t, f):
    s = math.sin(t * math.tau)
    for side, sg in (("L", 1), ("R", -1)):
        rig.pose.bones["arm." + side].rotation_euler.x = 0.34 * s * sg
        rig.pose.bones["leg." + side].rotation_euler.x = -0.34 * s * sg
        rig.pose.bones["foot." + side].rotation_euler.x = 0.16 * max(0, s * sg)
    rig.pose.bones["body"].rotation_euler.y = 0.04 * s
    rig.pose.bones["head"].rotation_euler.y = -0.05 * s
    rig.pose.bones["tail"].rotation_euler.y = 0.22 * s


def pose_pounce(rig, t, f):
    """蓄力下蹲 → 腾空前扑 → 落地。虎影扑击用这条。"""
    if t < 0.30:          # 蓄力：后蹲、头低
        a = math.sin(t / 0.30 * math.pi / 2)
        rig.pose.bones["body"].rotation_euler.x = -0.22 * a
        rig.pose.bones["head"].rotation_euler.x = -0.18 * a
        rig.pose.bones["arm.L"].rotation_euler.x = 0.30 * a
        rig.pose.bones["arm.R"].rotation_euler.x = 0.30 * a
        rig.pose.bones["leg.L"].rotation_euler.x = -0.30 * a
        rig.pose.bones["leg.R"].rotation_euler.x = -0.30 * a
        rig.pose.bones["tail"].rotation_euler.x = 0.30 * a
    elif t < 0.52:        # 腾空：前扑、腿伸展
        a = (t - 0.30) / 0.22
        rig.pose.bones["body"].rotation_euler.x = -0.22 + 0.62 * a
        rig.pose.bones["head"].rotation_euler.x = -0.18 + 0.34 * a
        rig.pose.bones["arm.L"].rotation_euler.x = 0.30 - 0.55 * a
        rig.pose.bones["arm.R"].rotation_euler.x = 0.30 - 0.55 * a
        rig.pose.bones["leg.L"].rotation_euler.x = -0.30 + 0.62 * a
        rig.pose.bones["leg.R"].rotation_euler.x = -0.30 + 0.62 * a
        rig.pose.bones["tail"].rotation_euler.x = 0.30 - 0.50 * a
        rig.pose.bones["root"].location.z = 0.22 * math.sin(a * math.pi)
    elif t < 0.66:        # 落地：前肢撑地、身体压低
        a = (t - 0.52) / 0.14
        rig.pose.bones["body"].rotation_euler.x = 0.40 - 0.52 * a
        rig.pose.bones["head"].rotation_euler.x = 0.16 - 0.22 * a
        rig.pose.bones["arm.L"].rotation_euler.x = -0.25 + 0.25 * a
        rig.pose.bones["arm.R"].rotation_euler.x = -0.25 + 0.25 * a
        rig.pose.bones["leg.L"].rotation_euler.x = 0.32 - 0.42 * a
        rig.pose.bones["leg.R"].rotation_euler.x = 0.32 - 0.42 * a
    else:                 # 收势：站起来
        a = (t - 0.66) / 0.34
        rig.pose.bones["body"].rotation_euler.x = -0.12 * (1 - a)
        rig.pose.bones["head"].rotation_euler.x = -0.06 * (1 - a)
        rig.pose.bones["arm.L"].rotation_euler.x = -0.05 * (1 - a)
        rig.pose.bones["arm.R"].rotation_euler.x = -0.05 * (1 - a)
        rig.pose.bones["leg.L"].rotation_euler.x = -0.10 * (1 - a)
        rig.pose.bones["leg.R"].rotation_euler.x = -0.10 * (1 - a)


def pose_hit(rig, t, f):
    a = math.sin(min(1, t / 0.20) * math.pi / 2) * (1 - min(1, max(0, (t - 0.20) / 0.80)))
    rig.pose.bones["body"].rotation_euler.x = -0.26 * a
    rig.pose.bones["head"].rotation_euler.x = -0.22 * a
    for side in ("L", "R"):
        rig.pose.bones["arm." + side].rotation_euler.x = 0.18 * a
        rig.pose.bones["leg." + side].rotation_euler.x = -0.14 * a
    rig.pose.bones["tail"].rotation_euler.x = -0.24 * a


def main():
    os.makedirs(OUT_MODEL_DIR, exist_ok=True)
    os.makedirs(OUT_SOURCE_DIR, exist_ok=True)

    log("=== 清空场景 ===")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start = 1

    log("=== 建骨架 ===")
    rig = build_rig()

    log("=== 建虎身 ===")
    m = {k: material(k, v) for k, v in PALETTE.items()}
    build_body(rig, m)

    log("=== K 帧 ===")
    clips = {}
    for name, frames, fn in (
        ("idle", 48, pose_idle),
        ("walk", 25, pose_walk),
        ("pounce", 33, pose_pounce),
        ("hit", 25, pose_hit),
    ):
        action, contacts = make_clip(rig, name, frames, fn)
        clips[name] = {"frames": frames, "contacts": contacts}
        log("  %s 完成（%d 帧）" % (name, frames))

    for b in rig.pose.bones:
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
    sc.frame_set(1)

    glb_path = os.path.join(OUT_MODEL_DIR, "tiger.glb")
    log("=== 导出 GLB → %s ===" % glb_path)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    bpy.ops.export_scene.gltf(
        filepath=glb_path, export_format="GLB", use_selection=False,
        export_animations=True, export_nla_strips=True, export_apply=True,
    )
    log("GLB 字节 %d" % os.path.getsize(glb_path))

    blend_path = os.path.join(OUT_SOURCE_DIR, "tiger.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    log("源工程字节 %d" % os.path.getsize(blend_path))

    manifest = {
        "schema": "cmd014-tiger-r11/1",
        "output_glb": os.path.relpath(glb_path, ROOT),
        "output_blend": os.path.relpath(blend_path, ROOT),
        "glb_bytes": os.path.getsize(glb_path),
        "blend_bytes": os.path.getsize(blend_path),
        "fps": FPS,
        "bones": list(BONES),
        "clips": clips,
        "height_units": 1.35,
        "note": "Q 版猛虎：宽额王字纹 + 圆耳 + 环尾 + 躯干条纹；与武松 r10 同为原创分件几何",
        "animal_representation": "procedural-blender-parts（原创分件，非下载素材）",
    }
    mpath = os.path.join(OUT_DIR, "tiger_manifest.json")
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("清单 → %s" % mpath)
    log("DONE_TIGER_R11")


if __name__ == "__main__":
    main()
