# ACT-005 · death 片段与武器挂点说明

## 1. death 片段的实际结构

- 时长：1600ms（24fps，帧 0 → 帧 38.4，浮点末帧保时长）
- 关键姿态只有 4 个时刻，之间线性插值：

| 时刻 | 帧 | 姿态 |
|---|---|---|
| 0 ms | 0 | 自然站姿（各骨位移 0、旋转 0、缩放 1） |
| 250 ms | 6.0 | 受击后仰：root 后仰 12°、body 后仰 10°、head 后仰 8°、双臂外张 25°、root 上抬 −0.08 |
| 800 ms | 19.2 | 前倾过半：root 前倾 39°、下沉 0.035、body 前倾 10°、head 24°、双腿屈 15°/12° |
| 1583 ms | 38.4 | 完全倒地：root 前倾 78°、下沉 0.1、body 14°、head 26°、四肢松垂 |

- 每根骨骼在每个时刻都写了 translation / rotation（按自身 rotation_mode 选四元数或欧拉）/ scale 三类通道，共 36 条动画通道。
- 12 根骨骼全部被驱动（含新挂点 `weapon.R`），所以武器会跟着手一起倒下。

### 为什么下沉量是 0.1 而不是 0.9

`root` 骨位于**脚底**，绕脚部前倾 78° 时身体本身已经贴近地面（头顶高度约 `1.25 × cos78° ≈ 0.26` 单位）。
ACT-004 的 0.9 是**离线合成预览**里用的视觉参数（那个预览没有地面约束）。把它直接用到真实片段上，
实测结果是整个人被压到地面以下、截图里完全看不见（`docs/evidence/CMD-007/motion/` 早期截图）。
最终取 0.1 做轻微沉降，落地效果见 `11-death-end-1583ms.png`。

> **ACT-006 补正**：上面这句「落地效果」当时没有量化。ACT-006 用蒙皮网格包围盒实测，
> 0.1 下沉下末帧最低点是 **−0.5802**（半身入地）。原因是前倾 78° 时身体绕脚底画弧，
> 躯干一侧会扫到地面以下，需要**上抬**而不是下沉。现已改为按包围盒自动求解
> （hero005 得 −0.4808 → 最低点 0.0003），见 `docs/motion/ACT-006/02_ground_fit.md`。

### 与 ACT-004 合成 death 的差异

| 项 | ACT-004（合成） | ACT-005（r8 原生） |
|---|---|---|
| 是否有 clip | 无，Blender 预览里用 hit 末段 + 位移补出来的 | **有，GLB 内真实 `death` 动画** |
| 时长 | 1600ms（合成参数） | 1583.3ms（实测） |
| 能否被 AnimationPlayer 播放 | 不能（离线渲染产物） | **能，Godot 运行时直接 `play("death")`** |
| 命中/收招语义 | 无 | 250ms 起受击反应，1583ms 定格不再回 idle |

## 2. 武器挂点

- 节点名：`weapon.R`
- 父节点：`hand.R`（右手骨骼）
- 类型：骨骼（`skins[].joints` 成员），**不带 mesh**
- rest 全局位置（Godot 侧实测）：约 `(0.5202, 0.5589, 0.0)`，即右手末端
- 用法：
  ```gdscript
  var idx := skeleton.find_bone("weapon.R")
  var xf := skeleton.get_bone_global_pose(idx)   # 挂武器时用它作为父变换
  ```
  或在编辑器里把武器节点 `parent_type = BONE`、`parent_bone = "weapon.R"` 挂上去。

### 为什么补这个挂点

ACT-004 实测 18/18 个 GLB **都没有** weapon/prop/sword 等专用挂点，只有普通骨骼 `hand.L` / `hand.R`。
程序若直接挂到 `hand.R`，武器会继承手骨自身的旋转基准，不同角色、不同动作下朝向不一致；
单独一根 `weapon.R` 可以在不改手骨动画的前提下给武器一个稳定的基准朝向。

## 3. 复现命令

```sh
# 生成 r8（只读 r7，写入 assets/releases/ART-002/r8/）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py

# 复核（不写资产，只读 GLB 字节；退出码非 0 表示有 FAIL）
python3 tools/motion/verify_r8.py

# 让 Godot 认到新资产（工程内 .import 与 .godot/imported 是 gitignore 的）
./tools/godot-import.sh
```

## 4. 未达成

1. death 为程序构造的关键姿态，不是美术逐帧 K 的动画；倒地过程的中间姿态只有 2 个，弧线偏"直"。
2. 挂点未挂任何武器网格，也**未做武器随手运动的渲染验证**。
3. 其余 17 个角色未同步。
