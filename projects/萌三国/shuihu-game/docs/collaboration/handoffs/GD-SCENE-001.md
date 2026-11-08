# GD-SCENE-001 · Godot 4.7 战棋场景结构设计（仅设计，不含实现）

**任务性质**：设计文档。本文件不新增 `.gd` / `.tscn`，不生成资产，不提交代码。
**工程**：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`
**引擎**：Godot 4.7.2.stable（`docs/collaboration/handoffs/CMD-018-final-delivery.md` 第 26 行；`project.godot` 为 `config_version=5`）
**阅读基线**：读取时工作树含未提交改动（`git status` 见会话开头）。本文只依据实际读到的文件；未验证项标 **UNVERIFIED**。
**文件所有权**：按 `AGENTS.md`，`godot/`、`project.godot` 由 A 独占编辑；C 提供表现参数与视觉验收，B 提供音效挂点，D 独立试玩。本文不改变所有权。

---

## 一、现状

### 1.1 现有场景与脚本

| 路径 | 类型 | 实际职责 | 是否真实玩法 |
|---|---|---|---|
| `godot/art_002/battlefield_sample.gd` + `.tscn` | 3D 样板 | 6 名好汉展示、8×4 棋格碰撞、点选/移动演示、相机自适应、程序化 UI；文件头明确「Presentation state only; no save or damage API」（第 2 行） | 否，纯表现样板 |
| `godot/art_002/hero_sample.gd` | 单位表现脚本 | 实例化 GLB、找 `AnimationPlayer`、`idle/walk/attack/hit` 播放、`move_to` 补间、选中碰撞体；声明「no gameplay, currency or save ownership」（第 2 行） | 否 |
| `godot/art_002/batch_review.gd` + `.tscn` | 批量审查 | `extends "res://godot/art_002/battlefield_sample.gd"`（第 1 行）；读 `r7/batches/<id>.json`（第 24 行）；分页生成角色、动作截图、骨架姿态检查、证据 JSON | 否，ART 证据工具 |
| `godot/art_002/test_samples.gd` | SceneTree 测试 | 断言 6 角色、24 个动作、32 个棋格可射线点选、脚底 y=0.065（第 10–35 行） | 测试 |
| `godot/tiger_tutorial/tiger_tutorial.gd` + `.tscn` | 3D 玩法 | 武松打虎教学闭环：固定站位回合制 → 胜利招募 → 编队 → 第二战；内嵌战斗数值、存档读写、UI、音乐（1727 行） | 是，但**不是棋格战棋** |
| `godot/battle/hero_battle_stage.gd` + `.tscn` | 3D 玩法 | 实时 1v1：键盘左右移动、朝向扇形命中、HUD、演示/测试；只加载 `hero005` 一个模型（第 19 行） | 是，实时对打原型 |
| `godot/motion/hero_action_stage.gd` + `.tscn` | 3D 展示 | 五动作展示与动作测量，不参与战斗（第 19–23 行） | 否 |
| `godot/journey_map/journey_map.gd` + `.tscn` | Control 地图 | 章节按钮；点击「开始」只显示「完整版剧情与战斗目前在网页试玩版中运行」（第 59–61 行） | 否，占位入口 |
| `project.godot` | 工程配置 | 主场景 `res://godot/journey_map/journey_map.tscn`（第 8 行）；`gl_compatibility`（第 21 行）；**没有 `[autoload]` 段** | — |

### 1.2 各脚本实际拥有什么

- **`battlefield_sample.gd`**：拥有世界环境与灯光（`_setup_world`，90–133）、正交相机与自适应（`_fit_camera`，134–137）、棋格坐标公式（`cell_position`，139–140）、32 个 `StaticBody3D` 棋格（`_build_cells`，142–159）、选中圈/格标记（`_ring`，161–173）、程序化 UI（175–224）、射线拾取（`pick_at`，236–239）、键鼠输入（241–262）、截图证据（269–323）。
- **`hero_sample.gd`**：拥有单个单位的模型实例化（14–34）、动作查找与播放（36–63）、移动补间（69–80）、选中碰撞体（21–33）。它不知道棋格规则，也不校验目标格。
- **`batch_review.gd`**：继承样板的世界/棋格/相机/输入，追加批次清单读取（18–28）、分页（104–126）、证据写入（168–249）、骨架动作校验（251–368）。
- **`tiger_tutorial.gd`**：拥有世界/相机（425–459）、武松与虎的生成（503–582）、战斗数值与回合（88–109、1136–1267）、存档（386–420）、招募/编队（1454–1573）、UI（712–1004）、音乐（1083–1104）。
- **`hero_battle_stage.gd`**：拥有实时状态机（309–364）、朝向扇形判定（376–392）、命中结算（395–434）、HUD（233–305）。
- **`hero_action_stage.gd`**：拥有动作片段查找（163–170）、命中时刻测量（265 起）、动作展示。
- **`journey_map.gd`**：只有 6 个章节按钮与占位文案（3–10、59–61）。

### 1.3 重复与耦合

1. **世界搭建重复 4 份**：`battlefield_sample._setup_world`、`tiger_tutorial._build_world`、`hero_battle_stage._build_world`、`hero_action_stage._setup_view` 各自创建环境、灯光、相机。
2. **模型加载重复且不一致**：
   - `battlefield_sample.load_model` 用运行时 `GLTFDocument.append_from_file(ProjectSettings.globalize_path(path), state)`（66–73），再把结果 `pack` 成 `PackedScene`（83–88）；
   - `batch_review` 又实现了一份 `load_model`（48–58），覆盖父类同名方法；
   - `tiger_tutorial`、`hero_battle_stage`、`hero_action_stage` 走导入管线 `load(path) as PackedScene`（`tiger_tutorial.gd` 504–510、`hero_battle_stage.gd` 175–187、`hero_action_stage.gd` 124–141）。
3. **资产根不一致**：`battlefield_sample` 固定 `RELEASE := "res://assets/releases/ART-002/r6/"`（第 5 行）；`batch_review` 固定 `R7 := "res://assets/releases/ART-002/r7/"`（第 3 行），并允许记录里出现 `../r6/...`（b1 的 `hero-014` 即 `../r6/models/wusong.glb`）。
4. **棋格坐标只有一处**：`cell_position`（139–140）是唯一公式，但 `tiger_tutorial` 与 `hero_battle_stage` 完全不使用棋格；浏览器版另有百分比坐标 `BOARD_GEOM`（`game.js` 378–380），两套坐标系无共享契约。
5. **伤害结算写在表现场景里**：
   - `tiger_tutorial._player_action` 在场景脚本内直接减血（1172–1214）；
   - `hero_battle_stage._resolve_player_hit` / `_start_enemy_attack` 同样直接减血（395–434）。
   没有独立的规则层，表现层与结算层无法分别测试。
6. **存档逻辑只在 `tiger_tutorial` 内**：`_load_save` / `_save` / `_resolve_save_path`（386–420、308–320）不可复用；其他场景没有存档入口。
7. **角色 ID 映射是硬编码**：`_hero_display_name` 只认识 `"wusong"`（1553–1556）；而 r7 清单用 `hero-014`（`r7/batches/b1.json`）。两套 ID 并存。
8. **UI 全部程序化创建**：样板（175–224）、批量审查（69–102）、教学（712–1004）、实时战斗（233–305）各写一套，无共享主题或布局。

### 1.4 样板 vs 真实玩法

- **样板**：`art_002/*`。有 8×4 棋格与点选，但没有回合、没有伤害、没有存档；`battlefield_sample` 文件头已声明。
- **真实玩法 1**：`tiger_tutorial`。有回合、伤害、招募、存档，但**固定站位、不走格子**（文件头第 7 行「固定站位回合制，点选目标与技能，不走格子」）。
- **真实玩法 2**：`hero_battle_stage`。实时左右对打，只支持 `hero005`（`DELIVERY-STATUS.md` 第 3–5、111–122 行）。
- **结论**：目前不存在「8×4 棋格 + 回合状态机 + 独立结算 + 存档钩子」的真实战棋场景。浏览器版有 8×4 棋格与完整结算（`game.js` 378–457），但按 `AGENTS.md` 与 `CMD-018` 不作为 Godot 迁移基线。

---

## 二、目标场景树（真实玩法场景）

### 2.1 总览

建议新场景：`godot/battle/battle_scene.tscn`，根节点 `BattleScene`（`Node3D`，脚本 `battle_scene.gd`）。
**不覆盖**现有 `hero_battle_stage.tscn`；两者并存，前者是实时原型，后者是棋格战棋。

```
BattleScene (Node3D)                         battle_scene.gd        只做装配与转发
├─ World (Node3D)                            world_view.gd          环境/灯光/景物
│  ├─ WorldEnvironment (WorldEnvironment)
│  ├─ Sun (DirectionalLight3D)
│  ├─ Fill (DirectionalLight3D)
│  └─ Scenery (Node3D)                                              运行时挂载 liangshan_battlefield.glb
├─ CameraRig (Node3D)                        camera_rig.gd          正交相机、构图、屏幕↔棋格
│  └─ Camera3D (Camera3D)
├─ Board (Node3D)                            board_view.gd          8×4 棋格与高亮，不存规则
│  ├─ CellColliders (Node3D)                                        32 个 StaticBody3D，layer 1
│  ├─ Highlights (Node3D)                                           选中圈/移动格/攻击格/目标标记
│  └─ Props (Node3D)                                                道具 GLB，不参与拾取
├─ Units (Node3D)                            unit_layer.gd          单位视图的生成/回收/查找
│  └─ UnitView_* (Node3D, 运行时)            unit_view.gd           extends hero_sample.gd
├─ Rules (Node)                              battle_state.gd        回合/阶段/合法行动/单位逻辑状态
│  └─ Resolver (Node)                        battle_resolver.gd     纯结算，输出 BattleEvent
├─ Assets (Node)                             asset_catalog.gd       清单解析、路径归一、PackedScene 缓存
├─ Input (Node)                              battle_input.gd        射线拾取，输出意图
├─ UI (CanvasLayer)                          battle_hud.gd          只读状态/事件，只发意图
│  ├─ TopBar (PanelContainer)
│  ├─ UnitPanel (PanelContainer)
│  ├─ ActionBar (HBoxContainer)
│  ├─ LogPanel (PanelContainer)
│  └─ ResultPanel (PanelContainer)
├─ SaveHook (Node)                           save_service.gd        user://save.json 的唯一读写口
├─ Audio (Node, 可选)                        battle_audio.gd        只消费 impact 事件，不结算
└─ Evidence (Node, 默认禁用)                 evidence_recorder.gd   复用批量审查的证据写法
```

节点类型全部为 Godot 内置类型；没有 Autoload。`project.godot` 当前无 `[autoload]` 段，跨场景全局状态仍由 `SaveHook` 承担；本设计不引入新的全局单例。

### 2.2 节点职责、脚本复用与归属

| 节点 | 类型 | 脚本 | 职责 | 复用的现有实现 | 脚本归属 |
|---|---|---|---|---|---|
| `BattleScene` | `Node3D` | `battle_scene.gd` | 装配子节点、连接信号、控制进入/退出；不写规则、不减血、不存档 | 生命周期参考 `battlefield_sample._ready`（26–64） | A |
| `World` | `Node3D` | `world_view.gd` | 天空/环境/主光/补光；挂景物与水材质 | 直接复用 `battlefield_sample._setup_world`（90–133）与 `_apply_water`（75–82） | A（C 定视觉参数） |
| `CameraRig` | `Node3D` | `camera_rig.gd` | 正交相机、`frame_board()`、`frame_unit()`、`screen_to_cell()` | 复用 `_fit_camera`（134–137）与 `camera.unproject_position` 用法（`test_samples.gd` 32–34） | A |
| `Board` | `Node3D` | `board_view.gd` | 32 格碰撞、格高亮、格坐标换算；不判断合法性 | 复用 `cell_position`（139–140）、`_build_cells`（142–159）、`_ring`（161–173） | A |
| `CellColliders` | `Node3D` | 无 | 32 个 `StaticBody3D`，`collision_layer=1`，`meta("cell")` | 同 `_build_cells`（150–157） | A |
| `Highlights` | `Node3D` | 无 | 选中圈、移动格、攻击格、目标箭头 | `selection_ring`/`cell_marker`（52–58） | A（C 定样式） |
| `Props` | `Node3D` | 无 | `weapons_and_props.glb` 或后续道具清单 | `battlefield_sample` 46–51 的挂载方式 | A |
| `Units` | `Node3D` | `unit_layer.gd` | 按战斗配置生成/回收 `UnitView`；维护 `unit_id -> view` 映射 | 复用样板生成循环（35–45）与 `packed_model`（83–88） | A |
| `UnitView` | `Node3D` | `unit_view.gd` | 单个单位的模型、动画、移动补间、选中体；只表现 | `extends hero_sample.gd`，保留 `selected`/`action_changed` 信号（3–4）与 `move_to`（69–80） | A（C 定动作/比例） |
| `Rules` | `Node` | `battle_state.gd` | 阶段机、回合、单位逻辑状态、合法行动校验、命令受理 | 防重入参考 `tiger_tutorial._player_action` 的 `busy` 守卫（1163–1170）；战斗初始化参考 `_start_battle`（1136–1155） | A |
| `Resolver` | `Node` | `battle_resolver.gd` | 输入命令 + 状态快照，输出 `Array[BattleEvent]`；纯结算 | 数值来源从 `tiger_tutorial`（88–95、1172–1214）与 `hero_battle_stage`（376–434）抽离；不复制到表现层 | A |
| `Assets` | `Node` | `asset_catalog.gd` | 读 `batches/*.json`、解析相对路径、缓存 `PackedScene`、查询身高/朝向/动作 | 复用 `batch_review` 的清单读取（18–28）与 `_asset_path`（66–67） | A |
| `Input` | `Node` | `battle_input.gd` | 射线拾取、悬停、取消；把屏幕事件转成棋格/单位意图 | 复用 `pick_at`（236–239）与 `_unhandled_input`（241–262） | A |
| `UI` | `CanvasLayer` | `battle_hud.gd` | 显示回合/HP/怒气/技能/日志/结算；只读事件与快照 | 布局与字号参考 `tiger_tutorial`（712–1004）与样板（175–224） | A（C 定排版） |
| `SaveHook` | `Node` | `save_service.gd` | 读/写 `user://save.json`；只允许正常写入，无删除/重置路径 | 复用 `tiger_tutorial._load_save`（386–399）、`_save`（402–416）、`_resolve_save_path`（308–320） | A |
| `Audio` | `Node` | `battle_audio.gd` | 在真实命中帧播放音效；只消费事件 | 新建；B 提供音效资产与触发点定义 | A（B 定音效） |
| `Evidence` | `Node` | `evidence_recorder.gd` | 无头/截图证据；默认禁用 | 复用 `batch_review` 的 `_write_json`（168–175）、`_save_png`（177–181）、`_begin_evidence`/`_finish_evidence`（197–247） | A |

### 2.3 棋盘与坐标

- 棋盘为 **8 列 × 4 行**，共 32 格（`battlefield_sample._build_cells` 146–147；`test_samples.gd` 32–34）。
- 格边长 **1.2**，格碰撞体 **1.18 × 0.08 × 1.18**（`battlefield_sample` 140、156）。
- 坐标公式保持唯一来源：
  `x = (cell.x - 3.5) * 1.2`，`z = -(cell.y - 1.5) * 1.2`（139–140）。
  由此棋盘覆盖 x ∈ [-4.2, 4.2]、z ∈ [-1.8, 1.8]，即 **9.6 × 4.8**。
- 单位脚底基准 y = **0.065**（样板 41；`test_samples.gd` 30 断言）。
- 拾取层：棋格 `collision_layer=1`（151），单位选中体 `collision_layer=2`（`hero_sample.gd` 23），默认拾取 mask 为 3（`battlefield_sample.pick_at` 236）。
- `Board.cell_position()` 与 `CameraRig.screen_to_cell()` 必须共用同一公式；UI 与规则层不得各自复制一份坐标计算。

### 2.4 回合与状态机

`battle_state.gd` 建议阶段：

```
enum Phase {
    BOOT,             # 场景装配、资源未就绪
    DEPLOY,           # 布阵（可选；若首版不做布阵则跳过）
    PLAYER_TURN,      # 等待玩家选择单位/格/技能
    PLAYER_ANIMATING, # 表现播放中，拒绝新命令
    ENEMY_TURN,       # 敌方决策
    ENEMY_ANIMATING,  # 表现播放中
    RESOLVE,          # 结算事件应用
    FINISHED          # 胜负已定
}
```

规则：

- **单一入口**：所有命令经 `BattleState.request_command(command)`；阶段不符或 `_resolving == true` 直接拒绝并 `command_rejected`。这与 `tiger_tutorial` 的 `busy` 防重入（1163–1170）同构，但改为显式阶段。
- **表现不推进逻辑**：`UnitView` 的动画完成只发 `action_finished` / `move_finished`；`BattleState` 收到确认后才提交移动或进入下一阶段。动画缺失时由 `UnitView` 立即发确认，避免卡死（`hero_sample.play_action` 当前只 `push_error` 并返回，54–56；新脚本必须有兜底）。
- **回合状态**：每个 `BattleUnitState` 至少含 `has_moved`、`has_acted`、`skill_used`、`hp`、`max_hp`、`shield`、`rage`（若沿用怒气）、`cell`、`side`。这些字段属于规则层，不属于 `UnitView`。
- **敌方回合**：首版可沿用固定策略（参考 `tiger_tutorial._enemy_turn` 1245–1267），但决策函数放在 `battle_state.gd`/`battle_resolver.gd`，不得写在 `UnitView` 或 HUD。
- **胜负**：`Resolver` 产生 `DEFEAT` 事件；`BattleState` 在事件应用后检查双方存活并进入 `FINISHED`，发 `battle_finished(result)`。表现层只播放结算面板。

### 2.5 结算边界（硬约束）

**规则层**（`battle_state.gd` + `battle_resolver.gd`）：

- 计算命中/未命中、伤害、暴击、护盾吸收、治疗、怒气变化、死亡、胜负。
- 只依赖 `BattleUnitState`、`BattleCommand`、显式随机种子；不引用 `Node3D`、`Camera3D`、`AnimationPlayer`、`Tween`。
- 输出结构化 `BattleEvent`；同一输入与种子必须得到同一输出，便于无头测试。

**表现层**（`board_view.gd`、`unit_layer.gd`、`unit_view.gd`、`battle_hud.gd`、`camera_rig.gd`、`battle_input.gd`）：

- 可以读 `BattleEvent` 的字段（`damage`、`hp_before`、`hp_after`、`absorbed`、`critical`、`cells`）并显示。
- 可以播放动作、补间、粒子、音效、镜头。
- **禁止**：减 HP、算伤害、判断命中、扣怒气、决定死亡、写存档、生成奖励。
- HUD 的血条值必须直接取 `event.hp_after` 或状态快照，不得用 `event.hp_before - event.damage` 自行推导（护盾吸收时两者不相等）。

浏览器版的 `battleDamage` / `applyDamage`（`game.js` 456–457）**不迁移进表现层**。若产品要求与网页规则一致，应把公式作为规则规格，用黄金向量测试 `battle_resolver.gd`，而不是把 JS 公式复制到 HUD/UnitView。

### 2.6 UI、相机、存档钩子

- **UI**：`CanvasLayer` + 锚点布局，适配 `project.godot` 的 1920×1080 基准与 `canvas_items`/`expand`（12–17）。HUD 只发 `action_requested`、`skill_requested`、`end_turn_requested`、`result_confirmed`；不直接调用规则方法。
- **相机**：沿用样板的**正交**投影（`battlefield_sample` 127）与 `size = max(15.2, 17.5 / aspect)`（137）。`CameraRig` 暴露 `frame_board()`、`frame_unit(unit_id)`、`screen_to_cell(screen_pos)`；`screen_to_cell` 内部用 `Board` 的层 1 射线，不复制坐标公式。
- **存档钩子**：`save_service.gd` 是唯一读写口。
  - 正式档：`user://save.json`（`tiger_tutorial` 50）。
  - 现有键：`owned`、`lineup`、`tutorial_done`（387–399）。
  - 现有语义：正式档只允许正常流程写入，永不重置；没有 `--save-path` / `--reset-save`（32–36、305–320）。
  - 战斗场景只在明确的奖励/编队结果后调用 `request_save(payload)`；同一奖励必须幂等（参考 `owns_wusong` 守卫，419–420、1454–1468）。
  - 不改变存档键、不删除存档、不新增外部可指定路径。

---

## 三、信号契约

### 3.1 建议的类型

以下为设计签名，不是实现文件。

```gdscript
# godot/battle/battle_types.gd
class_name BattleEvent
extends RefCounted

enum Kind { MOVE, ATTACK, SKILL, HEAL, SHIELD, DEFEAT, TURN }

var kind: Kind
var source_id: String
var target_id: String
var from_cell: Vector2i
var to_cell: Vector2i
var hp_before: int
var hp_after: int
var shield_before: int
var shield_after: int
var damage: int
var absorbed: int
var critical: bool
var cells: Array[Vector2i]
```

```gdscript
class_name BattleCommand
extends RefCounted
# kind: MOVE / ATTACK / SKILL / END_TURN
var kind: StringName
var unit_id: String
var target_id: String
var target_cell: Vector2i
var skill_id: StringName
```

```gdscript
class_name BattleResult
extends RefCounted
var winner: StringName        # &"player" / &"enemy" / &"draw"
var turn_index: int
var surviving_ids: Array[String]
```

### 3.2 信号表（全部 `snake_case`、全部带类型）

| 信号 | 签名 | 发出者 | 消费者 | 说明 |
|---|---|---|---|---|
| `cell_pressed` | `signal cell_pressed(cell: Vector2i)` | `Board` | `BattleInput` / `BattleScene` | 棋盘格被点击 |
| `cell_hovered` | `signal cell_hovered(cell: Vector2i)` | `Board` | `BattleInput` | 悬停预览 |
| `board_built` | `signal board_built(cell_count: int)` | `Board` | `BattleScene` | 32 格就绪 |
| `unit_pressed` | `signal unit_pressed(unit_id: String)` | `UnitLayer` | `BattleInput` | 单位被点击 |
| `unit_spawned` | `signal unit_spawned(unit_id: String)` | `UnitLayer` | `BattleScene` | 视图已生成 |
| `unit_despawned` | `signal unit_despawned(unit_id: String)` | `UnitLayer` | `BattleScene` | 视图已回收 |
| `action_finished` | `signal action_finished(unit_id: String, action: StringName)` | `UnitView` | `UnitLayer` / `BattleScene` | 动作播放完成 |
| `move_finished` | `signal move_finished(unit_id: String, cell: Vector2i)` | `UnitView` | `UnitLayer` / `BattleScene` | 移动补间完成 |
| `impact_reached` | `signal impact_reached(unit_id: String, action: StringName)` | `UnitView` | `BattleScene` / `Audio` | 真实命中帧；音效与受击表现在此刻触发 |
| `cell_picked` | `signal cell_picked(cell: Vector2i)` | `BattleInput` | `BattleState` | 输入意图，不是结算 |
| `unit_picked` | `signal unit_picked(unit_id: String)` | `BattleInput` | `BattleState` | 输入意图 |
| `cancel_requested` | `signal cancel_requested()` | `BattleInput` | `BattleState` | 取消选择 |
| `phase_changed` | `signal phase_changed(phase: BattleState.Phase)` | `BattleState` | `BattleScene` / `BattleHUD` | 阶段切换 |
| `turn_started` | `signal turn_started(turn_index: int, side: StringName)` | `BattleState` | `BattleHUD` / `BattleScene` | 回合开始 |
| `unit_selected` | `signal unit_selected(unit_id: String)` | `BattleState` | `BattleHUD` / `Board` | 选中单位 |
| `selection_cleared` | `signal selection_cleared()` | `BattleState` | `BattleHUD` / `Board` | 清空选择 |
| `legal_cells_changed` | `signal legal_cells_changed(unit_id: String, cells: Array[Vector2i], kind: StringName)` | `BattleState` | `Board` | 可移动/可攻击/技能范围；`kind` 为 `&"move"`/`&"attack"`/`&"skill"` |
| `command_accepted` | `signal command_accepted(command: BattleCommand)` | `BattleState` | `BattleScene` | 规则层受理，表现层开始播 |
| `command_rejected` | `signal command_rejected(reason: StringName)` | `BattleState` | `BattleHUD` | 非法操作；不产生结算 |
| `state_snapshot_changed` | `signal state_snapshot_changed(snapshot: BattleSnapshot)` | `BattleState` | `BattleHUD` | 只读快照 |
| `events_resolved` | `signal events_resolved(events: Array[BattleEvent])` | `BattleResolver` | `BattleScene` / `BattleState` | 一次命令的完整结算结果 |
| `unit_defeated` | `signal unit_defeated(unit_id: String)` | `BattleResolver` | `BattleState` / `UnitLayer` | 死亡/败退事件 |
| `battle_resolved` | `signal battle_resolved(result: BattleResult)` | `BattleResolver` | `BattleState` | 胜负已定 |
| `battle_finished` | `signal battle_finished(result: BattleResult)` | `BattleState` | `BattleHUD` / `SaveHook` | 场景可展示结算 |
| `action_requested` | `signal action_requested(action: StringName)` | `BattleHUD` | `BattleState` | 玩家意图（`&"move"`/`&"attack"`/`&"skill"`/`&"end_turn"`） |
| `skill_requested` | `signal skill_requested(skill_id: StringName)` | `BattleHUD` | `BattleState` | 技能选择 |
| `end_turn_requested` | `signal end_turn_requested()` | `BattleHUD` | `BattleState` | 结束回合 |
| `result_confirmed` | `signal result_confirmed()` | `BattleHUD` | `BattleScene` | 关闭结算面板 |
| `save_loaded` | `signal save_loaded(data: Dictionary)` | `SaveHook` | `BattleScene` | 进入场景时读取 |
| `save_written` | `signal save_written(ok: bool, path: String)` | `SaveHook` | `BattleScene` | 写入结果 |
| `save_failed` | `signal save_failed(reason: String)` | `SaveHook` | `BattleScene` / `BattleHUD` | 写入失败，不得静默 |
| `sfx_requested` | `signal sfx_requested(sfx_id: StringName, world_position: Vector3)` | `BattleScene` | `Audio` | 只在 `impact_reached` 后发出 |

### 3.3 一次攻击的时序（表现消费结算结果）

1. `BattleInput` 发 `cell_picked(cell)` 或 `unit_picked(unit_id)`。
2. `BattleState` 校验当前阶段、单位归属、射程/移动力，合法则发 `command_accepted(command)`；非法则 `command_rejected(reason)`。
3. `BattleScene` 调 `Resolver.resolve(state_snapshot, command, rng)`；`Resolver` 返回并广播 `Array[BattleEvent]`。
4. `BattleState.apply_events(events)` 更新逻辑 HP/护盾/位置/死亡；发 `state_snapshot_changed`。
5. `BattleScene` 调 `UnitLayer.present(events)`：播放攻击动作，等待 `impact_reached`。
6. 命中帧：`UnitView` 发 `impact_reached`；`BattleScene` 把该事件的 `damage`/`hp_after`/`absorbed` 交给 HUD 与 `Audio`；HUD 不做减法。
7. 若事件含 `DEFEAT`，`UnitLayer` 播放 `death`/`defeat`（r8 起有 `death`；r7 四动作清单没有 `death`，见风险 4）。
8. 动画完成发 `action_finished`；`BattleState` 进入下一阶段或结束回合。

关键点：**第 4 步先于第 5 步**。逻辑状态先确定，表现只是回放；表现卡住不会改变结算，表现也不能改写结算。

### 3.4 信号纪律

- 所有信号参数显式类型；禁止 `Variant` 参数（与现有 `cell_selected(cell: Vector2i)`、`action_changed(hero_id: String, action: String)` 一致）。
- 所有连接在 `_ready()` 中完成，使用 `@onready` 类型化节点引用；不使用运行时 `get_node("../../..")`。
- 一次性事件用 `CONNECT_ONE_SHOT`；场景退出在 `_exit_tree()` 断开长连接。
- 表现层不得反向调用 `BattleState` 的私有字段；只能通过公开方法/信号。

---

## 四、资源加载

### 4.1 两条管线并存

| 管线 | 用法 | 现状证据 | 适用 |
|---|---|---|---|
| 导入管线 | `load("res://...glb") as PackedScene`，依赖同目录 `.import` | `tiger_tutorial.gd` 504–510；`hero_battle_stage.gd` 175–187；`hero_action_stage.gd` 124–141；r6/r7/r8/r9/r10/r11/r12 的 `models/*.glb.import` 实际存在 | **正式玩法场景**；导出包；需要导入缓存与动画设置 |
| 运行时 `GLTFDocument` | `GLTFDocument.append_from_file(ProjectSettings.globalize_path(path), state)`，再 `generate_scene` | `battlefield_sample.gd` 66–73；`batch_review.gd` 48–58 | **工具/证据/热加载**；未导入或按清单临时加载 |

**建议**：`battle_scene` 走导入管线；`batch_review` 继续走 `GLTFDocument`。理由：

- 导入管线有 `.import` 缓存，启动快，动画片段由导入器生成；
- 运行时 `GLTFDocument` 绕过导入设置，且依赖 `res://` 对应真实文件路径；
- 导出包中原始 `.glb` 是否随包存在、`globalize_path("res://...")` 是否可读，**UNVERIFIED**（本机无导出模板，`CMD-018` 第 126–131 行；`DELIVERY-STATUS.md` 未涉及）。

### 4.2 清单如何接入

现有 r7 清单：

- `assets/releases/ART-002/r7/batches/b1.json`
  - `schema_version`、`model_path_base: "r7"`、`clips`（`idle` 2.0s / `walk` 1.0s / `attack` 1.0s / `hit` 0.75s）；
  - `heroes[]` 每项含 `id`（如 `hero-014`）、`slug`（`wusong`）、`name`、`byname`、`display_name`、`star`、`seat`、`archetype`、`role`、`model`（相对路径，可为 `../r6/models/wusong.glb`）、`model_project_path`、`model_sha256`、`clips`、`body_height`（2.145）、`forward_godot`（`[0, 0, 1]`）、`bones`、`weapon`。
- `assets/releases/ART-002/r7/catalog.json`
  - `counts`: `total: 108`、`b1_explicit: 18`、`fallback_pending: 90`、`r6_reuse: 3`；
  - `batches.b1` 列出 18 个 ID，`batches.pending` 列出其余 90 个。

`AssetCatalog` 建议接口（设计，不实现）：

```gdscript
func load_catalog(catalog_path: String) -> void
func load_batches(batch_ids: Array[String]) -> void
func record(hero_id: String) -> Dictionary
func model_scene(hero_id: String) -> PackedScene
func body_height(hero_id: String) -> float
func forward_godot(hero_id: String) -> Vector3
func has_model(hero_id: String) -> bool
```

规则：

- 路径优先用记录里的 `model_project_path`；没有时用 `model_path_base` + `model` 拼接，并归一化 `../`（b1 的 `hero-006`/`hero-013`/`hero-014` 使用 `../r6/...`；`batch_review._asset_path` 目前只处理 `res://` 前缀，66–67，需在 `AssetCatalog` 中补全相对路径解析）。
- 清单缺失、`heroes` 为空、路径不存在时**显式失败**，不静默生成空节点（`batch_review` 24–27 已有同类校验）。
- 按路径缓存 `PackedScene`，不预加载 108 个模型；只加载本场参战单位。
- 单位缩放与脚底不写死在 `UnitView`：`hero_sample.gd` 当前固定 `scale = 0.76`（18）与样板 `position.y = 0.065`（41）。新场景从清单 `body_height` / 场景配置推导，但**迁移阶段不得改变现有样板验收值**（`test_samples.gd` 30 断言 0.065）。

### 4.3 景物与道具

- 景物：`assets/releases/ART-002/r6/models/liangshan_battlefield.glb`，由 `World/Scenery` 挂载；水材质复用 `_apply_water`（75–82）与 `godot/art_002/water.gdshader`。
- 道具：`assets/releases/ART-002/r6/models/weapons_and_props.glb`，样板整体挂在 `WeaponAndItemDisplay`（46–51）。真实场景建议 `Board/Props` 读取道具清单，每项含 `id`、`model`、`cell` 或 `position`、`scale`、`rotation`、`blocks`（是否阻挡）。**当前没有道具清单文件，这是设计提议，UNVERIFIED**；首版也可以继续整体挂载，不阻塞棋格。
- 道具不参与棋格拾取：样板把景物/道具放在棋格之外（48–50 注释），新场景应把道具碰撞层设为 0 或直接不挂碰撞体。

### 4.4 108 将如何扩展而不改场景

1. **新增批次**：放入 `assets/releases/ART-002/r7/batches/b2.json`，在 `catalog.json` 的 `batches` 增加 `b2`。`AssetCatalog` 按 catalog 枚举，`BattleScene` 不改。
2. **新增单将**：在对应批次 `heroes[]` 增加记录，提供 `model`/`model_project_path`、`body_height`、`forward_godot`、`clips`；场景不改。
3. **参战名单**：由战斗配置（建议 `BattleSetup` Resource 或 JSON）给出 `hero_id` 列表与初始格；`Units` 只生成名单内单位，不在 `.tscn` 预放 108 个节点。
4. **缺失模型**：`catalog.json` 明确 `fallback_pending: 90`。`AssetCatalog.has_model()` 返回 false 时，`UnitLayer` 必须走显式占位（建议独立 `PlaceholderUnit.tscn`，剪影 + 名字），或按产品决定拒绝开战；**不得**静默用错误模型顶替。
5. **表现参数**：比例、脚底、朝向从清单/配置读取，避免在 `UnitView` 内按角色写 `if hero_id == ...`。
6. **动作差异**：r7 只有 `idle/walk/attack/hit`；r8 增加 `death`；r9 只有 `hero005` 的武器分离；r10 武松有 `punch/tiger_shadow`；r12 虎有 `defeat`。`UnitView.clip_for()` 已按后缀匹配（`hero_sample.gd` 45–50），但缺失动作必须显式报错/降级，不能卡住状态机。

---

## 五、迁移路径

### 5.1 阶段

| 阶段 | 内容 | 不改变 | 验证 |
|---|---|---|---|
| M0 基线 | 记录 `git status`、当前提交、现有测试结果；不编辑文件 | 全部 | 现有 `test_samples.gd`、`batch_review --batch-test`、`tools/godot-tiger-test.sh` 通过 |
| M1 提取纯工具 | 抽出 `board_geometry.gd`（`cell_position`/8×4/格尺寸）、`model_loader.gd`（导入管线 + 可选运行时）、`camera_fit.gd`（`_fit_camera` 公式） | `battlefield_sample.gd` 对外 API 不变；`batch_review` 继承关系不变 | `test_samples.gd` 仍断言 6 角色/24 动作/32 格/y=0.065 |
| M2 场景骨架 | 新建 `battle_scene.tscn` + 空 `Board`/`Units`/`UI`/`Rules`/`SaveHook`；只装配，不接玩法 | 不改 `project.godot` 主场景；不改现有场景 | 场景可独立启动；无报错；无存档写入 |
| M3 棋盘与相机 | 移植 `_build_cells`/`_ring`/`_fit_camera`/`pick_at`；`screen_to_cell` 单测 | 现有样板不动 | 32 格射线命中；三种视口下棋盘完整 |
| M4 单位视图 | `unit_view.gd extends hero_sample.gd`；`AssetCatalog` 读 b1；`Units` 生成 18 人 | 不改 `hero_sample.gd` 的信号与 `move_to` 行为 | 18 人 × 4 动作可加载；缺失模型走占位；脚底一致 |
| M5 规则与结算 | `battle_state.gd` + `battle_resolver.gd` + 类型；无头黄金向量测试 | 表现层不参与减血 | 同一命令/种子输出稳定；阶段机拒绝重入 |
| M6 HUD 与表现 | `battle_hud.gd` 只读事件；`UnitView` 在 `impact_reached` 触发受击/音效；相机聚焦 | 规则层不动 | 伤害数字与 `event.hp_after` 一致；HUD 无减法；三视口可读 |
| M7 存档钩子 | `save_service.gd` 先只读，再写奖励；幂等；失败可见 | 存档键 `owned`/`lineup`/`tutorial_done` 不变；无删除路径 | 正式档哈希不变（只读阶段）；重复奖励只发一次；写入失败有提示 |
| M8 切换入口 | 单独任务决定是否把 `run/main_scene` 从 `journey_map.tscn` 切到 `battle_scene.tscn` | 不在本设计内改 `project.godot` | 用户/Codex 验收；旧场景仍可单独运行 |

### 5.2 兼容性约束（迁移时不能破坏）

- `godot/art_002/test_samples.gd` 直接访问 `sample.heroes`、`sample.has_node("CellColliders")`、`sample.camera`、`sample.cell_position()`、`sample.pick_at()`、`actor.clip_for()`、`actor.play_action()`、`actor.position.y`（10–35）。M1 提取后必须保留这些成员或同步改测试，且不得降低断言。
- `batch_review.gd` 继承 `battlefield_sample.gd`，依赖 `_setup_world`、`_build_cells`、`_ring`、`cell_position`、`pick_at`、`heroes`、`selected_index`、`selected_cell`、`status`、`camera`（29–44、104–142、259–262）。在 `batch_review` 迁移前，**不要删除或改名**这些成员。
- `tiger_tutorial_test.gd` 直接访问 `stage.save_data`、`stage.phase`、`stage.recruit_progress`、`stage._on_lineup_confirmed()` 等（grep 可见 509–618）。本次迁移不重构 `tiger_tutorial`，避免破坏 A1–A17 测试。
- `project.godot` 主场景保持 `journey_map.tscn`（第 8 行），直到 M8 单独决策。

### 5.3 明确的非目标

1. **不迁移浏览器玩法**。`game.js` 的 8×4 棋盘、`battleDamage`/`applyDamage`、体力/奖励/存档仍以网页为准；Godot 场景是独立实现，不复制 `game.js` 规则。
2. **不改存档键**。Godot 正式档仍是 `user://save.json`，键仍是 `owned`/`lineup`/`tutorial_done`；不新增外部可指定路径，不新增删除/重置入口。浏览器 `localStorage` 键 `shangshan-shuihu-v1`（`game.js` 3）也不动。
3. **不改角色 ID**。`hero-###`（`data/shuihu.js` 126 生成规则）与存档内的 `wusong` 都保持；需要映射时加适配层，不改数据、不改座次、不改文件名。
4. **不删除/覆盖旧资产**。r5–r12 只读；不批量替换模型，不批量重导。
5. **不新增 Autoload**。`project.godot` 当前无 `[autoload]`；跨场景状态继续由显式服务节点承担。
6. **不在本任务写 `.gd`/`.tscn`**，不生成资产，不提交。
7. **不把展示层当结算层**。任何「先扣血再播放」的写法都视为设计违规。

---

## 六、风险与待决问题

| # | 风险 / 问题 | 现有证据 | 影响 | 什么证据能结案 |
|---|---|---|---|---|
| 1 | **角色 ID 双命名空间**：清单用 `hero-014`，存档用 `wusong` | `r7/batches/b1.json` 的 `hero-014` 记录含 `slug: wusong`；`tiger_tutorial.gd` 64–69、419–420、1454–1468 用 `"wusong"`；`_hero_display_name` 只认 `wusong`（1553–1556） | 招募/编队/图鉴可能对不上；奖励重复或丢失 | 写一个只读映射测试：遍历存档 `owned`，逐个解析到清单记录；输出未匹配列表。要求 18/18 b1 可解析 |
| 2 | **运行时 `GLTFDocument` 在导出包中的行为** | 样板用 `ProjectSettings.globalize_path("res://...")`（66–73）；本机无导出模板（`CMD-018` 126–131） | 若正式玩法误用运行时加载，导出后可能读不到 GLB | 安装 4.7 导出模板，导出 macOS 包，跑一次 `load_model`；或改用导入管线并在导出包验证 18 个模型 |
| 3 | **90/108 角色没有模型** | `r7/catalog.json` `counts.fallback_pending: 90`；`b1_explicit: 18` | 108 将图鉴/战斗无法全量呈现；占位策略影响美术验收 | 产品决定：占位 or 阻止出战；对应截图/验收标准 |
| 4 | **版本选择不统一**：r7 四动作无 `death`，r8 有 `death`，r9 仅 `hero005` 武器分离，r10 武松拳击，r12 虎 `defeat` | `DELIVERY-STATUS.md` 54–64；`b1.json` `clips` 仅四动作；`tiger_tutorial.gd` 48–49 用 r10/r12 | 死亡/败退动作缺失会让状态机卡住或退化 | 每个参战角色选定 revision，并跑「动作清单 + 缺失动作降级」测试 |
| 5 | **比例/脚底没有单一来源**：`hero_sample.gd` 固定 `0.76`、样板固定 y=0.065；清单 `body_height` 2.145 | `hero_sample.gd` 18；`battlefield_sample.gd` 41；`test_samples.gd` 30；`b1.json` `body_height` | 不同身高角色脚底/头顶不一致 | 运行时测 18 个模型 AABB，与清单 `body_height` 对比；给出允许误差 |
| 6 | **命中帧没有写进清单** | `hero_action_stage.gd` `IMPACT_TARGET_MS: 458.0`（23）；`hero_battle_stage.gd` `IMPACT_MS: 452.0`（37）；`tiger_tutorial` 手调 0.40s（1181–1182）；b1 清单只有 clip 时长 | 音效/受击/伤害数字可能错帧 | 用 `measure_impact_ms`（`hero_action_stage.gd` 265 起）测每个 clip，写入清单并加断言 |
| 7 | **Godot 规则与网页规则可能分叉** | 网页有职业克制、被动、暴击、护盾、Boss 机制（`game.js` 456–457 等）；Godot 教学是固定 18/35/12 伤害（`tiger_tutorial.gd` 89–95） | 同一角色在两端表现不同；文案与结算不符 | 产品明确 Godot 规则范围；若要求一致，从网页导出黄金向量，`battle_resolver` 全部通过 |
| 8 | **存档幂等与并发** | 教学用 `owns_wusong` 防重复（419–420、1454–1468）；测试 A5/A6 覆盖（`tiger_tutorial_test.gd` 509–618） | 战斗场景若重复发奖，会污染正式档 | 两场胜利只发一次；写入前后哈希；跨进程读回 |
| 9 | **表现层重新长出结算** | 现有两处真实玩法都在场景脚本内减血（`tiger_tutorial` 1172–1214；`hero_battle_stage` 395–434） | 新场景容易复制旧模式，边界失效 | 代码审查 + 静态检查：`board_view/unit_view/battle_hud/camera_rig` 中不出现 HP 减法/伤害公式；HUD 数值只取事件字段 |
| 10 | **棋盘坐标与网页不一致** | 样板 `cell_position` 1.2 格（139–140）；网页 `BOARD_GEOM` 百分比（`game.js` 378–380） | 截图对比/策划沟通时「第几格」对不上 | 固定 Godot 坐标系文档；32 格拾取测试；三视口截图 |
| 11 | **108 单位性能** | 当前样板 6 人、批量审查每页 6 人（`batch_review` 111）；无 108 同场数据 | 全量生成可能 draw call/骨骼开销过高 | 用 20/50/108 单位做 profiler，记录 draw calls 与帧时间；必要时分页/池化 |
| 12 | **没有人工试玩验收** | `DELIVERY-STATUS.md` 106–107；`CMD-018` 151–153 明确「没有人工试玩验收」 | 逻辑测试全绿不等于可玩/可读 | 用户或 D 按隔离存档真实鼠标/触屏试玩，记录三视口 |
| 13 | **UI 字体依赖系统字体** | 样板用 `SystemFont`（`battlefield_sample.gd` 194–196）；批量审查同（`batch_review` 76–78） | 换机器/导出后中文可能回退 | 打包字体资源并在目标机器验证；或明确系统字体白名单 |
| 14 | **是否切换主场景未决** | `project.godot` 第 8 行仍是 `journey_map.tscn`；`journey_map.gd` 只显示占位文案（61） | 用户双击启动仍进占位地图，看不到新战斗 | 单独任务：切换主场景 + 入口脚本 + 用户验收 |

---

## 七、结论

- 现状是「表现样板（`art_002`）+ 两条互不相同的真实玩法原型（教学固定站位、实时 1v1）+ 占位地图」，**没有**可复用的棋格战棋场景。
- 目标结构把「棋盘/单位/输入/UI/相机」与「规则/结算/存档」彻底分开：表现层只消费 `BattleEvent`，规则层输出事件，`SaveHook` 独占 `user://save.json`。
- 资源加载以导入管线为主、`GLTFDocument` 只用于工具；r7 批次清单可驱动 108 将扩展，新增批次不需要改场景。
- 迁移按 M0–M8 串行，先保样板与现有测试，再逐步接入；不改浏览器玩法、不改存档键、不改角色 ID、不删旧资产。
- 最大未决项是 ID 映射、导出包中的运行时 GLB、90 个缺模型角色、revision 选择与命中帧数据；这些都需要真实测试或产品决定，不能靠本文假设。
