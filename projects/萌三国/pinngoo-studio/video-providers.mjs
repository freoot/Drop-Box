import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from './service-error.mjs';

const ARK = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seedance-2-5-260628';
const PROVIDERS = ['seedance', 'xiangong'];
const LABELS = { seedance: '即梦 Seedance 2.5', xiangong: '仙宫云 ComfyUI' };

function parseWorkflow(value) {
  if (!value) return null;
  let workflow;
  try { workflow = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw new HttpError(400, '工作流不是有效的 JSON。'); }
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow) || workflow.nodes
    || !Object.keys(workflow).length || Object.values(workflow).some(node => !node || typeof node.class_type !== 'string' || !node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs))) {
    throw new HttpError(400, '请从 ComfyUI 导出 API 格式的视频工作流；普通画布 JSON 无法提交。');
  }
  return workflow;
}

function baseUrl(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, '请输入完整的 ComfyUI 实例地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new HttpError(400, '实例地址须为 HTTPS，且不能包含密码、查询参数或片段。');
  return url.href.replace(/\/$/, '');
}

export function createVideoService({ env, fetchImpl, stateDir, resolveImage }) {
  const configFile = stateDir ? resolve(stateDir, 'video-settings.json') : null;
  let saved = {};
  if (configFile) {
    try { saved = JSON.parse(readFileSync(configFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('视频配置文件无法读取，请检查 .local/video-settings.json。'); }
  }
  let config = {
    provider: 'seedance', arkApiKey: env.ARK_API_KEY || '', arkModel: env.ARK_VIDEO_MODEL || DEFAULT_MODEL,
    comfyUrl: env.XIANGONG_COMFY_URL || '', comfyToken: env.XIANGONG_COMFY_TOKEN || '', workflow: null,
    promptNode: '', promptInput: 'text', ...saved,
  };
  let saveQueue = Promise.resolve();
  const fingerprint = () => createHash('sha256').update(config.comfyUrl).digest('hex').slice(0, 12);

  function readiness(provider = config.provider) {
    if (provider === 'seedance') return { available: Boolean(config.arkApiKey), provider, label: LABELS[provider], reason: config.arkApiKey ? '可提交视频任务；实际可用性取决于模型权限和账户额度。' : '请在「视频服务设置」填写火山方舟 API Key。' };
    const available = Boolean(config.comfyUrl && config.workflow && typeof config.workflow[config.promptNode]?.inputs?.[config.promptInput] === 'string');
    return { available, provider, label: LABELS[provider], reason: available ? '使用已配置的 ComfyUI 视频工作流，时长和画幅由工作流决定。' : '请在「视频服务设置」填写仙宫云实例地址、导入视频工作流并选择提示词节点。' };
  }

  function publicConfig() {
    return {
      provider: config.provider, arkConfigured: Boolean(config.arkApiKey), arkModel: config.arkModel,
      comfyUrl: config.comfyUrl, comfyTokenConfigured: Boolean(config.comfyToken),
      workflowConfigured: Boolean(config.workflow), promptNode: config.promptNode, promptInput: config.promptInput,
      promptFields: Object.entries(config.workflow || {}).flatMap(([id, node]) => Object.entries(node.inputs).filter(([, value]) => typeof value === 'string').map(([input]) => ({ node: id, input, label: `${id} · ${node.class_type} · ${input}` }))),
      video: readiness(), providers: PROVIDERS.map(provider => readiness(provider)),
    };
  }

  async function save(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '视频配置格式无效。');
    const operation = saveQueue.catch(() => {}).then(async () => {
      const next = { ...config };
      if (body.provider !== undefined) {
        if (!PROVIDERS.includes(body.provider)) throw new HttpError(400, '不支持的视频服务。');
        next.provider = body.provider;
      }
      for (const field of ['arkApiKey', 'comfyToken']) {
        if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].length > 4096 || /[\r\n]/.test(body[field]))) throw new HttpError(400, '密钥格式无效。');
        if (body[field]?.trim()) next[field] = body[field].trim();
      }
      if (body.clearArkKey === true) next.arkApiKey = '';
      if (body.clearComfyToken === true) next.comfyToken = '';
      if (body.arkModel !== undefined) {
        if (typeof body.arkModel !== 'string' || !/^[a-z\d_.-]{1,150}$/i.test(body.arkModel)) throw new HttpError(400, '请输入有效的模型 ID 或推理接入点 ID。');
        next.arkModel = body.arkModel;
      }
      if (body.comfyUrl !== undefined) next.comfyUrl = baseUrl(body.comfyUrl);
      if (body.workflow !== undefined) next.workflow = parseWorkflow(body.workflow);
      for (const field of ['promptNode', 'promptInput']) {
        if (body[field] !== undefined) {
          if (typeof body[field] !== 'string' || body[field].length > 100 || ['__proto__','constructor','prototype'].includes(body[field])) throw new HttpError(400, '提示词字段无效。');
          next[field] = body[field];
        }
      }
      if (next.workflow && (next.promptNode || next.promptInput !== 'text') && typeof next.workflow[next.promptNode]?.inputs?.[next.promptInput] !== 'string') throw new HttpError(400, '所选提示词节点必须对应工作流中的文本输入。');
      if (configFile) {
        await mkdir(dirname(configFile), { recursive: true, mode: 0o700 });
        const temp = `${configFile}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
        await rename(temp, configFile);
      }
      config = next;
      return publicConfig();
    });
    saveQueue = operation;
    return operation;
  }

  async function upstream(url, { method = 'GET', body, token, timeout = 120_000 } = {}) {
    let response;
    try {
      response = await fetchImpl(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(timeout) });
    } catch { throw new HttpError(502, '无法连接视频服务，请检查网络和实例地址。', 'video_connection_failed'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const messages = { 401: '视频服务密钥无效或已失效。', 403: '视频服务拒绝访问，请检查模型开通状态与权限。', 429: '视频服务额度不足或请求过于频繁，请检查账户后重试。', 404: '未找到视频模型、实例接口或任务，请检查配置。' };
      throw new HttpError(response.status, messages[response.status] || `视频服务拒绝请求（HTTP ${response.status}），请检查工作流或生成参数。`, 'video_upstream_error');
    }
    if (!data || typeof data !== 'object' || data.error || (data.node_errors && Object.keys(data.node_errors).length)) throw new HttpError(502, '视频服务返回了错误或无法识别的结果，请检查工作流与模型配置。', 'video_invalid_response');
    return data;
  }

  async function check(provider) {
    if (!PROVIDERS.includes(provider)) throw new HttpError(400, '不支持的视频服务。');
    if (provider === 'seedance') {
      if (!config.arkApiKey) throw new HttpError(503, '请先保存火山方舟 API Key。', 'missing_video_key');
      const data = await upstream(`${ARK}/contents/generations/tasks?page_size=1`, { token: config.arkApiKey, timeout: 15_000 });
      if (!Array.isArray(data.items)) throw new HttpError(502, '视频接口返回格式不正确，尚未验证连接。');
      return { status: 'reachable', message: '火山方舟任务接口连接正常；Seedance 2.5 权限和额度需在实际生成时验证。' };
    }
    if (!config.comfyUrl) throw new HttpError(503, '请先保存仙宫云 ComfyUI 实例地址。');
    const data = await upstream(`${config.comfyUrl}/system_stats`, { token: config.comfyToken, timeout: 15_000 });
    if (!data.system || !Array.isArray(data.devices)) throw new HttpError(502, '此地址未返回 ComfyUI 状态，请检查实例是否启动。');
    return { status: 'reachable', message: `ComfyUI 实例连接正常。${readiness('xiangong').reason}` };
  }

  async function create(body) {
    const provider = body?.provider || config.provider;
    if (!PROVIDERS.includes(provider)) throw new HttpError(400, '请使用即梦 Seedance 2.5 或仙宫云。');
    const ready = readiness(provider);
    if (!ready.available) throw new HttpError(503, ready.reason, 'video_not_configured');
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 20_000) throw new HttpError(400, '请输入 1 至 20,000 字的视频描述。');
    if (provider === 'seedance') {
      const duration = Number(body.seconds ?? 5);
      if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new HttpError(400, 'Seedance 2.5 视频时长须为 4 至 30 秒。');
      const ratio=body.ratio||'9:16', resolution=body.resolution||'720p';
      if (!['16:9','9:16','1:1'].includes(ratio) || !['480p','720p','1080p'].includes(resolution)) throw new HttpError(400, '不支持的视频画幅或清晰度。');
      if (body.audio!==undefined && typeof body.audio!=='boolean') throw new HttpError(400, '声音开关无效。');
      const content=[{type:'text',text:prompt}];
      if(body.firstFrame){
        if(!resolveImage)throw new HttpError(400, '请先上传首帧图片。');
        const image=await resolveImage(body.firstFrame);
        content.push({type:'image_url',image_url:{url:`data:${image.type};base64,${image.bytes.toString('base64')}`},role:'first_frame'});
      }
      const result = await upstream(`${ARK}/contents/generations/tasks`, { method: 'POST', token: config.arkApiKey, body: {
        model: config.arkModel, content, duration, ratio, resolution, generate_audio:body.audio??true,
      } });
      if (typeof result.id !== 'string' || !/^[\w-]+$/.test(result.id)) throw new HttpError(502, '视频服务未返回有效任务编号。');
      return { id: `seedance_${result.id}`, provider, label: LABELS[provider], status: 'queued', progress: 0, seconds: duration };
    }
    if(body.firstFrame)throw new HttpError(400, '当前 ComfyUI 工作流只接入文字提示词；请取消首帧图片或使用 Seedance。');
    const workflow = structuredClone(config.workflow);
    workflow[config.promptNode].inputs[config.promptInput] = prompt;
    const result = await upstream(`${config.comfyUrl}/prompt`, { method: 'POST', token: config.comfyToken, body: { prompt: workflow, client_id: randomUUID() } });
    if (typeof result.prompt_id !== 'string' || !/^[\w-]+$/.test(result.prompt_id)) throw new HttpError(502, 'ComfyUI 未返回有效的任务编号。');
    return { id: `xiangong_${fingerprint()}_${result.prompt_id}`, provider, label: LABELS[provider], status: 'queued', progress: 0, seconds: null };
  }

  async function inspect(id) {
    if (id.startsWith('seedance_')) {
      if (!config.arkApiKey) throw new HttpError(503, '请先保存火山方舟 API Key。');
      const data = await upstream(`${ARK}/contents/generations/tasks/${encodeURIComponent(id.slice(9))}`, { token: config.arkApiKey });
      const status = ({ queued:'queued', running:'in_progress', succeeded:'completed', failed:'failed', cancelled:'failed', expired:'failed' })[data.status];
      if (!status) throw new HttpError(502, '视频服务返回未知任务状态。');
      return { id, provider:'seedance', label:LABELS.seedance, status, progress: status === 'completed' ? 100 : 0, seconds:data.duration, mediaUrl:data.content?.video_url, error:status === 'failed' ? '视频任务失败、已取消或已过期，请到火山方舟任务记录查看详情。' : null };
    }
    const match = id.match(/^xiangong_([a-f\d]{12})_([\w-]+)$/);
    if (!match) throw new HttpError(410, '此历史视频任务使用已停用的 Sora 接口，请选择新的视频服务重新生成。', 'video_service_retired');
    if (!config.comfyUrl || match[1] !== fingerprint()) throw new HttpError(409, '这个任务属于另一台 ComfyUI 实例，请恢复原来的实例地址再查看。', 'video_instance_changed');
    const data = await upstream(`${config.comfyUrl}/history/${encodeURIComponent(match[2])}`, { token: config.comfyToken });
    const history = data[match[2]];
    const result = { id, provider:'xiangong', label:LABELS.xiangong, status:'in_progress', progress:0 };
    if (!history) return result;
    if (history.status?.status_str === 'error') return { ...result, status:'failed', error:'ComfyUI 执行失败，请检查实例内的模型、节点和工作流。' };
    const files = Object.values(history.outputs || {}).flatMap(output => [...(output.videos || []), ...(output.gifs || []), ...(output.images || [])]);
    const file = files.find(item => typeof item.filename === 'string' && /\.(mp4|webm|mov)$/i.test(item.filename));
    if (file) {
      const query = new URLSearchParams({ filename:file.filename, subfolder:file.subfolder || '', type:file.type || 'output' });
      return { ...result, status:'completed', progress:100, mediaUrl:`${config.comfyUrl}/view?${query}`, mediaToken:config.comfyToken };
    }
    if (history.status?.completed) return { ...result, status:'failed', error:'工作流已结束，但没有输出 MP4、WebM 或 MOV 视频，请检查视频保存节点。' };
    return result;
  }

  async function status(id) {
    const { mediaUrl, mediaToken, ...data } = await inspect(id);
    if (data.status === 'completed' && !mediaUrl) return { ...data, status:'failed', progress:0, error:'视频服务没有返回可播放文件。' };
    return data;
  }

  async function content(id) {
    const job = await inspect(id);
    if (job.status !== 'completed' || !job.mediaUrl) throw new HttpError(409, '视频尚未完成或未返回文件。');
    const url = new URL(job.mediaUrl);
    if (job.provider === 'seedance' && (url.protocol !== 'https:' || url.username || url.password || !['volces.com','volccdn.com','byteimg.com'].some(domain => url.hostname.endsWith(`.${domain}`)))) throw new HttpError(502, '视频下载地址不属于支持的官方域名。');
    let response;
    try { response = await fetchImpl(url.href, { headers:job.mediaToken ? { authorization:`Bearer ${job.mediaToken}` } : {}, redirect:'error', signal:AbortSignal.timeout(120_000) }); }
    catch { throw new HttpError(502, '视频下载失败，请稍后重试。'); }
    if (!response.ok) throw new HttpError(502, '视频下载失败，文件可能已过期。');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 150 * 1024 * 1024) throw new HttpError(502, '视频文件为空或超过 150 MB 预览上限。');
    const type = /\.webm$/i.test(url.pathname) || response.headers.get('content-type')?.includes('webm') ? 'video/webm' : 'video/mp4';
    return { bytes, type };
  }
  return { publicConfig, save, readiness, check, create, status, content };
}
