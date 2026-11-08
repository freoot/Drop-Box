# 茅曲坊 v3 动效卡片

基于 v2 满屏竖版剪辑，在 ChatCut 中新建独立时间线 `18152687-f117-4610-b08e-ecc0dd5f9506`。保留 27 个实拍镜头、25 段原生字幕、口播与背景音乐；三个人物圆窗加轻微缩放入退场。背景始终是满屏实拍，不使用上下文案留白。

| 成片时间 | 镜头卡 | 样式与本片适配 | 源文件 |
|---|---|---|---|
| 0–3.60 秒 | `marker-underline-title` | 中文“一年”，口播到“一年”时金色手绘线划出；透明叠加 | YearHook.jsx |
| 13.87–19.30 秒 | `odometer-digit-roll` | 2、9、8、7 四列逐个滚动、减速、轻微回弹、停稳；对应投料/蒸煮/发酵/取酒 | ProcessReels.jsx |
| 21.27–25.47 秒 | `timeline-travel` | 四季时间轴加速穿行、刹停于冬；停留“一个基酒生产周期” | SeasonTravel.jsx |
| 61.50–65.00 秒 | `type-assembly-moves` / `drift-assembly` | “茅曲坊”三字从确定性散点漂移、去模糊、合拢；品牌文案随后淡入 | BrandAssembly.jsx |

采用暖金 `#E8BC6A`、米白 `#FFF4DB`，Noto Serif SC 与 Noto Sans SC。只用于本片，不存为用户全局设计偏好。圆窗在第 0/6/12 帧以 65%/103.5%/100% 缩放入场，圆心保持在 (850,1400)，最大直径 351.9 像素，字幕从 y=1590 起。

## 来源

实际阅读并选用了本机 `/Users/user/.workbuddy/skills/video-shotcraft-cards/SKILL.md`，并观看四张卡的样片。原始演示在该技能目录 `demos/typography/marker-underline-title/MarkerUnderlineTitle.tsx`、`demos/data/odometer-digit-roll/OdometerDigitRoll.tsx`、`demos/data/timeline-travel/TimelineTravel.tsx`、`demos/typography/type-assembly-moves/LetterformDriftAssembly.tsx`。四份原始演示保留在 `reference/`，Apache-2.0 LICENSE 与上游 ATTRIBUTION 一并保留。改编文件已标记来源和修改内容。

使用 ChatCut 的 create-motion-graphics 技能，将 Remotion JSX 通过 ChatCut 官方本地接口导入为原生、可编辑的 Motion Graphic 素材，再放入当前项目；最终由 ChatCut 导出。标题、颜色、强调色和衬线字体为编辑属性，已做强调色覆盖及恢复检查。工艺数字语义固定在本片正确的 2/9/8/7。

## 验证

`node motion-v3/motion.test.mjs` 检查数字最终值、回弹、时间轴单调性、24/30/60 fps 时钟一致性、可重复随机取样及片尾文字锁定。`python3 validate_motion_v3.py` 检查实际 ChatCut 时间线、画面覆盖、圆窗运动边界及最终导出的视频/音频。检查缩略图仅为审片附件，不会出现在成片中。
