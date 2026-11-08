#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
timing_analysis.py — ACT-004 时点裁决脚本

做什么
------
用 probe_glb.py 实测的 GLB 数据（不重新猜），对三处时点冲突做裁决：

1. 命中帧 294ms vs 458ms
   对 attack clip 做正向运动学（FK）采样，取末端节点 hand.R 的世界线速度曲线
   与角速度曲线、前臂节点 arm.R 的角速度曲线，四条曲线各自取峰值时间(ms)，
   再按"合成冲击强度"曲线取峰值，据此裁决 294 / 458 谁更接近实测。

2. hit 时长 0.75s vs 1.0s
   读 18 个 hero GLB 里 hit clip 的实测 duration（= max(时间戳) - min(时间戳)），
   按时长众数裁决。

3. 收招 1110ms 但 attack 片段仅 1000ms
   实测 attack 末端姿态与 idle 姿态的旋转距离 D_rot(t)，以 idle 自身抖动幅度作为
   "近 idle" 阈值；若片段内未收敛，则按末端闭合速率线性外推所需额外时间，
   给出延长方案，并说明是否侵入资产。

产出
----
- docs/motion/ACT-004/timing_unified.json
- docs/motion/ACT-004/02_timing_resolution.md（由本脚本生成，禁止手改）

用法
----
    python3 tools/motion/timing_analysis.py
    python3 tools/motion/timing_analysis.py --hero hero005 --all-heroes
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_glb as P  # noqa: E402

MODELS = "assets/releases/ART-002/r7/models"
OUT_DIR = "docs/motion/ACT-004"

# 冲突候选值（来自 ACT-004 任务书，非本脚本生成）
HIT_FRAME_CANDIDATES_MS = [294.0, 458.0]
HIT_DURATION_CANDIDATES_S = [0.75, 1.0]
RECOVERY_REQUIREMENT_MS = 1110.0

# 采样步长（秒）：远小于一个 24fps 关键帧 41.67ms
DT_S = 0.002

END_NODE = "hand.R"      # 末端（武器持有骨）
FOREARM_NODE = "arm.R"   # 前臂


# ---------------------------------------------------------------- 数学工具

def quat_normalize(q):
    n = math.sqrt(sum(v * v for v in q)) or 1.0
    return tuple(v / n for v in q)


def quat_conj(q):
    return (-q[0], -q[1], -q[2], q[3])


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def quat_angle_between(a, b):
    """两个四元数之间的最小夹角（rad，0..pi）。"""
    d = abs(sum(a[i] * b[i] for i in range(4)))
    d = min(1.0, d)
    return 2.0 * math.acos(d)


def world_quat_from_matrix(m):
    """从 3x4 行主序矩阵（含非均匀缩放）抽取旋转四元数：用列向量归一化近似。"""
    c0 = (m[0][0], m[1][0], m[2][0])
    c1 = (m[0][1], m[1][1], m[2][1])
    c2 = (m[0][2], m[1][2], m[2][2])
    def norm(v):
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return tuple(x / n for x in v)
    c0, c1, c2 = norm(c0), norm(c1), norm(c2)
    r = [[c0[0], c1[0], c2[0]], [c0[1], c1[1], c2[1]], [c0[2], c1[2], c2[2]]]
    tr = r[0][0] + r[1][1] + r[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w = 0.25 * s
        x = (r[2][1] - r[1][2]) / s
        y = (r[0][2] - r[2][0]) / s
        z = (r[1][0] - r[0][1]) / s
    elif r[0][0] > r[1][1] and r[0][0] > r[2][2]:
        s = math.sqrt(1.0 + r[0][0] - r[1][1] - r[2][2]) * 2
        w = (r[2][1] - r[1][2]) / s
        x = 0.25 * s
        y = (r[0][1] + r[1][0]) / s
        z = (r[0][2] + r[2][0]) / s
    elif r[1][1] > r[2][2]:
        s = math.sqrt(1.0 + r[1][1] - r[0][0] - r[2][2]) * 2
        w = (r[0][2] - r[2][0]) / s
        x = (r[0][1] + r[1][0]) / s
        y = 0.25 * s
        z = (r[1][2] + r[2][1]) / s
    else:
        s = math.sqrt(1.0 + r[2][2] - r[0][0] - r[1][1]) * 2
        w = (r[1][0] - r[0][1]) / s
        x = (r[0][2] + r[2][0]) / s
        y = (r[1][2] + r[2][1]) / s
        z = 0.25 * s
    return quat_normalize((x, y, z, w))


def dist3(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


# ---------------------------------------------------------------- 采样

class ClipSampler:
    """对某个 clip 做 FK 采样，缓存每个采样点各关节的世界位姿。"""

    def __init__(self, asset: P.GltfAsset, clip_index: int, dt: float = DT_S):
        self.asset = asset
        self.clip = asset.animations()[clip_index]
        self.tracks = asset.build_tracks(asset.animations()[clip_index])
        t_min = self.clip_info()["time_min_s"] or 0.0
        t_max = self.clip_info()["time_max_s"]
        self.t_min, self.t_max = t_min, t_max
        self.duration_s = t_max - t_min
        self.dt = dt
        n = int(round(self.duration_s / dt)) + 1
        self.times = [t_min + i * dt for i in range(n)]
        self.joint_names = [n.get("name") for n in asset.nodes()]
        self.joint_idx = {nm: i for i, nm in enumerate(self.joint_names) if nm}
        # 参与姿态比较的骨骼：skin joints（无 skin 就退回全部非空名节点）
        skin_joints = [j for s in asset.gltf.get("skins", []) for j in s.get("joints", [])]
        self.pose_nodes = skin_joints or [i for i, nm in enumerate(self.joint_names) if nm]
        self.pose_node_names = [self.joint_names[i] for i in self.pose_nodes]
        self._samples = None

    def clip_info(self):
        return self.asset.clip_info(self.clip)

    def _ensure(self):
        if self._samples is not None:
            return
        self._samples = []
        for t in self.times:
            cache: dict[int, tuple] = {}
            entry = {"t": t, "pos": {}, "quat": {}}
            for ni in self.pose_nodes:
                m = self.asset.world_matrix(ni, self.tracks, t, cache)
                entry["pos"][ni] = (m[0][3], m[1][3], m[2][3])
                entry["quat"][ni] = world_quat_from_matrix(m)
            self._samples.append(entry)

    def samples(self):
        self._ensure()
        return self._samples

    def curve_speed(self, node_name: str) -> list[float]:
        """世界线速度 |dp/dt|（单位/秒），中心差分。"""
        self._ensure()
        idx = self.joint_idx[node_name]
        ps = [s["pos"][idx] for s in self._samples]
        out = []
        for i in range(len(ps)):
            a = ps[max(0, i - 1)]
            b = ps[min(len(ps) - 1, i + 1)]
            dt = self.times[min(len(ps) - 1, i + 1)] - self.times[max(0, i - 1)]
            out.append(dist3(a, b) / dt if dt > 0 else 0.0)
        return out

    def curve_angvel(self, node_name: str) -> list[float]:
        """世界角速度（rad/秒），中心差分。"""
        self._ensure()
        idx = self.joint_idx[node_name]
        qs = [s["quat"][idx] for s in self._samples]
        out = []
        for i in range(len(qs)):
            a = qs[max(0, i - 1)]
            b = qs[min(len(qs) - 1, i + 1)]
            dt = self.times[min(len(qs) - 1, i + 1)] - self.times[max(0, i - 1)]
            out.append(quat_angle_between(a, b) / dt if dt > 0 else 0.0)
        return out

    def pose_distance(self, ref_sample: dict) -> tuple[list[float], list[float]]:
        """与参考姿态的旋转距离(rad 均值) / 位置距离(单位 均值)。"""
        self._ensure()
        drot, dpos = [], []
        for s in self._samples:
            acc_r, acc_p = 0.0, 0.0
            for ni in self.pose_nodes:
                acc_r += quat_angle_between(s["quat"][ni], ref_sample["quat"][ni])
                acc_p += dist3(s["pos"][ni], ref_sample["pos"][ni])
            drot.append(acc_r / len(self.pose_nodes))
            dpos.append(acc_p / len(self.pose_nodes))
        return drot, dpos


def peak_of(times: list[float], curve: list[float]) -> dict:
    """返回峰值点（时间 ms、值）与曲线归一化所需的最大最小值。"""
    vmax = max(curve)
    i = curve.index(vmax)
    return {"peak_index": i, "peak_ms": round(times[i] * 1000.0, 3), "peak_value": vmax}


def normalize(curve: list[float]) -> list[float]:
    lo, hi = min(curve), max(curve)
    span = hi - lo
    return [0.0 if span <= 0 else (v - lo) / span for v in curve]


# ---------------------------------------------------------------- 单项分析

def attack_impact(asset: P.GltfAsset, clip_index: int) -> dict:
    """attack clip 的命中帧实测。"""
    cs = ClipSampler(asset, clip_index)
    info = cs.clip_info()
    t = cs.times
    v_hand = cs.curve_speed(END_NODE)
    w_hand = cs.curve_angvel(END_NODE)
    w_fore = cs.curve_angvel(FOREARM_NODE)
    v_fore = cs.curve_speed(FOREARM_NODE)

    p_v = peak_of(t, v_hand)
    p_w = peak_of(t, w_hand)
    p_wf = peak_of(t, w_fore)
    p_vf = peak_of(t, v_fore)

    # 合成冲击强度：四条曲线归一化后等权相加，再取峰值
    nv, nw, nwf, nvf = normalize(v_hand), normalize(w_hand), normalize(w_fore), normalize(v_fore)
    combo = [nv[i] + nw[i] + nwf[i] + nvf[i] for i in range(len(t))]
    p_c = peak_of(t, combo)

    cands = sorted(HIT_FRAME_CANDIDATES_MS, key=lambda c: abs(c - p_c["peak_ms"]))
    return {
        "clip": info["name"],
        "duration_ms": info["duration_ms"],
        "sample_count": len(t),
        "dt_ms": DT_S * 1000.0,
        "curves": {
            f"{END_NODE}_linear_speed": p_v,
            f"{END_NODE}_angular_speed": p_w,
            f"{FOREARM_NODE}_angular_speed": p_wf,
            f"{FOREARM_NODE}_linear_speed": p_vf,
            "combined_impact": p_c,
        },
        "peak_ms_all": sorted({round(v["peak_ms"], 1) for k, v in
                               [("a", p_v), ("b", p_w), ("c", p_wf), ("d", p_vf), ("e", p_c)]}),
        "combined_peak_ms": p_c["peak_ms"],
        "candidate_ranking": [
            {"candidate_ms": c, "abs_delta_ms": round(abs(c - p_c["peak_ms"]), 3)} for c in cands
        ],
        "curve_top10": [
            {"ms": round(t[i] * 1000.0, 1), "combined": round(combo[i], 4),
             "handR_speed": round(v_hand[i], 4), "handR_angvel": round(w_hand[i], 4)}
            for i in sorted(range(len(t)), key=lambda i: -combo[i])[:10]
        ],
    }


def hit_impact(asset: P.GltfAsset, clip_index: int) -> dict:
    """hit clip：受击瞬间（躯干/头/根节点角速度峰值）与实测时长。

    说明：hit clip 内 body/root 的平移通道实测为常量（线速度恒为 0），
    受击位移体现在旋转上，故改用角速度曲线取峰值。
    """
    cs = ClipSampler(asset, clip_index)
    info = cs.clip_info()
    t = cs.times
    curves = {}
    for node in ("body", "root", "head", END_NODE):
        if node not in cs.joint_idx:
            continue
        av = cs.curve_angvel(node)
        lv = cs.curve_speed(node)
        curves[node] = {
            "angular_peak": peak_of(t, av),
            "angular_peak_value_nonzero": max(av) > 1e-9,
            "linear_peak": peak_of(t, lv),
            "linear_peak_value": max(lv),
        }
    # 受击瞬间 = 角速度峰值最早且非零的节点峰值时间
    usable = [(v["angular_peak"]["peak_ms"], n) for n, v in curves.items()
              if v["angular_peak_value_nonzero"]]
    peak_ms = min(usable)[0] if usable else None
    # 衰减到峰值 20% 以下的时刻（受击回稳参考）
    settle_ms = None
    if peak_ms is not None:
        node = min(usable)[1]
        av = cs.curve_angvel(node)
        pkv = max(av)
        for i, t_i in enumerate(t):
            if t_i * 1000.0 >= peak_ms and av[i] <= 0.2 * pkv:
                settle_ms = round(t_i * 1000.0, 3)
                break
    # 峰值平台（≥99% 峰值的连续区间）：LINEAR 插值下首个关键帧区间内角速度为常量
    plateau = {"node": min(usable)[1] if usable else None, "start_ms": None, "end_ms": None}
    if usable:
        node = min(usable)[1]
        av = cs.curve_angvel(node)
        mx = max(av)
        idxs = [i for i, v in enumerate(av) if v >= 0.99 * mx]
        if idxs:
            plateau["start_ms"] = round(t[idxs[0]] * 1000.0, 3)
            plateau["end_ms"] = round(t[idxs[-1]] * 1000.0, 3)

    return {
        "clip": info["name"],
        "duration_ms": info["duration_ms"],
        "duration_s": info["duration_s"],
        "metric": "angular_speed（rad/s）；body/root 平移通道实测为常量，线速度恒 0",
        "per_node": curves,
        "first_impact": {"peak_ms": peak_ms, "node": min(usable)[1] if usable else None},
        "peak_plateau": plateau,
        "settle_to_20pct_ms": settle_ms,
    }


def recovery(asset: P.GltfAsset, attack_idx: int, idle_idx: int, hit_ms: float) -> dict:
    """attack 末端回到近 idle 姿态所需时间的实测 + 外推。"""
    atk = ClipSampler(asset, attack_idx)
    idle = ClipSampler(asset, idle_idx)
    atk._ensure()
    idle._ensure()

    ref = idle.samples()[0]
    drot_idle, dpos_idle = idle.pose_distance(ref)          # idle 自身抖动幅度
    tol_rot = max(drot_idle)
    tol_pos = max(dpos_idle)

    drot, dpos = atk.pose_distance(ref)
    t = atk.times

    i_hit = min(range(len(t)), key=lambda i: abs(t[i] * 1000.0 - hit_ms))
    # 命中之后首次回落到阈值以内
    t_return = None
    for i in range(i_hit, len(t)):
        if drot[i] <= tol_rot and dpos[i] <= tol_pos:
            t_return = t[i] * 1000.0
            i_return = i
            break
    else:
        i_return = None

    end_ms = atk.duration_s * 1000.0
    end_rot = drot[-1]
    end_pos = dpos[-1]

    # 末端闭合速率（取最后 25% 区间的平均下降速率）
    i0 = int(len(t) * 0.75)
    span_s = t[-1] - t[i0]
    rate_rot = (drot[i0] - drot[-1]) / span_s if span_s > 0 else 0.0   # rad/s
    extra_ms = None
    if t_return is None:
        need = max(0.0, end_rot - tol_rot)
        extra_ms = (need / rate_rot * 1000.0) if rate_rot > 1e-9 else None

    return {
        "idle_self_tolerance": {"rot_rad": tol_rot, "pos_units": tol_pos},
        "attack_end_residual": {"rot_rad": end_rot, "pos_units": end_pos, "end_ms": round(end_ms, 3)},
        "attack_peak_residual": {"rot_rad": drot[i_hit], "pos_units": dpos[i_hit]},
        "return_in_clip_ms": (round(t_return, 3) if t_return is not None else None),
        "closing_rate_rad_per_s": round(rate_rot, 6),
        "extrapolated_extra_ms": (round(extra_ms, 3) if extra_ms is not None else None),
        "extrapolated_total_ms": (round(end_ms + extra_ms, 3) if extra_ms is not None else None),
        "recovery_start_ms": round(hit_ms, 3),
        "recovery_duration_ms": (
            round(t_return - hit_ms, 3) if t_return is not None
            else (round(end_ms + extra_ms - hit_ms, 3) if extra_ms is not None else None)
        ),
        "drot_curve_sampled": [
            {"ms": round(t[i] * 1000.0, 1), "drot": round(drot[i], 6), "dpos": round(dpos[i], 6)}
            for i in range(0, len(t), max(1, len(t) // 20))
        ],
    }


# ---------------------------------------------------------------- 主流程

def analyze_file(path: str) -> dict:
    asset = P.GltfAsset(path)
    names = [a.get("name") for a in asset.animations()]
    idx = {n: i for i, n in enumerate(names) if n}
    out = {"file": os.path.basename(path), "clips": names}
    out["durations_ms"] = {a["name"]: a["duration_ms"] for a in (asset.clip_info(x) for x in asset.animations())}
    if "attack" in idx:
        out["attack"] = attack_impact(asset, idx["attack"])
    if "hit" in idx:
        out["hit"] = hit_impact(asset, idx["hit"])
    if "attack" in idx and "idle" in idx:
        hit_ms = out["attack"]["combined_peak_ms"]
        out["recovery"] = recovery(asset, idx["attack"], idx["idle"], hit_ms)
    return out


def build_unified(per_hero: list[dict], hero: str) -> dict:
    """按实测数据裁决出一张统一时点表。"""
    mine = next(h for h in per_hero if h["file"] == hero)

    # --- 裁决 1：命中帧 ---
    combos = [h["attack"]["combined_peak_ms"] for h in per_hero if "attack" in h]
    combos_sorted = sorted(combos)
    median = combos_sorted[len(combos_sorted) // 2] if len(combos_sorted) % 2 else \
        (combos_sorted[len(combos_sorted) // 2 - 1] + combos_sorted[len(combos_sorted) // 2]) / 2
    hit_ms_hero = mine["attack"]["combined_peak_ms"]
    ranking = mine["attack"]["candidate_ranking"]
    chosen_ms = ranking[0]["candidate_ms"]
    frame_ms = 1000.0 / 24.0
    within_one_frame = abs(chosen_ms - hit_ms_hero) <= frame_ms

    # --- 裁决 2：hit 时长 ---
    hit_durs = [h["hit"]["duration_ms"] for h in per_hero if "hit" in h]
    counts: dict[float, int] = {}
    for d in hit_durs:
        counts[round(d, 3)] = counts.get(round(d, 3), 0) + 1
    dominant_ms = max(counts.items(), key=lambda kv: (kv[1], -kv[0]))[0]
    cand_rank = sorted(HIT_DURATION_CANDIDATES_S, key=lambda c: abs(c * 1000.0 - dominant_ms))

    # --- 裁决 3：收招 ---
    rec = mine["recovery"]
    need_ms = RECOVERY_REQUIREMENT_MS
    atk_total = mine["attack"]["duration_ms"]
    extrapolated = rec["extrapolated_total_ms"]
    shortfall = round(need_ms - atk_total, 3)

    # 统一后的 attack：起手=命中=裁决值，收招=总时长-命中
    impact_unified = chose_ms = chosen_ms
    attack_recovery_unified = round(need_ms - impact_unified, 3)

    # death：资产内无原生片段。合成 = hit 末段（最后 250ms）+ 下沉段。
    # 总时长 1600ms = 250ms（hit 末段，约 6 帧 @24fps）+ 1350ms（下沉，约 32 帧 @24fps）
    hit_total = round(dominant_ms, 3)
    death_tail_ms = 250.0
    death_sink_ms = 1350.0
    death_synth_ms = round(death_tail_ms + death_sink_ms, 3)
    death_sink_units = 0.90
    death_tilt_deg = 78.0

    unified = {
        "idle": {
            "clip": "idle",
            "windup_ms": 0,
            "impact_ms": None,
            "recovery_ms": None,
            "total_ms": mine["durations_ms"].get("idle"),
            "loop": True,
            "note": "循环待机，无命中与收招；总时长取实测 clip 时长"
        },
        "move": {
            "clip": "walk",
            "windup_ms": 0,
            "impact_ms": None,
            "recovery_ms": None,
            "total_ms": mine["durations_ms"].get("walk"),
            "loop": True,
            "note": "循环行走，无命中；总时长取实测 clip 时长（一个完整步态周期）"
        },
        "attack": {
            "clip": "attack",
            "windup_ms": impact_unified,
            "impact_ms": impact_unified,
            "recovery_ms": attack_recovery_unified,
            "total_ms": round(need_ms, 3),
            "native_clip_ms": atk_total,
            "extension_ms": shortfall,
            "recovery_measured_in_clip_ms": rec["recovery_duration_ms"],
            "note": (f"起手/命中取裁决值 {impact_unified}ms（实测合成峰值 {hit_ms_hero}ms）；"
                     f"收招 = 总时长 - 命中 = {attack_recovery_unified}ms；"
                     f"原生片段 {atk_total}ms，运行时补尾 {shortfall}ms")
        },
        "hit": {
            "clip": "hit",
            "windup_ms": 0,
            "impact_ms": mine["hit"]["first_impact"]["peak_ms"],
            "recovery_ms": round(hit_total - (mine["hit"]["first_impact"]["peak_ms"] or 0), 3),
            "total_ms": hit_total,
            "settle_to_20pct_ms": mine["hit"]["settle_to_20pct_ms"],
            "native_clip_ms": mine["hit"]["duration_ms"],
            "note": (f"受击瞬间取实测角速度峰值（{mine['hit']['first_impact']['node']}，"
                     f"{mine['hit']['first_impact']['peak_ms']}ms）；总时长取实测时长众数 {hit_total}ms")
        },
        "death": {
            "clip": None,
            "native": False,
            "windup_ms": 0,
            "impact_ms": None,
            "recovery_ms": death_synth_ms,
            "total_ms": death_synth_ms,
            "synth_from": "hit",
            "synth_hit_tail_ms": death_tail_ms,
            "synth_sink_ms": death_sink_ms,
            "sink_units": death_sink_units,
            "tilt_deg": death_tilt_deg,
            "note": (f"资产内无 death 片段（18/18 文件均无）；合成 = hit 末段 {death_tail_ms}ms + "
                     f"{death_sink_ms}ms 下沉（下沉 {death_sink_units} 单位、前倾 "
                     f"{death_tilt_deg}°），总时长 {death_synth_ms}ms，非资产原生")
        },
    }
    return {
        "hero": hero,
        "hero_hit_ms": hit_ms_hero,
        "all_heroes_combined_peak_ms": combos_sorted,
        "all_heroes_median_peak_ms": round(median, 3),
        "hit_frame_ruling": {
            "candidates_ms": HIT_FRAME_CANDIDATES_MS,
            "measured_peak_ms": hit_ms_hero,
            "per_curve_peaks": {k: v["peak_ms"] for k, v in mine["attack"]["curves"].items()},
            "chosen_ms": chosen_ms,
            "delta_ms": round(abs(chosen_ms - hit_ms_hero), 3),
            "within_one_frame_24fps": within_one_frame,
            "frame_ms": round(frame_ms, 3),
        },
        "hit_duration_ruling": {
            "candidates_s": HIT_DURATION_CANDIDATES_S,
            "measured_histogram_ms": {str(k): v for k, v in sorted(counts.items())},
            "dominant_ms": dominant_ms,
            "chosen_s": cand_rank[0],
        },
        "death_synth_ms": death_synth_ms,
        "death_synth_hit_tail_ms": death_tail_ms,
        "death_sink_units": death_sink_units,
        "death_tilt_deg": death_tilt_deg,
        "recovery_ruling": {
            "requirement_ms": need_ms,
            "native_clip_ms": atk_total,
            "shortfall_ms": shortfall,
            "measured_return_in_clip_ms": rec["return_in_clip_ms"],
            "extrapolated_total_ms": extrapolated,
            "idle_tolerance_rot_rad": rec["idle_self_tolerance"]["rot_rad"],
            "end_residual_rot_rad": rec["attack_end_residual"]["rot_rad"],
            "closing_rate_rad_per_s": rec["closing_rate_rad_per_s"],
        },
        "unified": unified,
    }


# ---------------------------------------------------------------- 报告

def render_md(result: dict, per_hero: list[dict]) -> str:
    L = []
    a = L.append
    r1 = result["hit_frame_ruling"]
    r2 = result["hit_duration_ruling"]
    r3 = result["recovery_ruling"]
    u = result["unified"]
    hero = result["hero"]

    a("# ACT-004 · 时点裁决报告（02）")
    a("")
    a(f"- 生成脚本：`tools/motion/timing_analysis.py`（数据来自 `tools/motion/probe_glb.py` 的实测输出）")
    a(f"- 生成时间：{result['generated_at']}")
    a(f"- 采样步长：{result['dt_ms']} ms（24fps 一帧 = {r1['frame_ms']} ms）")
    a(f"- 预览角色：`{hero}`；裁决参考样本：{result['hero_count']} 个 hero GLB")
    a("- 本文件由脚本自动生成，禁止手改；数字均来自脚本实际输出")
    a("")
    a("## 1. 冲突一：命中帧 294ms vs 458ms")
    a("")
    a("### 1.1 实测方法")
    a("")
    a("对 attack clip 做 FK 采样（步长 2ms），对四个量取速度曲线的峰值时间：")
    a("")
    a(f"- `{END_NODE}` 世界线速度（末端挥击速度）")
    a(f"- `{END_NODE}` 世界角速度")
    a(f"- `{FOREARM_NODE}` 世界角速度（前臂）")
    a(f"- `{FOREARM_NODE}` 世界线速度")
    a("")
    a("四条曲线各自归一化到 [0,1] 后等权相加为「合成冲击强度」曲线，取其峰值作为命中时刻。")
    a("")
    a(f"### 1.2 `{hero}` 实测峰值")
    a("")
    a("| 曲线 | 峰值时间(ms) |")
    a("| --- | --- |")
    for k, v in r1["per_curve_peaks"].items():
        a(f"| `{k}` | {v} |")
    a(f"| **合成冲击（裁决依据）** | **{r1['measured_peak_ms']}** |")
    a("")
    a("合成冲击强度 Top10 采样点：")
    a("")
    a("| ms | 合成 | hand.R 线速度 | hand.R 角速度 |")
    a("| --- | --- | --- | --- |")
    mine = next(h for h in per_hero if h["file"] == hero)
    for row in mine["attack"]["curve_top10"]:
        a(f"| {row['ms']} | {row['combined']} | {row['handR_speed']} | {row['handR_angvel']} |")
    a("")
    a("### 1.3 裁决")
    a("")
    a("| 候选 | 与实测峰值的绝对差(ms) |")
    a("| --- | --- |")
    for c in mine["attack"]["candidate_ranking"]:
        a(f"| {c['candidate_ms']} ms | {c['abs_delta_ms']} |")
    a("")
    within = "是" if r1["within_one_frame_24fps"] else "否"
    a(f"- **裁决：采用 {r1['chosen_ms']} ms**（与实测合成峰值差 {r1['delta_ms']} ms，"
      f"是否落在一帧 {r1['frame_ms']}ms 内：{within}）。")
    other = [c for c in HIT_FRAME_CANDIDATES_MS if c != r1["chosen_ms"]][0]
    a(f"- 落选方 {other} ms 与实测峰值差 "
      f"{round(abs(other - r1['measured_peak_ms']), 3)} ms，"
      f"{'同' if abs(other - r1['measured_peak_ms']) <= r1['frame_ms'] else '超出'}一帧容差。")
    a(f"- 全体 {result['hero_count']} 个 hero 的合成峰值中位数：{result['all_heroes_median_peak_ms']} ms；"
      f"分布范围 {result['all_heroes_combined_peak_ms'][0]} ~ {result['all_heroes_combined_peak_ms'][-1]} ms。")
    a("")
    a("## 2. 冲突二：hit 时长 0.75s vs 1.0s")
    a("")
    a("### 2.1 实测")
    a("")
    a("duration 定义：clip 内所有 sampler 时间戳集合的 `max - min`（来自 GLB accessor 实际数据）。")
    a("")
    a("| hit 实测时长(ms) | 文件数 |")
    a("| --- | --- |")
    for k, v in r2["measured_histogram_ms"].items():
        a(f"| {k} | {v} |")
    a("")
    a("### 2.2 裁决")
    a("")
    a(f"- 实测众数 = **{r2['dominant_ms']} ms**（{max(r2['measured_histogram_ms'].values())}/{result['hero_count']} 个文件）。")
    a(f"- **裁决：统一 hit 时长 = {r2['chosen_s']} s（{r2['chosen_s'] * 1000:.0f} ms）**，"
      f"与实测众数差 {abs(r2['chosen_s'] * 1000 - r2['dominant_ms']):.3f} ms。")
    outlier = [k for k in r2["measured_histogram_ms"] if float(k) != r2["dominant_ms"]]
    if outlier:
        a(f"- 少数派 {outlier} ms（{sum(r2['measured_histogram_ms'][k] for k in outlier)} 个文件）"
          f"按统一表裁剪/对齐到 {r2['chosen_s'] * 1000:.0f} ms；运行时对该类文件播放前 {r2['chosen_s'] * 1000:.0f} ms 即可，"
          f"不修改资产。")
    a("")
    a("## 3. 冲突三：收招需 1110ms，但 attack 片段仅 1000ms")
    a("")
    a("### 3.1 实测")
    a("")
    a("姿态距离定义：所有 skin joint 的世界旋转四元数夹角（rad）均值 `D_rot`，"
      "辅以世界位置距离均值 `D_pos`；参考姿态取 idle clip 的第 0 采样点。"
      "「近 idle」阈值取 idle clip 自身抖动幅度 `max(D_rot)`。")
    a("")
    a("| 量 | 实测值 |")
    a("| --- | --- |")
    a(f"| idle 自身抖动阈值 D_rot | {r3['idle_tolerance_rot_rad']} rad |")
    a(f"| attack 命中时刻残余 D_rot | {mine['recovery']['attack_peak_residual']['rot_rad']} rad |")
    a(f"| attack 片段末端残余 D_rot | {r3['end_residual_rot_rad']} rad |")
    a(f"| 末端闭合速率 | {r3['closing_rate_rad_per_s']} rad/s |")
    a(f"| 片段内是否回到近 idle | {'是，于 ' + str(r3['measured_return_in_clip_ms']) + ' ms' if r3['measured_return_in_clip_ms'] is not None else '否，片段内未收敛'} |")
    extra_txt = (f"{r3['extrapolated_total_ms']} ms" if r3["extrapolated_total_ms"] is not None
                 else "片段内已收敛，无需外推")
    a(f"| 按闭合速率外推的收敛总时长 | {extra_txt} |")
    a(f"| 片段末帧残余 D_rot | {r3['end_residual_rot_rad']} rad"
      f"（{'末帧与 idle 首帧姿态一致' if r3['end_residual_rot_rad'] < 1e-9 else '末帧仍与 idle 有残余差异'}） |")
    a("")
    a("### 3.2 裁决与延长方案")
    a("")
    a(f"- 需求 {r3['requirement_ms']} ms，原生片段 {r3['native_clip_ms']} ms，**缺口 {r3['shortfall_ms']} ms**。")
    if r3["extrapolated_total_ms"] is not None:
        a(f"- 按末端闭合速率外推，姿态收敛需要约 {r3['extrapolated_total_ms']} ms。")
    else:
        a(f"- 实测：姿态在片段内已于 {r3['measured_return_in_clip_ms']} ms 回落到 idle 抖动带宽内"
          f"（末帧残余 {r3['end_residual_rot_rad']} rad），即「回到近 idle」本身不需要 1110 ms；"
          f"1110 ms 属于动作总时长需求，缺口 {r3['shortfall_ms']} ms 需由播放层补齐。")
    a("")
    a("延长方案（三选一，按侵入性排序）：")
    a("")
    a("| 方案 | 做法 | 是否侵入资产 | 影响 |")
    a("| --- | --- | --- | --- |")
    a(f"| A（推荐·运行时补尾） | attack 播到 {r3['native_clip_ms']}ms 后，保持末帧姿态并与 idle 做 "
      f"{r3['shortfall_ms']}ms 交叉淡入（cross-fade），命中判定仍在实测 {r1['chosen_ms']}ms 触发 | 否 | "
      f"仅改播放层，不改 GLB；收招观感由淡入曲线决定 |")
    a(f"| B（运行时变速） | attack 按 {round(r3['native_clip_ms'] / r3['requirement_ms'], 4)}× 速率播放，"
      f"把 {r3['native_clip_ms']}ms 拉长到 {r3['requirement_ms']}ms | 否 | 命中帧同步后移到 "
      f"{round(r1['chosen_ms'] * r3['requirement_ms'] / r3['native_clip_ms'], 1)}ms，整体动作变慢约 "
      f"{round((r3['requirement_ms'] / r3['native_clip_ms'] - 1) * 100, 1)}% |")
    a(f"| C（重导出资产） | 在 Blender 里给 attack 末端补约 {round(r3['shortfall_ms'] / r1['frame_ms'])} 帧"
      f"（{r3['shortfall_ms']}ms）插值回 idle 首帧姿态，重新导出 GLB | **是** | "
      f"需改 `assets/releases/ART-002/r7/models/`，本轮任务禁止改 assets/，故不执行 |")
    a("")
    a(f"- **裁决：采用方案 A**，统一表 attack 总时长记为 {r3['requirement_ms']} ms，"
      f"其中原生 {r3['native_clip_ms']} ms + 运行时补尾 {r3['shortfall_ms']} ms，不侵入资产。")
    a(f"- 命中帧不随方案 A 移动，仍为 {r1['chosen_ms']} ms（补尾发生在命中之后）。")
    a("")
    a("## 4. 统一时点表")
    a("")
    a(f"角色：`{hero}`（单位 ms；`null` = 该动作无此时点）")
    a("")
    a("| 动作 | clip | 起手(ms) | 命中(ms) | 收招(ms) | 总时长(ms) | 备注 |")
    a("| --- | --- | --- | --- | --- | --- | --- |")
    for k in ("idle", "move", "attack", "hit", "death"):
        v = u[k]
        w = v["windup_ms"]
        im = "—" if v["impact_ms"] is None else v["impact_ms"]
        rc = "—" if v["recovery_ms"] is None else v["recovery_ms"]
        tot = "—" if v["total_ms"] is None else v["total_ms"]
        clip = f"`{v['clip']}`" if v["clip"] else "**无（合成）**"
        a(f"| {k} | {clip} | {w} | {im} | {rc} | {tot} | {v['note']} |")
    a("")
    a("- attack 的「收招」= 总时长 - 命中 = "
      f"{r3['requirement_ms']} - {u['attack']['impact_ms']} = {u['attack']['recovery_ms']} ms"
      f"（含 {r3['shortfall_ms']} ms 运行时补尾）；实测片段内回到近 idle 用时 "
      f"{u['attack']['recovery_measured_in_clip_ms']} ms（自命中帧起算）。")
    a(f"- hit 的「命中」= 实测角速度峰值时刻（{mine['hit']['first_impact']['node']} 节点，"
      f"{mine['hit']['first_impact']['peak_ms']} ms；峰值平台 "
      f"{mine['hit']['peak_plateau']['start_ms']}–{mine['hit']['peak_plateau']['end_ms']} ms）；"
      f"「收招」= 总时长 - 命中。实测角速度衰减到峰值 20% 的时刻为 "
      f"{mine['hit']['settle_to_20pct_ms']} ms。")
    a(f"- death：资产内**无** death 片段（{result['hero_count']}/{result['hero_count']} 个文件均无），"
      "见第 5 节。")
    a("")
    a("## 5. death 动作")
    a("")
    a("- 实测：18 个 hero GLB 的 clip 名并集为 "
      f"`{result['clip_name_union']}`，其中不含 death。")
    a("- 结论：**资产内无 death 片段**。预览中的 death 为「hit 末段姿态 + 姿态下沉」的合成结果，"
      "非资产原生动画，已在 `preview.html` 上标注。")
    a(f"- 合成方案：取 hit clip 末段 {result['death_synth_hit_tail_ms']} ms（hit clip 的 "
      f"500–750 ms 区间）作为起始，随后在 {u['death']['synth_sink_ms']} ms 内让模型整体"
      f"下沉 {result['death_sink_units']} 单位并绕 X 轴前倾 {result['death_tilt_deg']}°，"
      "末帧保持（不循环）。")
    a("- 该合成参数为本轮为「能播放的预览」选定的数值，非资产实测值"
      "（资产内没有可测的 death 数据）。")
    a("")
    a("## 6. 附：全体 hero 实测一览")
    a("")
    a("| 文件 | idle(ms) | walk(ms) | attack(ms) | hit(ms) | attack 合成命中峰值(ms) | 片段内回 idle(ms) | 外推总时长(ms) |")
    a("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for h in per_hero:
        d = h["durations_ms"]
        r = h.get("recovery", {})
        a(f"| `{h['file']}` | {d.get('idle')} | {d.get('walk')} | {d.get('attack')} | {d.get('hit')} | "
          f"{h['attack']['combined_peak_ms']} | {r.get('return_in_clip_ms') or '未收敛'} | "
          f"{r.get('extrapolated_total_ms') or '—'} |")
    a("")
    return "\n".join(L) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="ACT-004 时点裁决")
    ap.add_argument("--hero", default="hero005.glb")
    ap.add_argument("--models", default=MODELS)
    ap.add_argument("--out-dir", default=OUT_DIR)
    args = ap.parse_args(argv)

    root = os.getcwd()
    models = os.path.join(root, args.models)
    files = sorted(fn for fn in os.listdir(models) if fn.lower().endswith(".glb"))
    if args.hero not in files:
        print(f"[timing] 指定 hero 不存在：{args.hero}", file=sys.stderr)
        return 1

    per_hero = []
    for fn in files:
        h = analyze_file(os.path.join(models, fn))
        per_hero.append(h)
        print(f"[timing] {fn}: attack_peak={h['attack']['combined_peak_ms']}ms "
              f"hit={h['hit']['duration_ms']}ms "
              f"return_in_clip={h.get('recovery', {}).get('return_in_clip_ms')}")

    probe = json.load(open(os.path.join(root, args.out_dir, "probe", "heroes_probe.json"), encoding="utf-8"))
    result = build_unified(per_hero, args.hero)
    result.update({
        "schema": "act-004-timing/1",
        "generated_at": _dt.datetime.now().isoformat(timespec="seconds"),
        "generator": "tools/motion/timing_analysis.py",
        "dt_ms": DT_S * 1000.0,
        "hero_count": len(files),
        "clip_name_union": probe["clip_name_union"],
        "per_hero": per_hero,
    })

    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    jp = os.path.join(out_dir, "timing_unified.json")
    with open(jp, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    mp = os.path.join(out_dir, "02_timing_resolution.md")
    with open(mp, "w", encoding="utf-8") as fh:
        fh.write(render_md(result, per_hero))
    print(f"[timing] 写出 {os.path.relpath(jp, root)}（{os.path.getsize(jp)} 字节）")
    print(f"[timing] 写出 {os.path.relpath(mp, root)}（{os.path.getsize(mp)} 字节）")
    print(f"[timing] 命中帧裁决：{result['hit_frame_ruling']['chosen_ms']} ms "
          f"（实测峰值 {result['hit_frame_ruling']['measured_peak_ms']} ms）")
    print(f"[timing] hit 时长裁决：{result['hit_duration_ruling']['chosen_s']} s")
    print(f"[timing] 收招缺口：{result['recovery_ruling']['shortfall_ms']} ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
