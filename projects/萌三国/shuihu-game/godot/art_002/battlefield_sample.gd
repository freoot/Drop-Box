extends Node3D
## Standalone ART-002 art review scene. Presentation state only; no save or damage API.
signal cell_selected(cell: Vector2i)
const HeroSample = preload("res://godot/art_002/hero_sample.gd")
const RELEASE := "res://assets/releases/ART-002/r6/"
const SPECS := [
	["hero-006", "豹子头 · 林冲", "linchong", Vector2i(1, 1)],
	["hero-001", "及时雨 · 宋江", "songjiang", Vector2i(2, 2)],
	["hero-059", "一丈青 · 扈三娘", "husanniang", Vector2i(5, 2)],
	["hero-014", "行者 · 武松", "wusong", Vector2i(2, 1)],
	["hero-013", "花和尚 · 鲁智深", "luzhishen", Vector2i(4, 2)],
	["hero-003", "智多星 · 吴用", "wuyong", Vector2i(3, 1)]
]
var heroes: Array[Node3D] = []
var selected_index: int = 0
var selected_cell := Vector2i(-1, -1)
var camera: Camera3D
var status: Label
var selection_ring: MeshInstance3D
var cell_marker: MeshInstance3D
var inspection: Dictionary = {"clicks": [], "actions": [], "frames": []}
var elapsed: float = 0.0
var capture_mode: bool = false
var capture_step: int = 0

func _ready() -> void:
	name = "LiangshanArtSample"
	capture_mode = "--art-capture" in OS.get_cmdline_user_args()
	_setup_world()
	var environment_root := load_model(RELEASE + "models/liangshan_battlefield.glb")
	environment_root.name = "EditableBattlefield"
	add_child(environment_root)
	_apply_water(environment_root)
	_build_cells()
	for spec: Array in SPECS:
		var actor := Node3D.new()
		actor.set_script(HeroSample)
		actor.hero_id = spec[0]
		actor.display_name = spec[1]
		actor.model_scene = packed_model(RELEASE + "models/" + spec[2] + ".glb")
		actor.position = cell_position(spec[3])
		actor.rotation.y = 0
		add_child(actor)
		heroes.append(actor)
		actor.action_changed.connect(_action_changed)
	var props := load_model(RELEASE + "models/weapons_and_props.glb")
	props.name = "WeaponAndItemDisplay"
	# Front-left land strip of the diorama, clear of the 32 playable tiles.
	props.position = Vector3(-4.2, 0.03, 3.5)
	props.scale = Vector3.ONE * 0.55
	add_child(props)
	selection_ring = _ring(Color("e7c65e"), 0.47)
	selection_ring.name = "SelectedHeroRing"
	add_child(selection_ring)
	cell_marker = _ring(Color("e9ead1"), 0.55)
	cell_marker.name = "SelectedCellMarker"
	cell_marker.visible = false
	add_child(cell_marker)
	_build_ui()
	_select_hero(0)
	get_viewport().size_changed.connect(_fit_camera)
	_fit_camera()
	if capture_mode:
		_capture_sequence()

func load_model(path: String) -> Node3D:
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var error := document.append_from_file(ProjectSettings.globalize_path(path), state)
	if error != OK:
		push_error("Cannot load ART002 GLB %s: %s" % [path, error])
		return Node3D.new()
	return document.generate_scene(state)

func _apply_water(node: Node) -> void:
	if node is MeshInstance3D and String(node.name).begins_with("WaterBasin"):
		var material := ShaderMaterial.new()
		material.shader = load("res://godot/art_002/water.gdshader")
		node.material_override = material
	for child: Node in node.get_children():
		_apply_water(child)

func packed_model(path: String) -> PackedScene:
	var model := load_model(path)
	var packed := PackedScene.new()
	packed.pack(model)
	model.free()
	return packed

func _setup_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("72aaa8")
	sky_material.sky_horizon_color = Color("d1ddbe")
	sky_material.ground_horizon_color = Color("9ebbaa")
	sky_material.ground_bottom_color = Color("4f8c88")
	sky.sky_material = sky_material
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("b5cfcd")
	env.ambient_light_energy = 0.25
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var world := WorldEnvironment.new()
	world.environment = env
	add_child(world)
	var sun := DirectionalLight3D.new()
	sun.name = "WarmAfternoonSun"
	sun.rotation_degrees = Vector3(-52, -35, 0)
	sun.light_color = Color("fff0cc")
	sun.light_energy = 0.65
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 45
	sun.shadow_bias = 0.035
	add_child(sun)
	var bounce := DirectionalLight3D.new()
	bounce.name = "NonShadowGroundFill"
	bounce.rotation = sun.rotation + Vector3(PI, 0, 0)
	bounce.light_color = Color("a6c8ad")
	bounce.light_energy = 0.08
	bounce.light_specular = 0.0
	bounce.shadow_enabled = false
	add_child(bounce)
	camera = Camera3D.new()
	camera.name = "ReviewCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.position = Vector3(10, 14, 17)
	add_child(camera)
	camera.look_at(Vector3(0, 0, 0))
	camera.current = true
	camera.far = 100

func _fit_camera() -> void:
	var viewport := get_viewport().get_visible_rect().size
	var aspect := viewport.x / maxf(viewport.y, 1)
	camera.size = maxf(15.2, 17.5 / aspect)

func cell_position(cell: Vector2i) -> Vector3:
	return Vector3((cell.x - 3.5) * 1.2, 0.065, -(cell.y - 1.5) * 1.2)

func _build_cells() -> void:
	var cells := Node3D.new()
	cells.name = "CellColliders"
	add_child(cells)
	for y: int in 4:
		for x: int in 8:
			var body := StaticBody3D.new()
			body.name = "Cell_%d_%d" % [x, y]
			body.collision_layer = 1
			body.collision_mask = 0
			body.position = cell_position(Vector2i(x, y))
			body.set_meta("cell", Vector2i(x, y))
			var shape := CollisionShape3D.new()
			var box := BoxShape3D.new()
			box.size = Vector3(1.18, 0.08, 1.18)
			shape.shape = box
			body.add_child(shape)
			cells.add_child(body)

func _ring(color: Color, radius: float) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = radius - 0.025
	torus.outer_radius = radius
	torus.rings = 32
	torus.ring_segments = 8
	mesh.mesh = torus
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material_override = mat
	return mesh

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.name = "ReviewControls"
	add_child(layer)
	var top := PanelContainer.new()
	top.position = Vector2(18, 16)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("203f3beb")
	style.corner_radius_top_left = 12
	style.corner_radius_top_right = 12
	style.corner_radius_bottom_left = 12
	style.corner_radius_bottom_right = 12
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	top.add_theme_stylebox_override("panel", style)
	layer.add_child(top)
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Hiragino Sans GB", "Heiti SC", "PingFang SC"])
	theme.default_font = font
	top.theme = theme
	var column := VBoxContainer.new()
	top.add_child(column)
	var title := Label.new()
	title.text = "梁山泊 · 芦苇渡   /   ART-002 六人战场样板"
	title.add_theme_font_size_override("font_size", 22)
	column.add_child(title)
	status = Label.new()
	status.add_theme_font_size_override("font_size", 15)
	column.add_child(status)
	var controls := HBoxContainer.new()
	column.add_child(controls)
	for i: int in SPECS.size():
		var b := Button.new()
		b.text = String(SPECS[i][1])
		b.pressed.connect(_select_hero.bind(i))
		controls.add_child(b)
	var actions := HBoxContainer.new()
	column.add_child(actions)
	for spec: Array in [["idle", "待机 1"], ["walk", "移动 2"], ["attack", "攻击 3"], ["hit", "受击 4"]]:
		var button := Button.new()
		button.text = spec[1]
		button.pressed.connect(_play_selected.bind(spec[0]))
		actions.add_child(button)
	var info := Label.new()
	info.text = "点角色选人 · 点棋格演示移动 · Tab 切换角色 · 1–4 动作\n表现样板不结算伤害或保存进度；外围景物不参与棋格点选。"
	info.add_theme_font_size_override("font_size", 13)
	column.add_child(info)

func _select_hero(index: int) -> void:
	selected_index = index
	status.text = String(SPECS[index][1]) + " · 统一脚底 / 地面接触 / 四动作"

func _play_selected(action: String) -> void:
	heroes[selected_index].play_action(action)

func _action_changed(hero_id: String, action: String) -> void:
	inspection.actions.append({"hero": hero_id, "action": action})

func pick_at(screen_position: Vector2, mask: int = 3) -> Dictionary:
	var from := camera.project_ray_origin(screen_position)
	var query := PhysicsRayQueryParameters3D.create(from, from + camera.project_ray_normal(screen_position) * 100, mask)
	return get_world_3d().direct_space_state.intersect_ray(query)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_TAB:
			_select_hero((selected_index + 1) % SPECS.size())
		elif event.keycode in [KEY_1, KEY_2, KEY_3, KEY_4]:
			_play_selected(["idle", "walk", "attack", "hit"][event.keycode - KEY_1])
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var hit := pick_at(event.position)
		if hit.is_empty():
			return
		var body: Object = hit.collider
		if body.has_meta("hero_id"):
			for i: int in heroes.size():
				if heroes[i].hero_id == body.get_meta("hero_id"):
					_select_hero(i)
		elif body.has_meta("cell"):
			selected_cell = body.get_meta("cell")
			inspection.clicks.append([selected_cell.x, selected_cell.y])
			cell_selected.emit(selected_cell)
			cell_marker.position = cell_position(selected_cell) + Vector3(0, 0.06, 0)
			cell_marker.visible = true
			heroes[selected_index].move_to(cell_position(selected_cell))

func _process(delta: float) -> void:
	elapsed += delta
	if selection_ring and not heroes.is_empty():
		selection_ring.position = heroes[selected_index].position + Vector3(0, 0.07, 0)

func _capture_sequence() -> void:
	await get_tree().create_timer(2).timeout
	var folder := ProjectSettings.globalize_path(RELEASE + "evidence")
	DirAccess.make_dir_recursive_absolute(folder)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(folder + "/godot-battlefield.png")
	# Real input events through the same handler; no move_to shortcut in the check.
	var hits: Array = []
	for y: int in 4:
		for x: int in 8:
			var target := cell_position(Vector2i(x, y))
			var point := camera.unproject_position(target)
			var hit := pick_at(point, 1)
			hits.append({"cell": [x,y], "hit": not hit.is_empty() and hit.collider.get_meta("cell") == Vector2i(x,y), "screen": [point.x,point.y]})
	inspection["all_32_cell_rays"] = hits
	var overview_position := camera.position
	var overview_rotation := camera.rotation
	var overview_size := camera.size
	for i: int in heroes.size():
		_select_hero(i)
		var anchor: Vector3 = heroes[i].position
		camera.position = anchor + Vector3(3.2, 2.8, 5.5)
		camera.look_at(anchor + Vector3(0, 0.85, 0))
		camera.size = 3.8
		for action: String in ["idle", "walk", "attack", "hit"]:
			_play_selected(action)
			await get_tree().create_timer(0.45).timeout
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(folder + "/%s-%s.png" % [String(SPECS[i][2]),action])
		_play_selected("idle")
	camera.position = overview_position
	camera.rotation = overview_rotation
	camera.size = overview_size
	await get_tree().process_frame
	var point := camera.unproject_position(cell_position(Vector2i(5, 1)))
	var click := InputEventMouseButton.new()
	click.position = point
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	get_viewport().push_input(click, true)
	await get_tree().create_timer(2).timeout
	inspection["input_selected_cell"] = [selected_cell.x,selected_cell.y]
	if selected_cell != Vector2i(5, 1):
		push_error("ART002 normal viewport input failed to select target cell")
		get_tree().quit(1)
		return
	inspection["moved_hero_position"] = [heroes[selected_index].position.x, heroes[selected_index].position.y, heroes[selected_index].position.z]
	inspection["draw_calls"] = Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
	inspection["objects"] = Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)
	inspection["engine"] = Engine.get_version_info().string
	inspection["viewport"] = [get_viewport().size.x,get_viewport().size.y]
	var file := FileAccess.open(folder + "/godot-results.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(inspection,"\t"))
	print("ART002_GODOT_CAPTURE_COMPLETE")
	get_tree().quit()
