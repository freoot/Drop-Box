#!/usr/bin/env bash
# 本地静态服务器。必须在**仓库根**起服务，页面才能按相对路径加载 data/ 与 assets/。
#
# 用法：
#   tools/serve.sh            # 默认 8765 端口
#   PORT=9000 tools/serve.sh
#
# 起好后访问：http://127.0.0.1:${PORT}/shuihu-game/index.html
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
PORT="${PORT:-8765}"

echo "服务根目录：${REPO_ROOT}"
echo "打开：http://127.0.0.1:${PORT}/shuihu-game/index.html"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO_ROOT"
