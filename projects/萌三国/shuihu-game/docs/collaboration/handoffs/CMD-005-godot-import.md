# 交接 / 返修单

- 任务 ID / 修订号：CMD-005 / r1（引擎切换前必做：工作副本首次资源导入，让冒烟转绿）
- 负责人 / 接收人：游戏指挥官（派单与验收） / WorkBuddy（执行）
- 状态：READY_FOR_REVIEW
- 基线：收到本单时 `shuihu-game` 当前工作区；CMD-004 已 PASS，推荐主交付 Forward+，但**本步只做导入，不切换渲染路径**
- 允许修改的文件（仅这些）：
  - 由 Godot 导入生成的 `**/*.import`、`.godot/imported/**`、`.godot/global_script_class_cache.cfg` 等导入缓存
  - 若导入必须写出的 `.uid`（Godot 4.x）可保留
  - `docs/pipeline/05_import_notes.md`（新建：做了什么、命令、导入前后对比）
  - `docs/pipeline/05_acceptance_selfcheck.md`（新建：对照验收自检）
  - 本交接单末尾「实际修改」段与状态字段
- **禁止**：改 `project.godot` 的 `[rendering]` / `config/features`（不要切 Forward+，那是下一单）；改 `assets/` 源图内容、改 `game.js` / 网页玩法、改 `data/`、改 `godot/**` 业务场景与脚本逻辑、导出 Steam、大范围重构
- 回滚：删除本步生成的 `.import` / `.godot/imported` 与两份 05 文档；不得 `git reset --hard`

## 角色分工

| 角色 | 谁做 | 本步做什么 |
|---|---|---|
| 写代码 | WorkBuddy | **不做**业务逻辑；只触发 Godot 导入；可写临时探测命令，结果写入 05 notes |
| 做美术 | WorkBuddy | **不做**新资产；只导入已有 PNG 等 |
| 操控软件 | WorkBuddy | 操控本机 `/Applications/Godot.app`（4.7.2）对工程执行导入；可用 headless |
| 写文档 | WorkBuddy | 05 notes + 自检 |
| 验收 | 游戏指挥官 | 按验收标准 |

---

## 任务单正文

📋 任务单 #5（P0 · Godot 首次资源导入）
任务名称：导入工作副本资源，冒烟测试转绿
执行角色：WorkBuddy

必读：
- `docs/pipeline/04_engine_selection.md` A.3 / D 反面证据 / E 后续影响（0 个 `.import` → 冒烟失败）
- `docs/pipeline/04_acceptance_selfcheck.md` 第 109 行附近：切换 Forward+ 前须先导入
- `godot/tests/smoke_test.gd`、`godot/journey_map/journey_map.tscn`

背景（事实）：
- 当前 `find . -name "*.import" | wc -l` → **0**
- 冒烟：`/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script godot/tests/smoke_test.gd` 失败，缺 `assets/liangshan-journey-map.png` 的导入侧 Texture2D

本步必须交付：

1. **完成工程资源导入**：用本机 Godot 4.7.2 对 `/Users/user/Documents/Codex/youxi/meng/shuihu-game` 执行导入（优先 headless `--import`；若失败再用编辑器打开工程一次后退出，确保写出 `.import`）。
2. **冒烟转绿**：同一条冒烟命令退出码 0，不再报 missing journey map texture。
3. **证据入文档**：
   - 导入前/后 `find . -name "*.import" | wc -l`
   - 冒烟命令完整输出摘要
   - 是否改动了 `project.godot`（期望：**未改** rendering）

文档：
- `docs/pipeline/05_import_notes.md`
- `docs/pipeline/05_acceptance_selfcheck.md`

验收标准：
- [ ] 两份 05 文档存在且自检全通过
- [ ] `find . -name "*.import" | wc -l` ≥ 1（至少含旅程地图相关）
- [ ] 冒烟命令成功（exit 0）
- [ ] `project.godot` 仍为 `gl_compatibility`（本步未切 Forward+）
- [ ] 未改 `assets/` 源文件内容、未改网页玩法代码、未导出 Steam
- [ ] notes 写明复现命令

完成后：交接单改 `READY_FOR_REVIEW`，回报绝对路径；**不要擅自开始 Forward+ 切换或山景美化**（等指挥官下一单）。

流水线持续指令：交完本单后保持会话在线；指挥官有例程会自动验收并派下一单，无需空等用户粘贴。

---

## 实际修改 / 测试结果（WorkBuddy，2026-10-29 00:20–01:20）

### 根因

不是引擎环境故障，也不是渲染路径问题：

1. **主因**：`assets/` 下 149 个 `.blend` 使 Godot 4.7 的 Blender 导入器在 headless 下报
   `Blender path is invalid or not set ... Cannot configure blender path in headless mode`，
   该错误让整个 `reimport` 流程中止——其余 PNG/JPG/GLB 因此一并没有导入（日志中完全没有 `reimport` 步骤）。
   已用四组对照实验验证：最小工程成功 → 完整副本 0 导入 → 子集（PNG+20 GLB）成功 21 → 子集再 +1 个 `.blend` 变为 0 导入。
2. **次生现象**：`run/main_scene` 指向 `journey_map.tscn`，编辑器加载布局时该场景引用的 PNG 尚无 `.import`，
   报 `Failed loading resource` 后崩溃；日志尾部 `mvk::SPIRVToMSLConverter` 是 Godot 崩溃处理器的二次崩溃，不是首因。

### 处理

在 `/tmp/shuihu-import-work`（APFS 克隆副本）中移除 `run/main_scene` 并排除 `.blend`/`.blend1`，执行
`Godot --headless --import --rendering-driver opengl3 --path <副本>` → exit 0、648 个 `.import`、1296 个导入产物；
随后把 `*.import`（648）、`*.uid`（7）、`.godot/imported/**`（1296）、`uid_cache.bin` 拷回原工程。
**原工程 `project.godot` 未做任何改动。**

### 结果

| 项 | 导入前 | 导入后 |
|---|---|---|
| `*.import` | 0 | 648（含 `assets/liangshan-journey-map.png.import`） |
| `.godot/imported` | 0 | 1296 |
| 冒烟退出码 | 1 | 0（连续 3 次，输出 `GODOT_SMOKE_OK: journey map scene and six route nodes loaded`） |
| 旅程地图纹理 | 加载失败 | 成功，1672×941 |
| `RouteNodes` 子节点 | — | 6（Stage01–Stage06） |

网页侧回归：`node --test tests/*.test.mjs` → 162 项 / 161 通过 / 1 失败
（失败项 `ART-002 r7 b1 runtime evidence`，缺 `runtime.json`，CMD-003 阶段既有问题，与本步无关）。

### 未通过 / 未测项

- `.blend`（149 个）未导入：headless 下 Blender 路径不可配置，会阻断整轮导入；游戏运行使用已导出的 `.glb`，不影响冒烟。
  后续如需导入：在 GUI 编辑器设置中填 `/Applications/Blender.app/Contents/MacOS/Blender` 后重跑导入。
- Godot GUI 渲染画面未测（headless 无渲染设备）；场景可用性由冒烟与节点树证据覆盖。
- Forward+ 切换、Steam 导出均按本单要求未执行。

### 交付文档

1. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/05_import_notes.md`
2. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/05_acceptance_selfcheck.md`

复现命令见 notes 第 3 节。截图证据：`/tmp/shuihu-cmd005/01-main.png`、`02-recruit.png`、`03-battle.png`（浏览器 `pageerror` 计数 0）。
