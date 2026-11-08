# CMD-009 交接单 · 工具链真实产物证据（Blender 源工程 + Godot 窗口运行）

> 触发原因：质疑「没有实际使用 Godot 和 Blender」。
> 本阶段把验收口径改成**可核验的真实软件制作**：源工程要真的存下来并能被 Blender 重新打开，
> Godot 要真的开窗口跑起来并出片，两个工具的命令、版本、退出码、日志全部留档。

## 一、结论

| 质疑点 | 现在的证据 | 状态 |
|---|---|---|
| 没用 Blender | 18 份 `.blend` 源工程（11.6MB），由 Blender 5.2.2 保存，并能被**另一个 Blender 进程**重新打开（144/144 断言） | 已完成 |
| 没用 Godot | 899 个 `.import` 导入产物；验证场景在**真窗口**运行（`display_server=macOS`、`Apple M6` GPU、1280×720），出 14 秒**引擎内录屏**（Godot `--write-movie` 输出，非操作系统实屏录制）+ 7 张带 HUD 的截图 | 已完成 |
| 只有 GLB 没有源工程 | 已补齐 `r8/source/<hero>.blend`，且与 GLB 同源（重导出比对 18/18 一致） | 已完成 |
| 只有 Python 解析 / HTML 帧预览 | 本阶段产物不含任何 HTML 预览；Python 只用于哈希与结构比对，不作为验收判据 | 已完成 |

## 二、工具与环境

```
Blender 5.2.2 LTS   build 2026-09-15  hash d13f752e3b9c
Godot   4.7.2.stable.official.ed1daf0bf
ffmpeg  5.1.2          Python 3.13.12
macOS   27.0.1 (26A434)   Apple M6
```

留档：`docs/evidence/CMD-009/logs/tool-versions.txt`

## 三、命令 / 退出码 / 日志 一览

| 步骤 | 命令 | 退出码 | 日志 |
|---|---|---|---|
| Blender 单角色 | `Blender -b -P tools/motion/build_r8_death.py -- --hero hero005` | 0 | `logs/blender-build-hero005.log` |
| Blender 18 角色 | 同上加 `--heroes <18 个> --batch-log …` | 0 | `logs/blender-build-all18.log` |
| Blender 重开验收 | `Blender -b -P tools/motion/verify_blend_sources.py -- --out … --reexport-dir …` | 0 | `logs/blender-reopen-verify.log` |
| Godot 导入 | `bash tools/godot-import.sh` | 0 | `logs/godot-import.log` |
| Godot 窗口运行 | `Godot --path . res://godot/motion/hero_action_stage.tscn -- --quit-after 4` | 0 | `logs/godot-window-run.log` |
| Godot 引擎内录屏（`--write-movie`，非系统实屏录制） | 同上加 `--write-movie … --fixed-fps 30 -- --quit-after 14` | 0 | `logs/godot-window-movie.log` |
| Godot 运行时断言 | `bash tools/godot-r8-all-test.sh` | 0 | `logs/godot-r8-all-test.log` |
| 哈希清单 | `python3 tools/motion/hash_manifest.py` | 0 | `probe/asset_hashes.json` |

## 四、产物清单

```
assets/releases/ART-002/r8/source/    18 × .blend   源工程（新增，11,587,674 字节）
assets/releases/ART-002/r8/models/    18 × .glb     引擎产物（字节未变）
docs/evidence/CMD-009/window/         7 × png + 1 × mp4 + godot-window-run.log
docs/evidence/CMD-009/logs/           6 × 工具日志 + tool-versions.txt
docs/motion/ACT-007/                  3 份文档 + probe/*.json
```

哈希：`docs/motion/ACT-007/probe/asset_hashes.json`
（r7 / r8 GLB / r8 .blend 三方 sha256，并核对 r7 与 ACT-006 基线一致）

## 五、新增 / 修改的工具

| 文件 | 作用 |
|---|---|
| `tools/motion/verify_blend_sources.py` | Blender 独立进程重开 .blend 验收（8 项 × 18 角色）+ 从 .blend 重导出 |
| `tools/motion/hash_manifest.py` | r7/r8 GLB + .blend 的 sha256 清单，核对 r7 未改动 |
| `tools/motion/capture_window_run.sh` | Godot **窗口**模式截图 + `--write-movie` 录屏，并把 `[ENV]` 留档 |
| `tools/motion/build_r8_death.py` | 新增 `save_blend()`：导出 GLB 后把同一份场景存成 .blend |
| `godot/motion/hero_action_stage.gd` | 新增 `_print_environment()`（DisplayServer/GPU/窗口尺寸）与 `--quit-after` |
| `docs/evidence/.gdignore` | 让 Godot 不再把证据截图当资源导入 |

## 六、未做的事（不算通过）

- Blender **GUI 人工**摆姿势：未做（background 模式脚本编辑，产物真实可再编辑）
- 武器 mesh 真挂 `weapon.R`：未做，只有挂点骨
- 动作接入玩法：未做
- 倒地过程逐帧穿地检查：未做（只验末帧贴地）
- 渲染器、发布、tag：均未动

## 七、给下一阶段的建议

1. **武器实挂**：`assets/releases/ART-002/r6/source/weapons_and_props.blend` 里已有武器资产，
   挂到 `weapon.R` 后需在窗口里再跑一遍，确认挥击时武器不脱手。
2. **动作接玩法**：网页战斗与 Godot 玩法都还没调用五动作，这是当前最大缺口。
3. 若需要「Blender GUI 人工 K 帧」级别的表演质量，death 目前只是 4 个姿态的程序化关键帧，
   需要美术介入重做。
