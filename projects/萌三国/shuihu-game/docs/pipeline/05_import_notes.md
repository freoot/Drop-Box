# 05 · Godot 4.7.2 首次资源导入记录

- 任务 ID：CMD-005 / r1（交接单 `docs/collaboration/handoffs/CMD-005-godot-import.md`）
- 执行角色：主程序与整合负责人（代理 A）
- 执行时间：2026-10-29 00:20–01:20（Asia/Shanghai）
- 引擎：`/Applications/Godot.app/Contents/MacOS/Godot`，版本 `4.7.2.stable.official.ed1daf0bf`
- 结论：**导入完成，冒烟转绿（连续 3 次 exit 0）**，`project.godot` 渲染路径未改（仍为 `gl_compatibility`）

---

## 1. 导入前后对比

| 指标 | 导入前 | 导入后 | 核验命令 |
|---|---|---|---|
| `*.import` 数量 | 0 | **648** | `find . -name "*.import" -not -path "./.git/*" \| wc -l` |
| `.godot/imported` 文件数 | 0 | **1296** | `ls .godot/imported \| wc -l` |
| `*.uid`（Godot 4.x 资源 ID） | 0 | 7 | `find . -name "*.uid" \| wc -l` |
| 冒烟退出码 | 1（失败） | **0** | 见第 4 节 |
| 旅程地图纹理加载 | `Failed loading resource` | 成功，1672×941 | 见第 5 节 |

关键文件：`assets/liangshan-journey-map.png.import` 已生成。

## 2. 根因诊断（不把推测当结论）

### 2.1 现象

直接在本工程执行 `Godot --headless --import --path .`：

- 文件系统扫描跑满 100%（`_update_scan_actions` DONE，634 项）
- **日志中没有 `reimport` 步骤**（对比：正常导入会出现 `[ 0% ] reimport | Started 正在导入或重新导入资产`）
- 随后 `ERROR: Failed loading resource: res://assets/liangshan-journey-map.png`
- 最后 `handle_crash: Program crashed with signal 11`，栈中出现 `mvk::SPIRVToMSLConverter`

### 2.2 分步验证

| # | 实验 | 结果 | 说明 |
|---|---|---|---|
| 1 | 新建最小工程（1 张 PNG + 引用它的 tscn）执行 `--headless --import` | **成功**，exit 0，生成 1 个 `.import` + `.ctex` | 本机 Godot 导入能力正常，环境不是首因 |
| 2 | 完整工程副本执行 `--headless --import` | exit 0 但 **0 个 `.import`**，无 reimport 步骤 | 不是崩溃导致中断，而是导入流程被判定为无需执行 |
| 3 | 副本以 `--headless --editor` 常驻 240 秒并轮询 | 进程存活，**始终 0 个 `.import`** | 排除「导入耗时长、编辑器提前退出」的竞态假设 |
| 4 | 子集 A：project.godot + `godot/` + 单张 PNG | **成功**，1 个 `.import` | — |
| 5 | 子集 B：A + 20 个 `.glb` | **成功**，21 个 `.import` | GLB 不是阻断因素 |
| 6 | 子集 C：B + 1 个 `.blend` | **0 个 `.import`**，无 reimport | **确认为 `.blend` 阻断** |

### 2.3 结论

1. **主因**：`assets/` 下有 **149 个 `.blend`**（另有 21 个 `.blend1`）。Godot 4.7 的 Blender 场景导入器在导入前需要有效的 Blender 路径，headless 模式无法交互式配置，日志给出
   `ERROR: Blender path is invalid or not set, check your Editor Settings. Cannot configure blender path in headless mode.`（`editor_scene_importer_blend.cpp:552`），
   该错误使整个 `reimport` 流程中止——**不是只跳过 `.blend`，而是其余文件也一并没有导入**。

2. **次生现象**：`run/main_scene="res://godot/journey_map/journey_map.tscn"`。编辑器加载布局时会实例化主场景，而此时 PNG 尚无 `.import`，于是报 `Failed loading resource` 并崩溃。日志尾部的 `mvk::SPIRVToMSLConverter` 属于 Godot 崩溃处理器自身的二次崩溃，并非首因——副本移除 `run/main_scene` 后该崩溃不再出现，可作为佐证。

3. 因此本步采取两条措施：**在导入用副本中排除 `.blend` / `.blend1`**，并**在副本中移除 `run/main_scene`**。原工程 `project.godot` 未做任何改动。

## 3. 执行的命令（可复现）

```bash
ENGINE=/Applications/Godot.app/Contents/MacOS/Godot
SRC=/Users/user/Documents/Codex/youxi/meng/shuihu-game

# 1) 建导入用副本（APFS 克隆，716M 秒级完成，不动原工程）
rm -rf /tmp/shuihu-import-work && cp -Rc "$SRC" /tmp/shuihu-import-work
rm -rf /tmp/shuihu-import-work/.git /tmp/shuihu-import-work/.godot

# 2) 副本内：移除 run/main_scene（避免编辑器加载主场景崩溃）+ 排除 blend 源文件
python3 - <<'PY'
p='/tmp/shuihu-import-work/project.godot'
open(p,'w',encoding='utf-8').writelines(
    [l for l in open(p,encoding='utf-8') if not l.startswith('run/main_scene')])
PY
cd /tmp/shuihu-import-work
mkdir -p /tmp/blend-stash
find assets -name "*.blend" -o -name "*.blend1" | while read f; do
  mkdir -p "/tmp/blend-stash/$(dirname "$f")"; mv "$f" "/tmp/blend-stash/$f"
done

# 3) 副本内执行导入
"$ENGINE" --headless --import --rendering-driver opengl3 --path /tmp/shuihu-import-work
# → exit 0，648 个 .import，1296 个导入产物

# 4) 把 *.import / *.uid / .godot/imported 拷回原工程（python3 脚本，见下）
# 5) 原工程冒烟
cd "$SRC" && "$ENGINE" --headless --path . --script godot/tests/smoke_test.gd
```

第 4 步脚本逻辑：遍历副本，把 `*.import` 与 `*.uid` 按相对路径拷回原工程，把 `.godot/imported/` 下 1296 个文件拷入原工程同名目录，另拷 `uid_cache.bin`。

## 4. 冒烟测试结果

命令：

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script godot/tests/smoke_test.gd
```

连续 3 次执行，输出均为：

```
Godot Engine v4.7.2.stable.official.ed1daf0bf - https://godotengine.org

GODOT_SMOKE_OK: journey map scene and six route nodes loaded
```

退出码：`0 / 0 / 0`。

## 5. 场景与资源加载证据

额外运行只读脚本（`/tmp/dump_scene.gd`，未写入工程）加载场景并打印节点树：

```
=== TEXTURE ===
journey map texture: loaded size=1672x941
=== SCENE TREE ===
- JourneyMap [Control]
  - Background [TextureRect]
  - Shade [ColorRect]
  - Header [MarginContainer] → Title [Label]
  - RouteNodes [Control]
    - Stage01 [Button] … Stage06 [Button]
  - Detail [PanelContainer] → Margin → Row → Copy / BeginButton
route count = 6
```

即：纹理可加载、场景可实例化、6 个关卡节点齐全，与冒烟断言一致。

## 6. 未导入 / 未覆盖项（如实列出）

| 项 | 数量 | 原因与建议 |
|---|---|---|
| `.blend` 源文件 | 149 | headless 下 Blender 路径不可配置，会阻断整个导入流程。`.blend` 是可编辑制作源，游戏运行使用已导出的 `.glb`，未纳入导入不影响运行。若需导入：在 Godot GUI 编辑器「编辑器设置 → FileSystem → Import → Blender → Blender Path」填入 `/Applications/Blender.app/Contents/MacOS/Blender` 后重新导入 |
| `.blend1` 备份 | 21 | Blender 自动备份，非资源，无需导入 |
| `.mp4` / `.py` / `.swift` 等 | 少量 | 非 Godot 可识别资源类型，引擎不生成 `.import` |
| Godot GUI 画面渲染 | — | headless 无渲染设备，本步**未做** GUI 截图；场景可用性由第 4、5 节的加载与节点树证据覆盖 |
| Forward+ 切换 | — | 本步**未做**（任务单禁止），属 CMD-006 范围 |
| Steam 导出 | — | 本步**未做**且被禁止；工程仍无 `export_presets.cfg` |

## 7. 边界遵守情况

| 约束 | 状态 |
|---|---|
| `project.godot` 渲染路径 | **未改**，`renderer/rendering_method="gl_compatibility"` 与 `.mobile` 同值（第 21、22 行） |
| `config/features` | 未改 |
| `assets/` 源文件内容 | 未改；本步仅在同目录**新增** `*.import` / `*.uid`，未修改任何 PNG/JPG/GLB/BLEND 源文件 |
| `game.js` / 网页玩法 | 未改 |
| `data/` | 未改 |
| `godot/**` 业务场景与脚本 | 未改 |
| Steam 导出 | 未执行 |
| 旧素材与存档 | 保留，未删除任何既有文件 |

操作全程在 `/tmp/shuihu-import-work` 副本上进行，原工程仅接收拷贝进来的导入产物。

## 8. 后续需要注意的两点

1. **`.gitignore` 忽略 `.godot/` 与 `*.import`**（仓库根 `/Users/user/Documents/Codex/youxi/meng/.gitignore` 第 2、4 行）。因此导入产物不入库，他人 clone 后需按第 3 节命令重跑一次导入才能跑通冒烟。若希望产物随仓库分发，需另行申请调整忽略规则。
2. **下次执行 `--headless --import` 仍会失败**：只要工程内存在 `.blend`，headless 导入就会被阻断。建议后续要么在 GUI 配置好 Blender 路径，要么把 Blender 源文件移出 `res://` 可见范围。
