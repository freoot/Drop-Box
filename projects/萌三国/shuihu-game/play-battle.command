#!/bin/bash
# 水浒 · 最小战斗试玩入口（macOS 双击运行）
#
# 双击本文件会打开「终端」并启动 Godot 战斗场景。
# 也可以命令行运行：./play-battle.command
#
# 如果双击没反应，先给执行权限：
#   chmod +x play-battle.command

cd "$(dirname "$0")" || {
  echo "❌ 无法进入项目目录"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
}

cat <<'BANNER'
==========================================
  水浒 · 最小战斗（hero005）
==========================================
  A / ←    向左移动
  D / →    向右移动
  J / 空格  攻击（要面向敌人才打得中）
  R        重开
------------------------------------------
  说明：只有左右两个方向；背对敌人打不中；
        被打死后按 J 无效，按 R 重开。
==========================================

BANNER

# ---- 找 Godot ----
GODOT="${GODOT:-}"
CANDIDATES=(
  "/Applications/Godot.app/Contents/MacOS/Godot"
  "$HOME/Applications/Godot.app/Contents/MacOS/Godot"
  "/Applications/Godot_mono.app/Contents/MacOS/Godot"
)

if [ -z "$GODOT" ]; then
  for c in "${CANDIDATES[@]}"; do
    if [ -x "$c" ]; then GODOT="$c"; break; fi
  done
fi

if [ -z "$GODOT" ] || [ ! -x "$GODOT" ]; then
  echo "❌ 没找到 Godot 可执行文件，无法启动。"
  echo ""
  echo "已经找过这些位置："
  for c in "${CANDIDATES[@]}"; do echo "    $c"; done
  echo ""
  echo "怎么解决："
  echo "  1) 安装 Godot 4.7 或更高版本：https://godotengine.org/download"
  echo "     装好后确认应用在「应用程序」文件夹里"
  echo "  2) 或者手动指定路径后运行："
  echo "     GODOT=/你的/Godot/路径 ./play-battle.command"
  echo ""
  read -n 1 -s -r -p "按任意键关闭窗口..."
  exit 1
fi

echo "Godot：$GODOT"
echo "版本：$("$GODOT" --version 2>&1 | head -1)"
echo "项目：$(pwd)"
echo ""

# ---- 检查场景与导入产物 ----
if [ ! -f "godot/battle/hero_battle_stage.tscn" ]; then
  echo "❌ 找不到战斗场景：godot/battle/hero_battle_stage.tscn"
  echo "   项目文件可能不完整，请重新拉取仓库。"
  read -n 1 -s -r -p "按任意键关闭窗口..."
  exit 1
fi

if [ ! -f "assets/releases/ART-002/r9/models/hero005.glb.import" ]; then
  echo "⚠️  资源还没导入（缺少 hero005.glb.import）。"
  echo "   首次运行需要先执行：bash tools/godot-import.sh"
  echo "   现在尝试直接启动，如果黑屏请先跑上面的导入命令。"
  echo ""
fi

# ---- 启动 ----
# 允许透传参数，便于命令行测试：./play-battle.command -- --quit-after 2
"$GODOT" --path . res://godot/battle/hero_battle_stage.tscn "$@"
code=$?

echo ""
if [ "$code" -eq 0 ]; then
  echo "✅ 已退出。"
else
  echo "❌ Godot 启动失败（退出码 $code）。"
  echo "   常见原因："
  echo "     · 资源未导入 → 先运行 bash tools/godot-import.sh"
  echo "     · 显卡驱动/渲染器不兼容 → 试试加 --rendering-driver opengl3"
  echo ""
  read -n 1 -s -r -p "按任意键关闭窗口..."
fi
exit "$code"
