import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { HttpError } from './service-error.mjs';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5-mini';

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, '请输入完整的 AI API 地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new HttpError(400, 'AI API 地址须为 HTTPS，且不能包含密码、查询参数或片段。');
  }
  return url.href.replace(/\/$/, '');
}

function upstreamError(status, data) {
  const detail = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 180) : '';
  if (status === 401) return new HttpError(401, 'AI API 密钥无效或已失效，请在“AI 服务设置”中更新。', 'invalid_api_key');
  if (status === 403) return new HttpError(403, 'AI 服务拒绝访问，请检查密钥、模型权限和服务商限制。', 'access_denied');
  if (status === 404) return new HttpError(404, 'AI 接口或模型不存在，请检查 API 地址与模型 ID。', 'model_unavailable');
  if (status === 429 && data?.error?.code === 'insufficient_quota') return new HttpError(429, 'AI API 额度不足，请检查账户余额和使用限额。', 'insufficient_quota');
  if (status === 429) return new HttpError(429, 'AI 服务请求过于频繁，请稍后重试。', 'rate_limited');
  return new HttpError(502, `AI 服务未能处理请求（HTTP ${status}）${detail ? `：${detail}` : '。'}`, 'upstream_error');
}

export function createTextAiService({ env, fetchImpl, stateDir }) {
  const configFile = stateDir ? resolve(stateDir, 'text-ai-settings.json') : null;
  let saved = {};
  if (configFile) {
    try { saved = JSON.parse(readFileSync(configFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('文本 AI 配置文件无法读取，请检查 .local/text-ai-settings.json。'); }
  }
  let config = {
    baseUrl: env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    apiKey: env.OPENAI_API_KEY || '',
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
    ...saved,
  };
  let saveQueue = Promise.resolve();

  function publicConfig() {
    return {
      provider: 'openai-compatible',
      configured: Boolean(config.apiKey),
      apiKeyConfigured: Boolean(config.apiKey),
      baseUrl: config.baseUrl,
      model: config.model,
    };
  }

  async function save(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'AI 配置格式无效。');
    const operation = saveQueue.catch(() => {}).then(async () => {
      const next = { ...config };
      if (body.baseUrl !== undefined) {
        const newBaseUrl = normalizeBaseUrl(body.baseUrl);
        if (newBaseUrl !== next.baseUrl && !String(body.apiKey || '').trim()) next.apiKey = '';
        next.baseUrl = newBaseUrl;
      }
      if (body.apiKey !== undefined) {
        if (typeof body.apiKey !== 'string' || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey)) throw new HttpError(400, 'AI API 密钥格式无效。');
        if (body.apiKey.trim()) next.apiKey = body.apiKey.trim();
      }
      if (body.clearApiKey === true) next.apiKey = '';
      if (body.model !== undefined) {
        if (typeof body.model !== 'string' || !/^[a-z\d_.:/-]{1,180}$/i.test(body.model.trim())) throw new HttpError(400, '请输入有效的文本模型 ID。');
        next.model = body.model.trim();
      }
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

  async function request(path, init = {}, timeoutMs = 120_000) {
    if (!config.apiKey) throw new HttpError(503, '请先在“AI 服务设置”中填写文本 AI 的 API Key。', 'missing_api_key');
    let upstream;
    let raw;
    try {
      upstream = await fetchImpl(`${config.baseUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${config.apiKey}`, ...init.headers },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      raw = await upstream.text();
    } catch (error) {
      const timedOut = ['TimeoutError', 'AbortError'].includes(error.name) || error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
      throw new HttpError(timedOut ? 504 : 502, timedOut
        ? '连接 AI API 超时，请检查地址、网络或代理后重试。'
        : '连接 AI API 失败，请检查地址、网络或代理后重试。', timedOut ? 'upstream_timeout' : 'upstream_connection_failed');
    }
    let data;
    try { data = JSON.parse(raw); } catch { data = {}; }
    if (!upstream.ok) throw upstreamError(upstream.status, data);
    return data;
  }

  async function check() {
    const data = await request('/models', { method: 'GET' }, 15_000);
    if (!Array.isArray(data.data)) throw new HttpError(502, 'AI 服务已响应，但 /models 返回格式无法识别。');
    return { status: 'reachable', message: `API 地址和密钥连接正常；实际生成仍取决于 ${config.model} 的权限与额度。` };
  }

  return {
    publicConfig,
    save,
    request,
    check,
    get configured() { return Boolean(config.apiKey); },
    get model() { return config.model; },
    get apiKind() { return ['api.moonshot.cn', 'api.moonshot.ai'].includes(new URL(config.baseUrl).hostname) ? 'kimi' : 'responses'; },
  };
}
