# ACT-007 · 验收清单（逐条给出可复算命令）

判定口径：**未跑出命令、退出码、产物三件套的，一律不算通过**。
下面每条都写了复算命令，任何人照抄即可复核。

## 一、Blender 侧

| # | 验收项 | 结果 | 复算命令 | 证据 |
|---|---|---|---|---|
| B1 | Blender 真实执行编辑（导入 r7 GLB → 建 death Action → 建 weapon.R 骨） | 通过 | 见下方 B1 命令，退出码 0 | `logs/blender-build-all18.log` |
| B2 | 保存新版本 `.blend` 源工程 | 18/18 | `ls assets/releases/ART-002/r8/source/` | 18 个文件，合计 11,587,674 字节 |
| B3 | 导出的 GLB 含五动作 | 18/18 | `python3 tools/motion/verify_r8_all.py` | idle/walk/attack/hit/death |
| B4 | GLB 含原生 death | 18/18，`1583.3ms` | 同上 | 与 B3 同一份报告 |
| B5 | GLB 含 weapon.R 挂点（父 hand.R，属 skin joint） | 18/18 | 同上 | 12 根骨 |
| B6 | 源工程能被**另一个 Blender 进程**重新打开 | 18/18，断言 144/144 | 见下方 B6 命令，退出码 0 | `probe/blend_reopen.json` |
| B7 | 从 .blend 重新导出 GLB，片段表与正式 GLB 一致 | 18/18 | B6 命令带 `--reexport-dir` 后再比对 | `probe/blend_reopen.json` 第 8 项 |
| B8 | r7 未被改动 | 18/18 sha256 与基线一致 | `python3 tools/motion/hash_manifest.py` | `probe/asset_hashes.json` |
| B9 | 源工程与 GLB 哈希留档 | 18×3 个 sha256 | 同上 | `probe/asset_hashes.json` |

```bash
# B1 编辑 + 保存 + 导出（18 个角色）
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/build_r8_death.py -- \
  --heroes hero002,hero005,hero006,hero007,hero008,hero010,hero011,hero012,hero013,\
hero014,hero015,hero017,hero019,hero021,hero022,hero023,hero024,hero025 \
  --batch-log docs/motion/ACT-007/probe/r8_batch_build.json

# B6/B7 独立进程重开源工程 + 从 .blend 重导出
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/verify_blend_sources.py -- \
  --out docs/motion/ACT-007/probe/blend_reopen.json --reexport-dir /tmp/r8_from_blend
```

版本与环境：`Blender 5.2.2 LTS`（build 2026-09-15，hash `d13f752e3b9c`），
macOS 27.0.1，Apple M6。见 `docs/evidence/CMD-009/logs/tool-versions.txt`。

## 二、Godot 侧

| # | 验收项 | 结果 | 复算命令 | 证据 |
|---|---|---|---|---|
| G1 | 真实导入工程 | 899 个 `.import`，退出码 0 | `bash tools/godot-import.sh` | `logs/godot-import.log` |
| G2 | 场景可打开 | `res://godot/motion/hero_action_stage.tscn` | 见下方 G2 命令 | 窗口 1280×720 |
| G3 | **窗口**运行（非 headless） | `display_server=macOS` | 见下方 G2 命令，看 `[ENV]` | `logs/godot-window-run.log` |
| G4 | 真实 GPU 渲染 | `gpu_adapter=Apple M6` | 同上 | 同上 |
| G5 | 引擎内录屏（`--write-movie`，非系统实屏录制） | 1280×720 / 30fps / 14.03s | `bash tools/motion/capture_window_run.sh` | `window/hero005-window-cycle.mp4` |
| G6 | 窗口截图（含 HUD 实测数字） | 7 张 | 同上 | `window/hero005-*.png` |
| G7 | 运行时断言（18 角色 × 五动作） | 342/342，退出码 0 | `bash tools/godot-r8-all-test.sh` | `logs/godot-r8-all-test.log` |
| G8 | hero005 单角色断言 | 25/25 | `bash tools/godot-motion-test.sh` | `docs/evidence/CMD-007-motion-test.log` |

```bash
# G2/G3 窗口运行 4 秒后自退
/Applications/Godot.app/Contents/MacOS/Godot --path . \
  res://godot/motion/hero_action_stage.tscn -- --quit-after 4
```

版本：`Godot 4.7.2.stable.official.ed1daf0bf`；渲染器仍 `gl_compatibility`（未切 Forward+）。

## 三、回归

| 套件 | 结果 |
|---|---|
| `./tools/run-tests.sh`（单元 173 + 导入护栏哨兵 33） | 173/173，退出码 0 |
| `python3 tools/motion/verify_r8.py`（hero005 结构） | 10/10 |
| `bash tools/godot-r8-all-test.sh` | 342/342 |

## 四、本次**没有做**的事（如实标注，不算通过）

| 项 | 状态 |
|---|---|
| Blender **GUI 里人工摆姿势** | 未做。Blender 以 `--background` 模式执行脚本完成编辑与保存，产物是可再编辑的真实 .blend；死亡动作是 4 个姿态的程序化关键帧，不是手 K 的表演 |
| 武器 **mesh 真挂到 weapon.R** | 未做。目前只有挂点骨，没有武器模型挂上去 |
| 动作接入玩法 | 未做。网页战斗与 Godot 玩法都还没调用这套五动作 |
| 倒地过程逐帧穿地检查 | 未做。只验了末帧贴地（18/18 minZ≈0） |
| 渲染器切换 Forward+ | 未做，仍 gl_compatibility |
| 发布 / 打 tag | 未做 |
| Godot 编辑器内**手动**点开场景 | 只做了命令行窗口运行；编辑器 GUI 手动打开未做（等价路径：编辑器里 Open Scene 同一 tscn） |
