# CH-002 · 现有挂载点实证（只读调研）

> 任务：CH-002 · 首章降级为「现有单关可接入方案」
> 调研方式：**实读工程文件 + 定向 grep**，每条结论标注文件与行号。
> 本步未修改任何既有文件；只在 `docs/content/CH-002/` 下新建文档。
> 查不到的统一写作「未确认」，不作推测填充。

---

## 0. 一句话结论（先看这里）

| 问题 | 结论 | 证据 |
|---|---|---|
| `beats` 被哪个函数消费并渲染 | **根目录 `journey.js:13` `storyPage()`**（不是 `game.js`） | `game.js` 全文 grep `beats` 无命中；`journey.js:14` 取 `j.beats[s.index]` |
| 战斗流程入口 | `game.js:313 startBattle()` → `game.js:344 beginBattle()` | 见第 3 节 |
| 胜利/失败判定 | 都在敌方阶段与回合推进处，`game.js:657/658/661/662/664` | 见第 3 节 |
| 结算函数 | `game.js:460 finishBattle(b,win,deferReveal=false)` | 见第 3 节 |
| 存档 key | `shangshan-shuihu-v1` | `game.js:3` |
| 存档写入函数 | `game.js:48 save()` | `game.js:65` 写入 |
| `heroMeta` 对「未入队好汉」 | **能取到真实姓名与立绘键**，与是否入队无关 | `game.js:20` + `game.js:70`，详见第 5 节 |
| 战斗循环内是否已有对话钩子 | **没有**，只有 `b.message` / `logBattle` 的战斗日志通道 | 见第 6 节 |

> 注：任务书把 beats 的消费者指向 `game.js`，实测该文件的 `beats` 命中数为 0。真实消费方是根目录 `journey.js`。这一点会影响 A 的改动落点，**请按本文行号定位**。

---

## 1. `data/journey.js` — 现有单关数据结构

文件：`data/journey.js`（共 9 行，`window.SHUIHU_JOURNEY` 在第 2 行声明，6 个地点对象在第 3–8 行，每行一个对象）。

### 1.1 字段清单（16 个字段，全部为现有字段）

| # | 字段 | 类型 | 第 1 关取值 | 是否被代码消费 |
|---|---|---|---|---|
| 1 | `id` | number | `1` | 是（`journey.js:6` 作为 `data-stage`，`game.js:470/472` 作为 `clearedStages`/`stageUnlocked` 键） |
| 2 | `x` | number | `18` | 是（`journey.js:5/6` 地图坐标百分比） |
| 3 | `y` | number | `30` | 是（同上） |
| 4 | `landmark` | string | `'梁山水寨'` | 是（`journey.js:6` 地图节点副标题） |
| 5 | `place` | string | `'梁山泊 · 芦苇渡'` | 是（`journey.js:6/16`） |
| 6 | `year` | number | `1119` | 是（`journey.js:6/16`） |
| 7 | `season` | string | `'初秋'` | 是（`journey.js:6/16`） |
| 8 | `thread` | string | `'聚义序章'` | 是（`journey.js:6/16`） |
| 9 | `lead` | string | `'hero-001'` | 是（`journey.js:6` `artHTML(heroMeta(story.lead),'journey-portrait')`） |
| 10 | `foe` | string | `'enemy-vanguard'` | 是（`journey.js:6` `artHTML(heroMeta(p.foe),'map-art')`） |
| 11 | `foeName` | string | `'巡粮哨长'` | 是（`journey.js:6` 地图文案；`journey.js:15` 说话人解析的**最终回退值**） |
| 12 | `weather` | string | `'mist'` | 是（`journey.js:16` `class="story-scene weather-${j.weather}"`） |
| 13 | `goal` | string | `'守住粮道，击退试探的官军。'` | 是（`journey.js:16` `<small>本关目标：${j.goal}</small>`） |
| 14 | `hook` | string | `'一船救济粮未到，芦苇荡先传来了马蹄声。'` | 是（`journey.js:6` 地图详情页 `<p>${story.hook}</p>`） |
| 15 | `next` | string | `'缴获的文书提起一桩旧案。林冲望着火光，讲起那场雪。'` | **否**（全仓 grep `next` 仅命中 `journey.js:26` 的 `story-next` 动作字符串）→ 当前为**未被消费的死数据** |
| 16 | `beats` | array | 3 条 | 是（`journey.js:14`） |

### 1.2 `beats` 的元素格式

统一为**二元组数组**，形如 `[发言人标识, 台词文本]`：

```js
beats:[
  ['旁白','公元 1119 年，秋。梁山水泊起了薄雾，一船送往村落的粮食迟迟未归。'],
  ['hero-001','粮能再筹，人不能不救。先守住渡口，让乡亲们过河。'],
  ['hero-009','芦苇后有人张弓。大家分开走，别挤在一条粮道上。']
]
```

已观测到的发言人标识取值（`data/journey.js:3–8`）：

- `'旁白'` → 无立绘，显示名固定为 `'山河记'`（`journey.js:15` 的三元分支）
- `'hero-NNN'` → 好汉 id，如 `hero-001` / `hero-003` / `hero-006` / `hero-009`
- `'boss-*'` → 首领 id，如 `boss-gao-qiu`（第 2 关 `data/journey.js:4`）

**元素的长度固定为 2**，`beat[0]` 取发言人、`beat[1]` 取文本（见 `journey.js:14`、`journey.js:16` 的 `esc(beat[1])`）。现有实现不读取第 3 个元素，因此**往二元组里塞第 3 项不会被消费**（未验证是否有副作用，建议不加）。

### 1.3 第 1 关原文（`data/journey.js:3`，逐字）

```js
{id:1,x:18,y:30,landmark:'梁山水寨',place:'梁山泊 · 芦苇渡',year:1119,season:'初秋',thread:'聚义序章',lead:'hero-001',foe:'enemy-vanguard',foeName:'巡粮哨长',weather:'mist',goal:'守住粮道，击退试探的官军。',hook:'一船救济粮未到，芦苇荡先传来了马蹄声。',next:'缴获的文书提起一桩旧案。林冲望着火光，讲起那场雪。',beats:[['旁白','公元 1119 年，秋。梁山水泊起了薄雾，一船送往村落的粮食迟迟未归。'],['hero-001','粮能再筹，人不能不救。先守住渡口，让乡亲们过河。'],['hero-009','芦苇后有人张弓。大家分开走，别挤在一条粮道上。']]},
```

### 1.4 一处数据不一致（实测发现，供 A 参考）

- 战场内首位敌人的显示名取自 `CHAPTERS[0].enemyName = '官军探哨'`（`data/shuihu.js:193` → `game.js:288`）。
- 地图与剧情回退名取自 `JOURNEY[0].foeName = '巡粮哨长'`（`data/journey.js:3`）。

即：同一个敌兵在地图页叫「巡粮哨长」，进战场后叫「官军探哨」。这是**现状既有差异**，不是本轮引入的；若台词要点名该敌人，需先统一口径（本文档不改数据，仅记录）。

---

## 2. beats 的消费与渲染（真实函数 + 行号 + 代码片段）

**消费/渲染函数：`storyPage()`，位于根目录 `journey.js:13–17`。**

`journey.js:13–17`（第 16 行为超长模板串，此处保留结构并省略尾部样式细节）：

```js
function storyPage(){
 const s=state.story;if(!s)return campaignMapPage();const j=JOURNEY[s.stage-1],beat=j.beats[s.index],speaker=beat[0]==='旁白'?null:heroMeta(beat[0]);
 const name=speaker?(DATA.heroes.find(h=>h.id===speaker.id)?.name||BOSSES.find(b=>b.id===speaker.id)?.name||j.foeName):'山河记';
 return `<section class="story-scene weather-${j.weather}" style="--focus-x:${j.x}%;--focus-y:${j.y}%">…<div class="story-dialogue" aria-live="polite"><span class="eyebrow">${s.index+1} / ${j.beats.length}　${name}</span><p>${esc(beat[1])}</p><small>本关目标：${j.goal}</small><div><button class="outline-btn" data-action="story-auto">…</button><button class="primary-btn" data-action="story-next">${s.index===j.beats.length-1?'进入战场':'继续故事 ›'}</button></div></div></section>`;
}
```

播放链路（全部在根目录 `journey.js`）：

| 环节 | 函数 | 行号 | 行为 |
|---|---|---|---|
| 地图页渲染 | `campaignMapPage()` | 3–7 | 画路线与节点，渲染 `story.hook` / `story.foeName` / `heroMeta(p.foe)` 立绘 / `heroMeta(story.lead)` 立绘 |
| 进入剧情 | `enterStory(stage,difficulty='normal')` | 8–12 | 校验 `stage<=state.stageUnlocked` 与体力；写 `state.story={stage,difficulty,index:0,autoplay:false}`；`state.page='story'` |
| 单拍渲染 | `storyPage()` | 13–17 | 见上方代码；进度条显示 `${s.index+1} / ${j.beats.length}` |
| 自动播放调度 | `scheduleStory()` | 18 | `setTimeout(…,5500)` 后调 `advanceStory()` |
| 推进/结束 | `advanceStory(skip=false)` | 19–23 | `if(skip\|\|s.index>=JOURNEY[s.stage-1].beats.length-1){state.story=null;startBattle('campaign',s.stage,0,s.difficulty);return;} s.index++;render();scheduleStory();` |
| 交互分发 | `journeyAction(a,el)` | 24–30 | `story-next` / `story-skip` / `story-auto` / `story-back` |

`game.js` 侧的挂钩点只有一个：`game.js:141`

```js
function campaignPage(){return campaignMapPage()}
```

**结论：战前剧情是「线性播完 beats 全部条目 → 立刻开战」的模型。** 没有分支、没有条件、没有战后回放。

---

## 3. 战斗流程入口与胜利/失败分支

### 3.1 入口

- `game.js:313` `function startBattle(mode,stage=1,kind=0,difficulty='normal')`
  - `game.js:314` 若已有未结算战斗则直接返回
  - `game.js:316` 队伍为空 → `toast('先安排武将上阵')`
  - `game.js:317` 体力不足检查
  - **`game.js:319` `if(mode==='campaign')state.stamina-=campaignCost(difficulty);` ← 军令在此扣除，每次进入都扣**
  - `game.js:337` 构造 `state.battle`（含 `mode,stage,kind,difficulty,title,turn:1,phase:'deploy',…result:null,…`）
  - `game.js:341` `state.page='battle'`
- `game.js:344` `function beginBattle(b)`：`if(!b||b.phase!=='deploy'||b.result)return;` — 布阵完成后的开打入口
- `game.js:395` `function battlePage()`：战斗主渲染；`game.js:437` 结算卡片 `res`

### 3.2 胜利 / 失败判定（全部调用 `finishBattle`）

| 行号 | 上下文 | 判定表达式 | 结果 |
|---|---|---|---|
| `game.js:546` | 精英齐射结算后 | `if(b.allies.every(u=>u.hp<=0))` | `finishBattle(b,false)` |
| `game.js:579` | 敌方行动串中 | `if(b.allies.every(a=>a.hp<=0))` | `finishBattle(b,false)` |
| `game.js:657` | 敌方阶段循环内 | `if(b.allies.every(a=>a.hp<=0))` | `finishBattle(b,false)` |
| `game.js:658` | 敌方阶段循环内 | `if(b.enemies.every(enemy=>enemy.hp<=0))` | `finishBattle(b,true)` |
| `game.js:661` | 敌方阶段结束后 | `if(b.allies.every(a=>a.hp<=0))` | `finishBattle(b,false)` |
| `game.js:662` | 敌方阶段结束后 | `if(b.enemies.every(e=>e.hp<=0))` | `finishBattle(b,true)` |
| `game.js:664` | 回合推进 | `if(b.turn>30)` | `finishBattle(b,false)` + `b.message='战斗超过 30 回合，双方撤出战场。'` |
| `game.js:787` | 自动战斗 | `if(!target)` | `finishBattle(b,true)` |

判定口径：**胜利 = 敌方全部 hp<=0；失败 = 我方全部 hp<=0，或回合数超过 30。** 与 `GAME_DESIGN.md` 的「胜利条件为敌军全灭」一致；没有「存活数 ≥ N」「保护目标」等其他条件。

### 3.3 结算函数

`game.js:460` `function finishBattle(b,win,deferReveal=false)`：

- `game.js:461` `if(b.result)return;` —— 防重入
- `game.js:470–472` 战役模式的进度推进：
  ```js
  const firstClear=!state.clearedStages[b.stage];
  state.clearedStages[b.stage]=true;
  state.campaignWins++;
  state.stageUnlocked=Math.max(state.stageUnlocked,b.stage+1);
  ```
- `game.js:483–487` 首胜按 `chapter.rewardHeroRank` 发好汉：`HERO_CATALOG.find(h=>h.rank===chapter?.rewardHeroRank)`，若未拥有则 `obtainHero(unlock.id)`
- `game.js:520` `b.result={win,reward};`
- `game.js:521` `b.resultRevealed=!deferReveal;`
- `game.js:522` `logBattle(b, win?'梁山阵线稳住了，战利品已经记入寨账。':'队伍暂时退回山寨；调整站位和技能后再战。');`
- `game.js:523` `save();`

**`deferReveal` 全仓只在 `game.js:460`（形参）与 `game.js:521`（取值）出现，没有任何调用点传 `true`** → 现状为结算卡片即时显示。

`game.js:437` 结算卡片（文案硬编码）：

```js
const res=b.result&&b.resultRevealed!==false?`<div class="battle-result"><div class="result-card"><div class="result-mark">${b.result.win?'🏆':'🩹'}</div><h2>${b.result.win?'战斗胜利':'整队休整'}</h2><p>${b.result.win?'战术奏效，收下这次战利品。':'伙伴需要休整，调整阵容后再战。'}</p><div class="loot">${esc(b.result.reward||'未获得战利品')}</div><button class="primary-btn" data-action="battle-return">${b.result.win?'返回战场外':'返回整队'}</button></div></div>`:'';
```

返回地图：`game.js:849` `if(a==='battle-return'){const b=state.battle;if(!b?.result)return;state.page=b.returnPage;state.battle=null;render();return;}`

---

## 4. 存档读写（函数名 + key）

| 项 | 位置 | 内容 |
|---|---|---|
| localStorage key | `game.js:3` | `const SAVE_KEY = 'shangshan-shuihu-v1';` |
| 写入函数 | `game.js:48` `function save()` | 见下方代码片段 |
| 写入语句 | `game.js:65` | `localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot));` |
| 读取 | `game.js:30` | `let state;try{state=Object.assign(initialState(),JSON.parse(localStorage.getItem(SAVE_KEY)\|\|'{}'));}catch(e){state=initialState();}` |
| 版本兼容 | `game.js:34` | 无 `staminaVersion` 的旧档补 `stamina=STAMINA_MAX` |
| 清档 | `game.js:866` | `localStorage.removeItem(SAVE_KEY);state=initialState();` |

`save()` 全文（`game.js:48–67`，末尾 `catch{}` 静默吞错）：

```js
function save(){
  try{
    const snapshot=clone(state);
    snapshot.tavernMenu=false;
    snapshot.recruitReveal=false;
    if(snapshot.battle){
      snapshot.battle.animating=false;
      snapshot.battle.fx=null;
      if(snapshot.battle.result&&snapshot.battle.resultRevealed===false)snapshot.battle.resultRevealed=true;
      snapshot.battle.moveFxUid='';
      snapshot.battle.moveFxFrom=null;
      snapshot.battle.pendingEnemyPhase=false;
      snapshot.battle.enemyPhasePromise=null;
      snapshot.battle.enemyPhaseRunning=false;
      snapshot.battle.auto=false;
      if(snapshot.battle.phase==='enemy')snapshot.battle.phase='player';
    }
    localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot));
  }catch(e){}
}
```

**`save()` 的全部调用点（全仓仅 3 处）**：

| 行号 | 调用场景 |
|---|---|
| `game.js:118` | `setPlayerName()` 内，取名成功后立即存 |
| `game.js:233` | **`render()` 内** —— 每次渲染都会落盘 |
| `game.js:523` | `finishBattle()` 末尾 |

存档中与剧情/进度相关的字段（`game.js:29` `initialState()`）：

- `stageUnlocked:1`、`mapStage:1`、`story:null`、`campaignWins:0`、`clearedStages:{}`
- `state.story` 的结构由 `journey.js:11` 写入：`{stage,difficulty,index,autoplay}`
- `save()` **不清空 `state.story`** → 剧情播到一半刷新页面，会停在同一拍（回归点，见 `04_regression_plan.md`）

---

## 5. `data/shuihu.js` — 好汉 id 与姓名/绰号的取用方式

### 5.1 id 生成规则

`data/shuihu.js:126`：

```js
const hero={id:`hero-${String(rank).padStart(3,'0')}`,rank,name,star,epithet,bio,gender:…,faction:'梁山泊',origin:…,quality,role…}
```

即 **`hero-NNN` 中的 NNN = 梁山座次 rank，左补零到 3 位**。座次顺序由 `data/shuihu.js:8–32` 的 `seats` 数组给出，元素为 `[姓名, 星号, 绰号]`。

本轮涉及的座次（来自 `seats` 第 1/3/6/9/13/22 项）：

| id | 姓名 | 绰号 | 是否初始阵容 | 依据 |
|---|---|---|---|---|
| `hero-001` | 宋江 | 及时雨 | 是 | `data/shuihu.js:42` `startingSeats` 含 1 |
| `hero-003` | 吴用 | 智多星 | 是 | 同上，含 3 |
| `hero-006` | 林冲 | 豹子头 | 是 | 同上，含 6 |
| `hero-009` | 花荣 | 小李广 | 是 | 同上，含 9 |
| `hero-013` | 鲁智深 | 花和尚 | **否**，首章首胜发放 | `data/shuihu.js:37` `storySeats` 的 `13 → '第一章首胜'`；`data/shuihu.js:193` `rewardHeroRank:13` |
| `hero-022` | 李逵 | 黑旋风 | 是 | `data/shuihu.js:42` 含 22 |

### 5.2 `heroMeta()` 的定义与对「未入队好汉」的实测行为

> CH-001 的 `03_data_contract.md:279` 把这条标为「本组未验证」。**本轮已验证，结论如下。**

定义位于 **`game.js:70`**：

```js
function heroMeta(id){return HERO_CATALOG.find(h=>h.id===id)||{id,name:id,role:'战士',quality:'blue',icon:'🛡️',hp:170,atk:34,move:2,range:1,level:1,skillLevel:1,activeSkill:0}}
```

`HERO_CATALOG` 的定义位于 **`game.js:20`**：

```js
const HERO_CATALOG = DATA.heroes.map(h=>({...h,level:1,skillLevel:1,activeSkill:0,inParty:h.ownedAtStart}));
```

**推理链（每一行都有文件行号支撑）：**

1. `DATA.heroes` = `data/shuihu.js:105` `heroData` = `seats.map(...)` → **含全部 108 条**，不按拥有状态过滤。
2. `game.js:20` 的 `HERO_CATALOG` 是 `DATA.heroes` 的全量映射，只额外加了 `level/skillLevel/activeSkill/inParty`。
3. `game.js:70` 的 `heroMeta(id)` 在 `HERO_CATALOG` 上查 id，**没有 `hero(id)`（已拥有列表）参与**。
4. `ownedAtStart` 只在 `data/shuihu.js:131` 生成，来源 `startingSeats.has(rank)`；它只影响 `inParty` 初始值，**不影响 `HERO_CATALOG` 是否包含该条**。

**结论：`heroMeta('hero-013')` 在未入队状态下同样返回完整的鲁智深对象**（含 `name:'鲁智深'`、`epithet:'花和尚'`、`id:'hero-013'`），立绘键 `ART['hero-013']` 也在 `data/portraits.js:204` 存在（`assets/q/luzhishen-portrait.png`）。

同理已确认存在的立绘键：`hero-001`、`hero-003`、`hero-006`、`hero-009`、`hero-022`、`enemy-vanguard`、`boss-gao-qiu`（均在 `data/portraits.js` 中命中）。

**三个必须注意的边界：**

1. **显示名不含绰号。** `journey.js:15` 的解析链是 `DATA.heroes.find(...)?.name || BOSSES.find(...)?.name || j.foeName`，取的是纯 `name`（如「鲁智深」）。带绰号的「花和尚 · 鲁智深」由 `game.js:143` `function heroFullName(h){return `${h.epithet} · ${h.name}`;}` 生成，但 **`storyPage()` 没有调用它**，只在 `heroPage()` 等处使用。
2. **未命中 id 会静默降级成敌人名。** `heroMeta(未知id)` 走 `game.js:70` 的回退对象，其 `name` 就是 id 字符串本身；随后 `journey.js:15` 的两次查找都失败，最终落到 `j.foeName`。**第 1 关的回退显示名是「巡粮哨长」** —— 写错 id 不会报错，只会把台词安到敌人头上。
3. **回退对象缺少 `epithet`/`rank`/`bio` 等字段**。若 A 后续想把显示名改成「绰号 · 姓名」，对未命中 id 会得到 `undefined · hero-xxx`。

### 5.3 首领 id

`data/shuihu.js:201–204` 的 `bosses` 使用 `boss-*` 形 id（`boss-gao-qiu` / `boss-zhu-chaofeng` / `boss-shi-wengong` / `boss-fang-la`），带 `name` 与 `epithet`。它们**不在 `HERO_CATALOG` 中**，靠 `journey.js:15` 的 `BOSSES.find(...)`（即 `game.js:6` `const BOSSES = DATA.bosses;`）兜住。

---

## 6. 战斗循环内是否已有对话钩子

**结论：没有。需 A 新增。**

支撑证据（定向 grep，均为 0 命中或仅有日志通道）：

| 检查项 | 在 `game.js` 的命中情况 |
|---|---|
| `beats` | **0 命中** |
| `旁白` | **0 命中** |
| `山河记` | **0 命中** |
| `JOURNEY` / `SHUIHU_JOURNEY` | **0 命中**（仅根目录 `journey.js:1` 引用） |
| `storyPage` / `story` 剧情渲染 | 0 命中（`state.story` 只在 `game.js:29` 初值、`game.js:234` 的 `if(state.page==='story')scheduleStory();` 出现） |

战斗内唯一的文本通道是：

- `game.js:442` `function logBattle(b,msg){b.message=msg;b.logs=b.logs||[];b.logs.unshift(msg);b.logs=b.logs.slice(0,5)}`
- 各处对 `b.message` 的直接赋值，如 `game.js:644`、`game.js:664`

它们承载的是**战报**（「X 攻击 Y，造成 N 点伤害。」），不是剧情对话；且 `b.logs` 只保留最近 5 条。

### 6.1 最小新增点建议（供 A 决断）

按改动量从少到多排列：

**A-1 · 战后台词（胜利/失败对话）—— 约 12～18 行**

1. `game.js:460` `finishBattle()` 内，在 `game.js:520` `b.result={win,reward};` 处**多挂一个运行时字段** `lines`（从 `JOURNEY[b.stage-1].beats` 按哨兵行切片取值）。注意：这是运行时对象上的字段，**不动 `data/journey.js` 的数据字段**，不违反本轮「不新增字段」约束。
   - 新增约 6～10 行（含切片函数）
2. `game.js:437` 结算卡片 `res` 中，在 `<p>…</p>` 后渲染 `b.result.lines`（逐行 `<span>`）。
   - 新增约 2～4 行
3. 根目录 `journey.js:19` `advanceStory()` 中，把「最后一拍」判定改为「遇到哨兵行 **或** 真的到了最后一拍」，避免战前播放器把胜利/失败段也当开场念完。
   - 新增约 3～5 行

**A-2 · 战中触发台词（回合开始 / 血量阈值 / 敌方减员）—— 约 15～30 行**

- 订阅点：`game.js:550` `enemyPhase()` 开头（回合开始）、`game.js:457` `applyDamage()`（伤害结算后）、`game.js:658`（敌方减员后）。
- 需要一个「本场已播过的拍」标记（放在 `b` 上，如 `b.beatFired={}`）以防重复。
- **本轮不推荐做**，理由见 `02_single_level_plan.md` 第 3 节。

---

## 7. 未确认 / 未覆盖项（如实列出）

| 项 | 状态 | 说明 |
|---|---|---|
| `data/portraits.js` 全量键表 | 未确认 | 只定向验证了 `hero-001/003/006/009/013/022`、`enemy-vanguard`、`boss-gao-qiu`；其余 100+ 好汉是否有立绘未逐个核对 |
| Godot 侧（`godot/**`、`shuihu-game.godot` 相关）是否有并行剧情实现 | 未确认 | 本轮未进入该目录 |
| `tests/` 中是否已有针对 `beats` 的断言 | 未确认（倾向没有） | 已扫到 `tests/content-001.test.mjs` 只校验 `SHUIHU_STORIES` 与英雄数据，未涉及 `SHUIHU_JOURNEY`；未逐个打开其余 30 个测试文件 |
| beats 二元组加第 3 个元素是否有副作用 | 未确认 | 现有实现只读 `[0]`/`[1]`，但不排除 CSS 或动画依赖数组长度 |
| `next` 字段被弃用是否是有意为之 | 未确认 | 只在 `data/journey.js` 中定义，全仓无消费点 |
