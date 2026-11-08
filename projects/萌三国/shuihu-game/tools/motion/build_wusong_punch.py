#!/usr/bin/env python3
"""CMD-014 · 动作工作包：从真实武松 Blender 源另存新版本，制作无刀拳击与虎影重击。

背景
----
r6 的 wusong 是「双戒刀」造型：双刀几何已经并进角色网格
（wusong_costume_and_body，10536 顶点，71 个连通分量），
战斗里却被当成「出拳」用——回复里说"出拳"实际是挥双刀，不成立。

本脚本做三件事：
  1. 从真实源工程 assets/releases/ART-002/r6/source/wusong.blend 出发，
     另存新版本 r10/wusong.glb + r10/source/wusong.blend（**r6 原件不动**）
  2. 去掉双戒刀几何（无刀），新增两条拳击动作：
       punch        — 蓄力直拳（普攻）
       tiger_shadow — 虎影重击（重拳 + 虎影从身侧扑出的准备姿势）
  3. 导出 GLB，交 Godot 接入

判据说明
--------
刀的几何特征（实测 r6 源工程）：
  刀刃 200 顶点，x∈[0.540,0.605] / z∈[0.980,1.582]，绑 hand.R
  护手 24 顶点，x∈[0.494,0.566] / z∈[0.720,0.960]，绑 hand.R
  刀背  5 顶点，x∈[0.500,0.600] / z∈[0.960,1.580]，绑 hand.R
手本身（不删）：
  手 222 顶点，x∈[0.370,0.570] / z∈[0.795,0.905]  （Cuff）
  手 222 顶点，x∈[0.425,0.575] / z∈[0.670,0.850]  （Hand）
所以用「z 上限」区分：z > 0.93 且绑定 hand.* 的分量 = 刀。
但护手 z 从 0.72 起（低于 0.93），改用 x 判据：
  刀刃/刀背 x 偏移量与手不同——刀在 x≈±0.53，手在 x≈±0.47。
  用「分量所有顶点的 |x| 最小值 > 0.50」来识别刀刃/刀背；
  护手 x∈[0.494,0.566]，|x|min=0.494 略低，用「分量 z 上限 > 0.95 且
  |x|min > 0.49」识别护手。
最终判据（实测验证，见输出）：删掉 z_max > 0.95 且 |x|min > 0.49 的分量。
手部分量的 |x|min ≤ 0.47 或 z_max ≤ 0.905，不受影响。
"""
import bpy
import bmesh
import json
import math
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_BLEND = os.path.join(ROOT, "assets/releases/ART-002/r6/source/wusong.blend")
OUT_DIR = os.path.join(ROOT, "assets/releases/ART-002/r10")
OUT_MODEL_DIR = os.path.join(OUT_DIR, "models")
OUT_SOURCE_DIR = os.path.join(OUT_DIR, "source")

MESH_NAME = "wusong_costume_and_body"
RIG_NAME = "wusong_rig"
FPS = 24

# 刀判据（实测 r6 源工程，逐分量核对）
#   刀件 8 个分量，zmax ≥ 0.960：刃(200) 背(5) 护手(24) 握柄(24)，左右各一套
#   手件 4 个分量，zmax ≤ 0.905：腕环(222) 手(222)，左右各一套
#   → 用 zmax > 0.92 精确切分，左右对称，不依赖 x 判据
#   （早先用 xmin>0.49 判据，左右不对称：左手刀件 x 更靠内，会漏删）
BLADE_ZMAX_MIN = 0.92


def log(msg):
    print(msg, flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {}
    i = 0
    while i < len(argv):
        if argv[i].startswith("--"):
            key = argv[i][2:].replace("-", "_")
            if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                out[key] = argv[i + 1]
                i += 2
            else:
                out[key] = True
                i += 1
        else:
            i += 1
    return out


# ------------------------------------------------------------------ 网格拆分

def components(mesh):
    """按顶点索引做连通分量，返回顶点索引列表的列表。"""
    adj = defaultdict(list)
    for e in mesh.edges:
        a = e.vertices[0]
        b = e.vertices[1]
        adj[a].append(b)
        adj[b].append(a)
    seen = set()
    comps = []
    for v in mesh.vertices:
        vi = v.index
        if vi in seen:
            continue
        stack = [vi]
        seen.add(vi)
        comp = []
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for nb in adj[cur]:
                if nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
        comps.append(comp)
    return comps


def split_blade(body):
    """把刀几何从角色网格里分出去。

    返回 (kept_index_set, blade_index_set, report)
    刀分离成独立对象 wusong_monkblades（绑 hand.L/hand.R），
    角色网格只剩身体。新版本默认不导出刀对象 → 表现为「无刀」。
    """
    mesh = body.data
    group_name = {}
    for g in body.vertex_groups:
        group_name[g.index] = g.name

    vert_groups = []
    for v in mesh.vertices:
        names = set()
        for g in v.groups:
            if g.group in group_name:
                names.add(group_name[g.group])
        vert_groups.append(names)

    comps = components(mesh)
    blade_idx = []
    kept_idx = []
    report = []
    for comp in comps:
        xs = [mesh.vertices[i].co.x for i in comp]
        zs = [mesh.vertices[i].co.z for i in comp]
        gs = set()
        for i in comp:
            gs |= vert_groups[i]
        is_hand = bool(gs & {"hand.L", "hand.R"})
        zmax = max(zs)
        is_blade = is_hand and zmax > BLADE_ZMAX_MIN
        rec = {
            "verts": len(comp),
            "x": [round(min(xs), 3), round(max(xs), 3)],
            "z": [round(min(zs), 3), round(max(zs), 3)],
            "groups": sorted(gs),
            "is_blade": is_blade,
        }
        report.append(rec)
        if is_blade:
            blade_idx.extend(comp)
        else:
            kept_idx.extend(comp)

    kept = set(kept_idx)
    blade = set(blade_idx)

    # --- 从原网格删掉刀顶点（bmesh from_mesh 的索引与原网格一致，
    #     所以先记下索引再删）---
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()

    # 按原索引建映射：bm.verts 的顺序来自 mesh，故原索引可用
    to_del = [bm.verts[i] for i in sorted(blade) if i < len(bm.verts)]
    bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    # --- 刀另建对象 ---
    blade_obj = None
    if blade:
        blade_obj = bpy.data.objects.new("wusong_monkblades", bpy.data.meshes.new("wusong_monkblades"))
        bpy.context.collection.objects.link(blade_obj)
        bm2 = bmesh.new()
        bm2.from_mesh(mesh)
        bm2.verts.ensure_lookup_table()
        # 原网格已经被删过刀了，这里改从备份重建刀对象
        bm2.free()
        blade_obj = None

    return kept, blade, report


def build_blade_object_from_source(body, blade_indices):
    """在**原始**网格数据上单独生成刀对象（需要未删改的源网格）。"""
    src_mesh = body.data
    bm = bmesh.new()
    bm.from_mesh(src_mesh)
    bm.verts.ensure_lookup_table()

    keep = sorted(blade_indices)
    vmap = {}
    new_verts = []
    for i in keep:
        nv = bm.verts.new(bm.verts[i].co.copy())
        vmap[bm.verts[i]] = nv
    bm.verts.ensure_lookup_table()

    for e in bm.edges:
        if e.verts[0] in vmap and e.verts[1] in vmap:
            try:
                bm.edges.new((vmap[e.verts[0]], vmap[e.verts[1]]))
            except ValueError:
                pass

    # 材质沿用原网格的第一个材质槽
    mats = [m for m in src_mesh.materials]
    new_mesh = bpy.data.meshes.new("wusong_monkblades")
    bm.to_mesh(new_mesh)
    bm.free()
    for m in mats:
        new_mesh.materials.append(m)

    obj = bpy.data.objects.new("wusong_monkblades", new_mesh)
    bpy.context.collection.objects.link(obj)

    # 顶点组：按原网格的权重重建
    src_vg = {g.index: g.name for g in body.vertex_groups}
    names = set()
    for g in src_vg.values():
        names.add(g)
    for nm in sorted(names):
        obj.vertex_groups.new(name=nm)
    # 逐顶点拷贝权重（用原索引）
    for i in sorted(blade_indices):
        for g in src_mesh.vertices[i].groups:
            if g.group in src_vg:
                obj.vertex_groups[src_vg[g.group]].add([i], g.weight, "REPLACE")
    return obj


# ------------------------------------------------------------------ 动画

def kf(pb, frame):
    pb.keyframe_insert("rotation_euler", frame=frame)
    pb.keyframe_insert("location", frame=frame)


def clear_pose(rig):
    for b in rig.pose.bones:
        b.rotation_mode = "XYZ"
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)


def sole_min_z(rig, frame):
    """该帧下左右鞋底最低点（世界 Z）。"""
    deps = bpy.context.evaluated_depsgraph_get()
    zs = []
    for side in ("L", "R"):
        obj = bpy.data.objects.get("Sole" + side)
        if obj is None:
            continue
        ev = obj.evaluated_get(deps)
        me = ev.to_mesh()
        if len(me.vertices):
            zs.append(min((ev.matrix_world @ v.co).z for v in me.vertices))
        ev.to_mesh_clear()
    return min(zs) if zs else 0.0


def make_clip(rig, clip, frames, pose_fn):
    """生成一条动作。pose_fn(t, frame) 负责摆姿势，返回 True 表示该帧要贴地修正。"""
    rig.animation_data_create()
    rig.animation_data.action = None
    # Blender 5.x：Action 是 layered，绑定 slot 后才能插关键帧
    action = bpy.data.actions.new(clip)
    slot = action.slots.new(id_type="OBJECT", name=rig.name)
    rig.animation_data.action = action
    rig.animation_data.action_slot = slot

    contacts = []
    for f in range(1, frames + 1):
        t = (f - 1) / (frames - 1)
        clear_pose(rig)
        pose_fn(t, f)
        bpy.context.view_layer.update()
        # 贴地修正：把鞋底最低点抬到 z=0
        z = sole_min_z(rig, f)
        rig.pose.bones["root"].location.z = -z
        for b in rig.pose.bones:
            kf(b, f)
        if f in (1, frames // 3, 2 * frames // 3, frames):
            contacts.append({"frame": f, "sole_min_z": round(-z, 5),
                             "root_correction": round(-z, 5)})

    action.name = clip
    action.use_fake_user = True
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    strip.action_slot = slot
    track.mute = True
    rig.animation_data.action = None
    return action, contacts


def pose_punch(t, f):
    """蓄力直拳：右臂后引 → 快速前冲 → 收回。
    无刀，手为空手出拳。"""
    rig = _RIG
    body = rig.pose.bones["body"]
    arm_r = rig.pose.bones["arm.R"]
    arm_l = rig.pose.bones["arm.L"]
    head = rig.pose.bones["head"]

    # 时间轴：0-0.30 蓄力 / 0.30-0.46 冲出 / 0.46-0.62 命中保持 / 0.62-1 收回
    if t < 0.30:
        a = -0.55 * math.sin(t / 0.30 * math.pi / 2)
    elif t < 0.46:
        a = -0.55 + 1.55 * ((t - 0.30) / 0.16) ** 1.6
    elif t < 0.62:
        a = 1.0
    else:
        a = (1 - (t - 0.62) / 0.38) ** 1.4

    # 右臂前冲：绕 X 负向摆 = 手臂向 -Y 伸出。
    # Blender 正面是 -Y（实测面部顶点 y=-0.342），glTF 导出后 Godot 里正面是 +Z。
    arm_r.rotation_euler.x = -1.05 * a
    arm_r.rotation_euler.y = -0.55 * a
    arm_r.rotation_euler.z = 0.12 * a
    arm_l.rotation_euler.x = -0.35 * a
    arm_l.rotation_euler.y = 0.85 * a
    # 身体转体 + 前压
    body.rotation_euler.y = -0.34 * a
    body.rotation_euler.x = -0.10 * a
    head.rotation_euler.y = 0.16 * a


def pose_tiger_shadow(t, f):
    """虎影重击：沉身蓄力 → 转体蓄势 → 爆发重拳（虎影从身侧扑出）。
    动作幅度比普攻大，为虎影留出起跳空间。"""
    rig = _RIG
    body = rig.pose.bones["body"]
    arm_r = rig.pose.bones["arm.R"]
    arm_l = rig.pose.bones["arm.L"]
    head = rig.pose.bones["head"]

    if t < 0.34:
        a = -0.70 * math.sin(t / 0.34 * math.pi / 2)
    elif t < 0.52:
        a = -0.70 + 2.05 * ((t - 0.34) / 0.18) ** 1.7
    elif t < 0.66:
        a = 1.35
    else:
        a = (1 - (t - 0.66) / 0.34) ** 1.3

    # 右臂大幅后引再甩出（重拳），方向与 punch 一致（正面）
    arm_r.rotation_euler.x = -1.45 * a
    arm_r.rotation_euler.y = -0.85 * a
    arm_r.rotation_euler.z = 0.28 * a
    # 左臂后展（配合虎影从身侧扑出）
    arm_l.rotation_euler.x = -0.55 * a
    arm_l.rotation_euler.y = 0.95 * a
    arm_l.rotation_euler.z = -0.30 * a
    # 沉身 + 大幅转体
    body.rotation_euler.y = -0.52 * a
    body.rotation_euler.x = -0.18 * a
    head.rotation_euler.y = 0.24 * a


_RIG = None


def main():
    global _RIG
    args = parse_args()
    os.makedirs(OUT_MODEL_DIR, exist_ok=True)
    os.makedirs(OUT_SOURCE_DIR, exist_ok=True)

    log("=== 打开真实源工程：%s ===" % SRC_BLEND)
    bpy.ops.wm.open_mainfile(filepath=SRC_BLEND)
    sc = bpy.context.scene
    sc.render.fps = FPS

    body = bpy.data.objects[MESH_NAME]
    rig = bpy.data.objects[RIG_NAME]
    _RIG = rig

    # 1) 先备份原始顶点数据（切刀要用）
    orig_mesh = body.data.copy()
    log("原始网格顶点 %d" % len(orig_mesh.vertices))

    # 2) 分析并切出刀
    group_name = {g.index: g.name for g in body.vertex_groups}
    vert_groups = []
    for v in orig_mesh.vertices:
        names = set()
        for g in v.groups:
            if g.group in group_name:
                names.add(group_name[g.group])
        vert_groups.append(names)

    comps = components(orig_mesh)
    blade_idx = []
    kept_count = 0
    blade_report = []
    for comp in comps:
        xs = [orig_mesh.vertices[i].co.x for i in comp]
        zs = [orig_mesh.vertices[i].co.z for i in comp]
        gs = set()
        for i in comp:
            gs |= vert_groups[i]
        is_hand = bool(gs & {"hand.L", "hand.R"})
        zmax = max(zs)
        is_blade = is_hand and zmax > BLADE_ZMAX_MIN
        blade_report.append({
            "verts": len(comp), "x": [round(min(xs), 3), round(max(xs), 3)],
            "z": [round(min(zs), 3), round(max(zs), 3)],
            "groups": sorted(gs), "is_blade": is_blade,
        })
        if is_blade:
            blade_idx.extend(comp)
        else:
            kept_count += len(comp)

    log("连通分量 %d 个；判为刀的分量顶点 %d，保留 %d"
        % (len(comps), len(blade_idx), kept_count))
    for r in blade_report:
        if r["is_blade"]:
            log("  刀分量 verts=%d x=%s z=%s groups=%s"
                % (r["verts"], r["x"], r["z"], r["groups"]))

    # 3) 角色网格删掉刀
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    to_del = [bm.verts[i] for i in sorted(blade_idx) if i < len(bm.verts)]
    bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    log("删除刀后角色顶点 %d（原 %d）" % (len(body.data.vertices), len(orig_mesh.vertices)))

    # 4) 刀单独建成对象，绑原顶点组，并挂到骨架上
    blade_obj = build_blade_object_from_source_orig(orig_mesh, body, blade_idx)
    if blade_obj:
        blade_obj.parent = rig
        blade_obj.matrix_parent_inverse = rig.matrix_world.inverted()
        mod = blade_obj.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
        log("刀对象 %s：顶点 %d，绑 hand.L/hand.R"
            % (blade_obj.name, len(blade_obj.data.vertices)))

    # 5) 新增两条拳击动作
    log("=== K 帧 punch（无刀直拳）===")
    a1, c1 = make_clip(rig, "punch", 25, pose_punch)
    log("=== K 帧 tiger_shadow（虎影重击）===")
    a2, c2 = make_clip(rig, "tiger_shadow", 33, pose_tiger_shadow)

    # 6) 恢复静止姿势
    clear_pose(rig)
    sc.frame_set(1)

    # 7) 导出 GLB（**不导刀** → 表现为无刀）
    #    glTF 导出器按 bpy.data 里的网格数据块扫描，unlink 场景集合**挡不住**它
    #    （实测：unlink 后导出，wusong_monkblades 仍出现在 GLB 里）。
    #    可靠做法是 use_selection=True + 只选中角色与骨架。
    #    刀对象仍留在 bpy.data 里，存 .blend 时挂回场景，源工程保留可编辑的刀。
    glb_path = os.path.join(OUT_MODEL_DIR, "wusong.glb")
    log("=== 导出 GLB（无刀）→ %s ===" % glb_path)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    if blade_obj:
        blade_obj.select_set(False)
        log("导出只选角色与骨架，刀对象 %s 不导出" % blade_obj.name)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_apply=True,
    )
    log("GLB 字节 %d" % os.path.getsize(glb_path))

    # 8) 另存 .blend 源工程（刀对象挂回场景，保留可编辑性）
    if blade_obj:
        if blade_obj.name not in bpy.context.collection.objects:
            bpy.context.collection.objects.link(blade_obj)
        log("已把刀对象挂回场景，源工程保留双戒刀几何")
    blend_path = os.path.join(OUT_SOURCE_DIR, "wusong.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    log("源工程字节 %d" % os.path.getsize(blend_path))

    manifest = {
        "schema": "cmd014-wusong-punch/1",
        "source_blend": os.path.relpath(SRC_BLEND, ROOT),
        "source_blend_sha_note": "r6 原件未改动",
        "output_blend": os.path.relpath(blend_path, ROOT),
        "output_glb": os.path.relpath(glb_path, ROOT),
        "glb_bytes": os.path.getsize(glb_path),
        "blend_bytes": os.path.getsize(blend_path),
        "fps": FPS,
        "blade_removed_vertices": len(blade_idx),
        "body_vertices_before": len(orig_mesh.vertices),
        "body_vertices_after": len(body.data.vertices),
        "blade_object": blade_obj.name if blade_obj else None,
        "blade_object_vertices": len(blade_obj.data.vertices) if blade_obj else 0,
        "clips": {
            "punch": {"frames": 25, "contacts": c1},
            "tiger_shadow": {"frames": 33, "contacts": c2},
        },
        "existing_clips_kept": ["idle", "walk", "attack", "hit"],
        "note": "attack 是 r6 原有的双刀动作，保留未改；punch/tiger_shadow 是新增的无刀拳击",
        "blade_components": blade_report,
    }
    mpath = os.path.join(OUT_DIR, "wusong_punch_manifest.json")
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("清单 → %s" % mpath)
    log("DONE_WUSONG_PUNCH")


def build_blade_object_from_source_orig(orig_mesh, body, blade_indices):
    """从备份的原始网格生成刀对象（顶点索引与 orig_mesh 一致）。

    不用 bmesh：bmesh.from_mesh 会重建索引表，位置索引与原网格索引对不上。
    直接用 orig_mesh 的顶点/边数据手写新网格，索引完全可控。
    """
    ordered = sorted(blade_indices)
    idx_set = set(ordered)
    new_index = {old: new for new, old in enumerate(ordered)}

    new_mesh = bpy.data.meshes.new("wusong_monkblades")
    new_mesh.from_pydata(
        [tuple(orig_mesh.vertices[i].co) for i in ordered],
        [],
        [[new_index[e.vertices[0]], new_index[e.vertices[1]]]
         for e in orig_mesh.edges
         if e.vertices[0] in idx_set and e.vertices[1] in idx_set],
    )
    new_mesh.update()
    for m in orig_mesh.materials:
        new_mesh.materials.append(m)

    obj = bpy.data.objects.new("wusong_monkblades", new_mesh)
    bpy.context.collection.objects.link(obj)

    src_vg = {g.index: g.name for g in body.vertex_groups}
    for nm in sorted(set(src_vg.values())):
        obj.vertex_groups.new(name=nm)
    for new_i, old_i in enumerate(ordered):
        for g in orig_mesh.vertices[old_i].groups:
            if g.group in src_vg:
                obj.vertex_groups[src_vg[g.group]].add([new_i], g.weight, "REPLACE")
    return obj


if __name__ == "__main__":
    main()
