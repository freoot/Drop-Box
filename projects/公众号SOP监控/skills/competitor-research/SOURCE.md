# 来源与许可

- **来源**：本机 WorkBuddy 技能库 `~/.workbuddy/skills/competitor-research/`
  （软链自 `~/.claude/plugins/cache/competitor-research/competitor-research/0.7.0/skills/competitor-research`）
- **原始许可**：随 competitor-research 插件分发，仓库内仅作内部复用副本
- **是否修改**：`SKILL.md` 与 `section-definitions.md` 原文复制，未改动
- **在本项目里的用途**：**只复用方法论，不安装它的运行依赖**
  （原技能依赖 NotebookLM CLI、Google AI Mode MCP、VNC，本项目不需要也不引入）。
  取用的是它的「多源采集 → 分节整理 → 逐节核验 → 合并成 brief」流程，
  映射到 `tools/render_sop.py` 的 SOP 分节结构与 `tools/skills.py` 的分节校验。
