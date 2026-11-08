extends Node3D
## ART-002 presentation sample: no gameplay, currency or save ownership.
signal selected(hero_id: String)
signal action_changed(hero_id: String, action: String)

@export var hero_id: String = "hero-006"
@export var display_name: String = "豹子头 · 林冲"
@export var model_scene: PackedScene
var animation_player: AnimationPlayer
var current_action: String = "idle"
var visual: Node3D
var move_tween: Tween

func _ready() -> void:
	if model_scene:
		visual = model_scene.instantiate()
		visual.name = "EditableModel"
		visual.scale = Vector3.ONE * 0.76
		add_child(visual)
		animation_player = _find_animation(visual)
	var body := StaticBody3D.new()
	body.name = "SelectionBody"
	body.collision_layer = 2
	body.collision_mask = 0
	body.set_meta("hero_id", hero_id)
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.34
	capsule.height = 1.55
	shape.shape = capsule
	shape.position.y = 0.78
	body.add_child(shape)
	add_child(body)
	play_action("idle")

func _find_animation(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child: Node in node.get_children():
		var found := _find_animation(child)
		if found:
			return found
	return null

func clip_for(action: String) -> StringName:
	if animation_player:
		for clip: StringName in animation_player.get_animation_list():
			if String(clip).get_file() == action or String(clip).ends_with(action):
				return clip
	return &""

func play_action(action: String) -> void:
	var clip := clip_for(action)
	if clip.is_empty():
		push_error("Missing imported action %s for %s" % [action, hero_id])
		return
	current_action = action
	var animation := animation_player.get_animation(clip)
	animation.loop_mode = Animation.LOOP_LINEAR if action in ["idle", "walk"] else Animation.LOOP_NONE
	animation_player.play(clip, 0.12)
	action_changed.emit(hero_id, action)
	if not animation_player.animation_finished.is_connected(_finished):
		animation_player.animation_finished.connect(_finished)

func _finished(_clip: StringName) -> void:
	if current_action in ["attack", "hit"]:
		play_action("idle")

func move_to(destination: Vector3) -> void:
	if move_tween and move_tween.is_running():
		move_tween.kill()
	var direction := destination - position
	if direction.length() < 0.05:
		return
	# GLB forward is +Z. Root heading follows the path instead of walking backwards.
	rotation.y = atan2(direction.x, direction.z)
	play_action("walk")
	move_tween = create_tween()
	move_tween.tween_property(self, "position", destination, maxf(0.5, direction.length() / 1.7))
	move_tween.tween_callback(play_action.bind("idle"))
