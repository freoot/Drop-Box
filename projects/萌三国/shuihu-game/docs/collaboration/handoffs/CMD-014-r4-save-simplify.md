# CMD-014 r4 交接单 · 存档方案收敛（去入口）+ 隔离测试副本

**状态：READY_FOR_REVIEW**（未验收）
**工程**：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`
**分支**：`task/first-batch-20261022`

---

## 零、r3 的问题（先认下来）

r3 的隔离做法仍有三个问题：

| 问题 | 说明 |
|---|---|
| **写主项目 override.cfg** | 验收脚本在**主项目根**写 `override.cfg`——会**覆盖用户已有的本地配置** |
| **cleanup 无条件删除** | 退出时无条件 `rm -f "$ROOT/override.cfg"`，**把用户原有配置也删了** |
| **并发共享配置** | 同时启动两个实例、或跑另一个测试，都读同一份 `override.cfg`，互相干扰 |
| **SIGTERM 清理不等待** | 清理时子进程可能还活着，目录被删后子进程还在写 |

r4 不再给路径重置打补丁，改为**把入口直接拿掉**。

---

## 一、收敛方案：移除入口，而不是加防护

| 之前 | 现在 |
|---|---|
| `--save-path <路径>` 外部指定存档路径 | **移除**。路径不能由外部指定 → 别名绕过无从谈起 |
| `--reset-save` 重置存档 | **移除**。游戏里没有「重置/删除存档」的功能入口 |
| `_reset_save_at()` + `_sanitize_save_path()` + `_normalize_path()` + `_abs_of()` | **全部删除**（约 130 行防护代码） |
| 存档路径解析 | 简化为 12 行 |

现在 `_resolve_save_path()` 的全部逻辑：

```gdscript
func _resolve_save_path() -> String:
	var args := OS.get_cmdline_user_args()
	if args.has("--test-save") or args.has("--scratch-save") or args.has("--auto-demo"):
		if _session_save_path == "":
			_session_save_path = "%s/session_%d_%d.json" % [
				SAVE_SESSION_DIR, OS.get_process_id(), _process_start_usec]
		return _session_save_path
	return SAVE_USER
```

- 正式流程（无参数）→ `user://save.json`（只被正常流程写入）
- `--scratch-save` / `--test-save` / `--auto-demo` → **本次运行专属新档**
  `user://sessions/session_<进程号>_<进程启动微秒>.json`

**唯一性语义**（两条都要成立）：

| | 要求 | 实现 |
|---|---|---|
| 同进程内 | 多次调用结果**相同** | `_session_save_path` 缓存 + `static var _process_start_usec`（类加载时固定） |
| 跨进程 | 结果**不同** | 含进程号 + 启动时刻 |

> 同进程内必须相同，否则场景内重启读不到自己写的存档（A6 就会挂——实测踩到）。
> `static var` 在类加载时求值，比 `_ready` 里赋值更早也更稳。

---

## 二、隔离测试：独立临时项目副本

**主项目一个字节都不写。**

```
临时项目副本  $TMPDIR/shuihu-tiger-test.XXXXXX/
  ├── project.godot     ← 从主项目复制
  ├── override.cfg      ← 在**副本**里写（主项目没有这个文件）
  ├── assets  ─┐
  ├── godot   ─┤ 符号链接回主项目
  ├── .godot  ─┤ （复用 372MB 导入缓存，不重新导入）
  └── docs/tools/tests/data ─┘
```

`override.cfg` 用 Godot 的 `application/config/use_custom_user_dir` +
`custom_user_dir_name`，把 `user://` 整体重定向到独立目录：

```
真实用户目录  ~/Library/Application Support/Godot/app_userdata/是好汉就上山  ← 只读校验
隔离目录      ~/Library/Application Support/shuihu_tiger_test_<pid>_<ts>/    ← 哨兵在这
```

### 清理顺序

```bash
cleanup() {
  # 先等子进程真正退出
  for pid in $CHILD_PIDS; do kill -TERM $pid; done
  for pid in $CHILD_PIDS; do wait $pid; done     # ← 等退出
  rm -rf "$COPY"        # 副本（含副本里的 override.cfg）
  rm -rf "$ISO_APP_DIR" # 隔离 user 目录
  # 不删主项目的 override.cfg —— 本次从未在主项目创建/修改过它
}
trap cleanup EXIT INT TERM
```

---

## 三、测试覆盖

| 套件 | 命令 | 结果 |
|---|---|---|
| 武松闭环 | `bash tools/godot-tiger-test.sh` | **51/51**，退出码 0 |
| 存档安全独立验收 | `bash tools/verify-save-safety.sh` | **8/8 场景**，退出码 0 |
| 单元 + 哨兵 | `bash tools/run-tests.sh` | 173/173 |
| 旧实时战斗 | `bash tools/godot-battle-test.sh` | 24/24 |

### 闭环测试的存档断言（换成「验证入口已移除」）

| 断言 | 内容 |
|---|---|
| A9a ×4 | 源码里**不存在** `remove_absolute` / `DirAccess.remove` / `_reset_save_at` / `--save-path` / `--reset-save` |
| A9b ×2 | **真实子进程**传 `--save-path user://./save.json --reset-save` → 正式档哈希不变 + 路径未被劫持 |
| A9c ×4 | 同进程内多次解析结果**一致**；专属新档在 `sessions/` 下；不是正式档；含进程号 |

### 独立验收的 8 个场景

| # | 场景 | 校验点 |
|---|---|---|
| A | 无参数试玩 | 使用正式存档 `user://save.json` |
| B | `--scratch-save` | 本次专属新档 |
| C | `--auto-demo` | 本次专属新档 |
| D | **真实失败 → 重试** | 失败判定 ≥1 + 重试 ≥1 |
| E | **主项目预置 override.cfg** | 脚本不得覆盖或删除它（跑完校验 sha256 + 存在性） |
| F | **进程中断（SIGTERM）** | 先 `wait` 等退出，再校验：隔离档未变 + `sessions/` 下无半截 JSON |
| G | **并发启动两实例** | 两个实例的存档路径必须不同 |
| H | 历史 scratch | 不得被删 |

**每个场景后都校验**：真实用户目录逐文件 sha256 完全一致。
**全流程后再校验**：主项目 `override.cfg` 的 sha256 与存在性都没变。

---

## 四、顺带修掉的两个真 bug

1. **`_save()` 静默失败**：`FileAccess.open()` 在目录不存在时返回 `null` → 存档**根本没写进去且不报错**。
   改为写入前 `make_dir_recursive_absolute()`，失败时 `push_error`。
2. **场景内重启读不到存档**：改为 `static var _process_start_usec` + 缓存 `_session_save_path`。

---

## 五、边界

| 项 | 说明 |
|---|---|
| **虎模型 / 虎影** | 仍是程序化几何占位，**不代表美术验收**（r4 后另起工作包处理） |
| 拳击表演 | 程序化关键帧，非 GUI 手 K |
| 其余 17 角色 | 仍是 r8 资产（能展示不能打） |
| 章节 / 渲染器 / 发布 | 未扩、未切 `gl_compatibility`、未发布、未打 tag |
| 人工键盘证据 | 未做（沙箱禁 `osascript`） |
| 视频项目 / 旧资产 | 未触碰 |

---

## 六、本轮涉及的文件

| 类别 | 文件 |
|---|---|
| 场景 | `godot/tiger_tutorial/tiger_tutorial.gd` |
| 测试 | `godot/tests/tiger_tutorial_test.gd` |
| 脚本 | `tools/godot-tiger-test.sh`、`tools/verify-save-safety.sh` |
| 入口 | `play-tiger-tutorial.command` |
| 文档 | 本文件、`CMD-014-r3-save-isolation.md`（加取代声明）、`CMD-014-save-safety-and-punch.md`（已加纠正声明） |
