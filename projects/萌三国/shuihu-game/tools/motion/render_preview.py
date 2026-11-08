#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_preview.py — ACT-004 五动作可播放预览渲染脚本（在 Blender 内执行）

做什么
------
1. Blender 后台导入 hero GLB（bpy.ops.import_scene.gltf）。
2. 读 docs/motion/ACT-004/timing_unified.json 的统一时点表，按表采样 5 个动作
   （idle / move / attack / hit / death），每个动作的采样总时长 ≥ 统一表总时长，
   attack / hit / death 必须覆盖收招段。
3. 逐帧渲染 PNG 到 docs/motion/ACT-004/03_preview/frames/<action>_NN.png。
4. 用 Render Result 像素拼 sprite sheet（docs/motion/ACT-004/03_preview/sprite_sheet.png）。
5. 生成纯本地 preview.html（sprite sheet 以 base64 内嵌，无任何 CDN 引用）。

用法
----
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/render_preview.py \
        -- --hero hero005.glb --fps 12 --cell-w 200 --cell-h 260

    # 可选参数
    --repo <仓库根>  --out <输出目录>  --models <模型目录>  --hero <文件名>
    --fps <采样帧率> --cell-w <单元格宽> --cell-h <单元格高> --engine <EEVEE|CYCLES|WORKBENCH>

资产约束
--------
- 只读 assets/，不修改任何资产文件。
- 只写 docs/motion/ACT-004/ 下的产出。
"""

from __future__ import annotations

import base64
import json
import math
import os
import struct
import sys
import zlib

try:
    import bpy
    from mathutils import Vector
except ImportError:
    print("[render] 本脚本需在 Blender 内执行：\n"
          "  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/render_preview.py "
          "-- --hero hero005.glb")
    sys.exit(2)

# ---------------------------------------------------------------- 参数

def parse_args(argv):
    def get(flag, default, cast=str):
        return cast(argv[argv.index(flag) + 1]) if flag in argv else default
    return {
        "repo": get("--repo", os.getcwd()),
        "models": get("--models", "assets/releases/ART-002/r7/models"),
        "out": get("--out", "docs/motion/ACT-004/03_preview"),
        "hero": get("--hero", "hero005.glb"),
        "fps": get("--fps", 12, int),
        "cell_w": get("--cell-w", 200, int),
        "cell_h": get("--cell-h", 260, int),
        "engine": get("--engine", "EEVEE"),
    }


log = lambda *a: print("[render]", *a, flush=True)

# ---------------------------------------------------------------- 场景搭建

def setup_scene(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = {"EEVEE": "BLENDER_EEVEE", "CYCLES": "CYCLES",
                         "WORKBENCH": "BLENDER_WORKBENCH"}[args["engine"]]
    scn.render.resolution_x = args["cell_w"]
    scn.render.resolution_y = args["cell_h"]
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"
    scn.render.image_settings.color_depth = "8"
    scn.render.fps = 24          # 与 GLB 导出时的 24fps 对齐
    scn.render.fps_base = 1.0
    scn.frame_start = 0

    world = bpy.data.worlds.new("ACT004_World")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.62, 0.65, 0.72, 1.0)
        bg.inputs[1].default_value = 1.0
    scn.world = world
    return scn


def import_model(scn, glb_path):
    bpy.ops.import_scene.gltf(filepath=glb_path)
    arms = [o for o in scn.objects if o.type == "ARMATURE"]
    if not arms:
        raise RuntimeError("导入后未找到 ARMATURE，无法做姿态采样")
    arm = arms[0]
    if not arm.animation_data:
        arm.animation_data_create()
    meshes = [o for o in scn.objects if o.type == "MESH"]
    return arm, meshes


def world_bbox(objs):
    pts = []
    for o in objs:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    if not pts:
        return Vector((0, 0, 0)), Vector((1, 1, 1))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def setup_camera(scn, lo, hi):
    center = (lo + hi) / 2.0
    size = hi - lo
    height = max(size.z, 0.001)
    cam = bpy.data.cameras.new("ACT004_Cam")
    cam.lens = 50
    cam_obj = bpy.data.objects.new("ACT004_Cam", cam)
    scn.collection.objects.link(cam_obj)
    vfov = 2.0 * math.atan(18.0 / cam.lens)          # 35mm 等效：sensor 高 24mm → 半高 12? 用 18 近似
    dist = (height / 2.0) / math.tan(vfov / 2.0) * 1.45
    width_need = max(size.x, size.y)
    dist = max(dist, (width_need / 2.0) / math.tan(vfov / 2.0) * 1.15)
    direction = Vector((0.62, -1.0, 0.30)).normalized()
    cam_obj.location = center + direction * dist + Vector((0, 0, height * 0.06))
    tgt = bpy.data.objects.new("ACT004_Target", None)
    scn.collection.objects.link(tgt)
    tgt.location = center
    con = cam_obj.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    scn.camera = cam_obj

    # 主光 + 补光
    sun = bpy.data.lights.new("ACT004_Key", type="SUN")
    sun.energy = 3.0
    so = bpy.data.objects.new("ACT004_Key", sun)
    scn.collection.objects.link(so)
    so.location = center + Vector((4.0, -4.5, 6.0))
    fill = bpy.data.lights.new("ACT004_Fill", type="SUN")
    fill.energy = 1.0
    fo = bpy.data.objects.new("ACT004_Fill", fill)
    scn.collection.objects.link(fo)
    fo.location = center + Vector((-4.0, 2.0, 3.0))
    return cam_obj, center


# ---------------------------------------------------------------- 姿态采样

def action_by_name(name):
    for a in bpy.data.actions:
        if a.name == name:
            return a
    for a in bpy.data.actions:          # 兼容导出器加后缀的情形
        if a.name.startswith(name):
            return a
    return None


def frame_at(action, t_ms, fps):
    """把毫秒映射到 action 的帧号，并夹在 action 的 frame_range 内。"""
    f0, f1 = action.frame_range
    f = f0 + (t_ms / 1000.0) * fps
    return min(max(f, f0), f1)


def set_pose(arm, action, t_ms, fps, scn):
    arm.animation_data.action = action
    scn.frame_set(int(round(frame_at(action, t_ms, fps))))
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- 渲染

def render_frame(scn, path):
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)


def grab_pixels(path, w, h):
    """取一帧的 RGBA 字节。（保留接口：Blender 5 后台 Render Result 尺寸可能为 0，
    故 sheet 组装统一走下方的纯 Python PNG 编解码，不依赖 Render Result。）"""
    rr = bpy.data.images.get("Render Result")
    if rr is not None and tuple(rr.size) == (w, h):
        return list(rr.pixels), "Render Result"
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    bpy.data.images.remove(img)
    return px, "PNG reload"


# ---------------------------------------------------------------- 纯 Python PNG

def decode_png_rgba8(path):
    """解码 8bit RGBA、非隔行的 PNG → (w, h, bytearray)。行序与文件一致（自上而下）。"""
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是 PNG")
    pos, chunks = 8, []
    w = h = None
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            w, h, bd, ct, comp, filt, il = struct.unpack(">IIBBBBB", body)
            if not (bd == 8 and ct == 6 and il == 0):
                raise ValueError(f"不支持的 PNG 格式 bd={bd} ct={ct} interlace={il}")
        elif typ == b"IDAT":
            chunks.append(body)
        elif typ == b"IEND":
            break
        pos += 12 + ln
    raw = zlib.decompress(b"".join(chunks))
    bpp, stride = 4, w * 4
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        elif f != 0:
            raise ValueError(f"未知 PNG filter {f}")
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, out


def encode_png_rgba8(path, w, h, rgba):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)                       # filter 0
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(typ, body):
        return (struct.pack(">I", len(body)) + typ + body +
                struct.pack(">I", zlib.crc32(typ + body) & 0xFFFFFFFF))

    blob = b"\x89PNG\r\n\x1a\n"
    blob += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    blob += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    blob += chunk(b"IEND", b"")
    open(path, "wb").write(blob)


def compose_sheet(frames_dir, plan, order, cell_w, cell_h, out_path):
    """用渲染好的 PNG 帧拼 sprite sheet：第 0 行在视觉顶部，逐行向下，无行序翻转。"""
    cols = max(p["n"] for p in plan.values())
    rows = len(order)
    sheet_w, sheet_h = cols * cell_w, rows * cell_h
    sheet = bytearray(sheet_w * sheet_h * 4)
    stats = {}
    for r, a in enumerate(order):
        nonempty = 0
        for i in range(plan[a]["n"]):
            path = os.path.join(frames_dir, f"{a}_{i:02d}.png")
            fw, fh, px = decode_png_rgba8(path)
            if (fw, fh) != (cell_w, cell_h):
                log(f"  !! {path} 尺寸 {(fw, fh)} 与单元格 {(cell_w, cell_h)} 不一致")
            alpha_max = max(px[3::4])
            if alpha_max > 8:
                nonempty += 1
            for y in range(min(cell_h, fh)):
                src = y * fw * 4
                dst = ((r * cell_h + y) * sheet_w + i * cell_w) * 4
                sheet[dst:dst + min(cell_w, fw) * 4] = px[src:src + min(cell_w, fw) * 4]
        stats[a] = {"frames": plan[a]["n"], "nonempty": nonempty}
    encode_png_rgba8(out_path, sheet_w, sheet_h, sheet)
    return sheet_w, sheet_h, cols, rows, stats


def paste_cell(sheet, sheet_w, cell_w, cell_h, rows, col, row, pixels, frame_w, frame_h):
    """把一帧像素粘贴到 sheet 的指定格子。

    Blender 图像行序自下而上（index 0 在底部），而 sprite sheet 的第 0 行要在视觉顶部，
    故格子所在行带需翻转：band = (rows - 1 - row) * cell_h。
    """
    band = (rows - 1 - row) * cell_h
    for y in range(min(cell_h, frame_h)):
        src = y * frame_w * 4
        dst = ((band + y) * sheet_w + col * cell_w) * 4
        sheet[dst:dst + min(cell_w, frame_w) * 4] = pixels[src:src + min(cell_w, frame_w) * 4]


# ---------------------------------------------------------------- HTML

HTML_TMPL = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>ACT-004 · {hero} 五动作预览（纯本地）</title>
<style>
  :root {{ --bg:#12141a; --fg:#e8ecf4; --dim:#8b93a7; --line:#2a2f3d; --hi:#ffb454; --imp:#ff5d5d; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; padding:18px; background:var(--bg); color:var(--fg);
         font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; }}
  h1 {{ font-size:18px; margin:0 0 4px; }}
  .sub {{ color:var(--dim); font-size:12px; margin-bottom:14px; }}
  .wrap {{ display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }}
  .stage {{ background:#0c0e13; border:1px solid var(--line); border-radius:10px; padding:10px; }}
  #view {{ width:{stage_w}px; height:{stage_h}px; background:transparent; image-rendering:auto;
           border:1px solid var(--line); border-radius:6px; }}
  .panel {{ min-width:280px; }}
  .actions {{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }}
  .actions button {{ background:#1c2130; color:var(--fg); border:1px solid var(--line);
                     border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; }}
  .actions button.on {{ background:var(--hi); color:#1a1206; border-color:var(--hi); font-weight:600; }}
  .ctl button {{ background:#1c2130; color:var(--fg); border:1px solid var(--line);
                 border-radius:6px; padding:5px 10px; cursor:pointer; margin-right:6px; }}
  .readout {{ margin-top:12px; border:1px solid var(--line); border-radius:8px; padding:10px 12px;
              background:#151924; }}
  .readout table {{ border-collapse:collapse; width:100%; font-size:13px; }}
  .readout td {{ padding:2px 8px 2px 0; }}
  .readout td.k {{ color:var(--dim); width:96px; }}
  .badge {{ display:inline-block; padding:1px 7px; border-radius:10px; font-size:12px;
            border:1px solid var(--line); color:var(--dim); }}
  .badge.hit {{ color:#fff; background:var(--imp); border-color:var(--imp); }}
  .badge.rec {{ color:#1a1206; background:var(--hi); border-color:var(--hi); }}
  .bar {{ height:10px; background:#222836; border-radius:5px; overflow:hidden; position:relative;
          margin-top:8px; border:1px solid var(--line); }}
  .bar .now {{ position:absolute; top:0; bottom:0; width:2px; background:#fff; }}
  .bar .imp {{ position:absolute; top:0; bottom:0; background:var(--imp); opacity:.55; }}
  .bar .rec {{ position:absolute; top:0; bottom:0; background:var(--hi); opacity:.45; }}
  .warn {{ margin-top:10px; padding:8px 10px; border:1px solid #6b4b1f; background:#241a0c;
           color:#ffcf8a; border-radius:8px; font-size:12.5px; }}
  .note {{ color:var(--dim); font-size:12px; margin-top:10px; }}
  table.timing {{ border-collapse:collapse; margin-top:10px; font-size:12.5px; width:100%; }}
  table.timing th, table.timing td {{ border:1px solid var(--line); padding:3px 8px; text-align:right; }}
  table.timing th {{ color:var(--dim); font-weight:500; }}
  table.timing td:first-child, table.timing th:first-child {{ text-align:left; }}
</style>
</head>
<body>
<h1>ACT-004 · {hero} 五动作预览</h1>
<div class="sub">sprite sheet 以 base64 内嵌于本文件，无 CDN、无外部请求；帧率 {fps} fps，单元格 {cw}×{ch}px。全部时点来自 <code>timing_unified.json</code> 实测裁决。</div>

<div class="wrap">
  <div class="stage">
    <canvas id="view" width="{stage_w}" height="{stage_h}"></canvas>
    <div class="bar" id="bar"></div>
  </div>

  <div class="panel">
    <div class="actions" id="actions"></div>
    <div class="ctl">
      <button id="btnPlay">暂停</button>
      <button id="btnStepB">◀ 上一帧</button>
      <button id="btnStepF">下一帧 ▶</button>
      <button id="btnLoop">循环：开</button>
    </div>
    <div class="readout">
      <table>
        <tr><td class="k">动作</td><td id="rAct">—</td></tr>
        <tr><td class="k">帧</td><td id="rFrame">—</td></tr>
        <tr><td class="k">当前时刻</td><td id="rMs">—</td></tr>
        <tr><td class="k">窗口</td><td id="rWin">—</td></tr>
        <tr><td class="k">命中</td><td id="rImp">—</td></tr>
        <tr><td class="k">收招</td><td id="rRec">—</td></tr>
        <tr><td class="k">总时长</td><td id="rTot">—</td></tr>
        <tr><td class="k">来源 clip</td><td id="rClip">—</td></tr>
      </table>
    </div>
    <div id="deathWarn" class="warn" style="display:none">
      <b>death 非资产原生</b>：18/18 个 hero GLB 内均无 death 片段。此处 death = hit 末段姿态 + 姿态下沉的合成结果，仅用于预览节奏，不能当作资产原生动画验收。
    </div>
    <div class="note">命中窗口 = 统一表 impact_ms ± 一帧（{frame_ms} ms）；收招窗口 = impact_ms → total_ms。</div>
    <table class="timing" id="timing"></table>
  </div>
</div>

<script>
const META = {meta_json};
const CELL = {{ w: META.cell_w, h: META.cell_h }};
const FPS = META.fps;
const FRAME_MS = 1000 / FPS;
const ORDER = META.order;

const img = new Image();
img.src = "data:image/png;base64," + META.sheet_b64;

const cv = document.getElementById("view");
const ctx = cv.getContext("2d");
let cur = ORDER[0], playing = true, loop = true, idx = 0;

function act(a) {{ return META.actions[a]; }}
function frames(a) {{ return act(a).frames; }}

function draw() {{
  const a = act(cur);
  const row = ORDER.indexOf(cur);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (img.complete && img.naturalWidth) {{
    ctx.drawImage(img, idx * CELL.w, row * CELL.h, CELL.w, CELL.h, 0, 0, CELL.w, CELL.h);
  }}
  const t = idx * FRAME_MS;
  const imp = a.impact_ms, tot = a.total_ms;
  let win = "—", cls = "";
  if (imp !== null) {{
    if (Math.abs(t - imp) <= FRAME_MS) {{ win = "命中窗口"; cls = "hit"; }}
    else if (t >= imp) {{ win = "收招窗口"; cls = "rec"; }}
    else {{ win = "起手窗口"; }}
  }} else if (a.native === false) {{
    win = "合成（无原生片段）";
  }} else {{
    win = "循环";
  }}
  document.getElementById("rAct").textContent = cur + (a.native === false ? "（合成）" : "");
  document.getElementById("rFrame").textContent = (idx + 1) + " / " + frames(cur);
  document.getElementById("rMs").textContent = Math.round(t) + " ms";
  document.getElementById("rWin").innerHTML = '<span class="badge ' + cls + '">' + win + '</span>';
  document.getElementById("rImp").textContent = imp === null ? "—" : imp + " ms";
  document.getElementById("rRec").textContent = a.recovery_ms === null ? "—" : a.recovery_ms + " ms";
  document.getElementById("rTot").textContent = tot + " ms";
  document.getElementById("rClip").textContent = a.clip || "无（合成）";

  const bar = document.getElementById("bar");
  bar.innerHTML = "";
  if (imp !== null) {{
    const i1 = document.createElement("div");
    i1.className = "imp";
    i1.style.left = "0%"; i1.style.width = Math.max(0, Math.min(100, imp / tot * 100)) + "%";
    bar.appendChild(i1);
    const r1 = document.createElement("div");
    r1.className = "rec";
    r1.style.left = (imp / tot * 100) + "%";
    r1.style.width = Math.max(0, 100 - imp / tot * 100) + "%";
    bar.appendChild(r1);
  }}
  const nowMark = document.createElement("div");
  nowMark.className = "now";
  nowMark.style.left = Math.max(0, Math.min(100, t / tot * 100)) + "%";
  bar.appendChild(nowMark);
}}

function step() {{
  idx++;
  if (idx >= frames(cur)) {{
    if (loop || act(cur).loop) idx = 0; else {{ idx = frames(cur) - 1; playing = false; syncBtn(); }}
  }}
  draw();
}}

let timer = null;
function syncBtn() {{ document.getElementById("btnPlay").textContent = playing ? "暂停" : "播放"; }}
function restart() {{
  if (timer) clearInterval(timer);
  timer = setInterval(step, FRAME_MS);
  syncBtn();
}}

const box = document.getElementById("actions");
ORDER.forEach(a => {{
  const b = document.createElement("button");
  b.textContent = a + " (" + act(a).total_ms + "ms)";
  b.dataset.act = a;
  b.onclick = () => {{ cur = a; idx = 0; draw();
    document.querySelectorAll("#actions button").forEach(x => x.classList.toggle("on", x.dataset.act === a));
    document.getElementById("deathWarn").style.display = (a === "death") ? "block" : "none";
  }};
  box.appendChild(b);
}});
document.querySelector("#actions button").classList.add("on");

document.getElementById("btnPlay").onclick = () => {{ playing = !playing;
  if (playing) restart(); else {{ if (timer) clearInterval(timer); syncBtn(); }} }};
document.getElementById("btnStepF").onclick = () => {{ idx = (idx + 1) % frames(cur); draw(); }};
document.getElementById("btnStepB").onclick = () => {{ idx = (idx - 1 + frames(cur)) % frames(cur); draw(); }};
document.getElementById("btnLoop").onclick = () => {{ loop = !loop;
  document.getElementById("btnLoop").textContent = "循环：" + (loop ? "开" : "关"); }};

const tt = document.getElementById("timing");
let html = "<tr><th>动作</th><th>起手</th><th>命中</th><th>收招</th><th>总时长</th></tr>";
ORDER.forEach(a => {{
  const v = act(a);
  const f = x => (x === null ? "—" : x + "ms");
  html += "<tr><td>" + a + (v.native === false ? "（合成）" : "") + "</td><td>" + f(v.windup_ms) +
          "</td><td>" + f(v.impact_ms) + "</td><td>" + f(v.recovery_ms) + "</td><td>" + f(v.total_ms) + "</td></tr>";
}});
tt.innerHTML = html;

img.onload = () => {{ draw(); restart(); }};
if (img.complete) {{ draw(); restart(); }}
</script>
</body>
</html>
"""


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    args = parse_args(argv)
    repo = args["repo"]
    models = os.path.join(repo, args["models"])
    out_dir = os.path.join(repo, args["out"])
    frames_dir = os.path.join(out_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    timing = json.load(open(os.path.join(repo, "docs/motion/ACT-004/timing_unified.json"), encoding="utf-8"))
    unified = timing["unified"]
    fps = args["fps"]
    frame_ms = 1000.0 / fps
    cell_w, cell_h = args["cell_w"], args["cell_h"]

    order = ["idle", "move", "attack", "hit", "death"]
    # 每个动作的采样帧数：保证覆盖到 total_ms（含收招）
    plan = {}
    for a in order:
        total = unified[a]["total_ms"]
        n = int(math.ceil(total * fps / 1000.0)) + 1
        plan[a] = {"total_ms": total, "n": n,
                   "times": [min(i * frame_ms, total) for i in range(n)]}

    glb = os.path.join(models, args["hero"])
    log("GLB:", glb)
    scn = setup_scene(args)
    arm, meshes = import_model(scn, glb)
    log("armature:", arm.name, "| meshes:", [m.name for m in meshes])
    lo, hi = world_bbox(meshes)
    log("bbox lo:", tuple(round(v, 3) for v in lo), "hi:", tuple(round(v, 3) for v in hi))
    setup_camera(scn, lo, hi)

    scene_fps = scn.render.fps / scn.render.fps_base
    actions = {n: action_by_name(n) for n in ("idle", "walk", "attack", "hit")}
    log("actions:", {k: (v.name if v else None) for k, v in actions.items()})

    # death 合成参数（来自统一表）
    death = unified["death"]
    sink_units = death["sink_units"]
    tilt_rad = math.radians(death["tilt_deg"])
    death_tail_ms = death["synth_hit_tail_ms"]
    hit_native_ms = unified["hit"]["total_ms"]

    # glTF 导入的对象默认 rotation_mode 为 QUATERNION，直接写 rotation_euler 不生效，
    # 这里统一切成 XYZ 欧拉，保证下沉/前倾真的落到位
    arm.rotation_mode = "XYZ"
    base_loc = arm.location.copy()
    base_rot = arm.rotation_euler.copy()
    log("armature rotation_mode:", arm.rotation_mode,
        "| base_loc:", tuple(round(v, 4) for v in base_loc),
        "| base_rot(deg):", tuple(round(math.degrees(v), 3) for v in base_rot))

    meta_actions = {}
    for r, a in enumerate(order):
        clip_name = {"idle": "idle", "move": "walk", "attack": "attack", "hit": "hit", "death": "hit"}[a]
        action = actions[clip_name]
        if action is None:
            raise RuntimeError(f"缺少 clip：{clip_name}")
        p = plan[a]
        nonempty, how = 0, "-"
        for i, t in enumerate(p["times"]):
            if a == "death":
                # 合成：hit 末段 + 姿态下沉（资产内无 death 片段）
                if t <= death_tail_ms:
                    # hit clip 的最后 death_tail_ms：t=0 对应 hit 的 500ms，t=250 对应 hit 的 750ms（末帧）
                    set_pose(arm, action, hit_native_ms - death_tail_ms + t, scene_fps, scn)
                    arm.location = base_loc
                    arm.rotation_euler = base_rot
                else:
                    prog = (t - death_tail_ms) / max(1e-6, p["total_ms"] - death_tail_ms)
                    e = prog * prog * (3 - 2 * prog)          # smoothstep，收尾更缓
                    set_pose(arm, action, hit_native_ms, scene_fps, scn)
                    arm.location = base_loc + Vector((0.0, 0.0, -sink_units * e))
                    arm.rotation_euler = (base_rot[0] + tilt_rad * e, base_rot[1], base_rot[2])
            else:
                # attack 超过原生片段的部分：按方案 A 保持末帧姿态（实测末帧与 idle 首帧姿态一致）
                set_pose(arm, action, t, scene_fps, scn)
                arm.location = base_loc
                arm.rotation_euler = base_rot
            path = os.path.join(frames_dir, f"{a}_{i:02d}.png")
            render_frame(scn, path)
        log(f"  {a}: {p['n']} 帧已渲染，覆盖 0–{p['times'][-1]:.1f} ms（统一表 {p['total_ms']} ms）")
        meta_actions[a] = {
            "clip": unified[a]["clip"],
            "native": unified[a].get("native", True),
            "loop": bool(unified[a].get("loop", False)),
            "frames": p["n"],
            "total_ms": unified[a]["total_ms"],
            "windup_ms": unified[a]["windup_ms"],
            "impact_ms": unified[a]["impact_ms"],
            "recovery_ms": unified[a]["recovery_ms"],
        }

    log("拼 sprite sheet ...")
    sheet_path = os.path.join(out_dir, "sprite_sheet.png")
    sheet_w, sheet_h, cols, rows, stats = compose_sheet(
        frames_dir, plan, order, cell_w, cell_h, sheet_path)
    log("sprite sheet:", sheet_w, "x", sheet_h, "=", os.path.getsize(sheet_path), "字节")
    for a in order:
        s = stats[a]
        if s["nonempty"] != s["frames"]:
            log(f"  !! {a} 非空单元格 {s['nonempty']}/{s['frames']}")
        meta_actions[a]["rendered_rows_ok"] = (s["nonempty"] == s["frames"])

    b64 = base64.b64encode(open(sheet_path, "rb").read()).decode("ascii")
    log("base64 长度:", len(b64))

    meta = {
        "hero": args["hero"],
        "fps": fps,
        "frame_ms": round(frame_ms, 3),
        "cell_w": cell_w,
        "cell_h": cell_h,
        "order": order,
        "actions": meta_actions,
        "sheet_png_bytes": os.path.getsize(sheet_path),
        "sheet_b64": b64,
        "death_is_synthetic": True,
        "engine": args["engine"],
        "blender": bpy.app.version_string,
    }
    with open(os.path.join(out_dir, "preview_meta.json"), "w", encoding="utf-8") as fh:
        json.dump({k: v for k, v in meta.items() if k != "sheet_b64"}, fh, ensure_ascii=False, indent=2)

    html = HTML_TMPL.format(
        hero=args["hero"], fps=fps, cw=cell_w, ch=cell_h,
        stage_w=cell_w, stage_h=cell_h, frame_ms=round(frame_ms, 1),
        meta_json=json.dumps(meta, ensure_ascii=False),
    )
    html_path = os.path.join(out_dir, "preview.html")
    with open(html_path, "w", encoding="utf-8") as fh:
        fh.write(html)
    log("preview.html:", html_path, os.path.getsize(html_path), "字节")
    log("完成。")


if __name__ == "__main__":
    main()
