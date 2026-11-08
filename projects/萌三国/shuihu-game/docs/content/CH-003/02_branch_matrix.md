# CH-003 · 首章分支矩阵与实测结果

- 实测脚本：`tests/ch-003-branch-browser.mjs`（全程页面按钮操作，无 evaluate 注入结算）
- 实测日志：`docs/evidence/CMD-007-story-run.log`
- 结构数据：`docs/evidence/CMD-007/story/branch-check.json`
- 截图：`docs/evidence/CMD-007/story/01`–`07`
- 结果：**22 项断言，PASS 22，FAIL 0，pageError 0**

## 1. 分支总表

| # | 分支 | 触发方式 | 实际代码路径 | 预期 | 实测 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 开场触发 | 征战地图点「踏上征途 · 普通」 | `journeyAction` → `enterStory()` → `state.page='story'` → `storyPage()` | 播开场段第 1/5 拍 | **通过**：进度条 `1 / 5　山河记`，首句含「公元 1119 年」 | `01-opening-first-beat.png` |
| 2 | 胜利 | 布阵→开战→自动战斗打赢 | `finishBattle(b,true)` → `beatLinesFor(stage,'win')` → `.story-lines` | 结算卡片 3 条胜利词 | **通过**：3 条，含「渡口安静下来」，标题「战斗胜利」 | `03-win-result.png` |
| 3 | 失败 | 布阵→开战→只点「结束回合」不还手 | `finishBattle(b,false)` → `beatLinesFor(stage,'lose')` | 结算卡片 3 条失败词、进度不推进 | **通过**：26 回合后真实判负，3 条含「粮车退回渡口」，`stageUnlocked` 仍为 1 | `06-defeat-result.png` |
| 4 | 跳过 | 剧情页点「跳过 · 前往布阵」 | `journeyAction('story-skip')` → `advanceStory(true)` → `startBattle()` | 不再播剩余台词，直接进布阵；进战斗时扣体力 | **通过**：`page=battle phase=deploy`，`storyIndex=null`，体力 100→98 | `02-skip-to-deploy.png` |
| 5 | 重入（已通关） | 通关后再进同一关 | `enterStory()` 重置 `index:0` | 从头播开场；进度不再推进 | **通过**：`1 / 5`；再打一次并取胜后 `stageUnlocked` **仍为 2** | `04-reentry-replays-opening.png`、`05-replay-win-still-stage2.png` |
| 6 | 失败后重打 | 判负→返回→再进同一关 | 同上 | 重新播开场，可再次挑战 | **通过**：`1 / 5` | `07-retry-after-defeat.png` |

## 2. 逐条实测明细

### 2.1 开场触发

```
[PASS] 开场触发：进入关 1 即播开场 — 进度条="1 / 5　山河记"
[PASS] 开场首句为关 1 beats 首条 — 首句="公元 1119 年，秋。薄雾压着芦苇荡，一船送往…"
[PASS] 开场推进：第二拍生效 — 进度条="2 / 5　宋江"
[PASS] 开场末拍按钮变为「进入战场」 — 末拍按钮="进入战场"
```

开场段 5 拍，第 5 拍按钮文案切换为「进入战场」（`storyPage()` 的三元判断），点它走 `advanceStory()` 末拍分支。

### 2.2 胜利

```
[PASS] 胜利分支：结算卡片出现胜利台词 — 台词 3 条：山河记渡口安静下来。芦苇 | 宋江粮夺回来了，乡亲们也 | 花荣芦苇深处还有动静。留
[PASS] 胜利分支：台词取自胜利段 — 含「渡口安静下来」=true
[PASS] 胜利分支：结算标题为胜利 — 标题="战斗胜利"
[PASS] 胜利后进度推进到第 2 关 — stageUnlocked=2
```

### 2.3 失败（真实判负）

```
[PASS] 失败分支：只结束回合可真实判负 — 结束回合 26 次后出现结算
[PASS] 失败分支：结算卡片出现失败台词 — 台词 3 条
[PASS] 失败分支：台词取自失败段 — 含「粮车退回渡口」=true
[PASS] 失败后进度不推进 — stageUnlocked=1
```

- 判负方式是**合法操作**：只点「结束回合」、不出手、不移动，让敌方把队伍打光。战斗速度提到 3× 以缩短耗时（不改任何游戏逻辑）。
- 判负后结算标题是「整队休整」（`b.result.win ? '战斗胜利' : '整队休整'`，`game.js:437`），不是「失败」二字——
  这是既有文案口径，本轮不改。

### 2.4 跳过

```
[PASS] 跳过分支：中途跳过直接进入布阵 — page=battle phase=deploy
[PASS] 跳过分支：不再停留在剧情页 — storyIndex=null
[PASS] 跳过分支：体力在进入战斗时已扣除（普通 2） — 100 → 98
```

- 跳过发生在第 2 拍（已推进过一次），说明**任意一拍都能跳**，不需要翻到末拍。
- 跳过**不会**跳过胜利/失败台词：结算台词由 `finishBattle()` 按 `win` 现取，与是否跳开场无关（2.2/2.3 已实测）。

### 2.5 重入

```
[PASS] 重入分支：通关后再进仍从头播开场 — 进度条="1 / 5　山河记"
[PASS] 重入分支：进入剧情页本身不扣体力 — 98 → 98（扣费发生在进入战斗时）
[PASS] 重入分支：已通关后再战仍扣满体力（无减免） — 98 → 96
[PASS] 重入分支：stageUnlocked 未被重复推进 — stageUnlocked=2
[PASS] 重入分支：重复通关不把进度推到第 3 关 — stageUnlocked=2
[PASS] 重入分支：重复通关仍播胜利段台词 — 台词 3 条
```

- 进度推进用 `game.js:476` 的 `state.stageUnlocked = Math.max(state.stageUnlocked, b.stage+1)`，
  所以重复通关第 1 关不会被推到第 3 关——**实测确认**。
- 进入剧情页不扣体力；体力在 `startBattle()`（`game.js:319`）扣。所以"进剧情页后退回地图"不损失体力。

### 2.6 失败后重打

```
[PASS] 失败后可重新进入关 1 并再次播开场 — 进度条=1/5
```

## 3. 未实测的分支

| 分支 | 原因 |
|---|---|
| 「自动播放」推进（`story-auto`） | 它是 5.5s 定时器推进，属于体验功能，本轮未纳入必测；代码路径 `scheduleStory()` 已读，逻辑正常。 |
| 「返回地图」中途退出（`story-back`） | 同上，未实测；代码 `clearTimeout(storyTimer); state.story=null; state.page='campaign'`，不扣体力。 |
| 精英难度下的失败 | 只测了普通难度；精英的精英箭阵（`resolveEliteVolley`）会额外造成伤害，不影响分支结构。 |
| 手机端表现 | 未测。 |
