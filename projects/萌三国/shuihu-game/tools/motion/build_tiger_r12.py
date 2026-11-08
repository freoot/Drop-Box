#!/usr/bin/env python3
"""CMD-016 · 动作工作包：Q 版猛虎 r12（r11 + 败退/倒地动作）。

背景
----
r11 的虎只有 idle / walk / pounce / hit 四条动作。打虎胜利时**没有败退/倒地表现**——
画面上虎站着不动，只弹出一个对话框，缺少「这一仗打完了」的收束感。

本脚本**复用 r11 的建模、绑骨与 K 帧代码**（import build_tiger_r11），
只多出一条 defeat 动作，产物另存为**新版本 r12**，**r11 原样保留不动**。

产物
----
  assets/releases/ART-002/r12/models/tiger.glb        # Godot runtime
  assets/releases/ART-002/r12/source/tiger.blend      # 可编辑源工程
  assets/releases/ART-002/r12/tiger_manifest.json     # 清单

动作
  defeat  惊退 → 屈腿跪伏 → 趴伏静止（45 帧；全程无血、无伤口、无尸体）

构建
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_tiger_r12.py
"""
import importlib.util
import json
import math
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools", "motion"))
r11 = importlib.import_module("build_tiger_r11")

OUT_DIR = os.path.join(ROOT, "assets/releases/ART-002/r12")
OUT_MODEL_DIR = os.path.join(OUT_DIR, "models")
OUT_SOURCE_DIR = os.path.join(OUT_DIR, "source")
FPS = 24
BASE_VERSION = "r11"


def log(msg):
    print(msg, flush=True)


def pose_defeat(rig, t, f):
    """败退/倒地：惊退 → 屈腿跪伏 → 趴伏静止。

    骨约定（与 r11 一致）：
      身体朝 -Y；绕 X 正转 = 头/身朝前下方（低头、压身）；
      前腿 arm.* 绕 X 负转 = 前爪向前收起；后腿 leg.* 绕 X 正转 = 后腿向后折。
    收尾保持低位趴伏，Godot 侧再叠一层「退入林子 + 淡出」，全无血。
    """
    if t < 0.28:
        # 惊退：身子后仰、头猛压低、尾巴竖起
        a = math.sin(t / 0.28 * math.pi / 2)
        rig.pose.bones["body"].rotation_euler.x = 0.24 * a
        rig.pose.bones["head"].rotation_euler.x = 0.40 * a
        rig.pose.bones["tail"].rotation_euler.x = -0.26 * a
        rig.pose.bones["tail"].rotation_euler.y = 0.20 * a
        for side in ("L", "R"):
            rig.pose.bones["arm." + side].rotation_euler.x = -0.18 * a
            rig.pose.bones["leg." + side].rotation_euler.x = 0.14 * a
    elif t < 0.66:
        # 屈腿跪伏：前腿收、后腿折、身体压到地面
        a = (t - 0.28) / 0.38
        e = a * a * (3 - 2 * a)   # smoothstep，落地不硬切
        rig.pose.bones["body"].rotation_euler.x = 0.24 + 0.56 * e
        rig.pose.bones["head"].rotation_euler.x = 0.40 + 0.62 * e
        rig.pose.bones["tail"].rotation_euler.x = -0.26 + 0.44 * e
        for side in ("L", "R"):
            rig.pose.bones["arm." + side].rotation_euler.x = -0.18 - 1.05 * e
            rig.pose.bones["leg." + side].rotation_euler.x = 0.14 + 0.80 * e
    else:
        # 趴伏静止：只剩极轻的呼吸
        a = (t - 0.66) / 0.34
        b = math.sin(a * math.tau) * 0.5 + 0.5
        rig.pose.bones["body"].rotation_euler.x = 0.80 + 0.012 * b
        rig.pose.bones["head"].rotation_euler.x = 1.02 + 0.02 * b
        rig.pose.bones["tail"].rotation_euler.x = 0.18
        for side in ("L", "R"):
            rig.pose.bones["arm." + side].rotation_euler.x = -1.23
            rig.pose.bones["leg." + side].rotation_euler.x = 0.94


def defeat_drop(t):
    """额外的根骨下沉量：折腿只让爪尖离地，身子还得自己降下去才像「趴伏」。"""
    if t < 0.28:
        return 0.0
    if t < 0.66:
        a = (t - 0.28) / 0.38
        e = a * a * (3 - 2 * a)
        return -0.16 * e
    return -0.16


def main():
    os.makedirs(OUT_MODEL_DIR, exist_ok=True)
    os.makedirs(OUT_SOURCE_DIR, exist_ok=True)

    log("=== 清空场景 ===")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start = 1

    log("=== 建骨架（复用 r11）===")
    rig = r11.build_rig()

    log("=== 建虎身（复用 r11）===")
    m = {k: r11.material(k, v) for k, v in r11.PALETTE.items()}
    r11.build_body(rig, m)

    log("=== K 帧：r11 四条 + 新增 defeat ===")
    clips = {}
    for name, frames, fn in (
        ("idle", 48, r11.pose_idle),
        ("walk", 25, r11.pose_walk),
        ("pounce", 33, r11.pose_pounce),
        ("hit", 25, r11.pose_hit),
        ("defeat", 45, pose_defeat),
    ):
        action, contacts = r11.make_clip(
            rig, name, frames, fn,
            root_drop_fn=defeat_drop if name == "defeat" else None)
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
        "schema": "cmd016-tiger-r12/1",
        "base_version": BASE_VERSION,
        "base_script": "tools/motion/build_tiger_r11.py",
        "delta": "在 r11 的 4 条动作之外新增 defeat（惊退→屈腿跪伏→趴伏静止）",
        "output_glb": os.path.relpath(glb_path, ROOT),
        "output_blend": os.path.relpath(blend_path, ROOT),
        "glb_bytes": os.path.getsize(glb_path),
        "blend_bytes": os.path.getsize(blend_path),
        "fps": FPS,
        "bones": list(r11.BONES),
        "clips": clips,
        "height_units": 1.35,
        "note": "Q 版猛虎 r12：造型与 r11 完全一致，仅增加败退/倒地动作；非血腥表现",
        "animal_representation": "procedural-blender-parts（原创分件，非下载素材）",
        "r11_kept": "assets/releases/ART-002/r11/ 原样保留，未改动",
    }
    mpath = os.path.join(OUT_DIR, "tiger_manifest.json")
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("清单 → %s" % mpath)
    log("DONE_TIGER_R12")


if __name__ == "__main__":
    main()
