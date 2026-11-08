extends Node3D
## ACT-005 / CMD-007 — 一角色五动作的 Godot **运行时**接入验证场景
##
## 与 ACT-004 的离线帧预览（Blender 离线渲染 + HTML 逐帧播放）不同，本场景在
## Godot 运行时真实加载 GLB、真实驱动 AnimationPlayer，命中与收招时点**由实际
## 片段的关键帧数据算出**，而不是照抄文档数值。
##
## 用法
##   Godot --path . res://godot/motion/hero_action_stage.tscn
##       → 打开后按顺序自动切换 idle / walk / attack / hit / death，HUD 显示当前
##         动作、实测命中 ms、收招 ms
##   ... -- --action attack --at-ms 458 --shot <abs路径.png>
##       → 精准 seek 到指定毫秒并截图（真实运行截图，非离线渲染）
##   ... -- --sequence <动作> --frames <n> --shot-dir <dir>
##       → 从 0ms 起等间隔采集 n 帧，用于合成录屏
##   ... -- --probe
##       → 打印全部实测数据（JSON）后退出

const ACTIONS: Array[String] = ["idle", "walk", "attack", "hit", "death"]
const LOOPED: Array[String] = ["idle", "walk"]

## 目标时点（来自 ACT-004 裁决，本场景用实际片段复核，不是照抄）
const IMPACT_TARGET_MS: float = 458.0
const RECOVERY_TOTAL_MS: float = 1110.0
## 容差：24fps 单帧 41.7ms，取 42ms
const TOL_MS: float = 42.0

@export var model_path: String = "res://assets/releases/ART-002/r8/models/hero005.glb"
@export var auto_cycle: bool = true
@export var cycle_hold_seconds: float = 1.4
@export var walk_drift: bool = true          # 仅自动循环时生效，保证截图确定性
@export var model_scale: float = 0.76

var player: AnimationPlayer
var model: Node3D
var skeleton: Skeleton3D
var current_action: String = ""
var measurements: Dictionary = {}
var hud: Label
var _busy: bool = false

func _ready() -> void:
	# 允许命令行覆盖模型（ACT-006：同一场景逐个验证 18 个 r8 角色）
	if _has_arg("--model"):
		model_path = _arg_value("--model", model_path)
	_setup_view()
	_print_environment()
	if not _load_model():
		return
	hud = get_node_or_null("HUD/Status") as Label
	measurements = measure_all()
	if OS.get_cmdline_user_args().has("--probe"):
		print(JSON.stringify(measurements, "  "))
		get_tree().quit(0)
		return
	if _has_arg("--action"):
		await _capture_mode()
		return
	if auto_cycle:
		_cycle_loop()
	# 窗口模式录制用：跑满指定秒数后自行退出，便于配合 --write-movie 出片
	if _has_arg("--quit-after"):
		var secs := float(_arg_value("--quit-after", "10"))
		print("[ENV] 窗口保持 %.1fs 后自动退出" % secs)
		await get_tree().create_timer(secs).timeout
		get_tree().quit(0)

## 打印真实运行环境：DisplayServer 名称是最硬的证据 ——
## --headless 时为 "headless"，正常窗口运行时为 "macos"。
func _print_environment() -> void:
	var info := {
		"display_server": DisplayServer.get_name(),
		"window_size": DisplayServer.window_get_size(),
		"window_position": DisplayServer.window_get_position(),
		"screen_count": DisplayServer.get_screen_count(),
		"gpu_adapter": RenderingServer.get_video_adapter_name(),
		"gpu_driver": OS.get_video_adapter_driver_info(),
		"rendering_method": ProjectSettings.get_setting(
			"rendering/renderer/rendering_method", "?"),
		"godot_version": Engine.get_version_info().get("string", "?"),
		"pid": OS.get_process_id(),
		"cmdline_args": OS.get_cmdline_args(),
		"user_args": OS.get_cmdline_user_args(),
	}
	print("[ENV] " + JSON.stringify(info))
	if DisplayServer.get_name() == "headless":
		printerr("[ENV] 当前为 headless 显示服务，不属于窗口运行")

func _has_arg(name: String) -> bool:
	return OS.get_cmdline_user_args().has(name)

func _arg_value(name: String, fallback: String = "") -> String:
	var args := OS.get_cmdline_user_args()
	var i := args.find(name)
	if i >= 0 and i + 1 < args.size():
		return args[i + 1]
	return fallback

# ---------------------------------------------------------------- 场景与模型

func _setup_view() -> void:
	var cam := get_node_or_null("Camera3D") as Camera3D
	if cam:
		cam.look_at(Vector3(0.0, 1.0, 0.0), Vector3.UP)
	# 默认主题不含中日韩字形，HUD 会显示成方框；按平台尝试加载系统中文字体
	var label := get_node_or_null("HUD/Status") as Label
	if label == null:
		return
	for path in [
		"/System/Library/Fonts/PingFang.ttc",
		"/System/Library/Fonts/Supplemental/Songti.ttc",
		"/System/Library/Fonts/STHeiti Light.ttc",
		"/Library/Fonts/Arial Unicode.ttf",
		"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
		"C:/Windows/Fonts/msyh.ttc",
	]:
		if not FileAccess.file_exists(path):
			continue
		var f := FontFile.new()
		if f.load_dynamic_font(path) == OK:
			label.add_theme_font_override("font", f)
			break

func _load_model() -> bool:
	if not ResourceLoader.exists(model_path):
		push_error("模型不存在或尚未导入：%s" % model_path)
		return false
	var packed := load(model_path) as PackedScene
	if packed == null:
		push_error("模型不是 PackedScene：%s" % model_path)
		return false
	model = packed.instantiate() as Node3D
	model.name = "HeroModel"
	model.scale = Vector3.ONE * model_scale
	add_child(model)
	player = _find_player(model)
	skeleton = _find_skeleton(model)
	if player == null:
		push_error("模型内未找到 AnimationPlayer")
		return false
	return true

func _find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for c: Node in node.get_children():
		var found := _find_player(c)
		if found:
			return found
	return null

func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for c: Node in node.get_children():
		var found := _find_skeleton(c)
		if found:
			return found
	return null

# ---------------------------------------------------------------- 动作切换

func clip_for(action: String) -> StringName:
	if player == null:
		return &""
	for clip: StringName in player.get_animation_list():
		var n := String(clip)
		if n == action or n.ends_with(action) or n.get_file() == action:
			return clip
	return &""

func has_action(action: String) -> bool:
	return not clip_for(action).is_empty()

func play_action(action: String) -> void:
	if player == null or not has_action(action):
		push_error("缺少动作片段：%s（可用：%s）" % [action, player.get_animation_list() if player else []])
		return
	current_action = action
	var clip := clip_for(action)
	var anim := player.get_animation(clip)
	anim.loop_mode = Animation.LOOP_LINEAR if action in LOOPED else Animation.LOOP_NONE
	player.play(clip, 0.08)
	_update_hud()
	if action in ["attack", "hit"]:
		if not player.animation_finished.is_connected(_on_finished):
			player.animation_finished.connect(_on_finished)
	elif action == "death":
		# 死亡：播完原生片段后定格，不回到 idle
		if not player.animation_finished.is_connected(_on_finished):
			player.animation_finished.connect(_on_finished)

func _on_finished(_clip: StringName) -> void:
	if current_action == "death":
		_update_hud("定格")
		return
	# 收招尾保持：原生片段 1000ms，按裁决补到 1110ms
	var tail := tail_hold_ms(current_action) / 1000.0
	if tail > 0.0:
		await get_tree().create_timer(tail).timeout
	if current_action in ["attack", "hit"]:
		play_action("idle")

func tail_hold_ms(action: String) -> float:
	var m: Dictionary = measurements.get(action, {})
	var native: float = float(m.get("native_ms", 0.0))
	if action != "attack":
		return 0.0
	return maxf(0.0, RECOVERY_TOTAL_MS - native)

func _cycle_loop() -> void:
	while true:
		for action in ACTIONS:
			play_action(action)
			if action == "walk" and walk_drift:
				_drift_walk()
			var hold := cycle_hold_seconds
			if action == "death":
				hold = maxf(hold, measurements.get("death", {}).get("native_ms", 1600.0) / 1000.0 + 0.4)
			await get_tree().create_timer(hold).timeout
			model.position = Vector3.ZERO

func _drift_walk() -> void:
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_LINEAR)
	tween.tween_property(model, "position", Vector3(0.0, 0.0, -1.1), cycle_hold_seconds)

# ---------------------------------------------------------------- 实测（由实际片段算出）

func bone_track_path(action: String, bone: String, type: int) -> int:
	var clip := clip_for(action)
	if clip.is_empty():
		return -1
	var anim := player.get_animation(clip)
	for i in anim.get_track_count():
		if anim.track_get_type(i) != type:
			continue
		var p: NodePath = anim.track_get_path(i)
		var sub: StringName = p.get_subname(0) if p.get_subname_count() > 0 else &""
		if String(sub) == bone or String(p).ends_with(":" + bone):
			return i
	return -1

func rotation_track_paths(action: String) -> PackedStringArray:
	var out := PackedStringArray()
	var clip := clip_for(action)
	if clip.is_empty():
		return out
	var anim := player.get_animation(clip)
	for i in anim.get_track_count():
		if anim.track_get_type(i) == Animation.TYPE_ROTATION_3D:
			out.append(String(anim.track_get_path(i)))
	return out

func bone_index(names: PackedStringArray) -> int:
	## 依次尝试 hand.R → arm.R → 任一含 hand 的骨骼
	if skeleton == null:
		return -1
	for want in names:
		for i in skeleton.get_bone_count():
			if skeleton.get_bone_name(i) == want:
				return i
	return -1

func measure_impact_ms(action: String) -> Dictionary:
	## 运行时实测：按 8ms 步长 seek 实际片段，读取骨骼**世界**姿态（正向运动学结果，
	## 与 ACT-004 对 GLB 的离线 FK 算法一致），取角速度/线速度峰值时刻。
	## 说明：hand.R 的局部旋转在资产内是恒定的（Godot 导入器据此把它判为 immutable
	## 轨道并裁剪），其运动来自父骨 arm.R，故必须按世界姿态而非局部轨道来测。
	var clip := clip_for(action)
	if clip.is_empty():
		return {"ok": false, "reason": "clip 缺失"}
	if skeleton == null:
		return {"ok": false, "reason": "未找到 Skeleton3D"}
	var bi := bone_index(["hand.R", "arm.R"])
	if bi < 0:
		return {"ok": false, "reason": "未找到 hand.R / arm.R 骨骼"}
	var bone := skeleton.get_bone_name(bi)
	var anim := player.get_animation(clip)
	var length := anim.length
	var step := 0.008
	player.play(clip, 0.0)
	player.pause()
	var samples: Array[Dictionary] = []
	var t := 0.0
	while t <= length + 1e-6:
		player.seek(t, true)
		var gp: Transform3D = skeleton.get_bone_global_pose(bi)
		samples.append({"t": t, "o": gp.origin, "q": gp.basis.get_rotation_quaternion()})
		t += step
	if samples.size() < 2:
		return {"ok": false, "reason": "采样不足"}
	var best_ang := {"rate": -1.0, "t_ms": 0.0}
	var best_lin := {"rate": -1.0, "t_ms": 0.0}
	var ang_max := 0.0
	var lin_max := 0.0
	var curve: Array[Dictionary] = []
	for i in samples.size() - 1:
		var a: Dictionary = samples[i]
		var b: Dictionary = samples[i + 1]
		var dt: float = float(b["t"]) - float(a["t"])
		if dt <= 0.0:
			continue
		var ang: float = (a["q"] as Quaternion).angle_to(b["q"] as Quaternion) / dt
		var lin: float = (a["o"] as Vector3).distance_to(b["o"] as Vector3) / dt
		var mid_ms: float = (float(a["t"]) + float(b["t"])) * 500.0
		curve.append({"t_ms": mid_ms, "ang": ang, "lin": lin})
		ang_max = maxf(ang_max, ang)
		lin_max = maxf(lin_max, lin)
		if ang > best_ang["rate"]:
			best_ang = {"rate": ang, "t_ms": mid_ms}
		if lin > best_lin["rate"]:
			best_lin = {"rate": lin, "t_ms": mid_ms}
	# 合成判据（与 ACT-004 的 combined_impact 一致）：角速度、线速度各自归一化后求和取峰值
	var best_comb := {"score": -1.0, "t_ms": 0.0}
	for c in curve:
		var score: float = (float(c["ang"]) / ang_max if ang_max > 0.0 else 0.0) \
			+ (float(c["lin"]) / lin_max if lin_max > 0.0 else 0.0)
		if score > best_comb["score"]:
			best_comb = {"score": score, "t_ms": float(c["t_ms"])}
	player.seek(0.0, true)
	return {
		"ok": true,
		"bone": bone,
		"sample_step_ms": step * 1000.0,
		"sample_count": samples.size(),
		"impact_ms": best_comb["t_ms"],
		"impact_criterion": "combined(angular+linear, normalized)",
		"angular_peak_ms": best_ang["t_ms"],
		"peak_rate_rad_per_s": best_ang["rate"],
		"linear_peak_ms": best_lin["t_ms"],
		"linear_peak_units_per_s": best_lin["rate"],
		"native_ms": length * 1000.0,
	}

func measure_all() -> Dictionary:
	var out := {}
	for action in ACTIONS:
		var entry := {"native": has_action(action)}
		if not has_action(action):
			out[action] = entry
			continue
		var clip := clip_for(action)
		var anim := player.get_animation(clip)
		entry["clip"] = String(clip)
		entry["native_ms"] = anim.length * 1000.0
		entry["track_count"] = anim.get_track_count()
		if action in ["attack", "hit"]:
			var imp := measure_impact_ms(action)
			entry["impact"] = imp
			entry["rotation_tracks"] = rotation_track_paths(action)
			if action == "attack" and imp.get("ok", false):
				entry["impact_delta_ms"] = float(imp["impact_ms"]) - IMPACT_TARGET_MS
				entry["impact_within_tolerance"] = abs(entry["impact_delta_ms"]) <= TOL_MS
				entry["tail_hold_ms"] = maxf(0.0, RECOVERY_TOTAL_MS - float(entry["native_ms"]))
				entry["total_ms"] = float(entry["native_ms"]) + entry["tail_hold_ms"]
				entry["recovery_ms"] = entry["total_ms"] - float(imp["impact_ms"])
		out[action] = entry
	out["weapon_attach"] = weapon_attach_probe()
	out["model_path"] = model_path
	out["animation_list"] = Array(player.get_animation_list()) if player else []
	return out

func weapon_attach_probe() -> Dictionary:
	if skeleton == null:
		return {"ok": false, "reason": "未找到 Skeleton3D"}
	var names: Array[String] = []
	var hit_idx := -1
	for i in skeleton.get_bone_count():
		var bn := skeleton.get_bone_name(i)
		names.append(bn)
		var low := bn.to_lower()
		if low.contains("weapon") or low.contains("prop") or low.contains("sword"):
			hit_idx = i
	var res := {"ok": hit_idx >= 0, "bone_names": names, "bone_count": names.size()}
	if hit_idx >= 0:
		var parent_idx := skeleton.get_bone_parent(hit_idx)
		res["attach_bone"] = skeleton.get_bone_name(hit_idx)
		res["attach_parent"] = skeleton.get_bone_name(parent_idx) if parent_idx >= 0 else ""
		res["attach_rest_global"] = var_to_str(skeleton.get_bone_global_rest(hit_idx))
	return res

# ---------------------------------------------------------------- 截图 / 序列

func seek_to_ms(action: String, ms: float) -> void:
	# 截图/序列帧需要**确定**的姿态：零混合（否则 0.08s 混合未推进，画面仍是 idle），
	# 并把 speed_scale 置 0 冻结在 seek 位置，避免暂停后被 process 覆盖回上一状态。
	current_action = action
	var clip := clip_for(action)
	var anim := player.get_animation(clip)
	anim.loop_mode = Animation.LOOP_LINEAR if action in LOOPED else Animation.LOOP_NONE
	player.play(clip, 0.0)
	player.speed_scale = 0.0
	var sec := clampf(ms / 1000.0, 0.0, anim.length)
	player.seek(sec, true)
	player.pause()
	_update_hud("%s @ %.0fms" % [action, ms])

func save_shot(path: String) -> void:
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var err := img.save_png(path)
	print("SHOT %s err=%d" % [path, err])

func _capture_mode() -> void:
	var action := _arg_value("--action", "idle")
	var shot := _arg_value("--shot", "")
	var seq_dir := _arg_value("--shot-dir", "")
	if not seq_dir.is_empty():
		# 采样总时长默认覆盖「含收招」的总时长（attack 1110ms），不是只覆盖原生片段
		var total := float(_arg_value("--duration-ms",
			str(measurements.get(action, {}).get("total_ms", measurements.get(action, {}).get("native_ms", 1000.0)))))
		var frames := int(_arg_value("--frames", str(maxi(2, int(round(total / 41.667))))))
		DirAccess.make_dir_recursive_absolute(seq_dir)
		for i in frames:
			var ms := total * float(i) / float(max(frames - 1, 1))
			seek_to_ms(action, ms)
			await save_shot(seq_dir.path_join("%s_%02d.png" % [action, i]))
		print("SEQ_DONE %s frames=%d dir=%s" % [action, frames, seq_dir])
		get_tree().quit(0)
		return
	if shot.is_empty():
		push_error("--action 需要配合 --shot 或 --shot-dir")
		get_tree().quit(2)
		return
	var ms := float(_arg_value("--at-ms", "0"))
	seek_to_ms(action, ms)
	await save_shot(shot)
	get_tree().quit(0)

# ---------------------------------------------------------------- HUD

func _update_hud(extra: String = "") -> void:
	if hud == null:
		return
	var m: Dictionary = measurements.get(current_action, {})
	var lines := PackedStringArray()
	lines.append("动作：%s   片段：%s" % [current_action, m.get("clip", "-")])
	if m.has("native_ms"):
		lines.append("原生时长：%.1f ms" % float(m["native_ms"]))
	if m.has("impact") and m["impact"].get("ok", false):
		lines.append("实测命中：%.1f ms（目标 %.0f ms，偏差 %+.1f ms）"
			% [float(m["impact"]["impact_ms"]), IMPACT_TARGET_MS, float(m.get("impact_delta_ms", 0.0))])
	if m.has("tail_hold_ms"):
		lines.append("收招尾保持：%.1f ms → 总时长 %.1f ms（目标 %.0f ms）"
			% [float(m["tail_hold_ms"]), float(m["total_ms"]), RECOVERY_TOTAL_MS])
	if current_action == "death" and not m.get("native", false):
		lines.append("该版本无原生 death 片段")
	if extra != "":
		lines.append(extra)
	hud.text = "\n".join(lines)
