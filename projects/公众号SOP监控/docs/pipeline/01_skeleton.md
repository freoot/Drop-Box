# 01 · 仓库骨架与 mock 流水线（CMD-001 交付说明）

- 工程路径：`/Users/user/Documents/Codex/ops/wechat-sop-monitor`
- 分支：`main`
- 阶段：骨架 + 占位采集 + 评分/SOP 模板，**未接真实数据源**
- 生成时间：2026-10-29

---

## 一、交付文件（相对路径）

### 配置与说明

| 文件 | 作用 |
|---|---|
| `.gitignore` | 忽略 `.env`、`__pycache__`、`data/raw/*`（保留 `.gitkeep`）、日志等 |
| `requirements.txt` | `requests`、`PyYAML`（核心流程只用标准库） |
| `README.md` | 安装、流水线命令、目录说明、SABC 十维定义、合规声明、已知限制 |

### 种子与样例

| 文件 | 内容 |
|---|---|
| `data/seeds/accounts.csv` | 5 行示例账号（`account_id,name,biz_hint,notes,enabled`），全部标注 example |
| `data/seeds/sample_articles.json` | 2 篇样例：`acc_demo_001` 公众号流量主（高相关）、`acc_demo_002` 露营（噪声） |

### 工具

| 文件 | 作用 |
|---|---|
| `tools/common.py` | 路径常量、JSON 读写、slug、`article_id_for` |
| `tools/skills.py` | 读取 `skills/*/SKILL.md`，落地 6 段 brief / 取证校验 / SOP 分节校验 |
| `tools/fetch_articles.py` | 采集占位：`--account` / `--from-seeds` / `--limit` / `--dry-run` |
| `tools/extract_project.py` | 项目卡提炼：LLM（`LLM_API_BASE`/`LLM_API_KEY`）或规则回退 |
| `tools/score_sabc.py` | 十维评分，输出旁路 `*.score.json` |
| `tools/render_sop.py` | 渲染 `data/sops/SOP-*.md`，默认只渲染 ≥A |
| `tools/deai.py` | 去 AI 味，产出 `*.deai.md` 与 `data/deai-report.json` |

### 提示词

| 文件 | 内容 |
|---|---|
| `prompts/extract.md` | 提炼提示词：输出字段、相关性判定、不臆造数字 |
| `prompts/score.md` | 十维定义表、总分/等级阈值、输出 JSON 约束 |
| `prompts/deai.md` | 去 AI 味规则：删套话、拆长句、动作具体化、不编造 |

### Skill（CMD-001b 增补）

| 目录 | 来源 | 许可 | 用途 | 驱动流程 |
|---|---|---|---|---|
| `skills/research-brief/` | 本机 `~/.workbuddy/skills/research-brief` | 随 WorkBuddy 插件分发 | 6 段 brief 结构 | ✅ extract |
| `skills/investigate-first/` | 本机 `~/.workbuddy/skills/investigate-first` | 随 caveman 插件分发 | 每维必须引用证据 | ✅ score |
| `skills/competitor-research/` | 本机 `~/.workbuddy/skills/competitor-research` | 随插件分发 | 分节 + 逐节核验（**只用方法论，不装依赖**） | ✅ render |
| `skills/humanizer/` | [blader/humanizer](https://github.com/blader/humanizer)（60.8k★） | **MIT** | 26+ 条 AI 味模式目录 | ✅ deai 规则来源 |
| `skills/no-ai-slop/` | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop)（7.3k★） | **MIT** | 编辑/检测双模式、保护原话 | ✅ deai 检测模式 |
| `skills/anthropics-competitive-brief/` | [GitHub](https://github.com/anthropics/knowledge-work-plugins/blob/main/marketing/skills/competitive-brief/SKILL.md) | **Apache-2.0** | Value Proposition 四要素、Content Gap 思路 | ❌ 仅参考 |
| `skills/README.md` | — | — | 清单、选用理由、调用顺序、安全声明 | — |

每个 skill 目录下都有 `SOURCE.md`，写明来源、许可、是否修改。

**为什么不用 competitor-research 的运行依赖**：它需要 NotebookLM CLI + Google AI Mode MCP + VNC，
本项目只需要它的「多源→分节→逐节核验」思路，装依赖反而增加不可控因素。

**为什么不用 anthropics/competitive-brief 做主流程**：它面向 B2B 竞品 battlecard
（异议处理、landmine 问题），与「公众号文章 → 可复制项目」场景不匹配。

**安全**：`skills/` 下只有 `.md`，没有任何 `.py` / `.sh` / `.js`；未执行任何下载来的脚本。

### 生成物（mock 流水线产物，已入库便于复核）

| 文件 | 内容 |
|---|---|
| `data/projects/acc_demo_001-333e19cd.project.json` | 流量主项目卡：5 步、6 条证据、high |
| `data/projects/acc_demo_001-333e19cd.score.json` | **45/50 → S 级** |
| `data/projects/acc_demo_002-5c449ece.project.json` | 露营项目卡：0 步、2 条证据、low |
| `data/projects/acc_demo_002-5c449ece.score.json` | **21/50 → C 级** |
| `data/sops/SOP-公众号流量主第-3-个月.md` | 渲染出的 SOP（Day 1–5 动作 + 证据 + 评分表 + 风险） |

> `data/raw/` 下的原始文章被 `.gitignore` 忽略（正文可能较大），本地已生成 2 篇用于跑通。

---

## 二、自检结果（对照验收标准）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 工程路径存在且为 git 仓库 | ✅ | `git init -b main`；`git status` 正常 |
| 2 | 目录与种子/样例文件齐全 | ✅ | 见上方文件清单；`data/{raw,projects,sops}` 均有 `.gitkeep` |
| 3 | mock 流水线一条命令链跑通 | ✅ | 见下方运行记录：2 raw → 2 项目卡 → 2 评分 → 1 SOP |
| 4 | 至少 1 个 `data/projects/*.json`、1 个评分、1 个 `SOP-*.md` | ✅ | 2 / 2 / 1 |
| 5 | 提示词与 SABC 十维定义在仓库内 | ✅ | `prompts/score.md`、`README.md` 十维表 |
| 6 | 采集模块标注「真实抓取未实现」 | ✅ | `fetch_articles.py` 头部 ⚠️ 段 + 运行末尾提示 + README 合规声明 |
| 7 | `01_skeleton.md` 列出交付文件相对路径 | ✅ | 本文件第一节 |
| 8 | 不修改 `shuihu-game` 或其他无关仓库 | ✅ | 全部操作在本工程目录内；未进入 `shuihu-game` |
| 9 | `skills/` 非空，有来源与许可说明 | ✅ | 4 个 skill 目录 + 每个 `SOURCE.md` + `skills/README.md` |
| 10 | `01_skeleton.md` 有 skill 清单 | ✅ | 第一节「Skill」表 |
| 11 | 流水线说明含 skill 步骤 | ✅ | README「Skill 怎么驱动流程」+ 本文件第三节 |
| 12 | 摘要/动作/SOP 正文过 deai | ✅ | `deai.py` 处理 3 个文件、20 处改动，见 `data/deai-report.json` |
| 13 | 只收纯提示词，无来路不明可执行脚本 | ✅ | `skills/` 下仅 `.md`；官方 skill 为 Apache-2.0 / MIT 原文 |
| 14 | 收录 noslop / humanizer / 去 AI 味类 Skill | ✅ | `skills/humanizer`、`skills/no-ai-slop`（均 MIT，已用 license API 核对） |
| 15 | mock SOP 附去 AI 味前后对照 | ✅ | `docs/pipeline/deai-before-after.md` |

---

## 三、实际运行记录

```bash
$ python3 tools/fetch_articles.py --from-seeds
写入 data/raw/acc_demo_001-333e19cd.json  ← 公众号流量主第 3 个月：从 0 到 4200 元的完整拆解
写入 data/raw/acc_demo_002-5c449ece.json  ← 周末去哪儿：城郊 5 个小众露营地，人少景好还免费
完成：2 篇（落盘 2）。

$ python3 tools/extract_project.py --all
项目卡 acc_demo_001-333e19cd.project.json  相关度=high  步骤=5  证据=6  模式=rule
  skill research-brief：6 段 brief 已生成（来源 skills/research-brief/SKILL.md）
项目卡 acc_demo_002-5c449ece.project.json  相关度=low   步骤=0  证据=2  模式=rule
  skill research-brief：6 段 brief 已生成（来源 skills/research-brief/SKILL.md）
完成：2/2 篇。

$ python3 tools/score_sabc.py --all
评分 acc_demo_001-333e19cd.score.json  45/50 → S 级
评分 acc_demo_002-5c449ece.score.json  19/50 → C 级
完成：2/2 个评分。

$ python3 tools/render_sop.py --all
SOP SOP-公众号流量主第-3-个月.md  ← S 级 45 分（分节校验通过）
跳过（C 级 < A）：acc_demo_002-5c449ece.score.json
完成：生成 1 份 SOP，输出目录 data/sops/

$ python3 tools/deai.py --all
acc_demo_001-333e19cd.project.json：12 处改动
acc_demo_002-5c449ece.project.json：0 处改动
SOP-公众号流量主第-3-个月.md：8 处改动 → SOP-公众号流量主第-3-个月.deai.md
完成：3 个文件，共 20 处改动。
```

### 两类文章的判定是否合理

| 文章 | 相关度 | 步骤 | 证据 | 总分 | 等级 | 是否符合预期 |
|---|---|---|---|---|---|---|
| 公众号流量主 | high | 5 | 6 | 45 | **S** | ✅ 有动作、有金额、有周期 |
| 城郊露营 | low | 0 | 2 | 19 | **C** | ✅ 无变现、无可执行动作 |

### Skill 落地后评分的变化（可核对）

接入 `investigate-first` 后，评分一度从 45 掉到 39——因为「反馈周期」「合规」两维
的 `evidence_ref` 指不到证据，被自动封顶 2 分。查下来不是评分变严，是**证据池漏了字段**：

- `evidence_check` 的证据池没包含 `risks` → 合规维度的引用永远无效
- 没包含 `source_excerpt` → 「第二天就能看到收益」这类原文信息被判「无证据」

补上后回到 45 分，且每维都能指回原句：

```
容量      5  单篇阅读 1200 左右时，一天三条的广告收益大约 45 元。
新手友好  5  选一个足够窄的领域。我选的是「县城事业单位报考信息」…
变现路径  5  先说结论：这个号从注册到月入 4200 元，用了 92 天…
反馈周期  2  对新手最友好的一点是：反馈周期短，当天发的文章第二天就能看到收益
趋势窗口  2  （无）    ← 原文确实没提红利期，这一维就该低分
```

露营文 19 分、8 个维度标 `insufficient_evidence`，也符合它「只有游记、没有动作」的事实。

---

## 四、调试过程中修掉的三个误判（记录备查）

规则模式第一版把噪声文判成了 B 级（33 分），逐条定位后修正：

| 问题 | 现象 | 原因 | 修法 |
|---|---|---|---|
| 清单项被当成步骤 | 露营文 5 个「1. 芦苇荡营地：…」被算成 5 个动作 | 编号行未判断是否真的是动作 | 加 `_looks_like_action()`：冒号前必须出现动作词 |
| 固定风险提示污染关键词 | 露营文「变现路径」拿 3 分 | 模板句里含「收益」二字，被关键词统计命中 | 模板改为「不构成任何承诺」，不含变现词 |
| 否定句被当成违规证据 | 流量主文「合规」只给 2 分 | 原文「**不要**搬运」被当作违规 | `_bad_usage()`：命中词前 8 字有否定词则跳过 |

另外两处小修：证据/风险去掉编号前缀；评分文本加入 `source_excerpt`（否则「第二天见效」这类原文信息丢失，反馈周期会误判为 2 分）。

---

## 五、本阶段未做（不算通过）

| 项 | 状态 |
|---|---|
| 真实微信采集 | 未做，仅本地样例；无任何绕过风控逻辑 |
| 真实 LLM 联调 | 未做，只有接口占位；无 key 时全部走规则 |
| 跨文章聚类 / 增量去重 | 未做，一篇一卡 |
| 多平台（抖音/小红书） | 未做，按指令排除 |
| 服务化 / 定时任务 / 前端 | 未做 |
| 真实账号种子 | 未做，`accounts.csv` 全部是 example 假名 |
| deai 的 LLM 模式 | 未做，当前只有规则清洗（套话词表 + 拆句） |
| skill 的自动发现/加载 | 未做，当前是 `tools/skills.py` 显式读取三个目录 |
| anthropics/competitive-brief 的实际接入 | 未做，仅作文本参考 |

---

## 六、下一步（待指挥官派单）

1. **CMD-002 候选 A：接真实 LLM** —— 用现有 `prompts/*.md` 跑通一次真实提炼，对比规则模式质量。
2. **CMD-002 候选 B：接授权数据源** —— 只接公开可访问/已授权接口，补限速与增量去重。
3. **CMD-002 候选 C：扩充评分维度权重** —— 当前十维等权，可引入「变现路径 ×2」等业务权重。
