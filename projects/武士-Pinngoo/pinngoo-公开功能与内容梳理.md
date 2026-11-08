# PINNGOO AI（屏菓悟）公开功能与主要内容梳理

抓取日期：2026-09-28（北京时间）  
范围：`https://www.pinngoo.cn` 的公开页面、公开站点地图及法律文件。未登录、未提交生成任务、未调用站内 API。

## 一句话概括

屏菓悟将“创意或原著 → 剧本 → 统一画风与角色/场景/道具资产 → 分镜和配图 → 视频任务与成片下载”组织在同一个项目工作台中，重点面向 AI 短剧、短片和系列内容制作。[首页](https://www.pinngoo.cn/)、[AI 影视创作](https://www.pinngoo.cn/ai-film-production/)

## 抓取范围与证据级别

- **页面可见**：首页渲染后的按钮、文字、上传控件和展示卡片；仅证明入口存在。
- **官网说明**：功能介绍页描述的流程或能力；未实际测试完成效果。
- **协议提及**：法律文件列出的服务或权益；可能是条件性、规划性或因套餐而异的能力，不应直接视作当前可用。

[站点地图](https://www.pinngoo.cn/sitemap.xml)列出首页及四个功能介绍页。公开首页还链接[法律中心](https://www.pinngoo.cn/legal)，其下有六份文件。本次共检查 **12 个公开页面**。站点的 [robots.txt](https://www.pinngoo.cn/robots.txt) 允许公开页面，但排除了 `/api/`、`/admin`、`/account`、`/orders`、`/profile`、`/membership`、`/workflow.html`、`/canvas-pro/`、`/uploads/`，因此未访问这些路径。

## 功能清单

| 模块 | 已发现的功能/流程 | 证据级别 | 依据 |
| --- | --- | --- | --- |
| 创作入口 | 首页有“从剧本开始”“从想法开始”“长篇创作”“小说转剧”四个模式；支持文本输入、上传剧本文件和发送 | 页面可见 | [首页](https://www.pinngoo.cn/) |
| 从现成剧本开始 | 将完整分集剧本带入后续制作，宣称保留集、场、角色和台词结构，不改写已定稿剧情 | 官网说明 | [首页](https://www.pinngoo.cn/) |
| 从想法开始 | 依据一句创意、人物设定或梗概创作短篇剧本；页面建议 1–5 集、单集 3 分钟内 | 官网说明 | [首页](https://www.pinngoo.cn/) |
| 长篇原创 | 故事总览、阶段规划、分集大纲、按 5 集批量生成正文、质检后同步工作流；页面建议 30–100 集 | 官网说明 | [首页](https://www.pinngoo.cn/) |
| 小说改编 | 上传或粘贴原著，梳理人物、冲突、集数，确认总览和大纲，批量生成并校对分集剧本；宣称支持 TXT、Markdown、DOCX、EPUB、PDF、HTML、RTF | 官网说明 | [小说转短剧](https://www.pinngoo.cn/novel-to-short-drama/) |
| 视觉设定与资产 | 统一画风，管理角色、场景、道具资产，跨镜头保持视觉连续性 | 官网说明 | [AI 影视创作](https://www.pinngoo.cn/ai-film-production/)、[智能分镜](https://www.pinngoo.cn/ai-storyboard/) |
| 智能分镜 | 按集拆分镜头，检查景别、动作、情绪、画面信息；页面称可选择“通用标准”或“商业剧情”分镜智能体，查看与调整镜头 | 官网说明 | [智能分镜](https://www.pinngoo.cn/ai-storyboard/) |
| 配图与视频 | 分镜和配图预览后提交视频任务；逐集或批量生成，查看各集状态与素材，集中查看和下载成片 | 官网说明 | [AI 视频制作](https://www.pinngoo.cn/ai-video-production/) |
| 项目与画布 | 首页可见“新建项目”“新建画布”“回收站”；页面提示创建、保存、恢复项目需要登录 | 页面可见；行为未测 | [首页](https://www.pinngoo.cn/) |
| 作品观赏 | 首页可见作品卡片与分类筛选，包括“全部”“精选画布”“短片剧集”“经典衍生”“3D”“仿真人”“王者无界剧场计划”“风格美学”“全网点赞100万+”；抓取时展示 20 张作品卡片 | 页面可见；筛选行为未测 | [首页](https://www.pinngoo.cn/) |
| 账号 | 首页提供登录入口；协议和隐私政策提及手机号注册、短信验证码/密码登录，以及账号和项目存储 | 页面可见 + 协议提及；注册流程未测 | [首页](https://www.pinngoo.cn/)、[隐私政策](https://www.pinngoo.cn/legal/privacy-policy) |
| 会员与积分 | 首页有“查看会员权益”入口；协议描述会员套餐、赠送积分、积分购买和图片/视频生成消费，具体权益与价格以购买页为准 | 页面可见 + 协议提及；购买页未核验 | [首页](https://www.pinngoo.cn/)、[会员协议](https://www.pinngoo.cn/legal/membership-agreement)、[充值协议](https://www.pinngoo.cn/legal/credit-recharge-agreement) |
| 扩展能力 | 会员协议还提及快速生成通道、视频清晰度和并发档位、视频/音频/PDF/Word 的 AI 分析、图片编辑与修复；App 权限文件提及相机、相册和麦克风素材导入 | 仅协议提及；当前可用性未核验 | [会员协议](https://www.pinngoo.cn/legal/membership-agreement)、[App 权限](https://www.pinngoo.cn/legal/app-permissions) |

## 主要内容与用户路径

1. **输入故事**：从想法、完整剧本、长篇原创或小说改编选择入口。[首页](https://www.pinngoo.cn/)
2. **形成剧本**：短篇快速生成，或以总览、阶段规划、大纲和批量正文制作长篇；小说改编则先导入原著并校对分集剧本。[首页](https://www.pinngoo.cn/)、[小说转短剧](https://www.pinngoo.cn/novel-to-short-drama/)
3. **锁定视觉**：统一画风，建立角色、场景和道具资产，供后续镜头复用。[AI 影视创作](https://www.pinngoo.cn/ai-film-production/)
4. **逐集制作**：检查分镜与配图，生成视频任务，按集查看素材与状态，最后下载成片。[智能分镜](https://www.pinngoo.cn/ai-storyboard/)、[AI 视频制作](https://www.pinngoo.cn/ai-video-production/)

## 尚不能确认的部分

- 未取得测试账号，无法核验登录后的剧本质量、资产库、分镜编辑、生成任务、成片下载、画布、回收站、积分扣费和会员权益的实际行为。
- 公开站点地图和页面未提供可供集成的 API 文档。隐私政策虽然泛称 SDK/API，但没有接口契约；本次未访问 robots.txt 排除的 `/api/` 路径。[隐私政策](https://www.pinngoo.cn/legal/privacy-policy)
- 自动续费状态需以实际购买页核实：法律中心把自动续费协议标作“仅自动续费商品”，用户协议称当前一次性会员商品不属于自动续费商品，自动续费协议则描述了自动续费流程。[法律中心](https://www.pinngoo.cn/legal)、[用户协议](https://www.pinngoo.cn/legal/user-agreement)、[自动续费协议](https://www.pinngoo.cn/legal/auto-renewal-agreement)
- 网站用户协议限制未经授权抓取数据及反向工程。本次仅整理 robots.txt 允许的公开页面；完整工作流审查需要站点授权的测试环境/账号和官方接口资料。[用户协议](https://www.pinngoo.cn/legal/user-agreement)

## 本地抓取材料

- 页面目录：[站点地图缓存](.firecrawl/pinngoo-sitemap.xml)、[Firecrawl 页面映射](.firecrawl/pinngoo-map.json)、[robots.txt 缓存](.firecrawl/pinngoo-robots.txt)
- 首页原始抓取：[Markdown、链接与 HTML](.firecrawl/pinngoo-home.json)
- 四个功能页：[AI 影视创作](.firecrawl/pinngoo-ai-film-production.md)、[小说转短剧](.firecrawl/pinngoo-novel-to-short-drama.md)、[智能分镜](.firecrawl/pinngoo-ai-storyboard.md)、[AI 视频制作](.firecrawl/pinngoo-ai-video-production.md)
- 法律文件：[法律中心](.firecrawl/pinngoo-legal.md)、[用户协议](.firecrawl/pinngoo-user-agreement.md)、[隐私政策](.firecrawl/pinngoo-privacy-policy.md)、[会员协议](.firecrawl/pinngoo-membership-agreement.md)、[积分充值协议](.firecrawl/pinngoo-credit-recharge-agreement.md)、[自动续费协议](.firecrawl/pinngoo-auto-renewal-agreement.md)、[App 权限](.firecrawl/pinngoo-app-permissions.md)

方法：Firecrawl 映射与抓取公开页面；Scrapling 对智能分镜页做 HTTP 抓取复核，返回 200，正文与 Firecrawl 一致。未使用浏览器交互或执行站内操作。
