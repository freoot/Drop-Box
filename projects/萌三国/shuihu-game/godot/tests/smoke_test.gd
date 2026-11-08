extends SceneTree


func _init() -> void:
	var failures: Array[String] = []
	if not ResourceLoader.exists("res://assets/liangshan-journey-map.png"):
		failures.append("missing journey map texture")
	if not ResourceLoader.exists("res://godot/journey_map/journey_map.tscn"):
		failures.append("missing journey map scene")
	var packed := load("res://godot/journey_map/journey_map.tscn") as PackedScene
	if packed == null:
		failures.append("journey map scene failed to load")
	else:
		var scene := packed.instantiate()
		root.add_child(scene)
		await process_frame
		var route_nodes := scene.get_node_or_null("RouteNodes")
		if route_nodes == null or route_nodes.get_child_count() != 6:
			failures.append("expected six playable route nodes")
		scene.queue_free()
	if failures.is_empty():
		print("GODOT_SMOKE_OK: journey map scene and six route nodes loaded")
		quit(0)
	else:
		for failure: String in failures:
			push_error(failure)
		quit(1)
