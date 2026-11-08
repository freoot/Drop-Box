# CMD-004 · 引擎与借鉴库选型

> 日期：2026-10-27（Asia/Shanghai）
> 项目根：`/Users/user/Documents/Codex/youxi/meng/shuihu-game`
> 角色：WorkBuddy（只出选型文档；不改业务代码、不改资产、不改 `project.godot`、不导出 Steam）
> 上游依据：`docs/pipeline/01_gap_and_borrow.md`（B 可借鉴清单、C 冻结假设）、`docs/collaboration/handoffs/CMD-001-gap-and-borrow.md`、`docs/pipeline/02_gacha_desire_spec.md`（C.3 展示场景清单）
> 本文所有判断均附可核验证据（路径 / 版本号 / 行数 / 命令输出）。引擎能力的逐项差异以 Godot 官方渲染器文档为准，本文标注为「文档口径」，本机未逐项实测。

---

## 0. 本步边界

| 项目 | 状态 |
|---|---|
| `assets/`、`game.js`、`tavern-ui.js`、`data/` | 未改动（只读） |
| `godot/**` 业务场景与脚本 | 未改动（只读） |
| `project.godot` 主配置 | 未改动（只读） |
| 候选引擎 | **未迁入工程**，仅文档对比 |
| Steam 导出 | 未执行 |
| 新建 | 本文 + `04_acceptance_selfcheck.md` |
| 与 CMD-003 关系 | 不阻塞、不重做；本步独立成立 |

---

## A. 调研范围与方法

### A.1 对象一：WorkBuddy 开源游戏技能目录

**打开内容**：`~/.workbuddy/skills/open-source-games/SKILL.md`（自建技能，17 分类索引）、`references/catalog.md`（上游 `bobeff/open-source-games` 的 README 快照，CC0）。

**核对结果**：

| 事实 | 证据 |
|---|---|
| 目录共 **163** 条 | `grep -c "^- \*\*" references/catalog.md` → 163 |
| 其中标注 Godot 引擎的条目仅 **2** 条 | 第 76 行 Unknown Horizons 的 **Godot port**（`github.com/unknown-horizons/godot-port`）；第 90 行 **Liblast**（"built with Godot 4 engine"，`codeberg.org/liblast/liblast`） |
| 无抽卡 / 收集类条目 | 检索 `collect|gacha|card|creature` → 命中 0 |
| 分类分布偏 PC 传统品类 | 第一人称 33、RPG 23、即时战略 21、回合制 12、赛车 12，无「收集养成」分类 |

**对本作的含义**：这份目录的强项是**游戏机制与工程组织**的横向参照，弱项正是本作核心——**抽卡展示与收集欲**。因此机制借鉴必须回到 CMD-001 的 B 表（Ancient Beast / Shattered Pixel Dungeon / Wesnoth），目录本身只能提供「Godot 工程怎么组织」和「RTS/战棋的关卡与单位信息架构」两类输入。这一点直接影响 F 节的优先级排序。

### A.2 对象二：`~/萌三国` 工程

**打开内容**：`~/萌三国/project.godot` 与全目录清单（只读，未在编辑器中打开、未保存）。

**核对结果**：

| 事实 | 证据 |
|---|---|
| 全工程仅 **6** 个文件（不含 `.godot/`）：`.editorconfig`、`.gitattributes`、`.gitignore`、`icon.svg`、`icon.svg.import`、`project.godot` | `find ~/萌三国 -type f -not -path "*/.godot/*"` |
| **0 个 `.tscn`、0 个 `.gd`** | 同上清单 |
| 声明引擎与渲染：`config/features=PackedStringArray("4.7", "Forward Plus")` | `~/萌三国/project.godot` `[application]` |
| 物理：`3d/physics_engine="Jolt Physics"` | 同上 `[physics]` |
| Windows 图形驱动：`rendering_device/driver.windows="d3d12"` | 同上 `[rendering]` |
| 拉伸：`canvas_items` + `expand` | 同上 `[display]` |
| `.godot/imported` 目录存在、`icon.svg.import` 已生成 | 说明该工程至少被编辑器打开并导入过一次 |

**可学 / 不可学**：

- **可学（配置层）**：Forward Plus 作为目标渲染路径、Jolt 物理、Windows 走 `d3d12`、`canvas_items + expand` 的拉伸模式（与本作一致）。
- **不可学（内容层）**：它**没有任何场景与脚本**。CMD-001 已提示「不宜假设其已有完整场景树」，本次核对证实该判断成立——它是一份**已配置好的空壳**，可作工程开关基准，不能作玩法或场景结构模板。

### A.3 对象三：`shuihu-game` 现有 Godot 入口

**打开内容**：根 `project.godot`、`godot/journey_map/journey_map.tscn` 与 `.gd`、`godot/art_002/*`、`godot/tests/smoke_test.gd`、`.godot/` 缓存状态；并以本机 Godot 命令行做只读冒烟测试。

**核对结果**：

| 事实 | 证据 |
|---|---|
| 本机引擎版本：**4.7.2.stable.official.ed1daf0bf** | `/Applications/Godot.app/Contents/MacOS/Godot --version` |
| 渲染路径：`renderer/rendering_method="gl_compatibility"`，且 `.mobile` 同为 `gl_compatibility` | 根 `project.godot` `[rendering]` |
| 未声明 `config/features` | 根 `project.godot` 无该行（与萌三国的 `"4.7","Forward Plus"` 形成对照） |
| GDScript 总量 **810** 行 | `wc -l godot/**/*.gd`：journey_map 61、battlefield_sample 323、batch_review 273、hero_sample 80、test_samples 46、smoke_test 27 |
| 主场景是 **Control 型 2D 界面**，含 6 个写死的地点节点 | `journey_map.tscn` 根节点 `type="Control"`；`journey_map.gd` 中 `STAGES` 数组 6 条 |
| `battlefield_sample.tscn` 只有 **1 个 `Node3D` 根节点**，无相机、无灯光、无环境 | `grep "^\[node" godot/art_002/battlefield_sample.tscn` 仅 1 行 |
| 3D 角色样板已能加载 GLB 并驱动动作 | `hero_sample.gd`：`model_scene` 实例化 + `AnimationPlayer` 查找 + `idle/attack/hit/walk` 状态机 |
| 可用 3D 素材 **18** 个 GLB | `assets/releases/ART-002/r7/models/hero*.glb` 共 18 个 |
| **无** `export_presets.cfg` | `ls export_presets.cfg` → No such file |

**关键新发现（与既往记录不一致，需指挥官知悉）**：

工程里 **一个 `.import` 文件都没有**，`.godot/imported/` 为空目录。直接以命令行跑现有冒烟测试，结果是**失败**：

```
$ /Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script godot/tests/smoke_test.gd
ERROR: res://godot/journey_map/journey_map.tscn:22 - Parse Error: [ext_resource] referenced non-existent resource at: res://assets/liangshan-journey-map.png
ERROR: missing journey map texture
```

而 `assets/liangshan-journey-map.png` 实际存在（3,485,179 字节，10-10 18:06）。原因是 `journey_map.tscn:22` 用 `ext_resource type="Texture2D"` 引用该 PNG，而 PNG 在 Godot 里必须先经导入生成 `.import` 才能被 `ResourceLoader` 识别；当前工作副本**从未导入过**（`find . -name "*.import" | wc -l` → 0）。

含义有两层：
1. `docs/GAMEPLAY_REVIEW.md` 所记「已在原生场景中通过无界面加载测试」，在**当前工作副本**上不可复现——不是场景写错，是缺导入。首次在编辑器打开并导入后应可恢复，但**在导入前，任何「Godot 侧已跑通」的结论都应打折看**。
2. 对选型而言这是**利好信号**：既然还没有任何导入缓存，此时切换渲染路径不触发大规模重新导入，成本处于历史低位。

### A.4 方法与局限

- 方法：文件级只读核对 + 本机引擎命令行实测 + 技能目录全文检索。全部结论可用路径与命令复现（见 `04_acceptance_selfcheck.md` 的验证步骤）。
- 局限：未在编辑器中实际打开工程（避免生成 `.import` 与缓存，属本步禁改范围）；未对 Forward+ 在目标机上做帧率实测；引擎能力差异引自 Godot 官方渲染器文档的 Feature comparison，**未在本机逐项验证**。

---

## B. 候选方案

### 方案 1 · Godot 4.7.2 Compatibility 继续加深（维持现状）

- **名称**：Godot 4.7.2 + `gl_compatibility`（现行配置不变）
- **匹配点**：主场景是 Control 2D 山水地图，Compatibility 对 2D 足够；工程已按此配置存在，改动量为零；对低配机器与老 GPU 更宽容。
- **风险**：macOS 上 Compatibility 走 OpenGL 3.3，而 Apple 自 10.14 起已将其标记为废弃（文档口径），在 Apple Silicon 上属兼容路径；渲染能力上缺 SSAO / SSIL / SSR / 体积雾 / 软阴影等屏幕空间与体积类效果（文档口径），而抽卡演出恰恰依赖补光、光尘与氛围。
- **迁移/并行成本**：**0**（不动配置）。
- **与抽卡展示的关系**：能满足「卡面 + 立绘 + 简单粒子」，难以满足 CMD-002 C.3 里「主光 + 补光 + 环境雾 + 品质色」这套偏实时的灯光语言；后续要靠贴图与 UI 特效补，属于用美术成本换技术成本。

### 方案 2 · Godot 4.7.2 切 Forward+（对齐萌三国）

- **名称**：Godot 4.7.2 + Forward+，参照 `~/萌三国/project.godot` 的 `config/features` 与物理/驱动设置
- **匹配点**：目标是 Steam 桌面端 3D Q 版 + 抽卡演出；Forward+ 提供 SSAO、软阴影、Glow、体积雾等（文档口径），是「舞台感」的常规做法；macOS 侧 Godot 4.4 起有原生 Metal 驱动，本机 4.7.2 已具备；萌三国已用同一组合，团队配置口径统一。
- **风险**：Forward+ 无 Web 导出（文档口径）——但**本作网页版是独立手写的 HTML/JS，不是 Godot Web 导出**，因此该限制在本项目里不构成损失；低端 Windows 机器对 Vulkan/D3D12 的兼容性需实测；切换到 Forward+ 后 3D 场景需重新校光。
- **迁移/并行成本**：**低**。当前 Godot 侧仅 810 行 GDScript、1 个 Control 场景 + 1 个空 `Node3D`、0 个导入缓存，改的是 `[rendering]` 与 `[application]` 两处配置。
- **与抽卡展示的关系**：直接服务 CMD-002 C.3 的灯光与粒子要求；品质色补光、光尘、暗金特写这类效果在 Forward+ 下实现路径更短。

### 方案 3 · 网页主交付长期并行（非 Godot 对照）

- **名称**：以 `index.html` + `game.js` 为主交付，Godot 仅作并行试验
- **匹配点**：网页版玩法完整度当前高于 Godot（`game.js` 105,981 字节，含战斗、养成、招贤、装备；Godot 侧 810 行且仅有地图入口）；迭代速度快，无需导入与打包。
- **风险**：无 Steam 原生交付路径（`export_presets.cfg` 不存在，Steamworks/成就/云存档均无痕迹）；无法承载 3D Q 版与 GLB 模型展示；浏览器性能与存档（`localStorage`）不适合作为商业主交付。
- **迁移/并行成本**：**表面最低、长期最高**——省掉引擎工作，但把「3D 展示 + Steam 上架」这两件本作核心诉求推倒。
- **与抽卡展示的关系**：能验证欲望环（CMD-003 已在此路径落地），但**验证不了「抽到好看」**——CMD-002 C.1 的 L3 立体亮相依赖 GLB，网页侧没有对等方案。
- **结论**：作为**验证场**保留，不作主交付。这与 CMD-001 冻结假设一致，故列为对照而非候选主选。

---

## C. 对比表

| 维度 | 方案 1 Compatibility | 方案 2 Forward+ | 方案 3 网页主交付 |
|---|---|---|---|
| 渲染路径 | OpenGL 3.3 / GLES 3.0（macOS 走已废弃的 OpenGL） | Vulkan / D3D12（macOS 4.4+ 原生 Metal） | 浏览器 Canvas/CSS |
| 3D Q 版可行性 | 可跑，缺 SSAO/软阴影/体积雾，舞台感靠贴图补 | 可完整支撑灯光与后处理 | 仅 2D 拼贴，无 3D |
| 导出 Steam | 可（需补 `export_presets.cfg`） | 可（同左） | 不可原生 |
| 现有资产复用 | 2D 立绘/背景 100%；GLB 可用 | 2D 同左；GLB 更适合做展示 | 仅 2D 图 |
| 团队操控成本 | 零改动，但效果上限受限 | 改 2 处配置 + 重新校光 | 无引擎成本，但无法交付 Steam |
| 与 CMD-002/003 抽卡节奏契合 | 能验证循环，演出层级只能到 L1/L2 | 可覆盖 L1–L3 全档 | 只到 L1，L3 无方案 |
| 切换/建设成本（当前时点） | 0 | 低（0 `.import`、810 行脚本） | 高（等于放弃主交付） |
| 与萌三国配置一致性 | 不一致 | 一致 | 不适用 |

---

## D. 推荐结论（强制）

**推荐采用：Godot 4.7.2 + Forward+ 作为主交付渲染路径；Compatibility 不再作为与 3D 展示相关的默认路径，仅保留为「低配/Web 端」备选。**

推荐理由（7 条，逐条可核验）：

1. **网页版是独立实现，不是 Godot Web 导出，所以 Compatibility 的核心优势在本项目用不上。**
   证据：`index.html`（1,968 字节）直接加载 `game.js`（105,981 字节）与多个手写 JS，与 Godot 无关；根 `project.godot` 中无 Web 导出相关配置。Compatibility 的最大价值是 Web 导出与老 GPU 兼容，本作的网页验证路径已由手写前端承担。

2. **本机引擎版本已满足 Forward+ 在 macOS 走原生 Metal 的条件。**
   证据：`Godot --version` → `4.7.2.stable.official.ed1daf0bf`。Godot 4.4 起提供原生 Metal 驱动（文档口径），Compatibility 则仍走 Apple 已标记废弃的 OpenGL 3.3。

3. **团队风格基准工程本身就是 Forward+。**
   证据：`~/萌三国/project.godot` → `config/features=PackedStringArray("4.7", "Forward Plus")`、`3d/physics_engine="Jolt Physics"`、`rendering_device/driver.windows="d3d12"`。CMD-001 将其列为「风格与体量参照」，配置对齐可减少两套口径的解释成本。

4. **抽卡展示的规格要求指向 Forward+，而非 Compatibility。**
   证据：`docs/pipeline/02_gacha_desire_spec.md` C.3 第 3–5 条明确要 `WorldEnvironment` + 主光 + 随品质变色的补光 + 粒子层，并要求「避开 Forward+ 专有能力」的写法是为 `gl_compatibility` 让路。若主交付本就该给舞台感，让路的方向就反了——正确做法是把该约束限定在「低配备选」里。

5. **现在切换的代价处于历史低位，等山景与角色管线落地后再切会显著变贵。**
   证据：Godot 侧 GDScript 合计 810 行（journey_map 61 / battlefield_sample 323 / batch_review 273 / hero_sample 80 / test_samples 46 / smoke_test 27）；`battlefield_sample.tscn` 仅 1 个 `Node3D` 根节点，无相机与灯光可被破坏；`find . -name "*.import" | wc -l` → **0**，尚无与旧渲染路径绑定的导入缓存。

6. **3D 展示所需的素材与加载能力已经就位，缺的只是渲染路径。**
   证据：`assets/releases/ART-002/r7/models/` 下 18 个 `hero*.glb`；`godot/art_002/hero_sample.gd` 已实现 `model_scene` 实例化、`AnimationPlayer` 查找与 `idle/walk/attack/hit` 状态切换，说明导入 GLB 驱动动作的链路可行。

7. **迁移面被限定在两处配置，可回滚、可验证。**
   证据：需改动的只有根 `project.godot` 的 `[application] config/features` 与 `[rendering] renderer/rendering_method`（以及可选的 `3d/physics_engine`）；主场景 `journey_map.tscn` 是 Control 2D，不依赖渲染路径。`godot/tests/smoke_test.gd` 可作为切换后的回归入口（27 行，校验场景加载与 6 个路线节点）。

> 反面证据也一并写明：本步实测发现工程当前处于**未导入状态**（0 个 `.import`，冒烟测试报 `missing journey map texture`）。这不构成对 Forward+ 的反对，但意味着**切换前必须先完成一次导入并让冒烟测试转绿**，否则无法区分「渲染路径引入的回归」与「原本就没导入」。

---

## E. 对后续步骤的影响

| 后续步骤 | 影响 |
|---|---|
| **山景美化（原 #3）** | 在 Forward+ 下做分层山体与烘焙/实时混合光照更顺；若仍用 Compatibility，建议只做「够用的舞台」并接受无环境光遮蔽的平光观感。 |
| **角色管线（原 #4）** | GLB + `hero_sample.gd` 的既有链路可直接复用；补美排序不变（仍以 CMD-002 C.4 的优先级为准：先补暗金三人定帧立绘）。 |
| **Steam 候选包（原 #6）** | 两条渲染路径都需要新建 `export_presets.cfg`；Forward+ 需在目标 Windows 机器上验 D3D12 可用性，并在导出预设里保留 Mobile 作为低端回落。 |

### 需指挥官改口的点（与 CMD-001 冻结假设的关系）

CMD-001 冻结的是「**引擎主交付以 Godot 为准**」——本推荐**不推翻该条**，Godot 仍是主交付。需要改口的只有**渲染路径这一层**：

| 项 | 冻结时的表述 | 本步建议 |
|---|---|---|
| 渲染路径 | `project.godot` 现状为 `gl_compatibility`，CMD-002 C.3 亦按此写「避开 Forward+ 专有能力」 | 改为主交付 **Forward+**；`gl_compatibility` 降为低配/Web 备选，CMD-002 C.3 的约束随之收窄到备选路径 |

若指挥官不采纳，方案 1（维持 Compatibility）在功能上仍可成立，代价是抽卡演出长期停在 L1/L2，且 3D Q 版的光照表现会持续弱于萌三国基准。

---

## F. 借鉴库优先级

排序依据：与「Godot 工程组织」和「抽卡/收集展示」两条主线的相关度，而非项目热度。

### 先读（与推荐引擎直接相关，1–2 周内消化）

| # | 项目 | 为什么先读 | 与 Forward+ 的关系 |
|---|---|---|---|
| 1 | **Unknown Horizons · Godot port**<br>`github.com/unknown-horizons/godot-port` | 目录中仅有的两条 Godot 条目之一（catalog 第 76 行），且同为「从旧引擎迁到 Godot」的在途工程——可直接对照目录分层、场景组织、旧逻辑与 Godot 节点的边界划分 | 引擎同族，读它的 `project.godot` 与场景分层不受渲染路径影响 |
| 2 | **Ancient Beast**<br>`ancientbeast.com` / `github.com/FreezingMoon/AncientBeast` | 单位图鉴式收集 + 详情页，正对「抽到后想去看、看完想再抽」的信息架构（CMD-001 B 表 #3） | 3D 单位展示的做法可映射到 Forward+ 的舞台布光 |
| 3 | **Shattered Pixel Dungeon**<br>`shatteredpixel.com` | 短局奖励 → 再来一次的节奏控制，对应 CMD-002 A.2 的「保底临近 / 重复补偿」心理梯度（B 表 #4） | 与渲染无关，纯机制 |

### 后读（结构参照，等 P1 演出落地后再看）

| # | 项目 | 用途 |
|---|---|---|
| 4 | **The Battle for Wesnoth** `wesnoth.org` | 章节解锁 → 短剧情 → 战斗的信息架构（B 表 #2），服务 D 节的「抽到后去哪」 |
| 5 | **Liblast** `libla.st` / `codeberg.org/liblast/liblast` | 目录中另一条 Godot 4 条目（catalog 第 90 行），可看 Godot 4 的工程与全开源工具链组织；因是 FPS，玩法参照价值低 |
| 6 | **OpenXcom** `openxcom.org` | 名册/招募/装备槽的管理型 UI（B 表 #5），与将册页排版相关 |

### 不读（明确排除，避免浪费时间）

| 项目 / 类别 | 排除理由 |
|---|---|
| 目录中 33 条第一人称与 12 条赛车类（如 `.kkrieger`、`Cube 2`、`Descent 3`、`Red Eclipse`） | 与 3D Q 版战棋 + 抽卡的诉求无交集 |
| 需自备原版资源的复刻引擎（OpenRCT2 / OpenLoco / CorsixTH / ScummVM 一类） | 其工程价值集中在「逆向与资源兼容」，与本作从零建场景的路径不同 |
| Athena Crisis、micropolisJS 等 2D 战棋/模拟 | 可读但优先级低于前两组；待 P2 再评估 |
| 目录外的商业抽卡产品 | 仅可作观感参考，不作工程参照（且不抄素材） |

**一句话总结**：目录能给的是「Godot 工程怎么组织」和「战棋/收集的信息架构」，给不了「抽卡经济与演出」——后者继续以 CMD-002 规格为准。

---

## 附：本步未做但建议下一步验证的事

1. 在编辑器打开工程完成一次导入，确认 `smoke_test.gd` 转绿（当前 0 个 `.import`）。
2. 在 `project.godot` 备份后试切 Forward+，跑冒烟测试 + 打开 `journey_map` 与 `battlefield_sample` 比对观感；这一步属 CMD-005 或指挥官另行派单，本步不执行。
3. 在目标 Windows 机器上验 D3D12（对齐萌三国的 `driver.windows="d3d12"`）。
