# ACT-007 · Godot 导入 + **窗口**运行验证场景

## 1. 场景路径

| 项 | 路径 |
|---|---|
| 场景 | `res://godot/motion/hero_action_stage.tscn` |
| 脚本 | `res://godot/motion/hero_action_stage.gd` |
| 磁盘绝对路径 | `<仓库>/shuihu-game/godot/motion/hero_action_stage.tscn` |
| 默认模型 | `res://assets/releases/ART-002/r8/models/hero005.glb` |
| 可换模型 | `-- --model res://assets/releases/ART-002/r8/models/<hero>.glb` |

打开方式（双击场景在 Godot 编辑器里打开，或用命令行直接跑）：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/motion/hero_action_stage.tscn
```

打开后自动循环 `idle → walk → attack → hit → death`，HUD 实时显示当前动作、原生时长、
**实测命中毫秒**与收招总时长。

## 2. 导入（真实执行）

```bash
bash tools/godot-import.sh
# → 退出码 0；"副本产物：899 个 .import，1798 个导入缓存"
#   拷回后原工程：899 个 .import，1806 个导入缓存
```

- 完整日志：`docs/evidence/CMD-009/logs/godot-import.log`
- 导入脚本会先把工程 APFS clone 到 `mktemp` 独立目录再导入（避免污染原工程），
  路径护栏由 `tools/lib/import-work-guard.sh` + 33 项哨兵测试保护。
- 本轮顺手在 `docs/evidence/.gdignore` 加了忽略标记，Godot 不再把证据截图当资源扫
  （此前每次导入都会为 127 张证据 PNG 生成 `.import` 缓存）。

## 3. 窗口运行：怎么证明「不是 headless」

场景脚本启动时打印一段 `[ENV]`，其中最关键的是 Godot 自报的 `DisplayServer.get_name()`：
**headless 时为 `headless`，开真窗口时为 `macOS`**。

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/motion/hero_action_stage.tscn -- --quit-after 4
```

实际输出（退出码 0）：

```
OpenGL API 4.1 Metal - 91.7 - Compatibility - Using Device: Apple - Apple M6
[ENV] {"cmdline_args":["res://godot/motion/hero_action_stage.tscn"],
       "display_server":"macOS",
       "godot_version":"4.7.2-stable (official)",
       "gpu_adapter":"Apple M6",
       "pid":39838,
       "rendering_method":"gl_compatibility",
       "screen_count":1,
       "user_args":["--quit-after","4"],
       "window_position":"(320, 155)",
       "window_size":"(1280, 720)"}
[ENV] 窗口保持 4.0s 后自动退出
```

逐项含义：

| 字段 | 值 | 说明 |
|---|---|---|
| `display_server` | `macOS` | 真窗口；headless 跑会是 `headless` |
| `gpu_adapter` | `Apple M6` | 真实 GPU，由 `RenderingServer.get_video_adapter_name()` 读取 |
| `window_size` / `window_position` | `(1280,720)` / `(320,155)` | 桌面上的实际窗口矩形 |
| `rendering_method` | `gl_compatibility` | 项目渲染器仍是 gl_compatibility，**未切 Forward+** |
| `pid` | 39838 等 | 每次运行不同，说明是真实起的进程 |

`--quit-after` 是本阶段给场景新增的参数：让窗口保持指定秒数后自行 `quit(0)`，
这样既能看到画面，又不会一直挂在桌面上。

顺带说明：CMD-007/CMD-008 的截图脚本 `capture_godot_stage.sh` 里本来就没有 `--headless`
（用的是 `--rendering-driver opengl3`），那些截图同样是窗口渲染产物；
只是当时没把环境信息留档，本阶段补上了。

## 4. 引擎内录屏（Godot `--write-movie` 输出，**不是操作系统实屏录制**）

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path . \
    --write-movie docs/evidence/CMD-009/window/hero005-window-movie.avi --fixed-fps 30 \
    res://godot/motion/hero_action_stage.tscn --rendering-driver opengl3 --resolution 1280x720 \
    -- --model res://assets/releases/ART-002/r8/models/hero005.glb --quit-after 14
# → 退出码 0
```

`--write-movie` 走的是 Godot 自己的渲染管线出片（不是系统屏幕录制），产物参数：

| 项 | 值 |
|---|---|
| 原始 | MJPEG / 1280×720 / 30fps / 14.03s / 13,726,714 字节 |
| 转码后 | `hero005-window-cycle.mp4`，H.264 / 1280×720 / 14.03s / 690,672 字节 |

转码只改封装与编码，不改内容：`ffmpeg -i <avi> -c:v libx264 -pix_fmt yuv420p -crf 23 -an`。

## 5. 窗口截图（7 张，均带 HUD）

```bash
bash tools/motion/capture_window_run.sh          # HERO=hero013 可换角色
```

| 文件 | 时刻 |
|---|---|
| `hero005-idle-400ms.png` | idle 400ms |
| `hero005-walk-500ms.png` | walk 500ms |
| `hero005-attack-impact-452ms.png` | attack **452ms（实测命中）** |
| `hero005-attack-recovery-1110ms.png` | attack 1110ms（收招完成） |
| `hero005-hit-impact-4ms.png` | hit 4ms |
| `hero005-death-800ms.png` | death 800ms |
| `hero005-death-end-1583ms.png` | death 1583ms（末帧，平躺贴地） |

HUD 上直接读得出的实测数字（截图里就有，不是文档写的）：

```
动作: attack 片段: attack
原生时长: 1000.0 ms
实测命中: 452.0 ms (目标 458 ms, 偏差 -6.0 ms)
收招尾保持: 1100.0 ms → 总时长 1110.0 ms (目标 1110 ms)
```

## 6. 运行时断言（回归）

```bash
bash tools/godot-r8-all-test.sh     # → 342/342 PASS，退出码 0
bash tools/godot-motion-test.sh     # → hero005 单角色 25/25
```

完整日志：`docs/evidence/CMD-009/logs/godot-r8-all-test.log`。
断言是逐个角色在 Godot 运行时真实加载 GLB、真实切五个动作跑出来的，不读预算好的结果文件。
