# AUDIO-002 r3 · 实现前接口约定

基线 df93d05。A 串行集成，B/C 范围本轮由 A 代实现，无本机可用独立子代理。

- 新增 audio-sfx.js，公开 window.SFX：isEnabled/getVolume/setEnabled/setVolume/cancel/playCue。只播放展示声音，不读写游戏进度、不改伤害。
- 偏好独立键 shuihu-sfx-v1，仅 enabled/volume；已有 shangshan-shuihu-v1、shuihu-bgm-v1 不变，旧档不需迁移。音效默认开启、音量 0.45，首次真实手势解锁；用户关闭时立刻取消待播及当前声音。
- game.js 在真实 playBattleFx 结算产生 fx 后，于 render 完成时按 fxSeq 一次调度。参数只含真实 attacker、kind、hits、速度；重复 render 不重复播，旧场景退出/序列过期不补播，后台静音且取消。
- 声音分为挥击/箭矢/法术起手及打击/护盾吸收/治疗/护盾生成/受击。开局 buff 没有 heal/shield/damage，不播放治疗或命中声音。
- contact 时间由 battle-motion.js 导出 contactMs（近战 294ms、远程 480ms、法术 410ms，除以战斗速度），用于 CSS 命中弹字/闪光的延迟及音效同一时间轴。伤害仍按现有规则立即结算，声音不重新结算。
- 每个真实 fx 合并多目标命中音，最多四个声部，主增益限制加 compressor，避免 AoE 按目标数叠加爆音。偏好开关独立于 BGM，候选与默认曲均不变。
- 证据：单元验证调度/过期取消/静音/上限及真实浏览器纯点击验证，保留独立 D BLOCKED。
