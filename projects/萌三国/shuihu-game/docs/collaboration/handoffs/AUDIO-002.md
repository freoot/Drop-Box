# 交接 / 返修单

- 任务 ID / 修订号：AUDIO-002 / r3，2026-10-24（独立战斗音效）；下方 r2 五曲记录作为历史保留。
- 负责人 / 接收人：B 因服务 503 中断，A 串行代实现、集成 / D（QA-002）、用户/Codex试听验收。
- 状态：READY_FOR_REVIEW；技术播放通过，听感待用户审听。
- 基线提交：55cd766；音频与试听页交付提交：ffce7c7；本轮功能集成基线：ffce7c7（含布局 9e8b665）。后续测试和交接修订以本文件最后一次 Git 提交为准。
- 目标与验收条件：三首日常、两首战斗原创循环候选，每首 30–45 秒，统一音量；独立试听、比较、循环、停止、音量及选择保存；选定前不换默认曲。
- 允许及实际修改：audio-candidates.html/css/js、assets/releases/AUDIO-002/（WAV、manifest、源码、说明与证据）、tests/audio-002.test.mjs、tests/audio-002-browser.mjs、本交接。
- 接口：单一 HTMLAudioElement；清单 assets/releases/AUDIO-002/manifest.json；偏好键 shuihu-audio-candidates-v2 只用于试听页，不读取或修改游戏档和 BGM 偏好。
- 存档、数值和依赖变化：游戏无变化；本机 Swift/AVFoundation/Apple 系统采样库、Python、FFmpeg 用于离线渲染，没有下载音源或购买服务。
- 测试：node --test tests/*.test.mjs 137 PASS / 0 FAIL；node --check audio-candidates.js 退出码 0；node tests/audio-002-browser.mjs 退出码 0，三视口 × 五曲实际播放、时间推进、上一首、停止归零、循环越界、音量、选择刷新恢复、无游戏档写入、无横向溢出、无 pageerror。
- 本地入口：http://127.0.0.1:8765/shuihu-game/audio-candidates.html。
- 证据：assets/releases/AUDIO-002/evidence/results.json、desktop.png、portrait.png、landscape.png。
- 音频与源文件：audio/*.wav、source/compose.py、source/render.swift、source/master.py、source/scores/*.json；复建步骤与来源详见同目录 README.md。
- 已知问题：系统长笛/尼龙吉他/Koto 近似笛子/琵琶/古筝，没有专用民乐采样；不能声称实录民乐。技术接缝和响度通过不等于循环自然、音乐好听，需用户听感验收。
- 未完成：命中帧同步音效、限流混音及独立音效开关未实现；没有接入默认 BGM。
- 回滚：git revert 指定交付提交，保留旧 CHAR-108 音频与用户存档。

## 逐项验收

| 条件 | 操作步骤 | 预期 | 实际 | 证据 | 结论 |
|---|---|---|---|---|---|
| 五首循环候选 | 逐首播放 | 三日常/两战斗、30–45 秒 | 36.9/34.3/41.7/37.5/35.3 秒 | WAV 与 manifest | 技术 PASS，听感待验 |
| 统一音量 | PCM/EBU R128 验证 | 无削波，响度接近 | 约 −20 LUFS，真峰值 −10.35 至 −5.94 dBTP | manifest/测试 | PASS |
| 播放操作 | 三视口切换、比较、停止、循环、调音量 | 单播放器、控制有效 | 全部断言通过 | 浏览器脚本/results.json | A 回归 PASS |
| 保存隔离 | 选两首、刷新、检查 localStorage | 选择恢复，不创建游戏档或改 BGM 设置 | 通过 | 浏览器脚本 | A 回归 PASS |
| 可编辑源 | 输出到新临时目录并与已交付 score 比较 | 五份事件完全一致 | 全部一致 | 单元测试 | PASS |

## 缺陷退回

本轮未复现播放功能 P0/P1；独立 QA 与用户试听结论另见 QA-002，不能据此宣称整体音乐验收通过。

## r3 当前交接 · 独立战斗音效

- 负责人 / 接收人：A 本机串行代实现及接入 / D、用户与 Codex；状态 READY_FOR_REVIEW（技术），听感与感知同步 BLOCKED。
- 基线 df93d05；交付与最终功能集成提交 4212d9b；本轮文档提交按本文件最后一次 Git 提交定位。
- 允许及实际文件：audio-sfx.js、battle-motion.js、game.css、game.js、index.html、tests/audio-002-sfx.test.mjs、QA 纯点击测试及证据、AUDIO-002-r3-interface.md；未改五首试听 WAV 或默认 BGM。
- 实现前接口约定见 AUDIO-002-r3-interface.md。新增独立偏好键 shuihu-sfx-v1 只存 enabled/volume；旧游戏档和 BGM 键不变。音效默认开启、0.45，真实手势解锁；无外部依赖或收费素材。
- 程序合成挥击、箭矢、法术、打击、受击、护盾、治疗。真实结算 fx 驱动声音，seq 防重；开局纯 buff 静音。多目标合并命中声，最多四声部、限主增益与压缩器；关闭/后台取消待播及当前声源。
- contactMs：近战 294ms、远程 480ms、法术/辅助 410ms，除以速度；CSS 弹字/命中闪光和声音使用同一参数。现有伤害立即结算的规则不变，音效不结算伤害。该技术共用参数不等于所有旧动作与轨迹已经逐帧对齐。
- 测试：141 单元 PASS / 0 FAIL / 0 SKIP；含三项新音效调度、AoE、静音/取消、护盾/治疗、后台/过期测试；语法检查退出 0。QA 纯点击浏览器三视口退出 0，SFX 关闭刷新保持、BGM 关闭不影响 SFX、键盘音量有效。真实事件包含 swing/impact/hurt/arrow/magic/shield，active<=4，无 pageerror。
- 证据：assets/releases/QA-002/r3/results.json 和 tests/qa-002-click-browser.mjs；玩法页开关截图见 ENG-002/evidence/*-more.png，视口 1440×900、390×844、844×390，对应 4212d9b。
- 限制：浏览器事件证明合成声源被调用，不证明扬声器听感、峰值实测或音画偏差；治疗类型在单元中验证，本轮真实浏览器没有治疗事件，不能称全部类型现场覆盖。五曲主观试听仍待用户，本轮未重跑未变更的候选页播放专项；r2 历史结果不冒用为本轮新运行。
- 本地入口：游戏“玩法”页战斗音效开关；五曲继续在 http://127.0.0.1:8765/shuihu-game/audio-candidates.html 供选。回滚精确 `git revert 4212d9b`，注意该提交含棋格和山寨调整。

| 条件 | 操作步骤 | 预期 | 实际 | 证据 | 结论 |
|---|---|---|---|---|---|
| 独立控制 | 关 BGM、关 SFX、刷新、开 SFX、键盘调音量 | 两偏好独立持久保存 | 三视口断言通过 | QA r3 脚本/JSON | A PASS |
| 真实战斗声源 | 普通首关手动、自动战斗 | 攻击与命中 cue 来自真实 fx，限制并发 | 六种事件，active<=4 | QA r3/results.json | A PASS，听感待验 |
| 多目标与取消 | 单元模拟十目标、静音、旧序列、后台 | 合并声音、不补播 | 全部通过 | audio-002-sfx.test.mjs | 技术 PASS |
| 音画感知同步 | 独立逐帧看图并试听 | 动作接触时可感知一致 | 本轮没有实测偏差或人工试听证据 | 未覆盖 | BLOCKED |
