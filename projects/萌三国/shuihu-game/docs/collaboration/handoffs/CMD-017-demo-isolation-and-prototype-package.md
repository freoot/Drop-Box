# CMD-017 交接单 · 演示污染封堵 + 人物卡一致性 + 原型可试玩包

**状态：READY_FOR_REVIEW —— 这是「原型阶段交付」，不标最终验收通过**
**工程**：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`（仓库根 `meng/`）
**分支**：`task/first-batch-20261022`
**基线**：`57e7a5a`（CMD-016 首关体验）

---

## 零、本轮四件事

| # | 派单要求 | 状态 |
|---|---|---|
| 1 | 封住已实际发生的演示污染（`--auto-full` 单独跑会走真档） | 已封，并加了逐模式回归 |
| 2 | `--auto-flow` 仅隔离副本可用，缺隔离条件拒绝执行 | 已实现（退出码 3） |
| 3 | 招募卡与场上武松造型一致（红衣双刀 vs 蓝衣无刀） | 改用 **r10 模型渲染肖像**，旧立绘未改 |
| 4 | 招募阶段收起失效战斗界面；交原型可试玩包 + 启动说明 + 闭环演示 + 已知限制 | 已交（见第六节） |

---

## 一、演示污染：真实发生过的事

### 1.1 漏洞是什么

`godot/tiger_tutorial/tiger_tutorial.gd` 的 `_resolve_save_path()` 原来只认三个参数：

```gdscript
if args.has("--test-save") or args.has("--scratch-save") or args.has("--auto-demo"):
    ... 本次专属新档 ...
return SAVE_USER        # ← 正式档 user://save.json
```

于是**单独跑** `--auto-full` / `--showcase` / `--demo-lose` 会落到 `SAVE_USER`，
演示过程里「招募 → 编队」的正常写入就**写进了真存档**。
这不是推测：CMD-016 里我自己就有一次演示漏加 `--scratch-save`，触发了正式档写入
（内容等价、`sentinel` 保留，已在 CMD-016 交接单里交代）。

### 1.2 现在的规则

```gdscript
const DEMO_SAVE_FLAGS := [
    "--scratch-save", "--test-save", "--auto-demo",
    "--auto-full", "--showcase", "--demo-lose",
]
```

- **所有演示/试玩模式一律走本次专属新档**（`user://sessions/session_<pid>_<usec>.json`）：
  单独跑 `--auto-full` / `--showcase` / `--demo-lose` / `--auto-demo`
  **不再碰正式存档**，不必再记着加 `--scratch-save`。
- **不带任何参数** = 正常游玩 → 正式存档（只允许招募/编队的正常写入，永不重置）。
- 路径框架没动：仍无 `--save-path`、仍无 `--reset-save`、没有任何删除存档的调用。

### 1.3 怎么验证的（新增 `tools/verify-demo-save-isolation.sh`）

**预置有内容的正式档**，逐个演示模式跑，验证正式档**哈希与字节数都不变**：

```
隔离副本 + 独立 user 目录
预置正式档：owned=[wusong,linchong] lineup=[wusong] sentinel=CMD-017-DO-NOT-TOUCH rounds_played=7
正式档基线 sha256：4fabcf2b…（147 字节）

--auto-full   退出码=0  save_path=user://sessions/session_54426_95024.json
              ok  正式档 sha256 与字节数完全未变
              ok  本次运行用的是专属新档（没碰正式档）
--showcase   退出码=0  … 同样 ok
--demo-lose  退出码=0  … 同样 ok
--auto-demo  退出码=0  … 同样 ok
```

**硬规矩：禁止在真档上复现。** 全部会写档的运行都在隔离副本里做；
真实用户目录只做逐文件 sha256 **只读**校验。

---

## 二、`--auto-flow` 强制隔离

`--auto-flow` 是跨进程验收专用模式（它用**正式存档模式**跑），
所以必须确认自己不在正式环境里：

```gdscript
func _default_user_dir_suffix() -> String:
    return "Godot/app_userdata/%s" % 项目名     # 正式工程长这样

func _is_isolated_user_dir(dir_path: String) -> bool:
    return not dir_path.ends_with(_default_user_dir_suffix())
```

- 隔离副本用 `override.cfg` 把 user 目录换成别的名字 → 判定为**隔离** → 允许执行。
- 不在隔离环境 → **直接拒绝**：打印 `[FLOW] REFUSED`，**不读写任何存档**，`quit(3)`。

**验证方式**：用 **HOME 重定向**到临时目录做一个「目录名同款、但路径不同」的环境
（真实用户目录一个字节都不会被碰）：

```
--auto-flow（非隔离环境）：退出码=3　REFUSED 行数=2
  ok  非隔离环境下 --auto-flow 已拒绝执行（退出码 3）
  ok  拒绝路径没有写出任何存档
```

---

## 三、招募人物卡：改用 r10 模型渲染的肖像

### 3.1 问题

| | 场上武松 | 旧 2D 立绘 |
|---|---|---|
| 衣着 | **蓝衣** | 红衣 |
| 武器 | **无刀**（r10 去掉了双戒刀） | 双戒刀 |

招募卡弹出红衣双刀、场上却是蓝衣无刀，玩家会以为是两个人。

### 3.2 做法：**复用当前 r10 模型渲染**，不改旧立绘

- 场景加 `--render-portrait <路径>` 模式：只建世界 + 摆相机 + 渲染一张图就退出
  （不进游戏、不碰任何存档）。
- 取景用与战场同一个 60° 朝向，人物 3/4 侧脸占满画面，600×750。
- 产物：`assets/releases/ART-002/r10/portraits/wusong_portrait.png`（49 KB）。
- 招募卡优先用它；取不到才退回旧的 2D 立绘（并按取景框裁掉大片空白）。
- **旧的 2D 立绘文件一个字节都没改**（A17h 断言两个旧文件都还在）。

---

## 四、招募阶段：收起失效战斗界面

打虎已经赢了，战斗按钮、怒气条、目标行这时全是失效信息，
招募阶段把它们**全部隐藏**（A17f / A17f2 断言），
画面只剩「获得武松 → 带上他」这一件事：

- 左上角面板只剩阶段与武松血量
- 人物卡：招募成功　获得武松 / 行者 · 武松 / 天伤星 · 座次 14 / 108 /
  简介 / 图鉴收集 1 / 108 / 「带上他」
- 底部两个技能按钮与怒气提示不再出现

---

## 五、顺手修掉的坑（bash 变量名吞字）

`$VAR` 后**紧跟全角标点**时，macOS 自带 bash 3.2 会把标点当成变量名的一部分：

```bash
echo "预置正式档：$ISO_SAVE（${BASE_SIZE} 字节）"   # → ISO_SAVE（: unbound variable
```

修法是加花括号 `${ISO_SAVE}`。共修 3 个脚本：
`tools/verify-demo-save-isolation.sh`（新增）、
`tools/godot-smoke.sh`、`tools/art-002-capture.sh`（**既有隐患**，本轮顺带修掉）。

---

## 六、原型可试玩包（明确标原型）

### 6.1 为什么不是 .app

本机**没有 Godot 导出模板**（`~/.local/share/godot/export_templates/` 不存在），
导不出可执行包。改成「**带已导入产物的小工程 zip**」。

> ⚠️ **它是资源工程包，不是独立应用程序**：引擎本体不在包里，
> 运行**必须**本机已装 **Godot 4.7+**（已验证 4.7.2.stable / macOS 27.0.1）。
> 包内预置了导入产物，所以**不必先跑导入脚本**。
> 更完整的交付说明见 `CMD-018-final-delivery.md`。

### 6.2 构建与内容

```bash
tools/build-prototype-package.sh     # → dist/shuihu-tiger-prototype.zip（约 8.5 MB）
```

| 内容 | 说明 |
|---|---|
| `godot/tiger_tutorial/` | 场景 + 脚本 |
| 4 个资源 + 各自 `.import` 与 `.godot/imported` 产物 | 武松 r10 / 虎 r12 / 武松肖像 / 战斗音乐 → **解压即跑，不用先导入** |
| `project.godot` | 工程名带「原型试玩」，主场景指向打虎首关 |
| `play-tiger-tutorial.command` | 双击启动 |
| `START-HERE.md` | **启动说明 + 已知限制**，开头就标明「这是原型，不是发布版」 |

存档落在**这个包自己的** user 目录（工程名不同）→ 不会碰主工程的正式存档。

**已实测**：解压到临时目录后 `--auto-full` 跑通整条链，退出码 0。

---

## 七、测试

| 套件 | 命令 | 结果 |
|---|---|---|
| 武松闭环（含新增 A17×11） | `bash tools/godot-tiger-test.sh` | **90/90** |
| **演示存档隔离（新增）** | `bash tools/verify-demo-save-isolation.sh` | **OK**（4 模式 + 1 拒绝） |
| 跨进程保存/加载 | `bash tools/godot-save-cross-process-test.sh` | **OK** |
| 存档安全 | `bash tools/verify-save-safety.sh` | **8/8 场景** |
| 单元 + 哨兵 | `bash tools/run-tests.sh` | **173/173** |
| 旧实时战斗 | `bash tools/godot-battle-test.sh` | **24/24** |

新增断言 A17：

| 断言 | 内容 |
|---|---|
| A17a | 所有演示模式都在 `DEMO_SAVE_FLAGS` 里（漏一个就红） |
| A17b | 逐个演示参数实跑路径解析，都落 `user://sessions/session_*` |
| A17c | 不带参数才是正式档 |
| A17d / A17d2 | 正式档目录名判定为非隔离；换过目录名判定为隔离 |
| A17e | 本测试确实跑在隔离环境 |
| A17f / A17f2 | 招募阶段战斗按钮、怒气条、目标行都隐藏 |
| A17g | 招募卡肖像来自 r10 模型渲染 |
| A17h | 旧 2D 立绘文件仍在（未删未改） |

---

## 八、完整闭环演示（脚本编排，**非人工验收**）

`docs/evidence/CMD-016/demo-loop.mp4` —— **30.6s / 1280×720 / 30fps**，
战斗 → 猛虎败退 → 获得武松（人物卡）→ 带上他 → 编队 → 携武松再战 → 小结。
同目录 `shots/` 8 张静帧（本轮已刷新为模型肖像版）。

录屏是 Godot `--write-movie --fixed-fps 30` **引擎内**出片，
**不是操作系统实屏录制**（本机 `screencapture` 无录屏权限）。

---

## 九、已知限制（交付即随包）

- **虎与武松的造型/动作都是程序化生成的分件几何**，非手 K；画面偏简、虎偏白。
- **背景是空地 + 深色天空**，没有景阳冈环境。
- 虎的「败退」是**淡出离场**（无血腥），不是死亡动画。
- 音乐是本项目自制原创曲，**听感未人工审听**；默认关闭。
- **没有人工试玩验收**：本轮所有画面与视频均为脚本自动产出。
- 2D 旧立绘（红衣双刀）与 3D 模型（蓝衣无刀）**仍然并存**——本轮只让招募卡用模型渲染，
  旧立绘文件按要求未改。
- 只有首关闭环：**没有**后续章节、其他角色、联网、账号、云存档。
- 未切渲染器、未发布、未打 tag；r6–r12 资产全部保留。

---

## 十、状态声明

**本阶段交付为原型，明确不标最终验收通过。**
逻辑与可读性检查全绿 ≠ 美术验收 ≠ 人工试玩验收；
后续仍需美术同学接手打磨造型与表演，并安排人工试玩与听感审听。
