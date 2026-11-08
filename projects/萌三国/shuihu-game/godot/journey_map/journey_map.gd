extends Control

const STAGES: Array[Dictionary] = [
	{"id": 1, "position": Vector2(0.15, 0.70), "place": "梁山泊 · 芦苇渡", "leader": "巡粮哨长", "year": 1119, "goal": "守住粮道，击退试探的官军。"},
	{"id": 2, "position": Vector2(0.29, 0.28), "place": "汴京旧案 · 风雪官道", "leader": "高俅", "year": 1112, "goal": "突破追兵，避开首领蓄势区域。"},
	{"id": 3, "position": Vector2(0.43, 0.55), "place": "黄泥冈 · 松林古道", "leader": "押运队长", "year": 1114, "goal": "拆散押运队形，控制狭窄山路。"},
	{"id": 4, "position": Vector2(0.60, 0.25), "place": "独龙冈 · 祝家庄", "leader": "祝朝奉", "year": 1119, "goal": "先击破阵旗护卫，再攻庄主。"},
	{"id": 5, "position": Vector2(0.76, 0.51), "place": "曾头市 · 北地马场", "leader": "史文恭", "year": 1120, "goal": "被点名者及时转移，逼近箭台。"},
	{"id": 6, "position": Vector2(0.88, 0.77), "place": "江南 · 临溪石寨", "leader": "方腊", "year": 1121, "goal": "留住防护技能，应对半血号令。"}
]

@onready var route_nodes: Control = %RouteNodes
@onready var chapter_title: Label = %ChapterTitle
@onready var chapter_copy: Label = %ChapterCopy
@onready var begin_button: Button = %BeginButton

var selected_stage: int = 1
var stage_buttons: Array[Button] = []


func _ready() -> void:
	_build_stage_nodes()
	resized.connect(_layout_stage_nodes)
	begin_button.pressed.connect(_begin_selected_stage)
	_select_stage(1)
	_layout_stage_nodes()


func _build_stage_nodes() -> void:
	for stage: Dictionary in STAGES:
		var button := Button.new()
		button.name = "Stage%02d" % int(stage.id)
		button.text = "%d\n%s" % [int(stage.id), String(stage.place).get_slice(" · ", 1)]
		button.toggle_mode = true
		button.custom_minimum_size = Vector2(134, 76)
		button.add_theme_font_size_override("font_size", 20)
		button.pressed.connect(_select_stage.bind(int(stage.id)))
		route_nodes.add_child(button)
		stage_buttons.append(button)


func _layout_stage_nodes() -> void:
	var usable_size := route_nodes.size
	for index: int in stage_buttons.size():
		var marker := stage_buttons[index]
		var anchor: Vector2 = STAGES[index].position
		marker.position = Vector2(usable_size.x * anchor.x, usable_size.y * anchor.y) - marker.size * 0.5


func _select_stage(stage_id: int) -> void:
	selected_stage = clampi(stage_id, 1, STAGES.size())
	var stage: Dictionary = STAGES[selected_stage - 1]
	chapter_title.text = "%s · 公元 %d 年" % [stage.place, int(stage.year)]
	chapter_copy.text = "驻守：%s　目标：%s\n年代、行程与对话为游戏改编。" % [stage.leader, stage.goal]
	for index: int in stage_buttons.size():
		stage_buttons[index].button_pressed = index == selected_stage - 1


func _begin_selected_stage() -> void:
	var stage: Dictionary = STAGES[selected_stage - 1]
	chapter_copy.text = "已选择《%s》。完整版剧情与战斗目前在网页试玩版中运行。" % String(stage.place)
