/* 片场 Studio — AI requests are proxied through the local Node service. */
const STORAGE_KEY = 'pianchang-studio-prototype-v1';
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const nowLabel = () => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

const sampleData = {
  projects: [
    { id:'p1', title:'雾中来信', type:'短篇剧集', stage:'分镜制作', progress:64, updated:'昨天 18:42', episodes:3, currentEpisode:1, description:'一个总在雨天收到陌生来信的女孩，发现寄信人竟是十年后的自己。', archived:false, cover:'cover-one', tags:['悬疑','都市','3 集'], created:'2026-09-24' },
    { id:'p2', title:'山海拾遗', type:'奇幻长篇', stage:'剧本打磨', progress:38, updated:'9 月 25 日', episodes:12, currentEpisode:1, description:'年轻的山海志修补师踏上旅程，寻找逐渐消失的古老传说。', archived:false, cover:'cover-two', tags:['奇幻','冒险','12 集'], created:'2026-09-20' },
    { id:'p3', title:'最后一班地铁', type:'短篇剧集', stage:'画风设计', progress:22, updated:'9 月 22 日', episodes:2, currentEpisode:1, description:'午夜末班车上，几个陌生人各自错过了人生中最重要的一站。', archived:false, cover:'cover-three', tags:['都市','温情','2 集'], created:'2026-09-18' },
  ],
  assets: [
    { id:'a1', name:'沈知遥', subtitle:'主角 · 24 岁 · 雨夜邮局的值班员', type:'character', look:'character-a', project:'雾中来信', status:'已完成', icon:'人物' },
    { id:'a2', name:'顾临川', subtitle:'关键人物 · 来信的另一端', type:'character', look:'character-b', project:'雾中来信', status:'已完成', icon:'人物' },
    { id:'a3', name:'山海志修补师', subtitle:'主角 · 背负着修复古卷的使命', type:'character', look:'character-a', project:'山海拾遗', status:'待完善', icon:'人物' },
    { id:'a4', name:'旧邮局', subtitle:'内景 · 木质柜台与泛黄信件', type:'scene', look:'scene-a', project:'雾中来信', status:'已完成', icon:'场景' },
    { id:'a5', name:'雨夜末班站', subtitle:'外景 · 终点前的安静站台', type:'scene', look:'scene-b', project:'最后一班地铁', status:'已完成', icon:'场景' },
    { id:'a6', name:'未寄出的信', subtitle:'道具 · 蓝灰色信封，边角微湿', type:'prop', look:'prop-a', project:'雾中来信', status:'已完成', icon:'道具' },
    { id:'a7', name:'旧式车票', subtitle:'道具 · 纸质车票，印着模糊日期', type:'prop', look:'prop-b', project:'最后一班地铁', status:'待完善', icon:'道具' },
  ],
  tasks: [
    { id:'t1', title:'雾中来信 · EP 01 镜头配图', kind:'image', project:'雾中来信', status:'running', progress:72, detail:'镜头 05 / 07 · 风格：朦胧雨夜', time:'约 2 分钟前', sample:true },
    { id:'t2', title:'山海拾遗 · 角色三视图', kind:'image', project:'山海拾遗', status:'queued', progress:0, detail:'等待前序任务完成', time:'约 8 分钟前', sample:true },
    { id:'t3', title:'雾中来信 · EP 01 视频草稿', kind:'video', project:'雾中来信', status:'running', progress:41, detail:'镜头 03 / 06 · 参考分镜已关联', time:'约 12 分钟前', sample:true },
    { id:'t4', title:'最后一班地铁 · 故事梗概', kind:'script', project:'最后一班地铁', status:'done', progress:100, detail:'短篇剧本已整理完成', time:'昨天 20:16', sample:true },
    { id:'t5', title:'雾中来信 · EP 01 主分镜', kind:'storyboard', project:'雾中来信', status:'done', progress:100, detail:'6 个镜头 · 已同步到画布', time:'昨天 18:38', sample:true },
  ],
  works: [
    { id:'w1', title:'雨停之前', category:'短片剧集', creator:'木格', likes:128, colors:['#9c8c70','#4c655a','#273c38'], badge:'影像诗' },
    { id:'w2', title:'山海 · 玄鸟', category:'动画短片', creator:'鹿鸣工作室', likes:92, colors:['#6d9c92','#4d5678','#342b49'], badge:'东方幻想' },
    { id:'w3', title:'无声的证词', category:'仿真人', creator:'许南枝', likes:216, colors:['#8b6655','#4b4841','#242e31'], badge:'悬疑短片' },
    { id:'w4', title:'月下剑书', category:'3D', creator:'纸上游园', likes:184, colors:['#a78660','#596d69','#293742'], badge:'奇幻' },
    { id:'w5', title:'长街第七盏灯', category:'短片剧集', creator:'阿绵', likes:76, colors:['#c69f70','#695542','#303b39'], badge:'城市故事' },
    { id:'w6', title:'纸鹤飞过旧城', category:'动画短片', creator:'南风有信', likes:143, colors:['#d4a792','#857b8e','#4b5254'], badge:'动画' },
    { id:'w7', title:'云中客栈', category:'经典衍生', creator:'云起时', likes:301, colors:['#9da878','#646d50','#38483f'], badge:'山海奇谈' },
    { id:'w8', title:'冬至来信', category:'仿真人', creator:'方格电影', likes:58, colors:['#75889a','#576b78','#2c3942'], badge:'家庭' },
  ],
  nodes: [
    { id:'n1', kind:'script', label:'故事原点', title:'雨天来信', text:'每到下雨天，邮局就会收到一封没有寄件人信息的信。', area:'script' },
    { id:'n2', kind:'asset', label:'角色资产', title:'沈知遥 · 主角', text:'克制、敏锐，习惯把没说出口的话写下来。', area:'asset' },
    { id:'n3', kind:'story', label:'分镜片段', title:'EP 01 · 雨夜相遇', text:'镜头从窗外雨滴推入，落在未拆封的蓝灰色信封上。', area:'story' },
    { id:'n4', kind:'video', label:'视频草稿', title:'镜头氛围测试', text:'朦胧、克制的电影感；冷色雨夜与暖色室内形成反差。', area:'video' },
  ],
  liked: [],
  mode:'idea',
  activeProject:'p1',
  preferences:{ density:'comfortable', motion:'standard' },
  storyboardPreset:'visual',
  userCreated:0,
  customWorks:0,
};

function readState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored) return structuredClone(sampleData);
    return { ...structuredClone(sampleData), ...stored,
      projects: Array.isArray(stored.projects) ? stored.projects : structuredClone(sampleData.projects),
      assets: Array.isArray(stored.assets) ? stored.assets : structuredClone(sampleData.assets),
      tasks: (Array.isArray(stored.tasks) ? stored.tasks : structuredClone(sampleData.tasks)).map(task=>
        ['image','shot-image','assets','episode','story','storyboard'].includes(task.request?.kind) && ['running','queued'].includes(task.status)
          ? {...task,status:'failed',progress:0,detail:'页面已重新载入，生成结果未确认。请检查服务商记录后重试。'} : task),
      nodes: Array.isArray(stored.nodes) ? stored.nodes : structuredClone(sampleData.nodes),
      liked: Array.isArray(stored.liked) ? stored.liked : [],
    };
  } catch { return structuredClone(sampleData); }
}
let state = readState();
let activeView = 'home';
let activeProjectFilter = 'all';
let activeAssetFilter = 'all';
let activeTaskFilter = 'all';
let activeShowFilter = '全部';
let activeEpisode = 1;
let activeModalAction = null;
let activeDrawerAction = null;
let sortByName = false;
let zoom = 100;
let modalReturnFocus = null;
let aiHealth = { configured:false, checked:false, testMode:false, video:{available:false} };
const pollingVideoIds = new Set();
let imageAssetDraft = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; } }
function projectById(id) { return state.projects.find((p) => p.id === id); }
function projectName(name) { return escapeHTML(name || '未命名项目'); }

function showToast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'warning' ? 'warning' : ''}`;
  el.innerHTML = `${icon(type === 'warning' ? 'help' : 'check')}<span>${escapeHTML(message)}</span>`;
  $('#toastRegion').append(el);
  setTimeout(() => el.remove(), 3300);
}

async function apiRequest(path, payload) {
  if (location.protocol === 'file:') {
    throw new Error('请先启动本机服务，再通过 http://127.0.0.1:4317 打开片场。');
  }
  let response;
  try {
    response = await fetch(path, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'content-type':'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error('无法连接片场本机服务，请重启服务后重试。');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `本机服务返回 HTTP ${response.status}`);
    error.code = result.code;
    throw error;
  }
  return result;
}

async function refreshAiHealth() {
  const title = $('#aiStatusTitle');
  const description = $('#aiStatusDescription');
  if (location.protocol === 'file:') {
    title.textContent = 'AI 服务未启动';
    description.textContent = '运行本机服务后即可连接';
    return;
  }
  try {
    aiHealth = { ...(await apiRequest('/api/health')), checked:true };
    title.textContent = aiHealth.testMode ? 'AI 接入测试模式' : aiHealth.configured ? '文本 AI 已配置' : '等待配置文本 AI';
    description.textContent = aiHealth.testMode
      ? '测试响应，不会调用真实模型'
      : aiHealth.configured
        ? `文本 ${aiHealth.textModel} · ${aiHealth.video?.label || '视频待配置'}`
        : '点击“AI 服务设置”添加 API 地址和密钥';
  } catch {
    aiHealth = { configured:false, checked:true };
    title.textContent = 'AI 服务未启动';
    description.textContent = '运行本机服务后即可连接';
  }
  if ($('#textModelPicker')) $('#textModelPicker').textContent = aiHealth.textModel || '待配置';
  if ($('#videoModelPicker')) $('#videoModelPicker').textContent = aiHealth.video?.label || '待配置';
  renderVideoAvailability();
}

function renderVideoAvailability() {
  const button = $('[data-action="queue-video"]');
  if (!button) return;
  button.disabled = !currentShots().length;
  button.textContent = aiHealth.video?.available ? `生成 5 秒概念预览` : '设置视频服务';
  const message = aiHealth.video?.reason || '请设置即梦 Seedance 2.5 或仙宫云 ComfyUI。';
  button.title = message;
  $('#videoAvailability').textContent = message;
}

async function checkAiConnection(button) {
  if (button) button.disabled = true;
  try {
    await refreshAiHealth();
    const [result,images] = await Promise.all([apiRequest('/api/check',{}),apiRequest('/api/image-settings')]);
    const [imageResult,videoResult]=await Promise.all([
      images.configured ? apiRequest('/api/image-check',{}).catch(error=>({status:'failed',message:error.message})) : {status:'missing',message:'请在 AI 服务设置中添加图片服务。'},
      result.video.available ? apiRequest('/api/video-check',{provider:result.video.provider}).catch(error=>({status:'failed',message:error.message})) : {status:'missing',message:result.video.reason},
    ]);
    openModal({
      title:'AI 连接检查',
      subtitle:'检查密钥和模型访问权限，不提交生成任务。',
      body:`<div class="notification-item"><b>故事与分镜：${result.text.status === 'reachable' ? '连接正常' : result.text.status === 'test' ? '模拟测试' : '连接失败'}</b><p>${escapeHTML(result.text.message)}</p></div><div class="notification-item"><b>图片生成：${imageResult.status==='reachable'?'连接正常':imageResult.status==='test'?'模拟测试':imageResult.status==='missing'?'待配置':'连接失败'}</b><p>${escapeHTML(imageResult.message)}</p></div><div class="notification-item"><b>视频生成：${videoResult.status==='reachable'?'连接正常':videoResult.status==='test'?'模拟测试':videoResult.status==='missing'?'待配置':'连接失败'}</b><p>${escapeHTML(videoResult.message)}</p></div>`,
      footer:'<button class="outline-button" data-action="close-modal">关闭</button>',
    });
  } catch (error) {
    openModal({title:'AI 连接检查未通过',body:`<p>${escapeHTML(error.message)}</p>`,footer:'<button class="outline-button" data-action="close-modal">关闭</button>'});
  } finally {
    if (button) button.disabled = false;
  }
}

function serviceSettingsBody(ai, settings, images) {
  const provider = settings.provider || 'seedance';
  const promptHints = (settings.promptFields || []).slice(0,12).map((field)=>`<option value="${escapeHTML(`${field.node}|||${field.input}`)}">${escapeHTML(field.label)}</option>`).join('');
  return `<form id="serviceSettingsForm" class="video-settings-form">
    <section class="settings-section"><div class="settings-section-head"><div><span class="settings-icon">Key</span><div><h3>文本 AI</h3><p>故事、剧本整理与分镜智能体</p></div></div><span class="settings-status ${ai.apiKeyConfigured?'ready':''}">${ai.apiKeyConfigured?'已保存':'待添加'}</span></div>
      ${ai.apiKeyConfigured?'':'<div class="settings-alert">请添加这个 API 地址对应的密钥；不会自动把其他平台的密钥发送到这里。</div>'}
      <div class="form-field"><label for="aiBaseUrl">API 地址</label><input id="aiBaseUrl" name="aiBaseUrl" type="url" value="${escapeHTML(ai.baseUrl || 'https://gpt.gptzzz.xyz/v1')}" placeholder="https://gpt.gptzzz.xyz/v1" required /></div>
      <div class="form-field"><label for="aiApiKey">API Key</label><input id="aiApiKey" name="aiApiKey" type="password" autocomplete="new-password" placeholder="${ai.apiKeyConfigured?'已保存；留空保持不变':'粘贴这个地址对应的 API Key'}" /></div>
      <div class="form-field"><label for="aiModel">文本模型 ID</label><input id="aiModel" name="aiModel" value="${escapeHTML(ai.model || 'gpt-5-mini')}" placeholder="gpt-5-mini" required /></div>
    </section>
    <section class="settings-section" id="imageServiceSection"><div class="settings-section-head"><div><span class="settings-icon">${icon('gallery')}</span><div><h3>图片生成服务</h3><p>角色、场景与道具素材图</p></div></div><span class="settings-status ${images.configured?'ready':''}">${images.configured?'已配置':'待添加'}</span></div>
      <p class="settings-note">填写支持图片生成的服务信息。文本 AI 与图片服务可以使用不同平台。</p>
      <div class="form-field"><label for="imageBaseUrl">图片 API 地址</label><input id="imageBaseUrl" name="imageBaseUrl" type="url" value="${escapeHTML(images.baseUrl || 'https://api.openai.com/v1')}" required /></div>
      <div class="form-field"><label for="imageApiKey">图片 API Key</label><input id="imageApiKey" name="imageApiKey" type="password" autocomplete="new-password" placeholder="${images.apiKeyConfigured?'已保存；留空保持不变':'粘贴图片服务的 API Key'}" /></div>
      <div class="form-field"><label for="imageModel">图片模型 ID</label><input id="imageModel" name="imageModel" value="${escapeHTML(images.model || 'gpt-image-1.5')}" required /></div>
      <button type="button" class="danger-button" data-action="clear-image-api-key">清除图片 Key</button>
    </section>
    <section class="settings-section"><div class="settings-section-head"><div><span class="settings-icon">🎬</span><div><h3>视频模型授权</h3><p>分别保存即梦或仙宫云所需信息</p></div></div><span class="settings-status ${settings.video?.available?'ready':''}">${settings.video?.available?'已配置':'待配置'}</span></div>
    <div class="form-field"><label for="videoProvider">当前视频服务</label><select id="videoProvider" name="provider"><option value="seedance" ${provider==='seedance'?'selected':''}>即梦 Seedance 2.5 · 火山方舟</option><option value="xiangong" ${provider==='xiangong'?'selected':''}>仙宫云 · ComfyUI 实例</option></select></div>
    <section class="provider-panel" data-provider-panel="seedance" ${provider==='seedance'?'':'hidden'}><h3>即梦 Seedance 2.5</h3><p>填写火山方舟 API Key。密钥只保存在本机服务的私有配置中。</p><div class="form-field"><label for="arkApiKey">火山方舟 API Key</label><input id="arkApiKey" name="arkApiKey" type="password" autocomplete="new-password" placeholder="${settings.arkConfigured?'已保存；留空保持不变':'粘贴 API Key'}" /></div><div class="form-field"><label for="arkModel">模型或推理接入点 ID</label><input id="arkModel" name="arkModel" value="${escapeHTML(settings.arkModel || 'doubao-seedance-2-5-260628')}" required /></div></section>
    <section class="provider-panel" data-provider-panel="xiangong" ${provider==='xiangong'?'':'hidden'}><h3>仙宫云 ComfyUI</h3><p>先在仙宫云启动实例，再从 ComfyUI 开启开发者模式并导出 API 格式工作流。</p><div class="form-field"><label for="comfyUrl">ComfyUI 实例地址</label><input id="comfyUrl" name="comfyUrl" type="url" value="${escapeHTML(settings.comfyUrl || '')}" placeholder="https://实例地址" /></div><div class="form-field"><label for="comfyToken">实例访问令牌（没有可留空）</label><input id="comfyToken" name="comfyToken" type="password" autocomplete="new-password" placeholder="${settings.comfyTokenConfigured?'已保存；留空保持不变':'可选'}" /></div><div class="form-field"><label for="comfyWorkflow">API 格式工作流 JSON</label><textarea id="comfyWorkflow" name="workflow" rows="6" placeholder="粘贴工作流，或点击下方导入 JSON"></textarea><label class="upload-button provider-upload" for="comfyWorkflowFile">${icon('upload')} 导入工作流 JSON</label><input id="comfyWorkflowFile" type="file" accept="application/json,.json" hidden /></div><div class="form-field"><label for="promptFieldHint">检测到的文本输入</label><select id="promptFieldHint"><option value="">手动填写节点和字段</option>${promptHints}</select></div><div class="provider-field-grid"><div class="form-field"><label for="promptNode">提示词节点 ID</label><input id="promptNode" name="promptNode" value="${escapeHTML(settings.promptNode || '')}" placeholder="例如 6" /></div><div class="form-field"><label for="promptInput">提示词字段名</label><input id="promptInput" name="promptInput" value="${escapeHTML(settings.promptInput || 'text')}" placeholder="text" /></div></div></section>
    </section><p class="settings-note">所有密钥和工作流只保存在这台电脑。连接检查不会生成内容或视频。</p>
  </form>`;
}

async function openServiceSettings(section = '') {
  try {
    const [ai, settings, images] = await Promise.all([apiRequest('/api/ai-settings'),apiRequest('/api/video-settings'),apiRequest('/api/image-settings')]);
    openModal({ title:'AI 服务设置', subtitle:'密钥与模型授权 · 保存在本机', body:serviceSettingsBody(ai,settings,images), footer:'<button class="danger-button settings-clear" data-action="clear-text-api-key">清除文本 Key</button><button class="outline-button" data-action="close-modal">取消</button><button class="outline-button" data-action="save-check-service-settings">保存并检查</button><button class="primary-button" data-action="save-service-settings">保存设置</button>', wide:true });
    if(section==='image')setTimeout(()=>{if($('#imageServiceSection')){$('#imageServiceSection').scrollIntoView({block:'start'});$('#imageApiKey').focus({preventScroll:true});}},60);
  } catch (error) { showToast(error.message,'warning'); }
}

function collectServiceSettings() {
  const form = $('#serviceSettingsForm');
  if (!form?.reportValidity()) return null;
  const data = new FormData(form);
  const workflow = String(data.get('workflow') || '').trim();
  return { ai:{ baseUrl:data.get('aiBaseUrl'), apiKey:data.get('aiApiKey'), model:data.get('aiModel') }, images:{ baseUrl:data.get('imageBaseUrl'), apiKey:data.get('imageApiKey'), model:data.get('imageModel') }, video:{
      provider:data.get('provider'), arkApiKey:data.get('arkApiKey'), arkModel:data.get('arkModel'),
      comfyUrl:data.get('comfyUrl'), comfyToken:data.get('comfyToken'),
      promptNode:data.get('promptNode'), promptInput:data.get('promptInput'),
      ...(workflow ? { workflow } : {}),
    },
  };
}

async function saveServiceSettings(button, check = false) {
  const payload = collectServiceSettings();
  if (!payload) return;
  if (button) button.disabled = true;
  try {
    await apiRequest('/api/ai-settings',payload.ai);
    const images = await apiRequest('/api/image-settings',payload.images);
    const settings = await apiRequest('/api/video-settings',payload.video);
    await refreshAiHealth();
    aiHealth.video = settings.video;
    renderVideoAvailability();
    if (check) {
      const textResult = await apiRequest('/api/check',{});
      const checked = await Promise.all([
        images.configured ? apiRequest('/api/image-check',{}).catch(error=>({ status:'failed', message:error.message })) : { status:'missing', message:'尚未添加图片 API Key。' },
        settings.video.available ? apiRequest('/api/video-check',{provider:settings.provider}).catch(error=>({ status:'failed', message:error.message })) : { status:'missing', message:settings.video.reason },
      ]);
      const statusLabel = result => ['reachable','test'].includes(result.status) ? '连接正常' : result.status==='missing' ? '待配置' : '连接失败';
      openModal({title:'AI 服务连接检查',body:`<div class="notification-item"><b>文本 AI：${statusLabel(textResult.text)}</b><p>${escapeHTML(textResult.text.message)}</p></div><div class="notification-item"><b>图片生成：${statusLabel(checked[0])}</b><p>${escapeHTML(checked[0].message)}</p></div><div class="notification-item"><b>${escapeHTML(settings.video.label)}：${statusLabel(checked[1])}</b><p>${escapeHTML(checked[1].message)}</p></div>`,footer:'<button class="primary-button" data-action="close-modal">完成</button>'});
    } else {
      closeModal();showToast('AI 服务设置已保存。');
    }
  } catch (error) { showToast(error.message,'warning'); }
  finally { if (button?.isConnected) button.disabled = false; }
}

async function clearTextApiKey(button) {
  if (button) button.disabled = true;
  try { await apiRequest('/api/ai-settings',{ clearApiKey:true });closeModal();await refreshAiHealth();showToast('文本 AI Key 已清除。'); }
  catch (error) { showToast(error.message,'warning'); }
  finally { if (button?.isConnected) button.disabled = false; }
}

function openModal({ title, subtitle = '', body = '', footer = '', wide = false, onSubmit = null }) {
  if ($('#modalBackdrop').hidden) modalReturnFocus = document.activeElement;
  activeModalAction = onSubmit;
  $('#modal').className = `modal${wide ? ' wide' : ''}`;
  $('#modal').tabIndex = -1;
  $('#modal').innerHTML = `<div class="modal-head"><div><h2 id="modalTitle">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
  $('#modalBackdrop').hidden = false;
  $('.app-shell').inert = true;
  const first = $('input,textarea,select,button:not([data-action="close-modal"])', $('#modal'));
  setTimeout(() => (first || $('#modal')).focus(), 30);
}
function closeModal() {
  $('#modalBackdrop').hidden = true;
  $('.app-shell').inert = false;
  $('#modal').innerHTML = '';
  activeModalAction = null;
  const returnFocus = modalReturnFocus;
  modalReturnFocus = null;
  requestAnimationFrame(() => {
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus();
    else $(`.nav-item[data-view="${activeView}"]`)?.focus();
  });
}
function closeDrawer() { $('#drawerBackdrop').hidden = true; $('#sideDrawer').innerHTML = ''; activeDrawerAction = null; }

const modes = {
  script: { title:'导入或粘贴你的剧本', subtitle:'整理现有剧本，继续完成视觉开发与视频制作。', placeholder:'在这里粘贴剧本正文，也可以先导入纯文本文件…', file:'选择剧本文件', help:'支持读取 TXT、MD、Markdown、Fountain 与 HTML 文本。', button:'保留原剧本并创建项目' },
  idea: { title:'把灵感写在这里', subtitle:'写下一句话，先让故事有个起点。', placeholder:'例如：一个总在雨天收到陌生来信的女孩，发现寄信人竟是十年后的自己……', file:'导入文本', help:'适合 1–5 集短篇创作，故事长度可在下方调整。', button:'AI 开始创作' },
  series: { title:'搭建你的长篇故事', subtitle:'从世界观与人物关系出发，逐步规划每个阶段。', placeholder:'描述故事背景、人物关系、主线冲突与大致走向…', file:'导入设定', help:'长篇可规划 30–100 集，在工作室逐集生成正文并校对。', button:'AI 规划长篇' },
  novel: { title:'导入小说原著', subtitle:'粘贴正文或导入文本，开始规划分集改编。', placeholder:'第一行可以写书名或章节标题，然后粘贴小说正文…', file:'导入小说文本', help:'支持读取 TXT、MD、Markdown、Fountain 与 HTML 文本；可分批导入。', button:'AI 创建改编项目' },
};

function setMode(mode) {
  if (!modes[mode]) return;
  state.mode = mode;
  $$('.creation-card').forEach((card) => card.classList.toggle('selected', card.dataset.mode === mode));
  $('#starterTitle').textContent = modes[mode].title;
  $('#starterSubtitle').textContent = modes[mode].subtitle;
  $('#starterInput').placeholder = modes[mode].placeholder;
  $('#startCreation').innerHTML = `${modes[mode].button} ${icon('arrow')}`;
  $('#fileInput').setAttribute('aria-label', modes[mode].file);
  $('.upload-button span').textContent = modes[mode].file;
  $('.starter-footnote').lastChild.textContent = ` ${modes[mode].help} ${mode==='script'?'原剧本直接保存在本地，不会自动改写。':'提交后内容会发送给已配置的文本 AI 服务，并按服务商规则计费。'}`;
  $('#episodeCount').innerHTML = (mode==='series'?[30,50,100]:mode==='novel'?[4,10,27,50,100,200]:[2,3,5]).map(n=>`<option value="${n}">${n} 集</option>`).join('');
  const options = $('#starterOptions');
  options.style.opacity = '1';
  persist();
}

function switchView(view) {
  const names = { home:'创作首页', projects:'我的项目', assets:'素材资产', storyboard:'分镜工作室', canvas:'创意画布', tasks:'生成任务', showcase:'作品观赏' };
  if (!names[view]) return;
  activeView = view;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
  $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  $('#breadcrumbTitle').textContent = names[view];
  $('#sidebar').classList.remove('open');
  if (view === 'projects') renderProjects();
  if (view === 'assets') renderAssets();
  if (view === 'storyboard') renderStoryboard();
  if (view === 'canvas') renderCanvas();
  if (view === 'tasks') renderTasks();
  if (view === 'showcase') renderShowcase();
  window.scrollTo({ top:0, behavior:'smooth' });
}

function projectCover(project, large = false) {
  const title = project.coverTitle || project.title;
  return `<div class="project-cover ${escapeHTML(project.cover || 'cover-four')}"><span class="project-cover-label">${escapeHTML(project.type || '创作项目')}</span><span class="project-cover-title">${projectName(title)}</span><span class="project-cover-meta">${String(project.episodes || 1).padStart(2,'0')} EP</span></div>`;
}

function renderRecent() {
  const projects = [...state.projects].filter((p) => !p.archived).sort((a,b) => (b.updatedAt || b.created || '').localeCompare(a.updatedAt || a.created || '')).slice(0,3);
  $('#recentCount').textContent = String(state.projects.filter((p) => !p.archived).length).padStart(2,'0');
  $('#recentProjects').innerHTML = projects.length ? projects.map((p) => `<button class="recent-card" data-action="open-project" data-id="${p.id}"><span class="recent-cover ${escapeHTML(p.cover || 'cover-four')}"><span>${escapeHTML(p.type || '新项目')}</span></span><span class="recent-info"><b>${projectName(p.title)}</b><small>${escapeHTML(p.stage || '故事构思')} · ${escapeHTML(p.updated || '刚刚更新')}</small><span class="tiny-progress"><i style="width:${Number(p.progress)||0}%"></i></span></span>${icon('arrow')}</button>`).join('') : '<div class="empty-state">还没有项目</div>';
}

function renderProjects() {
  const query = ($('#projectSearch')?.value || '').trim().toLowerCase();
  let list = state.projects.filter((p) => activeProjectFilter === 'archived' ? p.archived : activeProjectFilter === 'all' ? !p.archived : !p.archived);
  if (query) list = list.filter((p) => `${p.title} ${p.type} ${p.stage}`.toLowerCase().includes(query));
  list.sort((a,b) => sortByName ? a.title.localeCompare(b.title,'zh') : (b.updatedAt || b.created || '').localeCompare(a.updatedAt || a.created || ''));
  $('#projectCount').textContent = state.projects.filter((p) => !p.archived).length;
  $('#allProjectCount').textContent = String(list.length).padStart(2,'0');
  $('#projectGrid').innerHTML = list.length ? list.map((p) => `<article class="project-card">${projectCover(p)}<div class="project-card-body"><div class="project-card-heading"><div><h3>${projectName(p.title)}</h3><p>${escapeHTML(p.stage || '故事构思')} · ${escapeHTML(p.updated || '刚刚更新')}</p></div><div class="project-card-actions"><button title="继续创作" data-action="open-project" data-id="${p.id}">${icon('arrow')}</button><button title="项目操作" data-action="project-menu" data-id="${p.id}">${icon('more')}</button></div></div><div class="project-tag-row">${(p.tags || [p.type || '创作项目']).slice(0,3).map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join('')}</div><div class="project-card-footer"><span>${icon('film')} ${p.episodes || 1} 集</span><span>${icon('clock')} ${p.progress || 0}% 完成</span></div></div></article>`).join('') : `<div class="empty-state">${icon('folder')}<div><b>${query ? '没有找到匹配项目' : '这个列表暂时是空的'}</b><span>${query ? '换个关键词试试看。' : '创建一个新项目，开启你的故事。'}</span></div></div>`;
}

function renderAssets() {
  const query = ($('#assetSearch')?.value || '').trim().toLowerCase();
  const types = { character:'角色', scene:'场景', prop:'道具' };
  renderAssetProjectFilter();
  const scoped = assetScope();
  const filtered = scoped.filter((a) => (activeAssetFilter === 'all' || a.type === activeAssetFilter) && (!query || `${a.name} ${a.subtitle} ${a.project}`.toLowerCase().includes(query)));
  $('#characterTotal').textContent = scoped.filter((a) => a.type === 'character').length;
  $('#sceneTotal').textContent = scoped.filter((a) => a.type === 'scene').length;
  $('#propTotal').textContent = scoped.filter((a) => a.type === 'prop').length;
  $('#assetGrid').innerHTML = filtered.length ? filtered.map((a) => {
    const image = a.previewData ? `<img class="asset-preview" src="${escapeHTML(a.previewData)}" alt="${projectName(a.name)}参考图" /><button class="asset-image-open" data-action="view-asset-image" data-id="${escapeHTML(a.id)}" aria-label="查看${projectName(a.name)}图片"></button>` : '';
    const placeholder = a.type === 'character' ? '<span class="asset-figure"></span><span class="visual-orb"></span><span class="visual-horizon"></span>' : a.type === 'scene' ? '<span class="visual-orb"></span><span class="asset-landscape"></span>' : '<span class="asset-prop-illustration">✉</span><span class="visual-horizon"></span>';
    return `<article class="asset-card"><div class="asset-visual ${escapeHTML(a.look || 'character-a')}">${image}<span class="asset-type-pill">${types[a.type] || '素材'}</span><div class="asset-visual-actions"><button title="AI 生成图片" aria-label="AI 生成图片" data-action="generate-asset-image" data-id="${escapeHTML(a.id)}">${icon('spark')}</button><button title="编辑" aria-label="编辑素材" data-action="edit-asset" data-id="${escapeHTML(a.id)}">${icon('edit')}</button><button title="删除" aria-label="删除素材" data-action="delete-asset" data-id="${escapeHTML(a.id)}">${icon('trash')}</button><button title="加入画布" aria-label="加入画布" data-action="asset-to-canvas" data-id="${escapeHTML(a.id)}">${icon('layout')}</button></div>${placeholder}${a.previewData?'':'<span class="asset-placeholder-label">示意图 · 尚未配图</span>'}</div><div class="asset-card-body"><h3>${projectName(a.name)}</h3><p>${escapeHTML(a.subtitle || '')}</p><div class="asset-card-meta"><span>${escapeHTML(a.project || '未关联项目')}</span><span><i></i>${escapeHTML(a.status || '已完成')}</span></div></div></article>`;
  }).join('') : `<div class="empty-state">${icon('box')}<div><b>没有找到素材</b><span>可以更改筛选条件，或添加一项新的素材。</span></div></div>`;
}

const shotData = [
  { id:'shot-01', no:'01', title:'雨落在旧邮局的窗台', desc:'窗外雨声渐密，镜头由模糊的雨痕缓慢推近柜台上一封没有署名的信。', voice:'环境声 · 雨声', lens:'中近景', move:'缓慢推镜', duration:'8 秒', look:'shot-one' },
  { id:'shot-02', no:'02', title:'知遥停下手里的动作', desc:'她听见门口的风铃轻响，抬眼望向被雨水映亮的玻璃门。', voice:'对白 · 知遥：有人吗？', lens:'近景', move:'轻微摇镜', duration:'6 秒', look:'shot-two' },
  { id:'shot-03', no:'03', title:'门外只有一把旧伞', desc:'雨雾里，伞柄上系着和信封相同颜色的细线。画面停留片刻。', voice:'环境声 · 风铃余音', lens:'特写', move:'静止', duration:'5 秒', look:'shot-three' },
];
state.storyboards ||= { 'p1:1':structuredClone(shotData) };
state.preferences ||= { density:'comfortable', motion:'standard' };
state.storyboardPreset ||= 'visual';
function storyboardKey(projectId = state.activeProject, episode = activeEpisode) { return `${projectId}:${episode}`; }
function currentShots(projectId = state.activeProject, episode = activeEpisode) { return state.storyboards[storyboardKey(projectId, episode)] || []; }
function renderStoryboard() {
  const select = $('#storyProjectSelect');
  if (select) {
    const previous = select.value || state.activeProject;
    select.innerHTML = state.projects.filter((p) => !p.archived).map((p) => `<option value="${p.id}">${projectName(p.title)}</option>`).join('');
    if (projectById(previous)) select.value = previous;
    else if (projectById(state.activeProject)) select.value = state.activeProject;
  }
  const p = projectById(select?.value) || state.projects[0];
  if (p) { state.activeProject = p.id; persist(); }
  const episodes = Math.max(1, Math.min(Number(p?.episodes) || 1, 200));
  if (activeEpisode > episodes) activeEpisode = 1;
  $('#episodeStrip').innerHTML = Array.from({ length:episodes }, (_,i) => `<button class="${activeEpisode === i+1 ? 'selected' : ''}" data-episode="${i+1}">EP ${String(i+1).padStart(2,'0')}</button>`).join('');
  const shots = currentShots(p?.id, activeEpisode);
  const totalSeconds = shots.reduce((sum, shot) => sum + (Number(String(shot.duration).match(/\d+/)?.[0]) || 0), 0);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0');
  $('#storyboardStatus').innerHTML = shots.length ? `<i></i> ${shots.length} 个镜头已完成` : '<i></i> 等待生成分镜';
  $('#storyboardEpisodeMeta').textContent = `EP ${String(activeEpisode).padStart(2,'0')} · 预计时长 ${String(totalMinutes).padStart(2,'0')}:${remainingSeconds}`;
  $('#storyboardPresetLabel').textContent = ({ visual:'电影感叙事', dialogue:'对白锁定', commercial:'剧情短剧' })[state.storyboardPreset] || '电影感叙事';
  $('#shotList').innerHTML = shots.length ? shots.map((shot) => `<article class="shot-card"><span class="shot-number">${escapeHTML(shot.no)}</span><div class="shot-thumb ${escapeHTML(shot.look || 'shot-one')}">${shot.imageUrl?`<img class="shot-image" src="${escapeHTML(shot.imageUrl)}" alt="镜头 ${escapeHTML(shot.no)} 配图" />`:''}<span>${escapeHTML(shot.lens || '中景')} · ${escapeHTML(shot.duration || '5 秒')}</span></div><div class="shot-copy"><h3>${escapeHTML(shot.title)}</h3><p>${escapeHTML(shot.desc)}</p><span class="shot-voice">${icon('sound')}${escapeHTML(shot.voice || '无对白')}</span></div><div class="shot-settings"><span>景别 <b>${escapeHTML(shot.lens || '中景')}</b></span><span>镜头 <b>${escapeHTML(shot.move || '静止')}</b></span><span>时长 <b>${escapeHTML(shot.duration || '5 秒')}</b></span></div><div class="shot-status"><span class="status-pill status-ready"><i></i> ${shot.imageUrl?'已配图':'待配图'}</span><button data-action="edit-shot" data-id="${shot.id}">编辑镜头 →</button><button data-action="shot-assets" data-id="${shot.id}">引用资产 ${(shot.assetIds||[]).length}</button><button data-action="shot-image" data-id="${shot.id}" ${shotImageBusy(p?.id,activeEpisode,shot.id)?'disabled':''}>${shotImageBusy(p?.id,activeEpisode,shot.id)?'配图生成中':shot.imageUrl?'查看 / 重绘':'生成配图'}</button>${shotVideoMarkup(p,shot)}</div></article>`).join('') : `<div class="empty-state">${icon('film')}<div><b>这个分集还没有分镜</b><span>调用 AI 根据故事内容生成镜头方案，然后继续编辑。</span><button class="outline-button compact" data-action="generate-storyboard">生成 AI 分镜</button></div></div>`;
  renderProductionWorkflow(p,shots);
  renderVideoAvailability();
}

function renderCanvas() {
  const areas = { script:'script-node', asset:'asset-node', story:'story-node', video:'video-node' };
  const kinds = { script:'book', asset:'user', story:'film', video:'play' };
  $('#canvasNodes').innerHTML = state.nodes.filter(node=>(node.projectId||'p1')===state.activeProject).map((node) => `<article class="canvas-node ${areas[node.area] || 'asset-node'}" data-action="select-node" data-id="${node.id}"><div class="node-head"><span class="node-icon">${icon(kinds[node.kind] || 'spark')}</span>${escapeHTML(node.label)}<button class="node-action" data-action="node-menu" data-id="${node.id}" title="节点操作">${icon('more')}</button></div><div class="node-body"><b>${escapeHTML(node.title)}</b><p>${escapeHTML(node.text)}</p>${node.kind === 'asset' || node.kind === 'video' ? '<span class="node-art-row"><i></i><i></i><i></i></span>' : ''}</div></article>`).join('');
  $('#zoomLabel').textContent = `${zoom}%`;
  $('#canvasScene').style.setProperty('--canvas-zoom', zoom / 100);
  $('#canvasProjectName').textContent = projectById(state.activeProject)?.title || '创意画布';
  enrichCanvas();
}

function taskStatusLabel(task) { return ({ running:'进行中', queued:'排队中', done:'已完成', failed:'需处理', cancelled:'已取消' })[task.status] || '待处理'; }
function renderTasks() {
  const query = ($('#taskSearch')?.value || '').trim().toLowerCase();
  const filtered = state.tasks.filter((task) => (activeTaskFilter === 'all' || (activeTaskFilter === 'running' ? ['running','queued'].includes(task.status) : activeTaskFilter === 'done' ? task.status === 'done' : ['failed','cancelled'].includes(task.status))) && (!query || `${task.title} ${task.project} ${task.detail}`.toLowerCase().includes(query)));
  const running = state.tasks.filter((t) => t.status === 'running').length;
  const queued = state.tasks.filter((t) => t.status === 'queued').length;
  const done = state.tasks.filter((t) => t.status === 'done').length;
  $('#runningTaskTotal').textContent = running;
  $('#queuedTaskTotal').textContent = queued;
  $('#doneTaskTotal').textContent = done;
  $('#taskCount').textContent = running + queued;
  $('#taskList').innerHTML = filtered.length ? filtered.map((task) => {
    const iconName=task.kind==='video'?'play':task.kind==='script'?'book':task.kind==='storyboard'?'film':'spark';
    const detail=task.sample?`示例数据 · ${task.detail}`:task.detail;
    let action='';
    if(task.kind==='video'&&task.videoId&&['queued','running'].includes(task.status)) action=`<button title="刷新视频状态" data-action="refresh-video" data-id="${task.id}">${icon('refresh')}</button>`;
    else if(task.status==='running'||task.status==='queued') action=task.request?`<button title="AI 正在处理" disabled>${icon('spark')}</button>`:`<button title="取消示例任务" data-action="cancel-task" data-id="${task.id}">${icon('close')}</button>`;
    else if(task.status==='failed'&&task.request&&task.kind!=='video') action=`<button title="重试 AI 任务" data-action="retry-task" data-id="${task.id}">${icon('refresh')}</button>`;
    else if(task.status==='failed'||task.status==='cancelled') action=`<button title="重新排队示例任务" data-action="retry-task" data-id="${task.id}">${icon('refresh')}</button>`;
    else action=`<button title="查看结果" data-action="view-task" data-id="${task.id}">${icon('arrow')}</button>`;
    return `<article class="task-item"><span class="task-type-icon ${task.kind==='video'?'video':task.kind==='script'?'script':''}">${icon(iconName)}</span><div class="task-item-main"><b>${escapeHTML(task.title)}</b><small>${escapeHTML(task.project)} · ${escapeHTML(detail)}</small></div><div class="task-progress-wrap"><span class="task-progress"><i style="width:${Number(task.progress)||0}%"></i></span><span>${Number(task.progress)||0}%</span></div><span class="task-item-status ${task.status==='done'?'done':task.status==='failed'?'failed':''}">${taskStatusLabel(task)}</span><span class="task-time">${escapeHTML(task.time || '刚刚')}</span><div class="task-actions">${action}</div></article>`;
  }).join('') : `<div class="empty-state">${icon('clock')}<div><b>没有符合条件的任务</b><span>新的 AI 生成任务会显示在这里。</span></div></div>`;
}

function renderShowcase() {
  const query = ($('#showcaseSearch')?.value || '').trim().toLowerCase();
  const all = state.works;
  const filtered = all.filter((w) => (activeShowFilter === '全部' || w.category === activeShowFilter) && (!query || `${w.title} ${w.creator} ${w.category} ${w.badge}`.toLowerCase().includes(query)));
  $('#showcaseGrid').innerHTML = filtered.length ? filtered.map((work) => `<article class="work-card"><button class="work-cover" data-action="view-work" data-id="${work.id}" style="--cover-a:${work.colors[0]};--cover-b:${work.colors[1]};--cover-c:${work.colors[2]}"><span class="work-category">${escapeHTML(work.category)}</span><span class="work-cover-art"></span><span class="work-play">${icon('play')}</span><span class="work-cover-title">${escapeHTML(work.title)}</span></button><div class="work-card-body"><h3>${escapeHTML(work.title)} <span class="tag">${escapeHTML(work.badge)}</span></h3><div class="work-card-meta"><span class="work-author"><span class="author-dot">${escapeHTML(work.creator.slice(0,1))}</span>${escapeHTML(work.creator)}</span><button class="like-button ${state.liked.includes(work.id)?'liked':''}" data-action="like-work" data-id="${work.id}">${icon('heart')} ${Number(work.likes)+(state.liked.includes(work.id)?1:0)}</button></div></div></article>`).join('') : `<div class="empty-state">${icon('gallery')}<div><b>暂时没有匹配的作品</b><span>换个分类或关键词试试。</span></div></div>`;
}

function createId(prefix) { return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`; }
function queueTask({ title, project, kind='video', detail='任务已进入队列', status='queued' }) {
  const task = { id:createId('t'), title, project, kind, status, progress:status==='running'?5:0, detail, time:'刚刚' };
  state.tasks.unshift(task);
  persist(); renderTasks(); renderDashboardCounts();
  return task;
}

function storyResultModal(project) {
  const story = project.generatedStory || '';
  openModal({
    title:`${projectName(project.title)} · AI 故事结构`,
    subtitle:'生成内容已保存到此浏览器的项目数据。',
    body:`<div class="generated-story">${escapeHTML(story).replace(/\n/g,'<br>')}</div>`,
    footer:`<button class="outline-button" data-action="close-modal">关闭</button><button class="primary-button" data-action="open-storyboard" data-id="${project.id}">继续制作分镜 ${icon('arrow')}</button>`,
    wide:true,
  });
}

async function ensureAiReady() {
  if (location.protocol === 'file:') throw new Error('请先运行本机服务，再通过 http://127.0.0.1:4317 打开片场。');
  aiHealth = await apiRequest('/api/health');
  if (!aiHealth.configured) throw new Error('文本 AI 尚未配置，请打开“AI 服务设置”填写 API 地址和密钥。');
}

async function runStoryGeneration(project, task, prompt, mode, episodeCount, episodeLength) {
  task.status='running';task.progress=5;task.detail='文本 AI 正在整理故事结构';
  task.projectId=project.id;
  task.request={kind:'story',text:prompt,mode,episodeCount,episodeLength};
  persist();renderTasks();renderDashboardCounts();
  try {
    const result=await apiRequest('/api/generate',{kind:'story',text:prompt,mode,episodes:episodeCount,minutes:episodeLength,title:project.title});
    project.generatedStory=result.text;
    project.sourceText=prompt;
    project.stage='故事规划';project.progress=Math.max(Number(project.progress)||0,28);project.updated='刚刚更新';project.updatedAt=new Date().toISOString();
    task.status='done';task.progress=100;task.detail='AI 故事结构已生成并保存';task.resultType='story';
    persist();renderEverything();
    storyResultModal(project);
    showToast('AI 故事结构生成完成。');
  } catch (error) {
    task.status='failed';task.progress=0;task.detail=error.message;
    persist();renderTasks();renderDashboardCounts();
    showToast(error.message,'warning');
  }
}

async function runStoryboardGeneration(project, task, episode, preset, presetNote) {
  const source=episodeText(project,episode)||project.title;
  const prompt=[
    `项目名称：${project.title}`,
    `故事设定：${source}`,
    `分集：第 ${episode} 集`,
    `单集目标时长：约 ${project.episodeLength||2} 分钟`,
    `镜头表达预设：${storyboardDirection(preset)}`,
    `风格补充：${project.visualStyle||''} ${presetNote||'无'}`,
    `可引用资产：${projectAssets(project).map(a=>`${a.name}：${a.subtitle}`).join('；')}`,
    '请输出 4 至 8 个连续镜头，时长与剧情节奏匹配。',
  ].join('\n');
  task.status='running';task.progress=5;task.detail='文本 AI 正在生成镜头方案';
  task.projectId=project.id;
  task.request={kind:'storyboard',projectId:project.id,episode,prompt,preset,presetNote};
  persist();renderTasks();renderDashboardCounts();
  try {
    const result=await apiRequest('/api/generate',{kind:'storyboard',text:prompt});
    const shots=result.shots.map((shot,index)=>({
      id:createId('s'),no:String(index+1).padStart(2,'0'),
      title:String(shot.title||`镜头 ${index+1}`).slice(0,100),desc:String(shot.desc||'').slice(0,1200),
      voice:String(shot.voice||'无对白').slice(0,300),lens:String(shot.lens||'中景').slice(0,40),
      move:String(shot.move||'静止').slice(0,60),duration:String(shot.duration||'5 秒').slice(0,30),
      look:shotData[index%shotData.length].look,
    }));
    state.storyboards[storyboardKey(project.id,episode)]=shots;
    project.stage='分镜制作';project.progress=Math.max(Number(project.progress)||0,44);project.updated='刚刚更新';project.updatedAt=new Date().toISOString();
    task.status='done';task.progress=100;task.detail=`已生成并保存 ${shots.length} 个 AI 镜头`;
    persist();renderStoryboard();renderTasks();renderProjects();renderRecent();
    showToast(`AI 已生成 ${shots.length} 个分镜。`);
  } catch (error) {
    task.status='failed';task.progress=0;task.detail=error.message;
    persist();renderTasks();renderDashboardCounts();
    showToast(error.message,'warning');
  }
}

async function runVideoGeneration(project, episode) {
  try { await refreshAiHealth(); } catch(error) { showToast(error.message,'warning');return; }
  if (!aiHealth.video?.available) { renderVideoAvailability();openServiceSettings();return; }
  const shots=currentShots(project.id,episode);
  if(!shots.length){showToast('先用 AI 为当前分集生成分镜。','warning');return;}
  const activeTask=state.tasks.find((task)=>task.kind==='video'&&task.request?.projectId===project.id&&task.request?.episode===episode&&['queued','running'].includes(task.status));
  if(activeTask){showToast('当前分集已有视频任务在处理中，请先查看任务列表。','warning');switchView('tasks');return;}
  const prompt=[
    `制作一段电影感短片，保持人物和场景连续。统一画风：${project.visualStyle||'自然电影光线'}`,
    `项目：${project.title}。故事：${project.generatedStory||project.sourceText||project.description||project.title}`,
    `第 ${episode} 集正文：${episodeText(project,episode)}`,
    `第 ${episode} 集镜头：`,
    ...shots.map((shot,index)=>`${index+1}. ${shot.title}：${shot.desc}；${shot.lens}，${shot.move}，${shot.duration}；声音：${shot.voice}`),
    '统一使用自然的电影光线、稳定的构图和真实运动；不要添加字幕、片头文字或水印。',
  ].join('\n').slice(0,19_000);
  const provider=aiHealth.video.provider;
  const label=aiHealth.video.label;
  const task=queueTask({title:`${project.title} · EP ${String(episode).padStart(2,'0')} AI 视频`,project:project.title,kind:'video',status:'running',detail:`正在提交给${label}`});
  task.request={kind:'video',projectId:project.id,episode,prompt,seconds:'5',provider};
  persist();renderTasks();
  switchView('tasks');
  try {
    await submitVideoTask(task);
    if(task.status==='failed')showToast(task.detail,'warning');
    else showToast(`${label}视频任务已提交。`);
  } catch (error) {
    task.status='failed';task.progress=0;task.detail=error.message;
    persist();renderTasks();renderDashboardCounts();showToast(error.message,'warning');
  }
}

async function refreshVideoTask(task) {
  if(!task.videoId||pollingVideoIds.has(task.videoId))return;
  pollingVideoIds.add(task.videoId);
  try {
    const result=await apiRequest(`/api/videos/${encodeURIComponent(task.videoId)}`);
    task.provider=result.provider||task.provider;
    task.providerLabel=result.label||task.providerLabel;
    task.progress=Number(result.progress)||0;
    task.status=result.status==='completed'?'done':result.status==='failed'?'failed':result.status==='in_progress'?'running':'queued';
    const label=task.providerLabel||'视频服务';
    task.detail=task.status==='done'?`${label}已完成，可打开预览`:task.status==='failed'?(result.error||'视频生成失败'):`${label}正在生成 · ${task.progress}%`;
    task.videoUrl=task.status==='done'?`/api/videos/${encodeURIComponent(task.videoId)}/content`:'';
    persist();renderTasks();renderDashboardCounts();renderStoryboard();
  } catch (error) {
    task.detail=`查询视频状态失败：${error.message}`;
    if (error.code === 'video_service_retired') { task.status='failed';task.errorCode=error.code;task.videoUrl=''; }
    persist();renderTasks();renderDashboardCounts();
  } finally { pollingVideoIds.delete(task.videoId); }
}

async function refreshVideoTasks() {
  const active=state.tasks.filter((task)=>task.kind==='video'&&task.videoId&&['queued','running'].includes(task.status));
  await Promise.all(active.map(refreshVideoTask));
}

async function submitVideoTask(task) {
  const project=projectById(task.request?.projectId);
  if(!project)throw new Error('找不到视频任务关联的项目。');
  const result=await apiRequest('/api/videos',{
    prompt:task.request.prompt,
    seconds:task.request.seconds||'5',
    provider:task.request.provider,
    firstFrame:task.request.firstFrame,
    ratio:task.request.ratio,
    resolution:task.request.resolution,
    audio:task.request.audio,
  });
  task.provider=result.provider;task.providerLabel=result.label;
  task.videoId=result.id;task.progress=Number(result.progress)||0;
  task.status=result.status==='completed'?'done':result.status==='failed'?'failed':result.status==='in_progress'?'running':'queued';
  task.detail=task.status==='failed'?(result.error||'视频生成失败'):task.status==='done'?`${result.label||'视频'}已完成，可打开预览`:`${result.label||'视频服务'}正在生成${result.seconds?` · ${result.seconds} 秒`:''}`;
  task.videoUrl=task.status==='done'?`/api/videos/${encodeURIComponent(task.videoId)}/content`:'';
  persist();renderTasks();renderDashboardCounts();
  return task;
}

async function retryAiTask(task) {
  try {
    if (task.request?.kind === 'video') {
      await refreshAiHealth();
      if (!aiHealth.video?.available) throw new Error(aiHealth.video?.reason || '视频服务尚未配置。');
    } else if (['image','shot-image'].includes(task.request?.kind)) {
      await ensureImageReady();
    } else {
      await ensureAiReady();
    }
    if(activeTaskFilter==='failed'){
      activeTaskFilter='running';
      $$('[data-task-filter]').forEach((el)=>el.classList.toggle('selected',el.dataset.taskFilter==='running'));
    }
    const request=task.request;
    task.status='running';task.progress=5;task.detail='正在重试 AI 任务';task.time='刚刚';
    persist();renderTasks();renderDashboardCounts();
    if(request.kind==='story'){
      const project=projectById(task.projectId);
      if(!project)throw new Error('找不到关联项目。');
      await runStoryGeneration(project,task,request.text,request.mode,request.episodeCount,request.episodeLength);
    } else if(request.kind==='storyboard') {
      const project=projectById(request.projectId);
      if(!project)throw new Error('找不到关联项目。');
      await runStoryboardGeneration(project,task,request.episode,request.preset,request.presetNote);
    } else if(request.kind==='video') {
      await submitVideoTask(task);
      showToast('视频任务已重新提交。');
    } else if(request.kind==='shot-image') {
      await runShotImageTask(task);showToast('镜头配图已生成。');
    } else if(request.kind==='assets'||request.kind==='episode') {
      const result=await apiRequest('/api/generate',{kind:request.kind,text:request.prompt,episode:request.episode});
      const p=projectById(request.projectId);if(!p)throw new Error('找不到关联项目。');
      if(request.kind==='episode'){p.episodeScripts||={};p.episodeScripts[request.episode]=result.text;task.textResult=result.text;}
      else for(const asset of result.assets){if(!projectAssets(p).some(a=>a.name===asset.name&&a.type===asset.type))state.assets.push({id:createId('a'),projectId:p.id,project:p.title,name:asset.name,type:asset.type,subtitle:asset.description,imagePrompt:asset.description,status:'待配图'});}
      task.status='done';task.progress=100;task.detail='生成结果已保存';persist();renderEverything();
    } else if(request.kind==='image') {
      await runAssetImageGeneration(task);
      showToast('图片已生成，并保存到素材资产。');
    }
  } catch(error) {
    task.status='failed';task.detail=error.message;persist();renderTasks();renderDashboardCounts();showToast(error.message,'warning');
  }
}
function renderDashboardCounts() {
  $('#projectCount').textContent = state.projects.filter((p) => !p.archived).length;
  $('#taskCount').textContent = state.tasks.filter((t) => ['running','queued'].includes(t.status)).length;
  renderRecent();
}

function createProject({ title, type='短篇剧集', description='', mode='idea', episodes, duration='2' }) {
  const plannedEpisodes = Number(episodes) || (mode==='series'?12:mode==='novel'?6:2);
  const project = { id:createId('p'), title:title.trim() || '未命名项目', type, stage:mode==='script'?'剧本整理':mode==='series'?'故事规划':mode==='novel'?'小说拆解':'故事构思', progress:12, updated:'刚刚更新', updatedAt:new Date().toISOString(), episodes:Math.min(plannedEpisodes,200), episodeLength:Number(duration)||2, currentEpisode:1, description:description.slice(0,240), archived:false, cover:['cover-one','cover-two','cover-three','cover-four'][state.userCreated % 4], tags:[type, mode==='series'?'长篇创作':mode==='novel'?'小说改编':mode==='script'?'剧本创作':'新灵感'] };
  state.userCreated++;
  state.projects.unshift(project);
  state.activeProject = project.id;
  persist();
  closeModal();
  renderDashboardCounts();
  showToast('项目已创建。');
  switchView('projects');
  return project;
}

function newProjectModal() {
  openModal({ title:'创建一个新项目', subtitle:'先为故事取个名字，之后可以继续补充剧本与素材。', body:`<form id="newProjectForm"><div class="form-field"><label for="newProjectName">项目名称</label><input id="newProjectName" name="title" maxlength="50" placeholder="例如：雾中来信" required /></div><div class="form-field"><label for="newProjectType">创作类型</label><select id="newProjectType" name="type"><option>短篇剧集</option><option>长篇剧集</option><option>小说改编</option><option>概念短片</option></select></div><div class="form-field"><label for="newProjectDesc">一句话梗概 <span class="form-help">选填</span></label><textarea id="newProjectDesc" name="description" maxlength="500" placeholder="主角是谁？故事里发生了什么？"></textarea></div></form>`, footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="submit-new-project">创建项目 ${icon('arrow')}</button>`, onSubmit:'new-project' });
}

function openProject(project) {
  if (!project) return;
  state.activeProject = project.id; persist();
  const story=project.generatedStory?`<section class="generated-story-preview"><h3>AI 故事结构</h3><p>${escapeHTML(project.generatedStory.slice(0,900)).replace(/\n/g,'<br>')}</p></section>`:'';
  const body = `<div class="project-detail-cover">${projectCover(project)}</div><div class="project-detail-copy"><div class="project-tag-row">${(project.tags||[]).map((t)=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div><p>${escapeHTML(project.description || '还没有添加故事梗概。可以从一句想法开始，逐步完成剧本、素材与分镜。')}</p><div class="detail-progress"><div><span>创作进度</span><b>${project.progress||0}%</b></div><span class="tiny-progress"><i style="width:${project.progress||0}%"></i></span></div><div class="detail-stats"><span><b>${project.episodes||1}</b>集规划</span><span><b>${escapeHTML(project.stage||'故事构思')}</b>当前阶段</span><span><b>${escapeHTML(project.updated||'刚刚')}</b>最近编辑</span></div></div>${story}`;
  openModal({ title:projectName(project.title), subtitle:`${escapeHTML(project.type || '创作项目')} · 项目数据保存在本地`, body, footer:`<button class="outline-button" data-action="project-menu" data-id="${project.id}">${icon('more')} 项目操作</button><button class="outline-button" data-action="open-storyboard" data-id="${project.id}">${icon('film')} 打开分镜</button><button class="primary-button" data-action="continue-project" data-id="${project.id}">继续创作 ${icon('arrow')}</button>`, wide:true });
}

function projectMenu(project) {
  if (!project) return;
  activeDrawerAction = project.id;
  $('#sideDrawer').innerHTML = `<div class="drawer-head"><div><h2>${projectName(project.title)}</h2><p>项目操作 · 本地演示</p></div><button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div><div class="drawer-section"><h3>继续创作</h3><button class="drawer-action" data-action="continue-project" data-id="${project.id}">${icon('film')} 打开工作流<span>${escapeHTML(project.stage||'故事构思')}</span></button><button class="drawer-action" data-action="open-storyboard" data-id="${project.id}">${icon('layout')} 查看分镜与画布</button></div><div class="drawer-section"><h3>管理项目</h3><button class="drawer-action" data-action="rename-project" data-id="${project.id}">${icon('edit')} 重命名项目</button><button class="drawer-action" data-action="duplicate-project" data-id="${project.id}">${icon('copy')} 复制项目</button><button class="drawer-action" data-action="archive-project" data-id="${project.id}">${icon('folder')} ${project.archived?'取消归档':'归档项目'}</button><button class="drawer-action danger" data-action="delete-project" data-id="${project.id}">${icon('trash')} 移入回收站<span>可在回收站恢复</span></button></div>`;
  $('#drawerBackdrop').hidden = false;
}

function renameProject(project) {
  openModal({ title:'重命名项目', subtitle:'为这个故事换一个名字。', body:`<div class="form-field"><label for="renameName">项目名称</label><input id="renameName" maxlength="50" value="${escapeHTML(project.title)}" /></div>`, footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="save-rename" data-id="${project.id}">保存更改 ${icon('check')}</button>` });
}

function deleteProject(project) {
  openModal({ title:'移入回收站？', subtitle:`“${projectName(project.title)}”会从当前项目列表隐藏。`, body:`<div class="modal-alert">这是本地演示操作。你可以在项目列表的“已归档”分类中找回示例项目。</div>`, footer:`<button class="outline-button" data-action="close-modal">保留项目</button><button class="primary-button" data-action="confirm-delete-project" data-id="${project.id}">移入回收站</button>` });
}

function assetIdentityFields(asset) {
  const project = asset?.project || projectById($('#assetProjectFilter')?.value)?.title || projectById(state.activeProject)?.title || '未关联项目';
  const projects = ['未关联项目', ...new Set(state.projects.filter(p=>!p.archived).map(p=>p.title))];
  if (!projects.includes(project)) projects.push(project);
  return `<div class="form-field"><label for="assetName">素材名称</label><input name="name" id="assetName" maxlength="50" value="${escapeHTML(asset?.name||'')}" placeholder="例如：沈知遥" required /></div><div class="provider-field-grid"><div class="form-field"><label for="assetType">素材类型</label><select name="type" id="assetType">${Object.entries({character:'角色',scene:'场景',prop:'道具'}).map(([value,label])=>`<option value="${value}" ${asset?.type===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="form-field"><label for="assetProject">关联项目</label><select name="project" id="assetProject">${projects.map(title=>`<option ${project===title?'selected':''}>${escapeHTML(title)}</option>`).join('')}</select></div></div>`;
}

function addAssetModal(asset = null, uploading = false) {
  const editing = Boolean(asset);
  const body = `<form id="assetForm">${assetIdentityFields(asset)}<div class="form-field"><label for="assetImageFile">素材图片</label><div class="asset-image-draft" id="assetImagePreview">${asset?.previewData?`<img src="${escapeHTML(asset.previewData)}" alt="当前素材图片" />`:'<span>选择图片后可在这里预览</span>'}</div><input id="assetImageFile" type="file" accept="image/png,image/jpeg,image/webp" ${uploading?'required':''} /><div class="asset-upload-help"><span class="form-help">支持 PNG、JPEG、WebP，单张最大 8 MB。</span><button type="button" class="text-button" data-action="remove-asset-image">移除图片</button></div></div><div class="form-field"><label for="assetSummary">外观与设定</label><textarea name="subtitle" id="assetSummary" maxlength="240" placeholder="描述外观、性格或画面特征…">${escapeHTML(asset?.subtitle||'')}</textarea></div><p class="form-status" id="assetFormStatus" role="status"></p></form>`;
  openModal({ title:editing?'编辑素材':uploading?'上传素材图片':'添加素材', subtitle:'图片保存在这台电脑，素材信息会自动保存。', body, footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="save-asset" data-id="${asset?.id||''}">${editing?'保存更改':'添加到素材库'} ${icon('arrow')}</button>` });
}

function readAssetImageFile(file) {
  if (!['image/png','image/jpeg','image/webp'].includes(file?.type)) return Promise.reject(new Error('请选择 PNG、JPEG 或 WebP 图片。'));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('素材图片最大 8 MB，请选择较小的图片。'));
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(new Error('读取图片失败，请换一张图片重试。'));
    reader.readAsDataURL(file);
  });
}

function saveAssetRecord(item) {
  item.projectId=state.projects.find(project=>project.title===item.project)?.id||null;
  const current = state.assets.find(asset=>asset.id===item.id);
  if(current?.previewData && current.previewData!==item.previewData) item.imageHistory=rememberAssetImage(current);
  const previous = state.assets;
  const exists = previous.some(asset=>asset.id===item.id);
  state.assets = exists ? previous.map(asset=>asset.id===item.id?item:asset) : [item,...previous];
  if (!persist()) { state.assets=previous;throw new Error('素材信息保存失败，请清理浏览器空间后重试。'); }
}

function revealSavedAsset() {
  activeAssetFilter = 'all';
  $('#assetSearch').value = '';
  $$('[data-asset-filter]').forEach(button=>button.classList.toggle('selected',button.dataset.assetFilter==='all'));
  renderAssets();
}

async function saveAsset(id, button) {
  const form = $('#assetForm');
  if (!form?.reportValidity() || button?.disabled) return;
  const fd = new FormData(form);
  const existing = state.assets.find(asset=>asset.id===id);
  const type = fd.get('type');
  const file = $('#assetImageFile',form).files?.[0];
  const removeImage = form.dataset.removeImage === 'true';
  const item = { ...existing, id:existing?.id||createId('a'), name:fd.get('name').trim(), type, subtitle:fd.get('subtitle').trim(), project:fd.get('project')||'未关联项目', look:existing?.look||({character:'character-a',scene:'scene-a',prop:'prop-a'}[type]), previewData:removeImage?'':existing?.previewData, status:existing?.status||'待完善' };
  button.disabled = true;
  $('#assetFormStatus',form).textContent = file?'正在保存图片…':'正在保存素材…';
  try {
    if (file) { const result=await apiRequest('/api/images/upload',{dataUrl:await readAssetImageFile(file)});item.previewData=result.url;item.status='已上传'; }
    if (!item.previewData) item.status='待完善';
    saveAssetRecord(item);
    if (form.isConnected) closeModal();
    revealSavedAsset();
    showToast(existing?'素材信息与图片已更新。':'素材已添加到资产库。');
  } catch (error) {
    if (form.isConnected) $('#assetFormStatus',form).textContent=error.message;
    showToast(error.message,'warning');
  } finally { if(button.isConnected)button.disabled=false; }
}

function assetImageModal(asset) {
  if (!asset?.previewData) return;
  const ext=/\.jpg$|^data:image\/jpeg/.test(asset.previewData)?'jpg':/\.webp$|^data:image\/webp/.test(asset.previewData)?'webp':'png';
  openModal({title:projectName(asset.name),subtitle:`${escapeHTML(asset.project||'未关联项目')} · ${escapeHTML(asset.status||'素材图片')}`,body:`<img class="generated-asset-image" src="${escapeHTML(asset.previewData)}" alt="${escapeHTML(asset.name)}" /><p class="asset-image-caption">${escapeHTML(asset.subtitle||'')}</p>${assetImageHistoryMarkup(asset)}`,footer:`<button class="outline-button" data-action="close-modal">关闭</button><a class="primary-button" href="${escapeHTML(asset.previewData)}" download="${escapeHTML(asset.name)}.${ext}">${icon('download')} 下载图片</a>`,wide:true});
}

function generateAssetImageModal(asset = null) {
  const draft = imageAssetDraft?.id===(asset?.id||'') ? imageAssetDraft : null;
  const size = draft?.size || '1024x1024';
  const reference = draft?.reference === true;
  openModal({title:asset?'为素材生成图片':'AI 生成素材图片',subtitle:'描述角色、场景或道具，生成后自动保存到素材库。',body:`<form id="imageAssetForm">${assetIdentityFields(draft||asset)}<div class="form-field"><label for="imagePrompt">想生成什么图片？</label><textarea id="imagePrompt" name="prompt" maxlength="4000" placeholder="例如：24 岁的雨夜邮局值班员，黑色短发，深绿色风衣，全身角色设定图，干净的灰色背景…" required>${escapeHTML(draft?.prompt||asset?.imagePrompt||asset?.subtitle||'')}</textarea></div><div class="form-field"><label for="imageSize">图片比例</label><select id="imageSize" name="size"><option value="1024x1024" ${size==='1024x1024'?'selected':''}>方形 · 适合道具和头像</option><option value="1024x1536" ${size==='1024x1536'?'selected':''}>竖图 · 适合角色全身图</option><option value="1536x1024" ${size==='1536x1024'?'selected':''}>横图 · 适合场景</option></select></div>${asset?.previewData?`<label class="image-reference-toggle"><input id="assetUseReference" type="checkbox" ${reference?'checked':''} />参考当前图片重绘 / 微调<img src="${escapeHTML(asset.previewData)}" alt="当前参考图片" /></label><p class="form-help">勾选后将当前图片发送给所配置的图片服务；原图保留在历史版本中。</p>`:''}<div class="image-service-hint"><span>使用你在设置中添加的图片服务，按服务商规则计费。</span><button type="button" class="text-button" data-action="image-settings" data-id="${asset?.id||''}">配置图片服务 ${icon('arrow')}</button></div><p class="form-status" id="imageGenerationStatus" role="status"></p></form>`,footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="submit-asset-image" data-id="${asset?.id||''}">${icon('spark')} 生成并保存</button>`});
}

async function ensureImageReady() {
  const settings = await apiRequest('/api/image-settings');
  if (!settings.configured) throw new Error('请先点击“配置图片服务”，添加图片 API 地址、密钥和模型。');
}

async function runAssetImageGeneration(task) {
  try {
    const { asset,prompt,size,references } = task.request;
    const p=projectById(asset.projectId)||state.projects.find(project=>project.title===asset.project);
    const styledPrompt=(p?.visualStyle?`${prompt}\n统一画风：${p.visualStyle}`:prompt).slice(0,4000);
    const result = await apiRequest('/api/images/generate',{prompt:styledPrompt,size,references:references||[]});
    task.imageUrl=result.url;task.assetId=asset.id;
    const current = state.assets.find(a=>a.id===asset.id);
    if(!task.request.existing || current) {
      const base = current ? {...current,...asset} : asset;
      saveAssetRecord({...base,imageHistory:rememberAssetImage(current||asset),previewData:result.url,imagePrompt:prompt,status:'AI 已生成'});
    }
    task.status='done';task.progress=100;task.detail=task.request.existing&&!current?'图片已生成；原素材已移除，可在任务中下载':'图片已生成，并保存到素材资产';task.imageUrl=result.url;task.assetId=asset.id;
    persist();if(task.request.batch)renderAssets();else {const selected=$('#assetProjectFilter').value;const saved=state.assets.find(a=>a.id===asset.id);if(saved&&selected!=='all'&&selected!==saved.projectId){$('#assetProjectFilter').value='all';state.assetProjectFilter='all';persist();}revealSavedAsset();}renderTasks();renderDashboardCounts();
  } catch(error) {
    task.status='failed';task.progress=0;task.detail=error.message;
    persist();renderTasks();renderDashboardCounts();throw error;
  }
}

async function generateAssetImage(id, button) {
  const form = $('#imageAssetForm');
  if (!form?.reportValidity() || button.disabled) return;
  const fd = new FormData(form);
  const existing = state.assets.find(asset=>asset.id===id);
  if (existing && state.tasks.some(task=>task.request?.kind==='image'&&task.request.asset?.id===id&&task.status==='running')) { showToast('这项素材已有图片在生成中。','warning');return; }
  const references=$('#assetUseReference')?.checked&&existing?.previewData?[existing.previewData]:[];
  const type = fd.get('type');
  const asset = {...existing,id:existing?.id||createId('a'),name:fd.get('name').trim(),type,project:fd.get('project'),subtitle:existing?.subtitle||fd.get('prompt').trim().slice(0,240),look:existing?.look||({character:'character-a',scene:'scene-a',prop:'prop-a'}[type])};
  button.disabled=true;
  const status = $('#imageGenerationStatus',form);
  try {
    status.textContent='正在检查图片服务…';
    await ensureImageReady();
    const task = queueTask({title:`${asset.name} · AI 素材图片`,project:asset.project,kind:'image',status:'running',detail:'图片正在生成，可在生成任务中查看'});
    task.request={kind:'image',asset,existing:Boolean(existing),prompt:fd.get('prompt').trim(),size:fd.get('size'),references};persist();renderTasks();
    status.textContent='图片正在生成，完成后自动加入素材库。你也可以关闭此窗口继续创作。';
    await runAssetImageGeneration(task);
    imageAssetDraft=null;
    if(form.isConnected)closeModal();
    showToast('图片已生成，并保存到素材资产。');
  } catch(error) {
    if(form.isConnected)status.textContent=error.message;
    showToast(error.message,'warning');
  } finally { if(button.isConnected)button.disabled=false; }
}

function notifications() {
  openModal({ title:'消息中心', subtitle:'查看产品更新与创作提醒。', body:`<article class="notification-item"><time>2026.09.27 · 产品更新</time><b>分镜续写与剧本保存体验更新</b><p>优化分镜中断后的继续生成、批量准备与实时进度展示；改善剧本调整与分集同步。</p></article><article class="notification-item"><time>2026.09.24 · 产品更新</time><b>画布素材与视频任务恢复优化</b><p>完善画布素材回写、生成状态恢复、模型选择与任务进度反馈。</p></article><article class="notification-item"><time>创作小贴士</time><b>素材保持一致的小建议</b><p>先建立角色与场景资产，再在分镜中引用它们，能让不同镜头的视觉设定更连贯。</p></article>`, footer:`<button class="outline-button" data-action="close-modal">关闭</button>` });
}

function viewWork(work) {
  if (!work) return;
  openModal({ title:escapeHTML(work.title), subtitle:`${escapeHTML(work.category)} · 创作者 ${escapeHTML(work.creator)}`, body:`<div class="work-modal-cover" style="height:210px;border-radius:10px;background:radial-gradient(circle at 72% 26%,#eed5a5 0 3%,transparent 3.5%),linear-gradient(140deg,${work.colors[0]},${work.colors[1]} 55%,${work.colors[2]});display:grid;place-items:center;color:#f2eee3;font-size:21px;letter-spacing:.1em;position:relative;overflow:hidden">${escapeHTML(work.title)}<span style="position:absolute;inset:55% -10% -30%;border-radius:50%;background:rgba(17,26,23,.48)"></span></div><p style="color:#8f9c91;font-size:9px;line-height:1.8;margin:13px 0">一部关于相遇、选择与时间的原创短片。此作品卡片为本地演示样例，不包含真实视频内容。</p><div class="project-card-footer"><span>${escapeHTML(work.badge)} · ${escapeHTML(work.category)}</span><span>${icon('heart')} ${work.likes} 喜欢</span></div>`, footer:`<button class="outline-button" data-action="close-modal">关闭</button><button class="primary-button" data-action="like-work" data-id="${work.id}">${icon('heart')} 喜欢这个作品</button>` });
}

function performAction(action, id, target) {
  if(workflowAction(action,id,target))return;
  const project = projectById(id || activeDrawerAction);
  switch (action) {
    case 'close-modal': closeModal(); break;
    case 'close-drawer': closeDrawer(); break;
    case 'new-project': newProjectModal(); break;
    case 'submit-new-project': {
      const form = $('#newProjectForm'); if (!form?.reportValidity()) return;
      const fd = new FormData(form);const type=fd.get('type');const mode=type==='长篇剧集'?'series':type==='小说改编'?'novel':type==='剧本创作'?'script':'idea';createProject({ title:fd.get('title'), type, description:fd.get('description'), mode }); break;
    }
    case 'upload': $('#fileInput').click(); break;
    case 'clear-starter': $('#starterInput').value = ''; $('#starterInput').focus(); break;
    case 'open-project': closeDrawer(); closeModal(); openProject(project); break;
    case 'project-menu': closeModal(); projectMenu(project); break;
    case 'continue-project': if (project) { state.activeProject=project.id; persist(); closeModal(); closeDrawer(); switchView('storyboard'); $('#storyProjectSelect').value=project.id; renderStoryboard(); showToast(`已打开“${project.title}”的演示工作区。`); } break;
    case 'open-storyboard': if (project) { state.activeProject=project.id; persist(); closeModal(); closeDrawer(); switchView('storyboard'); $('#storyProjectSelect').value=project.id; renderStoryboard(); } break;
    case 'rename-project': if (project) { closeDrawer(); renameProject(project); } break;
    case 'save-rename': { const p=projectById(id); const input=$('#renameName'); if (p&&input?.value.trim()) { const oldTitle=p.title;p.title=input.value.trim();state.assets.filter(a=>a.projectId===p.id||(!a.projectId&&a.project===oldTitle)).forEach(a=>{a.projectId=p.id;a.project=p.title;});state.tasks.filter(t=>t.projectId===p.id||t.request?.projectId===p.id).forEach(t=>t.project=p.title); p.updated='刚刚更新'; persist(); closeModal(); renderEverything(); showToast('项目名称已更新。'); } break; }
    case 'duplicate-project': if (project) { const clone={...structuredClone(project),id:createId('p'),title:`${project.title}（副本）`,updated:'刚刚复制',updatedAt:new Date().toISOString()}; state.projects.unshift(clone); persist(); closeDrawer(); renderEverything(); showToast('项目副本已创建。'); } break;
    case 'archive-project': if (project) { project.archived=!project.archived; persist(); closeDrawer(); renderEverything(); showToast(project.archived?'项目已归档。':'项目已恢复到当前列表。'); } break;
    case 'delete-project': if (project) { closeDrawer(); deleteProject(project); } break;
    case 'confirm-delete-project': { const p=projectById(id); if (p) { p.archived=true; persist(); closeModal(); renderEverything(); showToast('项目已移入归档列表。'); } break; }
    case 'add-asset': addAssetModal(); break;
    case 'upload-asset-image': addAssetModal(null,true); break;
    case 'generate-asset-image': generateAssetImageModal(state.assets.find(asset=>asset.id===id)); break;
    case 'submit-asset-image': generateAssetImage(id,target); break;
    case 'view-asset-image': assetImageModal(state.assets.find(asset=>asset.id===id)); break;
    case 'remove-asset-image': {
      const form=$('#assetForm');if(!form)break;
      form.dataset.removeImage='true';$('#assetImageFile',form).value='';
      $('#assetImagePreview',form).innerHTML='<span>选择图片后可在这里预览</span>';break;
    }
    case 'edit-asset': { const a=state.assets.find((x)=>x.id===id); if(a)addAssetModal(a); break; }
    case 'save-asset': saveAsset(id,target);break;
    case 'delete-asset': { const a=state.assets.find((x)=>x.id===id);if(a)openModal({title:'移除这项素材？',subtitle:`“${projectName(a.name)}”将从本地演示资产库移除。`,body:'<div class="modal-alert">此原型只修改浏览器中的演示数据。</div>',footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="confirm-delete-asset" data-id="${id}">移除素材</button>`});break; }
    case 'confirm-delete-asset': state.assets=state.assets.filter((x)=>x.id!==id);persist();closeModal();renderAssets();showToast('素材已移除。');break;
    case 'generate-storyboard': {
      const p=projectById($('#storyProjectSelect')?.value||state.activeProject);
      if(!p){showToast('请先选择或创建项目。','warning');break;}
      if(state.tasks.some(t=>t.request?.kind==='storyboard'&&t.request.projectId===p.id&&t.request.episode===activeEpisode&&t.status==='running')){showToast('本集分镜正在生成，请在任务中查看。','warning');break;}
      if(target)target.disabled=true;
      ensureAiReady().then(()=>{
        const task=queueTask({title:`${p.title} · EP ${String(activeEpisode).padStart(2,'0')} AI 分镜`,project:p.title,kind:'storyboard',status:'running',detail:'正在连接文本 AI'});
        return runStoryboardGeneration(p,task,activeEpisode,state.storyboardPreset,state.storyboardPresetNote||'');
      }).catch((error)=>showToast(error.message,'warning')).finally(()=>{if(target)target.disabled=false;});
      break;
    }
    case 'check-ai': checkAiConnection(target);break;
    case 'ai-settings':
    case 'video-settings': openServiceSettings();break;
    case 'image-settings': {
      const form=$('#imageAssetForm');
      if(form){const fd=new FormData(form);imageAssetDraft={id:id||'',name:fd.get('name'),type:fd.get('type'),project:fd.get('project'),prompt:fd.get('prompt'),size:fd.get('size'),reference:$('#assetUseReference')?.checked||false};}
      openServiceSettings('image');break;
    }
    case 'save-service-settings': saveServiceSettings(target,false);break;
    case 'save-check-service-settings': saveServiceSettings(target,true);break;
    case 'clear-text-api-key': clearTextApiKey(target);break;
    case 'clear-image-api-key': {
      target.disabled=true;
      apiRequest('/api/image-settings',{clearApiKey:true}).then(()=>{closeModal();showToast('图片 API Key 已清除。');}).catch(error=>showToast(error.message,'warning')).finally(()=>{if(target.isConnected)target.disabled=false;});break;
    }
    case 'queue-video': { const p=projectById($('#storyProjectSelect')?.value||state.activeProject);if(p){if(target)target.disabled=true;runVideoGeneration(p,activeEpisode).finally(renderVideoAvailability);}break; }
    case 'add-episode': { const p=projectById($('#storyProjectSelect')?.value||state.activeProject);if(p){if(Number(p.episodes)>=200){showToast('单个项目最多展示 200 集。','warning');break;}p.episodes=(Number(p.episodes)||1)+1;activeEpisode=p.episodes;persist();renderStoryboard();showToast(`已添加 EP ${String(activeEpisode).padStart(2,'0')} 演示分集。`);}break; }
    case 'storyboard-preset': openModal({title:'分镜预设',subtitle:'为这段故事选择镜头表达方向。',body:`<div class="form-field"><label>预设类型</label><div class="choice-row"><button class="${state.storyboardPreset==='visual'?'selected':''}" data-choice="visual">电影感叙事</button><button class="${state.storyboardPreset==='dialogue'?'selected':''}" data-choice="dialogue">对白锁定</button><button class="${state.storyboardPreset==='commercial'?'selected':''}" data-choice="commercial">剧情短剧</button></div></div><div class="form-field"><label for="presetNote">风格补充</label><textarea id="presetNote" placeholder="例如：克制的情绪，避免过快剪辑…">${escapeHTML(state.storyboardPresetNote||'')}</textarea></div>`,footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="apply-preset">应用预设 ${icon('check')}</button>`});break;
    case 'apply-preset': {state.storyboardPreset=$('[data-choice].selected')?.dataset.choice||'visual';state.storyboardPresetNote=$('#presetNote')?.value.trim()||'';persist();closeModal();renderStoryboard();showToast('分镜预设已保存到当前演示空间。');break;}
    case 'upload-reference': $('#referenceFileInput').click();break;
    case 'edit-shot': {
      const shot=currentShots().find((item)=>item.id===id);if(!shot)break;
      openModal({title:`编辑镜头 ${shot.no}`,subtitle:'保存后只会更新当前项目的当前分集。',body:`<div class="form-field"><label for="shotTitle">镜头标题</label><input id="shotTitle" value="${escapeHTML(shot.title)}" maxlength="80" /></div><div class="form-field"><label for="shotDescription">画面与动作</label><textarea id="shotDescription">${escapeHTML(shot.desc)}</textarea></div><div class="form-field"><label for="shotVoice">对白 / 声音提示</label><input id="shotVoice" value="${escapeHTML(shot.voice)}" /></div><div class="form-field"><label for="shotLens">景别</label><select id="shotLens">${['远景','全景','中景','中近景','近景','特写'].map((v)=>`<option ${shot.lens===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="form-field"><label for="shotMove">运镜</label><input id="shotMove" maxlength="60" value="${escapeHTML(shot.move)}" /></div><div class="form-field"><label for="shotDuration">时长（秒）</label><input id="shotDuration" type="number" min="1" max="60" value="${Number(String(shot.duration).match(/\d+/)?.[0])||5}" /></div>`,footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="save-shot" data-id="${shot.id}">保存镜头</button>`});break;
    }
    case 'save-shot': {const shot=currentShots().find((item)=>item.id===id);if(shot){if(!$('#shotDuration').reportValidity())return;shot.title=$('#shotTitle').value.trim()||shot.title;shot.desc=$('#shotDescription').value.trim();shot.voice=$('#shotVoice').value.trim();shot.lens=$('#shotLens').value;shot.move=$('#shotMove').value.trim()||'静止';shot.duration=`${$('#shotDuration').value} 秒`;persist();closeModal();renderStoryboard();showToast('镜头内容已保存。');}break;}
    case 'add-node': { openModal({title:'添加画布节点',subtitle:'把一个创作线索加入当前故事画布。',body:`<div class="form-field"><label for="nodeType">节点类型</label><select id="nodeType"><option value="script">故事想法</option><option value="asset">角色 / 素材</option><option value="story">分镜片段</option><option value="video">视频草稿</option></select></div><div class="form-field"><label for="nodeTitle">节点名称</label><input id="nodeTitle" placeholder="例如：结尾的反转" required /></div><div class="form-field"><label for="nodeText">内容</label><textarea id="nodeText" placeholder="写下相关细节…"></textarea></div>`,footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="save-node">添加节点 ${icon('plus')}</button>`});break; }
    case 'save-node': { const title=$('#nodeTitle')?.value.trim();if(!title){$('#nodeTitle')?.focus();return;}const kind=$('#nodeType').value;const areas={script:'script',asset:'asset',story:'story',video:'video'};state.nodes.push({id:createId('n'),projectId:state.activeProject,kind,label:kind==='script'?'故事想法':kind==='asset'?'角色资产':kind==='story'?'分镜片段':'视频草稿',title,text:$('#nodeText').value.trim()||'还没有添加更多说明。',area:areas[kind]});persist();closeModal();renderCanvas();showToast('节点已添加到画布。');break; }
    case 'select-node': { const node=state.nodes.find((n)=>n.id===id);if(node){$$('.canvas-node').forEach((n)=>n.classList.toggle('selected',n.dataset.id===id));showToast(`已选中节点：${node.title}`);}break; }
    case 'node-menu': { const node=state.nodes.find((n)=>n.id===id);if(node)openModal({title:escapeHTML(node.title),subtitle:`${node.label} · 画布节点`,body:`<div class="form-field"><label>内容</label><textarea>${escapeHTML(node.text)}</textarea></div><div class="provider-field-grid"><div class="form-field"><label for="nodeX">水平位置</label><input id="nodeX" type="number" min="0" max="880" value="${node.x||40}" /></div><div class="form-field"><label for="nodeY">垂直位置</label><input id="nodeY" type="number" min="0" max="400" value="${node.y||40}" /></div></div>`,footer:`<button class="outline-button" data-action="remove-node" data-id="${id}">${icon('trash')} 移除节点</button><button class="outline-button" data-action="close-modal">关闭</button><button class="primary-button" data-action="save-node-text" data-id="${id}">保存</button>`});break; }
    case 'save-node-text': { const node=state.nodes.find((n)=>n.id===id);if(node){node.text=$('textarea',$('#modal')).value;node.x=Math.max(0,Math.min(880,Number($('#nodeX').value)||0));node.y=Math.max(0,Math.min(400,Number($('#nodeY').value)||0));persist();closeModal();renderCanvas();showToast('画布节点已更新。');}break; }
    case 'remove-node': state.nodes=state.nodes.filter((n)=>n.id!==id);persist();closeModal();renderCanvas();showToast('节点已从画布移除。');break;
    case 'canvas-zoom-in': zoom=Math.min(140,zoom+10);renderCanvas();showToast(`画布缩放 ${zoom}%。`);break;
    case 'canvas-zoom-out': zoom=Math.max(60,zoom-10);renderCanvas();showToast(`画布缩放 ${zoom}%。`);break;
    case 'canvas-fit': zoom=100;renderCanvas();showToast('画布已适应窗口。');break;
    case 'canvas-help': openModal({title:'画布使用提示',subtitle:'在画布上整理故事创作线索。',body:`<div class="notification-item"><b>添加节点</b><p>可创建故事想法、角色素材、分镜片段或视频草稿节点。</p></div><div class="notification-item"><b>查看与编辑</b><p>点击节点查看选择状态，点击节点右上角的操作按钮编辑或移除内容。</p></div><div class="notification-item"><b>本地保存与 AI</b><p>画布修改保存在当前浏览器；故事与分镜通过本机服务调用已配置的文本 AI。</p></div>`,footer:`<button class="primary-button" data-action="close-modal">知道了</button>`});break;
    case 'cancel-task': { const t=state.tasks.find((x)=>x.id===id);if(t&&!t.sample){showToast('已提交给服务的任务暂不支持取消。','warning');break;}if(t){t.status='cancelled';t.detail='已取消示例任务';persist();renderTasks();renderDashboardCounts();showToast('示例任务已取消。');}break; }
    case 'retry-task': { const t=state.tasks.find((x)=>x.id===id);if(t?.request){retryAiTask(t);break;}if(t){t.status='queued';t.progress=0;t.detail='已重新加入示例队列';t.time='刚刚';if(activeTaskFilter==='failed'){activeTaskFilter='running';$$('[data-task-filter]').forEach((el)=>el.classList.toggle('selected',el.dataset.taskFilter==='running'));}persist();renderTasks();renderDashboardCounts();showToast('示例任务已重新排队。');}break; }
    case 'refresh-video': {const task=state.tasks.find((item)=>item.id===id);if(task)refreshVideoTask(task);break;}
    case 'view-task': {
      const t=state.tasks.find(x=>x.id===id);if(!t)break;
      const video=t.videoUrl?`<video class="generated-video" controls playsinline preload="metadata" src="${escapeHTML(t.videoUrl)}"></video>`:'';
      const story=t.textResult?`<div class="generated-story">${escapeHTML(t.textResult).replace(/\n/g,'<br>')}</div>`:t.resultType==='story'&&projectById(t.projectId)?.generatedStory?`<div class="generated-story">${escapeHTML(projectById(t.projectId).generatedStory).replace(/\n/g,'<br>')}</div>`:'';
      const image=t.imageUrl?`<img class="generated-asset-image" src="${escapeHTML(t.imageUrl)}" alt="${escapeHTML(t.request?.asset?.name||'生成图片')}" />`:'';
      openModal({title:escapeHTML(t.title),subtitle:`${taskStatusLabel(t)} · ${escapeHTML(t.project)}`,body:`<div class="notification-item"><b>任务详情</b><p>${escapeHTML(t.detail)}</p></div><div class="detail-progress"><div><span>AI 生成进度</span><b>${t.progress}%</b></div><span class="tiny-progress"><i style="width:${t.progress}%"></i></span></div>${video}${story}${image}`,footer:`<button class="outline-button" data-action="close-modal">关闭</button>${image?`<a class="primary-button" href="${escapeHTML(t.imageUrl)}" download="${escapeHTML(t.request?.asset?.name||t.title)}.png">${icon('download')} 下载图片</a>`:''}${video?`<a class="primary-button" href="${escapeHTML(t.videoUrl)}" download="${escapeHTML(t.title)}.mp4">${icon('download')} 下载视频</a>`:''}`,wide:Boolean(video||story||image)});break;
    }
    case 'refresh-tasks': refreshVideoTasks();showToast('已刷新 AI 任务状态。');break;
    case 'like-work': { const wasLiked=state.liked.includes(id);state.liked=wasLiked?state.liked.filter((x)=>x!==id):[...state.liked,id];persist();renderShowcase();if(!wasLiked)showToast('已加入本地喜欢列表。');else showToast('已取消喜欢。');break; }
    case 'view-work': { const w=state.works.find((x)=>x.id===id);viewWork(w);break; }
    case 'load-more': { const extra=[{id:createId('w'),title:'海风吹过旧站台',category:'短片剧集',creator:'溪桥',likes:44,colors:['#8da6a2','#566c6b','#303d43'],badge:'情感'},{id:createId('w'),title:'青鸟来信',category:'动画短片',creator:'望舒动画',likes:117,colors:['#93b6a3','#7788a2','#474d64'],badge:'成长'},{id:createId('w'),title:'无名的旅人',category:'3D',creator:'拾帧',likes:89,colors:['#c3a373','#6f6d5b','#33403a'],badge:'奇幻'},{id:createId('w'),title:'晚餐之后',category:'仿真人',creator:'廿三格',likes:63,colors:['#bc846e','#746052','#333a3b'],badge:'家庭'}];state.works.push(...extra);persist();renderShowcase();showToast('发现了 4 部新的演示作品。');break; }
    case 'sort-projects': sortByName=!sortByName;renderProjects();showToast(sortByName?'已按名称排序。':'已按最近更新排序。');break;
    case 'notifications': notifications();break;
    case 'profile': openModal({title:'创作人空间',subtitle:'本地演示账号',body:`<div class="notification-item"><b>林间造梦</b><p>个人创作空间 · 数据保存在当前浏览器</p></div><button class="drawer-action" data-action="profile-settings">${icon('sliders')} 工作台偏好设置<span>演示</span></button><button class="drawer-action" data-action="export-data">${icon('download')} 导出演示数据<span>JSON</span></button><button class="drawer-action danger" data-action="reset-data">${icon('refresh')} 重置演示空间<span>本地操作</span></button>`,footer:`<button class="outline-button" data-action="close-modal">关闭</button>`});break;
    case 'profile-settings': openModal({title:'工作台偏好',subtitle:'设置会保存在当前浏览器。',body:`<div class="form-field"><label for="displayDensity">界面密度</label><select id="displayDensity"><option value="comfortable" ${state.preferences.density==='comfortable'?'selected':''}>舒适</option><option value="compact" ${state.preferences.density==='compact'?'selected':''}>紧凑</option></select></div><div class="form-field"><label for="reduceMotion">动画效果</label><select id="reduceMotion"><option value="standard" ${state.preferences.motion==='standard'?'selected':''}>标准</option><option value="reduced" ${state.preferences.motion==='reduced'?'selected':''}>减少动画</option></select></div>`,footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="save-preferences">保存设置</button>`});break;
    case 'save-preferences': state.preferences={density:$('#displayDensity').value,motion:$('#reduceMotion').value};persist();applyPreferences();closeModal();showToast('工作台偏好已保存。');break;
    case 'export-data': { const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pianchang-demo-data.json';a.click();URL.revokeObjectURL(a.href);closeModal();showToast('演示数据导出已开始。');break; }
    case 'reset-data': openModal({title:'重置本地演示空间？',subtitle:'此操作会恢复默认示例数据。',body:'<div class="modal-alert">你创建的项目、素材、画布修改和喜欢记录会被清除。</div>',footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="confirm-reset">重置演示数据</button>`});break;
    case 'confirm-reset': state=structuredClone(sampleData);persist();closeModal();renderEverything();switchView('home');showToast('演示空间已重置。');break;
    case 'close-sidebar': $('#sidebar').classList.remove('open');break;
    case 'open-sidebar': $('#sidebar').classList.add('open');break;
  }
}

function applyPreferences() {
  document.body.classList.toggle('compact-mode',state.preferences?.density==='compact');
  document.documentElement.classList.toggle('reduce-motion',state.preferences?.motion==='reduced');
}

function renderEverything() { renderDashboardCounts(); renderProjects(); renderAssets(); renderTasks(); renderShowcase(); renderStoryboard(); renderCanvas(); }

document.addEventListener('click', (event) => {
  const viewTarget=event.target.closest('[data-view]');
  if(viewTarget){switchView(viewTarget.dataset.view);return;}
  const modeTarget=event.target.closest('[data-mode]');
  if(modeTarget){setMode(modeTarget.dataset.mode);$('#starterPanel').scrollIntoView({behavior:'smooth',block:'center'});$('#starterInput').focus({preventScroll:true});return;}
  const projectFilter=event.target.closest('[data-project-filter]');
  if(projectFilter){activeProjectFilter=projectFilter.dataset.projectFilter;$$('[data-project-filter]').forEach((el)=>el.classList.toggle('selected',el===projectFilter));renderProjects();return;}
  const assetFilter=event.target.closest('[data-asset-filter]');
  if(assetFilter){activeAssetFilter=assetFilter.dataset.assetFilter;$$('[data-asset-filter]').forEach((el)=>el.classList.toggle('selected',el===assetFilter));renderAssets();return;}
  const taskFilter=event.target.closest('[data-task-filter]');
  if(taskFilter){activeTaskFilter=taskFilter.dataset.taskFilter;$$('[data-task-filter]').forEach((el)=>el.classList.toggle('selected',el===taskFilter));renderTasks();return;}
  const showFilter=event.target.closest('[data-show-filter]');
  if(showFilter){activeShowFilter=showFilter.dataset.showFilter;$$('[data-show-filter]').forEach((el)=>el.classList.toggle('selected',el===showFilter));renderShowcase();return;}
  const episode=event.target.closest('[data-episode]');
  if(episode){activeEpisode=Number(episode.dataset.episode);renderStoryboard();return;}
  const choice=event.target.closest('[data-choice]');
  if(choice){$$('[data-choice]').forEach((el)=>el.classList.toggle('selected',el===choice));return;}
  const actionTarget=event.target.closest('[data-action]');
  if(actionTarget){performAction(actionTarget.dataset.action,actionTarget.dataset.id,actionTarget);return;}
  if(event.target===$('#modalBackdrop'))closeModal();
  if(event.target===$('#drawerBackdrop'))closeDrawer();
});

document.addEventListener('change', async (event) => {
  if (event.target.id === 'assetImageFile') {
    const input=event.target;const form=input.closest('form');const file=input.files?.[0];if(!file)return;
    try {
      const dataUrl=await readAssetImageFile(file);
      if(!form.isConnected || input.files?.[0]!==file)return;
      form.dataset.removeImage='false';
      $('#assetImagePreview',form).innerHTML=`<img src="${escapeHTML(dataUrl)}" alt="待上传素材图片" />`;
      if(!$('#assetName',form).value.trim())$('#assetName',form).value=file.name.replace(/\.[^.]+$/,'').slice(0,50);
      $('#assetFormStatus',form).textContent='图片已选择，点击保存后加入素材库。';
    } catch(error) {
      input.value='';
      if(form.isConnected)$('#assetFormStatus',form).textContent=error.message;
      showToast(error.message,'warning');
    }
  }
  if (event.target.id === 'videoProvider') {
    $$('[data-provider-panel]').forEach((panel)=>{panel.hidden=panel.dataset.providerPanel!==event.target.value;});
  }
  if (event.target.id === 'promptFieldHint' && event.target.value) {
    const [node,input]=event.target.value.split('|||');
    $('#promptNode').value=node;$('#promptInput').value=input;
  }
  if (event.target.id === 'comfyWorkflowFile') {
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>2*1024*1024){showToast('工作流 JSON 请控制在 2 MB 以内。','warning');event.target.value='';return;}
    try {
      const text=await file.text();const workflow=JSON.parse(text);
      if(!workflow||Array.isArray(workflow)||workflow.nodes)throw new Error();
      $('#comfyWorkflow').value=text;
      const candidate=Object.entries(workflow).flatMap(([node,value])=>Object.entries(value?.inputs||{}).filter(([input,val])=>typeof val==='string'&&(/text|prompt/i.test(input)||/CLIPTextEncode|Prompt/i.test(value.class_type))).map(([input])=>({node,input}))).find(Boolean);
      if(candidate){$('#promptNode').value=candidate.node;$('#promptInput').value=candidate.input;}
      showToast('工作流已导入，请核对提示词节点。');
    } catch { showToast('无法读取该文件，请导出 ComfyUI API 格式工作流。','warning'); }
    event.target.value='';
  }
});

$('#startCreation').addEventListener('click',async()=>{
  const input=$('#starterInput'); const text=input.value.trim();
  if(!text){showToast('先写下一点故事内容，再开始创作。','warning');input.focus();return;}
  const button=$('#startCreation');
  if(button.disabled)return;
  button.disabled=true;
  try {
    const mode=state.mode;
    if(mode!=='script')await ensureAiReady(); const firstLine=text.split(/\n|[。！？.!?]/).map((x)=>x.trim()).find(Boolean)||text;
    const cleaned=firstLine.length>22?`${firstLine.slice(0,22)}…`:firstLine;
    const prefix=mode==='novel'?'改编：':mode==='series'?'长篇：':mode==='script'?'剧本：':'';
    const type=mode==='novel'?'小说改编':mode==='series'?'长篇剧集':mode==='script'?'剧本创作':'短篇剧集';
    const episodeCount=$('#episodeCount').value;
    const episodeLength=$('#episodeLength').value;
    const project=createProject({title:`${prefix}${cleaned}`,type,description:text,mode,episodes:episodeCount,duration:episodeLength});
    project.sourceText=text;
    persist();
    input.value='';
    switchView('storyboard');
    $('#storyProjectSelect').value=project.id;
    activeEpisode=1;
    renderStoryboard();
    if(mode==='script'){project.episodeScripts={1:text};project.stage='剧本已导入';persist();renderStoryboard();episodeScriptModal();showToast('原剧本已保存，可直接继续画风、资产与分镜。');return;}
    const task=queueTask({title:`${project.title} · 故事结构`,project:project.title,kind:'script',status:'running',detail:'正在连接文本 AI'});
    await runStoryGeneration(project,task,text,mode,episodeCount,episodeLength);
  } catch(error) {
    showToast(error.message,'warning');
  } finally {
    button.disabled=false;
  }
});

$('#fileInput').addEventListener('change',async(event)=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>10*1024*1024){showToast('演示版文本文件最大 10 MB。','warning');event.target.value='';return;}
  try{const content=await file.text();$('#starterInput').value=content;showToast(`已读取“${file.name}”文本内容。`);}catch{showToast('无法读取该文件，请尝试 TXT 或 Markdown。','warning');}
  event.target.value='';
});

$('#referenceFileInput').addEventListener('change',async(event)=>{
  const file=event.target.files?.[0];if(!file)return;
  const project=projectById(state.activeProject);
  event.target.value='';
  try {
    const result=await apiRequest('/api/images/upload',{dataUrl:await readAssetImageFile(file)});
    const asset={id:createId('a'),name:file.name.replace(/\.[^.]+$/,'')||'分镜参考图',subtitle:`分镜参考图 · ${file.name}`,type:'scene',look:'scene-a',project:project?.title||'未关联项目',status:'参考图',previewData:result.url};
    saveAssetRecord(asset);
    if(activeView==='assets')renderAssets();
    showToast(`参考图已加入“${asset.project}”素材资产。`);
  } catch(error) { showToast(error.message,'warning'); }
});

$('#projectGrid').addEventListener('input',(e)=>{if(e.target.id==='projectSearch')renderProjects();});
$('#assetGrid').addEventListener('input',(e)=>{if(e.target.id==='assetSearch')renderAssets();});
$('#projectSearch').addEventListener('input',renderProjects);
$('#assetSearch').addEventListener('input',renderAssets);
$('#taskSearch').addEventListener('input',renderTasks);
$('#showcaseSearch').addEventListener('input',renderShowcase);
$('#storyProjectSelect').addEventListener('change',()=>{activeEpisode=1;state.activeProject=$('#storyProjectSelect').value;persist();renderStoryboard();});
$('#globalSearch').addEventListener('keydown',(e)=>{
  if(e.key==='Enter'){
    const q=e.target.value.trim().toLowerCase();if(!q)return;
    const projects=state.projects.filter((p)=>`${p.title} ${p.type} ${p.stage}`.toLowerCase().includes(q));
    const assets=state.assets.filter((a)=>`${a.name} ${a.subtitle} ${a.project}`.toLowerCase().includes(q));
    openModal({title:`搜索结果：${escapeHTML(e.target.value.trim())}`,subtitle:`找到 ${projects.length} 个项目与 ${assets.length} 项素材。`,body:`${projects.length?`<div class="drawer-section"><h3>项目</h3>${projects.map((p)=>`<button class="drawer-action" data-action="open-project" data-id="${p.id}">${icon('folder')} ${projectName(p.title)}<span>${escapeHTML(p.stage||'')}</span></button>`).join('')}</div>`:''}${assets.length?`<div class="drawer-section"><h3>素材资产</h3>${assets.map((a)=>`<button class="drawer-action" data-action="search-asset" data-id="${a.id}">${icon('box')} ${projectName(a.name)}<span>${escapeHTML(a.project)}</span></button>`).join('')}</div>`:''}${!projects.length&&!assets.length?'<div class="empty-state">没有找到相关项目或素材。</div>':''}`,footer:`<button class="outline-button" data-action="close-modal">关闭</button>`});
  }
});
document.addEventListener('keydown',(e)=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus();}
  if(e.key==='Escape'){
    if(!$('#modalBackdrop').hidden){e.preventDefault();closeModal();return;}
    if(!$('#drawerBackdrop').hidden){e.preventDefault();closeDrawer();return;}
    $('#sidebar').classList.remove('open');
  }
  if(e.key==='Tab'&&!$('#modalBackdrop').hidden){
    const focusable=$$('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[href],[tabindex]:not([tabindex="-1"])',$('#modal')).filter((el)=>el.getClientRects().length);
    if(!focusable.length){e.preventDefault();$('#modal').focus();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
document.addEventListener('submit',(e)=>e.preventDefault());

const modalObserver=new MutationObserver(()=>{
  if($('#modalBackdrop').hidden)return;
  const modal=$('#modal');
  if(modal.dataset.submitBound)return;
  modal.dataset.submitBound='true';
  modal.addEventListener('click',(e)=>{
    if(e.target.closest('[data-action="submit-new-project"]')){e.preventDefault();const fn=activeModalAction;if(fn==='new-project'){const form=$('#newProjectForm');if(form?.reportValidity()){const fd=new FormData(form);createProject({title:fd.get('title'),type:fd.get('type'),description:fd.get('description')});}}}
  });
});
modalObserver.observe($('#modalBackdrop'),{attributes:true,attributeFilter:['hidden']});

// Keep global-search results actionable without depending on event bubbling through a modal.
document.addEventListener('click',(e)=>{
  const searchAsset=e.target.closest('[data-action="search-asset"]');
  if(searchAsset){const a=state.assets.find((x)=>x.id===searchAsset.dataset.id);closeModal();switchView('assets');$('#assetSearch').value=a?.name||'';renderAssets();}
});

setMode(state.mode || 'idea');
applyPreferences();
renderEverything();
refreshAiHealth();
refreshVideoTasks();
setInterval(()=>{if(!document.hidden)refreshVideoTasks();},8_000);
window.addEventListener('focus',refreshVideoTasks);
