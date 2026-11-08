# ACT-010 · Q 版猛虎资产（r11）与虎影表现

> 背景：之前战斗里的「虎」是 Godot 侧用 11 个方块拼的占位物，远景看就是一只方块箱子；
> 虎影也是程序化半透明方块。本工作包做**真实虎资产**，并让虎影用同一只虎。

---

## 一、虎资产（r11）

| 项 | 内容 |
|---|---|
| 源 | `assets/releases/ART-002/r11/source/tiger.blend`（226 KB，可编辑） |
| 模型 | `assets/releases/ART-002/r11/models/tiger.glb`（523,816 B） |
| 骨架 | 12 骨：root / body / head / arm.L / hand.L / arm.R / hand.R / leg.L / foot.L / leg.R / foot.R / tail |
| 分件 | 57 个 mesh（每件独立顶点组绑骨） |
| 动作 | `idle` 1958.3ms / `walk` 1000ms / **`pounce` 1333.3ms** / `hit` 1000ms |
| 造型 | 原创分件几何（Blender ball/rod/box/curve），**非下载素材** |

### 可辨识的虎特征

| 特征 | 实现 |
|---|---|
| 宽额虎头 | 头部球体 + 宽额凸起（`TigerBrow`） |
| **王字额纹** | 三横一竖的深色纹（虎的标志性特征） |
| 圆耳 | 双耳球体 + 内耳浅色 |
| 白吻白胸 | 吻部与腹部浅色块 |
| 环尾 | 尾巴 4 段贝塞尔 + 4 个深色环（**与狮尾的关键区别**） |
| 躯干条纹 | 10 条躯干条纹 + 6 条颈部条纹 |
| 虎眼 | 琥珀色眼球 + 深色瞳孔 |

### 骨架高度

第一版骨架太低（躯干中心 0.52），渲染出来像「爬行的猫」。已抬高到躯干 0.66、
头 0.98、爪 0.10，总高约 1.35 单位（× 场景缩放 0.76）。

---

## 二、Godot 接入

| 项 | 处理 |
|---|---|
| 模型 | `TIGER_MODEL = res://assets/releases/ART-002/r11/models/tiger.glb` |
| 场景 | `_build_tiger()` 加载真实模型，`tiger_model` / `tiger_anim` 暴露给测试 |
| 动画 | idle / walk 循环；**pounce** / hit 单次 |
| 受击 | `_hit_tiger()` 播 `hit` |
| 兜底 | 模型缺失时 `push_error` + `_build_tiger_fallback()`（**仅兜底，不是交付形态**） |
| **虎影** | **同一只虎的半透明金色版本**：加载 r11 → `_apply_material()` 覆盖所有 mesh 材质为半透明金 → 播 `pounce` → 扑出 → 撞上目标 → 爆开消散 |

> 虎影用同一只虎，天然就是虎形，不再是方块。它象征威势，**不跟随、不留在场上**。

---

## 三、机位与朝向标定（这是「拳击远景不清晰」的真正解法）

之前反复靠看图猜角度，效率低且反复错。改用**量化标定**：
写脚本 `godot/tests/facing_calc.gd`（已并入 `tools/motion/` 备查），
播放 `punch`、采样 `hand.R` 世界位移，投影到屏幕，算两个指标：

- **横向占比** = |位移.x| / |位移.xz|（拳在画面里是「横着走」还是「朝镜头变大」）
- **脸朝镜头** = 模型正面（局部 +Z）在世界里的 z 分量（越大越看得见脸）

实测标定表：

| rot.y | 横向占比 | 脸朝镜头 | 评价 |
|---|---|---|---|
| 30° | 0.03 | 0.87 | 拳朝镜头，看不出「挥」 |
| **60°** | **0.52** | **0.50** | ✅ **取这个**：挥拳可读 + 半张脸可见 |
| 90° | 0.88 | −0.00 | 正对敌人，拳被身体挡，脸完全侧对 |
| 135° | 0.96 | −0.71 | 拳最清楚但完全背对镜头 |
| −45° | 0.96 | 0.71 | 拳横向清楚但**方向朝左**（打错方向） |

**结论：`rotation.y = 60°`** 是「挥拳可读性」与「角色辨识度」的平衡点。
虎取对称的 `−60°`。

> Godot 绕 Y **正向旋转是顺时针**，符号容易搞反——这是本轮反复踩的坑，
> 所以最终用量化脚本定值而不是肉眼试。

---

## 四、演示模式 `--showcase`

明确编排五拍，每拍对应一张证据图：

| 阶段 | 截图 | 说明 |
|---|---|---|
| 1 | `10-windup.png` | 蓄力帧（t=0.10s，拳还在引） |
| 2 | `11-punch.png` | 挥拳中段（t=0.22s，手臂明显离体） |
| 3 | `11b-punch-extend.png` | 完全伸出（t=0.40s，实测峰值） |
| 4 | `02-tiger-shadow.png` | 虎影扑出途中（金色半透明虎形） |
| 5 | `12-tiger-hit.png` | 虎影撞上目标 |
| 6 | `13-recover.png` | 收招（虎影已消散） |

```bash
Godot --path . res://godot/tiger_tutorial/tiger_tutorial.tscn \
  --rendering-driver opengl3 --resolution 1280x720 \
  -- --scratch-save --showcase --shots <目录> --quit-after 34
```

---

## 五、测试

| 断言 | 内容 |
|---|---|
| A14 ×5 | 使用 r11 真实虎模型 / 虎模型已实例化 / 带 `pounce` / 带 `hit` / 未走方块 fallback |
| A13d | 朝向为标定值 60° |
| A13e | 出拳位移与模型正面的夹角 cos > 0.80（**朝正面打出去**） |
| A13e2 | 出拳位移幅度 > 0.19（实测 0.233） |

> A13e 改判据的原因：60° 朝向下世界 X 增量很小（位移多在纵深），
> 用「世界 X 增量」判会误判。改用「位移向量 vs 模型正面方向的夹角」，
> 这才是「有没有朝正面打出去」。

闭环 **57/57**、独立验收 **8/8 场景**，回归 173/173 + 旧战斗 24/24。

---

## 六、已知限制（如实）

| 项 | 说明 |
|---|---|
| 造型质量 | Q 版分件几何，**程序化生成，非 Blender GUI 手 K**，仍需美术同学接手打磨 |
| 虎影 | 同一模型的半透明金色版，**没有独立的「虎影」美术表现**（不是消散粒子/残影） |
| 动作表演 | 4 条动作是程序化关键帧，`pounce` 是蓄力→腾空→落地→收势，**非手 K 表演** |
| 虎的死亡 | **没有 death 动作**（虎是敌人，暂不需要） |
| 拳击表演 | 武松 punch/tiger_shadow 同样是程序化关键帧 |
| 逻辑 ≠ 美术 | 以上都需要美术验收；本工作包只保证**几何真实、动作驱动正确、可辨识** |

---

## 七、复现命令

```bash
# 生成虎资产（Blender 5.2.2）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_tiger_r11.py

# Godot 导入
bash tools/godot-import.sh

# 演示截图
/Applications/Godot.app/Contents/MacOS/Godot --path . \
  res://godot/tiger_tutorial/tiger_tutorial.tscn --rendering-driver opengl3 \
  --resolution 1280x720 -- --scratch-save --showcase --shots <目录> --quit-after 34

# 闭环测试
bash tools/godot-tiger-test.sh
```
