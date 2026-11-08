# 交接 / 返修单

- 任务 ID / 修订号：CONTENT-001 / r1
- 负责人 / 接收人：B（叙事与内容改写） / Codex（验收）
- 状态：READY_FOR_REVIEW
- 基线提交 / 交付提交 / 最终集成提交：d980587 / 本提交 / 待集成
- 目标与验收条件：前十二位好汉与首章故事、技能说明校对，宋江突出辅助，吴用突出谋略；不变更战斗职业枚举、角色 ID、排名、数值、技能效果。
- 允许修改的文件：data/hero-stories.js、docs/content/、tests/content-001.test.mjs、docs/collaboration/handoffs/CONTENT-001.md
- 实际修改的文件：data/hero-stories.js（补七位小传 + 六位加改编标记 + 宋江/吴用定位句）、tests/content-001.test.mjs（新增）
- 需要其他负责人接入的接口：无新增接口。heroStoryHTML 由 data/hero-stories.js 自带函数渲染，game.js 直接调用，无需 A 改动。故事文本中提及的游戏定位（宋江辅助、吴用谋略控制）与 data/shuihu.js 的技能数据一致，C 层表现应跟从该定位。
- 存档、数值和依赖变化：无。hero-stories.js 不修改 SHUIHU_DATA 的任何字段，只新增 SHUIHU_STORIES 故事文本。
- 测试命令 / 退出码 / 结果：
  - `node --check data/hero-stories.js` → 0
  - `node --test tests/*.test.mjs` → 95 pass / 0 fail（含新增 6 项 CONTENT-001）
- 本地运行方式 / 页面入口：`python3 -m http.server 8765`，角色页查看前十二位好汉小传。
- 截图或录像路径 / 视口尺寸 / 对应提交：本轮完成文本与自动化测试。浏览器视觉验收待 Codex 集成后完成。
- 已知问题与尚未检查项：角色页小传在浏览器中的排版、折叠展开交互待视觉验收。
- 回滚方式：`git revert <本提交>`。

## 逐项验收

| 条件 | 操作步骤 | 预期 | 实际 | 证据 | 结论 |
|---|---|---|---|---|---|
| 前十二位小传完整 | 遍历 rank 1-12 | 每人有 title/text/thread | 同 | content-001.test pass | PASS |
| 宋江辅助定位 | 故事文本 | 含"辅助"+"护盾/治疗" | 同 | content-001.test pass | PASS |
| 吴用谋略定位 | 故事文本 | 含"谋略/军师"+"控制/虚弱/落石" | 同 | content-001.test pass | PASS |
| 武松景阳冈 | 故事文本 | 含"景阳冈" | 同 | content-001.test pass | PASS |
| 改编与史实分开 | 所有故事 | 含"游戏改编"或"小说" | 同 | content-001.test pass | PASS |
| 不变战斗数据 | 加载后 heroes 不变 | 108 将、ID/role/skills 不变 | 同 | content-001.test pass | PASS |

## 缺陷退回

| 缺陷 ID | 严重度 | 归属 | 复现步骤 | 预期 / 实际 | 证据 | 修复提交 | 复测 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
