#!/usr/bin/env bash
# CMD-018 · 打**开发交接包**（源码 / 可编辑工程 / 生成脚本 / 测试 / 授权 / 哈希 / 复现步骤）。
#
# 与试玩包（build-prototype-package.sh）的分工：
#   · 试玩包：精简，只为了让评审能双击跑起来看画面 → 依赖本机 Godot 4.7+
#   · 开发交接包：完整交付源码与可复现链路，供接手的人改、审、重建
#
# 【铁律】**只从明确白名单取文件**：
#   下面的 ALLOW_FILES / ALLOW_DIRS 就是全部内容，一项不多；
#   另有 DENY 规则兜底（用户存档、密钥、备份、缓存、无关目录一律不进包）。
#   打包后脚本会自检：包里不得出现存档、密钥、.blend1、.DS_Store 等。
#
# 用法：tools/build-dev-handoff-package.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/dist"
PKG_NAME="shuihu-tiger-dev-handoff"
STAGE="${OUT_DIR}/${PKG_NAME}"
ZIP="${OUT_DIR}/${PKG_NAME}.zip"

rm -rf "${STAGE}" "${ZIP}"
mkdir -p "${STAGE}"

python3 - "$ROOT" "$STAGE" <<'PY'
import hashlib
import os
import re
import shutil
import sys

ROOT, STAGE = sys.argv[1], sys.argv[2]

# ---------------------------------------------------------------- 白名单
# 逐项都要能说清「为什么在包里」；不在此列的一律不进包。
ALLOW_FILES = [
    ("project.godot", "Godot 工程定义（Godot 4.7.2）"),
    ("data/shuihu.js", "108 将座次表：人物名/星号/绰号/简介的数据源（A16h 逐项比对它）"),
    ("godot/tiger_tutorial/tiger_tutorial.tscn", "打虎首关场景"),
    ("godot/tiger_tutorial/tiger_tutorial.gd", "打虎首关全部逻辑与 UI"),
    ("godot/tiger_tutorial/tiger_tutorial.gd.uid", "Godot 4.4+ 脚本 UID"),
    ("godot/tests/tiger_tutorial_test.gd", "闭环测试 A1–A17（90 项断言）"),
    ("godot/tests/tiger_tutorial_test.gd.uid", "Godot 4.4+ 脚本 UID"),
    # ---- 可编辑工程（Blender 源）----
    ("assets/releases/ART-002/r6/source/wusong.blend", "武松源工程（r10 的构建输入）"),
    ("assets/releases/ART-002/r10/source/wusong.blend", "当前可编辑武松（蓝衣无刀，r10）"),
    ("assets/releases/ART-002/r11/source/tiger.blend", "虎源工程（r12 的构建输入）"),
    ("assets/releases/ART-002/r11/models/tiger.glb", "上一版虎模型：保留以证明「新增另版本、不删旧版」（A16b 会查它还在）"),
    ("assets/releases/ART-002/r12/source/tiger.blend", "当前可编辑猛虎（r12，含 defeat 动作）"),
    # ---- 运行时模型与派生资源 ----
    ("assets/releases/ART-002/r10/models/wusong.glb", "武松运行时模型"),
    ("assets/releases/ART-002/r10/wusong_punch_manifest.json", "武松 r10 清单（动作/骨骼）"),
    ("assets/releases/ART-002/r10/portraits/wusong_portrait.png", "招募卡肖像（由 r10 模型渲染）"),
    ("assets/releases/ART-002/r12/models/tiger.glb", "猛虎运行时模型（含 defeat）"),
    ("assets/releases/ART-002/r12/tiger_manifest.json", "虎 r12 清单（动作/触地数据）"),
    # ---- 旧 2D 立绘：未删未改，A17h 会查它们是否还在 ----
    ("assets/q/wusong-portrait.png", "旧 2D 立绘（红衣双刀）：保留未改，未再用作招募卡主图"),
    ("assets/portraits/hero-014.png", "旧 2D 立绘退路版：保留未改"),
    # ---- 音乐来源与授权 ----
    ("assets/releases/AUDIO-002/manifest.json", "音乐清单：曲名/时长/响度/来源说明"),
    ("assets/releases/AUDIO-002/README.md", "音乐来源与制作边界（含授权未核验的说明）"),
    ("assets/releases/AUDIO-002/source/compose.py", "作曲源码（可复现生成五首候选）"),
    ("assets/releases/AUDIO-002/audio/battle-spirited.wav", "战斗曲《并辔出山》（场景使用的那首）"),
]

ALLOW_DIRS = [
    ("tools", "全部构建/测试/验收/打包脚本", None),
    ("docs/collaboration/handoffs", "交接文档：CMD-015/016/017/018",
     re.compile(r"^CMD-01[5678].*\.md$")),
    ("docs/evidence/CMD-013", "闭环测试日志与报告",
     re.compile(r"^tiger-tutorial-(test\.log|report\.json)$")),
    ("docs/evidence/CMD-016", "完整闭环演示视频与静帧", None),
    ("docs/evidence/CMD-017", "演示隔离验收日志", re.compile(r"^run_.*\.log$")),
]
# 说明：网页原型的 Node 单元测试（tests/ + tools/run-tests.sh，173 项）**不进本包**——
#       它们测的是网页原型（game.js / data/*.js），那些源码不在本包范围内，
#       塞进来会变成「按说明跑不通」。该套件仍留在主仓库里独立运行。

# ---------------------------------------------------------------- 兜底拒绝
DENY_NAMES = re.compile(
    r"(^\.DS_Store$)|(\.blend1$)|(^__pycache__$)|(\.pyc$)|(^override\.cfg$)"
    r"|(^save\.json$)|(\.env$)|(\.key$)|(\.pem$)|(secret)|(^node_modules$)"
    r"|(^\.venv$)|(^venv$)|(^logs?$)|(^sessions?$)|(^dist$)",
    re.IGNORECASE)

_seen_rels = set()   # 同一相对路径只收一次（多个 .import 可能引用同一导入产物）
copied = []   # (相对路径, 字节数, sha256, 原因)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def copy_one(rel, reason):
    if rel in _seen_rels:
        return   # 去重：清单与 SHA256SUMS 必须一一对应真实文件，不得有重复行
    _seen_rels.add(rel)
    src = os.path.join(ROOT, rel)
    if not os.path.isfile(src):
        print("  !! 缺失（跳过）：%s" % rel)
        return
    dst = os.path.join(STAGE, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    copied.append((rel, os.path.getsize(dst), sha256_of(dst), reason))


def copy_dir(rel, reason, filt):
    base = os.path.join(ROOT, rel)
    if not os.path.isdir(base):
        print("  !! 缺失（跳过）：%s/" % rel)
        return
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if not DENY_NAMES.search(d)]
        for fn in sorted(filenames):
            if DENY_NAMES.search(fn):
                continue
            rp = os.path.relpath(os.path.join(dirpath, fn), ROOT)
            if filt and not filt.match(os.path.basename(rp)):
                continue
            copy_one(rp, reason)


for rel, reason in ALLOW_FILES:
    copy_one(rel, reason)
for rel, reason, filt in ALLOW_DIRS:
    copy_dir(rel, reason, filt)

# ---- 资源导入产物：让包解压后能直接跑（不必先导入）----
for rel, _ in ALLOW_FILES:
    imp = os.path.join(ROOT, rel + ".import")
    if not os.path.isfile(imp):
        continue
    copy_one(rel + ".import", "Godot 导入元数据")
    txt = open(imp, encoding="utf-8").read()
    for m in re.finditer(r'res://\.godot/imported/([^\s"\]]+)', txt):
        art = m.group(1)
        for name in (art, art + ".md5"):
            src = os.path.join(ROOT, ".godot", "imported", name)
            if os.path.isfile(src):
                copy_one(os.path.join(".godot", "imported", name), "已导入产物（免导入直接跑）")

# ---- 自检：包里不得出现存档/密钥/备份 ----
bad = []
for dirpath, dirnames, filenames in os.walk(STAGE):
    dirnames[:] = [d for d in dirnames if not DENY_NAMES.search(d)]
    for fn in filenames:
        if DENY_NAMES.search(fn):
            bad.append(os.path.relpath(os.path.join(dirpath, fn), STAGE))
if bad:
    print("  !! 自检失败，包里出现了不该有的文件：%s" % bad)
    sys.exit(1)

# ---- 自检：清单/哈希不得有重复路径（此前曾出现 7 个导入产物被重复计入 120）----
if len(_seen_rels) != len(copied):
    print("  !! 自检失败：copied 中存在重复路径")
    sys.exit(1)
assert len({c[0] for c in copied}) == len(copied), "重复路径"

# ---- 交付清单 ----
import datetime
now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
lines = []
lines.append("# 开发交接包 · 交付清单\n")
lines.append("生成时间：%s\n" % now)
lines.append("包名：`shuihu-tiger-dev-handoff.zip`（工程根目录 `%s/`）\n" % os.path.basename(STAGE))
lines.append("来源工程：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`（仓库根 `meng/`）\n")
lines.append("> 本包是**开发交接包**：源码 + 可编辑工程 + 生成脚本 + 测试 + 授权记录 + 哈希 + 复现步骤。\n")
lines.append("> 评审试玩请用另一个精简包 `shuihu-tiger-prototype.zip`（需本机装 Godot 4.7+）。\n")
lines.append("\n## 一、文件清单（白名单，共 %d 个文件，路径唯一、与 SHA256SUMS 逐行对应）\n" % len(copied))
lines.append("| # | 文件 | 字节 | sha256（前 16 位） | 为什么在包里 |")
lines.append("|---|---|---|---|---|")
for i, (rel, size, digest, reason) in enumerate(copied, 1):
    lines.append("| %d | `%s` | %d | `%s` | %s |"
                 % (i, rel, size, digest[:16], reason))
lines.append("\n> 完整 sha256 见同目录 `SHA256SUMS.txt`（可用 `shasum -a 256 -c` 校验）。\n")

lines.append("\n## 二、资源来源与授权\n")
lines.append("| 资源 | 来源 | 授权状态 |")
lines.append("|---|---|---|")
lines.append("| 武松 r10（蓝衣无刀） | 本项目 Blender 分件建模，源工程 `r6/source/wusong.blend` → "
             "`tools/motion/build_wusong_punch.py` → r10 | **本项目原创**，无第三方素材 |")
lines.append("| 猛虎 r12 | 本项目 Blender 分件建模，源工程 `r11/source/tiger.blend` → "
             "`tools/motion/build_tiger_r12.py` → r12 | **本项目原创**，无第三方素材 |")
lines.append("| 招募卡肖像 | 由 r10 模型在本工程内用 Godot 渲染（`--render-portrait`） | 本项目自有资产 |")
lines.append("| 旧 2D 立绘 `assets/q/wusong-portrait.png`、`assets/portraits/hero-014.png` | "
             "项目原有资产 | 本项目资产，**本轮未删未改**，仅不再用作招募卡主图 |")
lines.append("| 战斗曲《并辔出山》 | `assets/releases/AUDIO-002/`：本项目**自制原创曲**，"
             "用本机 macOS 系统采样库离线渲染 | ⚠️ **作曲原创**，但 AUDIO-002 README 明确写着"
             "「系统音源的商业使用许可未另作法律核验、**没有发布授权结论**」→ "
             "仅可用于本地原型评审，**公开发布前必须先清授权** |")
lines.append("\n> 音频原始说明见 `assets/releases/AUDIO-002/README.md` 与 `manifest.json`（原文随包）。\n")

lines.append("\n## 三、可复现构建步骤（已验证环境）\n")
lines.append("验证环境：macOS 27.0.1 / **Godot 4.7.2.stable** / **Blender 5.2.2 LTS** / ffmpeg 5.1.2\n")
lines.append("```bash")
lines.append("# 0) 拿到源码（本包已含全部所需文件）")
lines.append("# 1) 重建虎 r12（r11 源工程 → r12，加 defeat 动作）")
lines.append("/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_tiger_r12.py")
lines.append("# 2) 重建武松 r10（r6 源工程 → r10，去双刀、加 punch/tiger_shadow）")
lines.append("/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_wusong_punch.py")
lines.append("# 3) 导入新增资源（定向导入；全量用 tools/godot-import.sh）")
lines.append("tools/godot-import-one.sh assets/releases/ART-002/r12/models/tiger.glb")
lines.append("# 4) 重渲染招募卡肖像（用 r10 模型，保证与场上造型一致）")
lines.append("/Applications/Godot.app/Contents/MacOS/Godot --path . \\")
lines.append("  res://godot/tiger_tutorial/tiger_tutorial.tscn --rendering-driver opengl3 \\")
lines.append("  --resolution 600x750 -- --render-portrait \"$PWD/assets/releases/ART-002/r10/portraits/wusong_portrait.png\"")
lines.append("# 5) 跑测试（本包内可直接跑的都列在这儿）")
lines.append("tools/godot-tiger-test.sh            # 闭环 90 项")
lines.append("tools/verify-demo-save-isolation.sh   # 演示存档隔离")
lines.append("tools/godot-save-cross-process-test.sh # 跨进程保存/加载")
lines.append("tools/verify-save-safety.sh           # 存档安全 8 场景")
lines.append("#    （网页原型的 Node 单元测试 173 项不在本包：它测 game.js/data/*.js，")
lines.append("#      那些源码属于网页原型工作线，仍留在主仓库独立运行）")
lines.append("# 6) 重打两个交付包")
lines.append("tools/build-prototype-package.sh   # 精简试玩包")
lines.append("tools/build-dev-handoff-package.sh  # 本开发交接包")
lines.append("```\n")
lines.append("录屏（引擎内出片，非系统录屏）：\n")
lines.append("```bash")
lines.append("/Applications/Godot.app/Contents/MacOS/Godot --path . --write-movie out.avi --fixed-fps 30 \\")
lines.append("  res://godot/tiger_tutorial/tiger_tutorial.tscn --rendering-driver opengl3 --resolution 1280x720 \\")
lines.append("  -- --scratch-save --auto-full --quit-after 90")
lines.append("ffmpeg -y -i out.avi -c:v libx264 -pix_fmt yuv420p -crf 23 -an out.mp4")
lines.append("```\n")

lines.append("\n## 四、限制（如实列出，未擅自发布）\n")
lines.append("- **本机没有 Godot 导出模板**（`~/.local/share/godot/export_templates/` 不存在），"
             "**导不出 .app/.exe**；因此两个交付包都是**工程包**，运行仍需本机安装 Godot 4.7+。"
             "要做独立应用需先安装对应版本导出模板再走 Godot 导出流程。")
lines.append("- **没有发布**：未打 tag、未上传分发、未做签名/公证。")
lines.append("- **音乐无发布授权结论**（见第二节），公开前必须先清。")
lines.append("- **没有人工试玩验收**：所有画面与视频均为脚本自动产出。")
lines.append("- 虎与武松造型/动作仍是程序化分件几何；背景是空地；只有首关闭环，未扩角色与关卡。")
lines.append("- 本包**不含**用户存档、密钥、`.blend1` 备份、`__pycache__`、`.DS_Store`、"
             "旧证据目录与无关项目文件（打包脚本有自检）。\n")

open(os.path.join(STAGE, "交付清单.md"), "w", encoding="utf-8").write("\n".join(lines))

with open(os.path.join(STAGE, "SHA256SUMS.txt"), "w", encoding="utf-8") as f:
    for rel, size, digest, reason in copied:
        f.write("%s  %s\n" % (digest, rel))

print("  已收集 %d 个文件" % len(copied))
PY

echo "[2/3] 写包根 README"
cat > "${STAGE}/README.md" <<'EOF'
# 开发交接包 · 说明

这是**开发交接包**（源码 + 可编辑工程 + 生成脚本 + 测试 + 授权记录 + 哈希 + 复现步骤），
配套的精简**试玩包**是 `shuihu-tiger-prototype.zip`（只需能跑起来看画面）。

> **运行依赖**：本包是**工程源码包**，运行与测试需要本机已安装 **Godot 4.7+**
> （已验证 4.7.2.stable / macOS 27.0.1），并需要 **Blender 5.2+** 才能重建资产。
> 引擎本体不在包里。

## 先看哪三份文件

1. `交付清单.md` —— 文件白名单 + sha256 + 资源授权状态 + 可复现构建步骤 + 限制
2. `docs/collaboration/handoffs/CMD-018-final-delivery.md` —— 本阶段交接单
3. `docs/collaboration/handoffs/CMD-017-demo-isolation-and-prototype-package.md`
   —— 演示污染封堵与原型包那一轮

## 快速上手

```bash
# 跑闭环测试（脚本会自动做隔离副本，不碰真实存档）
tools/godot-tiger-test.sh

# 看画面（真窗口）
/Applications/Godot.app/Contents/MacOS/Godot --path . \
  res://godot/tiger_tutorial/tiger_tutorial.tscn
```

## 校验

```bash
shasum -a 256 -c SHA256SUMS.txt
```
EOF

echo "[3/3] 打包"
cd "${OUT_DIR}" && zip -qr "${ZIP}" "${PKG_NAME}" -x '*.DS_Store' && \
  echo "   包大小：$(du -h "${ZIP}" | cut -f1)"
echo
echo "产物：${ZIP}"
echo "校验：unzip -d <目录> 后在该目录跑 shasum -a 256 -c SHA256SUMS.txt"
