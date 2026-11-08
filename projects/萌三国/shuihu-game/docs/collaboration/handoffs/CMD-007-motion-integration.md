# 交接单 · CMD-007 一角色五动作实际接入

- 任务 ID / 修订号：CMD-007（含动作组 ACT-005、剧情复核 CH-003、音乐行为记录）
- 负责人 / 接收人：主程序 A → 指挥官
- 状态：**READY_FOR_REVIEW**
- 基线提交：`5cb9c5e`（CMD-006 r3）
- 目标：把「一角色五动作」从离线帧预览推进为**Godot 运行时真实接入**；动作组在新资产版本补原生 death 与武器挂点并保留旧版本；
  剧情导演复核首章触发/胜败/跳过/重入分支；A 记录音乐进入退出战斗与静音恢复的实际行为。
- 未做（明确）：**未发布、未打 tag、未切渲染器（仍 `gl_compatibility`）、未扩章节**。

## 1. 允许修改 / 实际修改的文件

| 类别 | 文件 |
|---|---|
| 新资产（新增目录） | `assets/releases/ART-002/r8/models/hero005.glb`、`build_log.json` |
| 资产脚本 | `tools/motion/build_r8_death.py`、`tools/motion/verify_r8.py`、`tools/motion/capture_godot_stage.sh` |
| Godot 场景/测试 | `godot/motion/hero_action_stage.gd`、`hero_action_stage.tscn`、`godot/tests/motion_action_test.gd` |
| 测试脚本 | `tests/ch-003-branch-browser.mjs`、`tests/audio-behavior-browser.mjs` |
| 工具 | `tools/godot-motion-test.sh` |
| 文档 | `docs/motion/ACT-005/*`（3 份）、`docs/content/CH-003/*`（4 份）、`docs/evidence/CMD-007/**`、本交接单、README |
| **未改** | `assets/releases/ART-002/r7/**`（字节与 sha256 实测未变）、`game.js`、`journey.js`、`data/**`、`bgm.js`、`audio-sfx.js`、`project.godot`、`tests/ch-002-*` |

他人未提交的改动（`agents.md`、`linchong-cutout.blend`、`CHAR-108.md`、`tavern-ui.js`、`tavern-motion.css`）本轮未触碰、未提交。

## 2. 存档、数值和依赖变化

- **存档**：无变化（未改 `SAVE_KEY`、未加字段）。
- **默认音乐**：未改动，仍是 `assets/releases/CHAR-108/audio/liangshan_city.mp3` / `battle_theme.mp3`。
- **依赖**：Godot 4.7.2、Blender 5.2.2、ffmpeg（仅合成录屏用）；浏览器脚本依赖 playwright，均为可选环境变量注入，无个人绝对路径入库。
- **导入参数**：`assets/releases/ART-002/r8/models/hero005.glb.import` 显式设置
  `animation/remove_immutable_tracks=false`、`animation/fps=24`。理由见 ACT-005 验收文档第 2 节。

## 3. 交付物

### 3.1 可直接打开的场景

```sh
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/motion/hero_action_stage.tscn
```

自动循环 idle → walk → attack → hit → death；HUD 显示动作名、原生时长、**实测命中 ms 与偏差**、收尾保持与总时长。
可用 `-- --action attack --at-ms 452 --shot <png>` 精准定格截图，`-- --probe` 打印全部实测 JSON。

### 3.2 新资产（r8）

| 项 | r7 | r8 |
|---|---|---|
| clips | attack/hit/idle/walk | attack/**death**/hit/idle/walk |
| death | 无 | **原生 1583.3ms**（目标 1600ms，24fps 量化） |
| 武器挂点 | 无 | **`weapon.R`（父 `hand.R`，属 skin joint）** |
| 旧版本 | — | r7 未改动（sha256 `7ac9ec719ce73a8d` 实测一致） |

### 3.3 实测时点（由实际片段算出，非照抄文档）

| 项 | 值 | 来源 |
|---|---|---|
| attack 命中 | **452.0 ms**（目标 458，偏差 −6.0ms） | 运行时按 8ms 步长 seek，读 `hand.R` 世界姿态的角速度+线速度归一化合成峰值（126 采样点） |
| 角速度峰值时刻 | 428.0 ms | 同上 |
| 线速度峰值时刻 | 452.0 ms | 同上 |
| attack 原生时长 | 1000.0 ms | `Animation.length` |
| 收招尾保持 | 110.0 ms | 1110 − 1000 |
| 收招总时长 | **1110.0 ms** | 原生 + 尾保持 |
| 收招段 | 658.0 ms | 1110 − 452 |
| hit 原生时长 | 750.0 ms | 实测 |
| death 原生时长 | 1583.3 ms | 实测 |

## 4. 测试命令 / 退出码 / 结果

| 命令 | 退出码 | 结果 | 日志 |
|---|---|---|---|
| `python3 tools/motion/verify_r8.py` | 0 | 10 项全过 | `docs/motion/ACT-005/probe/r8_hero005_probe.json` |
| `./tools/godot-motion-test.sh` | 0 | **25 项全过**，`MOTION_ACTION_OK` | `docs/evidence/CMD-007-motion-test.log` |
| `node tests/ch-003-branch-browser.mjs` | 0 | **22 项全过**，`CH003_BRANCH_OK`，pageError 0 | `docs/evidence/CMD-007-story-run.log` |
| `node tests/audio-behavior-browser.mjs` | 0 | **13 项全过**，`AUDIO_BEHAVIOR_OK` | `docs/evidence/CMD-007-audio-run.log` |
| `./tools/motion/capture_godot_stage.sh` | 0 | 11 张截图 + 2 段帧序列 + 2 个 mp4 | `docs/evidence/CMD-007/motion/` |
| `./tools/run-tests.sh` | 0 | 哨兵 33/33 + 单元 173/173 | 见终端 |

## 5. 截图 / 录像路径（视口 1280×720，均为运行时真实渲染）

| 文件 | 内容 |
|---|---|
| `docs/evidence/CMD-007/motion/01-idle-400ms.png` / `02-idle-1200ms.png` | 待机 |
| `03-walk-500ms.png` | 行走 |
| `04-attack-impact-452ms.png` | **命中时刻（452ms）** |
| `05-attack-native-end-1000ms.png` | 原生片段末端 |
| `06-attack-recovery-1110ms.png` | **收招结束（1110ms）** |
| `07-hit-impact-4ms.png` / `08-hit-375ms.png` | 受击 |
| `09-death-0ms.png` / `10-death-800ms.png` / `11-death-end-1583ms.png` | 死亡（原生片段；**这三张已在 ACT-006 重拍**：原图末帧半身入地 −0.58，修正后 0.00） |
| `motion/frames/attack/*.png`（28 帧）、`motion/frames/death/*.png`（32 帧） | 逐帧序列 |
| `motion/attack-roll.mp4`（1.167s）、`motion/death-roll.mp4`（1.334s） | 录屏（逐帧截图 + ffmpeg 合成，24fps，无音频） |
| `docs/evidence/CMD-007/story/01`–`07` | 剧情五个分支：开场/跳过/胜利/重入/重复通关/失败/失败重打 |
| `docs/evidence/CMD-007/audio/01`–`06` | 主城曲 / 战斗曲 / 返回 / 静音 / 恢复 / 刷新后 |

## 6. 逐项验收

| 条件 | 操作步骤 | 预期 | 实际 | 证据 | 结论 |
|---|---|---|---|---|---|
| 新资产补原生 death | `verify_r8.py` | death 存在、时长≈1600ms | 1583.3ms | 10/10 PASS | 通过 |
| 保留旧版本 | 比对 r7 字节与 sha256 | 未变 | 未变 | verify 输出 | 通过 |
| 必要武器挂点 | 探节点名与父级 | 存在、父级 hand.R | `weapon.R` ← `hand.R` | probe JSON | 通过 |
| Godot 接入 5 动作 | headless 断言 | 5 个 clip 可切换 | 5/5 切换成功 | 25/25 PASS | 通过 |
| 命中 458ms 由实际片段验证 | 运行时采样 | 实测落在 458±42ms | 452.0ms（−6.0） | probe JSON | 通过 |
| 收招 1110ms 由实际片段验证 | 实测原生 + 尾保持 | 1000+110=1110 | 1110.0ms | 断言 + HUD | 通过 |
| 非仅离线帧预览 | 交付物形态 | 运行时场景 + 截图/录屏 | 有 `.tscn` 可打开 | 场景 + mp4 | 通过 |
| 剧情四分支复核 | 浏览器实测 | 触发/胜/败/跳过/重入均正确 | 22/22 | branch-check.json | 通过 |
| 不扩章节 | 检查改动范围 | 只动第 1 关 | 未改 `data/journey.js` | git diff | 通过 |
| 音乐行为记录 | 浏览器实测 | 进/出战斗切曲、静音恢复 | 13/13 | audio-behavior.json | 通过 |
| 保留默认曲 | 检查 `bgm.js` | 未改 | 未改 | git diff | 通过 |
| 未发布/未打 tag/未切渲染器 | 检查 | 均未发生 | 均未发生 | `project.godot` 仍 `gl_compatibility` | 通过 |

## 7. 已知问题与尚未检查项（未测不算通过）

1. **只接入 hero005 一个角色**；其余 17 个 GLB 仍是 r7（无 death / 无挂点）。
2. **动作尚未接入游戏**：本轮的截图/录屏是 Godot 独立验证场景对 r8 资产的真实播放，
   网页版战斗与 Godot 玩法**都还没调用这套动作**。ACT-004 的"离线预览 vs 游戏接入"区别依然成立，
   本轮只是把中间那层（运行时播放与实测）补上了。
3. **武器没真挂**：`weapon.R` 只验证节点与父级，没挂武器 mesh。
4. **death 为程序构造关键帧**（4 个姿态），不是美术逐帧 K；倒地弧线偏直，需美术复核。
5. **attack 动作幅度偏小**（资产既有设计），视觉挥击感弱，建议美术加深。
6. **未做手机真机、未切 Forward+、未做美术与音乐主观验收**。
7. **录屏不是屏幕录制**，是逐帧截图合成的 24fps mp4，无音频。
8. 剧情复核发现 **2 个 P1、4 个 P2**（见 `docs/content/CH-003/03_findings_and_fixes.md`），
   本轮按要求**只复核不改**，是否修由指挥官决定。其中"跳过/重入每次重播 5 句开场"与"失败也扣满体力"最值得先定。
9. `docs/evidence/**` 下的 png 会被 Godot 扫描生成 `.import`（已 gitignore），不影响仓库。

## 8. 回滚方式

```sh
git revert <本轮提交>
```

不执行 `reset --hard`、不清空工作目录。
