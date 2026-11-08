# ACT-006 · 验收与复现（18 个角色 r8）

所有命令都在 `shuihu-game/` 目录下跑过，下面贴的是**真实输出**（不是示意）。

## 1. 固定 r7 基线（开工前）

```sh
python3 tools/motion/snapshot_assets.py
```

```
hero002       1077636  sha=15258faf08d3a1ae  clips={'idle': 2000.0, 'walk': 1000.0, 'attack': 1000.0, 'hit': 750.0}
hero005        959800  sha=7ac9ec719ce73a8d  clips={'idle': 2000.0, 'walk': 1000.0, 'attack': 1000.0, 'hit': 750.0}
hero006        929472  sha=0c90d6e226b2492a  clips={'idle': 1958.333, 'walk': 1000.0, 'attack': 1000.0, 'hit': 1000.0}
...
hero025        921032  sha=87e3950bf685a6d7  clips={'idle': 2000.0, 'walk': 1000.0, 'attack': 1000.0, 'hit': 750.0}

写出 docs/motion/ACT-006/probe/r7_baseline.json（18 个文件）
```

## 2. 批量生成 r8

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py -- \
  --heroes hero002,hero006,hero007,hero008,hero010,hero011,hero012,hero013,hero014,hero015,hero017,hero019,hero021,hero022,hero023,hero024,hero025 \
  --batch-log docs/motion/ACT-006/probe/r8_batch_build.json
```

```
OK hero002 → assets/releases/ART-002/r8/models/hero002.glb（1078408 bytes，sink=-0.481，minZ=-0.0）
OK hero006 → assets/releases/ART-002/r8/models/hero006.glb（959940 bytes，sink=-0.459，minZ=-0.0）
OK hero007 → assets/releases/ART-002/r8/models/hero007.glb（1020440 bytes，sink=-0.481，minZ=-0.0）
...
OK hero025 → assets/releases/ART-002/r8/models/hero025.glb（907928 bytes，sink=-0.459，minZ=-0.0）
批量汇总：docs/motion/ACT-006/probe/r8_batch_build.json

合计 17 个角色，成功 17，失败 0
```

hero005 单独重建（贴地修正，见 `02_ground_fit.md`）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py
```

```
沉降模式：自动贴地（按该角色包围盒求解）
贴地采样：sink=0.00 → minZ=-0.4808 maxZ=0.4498
贴地采样：sink=0.20 → minZ=-0.6808 maxZ=0.2498
贴地求解：z0=-0.4808 z1=-0.6808 斜率=-1.0000 → sink=-0.4808
贴地结果：sink=-0.4808 → minZ=-0.0000 maxZ=0.9306（容差 ±0.02）
OK hero005 → assets/releases/ART-002/r8/models/hero005.glb（946880 bytes，sink=-0.481，minZ=-0.0）
```

## 3. 结构复核（读字节，不写资产）

```sh
python3 tools/motion/verify_r8_all.py; echo "EXIT=$?"
```

```
hero      items pass    fail     clips(r8)                      weapon.R→parent
----------------------------------------------------------------------------------------------------
hero002   14    14      0        attack=1000,death=1583,hit=750,idle=2000,walk=1000 weapon.R←hand.R
hero005   14    14      0        attack=1000,death=1583,hit=750,idle=2000,walk=1000 weapon.R←hand.R
hero006   14    14      0        attack=1000,death=1583,hit=1000,idle=1958,walk=1000 weapon.R←hand.R
hero013   14    14      0        attack=1000,death=1583,hit=1000,idle=1958,walk=1000 weapon.R←hand.R
...
hero025   14    14      0        attack=1000,death=1583,hit=750,idle=2000,walk=1000 weapon.R←hand.R
----------------------------------------------------------------------------------------------------
角色 18 个，断言 252 项，FAIL 0 项
R8_ALL_OK: every hero has native death + weapon.R, r7 untouched
```

单独跑单个角色也支持：`python3 tools/motion/verify_r8.py`（hero005 的 10 项，ACT-005 遗留脚本，仍然 PASS）。

## 4. 几何复核：导出的 GLB 里 death 是不是真贴地

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/verify_ground.py -- \
  --out docs/motion/ACT-006/probe/r8_ground.json
```

```
hero      minZ     maxZ      stand_h   ratio   judge
----------------------------------------------------------------------
hero002    +0.0003   0.9306     2.145  0.4338 PASS
hero005    +0.0003   0.9306      2.64  0.3525 PASS
hero006    +0.0003   0.9092    2.8603  0.3179 PASS
hero013    +0.0003   0.9092     2.145  0.4239 PASS
...
hero025    +0.0003   0.9092     2.145  0.4239 PASS
----------------------------------------------------------------------
角色 18 个，FAIL 0 个；明细 docs/motion/ACT-006/probe/r8_ground.json
GROUND_OK: every r8 death ends lying on the floor (|minZ|<=0.05)
```

## 5. 运行时复核：Godot 里逐个加载并真实切换五动作

```sh
bash tools/godot-r8-all-test.sh    # 等价于 Godot --headless --script res://godot/tests/r8_all_heroes_test.gd
```

```
== r8 运行时逐个验证：18 个角色，基线 18 个 ==
-- hero002（5 个片段）--
-- hero005（5 个片段）--
...
-- hero025（5 个片段）--
== 合计 342 项，PASS 342，FAIL 0（角色 18 个） ==
R8_ALL_HEROES_OK: every r8 hero loads and plays five actions in Godot runtime
```

每个角色 19 项：5 个片段存在、death 原生 + 时长、4 个片段与 r7 基线时长一致、
挂点存在 + 父级、5 个动作运行时真实切换、attack 命中可实测。

## 6. 截图证据

```sh
bash tools/motion/capture_r8_all.sh
```

```
— hero002  death  @ 1583ms → hero002-death-end.png err=0
...
— hero025  death  @ 1583ms → hero025-death-end.png err=0
— hero002  idle   @ 400ms  → hero002-idle-400ms.png err=0
— hero013  idle   @ 400ms  → hero013-idle-400ms.png err=0
— hero024  idle   @ 400ms  → hero024-idle-400ms.png err=0
完成：21 张 → docs/evidence/CMD-008/motion
```

拼图（18 张死亡末帧 6×3）：

```sh
ffmpeg -y -pattern_type glob -i 'hero*-death-end.png' \
  -filter_complex "scale=320:-1,tile=6x3:padding=4:margin=4:color=0x1a1a1a" \
  -frames:v 1 contact-sheet-death.png
```

## 7. 逐项验收

| 条件 | 命令 | 预期 | 实际 | 结论 |
|---|---|---|---|---|
| 17 个角色都补上原生 death | 批量构建 | 17/17 成功 | 17/17，时长均 1583.3ms | 通过 |
| 保留旧版本 r7 | `verify_r8_all.py` 比对基线 | 字节/sha 全未变 | 18/18 PASS | 通过 |
| 必要武器挂点 | 结构复核 | `weapon.R` 父级 `hand.R`、属 joint | 18/18 PASS | 通过 |
| 既有片段时长不变 | 结构复核（逐角色对基线） | 与各角色 r7 一致 | 18/18 PASS，含 1958/1000 那三个 | 通过 |
| death 末帧贴地 | `verify_ground.py` | \|minZ\| ≤ 0.05 | 18/18 = 0.0003 | 通过 |
| 确实躺下 | 同上 | 最高点/站立高 < 0.7 | 0.32–0.43 | 通过 |
| 运行时能加载并切换 | `godot-r8-all-test.sh` | 5 动作可切 | 342/342 PASS | 通过 |
| 不是只离线验结构 | 证据形态 | Godot 实拍 + 运行时断言 | 21 张截图 + 342 项断言 | 通过 |
| 未发布 / 未打 tag / 未切渲染器 | 检查 | 均未发生 | `project.godot` 仍 `gl_compatibility` | 通过 |

## 8. 未测 / 不算通过

1. **动作仍未接入玩法**：网页战斗与 Godot 玩法都没有调用这套动作，本轮只做到「资产 + 运行时可播」。
2. **武器没真挂**：只有 `weapon.R` 挂点骨，没有把武器 mesh 挂上去渲染。
3. **death 是程序构造的 4 姿态**，不是美术逐帧；倒地弧线偏直。
4. **只判了末帧贴地**，没有逐帧检查倒地过程中是否穿地。
5. **未做真机、未切 Forward+、未做美术主观验收**。
6. 中间 3 个角色的 `hit=1000ms`、`idle=1958.3ms` 与其他人不同，本轮只是**保留原值**，没有追查为什么不同。
