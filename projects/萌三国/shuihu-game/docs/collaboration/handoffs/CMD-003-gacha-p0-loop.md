# 交接 / 返修单

- 任务 ID / 修订号：CMD-003 / r1（流水线调整：原 #3 山景顺延；本步落地 CMD-002 规格 **P0 最小可玩欲望环**）
- 负责人 / 接收人：游戏指挥官（派单与验收） / WorkBuddy（执行）
- 状态：PASS（2026-10-27 14:22 Asia/Shanghai：指挥官验收；单元测试 13/13；自检五项通过；禁改项核对通过）
- 基线：收到本单时 `shuihu-game` 当前工作区；本步允许改网页招贤相关代码，**仍不以 Steam/Godot 导出为目标**
- 允许修改的文件（仅这些）：
  - `game.js`（recruit / jade / 保底 / 抽后引导相关）
  - `tavern-ui.js`（若存在招贤 UI）
  - `game.css` / 相关招贤样式（若需最小反馈）
  - `docs/pipeline/03_gacha_p0_notes.md`（实现说明）
  - `docs/pipeline/03_acceptance_selfcheck.md`
  - 本交接单状态与「实际修改」段
- **禁止**：改 `assets/`、改 `data/` 数值表结构（可读）、改 Godot 场景/脚本、导出 Steam、大范围重构无关模块
- 回滚：对本步改动的 js/css 做针对性还原；不得 `git reset --hard`

## 角色分工

| 角色 | 谁做 | 本步做什么 |
|---|---|---|
| 写代码 | WorkBuddy | 实现 P0 欲望环（网页对照） |
| 做美术 | WorkBuddy | **不做**新资产；可用现有立绘 |
| 操控软件 | WorkBuddy | 浏览器/本地静态页验证招贤流程 |
| 写文档 | WorkBuddy | 03 说明 + 自检 |
| 验收 | 游戏指挥官 | 按验收标准 |

---

## 任务单正文

📋 任务单 #3（P0 · 抽卡欲望环最小可玩）
任务名称：按 CMD-002 规格落地 P0（网页对照）
执行角色：WorkBuddy

必读：
- `docs/pipeline/02_gacha_desire_spec.md` 的 **E·P0**、**B.3/B.4**、**A.4 断点**、**D.2/D.3**
- 现状偏差：玉璧只减不增；十连保底末位不累计；可抽暗金池过窄；将册无 n/108

P0 必须交付的可玩改动（对照规格，可取规格建议区间的中值落代码，并在 notes 写明取值）：

1. **玉璧产出闭环**：至少一种稳定获取途径（建议：每日/开战/征战胜利小额回玉，或招贤页可见的「残局补给」），使玩家在合理节奏下能再次十连；不得写死「无限玉璧」。
2. **跨轮软保底计数**：在现有十连末位逻辑之上，增加跨轮累计（规格建议软保底频率 8–12 次量级）；UI 显示「距保底约 n 次」类进度（文案避免绝对化）。
3. **抽后去向**：抽卡结果页至少一个主按钮按规格 D.2 分流（新将→将册/详情，重复→补偿说明，保底临近→继续抽）。
4. **收集进度可见**：将册或招贤相关处显示 `已入寨 n/108`（或等价）；不要改合击图鉴语义，可并列新增。
5. **重复暗金补偿**：按规格建议给可调补偿（玉璧或等价），并在结果页可见。

文档：
- `docs/pipeline/03_gacha_p0_notes.md`：改了哪些函数、取值、如何本地验证
- `docs/pipeline/03_acceptance_selfcheck.md`：对照上列 1–5 + 禁改项自检

验收标准：
- [ ] 两份 03 文档存在且自检全通过
- [ ] 本地可演示：玉璧可再获得 → 能再次进入十连
- [ ] 保底进度跨轮可见，且逻辑不只依赖单次十连末位
- [ ] 抽后主按钮与 `已入寨 n/108` 可见
- [ ] 未改 assets/、data/ 表结构、Godot、未导出 Steam
- [ ] notes 写明验证步骤（打开方式/点击路径）

完成后：交接单改 READY_FOR_REVIEW，回报绝对路径与验证步骤。


> 备注（2026-10-27）：「选择哪个游戏引擎/借鉴哪个游戏库」已拆至独立任务 **CMD-004**（`CMD-004-engine-selection.md`）。本单仍只做 P0 网页欲望环，勿在本单内做引擎选型长文。

---

## 实际修改的文件 / 测试结果（WorkBuddy）

**执行时间**：2026-10-27 13:29–14:12（Asia/Shanghai；中途为 CMD-004 让路后继续收尾）

**代码改动**

| 文件 | 改动摘要 |
|---|---|
| `game.js` | 新增 `GACHA` 常量；`initialState` 增 `jadePity` / `lastRecruitMode`；重写 `pullQuality`（跨轮硬保底 + 名士软保底）与 `recruit` 计数；`obtainHero` 重复分档补偿；新增 `dexSummary/dexLine/pityLeft/pityLine/shardProgressLine`；`clickAction` 增 `reveal-hero` / `reveal-again`；玉璧三处产出（每日 25 / 主线首胜 20 / 塔每 5 层 15） |
| `tavern-ui.js` | `options()` 插入收集进度与保底读数；新增 `ruleText()`（概率文案由常量生成）、`revealActions()`（抽后三按钮）；`reveal()` 显示分档补偿 |
| `tavern-motion.css` | 新增 `.dex-progress` / `.pity-row` / `.pity-chip` / `.shard-chip` / `.summon-actions` / `.summon-next` / `.summon-again` / `.summon-take`；十连与单抽结果页高度收敛、动作栏常驻 |
| `tests/cmd-003-gacha-p0.test.mjs` | 新增（13 条单元测试，vm 载入全量脚本） |
| `tests/cmd-003-gacha-browser.mjs` | 新增（Playwright 端到端，含截图到 `/tmp/shuihu-cmd003/`） |

**文档（绝对路径）**

1. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/03_gacha_p0_notes.md`
2. `/Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/pipeline/03_acceptance_selfcheck.md`

**验证步骤（摘要）**

```bash
cd /Users/user/Documents/Codex/youxi/meng && python3 -m http.server 8765
# 浏览器 http://127.0.0.1:8765/shuihu-game/index.html → 底栏「招贤」→ 点掌柜
node --test tests/cmd-003-gacha-p0.test.mjs   # 13/13
node tests/cmd-003-gacha-browser.mjs          # 端到端通过
```

**测试结果**

| 项 | 结果 |
|---|---|
| P0 单元测试 | 13 / 13 通过 |
| 浏览器端到端 | 通过，无 JS 报错；`已入寨 5/108`、`距保底约 10 次`、十连 10 张、重复暗金 `信物 +10 / 玉璧 +15` |
| 全量回归 | 162 项 / 161 通过 / 1 失败（`art-002-r7` runtime evidence，`runtime.json` 缺失，与本步无关） |
| 禁改项 | `assets/`、`data/`、`godot/`、`project.godot` 均未改动（mtime 核对）；未导出 Steam |

**验证中发现并修复的三个排版缺陷**

1. 十连卡面每张约 645px，动作栏被推到 y≈1428 → 压缩卡面（隐藏传记、立绘 132px）并改 `position:sticky`。
2. `.summon-close` 与弹层原有 × 关闭按钮类名撞车，导致「收下」渲染成竖排窄条 → 改名 `.summon-take`，动作栏改单列 grid。
3. 立绘选择器写成直接子代，实际立绘在 `.summon-character` 内导致规则失效、姓名被动作栏遮住 → 改后代选择器，实测姓名 bottom 512 < 动作栏 top 590。

**未解决的问题**

- 十连结果页在 1440×900 下仍需滚动看全 10 张（动作栏已常驻可见，验收要求满足）。
- `art-002-r7` 那 1 项既有失败需指挥官另行决定是否补证据文件或放宽条件。


---

## 指挥官验收（2026-10-27 14:22 Asia/Shanghai）

- 结论：**PASS**
- 证据：`node --test tests/cmd-003-gacha-p0.test.mjs` → 13/13；`03_gacha_p0_notes.md` / `03_acceptance_selfcheck.md` 齐全；P0 五项与禁改项自检勾选通过。
- 备注：全量回归里 `art-002-r7` 既有 1 失败与本单无关，另单处理；十连结果页需滚动属已知可接受。
