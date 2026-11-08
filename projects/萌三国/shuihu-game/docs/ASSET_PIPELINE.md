# 2D 资产流程记录

## 能力检查

`docs/asset-doctor-runtime.json` 使用 Codex 内置 Python 3.12 运行。图像路线为 `host_image`，可使用内置图像生成；未配置外部图像 API。视频生成路线当前不可用，因此角色连续动作仍需后续接入视频生成服务或提供动画片段。唯一警告是未安装可选的 SciPy，现有主资产处理已使用 NumPy 回退并完成。

## 山河地图

- 文件：`assets/liangshan-journey-map.png`
- 尺寸：1672×941，16:9。
- 来源：Codex 内置 `image_gen`，`art_source=host_image`。
- 用法：网页征战地图、剧情开场背景和 Godot 路线场景。
- 行为模式：baked scene plate。地点和路线为独立交互数据，背景图片本身不承担碰撞、寻路或关卡逻辑。

## 三位代表角色

林冲、花荣、吴用的批准主资产位于：

- `assets/masters/hero-006-v1/`
- `assets/masters/hero-009-v1/`
- `assets/masters/hero-003-v1/`

三者均为 1024×1024 RGBA，人物高度 788 像素，顶部边距 138 像素，路线记录为 `host-image_gen`，处理结果 0 个警告。`master.json` 保存身份摘要、构图、来源与变换记录。
