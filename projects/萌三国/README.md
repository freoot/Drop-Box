# 工作区目录

水浒游戏《是好汉就上山》的全部正式内容已集中在 [shuihu-game](shuihu-game/README.md)。

- 网页入口：`shuihu-game/index.html`
- Godot 工程：`shuihu-game/project.godot`
- 游戏测试：`node --test shuihu-game/tests/*.test.mjs`
- `pinngoo-studio/` 是独立项目，保持原位。旧原型、未跟踪与归属不明文件保持原位。

在仓库根运行 `python3 -m http.server 8765 --bind 127.0.0.1`，访问 <http://127.0.0.1:8765/shuihu-game/index.html>。根目录旧入口自动跳转到新位置，继续使用相同地址与端口可保留浏览器原存档。

也可以进入 `shuihu-game`，按其中 README 启动。Git 仓库和历史仍位于当前根目录。
