# CMD-011 交接单 · 朝向判定与有效攻击范围

- **状态**：READY_FOR_REVIEW
- **工程**：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`
- **范围**：只改 `godot/battle/hero_battle_stage.gd` 的攻击判定与测试；不迁网页、不扩角色、不改资产

---

## 一、修的是什么缺口

上一版攻击判定只有一行：

```gdscript
var dist := absf(player.x - enemy.x)
if dist > PLAYER_REACH: return
```

**只看距离，不看朝向**——玩家背对敌人，只要距离够就能打中。

现在加了两层判定（`attack_arc_info()`）：

| 判定 | 规则 | 不满足时的日志 |
|---|---|---|
| 距离 | `dist <= PLAYER_REACH`（1.7，**未改**） | `攻击落空：距离 5.00 > 1.70` |
| 朝向 | 敌人方向与角色正面的夹角 `<= 60°`（`ATTACK_ARC_DEG=120` 的一半） | `攻击落空：背向，夹角 180° > 60°` |

角色正面取 `global_transform.basis.z`（该模型正面是 +Z，初始 `rotation.y=0` 时朝镜头）。

**数值一个没动**：玩家 100HP / 敌人 60HP、伤害 20 / 12、攻击距离 1.7、敌人距离 2.0、
冷却 2.2s、移动 2.2/s，全部保持原值。五动作（idle/walk/attack/hit/death）也没改。

## 二、顺带修的两个问题

1. **开局不面向敌人**：原来 `rotation.y = 0`（朝镜头），现在开局 `90°` 面向敌人，
   `reset_battle()` 也恢复成 90°。
2. **敌人冷却空转**：原来冷却归零就重置，如果那一刻敌人正在受击硬直，会白等一整个 2.2s。
   改成「真正出手才重置冷却」。

## 三、测试（24 项，全过）

```bash
bash tools/godot-battle-test.sh
# → 24/24 PASS，退出码 0
```

新增/强化的断言：

| # | 断言 | 实测 |
|---|---|---|
| 2 | 开局面向敌人 | facing=+1，夹角 0° |
| 6 | **范围外攻击不扣血** | 距离 5.00 > 1.70，enemy_hp 仍 60 |
| 7 | **背向攻击不命中** | 距离 1.25 够得着，夹角 180° > 60°，enemy_hp 仍 60 |
| 8 | 转向后进入攻击 | facing=+1，state=attack |
| 9 | 未到命中帧不扣血 | 300ms 时 enemy_hp=60 |
| 10 | **朝向正确才扣血** | 夹角 0°，enemy_hp 60→40 |
| 18 | **重开恢复朝向** | facing=+1，x=−1.80 |
| 23 | **死亡后不可攻击** | 按 J 后 state=dead，enemy_hp 不变 |

报告：`docs/evidence/CMD-011/battle-flow-report.json`

## 四、截图与视频（当前版本）

| 文件 | 内容 | HUD 关键读数 |
|---|---|---|
| `01-facing-back-enemy-full.png` | 背对敌人，按 J 落空 | **朝向：← 左**，敌人 **60/60**（满血，没掉） |
| `02-facing-front-hit.png` | 转身后面向敌人挥击 | **朝向：右 →**，敌人 **40/60**（掉了一格） |
| `03-victory-enemy-down.png` | 胜利，敌人倒地 | **胜利！按 R 重开**，敌人 **0/60** |
| `04-restart.png` | 按 R 重开 | 双方满血，朝向恢复「右 →」 |
| `battle-facing.mp4` | 完整演示（背向落空→转身命中→击杀→胜利→重开） | 1280×720 / 30fps / 26s |

截图从视频按时间点抽取（3.2s / 5.6s / 12.3s / 14.0s），**都是当前版本**（含朝向 HUD）。

## 五、证据性质（重要，别混）

| 证据 | 输入方式 | 是否人工按键 |
|---|---|---|
| `battle-flow-report.json`（24 项断言） | `Input.parse_input_event()` 注入按键事件 | ❌ 注入 |
| `battle-facing.mp4` / 四张截图 | `--demo` 模式按时间线注入同样的按键事件 | ❌ 注入 |
| 人工试玩 | 需要指挥官亲自按键盘 | ⏳ **未做** |

注入走的是 Godot 同一条 Input 管线（`Input.is_key_pressed` 能读到），但**不是物理按键**。
本机沙箱禁止 `osascript` 发送系统级按键（SIGTERM），所以我无法自己产出「人工输入」证据。

**人工验证清单**（按下面的命令启动后逐条试）：

1. 开局角色应面朝右边敌人，HUD 显示「朝向：右 →」
2. 按 `A` 转身背对，HUD 变「朝向：← 左」；此时按 `J`，敌人血条**不动**
3. 按 `D` 转回来，按 `J`，敌人血条从 60 掉到 40
4. 走到离敌人很远（左侧边缘）按 `J`，敌人血条不动
5. 站着不动被敌人打死，倒地后再按 `J`，角色不应起身或攻击
6. 按 `R`，血量、位置、朝向全部复位

## 六、启动命令（可直接打开试玩）

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game && \
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/battle/hero_battle_stage.tscn
```

窗口打开后即可用键盘操作：`A`/`←` 左移，`D`/`→` 右移，`J`/`空格` 攻击，`R` 重开。

## 七、未做 / 边界

| 项 | 状态 |
|---|---|
| 人工键盘试玩证据 | 未做（沙箱禁止系统级按键），清单已给 |
| 上下方向（W/S） | 未做，玩法只有左右一维，文档不再写 WASD |
| 敌人朝向判定 | 未做，敌人固定面向玩家，只判距离 |
| 网页版战斗 | 未迁移，未改动 |
| 角色 / 章节 / 资产 | 未扩、未改 |
| 发布 / tag | 未做 |

## 八、改动文件

```
godot/battle/hero_battle_stage.gd     朝向判定 + 扇形范围 + HUD 朝向行 + 演示流程 + 敌人冷却修复
godot/tests/battle_flow_test.gd       19 → 24 项断言（范围/背向/朝向/死亡禁攻/重开朝向）
docs/collaboration/handoffs/CMD-010-weapon-battle.md   纠正 WASD 虚报
docs/evidence/CMD-011/                视频 + 4 张截图 + 测试报告 + README
```
