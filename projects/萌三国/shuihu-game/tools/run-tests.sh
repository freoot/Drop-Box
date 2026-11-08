#!/usr/bin/env bash
# 测试总入口（可复现）：语法检查 + 脚本护栏哨兵测试 + 全量单元测试。
#
# 用法：tools/run-tests.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[1/3] 语法检查"
node --check game.js
node --check data/journey.js
node --check data/shuihu.js
node --check data/portraits.js
node --check data/hero-stories.js
node --check journey.js
node --check tavern-ui.js
node --check bgm.js
node --check character-studio.js

echo "[2/3] 导入脚本路径护栏（哨兵文件保护测试）"
bash tools/tests/import-work-guard.test.sh | tail -3

echo "[3/3] 全量单元测试"
node --test tests/*.test.mjs
