# ACT-003 · 现有角色与骨骼资产盘点

> 本文档只记录**实际读到**的内容。凡是未能读到或未能解析的，一律标注「未读到，需 A 补充」，不做推测性断言。
> 调研方式：Read / Grep / Glob / Bash(head/ls/find/python3 -c json)。未执行 git、未安装依赖、未运行 Blender 或 Godot。
> 所有路径相对仓库根 `/Users/user/Documents/Codex/youxi/meng/shuihu-game/`。

---

## 1. 盘点范围与总体结论

| 项目 | 实际情况 |
| --- | --- |
| 108 人名册来源 | `data/shuihu.js`（`seats` 数组，含姓名 / 星号 / 绰号，共 108 条） |
| 已完成模型批次 | ART-002 r7 b1，**18 人**（`assets/releases/ART-002/r7/batches/b1.json`） |
| 未完成 | 其余 90 人状态为 `fallback_pending`，无 GLB（`catalog.json` → `counts.fallback_pending: 90`） |
| 独立骨骼源文件 | `assets/rigs/` 下只有 **林冲一套**（分件 PNG + 控制器 .blend） |
| 表现层动作脚本 | 4 个：`combat-motion-timing.js`、`battle-motion.js`、`combat-motion-studio.js`、`battle-vfx.js` |
| 现有动作片段名 | 模型侧 4 个：`idle` / `walk` / `attack` / `hit`；**没有 `death`** |

**对首批动作设计影响较大的三点：**

1. **18 个 GLB 角色全部是 `role: warrior`（战士）**，`range: 1`，因此首批只需处理近战节拍，不涉及远程 / 施法的投射物时点。
2. **没有任何角色定义了 `death`（死亡）片段**，死亡动作是新增项，需要从零给出规格。
3. **林冲 / 鲁智深 / 武松三人是 r6 字节级复用**（`reuse_exact: true`），其动作修改不能改写 r6 文件，只能新建分支或新增片段。

---

## 2. GLB 文件与 hero 编号对照（18 个）

数据来源：`find assets -name "hero*.glb"` + `assets/releases/ART-002/r7/batches/b1.json`（`id` / `slug` / `display_name` / `model` / `source`）+ `assets/releases/ART-002/r7/catalog.json`。

编号规则：hero 序号 = 梁山座次（`data/shuihu.js` 的 `seats` 顺序，第 1 位宋江）。

| hero 编号 | 座次 | 绰号 · 姓名 | 星号 | 职业 | GLB 路径（相对 r7） | 源 .blend | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hero-002 | 2 | 玉麒麟 · 卢俊义 | 天罡星 | warrior | `models/hero002.glb` | `source/hero002.blend` | r7 新建 |
| hero-005 | 5 | 大刀 · 关胜 | 天勇星 | warrior | `models/hero005.glb` | `source/hero005.blend` | r7 新建 |
| hero-006 | 6 | 豹子头 · 林冲 | 天雄星 | warrior | `../r6/models/linchong.glb` | `../r6/source/linchong.blend` | **复用 r6** |
| hero-007 | 7 | 霹雳火 · 秦明 | 天猛星 | warrior | `models/hero007.glb` | `source/hero007.blend` | r7 新建 |
| hero-008 | 8 | 双鞭 · 呼延灼 | 天威星 | warrior | `models/hero008.glb` | `source/hero008.blend` | r7 新建 |
| hero-010 | 10 | 小旋风 · 柴进 | 天贵星 | warrior | `models/hero010.glb` | `source/hero010.blend` | r7 新建 |
| hero-011 | 11 | 扑天雕 · 李应 | 天富星 | warrior | `models/hero011.glb` | `source/hero011.blend` | r7 新建 |
| hero-012 | 12 | 美髯公 · 朱仝 | 天满星 | warrior | `models/hero012.glb` | `source/hero012.blend` | r7 新建 |
| hero-013 | 13 | 花和尚 · 鲁智深 | 天孤星 | warrior | `../r6/models/luzhishen.glb` | `../r6/source/luzhishen.blend` | **复用 r6** |
| hero-014 | 14 | 行者 · 武松 | 天伤星 | warrior | `../r6/models/wusong.glb` | `../r6/source/wusong.blend` | **复用 r6** |
| hero-015 | 15 | 双枪将 · 董平 | 天立星 | warrior | `models/hero015.glb` | `source/hero015.blend` | r7 新建 |
| hero-017 | 17 | 青面兽 · 杨志 | 天暗星 | warrior | `models/hero017.glb` | `source/hero017.blend` | r7 新建 |
| hero-019 | 19 | 急先锋 · 索超 | 天空星 | warrior | `models/hero019.glb` | `source/hero019.blend` | r7 新建 |
| hero-021 | 21 | 赤发鬼 · 刘唐 | 天异星 | warrior | `models/hero021.glb` | `source/hero021.blend` | r7 新建 |
| hero-022 | 22 | 黑旋风 · 李逵 | 天杀星 | warrior | `models/hero022.glb` | `source/hero022.blend` | r7 新建 |
| hero-023 | 23 | 九纹龙 · 史进 | 天微星 | warrior | `models/hero023.glb` | `source/hero023.blend` | r7 新建 |
| hero-024 | 24 | 没遮拦 · 穆弘 | 天究星 | warrior | `models/hero024.glb` | `source/hero024.blend` | r7 新建 |
| hero-025 | 25 | 插翅虎 · 雷横 | 天退星 | warrior | `models/hero025.glb` | `source/hero025.blend` | r7 新建 |

**注意**：battle-motion.js 里出现的 `hero-003`（吴用）、`hero-004`（公孙胜）、`hero-009`（花荣）**不在 b1 的 18 人内**，目前没有 GLB（`catalog.json` 中为 `fallback_pending`）。它们的动作配置已存在于表现层脚本，但缺少模型资产。

### 2.1 模型公共参数（读到，来自 b1.json / r6 manifest）

| 字段 | 值 | 备注 |
| --- | --- | --- |
| `fps` | 24 | r7 b1 与 r5/r6 manifest 一致 |
| `body_height` | 2.145（18 人全部相同） | 共享构造；`body_bounds.measure_method` 注明为"继承自 r6，r7 未重测" |
| 骨骼列表 | `root, body, head, arm.L, hand.L, arm.R, hand.R, leg.L, foot.L, leg.R, foot.R` | **共 11 根，没有独立武器骨** |
| `forward_blender` | `[0, -1, 0]` | Z-up |
| `forward_godot` | `[0, 0, 1]` | 导入需做 -90° X 轴朝向换算 |
| 网格（r6 manifest `grid`） | `spacing: 1.2`，`ground_y: 0.06` | 用于脚底对齐的参考基准 |
| `clips` | `idle` / `walk` / `attack` / `hit` | 逐人一致 |

---

## 3. assets/rigs/ 下的骨骼源文件

`ls -R assets/rigs/` 结果（前两层）：

```
assets/rigs/
├── linchong-controls/
│   ├── README.md
│   ├── build-status.json
│   └── linchong-production-controls.blend
├── linchong-layers/            （16 个分件 PNG + 同名 .import + manifest.json）
│   ├── head.png            ├── torso.png          ├── pelvis.png        ├── cape.png
│   ├── upper_arm_near.png  ├── forearm_near.png   ├── hand_near.png
│   ├── upper_arm_far.png   ├── forearm_far.png    ├── hand_far.png
│   ├── thigh_near.png      ├── shin_near.png      ├── foot_near.png
│   ├── thigh_far.png       ├── shin_far.png       ├── foot_far.png
│   └── manifest.json
└── linchong-production-plan.json
```

### 3.1 linchong-production-plan.json（已解析）

- `characterId`: `hero-006`，`name`: `豹子头·林冲`
- `status`: `visible_layers_pending_joint_paint`
- `coordinateSpace`: `normalized_image_top_left`
- `pivotStatus`: `visible_landmarks_authored_not_motion_validated`

层级与旋转限位（节选）：

| 部件 id | 父级 | layer | pivot（归一化） | 旋转范围（度） | 状态 |
| --- | --- | --- | --- | --- | --- |
| `root` | — | 0 | `[0.5, 0.92]` | -180 ~ 180 | control_only |
| `pelvis` | root | 10 | `[0.53, 0.78]` | -12 ~ 12 | visible_region_only |
| `torso` | pelvis | 20 | `[0.53, 0.64]` | -18 ~ 18 | visible_region_only |
| `head` | torso | 40 | `[0.57, 0.42]` | -15 ~ 15 | visible_region_only |
| `upper_arm_near` | torso | 50 | `[0.408, 0.473]` | -65 ~ 70 | visible_region_only |
| `forearm_near` | upper_arm_near | 51 | `[0.399, 0.597]` | -10 ~ 115 | visible_region_only |

> `hand_near` / `hand_far` / 双腿 / `cape` 等其余部件同结构列出，此处不再逐行展开（已读到，字段格式一致）。

### 3.2 linchong-controls/build-status.json（已解析）

```json
{
  "status": "partially_bound_missing_art",
  "boundParts": ["pelvis","torso","head","upper_arm_near","forearm_near","hand_near",
                 "upper_arm_far","forearm_far","hand_far","thigh_near","shin_near","foot_near",
                 "thigh_far","shin_far","foot_far","cape"],
  "missingParts": ["spear"],
  "validation": "not_run_at_user_request",
  "notes": ["No replacement of game assets",
            "Control study is not a validated walk cycle",
            "Original image is an unbound reference empty"]
}
```

**关键结论**：林冲控制器**缺 `spear`（长枪）部件**，且该文件自述为"控制研究，不是已验证的行走循环"，`validation: not_run`。因此这套 rig 只能作为层级与限位参考，**不能**当作动作验收依据。

### 3.3 linchong-layers/manifest.json（已解析）

- `source`: `assets/tavern/rest/linchong.png`，`canvas`: `[1199, 1312]`
- 每个部件给出 `polygon`（归一化顶点环）与 `hiddenJointPaint`，**全部为 `"missing"`**
- 缺少关节补绘（joint paint），分件旋转时会出现断口

### 3.4 未读到的骨骼资产

| 项目 | 状态 |
| --- | --- |
| `assets/rigs/linchong-controls/linchong-production-controls.blend` 内部内容 | 二进制，未解析。仅按文件名记录，**需 A 补充** |
| hero-002 / 005 / 007 / 008 / 010~025 的独立 rig 源文件 | `assets/rigs/` 下不存在，仅 `assets/releases/ART-002/r7/source/*.blend` 中有建模源文件，**需 A 补充** |

---

## 4. 现有动画 / 时点脚本中已定义的动作名与时间参数

### 4.1 combat-motion-timing.js（全文 15 行，已读）

| 常量 / 函数 | 值 | 含义 |
| --- | --- | --- |
| `CONTACT` | `11/24` ≈ 0.4583 | 命中归一化时点，来源注释「damage happens once at CONTACT」 |
| `HIT_STOP` | `0.075`（秒）= 75 ms | 命中顿帧 |
| `attackPose(t)` 分段 | 见下表 | 攻击姿态曲线 |
| `recoil(age)` | `-0.24 * exp(-age*5) * cos(age*18)`，有效域 `0 < age < 0.9` | 受击回弹（旋转量，非位移） |

`attackPose(t)` 相位（`t` 为归一化时间）：

| 区间（归一化） | 24 fps 攻击片段中的 ms（按 1000 ms 总长换算） | `step` | `lean` | 中文标签 |
| --- | --- | --- | --- | --- |
| `t < 0` | — | 0 | 0 | 待机 |
| `0 ≤ t < .32` | 0 ~ 320 ms | 0 → -22 | 0 → -0.045 | 沉肩收枪 · 蓄力 |
| `.32 ≤ t < 11/24` | 320 ~ 458 ms | -22 → +42 | -0.045 → +0.06 | 前踏拧腰 · 刺出 |
| `11/24 ≤ t < .56` | 458 ~ 560 ms | +42 | +0.06 | 枪尖命中 |
| `t ≥ .56` | 560 ~ 1110 ms | +42 → 0 | +0.06 → 0 | 卸力收枪 → 收势 |

> `step` / `lean` 单位：`combat-motion-studio.js` 第 22 行 `x += pose.step`，画布 1100×688、角色绘制尺寸 500×500，因此 `step` 是**演示画布像素**，`lean` 是**弧度**。
> **已发现的偏差**：收势段用 `(t-.56)/.55` 归零，需到 `t = 1.11`（1110 ms）才结束，而攻击片段只有 1000 ms（24 帧 @ 24fps）。现有 1000 ms 片段上 `a ≈ 0.80`，收招未走完。

### 4.2 battle-motion.js（全文 31 行，已读）

- 按 hero id 定制：`hero-006`→`spear-thrust`（回身刺枪）、`hero-009`→`bow-shot`（拉弓放箭）、`hero-003`→`fan-cast`（挥扇布阵）、`hero-004`→`thunder-cast`（引剑唤雷）
- 按职业兜底：`战士`→`melee-swing`（近身挥击）、`射手`→`ranged-shot`（远程射击）、`谋士`→`spell-cast`（运筹施术）
- CSS 类名：`motion-warrior` / `motion-archer` / `motion-strategist`；提示类 `cue-spear` / `cue-arrow` / `cue-cast` / `cue-thunder` / `cue-slash`；受击类 `receiving-hit`；出招类 `performing-action action-<key>`
- **命中延时 `contactMs(unit, kind, speed)`**：

| 条件 | 名义毫秒（speed=1） |
| --- | --- |
| `kind === 'support'` | 410 ms |
| `role === '谋士'` | 410 ms |
| `range > 1`（远程） | 480 ms |
| 其余（战士，range 1） | **294 ms** |

> **已发现的冲突**：战士近战的 CSS 命中时点是 **294 ms**，而 `combat-motion-timing.js` 的 `CONTACT` 换算为 **458 ms**。两套时点不一致，首批动作规格需先统一（见 `02_action_spec.md` §1.3）。

### 4.3 combat-motion-studio.js（前 150 行 = 全文 37 行，已读）

| 项目 | 值 |
| --- | --- |
| 播放模式 | `sequence`（跑步接近 → 蓄力 → 出枪 → 命中 → 收势）、`run`、`attack`、`hit` |
| 片段资源 | `assets/models/cutout/{run,attack,hit}-atlas.png`（`?v=2`） |
| `config` | `frames: 24`，`size: 640`，`cols: 6`，`impact: motion.CONTACT` |
| 序列时间线 | `time < 1.7 s` 播 run 并推进；`t-1.7` 作为 attackTime |
| 结束判定 | sequence > 3.2 s / attack > 1.6 s / hit > 1.4 s |
| 受击表现 | 血条 100 → 68（−32），38 个粒子，`prefers-reduced-motion` 时降到 6 个 |

### 4.4 assets/models/cutout/motion-manifest.json（已解析）

```json
{ "fps": 24, "frameSize": 640, "columns": 6, "rows": 4, "frames": 24,
  "clips": ["run", "attack", "hit"], "impactFrame": 11,
  "status": "deformation_study_not_final_character_animation" }
```

`impactFrame: 11` 与 `CONTACT = 11/24` 一致。该文件自述为**变形研究，不是最终角色动画**。

### 4.5 battle-vfx.js（前 120 行 = 全文 22 行，已读）

- 特效种类：`wind` / `thunder` / `meteor` / `rocks` / `tactics` / `banner`（不在列表内的一律回落 `thunder`）
- 时长：`duration = 0.8 / clamp(speed, 0.5, 4)` 秒 → speed=1 时 800 ms
- 输出为内联 SVG，锚点上移 30 px（`y = p.y - 30`），最多取 32 个目标
- **未提供**按动作帧触发的钩子，只接受已结算的命中坐标

### 4.6 其他已读到的动作相关脚本

| 文件 | 读到的动作相关参数 |
| --- | --- |
| `tavern-gait.js` | `foot(phase)`：支撑相 `p < .6` 时脚沿 x 从 +18 → −18 匀速；摆动相抬起高度峰值 `18 * sin(πt)`。已登记 rig：`hero-006` / `hero-009` / `hero-022` / `hero-001` / `hero-003`（各自 `split` + `left`/`right` 腿框坐标） |
| `tavern-motion.js` | 移动速度 `dt * 4.5`（场景百分比 / 秒）；步频 `frame = 1 + floor(distance / 1.1) % 2` → **每 1.1 场景百分比距离切换一次落脚** |
| `data/shuihu.js` | `roleBases`：战士 `{hp:196, atk:38, move:3, range:1}`；射手 `{hp:154, atk:37, move:2, range:3}`；谋士 `{hp:166, atk:35, move:2, range:3}`。实测 `move`：`move = 战士 ? (rank%9===0 ? 4 : rank%7===0 ? 2 : 3) : 2` |

---

## 5. 现有武器类型字段

### 5.1 data/shuihu.js

**未定义武器字段**。`data/shuihu.js` 只有 `role`（战士 / 射手 / 谋士）与数值基表，不含 weapon。角色武器在 `assets/releases/ART-002/r7/weapon-map.json` 与 `catalog.json` 中定义。

### 5.2 weapon-map.json → 18 人武器（已解析，完整）

| hero | 姓名 | `weapon` | `weapon_label` | `basis` | `confidence` |
| --- | --- | --- | --- | --- | --- |
| hero-002 | 卢俊义 | `staff` | 枪棒 · 长棍 | novel_common_attribute | high |
| hero-005 | 关胜 | `guandao` | 青龙偃月刀 | novel_specific | high |
| hero-006 | 林冲 | `spear` | 长枪（r6 已建） | novel_common_attribute | high |
| hero-007 | 秦明 | `wolf_mace` | 狼牙棒 | novel_specific | high |
| hero-008 | 呼延灼 | `double_whip` | 双鞭 | novel_specific | high |
| hero-010 | 柴进 | `sword` | 直刃长剑（原创改编） | original_adaptation | **low** |
| hero-011 | 李应 | `spear` | 浑铁点钢枪 | novel_specific | high |
| hero-012 | 朱仝 | `broadsword` | 长柄大刀 | novel_common_attribute | medium |
| hero-013 | 鲁智深 | `monkstaff` | 水磨禅杖（r6 已建） | novel_common_attribute | high |
| hero-014 | 武松 | `monkblade` | 双戒刀（r6 已建） | novel_common_attribute | high |
| hero-015 | 董平 | `double_spear` | 双枪 | novel_specific | high |
| hero-017 | 杨志 | `saber` | 宝刀 / 腰刀 | novel_common_attribute | medium |
| hero-019 | 索超 | `battle_axe` | 大斧 | novel_common_attribute | medium |
| hero-021 | 刘唐 | `pudao` | 朴刀 | novel_common_attribute | medium |
| hero-022 | 李逵 | `double_axe` | 双板斧 | novel_specific | high |
| hero-023 | 史进 | `staff` | 棍棒 | original_prototype | **low** |
| hero-024 | 穆弘 | `pudao` | 朴刀 | novel_common_attribute | medium |
| hero-025 | 雷横 | `pudao` | 朴刀 | novel_common_attribute | medium |

兜底默认值（`weapon-map.json.defaults`）：`warrior → spear`，`scholar → scholar_staff`，`archer → bow`，`female → blade`。

**武器字段汇总（18 人去重后共 13 类）**：`staff`、`guandao`、`spear`、`wolf_mace`、`double_whip`、`sword`、`broadsword`、`monkstaff`、`monkblade`、`double_spear`、`saber`、`battle_axe`、`double_axe`、`pudao`（14 类）。

### 5.3 骨骼层级中的武器

`b1.json` 骨骼列表 **不含武器骨**（`root, body, head, arm.L, hand.L, arm.R, hand.R, leg.L, foot.L, leg.R, foot.R`）；`build-status.json.missingParts` 含 `spear`。

> **武器挂点未读到，需 A 补充**：GLB 内部武器节点实际挂在 `hand.R` / `hand.L` 还是独立节点，未能从二进制确认。首批规格按"挂 `hand.R`"拟定，落地前需 A 侧确认。

---

## 6. ART-002 发布目录清单（前两层，已读）

```
assets/releases/ART-002/
├── evidence/     desktop-east / desktop-west / landscape-east / landscape-west
│                 portrait-east / portrait-west（各 .png + .import）、results.json
├── r5/           README.md、manifest.json、models/、source/、evidence/
│                 models: husanniang.glb
│                 evidence: linchong / songjiang / husanniang 各 4 动作截图
│                           （idle / walk / attack / hit）
├── r6/           README.md、manifest.json、models/、source/、evidence/
│                 evidence: 新增 luzhishen / wusong，同样 4 动作
└── r7/           README.md、catalog.json、weapon-map.json、models/（18 个 hero*.glb）
                  source/、batches/（b1.json、b1-build.log）、evidence/
```

### 6.1 r5 / r6 角色与片段（manifest.json 已解析）

| 版本 | hero | slug | 名称 | body_height | clips |
| --- | --- | --- | --- | --- | --- |
| r5 | hero-006 | linchong | 豹子头 · 林冲 | 2.145 | idle / walk / attack / hit |
| r5 | hero-001 | songjiang | 及时雨 · 宋江 | 2.145 | idle / walk / attack / hit |
| r5 | hero-059 | husanniang | 一丈青 · 扈三娘 | 2.145 | idle / walk / attack / hit |
| r6 | 上述 3 人 + | wusong / luzhishen / wuyong | 武松 / 鲁智深 / 吴用 | 2.145 | idle / walk / attack / hit |

每人 `sampled_contacts` 21 条，覆盖 4 个片段。

### 6.2 r7 b1 片段时长（b1.json.clips）

| clip | frame_start | frame_end | duration_seconds | samples |
| --- | --- | --- | --- | --- |
| idle | 0 | 48 | 2.0 | 49 |
| walk | 0 | 24 | 1.0 | 25 |
| attack | 0 | 24 | 1.0 | 25 |
| hit | 0 | 18 | 0.75 | 19 |

逐人 `animation.clips` 略有出入（以 hero-006 为例：`idle` 帧 1–48 / 1.958 s；`walk`、`attack`、`hit` 均为帧 1–25 / 1.0 s，`hit` 也是 1.0 s 而非 0.75 s）。**批次级定义与逐人记录在 `hit` 上不一致**，验收时需以哪一份为准由 A 侧确认。

### 6.3 脚底采样数据的已知限制（b1.json，逐人字段原文）

```
sampled_contacts_limitation: "r6 sampled_contacts were captured before the
armature-modifier selection bug was fixed; the recorded values are legacy 0.0
and are NOT re-measured in r7. Retained for exact r6 metadata compatibility."
```

即 hero-006 的 21 条 `sampled_contacts` 全部为 `sole_min_z: {L: 0.0, R: 0.0}`、`root_correction: 0.0`，**是遗留值，不能当作真实脚底采样使用**。

---

## 7. 未读到 / 需 A 补充清单

| 项目 | 状态 | 影响 |
| --- | --- | --- |
| 各 `hero*.glb` 内部实际动画轨道、关键帧、武器节点挂点 | 二进制未解析，**需 A 补充** | 复用策略与挂点约束需复核 |
| `assets/releases/ART-002/r7/source/*.blend`（18 个）内部骨骼与动作 | 二进制未解析，**需 A 补充** | 动作可编辑性未知 |
| `assets/rigs/linchong-controls/linchong-production-controls.blend` | 二进制未解析，**需 A 补充** | 控制器限位以 JSON 为准 |
| `data/shuihu.js` 第 81 行之后 | 按任务要求只读前 80 行，其余通过 Grep / catalog.json 补全 | 技能动词与音效字段未纳入 |
| `game.js`（109 KB）、`game.css`（103 KB） | 未读 | 战棋每格实际移动耗时、格子像素尺寸未知 |
| `godot/**` | 未读 | 导入后的动画播放器配置未知 |
| hero-001 / 003 / 004 / 009 / 059 的 GLB | r7 b1 不含；r5/r6 有 songjiang / wuyong / husanniang | 该 3 人属后续批次 |
| `death`（死亡）动作 | **任何地方都未定义** | 需全新设计 |
| 远程 / 施法类动作的投射物时点 | 18 个 GLB 全为 warrior，无样本 | 首批不覆盖 |
