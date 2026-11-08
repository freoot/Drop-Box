#!/bin/bash
# 水浒 · 武松打虎教学闭环（双击试玩入口，macOS）
#
# 双击本文件 → 打开终端 → 启动 Godot → 直接进入打虎教学。
# 想从头开始（清掉已获得的武松）：用独立临时存档，不动你的正式存档
#   ./play-tiger-tutorial.command -- --scratch-save
# 每次这样启动都会生成一个全新的专属存档文件（不会和正式存档、历史存档混用）。
# 正式存档 user://save.json 只会被正常流程写入（招募/编队），
# 游戏里没有「重置/删除存档」的功能入口。
#
# 玩法（固定站位回合制，不走格子）
#   鼠标左键点猛虎 = 锁定目标（它脚踩小金圈、头顶小箭头，点它可重新锁定）
#   出拳        +25 怒气，18 伤害
#   虎影重击     消耗 50 怒气，35 伤害（怒气够了顶部会亮「就绪」横幅）
#   对话与结算按「继续」
#   打虎赢了 → 猛虎败退 → 弹出武松人物卡 → 点「带上他」→ 编队 → 携武松再战
#   右上角「音乐：关」可开关战斗音乐（用项目自有原创曲目，默认不响）
#
# 流程：打虎教学 → 胜利必得武松 → 编队 → 携武松再战

cd "$(dirname "$0")" || {
  echo "❌ 无法进入项目目录"
  read -n 1 -s -r -p "按任意键关闭..."
  exit 1
}

cat <<'BANNER'
==========================================
  水浒 · 武松打虎教学
==========================================
  鼠标左键点猛虎   锁定目标（它脚踩小金圈）
  出拳             +25 怒气，18 伤害
  虎影重击          消耗 50 怒气，35 伤害
                   （怒气够了，顶部会亮「就绪」横幅）
  对话/结算        按「继续」
  右上角「音乐」   可开关战斗音乐（默认关）
------------------------------------------
  流程：打虎 → 猛虎败退 → 招募武松 → 编队 → 再战
==========================================

BANNER

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
  echo "  2) 或者手动指定路径后运行："
  echo "     GODOT=/你的/Godot/路径 ./play-tiger-tutorial.command"
  echo ""
  read -n 1 -s -r -p "按任意键关闭窗口..."
  exit 1
fi

echo "Godot：$GODOT"
echo "版本：$("$GODOT" --version 2>&1 | head -1)"
echo ""

SCENE="res://godot/tiger_tutorial/tiger_tutorial.tscn"
if [ ! -f "godot/tiger_tutorial/tiger_tutorial.tscn" ]; then
  echo "❌ 找不到场景：godot/tiger_tutorial/tiger_tutorial.tscn"
  echo "   项目文件可能不完整，请重新拉取仓库。"
  read -n 1 -s -r -p "按任意键关闭窗口..."
  exit 1
fi

if [ ! -f "assets/releases/ART-002/r6/models/wusong.glb.import" ]; then
  echo "⚠️  资源还没导入（缺少 wusong.glb.import）。"
  echo "   首次运行需要先执行：bash tools/godot-import.sh"
  echo ""
fi

"$GODOT" --path . "$SCENE" "$@"
code=$?

echo ""
if [ "$code" -eq 0 ]; then
  echo "✅ 已退出。"
else
  echo "❌ Godot 启动失败（退出码 $code）。"
  echo "   常见原因："
  echo "     · 资源未导入 → 先运行 bash tools/godot-import.sh"
  echo "     · 显卡驱动问题 → 试试加 --rendering-driver opengl3"
  echo ""
  read -n 1 -s -r -p "按任意键关闭窗口..."
fi
exit "$code"
