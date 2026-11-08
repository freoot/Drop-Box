# skills/ · 本项目用到的 Skill

这里存放**纯提示词**（SKILL.md + 参考文档），没有可执行脚本。
流水线通过 `tools/skills.py` 读取它们的步骤，落到 extract / score / render 三个环节。

## 清单

| Skill | 来源 | 许可 | 用途 | 驱动流程 |
|---|---|---|---|---|
| `research-brief` | 本机 `~/.workbuddy/skills/research-brief` | 随 WorkBuddy 插件分发 | 6 段 brief 结构：Overview / Key facts / Key players / Current state / Open questions / Reading | ✅ `extract_project.py` |
| `investigate-first` | 本机 `~/.workbuddy/skills/investigate-first` | 随 caveman 插件分发 | 取证纪律：先证据后结论，无证据不得给高分 | ✅ `score_sabc.py` |
| `competitor-research` | 本机 `~/.workbuddy/skills/competitor-research` | 随 competitor-research 插件分发 | 多源→分节→逐节核验→合并；**只用方法论，不装依赖** | ✅ `render_sop.py` |
| `humanizer` | [blader/humanizer](https://github.com/blader/humanizer) | **MIT** | 26+ 条 AI 味模式（二元对比、假深刻、三段式、空洞收尾…） | ✅ `deai.py` 规则来源 |
| `no-ai-slop` | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) | **MIT** | 编辑 / 检测双模式；保护原话、不编数字 | ✅ `deai.py` 检测模式 |
| `anthropics-competitive-brief` | [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins/blob/main/marketing/skills/competitive-brief/SKILL.md) | **Apache-2.0** | 参考：Value Proposition 四要素、Content Gap 思路 | ❌ 仅参考 |

每个目录下的 `SOURCE.md` 写明来源、许可、是否修改。

## 为什么这么选

**用 research-brief**：它把「一篇材料」拆成固定 6 段，正好对应项目卡要回答的问题。
不用它，`summary` 容易写成一段没有重点的复述。

**用 investigate-first**：评分最怕「凭感觉给分」。它的纪律是「先区分观察与推断，
再按证据排序」，所以 `score_sabc.py` 每个维度都必须写出 `evidence_ref`，
指不到证据的维度直接标记 `insufficient_evidence` 并封顶 2 分。

**用 competitor-research 的方法论、不用它的依赖**：它依赖 NotebookLM CLI +
Google AI Mode MCP + VNC，跑起来要配一堆环境，而本项目只需要它的
「分节 + 逐节核验」思路。所以只复制 SKILL.md 作参考，`tools/skills.py` 里实现分节校验。

**不用 anthropics/competitive-brief 做主流程**：它面向 B2B 竞品营销
（battlecard、异议处理、landmine 问题），与「公众号文章 → 可复制项目」不是一回事。
只借用 Value Proposition 四要素来检查证据质量。

**评估过但没选的**：
- `competitive-research`（claudskills 社区版，13 维打分）：思路接近，但来源是社区注册表、
  无可核对许可，且与现有十维重复，不引入。
- `research-planning`（lobehub）：面向代码仓库的功能规划，与内容分析无关。
- `stop-slop`（Hardik Pandya，MIT，16.2k★）：模式与 humanizer 高度重叠，只取一个够用。
- `cursor/plugins` 的 `unslop`：需要 Cursor 插件体系，本项目不引入。

## 调用顺序

```
fetch_articles.py
      ↓  data/raw/*.json
extract_project.py  ←─ skills/research-brief（6 段结构）
      ↓  data/projects/*.project.json
score_sabc.py       ←─ skills/investigate-first（每维必须引用证据）
      ↓  data/projects/*.score.json
render_sop.py       ←─ skills/competitor-research（分节 + 逐节核验）
      ↓  data/sops/SOP-*.md
deai.py             ←─ prompts/deai.md（去 AI 味，强制最后一步）
      ↓  data/sops/SOP-*.deai.md
```

每一步都会在产物里写入 `skills_applied` 字段，便于核对到底走没走 skill 步骤。

## 安全声明

- 只收 `SKILL.md` 与参考 `.md`，**没有任何 `.py` / `.sh` / `.js` 可执行文件**。
- 未执行任何下载来的脚本；官方 skill 只作为文本参考。
- 不涉及公众号抓取，采集仍是本地样例。
