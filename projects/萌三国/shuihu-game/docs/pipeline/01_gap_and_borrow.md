# CMD-001 · 缺口盘点与可借鉴清单

> 调研日期：2026-10-27（Asia/Shanghai）  
> 项目根：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`  
> 角色：只写调研文档；未改 `assets/`、`game.js`、`data/`，未导出 Steam。  
> 开源检索：`~/.workbuddy/skills/open-source-games/`（SKILL.md + references/catalog.md）

---

## C. 冻结假设（后续步骤共用）

以下假设作为流水线 #2～#6 的默认前提，除非指挥官书面改口：

1. **引擎主交付以 Godot 为准**  
   - 证据：根目录 `project.godot`（Godot 4.x Compatibility / `gl_compatibility`），主场景 `godot/journey_map/journey_map.tscn`。  
   - **网页版**（`index.html` + `game.js`）可继续作为玩法与数值的快速参考与对照，但**不以网页包作为 Steam/正式主交付目标**。

2. **抽卡欲望机制为最高优先级**（对应后续步骤 #2）  
   - 山景美化（#3）、角色补充（#4）、多支线剧情（#5）、Steam 候选包（#6）均**服从卡池展示与抽取反馈**需要：优先补齐「抽到好看、抽完想再抽」所需的展示面与循环，再铺开广度内容。

3. **风格与体量参照**  
   - 风格目标：3D Q 版 +《水浒传》演义改编。  
   - 本机对照工程：`~/萌三国`（只读；见 B 清单第 1 条）。当前迹象表明该工程多为 Godot 空壳配置，可学工程设置，不宜假设其已有完整场景树。

---

## A. 缺口表

口径说明（角色美术）：

| 口径 | 数量 | 证据 |
|---|---:|---|
| 数据好汉总数 | **108** | `data/shuihu.js` 席位表 `seats` 共 108 行；`data/portraits.js` 含 `hero-001`～`hero-108` |
| **专属**（精品手工 Q 版，已启用） | **12** | `data/portraits.js` 中 `status == "Q 版新立绘已启用"`；`README.md`「人物与动作样板」；CHAR-108 交接「精品保留」：宋江/吴用/公孙胜/林冲/花荣/鲁智深/武松/李逵/张顺/燕青/朱武/扈三娘（001/003/004/006/009/013/014/022/030/036/037/059） |
| **示意**（程序化/待深化） | **96** | 同上：CHAR-108 批次 `assets/releases/CHAR-108/`；`status` 多为「Q 版程序化立绘 · …」；12+96=108 |
| 敌军专属立绘（非好汉口径） | 4 | `portraits.js` 中 `status == "专属立绘已生成"`（高俅 + 三类杂兵），**不计入**上表专属好汉数 |

| # | 模块 | 现状证据（路径/文件） | 缺口 | 影响画质 | 影响玩法 | 影响抽卡 | 建议归属 |
|---|---|---|---|---|---|---|---|
| 1 | 山景 / 地形占位 | `assets/liangshan-journey-map.png`；`assets/liangshan-city-painted.png`；`assets/liangshan-battlefield-painted.png`；`assets/q/scenes/map-q.jpg` 等；Godot 侧 `godot/journey_map/` 主要贴图点击 | 多为 2D 绘景底板，缺少可进 Godot 的分层山体/植被/水面网格与可烘焙光照；3D 山景占位不足 | 是 | 否（当前玩法不依赖 3D 碰撞） | 是（卡池/征战背景氛围） | Blender操控 → Godot操控 |
| 2 | 角色美术完成度（专属 vs 示意） | `data/portraits.js`；`assets/q/*-portrait.png` / `*-sheet.png`；`assets/releases/CHAR-108/portraits/`、`sheets/`、`manifest.json`；`assets/masters/hero-00{3,6,9}-v1/` | **专属 12 / 示意 96**；示意将细节与动作连续度不足，卡池高稀有展示易「一眼假」 | 是 | 弱（可读性尚可） | 是 | 美术 + Blender操控 |
| 3 | 抽卡 / 保底 / 展示循环 | `game.js` 中 `recruit()` / `recruitPage()` / `recruit-ten`；文案含「十次保底」「本地随机招募，无服务器保底计数」 | 现有「招贤」偏资源兑换+本地随机，缺少独立卡池 UI、抽卡演出、进度可视化欲望曲线、图鉴收集反馈与 Godot 侧展示场景；**欲望机制规格尚未落地** | 是（演出） | 是 | **是（核心）** | 代码（规格先）+ 美术（展示）+ Godot操控 |
| 4 | 剧情支线接入 | `data/journey.js`（约 6 地点主线）；`data/hero-stories.js`（约 16 篇小传）；`docs/GAMEPLAY_REVIEW.md` | 支线数量与「抽卡→征战」挂钩弱；多数好汉无独立关卡钩子；多结局/多线程叙事未结构化 | 弱 | 是 | 是（掉落/卡池叙事包装） | 代码 + 少量文案美术 |
| 5 | Godot vs 网页完成度 | 网页：`index.html`、`game.js`、`game.css`、完整战斗/养成；Godot：`project.godot`、`godot/journey_map/`、`godot/art_002/`、`godot/tests/smoke_test.gd` | Godot 目前接近「山河地图入口 + 美术样板」；战斗、招贤、存档、装备等仍以网页为准，迁移面大 | 是 | 是 | 是（主交付在 Godot） | 代码 + Godot操控 |
| 6 | Steam 打包前置 | 工程内未见 `export_presets.cfg`；无 Steamworks / 成就 / 云存档对接痕迹；`README.md` 写明尚未 App 封装 | 缺导出预设、应用图标规范、商店页素材清单、输入重映射与窗口化验收清单 | 弱 | 弱 | 否（可后置，但 #6 需要） | Godot操控 + 少量代码 |
| 7 | 卡池向角色补充管线 | `tools/blender/char108/`（CHAR-108 交接提及）；`assets/releases/ART-002/r6|r7/source/*.blend`；精品仅 12 | 缺少「按卡池稀有度优先」的补美排序与 Godot 导入约定；restArt 多数缺失（CHAR-108 已知限制） | 是 | 弱 | 是 | 美术 + Blender操控 |
| 8 | 连续动作 / 3D 骨骼表现 | `assets/models/cutout/`（林冲样板 blend + frames）；多数角色仍为七帧静态拼 sheet + `battle-motion.js` 程序位移 | 非连续骨骼动画；抽卡亮相与战场表现偏「拼贴」；难以支撑 3D Q 版主交付观感 | 是 | 弱 | 是 | Blender操控 + 代码 |
| 9 | 战场 / 主城 3D 场景化 | `godot/art_002/battlefield_sample.tscn`；网页沙盘 CSS 布局；`assets/releases/ART-002/` 偏 2D 入口可用性 | 3D 战场与主城仍是样板级；与抽卡展示场景未统一灯光与镜头语言 | 是 | 弱 | 是 | Godot操控 + Blender操控 |
| 10 | 音频与抽卡反馈 | `bgm.js`；`assets/releases/CHAR-108/audio/`；`assets/releases/AUDIO-002/` | 已有主城/战斗 BGM；抽卡专用提词、稀有度音效、展示 VO 覆盖不足 | 是 | 弱 | 是 | 美术（音频）+ 代码 |

---

## B. 可借鉴清单（机制/工程，不抄素材）

检索来源：`~/.workbuddy/skills/open-source-games/references/catalog.md`；另对照本机 `~/萌三国`。

| # | 游戏名 | 源码 / 官网链接 | 借鉴点（≤2 句） | 禁止照搬项 | 拟用于步骤 |
|---|---|---|---|---|---|
| 1 | **萌三国**（本机对照） | 本地工程：[`file:///Users/user/萌三国/project.godot`](file:///Users/user/萌三国/project.godot)；引擎说明：[https://godotengine.org](https://godotengine.org) | 可学：`project.godot` 的 Godot **4.7 + Forward Plus**、`canvas_items` 拉伸、`Jolt Physics`、Windows `d3d12` 驱动等工程开关；与本作 Compatibility/`gl_compatibility` 对照，便于决定主交付渲染路径与目录「空壳起步再分层」的节奏。当前该目录几乎无 `*.tscn`/`*.gd` 业务场景，宜学配置而非抄场景树。 | 不复制其题材文案、图标以外的任何假定素材；不把它的空壳目录误当成完整玩法模板 | #5（Godot 工程组织）、#6（渲染/导出路径选型） |
| 2 | The Battle for Wesnoth | 官网 [https://www.wesnoth.org/](https://www.wesnoth.org/) · 源码 [https://github.com/wesnoth/wesnoth](https://github.com/wesnoth/wesnoth) | 回合制战役的章节解锁、阵容养成与剧本事件钩子较成熟，可参考「征战节点 → 短剧情 → 战斗」的信息架构。 | 不使用其像素美术、阵营徽记、剧本文本 | #5 剧情支线、#2 抽卡后的征战去向 |
| 3 | Ancient Beast | 官网 [https://ancientbeast.com](https://ancientbeast.com) · 源码 [https://github.com/FreezingMoon/AncientBeast](https://github.com/FreezingMoon/AncientBeast) | 单位图鉴式收集与回合对战结合，可参考卡牌/单位详情页如何服务「收集欲」。 | 不搬其生物原画与音效包 | #2 抽卡展示、#4 角色补充优先级 |
| 4 | Shattered Pixel Dungeon | 官网 [https://shatteredpixel.com](https://shatteredpixel.com) · 源码 [https://github.com/00-Evan/shattered-pixel-dungeon](https://github.com/00-Evan/shattered-pixel-dungeon) | 物品/角色收集反馈、随机掉落与成长循环清晰，可借鉴「短局奖励 → 再来一次」的欲望节奏（非照搬 Roguelike 地下城）。 | 不使用其像素 tile、怪物图与商标 | #2 抽卡欲望循环 |
| 5 | OpenXcom | 官网 [https://openxcom.org/](https://openxcom.org/) · 源码 [https://github.com/OpenXcom/OpenXcom](https://github.com/OpenXcom/OpenXcom) | 兵员名册、招募/伤病/装备槽的管理 UX 可对照本作「将册 + 招贤 + 配装」。 | 需自备原版 UFO 资源才能完整体验；禁止把原版美术当素材 | #2 招募展示、#4 角色管线 |
| 6 | Athena Crisis | 官网 [https://athenacrisis.com](https://athenacrisis.com) · 源码 [https://github.com/nkzw-tech/athena-crisis](https://github.com/nkzw-tech/athena-crisis) | 现代复古战棋的关卡目标多样性与 UI 可读性，可对照 `docs/GAMEPLAY_REVIEW.md` 中的任务差异设想。 | 不复制其关卡地图与角色立绘 | #5 支线目标、#3 场景可读性 |
| 7 | Unknown Horizons Godot port | 源码 [https://github.com/unknown-horizons/godot-port](https://github.com/unknown-horizons/godot-port) · 引擎 [https://godotengine.org](https://godotengine.org) | 同为 Godot 迁移中的策略/经营项目，可观察场景分层、资源目录与 2D/模拟逻辑拆分方式。 | 不搬其像素建筑与文明题材资产 | #5 Godot 迁移组织、#6 导出前目录整理 |

---

## 给指挥官的简要结论

- **最大缺口**不在「有没有 108 将数据」，而在：**抽卡欲望循环尚未产品化**，且 **Godot 主交付仍远落后于网页可玩度**。  
- 美术上 **12 专属 / 96 示意** 的结构已清晰；后续补美建议按卡池亮相优先级，而不是按席位号均匀铺开。  
- 山景与 3D 场景服务抽卡/征战展示即可先做「够用的舞台」，再追求广地图。

