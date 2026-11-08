#!/bin/zsh
set -u

ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
PID_FILE="$ROOT/.streamlit.pid"
URL="http://127.0.0.1:8501"

if [[ ! -f "$PID_FILE" ]]; then
  echo "没有找到由启动器登记的 Kokoro Studio 进程。"
  read -r "?按回车关闭窗口。"
  exit 0
fi

SERVER_PID="$(<"$PID_FILE")"
COMMAND="$(/bin/ps -p "$SERVER_PID" -o command= 2>/dev/null || true)"
if [[ "$COMMAND" == *"$ROOT/.venv/bin/streamlit"* && "$COMMAND" == *"$ROOT/streamlit_app.py"* ]]; then
  kill "$SERVER_PID"
  rm -f "$PID_FILE"
  echo "已停止 Kokoro Studio。"
else
  rm -f "$PID_FILE"
  echo "启动记录已过期，未找到对应的 Kokoro Studio 进程。"
fi

read -r "?按回车关闭窗口。"
