extends SceneTree
## 逐帧抓 punch / tiger_shadow 动作序列，用于核对「真的在出拳」。
##
## 踩过的坑：
##  1) anim.seek(t, true) + advance(0.0) 不保证姿势已应用到骨骼（画面看着没动）。
##     改用 play() + 每帧手动推进，姿势才真的生效。
##  2) 出拳幅度约 0.34 单位（人高 2 单位，占 15%），远景缩略图里几乎看不出。
##     所以：镜头拉近到上半身 + 斜 45° 侧角，让「蓄力 → 前冲」看得出来。

const OUT_DIR := "res://docs/evidence/CMD-014/seq"
const MODEL := "res://assets/releases/ART-002/r10/models/wusong.glb"


func _initialize() -> void:
	var packed := load(MODEL) as PackedScene
	var inst := packed.instantiate() as Node3D
	root.add_child(inst)
	await create_timer(0.8).timeout

	# 斜 45° 侧角：既能看脸，也能看出拳的纵深
	inst.rotation_degrees = Vector3(0, 55, 0)
	inst.scale = Vector3.ONE * 0.8

	var cam := Camera3D.new()
	cam.position = Vector3(1.75, 1.35, 2.15)
	root.add_child(cam)
	cam.look_at(Vector3(0.0, 1.05, 0.0), Vector3.UP)
	cam.fov = 42.0

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45.0, -35.0, 0.0)
	light.light_energy = 1.5
	root.add_child(light)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20.0, 140.0, 0.0)
	fill.light_energy = 0.5
	root.add_child(fill)

	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.10, 0.11, 0.14)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.60, 0.62, 0.68)
	env.environment = e
	root.add_child(env)

	var anim := _find_anim(inst)
	if anim == null:
		print("没有 AnimationPlayer")
		quit(1)
		return

	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT_DIR))

	for clip in ["punch", "tiger_shadow"]:
		var frames := 25 if clip == "punch" else 33
		anim.play(clip)
		# 关键：play 之后每帧手动推进，姿势才会真正作用到骨骼
		for f in range(frames):
			anim.advance(1.0 / 24.0)
			if f % 3 != 0 and f != frames - 1:
				continue
			await create_timer(0.03).timeout
			await RenderingServer.frame_post_draw
			var img := root.get_texture().get_image()
			img.save_png("%s/%s-f%02d.png" % [OUT_DIR, clip, f + 1])
		print("[SEQ] %s 抓完 %d 帧" % [clip, frames])

	print("PUNCH_SEQ_OK")
	quit(0)


func _find_anim(n: Node) -> AnimationPlayer:
	if n is AnimationPlayer:
		return n as AnimationPlayer
	for c in n.get_children():
		var f := _find_anim(c)
		if f:
			return f
	return null
