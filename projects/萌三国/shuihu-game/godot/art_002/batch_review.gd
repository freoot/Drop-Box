extends "res://godot/art_002/battlefield_sample.gd"
## ART-002 r7 batch review. Reuses r6 world/controller; never writes game saves.
const R7 := "res://assets/releases/ART-002/r7/"
var batch_id := "b1"
var records: Array = []
var page_index := 0
var page_label: Label
var picker: OptionButton
var fatal := false
var result: Dictionary = {"heroes": [], "cells": [], "failures": []}
var automated := false
var graphical := false
var evidence_folder := ""
var mode_name := ""
var run_id := ""
var written: Array = []

func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--batch="):
			batch_id = arg.trim_prefix("--batch=")
	get_tree().root.tree_exiting.connect(func(): print("ART002_TREE_EXITING"))
	automated = "--batch-test" in OS.get_cmdline_user_args() or "--batch-capture" in OS.get_cmdline_user_args()
	graphical = "--batch-capture" in OS.get_cmdline_user_args()
	var data = JSON.parse_string(FileAccess.get_file_as_string(R7 + "batches/" + batch_id + ".json"))
	if not data is Dictionary or not data.get("heroes") is Array or data.heroes.is_empty():
		_fail("Missing/nonempty batch manifest: " + batch_id)
		return
	records = data.heroes
	_setup_world()
	var scenery := load_model("res://assets/releases/ART-002/r6/models/liangshan_battlefield.glb")
	if fatal:
		return
	add_child(scenery)
	_apply_water(scenery)
	_build_cells()
	selection_ring = _ring(Color("e7c65e"), 0.47)
	add_child(selection_ring)
	cell_marker = _ring(Color("e9ead1"), 0.55)
	cell_marker.visible = false
	add_child(cell_marker)
	_build_batch_ui()
	_fit_camera()
	_show_page(0)
	get_viewport().size_changed.connect(_fit_camera)
	if automated:
		call_deferred("_verify")

func load_model(path: String) -> Node3D:
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	if document.append_from_file(ProjectSettings.globalize_path(path), state) != OK:
		_fail("Model load failed: " + path)
		return Node3D.new()
	var model := document.generate_scene(state)
	if model == null:
		_fail("Model scene generation failed: " + path)
		return Node3D.new()
	return model

func _fail(message: String) -> void:
	fatal = true
	result.failures.append(message)
	push_error(message)
	get_tree().quit(1)

func _asset_path(relative: String) -> String:
	return relative if relative.begins_with("res://") else R7 + relative

func _build_batch_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var panel := PanelContainer.new()
	panel.position = Vector2(12, 12)
	layer.add_child(panel)
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Hiragino Sans GB", "PingFang SC", "Heiti SC"])
	theme.default_font = font
	panel.theme = theme
	var column := VBoxContainer.new()
	panel.add_child(column)
	page_label = Label.new()
	column.add_child(page_label)
	status = Label.new()
	column.add_child(status)
	var navigation := HBoxContainer.new()
	column.add_child(navigation)
	for direction: int in [-1, 1]:
		var button := Button.new()
		button.text = "上一组" if direction < 0 else "下一组"
		button.pressed.connect(func(): _show_page(posmod(page_index + direction, ceili(records.size() / 6.0))))
		navigation.add_child(button)
	picker = OptionButton.new()
	picker.item_selected.connect(_select_hero)
	navigation.add_child(picker)
	var actions := HBoxContainer.new()
	column.add_child(actions)
	for action: String in ["idle", "walk", "attack", "hit"]:
		var button := Button.new()
		button.text = {"idle":"待机", "walk":"行走", "attack":"攻击", "hit":"受击"}[action]
		button.pressed.connect(_play_selected.bind(action))
		actions.add_child(button)

func _show_page(index: int) -> void:
	for actor: Node3D in heroes:
		remove_child(actor)
		actor.queue_free()
	heroes.clear()
	picker.clear()
	page_index = index
	for i: int in range(index * 6, mini(records.size(), index * 6 + 6)):
		var record: Dictionary = records[i]
		var actor := Node3D.new()
		actor.set_script(HeroSample)
		actor.hero_id = record.id
		actor.display_name = _display_name(record)
		actor.model_scene = packed_model(_asset_path(record.model))
		if fatal:
			return
		actor.position = cell_position(Vector2i(1 + (i % 6) % 3 * 2, 1 + (i % 6) / 3))
		add_child(actor)
		heroes.append(actor)
		picker.add_item(actor.display_name)
		actor.action_changed.connect(_action_changed)
	_select_hero(0)
	page_label.text = "ART-002 r7 · %s · %d 人 · 第 %d 组" % [batch_id, records.size(), index + 1]

func _display_name(record: Dictionary) -> String:
	return record.name if "·" in String(record.name) else String(record.get("byname", "")) + " · " + String(record.name)

func _select_hero(index: int) -> void:
	if index < 0 or index >= heroes.size():
		return
	selected_index = index
	picker.select(index)
	status.text = heroes[index].display_name

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_TAB:
		_select_hero((selected_index + 1) % heroes.size())
		return
	super._unhandled_input(event)

func _skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child: Node in node.get_children():
		var found := _skeleton(child)
		if found:
			return found
	return null

func _pose(skeleton: Skeleton3D) -> Array:
	var values: Array = []
	for bone: int in skeleton.get_bone_count():
		var rotation := skeleton.get_bone_pose_rotation(bone)
		values.append_array([rotation.x, rotation.y, rotation.z, rotation.w])
	return values

func _click(point: Vector2) -> void:
	for pressed: bool in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = point
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		get_viewport().push_input(event, true)

func _write_json(path: String, data: Dictionary) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data, "\t"))
	var ok := file.get_error() == OK
	file.close()
	return ok

func _save_png(image: Image, path: String) -> void:
	if image.save_png(path) != OK:
		_fail("Evidence write failed: " + path)
		return
	written.append(path.get_file())

func _evidence_inputs() -> Dictionary:
	var viewport := Vector2i.ZERO
	if is_inside_tree():
		viewport = get_viewport().size
	return {
		"batch": batch_id,
		"mode": mode_name,
		"viewport": [viewport.x, viewport.y],
		"manifest_sha256": FileAccess.get_sha256(R7 + "batches/" + batch_id + ".json"),
		"review_script_sha256": FileAccess.get_sha256("res://godot/art_002/batch_review.gd"),
		"controller_sha256": FileAccess.get_sha256("res://godot/art_002/hero_sample.gd"),
		"world_model_sha256": FileAccess.get_sha256("res://assets/releases/ART-002/r6/models/liangshan_battlefield.glb"),
		"engine": Engine.get_version_info().string,
	}

func _begin_evidence() -> void:
	mode_name = "capture" if graphical else "headless"
	evidence_folder = ProjectSettings.globalize_path(R7 + "evidence/" + batch_id)
	DirAccess.make_dir_recursive_absolute(evidence_folder)
	run_id = "%s-%d" % [Time.get_datetime_string_from_system(true).replace(":", "-"), OS.get_process_id()]
	written.clear()
	var stale := evidence_folder + "/" + mode_name + "-manifest.json"
	if FileAccess.file_exists(stale):
		DirAccess.remove_absolute(stale)
	var marker := _evidence_inputs()
	marker["run_id"] = run_id
	marker["started_utc"] = Time.get_datetime_string_from_system(true)
	if not _write_json(evidence_folder + "/" + mode_name + "-in-progress.json", marker):
		_fail("Evidence marker write failed")

func _finish_evidence() -> void:
	var output_name := "runtime.json" if graphical else "headless.json"
	var output := FileAccess.open(evidence_folder + "/" + output_name, FileAccess.WRITE)
	if output == null:
		_fail("Evidence write failed: " + output_name)
		return
	output.store_string(JSON.stringify(result, "\t"))
	var ok := output.get_error() == OK
	output.close()
	if not ok:
		_fail("Evidence write failed: " + output_name)
		return
	var files := {}
	for name: String in written + [output_name]:
		var file := FileAccess.open(evidence_folder + "/" + name, FileAccess.READ)
		if file == null:
			_fail("Missing evidence output: " + name)
			return
		var entry := {"sha256": FileAccess.get_sha256(evidence_folder + "/" + name), "bytes": file.get_length()}
		file.close()
		if name.ends_with(".png"):
			var image := Image.new()
			if image.load(evidence_folder + "/" + name) != OK:
				_fail("Unreadable evidence image: " + name)
				return
			entry["width"] = image.get_width()
			entry["height"] = image.get_height()
		files[name] = entry
	var manifest := _evidence_inputs()
	manifest["run_id"] = run_id
	manifest["run_complete"] = true
	manifest["files"] = files
	if not _write_json(evidence_folder + "/" + mode_name + "-manifest.json", manifest):
		_fail("Evidence manifest write failed")
		return
	DirAccess.remove_absolute(evidence_folder + "/" + mode_name + "-in-progress.json")
	print("ART002_BATCH_OK %s heroes=%d actions=%d cells=32" % [batch_id, result.heroes.size(), result.heroes.size() * 4])
	get_tree().quit(0)

func _verify() -> void:
	print("ART002_VERIFY_START mode=%s" % ("capture" if graphical else "headless"))
	_begin_evidence()
	if fatal:
		return
	print("ART002_EVIDENCE_BEGUN " + run_id)
	var folder := evidence_folder
	await get_tree().physics_frame
	for y: int in 4:
		for x: int in 8:
			var hit := pick_at(camera.unproject_position(cell_position(Vector2i(x, y))), 1)
			var ok: bool = not hit.is_empty() and hit.collider.get_meta("cell") == Vector2i(x, y)
			result.cells.append({"x":x, "y":y, "hit":ok})
			if not ok:
				_fail("Unpickable grid cell")
				return
	var overview_position := camera.position
	var overview_rotation := camera.rotation
	var overview_size := camera.size
	for page: int in ceili(records.size() / 6.0):
		print("ART002_PAGE_START " + str(page + 1))
		_show_page(page)
		if fatal:
			return
		await get_tree().physics_frame
		await get_tree().process_frame
		if graphical:
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(folder + "/page-%02d.png" % (page + 1))
			if fatal or not FileAccess.file_exists(folder + "/page-%02d.png" % (page + 1)):
				_fail("Evidence write failed: page-%02d.png" % (page + 1))
				return
			written.append("page-%02d.png" % (page + 1))
			print("ART002_PAGE_SAVED " + str(page + 1))
		for i: int in heroes.size():
			var actor: Node3D = heroes[i]
			print("ART002_HERO_START %s/%s" % [actor.hero_id, actor.display_name])
			var original_position := actor.position
			# Hide other bodies during individual input testing, avoiding deliberate overlap.
			for other: Node3D in heroes:
				other.visible = other == actor
				other.get_node("SelectionBody").collision_layer = 2 if other == actor else 0
			await get_tree().physics_frame
			print("ART002_HERO_HIDDEN " + actor.hero_id)
			_select_hero((i + 1) % heroes.size())
			_click(camera.unproject_position(actor.position + Vector3(0, 0.8, 0)))
			print("ART002_HERO_CLICKED " + actor.hero_id)
			if selected_index != i:
				_fail("Actor input selection failed: " + actor.hero_id)
				return
			var destination := Vector2i(6, 0)
			_click(camera.unproject_position(cell_position(destination)))
			print("ART002_HERO_MOVE_CLICKED " + actor.hero_id)
			await get_tree().create_timer(original_position.distance_to(cell_position(destination)) / 1.7 + 0.2).timeout
			print("ART002_HERO_MOVED " + actor.hero_id)
			if selected_cell != destination or actor.position.distance_to(cell_position(destination)) > 0.01:
				_fail("Cell input movement failed: " + actor.hero_id)
				return
			actor.position = original_position
			actor.rotation = Vector3.ZERO
			camera.position = original_position + Vector3(2.7, 2.3, 5.5)
			camera.look_at(original_position + Vector3(0, 0.9, 0))
			camera.size = 3.7
			var skeleton := _skeleton(actor)
			if skeleton == null:
				_fail("Missing skeleton: " + actor.hero_id)
				return
			var record: Dictionary = records[page * 6 + i]
			var hero_result := {"id":actor.hero_id, "model_sha256":FileAccess.get_sha256(_asset_path(record.model)), "selected_by_input":true, "moved_by_input":true, "actions":[]}
			var sheet := Image.create(1440, 1200, false, Image.FORMAT_RGB8)
			var row := 0
			for action: String in ["idle", "walk", "attack", "hit"]:
				var clip: StringName = actor.clip_for(action)
				if clip.is_empty():
					_fail("Missing clip: " + actor.hero_id + "/" + action)
					return
				var player: AnimationPlayer = actor.animation_player
				var duration := player.get_animation(clip).length
				var poses: Array = []
				var column := 0
				for fraction: float in [0.2, 0.5, 0.8]:
					player.play(clip, 0)
					player.seek(duration * fraction, true)
					player.pause()
					await get_tree().process_frame
					poses.append(_pose(skeleton))
					status.text = "%s · %s · %.2fs" % [actor.display_name, action, duration * fraction]
					if graphical:
						await RenderingServer.frame_post_draw
						var image := get_viewport().get_texture().get_image()
						image.convert(Image.FORMAT_RGB8)
						image.resize(480, 300, Image.INTERPOLATE_LANCZOS)
						sheet.blit_rect(image, Rect2i(0, 0, 480, 300), Vector2i(column * 480, row * 300))
					column += 1
				var delta := 0.0
				for k: int in poses[0].size():
					delta = maxf(delta, absf(poses[0][k] - poses[1][k]))
					delta = maxf(delta, absf(poses[1][k] - poses[2][k]))
				if delta < 0.0001:
					_fail("Static imported bone poses: " + actor.hero_id + "/" + action)
					return
				hero_result.actions.append({"clip":action, "duration":duration, "sample_fractions":[0.2,0.5,0.8], "max_rotation_component_delta":delta})
				row += 1
			if graphical:
				sheet.save_png(folder + "/" + actor.hero_id + "-actions.png")
				if fatal or not FileAccess.file_exists(folder + "/" + actor.hero_id + "-actions.png"):
					_fail("Evidence write failed: " + actor.hero_id + "-actions.png")
					return
				written.append(actor.hero_id + "-actions.png")
			print("ART002_HERO_DONE " + actor.hero_id)
			result.heroes.append(hero_result)
			actor.play_action("idle")
			camera.position = overview_position
			camera.rotation = overview_rotation
			camera.size = overview_size
		for actor: Node3D in heroes:
			actor.visible = true
			actor.get_node("SelectionBody").collision_layer = 2
	result["batch"] = batch_id
	result["manifest_sha256"] = FileAccess.get_sha256(R7 + "batches/" + batch_id + ".json")
	result["review_script_sha256"] = FileAccess.get_sha256("res://godot/art_002/batch_review.gd")
	result["controller_sha256"] = FileAccess.get_sha256("res://godot/art_002/hero_sample.gd")
	result["world_model_sha256"] = FileAccess.get_sha256("res://assets/releases/ART-002/r6/models/liangshan_battlefield.glb")
	result["engine"] = Engine.get_version_info().string
	result["graphical"] = graphical
	result["viewport"] = [get_viewport().size.x, get_viewport().size.y]
	result["run_id"] = run_id
	_finish_evidence()
