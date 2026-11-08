#!/bin/zsh
set -e
DOMAIN="gui/$(id -u)"
if ! /bin/launchctl print "$DOMAIN/com.wb2api.panel" >/dev/null 2>&1; then
  /bin/launchctl bootstrap "$DOMAIN" "$HOME/Library/LaunchAgents/com.wb2api.panel.plist"
fi
/usr/bin/open "http://127.0.0.1:7863/panel/"

