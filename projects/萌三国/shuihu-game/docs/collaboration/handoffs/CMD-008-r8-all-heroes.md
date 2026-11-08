# 交接单 · CMD-008 其余 17 角色补 r8（含 hero005 贴地修正）

- 任务 ID：CMD-008（动作组 ACT-006）
- 负责人 / 接收人：主程序 A → 指挥官
- 状态：**READY_FOR_REVIEW**
- 基线提交：`a924c2a`（CMD-007 r1 复测）
- 目标：把 r8（原生 death + `weapon.R` 挂点）从 hero005 单角色扩到**全部 18 个角色**，
  旧版本 r7 一字节不动；顺带修掉 ACT-005 遗留的「death 末帧半身入地」缺陷。
- 未做（明确）：**未发布、未打 tag、未切渲染器、未接玩法、未真挂武器**。

## 1. 允许修改 / 实际修改的文件

| 类别 | 文件 |
|---|---|
| 新资产 | `assets/releases/ART-002/r8/models/` 下 17 个新 GLB + 17 份 `build_log_<hero>.json`；`hero005.glb` 与 `build_log.json` 被**重建/覆盖**（贴地修正） |
| 构建脚本 | `tools/motion/build_r8_death.py`（参数化 + 自动贴地）、`tools/motion/snapshot_assets.py`（新）、`tools/motion/verify_r8_all.py`（新）、`tools/motion/verify_ground.py`（新） |
| 测试/采集 | `godot/tests/r8_all_heroes_test.gd`（新）、`tools/godot-r8-all-test.sh`（新）、`tools/motion/capture_r8_all.sh`（新） |
| 场景 | `godot/motion/hero_action_stage.gd`：新增 `--model` 参数（不改默认行为） |
| 文档 | `docs/motion/ACT-006/*`（3 份）、`docs/evidence/CMD-008/**`、本交接单、README |
| 就地补正 | `docs/motion/ACT-005/01|02|03`、`docs/collaboration/handoffs/CMD-007-motion-integration.md`、`docs/evidence/CMD-007/README.md`（贴地结论与 sha 已变） |
| 重拍证据 | `docs/evidence/CMD-007/motion/` 的 11 张截图、`frames/attack`(28)、`frames/death`(32)、2 段 mp4 |
| **未改** | `assets/releases/ART-002/r7/**`（逐文件 sha256 比对未变）、`game.js`、`journey.js`、`data/**`、`bgm.js`、`audio-sfx.js`、`project.godot` |

他人未提交的改动（`agents.md`、`linchong-cutout.blend`、`CHAR-108.md`、`tavern-ui.js`、`tavern-motion.css`）本轮未触碰、未提交。

## 2. 存档、数值和依赖变化

- **存档**：无变化（没碰网页版任何逻辑）。
- **默认音乐**：未改动。
- **资产**：r8 从 1 个角色扩到 18 个；hero005 的 sha256 由 `c7fce1cb1af39ea9` 变为 `257c261975e403dd`。
- **依赖**：Blender 5.2.2、Godot 4.7.2、ffmpeg（拼图/录屏）。

## 3. 关键结论

1. **17 个角色的骨架与片段结构完全同构**（同样 11 根骨、同样 4 个片段），可以复用一个 death 配方；
   但 `hero006/013/014` 的 `idle=1958.3ms`、`hit=1000ms` 与其他人不同，**复核必须逐角色取基线**。
2. **贴地不能固定**。ACT-005 的 0.1 让 hero005 末帧沉到 −0.5802（半身入地）；原因是倾斜绕脚底画弧，
   需要**上抬**而不是下沉。改为按包围盒线性求解后，18 个角色末帧 minZ 全部 0.0003。
3. 求解出的 sink 只有两档：−0.4808 / −0.4592，与身高和枢轴对应，可解释。

## 4. 测试命令 / 退出码 / 结果

| 命令 | 退出码 | 结果 | 日志/明细 |
|---|---|---|---|
| `python3 tools/motion/snapshot_assets.py` | 0 | 18 个 r7 基线 | `docs/motion/ACT-006/probe/r7_baseline.json` |
| `Blender -b -P tools/motion/build_r8_death.py -- --heroes ...` | 0 | **17/17 成功** | `docs/motion/ACT-006/probe/r8_batch_build.json` |
| `python3 tools/motion/verify_r8_all.py` | 0 | **252/252**，`R8_ALL_OK` | `docs/motion/ACT-006/probe/r8_verify_all.json` |
| `Blender -b -P tools/motion/verify_ground.py` | 0 | **18/18 贴地**，`GROUND_OK` | `docs/motion/ACT-006/probe/r8_ground.json` |
| `bash tools/godot-r8-all-test.sh` | 0 | **342/342**，`R8_ALL_HEROES_OK` | `docs/evidence/CMD-008-godot-all.log` |
| `bash tools/motion/capture_r8_all.sh` | 0 | 21 张实拍 + 1 张拼图 | `docs/evidence/CMD-008/motion/` |
| `./tools/run-tests.sh` | 0 | 哨兵 33/33 + 单元 173/173 | 终端 |
| `python3 tools/motion/verify_r8.py` | 0 | hero005 单角色 10/10（ACT-005 脚本仍可用） | 终端 |

## 5. 证据路径

| 文件 | 内容 |
|---|---|
| `docs/evidence/CMD-008/motion/hero0XX-death-end.png` | 18 个角色的死亡末帧实拍（Godot 运行时，1583ms） |
| `docs/evidence/CMD-008/motion/contact-sheet-death.png` | 18 格拼图（6×3），一眼看完全部躺下且贴地 |
| `docs/evidence/CMD-008/motion/hero0XX-idle-400ms.png` | 3 个代表角色待机（hero002/013/024） |
| `docs/evidence/CMD-008-godot-all.log` | 342 项运行时断言完整输出 |
| `docs/evidence/CMD-007/motion/*` | hero005 五动作证据（已按新资产重拍） |

## 6. 逐项验收

| 条件 | 操作 | 预期 | 实际 | 结论 |
|---|---|---|---|---|
| 其余 17 角色补原生 death | 批量构建 | 17/17，≈1600ms | 1583.3ms ×18 | 通过 |
| 保留旧版本 | 比对 r7 基线 | 字节/sha 未变 | 18/18 PASS | 通过 |
| 必要武器挂点 | 结构复核 | `weapon.R`←`hand.R`，属 joint | 18/18 PASS | 通过 |
| 既有片段时长不变 | 逐角色对基线 | 与各角色 r7 一致 | 18/18 PASS | 通过 |
| death 末帧贴地 | 几何复核 | \|minZ\|≤0.05 | 0.0003 ×18 | 通过 |
| 运行时可加载可切换 | Godot 断言 | 5 动作可切 | 342/342 | 通过 |
| 未接玩法 / 未发布 / 未打 tag / 未切渲染器 | 检查 | 均未发生 | 均未发生 | 通过 |

## 7. 已知问题与尚未检查项（未测不算通过）

1. **动作仍未接入玩法**：网页战斗、Godot 玩法都没调用这套动作。
2. **武器没真挂**：只有挂点骨，没有武器 mesh。
3. **death 是程序构造的 4 姿态关键帧**，倒地弧线偏直，需美术复核。
4. **只判末帧贴地**，倒地过程中是否穿地未逐帧检查。
5. **未做真机、未切 Forward+、未做美术主观验收**。
6. `hero006/013/014` 的 `hit=1000ms`、`idle=1958.3ms` 与其他人不同的原因未追查（本轮只保留原值）。
7. **hero005 的 sha 已变**：任何按旧 sha 缓存/校验的下游需要重新取。

## 8. 回滚方式

```sh
git revert <本轮提交>
```

不执行 `reset --hard`、不清空工作目录。r7 未动，若只想回退 hero005 可从本提交父版本恢复 `r8/models/hero005.glb`。
