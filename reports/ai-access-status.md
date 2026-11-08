# AI 接入状态

更新时间：2026-11-08

本地 AI 读取 `/Users/user/Obsidian/Drop-Box`；云端 AI 读取 GitHub 上已推送的 `freoot/Drop-Box` 副本。本机文件不会因为连接 GitHub 就自动出现在云端 AI 的本地文件系统中。

| 工具 | 接入方式 | 当前状态 | 验证 |
|---|---|---|---|
| WorkBuddy | 本机目录 + `gh` | 已接通 | 已读取共享验证文件并推送 GitHub |
| Devin | 本机目录 + GitHub `freoot` | 已接通 | 已读取验证短语 |
| Codex | 本机信任项目 | 已配置 | 配置检查通过；实际读取受账号额度限制 |
| Claude Desktop | macOS 文件夹授权 | 待授权 | 已用该目录打开应用，需在应用内确认文件夹权限 |
| Muse | 本机目录 + `AGENTS.md` | 待登录 | 规则已就绪；Muse 尚未登录 |
| Grok | GitHub Connector | 待登录授权 | 已打开连接器页，需登录后完成 GitHub OAuth |
| OpenMausBot | 本机目录 + 引擎 | 待配对 | 服务和引擎正常；桌面版要求用户端配对后才能写入共享助手 |

## 共同规则

所有工具开始工作前读取 `AGENTS.md`。共享文件放 `inbox/`，归档放 `projects/`。仓库公开，禁止提交密钥、账号配置、私人数据和超限文件。
