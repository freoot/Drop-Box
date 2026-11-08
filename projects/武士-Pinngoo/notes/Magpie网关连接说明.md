# Magpie 网关

安装来源：https://github.com/yetone/magpie/releases/tag/v0.1.1305
安装位置：/Users/user/Applications/magpie.app
版本：v0.1.1305（Apple Silicon，安装时签名及 macOS 公证验证通过）

## 连接

客户端 → Magpie http://127.0.0.1:3425/v1 → wb2api http://127.0.0.1:7863/v1

- 提供商：WorkBuddy Local，ID wb2api
- 客户端 API Base URL：http://127.0.0.1:3425/v1
- 本机客户端 API Key：magpie
- 已验证模型：wb2api/glm-5.3-flash
- 模型使用 wb2api/ 前缀；当前网关目录提供 24 个模型。
- wb2api 的实际密钥已由 Magpie 保存在其本机提供商配置中。

## 启动

登录 Mac 后由后台服务自动启动网关；手动打开 magpie.app 可进入图形界面。
后台服务：~/Library/LaunchAgents/com.yetone.magpie.serve.plist
日志：~/Library/Logs/magpie/serve.log
配置：~/.config/magpie/
账号自动发现已关闭，此次只接入指定的 wb2api 服务。

## 验证

通过 Magpie 调用 wb2api/glm-5.3-flash，HTTP 200，8 秒返回 OK。
网关监听 127.0.0.1:3425，未开放局域网访问。
