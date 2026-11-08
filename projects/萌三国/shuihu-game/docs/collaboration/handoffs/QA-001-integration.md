# 集成交接 / 返修单

- 任务 ID / 修订号：QA-001-integration / r2（集成检查 + 深度审查修复，非最终验收）
- 负责人 / 接收人：A（集成） / Codex（最终验收）
- 状态：READY_FOR_REVIEW
- 基线提交 / 交付提交 / 最终集成提交：d980587 / 本轮提交 / fee36e4
- 本轮交付提交：
  - 首批四任务：
    - ENG-001：07fa504 — feat(ENG-001): keyboard naming, rename flow and power parity checks
    - CONTENT-001：1368a1d — content(CONTENT-001): vet first twelve hero stories and role alignment
    - UI-001：76c8941 — ui(UI-001): remove legacy building class overlay and tighten city stage
    - VFX-001：f2c99ad — vfx(VFX-001): constrain huarong rest art, separate idle from attack
  - 深度审查修复（用户要求"继续修改，还有很多需要修"后）：
    - 78bb854 — fix(VFX-001/ENG-001): data-drive rest art, autofocus naming, gear title
    - 87ad080 — ui/vfx: phone pan hint and shield vs heal colour distinction
    - 49217d8 — fix(VFX-001): six shape clipped to 3 cells at bottom row
    - b35c8a5 — docs(ENG-001): README reflects enabled Song Jiang / Li Kui sheets and 5-hero studio
    - 8f8f31a — fix(ENG-001): ally weak debuff did not tick when the ally only moved
    - fabafc6 — fix(ENG-001): unyielding shield triggers before damage, absorbing the crossing hit
    - fee36e4 — docs(ENG-001): correct README hero counts — 12 sheets, 16 portraits, 12-hero studio
- 目标与验收条件：集成 ENG-001、CONTENT-001、UI-001、VFX-001 后运行全套测试，确认无回归；深度审查后修复三个逻辑缺陷（六格形状、虚弱结算、不屈护盾）并更新文档；汇总接口与已知问题，交 Codex 做浏览器视觉验收。
- 测试命令 / 退出码 / 结果：
  - `node --check game.js` → 0
  - `node --check data/shuihu.js` → 0
  - `node --check data/portraits.js` → 0
  - `node --check data/hero-stories.js` → 0
  - `node --test tests/*.test.mjs` → 110 pass / 0 fail（基线 84 + 新增 26：ENG-001 5、CONTENT-001 6、UI-001 4、VFX-001 7，+ 深度审查新增 4：six 边界 1、weak tick 1、unyielding 2）
  - `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://godot/tests/smoke_test.gd` → 报 `res://assets/liangshan-journey-map.png` 不存在。经核实，此错误在基线 d980587（stash 本轮改动后）同样存在，是 Godot `res://` 路径解析的既有问题，非本轮回归。Node 测试中的 Godot 用例检查文本内容（project.godot/scene/script），不实际运行 Godot 引擎，已通过。
- 深度审查修复摘要：
  1. **六格形状底部裁剪（49217d8）**：花荣「落羽箭雨」的 six 形状用 `y===ty||y===ty+1` 仅向下延伸；目标在 y=3 时 ty+1 出界，只剩 3 格而非 6 格。改为根据棋盘边界选择相邻行（优先上方，出界则用下方），四行均返回完整 6 格。
  2. **虚弱不结算（8f8f31a）**：盟友的 weak 仅在 performAttack/performSkill 内递减；盟友只移动不攻击时，weak 永不结算。移除攻击时的递减，改为敌方阶段开始时对全体盟友调用 tickEnemyDebuffs（与 burn/marked 同位置），使 weak=N 表示精确 N 个我方回合。
  3. **不屈护盾在致命伤害上浪费（fabafc6）**：「百炼筋骨」在 HP 伤害结算之后才加护盾；一击从 50% 以上直接降到 0% 时护盾加给已死单位。改为在伤害吸收之前判定（仅当当前 HP≥50% 且即将降到 50% 以下时触发），护盾参与吸收当前这一击。
  4. **README 计数过时（b35c8a5 + fee36e4）**：声称宋江/李逵图集"尚未启用"（实际已接入）、造型室 3 位（实际 12 位）、11 张立绘（实际 12 位好汉 + 4 敌方 = 16 张）。已全部更正。
- 接口汇总（跨任务）：
  - 取名（ENG-001）：Enter 经 form submit 提交；Escape 在已取名时退出改名，首次不退回空名。A 的 game.js owns 此逻辑。
  - 战力（ENG-001）：我方 `heroPower()` = `SHUIHU_POWER.calculate` + gearBonus；敌方与 scout card 直接 `calculate`，无 gear。双方同函数同口径，武力值为展示估值。
  - 宋江/吴用定位（ENG-001 + CONTENT-001）：数据层 hero-001 skills 均 ally_single（guard+heal）；hero-003 落石伏阵 cleave/column + weaken。故事文本与数据一致。
  - 护盾（VFX-001）：game.js:386 仅 `shield>0` 输出 dome；applyDamage 扣减至 0 自动消失。CSS `ward-breathe` 持续反馈。治疗与护盾 pop 颜色已区分（绿 vs 蓝）。
  - VFX 映射（VFX-001）：game.js:341 hero-004→thunder/wind、hero-003→rocks/tactics、burn→meteor、hero-001→banner。playBattleFx 传入 skillCells()，与预览/结算同范围函数。
  - 花荣待机（VFX-001）：game.js:64 输出 `battle-rest-art` img；game.css 约束 170% 宽、底部对齐，moving/attacking/hit/dead 时 display:none。restArt 由 portraits.js 数据驱动。
  - 六格形状（VFX-001）：shapeCells 的 six 分支自适应行方向，不再在底部裁剪。
  - 虚弱结算（ENG-001）：weak 在敌方阶段开始时统一结算，与 burn/marked 并列。
  - 不屈护盾（ENG-001）：applyDamage 在伤害吸收前触发不屈，护盾参与当前一击。
- 截图或录像路径 / 视口尺寸 / 对应提交：本轮未完成浏览器视觉验收。桌面、手机竖屏与横屏的取名/改名/旧档恢复、主城视觉、花荣待机与攻击、护盾反馈、雷电/落石/火术均需 Codex 用真实浏览器验证。不宣称视觉通过。
- 已知问题与尚未检查项：
  1. Godot `res://assets/` 路径解析错误（基线既有，非本轮回归）。
  2. 浏览器视觉验收全部待补：取名/改名/旧档恢复、主城桌面/竖屏/横屏、花荣待机分离、林冲人体比例、护盾随值消失、雷电/落石/火术范围。
- 回滚方式：`git revert fee36e4 fabafc6 8f8f31a b35c8a5 49217d8 87ad080 78bb854 f2c99ad 76c8941 1368a1d 07fa504`；不得清空工作目录或存档。

## 逐项验收

| 任务 | 测试数 | 结果 | 交接单 | 提交 |
|---|---|---|---|---|
| ENG-001 | 5+4 | 110/110 pass | handoffs/ENG-001.md | 07fa504 + 8f8f31a + fabafc6 |
| CONTENT-001 | 6 | 110/110 pass | handoffs/CONTENT-001.md | 1368a1d |
| UI-001 | 4 | 110/110 pass | handoffs/UI-001.md | 76c8941 + 87ad080 |
| VFX-001 | 7+1 | 110/110 pass | handoffs/VFX-001.md | f2c99ad + 78bb854 + 49217d8 |

## 缺陷退回

| 缺陷 ID | 严重度 | 归属 | 复现步骤 | 预期 / 实际 | 证据 | 修复提交 | 复测 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
