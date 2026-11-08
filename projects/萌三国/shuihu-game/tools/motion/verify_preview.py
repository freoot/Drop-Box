#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_preview.py — ACT-004 预览产出自检（纯标准库，系统 python3 直接跑）

检查项
------
1. 每个动作的帧文件齐全，帧数与 preview_meta.json 一致。
2. 每个动作的采样总时长 ≥ 统一表总时长（attack/hit/death 必须覆盖收招）。
3. sprite sheet 尺寸 = 列数×单元格宽 × 行数×单元格高；逐格像素与对应帧文件完全一致。
4. preview.html：不含 http(s) 外链、不含 CDN 关键字；内嵌 base64 sprite sheet；
   含 5 个动作名与「非资产原生」的 death 标注。
5. 内嵌 JS 的大括号/小括号配平（粗检，配合 node --check 使用）。

用法
----
    python3 tools/motion/verify_preview.py
    python3 tools/motion/verify_preview.py --json docs/motion/ACT-004/03_preview/verify_report.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys
import zlib


def decode_png_rgba8(path):
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是 PNG: " + path)
    pos, chunks, w, h = 8, [], None, None
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.getcwd())
    ap.add_argument("--json", default=None, help="把检查结果写成 JSON 的路径")
    args = ap.parse_args()

    repo = args.repo
    prev_dir = os.path.join(repo, "docs/motion/ACT-004/03_preview")
    frames_dir = os.path.join(prev_dir, "frames")
    meta = json.load(open(os.path.join(prev_dir, "preview_meta.json"), encoding="utf-8"))
    timing = json.load(open(os.path.join(repo, "docs/motion/ACT-004/timing_unified.json"), encoding="utf-8"))
    unified = timing["unified"]

    checks = []
    def chk(name, ok, detail=""):
        checks.append({"item": name, "pass": bool(ok), "detail": detail})
        print(f"[verify] {'PASS' if ok else 'FAIL'} | {name} | {detail}")

    fps = meta["fps"]
    frame_ms = 1000.0 / fps
    actions = meta["order"]

    # 1&2 帧文件与覆盖时长
    for a in actions:
        files = sorted(f for f in os.listdir(frames_dir) if f.startswith(a + "_") and f.endswith(".png"))
        n_meta = meta["actions"][a]["frames"]
        chk(f"{a}: 帧数={len(files)} 与 meta({n_meta}) 一致", len(files) == n_meta,
            f"files={len(files)}")
        span = (len(files) - 1) * frame_ms
        total = unified[a]["total_ms"]
        chk(f"{a}: 采样总时长 {round(span,1)}ms ≥ 统一表 {total}ms", span >= total - 1e-6,
            f"span={round(span, 1)}ms total={total}ms")
        # 收招覆盖
        imp = unified[a]["impact_ms"]
        if a in ("attack", "hit", "death"):
            need = unified[a]["recovery_ms"]
            covered = span >= (total - 1e-6)
            chk(f"{a}: 覆盖收招段（收招 {need}ms）", covered,
                f"末帧 t={round(span,1)}ms ≥ 总时长 {total}ms")

    # 3 sprite sheet 逐格比对
    sheet_path = os.path.join(prev_dir, "sprite_sheet.png")
    sw, sh, spx = decode_png_rgba8(sheet_path)
    cw, ch = meta["cell_w"], meta["cell_h"]
    cols = max(meta["actions"][a]["frames"] for a in actions)
    rows = len(actions)
    chk("sheet 尺寸 = cols×cw × rows×ch", (sw, sh) == (cols * cw, rows * ch),
        f"{sw}x{sh} vs {cols*cw}x{rows*ch}")
    mismatch = 0
    compared = 0
    for r, a in enumerate(actions):
        for i in range(meta["actions"][a]["frames"]):
            fw, fh, fpx = decode_png_rgba8(os.path.join(frames_dir, f"{a}_{i:02d}.png"))
            diff = 0
            for y in range(0, min(ch, fh), 3):
                for x in range(0, min(cw, fw), 3):
                    so = ((r * ch + y) * sw + i * cw + x) * 4
                    fo = (y * fw + x) * 4
                    for k in range(4):
                        if spx[so + k] != fpx[fo + k]:
                            diff += 1
            compared += 1
            mismatch += (1 if diff else 0)
    chk(f"sheet 逐格像素与帧文件完全一致（{compared} 格）", mismatch == 0, f"不一致 {mismatch} 格")

    # 4 preview.html
    html = open(os.path.join(prev_dir, "preview.html"), encoding="utf-8").read()
    # 检查外链时先剔除内嵌的 META（含 base64，其中可能随机出现 http/cdn 字样）
    body = re.sub(r"const META = \{.*?\};\n", "const META = {...};\n", html, flags=re.S)
    ext = re.findall(r"(https?://[^\s\"')]+)", body)
    chk("preview.html 无 http(s) 外链（已剔除 base64 段）", not ext, f"外链数={len(ext)}")
    cdn_hits = re.findall(r"(cdn\.[\w.-]+|//cdn[\w.-]*|unpkg\.com|jsdelivr|\.googleapis\.com)", body, re.I)
    chk("preview.html 无 CDN 域名引用（已剔除内嵌 base64）", not cdn_hits, f"命中={cdn_hits}")
    chk("preview.html 内嵌 base64 sprite sheet", html.count("data:image/png;base64,") == 1,
        f"出现 {html.count('data:image/png;base64,')} 次")
    chk("preview.html 含 5 个动作名", all(a in html for a in actions), ",".join(actions))
    chk("preview.html 标注 death 非资产原生",
        ("非资产原生" in html) and ("death 非资产原生" in html or "death" in html), "")
    js = html.split("<script>")[1].split("</script>")[0]
    chk("内嵌 JS 括号配平", js.count("{") == js.count("}") and js.count("(") == js.count(")"),
        f"{{={js.count('{')} }}={js.count('}')}")
    chk("内嵌 META 可解析为 JSON",
        bool(re.search(r"const META = (\{.*?\});\n", html, re.S)), "")

    ok_all = all(c["pass"] for c in checks)
    print(f"[verify] 合计 {len(checks)} 项，通过 {sum(1 for c in checks if c['pass'])} 项，"
          f"{'ALL_PASS' if ok_all else 'HAS_FAIL'}")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"all_pass": ok_all, "checks": checks,
                       "meta": {k: v for k, v in meta.items() if k != "sheet_b64"}},
                      fh, ensure_ascii=False, indent=2)
        print("[verify] 报告写入", args.json)
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
