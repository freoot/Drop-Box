# 项目归档清单

归档日期：2026-11-08  
归档位置：`projects/`  
本地归档：2479 个文件，约 102MB  
GitHub 跟踪：2223 个文件；差额是各项目自带忽略规则排除的 `temp/`、构建状态和本机运行文件

| 项目 | 原始位置 | 归档体积 | 说明 |
|---|---|---:|---|
| 萌三国 | `~/Documents/Codex/youxi/meng` | 34MB | 小程序、Cocos 工程、好汉游戏源码与文档；排除了游戏素材包和历史 Git |
| 电影项目-dianyin | `~/.codex/.chatgpt-projects/g-p-6ab9cc04ec3081919552de59c1293d42` | 45MB | 人物设定、导演镜头、旁白、关键帧和制作文档 |
| 武士-Pinngoo | `~/.codex/.chatgpt-projects/g-p-6ab9dc5ad9ec8191b0d0e8a3eca1d015` | 5.5MB | Pinngoo Studio、AgentPoints 源码和文档 |
| 小说与报告-2026-09-27 | `~/Documents/Codex/2026-09-27` | 704KB | 小说、剧本、分镜与分析报告 |
| Overlay-Studio | `~/Documents/ChatGPT/rea/overlay-studio` | 3.2MB | 编辑器源码和说明；排除了大型项目媒体与模型 |
| TTS-Studio | `~/Documents/Codex/TTS-Studio` | 1.6MB | 本地语音合成源码和配置样例 |
| Pixelle-Video | `~/Documents/Codex/Pixelle-Video` | 8.7MB | AI 短视频工程 |
| 公众号SOP监控 | `~/Documents/Codex/ops/wechat-sop-monitor` | 312KB | 公众号信号监控系统 |
| Muse桌面项目 | `~/Documents/Codex/2026-11-04/muse-desktop-valthra-shared-muse-inbox` | 2.7MB | Muse 项目文件与验收材料 |

## 统一排除项

- 历史与嵌套仓库：`.git/`
- 密钥和本机设置：`.env`、`.npmrc`、`.local/`、`.gstack/`、证书与私钥
- 依赖和缓存：`node_modules/`、`.venv/`、`.godot/`、`.cache/`、UV/Hugging Face 缓存、Cocos `library/`
- 生成产物：`dist/`、`build/`、`__pycache__/`
- 大体量中间产物：模型库、素材发布包、审片目录、OCR 目录、工作帧目录、交付视频
- 数据与日志：本地数据库、SQLite、日志
- 单文件大于 2MB 的素材

## 安全检查

- 未发现嵌套 `.git`
- 仅保留 `.env.example`，没有实际 `.env`
- 没有超过 10MB 的单文件
- 已移除归档副本中的一处硬编码 DashScope 密钥，改为只从环境变量读取
- 原始项目目录均未修改
