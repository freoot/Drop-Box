extends SceneTree
## CMD-007 — 一角色五动作 Godot 运行时接入断言（headless）
##
## 运行：
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --rendering-driver opengl3 \
##       --path . --script res://godot/tests/motion_action_test.gd
##
## 断言全部来自运行时真实加载的 GLB 片段数据（Animation 资源的关键帧），
## 不读取任何预先写死的结果文件；任一断言失败即 exit 1。

const IMPACT_TARGET_MS := 458.0
const RECOVERY_TOTAL_MS := 1110.0
const TOL_MS := 42.0
const EXPECT_CLIP_MS := {"idle": 2000.0, "walk": 1000.0, "attack": 1000.0, "hit": 750.0}

var results: Array[Dictionary] = []

func check(label: String, ok: bool, detail: String) -> void:
	results.append({"item": label, "pass": ok, "detail": detail})
	print("[%s] %s — %s" % ["PASS" if ok else "FAIL", label, detail])

func _init() -> void:
	var stage_scene := load("res://godot/motion/hero_action_stage.tscn") as PackedScene
	if stage_scene == null:
		push_error("stage scene failed to load")
		quit(1)
		return
	var stage := stage_scene.instantiate()
	stage.auto_cycle = false
	root.add_child(stage)
	await process_frame
	await process_frame

	if stage.player == null:
		push_error("AnimationPlayer 未就绪（模型可能未导入）")
		quit(1)
		return

	print("== 模型：%s ==" % stage.model_path)
	print("== 片段列表：%s ==" % str(stage.player.get_animation_list()))

	var m: Dictionary = stage.measurements

	# 1. 五个动作片段齐备
	for action in ["idle", "walk", "attack", "hit", "death"]:
		check("片段存在：%s" % action, stage.has_action(action),
			"clip=%s" % String(stage.clip_for(action)))

	# 2. death 为原生片段（不再是合成）
	var death: Dictionary = m.get("death", {})
	check("death 为资产原生片段", bool(death.get("native", false)),
		"native_ms=%s" % str(death.get("native_ms")))
	if death.has("native_ms"):
		var dms := float(death["native_ms"])
		check("death 时长接近 1600ms", abs(dms - 1600.0) <= TOL_MS,
			"实测 %.1f ms（24fps 量化）" % dms)

	# 3. 既有片段时长未被 r8 重建破坏
	for action in EXPECT_CLIP_MS:
		var e: Dictionary = m.get(action, {})
		if not e.has("native_ms"):
			check("clip 时长：%s" % action, false, "缺 native_ms")
			continue
		var v := float(e["native_ms"])
		var want := float(EXPECT_CLIP_MS[action])
		check("clip 时长：%s ≈ %.0fms" % [action, want], abs(v - want) <= TOL_MS,
			"实测 %.1f ms" % v)

	# 4. 武器挂点（真实骨骼层级）
	var wa: Dictionary = m.get("weapon_attach", {})
	check("武器挂点骨存在", bool(wa.get("ok", false)), "attach=%s" % str(wa.get("attach_bone")))
	check("武器挂点父级为 hand.R", str(wa.get("attach_parent")) == "hand.R",
		"parent=%s" % str(wa.get("attach_parent")))

	# 5. 命中时点由实际片段算出
	var atk: Dictionary = m.get("attack", {})
	var imp: Dictionary = atk.get("impact", {})
	check("attack 命中实测可用", bool(imp.get("ok", false)), "reason=%s" % str(imp.get("reason")))
	if imp.get("ok", false):
		var ims := float(imp["impact_ms"])
		check("attack 命中 ≈ %.0fms" % IMPACT_TARGET_MS, abs(ims - IMPACT_TARGET_MS) <= TOL_MS,
			"实测 %.1f ms（偏差 %+.1f ms，骨骼 %s，峰值 %.2f rad/s）"
			% [ims, ims - IMPACT_TARGET_MS, str(imp["bone"]), float(imp["peak_rate_rad_per_s"])])

	# 6. 收招：原生片段 + 尾保持 = 1110ms
	var tail := float(atk.get("tail_hold_ms", -1.0))
	var total := float(atk.get("total_ms", -1.0))
	check("attack 收招尾保持 = %.0fms" % (RECOVERY_TOTAL_MS - 1000.0),
		abs(tail - (RECOVERY_TOTAL_MS - 1000.0)) <= TOL_MS, "实测 %.1f ms" % tail)
	check("attack 总时长（含收招）= %.0fms" % RECOVERY_TOTAL_MS,
		abs(total - RECOVERY_TOTAL_MS) <= TOL_MS, "实测 %.1f ms" % total)
	var recovery := float(atk.get("recovery_ms", -1.0))
	check("attack 收招段 = 总时长 - 命中", abs(recovery - (total - float(imp.get("impact_ms", 0.0)))) <= 1.0,
		"实测 %.1f ms" % recovery)

	# 7. 运行时真实切换（不是离线预览）
	for action in ["idle", "walk", "attack", "hit", "death"]:
		stage.play_action(action)
		await process_frame
		var clip: StringName = stage.clip_for(action)
		check("运行时切换到 %s" % action,
			stage.player.current_animation == clip and stage.player.is_playing(),
			"current=%s playing=%s" % [String(stage.player.current_animation), str(stage.player.is_playing())])

	# 8. attack 播完 + 收招尾保持后回到 idle（实际运行时行为）
	stage.play_action("attack")
	stage.player.seek(stage.player.current_animation_length - 0.001, true)
	await process_frame
	await process_frame
	await process_frame
	await create_timer(0.18).timeout
	check("attack 收招结束后回到 idle", stage.current_action == "idle",
		"current_action=%s" % stage.current_action)

	# 9. death 播完定格，不回 idle
	stage.play_action("death")
	stage.player.seek(stage.player.current_animation_length - 0.001, true)
	await process_frame
	await create_timer(0.15).timeout
	check("death 结束后定格不回 idle", stage.current_action == "death",
		"current_action=%s" % stage.current_action)

	var failed := results.filter(func(r: Dictionary) -> bool: return not r["pass"])
	print("\n== 合计 %d 项，PASS %d，FAIL %d ==" % [results.size(), results.size() - failed.size(), failed.size()])
	if failed.is_empty():
		print("MOTION_ACTION_OK: five actions wired in Godot runtime with measured impact/recovery")
		quit(0)
	else:
		for f in failed:
			push_error("FAIL %s — %s" % [f["item"], f["detail"]])
		quit(1)
