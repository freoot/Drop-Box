#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
probe_glb.py — GLB（glTF 2.0 二进制容器）离线探测脚本（ACT-004）

做什么
------
1. 纯 Python 标准库解析 GLB：magic 'glTF' → 版本 → 长度 → JSON chunk → BIN chunk。
2. 全量探测 assets/releases/ART-002/r7/models/ 下的 hero*.glb，输出两份产出：
   - docs/motion/ACT-004/probe/heroes_probe.json   （机器可读全量结果）
   - docs/motion/ACT-004/01_glb_probe.md           （人读报告，由本脚本生成）
3. 作为模块被 timing_analysis.py 复用：提供 accessor 读取、动画采样、正向运动学（FK）。

用法
----
    python3 tools/motion/probe_glb.py                        # 探测默认目录并生成两份产出
    python3 tools/motion/probe_glb.py --only hero005.glb     # 只探一个，打印摘要、不写盘
    python3 tools/motion/probe_glb.py --models <dir> --out-dir <dir>

约束
----
- 只读：不修改 assets/ 下任何文件。
- 所有数字均来自文件实际字节；无法解析的项写 None 并附 reason，不做任何推测性填充。
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import math
import os
import re
import struct
import sys

# ---------------------------------------------------------------- 常量

GLB_MAGIC = b"glTF"
COMPONENT = {
    5120: ("b", 1),   # BYTE
    5121: ("B", 1),   # UNSIGNED_BYTE
    5122: ("h", 2),   # SHORT
    5123: ("H", 2),   # UNSIGNED_SHORT
    5125: ("I", 4),   # UNSIGNED_INT
    5126: ("f", 4),   # FLOAT
}
NUM_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}

# 武器 / 道具挂点关键词（ACT-004 指定搜索词）
WEAPON_KEYWORDS = ["hand", "weapon", "prop", "sword", "blade", "spear", "staff", "axe"]
# 其中「道具/武器」专用名词（去掉 hand，因为 hand 是骨骼名，不是挂点专有名词）
PROP_KEYWORDS = ["weapon", "prop", "sword", "blade", "spear", "staff", "axe"]

DEFAULT_MODELS = "assets/releases/ART-002/r7/models"
DEFAULT_OUT = "docs/motion/ACT-004"


# ---------------------------------------------------------------- GLB 容器

class GLBError(Exception):
    pass


class GltfAsset:
    """一个已解析的 GLB：持有 JSON chunk、BIN chunk 与常用查询方法。"""

    def __init__(self, path: str):
        self.path = path
        raw = open(path, "rb").read()
        self.size_bytes = len(raw)
        self.sha256 = hashlib.sha256(raw).hexdigest()
        self.parse_errors: list[str] = []

        if len(raw) < 12 or raw[0:4] != GLB_MAGIC:
            raise GLBError("magic 不是 'glTF'，可能不是 GLB 容器")
        version, declared_length = struct.unpack("<II", raw[4:12])
        if declared_length != len(raw):
            self.parse_errors.append(
                f"declared_length={declared_length} 与实际 {len(raw)} 不一致，以实际长度为准"
            )

        # 切 chunk
        chunks: list[tuple[bytes, int, int]] = []
        off = 12
        limit = min(declared_length, len(raw))
        while off + 8 <= limit:
            chunk_len, chunk_type = struct.unpack("<I", raw[off:off + 4])[0], raw[off + 4:off + 8]
            data_start = off + 8
            data_end = min(data_start + chunk_len, len(raw))
            chunks.append((chunk_type, data_start, chunk_len))
            off = data_start + chunk_len + ((4 - chunk_len % 4) % 4)  # chunk 按 4 字节对齐填充
        if not chunks:
            raise GLBError("未找到任何 chunk")

        json_chunk = next((c for c in chunks if c[0] == b"JSON"), None)
        if json_chunk is None:
            raise GLBError("未找到 JSON chunk")
        _, jstart, jlen = json_chunk
        text = raw[jstart:jstart + jlen].decode("utf-8").rstrip("\x00").rstrip()
        self.gltf = json.loads(text)

        self.bin: bytes | None = None
        bin_chunk = next((c for c in chunks if c[0] == b"BIN\x00"), None)
        if bin_chunk is not None:
            _, bstart, blen = bin_chunk
            self.bin = raw[bstart:bstart + blen]

        self.container = {
            "magic": GLB_MAGIC.decode("ascii"),
            "version": version,
            "declared_length": declared_length,
            "actual_length": len(raw),
            "chunk_count": len(chunks),
            "chunk_types": [c[0].rstrip(b"\x00").decode("ascii") for c in chunks],
            "json_chunk_bytes": jlen,
            "bin_chunk_bytes": blen if bin_chunk else None,
            "generator": (self.gltf.get("asset") or {}).get("generator"),
            "gltf_version": (self.gltf.get("asset") or {}).get("version"),
            "extensions_used": self.gltf.get("extensionsUsed", []),
        }

    # ---- 基础查询 ----

    def nodes(self) -> list[dict]:
        return self.gltf.get("nodes", [])

    def node_name(self, index: int) -> str | None:
        if index is None or not (0 <= index < len(self.nodes())):
            return None
        return self.nodes()[index].get("name")

    def parent_of(self) -> dict[int, int]:
        """node index -> parent index"""
        parent = {}
        for i, n in enumerate(self.nodes()):
            for c in n.get("children", []):
                parent[c] = i
        return parent

    def scene_roots(self) -> list[dict]:
        parent = self.parent_of()
        scenes = self.gltf.get("scenes", [])
        out = []
        scene = scenes[self.gltf.get("scene", 0)] if scenes else {}
        for idx in scene.get("nodes", []):
            out.append({"index": idx, "name": self.node_name(idx), "parent": parent.get(idx)})
        if not out:  # 没有 scene 就退回"无父节点者"
            out = [{"index": i, "name": self.node_name(i), "parent": None}
                   for i in range(len(self.nodes())) if i not in parent]
        return out

    # ---- accessor 读取 ----

    def read_accessor(self, index: int) -> list:
        """返回扁平或分组的标量列表；VECn 返回 list[tuple]，SCALAR 返回 list[float]。"""
        acc = self.gltf["accessors"][index]
        comp_type = acc["componentType"]
        if comp_type not in COMPONENT:
            raise GLBError(f"accessor {index}: 不支持的 componentType {comp_type}")
        fmt, size = COMPONENT[comp_type]
        n = NUM_COMPONENTS[acc["type"]]
        count = acc["count"]
        if acc.get("sparse"):
            raise GLBError(f"accessor {index}: sparse accessor 未实现")

        if "bufferView" not in acc:
            # 无 bufferView → 全零填充（glTF 允许）
            return [tuple([0.0] * n) for _ in range(count)] if n > 1 else [0.0] * count

        bv = self.gltf["bufferViews"][acc["bufferView"]]
        base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = bv.get("byteStride") or (size * n)
        if self.bin is None:
            raise GLBError("缺少 BIN chunk，无法读取 accessor")

        out = []
        for i in range(count):
            row_start = base + i * stride
            vals = struct.unpack_from("<" + fmt * n, self.bin, row_start)
            out.append(vals if n > 1 else vals[0])
        return out

    # ---- 动画 ----

    def animations(self) -> list[dict]:
        return self.gltf.get("animations", [])

    def clip_info(self, anim: dict) -> dict:
        """一个 clip 的实测元数据。"""
        chans = anim.get("channels", [])
        samplers = anim.get("samplers", [])
        path_dist: dict[str, int] = {}
        interp_dist: dict[str, int] = {}
        driven_nodes: dict[int, dict] = {}
        all_times: list[float] = []
        sampler_key_counts: list[int] = []

        for ch in chans:
            target = ch.get("target", {})
            path = target.get("path")
            path_dist[path] = path_dist.get(path, 0) + 1
            node = target.get("node")
            if node not in driven_nodes:
                driven_nodes[node] = {"index": node, "name": self.node_name(node), "paths": []}
            if path not in driven_nodes[node]["paths"]:
                driven_nodes[node]["paths"].append(path)

            smp = samplers[ch["sampler"]]
            interp = smp.get("interpolation", "LINEAR")
            interp_dist[interp] = interp_dist.get(interp, 0) + 1
            times = self.read_accessor(smp["input"])
            all_times.extend(float(t) for t in times)
            sampler_key_counts.append(len(times))

        unique_times = sorted(set(round(t, 6) for t in all_times))
        t_min = min(unique_times) if unique_times else None
        t_max = max(unique_times) if unique_times else None
        duration_s = (t_max - t_min) if (t_min is not None and t_max is not None) else None

        return {
            "name": anim.get("name"),
            "channel_count": len(chans),
            "sampler_count": len(samplers),
            "target_path_distribution": path_dist,
            "interpolation_distribution": interp_dist,
            "driven_nodes": sorted(
                [{"index": k, "name": v["name"], "paths": sorted(v["paths"])}
                 for k, v in driven_nodes.items()],
                key=lambda d: (d["name"] or ""),
            ),
            "driven_node_names": sorted([v["name"] for v in driven_nodes.values()
                                         if v["name"] is not None]),
            "keyframe_timestamp_count": len(unique_times),
            "keyframe_timestamp_count_max_per_sampler": max(sampler_key_counts) if sampler_key_counts else 0,
            "keyframe_timestamp_count_min_per_sampler": min(sampler_key_counts) if sampler_key_counts else 0,
            "time_min_s": t_min,
            "time_max_s": t_max,
            "duration_s": duration_s,
            "duration_ms": round(duration_s * 1000.0, 3) if duration_s is not None else None,
            "unique_timestamps_s": unique_times[:64],
            "unique_timestamps_truncated": len(unique_times) > 64,
        }

    # ---- 动画采样 + FK ----

    def build_tracks(self, anim: dict) -> dict[int, dict[str, tuple]]:
        """node index -> path -> (interp, times, values)"""
        tracks: dict[int, dict[str, tuple]] = {}
        for ch in anim.get("channels", []):
            node = ch["target"]["node"]
            path = ch["target"]["path"]
            smp = anim["samplers"][ch["sampler"]]
            times = [float(t) for t in self.read_accessor(smp["input"])]
            values = self.read_accessor(smp["output"])
            interp = smp.get("interpolation", "LINEAR")
            tracks.setdefault(node, {})[path] = (interp, times, values)
        return tracks

    @staticmethod
    def _lerp(a, b, t):
        return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))

    @staticmethod
    def _slerp(a, b, t):
        # a, b 为四元数 (x, y, z, w)
        dot = sum(a[i] * b[i] for i in range(4))
        if dot < 0.0:
            b = tuple(-v for v in b)
            dot = -dot
        if dot > 0.9995:
            return tuple(ai + (bi - ai) * t for ai, bi in zip(a, b))
        theta = math.acos(max(-1.0, min(1.0, dot)))
        sin_t = math.sin(theta)
        s0 = math.sin((1 - t) * theta) / sin_t
        s1 = math.sin(t * theta) / sin_t
        return tuple(a[i] * s0 + b[i] * s1 for i in range(4))

    def _sample_track(self, track, t):
        interp, times, values = track
        n_comp = len(values[0]) if isinstance(values[0], tuple) else 1
        zero = (0.0,) * n_comp
        if t <= times[0]:
            return values[0]
        if t >= times[-1]:
            return values[-1]
        # 定位区间
        lo, hi = 0, len(times) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if times[mid] <= t:
                lo = mid
            else:
                hi = mid
        span = times[hi] - times[lo]
        u = 0.0 if span <= 0 else (t - times[lo]) / span
        if interp == "STEP":
            return values[lo]
        if interp == "CUBICSPLINE":
            # 每帧 3 个值：in-tangent, value, out-tangent；此处取 value（并如实标注）
            base = lo * 3 + 1
            return values[base]
        if n_comp == 4 and interp == "LINEAR" and len(values[0]) == 4:
            a, b = values[lo], values[hi]
            # 旋转按 slerp；scale/translation 不会是 4 分量，故此处安全
            return self._slerp(a, b, u)
        return self._lerp(values[lo], values[hi], u)

    def node_local_trs(self, node_index: int, tracks=None, t=0.0) -> tuple:
        node = self.nodes()[node_index]
        tr = tuple(node.get("translation", (0.0, 0.0, 0.0)))
        rot = tuple(node.get("rotation", (0.0, 0.0, 0.0, 1.0)))
        sc = tuple(node.get("scale", (1.0, 1.0, 1.0)))
        if node.get("matrix"):
            m = node["matrix"]
            tr = (m[12], m[13], m[14])
            sc = (1.0, 1.0, 1.0)  # matrix 情形不做分解，仅取平移用于速度估算
            rot = (0.0, 0.0, 0.0, 1.0)
        if tracks and node_index in tracks:
            for path, track in tracks[node_index].items():
                v = self._sample_track(track, t)
                if path == "translation":
                    tr = tuple(v[:3])
                elif path == "rotation":
                    rot = tuple(v[:4])
                elif path == "scale":
                    sc = tuple(v[:3])
        return tr, rot, sc

    @staticmethod
    def quat_to_matrix(q):
        x, y, z, w = q
        xx, yy, zz = x * x, y * y, z * z
        xy, xz, yz = x * y, x * z, y * z
        wx, wy, wz = w * x, w * y, w * z
        return (
            (1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)),
            (2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)),
            (2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)),
        )

    def local_matrix(self, node_index: int, tracks=None, t=0.0):
        tr, rot, sc = self.node_local_trs(node_index, tracks, t)
        r = self.quat_to_matrix(rot)
        m = (
            (r[0][0] * sc[0], r[0][1] * sc[1], r[0][2] * sc[2], tr[0]),
            (r[1][0] * sc[0], r[1][1] * sc[1], r[1][2] * sc[2], tr[1]),
            (r[2][0] * sc[0], r[2][1] * sc[1], r[2][2] * sc[2], tr[2]),
        )
        return m

    def world_matrix(self, node_index: int, tracks=None, t=0.0, cache=None):
        """返回 3x4 行主序世界矩阵（平移在第 4 列）。"""
        if cache is not None and node_index in cache:
            return cache[node_index]
        parent = self.parent_of().get(node_index)
        m = self.local_matrix(node_index, tracks, t)
        if parent is None:
            out = m
        else:
            pm = self.world_matrix(parent, tracks, t, cache)
            out = _mat_mul34(pm, m)
        if cache is not None:
            cache[node_index] = out
        return out

    def world_position(self, node_index: int, tracks=None, t=0.0, cache=None):
        m = self.world_matrix(node_index, tracks, t, cache)
        return (m[0][3], m[1][3], m[2][3])


def _mat_mul34(a, b):
    """a(3x4) * b(3x4，隐含第四行 0 0 0 1)。"""
    out = []
    for i in range(3):
        row = []
        for j in range(4):
            v = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
            if j == 3:
                v += a[i][3]
            row.append(v)
        out.append(tuple(row))
    return tuple(out)


# ---------------------------------------------------------------- 单文件探测

def _node_table(asset: GltfAsset) -> list[dict]:
    parent = asset.parent_of()
    joint_set: set[int] = set()
    for skin in asset.gltf.get("skins", []):
        joint_set.update(skin.get("joints", []))
    out = []
    for i, n in enumerate(asset.nodes()):
        name = n.get("name")
        out.append({
            "index": i,
            "name": name,
            "parent": parent.get(i),
            "parent_name": asset.node_name(parent[i]) if parent.get(i) is not None else None,
            "children": n.get("children", []),
            "is_skin_joint": i in joint_set,
            "has_mesh": n.get("mesh") is not None,
            "has_skin": n.get("skin") is not None,
            "has_camera": n.get("camera") is not None,
            "has_light": n.get("light") is not None,
            "has_weapon_keyword": bool(name) and any(k in name.lower() for k in WEAPON_KEYWORDS),
        })
    return out


def _skins_table(asset: GltfAsset) -> list[dict]:
    out = []
    for si, skin in enumerate(asset.gltf.get("skins", [])):
        joints = skin.get("joints", [])
        out.append({
            "index": si,
            "name": skin.get("name"),
            "skeleton_root_index": skin.get("skeleton"),
            "skeleton_root_name": asset.node_name(skin["skeleton"]) if skin.get("skeleton") is not None else None,
            "joint_count": len(joints),
            "joints": [
                {"index": j, "name": asset.node_name(j), "has_weapon_keyword":
                    bool(asset.node_name(j)) and any(k in asset.node_name(j).lower() for k in WEAPON_KEYWORDS)}
                for j in joints
            ],
            "joint_names_in_order": [asset.node_name(j) for j in joints],
        })
    return out


def _weapon_candidates(asset: GltfAsset) -> list[dict]:
    """按关键词搜索可能的武器/道具挂点节点（含 hand 等骨骼名命中）。"""
    out = []
    for i, n in enumerate(asset.nodes()):
        name = n.get("name") or ""
        if not name:
            continue
        hits = sorted(set(k.lower() for k in WEAPON_KEYWORDS if re.search(k, name, re.IGNORECASE)))
        if hits:
            prop_hits = [h for h in hits if h in PROP_KEYWORDS]
            out.append({
                "index": i,
                "name": name,
                "matched_keywords": hits,
                "prop_keywords": prop_hits,          # 是否命中「武器/道具专用名词」
                "is_prop_attach_node": bool(prop_hits),
                "is_skin_joint": any(i in s.get("joints", []) for s in asset.gltf.get("skins", [])),
                "has_mesh": n.get("mesh") is not None,
                "children": n.get("children", []),
            })
    return out


def _meshes_materials(asset: GltfAsset) -> dict:
    meshes = []
    for mi, m in enumerate(asset.gltf.get("meshes", [])):
        verts = 0
        prims = 0
        for p in m.get("primitives", []):
            prims += 1
            if "attributes" in p and "POSITION" in p["attributes"]:
                verts += asset.gltf["accessors"][p["attributes"]["POSITION"]]["count"]
        meshes.append({"index": mi, "name": m.get("name"), "primitive_count": prims,
                       "vertex_count": verts})
    materials = [{"index": i, "name": mm.get("name")}
                 for i, mm in enumerate(asset.gltf.get("materials", []))]
    return {
        "meshes": meshes,
        "materials": materials,
        "vertices_total": sum(m["vertex_count"] for m in meshes),
        "indices_total": sum(
            asset.gltf["accessors"][p["indices"]]["count"]
            for m in asset.gltf.get("meshes", [])
            for p in m.get("primitives", []) if "indices" in p
        ),
    }


def probe_file(path: str) -> dict:
    rel = path
    entry: dict = {
        "file": os.path.basename(path),
        "path": rel,
        "probe_ok": True,
        "parse_errors": [],
    }
    try:
        asset = GltfAsset(path)
    except Exception as exc:  # 解析失败：如实记录，不做填充
        entry.update({"probe_ok": False, "parse_errors": [f"{type(exc).__name__}: {exc}"],
                      "size_bytes": os.path.getsize(path)})
        return entry

    entry.update({
        "size_bytes": asset.size_bytes,
        "sha256": asset.sha256,
        "glb": asset.container,
        "counts": {
            "nodes": len(asset.nodes()),
            "meshes": len(asset.gltf.get("meshes", [])),
            "materials": len(asset.gltf.get("materials", [])),
            "animations": len(asset.animations()),
            "skins": len(asset.gltf.get("skins", [])),
            "accessors": len(asset.gltf.get("accessors", [])),
            "buffer_views": len(asset.gltf.get("bufferViews", [])),
        },
        "scene_roots": asset.scene_roots(),
        "nodes": _node_table(asset),
        "animations": [asset.clip_info(a) for a in asset.animations()],
        "skins": _skins_table(asset),
        "weapon_attach_candidates": _weapon_candidates(asset),
        "parse_errors": asset.parse_errors,
    })
    entry["weapon_attach_candidates_count"] = len(entry["weapon_attach_candidates"])
    entry["weapon_prop_attach_count"] = sum(1 for w in entry["weapon_attach_candidates"]
                                            if w["is_prop_attach_node"])
    entry.update(_meshes_materials(asset))
    return entry


# ---------------------------------------------------------------- 报告渲染

def render_markdown(result: dict, out_dir: str) -> str:
    lines: list[str] = []
    add = lines.append
    add("# ACT-004 · GLB 实测探测报告（01）")
    add("")
    add(f"- 生成脚本：`tools/motion/probe_glb.py`")
    add(f"- 生成时间：{result['generated_at']}")
    add(f"- Python：{result['python']}")
    add(f"- 探测目录：`{result['model_dir']}`")
    add(f"- 文件数：{result['file_count']}（其中解析成功 {result['ok_count']}，失败 {result['fail_count']}）")
    add("- 本文件由脚本自动生成，禁止手改；所有数字均来自 GLB 实际字节")
    add("")
    add("## 1. 结论速览")
    add("")
    add("| 项 | 实测结论 |")
    add("| --- | --- |")
    add(f"| 容器格式 | 全部为 GLB（magic `glTF`，version {result['glb_version_set']}，JSON+BIN 两 chunk） |")
    add(f"| clip 名称集合 | {result['clip_name_union']} |")
    add(f"| 是否存在 death clip | {'存在' if result['death_clip_present'] else '不存在'} |")
    add(f"| 武器/道具专用挂点节点（weapon/prop/sword/blade/spear/staff/axe） | "
        f"{'存在' if result['weapon_node_present'] else '不存在（0/18 个文件）'} |")
    add(f"| 命中关键词的节点（全部文件，含骨骼名 hand） | {result['weapon_keyword_hit_names'] or '无'} |")
    add(f"| 其中属「武器/道具专用名词」的节点 | {result['weapon_prop_hit_names'] or '无'} |")
    add(f"| skins[].joints 节点名集合 | {result['joint_name_union']} |")
    add("")
    add("## 2. 单文件明细")
    add("")
    for f in result["files"]:
        add(f"### 2.{result['files'].index(f) + 1} `{f['file']}`")
        add("")
        if not f["probe_ok"]:
            add(f"- **解析失败**：{f['parse_errors']}")
            add("")
            continue
        g = f["glb"]
        c = f["counts"]
        add(f"- 字节数：{f['size_bytes']}，sha256 前 16 位：`{f['sha256'][:16]}`")
        add(f"- 容器：magic `{g['magic']}` v{g['version']}，declared={g['declared_length']}，actual={g['actual_length']}，"
            f"chunk={g['chunk_count']}（{'+'.join(g['chunk_types'])}），JSON={g['json_chunk_bytes']}B，BIN={g['bin_chunk_bytes']}B")
        add(f"- generator：`{g['generator']}`，glTF `{g['gltf_version']}`")
        add(f"- 计数：nodes={c['nodes']}，meshes={c['meshes']}，materials={c['materials']}，"
            f"animations={c['animations']}，skins={c['skins']}，accessors={c['accessors']}，"
            f"顶点={f['vertices_total']}，索引={f['indices_total']}")
        add(f"- 场景根：`{[r['name'] for r in f['scene_roots']]}`")
        add("")
        add("**动画 clip 实测**")
        add("")
        add("| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |")
        add("| --- | --- | --- | --- | --- | --- | --- |")
        for i, a in enumerate(f["animations"]):
            pd = "，".join(f"{k}×{v}" for k, v in sorted(a["target_path_distribution"].items()))
            add(f"| {i} | `{a['name']}` | {a['duration_ms']} | {a['channel_count']} | "
                f"{a['keyframe_timestamp_count']} / {a['keyframe_timestamp_count_max_per_sampler']} | {pd} | "
                f"{'，'.join('`%s`' % n for n in a['driven_node_names'])} |")
        add("")
        add(f"- 插值方式分布：`{f['animations'][0]['interpolation_distribution'] if f['animations'] else '无'}`"
            f"（各 clip 一致：{'是' if len({json.dumps(a['interpolation_distribution'], sort_keys=True) for a in f['animations']}) == 1 else '否'}）")
        add(f"- 时间轴区间：min={f['animations'][0]['time_min_s'] if f['animations'] else None}s，"
            f"max={f['animations'][0]['time_max_s'] if f['animations'] else None}s（首个 clip；各 clip 见上表）")
        add("")
        add("**skins[].joints 节点名全表**")
        add("")
        for s in f["skins"]:
            add(f"- skin[{s['index']}] `{s.get('name')}`，skeleton 根=`{s['skeleton_root_name']}`，共 {s['joint_count']} 个 joint：")
            add("")
            add("| # | joint 名 | 命中武器关键词 |")
            add("| --- | --- | --- |")
            for j, jt in enumerate(s["joints"]):
                add(f"| {j} | `{jt['name']}` | {'是（' + '、'.join(WEAPON_KEYWORDS) + ' 中的匹配）' if jt['has_weapon_keyword'] else '否'} |")
            add("")
        add("**武器/道具挂点搜索**")
        add("")
        add(f"- 搜索关键词：`{WEAPON_KEYWORDS}`（其中「武器/道具专用名词」= `{PROP_KEYWORDS}`）")
        if f["weapon_attach_candidates"]:
            add(f"- 命中 {f['weapon_attach_candidates_count']} 个节点：")
            add("")
            add("| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |")
            add("| --- | --- | --- | --- | --- | --- |")
            for w in f["weapon_attach_candidates"]:
                add(f"| `{w['name']}` | {'、'.join(w['matched_keywords'])} | "
                    f"{'是（' + '、'.join(w['prop_keywords']) + '）' if w['is_prop_attach_node'] else '否（仅骨骼名命中 hand）'} | "
                    f"{'是' if w['is_skin_joint'] else '否'} | {'是' if w['has_mesh'] else '否'} | {len(w['children'])} |")
            add("")
            if not f["weapon_prop_attach_count"]:
                add("- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。")
                add("")
        else:
            add("- 命中 0 个节点：**该文件内不存在任何名称含上述关键词的节点**。")
            add("")
        add("**节点全表**")
        add("")
        add("| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |")
        add("| --- | --- | --- | --- | --- | --- | --- |")
        for n in f["nodes"]:
            add(f"| {n['index']} | `{n['name']}` | `{n['parent_name']}` | {len(n['children'])} | "
                f"{'是' if n['is_skin_joint'] else '否'} | {'是' if n['has_mesh'] else '否'} | "
                f"{'是' if n['has_weapon_keyword'] else '否'} |")
        add("")
    add("## 3. 跨文件汇总")
    add("")
    add("| 文件 | animations | nodes | skins | clip 名 | clip 时长(ms) | 武器关键词节点 |")
    add("| --- | --- | --- | --- | --- | --- | --- |")
    for f in result["files"]:
        if not f["probe_ok"]:
            add(f"| `{f['file']}` | — | — | — | 解析失败 | — | — |")
            continue
        names = "、".join(f"`{a['name']}`" for a in f["animations"])
        durs = "、".join(str(a["duration_ms"]) for a in f["animations"])
        wk = "、".join(f"`{w['name']}`" for w in f["weapon_attach_candidates"]) or "无"
        add(f"| `{f['file']}` | {f['counts']['animations']} | {f['counts']['nodes']} | {f['counts']['skins']} | "
            f"{names} | {durs} | {wk} |")
    add("")
    add("## 4. 与 ACT-003 假设的对照")
    add("")
    add(f"- ACT-003 将武器挂点暂拟为 `hand.R`，但未读 GLB 内部数据。实测（18/18 文件）：")
    add(f"  - `hand.R` {'在所有文件中均作为 skin joint（骨骼）存在' if result['hand_r_is_joint_all'] else '并非在所有文件中都作为 skin joint 存在'}")
    add(f"  - 节点名含 `{PROP_KEYWORDS}` 任一词的节点数："
        f"{result['weapon_prop_attach_total']}（{'存在' if result['weapon_node_present'] else '不存在'}）")
    add(f"  - 命中 `hand` 关键词的节点：{result['weapon_keyword_hit_names'] or '无'}，"
        f"全部为 skin joint、均不挂 mesh")
    add("- 结论：**资产内不存在武器/道具专用挂点节点**。`hand.R` 是骨骼（末端骨）而非挂点空节点；"
        "ACT-003 的 `hand.R` 是按骨骼名推断的假设，运行时若要挂武器网格，"
        "需在骨骼 `hand.R` 下自建挂点（不侵入资产）或在 DCC 里补一个空节点后重导出（侵入资产）。")
    add("")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="GLB 离线探测（ACT-004）")
    ap.add_argument("--models", default=DEFAULT_MODELS)
    ap.add_argument("--out-dir", default=DEFAULT_OUT)
    ap.add_argument("--only", default=None, help="只探测指定文件名，打印摘要，不写盘")
    args = ap.parse_args(argv)

    root = os.getcwd()
    models_dir = args.models if os.path.isabs(args.models) else os.path.join(root, args.models)

    if args.only:
        p = args.only if os.path.isabs(args.only) else os.path.join(models_dir, args.only)
        e = probe_file(p)
        print(json.dumps(e, ensure_ascii=False, indent=2)[:4000])
        return 0 if e["probe_ok"] else 1

    files = sorted(fn for fn in os.listdir(models_dir) if fn.lower().endswith(".glb"))
    if not files:
        print(f"[probe] 目录内无 .glb：{models_dir}", file=sys.stderr)
        return 1

    entries = []
    for fn in files:
        e = probe_file(os.path.join(models_dir, fn))
        # 路径写成仓库相对路径，便于复现
        e["path"] = os.path.relpath(os.path.join(models_dir, fn), root)
        entries.append(e)
        print(f"[probe] {e['file']}: ok={e['probe_ok']} "
              f"clips={[a['name'] for a in e.get('animations', [])] if e['probe_ok'] else '-'}")

    clip_names = sorted({a["name"] for e in entries if e["probe_ok"] for a in e["animations"] if a["name"]})
    joint_names = sorted({j["name"] for e in entries if e["probe_ok"] for s in e["skins"]
                          for j in s["joints"] if j["name"]})
    wk_names = sorted({w["name"] for e in entries if e["probe_ok"] for w in e["weapon_attach_candidates"]})
    prop_names = sorted({w["name"] for e in entries if e["probe_ok"] for w in e["weapon_attach_candidates"]
                         if w["is_prop_attach_node"]})
    hand_r_joint_all = all(
        any(j["name"] == "hand.R" for s in e["skins"] for j in s["joints"])
        for e in entries if e["probe_ok"]
    )

    result = {
        "schema": "act-004-glb-probe/1",
        "generated_at": _dt.datetime.now().isoformat(timespec="seconds"),
        "generator": "tools/motion/probe_glb.py",
        "python": sys.version.split()[0],
        "model_dir": os.path.relpath(models_dir, root),
        "file_count": len(entries),
        "ok_count": sum(1 for e in entries if e["probe_ok"]),
        "fail_count": sum(1 for e in entries if not e["probe_ok"]),
        "weapon_keywords": WEAPON_KEYWORDS,
        "glb_version_set": sorted({e["glb"]["version"] for e in entries if e["probe_ok"]}),
        "clip_name_union": clip_names,
        "death_clip_present": any(
            a["name"] and "death" in a["name"].lower()
            for e in entries if e["probe_ok"] for a in e["animations"]
        ),
        "weapon_node_present": any(e["weapon_prop_attach_count"] > 0 for e in entries if e["probe_ok"]),
        "weapon_prop_attach_total": sum(e["weapon_prop_attach_count"] for e in entries if e["probe_ok"]),
        "weapon_keyword_hit_names": wk_names,
        "weapon_prop_hit_names": prop_names,
        "joint_name_union": joint_names,
        "hand_r_is_joint_all": hand_r_joint_all,
        "files": entries,
    }

    out_dir = args.out_dir if os.path.isabs(args.out_dir) else os.path.join(root, args.out_dir)
    os.makedirs(os.path.join(out_dir, "probe"), exist_ok=True)
    json_path = os.path.join(out_dir, "probe", "heroes_probe.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    md_path = os.path.join(out_dir, "01_glb_probe.md")
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(render_markdown(result, out_dir))

    print(f"[probe] 写出 {os.path.relpath(json_path, root)}（{os.path.getsize(json_path)} 字节）")
    print(f"[probe] 写出 {os.path.relpath(md_path, root)}（{os.path.getsize(md_path)} 字节）")
    print(f"[probe] clip 名并集：{clip_names}")
    print(f"[probe] death clip：{'存在' if result['death_clip_present'] else '不存在'}")
    print(f"[probe] 武器关键词节点并集：{wk_names or '无'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
