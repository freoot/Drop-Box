# ACT-009 · 武松无刀拳击与虎影重击（CMD-014 动作工作包）

> 结论先行：上一版回复里说的「出拳」**实际是挥双刀**（用的是 r6 原有的 `attack` 片段）。
> 本工作包从**真实武松 Blender 源**另存新版本 `r10`，把双戒刀几何从角色网格里分离出去，
> 新做两条**无刀**拳击动作 `punch`（普攻）与 `tiger_shadow`（虎影重击），并接入 Godot 战斗。
>
> 边界：虎模型、虎影**仍是程序化几何占位**，不代表美术验收；
> 逻辑测试通过 ≠ 动作表演合格。

---

## 一、资产核实（不是把 hero005 改名冒充）

| 项 | 事实 |
|---|---|
| 源工程 | `assets/releases/ART-002/r6/source/wusong.blend`（**真实资产**，r6 README 写明 hero-014） |
| 骨架 | 11 骨：root / body / head / arm.L / hand.L / arm.R / hand.R / leg.L / foot.L / leg.R / foot.R |
| 网格 | `wusong_costume_and_body`，10536 顶点，**71 个连通分量**（分件建模后合并） |
| 原动作 | idle 1958.3ms / walk 1000ms / attack 1000ms（**双刀**）/ hit 1000ms |
| 双戒刀 | `weapon('monkblade', …)` 的 4 个部件：刃(200) 背(5) 护手(24) 握柄(24)，左右各一套，共 **506 顶点** |

新版本：**`assets/releases/ART-002/r10/`**（GLB + 可编辑 .blend + 清单）。
**r6 原件一字节未动**（sha256 `d9c5c078fc516282…`，与 git HEAD 一致）。

---

## 二、怎么把刀从角色网格里分出去

r6 的刀已经并进角色网格（不是独立对象），只能靠几何特征切分。

逐分量核对（`hand.*` 绑定的 12 个分量）：

| z 上限 | 顶点数 | x 范围 | 判定 |
|---|---|---|---|
| 1.582 | 200 | [0.540, 0.605] | 刀刃 |
| 1.580 | 5 | [0.500, 0.600] | 刀背 |
| 0.982 | 24 | [0.440, 0.620] | 护手 |
| 0.960 | 24 | [0.494, 0.566] | 握柄 |
| **0.905** | 222 | [0.370, 0.570] | 腕环（保留） |
| **0.850** | 222 | [0.425, 0.575] | 手（保留） |

**判据：`绑定 hand.* 且 zmax > 0.92`** → 8 个刀件（506 顶点）分出，
手与腕环（zmax ≤ 0.905，888 顶点）全部保留。

> 第一版用的是 `|x|min > 0.49`，**左右不对称**——左手刀件 x 更靠内（x∈[-0.520,-0.455]），
> 会漏删。改成 z 上限判据后左右一致。

刀分出去后独立成 `wusong_monkblades` 对象（仍绑 hand.L/hand.R），
**导出 GLB 时用 `use_selection=True` 只选角色与骨架** → GLB 里无刀。
> glTF 导出器按 `bpy.data` 里的数据块扫描，`unlink` 场景集合**挡不住**它——
> 实测 unlink 后导出，`wusong_monkblades` 仍出现在 GLB 里。必须用 `use_selection`。

**实测验证（重新导入 GLB 逐顶点量）**：

```
r6   刀状顶点(z>0.95,|x|>0.50) = 357
r10  刀状顶点                  = 0     → VERDICT: OK 无刀
手区最高 z:  r6 0.949  →  r10 0.907   （手部完好）
```

---

## 三、两条新动作

| clip | 帧 | 时长 | 内容 |
|---|---|---|---|
| `punch` | 25 | 1000.0ms | 蓄力直拳：0–30% 引拳，30–46% 前冲，46–62% 命中保持，62–100% 收回 |
| `tiger_shadow` | 33 | 1333.3ms | 虎影重击：沉身蓄力 → 转体蓄势 → 爆发重拳（幅度大于普攻，为虎影留起跳空间） |

K 帧方式沿用 r6 的姿势语言：逐帧清姿势 → 摆 pose → 测鞋底最低点 → 抬 root 贴地 → 插关键帧。

**逐帧实测**（`tools/motion/verify_wusong_punch.py`，16 项断言全过）：

| 项 | 结果 |
|---|---|
| punch 右拳前冲（Blender 世界 Y 跨度） | **0.522** |
| tiger_shadow 右拳前冲 | **0.622**（> 普攻，重击更猛） |
| punch / tiger_shadow 逐帧鞋底最低点 | **0.0000**（不穿地） |
| 原 4 条 clip 时长 | idle 1958.3 / walk 1000 / attack 1000 / hit 1000，**未变** |

---

## 四、朝向：踩了个大坑

上一版场景里武松是 `rotation_degrees.y = 90°`，**背对敌人**，拳也打向反方向。

实测过程：

1. 四向对照图（`docs/evidence/CMD-014/facing/rot*.png`）：转 0° 时**正面朝镜头、五官可见**，
   红色标记在脸正前方 → **模型正面是局部 +Z**（Blender 源工程里面部顶点 y=-0.342，gltf 是 Y-up，
   Blender −Y → glTF/Godot +Z）。
2. 量化：转 **−90°** 时拳的世界 X 增大（朝 +X 敌人方向，Δ=+0.148）；
   转 +90° 时拳不动（沿 X 无分量）。
3. **Godot 绕 Y 正向旋转是顺时针**，所以 +90° 把 +Z 转到了 −X（背对敌人），必须用 **−90°**。

修正后场景 `rotation_degrees.y = -90°`，测试断言锁死这个值。

> 另：`get_bone_global_pose()` 返回的是**骨骼局部空间**位姿，取世界坐标要再乘
> `skeleton.global_transform`；峰值在 t≈0.25s，必须连续采样取最大值，不能只看固定时刻。

---

## 五、Godot 接入

| 项 | 改动 |
|---|---|
| 模型 | `WUSONG_MODEL` → `res://assets/releases/ART-002/r10/models/wusong.glb` |
| 普攻 | `_play_wusong(ANIM_PUNCH)` —— 播 `punch`（不是双刀 `attack`） |
| 虎影重击 | `_play_wusong(ANIM_TIGER_SHADOW)` —— 播 `tiger_shadow` |
| 缺动作保护 | 模型若不含 `punch` / `tiger_shadow`，`_spawn_wusong()` 直接 `push_error` 并返回 false，**不静默退回双刀** |
| 虎影造型 | 从 3 个方块改成**虎形轮廓**（头 + 吻 + 双耳 + 鬃毛 + 背脊 + 前伸前腿 + 前爪 + 后腿 + 上扬尾巴，共 18 个球体），半透明金色，扑出后爆开消散 |
| 数值 | 未动：普攻 18 伤害 +25 怒气；虎影重击 35 伤害 −50 怒气；敌人 12/16 伤害 |

---

## 六、测试

`bash tools/godot-tiger-test.sh` —— **48 项全过**（原 40 + 新增 8 项）

新增：

| 断言 | 内容 |
|---|---|
| A13 | 加载的是 r10 无刀拳击版 |
| A13 | 模型带 `punch` 与 `tiger_shadow` |
| A13 | 旧双刀 `attack` 仍保留但**不被使用** |
| A13b | 普攻播放 `punch`（实测 `current_animation`） |
| A13c | 虎影重击播放 `tiger_shadow` |
| A13d | 模型正面朝向敌人（`rotation.y == -90°`） |
| A13e | 出拳朝敌人方向（hand.R 世界 X 峰值 −1.895 → −1.759） |

Blender 侧 `verify_wusong_punch.py` —— **16 项全过**（几何无刀 + clip 时长 + 逐帧贴地 + 幅度对比）。

---

## 七、已知限制（如实）

| 项 | 状态 |
|---|---|
| 虎模型 | **程序化几何占位**，全库没有虎模型。**不代表美术验收** |
| 虎影 | **程序化半透明几何占位**，是威势象征而非跟随宠物。**不代表美术验收** |
| 出拳幅度 | 0.52 单位（人高 2.15），远景截图里不显眼；用序列帧才能看清 |
| 拳击表演质量 | 程序化关键帧，非 Blender GUI 手 K。**不代表动作表演验收** |
| 其余 17 角色 | 仍是 r8 资产（能展示不能打），未扩 |
| r6 `attack` 片段 | 保留未改（资产完整性），但战斗不再使用 |

---

## 八、复现命令

```bash
# 生成 r10（Blender）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_wusong_punch.py

# 几何与动作验收（Blender）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/verify_wusong_punch.py

# Godot 导入
bash tools/godot-import.sh

# 战斗闭环测试（48 项）
bash tools/godot-tiger-test.sh

# 逐帧抓动作序列
/Applications/Godot.app/Contents/MacOS/Godot --path . --script res://godot/tests/punch_seq.gd \
  --rendering-driver opengl3 --resolution 900x700
```
