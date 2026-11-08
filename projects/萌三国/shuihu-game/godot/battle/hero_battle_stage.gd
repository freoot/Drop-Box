extends Node3D
## CMD-010 · hero005 最小可操作战斗（用真实五动作驱动，不是循环展示）
##
## 与 godot/motion/hero_action_stage.tscn 的区别：
##   那个场景只按顺序播放 idle/walk/attack/hit/death 做展示；
##   本场景有输入、有判定、有血量、有胜负、有重开，动作由战斗状态机驱动。
##
## 操作
##   A / D 或 ← / →   左右移动（walk，松开回 idle）
##   J 或 空格         攻击（attack；播放到 452ms 判定命中）
##   R                 重开
##
## 命令行
##   Godot --path . res://godot/battle/hero_battle_stage.tscn
##   ... -- --demo            # 自动演示一局（用于录屏）
##   ... -- --probe           # 打印一次环境与状态后退出
##   ... -- --quit-after 12   # 指定秒数后退出

const MODEL_PATH := "res://assets/releases/ART-002/r9/models/hero005.glb"
const MODEL_SCALE := 0.76

## 战斗数值（集中在这里，测试直接读）
const PLAYER_MAX_HP := 100
const ENEMY_MAX_HP := 60
const PLAYER_DAMAGE := 20
const ENEMY_DAMAGE := 12
const PLAYER_REACH := 1.7
const ENEMY_REACH := 2.0
## 有效攻击扇形：以角色正面为轴，左右各 60°。
## 之前只判 x 距离，背对敌人也能打中；加上这个角度后必须转身才命中。
const ATTACK_ARC_DEG := 120.0
const MOVE_SPEED := 2.2
const ENEMY_ATTACK_INTERVAL := 2.2
const MOVE_MIN := -3.4
const MOVE_MAX := 3.4
## 命中时刻：与 ACT-004/005 实测的 452ms 一致
const IMPACT_MS := 452.0

var player_holder: Node3D
var enemy_holder: Node3D
var player_anim: AnimationPlayer
var enemy_anim: AnimationPlayer
var player_model: Node3D
var enemy_model: Node3D

var player_hp := PLAYER_MAX_HP
var enemy_hp := ENEMY_MAX_HP
var player_state := "idle"          # idle / walk / attack / hit / dead
var enemy_state := "idle"
var battle_over := false
var result := ""                    # "" / "win" / "lose"
var attack_hit_done := false
var enemy_cooldown := ENEMY_ATTACK_INTERVAL
var elapsed := 0.0

var hud_status: Label
var hud_player_hp: Label
var hud_enemy_hp: Label
var hud_hint: Label
var hud_facing: Label
var hud_player_bar: ProgressBar
var hud_enemy_bar: ProgressBar

var _facing := 1.0
var _r_held := false
var _demo := false
var _demo_lose := false
var _demo_step := 0
var _demo_timer := 0.0


func _ready() -> void:
	_build_world()
	if not _spawn_models():
		return
	_build_hud()
	_print_environment()
	_demo_lose = OS.get_cmdline_user_args().has("--demo-lose")
	_demo = OS.get_cmdline_user_args().has("--demo") or _demo_lose
	if OS.get_cmdline_user_args().has("--probe"):
		print("[BATTLE] " + JSON.stringify(_state_snapshot()))
		get_tree().quit(0)
		return
	if OS.get_cmdline_user_args().has("--quit-after"):
		var secs := float(_arg_value("--quit-after", "15"))
		await get_tree().create_timer(secs).timeout
		get_tree().quit(0)


func _arg_value(name: String, fallback: String = "") -> String:
	var args := OS.get_cmdline_user_args()
	var i := args.find(name)
	if i >= 0 and i + 1 < args.size():
		return args[i + 1]
	return fallback


func _print_environment() -> void:
	var info := {
		"display_server": DisplayServer.get_name(),
		"window_size": DisplayServer.window_get_size(),
		"gpu_adapter": RenderingServer.get_video_adapter_name(),
		"rendering_method": ProjectSettings.get_setting(
			"rendering/renderer/rendering_method", "?"),
		"godot_version": Engine.get_version_info().get("string", "?"),
		"pid": OS.get_process_id(),
		"model": MODEL_PATH,
	}
	print("[ENV] " + JSON.stringify(info))


# ---------------------------------------------------------------- 场景搭建

func _build_world() -> void:
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.position = Vector3(-1.05, 2.05, 5.35)
	add_child(cam)
	cam.look_at(Vector3(0.0, 0.88, 0.0), Vector3.UP)
	cam.fov = 42.0

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-52.0, -34.0, 0.0)
	sun.light_energy = 1.35
	add_child(sun)

	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.10, 0.12, 0.16)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.55, 0.58, 0.66)
	e.ambient_light_energy = 0.9
	env.environment = e
	add_child(env)

	var ground := MeshInstance3D.new()
	ground.name = "Ground"
	var plane := PlaneMesh.new()
	plane.size = Vector2(16.0, 8.0)
	ground.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.22, 0.24, 0.28)
	mat.roughness = 0.95
	ground.material_override = mat
	ground.position = Vector3(0.0, 0.0, 0.0)
	add_child(ground)

	# 地面刻度线，便于在录屏里看出移动
	for i in range(-3, 4):
		var mark := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.04, 0.01, 2.2)
		mark.mesh = box
		var m2 := StandardMaterial3D.new()
		m2.albedo_color = Color(0.36, 0.39, 0.45)
		mark.material_override = m2
		mark.position = Vector3(float(i) * 1.0, 0.005, 0.0)
		add_child(mark)

	player_holder = Node3D.new()
	player_holder.name = "Player"
	player_holder.position = Vector3(-1.8, 0.0, 0.0)
	# 开局面向敌人（+X）：模型正面是 +Z，绕 Y 转 90° 后朝 +X
	player_holder.rotation_degrees = Vector3(0.0, 90.0, 0.0)
	add_child(player_holder)

	enemy_holder = Node3D.new()
	enemy_holder.name = "Enemy"
	enemy_holder.position = Vector3(1.8, 0.0, 0.0)
	add_child(enemy_holder)


func _spawn_models() -> bool:
	if not ResourceLoader.exists(MODEL_PATH):
		push_error("模型不存在或未导入：%s" % MODEL_PATH)
		return false
	var packed := load(MODEL_PATH) as PackedScene
	if packed == null:
		push_error("无法加载：%s" % MODEL_PATH)
		return false

	player_model = packed.instantiate() as Node3D
	player_model.scale = Vector3.ONE * MODEL_SCALE
	player_holder.add_child(player_model)
	player_anim = _find_anim(player_model)

	enemy_model = packed.instantiate() as Node3D
	enemy_model.scale = Vector3.ONE * MODEL_SCALE
	enemy_model.rotation_degrees = Vector3(0.0, 180.0, 0.0)
	enemy_holder.add_child(enemy_model)
	enemy_anim = _find_anim(enemy_model)

	if player_anim == null or enemy_anim == null:
		push_error("未找到 AnimationPlayer")
		return false

	for a in ["idle", "walk"]:
		var anim := player_anim.get_animation(a)
		if anim:
			anim.loop_mode = Animation.LOOP_LINEAR
	for a in ["attack", "hit", "death"]:
		var anim2 := player_anim.get_animation(a)
		if anim2:
			anim2.loop_mode = Animation.LOOP_NONE
	for a2 in ["idle", "walk"]:
		var eanim := enemy_anim.get_animation(a2)
		if eanim:
			eanim.loop_mode = Animation.LOOP_LINEAR
	for a3 in ["attack", "hit", "death"]:
		var eanim2 := enemy_anim.get_animation(a3)
		if eanim2:
			eanim2.loop_mode = Animation.LOOP_NONE

	player_anim.animation_finished.connect(_on_player_anim_finished)
	enemy_anim.animation_finished.connect(_on_enemy_anim_finished)
	_play(player_anim, "idle")
	_play(enemy_anim, "idle")
	return true


func _find_anim(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := _find_anim(child)
		if found != null:
			return found
	return null


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)

	var font := FontFile.new()
	for p in ["/System/Library/Fonts/PingFang.ttc",
			"/System/Library/Fonts/Supplemental/Songti.ttc"]:
		if FileAccess.file_exists(p) and font.load_dynamic_font(p) == OK:
			break

	hud_status = Label.new()
	hud_status.position = Vector2(24, 18)
	hud_status.add_theme_font_override("font", font)
	hud_status.add_theme_font_size_override("font_size", 30)
	hud_status.text = "战斗中"
	layer.add_child(hud_status)

	hud_player_hp = Label.new()
	hud_player_hp.position = Vector2(24, 62)
	hud_player_hp.add_theme_font_override("font", font)
	hud_player_hp.add_theme_font_size_override("font_size", 18)
	layer.add_child(hud_player_hp)

	hud_player_bar = ProgressBar.new()
	hud_player_bar.position = Vector2(24, 88)
	hud_player_bar.size = Vector2(300, 18)
	hud_player_bar.max_value = PLAYER_MAX_HP
	hud_player_bar.value = PLAYER_MAX_HP
	layer.add_child(hud_player_bar)

	hud_enemy_hp = Label.new()
	hud_enemy_hp.position = Vector2(24, 118)
	hud_enemy_hp.add_theme_font_override("font", font)
	hud_enemy_hp.add_theme_font_size_override("font_size", 18)
	layer.add_child(hud_enemy_hp)

	hud_enemy_bar = ProgressBar.new()
	hud_enemy_bar.position = Vector2(24, 144)
	hud_enemy_bar.size = Vector2(300, 18)
	hud_enemy_bar.max_value = ENEMY_MAX_HP
	hud_enemy_bar.value = ENEMY_MAX_HP
	layer.add_child(hud_enemy_bar)

	hud_facing = Label.new()
	hud_facing.position = Vector2(24, 172)
	hud_facing.add_theme_font_override("font", font)
	hud_facing.add_theme_font_size_override("font_size", 16)
	layer.add_child(hud_facing)

	hud_hint = Label.new()
	hud_hint.position = Vector2(24, 196)
	hud_hint.add_theme_font_override("font", font)
	hud_hint.add_theme_font_size_override("font_size", 16)
	hud_hint.text = "A/D 或 ←/→ 移动　J 或 空格 攻击　R 重开"
	layer.add_child(hud_hint)
	_update_hud()


func _update_hud() -> void:
	if hud_player_hp == null:
		return
	hud_player_hp.text = "玩家 HP %d / %d" % [player_hp, PLAYER_MAX_HP]
	hud_enemy_hp.text = "敌人 HP %d / %d" % [enemy_hp, ENEMY_MAX_HP]
	hud_player_bar.value = player_hp
	hud_enemy_bar.value = enemy_hp
	hud_facing.text = "朝向：%s（有效范围 %.0f° / %.1f 米）" % [
		"右 →" if _facing > 0.0 else "← 左", ATTACK_ARC_DEG, PLAYER_REACH]
	if battle_over:
		hud_status.text = "胜利！按 R 重开" if result == "win" else "失败…… 按 R 重开"
	else:
		hud_status.text = "战斗中"


# ---------------------------------------------------------------- 输入与状态机

func _process(delta: float) -> void:
	elapsed += delta
	if _demo:
		_drive_demo(delta)

	# R 键做边沿检测：按住不放只重开一次，避免每帧 reset
	var r_down := Input.is_key_pressed(KEY_R)
	if r_down and not _r_held:
		_r_held = true
		reset_battle()
		return
	if not r_down:
		_r_held = false
	if battle_over:
		return

	# 玩家移动（攻击/受击/死亡期间不能动）
	if player_state == "idle" or player_state == "walk":
		var dir := 0.0
		if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
			dir -= 1.0
		if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
			dir += 1.0
		if dir != 0.0:
			_facing = dir
			player_holder.position.x = clampf(
				player_holder.position.x + dir * MOVE_SPEED * delta, MOVE_MIN, MOVE_MAX)
			player_holder.rotation_degrees.y = 90.0 * dir
			if player_state != "walk":
				player_state = "walk"
				_play(player_anim, "walk")
		elif player_state == "walk":
			player_state = "idle"
			_play(player_anim, "idle")

	# 攻击输入
	if (Input.is_key_pressed(KEY_J) or Input.is_key_pressed(KEY_SPACE)) \
			and (player_state == "idle" or player_state == "walk"):
		_start_player_attack()

	# 攻击命中判定：播到 452ms 结算一次
	if player_state == "attack" and not attack_hit_done:
		if player_anim.current_animation_position * 1000.0 >= IMPACT_MS:
			attack_hit_done = true
			_resolve_player_hit()

	# 敌人 AI：只有真正出手才重置冷却。
	# 之前冷却归零就重置，如果那一刻敌人正在受击硬直，会白等一整个间隔。
	if not battle_over and enemy_state != "dead":
		enemy_cooldown -= delta
		if enemy_cooldown <= 0.0 and enemy_state == "idle" \
				and absf(player_holder.position.x - enemy_holder.position.x) <= ENEMY_REACH:
			enemy_cooldown = ENEMY_ATTACK_INTERVAL
			_start_enemy_attack()

	_update_hud()


func _start_player_attack() -> void:
	player_state = "attack"
	attack_hit_done = false
	player_anim.stop()
	_play(player_anim, "attack", true)


## 攻击是否落在有效范围内：距离 + 朝向扇形，两个条件都满足才算命中。
## 返回值同时写进日志与测试快照，便于核对是"够不着"还是"背对着"。
func attack_arc_info() -> Dictionary:
	var to_enemy := enemy_holder.global_position - player_holder.global_position
	to_enemy.y = 0.0
	var dist := to_enemy.length()
	# 模型正面是 +Z（初始 rotation.y=0 时朝向镜头），所以 forward 取 basis.z
	var forward := player_holder.global_transform.basis.z
	forward.y = 0.0
	var dir_to_enemy := to_enemy.normalized() if dist > 0.001 else Vector3.ZERO
	var dot := forward.normalized().dot(dir_to_enemy) if dist > 0.001 else -1.0
	var angle := rad_to_deg(acos(clampf(dot, -1.0, 1.0)))
	return {
		"dist": dist,
		"angle": angle,
		"in_reach": dist <= PLAYER_REACH,
		"in_arc": angle <= ATTACK_ARC_DEG * 0.5,
		"facing": _facing,
	}


func _resolve_player_hit() -> void:
	var info := attack_arc_info()
	if not info["in_reach"]:
		print("[BATTLE] 攻击落空：距离 %.2f > %.2f" % [info["dist"], PLAYER_REACH])
		return
	if not info["in_arc"]:
		print("[BATTLE] 攻击落空：背向，夹角 %.0f° > %.0f°"
			% [info["angle"], ATTACK_ARC_DEG * 0.5])
		return
	enemy_hp = max(0, enemy_hp - PLAYER_DAMAGE)
	print("[BATTLE] 命中：敌人 HP %d" % enemy_hp)
	if enemy_hp <= 0:
		enemy_state = "dead"
		enemy_anim.stop()
		_play(enemy_anim, "death", true)
		_finish("win")
	else:
		enemy_state = "hit"
		enemy_anim.stop()
		_play(enemy_anim, "hit", true)


func _start_enemy_attack() -> void:
	enemy_state = "attack"
	enemy_anim.stop()
	_play(enemy_anim, "attack", true)
	await get_tree().create_timer(IMPACT_MS / 1000.0).timeout
	if battle_over or enemy_state != "attack":
		return
	player_hp = max(0, player_hp - ENEMY_DAMAGE)
	print("[BATTLE] 受击：玩家 HP %d" % player_hp)
	if player_hp <= 0:
		player_state = "dead"
		player_anim.stop()
		_play(player_anim, "death", true)
		_finish("lose")
	else:
		player_state = "hit"
		player_anim.stop()
		_play(player_anim, "hit", true)


func _on_player_anim_finished(anim_name: String) -> void:
	if anim_name == "attack" or anim_name == "hit":
		player_state = "idle"
		_play(player_anim, "idle")
	elif anim_name == "death":
		player_state = "dead"


func _on_enemy_anim_finished(anim_name: String) -> void:
	if anim_name == "attack" or anim_name == "hit":
		enemy_state = "idle"
		_play(enemy_anim, "idle")
	elif anim_name == "death":
		enemy_state = "dead"


func _finish(verdict: String) -> void:
	battle_over = true
	result = verdict
	print("[BATTLE] 战斗结束：%s" % ("胜利" if verdict == "win" else "失败"))
	# _process 在 battle_over 后会提前 return，这里必须主动刷新一次 HUD，
	# 否则血条与状态文字会停在判定前的数值（曾导致画面显示 HP 4 而实际已 0）
	_update_hud()
	# 胜负判定瞬间自动截图（用于留证，避免依赖录屏时间轴）
	if _has_arg("--shot-on-finish"):
		await RenderingServer.frame_post_draw
		await get_tree().create_timer(1.9).timeout   # 等死亡动画完全躺平
		_update_hud()
		var img := get_viewport().get_texture().get_image()
		var path := _arg_value("--shot-on-finish")
		img.save_png(path)
		print("[BATTLE] 已截图：%s" % path)


func _has_arg(name: String) -> bool:
	return OS.get_cmdline_user_args().has(name)


func reset_battle() -> void:
	player_hp = PLAYER_MAX_HP
	enemy_hp = ENEMY_MAX_HP
	player_state = "idle"
	enemy_state = "idle"
	battle_over = false
	result = ""
	attack_hit_done = false
	enemy_cooldown = ENEMY_ATTACK_INTERVAL
	elapsed = 0.0
	player_holder.position = Vector3(-1.8, 0.0, 0.0)
	enemy_holder.position = Vector3(1.8, 0.0, 0.0)
	_facing = 1.0
	player_holder.rotation_degrees.y = 90.0   # 重新面向敌人
	enemy_holder.rotation_degrees.y = 180.0
	player_anim.stop()
	enemy_anim.stop()
	_play(player_anim, "idle", true)
	_play(enemy_anim, "idle", true)
	_demo_step = 0
	_demo_timer = 0.0
	_update_hud()
	print("[BATTLE] 已重开")


func _play(anim: AnimationPlayer, name: String, force: bool = false) -> void:
	if anim == null:
		return
	if not force and anim.current_animation == name and anim.is_playing():
		return
	anim.play(name)


# ---------------------------------------------------------------- 自动演示（录屏用）

func _drive_demo(delta: float) -> void:
	# 失败演示：只走到敌人攻击范围内，然后站着挨打（不攻击、不闪避）
	if _demo_lose:
		if player_holder.position.x < 0.55:
			_inject_key(KEY_D, true)
		else:
			_inject_key(KEY_D, false)
		return
	if battle_over:
		_demo_timer += delta
		if _demo_timer > 2.0:
			reset_battle()
			_demo_step = 0
			_demo_timer = 0.0
		return
	_demo_timer += delta
	match _demo_step:
		0:  # 走近敌人
			_inject_key(KEY_D, true)
			if player_holder.position.x >= 0.35:
				_inject_key(KEY_D, false)
				_demo_step = 1
				_demo_timer = 0.0
		1:  # 先背对敌人打一次（演示"背向不命中"）
			if _demo_timer > 0.2:
				_inject_key(KEY_A, true)
				_demo_timer = 0.0
				_demo_step = 2
		2:
			# 只按 0.08s：够转身但不会退出攻击距离，否则落空原因会变成"够不着"
			if _demo_timer > 0.08:
				_inject_key(KEY_A, false)
				_demo_step = 3
				_demo_timer = 0.0
		3:  # 背向按 J
			if _demo_timer > 0.15:
				_inject_key(KEY_J, true)
				_demo_step = 4
				_demo_timer = 0.0
		4:
			if _demo_timer > 0.2:
				_inject_key(KEY_J, false)
				_demo_step = 5
				_demo_timer = 0.0
		5:  # 等落空提示，然后按住 D 转身，直到真的面向敌人且回到攻击距离
			if _demo_timer > 1.1:
				_inject_key(KEY_D, true)
				_demo_step = 6
				_demo_timer = 0.0
		6:
			if _facing > 0.0 and player_holder.position.x >= 0.45:
				_inject_key(KEY_D, false)
				_demo_step = 7
				_demo_timer = 0.0
		7:  # 正面攻击
			if _demo_timer > 0.2:
				_inject_key(KEY_J, true)
				_demo_step = 8
				_demo_timer = 0.0
		8:
			if _demo_timer > 0.2:
				_inject_key(KEY_J, false)
				_demo_step = 9 if enemy_hp > 0 else 11
				_demo_timer = 0.0
		9:  # 等动作播完继续打
			if _demo_timer > 1.3:
				_demo_step = 7
				_demo_timer = 0.0
		_:
			pass


func _inject_key(code: Key, pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = pressed
	Input.parse_input_event(ev)


func _state_snapshot() -> Dictionary:
	return {
		"player_hp": player_hp,
		"enemy_hp": enemy_hp,
		"player_state": player_state,
		"enemy_state": enemy_state,
		"battle_over": battle_over,
		"result": result,
		"player_x": snappedf(player_holder.position.x, 0.001),
		"enemy_x": snappedf(enemy_holder.position.x, 0.001),
		"player_anim": player_anim.current_animation if player_anim else "",
		"enemy_anim": enemy_anim.current_animation if enemy_anim else "",
		"elapsed": snappedf(elapsed, 0.01),
	}
