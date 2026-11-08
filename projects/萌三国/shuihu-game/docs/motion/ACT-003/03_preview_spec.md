# ACT-003 · 动作预览方案

> 目标：给出一种**不依赖 Blender / Godot 运行**、也不需要任何外部服务或付费资源的预览方式，用来核对动作时序是否正确，并让主程序后续可直接接入同一份数据。

---

## 1. 方案选择：静态 HTML + 内联 SVG 时序图 + JSON 数据

### 1.1 为什么不选其他方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Blender / Godot 实机播放 | 不使用 | 任务要求不运行 Blender 与 Godot；且 `assets/rigs/*.blend` 与 `hero*.glb` 只读参考 |
| 视频 / GIF 导出 | 不使用 | 需要渲染器，且无法逐帧读数 |
| 在线图表服务 / CDN 图表库 | 不使用 | 需要外部网络与第三方服务 |
| **纯静态 HTML + SVG + JSON** | **采用** | 双击 `index.html` 即可打开（`file://` 亦可），只用到浏览器原生 DOM 与 SVG，无构建、无依赖、无网络请求 |

### 1.2 预览能做什么、不能做什么

**能**
- 逐帧/逐毫秒读出每个动作的起止、前摇、命中、收招时点
- 横向对比多个角色的节拍是否对齐
- 显示根节点位移曲线与脚底接触帧，人工核对是否滑步
- 校验 JSON 数据结构是否完整（帧号越界、命中点缺失等）

**不能**
- 不渲染三维模型，因此**不能验证穿模**（穿模只能靠 §5 的数值约束表 + GLB 内实际复核）
- 不播放音频
- 不替代 Godot 内的骨骼动画验收

---

## 2. 输出文件结构

建议预览产物放在 `docs/motion/ACT-003/preview/` 下（本 ACT 目前只交付数据文件，HTML 由主程序侧按本规格实现）：

```
docs/motion/ACT-003/
├── 01_asset_inventory.md
├── 02_action_spec.md
├── 03_preview_spec.md
├── motion-hero-006.json        ← 已交付（林冲）
├── motion-hero-005.json        ← 已交付（关胜）
└── preview/                    ← 建议结构，待主程序侧实现
    ├── index.html              纯静态入口，无 CDN、无外部字体
    ├── preview.css
    ├── preview.js              读取 JSON → 生成 SVG 时序图与帧表
    └── motion-data.json        上面两个 JSON 的合并副本（可选）
```

### 2.1 index.html 的页面结构

```html
<header>  标题 + 角色下拉（多选）+ 「只显示命中点」开关 + 「毫秒 / 帧」单位切换
<main>
  <section id="timeline">   每个动作一条泳道，横轴为时间（ms）
  <section id="frametable"> 选中动作后逐帧列出 root dx / lean / 脚底接触 / 武器挂点
  <section id="checks">     自动校验结果（见 §4）
</main>
```

### 2.2 SVG 时序图的画法（不引入任何库）

- 外层 `<svg viewBox="0 0 1000 H" preserveAspectRatio="none">`，`H = 泳道数 × 56 + 48`
- 横轴：0 → 该动作 `duration_ms`，线性映射到 `[左内边距, 1000-右内边距]`
- 每条泳道画一条底 `<rect>`（动作总长），上面叠三段 `<rect>`：
  - 前摇段（起 → 出手帧）
  - 出手段（出手帧 → 命中帧）
  - 收招段（命中保持结束帧 → 结束帧）
- 命中帧画一条竖线 + 一个菱形标记，标注 `CONTACT · 458 ms`
- 顿帧 `[命中, 命中 + hit_stop_ms]` 画一个半透明覆盖块
- 根节点位移曲线：把 `root.dx_units` 的 `[帧, 值]` 采样成 `<polyline>`，叠加在同一泳道下方
- 脚底接触帧：在泳道底部画小三角
- 所有颜色用 CSS 变量（如 `--beat-windup` / `--beat-strike` / `--beat-contact` / `--beat-recover`），便于换主题

### 2.3 帧表的列

| 列 | 来源字段 |
| --- | --- |
| 帧号 | 由 `beats` 与关键帧数组展开 |
| 时间（ms） | `frame × frame_ms` |
| 阶段名 | `beats[].name` |
| 根节点位移（单位） | `root.dx_units` 线性插值 |
| 前倾 / 后仰（rad 或 deg） | `root.lean_rad` 或 `root.body_pitch_deg` |
| 支撑脚 | `contacts[]` |
| 武器挂点 | `weapon.attach` |
| 标记 | `beats[].tag`（`CONTACT` / `GROUND`） |

---

## 3. 数据结构与字段说明

数据文件已交付两份：`motion-hero-006.json`（林冲）、`motion-hero-005.json`（关胜）。

### 3.1 顶层字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema` | string | 固定 `"act-003-motion/1"`，主程序据此判断版本 |
| `task` | string | `"ACT-003"` |
| `note` | string | 人可读备注 |
| `fps` | number | 24 |
| `frame_ms` | number | 41.667（`1000 / 24`） |
| `length_unit` | string | `"blender_world_unit"` |
| `grid.spacing_units` | number | 1.2（棋格间距，来自 r6 manifest） |
| `grid.ground_y_units` | number | 0.06（地面基准，来自 r6 manifest） |
| `heroes` | array | 角色数组 |

### 3.2 hero 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | `hero-NNN`，与 `battle-motion.js` 的 `HERO_PROFILES` 键一致 |
| `display_name` | string | 「绰号 · 姓名」 |
| `seat` | number | 梁山座次 |
| `role` | string | `warrior` / `archer` / `scholar`（与 `catalog.json` 一致） |
| `move_cells` | number | `data/shuihu.js` 计算值 |
| `range` | number | 攻击距离 |
| `weapon` | string | `weapon-map.json` 的 `weapon` 值 |
| `weapon_label` | string | 中文兵器名 |
| `body_height_units` | number | 2.145 |
| `model` | string | GLB 相对路径 |
| `model_lock` | string | `r6_reuse_do_not_modify` / `r7_new_editable` |
| `bones` | array | 11 根骨骼名，顺序与 b1.json 一致 |
| `actions` | object | 键为 `idle` / `move` / `attack` / `hit` / `death` |

### 3.3 action 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `clip` | string | 模型片段名；`move` 对应现有 `walk` |
| `envelope` | string | 攻击包络 `A` / `B` / `C`（见 `02_action_spec.md` §1.1） |
| `frames` | number | 总帧数 |
| `duration_ms` | number | 总时长（毫秒） |
| `loop` | boolean | 是否循环 |
| `status` | string | 可选，`new_clip_not_in_existing_assets` 表示现有资产中不存在 |
| `beats[]` | array | 关键帧节拍 |
| `beats[].name` | string | 阶段中文名 |
| `beats[].frame` | number | 帧号 |
| `beats[].ms` | number | 毫秒（与帧号一致，冗余便于主程序直接取用） |
| `beats[].tag` | string | 可选，`CONTACT`（命中结算点）/ `GROUND`（死亡触地） |
| `root.mode` | string | `in_place` / `constant_forward` / `forward_then_return` / `knockback_then_return` / `fall_in_place` |
| `root.dx_units` | array | `[[帧, 位移值], ...]`，未列出的帧线性插值 |
| `root.net_dx_units` | number | 动作结束时的净位移（攻击类应为 0） |
| `root.lean_rad` | array | `[[帧, 弧度], ...]`，负值后仰、正值前倾 |
| `root.body_pitch_deg` | array | 仅死亡动作使用，躯干倾倒角，负值后仰 |
| `root.head_top_height_units` | array | 仅死亡动作使用，头顶离地高度 |
| `root.stride_units` | array | 仅移动动作，步幅建议区间 `[min, max]` |
| `root.speed_units_per_sec` | array | 仅移动动作，根节点速度区间 |
| `root.cell_travel_ms` | array | 仅移动动作，单格耗时建议区间 |
| `root.knockback_limit_units` | number | 仅受击动作，后退位移上限 |
| `root.slide_limit_units` | number | 仅死亡动作，水平滑动上限 |
| `root.torso_rise_units` | array | 仅待机动作，呼吸起伏区间 |
| `contacts[]` | array | `{frame, foot}`，`foot` 取值 `L` / `R` / `both` / `none_lying` |
| `weapon.attach` | string | 主挂点（`hand.R` 等），**待 A 侧确认** |
| `weapon.assist_attach` | string | 协同挂点（长柄双手武器） |
| `weapon.tip_ground_clearance_min_units` | number | 兵器末端离地下限 |
| `weapon.body_clearance_min_units` | number | 兵器与躯干最小间距 |
| `weapon.release_frame` / `release_ms` | number | 死亡动作中脱手时点 |
| `cues.cue_class` | string | 与 `battle-motion.js` 的 `cueClass` 对齐（`cue-spear` / `cue-slash` / `receiving-hit` / `performing-death`） |
| `cues.contact_ms` | number \| null | **唯一命中时点来源** |
| `cues.hit_stop_ms` | number | 顿帧时长，默认 75 |
| `known_issue` | string | 可选，记录该片段与现有时点的已知偏差 |

### 3.4 主程序接入方式

```js
// 方式一：fetch（需 HTTP 环境）
const data = await fetch('docs/motion/ACT-003/motion-hero-006.json').then(r => r.json());

// 方式二：作为模块引入（JSON 可被打包器直接 import）
import motion from './motion-hero-006.json';

// 取命中时点，替换现有硬编码
const attack = data.heroes[0].actions.attack;
const contactMs = attack.cues.contact_ms;          // 458（林冲）/ 542（关胜）
const cueClass  = attack.cues.cue_class;            // cue-spear / cue-slash
const hitStopMs = attack.cues.hit_stop_ms;          // 75
```

**接入时需要改动的两处现有硬编码**
1. `battle-motion.js:29` 的 `contactMs()`（当前战士 294 / 谋士 410 / 远程 480）：改为读取 `cues.contact_ms`，使两套时点合一（见 `02_action_spec.md` §1.3）。
2. `combat-motion-timing.js:3` 的 `CONTACT = 11/24`：这是归一化值，需与 `frames` 相乘得到帧号。B 类（28 帧）与 C 类（40 帧）不能用 `11/24`，应改为从 `beats[].tag === 'CONTACT'` 里取帧号。

---

## 4. 预览页面的自动校验项

`preview.js` 建议内置以下检查，把结果渲染到 `#checks`：

| # | 检查 | 判定 |
| --- | --- | --- |
| 1 | 每个动作至少有一个 `tag === 'CONTACT'` 的 beat（attack 必需） | 缺失则报错 |
| 2 | 所有 `beats[].frame` 落在 `[0, frames]` 内 | 越界则报错 |
| 3 | `beats[].ms` 与 `frame × frame_ms` 的差值 ≤ 1 ms | 超差则警告 |
| 4 | `root.dx_units` 首帧为 0，且 attack 的 `net_dx_units === 0` | 不满足则警告（可能跨格） |
| 5 | 受击 `knockback_limit_units ≤ 0.18` | 超限则警告 |
| 6 | 死亡 `slide_limit_units ≤ 0.12` | 超限则警告 |
| 7 | 移动动作 `stride_units` 上限 × 2 ≤ `speed_units_per_sec` 上限 | 提示步频与速度不匹配（滑步风险） |
| 8 | `weapon.tip_ground_clearance_min_units ≥ 0.05` | 不满足则警告（入地穿模风险） |
| 9 | 同一 hero 的 `bones` 与 b1.json 的 11 根骨骼一致 | 不一致则报错 |
| 10 | `model_lock === 'r6_reuse_do_not_modify'` 的角色，其 `model` 路径以 `../r6/` 开头 | 不一致则警告（可能误改 r6 资产） |

---

## 5. 两个角色的动作时序数据（JSON）

完整数据见同目录的两个文件，内容如下（林冲全量、关胜全量）。

### 5.1 林冲 · `motion-hero-006.json`

```json
{
  "schema": "act-003-motion/1",
  "task": "ACT-003",
  "note": "豹子头 · 林冲 动作时序数据。r6 字节级复用模型，不得改写 r6 源；death 为新增片段。",
  "fps": 24,
  "frame_ms": 41.667,
  "length_unit": "blender_world_unit",
  "grid": { "spacing_units": 1.2, "ground_y_units": 0.06 },
  "heroes": [
    {
      "id": "hero-006",
      "display_name": "豹子头 · 林冲",
      "seat": 6,
      "role": "warrior",
      "move_cells": 3,
      "range": 1,
      "weapon": "spear",
      "weapon_label": "长枪（r6 已建）",
      "body_height_units": 2.145,
      "model": "assets/releases/ART-002/r6/models/linchong.glb",
      "model_lock": "r6_reuse_do_not_modify",
      "bones": ["root","body","head","arm.L","hand.L","arm.R","hand.R","leg.L","foot.L","leg.R","foot.R"],
      "actions": {
        "idle": {
          "clip": "idle", "frames": 48, "duration_ms": 2000, "loop": true,
          "beats": [
            { "name": "起势", "frame": 0, "ms": 0 },
            { "name": "呼吸最低", "frame": 12, "ms": 500 },
            { "name": "中位", "frame": 24, "ms": 1000 },
            { "name": "呼吸最高", "frame": 36, "ms": 1500 },
            { "name": "回环", "frame": 48, "ms": 2000 }
          ],
          "root": { "mode": "in_place", "dx_units": [[0, 0.0], [48, 0.0]], "torso_rise_units": [0.01, 0.02] },
          "contacts": [ { "frame": 0, "foot": "both" }, { "frame": 48, "foot": "both" } ],
          "weapon": { "attach": "hand.R", "pose": "斜立枪尖朝上", "tip_ground_clearance_min_units": 0.05 },
          "cues": { "cue_class": "", "contact_ms": null, "hit_stop_ms": 0 }
        },
        "move": {
          "clip": "walk", "frames": 24, "duration_ms": 1000, "loop": true,
          "beats": [
            { "name": "左脚落地", "frame": 0, "ms": 0 },
            { "name": "右脚过支撑点", "frame": 6, "ms": 250 },
            { "name": "右脚落地", "frame": 12, "ms": 500 },
            { "name": "左脚过支撑点", "frame": 18, "ms": 750 },
            { "name": "回环", "frame": 24, "ms": 1000 }
          ],
          "root": {
            "mode": "constant_forward", "cycle_steps": 2,
            "stride_units": [1.0, 1.3], "speed_units_per_sec": [2.0, 2.6],
            "cell_travel_ms": [460, 560],
            "dx_units": [[0, 0.0], [12, 0.55], [24, 1.15]]
          },
          "contacts": [ { "frame": 0, "foot": "L" }, { "frame": 12, "foot": "R" }, { "frame": 24, "foot": "L" } ],
          "weapon": { "attach": "hand.R", "swing_max_units": 0.08 },
          "cues": { "cue_class": "", "contact_ms": null, "hit_stop_ms": 0 }
        },
        "attack": {
          "clip": "attack", "envelope": "A", "frames": 24, "duration_ms": 1000, "loop": false,
          "beats": [
            { "name": "前摇 · 沉肩收枪", "frame": 0, "ms": 0 },
            { "name": "出手 · 前踏拧腰", "frame": 8, "ms": 333 },
            { "name": "命中 · 枪尖及身", "frame": 11, "ms": 458, "tag": "CONTACT" },
            { "name": "命中保持结束", "frame": 13, "ms": 542 },
            { "name": "收招结束 · 收势", "frame": 24, "ms": 1000 }
          ],
          "root": {
            "mode": "forward_then_return",
            "dx_units": [[0, 0.0], [8, -0.094], [11, 0.18], [24, 0.0]],
            "net_dx_units": 0.0,
            "lean_rad": [[0, -0.045], [11, 0.06], [24, 0.0]]
          },
          "contacts": [ { "frame": 0, "foot": "L" }, { "frame": 24, "foot": "L" } ],
          "weapon": {
            "attach": "hand.R", "tip_ground_clearance_min_units": 0.05,
            "body_clearance_min_units": 0.03, "tip_reach_peak_frame": 11
          },
          "cues": { "cue_class": "cue-spear", "contact_ms": 458, "hit_stop_ms": 75 },
          "known_issue": "attackPose 收招段按 (t-.56)/.55 归零需 1110 ms，超过当前 1000 ms 片段，收招未走完"
        },
        "hit": {
          "clip": "hit", "frames": 18, "duration_ms": 750, "loop": false,
          "beats": [
            { "name": "受击瞬间", "frame": 0, "ms": 0 },
            { "name": "后仰峰值", "frame": 4, "ms": 167 },
            { "name": "回弹过冲", "frame": 10, "ms": 417 },
            { "name": "回正", "frame": 18, "ms": 750 }
          ],
          "root": {
            "mode": "knockback_then_return",
            "dx_units": [[0, 0.0], [4, -0.12], [18, 0.0]],
            "knockback_limit_units": 0.18,
            "lean_rad": [[0, 0.0], [4, -0.24], [18, 0.0]]
          },
          "contacts": [ { "frame": 0, "foot": "both" }, { "frame": 18, "foot": "both" } ],
          "weapon": { "attach": "hand.R", "retain_grip": true },
          "cues": { "cue_class": "receiving-hit", "contact_ms": 0, "hit_stop_ms": 75 }
        },
        "death": {
          "clip": "death", "frames": 30, "duration_ms": 1250, "loop": false,
          "status": "new_clip_not_in_existing_assets",
          "beats": [
            { "name": "致命一击", "frame": 0, "ms": 0 },
            { "name": "重心失衡 · 后仰", "frame": 8, "ms": 333 },
            { "name": "触地", "frame": 16, "ms": 667, "tag": "GROUND" },
            { "name": "静止保持（冻结末帧）", "frame": 30, "ms": 1250 }
          ],
          "root": {
            "mode": "fall_in_place",
            "dx_units": [[0, 0.0], [16, 0.08], [30, 0.10]],
            "slide_limit_units": 0.10,
            "body_pitch_deg": [[0, 0], [8, -25], [16, 75], [30, 90]],
            "head_top_height_units": [[0, 2.145], [16, 0.62], [30, 0.55]]
          },
          "contacts": [ { "frame": 16, "foot": "none_lying" } ],
          "weapon": { "attach": "hand.R", "release_frame": 12, "release_ms": 500 },
          "cues": { "cue_class": "performing-death", "contact_ms": null, "hit_stop_ms": 0 }
        }
      }
    }
  ]
}
```

### 5.2 关胜 · `motion-hero-005.json`

```json
{
  "schema": "act-003-motion/1",
  "task": "ACT-003",
  "note": "大刀 · 关胜 动作时序数据。r7 新建模型，重型长柄 B 类包络。",
  "fps": 24,
  "frame_ms": 41.667,
  "length_unit": "blender_world_unit",
  "grid": { "spacing_units": 1.2, "ground_y_units": 0.06 },
  "heroes": [
    {
      "id": "hero-005",
      "display_name": "大刀 · 关胜",
      "seat": 5,
      "role": "warrior",
      "move_cells": 3,
      "range": 1,
      "weapon": "guandao",
      "weapon_label": "青龙偃月刀",
      "body_height_units": 2.145,
      "model": "assets/releases/ART-002/r7/models/hero005.glb",
      "model_lock": "r7_new_editable",
      "bones": ["root","body","head","arm.L","hand.L","arm.R","hand.R","leg.L","foot.L","leg.R","foot.R"],
      "actions": {
        "idle": {
          "clip": "idle", "frames": 48, "duration_ms": 2000, "loop": true,
          "beats": [
            { "name": "起势", "frame": 0, "ms": 0 },
            { "name": "呼吸最低", "frame": 24, "ms": 1000 },
            { "name": "回环", "frame": 48, "ms": 2000 }
          ],
          "root": { "mode": "in_place", "dx_units": [[0, 0.0], [48, 0.0]], "torso_rise_units": [0.012, 0.022] },
          "contacts": [ { "frame": 0, "foot": "both" }, { "frame": 48, "foot": "both" } ],
          "weapon": { "attach": "hand.R", "pose": "拄地或扛肩", "tip_ground_clearance_min_units": 0.05 },
          "cues": { "cue_class": "", "contact_ms": null, "hit_stop_ms": 0 }
        },
        "move": {
          "clip": "walk", "frames": 24, "duration_ms": 1000, "loop": true,
          "beats": [
            { "name": "左脚落地", "frame": 0, "ms": 0 },
            { "name": "右脚过支撑点", "frame": 6, "ms": 250 },
            { "name": "右脚落地", "frame": 12, "ms": 500 },
            { "name": "左脚过支撑点", "frame": 18, "ms": 750 },
            { "name": "回环", "frame": 24, "ms": 1000 }
          ],
          "root": {
            "mode": "constant_forward", "cycle_steps": 2,
            "stride_units": [1.0, 1.3], "speed_units_per_sec": [2.0, 2.6],
            "cell_travel_ms": [460, 560],
            "dx_units": [[0, 0.0], [12, 0.55], [24, 1.15]]
          },
          "contacts": [ { "frame": 0, "foot": "L" }, { "frame": 12, "foot": "R" }, { "frame": 24, "foot": "L" } ],
          "weapon": { "attach": "hand.R", "swing_max_units": 0.08 },
          "cues": { "cue_class": "", "contact_ms": null, "hit_stop_ms": 0 }
        },
        "attack": {
          "clip": "attack", "envelope": "B", "frames": 28, "duration_ms": 1167, "loop": false,
          "beats": [
            { "name": "前摇 · 举刀过顶", "frame": 0, "ms": 0 },
            { "name": "出手 · 劈落", "frame": 10, "ms": 417 },
            { "name": "命中 · 刀锋及身", "frame": 13, "ms": 542, "tag": "CONTACT" },
            { "name": "命中保持结束", "frame": 16, "ms": 667 },
            { "name": "收招结束 · 提刀归位", "frame": 28, "ms": 1167 }
          ],
          "root": {
            "mode": "forward_then_return",
            "dx_units": [[0, 0.0], [10, -0.06], [13, 0.24], [28, 0.0]],
            "net_dx_units": 0.0,
            "lean_rad": [[0, -0.03], [13, 0.05], [28, 0.0]]
          },
          "contacts": [ { "frame": 0, "foot": "L" }, { "frame": 28, "foot": "L" } ],
          "weapon": {
            "attach": "hand.R", "assist_attach": "arm.L",
            "tip_ground_clearance_min_units": 0.05,
            "body_clearance_min_units": 0.03, "tip_reach_peak_frame": 13
          },
          "cues": { "cue_class": "cue-slash", "contact_ms": 542, "hit_stop_ms": 75 },
          "known_issue": "B 类 28 帧超过现有 attack 片段的 24 帧包络，需新增片段或按 0.857 倍速播放（后者命中帧变为 458 ms）"
        },
        "hit": {
          "clip": "hit", "frames": 18, "duration_ms": 750, "loop": false,
          "beats": [
            { "name": "受击瞬间", "frame": 0, "ms": 0 },
            { "name": "后仰峰值", "frame": 5, "ms": 208 },
            { "name": "回正", "frame": 18, "ms": 750 }
          ],
          "root": {
            "mode": "knockback_then_return",
            "dx_units": [[0, 0.0], [5, -0.09], [18, 0.0]],
            "knockback_limit_units": 0.18,
            "lean_rad": [[0, 0.0], [5, -0.20], [18, 0.0]]
          },
          "contacts": [ { "frame": 0, "foot": "both" }, { "frame": 18, "foot": "both" } ],
          "weapon": { "attach": "hand.R", "retain_grip": true },
          "cues": { "cue_class": "receiving-hit", "contact_ms": 0, "hit_stop_ms": 75 }
        },
        "death": {
          "clip": "death", "frames": 30, "duration_ms": 1250, "loop": false,
          "status": "new_clip_not_in_existing_assets",
          "beats": [
            { "name": "致命一击", "frame": 0, "ms": 0 },
            { "name": "单膝下沉", "frame": 8, "ms": 333 },
            { "name": "触地", "frame": 16, "ms": 667, "tag": "GROUND" },
            { "name": "静止保持（冻结末帧）", "frame": 30, "ms": 1250 }
          ],
          "root": {
            "mode": "fall_in_place",
            "dx_units": [[0, 0.0], [16, 0.07], [30, 0.09]],
            "slide_limit_units": 0.12,
            "body_pitch_deg": [[0, 0], [8, 20], [16, 85], [30, 90]],
            "head_top_height_units": [[0, 2.145], [16, 0.60], [30, 0.52]]
          },
          "contacts": [ { "frame": 16, "foot": "none_lying" } ],
          "weapon": { "attach": "hand.R", "release_frame": 10, "release_ms": 417 },
          "cues": { "cue_class": "performing-death", "contact_ms": null, "hit_stop_ms": 0 }
        }
      }
    }
  ]
}
```

---

## 6. 时序对照速查（两个角色的差异）

| 动作 | 林冲（A 类 · 长枪） | 关胜（B 类 · 偃月刀） |
| --- | --- | --- |
| 待机 | 48 帧 / 2000 ms | 48 帧 / 2000 ms |
| 移动 | 24 帧 / 1000 ms，2 步，步幅 1.0–1.3 单位 | 同左 |
| 攻击总长 | 24 帧 / 1000 ms | 28 帧 / 1167 ms |
| 前摇结束 | 333 ms | 417 ms |
| **命中** | **458 ms（帧 11）** | **542 ms（帧 13）** |
| 命中保持结束 | 542 ms | 667 ms |
| 收招结束 | 1000 ms | 1167 ms |
| 前冲峰值位移 | +0.18 单位 | +0.24 单位 |
| 受击 | 18 帧 / 750 ms，后退 0.12 单位，后仰 0.24 rad | 18 帧 / 750 ms，后退 0.09 单位，后仰 0.20 rad |
| 死亡 | 30 帧 / 1250 ms，触地 667 ms，脱手 500 ms | 30 帧 / 1250 ms，触地 667 ms，脱手 417 ms |

---

## 7. 待 A 侧确认后才能定稿的项

| # | 项 | 影响 |
| --- | --- | --- |
| 1 | `weapon.attach` 的实际值（GLB 内武器节点挂点） | 两份 JSON 的 `weapon.attach` 目前按 `hand.R` 拟定 |
| 2 | 命中时点统一到 458 ms 还是 294 ms | 林冲的 `contact_ms` 需相应改为 294（若选后者） |
| 3 | B 类是否新增 28 帧片段，或按 0.857 倍速播放 | 关胜的 `contact_ms` 需相应改为 458（若选后者），同时 `frames` / `duration_ms` 改回 24 / 1000 |
| 4 | `hit` 片段时长取 0.75 s（批次级）还是 1.0 s（逐人级） | 两份 JSON 的 `hit.frames` / `duration_ms` |
| 5 | 脚底基准取 `sole_bottom_z = 0.0` 还是 `grid.ground_y = 0.06` | `grid.ground_y_units` 字段 |
| 6 | 死亡动作是新增模型片段还是网页表现层合成 | 若为后者，`death` 的 `clip` 字段应改为 `synthesized_web` |
