# 音频来源与授权登记

- 管理人：主程序与整合负责人（代理 A）
- 登记时间：2026-10-29
- 范围：工程内当前全部音乐与音效资产的**来源、生成方式、授权状态与未决风险**
- 本轮结论：**默认曲暂不更换**（沿用 `assets/releases/CHAR-108/audio/` 下两首），本文件只做登记与入口整理，不改任何音频文件与 `bgm.js` 的默认曲目

> 说明：本文件只记录可核查的事实与已知边界，**不构成法律意见**。任何对外发布前的授权结论需另行确认。

---

## 1. 资产清单与来源

| # | 文件 | 用途 | 来源与生成方式 | 第三方素材 |
|---|---|---|---|---|
| 1 | `assets/releases/CHAR-108/audio/liangshan_city.mp3` | **默认曲**·主城 | `tools/blender/char108/generate_music.py` 程序合成（numpy + scipy，正弦/谐波 + ADSR 包络，BPM 90），编码为 MP3 | 无采样、无外部音源 |
| 2 | `assets/releases/CHAR-108/audio/battle_theme.mp3` | **默认曲**·战斗 | 同上脚本，BPM 120，鼓与筝的近似合成 | 无采样、无外部音源 |
| 3 | `assets/releases/AUDIO-002/audio/daily-flute.wav` | 候选·日常 | 原创乐谱 `source/scores/daily-flute.json` + `compose.py` → `render.swift`（AVAudioUnitSampler）→ `master.py`（FFmpeg 两遍 EBU R128） | macOS 系统音色库 `gs_instruments.dls` |
| 4 | `…/daily-pipa.wav` | 候选·日常 | 同上流程 | 同上 |
| 5 | `…/daily-guzheng.wav` | 候选·日常 | 同上流程 | 同上 |
| 6 | `…/battle-spirited.wav` | 候选·战斗 | 同上流程 | 同上 |
| 7 | `…/battle-boss.wav` | 候选·Boss | 同上流程 | 同上 |
| 8 | 战斗音效（挥击/箭矢/法术/打击/受击/护盾/治疗） | 音效 | `audio-sfx.js` 运行时 Web Audio 程序合成，无落地音频文件 | 无 |

## 2. 授权状态

| 来源类型 | 状态 | 依据 | 未决事项 |
|---|---|---|---|
| 默认曲 2 首（自合成波形） | 自制，旋律与音色均由工程内脚本生成 | `tools/blender/char108/generate_music.py` 头部注释明确「All sounds are synthesized — no samples, no copyrighted material」 | 依赖库 numpy/scipy 为 BSD 系许可，**未逐条核验其许可文本**，若后续商用分发需补核验 |
| 候选 5 首（乐谱 + 系统音色库渲染） | 乐谱层面为原创；**音色层依赖 macOS 系统音色库** | `assets/releases/AUDIO-002/README.md` 已载明：「系统音源的商业使用许可没有在本任务中另作法律核验；此轮为本地候选试听，没有发布授权结论」 | **关键未决**：`gs_instruments.dls` 随 macOS 提供，仓库不分发该音库，但渲染产物中是否已构成需授权的衍生内容**未做法律核验**。对外发布前应替换音色源或取得确认 |
| 战斗音效 | 运行时合成，无素材依赖 | `audio-sfx.js` 无外部请求、无采样加载 | 无 |

## 3. 本轮处置

1. **默认曲保持不变**：`bgm.js` 的 `TRACKS.city` / `TRACKS.battle` 仍指向原 CHAR-108 两首 MP3，未做替换。
2. **试听入口统一管理**：新增根目录 `audio-audition.html`，把「默认曲 2 首」与「候选 5 首」放进同一页，便于一次比较；原 `audio-candidates.html` 保留不变（既有测试依赖它）。
3. **选择不落库**：试听页只写自己的偏好键，不修改游戏存档，也不修改 BGM 偏好；**选定默认曲仍需指挥官或用户明确指令**。

## 4. 试听入口

```bash
tools/serve.sh            # 默认 8765 端口
# 打开 http://127.0.0.1:8765/shuihu-game/audio-audition.html
```

注意：需经 HTTP 打开。`file://` 直接打开时无法 fetch 清单（既有 `audio-candidates.html` 同样有此限制）。

## 5. 未测 / 未决（如实列出）

- 候选 5 首的**听感**未做主观验收，仅技术指标（响度、真峰值、循环边界）通过。
- 系统长笛 / 尼龙吉他 / Koto 只是近似笛子 / 琵琶 / 古筝，**不是实录民乐**，不得按实录民乐对外描述。
- `gs_instruments.dls` 的商业使用许可**未核验**，见第 2 节。
- 默认曲 2 首为程序合成，旋律质量与听感同样未经主观验收。
