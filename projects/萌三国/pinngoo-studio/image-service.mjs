import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HttpError } from './service-error.mjs';
import { createImageArchive } from './image-archive.mjs';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-image-1.5';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, '请输入完整的图片 API 地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new HttpError(400, '图片 API 地址须为 HTTPS，且不能包含密码、查询参数或片段。');
  }
  return url.href.replace(/\/$/, '');
}

function decodeImage(base64, declaredType = '') {
  if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpError(400, '图片数据无效或超过 8 MB。');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== base64) throw new HttpError(400, '图片数据无效或超过 8 MB。');
  let type = '';
  let ext = '';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) { type = 'image/png'; ext = 'png'; }
  else if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { type = 'image/jpeg'; ext = 'jpg'; }
  else if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') { type = 'image/webp'; ext = 'webp'; }
  if (!type || (declaredType && declaredType !== type)) throw new HttpError(400, '仅支持真实的 PNG、JPEG 或 WebP 图片。');
  return { bytes, type, ext };
}

export function createImageService({ env, fetchImpl, stateDir }) {
  const configFile = stateDir ? resolve(stateDir, 'image-settings.json') : null;
  const imageDir = stateDir ? resolve(stateDir, 'images') : null;
  let saved = {};
  if (configFile) {
    try { saved = JSON.parse(readFileSync(configFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('图片配置文件无法读取，请检查 .local/image-settings.json。'); }
  }
  let config = {
    baseUrl: env.IMAGE_BASE_URL || DEFAULT_BASE_URL,
    apiKey: env.IMAGE_API_KEY || '',
    model: env.IMAGE_MODEL || DEFAULT_MODEL,
    ...saved,
  };
  let saveQueue = Promise.resolve();

  function publicConfig() {
    return { configured:Boolean(config.apiKey), apiKeyConfigured:Boolean(config.apiKey), baseUrl:config.baseUrl, model:config.model };
  }

  async function save(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '图片服务配置无效。');
    const operation = saveQueue.catch(() => {}).then(async () => {
      const next = { ...config };
      if (body.baseUrl !== undefined) {
        const baseUrl = normalizeBaseUrl(body.baseUrl);
        if (baseUrl !== next.baseUrl && !String(body.apiKey || '').trim()) next.apiKey = '';
        next.baseUrl = baseUrl;
      }
      if (body.apiKey !== undefined) {
        if (typeof body.apiKey !== 'string' || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey)) throw new HttpError(400, '图片 API Key 格式无效。');
        if (body.apiKey.trim()) next.apiKey = body.apiKey.trim();
      }
      if (body.clearApiKey === true) next.apiKey = '';
      if (body.model !== undefined) {
        if (typeof body.model !== 'string' || !/^[a-z\d_.:/-]{1,180}$/i.test(body.model.trim())) throw new HttpError(400, '请输入有效的图片模型 ID。');
        next.model = body.model.trim();
      }
      if (configFile) {
        await mkdir(stateDir, { recursive:true, mode:0o700 });
        const temporary = `${configFile}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(next, null, 2), { mode:0o600 });
        await rename(temporary, configFile);
      }
      config = next;
      return publicConfig();
    });
    saveQueue = operation;
    return operation;
  }

  async function store(image) {
    if (!imageDir) throw new HttpError(500, '图片存储目录尚未配置。');
    await mkdir(imageDir, { recursive:true, mode:0o700 });
    const id = randomUUID();
    await writeFile(resolve(imageDir, `${id}.${image.ext}`), image.bytes, { flag:'wx', mode:0o600 });
    return { url:`/api/images/${id}.${image.ext}`, type:image.type };
  }

  async function upload(body) {
    const match = typeof body?.dataUrl === 'string' && body.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new HttpError(400, '请选择 PNG、JPEG 或 WebP 图片。');
    return store(decodeImage(match[2], match[1]));
  }

  async function check() {
    if (!config.apiKey) throw new HttpError(503, '请先保存图片 API Key。', 'missing_image_key');
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/models`, {
        method:'GET', redirect:'error', signal:AbortSignal.timeout(15_000),
        headers:{ authorization:`Bearer ${config.apiKey}` },
      });
    } catch { throw new HttpError(502, '无法连接图片服务，请检查地址与网络。', 'image_connection_failed'); }
    if (response.status === 401) throw new HttpError(401, '图片服务密钥无效或已失效。');
    if (!response.ok) throw new HttpError(response.status, `图片服务连接检查失败（HTTP ${response.status}）。`);
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.data)) throw new HttpError(502, '图片服务模型列表格式无法识别。');
    return { status:'reachable', message:`图片 API 地址和密钥连接正常；${config.model} 的生成权限与额度需实际生成验证。` };
  }

  async function generate(body) {
    if (!config.apiKey) throw new HttpError(503, '请先在“AI 服务设置”中添加图片 API Key。', 'missing_image_key');
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) throw new HttpError(400, '请输入 1 至 4,000 字的图片描述。');
    const size = body.size || '1024x1024';
    if (!['1024x1024', '1024x1536', '1536x1024'].includes(size)) throw new HttpError(400, '不支持的图片尺寸。');
    const references = body.references ?? [];
    if (!Array.isArray(references) || references.length > 8) throw new HttpError(400, '最多选择 8 张参考图片。');
    const images = []; let totalBytes = 0;
    for (const reference of [...new Set(references)]) {
      const file = await resolveImage(reference);
      totalBytes += file.bytes.length;
      if (totalBytes > 32 * 1024 * 1024) throw new HttpError(400, '参考图片总大小不能超过 32 MB。');
      images.push({image_url:`data:${file.type};base64,${file.bytes.toString('base64')}`});
    }
    const editing = images.length > 0;
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/images/${editing ? 'edits' : 'generations'}`, {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(180_000),
        headers:{ authorization:`Bearer ${config.apiKey}`, 'content-type':'application/json' },
        body:JSON.stringify({ model:config.model, prompt, size, n:1, output_format:'png', ...(editing ? {images} : {}) }),
      });
    } catch { throw new HttpError(502, '无法连接图片服务，请检查地址与网络。', 'image_connection_failed'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const messages = { 400:editing ? '图片服务不接受参考图请求，请确认支持 JSON 格式的 /images/edits 接口。' : '图片服务不接受这些生成参数，请检查模型和尺寸。', 401:'图片服务密钥无效或已失效。', 403:'图片服务拒绝访问，请检查模型权限。', 404:editing ? '该图片服务或模型不支持 /images/edits 参考图接口。' : '图片模型或 API 地址不存在。', 429:'图片服务额度不足或请求过于频繁。' };
      throw new HttpError(response.status, messages[response.status] || `图片服务返回 HTTP ${response.status}，请检查配置。`, 'image_upstream_error');
    }
    if (typeof data?.data?.[0]?.b64_json !== 'string') throw new HttpError(502, '图片服务没有返回可保存的图片数据。');
    let image;
    try { image = decodeImage(data.data[0].b64_json); }
    catch { throw new HttpError(502, '图片服务返回的图片格式无效或超过 8 MB。'); }
    return store(image);
  }

  async function content(id, ext) {
    if (!imageDir || !/^[a-f\d-]{36}$/.test(id) || !['png','jpg','webp'].includes(ext)) throw new HttpError(404, '找不到图片。');
    const bytes = await readFile(resolve(imageDir, `${id}.${ext}`)).catch(() => null);
    if (!bytes) throw new HttpError(404, '找不到图片。');
    return { bytes, type:({png:'image/png',jpg:'image/jpeg',webp:'image/webp'})[ext] };
  }

  async function resolveImage(reference) {
    if (typeof reference !== 'string') throw new HttpError(400, '参考图片地址无效。');
    const local = reference.match(/^\/api\/images\/([a-f\d-]{36})\.(png|jpg|webp)$/i);
    if (local) return content(local[1], local[2].toLowerCase());
    const data = reference.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (data) return decodeImage(data[2], data[1]);
    throw new HttpError(400, '请先把参考图片上传到本地素材库；不能使用外部网址或文件路径。');
  }

  async function archive(body) {
    if (!Array.isArray(body?.images) || body.images.length < 1 || body.images.length > 100) throw new HttpError(400, '请选择 1 至 100 张图片下载。');
    const files = []; let totalBytes = 0;
    for (let i = 0; i < body.images.length; i++) {
      const item = body.images[i], file = await resolveImage(item?.url);
      totalBytes += file.bytes.length;
      if (totalBytes > 100 * 1024 * 1024) throw new HttpError(413, '单次打包不能超过 100 MB，请按类型分别下载。');
      const name = String(item.name || '素材').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '_').slice(0, 80);
      files.push({name:`${String(i+1).padStart(3,'0')}-${name}.${({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[file.type]}`,bytes:file.bytes});
    }
    return createImageArchive(files);
  }
  return { publicConfig, save, check, upload, generate, content, archive, resolveImage };
}
