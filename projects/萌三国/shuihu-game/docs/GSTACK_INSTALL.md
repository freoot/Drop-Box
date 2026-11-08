# gstack 安装记录

日期：2026-10-18。
官方来源：https://github.com/garrytan/gstack
版本：1.91.132.0；下载时仓库提交 a59734fed685a49cbba2820a59295c8cd4278058。

使用 skill-installer 下载，随后执行官方 setup --host codex。源码由安装程序迁至 ~/.gstack/repos/gstack；路由与 gstack-* 技能注册到 ~/.codex/skills。安装 Bun 1.4.3、构建本地工具及 Playwright Chromium；遥测设为 off。Codex 支持级别由官方标为 experimental。

全局 ~/.codex/AGENTS.md 和项目 AGENTS.md 记录优先使用 gstack 的偏好。每轮实质任务读取路由并选择适用技能；结合 Blender、Godot 等领域工具。不把安装理解为发布、部署、付费或发送消息的授权。

验证：
- tools/check-gstack-install.mjs 通过：路由、review、qa、plan-eng-review、可执行工具与偏好文件。
- setup --status 通过：当前版本已安装，25 个技能章节链接全部有效。
- 游戏自动化测试 77 项通过（上一轮改动已单独提交 aa10953）。

技能下一轮可用。若技能列表未更新，可重启 Codex。以后更换模型，按官方说明重新运行 setup --host codex 生成匹配配置。
