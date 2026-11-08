# 交接 / 返修单

- 任务 ID / 修订号：CMD-002 / r1（流水线第 2/6 步）
- 负责人 / 接收人：游戏指挥官（派单与验收） / WorkBuddy（执行）
- 状态：PASS（内容验收通过；经本机 WorkBuddy App Gateway 派发）
- 基线提交 / 交付提交 / 最终集成提交：以收到本单时 `shuihu-game` 当前 HEAD 为基线；本步以规格文档为主，交付后填入文档提交哈希
- 目标与验收条件：见下方「任务单正文」验收标准
- 允许修改的文件：仅允许新建/覆盖
  - `docs/pipeline/02_gacha_desire_spec.md`
  - `docs/pipeline/02_acceptance_selfcheck.md`
  - 本交接单末尾可追加「实际修改的文件 / 测试结果」段
  - **可选只读引用**：`game.js`（recruit*）、`data/*`、`docs/pipeline/01_gap_and_borrow.md`、`docs/GAMEPLAY_REVIEW.md`
- 实际修改的文件：
  1. `docs/pipeline/02_gacha_desire_spec.md`（新建，A～G 七节）
  2. `docs/pipeline/02_acceptance_selfcheck.md`（新建，A～F 自检 + 验收标准核对）
  3. 本交接单：状态字段改为 `READY_FOR_REVIEW`，本节填写实际修改记录
  - 未触碰：`assets/`、`game.js`、`tavern-ui.js`、`data/*`、`godot/**`（只读核对，mtime 均早于本步开始时间 13:29）
- 需要其他负责人接入的接口：本步先出规格；若提出新玩法接口，只写进规格「接口草案」，**不改代码**
- 存档、数值和依赖变化：本步不改存档；数值只写建议区间
- 测试命令 / 退出码 / 结果：本步无代码测试。已执行的只读核对与静态检查：
  - `ls -lT game.js tavern-ui.js data/*.js project.godot` → 关键文件 mtime 均早于本步开始（13:29），未改动
  - `find godot -newermt "2026-10-27 12:50"` → 输出为空，Godot 场景与脚本未改动
  - 脚本复查 `02_gacha_desire_spec.md` 全文是否含「最好/完美/一定/绝对/最强/必得/保证/最优/唯一」→ 残留 0 处
  - 池子规模实算（按 `data/shuihu.js` 派生规则）→ 暗金 14 / 红 23 / 紫 35 / 蓝 36，合计 108；开局赠 5 位暗金
  - 资产口径交叉核对 → 专属立绘 12 ∩ GLB 18 = 4 人（林冲/鲁智深/武松/李逵）
  - 详情见 `02_acceptance_selfcheck.md`
- 本地运行方式 / 页面入口：只读打开工程与网页招贤页作对照；Godot 只读
- 截图或录像路径：可选（现有招贤 UI 截图）
- 已知问题与尚未检查项：以上一步冻结假设为准（Godot 主交付、抽卡最高优先）
- 回滚方式：删除本步新建的两个 pipeline 文档即可；不得 `git reset --hard`

## 角色分工（本步必须遵守）

| 角色 | 谁做 | 本步做什么 |
|---|---|---|
| 写代码 | WorkBuddy | **不做**游戏代码修改（含 game.js / Godot 脚本） |
| 做美术 | WorkBuddy | **不做**资产绘制；可在规格里列所需美术清单 |
| 操控软件 | WorkBuddy | 只读：浏览工程、打开网页招贤、Godot 只读 |
| 写调研/规格文档 | WorkBuddy | 产出两份 Markdown |
| 验收 | 游戏指挥官 | 按验收标准打勾；不达标打回 |

---

## 任务单正文（发给 WorkBuddy 执行）

📋 任务单 #2（共 6 步）
任务名称：抽卡欲望循环设计与落地规格
执行角色：WorkBuddy
目标：把「抽卡欲望」从口号落成可实现的规格：循环、保底、展示、反馈、与征战挂钩，并明确 Godot / 网页各自边界。

提示词：
```
你是 WorkBuddy 执行者。指挥官只验收，不代做。

项目根：/Users/user/Documents/Codex/youxi/meng/shuihu-game
先读：
- docs/pipeline/01_gap_and_borrow.md（冻结假设与缺口 #3）
- docs/GAMEPLAY_REVIEW.md（若存在）
- game.js 中 recruit / recruitPage / recruit-ten 相关逻辑（只读，摘要即可）
- data/portraits.js 口径：专属 12 / 示意 96
开源技能：~/.workbuddy/skills/open-source-games/（可对照 Ancient Beast / Shattered PD 等「收集反馈」条目，禁止照搬素材）

请完成并只交付：
1) docs/pipeline/02_gacha_desire_spec.md
必须含：
A. 玩家欲望循环（表格或分节）：触发点 → 行为 → 即时反馈 → 中期目标 → 再抽动机；覆盖单抽/十连、新将、重复将、保底临近。
B. 卡池与稀有度：建议稀有度档、权重区间（可调）、十连/保底规则、与现有「招贤」资源消耗的对照（保留什么、替换什么）。
C. 展示与演出规格（服务欲望）：抽前/抽中/抽后 UI 状态；专属 12 与示意 96 的差异化展示；Godot 侧最小可玩展示场景清单（镜头/灯光/立绘或模型槽，不要求本步建模）。
D. 与征战/图鉴挂钩：抽到后「下一步去哪」；图鉴收集进度如何可见。
E. 落地分期：P0（最小可玩欲望环）/ P1 / P2；每期交付物与验收点；标明网页对照 vs Godot 主交付边界。
F. 风险与合规：避免绝对化承诺文案；本地随机与「保底计数」表述建议。

2) docs/pipeline/02_acceptance_selfcheck.md
对 A～F 逐条自检：通过/未通过 + 一句话证据。

约束：不修改 assets、不改 game.js / data、不改 Godot 场景与脚本、不导出 Steam；全程中文；禁止「最好/完美/一定」等绝对化用语；数值用「建议」区间。

完成后：
- 更新本交接单「实际修改的文件」
- 状态改为 READY_FOR_REVIEW
- 把两个 md 的绝对路径回报（可写在交接单，并尽量经 Gateway/会话可见）
```

验收标准：
- [ ] 存在 `docs/pipeline/02_gacha_desire_spec.md` 与 `02_acceptance_selfcheck.md`
- [ ] 欲望循环覆盖单抽/十连/新将/重复将/保底临近
- [ ] 有稀有度与保底/权重的可执行建议（非空话）
- [ ] 有 Godot 最小展示场景清单（条目化）
- [ ] 有 P0/P1/P2 分期与每期验收点
- [ ] 写明不改代码/资产的本步边界，且未改 assets、game.js、data、Godot 脚本
- [ ] 自检文件对上述项均为「通过」

## 总规划提醒（后续由指挥官派单，本步勿越权）

3. Blender 山景/占位美化 → Godot 导入
4. 角色补充管线（先服务卡池展示）
5. 水浒多支线剧情接入抽卡与征战
6. Godot 可玩 Steam 候选包 + 验收清单

## 逐项验收（指挥官填写）

| 条件 | 操作步骤 | 预期 | 实际 | 证据 | 结论 |
|---|---|---|---|---|---|
| 两份文件存在 | 打开 docs/pipeline/ | 两文件在 | 在 | 02_* 两文件 | PASS |
| 欲望循环覆盖 | 读 02_gacha_desire_spec.md | 五类场景齐全 | A.2 五行齐全 | A.2 | PASS |
| 稀有度/保底可执行 | 同上 | 有建议数值/规则 | B.3 含区间与软保底 | B.3 | PASS |
| Godot 展示清单 | 同上 | 条目化 | C.3 12 条 | C.3 | PASS |
| P0/P1/P2 | 同上 | 有分期与验收点 | E 三表 | E | PASS |
| 未改代码资产 | mtime/只读核对 | 仅新文档 | game.js/data/godot mtime 早于本步 | 交接单实测 | PASS |
| 自检全通过 | 读 selfcheck | 全通过 | 6/6 + 8/8 | selfcheck | PASS |

## 缺陷退回

| 缺陷 ID | 严重度 | 归属 | 复现步骤 | 预期 / 实际 | 证据 | 修复提交 | 复测 |
|---|---|---|---|---|---|---|---|
| （验收不通过时由指挥官填写） |  | WorkBuddy |  |  |  |  |  |

## 实际修改的文件 / 测试结果（WorkBuddy）

**执行时间**：2026-10-27 13:29–13:35（Asia/Shanghai）

**新建交付物（绝对路径）**

1. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/02_gacha_desire_spec.md`
2. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/02_acceptance_selfcheck.md`

**规格结构对照任务单 A～F**

| 要求 | 落地位置 |
|---|---|
| A 欲望循环 | 第 0 节边界 + A.1 现状 / A.2 五场景表 / A.3 环形结构 / A.4 三处断点 |
| B 卡池与稀有度 | B.1 池子实算 / B.2 核心矛盾 / B.3 保留·调整·不动三栏 / B.4 资源对照 |
| C 展示与演出 | C.1 L1–L3 分级 / C.2 抽前中后 / C.3 Godot 12 条清单 / C.4 美术需求 |
| D 征战与图鉴 | D.1 现状 / D.2 六种抽后去向 / D.3 收集进度可见化 / D.4 双向导流 |
| E 分期 | P0 / P1 / P2 三表 + 分期依赖链 |
| F 风险合规 | F 表 8 行 |
| 附 | G 接口草案（只写不进代码）+ 证据位置索引 |

**静态检查结果**

| 检查项 | 命令 / 方法 | 结果 |
|---|---|---|
| 禁改目录未动 | `ls -lT` 比对 mtime | `game.js` 10-23 18:55、`data/*` 10-15～10-22、`project.godot` 10-10，均早于 13:29 |
| Godot 未动 | `find godot -newermt "2026-10-27 12:50"` | 输出为空 |
| 绝对化用语 | 脚本逐行扫描 13 个关键词 | 残留 0 处 |
| 中文全文 | 人工通读 | 除代码标识符与路径外均为中文 |
| 未导出 Steam | 未执行导出命令 | 无 `export_presets.cfg` 生成 |

**发现的现状偏差（详见规格第四、五节）**

1. 玉璧只减不增（`game.js` 仅 `jade-=30`、`jade-=200`，初始 260），十连仅能进行 1 次。
2. 十连保底为末位判定（`i===count-1&&!hasDark`），跨轮不累计。
3. 可直接抽取的暗金仅 4 位（14 暗金 − 开局 5 − 剧情 5），两次十连后保底位退化为重复。
4. 「图鉴」在现有代码中仅指合击图鉴，将册无 `n/108` 总量进度。

**未解决问题 / 待指挥官裁定**

- P0 与第 3 步（Blender 山景 → Godot 导入）的先后顺序，需指挥官定。
- 是否接受「暗金三人（卢俊义/关胜/李俊）暂无专属立绘」的过渡观感，或先行插队补美术。
