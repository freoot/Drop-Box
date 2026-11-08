extends SceneTree
## ACT-006 — 其余 17 个角色的 r8 资产在 Godot 运行时逐个加载并真实播放
##
## 与 ACT-005 的单角色断言（motion_action_test.gd）互补：本脚本对 r8 目录下
## **每一个** hero*.glb 实例化同一验证场景，逐个断言
##   1. 五个片段（idle/walk/attack/hit/death）在运行时全部存在
##   2. death 是资产原生片段且时长 ≈1600ms
##   3. 原有四个片段时长与 r7 基线（docs/motion/ACT-006/probe/r7_baseline.json）一致
##   4. weapon.R 挂点骨存在、父级为 hand.R
##   5. 逐个动作真实切换（AnimationPlayer.current_animation 真变）
##   6. attack 命中时点可从实际片段采样得出（只断言可用，不套用 hero005 的 458ms）
##
## 运行：
##   Godot --headless --rendering-driver opengl3 --path . \
##       --script res://godot/tests/r8_all_heroes_test.gd
## 任一断言失败即 exit 1。

const BASE_DIR := "res://assets/releases/ART-002/r8/models"
const BASELINE_PATH := "res://docs/motion/ACT-006/probe/r7_baseline.json"
const TOL_MS := 42.0
const ACTIONS: Array[String] = ["idle", "walk", "attack", "hit", "death"]
const KEEP_CLIPS: Array[String] = ["idle", "walk", "attack", "hit"]

var results: Array[Dictionary] = []
var _heroes_done: int = 0

func check(label: String, ok: bool, detail: String) -> void:
	results.append({"item": label, "pass": ok, "detail": detail})
	print("[%s] %s — %s" % ["PASS" if ok else "FAIL", label, detail])

func _read_baseline() -> Dictionary:
	if not FileAccess.file_exists(BASELINE_PATH):
		push_error("缺少 r7 基线：%s（先跑 tools/motion/snapshot_assets.py）" % BASELINE_PATH)
		return {}
	var txt := FileAccess.get_file_as_string(BASELINE_PATH)
	var data = JSON.parse_string(txt)
	if typeof(data) != TYPE_DICTIONARY:
		push_error("基线 JSON 解析失败")
		return {}
	return data.get("files", {})

func _list_heroes() -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(BASE_DIR)
	if dir == null:
		push_error("打不开 r8 目录：%s" % BASE_DIR)
		return out
	for f in dir.get_files():
		if f.begins_with("hero") and f.ends_with(".glb"):
			out.append(f.get_basename())
	out.sort()
	return out

func _init() -> void:
	var baseline := _read_baseline()
	var heroes := _list_heroes()
	if heroes.is_empty():
		push_error("r8 目录没有可测角色")
		quit(1)
		return
	print("== r8 运行时逐个验证：%d 个角色，基线 %d 个 ==" % [heroes.size(), baseline.size()])

	var stage_scene := load("res://godot/motion/hero_action_stage.tscn") as PackedScene
	if stage_scene == null:
		push_error("stage scene failed to load")
		quit(1)
		return

	for hero in heroes:
		await _test_hero(stage_scene, hero, baseline.get(hero, {}))

	var failed := results.filter(func(r: Dictionary) -> bool: return not r["pass"])
	print("\n== 合计 %d 项，PASS %d，FAIL %d（角色 %d 个） =="
		% [results.size(), results.size() - failed.size(), failed.size(), _heroes_done])
	if failed.is_empty():
		print("R8_ALL_HEROES_OK: every r8 hero loads and plays five actions in Godot runtime")
		quit(0)
	else:
		for f in failed:
			push_error("FAIL %s — %s" % [f["item"], f["detail"]])
		quit(1)

func _test_hero(stage_scene: PackedScene, hero: String, base: Dictionary) -> void:
	var path := "%s/%s.glb" % [BASE_DIR, hero]
	var stage := stage_scene.instantiate()
	stage.model_path = path
	stage.auto_cycle = false
	stage.walk_drift = false
	root.add_child(stage)
	await process_frame
	await process_frame

	if stage.player == null or stage.skeleton == null:
		check("%s 加载" % hero, false, "模型未导入或加载失败：%s" % path)
		stage.queue_free()
		await process_frame
		return
	_heroes_done += 1
	print("\n-- %s（%d 个片段）--" % [hero, stage.player.get_animation_list().size()])

	var m: Dictionary = stage.measurements

	for action in ACTIONS:
		check("%s 片段存在：%s" % [hero, action], stage.has_action(action),
			"clip=%s" % String(stage.clip_for(action)))

	var death: Dictionary = m.get("death", {})
	check("%s death 为原生片段" % hero, bool(death.get("native", false)),
		"native_ms=%s" % str(death.get("native_ms")))
	if death.has("native_ms"):
		check("%s death ≈1600ms" % hero, abs(float(death["native_ms"]) - 1600.0) <= TOL_MS,
			"实测 %.1f ms" % float(death["native_ms"]))

	# 与 r7 基线逐片段比对（hero006/013/014 的 idle/hit 本就与其他人不同）
	for action in KEEP_CLIPS:
		var e: Dictionary = m.get(action, {})
		var want = base.get("clips", {}).get(action)
		if not e.has("native_ms") or want == null:
			check("%s 时长：%s" % [hero, action], false,
				"缺 native_ms 或基线（want=%s）" % str(want))
			continue
		check("%s 时长：%s ≈%.0fms" % [hero, action, float(want)],
			abs(float(e["native_ms"]) - float(want)) <= TOL_MS,
			"r7=%.1f ms → r8 实测 %.1f ms" % [float(want), float(e["native_ms"])])

	var wa: Dictionary = m.get("weapon_attach", {})
	check("%s 武器挂点骨存在" % hero, bool(wa.get("ok", false)),
		"attach=%s" % str(wa.get("attach_bone")))
	check("%s 挂点父级 hand.R" % hero, str(wa.get("attach_parent")) == "hand.R",
		"parent=%s" % str(wa.get("attach_parent")))

	# 运行时真实切换（每个动作都让 current_animation 真的变过去）
	for action in ACTIONS:
		stage.play_action(action)
		await process_frame
		var clip: StringName = stage.clip_for(action)
		check("%s 运行时切换 %s" % [hero, action],
			stage.player.current_animation == clip and stage.player.is_playing(),
			"current=%s" % String(stage.player.current_animation))

	# 命中时点必须能从实际片段采样得出（不套用 hero005 的 458ms）
	var imp: Dictionary = (m.get("attack", {})).get("impact", {})
	check("%s attack 命中可实测" % hero, bool(imp.get("ok", false)),
		"impact=%s ms（骨骼 %s）" % [str(imp.get("impact_ms")), str(imp.get("bone"))])

	stage.queue_free()
	await process_frame
	await process_frame
