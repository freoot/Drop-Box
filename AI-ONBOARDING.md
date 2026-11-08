# 接入提示词（复制给每个 AI 用）

一个库，多个 AI 共用。本机 AI 读本地目录，云端 AI 读 GitHub。下面「通用版」可直接用；每个工具的具体替换句在后面。

- 本机路径：`/Users/user/Obsidian/Drop-Box`
- GitHub：`https://github.com/freoot/Drop-Box`
- 验证短语在 `inbox/ai-access-probe.md`

---

## 一、通用版（推荐，所有工具都能用）

复制以下全文，粘给 AI：

```
从现在起，你接入我的共享工作库，和 Codex、Claude、Grok、Muse、WorkBuddy、Devin、OpenMausBot 共用同一个库。

读取位置（取你能访问的那个）：
- 本机：/Users/user/Obsidian/Drop-Box
- 云端：https://github.com/freoot/Drop-Box

现在只做只读检查，不要修改任何文件：
1. 读 AGENTS.md（协作规则，必须遵守）
2. 读 README.md 和 AI-ACCESS.md
3. 读 reports/archive-manifest.md，看已归档了哪些项目
4. 列一下 inbox/ 里现有的文件
5. 读 inbox/ai-access-probe.md，把里面的验证短语原样告诉我

然后用这 5 行回答，不要写别的内容：
1. 我读的是：本地 / GitHub（写实际路径或 URL）
2. 验证短语：<原文>
3. projects/ 下有 N 个项目：<项目名，逗号分隔>
4. inbox/ 现有文件：<文件名>
5. 我能否写文件：能 / 不能

以后的长期规则：
- 每次开工先读 AGENTS.md
- 新产出放 inbox/，项目放 projects/<名称>/
- 这是公开仓库：绝不写入密钥、.env、令牌、Cookie、私钥、账号数据
- 不删除或覆盖其他 AI 的文件，不新建同步任务，不 force push
```

只要它回的第 2 行是 `DROPBOX-SHARED-READY-2026`，就说明真的读到内容了，而不是在猜。

---

## 二、按工具换成这一句

把通用版的第 1 段替换成下面这句，其余不动。

**Claude（桌面版）**——先在 Cowork → New Project → Add Folder 选 `/Users/user/Obsidian/Drop-Box`，再发：
```
你已经获得 /Users/user/Obsidian/Drop-Box 这个文件夹的访问权限。从现在起它是我和多个 AI 共用的工作库。
```

**Codex**——在该目录下启动（`codex -C ~/Obsidian/Drop-Box`），再发：
```
你的工作目录就是 /Users/user/Obsidian/Drop-Box，这是我和多个 AI 共用的库。
```

**Devin**——`cd ~/Obsidian/Drop-Box` 后启动，再发：
```
你的工作区是 /Users/user/Obsidian/Drop-Box；你还连着 GitHub 的 freoot/Drop-Box，两边是同一个库。
```

**Muse**——登录后在 `~/Obsidian/Drop-Box` 打开，再发：
```
你的工作区是 /Users/user/Obsidian/Drop-Box，这是我和多个 AI 共用的库。
```

**WorkBuddy**——把工作目录设为 `~/Obsidian/Drop-Box`，再发：
```
你的工作目录是 /Users/user/Obsidian/Drop-Box，这是我和多个 AI 共用的库。
```

**Grok**——先登录 `grok.com/connectors`，新建 GitHub Connector 并授权 `freoot/Drop-Box`，再发：
```
你访问不了我的电脑，请通过 GitHub Connector 读 https://github.com/freoot/Drop-Box，这是我和多个 AI 共用的库。
```

**OpenMausBot**——在应用里新建机器人，工作文件夹填 `/Users/user/Obsidian/Drop-Box`，再发：
```
你的工作文件夹是 /Users/user/Obsidian/Drop-Box，这是我和多个 AI 共用的库。
```

---

## 三、验收标准

| 结果 | 含义 |
|---|---|
| 验证短语正确 | 已接通 |
| 说读不到 / 找不到文件 | 权限或路径没生效，先解决再谈协作 |
| 只有概述没有原句 | 没真正读文件，换更严格的模型或重发 |

全部通过后，在 `reports/ai-access-status.md` 里把对应工具改成「已接通」。
