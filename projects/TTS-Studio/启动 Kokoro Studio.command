#!/bin/zsh
set -u

ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
URL="http://127.0.0.1:8501"
HEALTH="$URL/_stcore/health"
PID_FILE="$ROOT/.streamlit.pid"
LOG_FILE="$ROOT/streamlit.log"

is_kokoro_up() {
  /usr/bin/curl -fsS "$HEALTH" >/dev/null 2>&1 && \
    /usr/bin/curl -fsS "$URL" 2>/dev/null | /usr/bin/grep -q "Kokoro Studio"
}

if is_kokoro_up; then
  /usr/bin/open "$URL"
  exit 0
fi

if [[ ! -x "$ROOT/.venv/bin/streamlit" ]]; then
  echo "未找到 Kokoro Studio 环境：$ROOT/.venv/bin/streamlit"
  echo "请保留安装目录中的 .venv 文件夹。"
  read -r "?按回车关闭窗口。"
  exit 1
fi

export HF_HOME="$ROOT/.hf-cache"
export STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

nohup "$ROOT/.venv/bin/streamlit" run "$ROOT/streamlit_app.py" \
  --server.address 127.0.0.1 \
  --server.port 8501 \
  --server.headless true \
  >"$LOG_FILE" 2>&1 </dev/null &
SERVER_PID=$!
print -r -- "$SERVER_PID" > "$PID_FILE"

for attempt in {1..90}; do
  if is_kokoro_up; then
    /usr/bin/open "$URL"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Kokoro Studio 启动失败。日志位置：$LOG_FILE"
    /usr/bin/tail -n 40 "$LOG_FILE"
    read -r "?按回车关闭窗口。"
    exit 1
  fi
  sleep 1
done

echo "Kokoro Studio 启动超时。日志位置：$LOG_FILE"
/usr/bin/tail -n 40 "$LOG_FILE"
read -r "?按回车关闭窗口。"
exit 1
