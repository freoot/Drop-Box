# 05 · CMD-005 验收自检

- 任务 ID：CMD-005 / r1
- 自检人：主程序与整合负责人（代理 A）
- 自检时间：2026-10-29 01:2x（Asia/Shanghai）
- 对应说明文档：`docs/pipeline/05_import_notes.md`

## 1. 验收标准逐条核对

| # | 验收项 | 命令 / 方法 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | 两份 05 文档存在且自检通过 | `ls docs/pipeline/05_*.md` | `05_import_notes.md`、`05_acceptance_selfcheck.md` 均存在 | 通过 |
| 2 | `*.import` 数量 ≥ 1，至少含旅程地图相关 | `find . -name "*.import" -not -path "./.git/*" \| wc -l` | **648**；`assets/liangshan-journey-map.png.import` 存在 | 通过 |
| 3 | 冒烟命令退出码 0 | 见第 2 节 | 连续 3 次 `exit 0`，输出 `GODOT_SMOKE_OK: journey map scene and six route nodes loaded` | 通过 |
| 4 | `project.godot` 仍为 `gl_compatibility` | `grep -n "rendering_method" project.godot` | 第 21 行 `renderer/rendering_method="gl_compatibility"`；第 22 行 `.mobile` 同值 | 通过 |
| 5 | 未改 `assets/` 源文件内容 | 本步仅新增同目录 `*.import`/`*.uid`；`git status` 中 `assets/` 源图无本步改动 | 未修改任何 PNG/JPG/GLB/BLEND 内容 | 通过 |
| 6 | 未改网页玩法代码 | `git status --porcelain` | `game.js`、`tavern-ui.js`、`tavern-motion.css` 的改动来自 CMD-003，本步未触碰 | 通过 |
| 7 | 未改 `data/` | 同上 | 无本步改动 | 通过 |
| 8 | 未改 `godot/**` 业务场景与脚本 | `find godot -type f -newermt "2026-10-29 00:20" -not -name "*.uid"` | 仅新增资源 ID 文件，业务 `.gd`/`.tscn` 无改动 | 通过 |
| 9 | 未导出 Steam | `ls export_presets.cfg` | 不存在，未执行导出 | 通过 |
| 10 | notes 写明复现命令 | `docs/pipeline/05_import_notes.md` 第 3 节 | 含副本克隆、排除 `.blend`、导入、回拷、冒烟的完整命令 | 通过 |

## 2. 冒烟命令与输出

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script godot/tests/smoke_test.gd
```

```
Godot Engine v4.7.2.stable.official.ed1daf0bf - https://godotengine.org

GODOT_SMOKE_OK: journey map scene and six route nodes loaded
```

| 次数 | 退出码 |
|---|---|
| 第 1 次 | 0 |
| 第 2 次 | 0 |
| 第 3 次 | 0 |

## 3. 补充功能证据（只读脚本，未写入工程）

加载 `journey_map.tscn` 并打印节点树：

- 旅程地图纹理：`loaded size=1672x941`（导入前为 `Failed loading resource`）
- 根节点 `JourneyMap [Control]`，含 `Background`、`Shade`、`Header/Title`、`RouteNodes`、`Detail`
- `RouteNodes` 子节点：`Stage01` … `Stage06`，`route count = 6`，与冒烟断言一致

## 4. 网页侧全量测试（回归参照）

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game && node --test tests/*.test.mjs
```

| 指标 | 结果 |
|---|---|
| 总用例 | 162 |
| 通过 | 161 |
| 失败 | 1 |
| 跳过 | 0 |

失败项：`ART-002 r7 b1 runtime evidence matches delivered assets`（`tests/art-002-r7.test.mjs:73`）。
原因：`assets/releases/ART-002/r7/evidence/b1/runtime.json` 缺失、`headless.json` 缺 `manifest_sha256`。
该失败在 CMD-003 阶段即已存在，与本步导入无关；按项目规则未删除、跳过或降低该断言阈值。

## 5. 网页版实际画面（截图证据）

本地静态服务 + 无头浏览器访问 `http://127.0.0.1:8765/shuihu-game/index.html`：

| 截图 | 内容 | 结果 |
|---|---|---|
| `/tmp/shuihu-cmd005/01-main.png` | 取名后主城界面 | 布局正常，忠义堂/演武场/聚义酒肆/神兵坊/水寨黑市/试炼塔显示完整；底栏五个入口（山寨、好汉、征战、招贤、玩法）；JS 报错 0 |
| `/tmp/shuihu-cmd005/02-recruit.png` | 招贤面板 | 正常渲染 |
| `/tmp/shuihu-cmd005/03-battle.png` | 战斗页 | 正常渲染 |

浏览器控制台 `pageerror` 计数：0。

## 6. 未通过 / 未测项（如实列出）

| 项 | 状态 | 说明 |
|---|---|---|
| `.blend`（149 个）导入 | **未通过（有意跳过）** | headless 下 Blender 路径不可配置，会阻断整个导入流程；游戏运行依赖已导出的 `.blend`→`.glb` 产物，不影响冒烟与运行 |
| Godot GUI 渲染画面 | **未测** | headless 无渲染设备，本步未做 GUI 截图；可用性由冒烟与节点树证据覆盖 |
| Forward+ 渲染路径切换 | **未做** | 本单明确禁止，属 CMD-006 |
| Steam 导出 | **未做** | 本单明确禁止 |
| 美术/视觉验收 | **未做** | 属 Codex 独立验收范围，本步只做导入 |

## 7. 自检结论

CMD-005 的六条验收标准全部满足；第 6 节所列未通过项均为「有意跳过」或「本单范围外」，其中 `.blend` 一项已在 notes 第 2、6 节给出原因与后续处理建议。

交接单状态已改为 `READY_FOR_REVIEW`。
