# 交接 / 返修单

- 任务 ID / 修订号：CMD-004 / r1（从流水线「引擎/借鉴库选型」单独拆出；**不阻塞**进行中的 CMD-003 P0 网页欲望环）
- 负责人 / 接收人：游戏指挥官（派单与验收） / WorkBuddy（执行）
- 状态：PASS
- 基线：收到本单时 `shuihu-game` 当前工作区；本步**只出选型文档**，不改玩法代码、不改资产、不导出 Steam
- 允许修改的文件（仅这些）：
  - `docs/pipeline/04_engine_selection.md`（新建：引擎/借鉴库对比 + 推荐结论）
  - `docs/pipeline/04_acceptance_selfcheck.md`（新建：对照验收自检）
  - 本交接单末尾「实际修改的文件 / 测试结果」段与状态字段
- **禁止**：改 `assets/`、`game.js`、`tavern-ui.js`、`data/`、`godot/**` 业务场景与脚本、`project.godot` 主配置、Blender 工程、导出 Steam；不得把候选引擎真正迁入工程
- 回滚：删除本步新建的两份 pipeline 文档即可；不得 `git reset --hard`

## 角色分工（本步必须遵守）

| 角色 | 谁做 | 本步做什么 |
|---|---|---|
| 写代码 | WorkBuddy | **不做**游戏业务代码；可选写只读探测脚本输出到 notes，探测后删除或留在 docs 外临时路径，不得进主工程依赖 |
| 做美术参考梳理 | WorkBuddy | 只做文字梳理：从开源技能目录与萌三国/本作 Godot 入口归纳「灯光/镜头/目录习惯」等可借鉴点；**不画**新资产、不改 blend |
| 操控软件 | WorkBuddy | **只读打开**：Godot 打开 `shuihu-game/project.godot` 与主场景；可只读打开 `~/萌三国/project.godot`；可用 Blender 只读查看现有样板（不保存） |
| 写调研文档 | WorkBuddy | 产出 `04_engine_selection.md` + `04_acceptance_selfcheck.md` |
| 验收 | 游戏指挥官 | 按验收标准；无明确推荐结论则打回 |

---

## 任务单正文

📋 任务单 #4（调研 · 引擎选型与借鉴库）
任务名称：引擎/借鉴库选型对比与推荐
执行角色：WorkBuddy

### 背景（指挥官冻结前提，可批判但须写清）

CMD-001 已冻结：「引擎主交付以 Godot 为准；网页作对照」。本步仍要做一次**有证据的选型确认**（或有充分理由微调渲染路径/并行方案），避免后续山景与角色管线在错误引擎假设上铺开。  
本步从原流水线里「选哪个引擎、借鉴哪个游戏库」拆出，**不替代** CMD-003 的 P0 抽卡代码工作。

### 必读

1. `docs/pipeline/01_gap_and_borrow.md`（尤其 **B 可借鉴清单**、**C 冻结假设**）
2. `docs/collaboration/handoffs/CMD-001-gap-and-borrow.md`
3. `~/.workbuddy/skills/open-source-games/SKILL.md` 与 `~/.workbuddy/skills/open-source-games/references/catalog.md`
4. 本机 `~/萌三国/project.godot`（只读）
5. 本作 `project.godot`、`godot/journey_map/journey_map.tscn`、`godot/art_002/`、`godot/tests/smoke_test.gd`（只读）

### 调研对象范围（必须覆盖，不得跳过）

| # | 对象 | 路径 / 入口 | 本步要回答的问题 |
|---|---|---|---|
| 1 | WorkBuddy 开源游戏技能目录 | `~/.workbuddy/skills/open-source-games/`（含 catalog） | 哪些条目与「3D Q 版 + 抽卡展示 + 征战」最相关？各适合借鉴机制还是工程结构？ |
| 2 | 萌三国工程 | `~/萌三国/`（`project.godot` 等） | 实际引擎版本/渲染器/物理/目录习惯；可学配置 vs 不可学空壳 |
| 3 | shuihu-game 现有 Godot 入口 | 根 `project.godot`；主场景 `godot/journey_map/journey_map.tscn`；`godot/art_002/`；`godot/tests/` | 当前 Compatibility / 场景树成熟度；迁主交付的成本与风险 |

可选加深（写入文档即可，非强制跑通）：catalog 中与 Godot 迁移相关的条目（如 Unknown Horizons godot-port）、以及 CMD-001 B 表已列的 Wesnoth / Ancient Beast / ShatteredPD 等**机制**借鉴（本步重点仍是**引擎与工程路径**，机制只作对照一句）。

### 交付物

1. **`docs/pipeline/04_engine_selection.md`**（中文）必须含：
   - **A. 调研范围与方法**（上表三对象各写清打开了什么、证据路径）
   - **B. 候选方案 2～3 个**（每个方案写：引擎或路径名称、与本作目标的匹配点、风险、迁移/并行成本、和抽卡展示的关系）
     - 建议至少覆盖：`Godot 4.x Compatibility 继续加深`、`Godot 换/兼 Forward+（对照萌三国）`、以及**一个**非 Godot 或「网页主交付长期并行」对照方案（即使最终不推荐，也要写清为何不选）
   - **C. 对比表**（同一组维度：渲染路径、3D Q 版可行性、导出 Steam、现有资产复用、团队操控成本、与 CMD-002/003 抽卡节奏的契合）
   - **D. 推荐结论（强制）**：明确写出「推荐采用：……」+ **不少于 5 条可核验理由**（每条带路径或版本号等证据）；不得只列清单无结论
   - **E. 对后续步骤的影响**：若采纳推荐，对山景（原 #3）、角色管线、Steam 包各一句；若与 CMD-001 冻结假设不一致，必须单列「需指挥官改口的点」
   - **F. 借鉴库优先级**：从技能目录 + CMD-001 B 表给出「先读 / 后读 / 不读」三级，说明与推荐引擎的关系
2. **`docs/pipeline/04_acceptance_selfcheck.md`**：逐条勾选下方验收标准，并写本地只读验证步骤（如何打开 Godot/萌三国/技能目录）

### 验收标准（指挥官打勾；缺任何一项打回）

- [ ] 两份 04 文档存在，路径正确
- [ ] 调研三对象（开源技能目录、萌三国、shuihu-game Godot 入口）均有证据句，不是空泛描述
- [ ] 给出 **2～3 个**候选方案 + 对比表
- [ ] **有且仅有一个主推荐**，文中出现「推荐采用：……」，且理由 ≥5 条、条条可核对
- [ ] 不是「只列清单」：缺少推荐结论或理由全是空话 → 不合格
- [ ] 未改 assets / game.js / data / godot 业务文件 / project.godot / 未导出 Steam
- [ ] 自检文档全部勾选并通过
- [ ] 全程中文；避免绝对化用语（最好/完美/一定/绝对/最强/必得/保证/最优/唯一）

### 完成后

1. 本交接单状态改为 `READY_FOR_REVIEW`
2. 回报两份文档的**绝对路径**与推荐结论原文一句
3. **不要**擅自开始引擎迁移或改 `project.godot`

---

## 实际修改的文件 / 测试结果（WorkBuddy）

**执行时间**：2026-10-27 13:49–14:0x（Asia/Shanghai）

**新建交付物（绝对路径）**

1. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/04_engine_selection.md`
2. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/04_acceptance_selfcheck.md`

**推荐结论原文一句**

> 推荐采用：Godot 4.7.2 + Forward+ 作为主交付渲染路径；Compatibility 不再作为与 3D 展示相关的默认路径，仅保留为「低配/Web 端」备选。

**文档结构对照任务单**

| 要求 | 落地位置 |
|---|---|
| A 调研范围与方法（三对象各写打开什么、证据路径） | A.1 技能目录 / A.2 萌三国 / A.3 shuihu-game Godot 入口 / A.4 方法与局限 |
| B 候选方案 2～3 个 | 方案 1 Compatibility 继续、方案 2 Forward+、方案 3 网页主交付对照（含不选理由） |
| C 对比表（同组维度） | 8 维度：渲染路径 / 3D Q 版 / Steam / 资产复用 / 操控成本 / 抽卡节奏 / 切换成本 / 与萌三国一致性 |
| D 推荐结论 + ≥5 条理由 | 「推荐采用」+ 7 条理由，逐条附路径、版本号或命令输出；另附反面证据 |
| E 对后续步骤影响 + 改口点 | 山景 / 角色管线 / Steam 包各一句；单列「需指挥官改口的点」表 |
| F 借鉴库优先级 | 先读 3 条 / 后读 3 条 / 不读 4 类，均说明与推荐引擎的关系 |

**只读实测记录**

| 项目 | 命令 | 输出 |
|---|---|---|
| 引擎版本 | `Godot --version` | `4.7.2.stable.official.ed1daf0bf` |
| 冒烟测试 | `Godot --headless --path . --script godot/tests/smoke_test.gd` | **失败**：`Parse Error ... non-existent resource at: res://assets/liangshan-journey-map.png` / `missing journey map texture` |
| 导入缓存 | `find . -name "*.import" \| wc -l` | `0`（PNG 未经导入，故冒烟测试失败；文件本身存在，3,485,179 字节） |
| 禁改核对 | `find godot -newermt "2026-10-27 13:49"` / `find assets -newermt ...` | 均为空 |

**发现的与既往记录不一致的事实（需指挥官知悉）**

`docs/GAMEPLAY_REVIEW.md` 记「已在原生场景中通过无界面加载测试」，在当前工作副本上**不可复现**：工程内 `.import` 文件数为 0，`.godot/imported/` 为空，PNG 未被导入导致 `journey_map.tscn` 的 `Texture2D` 引用失效。判断为「工作副本从未导入过」，而非场景写错；修复方式为编辑器打开完成一次导入（本步不执行）。

**未做/待裁定**

- 未切换渲染路径、未修导入、未建导出预设、未 clone 任何候选引擎。
- 需指挥官就「渲染路径由 Compatibility 改为 Forward+」签一条改口；若不采纳，方案 1 仍成立，代价是抽卡演出长期停在 L1/L2。

## 指挥官验收（自动化例行「盯 CMD-004 交付」）

- 时间：2026-10-27 14:10 Asia/Shanghai
- 结论：**PASS**
- 核对：两份 04 文档齐；「推荐采用」+ 7 条可核验理由；三对象有证据；对比表与三方案齐全；禁改项未动（`project.godot`/`godot`/`assets` 未由本步改写；`game.js`/`tavern-ui.js` 14:01 改动属并行 CMD-003）；自检 8/8；无绝对化用语。
