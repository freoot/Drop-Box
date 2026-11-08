#!/usr/bin/env bash
# CMD-017/018 · 打一个**试玩用工程包**（原型阶段）。
#
# ⚠️ 这是**资源工程包，不是独立应用程序**：
#    解压后仍然**需要本机已安装 Godot 4.7+**才能运行（引擎本体不在包里）。
#    包里预置了资源的导入产物，所以**不需要**先跑导入脚本就能直接开跑。
#    已验证版本：Godot 4.7.2.stable（macOS 27.0.1，2026-10-29）。
#
# 为什么不是 .app：本机没有装 Godot 导出模板
# （~/.local/share/godot/export_templates/ 不存在），**导不出**可执行包。
# 于是改成「**带已导入产物的工程 zip**」：
#   · 只带首关真正用到的 4 个资源（武松 r10 / 虎 r12 / 武松肖像 / 战斗音乐）
#     连同各自的 .import 与 .godot/imported 产物
#   · 工程名带「原型试玩」→ 存档落在**自己的** user 目录，
#     不会碰到主工程的正式存档
#   · 附 START-HERE.md（启动说明 + 已知限制），明确标原型
#
# 用法：tools/build-prototype-package.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/dist"
PKG_NAME="shuihu-tiger-prototype"
STAGE="${OUT_DIR}/${PKG_NAME}"
ZIP="${OUT_DIR}/${PKG_NAME}.zip"

rm -rf "${STAGE}" "${ZIP}"
mkdir -p "${STAGE}/godot/tiger_tutorial" "${STAGE}/.godot/imported"
mkdir -p "${STAGE}/assets/releases/ART-002/r10/models" "${STAGE}/assets/releases/ART-002/r12/models"
mkdir -p "${STAGE}/assets/releases/ART-002/r10/portraits" "${STAGE}/assets/releases/AUDIO-002/audio"

echo "[1/5] 拷场景与脚本"
cp "${ROOT}/godot/tiger_tutorial/tiger_tutorial.tscn" "${STAGE}/godot/tiger_tutorial/"
cp "${ROOT}/godot/tiger_tutorial/tiger_tutorial.gd" "${STAGE}/godot/tiger_tutorial/"
[ -f "${ROOT}/godot/tiger_tutorial/tiger_tutorial.gd.uid" ] && \
  cp "${ROOT}/godot/tiger_tutorial/tiger_tutorial.gd.uid" "${STAGE}/godot/tiger_tutorial/"

echo "[2/5] 拷 4 个资源 + 它们的导入产物"
RESOURCES="assets/releases/ART-002/r10/models/wusong.glb
assets/releases/ART-002/r12/models/tiger.glb
assets/releases/ART-002/r10/portraits/wusong_portrait.png
assets/releases/AUDIO-002/audio/battle-spirited.wav"
for r in ${RESOURCES}; do
  cp "${ROOT}/${r}" "${STAGE}/${r}"
  cp "${ROOT}/${r}.import" "${STAGE}/${r}.import"
  while IFS= read -r art; do
    [ -f "${ROOT}/.godot/imported/${art}" ] || { echo "   缺少导入产物：${art}" >&2; exit 1; }
    cp "${ROOT}/.godot/imported/${art}" "${STAGE}/.godot/imported/${art}"
    [ -f "${ROOT}/.godot/imported/${art}.md5" ] && \
      cp "${ROOT}/.godot/imported/${art}.md5" "${STAGE}/.godot/imported/${art}.md5"
  done < <(grep -oE 'res://\.godot/imported/[^"]+' "${ROOT}/${r}.import" | sort -u | sed 's|res://.godot/imported/||')
  echo "   ${r}（含导入产物）"
done

echo "[3/5] 生成包内 project.godot（工程名带「原型试玩」，主场景指向打虎首关）"
python3 - "${ROOT}/project.godot" "${STAGE}/project.godot" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
out = []
for line in open(src, encoding='utf-8'):
    if line.startswith('config/name='):
        line = 'config/name="是好汉就上山（原型试玩·武松打虎）"\n'
    elif line.startswith('run/main_scene='):
        line = 'run/main_scene="res://godot/tiger_tutorial/tiger_tutorial.tscn"\n'
    elif line.startswith('config/description='):
        line = 'config/description="原型试玩包：武松打虎首关（战斗→招募→编队→再战）"\n'
    out.append(line)
open(dst, 'w', encoding='utf-8').writelines(out)
PY

echo "[4/5] 写启动脚本与说明"
sed -e 's|是好汉就上山（原型试玩·武松打虎）|是好汉就上山（原型试玩·武松打虎）|' \
    "${ROOT}/play-tiger-tutorial.command" > "${STAGE}/play-tiger-tutorial.command"
chmod +x "${STAGE}/play-tiger-tutorial.command"

# CMD-019：随包附带【隔离试玩入口】（独立 HOME + 临时存档，供人工验收）
mkdir -p "${STAGE}/tools"
cp "${ROOT}/tools/launch-tiger-prototype-isolated.sh" "${STAGE}/tools/"
chmod +x "${STAGE}/tools/launch-tiger-prototype-isolated.sh"

cat > "${STAGE}/START-HERE.md" <<'EOF'
# 武松打虎 · 首关原型试玩包

> **这是原型（PROTOTYPE），不是发布版，也不是最终验收版本。**
> 只包含「打虎 → 招募武松 → 编队 → 携武松再战」这一条首关闭环，
> 用于评审手感与画面，**不含**后续章节、多角色与完整游戏内容。

## ⚠️ 运行前提：**本机必须已安装 Godot 4.7 或更高版本**

这个包里**没有** Godot 引擎本体，它是**资源工程包，不是独立应用程序**。
包内已经预置好资源的导入产物，所以**不需要**先跑导入脚本，但**需要**有引擎。

| 项 | 说明 |
|---|---|
| 必需依赖 | Godot **4.7+**（本包已在 **4.7.2.stable** 上验证） |
| 引擎本体 | **不在包里**，请自行安装：https://godotengine.org/download |
| 操作系统 | macOS（验证于 macOS 27.0.1，Apple Silicon / `gl_compatibility` 渲染器） |
| 其他依赖 | 无（不需要 Blender / ffmpeg / Node —— 那些只用于重新构建资产与录屏） |

## 怎么跑起来（macOS）

1. 解压本包（解压后目录里要直接是 `project.godot` 那一层）。
2. 双击 **`play-tiger-tutorial.command`**，或做正式验收时用**隔离入口**：
   ```bash
   tools/launch-tiger-prototype-isolated.sh
   ```
   它用**独立 HOME** 启动（user:// 落在临时沙盒），屏幕上会列出
   逐步操作与预期结果；验证「重启保留武松」请加 `--keep-home` 复用同一沙盒，
   或用 `--home <目录>` 固定同一沙盒（最稳）。
   - 找不到 Godot？脚本会提示，请先装 Godot 4.7+。
   - 不想用终端，就手动跑：
     ```bash
     /Applications/Godot.app/Contents/MacOS/Godot --path . \
       res://godot/tiger_tutorial/tiger_tutorial.tscn
     ```
3. **资源已随包导入**，直接跑即可。若你手动改了包里的资源，可能需要重新导入。

### 已验证的命令（2026-10-29）

```bash
# 无头自检（整条闭环跑通，退出码 0）
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . -- --auto-full --quit-after 60
```

实测记录：独立解压到临时目录后以 Godot 4.7.2 headless 跑 `--auto-full`，
打虎 → 招募人物卡 → 编队 → 第二战胜利 → `DONE`，**退出码 0**（PID 63678）。
**注意**：该记录是 PM 的**自动脚本检查**，不是用户人工试玩；
这**不等于**真实鼠标操作 / 听感 / 发布验收。真实交互验收见 CMD-019。

## 怎么玩

| 操作 | 说明 |
|---|---|
| 鼠标左键点猛虎 | 锁定目标（它脚踩小金圈、头顶小箭头） |
| 出拳 | +25 怒气，18 伤害 |
| 虎影重击 | 消耗 50 怒气，35 伤害（怒气够了顶部会亮「就绪」横幅） |
| 对话 / 结算 | 按「继续」 |
| 右上角「音乐」 | 开关战斗音乐（默认关；曲目为本项目自制原创曲，**作曲原创≠已授权**：系统音源商业使用许可未做法律核验，无发布授权结论，仅限本地评审） |

流程：打虎 → 猛虎败退 → **获得武松**（人物卡）→ 点「带上他」→ 编队 → 携武松再战。

## 你的存档在哪

存档写在**这个包自己的** user 目录里（工程名带「原型试玩」），
不会碰到主工程的正式存档。包内**没有**任何「重置/删除存档」的功能入口。

## 已知限制（请一并看）

- **虎与武松的造型/动作都是程序化生成的分件几何**，不是手 K 表演；画面偏简。
- **背景是空地 + 深色天空**，没有景阳冈环境。
- 音乐是本项目自制原创曲，**听感未经过人工审听**。
- **没有人工试玩验收**：本包的效果均由脚本自动演示与截图产出。
  （CMD-019 已备好隔离入口 `tools/launch-tiger-prototype-isolated.sh` 与人工验收单，
  但**尚无人工试玩记录归档**——代理端无真实桌面输入权限，见交接单 CMD-019。）
- 只有首关闭环；**没有**后续章节、其他角色、联网、账号、云存档。
- 虎的「败退」是淡出离场（无血腥表现），不是死亡动画。
- **没有导出成独立应用**：本机缺 Godot 导出模板（`~/.local/share/godot/export_templates/`），
  所以只提供工程包；要出 .app/.exe 需要先安装对应版本的导出模板再走 Godot 导出流程。
EOF

echo "[5/5] 打包"
cd "${OUT_DIR}" && zip -qr "${ZIP}" "${PKG_NAME}" -x '*.DS_Store' && \
  ls -la "${ZIP}" | awk '{print "   包大小：" $5 " 字节"}'
echo
echo "产物：${ZIP}"
echo "解压后双击 play-tiger-tutorial.command 即可试玩（原型，非发布版）"
