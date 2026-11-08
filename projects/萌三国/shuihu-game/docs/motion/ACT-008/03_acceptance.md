# ACT-008 · 验收清单（hero005，逐条可复算）

## 一、武器挂接（Blender）

| # | 验收项 | 结果 | 复算命令 / 证据 |
|---|---|---|---|
| W1 | 先查现有武器绑定，未重复添加武器 | 武器 = 角色网格内 756 顶点，100% 绑 `hand.R` | `docs/motion/ACT-008/01_weapon_attach.md` §1 |
| W2 | 分离成独立网格，绑定 `weapon.R`（权重 1.0） | 角色 14409→13653，武器 756 | `Blender -b -P tools/motion/attach_weapon.py` |
| W3 | 不新增几何 | 新增顶点 0 | `probe/weapon_attach.json` → `new_geometry_added: 0` |
| W4 | 分离前后视觉一致 | 最大偏差 **6e-8** | 同上 → `max_deviation` |
| W5 | 源工程保存（可再编辑） | `r9/source/hero005.blend` | 文件存在，Blender 可打开 |
| W6 | GLB 含五动作 + 双 mesh + weapon.R | 5 clip / 2 mesh / 12 骨 | `probe_glb.py` |
| W7 | **逐帧不脱手** | attack 7.2e-7、death 7.3e-7 | `Blender -b -P tools/motion/verify_weapon_frames.py` |
| W8 | **逐帧不穿地** | attack 武器 +0.0025；death 武器 +0.0020、身体 +0.0020 | 同上，25 + 40 帧全量 |
| W9 | r8 原版本保留 | r8 字节/sha256 未变 | `git status` 无 r8 改动 |

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b -P tools/motion/attach_weapon.py            # 分离 + 绑定 + 导出 r9
$B -b -P tools/motion/fix_ground_penetration.py   # 贴地修正（顶点 +0.026 / root 逐帧补偿）
$B -b -P tools/motion/verify_weapon_frames.py     # 逐帧验证，退出码 0
```

## 二、可操作战斗（Godot）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| B1 | 可运行场景 | `res://godot/battle/hero_battle_stage.tscn` | 场景文件 |
| B2 | 正常输入触发移动 | 按 D，x −1.80→−0.25，播 walk | 测试 #2/#3 |
| B3 | 攻击命中扣血（452ms 判定） | 300ms 不扣血、452ms 后 60→40 | 测试 #6/#7 |
| B4 | 受击 | 敌人反击，玩家 100→88，播 hit | 测试 #9 |
| B5 | 死亡 | 敌人 0 HP 播 death；玩家 0 HP 播 death | 测试 #11/#16 |
| B6 | 胜败 | result=win / lose，HUD 同步 | 测试 #12/#13/#17/#18 |
| B7 | 重开 | R 键重置 HP/位置/状态 | 测试 #14/#19 |
| B8 | 五动作真实驱动（非循环展示） | idle/walk/attack/hit/death 各有触发条件 | `02_battle_stage.md` §4 |
| B9 | 原展示场景保留 | `hero_action_stage.tscn` 未改动 | git diff 无该文件 |

```bash
bash tools/godot-battle-test.sh     # → 19/19 PASS，退出码 0
```

## 三、证据

| 文件 | 内容 |
|---|---|
| `docs/evidence/CMD-010/battle-win.mp4` | 胜利局（引擎内录屏，24s） |
| `docs/evidence/CMD-010/battle-lose.mp4` | 失败局（引擎内录屏，14s 截取） |
| `docs/evidence/CMD-010/win-1-idle.png` | 开局待机（双方满血） |
| `docs/evidence/CMD-010/win-2-move.png` | 移动中 |
| `docs/evidence/CMD-010/win-3-fight.png` | 交战中（敌人 HP 20） |
| `docs/evidence/CMD-010/win-4-victory-enemy-down.png` | 胜利 + 敌人倒地、武器仍在手 |
| `docs/evidence/CMD-010/lose-defeat.png` | 失败（HP 0）+ 玩家倒地、武器仍在手 |
| `docs/evidence/CMD-010/battle-flow-report.json` | 19 项断言明细 |
| `docs/evidence/CMD-010/battle-flow-test.log` | 测试原始输出 |

**录屏性质**：两段 mp4 都是 Godot `--write-movie` 由**引擎渲染管线**逐帧写出
（AVI/MJPEG → H.264），**不是操作系统实屏录制**，不依赖屏幕录制权限。

## 四、边界（未做，不算通过）

| 项 | 状态 |
|---|---|
| 扩角色 / 扩章节 | 未做，只有 hero005 |
| 渲染器切换 Forward+ | 未做，仍 `gl_compatibility` |
| 敌人独立模型 / 更复杂 AI | 未做，同模型旋转 180°，AI 只有间隔攻击 |
| 攻击扇形/朝向判定 | 未做，只判 x 轴距离 |
| 发布 / 打 tag | 未做 |
| 物理键盘人工试玩录像 | 未做；演示由 `Input.parse_input_event` 注入按键，与物理按键同一条输入管线 |
