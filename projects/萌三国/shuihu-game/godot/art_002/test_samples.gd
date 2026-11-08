extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var failures: Array[String] = []
	var packed := load("res://godot/art_002/battlefield_sample.tscn") as PackedScene
	if packed == null:
		push_error("ART002 scene failed to load")
		quit(1)
		return
	var sample := packed.instantiate()
	root.add_child(sample)
	await process_frame
	await physics_frame
	if sample.heroes.size() != 6:
		failures.append("expected six heroes")
	if not sample.has_node("CellColliders"):
		push_error("ART002 failed during scene setup")
		quit(1)
		return
	if sample.get_node("CellColliders").get_child_count() != 32:
		failures.append("expected all 32 cell colliders")
	for actor: Node3D in sample.heroes:
		for action: String in ["idle", "walk", "attack", "hit"]:
			if actor.clip_for(action).is_empty():
				failures.append("missing %s clip for %s" % [action,actor.hero_id])
			else:
				actor.play_action(action)
				await process_frame
		if absf(actor.position.y - 0.065) > 0.001:
			failures.append("foot anchor differs")
	for y: int in 4:
		for x: int in 8:
			var point: Vector2 = sample.camera.unproject_position(sample.cell_position(Vector2i(x,y)))
			var hit: Dictionary = sample.pick_at(point,1)
			if hit.is_empty() or hit.collider.get_meta("cell") != Vector2i(x,y):
				failures.append("unpickable cell %s" % Vector2i(x,y))
	if failures.is_empty():
		print("ART002_GODOT_TEST_OK: six heroes, twenty-four clips, 32 ray-picked cells")
		quit(0)
	else:
		for failure: String in failures:
			push_error(failure)
		quit(1)
