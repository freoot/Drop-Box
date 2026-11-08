# CMD-004 · 验收自检

对照交接单 `docs/collaboration/handoffs/CMD-004-engine-selection.md` 的验收标准逐条核对。
执行者：WorkBuddy · 日期：2026-10-27（Asia/Shanghai）
被检对象：`docs/pipeline/04_engine_selection.md`

---

## 一、验收标准逐条核对

| # | 验收条件 | 结果 | 证据 |
|---|---|---|---|
| 1 | 两份 04 文档存在，路径正确 | **通过** | `docs/pipeline/04_engine_selection.md` 与本文均在 `docs/pipeline/` 下 |
| 2 | 调研三对象均有证据句，不是空泛描述 | **通过** | A.1 给目录 163 条/Godot 仅 2 条（第 76、90 行）/无抽卡条目命中 0；A.2 给萌三国 6 文件、0 个 `.tscn`、0 个 `.gd` 与三条配置原文；A.3 给引擎版本号、810 行 GDScript、1 个 Control 场景、1 个空 `Node3D`、0 个 `.import` |
| 3 | 给出 2～3 个候选方案 + 对比表 | **通过** | B 节三个方案（Compatibility 继续 / Forward+ 对齐萌三国 / 网页主交付对照）；C 节 8 维度对比表 |
| 4 | 有且仅有一个主推荐，文中出现「推荐采用：……」，理由 ≥5 条且条条可核对 | **通过** | D 节首行「推荐采用：Godot 4.7.2 + Forward+ ……」；理由 7 条，每条附路径/版本号/命令输出 |
| 5 | 不是「只列清单」，有明确结论 | **通过** | D 节为结论段，另附「反面证据」说明未导入状态；E 节给出改口点与不采纳时的后果 |
| 6 | 未改 assets / game.js / data / godot 业务文件 / project.godot / 未导出 Steam | **通过** | 见第二节实测 |
| 7 | 自检文档全部勾选并通过 | **通过** | 本表 #1–#6 与第三节均为通过，无未通过项 |
| 8 | 全程中文；避免绝对化用语 | **通过** | 脚本扫描 9 个关键词（最好/完美/一定/绝对/最强/必得/保证/最优/唯一）→ 残留 0 |

---

## 二、禁改项实测

| 检查项 | 命令 | 结果 |
|---|---|---|
| `game.js` 未被**本步**改动 | `ls -lT game.js` | mtime `Oct 27 13:44:08`，来自前序 CMD-003 的改动，早于本步开始（13:49）；本步未写入 |
| `tavern-ui.js` 未被**本步**改动 | `ls -lT tavern-ui.js` | mtime `Oct 27 13:43:57`，同为 CMD-003 遗留，早于本步开始 |
| `tavern-motion.css` 未被本步改动 | `ls -lT tavern-motion.css` | mtime `Oct 23 23:48:24`，本步未触碰 |
| `data/` 未被改动 | `ls -lT data/*.js` | 最新为 `Oct 22 20:24:23`（`portraits.js`） |
| `project.godot` 未被改动 | `ls -lT project.godot` | `Oct 10 19:16:18` |
| Godot 业务场景与脚本未被改动 | `find godot -type f -newermt "2026-10-27 13:49"` | 输出为空 |
| `assets/` 未被改动 | `find assets -type f -newermt "2026-10-27 13:49"` | 输出为空 |
| 未导出 Steam | 未执行任何导出命令；`ls export_presets.cfg` → 不存在 | 无新增导出预设 |
| 候选引擎未迁入工程 | 本步只读，未执行 clone / 安装 / 改配置 | 无新依赖 |

> 口径说明：`game.js` 与 `tavern-ui.js` 在今日 13:43–13:44 已被 CMD-003 修改，属前序步骤的正常产出。本步（13:49 起）对这两个文件**只读未写**，因此「未改」的判断依据是「本步期间无写入」，而非「文件停留在旧版本」。

> 说明：本步执行了一次 Godot 命令行冒烟测试（`--headless --path . --script godot/tests/smoke_test.gd`）。该命令只读场景、未保存任何业务文件，也不生成 `.import`（实测导入缓存仍为 0 个）。测试结果为**失败**，已作为事实写入文档 A.3 与 D 节反面证据。

---

## 三、约束遵守情况

| 约束 | 结果 | 说明 |
|---|---|---|
| 只写文档 | **通过** | 仅新建两份 pipeline 文档 + 更新交接单的状态与记录段 |
| 不阻塞、不重做 CMD-003 | **通过** | 未触碰 CMD-003 涉及的任何文件；`game.js` / `tavern-ui.js` / `tavern-motion.css` 本步均未改动 |
| 不重做 CMD-002 | **通过** | 未改动 `02_gacha_desire_spec.md` / `02_acceptance_selfcheck.md` |
| 不擅自开始引擎迁移 | **通过** | 未 clone 候选引擎、未改渲染配置、未建场景 |
| 中文全文 | **通过** | 除路径、命令、版本号外均为中文 |

---

## 四、本地只读验证步骤（供指挥官复核）

### 4.1 复核「技能目录」证据

```bash
cd ~/.workbuddy/skills/open-source-games
grep -c "^- \*\*" references/catalog.md                  # 期望 163
grep -n -i "godot" references/catalog.md                 # 期望命中第 76、90 行
grep -n -i "collect\|gacha\|card\|creature" references/catalog.md   # 期望无命中
```

### 4.2 复核「萌三国」证据

```bash
cat ~/萌三国/project.godot
find ~/萌三国 -type f -not -path "*/.godot/*"            # 期望 6 个文件
find ~/萌三国 -name "*.tscn" -o -name "*.gd"             # 期望 0 个
```

若要用编辑器只读打开：`open -a /Applications/Godot.app ~/萌三国/project.godot`，**不要保存**。

### 4.3 复核「shuihu-game Godot 入口」证据

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game
/Applications/Godot.app/Contents/MacOS/Godot --version           # 期望 4.7.2.stable.official.ed1daf0bf
python3 -c "print(open('project.godot').read())"                 # 看 [rendering] 的 gl_compatibility，且无 config/features
wc -l godot/journey_map/*.gd godot/art_002/*.gd godot/tests/*.gd # 期望合计 810
grep -c "^\[node" godot/art_002/battlefield_sample.tscn          # 期望 1
ls assets/releases/ART-002/r7/models/hero*.glb | wc -l           # 期望 18
find . -name "*.import" -not -path "./.git/*" | wc -l            # 期望 0
ls export_presets.cfg                                            # 期望不存在
```

复现冒烟测试（只读，不改业务文件）：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script godot/tests/smoke_test.gd
# 当前期望输出：ERROR ... missing journey map texture
# 原因：0 个 .import，PNG 尚未导入；非场景写错
```

### 4.4 复核推荐结论

打开 `docs/pipeline/04_engine_selection.md`，定位 **D 节**首行「推荐采用：……」与随后 7 条理由；每条理由括注的证据均可用 4.1–4.3 的命令逐一命中。

---

## 五、遗留与建议

| # | 事项 | 状态 |
|---|---|---|
| 1 | 工程未导入导致冒烟测试失败 | 已记录为事实与风险；修复方式为编辑器打开完成一次导入（属后续步骤，本步不执行） |
| 2 | Forward+ 切换本身 | 未执行；建议指挥官另派单，并先在 `project.godot` 备份后进行 |
| 3 | 目标 Windows 机 D3D12 可用性 | 未验证；建议在 Steam 候选包步骤前实测 |
| 4 | CMD-002 C.3 的「避开 Forward+ 专有能力」约束 | 若采纳本推荐，该约束应收窄为「仅低配/Web 备选路径适用」，需指挥官改口 |

---

## 汇总

- 验收标准：**8 / 8 通过**
- 禁改项：**7 / 7 未违反**
- 绝对化用语：**0 处**
- 推荐结论：**推荐采用 Godot 4.7.2 + Forward+ 作为主交付渲染路径**（理由 7 条）
- 建议指挥官结论：可进入 READY_FOR_REVIEW 验收；若通过，需就「渲染路径改口」签一条，再派发引擎切换与导入修复
