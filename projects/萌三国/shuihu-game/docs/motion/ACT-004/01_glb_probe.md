# ACT-004 · GLB 实测探测报告（01）

- 生成脚本：`tools/motion/probe_glb.py`
- 生成时间：2026-10-29T04:25:04
- Python：3.13.12
- 探测目录：`assets/releases/ART-002/r7/models`
- 文件数：18（其中解析成功 18，失败 0）
- 本文件由脚本自动生成，禁止手改；所有数字均来自 GLB 实际字节

## 1. 结论速览

| 项 | 实测结论 |
| --- | --- |
| 容器格式 | 全部为 GLB（magic `glTF`，version [2]，JSON+BIN 两 chunk） |
| clip 名称集合 | ['attack', 'hit', 'idle', 'walk'] |
| 是否存在 death clip | 不存在 |
| 武器/道具专用挂点节点（weapon/prop/sword/blade/spear/staff/axe） | 不存在（0/18 个文件） |
| 命中关键词的节点（全部文件，含骨骼名 hand） | ['hand.L', 'hand.R'] |
| 其中属「武器/道具专用名词」的节点 | 无 |
| skins[].joints 节点名集合 | ['arm.L', 'arm.R', 'body', 'foot.L', 'foot.R', 'hand.L', 'hand.R', 'head', 'leg.L', 'leg.R', 'root'] |

## 2. 单文件明细

### 2.1 `hero002.glb`

- 字节数：1077636，sha256 前 16 位：`15258faf08d3a1ae`
- 容器：magic `glTF` v2，declared=1077636，actual=1077636，chunk=2（JSON+BIN），JSON=44264B，BIN=1033344B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=12，animations=4，skins=1，accessors=185，顶点=16585，索引=63426
- 场景根：`['hero002_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero002_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero002_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero002_costume_and_body` | `hero002_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero002_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.2 `hero005.glb`

- 字节数：959800，sha256 前 16 位：`7ac9ec719ce73a8d`
- 容器：magic `glTF` v2，declared=959800，actual=959800，chunk=2（JSON+BIN），JSON=42892B，BIN=916880B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=14409，索引=61770
- 场景根：`['hero005_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero005_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero005_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero005_costume_and_body` | `hero005_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero005_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.3 `hero006.glb`

- 字节数：929472，sha256 前 16 位：`0c90d6e226b2492a`
- 容器：magic `glTF` v2，declared=929472，actual=929472，chunk=2（JSON+BIN），JSON=34140B，BIN=895304B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=106，顶点=14753，索引=63900
- 场景根：`['hero006_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 1958.333 | 33 | 48 / 48 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'STEP': 31, 'LINEAR': 2}`（各 clip 一致：否）
- 时间轴区间：min=0.041667s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero006_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero006_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero006_costume_and_body` | `hero006_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero006_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.4 `hero007.glb`

- 字节数：1021652，sha256 前 16 位：`da1cec8af15c4026`
- 容器：magic `glTF` v2，declared=1021652，actual=1021652，chunk=2（JSON+BIN），JSON=44212B，BIN=977412B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=12，animations=4，skins=1，accessors=185，顶点=15520，索引=63150
- 场景根：`['hero007_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero007_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero007_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero007_costume_and_body` | `hero007_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero007_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.5 `hero008.glb`

- 字节数：1248460，sha256 前 16 位：`cf228f10edc7bbd1`
- 容器：magic `glTF` v2，declared=1248460，actual=1248460，chunk=2（JSON+BIN），JSON=41784B，BIN=1206648B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=10，animations=4，skins=1，accessors=173，顶点=19729，索引=68334
- 场景根：`['hero008_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero008_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero008_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero008_costume_and_body` | `hero008_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero008_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.6 `hero010.glb`

- 字节数：884632，sha256 前 16 位：`089eda2b91928620`
- 容器：magic `glTF` v2，declared=884632，actual=884632，chunk=2（JSON+BIN），JSON=42684B，BIN=841920B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=178，顶点=13103，索引=62037
- 场景根：`['hero010_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero010_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero010_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero010_costume_and_body` | `hero010_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero010_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.7 `hero011.glb`

- 字节数：984984，sha256 前 16 位：`ddad399dc601ca71`
- 容器：magic `glTF` v2，declared=984984，actual=984984，chunk=2（JSON+BIN），JSON=42912B，BIN=942044B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=14811，索引=63900
- 场景根：`['hero011_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero011_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero011_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero011_costume_and_body` | `hero011_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero011_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.8 `hero012.glb`

- 字节数：907048，sha256 前 16 位：`c490ce1f52f96a7b`
- 容器：magic `glTF` v2，declared=907048，actual=907048，chunk=2（JSON+BIN），JSON=42896B，BIN=864124B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=13544，索引=57882
- 场景根：`['hero012_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero012_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero012_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero012_costume_and_body` | `hero012_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero012_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.9 `hero013.glb`

- 字节数：802368，sha256 前 16 位：`3495b5a1aaffd3d8`
- 容器：magic `glTF` v2，declared=802368，actual=802368，chunk=2（JSON+BIN），JSON=34296B，BIN=768044B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=108，顶点=12345，索引=59073
- 场景根：`['hero013_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 1958.333 | 33 | 48 / 48 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'STEP': 31, 'LINEAR': 2}`（各 clip 一致：否）
- 时间轴区间：min=0.041667s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero013_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero013_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero013_costume_and_body` | `hero013_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero013_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.10 `hero014.glb`

- 字节数：795464，sha256 前 16 位：`7d0f79be8573cd6e`
- 容器：magic `glTF` v2，declared=795464，actual=795464，chunk=2（JSON+BIN），JSON=34244B，BIN=761192B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=107，顶点=12236，索引=58494
- 场景根：`['hero014_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 1958.333 | 33 | 48 / 48 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'STEP': 31, 'LINEAR': 2}`（各 clip 一致：否）
- 时间轴区间：min=0.041667s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero014_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero014_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero014_costume_and_body` | `hero014_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero014_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.11 `hero015.glb`

- 字节数：923828，sha256 前 16 位：`235542b3bbbc6b62`
- 容器：magic `glTF` v2，declared=923828，actual=923828，chunk=2（JSON+BIN），JSON=42888B，BIN=880912B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=13763，索引=60582
- 场景根：`['hero015_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero015_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero015_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero015_costume_and_body` | `hero015_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero015_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.12 `hero017.glb`

- 字节数：914552，sha256 前 16 位：`98b5680c7fb0103e`
- 容器：magic `glTF` v2，declared=914552，actual=914552，chunk=2（JSON+BIN），JSON=42764B，BIN=871760B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=178，顶点=13696，索引=58899
- 场景根：`['hero017_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero017_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero017_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero017_costume_and_body` | `hero017_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero017_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.13 `hero019.glb`

- 字节数：931060，sha256 前 16 位：`915f071311c1685a`
- 容器：magic `glTF` v2，declared=931060，actual=931060，chunk=2（JSON+BIN），JSON=42892B，BIN=888140B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=13933，索引=59775
- 场景根：`['hero019_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero019_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero019_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero019_costume_and_body` | `hero019_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero019_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.14 `hero021.glb`

- 字节数：891200，sha256 前 16 位：`5550ce4cf82fc57d`
- 容器：magic `glTF` v2，declared=891200，actual=891200，chunk=2（JSON+BIN），JSON=42868B，BIN=848304B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=13138，索引=60528
- 场景根：`['hero021_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero021_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero021_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero021_costume_and_body` | `hero021_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero021_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.15 `hero022.glb`

- 字节数：903796，sha256 前 16 位：`5bb4a80773015b0a`
- 容器：magic `glTF` v2，declared=903796，actual=903796，chunk=2（JSON+BIN），JSON=42868B，BIN=860900B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=13365，索引=60924
- 场景根：`['hero022_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero022_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero022_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero022_costume_and_body` | `hero022_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero022_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.16 `hero023.glb`

- 字节数：989608，sha256 前 16 位：`22d528ed50046663`
- 容器：magic `glTF` v2，declared=989608，actual=989608，chunk=2（JSON+BIN），JSON=42872B，BIN=946708B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=14963，索引=62280
- 场景根：`['hero023_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero023_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero023_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero023_costume_and_body` | `hero023_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero023_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.17 `hero024.glb`

- 字节数：877192，sha256 前 16 位：`9ae7e8c2535c0995`
- 容器：magic `glTF` v2，declared=877192，actual=877192，chunk=2（JSON+BIN），JSON=42864B，BIN=834300B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=12913，索引=59376
- 场景根：`['hero024_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero024_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero024_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero024_costume_and_body` | `hero024_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero024_rig` | `None` | 2 | 否 | 否 | 否 |

### 2.18 `hero025.glb`

- 字节数：921032，sha256 前 16 位：`87e3950bf685a6d7`
- 容器：magic `glTF` v2，declared=921032，actual=921032，chunk=2（JSON+BIN），JSON=42876B，BIN=878128B
- generator：`Khronos glTF Blender I/O v5.2.40`，glTF `2.0`
- 计数：nodes=13，meshes=1，materials=11，animations=4，skins=1，accessors=179，顶点=13769，索引=59034
- 场景根：`['hero025_rig']`

**动画 clip 实测**

| # | clip 名 | duration(ms) | 通道数 | 关键帧时间戳数(去重/单采样器最大) | target.path 分布 | 实际驱动节点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 2000.0 | 33 | 49 / 49 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 1 | `walk` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 2 | `attack` | 1000.0 | 33 | 25 / 25 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |
| 3 | `hit` | 750.0 | 33 | 19 / 19 | rotation×11，scale×11，translation×11 | `arm.L`，`arm.R`，`body`，`foot.L`，`foot.R`，`hand.L`，`hand.R`，`head`，`leg.L`，`leg.R`，`root` |

- 插值方式分布：`{'LINEAR': 33}`（各 clip 一致：是）
- 时间轴区间：min=0.0s，max=2.0s（首个 clip；各 clip 见上表）

**skins[].joints 节点名全表**

- skin[0] `hero025_rig`，skeleton 根=`None`，共 11 个 joint：

| # | joint 名 | 命中武器关键词 |
| --- | --- | --- |
| 0 | `root` | 否 |
| 1 | `body` | 否 |
| 2 | `arm.L` | 否 |
| 3 | `hand.L` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 4 | `arm.R` | 否 |
| 5 | `hand.R` | 是（hand、weapon、prop、sword、blade、spear、staff、axe 中的匹配） |
| 6 | `head` | 否 |
| 7 | `leg.L` | 否 |
| 8 | `foot.L` | 否 |
| 9 | `leg.R` | 否 |
| 10 | `foot.R` | 否 |

**武器/道具挂点搜索**

- 搜索关键词：`['hand', 'weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`（其中「武器/道具专用名词」= `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']`）
- 命中 2 个节点：

| 节点 | 命中关键词 | 属武器/道具专用名词 | 是 skin joint | 挂 mesh | 子节点 |
| --- | --- | --- | --- | --- | --- |
| `hand.L` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |
| `hand.R` | hand | 否（仅骨骼名命中 hand） | 是 | 否 | 0 |

- **结论：该文件内不存在独立的武器/道具挂点节点**——命中的仅为骨骼名含 `hand` 的骨骼节点。

**节点全表**

| # | 节点名 | 父节点 | 子节点数 | skin joint | 挂 mesh | 含武器关键词 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `hand.L` | `arm.L` | 0 | 是 | 否 | 是 |
| 1 | `arm.L` | `body` | 1 | 是 | 否 | 否 |
| 2 | `hand.R` | `arm.R` | 0 | 是 | 否 | 是 |
| 3 | `arm.R` | `body` | 1 | 是 | 否 | 否 |
| 4 | `head` | `body` | 0 | 是 | 否 | 否 |
| 5 | `body` | `root` | 3 | 是 | 否 | 否 |
| 6 | `foot.L` | `leg.L` | 0 | 是 | 否 | 否 |
| 7 | `leg.L` | `root` | 1 | 是 | 否 | 否 |
| 8 | `foot.R` | `leg.R` | 0 | 是 | 否 | 否 |
| 9 | `leg.R` | `root` | 1 | 是 | 否 | 否 |
| 10 | `root` | `hero025_rig` | 3 | 是 | 否 | 否 |
| 11 | `hero025_costume_and_body` | `hero025_rig` | 0 | 否 | 是 | 否 |
| 12 | `hero025_rig` | `None` | 2 | 否 | 否 | 否 |

## 3. 跨文件汇总

| 文件 | animations | nodes | skins | clip 名 | clip 时长(ms) | 武器关键词节点 |
| --- | --- | --- | --- | --- | --- | --- |
| `hero002.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero005.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero006.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 1958.333、1000.0、1000.0、1000.0 | `hand.L`、`hand.R` |
| `hero007.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero008.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero010.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero011.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero012.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero013.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 1958.333、1000.0、1000.0、1000.0 | `hand.L`、`hand.R` |
| `hero014.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 1958.333、1000.0、1000.0、1000.0 | `hand.L`、`hand.R` |
| `hero015.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero017.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero019.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero021.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero022.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero023.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero024.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |
| `hero025.glb` | 4 | 13 | 1 | `idle`、`walk`、`attack`、`hit` | 2000.0、1000.0、1000.0、750.0 | `hand.L`、`hand.R` |

## 4. 与 ACT-003 假设的对照

- ACT-003 将武器挂点暂拟为 `hand.R`，但未读 GLB 内部数据。实测（18/18 文件）：
  - `hand.R` 在所有文件中均作为 skin joint（骨骼）存在
  - 节点名含 `['weapon', 'prop', 'sword', 'blade', 'spear', 'staff', 'axe']` 任一词的节点数：0（不存在）
  - 命中 `hand` 关键词的节点：['hand.L', 'hand.R']，全部为 skin joint、均不挂 mesh
- 结论：**资产内不存在武器/道具专用挂点节点**。`hand.R` 是骨骼（末端骨）而非挂点空节点；ACT-003 的 `hand.R` 是按骨骼名推断的假设，运行时若要挂武器网格，需在骨骼 `hand.R` 下自建挂点（不侵入资产）或在 DCC 里补一个空节点后重导出（侵入资产）。

