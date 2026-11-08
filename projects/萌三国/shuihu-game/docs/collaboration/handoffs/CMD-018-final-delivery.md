# CMD-018 交接单 · 本阶段最终交付（原型包说明澄清 + 开发交接包/清单）

**状态：READY_FOR_REVIEW —— 原型阶段收尾，**不标最终验收通过**，等待集中审查**
**工程**：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`（仓库根 `meng/`）
**分支**：`task/first-batch-20261022`
**基线**：`951cb2b`（CMD-017）

---

## 零、本轮只做收尾，不扩玩法

| 做 | 不做 |
|---|---|
| 说清试玩包**是工程包、需本机装 Godot** | 不扩关卡/角色/环境 |
| 交开发交接包（源码/可编辑工程/脚本/测试/授权/哈希/复现步骤） | 不擅自发布、不打 tag |
| 白名单取文件 + 禁带自检 | 不带用户存档、密钥、旧备份、无关项目 |

---

## 一、试玩包的性质（此前表述不够准，已改）

**`shuihu-tiger-prototype.zip` 是「资源工程包」，不是独立应用程序。**

| 项 | 事实 |
|---|---|
| 引擎本体 | **不在包里**。运行**必须**本机已装 **Godot 4.7+** |
| 已验证版本 | **Godot 4.7.2.stable**（macOS 27.0.1，Apple Silicon，`gl_compatibility`） |
| 为什么不是 .app | 本机**没有 Godot 导出模板**（`~/.local/share/godot/export_templates/` 不存在），**导不出**可执行包 |
| 包里带了什么 | 4 个资源 + 各自 `.import` 与 `.godot/imported` 产物 → **不必先跑导入就能开跑** |
| 其他依赖 | 无（Blender / ffmpeg / Node 只在**重建资产与录屏**时才需要） |

`START-HERE.md` 开头就是这条依赖声明，并写明"没有导出成独立应用"及其原因。

**独立验收记录（用户侧）**：解压到临时目录 → Godot 4.7.2 headless 跑 `--auto-full`，
PID 63678、独立 session 档，打虎 → 招募人物卡 → 编队 → 第二战胜利 → `DONE`，**退出码 0**。
> 该记录属**包内脚本流程**验收，**不等于**真实鼠标操作 / 听感 / 发布验收。

---

## 二、开发交接包 `shuihu-tiger-dev-handoff.zip`（约 17 MB / 119 文件）

构建：`tools/build-dev-handoff-package.sh`（**白名单取文件**，逐项注明「为什么在包里」）。

### 2.1 内容

| 类别 | 内容 |
|---|---|
| 项目源码 | `project.godot`、`godot/tiger_tutorial/`（场景 + 逻辑 + UI）、`godot/tests/tiger_tutorial_test.gd`、`data/shuihu.js` |
| **可编辑工程（blend）** | `r10/source/wusong.blend`（当前武松）、`r12/source/tiger.blend`（当前虎）、`r6/source/wusong.blend`（武松构建输入）、`r11/source/tiger.blend`（虎构建输入） |
| 运行时资产 | `r10/models/wusong.glb`、`r12/models/tiger.glb`、`r10/portraits/wusong_portrait.png`、两个 manifest |
| **生成脚本** | `tools/motion/build_wusong_punch.py`（r6→r10）、`tools/motion/build_tiger_r11.py`、`tools/motion/build_tiger_r12.py`（r11→r12） |
| **测试** | 闭环 A1–A17（90 项）、演示存档隔离、跨进程保存/加载、存档安全 8 场景 —— 脚本全在 `tools/` |
| **音乐来源与授权** | `AUDIO-002/manifest.json`、`README.md`、`source/compose.py`、`battle-spirited.wav` |
| 旧立绘 | `assets/q/wusong-portrait.png`、`assets/portraits/hero-014.png`（**未删未改**，A17h 查它们还在） |
| 交接与证据 | CMD-015/016/017 交接单、闭环演示视频 + 8 张静帧、隔离验收日志 |
| 清单 | `交付清单.md`（白名单 + sha256 + 授权 + 复现步骤 + 限制）、`SHA256SUMS.txt` |

### 2.2 白名单与禁带

- **只从白名单取**：`ALLOW_FILES` / `ALLOW_DIRS` 两张表，脚本逐项打印收集数量。
- **禁带兜底**：用户存档（`save.json`）、`override.cfg`、密钥（`.env/.key/.pem/secret`）、
  旧备份（`*.blend1`）、缓存（`.DS_Store`/`__pycache__`/`*.pyc`）、`node_modules`/`.venv`、
  `logs/`/`sessions/`/`dist/`。
- **打包后自检**：包里出现上述任一项即**直接失败退出**。
- 网页原型的 Node 单元测试（`tests/`，173 项）**不进本包**——它测 `game.js/data/*.js`，
  那些源码属于网页原型工作线，塞进来会变成"按说明跑不通"；该套件仍留在主仓库独立运行。

### 2.3 已验证：解压后按说明可运行

```
解压 → shasum -a 256 -c SHA256SUMS.txt   → 119/119 OK
     → tools/godot-tiger-test.sh          → 90/90
     → tools/verify-demo-save-isolation.sh → OK
     → tools/godot-save-cross-process-test.sh → OK
     → tools/verify-save-safety.sh        → 8/8
```

---

## 三、资源来源与授权（**有一项未清，如实列出**）

| 资源 | 来源 | 授权状态 |
|---|---|---|
| 武松 r10（蓝衣无刀） | 本项目 Blender 分件建模：`r6/source/wusong.blend` → `build_wusong_punch.py` → r10 | **本项目原创**，无第三方素材 |
| 猛虎 r12 | 本项目 Blender 分件建模：`r11/source/tiger.blend` → `build_tiger_r12.py` → r12 | **本项目原创**，无第三方素材 |
| 招募卡肖像 | 由 r10 模型在本工程内用 Godot 渲染（`--render-portrait`） | 本项目自有资产 |
| 旧 2D 立绘 | 项目原有资产 | 本项目资产，**本轮未删未改**，仅不再用作招募卡主图 |
| 战斗曲《并辔出山》 | `AUDIO-002`：本项目**自制原创曲**，用本机 macOS 系统采样库离线渲染 | ⚠️ **作曲原创，但 AUDIO-002 README 原文写着：「系统音源的商业使用许可没有在本任务中另作法律核验……没有发布授权结论」** → 只可用于本地原型评审，**公开发布前必须先清授权** |

---

## 四、可复现构建步骤（已验证环境：macOS 27.0.1 / Godot 4.7.2 / Blender 5.2.2 LTS / ffmpeg 5.1.2）

```bash
# 1) 重建虎 r12（r11 源 → r12，加 defeat 动作）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_tiger_r12.py
# 2) 重建武松 r10（r6 源 → r10，去双刀、加 punch/tiger_shadow）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_wusong_punch.py
# 3) 导入新增资源（定向；全量用 tools/godot-import.sh）
tools/godot-import-one.sh assets/releases/ART-002/r12/models/tiger.glb
# 4) 重渲染招募卡肖像（用 r10 模型，保证与场上造型一致）
/Applications/Godot.app/Contents/MacOS/Godot --path . \
  res://godot/tiger_tutorial/tiger_tutorial.tscn --rendering-driver opengl3 \
  --resolution 600x750 -- --render-portrait "$PWD/assets/releases/ART-002/r10/portraits/wusong_portrait.png"
# 5) 跑测试（本包内可直接跑的四套）
tools/godot-tiger-test.sh / tools/verify-demo-save-isolation.sh
tools/godot-save-cross-process-test.sh / tools/verify-save-safety.sh
# 6) 重打两个交付包
tools/build-prototype-package.sh     # 精简试玩包
tools/build-dev-handoff-package.sh    # 开发交接包
```

录屏（引擎内出片，非系统录屏）：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path . --write-movie out.avi --fixed-fps 30 \
  res://godot/tiger_tutorial/tiger_tutorial.tscn --rendering-driver opengl3 --resolution 1280x720 \
  -- --scratch-save --auto-full --quit-after 90
ffmpeg -y -i out.avi -c:v libx264 -pix_fmt yuv420p -crf 23 -an out.mp4
```

---

## 五、限制（如实列出，未擅自发布）

- **没有导出模板 → 导不出 .app/.exe**：两个交付包都是**工程包**，运行需本机装 Godot 4.7+。
  要出独立应用，需先安装对应版本导出模板再走 Godot 导出流程。
- **没有发布**：未打 tag、未上传分发、未做签名/公证。
- **音乐无发布授权结论**（见第三节），公开发布前必须先清。
- **没有人工试玩验收**：所有画面与视频均为脚本自动产出。
- 虎与武松造型/动作仍是程序化分件几何（虎偏白）；背景是空地 + 深色天空；
  只有首关闭环，未扩角色/关卡/环境。

---

## 六、交付物清单

| 交付物 | 路径 | 说明 |
|---|---|---|
| 试玩包 | `dist/shuihu-tiger-prototype.zip` | 精简；**需本机 Godot 4.7+**；含 `START-HERE.md` |
| 开发交接包 | `dist/shuihu-tiger-dev-handoff.zip` | 源码 / blend / 脚本 / 测试 / 授权 / 哈希 / 复现步骤 |
| 闭环演示 | `docs/evidence/CMD-016/demo-loop.mp4` | 30.6s / 1280×720 / 30fps：战斗→败退→招募→编队→再战 |
| 静帧 | `docs/evidence/CMD-016/shots/`（8 张） | 含新人物卡（模型肖像版） |
| 交接单 | `docs/collaboration/handoffs/CMD-01{5,6,7,8}-*.md` | 四轮完整说明 |
| 交付清单 | 开发交接包内 `交付清单.md` + `SHA256SUMS.txt` | 白名单 + 哈希 + 授权 + 复现步骤 |

---

## 七、状态

**原型阶段收尾完成，等待集中审查。不标最终验收通过。**
逻辑与可读性检查全绿 ≠ 美术验收 ≠ 人工试玩验收；
美术造型、背景环境、音乐授权、人工试玩与听感审听都还没有结论。
本轮之后**不再自行扩大范围**，等审查意见。
