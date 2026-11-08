# AutoClaw 添加账号 404 修复

问题：AutoClaw 关闭后，面板仍显示短信登录按钮，请求 /autoclaw/api/login/cn/sendcode 返回 404。
根因：先前按 WorkBuddy 专用安装配置关闭了 autoclaw.enabled。
修复：备份 ~/Applications/wb2api/config.json，将 autoclaw.enabled 改为 true，重启 com.wb2api.panel。
验证：同一不含手机号的测试请求，修复前 HTTP 404；修复后 HTTP 200，JSON error 为 phone required，证明路由与输入校验恢复。未发送真实短信。
原有 WorkBuddy 凭据文件数量：1。仍监听 127.0.0.1:7863。
后续：由用户刷新面板、发送短信并自行输入验证码，完成 AutoClaw 账号导入。
经验：关闭后端提供商并不会隐藏面板对应登录选项，排查登录 404 时先检查该提供商 enabled 配置。
