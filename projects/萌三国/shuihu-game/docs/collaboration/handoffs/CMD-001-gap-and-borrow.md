# 交接 / 返修单

- 任务 ID / 修订号：CMD-001 / r1（流水线第 1/6 步）
- 负责人 / 接收人：游戏指挥官（派单与验收） / WorkBuddy（执行）
- 状态：PASS（内容验收通过；执行通道误用 Grok 队友 bot，后续须改走本机 WorkBuddy App）
- 基线提交 / 交付提交 / 最终集成提交：以收到本单时 `shuihu-game` 当前 HEAD 为基线；本步只新增文档，交付后填入文档提交哈希
- 目标与验收条件：见下方「任务单正文」验收标准
- 允许修改的文件：仅允许新建/覆盖
  - `docs/pipeline/01_gap_and_borrow.md`
  - `docs/pipeline/01_acceptance_selfcheck.md`
  - 本交接单末尾可追加「实际修改的文件 / 测试结果」段
- 实际修改的文件：
  - 新建 `docs/pipeline/01_gap_and_borrow.md`
  - 新建 `docs/pipeline/01_acceptance_selfcheck.md`
  - 更新本交接单状态 → READY_FOR_REVIEW（仅状态与本段）
  - 未改 assets/、game.js、data/；未导出 Steam
- 需要其他负责人接入的接口：无（本步不改玩法接口）
- 存档、数值和依赖变化：无
- 测试命令 / 退出码 / 结果：本步无代码测试；自检见 `01_acceptance_selfcheck.md`
- 本地运行方式 / 页面入口：只读打开工程；Godot 只读打开 `project.godot`；可只读打开 `~/萌三国`
- 截图或录像路径：可选（Godot / 萌三国目录结构截图）
- 已知问题与尚未检查项：内容由误建 Grok 队友 bot 代交，但文档已核对 PASS；后续派单改走本机 WorkBuddy App（CodeBuddy Gateway `127.0.0.1:62368`）
- 回滚方式：删除本步新建的两个 pipeline 文档即可；不得 `git reset --hard` 清空工作目录

## 角色分工（本步必须遵守）

| 角色 | 谁做 | 本步做什么 |
|---|---|---|
| 写代码 | WorkBuddy | **不做**游戏代码修改 |
| 做美术 | WorkBuddy | **不做**资产绘制/建模 |
| 操控软件 | WorkBuddy | 只读：访达/终端浏览工程、`Godot` 只读打开工程、只读打开 `~/萌三国`、可读 Blender 工程但不保存改动 |
| 写调研文档 | WorkBuddy | 产出两份 Markdown |
| 验收 | 游戏指挥官 | WorkBuddy 回报后按验收标准打勾；不达标打回 |

---

## 任务单正文（发给 WorkBuddy 执行）

📋 任务单 #1（共 6 步）
任务名称：缺口盘点 + 可借鉴清单
执行角色：WorkBuddy
目标：摸清工程缺口，并列出可借鉴的开源游戏与《萌三国》用法，形成后续步骤唯一依据。

提示词：
```
你是 WorkBuddy 执行者。指挥官只验收，不代做。

项目根：/Users/user/Documents/Codex/youxi/meng/shuihu-game
风格：3D Q 版 +《水浒传》演义；参考风格/体量：本机 ~/萌三国（Godot）；合规：避开绝对化用语，文案用「可」「建议」等。
开源技能：~/.workbuddy/skills/open-source-games/（先读 SKILL.md，再在 references/catalog.md 检索；优先 Godot/可二次开发、RPG/策略/有抽取或收集循环的项目）。

请完成并只交付下列文件（不要改游戏资源）：
1) docs/pipeline/01_gap_and_borrow.md
必须含：
A. 缺口表（表格）：模块 | 现状证据(路径/文件) | 缺口 | 影响画质/玩法/抽卡(是/否) | 建议归属(代码/美术/Blender操控/Godot操控)
至少覆盖：山景/地形占位、角色美术完成度(已专属 vs 示意数量)、剧情支线、抽卡/保底/展示、Godot vs 网页完成度、Steam 打包前置。
B. 可借鉴清单（不少于 5 条）：游戏名 | 源码/官网链接 | 借鉴点(机制或表现，各≤2句) | 禁止照搬项(版权/素材) | 拟用于本项目哪一步(#2~#6)
其中至少 1 条对照 ~/萌三国 的 project.godot 与目录结构，写清「可学的工程组织/场景分层」；不要抄它的题材文案。
C. 给后续步骤的冻结假设：引擎主交付以 Godot 为准；网页版可暂作玩法参考；抽卡机制为最高优先级。

2) docs/pipeline/01_acceptance_selfcheck.md
对上面 A/B/C 逐条自检：通过/未通过 + 一句话证据。

约束：不修改 assets、不改 game.js / data、不导出 Steam；全程中文；禁止「最好/完美/一定」等绝对化用语。

完成后：
- 更新本交接单「实际修改的文件」
- 状态改为 READY_FOR_REVIEW
- 把两个 md 的绝对路径回报给指挥官（或用户转交）
```

验收标准：
- [ ] 存在 `docs/pipeline/01_gap_and_borrow.md` 与 `01_acceptance_selfcheck.md`
- [ ] 缺口表 ≥8 行，且每行有具体路径或文件名
- [ ] 写明：专属美术好汉数量、示意/占位好汉数量（两数之和应对齐工程数据口径）
- [ ] 可借鉴清单 ≥5 条，每条含可点击的源码或官网 URL
- [ ] 至少 1 条明确写自 `~/萌三国` 的可学点，且未要求复制其素材
- [ ] 标明「抽卡欲望机制」为后续最高优先级，山景美化与角色补充服从卡池展示需要
- [ ] 自检文件对上述项均为「通过」；任一「未通过」则本步不验收

## 总规划提醒（后续由指挥官派单，本步勿越权）

2. 抽卡欲望循环设计与落地规格（最高优先级）
3. Blender 山景/占位美化 → Godot 导入
4. 角色补充管线（先服务卡池展示）
5. 水浒多支线剧情接入抽卡与征战
6. Godot 可玩 Steam 候选包 + 验收清单

## 逐项验收（指挥官填写）

| 条件 | 操作步骤 | 预期 | 实际 | 证据 | 结论 |
|---|---|---|---|---|---|
| 两份文件存在 | 打开 docs/pipeline/ | 两文件在 | 在 | `01_gap_and_borrow.md` + `01_acceptance_selfcheck.md` | PASS |
| 缺口表≥8且有路径 | 读 01_gap_and_borrow.md | 满足 | 10 行且含路径 | A 节缺口表 | PASS |
| 专属/示意数量 | 同上 | 两数写清且可核对 | 12 / 96；与 portraits.js 一致 | A 口径表 + 本机核对 | PASS |
| 借鉴≥5含URL | 同上 | 满足 | 7 条均含链接 | B 节 | PASS |
| 含萌三国条目 | 同上 | 有且不抄素材 | B#1 萌三国工程配置 | B 节 | PASS |
| 抽卡最高优先 | 同上 C 节 | 写明 | C.2 写明最高优先 | C 节 | PASS |
| 自检全通过 | 读 selfcheck | 全通过 | 8 通过 / 0 未通过 | `01_acceptance_selfcheck.md` | PASS |

## 缺陷退回

| 缺陷 ID | 严重度 | 归属 | 复现步骤 | 预期 / 实际 | 证据 | 修复提交 | 复测 |
|---|---|---|---|---|---|---|---|
| （验收不通过时由指挥官填写） |  | WorkBuddy |  |  |  |  |  |

## 实际修改的文件 / 测试结果（WorkBuddy）

- 交付绝对路径：
  - `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/01_gap_and_borrow.md`
  - `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/01_acceptance_selfcheck.md`
- 自检：见 `01_acceptance_selfcheck.md`（8 通过 / 0 未通过）
- 缺口表行数：10；可借鉴：7（含 ~/萌三国 1 条）；专属 12 / 示意 96
- 代码测试：本步无（仅文档）
