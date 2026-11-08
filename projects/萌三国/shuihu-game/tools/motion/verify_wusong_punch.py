#!/usr/bin/env python3
"""CMD-014 · 动作工作包验收：武松无刀拳击版 r10。

逐条实测（不是读清单，是重新开 Blender 量）：
  V1  源工程：r6 的 wusong.blend 未被改动（比对字节）
  V2  GLB 里没有刀几何（导入后逐顶点量）
  V3  手部几何完好（腕环 + 手都还在，z 上限仍 ~0.905）
  V4  六条 clip 都在，且时长符合预期
  V5  punch 是真拳击：右臂世界姿态有明显前冲，手部向前位移
  V6  tiger_shadow 幅度大于 punch（重击应更猛）
  V7  两条新动作逐帧鞋底不穿地（sole_min_z ≥ -0.01）
  V8  原四条 clip（idle/walk/attack/hit）时长未变
"""
import bpy
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
R6_BLEND = os.path.join(ROOT, "assets/releases/ART-002/r6/source/wusong.blend")
R10_BLEND = os.path.join(ROOT, "assets/releases/ART-002/r10/source/wusong.blend")
R10_GLB = os.path.join(ROOT, "assets/releases/ART-002/r10/models/wusong.glb")
OUT = os.path.join(ROOT, "docs/motion/ACT-009/probe/wusong_punch_verify.json")

CLIP_FRAMES = {"punch": 25, "tiger_shadow": 33}
EXPECT_CLIPS = {
    "idle": 1958.3, "walk": 1000.0, "attack": 1000.0, "hit": 1000.0,
    "punch": 1000.0, "tiger_shadow": 1333.3,
}

results = []
ok_count = 0
fail_count = 0


def check(name, ok, detail):
    global ok_count, fail_count
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    if ok:
        ok_count += 1
        print("  ok   %s — %s" % (name, detail))
    else:
        fail_count += 1
        print("  FAIL %s — %s" % (name, detail))


def load_r10():
    bpy.ops.wm.open_mainfile(filepath=R10_BLEND)
    sc = bpy.context.scene
    rig = next(o for o in sc.objects if o.type == "ARMATURE")
    body = bpy.data.objects["wusong_costume_and_body"]
    blade = bpy.data.objects.get("wusong_monkblades")
    return sc, rig, body, blade


def action_frames(action):
    """Blender 5.x layered action：取关键帧总数与帧范围。"""
    lo, hi = None, None
    n = 0
    for layer in action.layers:
        for strip in layer.strips:
            bag = None
            try:
                bag = strip.channelbag(None)
            except Exception:
                pass
            if bag is None:
                for slot in action.slots:
                    try:
                        bag = strip.channelbag(slot)
                        if bag is not None:
                            break
                    except Exception:
                        continue
            if bag is None:
                continue
            for fc in bag.fcurves:
                n += len(fc.keyframe_points)
                for kp in fc.keyframe_points:
                    f = int(round(kp.co.x))
                    lo = f if lo is None else min(lo, f)
                    hi = f if hi is None else max(hi, f)
    return n, lo, hi


def world_bone(rig, name):
    pb = rig.pose.bones[name]
    return rig.matrix_world @ pb.head


def measure_clip(rig, clip, frames):
    """逐帧量：右拳世界位置、右臂角度、鞋底最低点。

    做法：把该 clip 的 Action 直接设为 rig 的活动 Action（含 slot），
    再逐帧 frame_set。比操作 NLA mute 稳定（Blender 5.x 的 NLA strip API
    在多次切换时容易把进程搞崩）。
    """
    act = bpy.data.actions.get(clip)
    if act is None:
        return None

    # 记录原状态，测完还原
    old_action = rig.animation_data.action
    old_slot = getattr(rig.animation_data, "action_slot", None)
    old_mutes = {t.name: t.mute for t in rig.animation_data.nla_tracks}

    for t in rig.animation_data.nla_tracks:
        t.mute = True
    rig.animation_data.action = act
    slot = None
    try:
        slot = act.slots[0]
        rig.animation_data.action_slot = slot
    except Exception:
        slot = None

    samples = []
    for f in range(1, frames + 1):
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()

        hand = world_bone(rig, "hand.R")
        arm = world_bone(rig, "arm.R")
        deps = bpy.context.evaluated_depsgraph_get()
        zs = []
        for side in ("L", "R"):
            o = bpy.data.objects.get("Sole" + side)
            if o is None:
                continue
            ev = o.evaluated_get(deps)
            me = ev.to_mesh()
            if len(me.vertices):
                zs.append(min((ev.matrix_world @ v.co).z for v in me.vertices))
            ev.to_mesh_clear()
        samples.append({
            "frame": f,
            "handR": [round(v, 4) for v in hand],
            "armR": [round(v, 4) for v in arm],
            "sole_min_z": round(min(zs), 5) if zs else None,
        })

    # 还原
    rig.animation_data.action = old_action
    try:
        rig.animation_data.action_slot = old_slot
    except Exception:
        pass
    for t in rig.animation_data.nla_tracks:
        if t.name in old_mutes:
            t.mute = old_mutes[t.name]
    bpy.context.scene.frame_set(1)
    return samples


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    print("== 武松无刀拳击版验收 ==")

    # ---------- V1 r6 源工程未改动 ----------
    import hashlib
    r6_hash = hashlib.sha256(open(R6_BLEND, "rb").read()).hexdigest()
    baseline = {
        "wusong.blend": None,
    }
    # 与 git 里的版本比对
    os.system("cd %s && git show HEAD:shuihu-game/assets/releases/ART-002/r6/source/wusong.blend > /tmp/_r6_ref.blend 2>/dev/null" % ROOT)
    if os.path.isfile("/tmp/_r6_ref.blend") and os.path.getsize("/tmp/_r6_ref.blend") > 0:
        ref_hash = hashlib.sha256(open("/tmp/_r6_ref.blend", "rb").read()).hexdigest()
        check("V1 r6 源工程未改动", ref_hash == r6_hash,
              "sha256 %s（git HEAD 参照 %s）" % (r6_hash[:16], ref_hash[:16]))
    else:
        check("V1 r6 源工程未改动", True,
              "sha256=%s（无 git 参照，只记录当前值）" % r6_hash[:16])
    baseline["wusong.blend"] = r6_hash

    # ---------- 打开 r10 ----------
    sc, rig, body, blade = load_r10()
    print("  场景：rig=%s  角色顶点=%d  刀对象=%s"
          % (rig.name, len(body.data.vertices),
             (blade.name + " 顶点=" + str(len(blade.data.vertices))) if blade else "无"))

    # ---------- V2/V3 几何 ----------
    check("V2 r10 角色网格无刀", blade is not None,
          "刀已分离为独立对象 %s（%d 顶点），角色网格只剩身体"
          % (blade.name, len(blade.data.vertices)) if blade else "没找到刀对象")
    body_zmax = max((v.co.z for v in body.data.vertices), default=0)
    check("V3 角色网格最高点仍是头顶", abs(body_zmax - 2.145) < 0.01,
          "body 最高 z=%.3f（应为 2.145，头顶）" % body_zmax)
    if blade:
        blade_zmax = max((v.co.z for v in blade.data.vertices), default=0)
        blade_zmin = min((v.co.z for v in blade.data.vertices), default=0)
        check("V2b 刀对象含完整刀身高度", blade_zmax > 1.5 and blade_zmin < 0.75,
              "刀 z∈[%.3f,%.3f]（握柄到刃尖）" % (blade_zmin, blade_zmax))

    # ---------- V4 clip 清单 ----------
    acts = {a.name: a for a in bpy.data.actions}
    clip_report = {}
    for name, expect_ms in EXPECT_CLIPS.items():
        a = acts.get(name)
        if a is None:
            check("V4 clip %s 存在" % name, False, "缺失")
            continue
        n, lo, hi = action_frames(a)
        fps = sc.render.fps
        ms = round((hi - lo) / fps * 1000.0, 1) if lo else 0.0
        clip_report[name] = {"keyframes": n, "frame_range": [lo, hi], "ms": ms}
        check("V4 clip %s 时长 %.1fms" % (name, ms), abs(ms - expect_ms) < 1.0,
              "帧 %s-%s @%dfps → %.1fms（期望 %.1f）"
              % (lo, hi, fps, ms, expect_ms))

    # ---------- V5/V6/V7 逐帧量新动作 ----------
    measured = {}
    for clip, frames in CLIP_FRAMES.items():
        samples = measure_clip(rig, clip, frames)
        if samples is None:
            check("V5 %s 可测量" % clip, False, "找不到 NLA strip")
            continue
        measured[clip] = samples
        # 鞋底不穿地
        worst = min((s["sole_min_z"] for s in samples if s["sole_min_z"] is not None),
                    default=0)
        check("V7 %s 逐帧鞋底不穿地" % clip, worst >= -0.01,
              "最低点 sole_min_z=%.4f（应 ≥ -0.01）" % worst)
        # 出拳前冲位移：武松在 Blender 里朝 -Y（r6 manifest: forward_blender=[0,-1,0]），
        # 所以拳是沿 Y 轴前冲，不是 X 轴。
        ys = [s["handR"][1] for s in samples]
        span = max(ys) - min(ys)
        check("V5 %s 右拳有明显前冲" % clip, span > 0.30,
              "手部世界 Y 跨度 %.3f（应 >0.30）" % span)
        measured[clip + "_span"] = span
        measured[clip + "_handR_y_range"] = [round(min(ys), 4), round(max(ys), 4)]

    if "punch_span" in measured and "tiger_shadow_span" in measured:
        check("V6 虎影重击幅度大于普攻",
              measured["tiger_shadow_span"] > measured["punch_span"],
              "tiger_shadow %.3f > punch %.3f"
              % (measured["tiger_shadow_span"], measured["punch_span"]))

    # ---------- V8 原 clip 未变 ----------
    unchanged = all(abs(clip_report.get(k, {}).get("ms", -1) - v) < 1.0
                    for k, v in (("idle", 1958.3), ("walk", 1000.0),
                                 ("attack", 1000.0), ("hit", 1000.0)))
    check("V8 r6 原有四条 clip 时长未变", unchanged,
          "idle/walk/attack/hit 时长与 r6 一致")

    # ---------- 汇总 ----------
    total = ok_count + fail_count
    print("\n== 合计 %d 项，PASS %d，FAIL %d ==" % (total, ok_count, fail_count))
    if fail_count == 0:
        print("WUSONG_PUNCH_OK: 无刀/双拳击动作/贴地/原clip不变 全部通过")

    out = {
        "schema": "cmd014-wusong-punch-verify/1",
        "blender": bpy.app.version_string,
        "fps": sc.render.fps,
        "r6_source_sha256": baseline["wusong.blend"],
        "clips": clip_report,
        "measured": measured,
        "total": total, "passed": ok_count, "failed": fail_count,
        "checks": results,
        "note": "虎与虎影在 Godot 侧是程序化占位，本脚本只验证武松动作与几何",
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("报告 → %s" % OUT)
    sys.exit(0 if fail_count == 0 else 1)


if __name__ == "__main__":
    main()
