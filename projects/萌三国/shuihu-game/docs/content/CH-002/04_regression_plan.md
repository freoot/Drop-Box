# CH-002 · 回归与验收

> 本文只写回归点与断言，不改代码、不新增测试文件（新增测试由 A 决定）。
> 断言中的行号均来自 `01_current_anchor.md` 的实读结论。

---

## 0. 测试基线与可用脚手架

### 0.1 已有脚手架

`tests/game.test.mjs:12–68` 提供 `makeGame(previousSave)`：在 `node:vm` 里依次加载 `data/shuihu.js`、`data/portraits.js`、`data/journey.js`、根目录 `journey.js`、`hero-power.js`、`battle-vfx.js`、`battle-motion.js`、`game.js`，并注入**内存版 `localStorage`**（`tests/game.test.mjs:36–41` 的 `getItem/setItem/removeItem`）。

返回：`{ context, run, entries, nodes, FakeElement, settleUntil }`

- `run(expr)` 在 vm 上下文内求值，可直接调 `enterStory` / `advanceStory` / `startBattle` / `finishBattle` / `storyPage()` 等全局函数
- `entries` 就是那块假 localStorage，`entries.get('shangshan-shuihu-v1')` 可取到存档字符串
- `settleUntil(predicate)` 用于推进战斗回合的定时器

### 0.2 已存在、与本轮直接相关的既有用例

| 用例 | 位置 | 与本轮的关系 |
|---|---|---|
| `player naming validates input and preserves existing progress on reload` | `tests/game.test.mjs:72–83` | 已覆盖「取名后存档写入」与「刷新后进度保持」，可直接复用 |
| `campaign uses six illustrated route nodes with adaptation chronology` | `tests/game.test.mjs:126–131` | 断言 `SHUIHU_JOURNEY.length===6`、地图节点 6 个、含改编提示行。改 `beats` 不影响它 |
| `story prologue consumes stamina only when entering deployment` | `tests/game.test.mjs:133–144` | **含 `assert.match(game.run('storyPage()'), /公元 1119 年/)`（:140）** ← 本轮台词若删掉「公元 1119 年」会直接挂测，已在 `03_dialogue_script.md` 中保留 |
| `returning from a prologue leaves the battle and stamina untouched` | `tests/game.test.mjs:146–152` | 跳过剧情返回地图时不扣体力、不建战斗 |

### 0.3 localStorage key 全景（避免误伤）

| key | 归属 | 行号 |
|---|---|---|
| `shangshan-shuihu-v1` | **主存档（本轮回归对象）** | `game.js:3` |
| `shuihu-bgm-v1` | BGM 开关与音量 | `bgm.js:12` |
| `shuihu-sfx-v1` | 音效开关与音量 | `audio-sfx.js:3` |
| `shuihu-audio-candidates-v2` | 音频候选选择（独立工具页） | `audio-candidates.js:5` |

四个 key 互不冲突；回归时清档只需 `removeItem('shangshan-shuihu-v1')`（对应 `game.js:866` 的重置入口）。

---

## 1. 存档回归测试点

**key：`shangshan-shuihu-v1`**（`game.js:3`）
**写入：`game.js:48 save()` → `game.js:65 localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot))`**
**读取：`game.js:30 Object.assign(initialState(), JSON.parse(localStorage.getItem(SAVE_KEY)||'{}'))`**

### 1.1 取名后存档写入

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| A1 | 未取名时 `entries.get('shangshan-shuihu-v1')` | 可能为 `undefined`（尚未写入）或已存在但 `playerName===''` | `game.js:29` `playerName:''` |
| A2 | `run("setPlayerName('清风客')")` 返回 | `true` | `game.js:115–118` |
| A3 | 调用后 `entries.get('shangshan-shuihu-v1')` | 非 `null`，`JSON.parse(...).playerName === '清风客'` | `game.js:118` `save()` |
| A4 | 非法名（`''` / `'一'` / `'<script>'`） | 返回 `false`，且存档不新增 | `game.js:117` 正则 `/^[\p{L}\p{N}· _-]{2,12}$/u` |
| A5 | `#profile-setup` 节点 innerHTML | 为空（取名后弹窗关闭） | `game.js:120 renderProfileSetup()`；既有断言见 `tests/game.test.mjs:82` |

> A2–A5 已由 `tests/game.test.mjs:72–83` 覆盖，本轮只需保证不回归。

### 1.2 通关后进度推进

操作序列（vm 内）：

```js
run("startBattle('campaign',1);beginBattle(state.battle)");
run("finishBattle(state.battle,true)");
```

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| B1 | `state.clearedStages[1]` | `true` | `game.js:471` |
| B2 | `state.stageUnlocked` | `2` | `game.js:472` `Math.max(state.stageUnlocked,b.stage+1)` |
| B3 | `state.campaignWins` | `1` | `game.js:472` |
| B4 | `state.grain` 增量 | `+18`（`CHAPTERS[0].reward.grain`） | `game.js:474` + `data/shuihu.js:193` |
| B5 | `state.jade` 增量 | `+20`（首胜玉璧，`firstClear` 时） | `game.js:477–479` |
| B6 | `state.heroes` 含 `hero-013` | `true`（首次通关发放座次 13） | `game.js:483–487` + `data/shuihu.js:193 rewardHeroRank:13` |
| B7 | `state.gold` 增量 | `+120`（普通难度，首章无 Boss） | `game.js:465–466`；精英为 `Math.round(120*1.65)=198` |
| B8 | 存档串内同步反映上述字段 | `JSON.parse(entries.get(key)).clearedStages[1]===true` | `game.js:523` `save()` |

> 参考既有写法：`tests/game.test.mjs:234–236` 用 `startBattle('campaign',4,…)` + `finishBattle(state.battle,true)` 断言 `state.clearedStages[4]===true`。

### 1.3 失败后不推进

操作序列：

```js
run("startBattle('campaign',1);beginBattle(state.battle)");
run("finishBattle(state.battle,false)");
```

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| C1 | `state.clearedStages[1]` | falsy | 写 `clearedStages` 的语句在 `game.js:471`，位于 `if(win)` 分支内（`game.js:463`） |
| C2 | `state.stageUnlocked` | 仍为 `1` | 同上 |
| C3 | `state.campaignWins` | `0` | 同上 |
| C4 | `state.heroes` 不含 `hero-013` | `true` | 发放逻辑在 `game.js:483–487` 的 `if(win)` 内 |
| C5 | **`state.stamina` 已扣** | `98`（普通难度，起始 100） | `game.js:319` 扣费发生在**开战前**，与胜负无关 |
| C6 | `state.battle.result.win` | `false` | `game.js:520` |

> C5 是容易误判的一条：本轮所谓「失败后不推进」只指**进度位不动**，军令已在进关时扣除，不会退还。若 A 期望失败退还军令，属新增逻辑（CH-001 G-13），本轮未做。

### 1.4 刷新后进度保持

操作：`const g2 = makeGame(g1.entries.get('shangshan-shuihu-v1'));`

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| D1 | `g2.run('state.playerName')` | 与原值一致 | `game.js:30` + `game.js:31` |
| D2 | `g2.run('state.clearedStages[1]')` | `true` | `game.js:30` 的 `Object.assign` |
| D3 | `g2.run('state.stageUnlocked')` | `2` | 同上 |
| D4 | `g2.run('state.heroes.length')` | 比初始值多 1（鲁智深） | `game.js:36` 会把存档英雄与 `HERO_CATALOG` 对齐重建 |
| D5 | D1–D4 对**未通关**的存档同样成立（值不变） | 通过 | 同上 |

> D1 已被 `tests/game.test.mjs:78–81` 覆盖。

### 1.5 与剧情状态相关的存档点

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| E1 | 剧情播到一半存档中 `state.story` | 存在且为 `{stage,difficulty,index,autoplay}` | `journey.js:11` 写入；`save()`（`game.js:48–67`）**不清除** `state.story` |
| E2 | 用该存档重建后 `state.page` | `'story'`，`storyPage()` 仍渲染同一拍 | `game.js:30` + `journey.js:13` |
| E3 | 从剧情返回地图后存档中 `state.story` | `null` | `journey.js:28` `state.story=null` |
| E4 | 战斗结算后点 `battle-return` 后存档中 `state.battle` | `null` | `game.js:849` `state.battle=null`，随后 `render()`（内含 `save()`，`game.js:233`）落盘 |
| E5 | 存档中 `state.battle.animating` / `fx` | 被 `save()` 归一为 `false` / `null` | `game.js:54–55` |

---

## 2. 剧情触发回归

### 2.1 进关播开场

操作：

```js
run("enterStory(1,'normal')");        // state.page==='story', state.story.index===0
run('storyPage()');                   // 取渲染串
run('advanceStory()');                // index 1,2,3,4 …
```

| # | 断言 | 期望（**A 已实现哨兵切片**） | 期望（**A 未实现切片，零代码回退**） |
|---|---|---|---|
| F1 | `state.story.index` 初值 | `0` | `0`（同） |
| F2 | `storyPage()` 含 O1 首句 | 含「公元 1119 年，秋。薄雾压着芦苇荡」 | 同（**必须含「公元 1119 年」，否则 `tests/game.test.mjs:140` 挂测**） |
| F3 | 逐次 `advanceStory()` 开战时机 | 推进到第 5 条（哨兵 `——若此战得胜——`）时 `state.page==='battle'`，共推进 5 次 | 需推进 13 次才开战，且哨兵行与胜利/失败台词会在战前被念出 |
| F4 | 开场段台词顺序 | 旁白 → 宋江 → 花荣 → 李逵 → 吴用 | 同，后续接哨兵与两段台词 |
| F5 | `state.stamina` | 进入剧情时不扣；`startBattle` 时 `-2`（普通）/ `-5`（精英） | 同；既有断言见 `tests/game.test.mjs:137/144` |
| F6 | 显示名 | 「山河记」/「宋江」/「花荣」/「李逵」/「吴用」（**不含绰号**） | 同 |
| F7 | 进度条文案 | 做切片后应为「n / 5」；未做切片为「n / 13」 | 见 `02_single_level_plan.md` 第 5 节待决断项 2 |

### 2.2 胜利播胜利词

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| G1 | `finishBattle(state.battle,true)` 后 `state.battle.result.win` | `true` | `game.js:520` |
| G2 | `state.battle.result.lines` | 长度 3，`[0]` 含「渡口安静下来」，`[1]` 含「粮夺回来了」，`[2]` 含「留两个人看守粮道」 | **依赖 `02_single_level_plan.md` 第 4 节 #3/#4 落地** |
| G3 | `battlePage()` 的 `res` 片段 | 同时含「战斗胜利」与上述 3 句台词 | 依赖 #5 落地 |
| G4 | `state.battle.result.lines` 不含哨兵行文本 | `true`（哨兵行不应出现在台词里） | 同 G2 |
| G5 | 非战役模式（`tower` / `arena` / `activity`）时 `result.lines` | 为空 | 切片只对 `mode==='campaign'` 生效 |

### 2.3 失败播失败词

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| H1 | `finishBattle(state.battle,false)` 后 `state.battle.result.win` | `false` | `game.js:520` |
| H2 | `result.lines` | 长度 3，`[0]` 含「不急。看清他们的站位」，`[1]` 含「弓手缩在后排」，`[2]` 含「粮车退回渡口」 | 同 G2 |
| H3 | `battlePage()` 的 `res` 片段 | 同时含「整队休整」与上述 3 句 | 同 G3 |
| H4 | 与胜利段不串台 | 失败时 `result.lines` 不含「渡口安静下来」 | 切片按哨兵分段，胜负互斥 |

### 2.4 重复进入不重复消耗

**现状结论：当前不满足「不重复消耗」。** 两条实证：

1. `journey.js:11` 每次 `enterStory` 都写 `index:0`，**开场段每次都从头播**。
2. `game.js:319` `if(mode==='campaign')state.stamina-=campaignCost(difficulty);` 位于 `startBattle` 开头，**每次进关都扣**，没有「已通关则免扣」的分支。

因此本轮断言分「现状」与「期望」两栏：

| # | 场景 | 现状断言（应通过） | 期望断言（需新增逻辑，本轮未做） |
|---|---|---|---|
| I1 | 首次进关并通关 | `stamina` 100 → 98（普通）；`clearedStages[1]===true` | 同 |
| I2 | 通关后**再次**进关 | `stamina` 98 → 96；开场段重播；`state.story.index` 仍从 0 开始 | 体力不扣（或按重玩价扣），开场段可跳过 |
| I3 | 首胜奖励是否重复发放 | **不重复**：`game.js:470` `firstClear=!state.clearedStages[b.stage]`，第二次为 `false`，不再发 `hero-013`、不再 `+20` 玉璧 | 同（现状已正确） |
| I4 | 重复进入后 `clearedStages[1]` / `stageUnlocked` | 保持 `true` / `2`，不被回退 | 同 |
| I5 | 失败后原地重试 | 进度位不变，但体力再扣一次 | 期望退还军令（CH-001 G-13） |

> I3/I4 是**已经正确**的行为，回归时重点防回退。

---

## 3. 旧存档兼容

| # | 断言 | 期望 | 依据 |
|---|---|---|---|
| J1 | 旧存档 `state.story.index` 为 0–2（旧 `beats` 长度 3）时，`beats` 扩到 13 条后读档 | 仍在合法范围内，`storyPage()` 正常渲染 | `journey.js:14` 取 `j.beats[s.index]` |
| J2 | 若 `state.story.index` 大于新 `beats.length-1` | **未保护**：`beat` 为 `undefined`，`journey.js:14` 的 `beat[0]` 会抛错 | `journey.js:14`；防护方案见 `02_single_level_plan.md` 待决断项 3 |
| J3 | 旧存档 `staminaVersion` 缺失 | 补 `stamina=100`、`staminaVersion=2` | `game.js:34` |

---

## 4. 未测项（如实列出）

以下项目本轮**没有覆盖**，需要 A 或后续轮次补：

1. **真实浏览器 localStorage**：`makeGame` 用的是内存 `Map`，不覆盖隐私模式 / 配额超限 / 多标签页同步 / Safari ITP 的写入限制。`save()` 的 `catch(e){}`（`game.js:66`）会静默吞掉写入失败，玩家无感知 —— 未验证失败时的表现。
2. **完整战斗闭环的胜负判定**：回归里用 `finishBattle(b,true/false)` 直接构造结果，**没有真的打到「敌方全灭 / 我方全灭 / 回合 >30」**（`game.js:657/658/661/662/664`）。真实路径下的触发时序未测。
3. **战斗循环内的对话**：本轮完全未实现，也未测（`01_current_anchor.md` 第 6 节）。
4. **剧情页 UI 表现**：13 条 `beats` 下的进度条文案、立绘切换（`artHTML(speaker,'story-art')`，`journey.js:16`）、`weather-mist` 的 18 个粒子元素、自动播放（5500ms，`journey.js:18`）在长节拍下的表现 —— 均未在浏览器实测。
5. **`advanceStory` 的自动播放定时器**：`scheduleStory()` 用 `setTimeout`，vm 里是假定时器；真实时序未测。
6. **旧存档越界**：J2 的越界保护未实现也未测。
7. **音效 / BGM 联动**：`bgm.js` / `audio-sfx.js` 在剧情页与战斗页的切换（`game.js:237–240`）未纳入回归。
8. **失败后原地重试的完整闭环**：`battle-return`（`game.js:849`）→ 再次 `enterStory` → 再战，未做端到端验证。
9. **精英难度**：`enterStory(1,'elite')` 路径只验证了「返回不扣体力」（`tests/game.test.mjs:146–152`）；精英下的敌军缩放（`game.js:287` ×1.38）、台词分支（CH-001 的 B22）本轮推迟，未测。
10. **名称不一致的影响**：战场内首位敌人显示「官军探哨」（`data/shuihu.js:193` → `game.js:288`），地图与剧情回退名是「巡粮哨长」（`data/journey.js:3`）。台词未点名该单位，因此本轮不触发；若后续要点名需先统一口径。
11. **Godot 侧**：`godot/**` 是否有并行剧情实现，未进入该目录核查。
12. **其余 30 个测试文件**：只打开了 `tests/game.test.mjs`、`tests/content-001.test.mjs`、`tests/cmd-003-gacha-p0.test.mjs`、`tests/vfx-001.test.mjs` 的片段，**未逐个确认**是否有其他断言会受 `beats` 变更影响。建议 A 落地后跑一次全量 `node --test tests/`。
13. **`b.result.lines` 的存档残留**：理论上 `battle-return` 会把 `state.battle` 置空（`game.js:849`），但**未验证**异常退出（如结算界面直接刷新）时 `lines` 是否会留在存档里。
14. **108 将中其余 100+ 位是否有立绘**：只定向验证了 `hero-001/003/006/009/013/022`、`enemy-vanguard`、`boss-gao-qiu`。

---

## 5. 建议的最小回归执行顺序

1. `node --test tests/` —— 先跑全量，确认 `tests/game.test.mjs:140` 等关键断言未被 beats 变更打断。
2. 补一条「第 1 关 beats 分段结构」的静态断言：哨兵行数量 === 2、开场段长度 === 5、胜利段 === 3、失败段 === 3、发言人 id 全在 `DATA.heroes` 中。
3. 补 1.2 / 1.3 / 1.4 三组存档断言（B / C / D）。
4. 补 2.2 / 2.3 的 `result.lines` 断言（G / H）。
5. 浏览器手工过一遍：进关 → 看完开场 → 通关 → 看胜利词 → 返回地图 → 重进 → 故意失败 → 看失败词 → 刷新。
