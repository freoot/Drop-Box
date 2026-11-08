> **⚠️ 本文件的「存档安全外部验证」结论已被推翻（CMD-014 r3）。**
>
> 原文写「在**真实 user:// 目录**放一份带内容的存档，跑 4 个场景后比对 sha256 → 4/4 完全一致」。
> 这个做法本身就是缺陷：验收脚本**向真实用户存档写了哨兵文件**，
> 末尾还会 `rm -f "$SCRATCH"`（可能删掉用户已有的 scratch_save.json），
> 中途 Ctrl-C / 崩溃也不会还原哨兵。
> 那不是隔离验收，是拿真实用户存档做实验；「4/4 完全一致」也不等于「全程未改动用户存档」——
> 因为哨兵本来就是它自己写进去的。
>
> r3 已重写为**隔离环境版**：每次运行用 `override.cfg` 把 `user://` 整体重定向到
> 独立的临时目录，真实用户目录全程**只读校验、不写入**。
> 详见 `CMD-014-r3-save-isolation.md`。

# CMD-014 交接单 · 存档安全返修 + 武松无刀拳击接入

**状态：READY_FOR_REVIEW**（未验收）
**工程**：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`
**分支**：`task/first-batch-20261022`

---

## 一、审核不通过项与处理

### 1. `--reset-save` 删除用户存档（CMD-014 r1 已修，提交 `3b58c4b`）

**原代码**（`tiger_tutorial.gd` 118–120）：

```gdscript
if OS.get_cmdline_user_args().has("--reset-save"):
    if FileAccess.file_exists(save_path):
        DirAccess.remove_absolute(ProjectSettings.globalize_path(save_path))
```

不带 `--test-save` 时 `save_path` 就是 `user://save.json` → 直接删掉用户存档。

**修法**：

| 项 | 处理 |
|---|---|
| 删除存档的代码路径 | **整个移除**。现在重置是「覆盖写入一份空档」，不是删除文件 |
| 正式存档 `user://save.json` | **受保护**：`_reset_save_at()` 对它直接返回 false，并提示改用 `--scratch-save` |
| 从头试玩 | 改走独立临时存档 `user://scratch_save.json`（`--scratch-save`） |
| 演示/录屏 | 改走独立隔离存档 `user://demo_save.json`（`--auto-demo`） |
| 测试 | 改走**进程唯一**路径 `user://test_save_<pid>.json`（`--test-save`），另加 `--save-path <路径>` 供外部指定 |
| 文档与入口脚本 | 删掉「删掉 user://save.json」和 `--reset-save` 的推荐，改推 `--scratch-save` |

**验证（字节哈希，不是 mtime）**：

- GDScript 内置断言 A9a–A12 共 8 项：
  - A9a 直接调 `_reset_save_at(user://save.json)` → 返回 false 且内容未变
  - A9b 隔离存档可重置（覆盖写入空档）
  - A9c **真实子进程**带 `--reset-save` 跑一遍 → 有拒绝提示 + 存档哈希不变
  - A10 子进程 `--auto-demo` → 走 `demo_save.json` + 正式存档哈希不变
  - A11 失败重试前后正式存档哈希一致
  - A12 **源码里不存在任何删除存档的调用**（扫 `remove_absolute` / `DirAccess.remove` 等）
- `tools/verify-save-safety.sh`（外部验证，退出码 0）：
  在**真实 user:// 目录**放一份带内容的存档，跑 4 个场景
  （`--reset-save` / `--auto-demo` / 失败重试 / `--scratch-save`），
  每个场景后比对 sha256 与字节数 → **4/4 完全一致**。
  脚本自身先备份、末尾还原，不删旧存档。

> 为什么用 sha256：mtime 只有 1 秒精度，同秒写入看不出来；哈希能证明「内容一字未改」。

### 2. 「出拳」实际是双刀（CMD-014 r2，本轮）

**原状**：战斗里普攻与虎影重击都播 `_play_wusong("attack")` —— 那是 r6 原来的
**双戒刀挥砍**。回复里说「出拳」与实际不符。

**修法**：从真实武松源工程另存新版本 `r10`，做真正的无刀拳击。

| 项 | 结果 |
|---|---|
| 源工程 | `r6/source/wusong.blend`（真实资产，hero-014），**一字节未动** |
| 新版本 | `r10/models/wusong.glb`（824,440 B）+ `r10/source/wusong.blend`（404,525 B，可编辑） |
| 刀分离 | 角色网格 10536 → 10030 顶点；刀 506 顶点独立成 `wusong_monkblades`（仍绑 hand） |
| 刀判据 | 逐分量核对后用 `绑 hand.* 且 zmax > 0.92`（8 个刀件，左右对称） |
| 导出 | `use_selection=True` 只选角色与骨架 → GLB 内**无刀**（实测刀状顶点 357 → **0**） |
| 新增动作 | `punch` 25 帧 1000.0ms（蓄力直拳）、`tiger_shadow` 33 帧 1333.3ms（转体重拳） |
| 原 4 clip | idle/walk/attack/hit 时长未变，`attack` 保留但不用于战斗 |
| Godot 接入 | 普攻播 `punch`、重击播 `tiger_shadow`；缺动作则 `push_error` 不静默退回 |
| 朝向修正 | 场景 `rotation.y` 由 **+90° 改为 −90°**（+90° 会让武松背对敌人、拳打反方向） |
| 虎影造型 | 从 3 个方块改为虎形轮廓（18 个球体：头/吻/耳/鬃毛/脊/前腿/前爪/后腿/尾） |

详见 `docs/motion/ACT-009/01_wusong_punch.md`。

---

## 二、测试

| 套件 | 命令 | 结果 |
|---|---|---|
| 单元 + 哨兵 | `bash tools/run-tests.sh` | **173/173** |
| 旧实时战斗 | `bash tools/godot-battle-test.sh` | **24/24** |
| 武松闭环（含存档安全 + 动作接入） | `bash tools/godot-tiger-test.sh` | **48/48** |
| 存档安全外部验证 | `bash tools/verify-save-safety.sh` | **4/4 场景，SAVE_SAFETY_OK** |
| 几何与动作（Blender） | `Blender -b -P tools/motion/verify_wusong_punch.py` | **16/16** |

---

## 三、证据（`docs/evidence/CMD-014/`）

| 文件 | 内容 |
|---|---|
| `01-tutorial-battle.png` … `06-victory.png` | 游戏内按阶段自动截图（当前版本窗口实拍） |
| `07-punch.png` | 出拳瞬间（HUD 显示双方血量与怒气） |
| `02-tiger-shadow.png` | 虎影扑出瞬间（半透明金色虎形轮廓，位于武松与虎之间） |
| `seq/punch-f*.png` | punch 逐帧 9 张（能看清蓄力→前冲→收势） |
| `seq/tiger_shadow-f*.png` | tiger_shadow 逐帧 12 张（转体蓄力→重拳） |
| `facing/rot*.png` | 四向对照图（判定模型正面是 +Z 的依据） |
| `tiger-punch.mp4` | 52s 完整闭环（两战全胜 + 招募 + 编队） |
| `../../motion/ACT-009/probe/wusong_punch_verify.json` | Blender 侧 16 项断言明细 |

**证据性质标注**：

- 截图与视频均由 **Godot `--write-movie` / 引擎内 `get_viewport().get_image()`** 产出，
  **不是操作系统实屏录制**。
- 测试与演示的按键均为 `Input.parse_input_event` / `AnimationPlayer.advance()` 注入，
  **物理键盘人工试玩证据未做**（本机沙箱禁止 `osascript` 调 System Events）。

---

## 四、启动命令

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game && ./play-tiger-tutorial.command
```

- `鼠标左键点敌人` = 选中目标
- `普攻` = +25 怒气，18 伤害（播 `punch`，无刀直拳）
- `虎影重击` = 消耗 50 怒气，35 伤害（播 `tiger_shadow`，武松出拳 + 猛虎虚影扑出）
- `对话/结算` 按「继续」

从头玩：`./play-tiger-tutorial.command -- --scratch-save`（独立临时存档，不动正式存档）

---

## 五、未做（不算通过）

| 项 | 说明 |
|---|---|
| **虎模型** | **程序化几何占位**，全库没有虎模型。**不代表美术验收** |
| **虎影** | **程序化半透明几何占位**，威势象征。**不代表美术验收** |
| 拳击表演 | 程序化关键帧，非 Blender GUI 手 K。**不代表动作表演验收** |
| 其余 17 角色 | 仍是 r8 资产（能展示不能打），未扩角色 |
| 章节 | 未扩 |
| 渲染器 | 仍 `gl_compatibility`，未切 Forward+ |
| 发布 / 部署 / 购买 | 未做，未打 tag |
| 人工键盘证据 | 未做（沙箱限制），已给启动命令与操作说明 |
| 视频项目 | 未触碰 |

**逻辑测试通过 ≠ 美术验收**：以上占位项需要美术同学接手后另行验收。
