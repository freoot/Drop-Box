import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './service-error.mjs';
import { networkFetch } from './transport.mjs';
import { createTextAiService } from './text-ai-service.mjs';
import { createVideoService } from './video-providers.mjs';
import { createImageService } from './image-service.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const JSON_LIMIT = 12 * 1024 * 1024;
const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcIoAAAAASUVORK5CYII=';
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw new HttpError(413, '请求内容过大，请缩短文本或移除大图片后再试。');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求格式无效。');
  }
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  return (data?.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('\n')
    .trim();
}

async function generateText(body, { textAi, testMode }) {
  const kind = body.kind;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!['story', 'storyboard', 'assets', 'episode'].includes(kind)) throw new HttpError(400, '不支持的 AI 生成类型。');
  if (!text || text.length > 40_000) throw new HttpError(400, '请提供 1 至 40,000 个字符的创作内容。');

  if (testMode) {
    if (kind === 'assets') return { assets:[
      {name:'邮差',type:'character',description:'绿色外套，旧邮袋，青年邮差'},
      {name:'雨夜邮局',type:'scene',description:'木柜台，暖色灯光，窗外雨夜'},
      {name:'未来来信',type:'prop',description:'带蓝色邮戳的旧信封'},
    ] };
    if (kind === 'episode') return { text:`第 ${Number(body.episode)||1} 集\n场景：雨夜邮局\n邮差拆开信封，发现来自未来的邮戳。\n邮差：这封信是谁寄来的？` };
    if (kind === 'story') return { text: `故事概览\n\n${text}\n\n主线：主角沿着线索逐步接近真相，并在结尾作出选择。` };
    return { shots: [
      { title: '建立故事空间', desc: text.slice(0, 120), voice: '环境声 · 空间底噪', lens: '远景', move: '缓慢推镜', duration: '6 秒' },
      { title: '人物发现线索', desc: '主角停下动作，注意到场景中的关键细节。', voice: '对白 · 轻声自语', lens: '近景', move: '轻微摇镜', duration: '5 秒' },
      { title: '线索留下悬念', desc: '镜头停留在关键物件上，留下下一场戏的悬念。', voice: '环境声 · 音乐渐弱', lens: '特写', move: '静止', duration: '4 秒' },
    ] };
  }

  const isStoryboard = kind === 'storyboard';
  const isAssets = kind === 'assets';
  const structured = isStoryboard || isAssets;
  const modeLabel = ({ idea:'灵感短篇', script:'已有剧本整理', series:'长篇故事规划', novel:'小说改编' })[body.mode] || '原创故事';
  const model = textAi.model;
  const instructions = isAssets
    ? '你是影视资产设计师。只从给定剧本提取明确出现的角色、场景与道具，不改变剧情。为每项写可直接用于生图的外观描述，遵守项目统一画风。最多提取 20 项。只返回 JSON 对象 {"assets":[{"name":"名称","type":"character或scene或prop","description":"外观与视觉描述"}]}。'
    : kind === 'episode'
    ? '你是影视编剧。按照给定故事总览、当前集数、前集内容与本集大纲，生成这一集完整可制作的中文剧本，包含场次、场景、角色动作和逐字台词。保持人物、时间和因果连续，不跳写其他集。'
    : isStoryboard
    ? '你是影视分镜导演。请根据用户提供的项目、分集和风格信息，生成可拍摄的中文镜头方案。镜头要有明确的画面、动作、景别、运镜、时长和声音提示。'
    : '你是影视编剧顾问。请根据用户的创作材料生成可继续开发的中文故事结构，包含故事核心、主要人物、冲突、分集梗概和开篇场景。尊重用户提供的原创材料，不虚构用户未给出的既定事实。';
  const input = kind !== 'story' ? text : [
    `创作方式：${modeLabel}`,
    `项目标题：${String(body.title||'未命名项目').slice(0,100)}`,
    `规划集数：${Math.max(1,Math.min(Number(body.episodes)||2,200))}`,
    `单集时长：约 ${Math.max(1,Math.min(Number(body.minutes)||2,30))} 分钟`,
    '请按「故事核心、主要人物、核心冲突、分集梗概、开篇场景」组织内容。',
    '用户提供的内容：',
    text,
  ].join('\n');
  if (textAi.apiKind === 'kimi') {
    const data = await textAi.request('/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: isStoryboard ? `${instructions} 只返回一个 JSON 对象，格式为 {"shots":[{"title":"镜头标题","desc":"画面与动作","voice":"对白或声音","lens":"景别","move":"运镜","duration":"时长"}]}。镜头数为 4 至 8 个，不要添加其他文字。` : instructions },
          { role: 'user', content: input },
        ],
        max_completion_tokens: structured ? 4000 : 3500,
        ...(model === 'kimi-k2.6' ? { thinking: { type: 'disabled' } } : {}),
        ...(structured ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (data.choices?.[0]?.finish_reason === 'length') throw new HttpError(502, 'AI 输出未完成，请缩短输入内容后重试。', 'incomplete_output');
    const output = data.choices?.[0]?.message?.content;
    if (typeof output !== 'string' || !output.trim()) throw new HttpError(502, 'Kimi 返回了空结果，请检查模型权限或稍后重试。');
    return isAssets ? parseAssets(output) : isStoryboard ? parseStoryboard(output) : { text: output.trim() };
  }
  const bodyForApi = {
    model,
    instructions,
    input,
    max_output_tokens: structured ? 4000 : 3500,
  };
  if (isStoryboard) {
    bodyForApi.text = {
      format: {
        type: 'json_schema',
        name: 'storyboard',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['shots'],
          properties: {
            shots: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'desc', 'voice', 'lens', 'move', 'duration'],
                properties: {
                  title: { type: 'string' },
                  desc: { type: 'string' },
                  voice: { type: 'string' },
                  lens: { type: 'string' },
                  move: { type: 'string' },
                  duration: { type: 'string' },
                },
              },
            },
          },
        },
      },
    };
  }
  if (isAssets) bodyForApi.text = { format:{type:'json_schema',name:'assets',strict:true,schema:{
    type:'object',additionalProperties:false,required:['assets'],properties:{assets:{type:'array',items:{
      type:'object',additionalProperties:false,required:['name','type','description'],properties:{
        name:{type:'string'},type:{type:'string',enum:['character','scene','prop']},description:{type:'string'},
      },
    }}},
  }} };
  const data = await textAi.request('/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bodyForApi),
  });
  if (data.status === 'incomplete') throw new HttpError(502, 'AI 输出未完成，请缩短输入内容后重试。', 'incomplete_output');
  if (data.status === 'failed' || data.error) throw new HttpError(502, 'AI 未能完成本次生成，请稍后重试。', 'generation_failed');
  const output = extractOutputText(data);
  if (!output) throw new HttpError(502, 'AI 服务返回了空结果，请稍后重试。');
  if (isAssets) return parseAssets(output);
  if (!isStoryboard) return { text: output };
  return parseStoryboard(output);
}

function parseAssets(output) {
  try {
    const result = JSON.parse(output);
    if (!Array.isArray(result.assets) || result.assets.length > 20 || result.assets.some(asset =>
      !asset || !['character','scene','prop'].includes(asset.type) || typeof asset.name !== 'string'
      || !asset.name.trim() || asset.name.length > 80 || typeof asset.description !== 'string'
      || !asset.description.trim() || asset.description.length > 2000)) throw new Error();
    return { assets:result.assets };
  } catch { throw new HttpError(502, 'AI 返回的资产格式无法读取，请重新提取。'); }
}

function parseStoryboard(output) {
  try {
    const result = JSON.parse(output);
    const fields = ['title', 'desc', 'voice', 'lens', 'move', 'duration'];
    if (!Array.isArray(result.shots) || result.shots.length < 1 || result.shots.length > 12
      || result.shots.some((shot) => !shot || fields.some((field) => typeof shot[field] !== 'string') || !shot.title.trim() || !shot.desc.trim())) throw new Error();
    return { shots: result.shots };
  } catch {
    throw new HttpError(502, 'AI 返回的分镜格式无法读取，请重新生成。');
  }
}

export function createAppServer({ env = process.env, fetchImpl = null, root = ROOT, stateDir = null } = {}) {
  const testMode = env.PINNGOO_AI_TEST_MODE === '1';
  const upstreamFetch = fetchImpl || networkFetch(env);
  const textAi = createTextAiService({ env, fetchImpl: upstreamFetch, stateDir });
  const imageService = createImageService({ env, fetchImpl: upstreamFetch, stateDir });
  const videoService = createVideoService({ env, fetchImpl: upstreamFetch, stateDir, resolveImage:imageService.resolveImage });
  const testVideo = { available:true, provider:'test', label:'视频测试模式', reason:'仅模拟任务，不调用真实视频服务。' };
  const videoState = () => testMode ? testVideo : videoService.readiness();
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}`) throw new HttpError(403, '已拒绝来自其他网站的本机 API 请求。');
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        sendJson(response, 200, {
          provider: 'openai-compatible',
          configured: textAi.configured || testMode,
          testMode,
          textModel: testMode ? 'gpt-5-mini' : textAi.model,
          video: videoState(),
        });
        return;
      }
      if (url.pathname === '/api/generate' && request.method === 'POST') {
        const result = await generateText(await readJson(request), { textAi, testMode });
        sendJson(response, 200, result);
        return;
      }
      if (url.pathname === '/api/check' && request.method === 'POST') {
        let text;
        try {
          text = testMode ? { status:'test', message:'仅模拟连接，未验证真实服务。' } : await textAi.check();
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          text = { status: 'failed', code: error.code, message: error.message };
        }
        sendJson(response, 200, { text, video: videoState(), testMode });
        return;
      }
      if (url.pathname === '/api/ai-settings' && request.method === 'GET') {
        sendJson(response, 200, testMode ? { provider:'test', configured:true, apiKeyConfigured:false, baseUrl:'https://gpt.gptzzz.xyz/v1', model:'gpt-5-mini' } : textAi.publicConfig());
        return;
      }
      if (url.pathname === '/api/ai-settings' && request.method === 'POST') {
        if (testMode) throw new HttpError(400, '测试模式不保存 AI 服务设置。');
        sendJson(response, 200, await textAi.save(await readJson(request)));
        return;
      }
      if (url.pathname === '/api/video-settings' && request.method === 'GET') {
        sendJson(response, 200, testMode ? { provider:'seedance', arkConfigured:false, arkModel:'doubao-seedance-2-5-260628', comfyUrl:'', comfyTokenConfigured:false, workflowConfigured:false, promptNode:'', promptInput:'text', video:testVideo, providers:[testVideo], promptFields:[] } : videoService.publicConfig());
        return;
      }
      if (url.pathname === '/api/image-settings' && request.method === 'GET') {
        sendJson(response, 200, testMode ? { configured:true, apiKeyConfigured:false, baseUrl:'https://api.openai.com/v1', model:'gpt-image-1.5', testMode:true } : imageService.publicConfig());
        return;
      }
      if (url.pathname === '/api/image-settings' && request.method === 'POST') {
        if (testMode) throw new HttpError(400, '测试模式不保存图片服务设置。');
        sendJson(response, 200, await imageService.save(await readJson(request)));
        return;
      }
      if (url.pathname === '/api/image-check' && request.method === 'POST') {
        sendJson(response, 200, testMode ? { status:'test', message:'图片测试模式连接正常。' } : await imageService.check());
        return;
      }
      if (url.pathname === '/api/images/upload' && request.method === 'POST') {
        const body = await readJson(request);
        sendJson(response, 201, await imageService.upload(body));
        return;
      }
      if (url.pathname === '/api/images/archive' && request.method === 'POST') {
        const bytes = await imageService.archive(await readJson(request));
        response.writeHead(200, {'content-type':'application/zip','content-length':bytes.length,'content-disposition':'attachment; filename="materials.zip"','cache-control':'no-store','x-content-type-options':'nosniff'});
        response.end(bytes);
        return;
      }
      if (url.pathname === '/api/images/generate' && request.method === 'POST') {
        const body = await readJson(request);
        sendJson(response, 201, testMode ? await imageService.upload({dataUrl:TEST_IMAGE}) : await imageService.generate(body));
        return;
      }
      const imageMatch = url.pathname.match(/^\/api\/images\/([a-f\d-]{36})\.(png|jpg|webp)$/i);
      if (imageMatch && request.method === 'GET') {
        const file = await imageService.content(imageMatch[1], imageMatch[2]);
        response.writeHead(200, { 'content-type':file.type, 'content-length':file.bytes.length, 'cache-control':'private, max-age=3600', 'x-content-type-options':'nosniff' });
        response.end(file.bytes);
        return;
      }
      if (url.pathname === '/api/video-settings' && request.method === 'POST') {
        if (testMode) throw new HttpError(400, '测试模式不保存视频服务设置。');
        sendJson(response, 200, await videoService.save(await readJson(request)));
        return;
      }
      if (url.pathname === '/api/video-check' && request.method === 'POST') {
        const body = await readJson(request);
        sendJson(response, 200, testMode ? { status:'test', message:'视频测试模式连接正常。' } : await videoService.check(body.provider));
        return;
      }
      if (url.pathname === '/api/videos' && request.method === 'POST') {
        const body = await readJson(request);
        if (testMode) {
          sendJson(response, 202, { id:`test_${Date.now()}`, provider:'test', label:'视频测试模式', status:'queued', progress:0, seconds:Number(body.seconds)||5 });
        } else {
          sendJson(response, 202, await videoService.create(body));
        }
        return;
      }
      const videoMatch = url.pathname.match(/^\/api\/videos\/([a-z\d_-]+)(\/content)?$/i);
      if (videoMatch && request.method === 'GET') {
        const id = videoMatch[1];
        if (testMode) {
          if (videoMatch[2]) {
            response.writeHead(200, { 'content-type':'video/mp4', 'cache-control':'no-store' });
            response.end(Buffer.alloc(0));
          } else {
            sendJson(response, 200, { id, provider:'test', label:'视频测试模式', status:'completed', progress:100, seconds:5 });
          }
          return;
        }
        if (videoMatch[2]) {
          const file = await videoService.content(id);
          response.writeHead(200, { 'content-type':file.type, 'content-length':file.bytes.length, 'cache-control':'no-store', 'x-content-type-options':'nosniff' });
          response.end(file.bytes);
        } else {
          sendJson(response, 200, await videoService.status(id));
        }
        return;
      }
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, '找不到该 API 路径。');
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, '该请求方法不受支持。');

      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, '页面路径无效。'); }
      if (pathname === '/') pathname = '/index.html';
      if (!['/index.html', '/app.js', '/workflow.js', '/styles.css'].includes(pathname)) throw new HttpError(404, '找不到此页面。');
      const filePath = resolve(root, `.${pathname}`);
      if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) throw new HttpError(403, '无法读取此文件。');
      const fileInfo = await stat(filePath).catch(() => null);
      if (!fileInfo?.isFile()) throw new HttpError(404, '找不到此页面。');
      const body = request.method === 'HEAD' ? undefined : await readFile(filePath);
      response.writeHead(200, {
        'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(body);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(response, status, { error: error instanceof HttpError ? error.message : '本地服务发生错误，请查看服务状态后重试。', code: error instanceof HttpError ? error.code : 'internal_error' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(resolve(ROOT, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const host = '127.0.0.1';
  const configuredPort = Number(process.env.PORT);
  const port = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 4317;
  const stateDir = process.env.PINNGOO_AI_TEST_MODE === '1' && process.env.PINNGOO_TEST_STATE_DIR
    ? resolve(process.env.PINNGOO_TEST_STATE_DIR) : resolve(ROOT, '.local');
  const server = createAppServer({ stateDir });
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`片场本地服务已启动：http://${host}:${address.port}`);
    console.log('AI 配置已读取；可在网页的“AI 服务设置”中检查或修改。');
  });
}
