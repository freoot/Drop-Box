# 后续核心玩法闭环与可交付清单（待验收派单）

- 整理人：主程序与整合负责人（代理 A）
- 整理时间：2026-10-29 01:3x（Asia/Shanghai）；**2026-10-29 04:4x 已按指挥官指令更新第 1、3、5.1、5.3、5.4、7 节**
- 依据：本轮 CMD-005/CMD-006 实测、剧情组 CH-001 与 CH-002 交付、动作组 ACT-003 与 ACT-004 交付，以及既有 CMD-001～004 文档
- 用途：供指挥官验收并派下一阶段；**原始盘点部分未修改任何代码或资产，第 5.3/5.4/7 节的更新条目为本轮实际改动的结果记录**

## 1. 当前已验证状态（有证据支撑）

| 层面 | 状态 | 证据 |
|---|---|---|
| 网页版可运行 | 是 | 无头浏览器访问 `index.html`，取名后主城正常渲染，`pageerror` 计数 0；截图已迁至持久目录 `docs/evidence/CH-002/` |
| 网页版单元回归 | **173 项 / 173 通过 / 0 失败** | `tools/run-tests.sh`；原失败项 `ART-002 r7 b1 runtime evidence` 已用真实图形运行补齐 `runtime.json` 后转绿（未削弱任何断言） |
| 招贤欲望环 P0 | 已实现（CMD-003，READY_FOR_REVIEW） | 玉璧三处产出、跨轮保底、抽后去向、`已入寨 n/108`、重复分档补偿 |
| 首章单关剧情 | **已接入（CH-002，本轮）** | 第 1 关 `beats` 13 条按哨兵分三段；开场 5 / 胜利 3 / 失败 3；`tests/ch-002-story.test.mjs` 11 项通过；浏览器实证 8 张截图 |
| Godot 侧资源导入 | 完成并可复现（CMD-005 + 本轮脚本化） | 清理缓存后从零重建：754 `.import` / 1508 导入缓存 / 7 `uid`；副本内冒烟输出 `GODOT_SMOKE_OK` |
| Godot 侧旅程地图 | 场景可实例化，6 个关卡节点 | `journey map texture: loaded size=1672x941`；`Stage01`–`Stage06` |
| 渲染路径 | 仍为 `gl_compatibility` | `project.godot` 第 21、22 行；CMD-004 推荐 Forward+ 但**本轮仍不切换**（指挥官指令） |

## 2. 核心玩法闭环：现状链路与缺口

目标闭环：**取名 → 山寨 → 招贤 → 布阵 → 征战/爬塔 → 战斗 → 奖励 → 刷新恢复**

| 环节 | 网页版 | Godot 侧 | 缺口 |
|---|---|---|---|
| 取名 / 存档 | 有 | 无 | Godot 侧无存档逻辑 |
| 山寨主城 | 有（6 个建筑入口） | 无 | 双轨未打通 |
| 招贤（抽卡） | 有（CMD-003 已补 P0） | 无 | — |
| 布阵 | 有 | 无 | — |
| 征战 / 关卡 | 有（章节推图） | 仅 `journey_map.tscn` 静态 UI（6 个节点，无数据联动） | 关卡数据与 Godot 未对接 |
| 战斗 | 有（手动/自动） | 无 | — |
| 奖励 / 刷新恢复 | 有 | 无 | — |
| 剧情 | 仅好汉故事文本（`data/hero-stories.js`） | 无 | **首章剧情未接入**，见第 3 节 |

## 3. 剧情组 CH-001 交付摘要与接口缺口

> **本轮更新**：已按指挥官指令降级为「现有单关可接入」方案，产出 `docs/content/CH-002/`（01 挂载点实证 / 02 单关降级方案 / 03 台词 / 04 回归计划），并由 A 实际接入。15 条接口缺口**本轮一条不补**，逐条推迟理由见 CH-002 `02_single_level_plan.md` 第 3.2 节。

- 交付目录：**`docs/content/CH-001/`**（此前本文件误写为 `CH-01/`，已更正）
  - `docs/content/CH-001/01_research.md`（250 行）、`02_chapter_beats.md`（212 行）、`03_data_contract.md`（301 行）
- 首章规模：3 关（渡口哨探 / 芦苇浅滩 / 粮道收尾），出场 6 位好汉（宋江、吴用、林冲、花荣、李逵、鲁智深）+ 旁白 + 4 名敌方；22 个节拍（B01–B22）+ 2 条失败短版
- 需主程序补齐的接口缺口：**15 条**，其中阻塞项 5 条
  - G-01：每章只有 1 场战斗，缺子关卡数组（已附单关降级方案）
  - G-02：`beats` 缺触发条件字段
  - G-03：战斗中无剧情通道
  - G-07：胜利条件硬编码为歼灭
  - G-08：缺入队事件字段
- 组方标注「需 A 补充」的未验证项：`heroMeta()` 对未入队好汉的行为、战斗循环内是否已有对话钩子、Godot 侧是否消费 `beats`

## 4. 动作组 ACT-003 交付摘要与冲突

> **本轮更新**：ACT-004 已实际解析 GLB 内部轨道与骨骼、用实测峰值裁决三处时点冲突，并产出 hero-005 五动作可播放预览（84 帧 + sprite sheet + 纯本地 `preview.html`），见 `docs/motion/ACT-004/`。实测确认：GLB 内**无 death 原生片段**（18/18 资产 clip 仅 idle/walk/attack/hit），预览中的 death 为合成并已在页面标注；**无专用武器挂点节点**，`hand.R` 为假设。

- 交付：`docs/motion/ACT-003/01_asset_inventory.md`（325 行）、`02_action_spec.md`（274 行）、`03_preview_spec.md`（488 行）+ `motion-hero-005.json`、`motion-hero-006.json`
- 覆盖：5 个角色 × 5 个动作（待机 / 移动 / 攻击 / 受击 / 死亡）= 25 条规格，2 个角色附完整 JSON 时序
- 现有资产：18 个 `hero*.glb`（编号 002/005–008/010–015/017/019/021–025）、`weapon-map.json`（13 类武器）、`assets/rigs/` 下仅林冲一套骨骼
- **待裁决的 3 处时点冲突**：
  1. 命中时点 294ms 与 458ms 两套口径并存
  2. `hit` 时长 0.75s 与 1.0s 不一致
  3. 收招需 1110ms，但现有片段仅 1000ms
- **死亡动作在所有现有资产中不存在**，属全新设计
- 未读到的内容：各 `.glb` 内部动画轨道与武器实际挂点（规格中按 `hand.R` 暂拟）、`.blend` 二进制内容

## 5. 可交付物清单（源码 / 资产 / 构建 / 运行说明）

### 5.1 源码

| 类别 | 内容 | 归属 |
|---|---|---|
| 网页主程序 | `index.html`、`game.js`、`hero-power.js`、`journey.js` | A 独占 |
| 数据表 | `data/shuihu.js`（108 将）、`data/journey.js`、`data/hero-stories.js`、`data/portraits.js` | A / B |
| 表现层 | `game.css`、`battle-motion.js`、`battle-vfx.js/css`、`combat-motion-*`、`tavern-*.js`、`tavern-motion.css`、`character-studio.*` | C 独占 |
| 音频 | `bgm.js`、`audio-sfx.js`、`audio-candidates.*`、`audio-audition.html`、`docs/audio/SOURCES_AND_LICENSES.md` | **A 独占**（此前本表误标为「B 独占」，已更正：AUDIO-002 r2 与 r3 均因 B 服务中断由 A 串行代实现并集成，见 `AUDIO-002.md`） |
| Godot | `godot/journey_map/`、`godot/art_002/`、`godot/tests/`（约 810 行 GDScript） | A 独占 |
| 测试 | `tests/*.test.mjs`（162 项） | 各组 |

### 5.2 资产（导入后统计）

- 图像：578 PNG、25 JPG、2 SVG
- 模型：31 GLB（含 18 个 `hero*.glb`）
- 音频：5 WAV（AUDIO-002 五首候选：daily-guzheng / daily-flute / battle-spirited / battle-boss 等）、2 MP3
- 源工程文件：149 `.blend` + 21 `.blend1`（未参与导入，见 CMD-005 notes）
- 其他：32 JSON、7 MD、5 PY、2 MP4、1 SWIFT

### 5.3 构建与运行说明（现状）

| 项 | 命令 / 方式 | 现状 |
|---|---|---|
| 网页版启动 | `tools/serve.sh` → `http://127.0.0.1:8765/shuihu-game/index.html` | 已脚本化 |
| 网页版测试 | `tools/run-tests.sh` | 已脚本化，173 项 / 173 通过 / 0 失败 |
| Godot 冒烟 | `tools/godot-smoke.sh`（`SMOKE_TIMES=3` 可跑三次） | 已脚本化，校验 exit 0 + `GODOT_SMOKE_OK` |
| Godot 资源导入 | `tools/godot-import.sh` | 已脚本化；已验证清缓存后可从零重建（754 `.import` / 1508 导入缓存 / 7 `uid`，副本内冒烟 OK） |
| ART-002 批次证据 | `tools/art-002-capture.sh` | 已脚本化；注意 headless.json 与 runtime.json 必须成对重生成 |
| 导出配置 | `export_presets.cfg` | **不存在**，本轮禁止导出 |
| CI | 无 | 仍未接入 CI；一键脚本已在 `tools/` |

### 5.4 运行说明需要补充的地方（本轮已处理）

1. ✅ README「验证」节已补充 Godot 导入与冒烟步骤，并新增「一键脚本」章节。
2. ✅ 导入产物被忽略、clone 后需重跑导入，已在 README 写明，并给出 `tools/godot-import.sh` → `tools/godot-smoke.sh` 两步。
3. ✅ 一键脚本已新增并归属 `tools/`（A 独占）：`serve.sh` / `run-tests.sh` / `godot-import.sh` / `godot-smoke.sh` / `art-002-capture.sh`。

## 6. 建议的后续阶段（供派单参考）

| 阶段 | 目标 | 主要产出 | 依赖 |
|---|---|---|---|
| P0 | 首章剧情接入 | **本轮已完成（单关降级版）**：`docs/content/CH-002/` + 第 1 关 `beats` 三段化 + 结算台词 + 存档回归测试 | 已交付 |
| P1 | 动作接入 | **本轮部分完成**：ACT-004 已实测 GLB 轨道并裁决三处时点、产出 1 角色 × 5 动作可播放预览；尚未把 5 角色全量接入网页战斗 | 需指挥官派单 |
| P2 | Godot 玩法迁移 + 渲染切换（Forward+）+ 导出配置 | 均未启动 | 依赖 CMD-004 结论；**本轮明确不切 Forward+** |

## 7. 待指挥官决策项（本轮处置结果）

| # | 原问题 | 本轮处置 |
|---|---|---|
| 1 | CMD-006（Forward+ 切换）是否派发 | **明确不切**。`project.godot` 仍为 `gl_compatibility`，未改动 |
| 2 | 首章 15 条接口缺口是否补 | **不补**。按 CH-002 降级为现有单关可接入方案：不新增任何数据字段，只用现有 `beats`；15 条缺口全部推迟并已逐条记录推迟理由（`docs/content/CH-002/02_single_level_plan.md` 第 3.2 节） |
| 3 | 动作 3 处时点取哪组 | **已用实测裁决**：命中 **458ms**（实测 attack 冲击峰值 456ms，18 个资产分布 420–497.7ms，294ms 差 162ms 落选）；`hit` = **750ms**（实测 15/18 资产为此值）；`attack` 总长 **1110ms**（原生 1000ms + 运行时补尾 110ms，不侵入资产）。详见 `docs/motion/ACT-004/02_timing_resolution.md` |
| 4 | 音频默认曲是否选定 | **不换**。默认曲沿用原 CHAR-108 两首；新增统一试听入口 `audio-audition.html`，来源与授权登记见 `docs/audio/SOURCES_AND_LICENSES.md` |
| 5 | ART-002 r7 的 `runtime.json` 是否补 | **已补，且为真实运行产物**。用 Godot 图形化 `--batch-capture` 实际跑出 `runtime.json` + 18 张动作实拍图 + 3 张分页图；同步重跑 `--batch-test` 更新 `headless.json`（旧文件缺哈希字段）。未伪造、未削弱断言 |
| 6 | 是否允许新增 `tools/` 一键脚本 | **已新增 5 个**：`serve.sh`、`run-tests.sh`、`godot-import.sh`、`godot-smoke.sh`、`art-002-capture.sh` |

### 7.1 仍需指挥官决策的新增项

1. **候选曲中哪一首（若有）可定为新默认曲**——需用户试听后决定；在系统音色库授权未核验前不建议对外发布替换。
2. **其余 4 个角色是否按 ACT-004 的统一时点做全量预览与接入**——本轮只做了 hero-005 一角色。
3. **武器挂点**：实测 GLB 内**不存在专用武器挂点节点**，ACT-003 的 `hand.R` 为假设。是否要美术侧补挂点后再接武器。
4. **音效 contactMs 与动作命中帧对齐**：`audio-sfx.js` 现用近战 294ms，动作实测为 458ms，两者口径不同。是否统一（会改动既有音效时点）。

## 8. 本轮未测项（如实列出）

- Godot GUI 渲染画面（headless 无渲染设备）
- 手机竖屏 / 横屏真机试玩（本轮仅桌面视口无头浏览器）
- 美术与视觉验收（属 Codex 独立验收范围）
- 音乐/音效分别切换的实际听感（未做听感验证，仅确认资产存在）
- Steam / 任何导出（本轮禁止）
