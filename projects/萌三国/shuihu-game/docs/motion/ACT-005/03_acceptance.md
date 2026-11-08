# ACT-005 · 验收与复现（r8 资产 + Godot 运行时五动作接入）

## 1. 复现命令（全部实际跑过，贴真实输出）

### 1.1 生成 r8（不碰 r7）

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py
```

真实输出（节选）：

```
已把 death 设为激活 action（避免关键帧误写入既有 clip）
death 参与骨骼=11，缺失=[]
骨骼旋转模式：{'root': 'QUATERNION', ... 'foot.R': 'QUATERNION'}   # 11 根全部四元数
death action 创建完成：帧 0..38.400000000000006（目标 1600ms @ 24fps），通道数=110
已清空激活 action，导出仅依赖 NLA 轨道：['hit', 'attack', 'walk', 'idle', 'death']
已创建骨骼 weapon.R（父=hand.R，head=(0.5202, -0.0, 0.5589)）
r7 hero005.glb 字节=959800（未改动）
r8 hero005.glb 字节=946880
导出后 Action 列表：['attack', 'death', 'hit', 'idle', 'walk']
骨骼全表：['root', 'body', 'arm.L', 'hand.L', 'arm.R', 'hand.R', 'weapon.R', 'head',
          'leg.L', 'foot.L', 'leg.R', 'foot.R']
```

### 1.2 复核 r8（读字节，不写资产）

```sh
python3 tools/motion/verify_r8.py; echo "EXIT=$?"
```

真实输出：

```
r7: 959800 bytes  sha256=7ac9ec719ce73a8d
r8: 946880 bytes  sha256=257c261975e403dd   # ACT-006 重建贴地后；ACT-005 交付时为 c7fce1cb1af39ea9
r7 clips: {'idle': 2000.0, 'walk': 1000.0, 'attack': 1000.0, 'hit': 750.0}
r8 clips: {'attack': 1000.0, 'death': 1583.333, 'hit': 750.0, 'idle': 2000.0, 'walk': 1000.0}
[PASS] r8 存在原生 death clip — r8 clip 列表=['attack', 'death', 'hit', 'idle', 'walk']
[PASS] death 实测时长 ≈ 1600ms — 实测 1583.333 ms（容差 ±40ms）
[PASS] r8 保留 clip idle 且时长未变 — r7=2000.0 ms → r8=2000.0 ms
[PASS] r8 保留 clip walk 且时长未变 — r7=1000.0 ms → r8=1000.0 ms
[PASS] r8 保留 clip attack 且时长未变 — r7=1000.0 ms → r8=1000.0 ms
[PASS] r8 保留 clip hit 且时长未变 — r7=750.0 ms → r8=750.0 ms
[PASS] r8 存在武器/道具专用挂点节点 — 命中节点=[('weapon.R', 'hand.R')]
[PASS] 武器挂点父级为 hand.R — 父级=['hand.R']
[PASS] r7 仍无武器挂点（未被改动） — r7 命中=[]
[PASS] r7 文件字节与 sha256 未变 — 字节=959800 sha=7ac9ec719ce73a8d

合计 10 项，PASS 10，FAIL 0
EXIT=0
```

### 1.3 导入到 Godot（`.import` / `.godot/imported` 被 gitignore）

```sh
./tools/godot-import.sh
```

真实输出末行：`原工程现有：854 个 .import，1708 个导入缓存`

> 关于 r8 的 `.import`：本机把它改成了 `animation/remove_immutable_tracks=false` 与 `animation/fps=24`。
> 默认值（`true` / `30`）会裁掉 `hand.R`/`weapon.R` 这类"局部恒定"的旋转轨道并重采样时长，
> **但这不影响断言**——命中/收招是从 `Skeleton3D` 的**世界姿态**采样算出的，不依赖那两条局部轨道
> （改参数前用默认值实测过，同样测出命中时刻）。`.import` 被 `.gitignore` 忽略，不随仓库分发。

### 1.4 运行时断言（headless）

```sh
./tools/godot-motion-test.sh        # 等价于 Godot --headless --script res://godot/tests/motion_action_test.gd
```

真实输出（25 项全过，exit 0）：

```
== 模型：res://assets/releases/ART-002/r8/models/hero005.glb ==
== 片段列表：["attack", "death", "hit", "idle", "walk"] ==
[PASS] 片段存在：idle / walk / attack / hit / death
[PASS] death 为资产原生片段 — native_ms=1583.33337306976
[PASS] death 时长接近 1600ms — 实测 1583.3 ms（24fps 量化）
[PASS] clip 时长：idle ≈ 2000ms / walk ≈ 1000ms / attack ≈ 1000ms / hit ≈ 750ms
[PASS] 武器挂点骨存在 — attach=weapon.R
[PASS] 武器挂点父级为 hand.R — parent=hand.R
[PASS] attack 命中 ≈ 458ms — 实测 452.0 ms（偏差 -6.0 ms，骨骼 hand.R，峰值 11.64 rad/s）
[PASS] attack 收招尾保持 = 110ms — 实测 110.0 ms
[PASS] attack 总时长（含收招）= 1110ms — 实测 1110.0 ms
[PASS] attack 收招段 = 总时长 - 命中 — 实测 658.0 ms
[PASS] 运行时切换到 idle / walk / attack / hit / death — current=<clip> playing=true
[PASS] attack 收招结束后回到 idle — current_action=idle
[PASS] death 结束后定格不回 idle — current_action=death
== 合计 25 项，PASS 25，FAIL 0 ==
MOTION_ACTION_OK: five actions wired in Godot runtime with measured impact/recovery
```

完整日志：`docs/evidence/CMD-007-motion-test.log`；实测数据 JSON：`docs/evidence/CMD-007-motion-probe.log`。

### 1.5 直接打开场景

```sh
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/motion/hero_action_stage.tscn
```

打开后自动循环 idle → walk → attack → hit → death，HUD 显示当前动作、原生时长、实测命中 ms 与偏差、收尾保持与总时长。

### 1.6 截图与录屏

```sh
./tools/motion/capture_godot_stage.sh            # 11 张截图 + 2 段帧序列 + 2 个 mp4
SHOTS_ONLY=1 ./tools/motion/capture_godot_stage.sh
```

产物在 `docs/evidence/CMD-007/motion/`：11 张 PNG、`frames/attack`（28 帧）、`frames/death`（32 帧）、
`attack-roll.mp4`（1.167s）、`death-roll.mp4`（1.334s）。

## 2. 命中 458ms 与收招 1110ms 是怎么"由实际片段验证"的

不是照抄文档，也不是用离线帧预览：

1. `hero_action_stage.gd::measure_impact_ms()` 在**运行时**按 8ms 步长 `seek` 真实片段（126 个采样点/1000ms），
   每步读 `Skeleton3D.get_bone_global_pose(hand.R)`，用相邻样本的四元数夹角/时间差算**世界角速度**、
   用原点位移差算**世界线速度**，再把两条曲线各自归一化求和（与 ACT-004 的 `combined_impact` 同口径）取峰值时刻。
2. 实测结果：合成峰值 **452.0ms**，角速度峰值 428.0ms，线速度峰值 452.0ms，峰值角速度 11.64 rad/s。
   与裁决目标 458ms 相差 **−6.0ms**，小于 24fps 单帧（41.7ms），在 ±42ms 容差内。
3. 收招：原生片段实测 **1000.0ms**，`tail_hold_ms = 1110 − 1000 = 110.0ms` 由 `_on_finished()` 用计时器补，
   于是"从起手到可再次行动"= **1110.0ms**；命中到收招段 = 1110 − 452 = **658.0ms**。
4. 运行时行为断言：attack 播完 + 110ms 后确实回到 idle；death 播完**定格**不回 idle。

### 一处需要说明的口径差异

Godot 导入器会把 `hand.R` 的**局部**旋转轨道判为"恒定"（该骨局部旋转在资产里不变，运动来自父骨 `arm.R`）。
所以既不能只读局部关键帧，也不能只看局部轨道数量——必须按世界姿态采样。这与 ACT-004 离线 FK 的算法一致，
两边结果互相印证（离线 456ms / 运行时 452ms，差 4ms）。

### 顺带发现

Godot 导入参数 `animation/remove_immutable_tracks=true`（默认）会让 `hand.L` / `hand.R` / `weapon.R` 的旋转轨道
在导入后消失（实测只剩 9/12 条）；r8 的 `.import` 置为 `false` + `animation/fps=24` 后可见 12 条（含 `hand.R`、`weapon.R`）。
这条只是"轨道可见性"的差异，不影响按世界姿态采样的测量，但**会影响将来按轨道直接驱动道具的程序**——若后续要按轨道驱动挂点，需确认这个参数。

## 3. 未测 / 未通过

1. **手机真机未测**：只在 macOS + Godot 4.7.2 + `opengl3` 驱动下跑过。
2. **Forward+ 未切**（本轮明确不切），所以只看过 Compatibility 渲染下的表现。
3. **未接游戏**：`docs/evidence/CMD-007/motion/` 的截图是 Godot 运行时对 r8 资产的真实播放，
   但**仍是独立验证场景**，网页版战斗与 Godot 玩法都还没接这套动作。ACT-004 的离线预览与游戏接入的区别继续成立。
4. **武器没真挂**：`weapon.R` 只验证了节点与父级，没有把武器 mesh 挂上去渲染。
5. **无美术验收**：穿模、地面接触、镜头构图未做美术评审；attack 片段本身的动作幅度偏小（资产既有设计），
   视觉上挥击感不强，建议后续让美术加深幅度。
6. **只接入 hero005**，其余 17 个角色仍是 r7（无 death / 无挂点）。
7. 录屏为 `--shot-dir` 逐帧截图后用 ffmpeg 合成（24fps），**不是屏幕录制**；不含音频。
