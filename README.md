# Drop-Box 共享工作区

这是多个 AI 工具共用的文件交换与项目归档库。

- 本地目录：`/Users/user/Obsidian/Drop-Box`
- GitHub：https://github.com/freoot/Drop-Box
- 可见性：公开
- 同步：本机定时任务会先提交本地改动，再拉取远端更新并推送。

## 目录

- `inbox/`：用户或任意 AI 投放的共享文件。其他 AI 从这里读取。
- `projects/`：旧项目及持续项目的归档，每个项目一个独立目录。
- `reports/`：接入状态、归档清单和安全检查结果。
- `AGENTS.md`：所有 AI 必须遵守的协作规则。

## 使用方式

本机 AI 直接打开 `/Users/user/Obsidian/Drop-Box`。云端 AI 连接 GitHub 仓库 `freoot/Drop-Box`。如果需要让其他 AI 读取某个文件，优先放入 `inbox/` 并等待同步完成。

不要把密码、访问令牌、账号配置、私人数据或超过 GitHub 限制的大文件放进这个公开仓库。
