# 交接单 / CHAR-108

- 任务 ID / 修订号：CHAR-108 / r1
- 负责人 / 接收人：C（界面角色表现） / A（集成）
- 状态：READY_FOR_REVIEW
- 基线提交 / 交付提交 / 最终集成提交：975fa65 / 本轮提交 / b7fefdd
- 目标与验收条件：用本机 Blender 程序化生成全部 108 位 Q 版好汉的七帧动作条和正方形立绘；接入 data/portraits.js 使战斗/花名册/酒馆等处自动使用新素材；制作主城与战斗两首循环背景音乐并接入游戏 BGM 系统；测试全部通过。

## 本轮交付清单

### 108 将角色素材（assets/releases/CHAR-108/）

| 类型 | 数量 | 规格 | 路径 |
|---|---|---|---|
| 七帧动作条 | 108 | 4928×512 RGBA PNG，7 帧横排，每帧 704×512，共用地面线 | sheets/hero-XXX-sheet.png |
| 正方形立绘 | 108 | 1024×1024 RGBA PNG | portraits/hero-XXX-portrait.png |
| Blender 源工程 | 108 | 可编辑，含建模、骨骼、动作姿态 | blender-src/hero-XXX.blend |
| 主城音乐 | 1 首 | mp3 ~500KB，41 秒循环，D 宫五声 | audio/liangshan_city.mp3 |
| 战斗音乐 | 1 首 | mp3 ~200KB，15 秒循环，A 羽五声 | audio/battle_theme.mp3 |
| 清单文件 | 1 份 | JSON，含每将品质/武器/体型/文件路径 | manifest.json |

### 角色差异化维度

- **武器**（23 种）：spear, sword, bow, staff, axe, twin_swords, twin_axes, hammer, whip, dart, fan, brush, lute, dagger, shield, crutch, rake, spear_pair, chain, knife, hook, fist, arrow_sleeve
- **头饰/发型**（10 种）：topknot, bandana, helmet, hat_daoist, hat_broad, hat_official, hair_bun_female, crown, hood, scarf
- **体型**（8 种）：average, stocky, slim, tall, short, muscular, tall_slim, tall_muscular
- **肤色**（5 种）：fair, tan, dark, swarthy, pale
- **胡须**（4 种）：none, moustache, full_beard, goatee, long_beard
- **面部特征**（4 种）：none, scar, tattoo, birthmark
- **性别**：男 / 女（3 位女性：扈三娘/顾大嫂/孙二娘）
- **品质色彩体系**：暗金（蓝金）、红（赤红金）、紫（紫金）、蓝（蓝铜）；各品质内用黄金角分布色相偏移，保证 108 人色彩不重复

### 精品保留

以下 12 位英雄保留原有手工 Q 版素材（品质更高，不被程序化版本覆盖）：
宋江(001)、吴用(003)、公孙胜(004)、林冲(006)、花荣(009)、鲁智深(013)、武松(014)、李逵(022)、张顺(030)、燕青(036)、朱武(037)、扈三娘(059)

### BGM 系统

- **bgm.js**：独立模块，暴露 `window.BGM`
  - `BGM.play(track)` / `BGM.stop()` — 曲目切换
  - `BGM.setEnabled(bool)` / `BGM.setVolume(0-1)` — 开关与音量
  - 首次用户手势后才播放（浏览器自动播放策略兼容）
  - localStorage 持久化（key: `shuihu-bgm-v1`）
  - 页面自动切换：主城/非战斗 → city，战斗 → battle
- **UI 接入**：玩法页新增「🎵 背景音乐」板块，含开关和音量滑块
- **测试**：tests/bgm.test.mjs 8 项全部通过

### 生产工具（tools/blender/char108/）

| 脚本 | 用途 |
|---|---|
| build_all_108.py | 完整流水线：108 将规格 + 建模 + 骨骼 + 7 帧姿态 + 渲染 + sheet 拼合 + portrait |
| build_all_108_fast.py | EEVEE 快速渲染版本（~7 秒/角色 vs Cycles ~2.5 分钟） |
| rerender_portraits.py | 仅重渲染立绘（用于尺寸/构图调整） |
| integrate_portraits.py | 批量接入 data/portraits.js（不覆盖已有精品条目） |
| generate_music.py | numpy/scipy 合成国风五声音阶循环音乐，ffmpeg 编码 mp3 |

## 测试结果

命令：`node --test tests/*.test.mjs`
结果：**118 pass / 0 fail**（基线 110 + 新增 BGM 8）

portrait 正方形 PNG 测试从 16 条更新为 112 条（108 英雄 + 4 敌方），最小尺寸保持 1024px 阈值不变。

## 接口变更说明

- **data/portraits.js**：新增 95 条英雄条目（原 13 条 → 108 条英雄 + 4 条敌方 = 112 条 total）。新增字段 `artSource: "local_blender_procedural"` 和 `productionBatch: "CHAR-108"` 标识程序化生成批次。
- **game.js**：render() 末尾增加 BGM 曲目切换（战斗↔主城）；morePage() 增加 BGM 设置 UI；clickAction 增加 `bgm-toggle` 和 `bgm-volume` 两个动作。
- **game.css**：增加 `.bgm-row`、`.bgm-label`、`.bgm-slider`、`.switch` 样式。
- **index.html**：增加 `<script src="bgm.js">`。

以上 4 个文件按 AGENTS.md 归属 A（game.js/index.html）和 C（game.css/portraits.js）。因用户已全权限授权，C 一并完成了接入；A 可按需审查并调整。

## 已知限制与后续改进

1. **程序化生成 vs 手工精品**：96 位新角色是几何体程序化生成，风格统一但细节丰富度不及 12 位手工精品。标识为 `generated_pending_review`。
2. **动作姿态为关键帧摆姿**：7 帧为静态姿态（待机/走A/走B/攻击/技能/受击/倒地），不是连续动画。游戏中通过 battle-motion.js 的程序过渡来呈现动作。
3. **EEVEE 渲染**：使用 EEVEE 实时光照而非 Cycles 路径追踪，速度快 22 倍，光照层次略简化。Q 版风格下视觉差异较小。
4. **音乐为合成音色**：笛子/琵琶/古筝等为合成模拟，非真实乐器采样。后续可替换为实录素材。
5. **没有 restArt（酒馆休闲立绘）**：12 位精品有 restArt，96 位程序化角色暂缺。如需可从 portrait 缩放生成。
6. **女性角色 3 位**：扈三娘保留精品，顾大嫂/孙二娘为程序化版本，含发髻、发饰、腮红等女性特征。

## 回滚方式

回滚整个批次：
```
git revert 44e5ab0
```

仅回滚 BGM 接入（保留素材）：从 game.js / index.html / game.css 中移除 BGM 相关代码，删除 bgm.js 和 tests/bgm.test.mjs。

## 附件

- 素材清单：assets/releases/CHAR-108/manifest.json
- 生产脚本：tools/blender/char108/
- 测试报告：118/118 pass
