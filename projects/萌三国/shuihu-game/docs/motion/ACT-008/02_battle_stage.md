# ACT-008 · 可操作最小战斗（hero005，真实五动作驱动）

## 1. 场景

| 项 | 值 |
|---|---|
| 场景 | `res://godot/battle/hero_battle_stage.tscn` |
| 脚本 | `res://godot/battle/hero_battle_stage.gd` |
| 模型 | `res://assets/releases/ART-002/r9/models/hero005.glb`（含独立武器网格） |
| 原展示场景 | `godot/motion/hero_action_stage.tscn` **保留未动** |

打开方式：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/battle/hero_battle_stage.tscn
```

## 2. 操作

| 按键 | 行为 |
|---|---|
| `A` / `←` | 向左移动（播 `walk`，松开回 `idle`） |
| `D` / `→` | 向右移动 |
| `J` / `空格` | 攻击（播 `attack`，**播放到 452ms 判定命中**） |
| `R` | 重开（边沿触发，按住只重开一次） |

HUD 实时显示：状态文字、玩家 HP 条、敌人 HP 条、操作提示。

## 3. 战斗规则（全部由状态机驱动，不是循环播放）

| 项 | 值 |
|---|---|
| 玩家 HP / 敌人 HP | 100 / 60 |
| 玩家伤害 / 敌人伤害 | 20 / 12 |
| 玩家攻击距离 | 1.7 |
| 敌人攻击距离 | 2.0 |
| 敌人攻击间隔 | 2.2s |
| 移动速度 | 2.2/s |
| **有效攻击范围** | 距离 1.7 以内 **且** 敌人位于正面 ±60°（共 120°）扇形内 |

状态机：

```
idle ⇄ walk（A/D 转向，朝向决定能不能打中）
  ↓ J（距离 ≤1.7 且敌人在正面 120° 扇形内）
attack ──452ms──> 命中判定 → 敌人 hit / death
  ↓ 播完
idle

敌人 idle ──间隔到──> attack ──452ms──> 玩家 hit / death
```

- 玩家在 `attack` / `hit` / `dead` 期间不能移动、不能再次攻击
- **背对敌人时攻击落空**（日志会写「背向，夹角 180° > 60°」），距离不够则写「距离 X > 1.7」
- HUD 实时显示「朝向：右 → / ← 左（有效范围 120° / 1.7 米）」
- 敌人 HP 归零 → 播 `death`（不循环，定格）→ `result=win`
- 玩家 HP 归零 → 播 `death` → `result=lose`
- `R` 重置位置、HP、状态机、动画

## 4. 五动作分别用在哪

| 动作 | 触发 |
|---|---|
| `idle` | 待机 / 攻击与受击结束回位 |
| `walk` | 按住 A/D 移动时 |
| `attack` | 按 J/空格；452ms 处结算伤害 |
| `hit` | 被敌人命中时 |
| `death` | HP 归零；播完定格 |

敌人是同一个 GLB 的第二个实例（旋转 180° 面向玩家），所以敌人也用同一套五动作。

## 5. 测试（24 项断言）

```bash
bash tools/godot-battle-test.sh
# → 24/24 PASS，退出码 0
```

测试通过 `Input.parse_input_event` 注入**真实按键事件**（与物理按键走同一条 Input 管线），
不直接改 HP 或位置。覆盖：

| # | 断言 | 实测 |
|---|---|---|
| 1 | 初始状态 | HP 100/60，idle |
| 2 | 按 D 向右移动 | x −1.80 → −0.25 |
| 3 | 移动播 walk | state=walk anim=walk |
| 4 | 松开回 idle | state=idle |
| 5 | 按 J 进入攻击 | state=attack anim=attack |
| 6 | **未到命中帧不扣血** | 300ms 时 enemy_hp=60 |
| 7 | **命中帧扣血** | 452ms 后 enemy_hp=40 |
| 8 | 敌人播受击 | anim=hit |
| 9 | 敌人反击造成受击掉血 | player_hp 100→88 |
| 10 | 击杀敌人 | 3 轮，enemy_hp=0 |
| 11 | 敌人播死亡 | state=dead anim=death |
| 12 | 判定胜利 | result=win |
| 13 | 胜利后 HUD 同步 | "胜利！按 R 重开" / "敌人 HP 0 / 60" |
| 14 | 按 R 重开 | HP 100/60 |
| 15 | 玩家被打死 | player_hp=0 |
| 16 | 玩家播死亡 | state=dead anim=death |
| 17 | 判定失败 | result=lose |
| 18 | 失败后 HUD 同步 | "失败…… 按 R 重开" / "玩家 HP 0 / 100" |
| 19 | 失败后可重开 | HP 100/60 idle |

**唯一一处直接改状态**：失败分支为了不让测试跑 20 秒，预置 `player_hp=12` 并把玩家移到
敌人攻击范围内。这一点在报告 `notes` 里单独标注。

报告：`docs/evidence/CMD-010/battle-flow-report.json`

### 启动命令（可直接打开试玩）

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game && \
/Applications/Godot.app/Contents/MacOS/Godot --path . res://godot/battle/hero_battle_stage.tscn
```

`A`/`←` 左移，`D`/`→` 右移，`J`/`空格` 攻击，`R` 重开。

## 6. 录屏

两段都是 **Godot 引擎内录屏**（`--write-movie` 由引擎渲染管线逐帧写出 AVI/MJPEG 后转 H.264），
**不是操作系统实屏录制**，不依赖屏幕录制权限。

| 文件 | 内容 | 参数 |
|---|---|---|
| `battle-win.mp4` | 走近 → 三次攻击 → 敌人倒地 → 胜利 → 重开 | 1280×720 / 30fps / 24s |
| `battle-lose.mp4` | 站着挨打 → 玩家倒地 → 失败（截取最后 14 秒） | 1280×720 / 30fps / 14s |

```bash
# 胜利局
Godot --path . --write-movie /tmp/win.avi --fixed-fps 30 \
    res://godot/battle/hero_battle_stage.tscn --rendering-driver opengl3 \
    --resolution 1280x720 -- --demo --quit-after 24
# 失败局（--demo-lose：只走到攻击范围，不还手）
Godot --path . --write-movie /tmp/lose.avi --fixed-fps 30 \
    res://godot/battle/hero_battle_stage.tscn --rendering-driver opengl3 \
    --resolution 1280x720 -- --demo-lose \
    --shot-on-finish <绝对路径>/lose-defeat.png --quit-after 70
```

`--demo` / `--demo-lose` 只是**演示驱动**：按时间线注入与玩家相同的按键事件
（`Input.parse_input_event`），不是直接改状态。真实可玩性由人按键盘即可验证。

## 7. 已知限制

- 敌人没有独立模型，用同一 GLB 旋转 180° 充当对手（不扩角色）
- 敌人 AI 只有「间隔到 + 在范围内就攻击」，没有追击、没有闪避
- 攻击判定只看一维距离（x 轴），没有扇形/朝向判定
- 演示视频里游戏时间与视频时间不完全同步（`--write-movie` 固定 fps 渲染），
  所以失败证据改用「判定瞬间自动截图」而不是靠视频时间轴定位
