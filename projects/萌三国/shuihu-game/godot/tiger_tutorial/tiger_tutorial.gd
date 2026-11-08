extends Node3D
## CMD-013 · 武松打虎教学闭环
##
## 一条完整闭环：
##   教学战（武松 vs 虎）→ 胜利必得武松 → 编队 → 携武松再战
##
## 玩法：固定站位回合制，点选目标与技能，不走格子。
##   普攻     +25 怒气，18 伤害
##   虎影重击  消耗 50 怒气，35 伤害；武松出拳，猛虎虚影扑向目标（象征威势，不是宠物）
##
## 资产说明（重要）
##   武松 = assets/releases/ART-002/r10/models/wusong.glb
##          （hero-014，真实资产；r10 是从 r6 真实 .blend 另存的新版本：
##           去掉了双戒刀几何，新增无刀拳击 punch 与虎影重击 tiger_shadow）
##   虎   = assets/releases/ART-002/r12/models/tiger.glb（原创分件 Q 版猛虎，真实资产）
##          r12 = r11 造型不变 + 新增 defeat（败退/倒地，非血腥）动作；r11 保留未动
##   虎影 = 同一只虎的半透明金色版本（象征威势，不是跟随的宠物）
##
## 启动：
##   Godot --path . res://godot/tiger_tutorial/tiger_tutorial.tscn
##   ... -- --scratch-save      用本次专属新档试玩（不影响正式存档）
##   ... -- --test-save        用本次专属新档（测试用）
##   ... -- --auto-demo        自动演示一局（录屏用，本次专属新档）
##   ... -- --auto-flow        自动跑完「打虎→招募→编队」并正常退出
##                              **使用正式存档 user://save.json**（不切到专属新档），
##                              专供跨进程保存/加载验收用。
##   ... -- --auto-full        自动跑完「打虎→招募→编队→再战」整条链（演示用）
##   ... -- --music            启动即播放战斗音乐（默认关闭）
##   ... -- --demo-lose        失败→重试演示
##   ... -- --quit-after 20    指定秒数后退出
##
## 存档安全（重要，CMD-014 r4 收敛版 + CMD-017 再收敛）
##   · 本脚本**没有任何删除存档的代码路径**，也没有任何「重置存档」的入口。
##   · **没有 --save-path**：存档路径不能由外部指定，杜绝路径别名绕过。
##   · **没有 --reset-save**：想从头玩就用 --scratch-save（每次生成全新存档）。
##   · 正式存档 user://save.json 只允许正常流程写入（招募/编队），永不重置。
##
## 【CMD-017】演示模式一律用**本次专属新档**，不用记得加 --scratch-save：
##   --auto-full / --showcase / --demo-lose / --auto-demo 单独跑都不会碰正式档。
##   --auto-flow 是**例外**：它只给隔离验收副本用，
##   不在隔离环境（user 数据目录仍是正式档目录）时**直接拒绝执行**，退出码 3。
##
## 音乐（CMD-016）
##   · 用项目**自有原创**曲目 assets/releases/AUDIO-002/audio/battle-spirited.wav
##     （《并辔出山》，本项目自制，无第三方素材、无下载）。
##   · **默认关闭**，需玩家手动点「音乐」或加 --music 才响；不替换网页端默认曲。

const WUSONG_MODEL := "res://assets/releases/ART-002/r10/models/wusong.glb"
const TIGER_MODEL := "res://assets/releases/ART-002/r12/models/tiger.glb"
const SAVE_USER := "user://save.json"          # 正式存档：只允许正常写入，永不重置
# 试玩/演示/测试一律使用「本次运行专属目录」，且**每次运行都生成唯一文件名**，
# 绝不与正式存档或历史存档共用同一个文件。
const SAVE_SESSION_DIR := "user://sessions"

# 【CMD-017】所有「演示/试玩」模式：单独跑也不会碰正式存档。
# 之前漏了 --auto-full / --showcase / --demo-lose，单独跑会走正式档（演示污染）。
const DEMO_SAVE_FLAGS := [
	"--scratch-save", "--test-save", "--auto-demo",
	"--auto-full", "--showcase", "--demo-lose",
]

# 人物收集信息（与 data/shuihu.js 的 108 将座次表一致；
# 数值一致性由测试 A16h 直接比对数据文件，改数据必须同步改这里）
const WUSONG_NAME := "武松"
const WUSONG_BYNAME := "行者"
const WUSONG_STAR := "天伤星"
const WUSONG_SEAT := 14
const WUSONG_BLURB := "景阳冈打虎闻名，近身格斗强悍。"
const HERO_TOTAL := 108

# 音乐：项目自有原创曲目（AUDIO-002《并辔出山》），默认关，不替换网页端默认曲
const MUSIC := "res://assets/releases/AUDIO-002/audio/battle-spirited.wav"

# 目标标记尺寸（不抢人物：小金圈 + 小箭头）
const MARK_RING_INNER := 0.34
const MARK_RING_OUTER := 0.42
const MARK_ARROW_RADIUS := 0.060
const MARK_ARROW_HEIGHT := 0.15
const MARK_ARROW_Y := 1.26

# 武松肖像：优先用**当前 r10 模型渲染**的图（蓝衣无刀，与场上造型一致）；
# 旧 2D 立绘（红衣双刀）不改文件，只作为取不到模型渲染时的退路。
const WUSONG_MODEL_PORTRAIT := "res://assets/releases/ART-002/r10/portraits/wusong_portrait.png"
const WUSONG_PORTRAIT := "res://assets/q/wusong-portrait.png"
const WUSONG_PORTRAIT_FALLBACK := "res://assets/portraits/hero-014.png"
const WUSONG_PORTRAIT_REGION := Rect2(225, 115, 585, 840)

# 战斗数值（集中定义，测试直接读）
const PLAYER_MAX_HP := 120
const PUNCH_DAMAGE := 18
const TIGER_SHADOW_DAMAGE := 35
const TIGER_DAMAGE := 12
const RAGE_MAX := 100
const RAGE_GAIN := 25
const RAGE_COST := 50

# 动作名（r10 新增的无刀拳击动作；r6 原有 attack 是双刀挥砍，不用在这里）
# 进程启动时刻（类加载时固定）：同一进程内多次调用 _resolve_save_path() 结果一致，
# 不同进程则不同 → 场景内重启仍能读到自己的存档，并发运行互不干扰。
static var _process_start_usec: int = Time.get_ticks_usec()

const ANIM_PUNCH := "punch"
const ANIM_TIGER_SHADOW := "tiger_shadow"

# 两场战斗的敌人配置
const BATTLES := [
	{"name": "吊睛白额大虫", "hp": 80, "damage": 12},
	{"name": "景阳冈猛虎", "hp": 120, "damage": 16},
]

const DIALOGUES := {
	"intro": [
		"景阳冈。日头偏西，林子里忽然起了一阵腥风。",
		"武松把哨棒往地上一顿：来得正好。",
		"看那猛虎额上的王字纹，正是吊睛白额大虫。它脚下有一圈金光，那就是你现在要打的人。",
		"点它可以重新锁定目标。怒气攒到一半，就能使出「虎影重击」——武松亲自出拳，猛虎虚影随之扑出。",
	],
	"win1": [
		"猛虎低吼一声，伏在地上喘气，慢慢退进林子里。",
		"武松：这厮倒也凶猛。",
	],
	"recruit": [
		"武松：既如此，便与你走一遭。",
	],
	"lineup": [
		"把他放进出战位，下一战由他上阵。",
	],
	"battle2": [
		"林子深处又窜出一只更大的。",
		"武松：来得好。",
	],
	"win2": [
		"第二只也退了。武松把哨棒扛上肩。",
	],
	"lose": [
		"武松退了半步。这一战没打赢。",
	],
}

# ---- 运行时状态（测试直接读这些字段）----
var phase := "intro"          # intro / battle / recruit / lineup / done
var turn := "player"          # player / enemy
var busy := false             # 防重入：行动结算中为 true
var battle_index := 0         # 0 = 教学战，1 = 第二战
var player_hp := PLAYER_MAX_HP
var enemy_hp := 0
var enemy_max_hp := 0
var rage := 0
var actions_resolved := 0     # 实际结算次数（测试防重入用）
var save_data := {}
var save_path := SAVE_USER
var _session_save_path := ""     # 本进程专属新档（同一进程内固定）
var last_result := ""

# ---- 节点 ----
var wusong: Node3D
var wusong_anim: AnimationPlayer
var tiger: Node3D
var tiger_body: Node3D
var tiger_model: Node3D      # 真实虎模型节点（r11）
var tiger_anim: AnimationPlayer
var camera: Camera3D
var ground_mesh: MeshInstance3D
var ui_layer: CanvasLayer
var hud_panel: PanelContainer
var label_phase: Label
var label_hp: Label
var label_rage: Label
var label_target: Label
var label_ready: Label
var label_hint: Label
var banner_ready: Panel
var bar_hp: ProgressBar
var bar_rage: ProgressBar
var btn_punch: Button
var btn_shadow: Button
var btn_next: Button
var btn_retry: Button
var btn_lineup: Button
var dialog_panel: PanelContainer
var dialog_text: Label
var dialog_queue: Array = []
var dialog_after: Callable

# 目标标记：脚下金圈 + 头顶金箭头
var target_ring: MeshInstance3D
var target_arrow: MeshInstance3D
var target_marker_mat: StandardMaterial3D
var target_selected := false
var _tiger_fade_mats: Array = []   # 虎的淡出材质副本（每只虎一份）

# 招募展示（人物收集）
var recruit_panel: PanelContainer
var recruit_portrait: TextureRect
var recruit_name: Label
var recruit_meta: Label
var recruit_blurb: Label
var recruit_progress: Label
var btn_recruit: Button
var summary_panel: PanelContainer
var summary_text: Label

# 音乐（项目自有原创曲目，默认关）
var audio_player: AudioStreamPlayer
var btn_music: Button
var _music_on := false

var _ui_time := 0.0
var _hint_text := ""
var _hint_timer := 0.0
var _shot_hold := false      # 关键截图进行中：自动流程别急着关界面
var _auto_full := false        # --auto-full：跑完整条链（战斗→招募→编队→再战）

var _shadow_shot_done := false
var _punch_shot_done := false
var _showcase := false          # 演示模式：慢镜头逐阶段截图
var _showcase_stage := "0"
var _showcase_shot := ""
var _demo := false
var _demo_lose := false
var _demo_lose_done := false
var _demo_step := 0
var _demo_timer := 0.0
var _auto_flow := false         # --auto-flow：自动跑完闭环（正式存档模式）
var _flow_completed := false
var _auto_step := 0.8           # 自动推进的节拍间隔（秒）


func _ready() -> void:
	# ---- 早退分支 1：只渲染武松肖像，不进游戏、不碰任何存档 ----
	if _has_arg("--render-portrait"):
		await _render_portrait(_arg_value("--render-portrait"))
		get_tree().quit(0)
		return

	# ---- 早退分支 2：--auto-flow 只允许在隔离副本里执行 ----
	# 不在隔离环境 = user 数据目录还是正式档目录，--auto-flow 会写真档 → 直接拒绝，
	# **不读写任何存档**，退出码 3（非 0，外部脚本能判失败）。
	if OS.get_cmdline_user_args().has("--auto-flow") and not _isolation_ready():
		push_error("[FLOW] REFUSED：--auto-flow 只能在隔离验收副本里执行；"
			+ "当前 user 目录 %s 仍是正式档目录，已拒绝执行（未读写任何存档）"
			% OS.get_user_data_dir())
		print("[FLOW] REFUSED: 未处于隔离环境，拒绝执行")
		get_tree().quit(3)
		return

	save_path = _resolve_save_path()
	_demo = OS.get_cmdline_user_args().has("--auto-demo")
	_demo_lose = OS.get_cmdline_user_args().has("--demo-lose")
	_showcase = OS.get_cmdline_user_args().has("--showcase")
	_auto_flow = OS.get_cmdline_user_args().has("--auto-flow")
	_auto_full = OS.get_cmdline_user_args().has("--auto-full")
	if _auto_flow or _auto_full:
		# 自动流程要把对话快点推完，但战斗节奏仍由动作时长决定
		_auto_step = 0.3
	_load_save()
	_build_world()
	if not _spawn_wusong():
		return
	_build_ui()
	if OS.get_cmdline_user_args().has("--music"):
		_set_music(true)
	_print_environment()
	if _auto_flow:
		print("[FLOW] 自动流程开始：存档=%s，已拥有=%s"
			% [save_path, save_data.get("owned", [])])
	if _auto_full:
		print("[DEMO] 连续演示开始：战斗 → 招募 → 编队 → 再战")
	_show_dialogue("intro", _on_intro_done)
	await _auto_shot("00-intro")

	if OS.get_cmdline_user_args().has("--quit-after"):
		var secs := float(_arg_value("--quit-after", "20"))
		await get_tree().create_timer(secs).timeout
		if (_auto_flow or _auto_full) and not _flow_completed:
			# 没跑完就不能算成功——退出码非 0，让外部脚本能判定失败
			push_error("[FLOW] 超时：自动流程未跑完")
			get_tree().quit(2)
		else:
			get_tree().quit(0)


func _arg_value(name: String, fallback: String = "") -> String:
	var args := OS.get_cmdline_user_args()
	var i := args.find(name)
	if i >= 0 and i + 1 < args.size():
		return args[i + 1]
	return fallback


func _has_arg(name: String) -> bool:
	return OS.get_cmdline_user_args().has(name)


## 解析本次使用的存档路径（CMD-014 r4 收敛版 + CMD-017 再收敛）。
##
## 规则（CMD-017 之后）：
##   · **任何演示/试玩模式一律走本次专属新档**（user://sessions/session_<pid>_<usec>.json）：
##       --scratch-save / --test-save / --auto-demo / --auto-full / --showcase / --demo-lose
##     单独跑这些参数**不会**碰正式存档，不必再记着加 --scratch-save。
##   · **不加任何参数** = 正常游玩 → 正式存档 user://save.json（只允许招募/编队的正常写入）。
##   · **--auto-flow** 是唯一的例外：它只给**隔离验收副本**用。
##     不在隔离环境时**拒绝执行**（见 _ready 的隔离检查），退出码 3。
##
## 设计原则：
##   --save-path   已移除——外部不能指定路径，杜绝别名绕过
##   --reset-save  已移除——想从头玩就用 --scratch-save（每次生成全新存档）
func _resolve_save_path() -> String:
	return _resolve_save_path_for(OS.get_cmdline_user_args())


## 路径解析的纯函数版本（CMD-017）：参数与结果都能被测试直接调用。
func _resolve_save_path_for(args: Array) -> String:
	for f in DEMO_SAVE_FLAGS:
		if args.has(f):
			if _session_save_path == "":
				_session_save_path = "%s/session_%d_%d.json" % [
					SAVE_SESSION_DIR, OS.get_process_id(), _process_start_usec]
			return _session_save_path
	return SAVE_USER


## 正式工程的 user 数据目录尾巴（…/Godot/app_userdata/<项目名>）。
## 隔离副本会用 override.cfg 把它换成另一个目录名，于是这条尾巴不见了。
func _default_user_dir_suffix() -> String:
	var pname := str(ProjectSettings.get_setting("application/config/name", ""))
	if pname == "":
		return ""
	return "Godot/app_userdata/%s" % pname


## 当前是否处于**隔离环境**（user 数据目录已改掉，不是正式档目录）
func _isolation_ready() -> bool:
	return _is_isolated_user_dir(OS.get_user_data_dir())


func _is_isolated_user_dir(dir_path: String) -> bool:
	var suffix := _default_user_dir_suffix()
	if suffix == "":
		return false
	return not dir_path.ends_with(suffix)


## 按阶段自动截图（--shots <目录>）。
## 为什么不用「录完视频再抽帧」：--write-movie 的视频时间轴与游戏逻辑时间不同步，
## 抽出来的帧可能对应错误的状态。游戏内截图保证画面与状态一一对应。
func _auto_shot(tag: String) -> void:
	if not _has_arg("--shots"):
		return
	var dir_path := _arg_value("--shots")
	if dir_path == "":
		return
	# 等这一帧真的画完；但**最多等 0.5 秒**——
	# 窗口被别的窗口盖住时 macOS 会暂停渲染，frame_post_draw 可能一直不触发，
	# 之前的证据抓图就是这么挂到超时的。
	# 注意必须用 frame_post_draw（绘制之后），process_frame 在绘制之前，会取到旧帧。
	var drawn := false
	var cb := func(): drawn = true
	RenderingServer.frame_post_draw.connect(cb, CONNECT_ONE_SHOT)
	await get_tree().create_timer(0.5).timeout
	if RenderingServer.frame_post_draw.is_connected(cb):
		RenderingServer.frame_post_draw.disconnect(cb)
	if not drawn:
		push_warning("[SHOT] %s：这一帧没有在 0.5 秒内绘制完成，用的是上一帧画面" % tag)
	await get_tree().create_timer(0.08).timeout
	var img := get_viewport().get_texture().get_image()
	img.save_png(dir_path.path_join("%s.png" % tag))
	print("[SHOT] %s → %s.png" % [tag, dir_path])


func _print_environment() -> void:
	print("[ENV] " + JSON.stringify({
		"display_server": DisplayServer.get_name(),
		"gpu_adapter": RenderingServer.get_video_adapter_name(),
		"window_size": DisplayServer.window_get_size(),
		"rendering_method": ProjectSettings.get_setting(
			"rendering/renderer/rendering_method", "?"),
		"godot": Engine.get_version_info().get("string", "?"),
		"pid": OS.get_process_id(),
		"save_path": save_path,
	}))


# ---------------------------------------------------------------- 存档

func _load_save() -> void:
	save_data = {"owned": [], "lineup": [], "tutorial_done": false}
	if not FileAccess.file_exists(save_path):
		return
	var f := FileAccess.open(save_path, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	if parsed is Dictionary:
		save_data = parsed
		save_data["owned"] = save_data.get("owned", [])
		save_data["lineup"] = save_data.get("lineup", [])
		save_data["tutorial_done"] = save_data.get("tutorial_done", false)


func _save() -> void:
	# 先确保本次专属目录存在——FileAccess 不会自动建目录，
	# 目录不存在时 open() 返回 null，写入会**静默失败**。
	var dir_path := save_path.get_base_dir()
	if dir_path != "":
		DirAccess.make_dir_recursive_absolute(
			ProjectSettings.globalize_path(dir_path))
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(save_data, "  "))
		f.close()
		print("[SAVE] 已写入 %s（owned=%s lineup=%s）"
			% [save_path, save_data["owned"], save_data["lineup"]])
	else:
		push_error("存档写入失败：%s" % save_path)


func owns_wusong() -> bool:
	return "wusong" in save_data.get("owned", [])


# ---------------------------------------------------------------- 场景

func _build_world() -> void:
	camera = Camera3D.new()
	# 侧面偏 3/4 视角：既能看清角色正面，也能看清出拳的横向位移
	# 机位在击打轴（X 轴）的侧方：这样「拳沿 +X 冲出」在画面里是横向位移，能看清。
	# 略偏向武松一侧，让武松占画面左 1/3、虎占右 1/3。
	camera.position = Vector3(-0.55, 1.38, 4.3)
	add_child(camera)
	camera.look_at(Vector3(-0.30, 0.70, 0.0), Vector3.UP)
	camera.fov = 50.0

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50.0, -30.0, 0.0)
	sun.light_energy = 1.3
	add_child(sun)

	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.09, 0.10, 0.13)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.55, 0.57, 0.64)
	e.ambient_light_energy = 0.95
	env.environment = e
	add_child(env)

	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(18.0, 9.0)
	ground.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.17, 0.19, 0.16)
	mat.roughness = 0.95
	ground.material_override = mat
	add_child(ground)
	ground_mesh = ground


## 渲染武松肖像（CMD-017）：用**当前 r10 模型**（蓝衣、无刀）渲染一张与场上造型
## 一致的肖像，替换招募卡里那张「红衣双刀」的旧 2D 立绘。
## 旧立绘文件不动，只是不再当招募卡主图。
func _render_portrait(out_path: String) -> void:
	if out_path == "":
		push_error("[PORTRAIT] 缺少输出路径")
		get_tree().quit(2)
		return
	_build_world()
	if not _spawn_wusong():
		get_tree().quit(1)
		return
	# 取景：3/4 侧脸（用与战场同一个 60° 朝向），人物占满画面
	var yaw := deg_to_rad(60.0)
	var front := Vector3(sin(yaw), 0.0, cos(yaw))
	var focus := wusong.global_position + Vector3(0.0, 1.02, 0.0)
	var cam := Camera3D.new()
	add_child(cam)
	cam.position = focus + front * 3.9 + Vector3(0.0, 0.16, 0.0)
	cam.look_at(focus, Vector3.UP)
	cam.fov = 34.0
	cam.current = true
	if ground_mesh:
		ground_mesh.visible = false      # 地面不抢镜
	if wusong_anim:
		wusong_anim.play("idle")
	# 等模型与动画稳定几帧再拍
	for i in range(6):
		await get_tree().process_frame
	await get_tree().create_timer(0.25).timeout
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var err := img.save_png(out_path)
	if err != OK:
		push_error("[PORTRAIT] 写图失败：%s（%d）" % [out_path, err])
		get_tree().quit(1)
		return
	print("[PORTRAIT] 已渲染武松肖像（r10 模型）：%s（%dx%d）"
		% [out_path, img.get_width(), img.get_height()])


func _spawn_wusong() -> bool:
	if not ResourceLoader.exists(WUSONG_MODEL):
		push_error("武松模型不存在：%s" % WUSONG_MODEL)
		return false
	var packed := load(WUSONG_MODEL) as PackedScene
	if packed == null:
		return false
	wusong = packed.instantiate() as Node3D
	wusong.scale = Vector3.ONE * 0.76
	wusong.position = Vector3(-1.9, 0.0, 0.0)
	# 模型正面是局部 +Z（实测：面部顶点 z>0，四向对照图 docs/evidence/CMD-014/facing/）。
	# Godot 绕 Y 正向旋转是顺时针，所以要转 **-90°** 才让正面朝 +X（敌人方向）——
	# 用 +90° 会背对敌人，拳也打向反方向。
	# 朝向（实测标定，见 godot/tests/facing_calc.gd，两个指标一起看）：
	#   rot.y= 60° → 出拳屏幕横向占比 0.52（拳明显往右挥） + 脸朝镜头 0.50（半张脸可见）
	#   rot.y=135° → 横向 0.96 但脸朝镜头 -0.71（完全背对）
	#   rot.y= 30° → 横向 0.03（拳朝镜头，看不出「挥」的动作）
	# 取 60°：挥拳可读性与角色辨识度的平衡点。
	# 注意 Godot 绕 Y 正向是顺时针，符号别搞反。
	wusong.rotation_degrees = Vector3(0.0, 60.0, 0.0)
	add_child(wusong)
	wusong_anim = _find_anim(wusong)
	if wusong_anim:
		for a in ["idle", "walk"]:
			var anim := wusong_anim.get_animation(a)
			if anim:
				anim.loop_mode = Animation.LOOP_LINEAR
		for a2 in ["attack", "hit", ANIM_PUNCH, ANIM_TIGER_SHADOW]:
			var anim2 := wusong_anim.get_animation(a2)
			if anim2:
				anim2.loop_mode = Animation.LOOP_NONE
		# r10 必须带无刀拳击动作，缺了就明确报错（不能静默退回双刀 attack）
		for need in [ANIM_PUNCH, ANIM_TIGER_SHADOW]:
			if wusong_anim.get_animation(need) == null:
				push_error("模型缺少拳击动作 %s：%s 不是无刀拳击版" % [need, WUSONG_MODEL])
				return false
		wusong_anim.play("idle")
	return true


func _find_anim(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for c in node.get_children():
		var f := _find_anim(c)
		if f:
			return f
	return null


## 程序化虎：身体 + 头 + 四腿 + 尾巴 + 耳。全库没有虎资产，这是占位。
func _build_tiger() -> void:
	tiger = Node3D.new()
	tiger.name = "Tiger"
	tiger.position = Vector3(1.9, 0.0, 0.0)
	tiger.rotation_degrees = Vector3(0.0, -60.0, 0.0)  # 与武松对称：虎头朝镜头偏左、面向武松
	add_child(tiger)
	_tiger_fade_mats = []   # 新的一只虎，重新准备淡出材质

	# 真实虎模型（r11，原创分件 Q 版猛虎）
	if ResourceLoader.exists(TIGER_MODEL):
		var packed := load(TIGER_MODEL) as PackedScene
		var inst := packed.instantiate() as Node3D
		inst.scale = Vector3.ONE * 0.76
		tiger.add_child(inst)
		tiger_model = inst
		tiger_anim = _find_anim(inst)
		if tiger_anim:
			for a in ["idle", "walk"]:
				var anim := tiger_anim.get_animation(a)
				if anim:
					anim.loop_mode = Animation.LOOP_LINEAR
			for a2 in ["pounce", "hit"]:
				var anim2 := tiger_anim.get_animation(a2)
				if anim2:
					anim2.loop_mode = Animation.LOOP_NONE
			tiger_anim.play("idle")
	else:
		push_error("虎模型不存在：%s" % TIGER_MODEL)
		_build_tiger_fallback()

	tiger_body = Node3D.new()
	tiger.add_child(tiger_body)

	# 点击选目标用的碰撞体（射线检测）
	var body := StaticBody3D.new()
	body.name = "TigerHitbox"
	var shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = Vector3(2.0, 1.4, 1.0)
	shape.shape = box_shape
	shape.position = Vector3(0.0, 0.55, 0)
	body.add_child(shape)
	tiger.add_child(body)

	_build_target_marker()
	_select_target()


## 目标标记：脚下小金圈 + 头顶小箭头
## 尺寸刻意压小（见 MARK_* 常量）：标记只说明「打的是谁」，不能抢人物的戏。
func _build_target_marker() -> void:
	if tiger == null:
		return
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.88, 0.58, 0.45)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.82, 0.42)
	mat.emission_energy_multiplier = 0.40
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA

	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = MARK_RING_INNER
	torus.outer_radius = MARK_RING_OUTER
	torus.rings = 24
	torus.ring_segments = 8
	ring.mesh = torus
	ring.material_override = mat
	ring.position = Vector3(0.0, 0.04, 0.0)
	tiger.add_child(ring)

	var arrow := MeshInstance3D.new()
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = MARK_ARROW_RADIUS
	cone.height = MARK_ARROW_HEIGHT
	cone.radial_segments = 12
	arrow.mesh = cone
	arrow.material_override = mat
	arrow.rotation_degrees = Vector3(180.0, 0.0, 0.0)
	arrow.position = Vector3(0.0, MARK_ARROW_Y, 0.0)
	tiger.add_child(arrow)

	target_ring = ring
	target_arrow = arrow
	target_marker_mat = mat


## 锁定当前目标（场上只有一只虎，锁定即高亮）
func _select_target() -> void:
	target_selected = true
	if battle_index < BATTLES.size():
		print("[TARGET] 已锁定目标：%s" % BATTLES[battle_index]["name"])
	_update_hud()


## 顶部提示条：给一句话指引（不塞实现术语）
func _flash_hint(msg: String) -> void:
	_hint_text = msg
	_hint_timer = 2.4


## 虎模型缺失时的兜底（只占位，不作为交付形态）
func _build_tiger_fallback() -> void:
	var fur := StandardMaterial3D.new()
	fur.albedo_color = Color(0.78, 0.42, 0.12)
	fur.roughness = 0.85
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.14, 0.10, 0.08)
	_add_box(tiger_body, Vector3(1.55, 0.72, 0.62), Vector3(0, 0.42, 0), fur)
	_add_box(tiger_body, Vector3(0.55, 0.52, 0.52), Vector3(0, 0.82, 0), fur)
	for sx in [-0.55, 0.55]:
		for sz in [-0.22, 0.22]:
			_add_box(tiger_body, Vector3(0.18, 0.52, 0.18), Vector3(sx, 0.13, sz), fur)
	for i in range(3):
		_add_box(tiger_body, Vector3(0.06, 0.5, 0.64), Vector3(-0.35 + i * 0.35, 0.5, 0), dark)


func _add_box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mi.mesh = box
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi


## 球体（虎影的头、鬃毛、关节用）
func _add_sphere(parent: Node3D, radius: float, pos: Vector3, mat: Material,
		scale_y: float = 1.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var sph := SphereMesh.new()
	sph.radius = radius
	sph.height = radius * 2.0
	mi.mesh = sph
	mi.material_override = mat
	mi.position = pos
	mi.scale = Vector3(1.0, scale_y, 1.0)
	parent.add_child(mi)
	return mi


# ---------------------------------------------------------------- UI

# 界面文案原则（CMD-015）：
#   · 只说玩家关心的事（血量、怒气、目标、能不能放大招），不塞实现术语
#   · 字号够大、描边够粗，3D 背景上也要一眼看清
#   · 目标必须一眼可见（脚下金圈 + 头顶金箭头 + 文字确认）

const UI_BG := Color(0.04, 0.05, 0.07, 0.74)
const UI_TEXT := Color(0.97, 0.95, 0.90)
const UI_GOLD := Color(1.0, 0.84, 0.40)
const UI_HINT := Color(1.0, 0.72, 0.34)


func _build_ui() -> void:
	ui_layer = CanvasLayer.new()
	add_child(ui_layer)

	var font := FontFile.new()
	for p in ["/System/Library/Fonts/PingFang.ttc",
			"/System/Library/Fonts/Supplemental/Songti.ttc"]:
		if FileAccess.file_exists(p) and font.load_dynamic_font(p) == OK:
			break

	_build_hud_panel(font)
	_build_action_area(font)
	_build_recruit_card(font)
	_build_summary_panel(font)
	_build_dialog(font)
	_update_hud()
	_set_buttons_enabled(false)


## 左上角状态面板：半透明深底 + 粗描边，保证压在 3D 画面上也读得清
func _build_hud_panel(font: FontFile) -> void:
	hud_panel = PanelContainer.new()
	hud_panel.position = Vector2(24, 16)
	var sb := StyleBoxFlat.new()
	sb.bg_color = UI_BG
	sb.set_corner_radius_all(14)
	sb.set_content_margin_all(16)
	sb.border_color = Color(0.85, 0.72, 0.42, 0.55)
	sb.set_border_width_all(2)
	hud_panel.add_theme_stylebox_override("panel", sb)
	ui_layer.add_child(hud_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	hud_panel.add_child(vb)

	label_phase = _make_label(font, 30)
	vb.add_child(label_phase)

	label_hp = _make_label(font, 23)
	vb.add_child(label_hp)
	bar_hp = _make_progress(PLAYER_MAX_HP, Color(0.85, 0.26, 0.22))
	vb.add_child(bar_hp)

	label_rage = _make_label(font, 23)
	vb.add_child(label_rage)
	bar_rage = _make_progress(RAGE_MAX, Color(0.95, 0.72, 0.20))
	vb.add_child(bar_rage)

	label_target = _make_label(font, 23)
	vb.add_child(label_target)


## 招募展示：打虎胜利后弹出的人物卡（强调「收集好汉」）
func _build_recruit_card(font: FontFile) -> void:
	recruit_panel = PanelContainer.new()
	recruit_panel.position = Vector2(620, 200)
	recruit_panel.custom_minimum_size = Vector2(840, 400)
	recruit_panel.visible = false
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.05, 0.06, 0.08, 0.95)
	sb.set_corner_radius_all(18)
	sb.set_content_margin_all(26)
	sb.border_color = Color(1.0, 0.80, 0.30, 0.95)
	sb.set_border_width_all(4)
	recruit_panel.add_theme_stylebox_override("panel", sb)
	ui_layer.add_child(recruit_panel)

	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 26)
	recruit_panel.add_child(hb)

	recruit_portrait = TextureRect.new()
	recruit_portrait.custom_minimum_size = Vector2(250, 330)
	recruit_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	recruit_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	hb.add_child(recruit_portrait)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 10)
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hb.add_child(vb)

	var title := _make_label(font, 26)
	title.text = "招募成功　获得武松"
	title.add_theme_color_override("font_color", UI_GOLD)
	vb.add_child(title)

	recruit_name = _make_label(font, 34)
	recruit_name.text = "%s · %s" % [WUSONG_BYNAME, WUSONG_NAME]
	vb.add_child(recruit_name)

	recruit_meta = _make_label(font, 22)
	recruit_meta.text = "%s　·　座次 %d / %d" % [WUSONG_STAR, WUSONG_SEAT, HERO_TOTAL]
	vb.add_child(recruit_meta)

	recruit_blurb = _make_label(font, 20)
	recruit_blurb.text = ""
	recruit_blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	recruit_blurb.custom_minimum_size = Vector2(460, 56)
	vb.add_child(recruit_blurb)

	recruit_progress = _make_label(font, 24)
	recruit_progress.text = "图鉴收集 0 / %d" % HERO_TOTAL
	recruit_progress.add_theme_color_override("font_color", UI_GOLD)
	vb.add_child(recruit_progress)

	btn_recruit = _make_button(font, "带上他", Vector2(0, 0), Vector2(220, 64))
	btn_recruit.pressed.connect(_on_recruit_confirmed)
	vb.add_child(btn_recruit)


## 演示收尾小结：这一趟收集到谁、编队是谁
func _build_summary_panel(font: FontFile) -> void:
	summary_panel = PanelContainer.new()
	summary_panel.position = Vector2(660, 360)
	summary_panel.custom_minimum_size = Vector2(700, 260)
	summary_panel.visible = false
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.05, 0.06, 0.08, 0.95)
	sb.set_corner_radius_all(18)
	sb.set_content_margin_all(24)
	sb.border_color = Color(0.85, 0.72, 0.42, 0.9)
	sb.set_border_width_all(3)
	summary_panel.add_theme_stylebox_override("panel", sb)
	ui_layer.add_child(summary_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 12)
	summary_panel.add_child(vb)

	var title := _make_label(font, 28)
	title.text = "这一趟走完了"
	title.add_theme_color_override("font_color", UI_GOLD)
	vb.add_child(title)

	summary_text = _make_label(font, 23)
	summary_text.text = ""
	summary_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary_text.custom_minimum_size = Vector2(640, 150)
	vb.add_child(summary_text)
func _build_action_area(font: FontFile) -> void:
	# 大招就绪横幅（怒气够时才出现）——放在顶部右侧，不挡战场
	banner_ready = Panel.new()
	banner_ready.position = Vector2(760, 56)
	banner_ready.size = Vector2(700, 68)
	banner_ready.visible = false
	var sb_banner := StyleBoxFlat.new()
	sb_banner.bg_color = Color(0.36, 0.24, 0.04, 0.90)
	sb_banner.set_corner_radius_all(12)
	sb_banner.border_color = Color(1.0, 0.80, 0.30, 0.95)
	sb_banner.set_border_width_all(3)
	banner_ready.add_theme_stylebox_override("panel", sb_banner)
	ui_layer.add_child(banner_ready)

	label_ready = _make_label(font, 27)
	label_ready.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	label_ready.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label_ready.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label_ready.add_theme_color_override("font_color", UI_GOLD)
	banner_ready.add_child(label_ready)

	# 操作提示条（点错地方时给一句话指引）
	label_hint = _make_label(font, 22)
	label_hint.position = Vector2(760, 136)
	label_hint.size = Vector2(700, 44)
	label_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label_hint.add_theme_color_override("font_color", UI_HINT)
	label_hint.visible = false
	ui_layer.add_child(label_hint)

	# 技能按钮（右下，避开画面右侧的猛虎）
	btn_punch = _make_button(font, "出拳  +25 怒气", Vector2(1180, 900), Vector2(350, 80))
	btn_punch.pressed.connect(func(): _player_action("punch"))
	ui_layer.add_child(btn_punch)

	btn_shadow = _make_button(font, "虎影重击  需 50 怒气", Vector2(1560, 900), Vector2(350, 80))
	btn_shadow.pressed.connect(func(): _player_action("tiger_shadow"))
	ui_layer.add_child(btn_shadow)

	# 音乐开关（右上角，默认关）
	btn_music = _make_button(font, "音乐：关", Vector2(1700, 20), Vector2(190, 56))
	btn_music.pressed.connect(_on_music_pressed)
	ui_layer.add_child(btn_music)

	audio_player = AudioStreamPlayer.new()
	audio_player.volume_db = -12.0
	# 导入设置里 loop 是关的（*.import 不入库），所以这里手动续播
	audio_player.finished.connect(func():
		if _music_on and audio_player:
			audio_player.play())
	ui_layer.add_child(audio_player)

	# 流程按钮（下方居中）
	btn_next = _make_button(font, "继续", Vector2(795, 900), Vector2(330, 80))
	btn_next.pressed.connect(_on_next_pressed)
	ui_layer.add_child(btn_next)

	btn_retry = _make_button(font, "再来一次", Vector2(795, 900), Vector2(330, 80))
	btn_retry.pressed.connect(_on_retry_pressed)
	btn_retry.visible = false
	ui_layer.add_child(btn_retry)

	btn_lineup = _make_button(font, "就位，出战", Vector2(795, 900), Vector2(330, 80))
	btn_lineup.pressed.connect(_on_lineup_confirmed)
	btn_lineup.visible = false
	ui_layer.add_child(btn_lineup)


func _build_dialog(font: FontFile) -> void:
	dialog_panel = PanelContainer.new()
	dialog_panel.position = Vector2(120, 600)
	dialog_panel.custom_minimum_size = Vector2(1180, 160)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.03, 0.04, 0.06, 0.86)
	sb.set_corner_radius_all(14)
	sb.set_content_margin_all(18)
	sb.border_color = Color(0.85, 0.72, 0.42, 0.45)
	sb.set_border_width_all(2)
	dialog_panel.add_theme_stylebox_override("panel", sb)
	ui_layer.add_child(dialog_panel)
	dialog_text = _make_label(font, 25)
	dialog_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dialog_text.custom_minimum_size = Vector2(1140, 124)
	dialog_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	dialog_panel.add_child(dialog_text)


func _make_label(font: FontFile, size: int, pos: Vector2 = Vector2.ZERO) -> Label:
	var l := Label.new()
	l.position = pos
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", UI_TEXT)
	# 深色描边：3D 背景上也要看得清
	l.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.92))
	l.add_theme_constant_override("outline_size", maxi(4, size / 4))
	return l


func _make_progress(max_v: float, fill: Color) -> ProgressBar:
	var b := ProgressBar.new()
	b.max_value = max_v
	b.show_percentage = false
	b.custom_minimum_size = Vector2(460, 22)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.09, 0.10, 0.12, 0.95)
	bg.set_corner_radius_all(6)
	bg.border_color = Color(0.0, 0.0, 0.0, 0.65)
	bg.set_border_width_all(2)
	b.add_theme_stylebox_override("background", bg)
	var fg := StyleBoxFlat.new()
	fg.bg_color = fill
	fg.set_corner_radius_all(6)
	b.add_theme_stylebox_override("fill", fg)
	return b


func _btn_style(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(12)
	sb.border_color = border
	sb.set_border_width_all(3)
	sb.set_content_margin_all(10)
	return sb


func _make_button(font: FontFile, text: String, pos: Vector2, box: Vector2) -> Button:
	var b := Button.new()
	b.text = text
	b.position = pos
	b.size = box
	b.custom_minimum_size = box
	b.add_theme_font_override("font", font)
	b.add_theme_font_size_override("font_size", 22)
	b.add_theme_color_override("font_color", Color(1.0, 0.97, 0.90))
	b.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 0.96))
	b.add_theme_color_override("font_pressed_color", Color(1.0, 0.92, 0.66))
	b.add_theme_color_override("font_disabled_color", Color(0.60, 0.60, 0.64))
	b.add_theme_stylebox_override("normal",
		_btn_style(Color(0.20, 0.13, 0.07, 0.92), Color(0.85, 0.68, 0.35, 0.85)))
	b.add_theme_stylebox_override("hover",
		_btn_style(Color(0.30, 0.19, 0.09, 0.96), Color(1.0, 0.83, 0.42, 1.0)))
	b.add_theme_stylebox_override("pressed",
		_btn_style(Color(0.44, 0.29, 0.10, 0.98), Color(1.0, 0.90, 0.55, 1.0)))
	b.add_theme_stylebox_override("disabled",
		_btn_style(Color(0.12, 0.12, 0.14, 0.82), Color(0.40, 0.40, 0.44, 0.70)))
	b.add_theme_stylebox_override("focus",
		_btn_style(Color(0, 0, 0, 0), Color(1.0, 0.85, 0.45, 0.95)))
	return b


func _update_hud() -> void:
	if label_phase == null:
		return
	var names := ["教学战", "第二战"]
	var title := ""
	if phase == "battle":
		title = names[clampi(battle_index, 0, 1)]
	elif phase == "recruit":
		title = "招募"
	elif phase == "lineup":
		title = "编队"
	else:
		title = "序"
	if phase == "battle":
		label_phase.text = "%s　·　%s" % [title, "你的回合" if turn == "player" else "对方出手中"]
	else:
		label_phase.text = title

	# 只有场上还有虎时才显示它的血量——虎败退之后就只剩武松了
	if phase == "battle" and enemy_max_hp > 0:
		label_hp.text = "武松 生命 %d / %d　　猛虎 生命 %d / %d" % [
			player_hp, PLAYER_MAX_HP, enemy_hp, enemy_max_hp]
	else:
		label_hp.text = "武松 生命 %d / %d" % [player_hp, PLAYER_MAX_HP]
	bar_hp.value = player_hp
	bar_hp.max_value = PLAYER_MAX_HP

	var ready_now := rage >= RAGE_COST
	if ready_now:
		label_rage.text = "怒气 %d / %d　★ 虎影重击就绪" % [rage, RAGE_MAX]
		label_rage.add_theme_color_override("font_color", UI_GOLD)
	else:
		label_rage.text = "怒气 %d / %d　（虎影重击还差 %d）" % [
			rage, RAGE_MAX, RAGE_COST - rage]
		label_rage.add_theme_color_override("font_color", UI_TEXT)
	bar_rage.value = rage
	bar_rage.max_value = RAGE_MAX

	# 按钮文案跟着怒气实时变（文案只讲「够不够」，不讲回合）
	if btn_shadow:
		btn_shadow.text = "虎影重击  -50 怒气" if ready_now else "虎影重击  需 50 怒气"

	# 目标：一眼看清打的是谁
	if phase == "battle" and tiger != null and battle_index < BATTLES.size():
		label_target.text = "目标：%s（已锁定）" % BATTLES[battle_index]["name"]
		label_target.add_theme_color_override("font_color", UI_GOLD)
	else:
		label_target.text = "目标：——"
		label_target.add_theme_color_override("font_color", Color(0.74, 0.74, 0.78))

	# 大招就绪横幅：只在能放大招时出现
	if banner_ready:
		banner_ready.visible = ready_now and phase == "battle"
	if label_ready:
		label_ready.text = "★ 虎影重击就绪　按右侧「虎影重击」出手"

	# 招募阶段：战斗按钮与怒气/目标都失效了，收起来，
	# 让画面只剩「获得武松 → 带上他」这一件事。
	var recruiting := (phase == "recruit")
	for c in [btn_punch, btn_shadow, label_rage, bar_rage, label_target]:
		if c:
			c.visible = not recruiting


func _set_buttons_enabled(on: bool) -> void:
	if btn_punch == null:
		return
	var can_punch := on and not busy and turn == "player" and phase == "battle"
	btn_punch.disabled = not can_punch
	btn_shadow.disabled = not (can_punch and rage >= RAGE_COST)


## 音乐开关（默认关；用项目自有原创曲目，不引入任何下载素材）
func _on_music_pressed() -> void:
	_set_music(not _music_on)


func _set_music(on: bool) -> void:
	_music_on = on
	if btn_music:
		btn_music.text = "音乐：开" if on else "音乐：关"
	if not on:
		if audio_player:
			audio_player.stop()
		print("[AUDIO] 音乐关")
		return
	if audio_player == null:
		return
	if not ResourceLoader.exists(MUSIC):
		push_warning("音乐文件缺失：%s" % MUSIC)
		return
	audio_player.stream = load(MUSIC)
	audio_player.volume_db = -12.0
	audio_player.play()
	print("[AUDIO] 音乐开：%s" % MUSIC)


# ---------------------------------------------------------------- 对话

func _show_dialogue(key: String, after: Callable) -> void:
	dialog_queue = (DIALOGUES.get(key, []) as Array).duplicate()
	dialog_after = after
	dialog_panel.visible = true
	_set_buttons_enabled(false)
	_advance_dialogue()


func _advance_dialogue() -> void:
	if dialog_queue.is_empty():
		dialog_panel.visible = false
		var cb := dialog_after
		dialog_after = Callable()
		if cb.is_valid():
			cb.call()
		return
	dialog_text.text = dialog_queue.pop_front()
	btn_next.visible = true


func _on_next_pressed() -> void:
	btn_next.visible = false
	_advance_dialogue()


func _on_intro_done() -> void:
	_start_battle(0)


# ---------------------------------------------------------------- 战斗

func _start_battle(index: int) -> void:
	battle_index = index
	phase = "battle"
	turn = "player"
	busy = false
	last_result = ""
	player_hp = PLAYER_MAX_HP
	rage = 0
	enemy_max_hp = BATTLES[index]["hp"]
	enemy_hp = enemy_max_hp
	if tiger:
		tiger.queue_free()
	_build_tiger()
	if wusong_anim:
		wusong_anim.play("idle")
	btn_retry.visible = false
	btn_lineup.visible = false
	btn_next.visible = false
	_set_buttons_enabled(true)
	_update_hud()
	print("[BATTLE] 开始第 %d 战：%s（HP %d）" % [index + 1, BATTLES[index]["name"], enemy_hp])
	await _auto_shot("01-tutorial-battle" if index == 0 else "04-second-battle")
	if index == 1:
		_show_dialogue("battle2", func(): _set_buttons_enabled(true))


## 玩家行动。busy 为 true 时直接返回——这是防重入的关键。
func _player_action(skill: String) -> void:
	if busy or turn != "player" or phase != "battle":
		return
	if skill == "tiger_shadow" and rage < RAGE_COST:
		return
	busy = true
	_set_buttons_enabled(false)
	actions_resolved += 1

	var damage := 0
	if skill == "punch":
		rage = mini(rage + RAGE_GAIN, RAGE_MAX)
		damage = PUNCH_DAMAGE
		print("[ACTION] 普攻 伤害 %d，怒气 +%d → %d" % [damage, RAGE_GAIN, rage])
		_play_wusong(ANIM_PUNCH)
		# 出拳瞬间截图（punch 前冲最明显的时刻）
		if _has_arg("--shot-punch") and not _punch_shot_done:
			_punch_shot_done = true
			# 实测 punch 前冲峰值在 t≈0.40s（hand.R z: -0.04 → 0.34）
			await get_tree().create_timer(0.40).timeout
			await RenderingServer.frame_post_draw
			var shot := get_viewport().get_texture().get_image()
			shot.save_png(_arg_value("--shot-punch"))
			print("[SHOT] 出拳截图：%s" % _arg_value("--shot-punch"))
		elif _showcase and _showcase_shot == "":
			# 第一次普攻 = 蓄力帧（动作刚起、拳还在引，t=0.10s）
			_showcase_shot = "windup"
			await get_tree().create_timer(0.10).timeout
			await _auto_shot("10-windup")
		elif _showcase and _showcase_shot == "windup":
			# 第二次普攻 = 出拳帧：t=0.22s 手臂挥到一半明显离体；t=0.40s 完全伸出
			_showcase_shot = "punch"
			await get_tree().create_timer(0.22).timeout
			await _auto_shot("11-punch")
			await get_tree().create_timer(0.18).timeout
			await _auto_shot("11b-punch-extend")
		await get_tree().create_timer(0.45).timeout
	else:
		rage -= RAGE_COST
		damage = TIGER_SHADOW_DAMAGE
		print("[ACTION] 虎影重击 伤害 %d，怒气 -%d → %d" % [damage, RAGE_COST, rage])
		_play_wusong(ANIM_TIGER_SHADOW)
		await _spawn_tiger_shadow()
		if _showcase and _showcase_shot == "punch":
			# 命中帧：虎影已撞上目标
			await get_tree().create_timer(0.04).timeout
			await _auto_shot("12-tiger-hit")

	enemy_hp = maxi(0, enemy_hp - damage)
	_hit_tiger()
	_update_hud()
	print("[ACTION] 敌人 HP %d" % enemy_hp)

	if enemy_hp <= 0:
		await get_tree().create_timer(0.5).timeout
		_end_battle(true)
		return

	await get_tree().create_timer(0.35).timeout
	turn = "enemy"
	_update_hud()
	await _enemy_turn()


func _play_wusong(anim_name: String) -> void:
	if wusong_anim == null:
		return
	wusong_anim.stop()
	wusong_anim.play(anim_name)


func _hit_tiger() -> void:
	if tiger_anim:
		tiger_anim.stop()
		tiger_anim.play("hit")
	if tiger_body == null:
		return
	var tw := create_tween()
	tw.tween_property(tiger_body, "position", Vector3(-0.18, 0.0, 0.0), 0.08)
	tw.tween_property(tiger_body, "position", Vector3.ZERO, 0.12)


func _enemy_turn() -> void:
	if phase != "battle":
		return
	await get_tree().create_timer(0.6).timeout
	var dmg: int = BATTLES[battle_index]["damage"]
	player_hp = maxi(0, player_hp - dmg)
	print("[ACTION] 敌人反击 伤害 %d，武松 HP %d" % [dmg, player_hp])
	if wusong_anim:
		wusong_anim.stop()
		wusong_anim.play("hit")
	_update_hud()
	await get_tree().create_timer(0.7).timeout

	if player_hp <= 0:
		_end_battle(false)
		return

	turn = "player"
	busy = false
	if wusong_anim:
		wusong_anim.play("idle")
	_set_buttons_enabled(true)
	_update_hud()


## 虎影：武松身前浮出猛虎虚影，扑向目标后消散。象征威势，不是跟随宠物。
func _spawn_tiger_shadow() -> void:
	# 虎影 = **同一只虎**（r11）的半透明金色版本。
	# 它象征威势，不是跟随的宠物：扑出 → 撞上目标 → 爆开消散，不留在场上。
	var shadow := Node3D.new()
	shadow.name = "TigerShadow"
	shadow.position = Vector3(-1.05, 0.0, 0.0)
	add_child(shadow)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.82, 0.35, 0.55)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	var shadow_model: Node3D = null
	var shadow_anim: AnimationPlayer = null
	if ResourceLoader.exists(TIGER_MODEL):
		var packed := load(TIGER_MODEL) as PackedScene
		shadow_model = packed.instantiate() as Node3D
		shadow_model.scale = Vector3.ONE * 0.76
		# 半透明金色：遍历所有 MeshInstance3D 覆盖材质
		_apply_material(shadow_model, mat)
		shadow.add_child(shadow_model)
		shadow_anim = _find_anim(shadow_model)
		if shadow_anim:
			var pa := shadow_anim.get_animation("pounce")
			if pa:
				pa.loop_mode = Animation.LOOP_NONE
			shadow_anim.play("pounce")
	else:
		push_error("虎影缺少模型：%s" % TIGER_MODEL)

	# 扑向目标
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(shadow, "position", Vector3(1.45, 0.0, 0.0), 0.34) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

	# 虎影扑出途中的截图（只截第一次，避免被第二战覆盖）
	if not _shadow_shot_done:
		_shadow_shot_done = true
		await get_tree().create_timer(0.14).timeout
		if _has_arg("--shot-shadow"):
			await RenderingServer.frame_post_draw
			var shot := get_viewport().get_texture().get_image()
			shot.save_png(_arg_value("--shot-shadow"))
			print("[SHOT] 虎影截图：%s" % _arg_value("--shot-shadow"))
		await _auto_shot("02-tiger-shadow")

	await tw.finished

	# 扑到后爆开
	var tw2 := create_tween()
	tw2.set_parallel(true)
	tw2.tween_property(shadow, "scale", Vector3(1.5, 0.5, 1.5), 0.18)
	tw2.tween_property(shadow, "position:y", 0.10, 0.18)
	await tw2.finished
	shadow.queue_free()


## 把节点下所有 MeshInstance3D 的材质覆盖为指定材质
func _apply_material(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		(node as MeshInstance3D).material_override = mat
	for c in node.get_children():
		_apply_material(c, mat)


func _end_battle(won: bool) -> void:
	busy = true
	_set_buttons_enabled(false)
	if won:
		last_result = "win"
		print("[BATTLE] 胜利（第 %d 战）" % (battle_index + 1))
		await _tiger_defeat()
		await _auto_shot("06-victory-%d" % (battle_index + 1))
		if battle_index == 0:
			_show_dialogue("win1", _on_tutorial_won)
		else:
			_show_dialogue("win2", _on_battle2_won)
	else:
		last_result = "lose"
		print("[BATTLE] 失败（第 %d 战）" % (battle_index + 1))
		_show_dialogue("lose", func():
			btn_retry.visible = true
			_update_hud()
		)


## 虎败退/倒地：播 defeat 动作 → 扬尘 → 退入林子并淡出。
## 全程**无血、无伤口、无尸体**——虎是野兽，败退离场。
func _tiger_defeat() -> void:
	if tiger == null:
		return
	if tiger_anim and tiger_anim.get_animation("defeat"):
		tiger_anim.stop()
		tiger_anim.play("defeat")
		print("[DEFEAT] 猛虎败退")
	else:
		push_warning("虎缺少 defeat 动作，退化为直接淡出")
	_spawn_dust()
	await get_tree().create_timer(1.1).timeout
	if not is_instance_valid(tiger):
		return
	var mats := _tiger_fade_materials()
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(tiger, "position:x", tiger.position.x + 0.6, 1.3)
	for m in mats:
		tw.tween_property(m, "albedo_color:a", 0.0, 1.3)
	# 目标标记跟着一起消失——虎都退了，标记不能还杵在地上
	if target_marker_mat:
		tw.tween_property(target_marker_mat, "albedo_color:a", 0.0, 0.6)
	await tw.finished
	print("[DEFEAT] 猛虎已退入林子")


## 落地轻尘（无血腥元素）
func _spawn_dust() -> void:
	if tiger == null:
		return
	var dust := Node3D.new()
	dust.name = "Dust"
	add_child(dust)
	dust.global_position = tiger.global_position
	dust.global_position.y = 0.05
	for i in range(6):
		var puff := MeshInstance3D.new()
		var r := 0.09 + 0.03 * float(i % 3)
		var sph := SphereMesh.new()
		sph.radius = r
		sph.height = r * 1.6
		puff.mesh = sph
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.60, 0.54, 0.42, 0.45)
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		puff.material_override = mat
		puff.position = Vector3(randf_range(-0.40, 0.40), 0.05, randf_range(-0.22, 0.22))
		dust.add_child(puff)
		var tw := create_tween()
		tw.set_parallel(true)
		tw.tween_property(puff, "scale", Vector3(2.0, 1.1, 2.0), 0.9)
		tw.tween_property(mat, "albedo_color:a", 0.0, 0.9)
	var tw2 := create_tween()
	tw2.tween_interval(1.3)
	tw2.tween_callback(dust.queue_free)


## 让整只虎可以淡出：复制材质并打开透明。
## 必须复制——直接改原资源会连带影响下一战的虎和虎影。
## 幂等：第二次调用直接返回上次的副本，不会把已经淡到透明的材质重新置回不透明。
func _tiger_fade_materials() -> Array:
	if not _tiger_fade_mats.is_empty():
		return _tiger_fade_mats
	var mats: Array = []
	if tiger_model:
		_collect_fade_materials(tiger_model, mats)
	_tiger_fade_mats = mats
	return mats


func _collect_fade_materials(node: Node, mats: Array) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var src: Material = mi.material_override
		if src == null and mi.mesh:
			src = mi.mesh.surface_get_material(0)
		if src is StandardMaterial3D:
			var dup := (src as StandardMaterial3D).duplicate() as StandardMaterial3D
			dup.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			dup.albedo_color.a = 1.0
			mi.material_override = dup
			mats.append(dup)
	for c in node.get_children():
		_collect_fade_materials(c, mats)


func _on_retry_pressed() -> void:
	btn_retry.visible = false
	_start_battle(battle_index)


func _on_tutorial_won() -> void:
	# 胜利必得武松，且只发一次
	if not owns_wusong():
		save_data["owned"].append("wusong")
		save_data["tutorial_done"] = true
		_save()
		print("[RECRUIT] 武松加入队伍（首次）")
		if _auto_flow:
			print("[FLOW] 招募完成：武松已入队")
		await _auto_shot("03-recruit")
	else:
		print("[RECRUIT] 武松已在队伍中，不重复发放")
		if _auto_flow:
			print("[FLOW] 读回存档：已拥有武松，未重复发放")
	_show_dialogue("recruit", _show_recruit_card)


## 展示招募人物卡：谁入队了、图鉴到第几位、出战位放谁
func _show_recruit_card() -> void:
	if recruit_panel == null:
		return
	phase = "recruit"
	var owned: Array = save_data.get("owned", [])
	recruit_progress.text = "图鉴收集 %d / %d" % [owned.size(), HERO_TOTAL]
	recruit_blurb.text = WUSONG_BLURB
	# 肖像：优先「r10 模型渲染图」（与场上造型一致），退路才是旧的 2D 立绘
	if ResourceLoader.exists(WUSONG_MODEL_PORTRAIT):
		recruit_portrait.texture = load(WUSONG_MODEL_PORTRAIT)
	elif ResourceLoader.exists(WUSONG_PORTRAIT):
		var atlas := AtlasTexture.new()
		atlas.atlas = load(WUSONG_PORTRAIT)
		atlas.region = WUSONG_PORTRAIT_REGION
		recruit_portrait.texture = atlas
	elif ResourceLoader.exists(WUSONG_PORTRAIT_FALLBACK):
		recruit_portrait.texture = load(WUSONG_PORTRAIT_FALLBACK)
	else:
		push_warning("找不到武松肖像")
	recruit_panel.visible = true
	# 先上闸门再淡入：否则自动流程会在淡入途中把卡关掉，截图就拍成了编队画面
	_shot_hold = true
	recruit_panel.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(recruit_panel, "modulate:a", 1.0, 0.35)
	print("[RECRUIT] 展示人物卡：%s · %s（图鉴 %d/%d）"
		% [WUSONG_BYNAME, WUSONG_NAME, owned.size(), HERO_TOTAL])
	# 等淡入结束再截图，否则截到的是半透明的中间帧
	await tw.finished
	await _auto_shot("03b-recruit-card")
	_shot_hold = false


## 确认收下 → 进入编队
func _on_recruit_confirmed() -> void:
	if recruit_panel:
		recruit_panel.visible = false
	phase = "lineup"
	_show_dialogue("lineup", func():
		btn_lineup.visible = true
		_update_hud()
	)


## 第二战胜利 → 收尾小结
func _on_battle2_won() -> void:
	phase = "done"
	_update_hud()
	await _show_summary()
	if _auto_full:
		_flow_completed = true
		print("[DEMO] 整条链跑完：战斗 → 招募 → 编队 → 再战")
		print("[DEMO] DONE")
		await get_tree().create_timer(1.5).timeout
		get_tree().quit(0)


## 小结面板：这一趟收集到谁、图鉴进度、出战位
func _show_summary() -> void:
	if summary_panel == null:
		return
	var owned: Array = save_data.get("owned", [])
	var owned_names := PackedStringArray()
	for h in owned:
		owned_names.append(_hero_display_name(h))
	var lineup_names := PackedStringArray()
	for h in save_data.get("lineup", []):
		lineup_names.append(_hero_display_name(h))
	summary_text.text = "打虎 → 招募 → 编队 → 再战，全通。\n" \
		+ "新收集：%s\n" % ("、".join(owned_names) if owned_names.size() > 0 else "（无）") \
		+ "图鉴进度：%d / %d\n" % [owned.size(), HERO_TOTAL] \
		+ "出战位：%s" % ("、".join(lineup_names) if lineup_names.size() > 0 else "（空）")
	summary_panel.visible = true
	summary_panel.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(summary_panel, "modulate:a", 1.0, 0.4)
	await tw.finished
	await _auto_shot("07-summary")


## 好汉 id → 玩家看得懂的名字（当前只有武松；以后加角色时在这里补表）
func _hero_display_name(hero_id: String) -> String:
	if hero_id == "wusong":
		return "%s · %s" % [WUSONG_BYNAME, WUSONG_NAME]
	return hero_id


func _on_lineup_confirmed() -> void:
	if "wusong" not in save_data["lineup"]:
		save_data["lineup"].append("wusong")
	_save()
	btn_lineup.visible = false
	print("[LINEUP] 出战位：%s" % [save_data["lineup"]])
	if _auto_flow:
		# 自动流程到此为止：存档已落盘，进程正常退出（退出码 0）
		_flow_completed = true
		print("[FLOW] 编队完成，存档已写入：%s" % save_path)
		print("[FLOW] DONE")
		get_tree().quit(0)
		return
	await _auto_shot("05-lineup")
	_start_battle(1)


# ---------------------------------------------------------------- 自动演示

func _process(delta: float) -> void:
	_ui_time += delta
	# 目标金箭头上下浮动 + 大招横幅呼吸 + 提示条计时
	if target_arrow and is_instance_valid(target_arrow):
		target_arrow.position.y = MARK_ARROW_Y + sin(_ui_time * 3.2) * 0.06
	if banner_ready and banner_ready.visible:
		banner_ready.modulate.a = 0.80 + 0.20 * sin(_ui_time * 5.0)
	if label_hint:
		if _hint_timer > 0.0:
			_hint_timer -= delta
			label_hint.visible = true
			label_hint.text = _hint_text
		else:
			label_hint.visible = false
	# HUD 每帧刷新，否则血量/回合/标题会停在上一次结算的时刻
	if phase == "battle" or phase == "recruit" or phase == "lineup":
		_update_hud()
	if not _demo and not _demo_lose and not _showcase and not _auto_flow and not _auto_full:
		return
	_demo_timer += delta
	if _demo_timer < _auto_step:
		return
	# 有对话就推进（任何阶段）
	if dialog_panel.visible:
		_on_next_pressed()
		_demo_timer = 0.0
		return
	# 招募人物卡：自动点「带上他」（关键截图进行中时先不关）
	if recruit_panel and recruit_panel.visible and not _shot_hold:
		_on_recruit_confirmed()
		_demo_timer = 0.0
		return
	# ---- 展示模式（--showcase）：明确编排「蓄力→出拳→虎扑命中→收招」 ----
	# 每一拍都是一次玩家行动，阶段推进与截图点严格对应：
	#   1) 蓄力拳（拍蓄力帧）
	#   2) 出拳（拍挥拳中段 + 完全伸出）
	#   3) 攒怒气的第二拳
	#   4) 虎影重击（拍虎影扑出 + 命中）
	#   5) 收招
	if _showcase:
		if dialog_panel.visible:
			_on_next_pressed()
			_demo_timer = 0.0
			return
		if phase != "battle" or turn != "player" or busy:
			_demo_timer = 0.0
			return
		match _showcase_stage:
			"0":
				_showcase_stage = "1"
				_demo_timer = 0.0
			"1":
				# 第一拳：只拍蓄力帧（不拍出拳帧）
				_showcase_stage = "2"
				_player_action("punch")
				_demo_timer = 0.0
			"2":
				# 等第一拳结算完
				_showcase_stage = "3"
				_demo_timer = 0.0
			"3":
				# 第二拳：拍挥拳中段 + 完全伸出
				_showcase_stage = "4"
				_player_action("punch")
				_demo_timer = 0.0
			"4":
				_showcase_stage = "5"
				_demo_timer = 0.0
			"5":
				# 怒气够了 → 虎影重击
				if rage >= RAGE_COST:
					_showcase_stage = "6"
					_player_action("tiger_shadow")
				else:
					_player_action("punch")
				_demo_timer = 0.0
			"6":
				_showcase_stage = "7"
				_demo_timer = 0.0
			"7":
				# 收招帧：虎影已消散、动作结束
				await get_tree().create_timer(0.30).timeout
				await _auto_shot("13-recover")
				_showcase_stage = "8"
				_demo_timer = 0.0
			_:
				_demo_timer = 0.0
		return

	# ---- 失败演示（--demo-lose）：站着不打，让敌人把自己打死，再点重试 ----
	# 必须放在普通战斗分支**之前**，否则会被自动普攻抢先。
	if _demo_lose:
		if phase == "battle":
			if last_result == "lose" and btn_retry.visible:
				if not _demo_lose_done:
					_demo_lose_done = true
					print("[DEMO-LOSE] 失败判定已触发，准备点重试")
					await _auto_shot("08-lose-defeat")
				btn_retry.visible = false
				_start_battle(battle_index)
				print("[DEMO-LOSE] 已执行重试，回到第 %d 战" % (battle_index + 1))
				_demo_timer = 0.0
				return
			# 放弃回合：把回合交给敌人，自己站着挨打，直到被打死
			if turn == "player" and not busy:
				turn = "enemy"
				busy = true
				_demo_timer = 0.0
				await _enemy_turn()
				_demo_timer = 0.0
				return
			_demo_timer = 0.0
			return
	# 战斗：怒气够放重击，不够普攻
	if phase == "battle" and turn == "player" and not busy:
		if rage >= RAGE_COST:
			_player_action("tiger_shadow")
		else:
			_player_action("punch")
		_demo_timer = 0.0
		return
	# 编队：自动确认
	if phase == "lineup" and btn_lineup.visible:
		_on_lineup_confirmed()
		_demo_timer = 0.0
		return


func _unhandled_input(event: InputEvent) -> void:
	# 鼠标左键点猛虎 = 锁定目标（场上只有一只，点中即高亮）
	# 用 _unhandled_input 而不是 _input：点界面按钮会被 GUI 先消费，
	# 不会走到这里，避免按按钮时误弹「没点中猛虎」的提示。
	if not (event is InputEventMouseButton):
		return
	var mb := event as InputEventMouseButton
	if not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	if phase != "battle" or tiger == null or camera == null:
		return
	var from := camera.project_ray_origin(mb.position)
	var dir := camera.project_ray_normal(mb.position)
	var to := from + dir * 40.0
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, to)
	var hit := space.intersect_ray(q)
	if hit and tiger.is_ancestor_of(hit.collider):
		_select_target()
		_flash_hint("已锁定：%s" % BATTLES[battle_index]["name"])
	else:
		_flash_hint("没点中猛虎——点画面里脚踩金圈的猛虎")
