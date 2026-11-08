#!/bin/bash
# 双击启动《是好汉就上山》：在本目录开静态服务（端口 8765），然后用默认浏览器打开游戏。
cd "$(dirname "$0")" || exit 1
PORT=8765
URL="http://127.0.0.1:$PORT/shuihu-game/index.html"
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已有服务在运行，直接打开游戏。"
else
  echo "正在启动本地服务：$PWD (端口 $PORT)"
  nohup python3 -m http.server $PORT --bind 127.0.0.1 > /tmp/shuihu-server.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break
    sleep 0.5
  done
fi
open "$URL"
echo "已打开 $URL"
echo "服务在后台运行；关闭方法：lsof -ti tcp:$PORT | xargs kill"
