# 公众号赚钱信号 SOP 系统（第一版骨架）

监控公众号 → 采文章 → 提炼项目 → SABC 打分 → 产出可复制的 SOP。

**当前阶段只做微信公众号线**，采集是**占位实现**（只读本地样例），不抓真实账号。
不做抖音/小红书，不做批量注册，不做绕过风控的抓取。

---

## 快速开始

```bash
cd /Users/user/Documents/Codex/ops/wechat-sop-monitor

# 依赖（可选：核心流程只用标准库，装了才能接真实 LLM）
python3 -m pip install -r requirements.txt

# 一条链跑通 mock 流水线（五步，最后一步 deai 是强制项）
python3 tools/fetch_articles.py --from-seeds
python3 tools/extract_project.py --all      # ← skill: research-brief
python3 tools/score_sabc.py --all           # ← skill: investigate-first
python3 tools/render_sop.py --all           # ← skill: competitor-research
python3 tools/deai.py --all                 # 去 AI 味，产出 *.deai.md
```

跑完应该看到：

```
data/raw/acc_demo_001-xxxxxxxx.json              # 2 篇原始文章
data/projects/*.project.json                     # 2 张项目卡（含 brief_sections 6 段）
data/projects/*.score.json                       # 2 份评分（1 个 S、1 个 C，每维带 evidence_ref）
data/sops/SOP-公众号流量主第-3-个月.md             # 1 份 SOP（只渲染 ≥A）
data/sops/SOP-公众号流量主第-3-个月.deai.md        # 去 AI 味后的最终版
data/deai-report.json                            # 去味改动记录
```

---

## 目录

```
wechat-sop-monitor/
├── data/
│   ├── seeds/
│   │   ├── accounts.csv            # 种子公众号表（5 行示例，假名，标注 example）
│   │   └── sample_articles.json    # 2 篇样例：1 篇流量主、1 篇噪声
│   ├── raw/                        # 采集产物（.gitignore 忽略，仅留 .gitkeep）
│   ├── projects/                   # 项目卡 + 评分
│   └── sops/                       # 渲染出的 SOP
├── tools/
│   ├── common.py                   # 路径 / JSON / slug
│   ├── skills.py                   # 读取 skills/ 下的步骤定义并落地校验
│   ├── fetch_articles.py           # 采集（占位）
│   ├── extract_project.py          # 提炼项目卡（LLM 或规则）
│   ├── score_sabc.py               # 十维评分
│   ├── render_sop.py               # 渲染 SOP
│   └── deai.py                     # 去 AI 味（强制最后一步）
├── skills/                         # 项目用到的 Skill（纯提示词，无脚本）
│   ├── README.md                   # 清单 / 来源 / 许可 / 调用顺序
│   ├── research-brief/
│   ├── investigate-first/
│   ├── competitor-research/
│   └── anthropics-competitive-brief/
├── prompts/
│   ├── extract.md                  # 提炼提示词
│   ├── score.md                    # 评分提示词 + 十维定义
│   └── deai.md                     # 去 AI 味规则
├── docs/pipeline/01_skeleton.md    # 自检清单与交付路径
└── docs/collaboration/handoffs/    # 交接单
```

---

## Skill 怎么驱动流程

`skills/` 下放的是**纯提示词**（SKILL.md），没有可执行脚本。
`tools/skills.py` 每次运行都会**读取**这些文件，把里面的步骤变成可校验的规则：

| Skill | 落地位置 | 具体做什么 |
|---|---|---|
| `research-brief` | `extract_project.py` | 项目卡按 6 段组织：Overview / Key facts / Key players / Current state / Open questions / Reading。写入 `brief_sections` 字段 |
| `investigate-first` | `score_sabc.py` | 每维必须带 `evidence_ref` 指回原文；指不到的维度封顶 2 分并标 `insufficient_evidence` |
| `competitor-research` | `render_sop.py` | SOP 按 6 节渲染，生成后逐节核验，缺节会报警 |
| `humanizer` | `deai.py` | 26+ 条 AI 味模式映射成中文规则（二元对比、假深刻、三段式…） |
| `no-ai-slop` | `deai.py` | 编辑/检测双模式：`detect()` 只报不改，`clean_text()` 最小改动 |
| `anthropics-competitive-brief` | 无（仅参考） | 借 Value Proposition 四要素检查证据质量 |

来源、许可、为什么这么选，见 `skills/README.md`。
注意：`competitor-research` 原技能依赖 NotebookLM CLI / Google AI Mode MCP / VNC，
本项目**只复用方法论，不安装它的依赖**。

产物里会写 `skills_applied` 字段，可以核对这次到底走了哪几个 skill。

## 去 AI 味（强制）

`tools/deai.py` 是流水线最后一步，规则见 `prompts/deai.md`：

1. 删套话（赋能、抓手、闭环、生态、全面提升…）
2. 删句首连接词（首先、其次、值得注意的是、综上所述…）
3. 长句拆到 40 字以内，断处补句号
4. 动作必须是动词开头、带数量或频率
5. 不补原文没有的数字

它同时处理项目卡（`summary` / `copyable_steps`）和 SOP 正文，输出 `*.deai.md` 与
`data/deai-report.json`（记录每处改动 + 命中的模式）。

删词后如果句子不完整（句首标点、连续标点、「通过 X，Y。」缺谓语），会**回退原文**并标记
`需重写`——宁可保留一句 AI 腔，也不往 SOP 里塞病句。前后对照见
`docs/pipeline/deai-before-after.md`。

## 五个工具

### 1. `fetch_articles.py` — 采集（占位）

```bash
python3 tools/fetch_articles.py --from-seeds              # 全部样例
python3 tools/fetch_articles.py --from-seeds --limit 1    # 只取 1 条
python3 tools/fetch_articles.py --account acc_demo_001    # 指定账号
python3 tools/fetch_articles.py --from-seeds --dry-run    # 只打印
```

> ⚠️ **真实抓取未实现**。本模块只读 `data/seeds/sample_articles.json`。
> 代码里没有任何枚举历史文章、绕过登录/验证码/风控、或高频请求的逻辑，
> 将来也只允许接「已授权或公开可访问」的来源。

### 2. `extract_project.py` — 提炼项目卡

```bash
python3 tools/extract_project.py --all
python3 tools/extract_project.py --input data/raw/xxx.json --force
```

两种模式：

| 模式 | 触发条件 | 说明 |
|---|---|---|
| LLM | 同时设置 `LLM_API_BASE` + `LLM_API_KEY` | 用 `prompts/extract.md` 调 OpenAI 兼容 `/chat/completions`，要求返回 JSON |
| 规则/mock | 没有 key，或请求失败/返回不合法 | 关键词 + 章节结构 + 数字句抽取，离线可跑 |

输出字段：`project_name`、`summary`、`copyable_steps[]`、`evidence[]`、`risks[]`、
`source_article_id`，外加 `relevance`、`source_excerpt` 等辅助字段。

### 3. `score_sabc.py` — 十维评分

```bash
python3 tools/score_sabc.py --all
```

### 4. `render_sop.py` — 渲染 SOP

```bash
python3 tools/render_sop.py --all                 # 只渲染 S/A
python3 tools/render_sop.py --all --min-grade B   # 放宽到 B
```

输出 `data/sops/SOP-<项目名>.md`，含：项目名、一句话、第一周动作清单、证据、评分表、风险、来源。
渲染时已内联 deai 清洗，生成后再由 `deai.py` 出最终版。

### 5. `deai.py` — 去 AI 味

```bash
python3 tools/deai.py --all
python3 tools/deai.py --input data/sops/SOP-xxx.md
python3 tools/deai.py --all --dry-run     # 只统计改动，不写盘
```

---

## SABC 十维（每维 1–5 分）

| # | 维度 | 5 分 | 1 分 |
|---|---|---|---|
| 1 | 容量 | 需求盘子大、能长期产出 | 一次性、极窄且无持续需求 |
| 2 | 新手友好 | 零基础 5 步内可做，无技术门槛 | 需要编程/资质/团队 |
| 3 | 链路 | 内容→关注→私域→成交 全通 | 只有内容没有承接 |
| 4 | 变现路径 | 收益明确 + 有单价/结算 | 只说「能赚钱」 |
| 5 | 趋势窗口 | 明确处在规则/平台红利期 | 红海晚期 |
| 6 | 证据强度 | ≥5 条带数字的可核对证据 | 全是主观描述 |
| 7 | 可SOP化 | ≥5 个固定动作，可交人重复执行 | 靠个人手感 |
| 8 | 反馈周期 | 当天/次日见结果 | 半年以上 |
| 9 | 差异化 | 明确窄口、避开红海 | 与大量同类正面竞争 |
| 10 | 合规/可复制稳定性 | 无违规手段、风险已列明（**分越高越安全**） | 依赖搬运/刷量/绕风控 |

**总分 = 十维之和（10–50）**

| 等级 | 阈值 | 含义 |
|---|---|---|
| S | ≥ 42 | 值得立刻做成 SOP |
| A | ≥ 34 | 可以试跑，边做边验证 |
| B | ≥ 26 | 仅作观察，不投主力 |
| C | < 26 | 放弃 |

> 第 10 维方向特殊：**分数越高代表越合规**，不是越危险。

---

## 接真实 LLM

```bash
export LLM_API_BASE="https://your-endpoint/v1"
export LLM_API_KEY="sk-..."
export LLM_MODEL="gpt-4o-mini"      # 可选
python3 tools/extract_project.py --all --force
```

任何异常（超时、返回非 JSON、缺字段）都会自动回退规则模式，不会中断流水线。

---

## 合规声明

- 本仓库**不包含**任何真实抓取实现，也不提供绕过微信登录/验证码/风控的方法。
- `data/seeds/sample_articles.json` 里的 url 全部是 `EXAMPLE_ONLY_DO_NOT_FETCH_*` 占位。
- 生成的 SOP 只是对公开内容的结构化整理，**不构成收益承诺**；执行前请自行核对平台最新规则。
- 不做批量注册公众号、不做多平台分发、不接支付。

---

## 已知限制

- 规则模式是启发式：能区分「有动作+有数字」和「纯游记」，但不懂语义，遇到反讽/软文会误判。
- 评分是关键词 + 结构计数，不是真正的商业判断；S 级只代表「值得人工复核」，不代表「一定赚钱」。
- 项目卡与评分目前一对一，没有做跨文章聚类（同一项目多篇报道会各出一张卡）。
- 采集只有本地样例，没有真实数据源、没有增量去重、没有限速。
