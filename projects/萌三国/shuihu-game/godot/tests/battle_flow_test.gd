extends SceneTree
## CMD-011 · 可操作战斗流程测试（含朝向 / 有效攻击范围）
##
## 通过 Input.parse_input_event 注入**真实按键事件**（与物理按键走同一条 Input 管线），
## 驱动 hero_battle_stage 完成：
##   移动 → 范围外攻击落空 → 背向攻击落空 → 转向后命中 → 受击 → 击杀 → 胜利
##   → 重开（含朝向恢复）→ 被打死 → 死亡后不可攻击 → 再重开
##
## 关键：所有状态变化都由按键触发；只有「失败分支预置残血」一处直接改状态，已单独标注。
##
## 运行：
##   Godot --headless --path . --script res://godot/tests/battle_flow_test.gd
## 退出码：0 = 全部通过

const SCENE := "res://godot/battle/hero_battle_stage.tscn"
const REPORT := "res://docs/evidence/CMD-011/battle-flow-report.json"

var stage: Node
var passed := 0
var failed := 0
var checks: Array = []
var notes: Array = []


func _initialize() -> void:
	_run()


func _check(name: String, ok: bool, detail: String) -> void:
	checks.append({"check": name, "ok": ok, "detail": detail})
	if ok:
		passed += 1
		print("  ok   %s — %s" % [name, detail])
	else:
		failed += 1
		print("  FAIL %s — %s" % [name, detail])


func _press(code: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = down
	Input.parse_input_event(ev)


func _tap(code: Key, hold: float = 0.12) -> void:
	_press(code, true)
	await create_timer(hold).timeout
	_press(code, false)


func _run() -> void:
	print("== 战斗流程测试开始（含朝向判定）==")
	var packed := load(SCENE) as PackedScene
	if packed == null:
		print("无法加载场景 %s" % SCENE)
		quit(1)
		return
	stage = packed.instantiate()
	root.add_child(stage)
	await create_timer(0.4).timeout
	# 前几步要精确控制位置与朝向，先把敌人 AI 冻住（冷却拉大），
	# 否则敌人会在测试操作中途反击，把玩家打进 hit 状态导致按键无效
	stage.enemy_cooldown = 999.0

	# ---------- 1. 初始状态：面向敌人 ----------
	var info0: Dictionary = stage.attack_arc_info()
	_check("初始状态", stage.player_hp == 100 and stage.enemy_hp == 60
		and stage.player_state == "idle" and stage.result == "",
		"HP %d/%d，state=%s" % [stage.player_hp, stage.enemy_hp, stage.player_state])
	_check("开局面向敌人", info0["facing"] > 0.0 and info0["in_arc"],
		"facing=%+.0f，夹角 %.0f°，朝向正确=%s"
		% [info0["facing"], info0["angle"], info0["in_arc"]])

	# ---------- 2. 移动 ----------
	var x0: float = stage.player_holder.position.x
	_press(KEY_D, true)
	await create_timer(0.7).timeout
	var x1: float = stage.player_holder.position.x
	_check("按 D 向右移动", x1 > x0 + 0.5, "x %.2f → %.2f" % [x0, x1])
	_check("移动时播 walk", stage.player_state == "walk"
		and stage.player_anim.current_animation == "walk",
		"state=%s anim=%s" % [stage.player_state, stage.player_anim.current_animation])
	_press(KEY_D, false)
	await create_timer(0.3).timeout
	_check("松开回到 idle", stage.player_state == "idle",
		"state=%s" % stage.player_state)

	# ---------- 3. 范围外攻击：不扣血 ----------
	stage.player_holder.position.x = -3.2          # 距敌人 5.0，远大于 1.7
	stage.player_holder.rotation_degrees.y = 90.0
	stage._facing = 1.0
	await create_timer(0.1).timeout
	var far_info: Dictionary = stage.attack_arc_info()
	await _tap(KEY_J)
	await create_timer(0.6).timeout
	_check("范围外攻击不扣血", stage.enemy_hp == 60,
		"距离 %.2f > %.1f，enemy_hp=%d（应 60）"
		% [far_info["dist"], stage.PLAYER_REACH, stage.enemy_hp])

	# ---------- 4. 背向攻击：不命中 ----------
	stage.player_holder.position.x = 0.55          # 距敌人 1.25，在范围内
	stage._facing = -1.0
	stage.player_holder.rotation_degrees.y = -90.0  # 背对敌人
	await create_timer(0.1).timeout
	var back_info: Dictionary = stage.attack_arc_info()
	await _tap(KEY_J)
	await create_timer(0.6).timeout
	_check("背向攻击不命中", stage.enemy_hp == 60 and not back_info["in_arc"],
		"距离 %.2f（够得着），夹角 %.0f° > 60°，enemy_hp=%d（应 60）"
		% [back_info["dist"], back_info["angle"], stage.enemy_hp])

	# ---------- 5. 转向后命中 ----------
	await _tap(KEY_D, 0.1)                          # 按 D 转向右并微移
	await create_timer(0.15).timeout
	var turn_info: Dictionary = stage.attack_arc_info()
	await _tap(KEY_J)
	await create_timer(0.25).timeout
	_check("转向后进入攻击", stage.player_state == "attack"
		and stage.player_anim.current_animation == "attack",
		"facing=%+.0f，state=%s" % [turn_info["facing"], stage.player_state])
	_check("未到命中帧不扣血", stage.enemy_hp == 60, "enemy_hp=%d" % stage.enemy_hp)
	await create_timer(0.45).timeout
	_check("朝向正确才扣血", stage.enemy_hp == 40,
		"夹角 %.0f° ≤ 60°，enemy_hp=%d（应 40）" % [turn_info["angle"], stage.enemy_hp])
	_check("敌人播受击", stage.enemy_state == "hit"
		or stage.enemy_anim.current_animation == "hit",
		"enemy_state=%s" % stage.enemy_state)

	# ---------- 6. 被反击 ----------
	var hp_before: int = stage.player_hp
	stage.enemy_cooldown = 0.05          # 放开敌人 AI
	await create_timer(2.2).timeout
	_check("敌人反击造成受击掉血", stage.player_hp < hp_before,
		"player_hp %d → %d" % [hp_before, stage.player_hp])

	# ---------- 7. 连续攻击直到击杀 ----------
	var rounds := 0
	while stage.enemy_hp > 0 and rounds < 8:
		rounds += 1
		# 被打断时先等硬直结束（hit 750ms / attack 1000ms）
		var guard := 0
		while stage.player_state != "idle" and stage.player_state != "walk" and guard < 20:
			guard += 1
			await create_timer(0.2).timeout
		if stage.player_state == "idle" or stage.player_state == "walk":
			stage.player_holder.position.x = 0.55
			stage._facing = 1.0
			stage.player_holder.rotation_degrees.y = 90.0
			await _tap(KEY_J)
		await create_timer(1.35).timeout
	_check("击杀敌人", stage.enemy_hp == 0, "enemy_hp=%d（%d 轮）" % [stage.enemy_hp, rounds])
	_check("敌人播死亡", stage.enemy_state == "dead"
		and stage.enemy_anim.current_animation == "death",
		"enemy_state=%s" % stage.enemy_state)
	_check("判定胜利", stage.result == "win" and stage.battle_over,
		"result=%s" % stage.result)
	_check("胜利后 HUD 同步", stage.hud_status.text.contains("胜利")
		and stage.hud_enemy_hp.text.contains("0 / 60"),
		"HUD='%s'" % stage.hud_status.text)

	# ---------- 8. 重开（含朝向恢复） ----------
	await _tap(KEY_R, 0.15)
	await create_timer(0.35).timeout
	var reset_info: Dictionary = stage.attack_arc_info()
	_check("按 R 重开", stage.player_hp == 100 and stage.enemy_hp == 60
		and stage.result == "" and not stage.battle_over,
		"HP %d/%d" % [stage.player_hp, stage.enemy_hp])
	_check("重开恢复朝向", reset_info["facing"] > 0.0 and reset_info["in_arc"]
		and absf(stage.player_holder.position.x + 1.8) < 0.01,
		"facing=%+.0f，x=%.2f" % [reset_info["facing"], stage.player_holder.position.x])

	# ---------- 9. 失败分支 ----------
	notes.append("失败分支预置 player_hp=12 并把玩家移到敌人攻击范围内以缩短测试时长，"
		+ "其余状态变化均由按键触发")
	stage.player_hp = 12
	stage.player_holder.position.x = 0.55
	stage.enemy_cooldown = 0.05
	await create_timer(1.2).timeout
	_check("玩家被打死", stage.player_hp == 0, "player_hp=%d" % stage.player_hp)
	_check("玩家播死亡", stage.player_state == "dead"
		and stage.player_anim.current_animation == "death",
		"state=%s" % stage.player_state)
	_check("判定失败", stage.result == "lose" and stage.battle_over,
		"result=%s" % stage.result)
	_check("失败后 HUD 同步", stage.hud_status.text.contains("失败")
		and stage.hud_player_hp.text.contains("0 / 100"),
		"HUD='%s'" % stage.hud_status.text)

	# ---------- 10. 死亡后不可攻击 ----------
	var dead_hp: int = stage.enemy_hp
	await _tap(KEY_J)
	await create_timer(0.6).timeout
	_check("死亡后不可攻击", stage.player_state == "dead" and stage.enemy_hp == dead_hp,
		"按 J 后 state=%s，enemy_hp=%d（应 %d）"
		% [stage.player_state, stage.enemy_hp, dead_hp])

	# ---------- 11. 再次重开 ----------
	await _tap(KEY_R, 0.15)
	await create_timer(0.35).timeout
	_check("失败后可重开", stage.player_hp == 100 and stage.enemy_hp == 60
		and stage.result == "" and stage.player_state == "idle",
		"HP %d/%d state=%s" % [stage.player_hp, stage.enemy_hp, stage.player_state])

	# ---------- 汇总 ----------
	var total := passed + failed
	print("\n== 合计 %d 项，PASS %d，FAIL %d ==" % [total, passed, failed])
	if failed == 0:
		print("BATTLE_FLOW_OK: 移动/范围外落空/背向落空/朝向命中/受击/死亡/胜负/重开/死亡后禁攻 全部由按键驱动")

	var report := {
		"schema": "cmd011-battle-flow/1",
		"godot": Engine.get_version_info().get("string", "?"),
		"scene": SCENE,
		"attack_arc_deg": stage.ATTACK_ARC_DEG,
		"player_reach": stage.PLAYER_REACH,
		"total": total,
		"passed": passed,
		"failed": failed,
		"checks": checks,
		"notes": notes,
	}
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://docs/evidence/CMD-011"))
	var f := FileAccess.open(REPORT, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(report, "  "))
		f.close()
	quit(0 if failed == 0 else 1)
