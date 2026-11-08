# ACT-007 · Blender 源工程链路（r7 GLB → 编辑 → .blend → r8 GLB）

上一阶段（ACT-006 / CMD-008）只交了 GLB，**没有源工程**：r8 目录下只有 `models/*.glb`，
美术拿到手没法接着改。本阶段把源工程补上，并让整条链路可核验。

## 1. 链路

```
assets/releases/ART-002/r7/models/<hero>.glb        ← 只读输入
        │  Blender 5.2.2（background 模式）真实执行：
        │    · import_scene.gltf 导入
        │    · 新建 death Action（4 个姿态关键帧，0 / 250 / 800 / 1600ms）
        │    · 新建 weapon.R 骨，父级 hand.R
        │    · export_scene.gltf 导出 GLB
        │    · wm.save_as_mainfile 保存源工程
        ▼
assets/releases/ART-002/r8/source/<hero>.blend      ← 源工程（可再编辑）
assets/releases/ART-002/r8/models/<hero>.glb        ← 引擎用产物
```

两个产物来自**同一次 Blender 会话**：先导出 GLB，再把同一份场景存成 .blend，
因此不存在「GLB 是别的路子生成的」这种情况。

## 2. 实际执行的命令与退出码

```bash
# 单角色
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py -- --hero hero005
# → 退出码 0

# 全部 18 个角色（本阶段实跑）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py -- \
    --heroes hero002,hero005,hero006,hero007,hero008,hero010,hero011,hero012,hero013,\
hero014,hero015,hero017,hero019,hero021,hero022,hero023,hero024,hero025 \
    --batch-log docs/motion/ACT-007/probe/r8_batch_build.json
# → 退出码 0；"合计 18 个角色，成功 18，失败 0"
```

- 工具：**Blender 5.2.2 LTS**（build 2026-09-15，hash `d13f752e3b9c`），本机 `/Applications/Blender.app`
- 完整 stdout：`docs/evidence/CMD-009/logs/blender-build-hero005.log`、
  `blender-build-all18.log`
- 汇总 JSON：`docs/motion/ACT-007/probe/r8_batch_build.json`

**如实说明**：Blender 以 `--background`（`-b`）模式运行脚本完成编辑并保存，不是人在 GUI 里
逐帧摆姿势。产物是真实的 .blend 工程文件（Blender 原生 zstd 压缩，文件头 `28 b5 2f fd`），
可被 Blender 再次打开继续编辑 —— 这一点由下一节的独立进程验收证明。

## 3. 源工程验收：用**另一个 Blender 进程**把文件读回来

只凭「脚本说它保存了」不算数。所以另起 Blender 进程逐个 `wm.open_mainfile` 打开 .blend 检查：

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/verify_blend_sources.py -- \
    --out docs/motion/ACT-007/probe/blend_reopen.json --reexport-dir /tmp/r8_from_blend
# → 退出码 0；"18/18 角色通过，断言 144/144"
```

每个角色 8 项：

| # | 检查项 | 判据 |
|---|---|---|
| 1 | 文件存在 | 有字节 |
| 2 | 能重新打开 | `wm.open_mainfile` 不报错 |
| 3 | 有且仅有 1 个 Armature | 场景对象 |
| 4 | 五个 Action 齐 | `idle / walk / attack / hit / death` |
| 5 | death 时长 | 帧范围 0→38.4 = **1600.0ms**（导出 GLB 后按整帧采样量化为 1583.3ms） |
| 6 | weapon.R 在骨骼表 | 12 根骨：`root body arm.L hand.L arm.R hand.R weapon.R head leg.L foot.L leg.R foot.R` |
| 7 | weapon.R 父骨 | 必须 `hand.R` |
| 8 | 从 .blend 再导出一份 GLB | 文件生成成功 |

第 8 项额外做了**交叉比对**：把从 .blend 重导出的 GLB 与正式 r8 GLB 用 `probe_glb.py` 比片段表，
**18/18 完全一致**（含 `death: 1583.3`，且都带 `weapon.R`）。即：

> 源工程里有什么，导出的 GLB 就有什么；把源工程重新导出一遍，得到的还是同一张片段表。

## 4. 源工程清单（sha256 前 16 位，完整值见 `probe/asset_hashes.json`）

| 角色 | .blend 字节 | .blend sha256(前16) | r8 GLB sha256(前16) | 重开验收 |
|---|---|---|---|---|
| `hero002` | 683673 | `ebf3dde637ed2907` | `b58b02c8869ab47e` | 通过 |
| `hero005` | 657938 | `6ca4ad72d0ce2d18` | `257c261975e403dd` | 通过 |
| `hero006` | 625343 | `37472bb20f8e4531` | `e58bd9c14b05c527` | 通过 |
| `hero007` | 678251 | `013682e4461a3870` | `49e821ccdccb4a1a` | 通过 |
| `hero008` | 735270 | `4bf4f28d2487a016` | `c02cbf5aa3793c7c` | 通过 |
| `hero010` | 643261 | `15dbcb8ac800fb77` | `c9a32f0269c5df60` | 通过 |
| `hero011` | 674999 | `4d28ae2d88817885` | `bfb5dd2d9da5d0cf` | 通过 |
| `hero012` | 627680 | `d92914b32d016b1b` | `b91971f507a3a7e7` | 通过 |
| `hero013` | 572982 | `146b2a0d31ebe34b` | `83ec76156361f081` | 通过 |
| `hero014` | 567828 | `20831eca0e89077c` | `cae69c6de548a9d6` | 通过 |
| `hero015` | 640038 | `5deb760f14d75f2d` | `84e538bd8803b40d` | 通过 |
| `hero017` | 635044 | `1d75916c4d728feb` | `13f1e2301fc1d22a` | 通过 |
| `hero019` | 639920 | `09217e6b154495c8` | `d32cce484bcaecdf` | 通过 |
| `hero021` | 639460 | `0af61b8346507eeb` | `5ef8b88d3131dc63` | 通过 |
| `hero022` | 638566 | `6d492454799ad355` | `785ae6b6fb5431cf` | 通过 |
| `hero023` | 658569 | `28c9ab2e88998021` | `b6cf0cc0dcf5be29` | 通过 |
| `hero024` | 629791 | `43ea7806dcbae74f` | `e3fd294e4d4eaa25` | 通过 |
| `hero025` | 639061 | `101e8b2ac4c94496` | `28a7ec6a93b8b003` | 通过 |

18 份源工程合计 **11,587,674 字节**（平均 643,759）。

复算命令：

```bash
python3 tools/motion/hash_manifest.py
# → 退出码 0；同时核对 r7 每个文件 sha256 与 ACT-006 基线快照一致（18/18 未改动）
```

## 5. 本次踩到的两个坑

1. **时长判据写错**：验收脚本一开始拿 `1600 / 24 = 66.7` 当期望值，导致 18/18 全判失败。
   源工程内部是 1600ms，导出的 GLB 才是量化后的 1583.3ms，两者不是一回事。
2. **Blender 5.x 的 Action 是 layered**，没有顶层 `.fcurves`，直接访问会抛异常；
   关键帧数要沿 `layer → strip → channelbags → fcurves` 取，且不同小版本 API 名有出入，
   脚本做了多策略回退，取不到只影响诊断信息、不判失败。
