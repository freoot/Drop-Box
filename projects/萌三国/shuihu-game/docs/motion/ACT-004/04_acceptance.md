# ACT-004 · 验收与复现（04）

- 角色：`hero005.glb`（大刀 · 关胜，r7）
- 执行日期：2026-10-29
- 渲染路径：**Blender 后台渲染**（`/Applications/Blender.app/Contents/MacOS/Blender -b -P`，Blender 5.2.2 LTS），
  未走 Godot 兜底路径（Blender 首次调用即成功，见 §3.1 与 §6 的失败排查记录）
- 未执行 git commit

## 0. 产出清单

| 路径 | 说明 | 实测大小/数量 |
| --- | --- | --- |
| `tools/motion/probe_glb.py` | GLB 纯标准库探测脚本（可复用为模块） | 738 行 |
| `tools/motion/timing_analysis.py` | 时点裁决脚本（FK + 速度曲线） | 798 行 |
| `tools/motion/render_preview.py` | Blender 渲染 / 拼图 / 生成 HTML（需在 Blender 内执行） | 659 行 |
| `tools/motion/verify_preview.py` | 预览产出自检（纯标准库） | 180 行 |
| `tools/motion/preview_playtest.js` | 预览页播放逻辑无浏览器实测（需 node） | 73 行 |
| `docs/motion/ACT-004/01_glb_probe.md` | 探测报告 | 68839 字节 |
| `docs/motion/ACT-004/probe/heroes_probe.json` | 探测全量机器可读结果 | 456517 字节 |
| `docs/motion/ACT-004/02_timing_resolution.md` | 时点裁决报告 | 8508 字节 |
| `docs/motion/ACT-004/timing_unified.json` | 统一时点表 + 全体 hero 实测 | 151605 字节 |
| `docs/motion/ACT-004/03_preview/frames/*.png` | 5 动作帧序列 | 84 个（idle25/move13/attack15/hit10/death21） |
| `docs/motion/ACT-004/03_preview/sprite_sheet.png` | sprite sheet（5 行 × 25 列，200×260/格） | 5000×1300，802826 字节 |
| `docs/motion/ACT-004/03_preview/preview.html` | 纯本地播放页（内嵌 base64 sheet） | 1080864 字节 |
| `docs/motion/ACT-004/03_preview/preview_meta.json` | 预览元数据 | — |
| `docs/motion/ACT-004/03_preview/verify_report.json` | 自检结果 | 22 项 |

---

## 1. 复现命令 ①：GLB 探测

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game
python3 tools/motion/probe_glb.py
```

实际输出（尾部）：

```
[probe] hero025.glb: ok=True clips=['idle', 'walk', 'attack', 'hit']
[probe] 写出 docs/motion/ACT-004/probe/heroes_probe.json（456517 字节）
[probe] 写出 docs/motion/ACT-004/01_glb_probe.md（68839 字节）
[probe] clip 名并集：['attack', 'hit', 'idle', 'walk']
[probe] death clip：不存在
[probe] 武器关键词节点并集：['hand.L', 'hand.R']
```

单文件抽查：

```bash
python3 tools/motion/probe_glb.py --only hero005.glb | head -14
```

实际输出（前 14 行）：

```
{
  "file": "hero005.glb",
  "path": "/Users/user/Documents/Codex/youxi/meng/shuihu-game/assets/releases/ART-002/r7/models/hero005.glb",
  "probe_ok": true,
  "parse_errors": [],
  "size_bytes": 959800,
  "sha256": "7ac9ec719ce73a8df985bac3558de59baad4d62a49857f33430ee37d5a9acbb9",
  "glb": {
    "magic": "glTF",
    "version": 2,
    "declared_length": 959800,
    "actual_length": 959800,
    "chunk_count": 2,
    "chunk_types": [
```

### 1.1 关键实测结论

| 项 | 实测 |
| --- | --- |
| 解析结果 | 18/18 成功，0 失败 |
| 容器 | magic `glTF` v2，JSON+BIN 两 chunk，generator = `Khronos glTF Blender I/O v5.2.40` |
| clip 名并集 | `idle` / `walk` / `attack` / `hit`（**无 death**） |
| hero005 各 clip | idle 2000ms（49 个去重时间戳）、walk 1000ms（25）、attack 1000ms（25）、hit 750ms（19） |
| 每 clip 通道数 | 33（11 节点 × translation/rotation/scale），target.path 分布 = 11/11/11 |
| 插值方式 | 全部 LINEAR |
| 实际驱动节点 | 11 个 skin joint：root/body/head/arm.L/hand.L/arm.R/hand.R/leg.L/foot.L/leg.R/foot.R |
| skins[0].joints | 同上 11 个，skeleton 根 = `root`（详见 01 报告每个文件的全表） |
| 武器/道具挂点 | **不存在**：节点名含 weapon/prop/sword/blade/spear/staff/axe 的节点数 = 0（0/18 文件） |
| 命中 `hand` 关键词的节点 | 仅 `hand.L`、`hand.R`，二者都是 skin joint 且不挂 mesh |
| 对 ACT-003 的纠正 | ACT-003 的 `hand.R` 是按骨骼名推断的**假设**；资产内没有专用武器挂点空节点 |

---

## 2. 复现命令 ②：时点裁决

```bash
python3 tools/motion/timing_analysis.py
```

实际输出（尾部）：

```
[timing] hero025.glb: attack_peak=456.0ms hit=750.0ms return_in_clip=940.0
[timing] 写出 docs/motion/ACT-004/timing_unified.json（151605 字节）
[timing] 写出 docs/motion/ACT-004/02_timing_resolution.md（8508 字节）
[timing] 命中帧裁决：458.0 ms （实测峰值 456.0 ms）
[timing] hit 时长裁决：0.75 s
[timing] 收招缺口：110.0 ms
```

### 2.1 三处冲突的裁决结果

| 冲突 | 实测 | 裁决 |
| --- | --- | --- |
| 命中帧 294 vs 458 | hero005 合成冲击峰值 **456.0ms**（hand.R 线速度/角速度 456.0，arm.R 角速度 450.0、线速度 456.0）；全体 18 个 hero 峰值 420.0–497.667ms，中位数 456.0ms | **458ms**（与实测差 2.0ms，在一帧 41.667ms 内）；294ms 差 162.0ms，落选 |
| hit 时长 0.75 vs 1.0 | 实测 750ms × 15 个文件、1000ms × 3 个文件（hero006/013/014） | **0.75s（750ms）**，取实测众数；1000ms 的 3 个文件运行时只播前 750ms，不改资产 |
| 收招 1110ms vs 片段 1000ms | 姿态在片段内 940ms 已回落到 idle 抖动带宽内（阈值 0.0108 rad），片段末帧残余 0.0rad；需求 1110ms − 原生 1000ms = **缺口 110ms** | **方案 A（运行时补尾 110ms，不侵入资产）**；统一表 attack 总时长记 1110ms（原生 1000 + 补尾 110），命中帧不移动 |

### 2.2 统一时点表（hero005，单位 ms）

| 动作 | clip | 起手 | 命中 | 收招 | 总时长 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| idle | `idle` | 0 | — | — | 2000.0 | 循环，实测 clip 时长 |
| move | `walk` | 0 | — | — | 1000.0 | 循环，一个完整步态周期 |
| attack | `attack` | 458.0 | 458.0 | 652.0 | 1110.0 | 原生 1000 + 运行时补尾 110；实测片段内回 idle 用时 484.0ms（自命中帧起算） |
| hit | `hit` | 0 | 0.0 | 750.0 | 750.0 | 受击瞬间 = 实测角速度峰值（hand.R，峰值平台 0–38ms） |
| death | **无（合成）** | 0 | — | 1600.0 | 1600.0 | 资产内无 death 片段；= hit 末段 250ms + 1350ms 下沉（0.9 单位 / 前倾 78°） |

---

## 3. 复现命令 ③：Blender 渲染预览

```bash
cd /Users/user/Documents/Codex/youxi/meng/shuihu-game
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/motion/render_preview.py -- --hero hero005.glb
```

实际输出：

```
[render] GLB: /Users/user/Documents/Codex/youxi/meng/shuihu-game/assets/releases/ART-002/r7/models/hero005.glb
[render] armature: hero005_rig | meshes: ['hero005_costume_and_body', 'Icosphere']
[render] bbox lo: (-0.951, -1.0, -1.0) hi: (0.951, 1.0, 2.62)
[render] actions: {'idle': 'idle', 'walk': 'walk', 'attack': 'attack', 'hit': 'hit'}
[render] armature rotation_mode: XYZ | base_loc: (0.0, 0.0, 0.0) | base_rot(deg): (0.0, -0.0, 0.0)
[render]   idle: 25 帧已渲染，覆盖 0–2000.0 ms（统一表 2000.0 ms）
[render]   move: 13 帧已渲染，覆盖 0–1000.0 ms（统一表 1000.0 ms）
[render]   attack: 15 帧已渲染，覆盖 0–1110.0 ms（统一表 1110.0 ms）
[render]   hit: 10 帧已渲染，覆盖 0–750.0 ms（统一表 750.0 ms）
[render]   death: 21 帧已渲染，覆盖 0–1600.0 ms（统一表 1600.0 ms）
[render] 拼 sprite sheet ...
[render] sprite sheet: 5000 x 1300 = 802826 字节
[render] base64 长度: 1070436
[render] preview.html: /Users/user/Documents/Codex/youxi/meng/shuihu-game/docs/motion/ACT-004/03_preview/preview.html 1080864 字节
[render] 完成。
```

采样帧率 12fps（每帧 83.333ms），单元格 200×260px，引擎 `BLENDER_EEVEE`，透明背景。
每个动作采样跨度均 ≥ 统一表总时长（见 §4 自检第 1–2 组），attack/hit/death 均覆盖收招段。

### 3.1 death 是否原生

- **非原生**。18/18 个 hero GLB 的 clip 名并集为 `['attack','hit','idle','walk']`，不含 death。
- 预览中的 death = `hit` clip 末段 250ms（500–750ms 区间）+ 1350ms 合成下沉（模型整体下沉 0.9 单位、绕 X 轴前倾 78°，smoothstep 缓动），末帧保持。
- 已在 `preview.html` 上以警示条标注「**death 非资产原生**」，动作名显示为 `death（合成）`，来源 clip 显示「无（合成）」。
- 实测下沉效果：death 帧序列的角色像素质心从 y≈108.8 行降到 y≈223.1 行（260 行画面），末帧判读为「倒地/倾倒」。

---

## 4. 复现命令 ④：预览自检

```bash
python3 tools/motion/verify_preview.py --json docs/motion/ACT-004/03_preview/verify_report.json
```

实际输出（全量）：

```
[verify] PASS | idle: 帧数=25 与 meta(25) 一致 | files=25
[verify] PASS | idle: 采样总时长 2000.0ms ≥ 统一表 2000.0ms | span=2000.0ms total=2000.0ms
[verify] PASS | move: 帧数=13 与 meta(13) 一致 | files=13
[verify] PASS | move: 采样总时长 1000.0ms ≥ 统一表 1000.0ms | span=1000.0ms total=1000.0ms
[verify] PASS | attack: 帧数=15 与 meta(15) 一致 | files=15
[verify] PASS | attack: 采样总时长 1166.7ms ≥ 统一表 1110.0ms | span=1166.7ms total=1110.0ms
[verify] PASS | attack: 覆盖收招段（收招 652.0ms） | 末帧 t=1166.7ms ≥ 总时长 1110.0ms
[verify] PASS | hit: 帧数=10 与 meta(10) 一致 | files=10
[verify] PASS | hit: 采样总时长 750.0ms ≥ 统一表 750.0ms | span=750.0ms total=750.0ms
[verify] PASS | hit: 覆盖收招段（收招 750.0ms） | 末帧 t=750.0ms ≥ 总时长 750.0ms
[verify] PASS | death: 帧数=21 与 meta(21) 一致 | files=21
[verify] PASS | death: 采样总时长 1666.7ms ≥ 统一表 1600.0ms | span=1666.7ms total=1600.0ms
[verify] PASS | death: 覆盖收招段（收招 1600.0ms） | 末帧 t=1666.7ms ≥ 总时长 1600.0ms
[verify] PASS | sheet 尺寸 = cols×cw × rows×ch | 5000x1300 vs 5000x1300
[verify] PASS | sheet 逐格像素与帧文件完全一致（84 格） | 不一致 0 格
[verify] PASS | preview.html 无 http(s) 外链（已剔除 base64 段） | 外链数=0
[verify] PASS | preview.html 无 CDN 域名引用（已剔除内嵌 base64） | 命中=[]
[verify] PASS | preview.html 内嵌 base64 sprite sheet | 出现 1 次
[verify] PASS | preview.html 含 5 个动作名 | idle,move,attack,hit,death
[verify] PASS | preview.html 标注 death 非资产原生 |
[verify] PASS | 内嵌 JS 括号配平 | {=34 }=34
[verify] PASS | 内嵌 META 可解析为 JSON |
[verify] 合计 22 项，通过 22 项，ALL_PASS
[verify] 报告写入 docs/motion/ACT-004/03_preview/verify_report.json
```

---

## 5. 复现命令 ⑤：预览页播放实测（无浏览器）

```bash
node tools/motion/preview_playtest.js
```

实际输出：

```
[play] 初始 | idle | 帧 1 / 25 | 0 ms | 窗口=循环 | 命中=— 收招=— 总=2000 ms clip=idle
[play] attack 第1帧 | attack | 帧 1 / 15 | 0 ms | 窗口=起手窗口 | 命中=458 ms 收招=652 ms 总=1110 ms clip=attack
[play] attack 第6帧 | attack | 帧 6 / 15 | 417 ms | 窗口=命中窗口 | 命中=458 ms 收招=652 ms 总=1110 ms clip=attack
[play] attack 第14帧 | attack | 帧 14 / 15 | 1083 ms | 窗口=收招窗口 | 命中=458 ms 收招=652 ms 总=1110 ms clip=attack
[play] hit 第1帧 | hit | 帧 1 / 10 | 0 ms | 窗口=命中窗口 | 命中=0 ms 收招=750 ms 总=750 ms clip=hit
[play] death 第6帧 | death（合成） | 帧 6 / 21 | 417 ms | 窗口=合成（无原生片段） | 命中=— 收招=1600 ms 总=1600 ms clip=无（合成）
[play] death 警示条文案: 已显示
[play] 点击播放/暂停后按钮文案: 播放
[play] 时点表行数: 6
[play] PLAYTEST_OK
```

内嵌 JS 语法检查（可选独立复跑）：

```bash
python3 -c "h=open('docs/motion/ACT-004/03_preview/preview.html',encoding='utf-8').read();open('/tmp/preview_check.js','w').write(h.split('<script>')[1].split('</script>')[0])"
node --check /tmp/preview_check.js && echo "node --check: 通过"
```

实际输出（第一条无输出，第二条 `--check` 静默通过才 echo）：

```
node --check: 通过
```

---

## 6. 实际走过的失败与修复（如实记录）

| # | 现象 | 排查命令/依据 | 修复 |
| --- | --- | --- | --- |
| 1 | Blender 5.2 设置 `scn.render.engine = "BLENDER_EEVEE_NEXT"` 报 `TypeError: enum not found in ('BLENDER_EEVEE','BLENDER_WORKBENCH','CYCLES')` | Blender 后台冒烟脚本 | 改用 `BLENDER_EEVEE` |
| 2 | 首版 sprite sheet 全空（113KB，逐格非透明像素采样 = 0） | 纯标准库解 PNG 逐格统计 | 原因：Blender 5 后台模式下 `bpy.data.images['Render Result']` 尺寸实测为 `(0,0)`，无像素可读；改为从写出的 PNG 重新载入 |
| 3 | 改用 `bpy.data.images.load()` 后 sheet 有内容，但与帧文件逐像素不一致（采样点差异约 17%） | 逐格比对脚本 | 原因：载入 8bit PNG 时 Blender 按 sRGB 转线性，再经 float buffer + 视图变换二次转换；改为**纯标准库 PNG 解码/编码拼图**（不经过 Blender 色彩管理），差异归零 |
| 4 | death 前倾不生效 | 查 `arm.rotation_mode` | glTF 导入对象默认 `QUATERNION`，写 `rotation_euler` 无效；改为先切 `rotation_mode='XYZ'` 再写欧拉角 |
| 5 | death 初版下沉幅度偏小（0.55 单位 / 62°），肉眼看不出倒地 | 逐帧像素质心统计（cy 109→136/260 行） | 提高到 0.9 单位 / 78°，末帧质心 cy≈223/260 行，判读为倒地 |
| 6 | 自检项「无 cdn 关键字」误报 | 打印命中上下文 | 命中是页面说明文字「无 CDN」与 base64 中的随机字符；改为只查 CDN 域名正则并剔除内嵌 base64 段 |

---

## 7. 未测 / 未达成项（如实列出）

1. **未在真实浏览器里打开 `preview.html` 逐帧目视**：本机只做了 node 侧的无头 DOM stub 播放实测（§5）与像素级自检（§4），
   未做真实浏览器渲染验证。用浏览器直接打开该文件即可复核（文件自带全部资源，无需联网）。
2. **attack 补尾 110ms 未按「与 idle 交叉淡入」实现**：预览里按「保持末帧姿态」补尾。
   依据是实测 attack 末帧与 idle 首帧姿态残余 D_rot = 0.0 rad（完全一致），故两者观感等价；
   真正的 cross-fade 曲线需要在运行时播放层实现，本轮未实现。
3. **death 的合成参数（250ms 末段 / 1350ms 下沉 / 0.9 单位 / 78°）是人工选定值**，
   不是资产实测值（资产内无 death 数据可测），仅用于「能播放」的预览。
4. **只做了 hero005 一个角色的预览**：hero006 等未渲染（任务要求一角色五动作）。
   时点裁决与探测覆盖全部 18 个文件。
5. **未对 3 个 hit=1000ms 的异常文件（hero006/013/014）做运行时裁剪验证**：
   统一表裁决为 750ms，但只在规格层面给出「播放前 750ms」的处理，未在引擎里实跑。
6. **武器挂点仍未解决资产层面**：实测无专用挂点节点，运行时需在 `hand.R` 骨骼下自建挂点，本轮未实现挂载验证。
7. **未做帧率更高（如 24fps）的采样**：当前 12fps（每帧 83.333ms），动作细节受采样限制。

---

## 8. 改动范围自查

```bash
cd /Users/user/Documents/Codex/youxi/meng && git status --porcelain
```

本轮只在以下两个目录新增文件（未改 `assets/`、`game.js`、`data/`、`godot/`、`tests/`）：

- `shuihu-game/docs/motion/ACT-004/`（含 `01_glb_probe.md`、`02_timing_resolution.md`、`03_preview/`、`04_acceptance.md`、`probe/`、`timing_unified.json`）
- `shuihu-game/tools/motion/`（5 个脚本）

`git status` 中显示的其他 `M`/`??` 条目（如 `agents.md`、`game.js`、`tavern-*.js`、`assets/releases/...` 等）
在本轮开始之前就已存在，非本轮改动。本轮未执行任何 `git commit`。
