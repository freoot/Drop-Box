#!/bin/zsh
set -e
MAGPIE="/Users/user/Applications/magpie.app/Contents/MacOS/magpie"
if ! "$MAGPIE" healthcheck >/dev/null 2>&1; then
  "$MAGPIE" daemon start >/dev/null
fi
open -a "/Applications/Claude.app"

