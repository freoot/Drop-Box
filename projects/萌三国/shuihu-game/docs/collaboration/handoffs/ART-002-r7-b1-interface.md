# ART-002 r7 b1 接口与边界

- 日期：2026-10-25。基线：837ab2c。A 负责集成及本机运行验证；模型构造子代理仅写 r7 生成器、映射、模型与批次元数据，A 写独立 Godot 验证入口、测试、证据与交接。共享工作目录，文件互斥，不是独立工作区。
- 用户要求：先处理与 r6 六人重叠，复用已验证模型并保留旧文件；核对人物兵器；b1 测试、实机截图、交接及 commit 完成后再推进剩余批次。
- 允许文件：assets/releases/ART-002/r7/；godot/art_002/batch_review.gd、batch_review.tscn；tests/art-002-r7.test.mjs；本接口和 ART-002-r7-b1 交接。不得修改用户脏文件 CHAR-108.md、父目录或 r5/r6 旧模型。
- 批次元数据：r7/batches/b1.json 的 heroes 数组，每项 id、name、byname、model、source、weapon（kind/label/basis/source_note/selection_note）、animation（含 sampled_contacts）、body_bounds、origin。model/source 相对 r7；复用 r6 时为 ../r6/models/... 和 ../r6/source/...。六人重叠的 GLB 和 Blender 源必须与 r6 SHA-256 相同。复用模型的旧脚底事实标为 legacy，不混用新生成模型的测量结论。
- 新验证入口：godot/art_002/batch_review.tscn。默认 b1；--batch=bN 选择已有批次；--batch-test 执行无图形验证；--batch-capture 执行图形验证并输出证据。原六人 battlefield_sample.tscn 保留。
- 复用：r6 战场 GLB、既有 HeroSample 表现控制器、现有灯光和格位公式，不复制场景模型，不改网页入口/玩法/存档/数值/角色 ID。
- 验证：每组最多六人分页；32 格射线必须全部命中；每人经 viewport.push_input 选择本人、点目标格并实际等待移动结束；每个四动作在 20%/50%/80% 采样 Skeleton3D 骨骼旋转并验证变化。截图来自 Godot 帧缓冲，四行三列动作接触表。输入回放不等于人工 OS 点击或 D 独立试玩。
- 证据：r7/evidence/b1/headless.json、runtime.json、page-NN.png、hero-NNN-actions.png。图形验证结果只能用于对应模型/脚本版本；改动后重跑。
- 证据完整性闸门（本次新增）：验证开始即写 headless/capture-in-progress.json（run_id、批次、模式、开始时间、视口、输入哈希），并删除同模式旧完成清单；全部文件成功关闭后写 headless-manifest.json / capture-manifest.json（run_complete、run_id、输入哈希、逐文件 SHA-256 与字节数、PNG 实际宽高），最后才移除进行中标记。任何失败保留标记并非零退出，避免中断回放混用旧截图通过测试。测试以 1440×900 总览、1440×1200 动作图、清单哈希与无进行中标记为准，另有临时夹具验证缺图、改图、旧 runtime、残留标记和不完整清单都会失败。
- 图片参考可选。原型制作不等于 108 人手工精雕；武器映射须注明小说常见识别特征或本游戏原型选择，未核实出处不得假造 URL。
