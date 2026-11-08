# 片场 Studio · AI 影视创作工作台原型

这是一个独立创作工作台，前端使用原生 HTML、CSS 和 JavaScript，本机 Node 服务负责安全地连接兼容 OpenAI 接口格式的文本 AI 服务。API 密钥只保存在服务端，不会发送到浏览器。

## 连接文本 AI

需要 Node.js 20.6 或更新版本，以及文本 AI 服务提供的 API 地址、密钥和模型 ID。它用于生成故事和分镜，使用费用由对应服务商按实际请求计费。

在终端运行以下命令，把 API 密钥填入 `.env` 后启动本机服务：

```sh
cd pinngoo-studio
cp .env.example .env
# 编辑 .env，填写 OPENAI_API_KEY
node server.mjs
```

打开 `http://127.0.0.1:4317`，不要直接打开 `index.html`。可以在左侧“AI 服务设置”中自行填写兼容 OpenAI 接口格式的 HTTPS API 地址、API Key 和文本模型 ID；默认文本模型为 `gpt-5-mini`。也可以通过 `.env` 中的 `OPENAI_BASE_URL`、`OPENAI_API_KEY` 和 `OPENAI_MODEL` 设置初始值。如果 Node 的网络连接在本机被重置，可以设置 `AI_HTTP_TRANSPORT=python`，让服务沿用系统网络连接。

文本 AI 支持 OpenAI Responses API。连接中国区 Kimi 开放平台时，填写 `https://api.moonshot.cn/v1`、开放平台签发的 API Key 和模型 ID（例如 `kimi-k2.6`）；片场会使用 Kimi 的 Chat Completions 接口生成故事和分镜。Kimi Code 与 Kimi 会员的密钥不适用于开放平台，国内和国际平台密钥也不能混用。参考 [Kimi 官方 API 说明](https://www.kimi.com/help/kimi-api/api-troubleshooting) 和 [JSON 输出说明](https://www.kimi.com/help/kimi-api/api-model-capabilities)。

OpenAI 已于 2026 年 9 月 24 日停用 Sora 2 和 Videos API，因此视频生成改为以下两个入口：

- 即梦 Seedance 2.5：使用火山方舟 API，默认模型 ID 为 `doubao-seedance-2-5-260628`。参考[官方教程](https://docs.volcengine.com/docs/ark/seedance-2-5)。
- 仙宫云：连接已启动的 ComfyUI 实例。需要从 ComfyUI 开启开发者模式并导出 API 格式的视频工作流；服务通过 `/prompt` 提交并从 `/history/{prompt_id}` 获取结果。参考 [ComfyUI Server API](https://docs.comfy.org/development/comfyui-server/comms_routes)。

在网站左侧点击“AI 服务设置”即可自行填写文本 AI、即梦和仙宫云所需的信息。密钥、令牌和工作流只保存在本机 `pinngoo-studio/.local/`，该目录已被 Git 忽略。修改 API 主机时，系统不会把原来主机的密钥自动发送到新地址；仙宫云的实例地址必须使用 HTTPS。

创作入口会调用文本模型整理故事结构，分镜工作室会生成并保存镜头列表。视频按钮会把分镜提示词提交给当前选择的 Seedance 2.5 或仙宫云 ComfyUI，任务状态会自动刷新，完成后可在任务详情中播放。没有配置对应服务时，界面会直接打开设置并说明缺少的内容，不会用模拟结果冒充 AI 输出。

## 素材图片上传与生成

“素材资产”页面提供“上传图片”和“AI 生成图片”两个入口：

- 上传本地 PNG、JPEG 或 WebP 图片，单张最大 8 MB，可填写名称、角色/场景/道具类型及关联项目。编辑素材时可以替换或移除图片。
- 填写图片描述并选择方形、竖图或横图，生成完成后自动加入素材库；现有素材卡片上的星形按钮也可以为该素材生成图片。生成任务保留成功或失败记录，失败后可重试。
- 点击素材图片可查看大图并下载。刷新页面和重启本机服务后，已保存的图片仍可读取。

在“AI 服务设置”的“图片生成服务”中自行填写图片 API 地址、API Key 和模型 ID。接口使用 `POST /images/generations`，要求返回 `data[0].b64_json` 图片数据，默认示例为 OpenAI `https://api.openai.com/v1` 与 `gpt-image-1.5`，参考 [OpenAI 图片 API 文档](https://developers.openai.com/api/reference/cli/resources/images/methods/generate)。图片密钥与文本密钥独立保存；也可以通过 `.env` 的 `IMAGE_BASE_URL`、`IMAGE_API_KEY` 和 `IMAGE_MODEL` 设置初始值。

上传操作仅将图片保存到这台电脑；生成操作会把图片描述发送给配置的图片服务，并按服务商规则计费。新上传和生成的图片保存在本机 `pinngoo-studio/.local/images/`，素材名称与图片链接保存在当前浏览器。迁移或备份时需保留这两部分。图片与密钥均不会提交到 Git。

## 原型包含

在“分镜工作室”顶部按 **剧本 → 统一画风 → 资产 → 资产配图 → 镜头配图** 推进项目。可编辑、下载本集剧本，调用文本模型生成本集正文或提取项目资产；每个镜头可以引用资产文字设定、上传配图、使用素材图片或生成新配图；选中参考图片后，图片数据会发送给所配置的图片服务（需支持 JSON 格式的 `/images/edits`）。“生成缺少的配图”只提交尚未配图的镜头，失败时停止，已完成结果保留。批量分镜只生成尚无分镜的分集。

素材库中选择一个项目，可按角色、场景、道具或关键词筛选，再批量生成缺图、批量重绘或打包下载 ZIP。重绘会保留旧图，可在大图预览下恢复最近 20 张历史图片；批量重绘默认使用旧图作为视觉参考。缺图生成失败后，再次提交会跳过已完成项。

分镜卡片支持逐镜生成视频。可修改镜头提示词与 Seedance 时长（4–30 秒）、画幅、清晰度和声音，并选择配图作为首帧。批量入口跳过已完成或正在生成的镜头，结果可逐镜播放与下载；尚不合成整集视频。ComfyUI 的时长、画幅与声音沿用导入工作流，当前只接入文字提示词。5 秒概念预览保留为单独入口。

画布节点按项目保存，可拖动或在编辑框输入位置；选择“连接”后依次点击两个节点建立连线。素材卡片上的画布按钮可将素材加入所属项目。复制项目包含剧本、分镜、图片链接、资产引用和画布内容。

本次原站对照来源、测试范围与未完成差异见 [功能对照记录](./FUNCTION-AUDIT.md)。当前仍是独立本地工作台，不能宣称与原站全部功能相同。

- 四种创作入口：从剧本、灵感、长篇故事、小说改编开始
- 项目列表、继续创作、重命名、复制、归档
- 角色、场景、道具素材资产管理、本地图片上传与 AI 图片生成
- 分集与分镜工作室、AI 镜头生成与编辑
- 即梦 Seedance 2.5 与仙宫云 ComfyUI 视频任务提交、状态查询和结果预览
- 可添加节点的创意画布
- 图片、分镜、视频演示任务列表与状态操作
- 作品搜索、分类筛选和喜欢列表
- 浏览器本地保存、演示数据导出与重置
- 响应式桌面和移动端布局

默认项目、素材、社区作品和部分历史任务是虚构示例数据。AI 生成的故事与分镜会保存在当前浏览器。提交故事或分镜时，内容会发送给当前设置的文本 AI API；提交视频时，分镜提示词会发送给当前选择的视频服务。此应用不会访问 PINNGOO 账号。会员、充值和支付页面不在原型范围内。

## 浏览器交互测试

安装测试依赖和 Chromium 后，在仓库根目录运行：

```sh
python -m pip install -r pinngoo-studio/requirements-test.txt
python -m playwright install chromium
node --test pinngoo-studio/tests/server.test.mjs
python -m unittest discover -s pinngoo-studio/tests -v
```

测试以专用模拟 API 模式运行，不会消耗真实服务额度。测试覆盖故事生成、AI 分镜、视频任务及状态刷新、项目管理、素材增改删、图片上传/替换/移除/预览/保存、AI 图片生成与配置提示、画布节点操作、作品筛选/喜欢、文本导入和移动导航。浏览器测试使用临时图片存储目录，不会修改真实素材文件。
