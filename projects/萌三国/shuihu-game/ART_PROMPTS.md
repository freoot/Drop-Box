# 美术与动作资产制作记录

两张绘景均使用 Codex 内置 `image_gen` 生成，作为本作原创场景资源。用户提供的旧游戏截图只用于理解主城入口与战棋信息层级；本作未把截图作为生成图的编辑目标，也未复用截图、旧游戏图片或其界面素材。场景 PNG 已复制到项目 `assets/`，原来的 SVG 草图仍保留，方便日后改为纯矢量或继续调整布局。

## 人物资产与当前启用范围

人物立绘及动作姿态同样使用 Codex 内置 `image_gen` 制作，图像保存于 `assets/portraits/`；完整生成与修整提示见该目录的 `prompts.json`。其中包含多轮尝试，部分角色 ID 会重复出现，因此它是制作记录，不是运行资源清单。实际启用文件以 `data/portraits.js` 为准。

| 范围 | 人物 | 当前表现 |
|---|---|---|
| 三位动作代表 | 林冲、花荣、吴用 | 专属立绘 + 四关键姿态 + 程序动画 |
| 其余已完成立绘的好汉 | 宋江、李逵、鲁智深、武松、燕青、扈三娘、张顺、朱武 | 专属立绘 + 程序动画 |
| 普通敌军 | 近战、射手、谋士 | 三张独立立绘 + 程序动画 |
| 首领 | 高俅 | 专属立绘 + 程序动画 |
| 待制作专属美术 | 其余 97 位好汉、祝朝奉、史文恭、方腊 | 原创 SVG 示意造型 |

合计启用 15 张专属立绘，均为带透明通道、边长至少 1024 像素的正方形 PNG。不同批次的头身比例仍需继续统一，现阶段为人物美术样板；高分辨率并不代表全套动画或全部 108 将均已制作完成。

### 动作图集的接入规则

- 当前启用 `hero-006-actions-v2.png`（林冲）、`hero-009-actions.png`（花荣）、`hero-003-actions.png`（吴用）。每张图按 2×2 等分：左上待机、右上移动、左下出招、右下受击。
- 吴用出招使用独立的 `hero-003-cast.png`，普通攻击与名将技均调用，避免原图集术效跨格后被裁切。提示记录中的 `hero-003-actions-repair` 是中间修整尝试，项目未收录同名 PNG，也未在清单启用。
- `hero-001-actions.png`（宋江）与 `hero-022-actions.png`（李逵）仍是待修整草稿，未启用；`hero-006-actions.png` 是林冲早期草稿，当前使用后续版本。
- 生成要求包括一致身份、配色、武器、头身比例、朝向、脚底基线及透明留白；生成结果仍需要逐张检查武器越界、缩放差异与动作可读性，不能只凭提示词判断合格。
- 四张关键姿态不等于逐帧动画。当前程序补充呼吸起伏、路径位移、出招前冲与回收、受击后仰和亮闪；名将技复用出招加光效，造型室倒地用受击姿态旋转淡出。连续走路帧、转身、独立倒地原画和三维骨骼模型尚未制作。

通过「玩法 → 好汉造型室」或 `character-studio.html` 可逐人逐动作检查，也可连续演示。该页使用与战斗相同的清单，不修改游戏存档。先完善三位代表的造型和动作，再依据确定的标准扩展全部人物、精修沙盘。

## 梁山主城

文件：`assets/liangshan-city-painted.png`（1672×941）

> Use case: stylized-concept. Asset type: original landscape background for a playable browser/mobile game city hub, without any interface overlay. Primary request: an exquisite original cute Chinese Water Margin inspired lakeside mountain stronghold at golden sunset, polished premium mobile game environment art. Scene: broad panoramic elevated view across a reed-fringed lake toward a lively fortified village; a grand timber-and-jade-tile assembly hall at center, small tavern and market quarter at left, ornate watchtower and training yard at right, bridges, banners, warm lanterns and layered misty mountains. Style: richly painted 2.5D game environment, storybook chibi proportions in architecture, refined brushwork, soft luminous atmospheric depth, polished details and tasteful warm/cool contrast; original look distinct from any existing game UI. Composition: 16:9 wide frame, clear recognizable building silhouettes at center, left, and right, preserve open sky across top and walking courtyard across lower third for separate HTML buttons; no people in foreground. Lighting: warm amber sunset, teal roof highlights, calm lake reflections. Constraints: no text, logos, UI panels, buttons, watermarks, Three Kingdoms characters, or recognizable copyrighted game designs; environment only.

## 木台沙盘战场

文件：`assets/liangshan-battlefield-painted.png`（1672×941）

> Use case: stylized-concept. Asset type: original wide tactical battle backdrop for a playable mobile/browser Water Margin inspired chibi strategy game. Primary request: an exquisitely polished empty outdoor wooden sand-table battlefield in a lakeside mountain stronghold, seen from a gently elevated 2.5D viewpoint. Scene: a broad flat dark walnut and weathered wood fighting platform centered in frame, subtle timber planks and gold inlay, ornate railing and lanterns around the outer edge, reeds, lake, hazy distant mountains and warm sunset beyond. Composition is critical: central playing surface is clear, mostly unadorned, rectangular/trapezoidal, spanning approximately 78 percent of image width; its back edge begins at 18 percent of image height and front edge ends at 83 percent, with enough plain surface for HTML 8 by 4 clickable battle cells and character sprites. Keep the perimeter decorative but quiet. Style: premium hand-painted 2.5D mobile game environment, warm amber and deep teal, tactile wood grain, refined shadows, vivid but legible. No lines or counted grid painted on the central surface because an interactive grid will be overlaid in code. No people, no characters, no text, no logos, no UI, no watermarks, no weapons, no copied game imagery.
