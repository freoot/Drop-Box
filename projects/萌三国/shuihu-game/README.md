# 是好汉就上山

一款可在浏览器运行的原创 Q 版水浒战棋原型。主城采用原创梁山湖寨绘景与可点击建筑，战斗采用木台沙盘、8×4 格子和两侧布阵。页面、角色造型、文案和场景图为本作重新设计。

## 启动

无需安装依赖或构建工具。游戏专用目录为 `shuihu-game/`，以下命令均在此目录执行。

在游戏目录启动静态文件服务：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

浏览器打开 <http://127.0.0.1:8765/>。也可直接打开 `index.html`，但部分浏览器对本地文件存档和页面资源有限制，因此推荐使用静态服务。

## 快速体验

手动名将技：点技能按钮，再点合法目标，金色格显示影响范围，提示列出受影响单位；再次点同一目标才释放。点另一目标可重新预览，点技能按钮可取消。预览不消耗行动或技能次数。

1. 在梁山主城点「前往征战」，进入 2.5D 山河路线图。选择地点后先观看年代、地点与人物冲突开场，再进入布阵；观看或返回剧情不会扣军令，进入战场时普通扣 2 点、精英扣 5 点。
2. 进入战场先自由布阵：选中好汉，点左侧三列蓝格放置；点已占用格的底座可互换位置。点「布阵完成 · 开战」后，开场被动和阵容合击才会触发。
3. 手动战斗时选中好汉，点绿色格预览路线，再点同一目的格确认移动；出手前可点「撤回走位」，原格须仍为空。点射程内敌人普攻；点「名将技」后可选技能范围内的敌人或友军。点「结束回合」交给敌军行动。
4. 点「自动」可让队伍行动并自动结算，布阵阶段点自动会直接开战；战斗中可暂停。「速度」可在 1×、2×、3× 间切换。胜利后领取铜钱、粮草、装备碎片，并解锁后续章节。
5. 到「一百单八将」查看角色、技能与阵容；进入「装备工坊」可为选中好汉穿戴、卸下、更换及强化职业装备。聚义酒肆有免费招募和明确概率，也能从将册直接用铜钱定向招募。
6. 刷新页面会从当前浏览器恢复进度。「玩法 → 本地进度 → 重置本地存档」可清空并重新开始。

体力上限 100，普通征战消耗 2 点、精英 5 点；军令可随时在征战页用 20 粮草补满，也会在本机次日恢复。游戏没有真钱支付和联网竞技。

沙盘保持 16:9 比例，避免手机竖屏拉长战场；窄屏会重排功能按钮与战斗控制区。点「放大沙盘」后可在手机上滑动查看战场，点「全景」恢复完整画面；桌面可通过滚动查看放大后的区域。横屏更便于同时观察双方站位。

## 人物与动作样板

从「玩法 → 好汉造型室」进入，或打开 [好汉造型室](http://127.0.0.1:8765/character-studio.html)。可切换十二位好汉（林冲、花荣、吴用、宋江、公孙胜、鲁智深、武松、李逵、张顺、燕青、朱武、扈三娘），查看待机、移动、普通攻击、名将技、受击和倒地，也可连续演示或切换速度。此页不读写游戏存档。

- 已接入 **16 张专属立绘**：12 位好汉（宋江、吴用、公孙胜、林冲、花荣、李逵、鲁智深、武松、燕青、扈三娘、张顺、朱武）、3 类普通敌军和高俅。
- 上述 12 位好汉均已换用 Q 版新立绘与七帧动作条（`assets/q/*-sheet.png`，每帧 704×512、共用地面线）：待机、两帧步行、出招、名将技、受击、独立倒地。旧四姿态图集与主资产保留为回退（`fallbackPortrait`、`actions`）。原始批准图保存在 `assets/q/*.jpg`。
- 林冲、花荣、李逵的待机立绘（`assets/tavern/rest/*.png`）已接入 `data/portraits.js` 并在战斗中作为待机画面叠加渲染。
- 当前动作由关键姿态与程序位移、起伏、前冲、后仰组成；技能复用出招姿态并叠加光效，造型室的倒地复用受击姿态旋转淡出。尚无连续走路帧、转身、独立倒地原画或三维骨骼模型。
- 其余 96 位好汉和祝朝奉、史文恭、方腊仍使用示意造型，角色页会标明制作状态。

专属立绘、动作图集与场景使用 Codex 内置图像生成工具制作；提示记录见 `ART_PROMPTS.md` 和 `assets/portraits/prompts.json`，实际启用资源以 `data/portraits.js` 为准。

林冲、花荣、吴用的立绘另外经过 `generate2dsprite` 主资产流程，统一到 1024×1024 画布、788 像素人物高度和 138 像素顶部基线，文件及来源记录位于 `assets/masters/`。三份主资产检查均为 0 个警告。

## Godot 迁移入口

根目录的 `project.godot` 是 Godot 4.7.2 兼容渲染项目，首场景为 `godot/journey_map/journey_map.tscn`。它已能加载同一张山河地图并建立六个可点击地点，作为后续 App 版迁移入口；当前完整战斗、养成和存档仍以网页版为准。

本机已安装标准版 Godot 到 `/Applications/Godot.app`，并将 Codex 的 `godotmcp` 配置指向该版本。MCP 工具需要重启 Codex 后才会出现在当前对话的工具列表里。

## 当前范围

- 梁山主城、征战章节、普通/精英难度、酒馆招募、108 将查看和编队、技能切换与升级、每名好汉独立配装、职业装备强化/进阶。
- 8×4 手动和自动战棋战斗、开战前布阵、路径预览与移动撤回、1×/2×/3× 速度、职业克制、移动寻路、射程、普攻、治疗/护盾/伤害技能、状态效果、敌方 AI、胜负结算和本地奖励。
- 六段主线、四名有专属机制的章节首领，以及试练塔、本地模拟擂台、三类主题活动、黑市、每日资源领取。
- 存档使用浏览器 `localStorage`，无需账号、服务器或真实支付。

本原型完整收录 108 位角色的可玩数据、数值、招募方式、材料、被动、两项主动技、羁绊和高品质特性。初始五将与六位章节固定同伴已有独立命名的两项主动技；其余角色的战斗效果目前按职业技能组生成，角色记录含 `designStatus` 说明待深化项。活动副本当前共用战棋胜负流程，专属护送、探索目标可在后续迭代。

## 验证

安装 Node.js 20.11 或更新版本后，在项目目录运行：

```sh
node --check game.js
node --check data/shuihu.js
node --check data/portraits.js
node --check character-studio.js
node --test tests/*.test.mjs
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://godot/tests/smoke_test.gd
```

测试覆盖 108 将与 Boss 数据、六地点征战地图、剧情开场的军令结算、Godot 场景、部署范围与开场效果只触发一次、路线预览和撤回、手动走位和射程、职业克制、五人同职业部署、Boss 护阵与半血触发、灼烧结算、装备更换与存档、招募资源、自动战斗胜利后的进度恢复，首章单关的开场／胜利／失败三段台词与存档回归，以及专属图片资源格式和造型室动作切换。

## 一键脚本

日常操作建议直接用 `tools/` 下的脚本，参数与行为一致，避免手敲命令出错：

| 脚本 | 作用 | 常用参数 |
|---|---|---|
| `tools/serve.sh` | 起本地静态服务（默认 8765） | `PORT=9000 tools/serve.sh` |
| `tools/run-tests.sh` | 语法检查 + 导入脚本路径护栏哨兵测试 + 全量单元测试 | — |
| `tools/godot-import.sh` | Godot 资源导入（在本次新建的独立副本内跑，产物拷回） | `GODOT=…`、`IMPORT_WORK=<父目录>`、`--no-copy-back`、`--keep-work` |
| `tools/godot-smoke.sh` | Godot 冒烟，校验 exit 0 且输出 `GODOT_SMOKE_OK` | `SMOKE_TIMES=3 tools/godot-smoke.sh` |
| `tools/art-002-capture.sh` | 生成 ART-002 r7 批次证据（headless.json + runtime.json + 动作实拍图） | `BATCH=b1`、`--headless-only` |
| `tools/godot-motion-test.sh` | 一角色五动作运行时断言（5 clip / death 原生 / 挂点 / 实测命中与收招） | `GODOT=…` |
| `tools/godot-r8-all-test.sh` | **18 个角色**逐个加载并断言五动作可播（342 项） | `GODOT=…` |
| `tools/motion/capture_godot_stage.sh` | 采五动作运行时截图、序列帧并合成录屏 | `SHOTS_ONLY=1` |
| `tools/motion/capture_r8_all.sh` | 逐角色截死亡末帧 + 拼图 | `GODOT=…` |
| `tools/motion/snapshot_assets.py` | 生成 r7 基线（字节/sha/clip 时长/骨骼） | `--release r7` |
| `tools/motion/verify_r8_all.py` | 18 个 r8 与基线逐角色比对（252 项断言） | `--out …` |
| `tools/motion/verify_ground.py` | 量导出 GLB 的 death 末帧离地（Blender 跑） | `--out …` |
| `tools/motion/verify_blend_sources.py` | **另起 Blender 进程**重开 18 个 .blend 验收（8 项×18）并从 .blend 重导出 | `--out …`、`--reexport-dir …` |
| `tools/motion/hash_manifest.py` | r7/r8 GLB + r8 .blend 的 sha256 清单，核对 r7 未改动 | `--out …` |
| `tools/motion/capture_window_run.sh` | Godot **窗口**模式截图 + `--write-movie` 录屏，留 `[ENV]` 环境日志 | `HERO=hero013`、`MOVIE=0` |
| `tools/motion/attach_weapon.py` | 把 hero005 现有武器顶点分离成独立网格并绑 `weapon.R`（不新增几何） | — |
| `tools/motion/fix_ground_penetration.py` | 逐帧贴地修正（武器顶点 +0.026 / death 用 root 补偿） | `--weapon-lift 0.026` |
| `tools/motion/verify_weapon_frames.py` | attack/death **逐帧**验证不脱手、不穿地 | `--blend …` |
| `tools/godot-battle-test.sh` | 可操作战斗流程测试（19 项，按键事件驱动） | `GODOT=…` |

Godot 可执行文件默认取 `/Applications/Godot.app/Contents/MacOS/Godot`，可用 `GODOT=…` 覆盖。

### 一角色五动作：可直接打开的场景

```sh
tools/godot-import.sh                                                  # 首次需要
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/motion/hero_action_stage.tscn
```

打开后自动循环 `idle → walk → attack → hit → death`，HUD 显示当前动作、原生时长、**实测命中毫秒与偏差**、收尾保持与总时长。
模型默认读 `assets/releases/ART-002/r8/models/hero005.glb`；**r8 已覆盖全部 18 个角色**（在 r7 基础上补了原生 `death`
片段与 `weapon.R` 挂点骨，r7 原样保留），用 `--model` 可切到任意角色：

```sh
$G --path . res://godot/motion/hero_action_stage.tscn -- \
   --model res://assets/releases/ART-002/r8/models/hero013.glb
```

命令行用法：

```sh
G=/Applications/Godot.app/Contents/MacOS/Godot
$G --path . res://godot/motion/hero_action_stage.tscn -- --probe                        # 打印实测 JSON
$G --path . res://godot/motion/hero_action_stage.tscn -- --action attack --at-ms 452 \
   --shot /abs/path/attack-452.png                                                      # 精准定格截图
$G --path . res://godot/motion/hero_action_stage.tscn -- --action death --shot-dir /abs/dir \
   --duration-ms 1583 --frames 32                                                       # 采序列帧
```

断言与实测口径见 `docs/motion/ACT-005/03_acceptance.md`：命中 **452.0ms**（目标 458，偏差 −6.0ms）、
收招 **1110ms**（原生 1000 + 尾保持 110），均由运行时按 8ms 步长采样 `hand.R` 世界姿态算出，不读预算好的结果文件。

### r8 全角色（ACT-006）

| 项 | 结论 |
|---|---|
| 覆盖 | **18/18** 角色都有原生 `death` + `weapon.R` 挂点；`r7/` 逐文件 sha256 未变 |
| death 时长 | 全部 **1583.3ms**（目标 1600，24fps 量化） |
| 既有片段 | `idle/walk/attack/hit` 时长逐角色与原值一致（含 `hero006/013/014` 的 1958.3 / 1000） |
| 贴地 | 18/18 末帧最低点 **0.0003**（ACT-005 的 hero005 曾为 −0.5802 半身入地，已修正） |
| 断言 | 结构 252 项 + 贴地 18 项 + 运行时 342 项，全部 PASS |

```sh
python3 tools/motion/snapshot_assets.py                       # 1. 固定 r7 基线
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b -P tools/motion/build_r8_death.py -- --heroes hero002,hero006,hero007,hero008,hero010,\
hero011,hero012,hero013,hero014,hero015,hero017,hero019,hero021,hero022,hero023,hero024,hero025 \
   --batch-log docs/motion/ACT-006/probe/r8_batch_build.json   # 2. 批量生成（默认自动贴地）
python3 tools/motion/verify_r8_all.py                          # 3. 结构复核
$B -b -P tools/motion/verify_ground.py                         # 4. 贴地复核（量导出文件）
bash tools/godot-r8-all-test.sh                                # 5. 运行时逐角色断言
bash tools/motion/capture_r8_all.sh                            # 6. 实拍截图
$B -b -P tools/motion/verify_blend_sources.py -- --out docs/motion/ACT-007/probe/blend_reopen.json \
   --reexport-dir /tmp/r8_from_blend                           # 7. 重开源工程验收
python3 tools/motion/hash_manifest.py                          # 8. 三方 sha256 清单
```

### 收藏向主线：武松打虎教学（CMD-013，当前主方向）

```sh
./play-tiger-tutorial.command        # 或直接双击 play-tiger-tutorial.command
bash tools/godot-tiger-test.sh      # 28 项断言
```

固定站位回合制，不走格子：点敌人选中目标 → 点「普攻」攒怒气 → 怒气 50 可放
**「虎影重击」**（武松出拳，猛虎虚影扑向目标）。流程是
**打虎教学 → 胜利必得武松 → 编队 → 携武松再战**，武松来自真实资产
`r6/models/wusong.glb`（hero-014）。

> 资产边界（CMD-014 更新）：武松的**拳击已是真实资产**——从 r6 真实 Blender 源另存
> `r10`，去掉双戒刀几何、新做无刀 `punch` 与 `tiger_shadow`（详见
> `docs/motion/ACT-009/01_wusong_punch.md`）。**虎也已是真实资产**——新建 `r11`
> Q 版猛虎（王字额纹 + 圆耳 + 环尾 + 躯干条纹 + 4 条动作），虎影用同一只虎的
> 半透明金色版（详见 `docs/motion/ACT-010/01_tiger_r11.md`）。
> 但两者都是**程序化生成的分件几何、非美术验收**，仍需美术同学接手打磨。

### 旧实时战斗（ACT-008 / CMD-010，保留）

```sh
G=/Applications/Godot.app/Contents/MacOS/Godot
$G --path . res://godot/battle/hero_battle_stage.tscn      # A/D 移动，J 攻击，R 重开
bash tools/godot-battle-test.sh                            # 19 项断言，按键事件驱动
```

用 r9 资产（hero005 的武器已从角色网格分离并绑到 `weapon.R`）驱动一场真实战斗：
移动走 `walk`、攻击播 `attack` 并在 **452ms** 结算伤害、被反击播 `hit`、血量归零播 `death`、
HUD 显示胜负、`R` 重开。原展示场景 `godot/motion/hero_action_stage.tscn` 保留未动。

逐帧验证（attack 25 帧 / death 40 帧）：武器脱手偏差 **7e-7**，武器与身体最低点均 ≥ **+0.002**。

### 源工程与窗口运行证据（ACT-007 / CMD-009）

r8 每个角色都有可再编辑的源工程 `assets/releases/ART-002/r8/source/<hero>.blend`
（18 份，合计 11,587,674 字节），与 `r8/models/<hero>.glb` 来自同一次 Blender 会话：
先导出 GLB，再把同一份场景存成 .blend。

```sh
bash tools/motion/capture_window_run.sh                        # Godot 真窗口：7 张截图 + 14s 录屏
```

验收判据不是「脚本说保存了」，而是**另起一个 Blender 进程**把 .blend 读回来检查（144/144 断言），
以及 Godot 自报的 `DisplayServer.get_name()`：开窗口时为 `macOS`，headless 时为 `headless`。
完整命令、版本、退出码与日志见 `docs/motion/ACT-007/03_acceptance.md` 和
`docs/evidence/CMD-009/README.md`。

文档：`docs/motion/ACT-006/01_r8_all_heroes.md`（批次与数据）、`02_ground_fit.md`（贴地求解与 ACT-005 补正）、
`03_acceptance.md`（复现命令与真实输出）。

> 关于导入参数：Godot 默认的 `animation/remove_immutable_tracks=true` 会把 `hand.R` / `weapon.R` 这类
> "局部恒定"的旋转轨道裁掉（导入后只剩 9/12 条旋转轨道），`animation/fps` 默认 30 也会重采样时长。
> 本机的 r8 `.import` 已改成 `false` + `24`，**但这不影响断言**——命中/收招是从 `Skeleton3D` 的**世界姿态**
> 按 8ms 采样算的，不依赖这两条局部轨道。`.import` 属导入产物、被 `.gitignore` 忽略，他人 clone 后
> 用默认参数也能跑通（实测过：默认参数下同样能测出命中时刻）。

### 首次 clone 后必做：跑一次导入

导入产物（`.godot/` 与各资源旁的 `*.import`）被仓库 `.gitignore` 忽略，**不会随 clone 带走**。因此新环境第一次跑 Godot 冒烟前必须先导入：

```sh
tools/godot-import.sh     # 约 2–4 分钟
tools/godot-smoke.sh      # 应输出 GODOT_SMOKE_OK
```

导入为什么要绕到副本里做：`assets/` 下有大量 `.blend`，Godot 4.7 的 Blender 场景导入器在 headless 下无法配置 Blender 路径，报错会**中止整轮 reimport**（不只是跳过 `.blend`）。脚本会在副本中排除 `.blend/.blend1` 并移除 `run/main_scene`，导入完成后只把产物拷回，原工程 `project.godot` 不被修改。详见 `docs/pipeline/05_import_notes.md`。

**副本目录的路径安全**：工作目录由 `tools/lib/import-work-guard.sh` 管理，规则是——
- 工作目录**始终**是本次 `mktemp` 新建的独占子目录，不由调用者指定；
- `IMPORT_WORK` 只作**父目录**（必须已存在且是真实目录，留空则用系统临时目录），脚本不会创建父目录；
- **绝不清空、绝不删除任何既有目录**；导入结束只清理本次新建的子目录，且校验目录内标记文件的一次性 token 与本次记录的物理路径一致（伪造标记无效）；
- 路径先做完整归一化（重复斜杠、`..`、`.`），再拒绝符号链接、原工程及其祖先/后代、受保护顶层路径（`/`、`/tmp`、`$HOME`、`/Users`、`/System` 等）。

回归测试见 `tools/tests/import-work-guard.test.sh`（哨兵文件保护测试，**33 项**，全程不做破坏性删除）。

已验证：清理 `.godot/` 与全部 `*.import/*.uid` 后重跑 `tools/godot-import.sh`，可从零重建出与当前工作区一致的产物，副本内冒烟输出 `GODOT_SMOKE_OK`。

### 浏览器端实证（真实操作 + 注入测试）

```sh
npm i -D playwright && npx playwright install chromium   # 工程不携带 node_modules，需自行安装
tools/serve.sh                                           # 另开一个终端起服务
node tests/ch-002-story-browser.mjs                      # 首章台词与真实战斗，截图写入 docs/evidence/CH-002/
node tests/ch-003-branch-browser.mjs                     # 首章五分支（开场/胜/败/跳过/重入），写入 docs/evidence/CMD-007/story/
node tests/audio-behavior-browser.mjs                    # 音乐进出战斗与静音恢复，写入 docs/evidence/CMD-007/audio/
```

- 已有别处的 playwright 安装时，可用 `PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs` 与
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/abs/path/to/chrome-headless-shell` 指向它；服务换端口时用 `BASE_URL=…`。
- 脚本区分两类用例：**真实操作**只用页面按钮完成（推进剧情 → 布阵完成 · 开战 → 自动战斗/结束回合 → 返回 → 刷新），
  **注入测试**用 `evaluate` 直接调 `finishBattle()`，只验证结算渲染，截图顶部带红色标注条。
  命名规则与截图清单见 `docs/evidence/README.md`。
- 任何 `pageerror` 都会让脚本以非零码退出。

### 音频试听

```sh
tools/serve.sh
# 打开 http://127.0.0.1:8765/shuihu-game/audio-audition.html
```

统一试听入口含当前默认曲 2 首与 AUDIO-002 候选曲 5 首。选择只写本页偏好，不更换游戏默认音乐。来源与授权登记见 `docs/audio/SOURCES_AND_LICENSES.md`。

## 文件

- `index.html`：网页入口。
- `game.js`、`game.css`：玩法逻辑与响应式界面。
- `data/shuihu.js`：108 将、羁绊、章节、首领、活动与经济数据。
- `data/portraits.js`：专属立绘、已启用动作图集及制作状态。
- `data/journey.js`、`journey.js`：六地点故事路线、剧情开场与征战地图交互。
- `project.godot`、`godot/journey_map/`：Godot 4.7.2 迁移入口与冒烟测试。
- `docs/GAMEPLAY_REVIEW.md`：玩法诊断、已实施调整和下一步优先级。
- `character-studio.html`、`character-studio.js`、`character-studio.css`：十二位代表好汉的独立动作预览页。
- `assets/portraits/`：人物图片、动作图集与生成提示记录，包含尚未启用的制作草稿。
- `assets/liangshan-city-painted.png`、`assets/liangshan-battlefield-painted.png`：本作原创绘景。矢量草图保留在同目录；生成提示见 `ART_PROMPTS.md`。
- `GAME_DESIGN.md`：世界观、战斗结算、成长、经济和当前边界。
- `tests/game.test.mjs`：无外部依赖的核心玩法测试。

`NewProject/` 是工作区内原有的独立 Cocos Creator 项目，保留作旧工程参考；它不是本作网页运行所需内容，其旧题材和资源没有被本原型复用。当前交付以网页端为准，尚未制作 Cocos 同步版、账号云存档、联网 PvP 或 App 封装。

## 本轮战斗与酒馆更新

主城点击“酒”字招牌进入酒肆。室内为原创生成背景，包含 L 型柜台和四张圆桌；已拥有角色沿中央通道做程序位移动画，点击掌柜打开招募。掌柜暂用程序示意造型，角色尚非连续步行动画。

好汉普攻及伤害技能、敌方普攻，每次命中独立判定 20% 暴击、1.5 倍伤害；首领机制和持续伤害不暴击。护盾和治疗不播放攻击特效。林冲技能射程两格，花荣箭雨两排三列，鲁智深震地目标周围八格（不含中心），公孙胜拥有十字雷击与全场风雨。精英战红色预警列在下一次敌方回合造成 18% 生命上限伤害，可提前移开。

本轮自动测试通过；浏览器视觉复查因自动审批服务额度限制未完成。

### 2026-10-17 动作与法术进度
公孙胜两种主动技已分别接入落雷与风雨效果（实际战斗可见）。林冲本地 Blender 工程已绑定 16 个原画部件，仍需关节补画、长枪和完整攻击动作制作，尚未替换游戏素材。本轮 Node 测试 77 项通过，画面未做浏览器验收。
# 首次进入与角色名字

首次进入会显示取名界面，支持 2—12 个中文、字母、数字及简单分隔符。点击主界面左上角名字可再次修改。旧存档首次补填名字时保留好汉、资源、装备与关卡进度。

主城地图铺满可视高度。手机竖屏可横向滑动查看两侧建筑；招牌与建筑一起移动。当前浏览器自动化不允许访问 `file://` 页面，因此本轮完成代码、存档和自动化测试检查，尚未完成该本地文件页面的视觉验收。
