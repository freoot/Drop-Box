# CMD-001 微信公众号 SOP 监控系统 — 仓库骨架

- **任务名称**：公众号赚钱信号 SOP 系统 · 仓库骨架与模板
- **执行角色**：WorkBuddy（本机 App）
- **状态**：READY_FOR_REVIEW
- **工程路径**：`/Users/user/Documents/Codex/ops/wechat-sop-monitor`
- **派发时间**：2026-10-29 11:01 Asia/Shanghai
- **交付时间**：2026-10-29 11:10 Asia/Shanghai
- **交付说明**：`docs/pipeline/01_skeleton.md`（含自检清单与运行记录）

## 背景
用户要仿抖音「这很容易」演示的系统：监控账号 → 采内容 → SABC 打分 → 产出可复制 SOP。
第一版只做**微信公众号**线（文章监控 + 流量主类项目提炼），不做抖音/小红书。
指挥官只验收；你负责落地代码与目录，不擅自扩到其他平台。

## 目标
在工程路径下搭好可运行的最小骨架：种子表、采集占位、评分与 SOP 输出模板，并写清 README / 验收说明。

## 提示词（按此执行）
1. 初始化 git 仓库（若尚无 `.git`）：`main` 分支，合理 `.gitignore`（含 `.env`、`__pycache__`、`data/raw/` 大文件等）。
2. 目录建议：
   - `data/seeds/accounts.csv` — 种子公众号表（列至少：account_id, name, biz_hint, notes, enabled）
   - `data/raw/` — 原始文章占位（空目录 + `.gitkeep`）
   - `data/projects/` — 提炼出的项目 JSON
   - `data/sops/` — SOP Markdown 输出
   - `src/` 或 `tools/` — Python 模块
   - `docs/pipeline/` — 交付说明
   - `prompts/` — 提炼与评分提示词模板
3. 实现/放置：
   - `tools/fetch_articles.py`：**占位**采集器。CLI：`--account` / `--from-seeds` / `--limit`。本阶段可用 mock：从 `data/seeds/sample_articles.json` 读样例文章，写入 `data/raw/`。真实微信抓取可留 TODO 与接口注释，**不要**实现未授权批量抓号。
   - `tools/extract_project.py`：读一篇 raw JSON，调用本地可替换的 LLM 接口占位（环境变量 `LLM_API_BASE`/`LLM_API_KEY`，无 key 时走规则/mock），输出项目卡 JSON 到 `data/projects/`。字段至少：`project_name`, `summary`, `copyable_steps[]`, `evidence[]`, `risks[]`, `source_article_id`。
   - `tools/score_sabc.py`：对项目卡打 SABC 分，写入同文件或旁路 `*.score.json`。十维（缺一不可，1–5 分或 0–2 档，文档写明）：容量、新手友好、链路、变现路径、趋势窗口、证据强度、可SOP化、反馈周期、差异化、合规风险（第十维用合规/可复制稳定性）。总分与简短理由。
   - `tools/render_sop.py`：把高分项目渲染成 `data/sops/SOP-xxx.md`，含：项目名、一句话、可复制动作周1清单、证据、评分表、风险。
   - `prompts/extract.md`、`prompts/score.md`：提示词正文，中文。
   - `data/seeds/accounts.csv`：至少 5 行示例行（假名亦可，标注 example）。
   - `data/seeds/sample_articles.json`：至少 2 篇样例（一篇偏「公众号流量主」、一篇偏无关噪声），供端到端 dry-run。
4. `README.md`：如何安装依赖、如何 `python tools/fetch_articles.py && python tools/extract_project.py ... && python tools/score_sabc.py ... && python tools/render_sop.py ...` 跑通一次 mock 流水线。
5. `docs/pipeline/01_skeleton.md`：自检清单 + 本任务交付路径列表。
6. 依赖用 `requirements.txt`（尽量轻：requests、pyyaml 等；不要强绑重型框架）。

## 验收标准（指挥官按此 PASS/打回）
- [ ] 工程路径存在且为 git 仓库
- [ ] 上述目录与种子/样例文件齐全
- [ ] mock 流水线一条命令链可跑通，产出至少 1 个 `data/projects/*.json`、1 个评分结果、1 个 `data/sops/SOP-*.md`
- [ ] 提示词与 SABC 十维定义写在仓库内（README 或 docs）
- [ ] 采集模块明确标注：真实抓取未实现 / 仅公开页占位，无未授权爬虫
- [ ] `docs/pipeline/01_skeleton.md` 列出交付文件相对路径
- [ ] 不修改 `shuihu-game` 或其他无关仓库

## 不做
- 不上线服务、不做多平台、不接支付、不批量注册公众号
- 不实现绕过微信登录/风控的抓取
- 不代替指挥官验收或改任务范围

## 交付后
在交接单顶部把状态改为 `READY_FOR_REVIEW`，并在 `docs/pipeline/01_skeleton.md` 写自检结果。指挥官复查后再派 CMD-002（真实采集或提示词调优）。

---

## 增补 CMD-001b（2026-10-29 11:04）— Skill 强化
指挥官确认：搭骨架时**必须**先找/装相关 Skill，再写代码，提升提炼与 SOP 质量。

### 要求
1. 在网上与 WorkBuddy 技能库检索适合本项目的 Skill（关键词示例：SOP generation、content monitoring、WeChat官方账号、research brief、competitor research、lead scoring）。
2. 本机已有可优先复用：`competitor-research`、`competitor-research-intel`、`research-brief`、`investigate-first`（路径 `~/.workbuddy/skills/`）。能复用就复用，不要重复造轮子。
3. 把选用的 Skill **纳入本仓库**：
   - `skills/` 下放置项目用到的 skill 副本或 symlink 说明
   - `docs/pipeline/01_skeleton.md` 写明：用了哪些 skill、来源 URL、为何选用
   - 在 `prompts/` 与 extract/score 流程里**实际调用**这些 skill 的步骤（README 写清调用顺序）
4. 若网上找到优质公开 skill（GitHub / agentskills 等），下载到 `skills/` 并注明许可与来源；不要装来路不明的可执行后门脚本。
5. 验收追加：`skills/` 非空；01_skeleton 有 skill 清单；mock 流水线说明里包含 skill 步骤。

### B. 去 AI 味（强制，指挥官追加）
所有项目摘要、可复制动作、SOP 正文必须过 `prompts/deai.md` / deai 步骤；禁空洞套话；短句具体动作；不编造证据；README 流程含 extract→score→render→deai。

---

## 执行回报（2026-10-29 11:10）

**状态：READY_FOR_REVIEW**

### 交付路径

| 类别 | 路径 |
|---|---|
| 仓库根 | `/Users/user/Documents/Codex/ops/wechat-sop-monitor`（git `main`） |
| 工具 | `tools/{fetch_articles,extract_project,score_sabc,render_sop,common}.py` |
| 种子 | `data/seeds/accounts.csv`、`data/seeds/sample_articles.json` |
| 提示词 | `prompts/extract.md`、`prompts/score.md` |
| 产物 | `data/projects/*.project.json`、`*.score.json`、`data/sops/SOP-*.md` |
| 交付说明 | `docs/pipeline/01_skeleton.md` |

### 自检结论

- mock 流水线一条链跑通：2 篇 raw → 2 张项目卡 → 2 份评分 → 1 份 SOP
- 评分：流量主 **45/50 S 级**；露营噪声 **21/50 C 级**（未被误判为项目）
- 采集模块已在文件头、运行输出、README 三处标注「真实抓取未实现」
- 未修改 `shuihu-game` 或任何其他仓库

### 待指挥官决策

1. 是否接真实 LLM 做一次提炼质量对比（用现有 `prompts/*.md`）
2. 真实数据源的授权范围与接入方式
3. 十维是否改等权为业务加权

---

## 增补 CMD-001b 执行回报（2026-10-29 11:20）

**状态：READY_FOR_REVIEW（含 001b）**

### 1) 检索结果

| 来源 | 候选 | 结论 |
|---|---|---|
| 本机 `~/.workbuddy/skills/` | `research-brief` | ✅ 采用，驱动 extract 的 6 段结构 |
| 本机 | `investigate-first` | ✅ 采用，驱动 score 的取证纪律 |
| 本机 | `competitor-research` | ✅ 采用方法论，**不装其依赖**（NotebookLM/MCP/VNC） |
| 本机 | `competitor-intel` | ❌ 与 competitor-research 重复 |
| 网上 GitHub（Apache-2.0） | `anthropics/knowledge-work-plugins` → `competitive-brief` | ✅ 下载作参考，未接入主流程 |
| 网上 | claudskills 社区版 13 维竞品分析 | ❌ 社区注册表、许可不可核对、与十维重复 |
| 网上 | lobehub `research-planning` | ❌ 面向代码仓库规划，与内容分析无关 |

### 2) 已落地

- `skills/` 下 4 个目录，每个含 `SKILL.md` + `SOURCE.md`（来源/许可/是否修改）
- `skills/README.md`：清单、选用理由、调用顺序、安全声明
- `tools/skills.py`：运行时**读取** SKILL.md 解析步骤，解析失败才回退内置常量
- 产物写 `skills_applied` 字段，可核对本次走了哪几个 skill

### 3) 流程确实按 skill 步骤走（可验证）

| 环节 | skill | 产物里的证据 |
|---|---|---|
| extract | research-brief | `brief_sections` 含 6 段，`brief_source: skills/research-brief/SKILL.md` |
| score | investigate-first | 每维 `evidence_ref`；无据维度 `insufficient_evidence: true` 且封顶 2 分 |
| render | competitor-research | SOP 头部 `sections_ok: True`，缺节会报警 |

接入时发现并修掉两个真问题：
- 证据池漏了 `risks` → 合规维度永远判无证据
- 证据池漏了 `source_excerpt` → 「第二天见效」被判无证据

### 4) 去 AI 味（强制项）

- `prompts/deai.md`：删套话、删连接词、40 字拆句、动作具体化、不编造
- `tools/deai.py`：规则实现，同时处理项目卡与 SOP 正文
- 实跑：3 个文件、20 处改动，产出 `SOP-*.deai.md` + `data/deai-report.json`
- README 流程已改为 `extract → score → render → deai` 五步

### 5) 安全

- `skills/` 下只有 `.md`，没有任何 `.py` / `.sh` / `.js`
- 未执行任何下载来的脚本；官方 skill 仅文本参考（Apache-2.0 原文保留）
- 采集仍是本地样例，无抓号逻辑

---

## CMD-001b 补充（2026-10-29 11:32）— noslop/humanizer 类 Skill + 前后对照

**状态：READY_FOR_REVIEW**

### 本轮新增（在上一轮 001b 基础上）

| 项 | 内容 |
|---|---|
| 新增 skill | `skills/humanizer`（blader，MIT，60.8k★，26+ 条 AI 味模式）<br>`skills/no-ai-slop`（petergyang，MIT，7.3k★，编辑/检测双模式） |
| 许可核对 | 用 GitHub license API 核对两个仓库 spdx_id 均为 **MIT** |
| deai 增强 | `PATTERNS` 从 0 条扩到 8 类中文模式（二元对比/假深刻/三段式/空洞收尾/元评论/模糊限定/破折号/空洞提升）+ 20 个套话词 |
| 检测能力 | 新增 `detect()`，对应 no-ai-slop 的 detect 模式，只报不改 |
| 防病句 | 新增 `clean_text_safe()`：删词后句子不完整（句首标点/连续标点/缺谓语）就**回退原文**并标记 `需重写` |
| 前后对照 | `docs/pipeline/deai-before-after.md`（真实 SOP 差异 + 重度 AI 味文本的检测与局限） |

### 实跑结果

```
SOP-公众号流量主第-3-个月.md：9 处改动 → .deai.md
acc_demo_001 项目卡：11 处改动
病句检查（连续标点/句首标点）：0 处
```

真实 SOP 的 3 处差异都是长句拆分（26 字并列句拆两句），数字与平台名未动。

### 规则模式的边界（如实说明）

对重度 AI 味文本，检测能命中 11 处，但删词会删掉谓语（「通过…，副业变现，个人 IP 的商业价值。」）。
现在这类句子会回退原文并标 `需重写`。**要整句重写必须用 LLM 模式**（`LLM_API_KEY` + `prompts/deai.md`），
规则模式只做可审计的轻清洗。

### 未做

- deai 的 LLM 模式（接口已留，未联调）
- 英文模式直接套中文（已做中文映射，未逐条比对原文 26 条）
