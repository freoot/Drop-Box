extends SceneTree
## CMD-013 · 武松打虎教学闭环测试
##
## 覆盖验收 A1–A8：回合切换 / 怒气消耗 / 防重入 / 胜败重试 / 武松只奖励一次 /
## 编队与重启后持有 / 第二战使用武松 / 测试隔离存档。
##
## A9–A12（CMD-014 返修）：存档安全
##   A9  --reset-save 不删不改正式存档
##   A10 --auto-demo 不污染正式存档
##   A11 失败重试不改正式存档
##   A12 场景源码里不存在任何删除存档的调用
##   全部用**字节哈希**（sha256+长度）比对，**不实际删除旧存档**。
##
## 运行（必须带 --test-save，否则会动用户存档）：
##   Godot --headless --path . --script res://godot/tests/tiger_tutorial_test.gd -- --test-save
## 退出码：0 = 全部通过

const SCENE := "res://godot/tiger_tutorial/tiger_tutorial.tscn"
const SCENE_SCRIPT := "res://godot/tiger_tutorial/tiger_tutorial.gd"
const USER_SAVE := "user://save.json"
const REPORT := "res://docs/evidence/CMD-013/tiger-tutorial-report.json"

var stage: Node
var passed := 0
var failed := 0
var checks: Array = []
var notes: Array = []


func _initialize() -> void:
	_run()


func _check(name: String, ok: bool, detail: String) -> void:
	checks.append({"check": name, "ok": ok, "detail": detail})
	if ok:
		passed += 1
		print("  ok   %s — %s" % [name, detail])
	else:
		failed += 1
		print("  FAIL %s — %s" % [name, detail])


## 读文件字节算 SHA-256。文件不存在返回 "<absent>"。
## 用字节哈希而不是 mtime：mtime 只有 1 秒精度，同秒写入看不出来；
## 而且哈希能证明「内容一字未改」。
func _hash(path: String) -> String:
	if not FileAccess.file_exists(path):
		return "<absent>"
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return "<unreadable>"
	var bytes := f.get_buffer(f.get_length())
	f.close()
	return "%s:%d" % [bytes.hex_encode().sha256_text(), bytes.size()]


## 只允许删除「本测试自己创建的隔离存档」。
## 正式存档 user://save.json 明确拒绝——测试自身也不允许删用户存档。
func _safe_rm(path: String) -> bool:
	if path == USER_SAVE:
		push_warning("测试拒绝删除正式存档：%s" % path)
		return false
	if not path.begins_with("user://sessions/session_"):
		push_warning("测试拒绝删除非隔离存档：%s" % path)
		return false
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
		return true
	return false


func _file_exists(path: String) -> bool:
	return FileAccess.file_exists(path)


func _find_skel(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n as Skeleton3D
	for c in n.get_children():
		var f := _find_skel(c)
		if f:
			return f
	return null


## 收集界面上所有会显示给玩家的文字（Label / Button），用于「文案体检」
func _collect_ui_text(node: Node, acc: Array) -> void:
	if node is Label:
		acc.append((node as Label).text)
	elif node is Button:
		acc.append((node as Button).text)
	for c in node.get_children():
		_collect_ui_text(c, acc)


func _spawn() -> Node:
	var packed := load(SCENE) as PackedScene
	var inst := packed.instantiate()
	root.add_child(inst)
	return inst


## 跑一次真实子进程（Godot 自己），把 stdout 收回来。
## 用它验证**命令行参数**级别的行为——单元内调用无法覆盖参数解析。
func _run_godot(args: Array, seconds: float) -> Dictionary:
	var out: Array = []
	var cmd: Array = [
		"--headless", "--path", ProjectSettings.globalize_path("res://"),
		"res://godot/tiger_tutorial/tiger_tutorial.tscn",
		"--", "--quit-after", str(int(seconds)),
	]
	cmd.append_array(args)
	var code := OS.execute(OS.get_executable_path(), cmd, out, true)
	var text := ""
	for line in out:
		text += str(line) + "\n"
	return {"code": code, "out": text}


## 等到轮到我方且不在结算中（比固定 sleep 稳）
func _wait_player_turn(max_sec: float = 8.0) -> bool:
	var t := 0.0
	while t < max_sec:
		if stage.turn == "player" and not stage.busy and stage.phase == "battle":
			return true
		await create_timer(0.1).timeout
		t += 0.1
	return false


func _dismiss_dialog() -> void:
	# 对话是逐条推进的，点「继续」直到关闭
	var guard := 0
	while stage.dialog_panel.visible and guard < 20:
		guard += 1
		stage._on_next_pressed()
		await create_timer(0.05).timeout


func _run() -> void:
	print("== 武松打虎闭环测试开始 ==")

	# ---------- A8/A9 前置：隔离存档 + 用户存档基线哈希 ----------
	var user_hash_before := _hash(USER_SAVE)
	notes.append("用户存档 %s 基线哈希 = %s" % [USER_SAVE, user_hash_before])

	stage = _spawn()
	await create_timer(0.4).timeout
	var iso_path: String = stage.save_path
	_check("A8 使用唯一隔离存档", iso_path != USER_SAVE
		and iso_path.begins_with("user://sessions/session_"),
		"save_path=%s（本次专属新档，且不是 %s）" % [iso_path, USER_SAVE])
	notes.append("本次隔离存档 = %s" % iso_path)

	# ---------- A13 模型与拳击动作（CMD-014 动作工作包） ----------
	var anim_names: Array = []
	if stage.wusong_anim:
		for i in range(stage.wusong_anim.get_animation_list().size()):
			anim_names.append(stage.wusong_anim.get_animation_list()[i])
	_check("A13 加载的是 r10 无刀拳击版",
		stage.WUSONG_MODEL.find("/r10/") >= 0,
		"模型=%s" % stage.WUSONG_MODEL)
	_check("A13 模型带无刀拳击动作 punch", anim_names.has("punch"),
		"可用动作：%s" % [anim_names])
	_check("A13 模型带虎影重击动作 tiger_shadow", anim_names.has("tiger_shadow"),
		"可用动作：%s" % [anim_names])
	_check("A13 旧双刀 attack 仍保留但不被使用",
		anim_names.has("attack"),
		"attack 保留在资产里（未改动 r6 原有 clip），战斗改用 punch")

	# 朝向：模型正面是局部 +Z（实测四向对照图 docs/evidence/CMD-014/facing/），
	# 场景转 90° 后正面朝 +X = 敌人方向。出拳必须朝敌人。
	var sk := _find_skel(stage.wusong)
	var hand_idx: int = sk.find_bone("hand.R") if sk else -1
	# 朝向标定见 godot/tests/facing_calc.gd：60° 是「挥拳可读」与「看得见脸」的平衡点。
	_check("A13d 模型朝向为标定值 60°",
		stage.wusong.rotation_degrees.y == 60.0,
		"rotation.y=%.0f°（标定值 60°：横向占比 0.52 + 脸朝镜头 0.50）"
		% stage.wusong.rotation_degrees.y)
	# 出拳方向：世界 +X（朝敌人）应显著增大。
	# 注意 get_bone_global_pose() 返回的是**骨骼局部空间**位姿，
	# 要拿世界坐标必须再乘 skeleton.global_transform。
	# 峰值在 t≈0.25s（实测 hand.R 世界 X: -0.038 → +0.336），
	# 所以要连续采样取最大值，不能只看固定时刻。
	# 出拳方向：拳必须**朝虎所在的方向**（虎在 +X）。
	# 60° 朝向下世界 X 增量小（位移多在纵深），所以用「位移向量与模型正面的
	# 夹角」判定——这才是「有没有朝正面打出去」。
	var hand_start := Vector3.ZERO
	var hand_peak := Vector3.ZERO
	var peak_dist := -1.0
	if sk and hand_idx >= 0:
		hand_start = (sk.global_transform * sk.get_bone_global_pose(hand_idx)).origin
		if stage.wusong_anim:
			stage.wusong_anim.stop()
			stage.wusong_anim.play("punch")
		for k in range(10):
			await create_timer(0.045).timeout
			var cur: Vector3 = (sk.global_transform * sk.get_bone_global_pose(hand_idx)).origin
			var d := cur.distance_to(hand_start)
			if d > peak_dist:
				peak_dist = d
				hand_peak = cur
		var delta := hand_peak - hand_start
		var facing: Vector3 = stage.wusong.global_transform.basis.z
		var cosang := 0.0
		if delta.length() > 0.0001:
			cosang = facing.normalized().dot(delta.normalized())
		_check("A13e 出拳朝模型正面方向（朝虎）", cosang > 0.80,
			"位移与正面夹角 cos=%.3f（应 >0.80），位移量 %.3f"
			% [cosang, delta.length()])
		# 阈值 0.18：实测在 0.186~0.233 间随帧率抖动（0.19 曾偶发挂），取低于观测
		# 最小值；仍足以区分「有出拳位移」与「没动/反向（≈0 或负）」。
		# 注意这是骨骼局部空间的位移，Blender 侧同一动作量到 0.522（含模型缩放差异）。
		_check("A13e2 出拳位移幅度足够", delta.length() > 0.18,
			"位移 %.3f（应 >0.18，实测基准 0.233，帧率抖动下限 0.186）" % delta.length())

	# ---------- 开场对话 → 教学战 ----------
	_check("开场进入对话", stage.phase == "intro" and stage.dialog_panel.visible,
		"phase=%s" % stage.phase)
	await _dismiss_dialog()
	await create_timer(0.3).timeout
	_check("对话结束进入教学战", stage.phase == "battle" and stage.battle_index == 0,
		"phase=%s battle=%d" % [stage.phase, stage.battle_index])
	_check("教学战初始数值", stage.enemy_hp == 80 and stage.player_hp == 120
		and stage.rage == 0 and stage.turn == "player",
		"敌 %d / 我 %d / 怒气 %d / 回合 %s"
		% [stage.enemy_hp, stage.player_hp, stage.rage, stage.turn])

	# ---------- A14 虎模型接入（CMD-014 动作工作包） ----------
	# 虎在 _build_tiger() 里创建，所以断言要放在战斗开始之后
	_check("A14 使用真实虎模型（r12）",
		stage.TIGER_MODEL.find("/r12/") >= 0,
		"模型=%s" % stage.TIGER_MODEL)
	_check("A14 虎模型已实例化", stage.tiger_model != null,
		"tiger_model=%s" % (stage.tiger_model.name if stage.tiger_model else "无"))
	var tiger_anims: Array = []
	if stage.tiger_anim:
		for i in range(stage.tiger_anim.get_animation_list().size()):
			tiger_anims.append(stage.tiger_anim.get_animation_list()[i])
	_check("A14 虎带扑击动作 pounce", tiger_anims.has("pounce"),
		"可用动作：%s" % [tiger_anims])
	_check("A14 虎带受击动作 hit", tiger_anims.has("hit"),
		"可用动作：%s" % [tiger_anims])
	_check("A14 虎不再用方块占位", stage.tiger_model != null,
		"tiger_model 已加载，未走 fallback")

	# ---------- A17 演示模式存档隔离（CMD-017）----------
	# 1) 所有演示/试玩模式都必须落在 DEMO_SAVE_FLAGS 里——漏一个就是演示污染真档
	var demo_flags := ["--auto-full", "--showcase", "--demo-lose", "--auto-demo",
		"--scratch-save", "--test-save"]
	var missing_flags: Array = []
	for df in demo_flags:
		if not stage.DEMO_SAVE_FLAGS.has(df):
			missing_flags.append(df)
	_check("A17a 所有演示模式都走专属新档", missing_flags.is_empty(),
		"漏掉的演示参数：%s（DEMO_SAVE_FLAGS=%s）"
		% [missing_flags if not missing_flags.is_empty() else "无", stage.DEMO_SAVE_FLAGS])
	# 2) 逐个演示参数实跑路径解析：都必须落在 user://sessions/ 下
	var path_hits: Array = []
	for df in demo_flags:
		var p: String = stage._resolve_save_path_for([df])
		if not p.begins_with("user://sessions/session_"):
			path_hits.append("%s→%s" % [df, p])
	_check("A17b 演示参数逐个解析都落专属新档", path_hits.is_empty(),
		"异常：%s" % [path_hits if not path_hits.is_empty() else "无"])
	_check("A17c 不带参数才是正式档",
		stage._resolve_save_path_for([]) == "user://save.json",
		"无参数 → %s" % stage._resolve_save_path_for([]))
	# 3) 隔离判定：正式档那种目录名 → 不算隔离；别的目录 → 算隔离
	var suffix: String = stage._default_user_dir_suffix()
	var formal_dir: String = "/tmp/whatever/Library/Application Support/" + suffix
	_check("A17d 正式档目录名判定为「非隔离」",
		not stage._is_isolated_user_dir(formal_dir),
		"判定 %s → 非隔离" % suffix)
	_check("A17d2 换过目录名判定为「隔离」",
		stage._is_isolated_user_dir("/tmp/whatever/Library/Application Support/shuihu_iso_123"),
		"隔离副本目录 → 隔离")
	# 4) 隔离判定：正式工程跑 --auto-flow 必须被拒（拒绝行为由 tools/verify-demo-save-isolation.sh 验证）
	_check("A17e 本测试跑在隔离环境（--auto-flow 在此才允许）",
		stage._isolation_ready(),
		"user 目录=%s（若为正式档目录，说明没走 tools/godot-tiger-test.sh 的隔离副本）"
		% OS.get_user_data_dir())

# ---------- A16 首关体验（CMD-016） ----------

	# 1) 目标标记要小，不许抢人物
	var ring_mesh := stage.target_ring.mesh as TorusMesh if stage.target_ring else null
	var arrow_mesh := stage.target_arrow.mesh as CylinderMesh if stage.target_arrow else null
	_check("A16a 地圈已缩小（外径 ≤ 0.45）",
		ring_mesh != null and ring_mesh.outer_radius <= 0.45
			and ring_mesh.outer_radius <= 0.60,
		"外径=%.2f 内径=%.2f（改前 0.82/0.60）"
		% [ring_mesh.outer_radius if ring_mesh else -1.0,
			ring_mesh.inner_radius if ring_mesh else -1.0])
	_check("A16a2 头顶箭头已缩小（底径 ≤ 0.08、高 ≤ 0.18）",
		arrow_mesh != null and arrow_mesh.bottom_radius <= 0.08
			and arrow_mesh.height <= 0.18,
		"底径=%.3f 高=%.2f（改前 0.17/0.38）"
		% [arrow_mesh.bottom_radius if arrow_mesh else -1.0,
			arrow_mesh.height if arrow_mesh else -1.0])
	# 2) 虎资产换到 r12（r11 保留不动），并多一条 defeat
	_check("A16b r11 旧版资产仍在（新增另版本、不删旧版）",
		FileAccess.file_exists("res://assets/releases/ART-002/r11/models/tiger.glb")
			and FileAccess.file_exists("res://assets/releases/ART-002/r11/source/tiger.blend"),
		"r11 的 glb 与 blend 都还在；当前用 r12=%s" % stage.TIGER_MODEL)
	_check("A16c r12 带败退动作 defeat", tiger_anims.has("defeat"),
		"可用动作：%s" % [tiger_anims])
	# 3) 音乐默认关（不擅自替换默认曲）
	_check("A16i 音乐默认关闭", not stage._music_on and stage.btn_music.text.contains("关"),
		"音乐=%s，按钮=%s" % [stage._music_on, stage.btn_music.text])
	# 4) 图鉴数据与 data/shuihu.js 对得上（改数据必须同步改常量）
	var roster_ok := false
	var roster_detail := ""
	var roster_path := "res://data/shuihu.js"
	if FileAccess.file_exists(roster_path):
		var txt := FileAccess.get_file_as_string(roster_path)
		var s := txt.find("const seats = [")
		var e := txt.find("];", s)
		var re := RegEx.new()
		re.compile("\\['([^']*)','([^']*)','([^']*)'\\]")
		var rows: Array = re.search_all(txt.substr(s, e - s))
		var seat := -1
		var byname := ""
		var star := ""
		for i in range(rows.size()):
			if rows[i].get_string(1) == "武松":
				seat = i + 1
				byname = rows[i].get_string(3)
				star = rows[i].get_string(2)
				break
		var blurb_re := RegEx.new()
		blurb_re.compile("'武松':'([^']*)'")
		var bm := blurb_re.search(txt)
		var blurb := bm.get_string(1) if bm else ""
		roster_ok = (rows.size() == stage.HERO_TOTAL
			and seat == stage.WUSONG_SEAT
			and byname == stage.WUSONG_BYNAME
			and star == stage.WUSONG_STAR
			and blurb == stage.WUSONG_BLURB)
		roster_detail = "数据文件：%d 位，座次 %d，%s·%s，简介=%s；场景常量：%d 位，座次 %d，%s·%s" % [
			rows.size(), seat, byname, star, blurb,
			stage.HERO_TOTAL, stage.WUSONG_SEAT, stage.WUSONG_BYNAME, stage.WUSONG_STAR]
	else:
		roster_detail = "读不到 data/shuihu.js"
	_check("A16h 图鉴数据与 data/shuihu.js 一致", roster_ok, roster_detail)

	# ---------- A15 界面可读性（CMD-015） ----------
	# 目标：字号够大、有描边、目标一眼可见、能放大招有提示、UI 不塞实现术语。
	var hp_size: int = stage.label_hp.get_theme_font_size("font_size")
	var rage_size: int = stage.label_rage.get_theme_font_size("font_size")
	var btn_size: int = stage.btn_punch.get_theme_font_size("font_size")
	_check("A15a 血量/怒气字号 ≥ 22",
		hp_size >= 22 and rage_size >= 22,
		"血量 %d px，怒气 %d px" % [hp_size, rage_size])
	_check("A15b 技能按钮字号 ≥ 20", btn_size >= 20, "按钮 %d px" % btn_size)
	var hp_outline: int = stage.label_hp.get_theme_constant("outline_size")
	var btn_box: Vector2 = stage.btn_punch.size
	_check("A15c 关键文字有描边（对比度）", hp_outline >= 4,
		"描边 %d px（≥4）" % hp_outline)
	_check("A15c2 按钮有底色与边框（不是裸文字）",
		stage.btn_punch.get_theme_stylebox("normal") != null
			and btn_box.x >= 200.0 and btn_box.y >= 60.0,
		"按钮尺寸 %dx%d" % [int(btn_box.x), int(btn_box.y)])
	_check("A15d 目标提示写明打的是谁",
		stage.label_target.text.contains("吊睛白额大虫")
			and stage.label_target.text.contains("已锁定"),
		"目标行 = %s" % stage.label_target.text)
	_check("A15g 目标有可见标记（脚下金圈 + 头顶箭头）",
		stage.target_ring != null and stage.target_arrow != null,
		"金圈=%s 箭头=%s" % [stage.target_ring != null, stage.target_arrow != null])
	# 怒气不足时不该显示「就绪」横幅
	_check("A15e 怒气不足时不显示就绪横幅",
		stage.banner_ready != null and not stage.banner_ready.visible,
		"怒气 %d，横幅可见=%s" % [stage.rage, stage.banner_ready.visible])

	# A15h：合成一次鼠标点击，验证「点虎 → 锁定目标」的射线路径真的能走通
	if stage.camera and stage.tiger:
		var wp: Vector3 = stage.tiger.global_position + Vector3(0.0, 0.7, 0.0)
		var sp: Vector2 = stage.camera.unproject_position(wp)
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = true
		ev.position = sp
		stage._unhandled_input(ev)
		await create_timer(0.2).timeout
		_check("A15h 点击猛虎能锁定目标",
			stage.target_selected and stage.label_hint.visible
				and stage.label_hint.text.contains("已锁定"),
			"点击屏幕坐标 %s → 提示 = %s" % [sp, stage.label_hint.text])
	else:
		_check("A15h 点击猛虎能锁定目标", false, "没有相机或老虎节点，无法合成点击")

	# A15f：UI 文案不能出现实现术语
	var ui_texts: Array = []
	_collect_ui_text(stage.ui_layer, ui_texts)
	var ui_banned := ["HP", "user://", "save_path", "session_", "res://", "phase",
		"busy", "rage", "_action", "【", "】"]
	var ui_hits: Array = []
	for t in ui_texts:
		for b in ui_banned:
			if (t as String).find(b) >= 0:
				ui_hits.append("%s ← %s" % [b, t])
	_check("A15f 界面文案不含实现术语", ui_hits.is_empty(),
		"命中：%s" % [ui_hits if not ui_hits.is_empty() else "无"])

	# ---------- A3 防重入：连点 5 次只结算 1 次 ----------
	var before_actions: int = stage.actions_resolved
	var before_hp: int = stage.enemy_hp
	for i in range(5):
		stage._player_action("punch")
	_check("A3 连点 5 次只结算 1 次", stage.actions_resolved == before_actions + 1,
		"actions %d → %d（应 +1）" % [before_actions, stage.actions_resolved])

	# ---------- A13b 普攻播 punch（不是双刀 attack）----------
	# 复用 A3 那次连点里的第一次普攻，不额外出手，避免打乱后面的怒气/血量基准
	var punch_anim: String = stage.wusong_anim.current_animation if stage.wusong_anim else ""
	_check("A13b 普攻播放 punch", punch_anim == "punch",
		"current_animation=%s（应 punch，不是双刀 attack）" % punch_anim)

	# ---------- A2 怒气：普攻 +25 ----------
	await _wait_player_turn()
	_check("A2 普攻加 25 怒气", stage.rage == 25, "rage=%d" % stage.rage)
	_check("普攻造成 18 伤害", stage.enemy_hp == before_hp - 18,
		"enemy_hp %d → %d" % [before_hp, stage.enemy_hp])

	# ---------- A1 回合切换 ----------
	_check("A1 敌方行动后回到我方", stage.turn == "player",
		"turn=%s（敌方已反击过一次）" % stage.turn)
	_check("A1 敌方反击扣血", stage.player_hp < 120,
		"player_hp=%d（应 <120）" % stage.player_hp)

	# ---------- A2 怒气不足时不能放重击 ----------
	var hp_before_shadow: int = stage.enemy_hp
	stage._player_action("tiger_shadow")   # rage=25 < 50，应被拒
	await create_timer(0.4).timeout
	_check("A2 怒气不足时重击被拒", stage.enemy_hp == hp_before_shadow and stage.rage == 25,
		"enemy_hp=%d rage=%d（都没变）" % [stage.enemy_hp, stage.rage])

	# ---------- 攒到 50 怒气，放重击 ----------
	await _wait_player_turn()
	stage._player_action("punch")          # +25 → 50
	await _wait_player_turn()
	_check("怒气攒到 50", stage.rage == 50, "rage=%d" % stage.rage)
	_check("A15e2 怒气够时显示「就绪」横幅",
		stage.banner_ready != null and stage.banner_ready.visible
			and stage.label_ready.text.contains("就绪"),
		"横幅可见=%s 文案=%s" % [stage.banner_ready.visible, stage.label_ready.text])
	_check("A15e3 就绪后重击按钮可按",
		not stage.btn_shadow.disabled,
		"disabled=%s 文案=%s" % [stage.btn_shadow.disabled, stage.btn_shadow.text])
	var hp_before_heavy: int = stage.enemy_hp
	await _wait_player_turn()
	stage._player_action("tiger_shadow")
	await create_timer(0.10).timeout
	var shadow_anim: String = stage.wusong_anim.current_animation if stage.wusong_anim else ""
	_check("A13c 虎影重击播放 tiger_shadow", shadow_anim == "tiger_shadow",
		"current_animation=%s（应 tiger_shadow）" % shadow_anim)
	await create_timer(1.6).timeout
	_check("A2 虎影重击消耗 50 怒气", stage.rage == 0, "rage=%d（应 0）" % stage.rage)
	_check("A2 虎影重击造成 35 伤害", stage.enemy_hp == maxi(0, hp_before_heavy - 35),
		"enemy_hp %d → %d" % [hp_before_heavy, stage.enemy_hp])

	# ---------- 打到胜利 ----------
	var guard := 0
	while stage.phase == "battle" and stage.last_result != "win" and guard < 30:
		guard += 1
		if stage.turn == "player" and not stage.busy:
			if stage.rage >= 50:
				stage._player_action("tiger_shadow")
			else:
				stage._player_action("punch")
		await create_timer(0.8).timeout
	await _dismiss_dialog()
	await create_timer(0.5).timeout

	# ---------- A16d/A16e 虎的败退表现 ----------
	# 胜利后应该播 defeat 动作（而不是站着不动等对话）
	var defeat_seen := false
	var d_guard := 0
	while d_guard < 30:
		d_guard += 1
		if stage.tiger_anim and stage.tiger_anim.current_animation == "defeat":
			defeat_seen = true
			break
		await create_timer(0.1).timeout
	_check("A16d 胜利后虎播放 defeat 动作", defeat_seen,
		"current_animation=%s" % (stage.tiger_anim.current_animation if stage.tiger_anim else "无"))
	# 淡出机制：虎的材质被复制成可透明的副本（不动共享原资源）
	var fade_mats: Array = stage._tiger_fade_materials()
	var fade_ready := fade_mats.size() > 0
	for m in fade_mats:
		if m.transparency != BaseMaterial3D.TRANSPARENCY_ALPHA:
			fade_ready = false
	_check("A16e 虎可淡出（材质副本已开透明）", fade_ready,
		"淡出材质 %d 个，全部 TRANSPARENCY_ALPHA=%s" % [fade_mats.size(), fade_ready])

	# 胜利对话是在败退演出**之后**才弹的，所以这里要等它出来再推进，
	# 否则后面的「已获得武松」断言会跑在发奖之前。
	var dlg_guard := 0
	while not stage.dialog_panel.visible and dlg_guard < 80:
		dlg_guard += 1
		await create_timer(0.1).timeout
	await _dismiss_dialog()
	await create_timer(0.3).timeout

	# ---------- A5 武松只奖励一次 ----------
	_check("A5 胜利后获得武松", stage.owns_wusong(),
		"owned=%s" % [stage.save_data.get("owned", [])])
	_check("A5 武松只发一次", stage.save_data["owned"].count("wusong") == 1,
		"owned=%s" % [stage.save_data["owned"]])
	# 再次触发发放逻辑，数量不能变
	stage._on_tutorial_won()
	await create_timer(0.2).timeout
	_check("A5 重复触发不叠加", stage.save_data["owned"].count("wusong") == 1,
		"owned=%s" % [stage.save_data["owned"]])
	await _dismiss_dialog()
	await create_timer(0.3).timeout

	# ---------- 招募人物卡（CMD-016）----------
	# 流程变成：胜利 → 胜利对话 → 招募对话 → **人物卡** → 点「带上他」→ 编队
	_check("A16f 招募人物卡出现", stage.recruit_panel != null and stage.recruit_panel.visible,
		"人物卡可见=%s" % (stage.recruit_panel.visible if stage.recruit_panel else "无"))
	_check("A16f2 人物卡写明是谁",
		stage.recruit_name != null and stage.recruit_name.text.contains("行者")
			and stage.recruit_name.text.contains("武松"),
		"姓名行 = %s" % (stage.recruit_name.text if stage.recruit_name else "无"))
	_check("A16f3 人物卡显示星号与座次",
		stage.recruit_meta != null and stage.recruit_meta.text.contains("天伤星")
			and stage.recruit_meta.text.contains("14") and stage.recruit_meta.text.contains("108"),
		"信息行 = %s" % (stage.recruit_meta.text if stage.recruit_meta else "无"))
	_check("A16g 图鉴进度与存档一致",
		stage.recruit_progress != null
			and stage.recruit_progress.text.contains("%d / %d"
				% [stage.save_data.get("owned", []).size(), 108]),
		"进度行 = %s（owned=%s）" % [stage.recruit_progress.text if stage.recruit_progress else "无",
			stage.save_data.get("owned", [])])
	# A17f：招募阶段把失效的战斗界面收起来，只突出「获得武松 → 带上他」
	_check("A17f 招募阶段隐藏战斗按钮",
		stage.btn_punch != null and not stage.btn_punch.visible
			and stage.btn_shadow != null and not stage.btn_shadow.visible,
		"出拳可见=%s 虎影可见=%s"
		% [stage.btn_punch.visible if stage.btn_punch else "无",
			stage.btn_shadow.visible if stage.btn_shadow else "无"])
	_check("A17f2 招募阶段隐藏怒气与目标提示",
		stage.label_rage != null and not stage.label_rage.visible
			and stage.bar_rage != null and not stage.bar_rage.visible
			and stage.label_target != null and not stage.label_target.visible,
		"怒气可见=%s 怒气条可见=%s 目标可见=%s"
		% [stage.label_rage.visible if stage.label_rage else "无",
			stage.bar_rage.visible if stage.bar_rage else "无",
			stage.label_target.visible if stage.label_target else "无"])
	# A17g：招募卡肖像必须是「当前 r10 模型渲染图」，与场上造型一致
	var tex_path := ""
	if stage.recruit_portrait and stage.recruit_portrait.texture:
		tex_path = stage.recruit_portrait.texture.resource_path
	_check("A17g 招募卡用 r10 模型渲染肖像（与场上造型一致）",
		tex_path.find("/r10/portraits/wusong_portrait.png") >= 0,
		"肖像来源 = %s" % (tex_path if tex_path != "" else "无"))
	_check("A17h 旧的 2D 立绘仍在（未删未改，只是不再用）",
		FileAccess.file_exists("res://assets/q/wusong-portrait.png")
			and FileAccess.file_exists("res://assets/portraits/hero-014.png"),
		"旧立绘两个文件都还在")
	# 点「带上他」→ 进入编队
	if stage.btn_recruit:
		stage._on_recruit_confirmed()
	await create_timer(0.3).timeout
	await _dismiss_dialog()      # 推进「编队」对话，让「就位，出战」按钮出现
	await create_timer(0.3).timeout

	# ---------- 编队 ----------
	_check("进入编队阶段", stage.phase == "lineup", "phase=%s" % stage.phase)
	if stage.btn_lineup and stage.btn_lineup.visible:
		stage._on_lineup_confirmed()
	await create_timer(0.5).timeout
	_check("A6 编队保存武松", "wusong" in stage.save_data.get("lineup", []),
		"lineup=%s" % [stage.save_data.get("lineup", [])])

	# ---------- A7 第二战 ----------
	await _dismiss_dialog()
	await create_timer(0.4).timeout
	_check("A7 进入第二战", stage.battle_index == 1 and stage.phase == "battle",
		"battle=%d phase=%s" % [stage.battle_index, stage.phase])
	_check("A7 第二战敌人更强", stage.enemy_hp == 120,
		"enemy_hp=%d（应 120）" % stage.enemy_hp)
	_check("A7 出战角色是武松", stage.wusong != null and stage.wusong_anim != null,
		"武松节点=%s，动画=%s" % [stage.wusong.name, stage.wusong_anim.current_animation])

	# ---------- A11 失败与重试（前后比对用户存档哈希） ----------
	var hash_before_fail: String = _hash(USER_SAVE)
	stage.player_hp = 8
	stage.turn = "player"
	stage.busy = false
	stage._player_action("punch")     # 打完轮到敌人，敌人 16 伤害 > 8
	await create_timer(3.0).timeout
	await _dismiss_dialog()
	await create_timer(0.3).timeout
	_check("A4 我方归零判负", stage.last_result == "lose" and stage.player_hp == 0,
		"result=%s player_hp=%d" % [stage.last_result, stage.player_hp])
	_check("A4 失败后出现重试", stage.btn_retry.visible, "btn_retry.visible=%s" % stage.btn_retry.visible)
	stage._on_retry_pressed()
	await create_timer(0.6).timeout
	_check("A4 重试恢复初始状态", stage.player_hp == 120 and stage.enemy_hp == 120
		and stage.rage == 0 and stage.phase == "battle",
		"我 %d / 敌 %d / 怒气 %d" % [stage.player_hp, stage.enemy_hp, stage.rage])
	var hash_after_fail: String = _hash(USER_SAVE)
	_check("A11 失败重试未改用户存档", hash_after_fail == hash_before_fail,
		"哈希 %s → %s（应完全一致）" % [hash_before_fail, hash_after_fail])

	# ---------- A6 重启后仍持有 ----------
	stage.queue_free()
	await create_timer(0.3).timeout
	stage = _spawn()
	await create_timer(0.5).timeout
	_check("A6 重启后仍持有武松", stage.owns_wusong(),
		"owned=%s" % [stage.save_data.get("owned", [])])
	_check("A6 重启后编队保留", "wusong" in stage.save_data.get("lineup", []),
		"lineup=%s" % [stage.save_data.get("lineup", [])])

	# ---------- A8 用户存档未被改动 ----------
	var user_hash_now: String = _hash(USER_SAVE)
	_check("A8 用户存档未被创建/改动",
		user_hash_now == user_hash_before,
		"哈希 %s → %s（应完全一致）" % [user_hash_before, user_hash_now])
	_check("A8 测试存档已写入", _file_exists(iso_path), iso_path)

	# ================================================================
	# A9–A12：存档安全（CMD-014 返修）
	# ================================================================

	# ================================================================
	# A9：存档安全（CMD-014 r4 收敛版）
	#   核心思路变了：不再测「重置被拒绝」，
	#   而是测「**根本没有重置入口**」+「每次运行生成唯一新档」。
	# ================================================================

	# 场景源码扫描（过滤注释行），A9a 与 A12 共用
	var src_code_lines: Array = []
	for ln in FileAccess.get_file_as_string(SCENE_SCRIPT).split("\n"):
		var t2 := ln.strip_edges()
		if t2.begins_with("#"):
			continue
		src_code_lines.append(t2)
	var code_only := "\n".join(src_code_lines)

	# ---------- A9a：不存在任何重置/指定路径的入口 ----------
	_check("A9a 场景里没有删除存档的调用",
		code_only.find("remove_absolute") < 0 and code_only.find("DirAccess.remove") < 0,
		"源码中未出现删除调用")
	_check("A9a 没有 _reset_save_at 这类重置函数",
		code_only.find("_reset_save_at") < 0,
		"源码中未出现 _reset_save_at")
	_check("A9a 没有 --save-path 入口",
		code_only.find("--save-path") < 0,
		"源码中未出现 --save-path")
	_check("A9a 没有 --reset-save 入口",
		code_only.find("--reset-save") < 0,
		"源码中未出现 --reset-save")

	# ---------- A9b：--save-path / --reset-save 被传时必须被忽略 ----------
	# 外部即使传了这些参数，也不能改变存档路径，更不能重置正式档。
	var hash_before_flags: String = _hash(USER_SAVE)
	var proc_rogue := _run_godot(
		["--save-path", "user://./save.json", "--reset-save"], 2.0)
	var hash_after_flags: String = _hash(USER_SAVE)
	_check("A9b 传入 --save-path/--reset-save 不会改动正式档",
		hash_after_flags == hash_before_flags,
		"哈希 %s → %s" % [hash_before_flags, hash_after_flags])
	_check("A9b 传入这些参数时被忽略（仍走正式档或专属新档）",
		(proc_rogue["out"] as String).find(USER_SAVE) >= 0
			or (proc_rogue["out"] as String).find("user://sessions/session_") >= 0,
		"子进程 save_path 未被外部参数劫持")

	# ---------- A9c：本次运行专属新档 ----------
	# 语义：同一进程内多次解析必须**相同**（否则场景内重启读不到自己的存档），
	# 不同进程必须**不同**（并发互不干扰）。后者由外部脚本的并发场景验证。
	var iso_a: String = stage._resolve_save_path()
	var stage2 := _spawn()
	await create_timer(0.4).timeout
	var iso_b: String = stage2._resolve_save_path()
	stage2.queue_free()
	await create_timer(0.2).timeout
	_check("A9c 同一进程内多次解析结果一致", iso_a == iso_b,
		"两次解析：%s vs %s（应相同，场景内重启要能读到自己的存档）" % [iso_a, iso_b])
	_check("A9c 专属新档在 sessions/ 目录下",
		iso_a.begins_with("user://sessions/session_"),
		"路径 = %s" % iso_a)
	_check("A9c 专属新档不是正式档", iso_a != USER_SAVE,
		"路径 = %s" % iso_a)
	_check("A9c 专属新档带进程号", iso_a.find(str(OS.get_process_id())) >= 0,
		"路径含进程号 %d：%s" % [OS.get_process_id(), iso_a])

	# ---------- A10：--auto-demo 演示不污染正式存档 ----------
	var hash_before_demo: String = _hash(USER_SAVE)
	var proc_demo := _run_godot(["--auto-demo"], 8.0)
	var hash_after_demo: String = _hash(USER_SAVE)
	_check("A10 演示未改用户存档", hash_after_demo == hash_before_demo,
		"哈希 %s → %s" % [hash_before_demo, hash_after_demo])
	_check("A10 演示使用独立隔离存档",
		(proc_demo["out"] as String).find("user://sessions/session_") >= 0,
		"子进程 [ENV] 显示 save_path=user://sessions/session_…")

	# ---------- A12：源码里不存在删除存档的调用 ----------
	var banned := ["remove_absolute", "DirAccess.remove", "OS.remove", "remove("]
	var hits: Array = []
	for b in banned:
		if code_only.find(b) >= 0:
			hits.append(b)
	_check("A12 源码无删除存档调用", hits.is_empty(),
		"命中的禁用调用：%s" % [hits if not hits.is_empty() else "无"])

	# ---------- 收尾：用户存档哈希必须与开局完全一致 ----------
	var user_hash_final: String = _hash(USER_SAVE)
	_check("用户存档全程未被改动", user_hash_final == user_hash_before,
		"开局 %s → 结束 %s" % [user_hash_before, user_hash_final])

	# 清理本次隔离存档（只删自己创建的）
	_safe_rm(iso_path)

	# ---------- 汇总 ----------
	var total := passed + failed
	print("\n== 合计 %d 项，PASS %d，FAIL %d ==" % [total, passed, failed])
	if failed == 0:
		print("TIGER_TUTORIAL_OK: 回合/怒气/防重入/胜败重试/只奖励一次/编队持久/第二战武松/隔离存档/存档安全 全部通过")

	var report := {
		"schema": "cmd014-tiger-tutorial/2",
		"godot": Engine.get_version_info().get("string", "?"),
		"scene": SCENE,
		"isolated_save_path": iso_path,
		"user_save_hash_before": user_hash_before,
		"user_save_hash_after": user_hash_final,
		"total": total, "passed": passed, "failed": failed,
		"checks": checks, "notes": notes,
	}
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://docs/evidence/CMD-013"))
	var rf := FileAccess.open(REPORT, FileAccess.WRITE)
	if rf:
		rf.store_string(JSON.stringify(report, "  "))
		rf.close()
	quit(0 if failed == 0 else 1)
