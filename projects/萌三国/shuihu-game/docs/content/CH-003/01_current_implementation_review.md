# CH-003 · 首章现有实现实证复核

> 范围：只复核第 1 关（`data/journey.js` id:1 梁山泊 · 芦苇渡），**不扩章节**。
> 所有结论都来自实际读文件与浏览器实测；行号以本轮读取时的文件为准。

## 1. 数据层：`data/journey.js`

第 1 关 `beats` 现在共 **13 条**，用两条哨兵旁白切成三段：

| 段 | 条数 | 首句 | 分隔标记 |
|---|---|---|---|
| 开场段 | 5 | `旁白`「公元 1119 年，秋。薄雾压着芦苇荡……」 | — |
| 胜利段 | 3 | `旁白`「渡口安静下来。芦苇后露出半截粮船的桅杆……」 | 前一条：`旁白`「——若此战得胜——」 |
| 失败段 | 3 | `hero-001`「不急。看清他们的站位，再整队一次。」 | 前一条：`旁白`「——若此战不利——」 |

13 = 5 + 3 + 3 + 2 条哨兵行。**没有新增任何数据字段**，`id/x/y/landmark/place/year/season/thread/lead/foe/foeName/weather/goal/hook/next/beats` 15 个既有字段原样保留。

## 2. 消费方：根目录 `journey.js`（不是 game.js）

`game.js` 里 `grep beats` 命中 0；真正读 `beats` 的是根目录 `journey.js`：

| 行 | 函数 | 作用 |
|---|---|---|
| 5 | `STORY_MARK` | 两个哨兵字符串常量 |
| 6 | `isStoryMark(beat,kind)` | 判断某拍是否为分隔标记（`旁白` 且文本以标记开头） |
| 7–17 | `storySegments(stage)` | 把 `beats` 分成 `{open, win, lose}` 三桶 |
| 18–21 | `storyOpening(stage)` | 取开场段；为空时回退到整个 `beats` |
| 22–25 | `beatSpeakerName(beat,j)` | 把 `hero-NNN` 映射成显示名，`旁白` → 固定名「山河记」 |
| 26–31 | `beatLinesFor(stage,kind)` | 产出 `[{name,text}]`，供结算卡片使用 |
| 42–48 | `storyPage()` | 渲染剧情页（进度条 `index / list.length` + 说话人 + 正文） |
| 50–55 | `advanceStory(skip)` | 推进 / 跳过；末拍或 skip 时清 `state.story` 并 `startBattle()` |
| 56–62 | `journeyAction(a,el)` | 绑定 `story-next / story-skip / story-auto / story-back / map-select` |

关键代码（`journey.js:50–55`）：

```js
function advanceStory(skip=false){
 const s=state.story;if(!s)return;clearTimeout(storyTimer);
 const list=storyOpening(s.stage);
 if(skip||s.index>=list.length-1){state.story=null;startBattle('campaign',s.stage,0,s.difficulty);return;}
 s.index++;render();scheduleStory();
}
```

即：**跳过 = 立刻进战斗**，与"把台词翻到末拍再点进入战场"走的是同一条 `startBattle()`。

## 3. 结算层：`game.js`

| 行 | 位置 | 作用 |
|---|---|---|
| 460 | `function finishBattle(b,win,deferReveal=false)` | 战斗结算入口 |
| 520 | `const storyLines = (b.mode==='campaign' && typeof beatLinesFor==='function') ? beatLinesFor(b.stage, win?'win':'lose') : []` | 按胜/败取对应段台词 |
| 521 | `b.result = {win, reward, lines: storyLines}` | 写入结算对象 |
| 522 | `b.resultRevealed = !deferReveal` | 是否立刻显示 |
| 437 | `battlePage()` 内的 `res` 模板 | `b.result.lines.map(...)` 渲染成 `.story-line` |

渲染片段（`game.js:437`，节选）：

```js
${(b.result.lines&&b.result.lines.length)?`<div class="story-lines">${b.result.lines.map(l=>`<p class="story-line"><b>${esc(l.name)}</b>${esc(l.text)}</p>`).join('')}</div>`:''}
```

样式在 `game.css` 末尾追加的 `.result-card .story-lines / .story-line` 规则里。

## 4. 逐句比对：文档文案 vs 实际落库

比对 `docs/content/CH-002/03_dialogue_script.md` 第 2 节与 `data/journey.js` 关 1 的 `beats`：

| # | 文档台词（首 12 字） | 实际落库 | 结论 |
|---|---|---|---|
| O1 | 公元 1119 年，秋。薄雾压着芦… | 同 | **一致** |
| O2 | 粮可以再筹，人却等不得。先守… | 同 | **一致** |
| O3 | 芦苇后面像有人张弓。大家分开… | 同 | **一致** |
| O4 | 磨蹭什么！俺先冲过去，把那几… | 同 | **一致** |
| O5 | 且慢。刀斧在前，弓箭在后，传… | 同 | **一致** |
| V1 | 渡口安静下来。芦苇后露出半截… | 同 | **一致** |
| V2 | 粮夺回来了，乡亲们也过了河。… | 同 | **一致** |
| V3 | 芦苇深处还有动静。留两个人看… | 同 | **一致** |
| L1 | 不急。看清他们的站位，再整队… | 同 | **一致** |
| L2 | 他们的弓手缩在后排，正面硬顶… | 同 | **一致** |
| L3 | 粮车退回渡口，哨探也散去了。… | 同 | **一致** |

**11 条全部一致，无差异。**

## 5. 文风与合规复核（逐句）

- 绝对化用语（一定 / 必然 / 100% / 必得 / 史上最 / 绝对）：**0 处**。
- 声称复原史实或原著的表述：**0 处**。剧情页有 `游戏改编纪年 · 非史实断言`（`journey.js:47`），
  地图页有 `年代、行程与对话为游戏改编；含往事演武。`（`journey.js:35`）。两处都在，无需新增字段。
- 不确定/传闻句式使用正确：O1「隐约」、O3「像有人」、V1「听说……愿来」、L2「试试」、L3「还在，路也还在」。
- 说话人一致性：开场 5 句分别由 山河记 / 宋江 / 花荣 / 李逵 / 吴用 说，四人均在初始阵容；
  失败段由 宋江 / 林冲 / 山河记 说，胜段由 山河记 / 宋江 / 花荣 说。
  **没有出现未入队好汉直接说话的情况**（鲁智深只以 V1 的"听说"传闻出现，与其首胜入队的发放逻辑不冲突）。

## 6. 与 CH-002 文档的两处已知偏差（非缺陷，记录备查）

1. CH-002 文档提到「显示名只有姓名、不含绰号」，实测一致：结算卡片显示「宋江」「花荣」，不是「及时雨 · 宋江」。
2. CH-002 文档的可选 `O0`（剧情页内的改编提示行）**没有落库**；但剧情页已有 `<small>游戏改编纪年 · 非史实断言</small>`，
   合规提示并未缺失，故不加。
