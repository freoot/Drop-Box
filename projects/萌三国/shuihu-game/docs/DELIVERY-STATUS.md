# 当前版本交付清单（2026-10-29）

> 一句话：**Godot 侧只有 hero005 一个角色真正接入了可操作战斗**，
> 其余 17 个角色只有资产（含 r8 的 death 与挂点骨），没有接入任何玩法。
> CMD-011 的朝向判定**仍待独立键盘试玩验收**，本文不标「最终通过」。
>
> **2026-10-29 方向更新**：主线已从「实时左右对打」改为「收藏水浒人物」。
> 新增的收藏向闭环见 `docs/collaboration/handoffs/CMD-013-tiger-tutorial.md`
> （武松打虎教学 → 必得武松 → 编队 → 再战，入口 `play-tiger-tutorial.command`）。
> 本文件其余部分描述的是**旧实时战斗线**的状态，仍然有效。

---

## 一、怎么试玩（双击即可）

项目根目录下有 `play-battle.command`，**双击**会打开终端并启动 Godot 战斗场景。

```
A / ←    向左移动
D / →    向右移动
J / 空格  攻击（要面向敌人才打得中）
R        重开
```

命令行等价：

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game && ./play-battle.command
```

找不到 Godot 时，脚本会列出它找过的路径并给出安装/指定路径的办法，不会静默失败。
已实测两条分支：缺失路径退出码 1、正常启动退出码 0（`display_server=macOS`）。

---

## 二、源码

| 文件 | 行数 | 作用 | 状态 |
|---|---|---|---|
| `godot/battle/hero_battle_stage.gd` | 603 | 可操作战斗：状态机、朝向/扇形判定、HUD、演示 | 已接入 |
| `godot/battle/hero_battle_stage.tscn` | 6 | 战斗场景入口 | 已接入 |
| `godot/tests/battle_flow_test.gd` | 229 | 24 项按键驱动断言 | 已接入 |
| `godot/motion/hero_action_stage.gd` | 452 | 五动作展示场景（不参与战斗） | 仅展示 |
| `godot/tests/motion_action_test.gd` | — | hero005 五动作运行时断言 25 项 | 已接入 |
| `godot/tests/r8_all_heroes_test.gd` | — | 18 角色加载与五动作 342 项 | 资产验证 |
| `tools/motion/attach_weapon.py` | 287 | 分离武器并绑 `weapon.R` | 工具 |
| `tools/motion/fix_ground_penetration.py` | 197 | 逐帧贴地修正 | 工具 |
| `tools/motion/verify_weapon_frames.py` | 199 | 逐帧不脱手/不穿地验证 | 工具 |
| `tools/godot-battle-test.sh` | 23 | 战斗测试包装 | 工具 |
| `play-battle.command` | 97 | 双击启动入口 | 本单新增 |

---

## 三、资产：18 个角色 × 3 个版本

| 版本 | GLB | blend 源工程 | 内容 | 谁在用 |
|---|---|---|---|---|
| **r7** | 18 个 / 16.2 MB | 18 个 / 8.2 MB | 原始四动作（idle/walk/attack/hit） | 网页版 |
| **r8** | 18 个 / 16.1 MB | 18 个 / 11.1 MB | r7 + 原生 `death`（1583.3ms）+ `weapon.R` 挂点骨 | Godot 展示场景 |
| **r9** | **1 个 / 0.9 MB** | 1 个 / 0.6 MB | r8 + **武器从角色网格分离**并绑 `weapon.R` | Godot 战斗（仅 hero005） |

- r7 逐文件 sha256 与基线一致，**未改动**。
- r8 覆盖全部 18 个角色，但**武器仍并进角色网格**（只有挂点骨，没分离）。
- r9 只有 `hero005`。

### hero005 r9 武器（唯一真正挂接的）

| 项 | 数值 |
|---|---|
| 分离方式 | 从 `hero005_costume_and_body` 拆出 756 顶点（60 个连通分量） |
| 新增几何 | **0**（全部是现有顶点） |
| 绑定 | 顶点组 `weapon.R`，权重 1.0 |
| 角色网格 | 14409 → 13653 顶点 |
| 视觉一致性 | 分离前后世界坐标最大偏差 **6e-8** |
| 逐帧验证 | attack 25 帧 + death 40 帧：脱手偏差 **7e-7**，武器/身体最低点 ≥ **+0.002** |

---

## 四、剧情与音乐：只接在网页版，Godot 战斗里没有

| 模块 | 接入位置 | 状态 | 证据 |
|---|---|---|---|
| 剧情 CH-002 | **网页版**首章单关（`journey.js` + `game.js`） | 已接入：三段台词、胜败对话、存档回归 | `docs/content/CH-002/`、浏览器 12 张截图 |
| 剧情 CH-003 | 网页版复核（只读不改码） | 已复核：22 项分支断言，发现 2 个 P1 未修 | `docs/content/CH-003/` |
| 音乐 | **网页版** BGM | 已接入：手势后播放、进战斗切曲、退出切回、静音恢复 | `docs/audio/SOURCES_AND_LICENSES.md`、13 项断言 |
| 剧情（Godot） | — | **未接入**，Godot 战斗无任何台词/剧情 | — |
| 音乐（Godot） | — | **未接入**，Godot 战斗无 BGM | — |

> 注意：网页版和 Godot 是两套独立实现。网页版的剧情/音乐**不会**出现在 Godot 战斗里。

---

## 五、测试证据

| 套件 | 项数 | 结果 | 位置 |
|---|---|---|---|
| 单元 + 导入护栏哨兵 | 173 | 全过 | `tools/run-tests.sh` |
| r8 结构复核（18 角色） | 252 | 全过 | `docs/motion/ACT-006/probe/r8_verify_all.json` |
| r8 Godot 运行时（18 角色） | 342 | 全过 | `docs/evidence/CMD-008-godot-all.log` |
| hero005 五动作 | 25 | 全过 | `docs/evidence/CMD-007-motion-test.log` |
| 武器逐帧（attack/death） | 65 帧 | 全过 | `docs/motion/ACT-008/probe/weapon_frames.json` |
| **战斗流程（含朝向）** | **24** | **全过** | `docs/evidence/CMD-011/battle-flow-report.json` |
| 剧情分支（网页） | 22 | 全过 | `docs/evidence/CMD-007/story/branch-check.json` |
| 音乐行为（网页） | 13 | 全过 | `docs/evidence/CMD-007/audio/audio-behavior.json` |

**证据性质**：战斗测试与演示视频都是 `Input.parse_input_event()` **注入**按键事件，
不是物理键盘。人工试玩证据**未做**（沙箱禁止 `osascript` 系统级按键）。

---

## 六、已接入战斗 vs 仅有素材（关键区分）

| 能力 | hero005 | 其余 17 个角色 |
|---|---|---|
| r7 四动作资产 | ✅ | ✅ |
| r8 原生 death + 挂点骨 | ✅ | ✅ |
| r9 武器分离并绑 `weapon.R` | ✅ | ❌ 武器仍在角色网格内 |
| 接入 Godot 可操作战斗 | ✅ | ❌ **完全没有** |
| 接入 Godot 展示场景 | ✅ | ✅（`--model` 可切） |
| 网页版战斗使用 | ❌（网页用旧逻辑） | ❌ |

**结论**：18 个角色里，**只有 1 个（hero005）能打**。其余 17 个是「有资产、能展示、不能打」。

---

## 七、未完成项

| 项 | 状态 | 说明 |
|---|---|---|
| CMD-011 独立键盘试玩验收 | ⏳ **待验收** | 需指挥官按 `play-battle.command` 亲手试 6 条清单 |
| 人工输入证据 | ❌ 未做 | 沙箱禁止系统级按键 |
| 其余 17 角色武器分离 | ❌ 未做 | 只有 hero005 有 r9 |
| 其余 17 角色接入战斗 | ❌ 未做 | 战斗只支持 hero005 |
| 网页版接入这套战斗 | ❌ 未做 | 网页仍是旧玩法 |
| 剧情/音乐接入 Godot | ❌ 未做 | 目前只在网页版 |
| 敌人独立模型 / 追击 AI | ❌ 未做 | 同模型旋转 180°，只会间隔攻击 |
| 倒地逐帧穿地检查 | ⚠️ 部分 | 只验 attack/death 两段，其他动作未查 |
| 渲染器切 Forward+ | ❌ 未做 | 仍 `gl_compatibility` |
| 发布 / 打 tag | ❌ 未做 | — |

---

## 八、后台任务核实

任务列表里有 **1 个 in_progress（#20）+ 4 个 pending（#21–24）**，
都是 CMD-007 时期遇到 429 限流时留下的**过期状态**，不是真的没做完：

| 任务 | 对应产物 | 实际状态 |
|---|---|---|
| #20 探测 r7 hero005 基线 | `docs/motion/ACT-004/probe/heroes_probe.json`（456 KB） | 已存在，已提交 |
| #21 编写 `build_r8_death.py` | 23,565 字节 | 已存在，已提交（3e3718e） |
| #22 生成 r8 hero005.glb | 946,880 字节 | 已存在，已提交 |
| #23 运行 `verify_r8.py` | 6,131 字节，10/10 通过 | 已存在，已提交 |
| #24 ACT-005 三份文档 | 5,568 + 3,976 + 8,220 字节 | 已存在，已提交（7e13f33） |

**没有需要重启的后台任务**。本次没有重复启动任何构建或采集进程；
`ps` 在本机沙箱不可用（`operation not permitted`），无法列出残留进程，
但上述产物均已落盘且入库，不依赖后台进程存活。

---

## 九、边界

- 未发布、未部署、未打 tag
- 未改 r7 旧资产、未碰视频项目
- 未扩角色、未扩章节、未迁网页
- 未虚报人工输入，未声称多人并行
