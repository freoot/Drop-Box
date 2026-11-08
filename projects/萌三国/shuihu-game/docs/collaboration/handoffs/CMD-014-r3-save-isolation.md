> **⚠️ 本文件已被 CMD-014 r4 取代。**
>
> r3 的做法仍有问题：验收脚本**在主项目里写 `override.cfg`**（会覆盖用户已有配置），
> `cleanup` **无条件删除**它；并发启动或同时跑另一个测试会共享同一份配置；
> SIGTERM 清理时子进程可能还活着。
>
> r4 收敛为最小方案：
> · **移除 `--save-path` 与 `--reset-save` 用户入口**——不再给路径重置打补丁
> · 试玩/演示/测试**每次运行生成唯一新档**（同进程内固定，跨进程唯一）
> · 测试与外部脚本都在**独立临时项目副本**里配置独立 user 目录，
>   **绝不写主项目 override.cfg，也不删既有配置**
> · 覆盖**预置 override** 与**中断**案例；**子进程退出后才清理本次资源**
>
> 详见 `CMD-014-r4-save-simplify.md`。

# CMD-014 r3 交接单 · 存档隔离与路径别名防护

**状态：READY_FOR_REVIEW**（未验收）
**工程**：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`
**分支**：`task/first-batch-20261022`

---

## 零、先纠正旧结论

**上一版（CMD-014 r1/r2）的存档安全结论不成立，本单推翻它。**

原文写：

> `tools/verify-save-safety.sh`：在**真实 user:// 目录**放一份带内容的存档，
> 跑 4 个场景后比对 sha256 与字节数 → **4/4 完全一致**
> ……「全程未改动用户存档」

三个问题：

| 问题 | 说明 |
|---|---|
| 验收脚本写了真档 | 脚本把哨兵文件写进**真实的** `user://save.json`。那是拿用户存档做实验 |
| 删了可能存在的用户文件 | 末尾 `rm -f "$SCRATCH"` 会删掉 `user://scratch_save.json`——如果用户已有这个文件就没了 |
| 中断不还原 | Ctrl-C / 崩溃时哨兵留在真实目录里，且没有异常恢复 |
| 结论自相矛盾 | 「4/4 完全一致」比对的是**脚本自己写的**哨兵，证明不了「没动用户存档」 |

**现在**：验收全程在隔离环境里跑，真实用户目录**只做只读校验**。

---

## 一、隔离机制（核心）

Godot 的 `user://` 根目录可由项目设置决定：
`application/config/use_custom_user_dir` + `application/config/custom_user_dir_name`。
项目根放一个 `override.cfg` 就能**逐次覆盖**这个设置（不改 `project.godot`）。

于是：

```
真实用户目录  ~/Library/Application Support/Godot/app_userdata/是好汉就上山
                  ↑ 只读校验（逐文件 sha256），全程零写入
隔离环境      ~/Library/Application Support/shuihu_save_iso_<pid>_<ts>/
                  ↑ 每次运行新建，哨兵存档、测试存档、scratch 都在这里
```

`XDG_DATA_HOME` 在 macOS 上**无效**（实测 `OS.get_user_data_dir()` 不变），所以用 `override.cfg`。

- `override.cfg` 由脚本在运行时创建、退出时 `trap` 删除；已加进 `.gitignore`
- 中途 Ctrl-C / 崩溃：最多在隔离目录留垃圾，**真实档零影响**
- 隔离目录用 `mktemp` 风格的唯一名，结束即删

---

## 二、场景脚本自身的改造

| 项 | 改动 |
|---|---|
| **试玩/演示/测试路径** | 全部移入本次专属目录 `user://sessions/`：`sessions/scratch_save.json`、`sessions/demo_save.json`、`sessions/test_save_<pid>.json` |
| **正式档** | `user://save.json` **永不重置**、永不删除 |
| **`_reset_save_at`** | 删掉「任意路径重置」能力。现在只允许 `user://sessions/` 白名单下的路径 |
| **`--save-path`** | 不再接受任意路径。白名单外一律拒绝并回退 |
| **路径别名** | 用**规范化后的真实路径**判定（`globalize_path` + 自写 `_normalize_path` 消 `.`/`..`/重复斜杠） |

### 别名绕过的具体封堵

| 别名 | 规范化后 | 判定 |
|---|---|---|
| `user://./save.json` | `<user_root>/save.json` | 正好是正式档 → 拒 |
| `user://../save.json` | `<user_root>/../save.json` → 上级目录 | 落在正式档所在层级的上级 → 拒 |
| `user://sessions/../save.json` | `<user_root>/save.json` | 正好是正式档 → 拒 |
| `<正式档绝对路径>` | 同上 | 拒 |
| `user://sessions/xxx.json` | `<user_root>/sessions/xxx.json` | ✅ 白名单内，放行 |
| 其它任意路径 | — | 拒（不再支持任意路径） |

> 注意：`ProjectSettings.globalize_path()` **不做 `..` 归一化**（实测 `user://../save.json`
> 原样输出 `.../app_userdata/是好汉就上山/../save.json`），所以必须自己写 `_normalize_path`。

### 顺带修掉的真 bug

`_save()` 之前不建目录，`FileAccess.open()` 在目录不存在时返回 `null` →
**写入静默失败**（没有报错，存档根本没写进去）。改成写入前
`DirAccess.make_dir_recursive_absolute()`，并在失败时 `push_error`。

---

## 三、真实失败 → 重试（补上）

**旧版场景 C 是假的**：只启动 `--test-save` 跑 3 秒，既没触发失败也没触发重试，
却写进了「已覆盖」。本轮补上真实链路。

给 `tiger_tutorial` 加了 `--demo-lose` 模式：

1. 玩家回合**主动放弃**（把回合交给敌人，自己站着挨打）
2. 敌人连续反击 10 次 → 玩家 HP 120 → 0
3. 触发**真实失败判定**（`[BATTLE] 失败（第 1 战）`）
4. 自动点「重试」→ `_start_battle(battle_index)` → 状态复位（HP 120 / 怒气 0）

实测日志：

```
[ACTION] 敌人反击 伤害 12，武松 HP 108 → 96 → … → 12 → 0
[BATTLE] 失败（第 1 战）
[DEMO-LOSE] 失败判定已触发，准备点重试
[DEMO-LOSE] 已执行重试，回到第 1 战
```

> 顺带发现 `--demo-lose` 分支必须放在自动普攻分支**之前**，否则会被抢先。

---

## 四、测试

| 套件 | 命令 | 结果 |
|---|---|---|
| 武松闭环 | `bash tools/godot-tiger-test.sh` | **57/57**（原 48 + 新增 9 项） |
| 存档安全独立验收 | `bash tools/verify-save-safety.sh` | **7/7 场景，SAVE_SAFETY_OK** |
| 单元 + 哨兵 | `bash tools/run-tests.sh` | 173/173 |
| 旧实时战斗 | `bash tools/godot-battle-test.sh` | 24/24 |

### 闭环测试新增的 9 项（A9b2 / A9d / A9e）

| 断言 | 内容 |
|---|---|
| A9b2 ×3 | 三类别名路径经规范化后**不在** `sessions/` 白名单内 |
| A9b2 | 直接调 `_reset_save_at("user://./save.json")` → false |
| A9b2 | 直接调 `_reset_save_at("user://../escape.json")` → false（sessions 外） |
| A9d ×2 | **真实子进程**用 `--save-path user://./save.json --reset-save` → 有拒绝提示 + 正式档哈希不变 |
| A9e ×2 | **真实子进程**用 `--save-path user://../escape.json --reset-save` → 有拒绝提示 + 正式档哈希不变 |

### 独立验收的 7 个场景（全部在隔离环境）

| # | 场景 | 校验点 |
|---|---|---|
| A | `--reset-save` | 明确拒绝 + 隔离档字节未变 |
| B | `--auto-demo` | 走 `sessions/demo_save.json` + 隔离档未变 |
| C | **真实失败 → 重试** | 失败判定 ≥1 次 + 重试 ≥1 次（不再只启动 3 秒） |
| D | `--scratch-save` | 走 `sessions/scratch_save.json` + 隔离档未变 |
| E | 路径别名 ×3 | 全部被拒 + 隔离档未变 |
| F | 历史 scratch | **不得被删**（旧版脚本会 `rm -f` 它） |
| G | **进程中断（SIGTERM）** | 中断后隔离档未变 + `sessions/` 下无半截 JSON |

**每个场景后都校验：真实用户目录逐文件 sha256 完全一致。**

### 退出码

| 命令 | 退出码 |
|---|---|
| `tools/godot-tiger-test.sh` | 0（测试全过且真实目录未被碰） |
| `tools/verify-save-safety.sh` | 0（7/7 场景全过） |

---

## 五、命令与日志

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game

# 闭环测试（隔离环境，57 项）
bash tools/godot-tiger-test.sh
# → 退出码 0；日志 docs/evidence/CMD-013/tiger-tutorial-test.log

# 存档安全独立验收（隔离环境，7 场景）
bash tools/verify-save-safety.sh
# → 退出码 0，末行 SAVE_SAFETY_OK
```

两个脚本都会在结束时打印「真实用户目录逐文件 sha256 完全一致」。

---

## 六、试玩入口（不变）

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game && ./play-tiger-tutorial.command
```

从头玩：`./play-tiger-tutorial.command -- --scratch-save`
（写 `user://sessions/scratch_save.json`，**不动正式档**）

> 试玩用的是 `sessions/scratch_save.json`，与验收脚本里造的「历史 scratch」同名但不同目录，
> 验收脚本**不会删它**（场景 F 专门守这条）。

---

## 七、未做 / 不代表通过

| 项 | 说明 |
|---|---|
| **虎模型** | **程序化几何占位**，全库无虎模型。**不代表美术验收**（按指挥官指示暂缓新美术） |
| **虎影** | 同上，程序化半透明几何 |
| **拳击表演** | 程序化关键帧，非 Blender GUI 手 K |
| 其余 17 角色 | 仍是 r8 资产（能展示不能打） |
| 章节 / 渲染器 / 发布 | 未扩、未切 `gl_compatibility`、未发布、未打 tag |
| 人工键盘证据 | 未做（沙箱禁 `osascript`） |
| 视频项目 / 旧资产 | 未触碰 |

---

## 八、本轮涉及的文件

| 类别 | 文件 |
|---|---|
| 场景 | `godot/tiger_tutorial/tiger_tutorial.gd` |
| 测试 | `godot/tests/tiger_tutorial_test.gd` |
| 脚本 | `tools/godot-tiger-test.sh`（重写为隔离版）、`tools/verify-save-safety.sh`（重写为隔离版） |
| 文档 | 本文件、`docs/collaboration/handoffs/CMD-014-save-safety-and-punch.md`（加纠正声明） |
| 配置 | `.gitignore`（忽略 `override.cfg`） |
