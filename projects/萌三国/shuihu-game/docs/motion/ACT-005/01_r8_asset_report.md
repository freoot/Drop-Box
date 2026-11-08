# ACT-005 · r8 新资产报告（补原生 death 与武器挂点）

- 生成脚本：`tools/motion/build_r8_death.py`（Blender 5.2.2 后台 `-b -P`）
- 复核脚本：`tools/motion/verify_r8.py`（复用 `probe_glb.py` 的 GLB 解析，只读）
- 复核产出：`docs/motion/ACT-005/probe/r8_hero005_probe.json`
- 角色：`hero005`（ACT-004 的时点表即以它为基准）
- 旧版本：`assets/releases/ART-002/r7/` **原样保留，未改动任何字节**

## 1. 结论速览（全部来自脚本实测输出）

| 项 | r7（旧） | r8（新） | 判定 |
|---|---|---|---|
| clip 集合 | `attack / hit / idle / walk` | `attack / death / hit / idle / walk` | 新增原生 death |
| death 是否存在 | 否 | **是** | PASS |
| death 实测时长 | — | **1583.333 ms** | 目标 1600ms，偏差 −16.7ms（24fps 量化），容差 ±40ms → PASS |
| idle / walk / attack / hit 时长 | 2000 / 1000 / 1000 / 750 ms | 2000 / 1000 / 1000 / 750 ms | 全部未变 → PASS |
| 武器/道具专用挂点节点 | 无（0 个） | **`weapon.R`，父级 `hand.R`** | PASS |
| 节点数 | 13 | 14（+`weapon.R`） | — |
| animations | 4 | 5 | — |
| 文件字节 | 959800 | 946880 | — |
| sha256（前 16 位） | `7ac9ec719ce73a8d` | `257c261975e403dd`（ACT-006 重建后；ACT-005 原值 `c7fce1cb1af39ea9`） | r7 未被改动 → PASS |

> **ACT-006 修正**：ACT-005 交付时 death 用固定下沉 0.1，验收写了「末帧贴地」，但当时并未量离地高度。
> ACT-006 用蒙皮网格包围盒实测：末帧最低点 **−0.5802**（约半身埋在地面以下，见当时的 `11-death-end-1583ms.png`）。
> 已按包围盒自动求解重建 hero005（sink = **−0.4808**，末帧最低点 **0.0003**），克隆编号与字节数不变（946880），
> sha256 因此变化。旧值可用 `--sink 0.1` 复现，但不应再使用。详见 `docs/motion/ACT-006/02_ground_fit.md`。

`verify_r8.py` 输出：**合计 10 项，PASS 10，FAIL 0，exit 0**。

## 2. r8 各 clip 实测（`r8_hero005_probe.json`）

| clip | 通道数 | target.path 分布 | 关键帧时间戳数 | 时长 |
|---|---|---|---|---|
| `idle` | 36 | translation 12 / rotation 12 / scale 12 | 49 | 2.0000 s |
| `walk` | 36 | 同上 | 25 | 1.0000 s |
| `attack` | 36 | 同上 | 25 | 1.0000 s |
| `hit` | 36 | 同上 | 19 | 0.7500 s |
| `death` | 36 | 同上 | **39** | **1.5833 s** |

- 通道数由 r7 的 33 增到 36：多出的 3 个通道即新骨 `weapon.R` 的 translation / rotation / scale。
- `death` 的插值分布：`LINEAR 23 / STEP 13`（与既有 clip 的导出行为一致：未变化的分量以 STEP 常量轨道写出）。
- `death` 实际驱动节点（12 个，全部骨骼）：
  `arm.L, arm.R, body, foot.L, foot.R, hand.L, hand.R, head, leg.L, leg.R, root, weapon.R`

## 3. 武器挂点实测

```json
{"name": "weapon.R", "parent_name": "hand.R", "is_skin_joint": true,
 "has_mesh": false, "has_weapon_keyword": true}
```

- 命名含 `weapon` 语义，**父节点为 `hand.R`**（ACT-004 实测 `hand.R` 只是普通骨骼、无专用挂点，本轮补上）。
- 它是 `skins[].joints` 的成员（`is_skin_joint: true`），因此可随手臂一起被动画驱动，可直接 `get_bone_global_pose()` 取世界变换用于挂武器。
- 当前挂了 **0 个 mesh**：挂点是"空位"，实际武器网格由后续美术/程序挂接，本轮不塞占位模型。
- Godot 侧实测（`motion_action_test.gd`）：
  `attach_bone=weapon.R`、`attach_parent=hand.R`、
  rest 全局变换 `Transform3D(1, ~0, ~0, ~0, ~0, 1, ~0, -1, ~0, 0.5202, 0.5589, ~0)`（位置约在右手末端）。

## 4. 构建过程记录（含一次返修）

1. 首次尝试把场景 fps 设为 30 导出 → 既有 clip 被压成 0.8 倍（idle 2000→1600ms）。**原因**：r7 资产本身是 24fps（idle 2000ms 对应 49 个时间戳）。**修正**：固定 24fps。
2. 首次关键帧写进了当前激活的 `idle`（未切换 action），导致 idle 被污染、death 为空。**修正**：`animation_data.action = death` 后再 `keyframe_insert`。
3. 骨骼是四元数旋转模式，写 `rotation_euler` 不生效。**修正**：按每根骨骼自身的 `rotation_mode` 选通道（`rotation_quaternion`）。
4. 下沉写在骨骼局部 Z 轴 → 表现为整体悬空前移；改到局部 Y（沿骨骼向下）后，又因下沉 0.9 过大把模型压到地面以下（截图整人消失）。**当时的修正**：下沉取 0.1。
   **ACT-006 复核实测**：0.1 仍然不够（末帧最低点 −0.5802），已改为按包围盒自动求解（−0.4808 → 最低点 0.0003）。
5. Blender 5.x 的 Action 是 layered 结构（无 `.fcurves`），统计通道改用 `action.layers[].strips[].channelbags[].fcurves`。

以上每一步都在脚本注释里写明原因，便于复现时不重踩。

## 5. 未达成 / 未验证

1. **只做了 hero005 一个角色**，其余 17 个 GLB 仍是 r7 状态（无 death、无挂点）。铺量需另行派单。
2. death 时长 **1583.3ms 而非精确 1600ms**：24fps 下 1600ms = 38.4 帧，导出按帧采样后落在 38 帧。若需精确 1600ms，要改成 25fps 重导（会让既有 clip 时长变化），本轮不做。
3. death 姿态为**程序构造的骨骼关键帧**，非美术手工 K 帧，视觉精度有限（倒地过程只有 3 个关键姿态：0 / 6 / 19.2 / 38.4 帧）。
4. 挂点只验证了节点存在与父级关系，**未做实际武器网格挂接与渲染验证**。
5. 未做美术验收（造型、穿模、地面接触精度未逐帧检查）。
