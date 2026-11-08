#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
attach_weapon.py — 把 hero005 **现有的**可见武器几何真正挂到 weapon.R 骨上

背景（先查再动手）
------------------
hero005 并没有独立的武器对象：全部几何都在一个网格 ``hero005_costume_and_body``
（14409 顶点）里，武器是并进角色网格、蒙皮在 ``hand.R`` 上的。连通分量分析显示
武器由 10 个分量组成（2 个 225 顶点的主体 + 8 个 12 顶点的环，共 558 顶点），
这些顶点 100% 由 ``hand.R`` 驱动，且到 hand.R 骨的距离在 0.26–1.66 之间
（手部本身只有 0.011–0.105，可据此区分）。

因此本脚本**不新建任何几何**，只做两件事：
1. 把这 558 个顶点从角色网格里分离成独立对象 ``hero005_weapon``；
2. 清空它的顶点组，改为 100% 绑到 ``weapon.R``（Armature 修改器指向同一骨架）。

分离前后在静止姿态下的世界坐标必须一致（视觉不变），脚本会逐顶点比对并打印最大偏差。

产物
----
- assets/releases/ART-002/r9/source/hero005.blend    （r8 原样保留）
- assets/releases/ART-002/r9/models/hero005.glb

用法
----
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/attach_weapon.py
退出码：0 = 成功且视觉一致；1 = 校验失败
"""

import json
import os
import sys

import bpy
import bmesh

ROOT = os.environ.get("SHUIHU_PROJECT_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
R8_BLEND = os.path.join(ROOT, "assets/releases/ART-002/r8/source/hero005.blend")
R9_DIR = os.path.join(ROOT, "assets/releases/ART-002/r9")
R9_SRC = os.path.join(R9_DIR, "source")
R9_MODELS = os.path.join(R9_DIR, "models")
REPORT = os.path.join(ROOT, "docs/motion/ACT-008/probe/weapon_attach.json")

BODY_NAME = "hero005_costume_and_body"
WEAPON_NAME = "hero005_weapon"
ARMATURE_NAME = "hero005_rig"
WEAPON_BONE = "weapon.R"
HAND_BONE = "hand.R"
# 手部顶点到 hand.R 骨的最大距离约 0.105；取 0.25 作分界，避免把手套算进武器
HAND_DIST_MAX = 0.25
FRAME_RATE = 24


def log(msg):
    print(msg, flush=True)


def dist_to_bone(co, head, tail):
    ab = tail - head
    t = 0.0 if ab.length_squared == 0 else max(
        0.0, min(1.0, (co - head).dot(ab) / ab.length_squared))
    return (co - (head + ab * t)).length


def island_indices(mesh):
    """返回网格的全部连通分量（顶点索引列表）。"""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    seen = set()
    comps = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        seen.add(v.index)
        comp = []
        while stack:
            cur = stack.pop()
            comp.append(cur.index)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        comps.append(comp)
    bm.free()
    return comps


def dominant_group(obj, vertex):
    best, bw = None, 0.0
    for g in vertex.groups:
        if g.weight > bw:
            bw = g.weight
            best = obj.vertex_groups[g.group].name
    return best, bw


def find_weapon_vertices(obj, arm):
    """按「连通分量整体 100% 由 hand.R 驱动 且 离手较远」识别武器顶点。"""
    hand = arm.data.bones[HAND_BONE]
    head, tail = hand.head_local, hand.tail_local
    picked, detail = set(), []
    for comp in island_indices(obj.data):
        if len(comp) < 4:
            continue
        groups = set()
        wmin = 1.0
        dmin = 1e9
        for i in comp:
            v = obj.data.vertices[i]
            g, w = dominant_group(obj, v)
            groups.add(g)
            wmin = min(wmin, w)
            dmin = min(dmin, dist_to_bone(v.co, head, tail))
        if groups == {HAND_BONE} and wmin > 0.999 and dmin > HAND_DIST_MAX:
            picked.update(comp)
            detail.append({"verts": len(comp), "dist_to_hand_min": round(dmin, 4)})
    return picked, detail


def snapshot_world(obj, deps):
    """求值后网格的世界坐标（分离前用于比对视觉是否变化）。"""
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    mw = ev.matrix_world
    pts = [tuple(mw @ v.co) for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def keep_only(obj, keep):
    """只保留 keep 中的顶点索引，其余删除（保留 UV / 材质 / 顶点组等自定义层）。"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    doomed = [v for v in bm.verts if v.index not in keep]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def main():
    if not os.path.isfile(R8_BLEND):
        log("源工程不存在：%s" % R8_BLEND)
        return 1

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=R8_BLEND)
    scene = bpy.context.scene
    scene.frame_set(0)

    body = bpy.data.objects.get(BODY_NAME)
    arm = bpy.data.objects.get(ARMATURE_NAME)
    if body is None or arm is None:
        log("未找到 %s / %s" % (BODY_NAME, ARMATURE_NAME))
        return 1

    log("=== 分离前 ===")
    log("网格 %s：顶点 %d，顶点组 %d 个"
        % (body.name, len(body.data.vertices), len(body.vertex_groups)))

    weapon_idx, detail = find_weapon_vertices(body, arm)
    log("识别到武器顶点：%d 个，来自 %d 个连通分量" % (len(weapon_idx), len(detail)))
    for d in sorted(detail, key=lambda x: -x["verts"]):
        log("  分量 %3d 顶点，离 hand.R 最近 %.3f" % (d["verts"], d["dist_to_hand_min"]))
    if not weapon_idx:
        log("没有识别到武器顶点，中止")
        return 1

    # 分离前快照（静止姿态世界坐标）；Armature 修改器不改拓扑，索引与原始网格一致
    deps = bpy.context.evaluated_depsgraph_get()
    before_all = snapshot_world(body, deps)
    before_weapon = [before_all[i] for i in sorted(weapon_idx)]

    # ---- 分离：复制对象后各自裁剪顶点，避免依赖编辑模式的选择状态 ----
    weapon = body.copy()
    weapon.data = body.data.copy()
    weapon.name = WEAPON_NAME
    weapon.data.name = WEAPON_NAME + "_mesh"
    body.users_collection[0].objects.link(weapon)

    all_idx = set(range(len(body.data.vertices)))
    keep_only(weapon, weapon_idx)
    keep_only(body, all_idx - weapon_idx)
    log("\n=== 分离后 ===")
    log("角色网格 %s：顶点 %d" % (body.name, len(body.data.vertices)))
    log("武器网格 %s：顶点 %d" % (weapon.name, len(weapon.data.vertices)))
    if len(weapon.data.vertices) != len(weapon_idx):
        log("!! 武器顶点数与识别数不一致：%d vs %d"
            % (len(weapon.data.vertices), len(weapon_idx)))
        return 1

    # ---- 改绑 weapon.R ----
    for vg in list(weapon.vertex_groups):
        weapon.vertex_groups.remove(vg)
    vg = weapon.vertex_groups.new(name=WEAPON_BONE)
    vg.add(list(range(len(weapon.data.vertices))), 1.0, "REPLACE")
    has_mod = False
    for m in weapon.modifiers:
        if m.type == "ARMATURE":
            m.object = arm
            has_mod = True
    if not has_mod:
        m = weapon.modifiers.new("Armature", "ARMATURE")
        m.object = arm
    weapon.parent = arm
    weapon.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    weapon.matrix_world = body.matrix_world.copy()
    log("已绑定：顶点组=%s（权重 1.0），Armature=%s，父级=%s"
        % ([g.name for g in weapon.vertex_groups], arm.name, arm.name))

    # ---- 视觉一致性：静止姿态下，分离前后同一批顶点的世界坐标必须一致 ----
    deps = bpy.context.evaluated_depsgraph_get()
    after_weapon = snapshot_world(weapon, deps)
    after_body = snapshot_world(body, deps)
    if len(after_weapon) != len(before_weapon):
        log("!! 顶点数不一致：分离后 %d，分离前 %d"
            % (len(after_weapon), len(before_weapon)))
        return 1
    max_dev = 0.0
    for p, q in zip(after_weapon, before_weapon):
        d = ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) ** 0.5
        max_dev = max(max_dev, d)
    log("视觉一致性：武器 %d 个顶点分离前后世界坐标最大偏差 %.8f"
        % (len(after_weapon), max_dev))
    log("角色网格剩余顶点：%d（分离前 %d）" % (len(after_body), len(before_all)))

    # ---- 保存 + 导出 ----
    os.makedirs(R9_SRC, exist_ok=True)
    os.makedirs(R9_MODELS, exist_ok=True)
    out_blend = os.path.join(R9_SRC, "hero005.blend")
    if os.path.isfile(out_blend):
        os.remove(out_blend)
    # 打开时默认激活 attack，方便直接检查挥击
    if arm.animation_data and bpy.data.actions.get("attack"):
        arm.animation_data.action = bpy.data.actions["attack"]
    bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)

    out_glb = os.path.join(R9_MODELS, "hero005.glb")
    scene.render.fps = FRAME_RATE
    scene.frame_start = 0
    scene.frame_end = 60
    if arm.animation_data:
        arm.animation_data.action = None      # 导出只走 NLA
    bpy.ops.export_scene.gltf(
        filepath=out_glb, export_format="GLB", export_animations=True,
        export_nla_strips=True, export_skins=True, export_force_sampling=True,
        export_frame_range=False, export_yup=True, export_image_format="AUTO",
    )

    report = {
        "schema": "act008-weapon-attach/1",
        "generator": "tools/motion/attach_weapon.py",
        "blender": bpy.app.version_string,
        "source_blend": os.path.relpath(R8_BLEND, ROOT),
        "output_blend": os.path.relpath(out_blend, ROOT),
        "output_glb": os.path.relpath(out_glb, ROOT),
        "body_vertices_before": len(before_all),
        "body_vertices_after": len(body.data.vertices),
        "weapon_vertices": len(weapon.data.vertices),
        "weapon_islands": sorted(detail, key=lambda x: -x["verts"]),
        "weapon_vertex_group": WEAPON_BONE,
        "weapon_weight": 1.0,
        "max_deviation": round(max_dev, 6),
        "new_geometry_added": 0,
        "blend_bytes": os.path.getsize(out_blend),
        "glb_bytes": os.path.getsize(out_glb),
    }
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    log("\n=== 完成 ===")
    log("源工程：%s（%d 字节）" % (os.path.relpath(out_blend, ROOT), report["blend_bytes"]))
    log("GLB：%s（%d 字节）" % (os.path.relpath(out_glb, ROOT), report["glb_bytes"]))
    log("报告：%s" % os.path.relpath(REPORT, ROOT))
    return 0 if max_dev < 1e-4 else 1


if __name__ == "__main__":
    sys.exit(main())
