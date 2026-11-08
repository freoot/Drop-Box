#!/bin/zsh
cd "$(dirname "$0")"
if curl -sf --max-time 1 http://127.0.0.1:8768/api/state >/dev/null; then
  open http://127.0.0.1:8768
else
  python3 app.py --open
fi
