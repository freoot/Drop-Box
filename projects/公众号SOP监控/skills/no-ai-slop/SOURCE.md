# 来源与许可

- **来源**：`https://github.com/petergyang/no-ai-slop`（`skills/no-ai-slop/SKILL.md`，97 行）
- **下载时间**：2026-10-29，经 GitHub API 取默认分支 `main` 原文
- **许可**：**MIT License**（仓库 `LICENSE`，已用 GitHub license API 核对 spdx_id = MIT）
- **是否修改**：SKILL.md 原文保存，未改动
- **在本项目里的用途**：提供「编辑 / 检测」双模式的思路——
  `tools/deai.py` 的 `detect()` 对应它的 detect 模式（只报不改），
  `clean_text()` 对应 edit 模式（最小改动，不把文字改成另一种腔调）。
- **为什么选它**：它把「保护作者原话」写成硬约束（不改写有辨识度的句子、不编造数字），
  正好对上本项目「不编造证据」的要求。
- **安全**：只取 `SKILL.md` 纯文本，未下载 `scripts/` 下任何脚本。
