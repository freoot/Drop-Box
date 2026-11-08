# CH-001 · 章节剧情数据接口草案

> 本文只写**数据结构草案与映射关系**，不改任何代码。所有新增字段标注为「需 A 新增」，并给出最小字段集。
> 现状结构的判断依据：`data/journey.js:3–8`、`data/shuihu.js:193–198`、`game.js:284–306`、根目录 `journey.js:3–11`（见 `01_research.md`）。

---

## 1. 设计原则

1. **向后兼容**：现有 `window.SHUIHU_JOURNEY` 的 `beats` 二元组继续可用，新增结构作为**附加层**，不替换。
2. **最小侵入**：优先在 `JOURNEY[i]`（或平行的新数组）上挂一个 `script` 字段；只有当某能力确实无法由附加层表达时，才提出对 `CHAPTERS` 的字段新增。
3. **键对齐**：新结构以 `chapterId` 为主键，与 `CHAPTERS[].id`、`JOURNEY[].id` 同值（首章为 `1`），不再依赖数组下标（对应缺口 G-10）。

---

## 2. 章节配置 JSON 草案（完整示例，首章）

```json
{
  "chapterId": 1,
  "chapterName": "山口初会",
  "thread": "聚义序章",
  "weather": "mist",
  "terrain": "浅滩与芦苇",
  "stages": [
    {
      "stageId": "CH-001-S1",
      "index": 1,
      "name": "渡口哨探",
      "unlock": { "type": "chapterEnter" },
      "staminaCost": { "normal": 2, "elite": 5 },
      "objective": {
        "type": "annihilate",
        "params": {}
      },
      "fail": {
        "type": "any",
        "conditions": [
          { "type": "alliesDown" },
          { "type": "turnLimit", "turns": 20 }
        ],
        "retry": {
          "allowed": true,
          "limit": null,
          "keepProgress": true,
          "refundStamina": true
        }
      },
      "enemies": [
        { "unit": "enemy-vanguard",   "name": "官军探哨",     "x": 6, "y": 1, "hpScale": 1.0, "atkScale": 1.0 },
        { "unit": "enemy-archer",     "name": "官军侧翼弓手", "x": 7, "y": 0, "hpScale": 1.0, "atkScale": 1.0 }
      ],
      "dialogue": [
        { "beat": "B01", "trigger": { "phase": "pre", "event": "index", "value": 0 }, "speaker": "narrator", "text": "公元 1119 年，秋。梁山水泊起了薄雾，一船送往村落的粮食迟迟未归。" },
        { "beat": "B02", "trigger": { "phase": "pre", "event": "index", "value": 1 }, "speaker": "hero-001",  "text": "粮能再筹，人不能不救。先守住渡口，让乡亲们过河。" },
        { "beat": "B03", "trigger": { "phase": "pre", "event": "index", "value": 2 }, "speaker": "hero-009",  "text": "芦苇后有人张弓。大家分开走，别挤在一条粮道上。" },
        { "beat": "B04", "trigger": { "phase": "pre", "event": "index", "value": 3 }, "speaker": "hero-022",  "text": "磨蹭什么？俺先冲过去，砍了那几个哨探！", "branch": { "key": "firstEntry", "equals": true } },
        { "beat": "B05", "trigger": { "phase": "pre", "event": "index", "value": 4 }, "speaker": "hero-003",  "text": "且慢。刀斧近身，弓箭在后，传令的居中——让他们各归各位，才打得省力。", "branch": { "key": "firstEntry", "equals": true } },
        { "beat": "B22", "trigger": { "phase": "pre", "event": "index", "value": 3 }, "speaker": "hero-003",  "text": "这一回他们早有防备。瞧见地上那道红印，就赶紧挪开身子。", "branch": { "key": "difficulty", "equals": "elite" } },
        { "beat": "B06", "trigger": { "phase": "battle", "event": "turnStart", "value": 2, "once": true }, "speaker": "hero-006", "text": "弓手站在后排，让他们先够不着我的人。" },
        { "beat": "B07", "trigger": { "phase": "battle", "event": "enemyLeft", "value": 1, "once": true }, "speaker": "hero-009", "text": "剩一个了，交给我。" },
        { "beat": "B08", "trigger": { "phase": "post", "event": "win" }, "speaker": "narrator", "text": "渡口安静下来。芦苇后露出半截粮船的桅杆，绳上还系着村里的记号。" },
        { "beat": "B08L", "trigger": { "phase": "post", "event": "lose" }, "speaker": "hero-001", "text": "不急。看清他们的站位，再来一次。" }
      ]
    },
    {
      "stageId": "CH-001-S2",
      "index": 2,
      "name": "芦苇浅滩",
      "unlock": { "type": "stageCleared", "stageId": "CH-001-S1" },
      "staminaCost": { "normal": 2, "elite": 5 },
      "objective": {
        "type": "annihilateWithSurvivors",
        "params": { "minAlliesAlive": 2 }
      },
      "fail": {
        "type": "any",
        "conditions": [
          { "type": "alliesDown" },
          { "type": "alliesAliveBelow", "count": 2 },
          { "type": "turnLimit", "turns": 25 }
        ],
        "retry": { "allowed": true, "limit": null, "keepProgress": true, "refundStamina": true }
      },
      "enemies": [
        { "unit": "enemy-vanguard",     "name": "官军探哨",     "x": 6, "y": 1, "hpScale": 1.0, "atkScale": 1.0 },
        { "unit": "enemy-archer",       "name": "官军侧翼弓手", "x": 7, "y": 0, "hpScale": 1.0, "atkScale": 1.0 },
        { "unit": "enemy-strategist",   "name": "官军传令兵",   "x": 7, "y": 2, "hpScale": 1.0, "atkScale": 1.0 }
      ],
      "reinforcements": [
        { "beat": "B13", "heroId": "hero-013", "atTurn": 4, "eliteAtTurn": 3, "x": 0, "y": 3, "temporary": true }
      ],
      "dialogue": [
        { "beat": "B09", "trigger": { "phase": "pre", "event": "index", "value": 0 }, "speaker": "narrator",  "text": "浅滩水浅泥深，粮车只能沿一条窄道推行。路窄，人也挤。" },
        { "beat": "B10", "trigger": { "phase": "pre", "event": "index", "value": 1 }, "speaker": "hero-003",  "text": "路只有一条，就别都往前挤。护住后面的，我们才走得远。" },
        { "beat": "B11", "trigger": { "phase": "battle", "event": "turnStart", "value": 3, "once": true }, "speaker": "enemy:官军侧翼弓手", "text": "放箭！先射拉车的！" },
        { "beat": "B12", "trigger": { "phase": "battle", "event": "allyDown", "once": true }, "speaker": "hero-001", "text": "先救人，粮可以再运。" },
        { "beat": "B13", "trigger": { "phase": "battle", "event": "turnStart", "value": 4, "once": true }, "speaker": "hero-013", "text": "洒家来迟！这条道，谁也别想过去。" },
        { "beat": "B14", "trigger": { "phase": "post", "event": "win" }, "speaker": "hero-013", "text": "酒肉管够便成。这条道，俺替你们守一程。" },
        { "beat": "B14L", "trigger": { "phase": "post", "event": "lose" }, "speaker": "hero-003", "text": "路窄，得多留一个人照应后头。重新排过。" }
      ]
    },
    {
      "stageId": "CH-001-S3",
      "index": 3,
      "name": "粮道收尾",
      "unlock": { "type": "stageCleared", "stageId": "CH-001-S2" },
      "staminaCost": { "normal": 2, "elite": 5 },
      "objective": {
        "type": "annihilate",
        "params": { "mustKill": ["巡粮哨长"] }
      },
      "fail": {
        "type": "any",
        "conditions": [
          { "type": "alliesDown" },
          { "type": "turnLimit", "turns": 30 }
        ],
        "retry": { "allowed": true, "limit": null, "keepProgress": true, "refundStamina": true }
      },
      "enemies": [
        { "unit": "enemy-vanguard",   "name": "巡粮哨长",     "x": 7, "y": 1, "hpScale": 1.45, "atkScale": 1.05, "elite": false },
        { "unit": "enemy-archer",     "name": "官军侧翼弓手", "x": 7, "y": 0, "hpScale": 1.0,  "atkScale": 1.0 },
        { "unit": "enemy-strategist", "name": "官军传令兵",   "x": 7, "y": 2, "hpScale": 1.0,  "atkScale": 1.0 }
      ],
      "dialogue": [
        { "beat": "B15", "trigger": { "phase": "pre", "event": "index", "value": 0 }, "speaker": "narrator", "text": "哨长退进芦苇深处，把抢去的粮袋堆成了掩体。" },
        { "beat": "B16", "trigger": { "phase": "pre", "event": "index", "value": 1 }, "speaker": "hero-001", "text": "把粮夺回来。人，不必赶尽。" },
        { "beat": "B17", "trigger": { "phase": "battle", "event": "enemyHpBelow", "target": "巡粮哨长", "value": 0.35, "once": true }, "speaker": "enemy:巡粮哨长", "text": "你们……过不去这芦苇荡。" },
        { "beat": "B18", "trigger": { "phase": "battle", "event": "turnStart", "value": 5, "once": true }, "speaker": "hero-013", "text": "让开，俺来开路。", "branch": { "key": "flag", "equals": "B13_fired" } },
        { "beat": "B19", "trigger": { "phase": "post", "event": "win" }, "speaker": "hero-013", "text": "从今往后，这条粮道有俺一份。" },
        { "beat": "B20", "trigger": { "phase": "post", "event": "win" }, "speaker": "narrator", "text": "花和尚 · 鲁智深加入山寨。缴获的文书提起一桩旧案，林冲望着火光，讲起那场雪。" },
        { "beat": "B21", "trigger": { "phase": "post", "event": "lose" }, "speaker": "narrator", "text": "粮车退回渡口，哨探也散了。整队再战——粮道仍在那儿。" }
      ],
      "rewards": {
        "firstClearOnly": true,
        "heroRank": 13,
        "gold": 120,
        "grain": 18,
        "gearFragments": 3,
        "cultivation": null,
        "jadeToken": null
      },
      "events": [
        { "type": "heroJoin", "heroId": "hero-013", "at": "post:win", "afterBeat": "B20" }
      ]
    }
  ],
  "chapterRewards": {
    "firstClearOnly": true,
    "heroRank": 13,
    "gold": 120,
    "grain": 18,
    "gearFragments": 3
  },
  "chapterEvents": [
    { "type": "unlockNextChapter", "chapterId": 2, "at": "post:win", "stageId": "CH-001-S3" }
  ]
}
```

---

## 3. 字段说明

### 3.1 章节层

| 字段 | 类型 | 说明 | 现状对应 |
|---|---|---|---|
| `chapterId` | number | 与 `CHAPTERS[].id`、`JOURNEY[].id` 同值 | `data/shuihu.js:193` `id`、`data/journey.js:3` `id`（**需 A 新增显式外键**，G-10） |
| `chapterName` | string | 「山口初会」 | `data/shuihu.js:193` `name` |
| `thread` | string | 「聚义序章」 | `data/journey.js:3` `thread` |
| `weather` | string | `mist` | `data/journey.js:3` `weather` |
| `terrain` | string | 「浅滩与芦苇」，现状仅文案 | `data/shuihu.js:193` `terrain` |
| `stages[]` | array | 子关卡数组 | **需 A 新增**（G-01） |
| `chapterRewards` | object | 章节级奖励 | `data/shuihu.js:193` `reward` + `rewardHeroRank`（**部分需新增**，见 3.4） |
| `chapterEvents[]` | array | 章节级事件（解锁下一章等） | **需 A 新增**（G-08） |

### 3.2 关卡层 `stages[]`

| 字段 | 类型 | 说明 | 现状对应 |
|---|---|---|---|
| `stageId` | string | 「CH-001-S1」形式的稳定 id | **需 A 新增**（G-01） |
| `index` | number | 关内序号 1..n | **需 A 新增** |
| `name` | string | 关名 | **需 A 新增**（现有只有章名） |
| `unlock` | object | `chapterEnter` / `stageCleared` | `enterStory` 的 `stage <= state.stageUnlocked`（根目录 `journey.js:7`），**需扩展为子关粒度** |
| `staminaCost` | object | `{normal, elite}` | `campaignCost(difficulty)`，现状按难度固定 2/5，**可沿用不改** |
| `objective` | object | 胜利条件与参数 | **需 A 新增**（G-07），现状硬编码歼灭 |
| `fail` | object | 失败条件 + `retry` 策略 | **需 A 新增**（G-06、G-13） |
| `enemies[]` | array | 敌军名单与坐标/缩放 | `game.js:290–292` 的三单位硬编码 + `game.js:287` 的 `scale`，**需扩展为可配置**（G-01） |
| `reinforcements[]` | array | 中途增援（含 `heroId`、`atTurn`） | **需 A 新增** |
| `dialogue[]` | array | 节拍数组，见 3.3 | `data/journey.js:3` `beats`，**需扩展**（G-02、G-03、G-05） |
| `rewards` | object | 关卡级奖励 | `data/shuihu.js:193` `reward` |
| `events[]` | array | 关卡级事件（如 `heroJoin`） | **需 A 新增**（G-08） |

### 3.3 节拍层 `dialogue[]`

| 字段 | 类型 | 说明 | 现状对应 |
|---|---|---|---|
| `beat` | string | 节拍号，如 `B01` | 现状无 id，靠数组下标（根目录 `journey.js:8` `s.index`） |
| `trigger.phase` | enum | `pre` / `battle` / `post` | 现状只有 `pre`（根目录 `journey.js:8–11`），`battle` 与 `post` **需 A 新增**（G-03） |
| `trigger.event` | enum | `index` / `turnStart` / `enemyLeft` / `enemyHpBelow` / `allyDown` / `win` / `lose` | 现状只有隐式 `index++`，其余 **需 A 新增**（G-02） |
| `trigger.value` | number/string | 触发阈值，如回合数、血量比例、目标名 | **需 A 新增** |
| `trigger.once` | boolean | 一场内只触发一次 | **需 A 新增** |
| `speaker` | string | `narrator` / `hero-NNN` / `enemy:<显示名>` | 现状 `旁白` 与 `hero-*`（根目录 `journey.js:8`）；`enemy:` 前缀与 `narrator` 常量 **需 A 新增或映射**（G-04） |
| `text` | string | 台词 | 现有 `beats[i][1]` |
| `branch` | object | `{key, equals}`，`key ∈ firstEntry / difficulty / flag` | **需 A 新增**（G-05） |

**说话人命名建议**：沿用现有 `hero-NNN` 主键不变，只把 `旁白` 显式化为 `narrator` 常量；敌方用 `enemy:<name>` 前缀，由 A 决定是解析成 `enemy-vanguard` 还是直接当无立绘的纯文本条。

### 3.4 奖励层 `rewards`

| 字段 | 类型 | 首章取值 | 现状对应 |
|---|---|---|---|
| `firstClearOnly` | boolean | `true` | `GAME_DESIGN.md:67`「首领修为和固定同伴仅在该章节首次通关时发放」 |
| `heroRank` | number | `13` | `data/shuihu.js:193` `rewardHeroRank` / `data/shuihu.js:37` `storySeats` |
| `gold` / `grain` / `gearFragments` | number | `120` / `18` / `3` | `data/shuihu.js:193` `reward` |
| `cultivation` | number \| null | `null` | `bosses[].reward.cultivation`（`data/shuihu.js:201–204`）；首章无 Boss，故为 null（G-09） |
| `jadeToken` | number \| null | `null` | `02_gacha_desire_spec.md:252` 建议首胜给玉璧；**字段不存在，需 A 新增**（G-09） |

---

## 4. 与现有 `data/journey.js` 的映射表

### 4.1 直接沿用（零改动）

| 新字段 | 现有来源 | 映射方式 |
|---|---|---|
| `chapterId` | `JOURNEY[i].id` | 等值 |
| `thread` | `JOURNEY[i].thread` | 等值 |
| `weather` | `JOURNEY[i].weather` | 等值 |
| `chapterName` | `CHAPTERS[i].name` | 等值 |
| `terrain` | `CHAPTERS[i].terrain` | 等值 |
| `rewards.heroRank` | `CHAPTERS[i].rewardHeroRank` | 等值 |
| `rewards.gold/grain/gearFragments` | `CHAPTERS[i].reward.*` | 等值 |
| `B01/B02/B03` | `JOURNEY[i].beats[0..2]` | `beats[n][0] → speaker`（`旁白`→`narrator`）、`beats[n][1] → text`、`trigger = {phase:'pre', event:'index', value:n}` |
| 章末引子（B20 第二句） | `JOURNEY[i].next` | 作为 `post:win` 的追加文本，或保留在现有位置 |

### 4.2 需要 A 新增的**最小字段集**

> 目标：让 `02_chapter_beats.md` 的全部节拍可落地。按优先级排序，P0 为「单关降级方案」也必须有的部分。

**P0（即使首章只做 1 场战斗也需要）**

| # | 新增字段 | 加在哪 | 解决缺口 | 说明 |
|---|---|---|---|---|
| 1 | `dialogue[]`（含 `beat`/`trigger`/`speaker`/`text`/`branch`） | `JOURNEY[i].script.dialogue` 或新数组 `window.SHUIHU_CHAPTER_SCRIPT[chapterId]` | G-02 / G-03 / G-05 | 现有 `beats` 二元组保持不变作为回退；播放逻辑优先读 `dialogue[]`。`trigger.phase` 为 `pre` 时行为与现状完全一致 |
| 2 | `speaker` 支持 `narrator` 常量与 `enemy:<name>` 前缀 | 显示名解析（根目录 `journey.js:8`） | G-04 | 未匹配时保留现有回退 `j.foeName` |
| 3 | 显示名改为「绰号 · 姓名」 | 显示名解析（根目录 `journey.js:8` 现取 `name`） | — | 取 `epithet + ' · ' + name`；`epithet` 已在 `data/shuihu.js:18–32` 的 `seats` 中 |
| 4 | `fail` 文案：`post:lose` 的 `dialogue` 项 | 同 #1 | G-06 | 结算界面读 `phase:'post', event:'lose'` 的拍 |
| 5 | `retry.refundStamina`（建议 `true`） | `stages[].fail.retry` 或章节级 | G-13 | A 可先不做；不做时按现状「每次进场均扣军令」 |

**P1（首章做 3 关才需要）**

| # | 新增字段 | 加在哪 | 解决缺口 | 说明 |
|---|---|---|---|---|
| 6 | `stages[]`（`stageId`/`index`/`name`/`unlock`/`enemies[]`/`dialogue[]`/`rewards`） | `CHAPTERS[i].stages` 或 `script.stages` | G-01 | 每关一份 `dialogue[]`；`enemies[]` 元素可直接复用 `game.js:290–292` 的单位形状再加 `hpScale/atkScale` |
| 7 | 战斗中触发通道：订阅 `turnStart` / `enemyLeft` / `enemyHpBelow` / `allyDown` | 战斗循环（`game.js` 内） | G-03 | 最小实现：在回合开始与每次伤害结算后各做一次节拍匹配，`once` 标记防重复 |
| 8 | 子关进度位（如 `state.clearedStages['CH-001-S2']`） | 存档 | G-01 | 现状 `state.clearedStages[p.id]` 只到章粒度 |
| 9 | `reinforcements[]`（`heroId` / `atTurn` / `eliteAtTurn` / 落点坐标 / `temporary`） | `stages[]` | — | 用于 B13 的鲁智深来援；`temporary:true` 表示仅本场在场上 |
| 10 | `events[]`，含 `{type:'heroJoin', heroId, at, afterBeat}` | `stages[]` / 章节级 | G-08 | 把「花和尚 · 鲁智深加入山寨」从纯数据奖励变成有演出的事件 |

**P2（非阻塞，可后续）**

| # | 新增字段 | 加在哪 | 解决缺口 |
|---|---|---|---|
| 11 | `objective.type` 与 `params`（`annihilate` / `annihilateWithSurvivors` / `protect` / `surviveTurns`） | `stages[]` | G-07 |
| 12 | `rewards.cultivation` / `rewards.jadeToken` | `stages[].rewards` | G-09 |
| 13 | `chapterId` 显式外键替代下标对齐 | `JOURNEY` 与 `CHAPTERS` 的关联方式 | G-10 |
| 14 | `terrain` 参与战斗（减速/遮蔽）的可选字段 | `stages[]` | G-11 |
| 15 | `branch.key = 'difficulty'` 的精英专属拍（B22） | `dialogue[]` | G-12 |

### 4.3 现有结构**不支持**的能力（明确列出，不由本组改代码）

1. **多子关**：`CHAPTERS` 是扁平单关，`state.stage` 只有 1–6。必须新增 `stages[]` 与子关进度位。
2. **战中对话**：现有 `storyPage` 只在战前跑，最后一拍直接 `startBattle`（根目录 `journey.js:11`）。必须新增战斗循环侧的节拍订阅。
3. **胜利条件多样化**：`GAME_DESIGN.md:60` 写明「胜利条件为敌军全灭」。「存活 ≥ 2」这类条件需要新的判定分支；在 A 实现前，`02_chapter_beats.md` 的 S2 目标降级为「敌军全灭」。
4. **敌方单位作为说话人**：现有说话人解析链只认 `hero-*` 与 `boss-*`（根目录 `journey.js:8`），「巡粮哨长」是 `enemy-vanguard` 的显示名，没有 id。要么新增 `enemy:` 前缀解析，要么这类台词退化为无立绘文本条。
5. **未入队好汉的立绘/显示名**：B13/B18/B19 的 hero-013 在入队前是否已能取到立绘与名字，取决于 `heroMeta` 的实现，本组未验证（见 `01_research.md` 第 6 节）。
6. **入队演出**：`storySeats`（`data/shuihu.js:37`）只决定发谁，不决定何时演、演什么。需要 `events[]`。
7. **首胜玉璧**：`02_gacha_desire_spec.md:252` 的建议在现有 `reward` 字段里没有落点。

---

## 5. 兼容与回退建议

- 若 `script` / `stages` 缺失，播放逻辑应**完全退回**现有 `beats` 路径：按 `s.index` 线性播放 3 拍后 `startBattle`。这样 A 可以分阶段接入，中途不会出现无剧情可播的状态。
- `speaker` 解析顺序建议：`narrator` → `hero-NNN`（查 `DATA.heroes`）→ `boss-*`（查 `BOSSES`）→ `enemy:<name>`（无立绘文本条）→ 回退 `j.foeName`。与现有实现（`journey.js:8`）的回退行为保持一致。
- 节拍 id（`B01`…）仅用于文档与调试对齐，运行时不必依赖；`trigger` 才是唯一判定依据。
- 数值（`hpScale` 1.45、`turnLimit` 20/25/30、`enemyHpBelow` 0.35、`atTurn` 4/3）均为**建议值**，最终由 A 结合 `game.js:287` 的 `scale` 公式与实测定档。

---

## 6. 验收自查（A 实现后可用这几条核对）

1. 首章进入后，S1 能播放 B01–B03；首次进入额外播放 B04–B05；精英额外有 B22。
2. S1 第 2 回合开始出现 B06；敌方剩 1 人时 B07；胜利后 B08。
3. S2 第 4 回合（精英第 3 回合）鲁智深入场并播 B13；S2 胜利后 B14。
4. S3 巡粮哨长血量低于 35% 时播 B17；胜利后依次播 B19、B20，随后触发 `heroJoin` 事件（hero-013）。
5. 任一关失败后播对应 `post:lose` 拍，已通关子关进度保留，可原地重试。
6. 说话人显示为「绰号 · 姓名」格式；`旁白` 显示为「山河记」（沿用现有 `journey.js:8` 的 `name` 回退文案）。
