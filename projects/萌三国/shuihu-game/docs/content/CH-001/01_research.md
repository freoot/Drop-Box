# CH-001 · 现有设定盘点（只读调研）

> 调研方式：实读工程文件。每条结论标注来源文件与行号 / 关键字段名。
> 未能读到的统一写作「未读到，需 A 补充」。本步只读，未修改任何既有文件。

---

## 0. 读取清单与结果

| 目标文件 | 结果 |
|---|---|
| `GAME_DESIGN.md` | 已读（113 行） |
| `README.md` | 已读（108 行） |
| `data/journey.js` | 已读（9 行，6 个地点对象） |
| `data/hero-stories.js` | 已读（19 行） |
| `data/shuihu.js` | 按要求只读前 120 行；另用 `grep`/`sed` 定向取了 `CHAPTERS`（193–198 行）与 `bosses`（201–204 行）两段 |
| `docs/pipeline/02_gacha_desire_spec.md` D 节 | 已读（215–253 行） |
| `docs/content/` | **不存在**（`ls` 报 No such file or directory），本次为其下 CH-001 的首次写入 |
| 根目录 `journey.js` | 附带读到（非指定清单，用于确认剧情播放实现，5201 字节） |
| `game.js` | 附带定向读到 284–306 行（`enemiesFor`），用于确认每章敌军编成 |

未读到 / 未纳入的文件：`data/portraits.js`（仅 `grep` 取了敌军 id，未整体读）、`godot/**`、`docs/collaboration/**`、`tests/**`。这些不在指定清单内，本步不做结论。

---

## 1. 章节结构（主线）

### 1.1 主线是「6 段」，每段 1 场战斗

`data/shuihu.js:193–198` 定义 `CHAPTERS` 六项，字段为：

`id / name / title / brief / isBoss / bossId / terrain / enemyName / rewardHeroRank / reward{gold,grain,gearFragments} / normal / elite`

| id | name | isBoss | bossId | terrain | rewardHeroRank | reward |
|---|---|---|---|---|---|---|
| 1 | 山口初会 | false | null | 浅滩与芦苇 | 13（鲁智深） | gold 120 / grain 18 / gearFragments 3 |
| 2 | 雪夜风云 | true | boss-gao-qiu | 风雪官道 | 14（武松） | 150 / 20 / 4 |
| 3 | 黄泥冈奇谋 | false | null | 黄土山径 | 36（燕青） | 180 / 24 / 4 |
| 4 | 祝家庄鏖兵 | true | boss-zhu-chaofeng | 庄院与阵旗 | 59（扈三娘） | 210 / 26 / 5 |
| 5 | 曾头市追马 | true | boss-shi-wengong | 草场与箭台 | 30（张顺） | 250 / 30 / 5 |
| 6 | 江南风雷 | true | boss-fang-la | 江南石寨 | 37（朱武） | 300 / 36 / 6 |

`GAME_DESIGN.md:19–24` 的段落表与之一致，并额外给出首胜角色名（鲁智深 / 武松 / 燕青 / 扈三娘 / 张顺 / 朱武）与敌方机制描述。**首章 = id 1「山口初会」，不是 Boss 章。**

### 1.2 首章的敌军编成（实测推导）

`game.js:284–306` `enemiesFor(mode,stage,difficulty)`：

- `chapter.bossId` 为空（首章 `isBoss:false`）→ 走 **三单位固定编成**（`game.js:290–292`）：
  - `enemy-vanguard` 战士 hp116 atk27 move2 range1，坐标 (6,1)
  - `enemy-archer` 射手 hp88 atk24 move2 range3，坐标 (7,0)
  - `enemy-strategist` 谋士 hp94 atk22 move2 range3，坐标 (7,2)
- 显示名由 `names` 取自 `chapter.enemyName`（`game.js:288`）：首章为「官军探哨」+ 固定后缀「官军侧翼弓手」「官军传令兵」。
- 缩放：`scale = (1 + max(0, stage-1)*0.065) × (elite ? 1.38 : 1)`（`game.js:287`）。首章普通难度 `scale = 1.00`，精英 `1.38`。
- 有 Boss 的章走另一套四单位编成（含 `formationGuard` 阵旗护卫，`game.js:295–297`）。**首章拿不到这套，也拿不到 Boss 的 `cultivation` 奖励**（`bosses[].reward.cultivation`）。

### 1.3 山河路线图与剧情播放

`data/journey.js:3–8` 定义 `window.SHUIHU_JOURNEY` 六项，字段为：

`id / x / y / landmark / place / year / season / thread / lead / foe / foeName / weather / goal / hook / next / beats`

首章（第 3 行）取值：

- `id:1`、`x:18`、`y:30`、`landmark:'梁山水寨'`、`place:'梁山泊 · 芦苇渡'`
- `year:1119`、`season:'初秋'`、`thread:'聚义序章'`
- `lead:'hero-001'`、`foe:'enemy-vanguard'`、`foeName:'巡粮哨长'`、`weather:'mist'`
- `goal:'守住粮道，击退试探的官军。'`
- `hook:'一船救济粮未到，芦苇荡先传来了马蹄声。'`
- `next:'缴获的文书提起一桩旧案。林冲望着火光，讲起那场雪。'`
- `beats`：3 条，形如 `['旁白','…']`、`['hero-001','…']`、`['hero-009','…']`

播放实现（根目录 `journey.js`）：

- `campaignMapPage()`（第 3 行）：用 `CHAPTERS[selected-1]` 取奖励展示，用 `JOURNEY[selected-1]` 取文案，**两者靠下标对齐**，没有外键。
- `enterStory(stage,difficulty)`（第 7 行）：校验 `stage <= state.stageUnlocked` 与 `stamina >= campaignCost`，写入 `state.story = {stage,difficulty,index:0,autoplay:false}`。
- `storyPage()`（第 8 行）：`beat = j.beats[s.index]`；说话人 `beat[0]==='旁白'` 时无立绘，否则 `heroMeta(beat[0])`；显示名从 `DATA.heroes` 或 `BOSSES` 找 `name`，都找不到则回退 `j.foeName`。
- `advanceStory(skip)`（第 11 行）：线性 `index++`，最后一拍或跳过后 `startBattle('campaign',s.stage,0,s.difficulty)`。
- 返回地图不扣军令（`README.md:21`、`GAME_DESIGN.md:28`），真进战场才扣：`game.js:319` `state.stamina -= campaignCost(difficulty)`。

### 1.4 战斗与胜负的既有规则（首章会用到的部分）

- 棋盘 8×4 正交格，曼哈顿距离（`GAME_DESIGN.md:52`）。
- 自由布阵：我方可在**左侧三列**调整站位，「布阵完成 · 开战」才触发开场被动与合击（`GAME_DESIGN.md:53`）。
- 职业克制：战士克射手、射手克谋士、谋士克战士，1.35 / 0.78 / 1.00（`GAME_DESIGN.md:56`）。
- 胜利条件 = 敌军全灭；我方全灭 = 失败；超 30 回合本次挑战结束（`GAME_DESIGN.md:60–61`）。
- 军令：上限 100，普通 2、精英 5，20 粮草补满，本机次日恢复（`GAME_DESIGN.md:67`、`README.md:28`）。
- 精英额外机制：回合结束预告最靠前好汉所在列，下一敌方回合该列受 18% 生命上限伤害，护盾可吸收（`GAME_DESIGN.md:67`）。
- 暴击：每次命中独立 20%、×1.5（`GAME_DESIGN.md:112`）。

---

## 2. 已有好汉（首章可用）

### 2.1 id 格式与席位

- 好汉 id 形如 `hero-001`…`hero-108`（三位补零），由 `seats` 数组下标 +1 生成；`seats` 每项 `[name, star, epithet]`（`data/shuihu.js:18–32`）。
- 首章相关席位（按 `seats` 顺序点算）：`hero-001` 宋江、`hero-003` 吴用、`hero-006` 林冲、`hero-009` 花荣、`hero-013` 鲁智深、`hero-022` 李逵。
- `startingSeats = [1,3,6,9,22]`（`data/shuihu.js:36`）→ **初始五将 = 宋江、吴用、林冲、花荣、李逵**。
- `storySeats`（`data/shuihu.js:37`）：`[[13,'第一章首胜'],[14,'第二章首胜'],[36,'第三章首胜'],[59,'第四章首胜'],[30,'第五章首胜'],[37,'第六章首胜']]` → 首章首胜角色 = **hero-013 鲁智深**。

### 2.2 首章可复用的人物（绰号 · 姓名）

| id | 绰号 · 姓名 | 席位 | 职业（派生） | 品质（派生） | 首章可用性 |
|---|---|---|---|---|---|
| hero-001 | 及时雨 · 宋江 | 1 | 谋士（`strategistSeats` 含 1） | 暗金（`darkSeats` 含 1） | 初始在队，且为 `JOURNEY[0].lead` |
| hero-003 | 智多星 · 吴用 | 3 | 谋士 | 暗金 | 初始在队 |
| hero-006 | 豹子头 · 林冲 | 6 | 战士 | 暗金 | 初始在队 |
| hero-009 | 小李广 · 花荣 | 9 | 射手（`archerSeats` 含 9） | 暗金 | 初始在队，且已出现在首章现有 `beats` 第 3 拍 |
| hero-022 | 黑旋风 · 李逵 | 22 | 战士 | 暗金 | 初始在队 |
| hero-013 | 花和尚 · 鲁智深 | 13 | 战士 | 暗金 | 首章首胜后加入（`rewardHeroRank:13`） |

职业派生规则见 `data/shuihu.js:63`：`archerSeats` → 射手，否则 `strategistSeats` → 谋士，否则战士。品质派生见同区：`darkSeats` → diamond，`redSeats` → red，`rank<=72` → purple，否则 blue。

### 2.3 已有故事条目（`data/hero-stories.js`）

`window.SHUIHU_STORIES` 以 `hero-NNN` 为键，值结构 `{title, text, thread}`。**实测共 15 条**（第 3–17 行）：

`hero-058` 王英、`hero-014` 武松、`hero-006` 林冲、`hero-013` 鲁智深、`hero-009` 花荣、`hero-003` 吴用、`hero-001` 宋江、`hero-004` 公孙胜、`hero-002` 卢俊义、`hero-005` 关胜、`hero-007` 秦明、`hero-008` 呼延灼、`hero-010` 柴进、`hero-011` 李应、`hero-012` 朱仝。

首章六人中，**hero-001 / 003 / 006 / 009 / 013 有条目，hero-022（李逵）没有**。

`heroStoryHTML`（第 19 行）提供回退：无条目时用 `{title: epithet+' · '+name, text: h.bio, thread:'结识好汉 · 聚义梁山'}`；并对 `hero-014` 默认展开 `<details>`。

与武松相关的条目（`data/hero-stories.js:4`，`hero-014`《景阳冈上，一拳惊山》）明确：打虎地点为**景阳冈**，`thread` 为「景阳冈打虎 → 阳谷任都头 → 孟州风波 → 二龙山聚义」。

### 2.4 抽卡侧与首章的挂钩（`docs/pipeline/02_gacha_desire_spec.md` D 节）

- D.1（第 219 行）：首胜按 `storySeats` 发放 6 位好汉（鲁智深/武松/燕青/扈三娘/张顺/朱武）；抽卡与征战目前是两条平行线。
- D.1（第 220 行）：将册无总量进度，「图鉴」在代码里仅指「合击图鉴」。
- D.2（第 228 行）：建议在抽到新将时导流「看他的故事」，文中记为 **16 篇**已有；与本文实测的 15 条不一致（见第 5 节缺口 G-15）。
- D.3（第 243 行）：点击未获得卡应显示获取途径，含 `剧情首胜（第 N 章）`。
- D.4（第 252 行）：建议首胜给玉璧，形成「打赢 → 抽 → 变强 → 打赢」闭环。

---

## 3. 可复用的接口字段汇总

### 3.1 剧情侧（`data/journey.js` + 根目录 `journey.js`）

| 字段 | 位置 | 可否直接用于首章节拍 |
|---|---|---|
| `beats: [[speaker, text], …]` | `data/journey.js:3` | 可，但仅二元组、无触发条件 |
| `speaker ∈ {'旁白'} ∪ hero-* ∪ boss-*` | 根目录 `journey.js:8` | 可，范围受限 |
| `weather ∈ mist/snow/leaves/wind/rain` | `data/journey.js:3` | 可（首章 `mist`），驱动 `weather-${j.weather}` 样式类 |
| `goal` / `hook` / `next` | `data/journey.js:3` | 可，作为关前目标与关后引子文案 |
| `x / y` | `data/journey.js:3` | 可，同时作为地图节点定位与剧情页 `--focus-x/--focus-y` |
| `state.story {stage,difficulty,index,autoplay}` | 根目录 `journey.js:7` | 可，作为播放游标 |
| `advanceStory(skip)` | 根目录 `journey.js:11` | 可，但为线性 `index++` |

### 3.2 战斗侧（`data/shuihu.js` + `game.js`）

| 字段 | 位置 | 说明 |
|---|---|---|
| `CHAPTERS[].rewardHeroRank` | `data/shuihu.js:193` | 首章首胜角色席位，剧情「入队」演出需挂在此 |
| `CHAPTERS[].reward` | `data/shuihu.js:193` | 三档资源，无修为、无玉璧 |
| `CHAPTERS[].terrain` | `data/shuihu.js:193` | 仅文案字段，未参与战斗逻辑（`game.js:284–306` 未见引用） |
| `enemy-vanguard / enemy-archer / enemy-strategist` | `game.js:290–292` | 首章三单位编成，可整体复用 |
| `scale` 公式 | `game.js:287` | 关卡强度建议区间需基于此换算 |
| `difficulty ∈ normal/elite` | 根目录 `journey.js:7` | 可用于难度分支文案 |
| `state.clearedStages` / `state.stageUnlocked` | 根目录 `journey.js:3` | 进度判定，失败重试不清除 |

### 3.3 人物侧

| 字段 | 位置 | 说明 |
|---|---|---|
| `hero-NNN` id | `data/shuihu.js:18–32` | 剧情说话人主键 |
| `epithet` / `name` | 同上 `seats` | 拼装「绰号 · 姓名」显示名 |
| `SHUIHU_STORIES[hero-NNN].title/text/thread` | `data/hero-stories.js:3–17` | 图鉴/入队演出的现成文案源 |
| `BOSSES[].id/name/epithet/mechanicName/strategy/reward` | `data/shuihu.js:201–204` | 首章无 Boss，但说话人解析链路会用到 `BOSSES.find` |

---

## 4. 首章剧情需要的、但现有数据没有的东西

见第 5 节「接口缺口清单」。

## 5. 接口缺口清单（共 15 条）

> 编号 G-01 … G-15，共 15 条。其中 G-14、G-15 属于口径与串台风险记录，不阻塞首章开发。每条给出：缺口 / 证据 / 对首章的影响。

**G-01 · 每章只有 1 场战斗，没有子关卡数组。**
证据：`data/shuihu.js:193–198` 的 `CHAPTERS` 每项是扁平的单关对象，无 `stages` 字段；`game.js:284` `enemiesFor` 以 `CHAPTERS[stage-1]` 单点取数；`state.stage` 直接等于 1–6。
影响：首章若要做「多关节拍推进」，节拍无处挂载。

**G-02 · `beats` 只有 3 条、线性、无触发条件字段。**
证据：`data/journey.js:3` 的 `beats` 是 `[speaker, text]` 二元组数组；根目录 `journey.js:11` `advanceStory` 只做 `index++`，第 8 行以 `s.index` 取拍。
影响：无法表达「第 N 回合开始」「某敌半血」「我方有人倒下」这类触发点。

**G-03 · 战斗中没有任何剧情通道。**
证据：根目录 `journey.js:8–11` 的 `storyPage/advanceStory` 只在战前播放，最后一拍即 `startBattle`；`game.js` 战斗循环内未见对话触发点（本步仅定向读 284–320 行，未做全文断言）。
影响：所有「战中台词」无处落地。

**G-04 · 说话人只支持 `旁白` / `hero-*` / `boss-*`，且失败回退到 `foeName`。**
证据：根目录 `journey.js:8` `heroMeta(beat[0])` + `DATA.heroes.find` + `BOSSES.find` + 回退 `j.foeName`。
影响：首章的敌方小兵「巡粮哨长」（`foe:'enemy-vanguard'`）没有独立 id 可当说话人；尚未入队的 hero-013（鲁智深）若要在首章第 3 拍前说话，需要确认 `heroMeta` 是否对未入队角色成立（本步未验证）。

**G-05 · 无分支字段。**
证据：`beats` 二元组无 `branch / choices / next`；`advanceStory` 无分支跳转。
影响：首次进入 vs 重打、普通 vs 精英、成功 vs 失败，无法走不同台词。

**G-06 · 无失败文案与重试文案字段。**
证据：`CHAPTERS` 与 `JOURNEY` 均无 `onLose` 之类字段。
影响：失败分支只能靠通用结算界面，无法给「粮道仍在那儿，整队再战」这类叙事收束。

**G-07 · 胜利条件硬编码为「敌军全灭」，无目标类型字段。**
证据：`GAME_DESIGN.md:60`「胜利条件为敌军全灭；我方全灭则失败」；`CHAPTERS` 无 `objective` 字段。
影响：首章想要的「护住粮车 / 守住 N 回合 / 至少 n 人存活」这类目标无法实现，只能降级为歼灭。

**G-08 · 无「入队 / 离队」事件字段。**
证据：`data/shuihu.js:37` `storySeats` 是 `Map([[13,'第一章首胜'], …])` 硬编码；`CHAPTERS[].rewardHeroRank` 只有席位号。
影响：「花和尚 · 鲁智深加入山寨」这一拍无法在特定节拍演出。

**G-09 · 首章无 Boss，因此拿不到 `cultivation`（修为）与玉璧奖励。**
证据：`bosses[].reward` 含 `cultivation`（`data/shuihu.js:201–204`），首章 `bossId:null`；`CHAPTERS[].reward` 只有 `gold/grain/gearFragments`（第 193 行）。
影响：`02_gacha_desire_spec.md:252` 建议的「首胜给玉璧」在首章无落地字段。

**G-10 · 章与剧情靠下标对齐，没有 `chapterId` 外键。**
证据：根目录 `journey.js:3` 同时取 `CHAPTERS[selected-1]` 与 `JOURNEY[selected-1]`。
影响：一旦章节增删或重排，剧情会错位；也不利于外部数据（如本 CH-001 目录）以 id 引用。

**G-11 · `weather` 与 `terrain` 分属两套数据，互不影响战斗。**
证据：`weather` 在 `data/journey.js:3`，`terrain` 在 `data/shuihu.js:193`；`game.js:284–306` 未引用 `terrain`。
影响：首章「浅滩与芦苇」的地形若想产生玩法效果（减速、遮蔽），需要新字段与新逻辑。

**G-12 · 精英与普通共用同一套 `beats`。**
证据：根目录 `journey.js:7` `enterStory` 把 `difficulty` 只存进 `state.story`，第 8 行取拍时未使用。
影响：精英难度的额外预警机制（18% 列伤）没有对应台词提示位。

**G-13 · 失败后重试的军令消耗规则未区分「首通 / 重试」。**
证据：`game.js:319` 每次 `startBattle('campaign', …)` 都扣 `campaignCost(difficulty)`；未见首章失败免扣的分支（本步仅定向读到 320 行）。
影响：教学性质的首章若多次失败，会持续扣军令，与「失败不清除进度、允许重试」的体验目标可能冲突。

**G-14 · 地标与故事存在潜在串台：`景阳冈` 被挂在了「黄泥冈」地点上。**
证据：`data/journey.js:5`（id:3）`landmark:'景阳冈'` 但 `place:'黄泥冈 · 松林古道'`、`foeName:'押运队长'`、`beats` 讲的是智取生辰纲；而 `data/hero-stories.js:4` 的 `hero-014`（武松）明确打虎地点是**景阳冈**。
影响：首章不直接受影响，但首章之后的第二章首胜是武松（席位 14），若沿用该地标命名会与武松故事冲突。

**G-15（补充，非首章阻塞项）· 故事条目数量口径不一致。**
证据：`data/hero-stories.js:3–17` 实测 15 条；`docs/pipeline/02_gacha_desire_spec.md:228` 记为 16 篇。
影响：首章不涉及，但影响图鉴导流文案的「已有 N 篇」口径。

---

## 6. 调研未覆盖、需 A 补充的内容

- `heroMeta()` 对**未入队**好汉（如首章尚未加入的 hero-013）的行为：未读到，需 A 补充。
- `game.js` 战斗循环内是否已有任何对话/播报钩子：只定向读了 284–320 行，未做全文确认，需 A 补充。
- `data/portraits.js` 中 `enemy-vanguard` 立绘能否直接用作「巡粮哨长」的剧情立绘：只 `grep` 到 id 存在（2 处），未读内容，需 A 补充。
- Godot 侧 `godot/journey_map` 是否已消费 `beats` 字段：未读到，需 A 补充。
- 首章是否已有任何现成的教学引导文案（除 `GAME_DESIGN.md:19` 那句「用于教学」外）：未读到，需 A 补充。
