/* Project production steps; state remains owned by app.js. */
let canvasConnectionFrom = null;
let pendingShotUpload = null;
const productionBatches = new Set();
const stylePresets = {
  film:'写实电影，真实材质，自然光，克制色彩，清晰人物面部，16:9 构图',
  anime:'二维动漫，细腻线稿，统一角色比例，赛璐璐色块，电影构图',
  ink:'国风水墨，宣纸纹理，青绿山水，留白，柔和光线',
  scifi:'星际科幻，硬表面金属材质，冷色体积光，宏大环境，稳定人物设定',
  clay:'黏土动画，手工纹理，圆润造型，柔和布光，统一比例',
  watercolor:'水彩绘本，纸张纹理，温暖低饱和色彩，清晰轮廓，柔和光线',
};
function storyboardDirection(preset) {
  return ({visual:'电影感叙事：用建立镜头、动作与反应呈现因果；每镜只设一个主运镜，保持空间方向。',dialogue:'对白锁定：逐字保留原稿台词，不新增或改写；安排说话与倾听反应镜头，保持眼线和人物站位。',commercial:'剧情短剧：先展示冲突，动作推动反转，结尾保留悬念；保留原稿事实和台词，避免无关空镜。'})[preset] || preset;
}
function renderAssetProjectFilter() {
  const field=$('#assetProjectFilter');if(!field)return;
  const selected=field.dataset.initialized?field.value:(state.assetProjectFilter||'all');
  field.dataset.initialized='true';
  field.innerHTML='<option value="all">全部项目</option>'+state.projects.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.title)}${p.archived?'（已归档）':''}</option>`).join('');
  field.value=state.projects.some(p=>p.id===selected)?selected:'all';
}
function assetScope() {
  const id=$('#assetProjectFilter')?.value||'all';
  return id==='all'?state.assets:projectAssets(projectById(id));
}
function selectedAssetImages() {
  const query=($('#assetSearch')?.value||'').trim().toLowerCase();
  return assetScope().filter(a=>(activeAssetFilter==='all'||a.type===activeAssetFilter)&&(!query||`${a.name} ${a.subtitle} ${a.project}`.toLowerCase().includes(query)));
}
function assetImageBusy(id) {
  return state.tasks.some(t=>t.request?.kind==='image'&&t.request.asset?.id===id&&t.status==='running');
}
function rememberAssetImage(asset) {
  const previous=asset.imageHistory||[];
  return asset.previewData?[{url:asset.previewData,prompt:asset.imagePrompt||'',savedAt:new Date().toISOString()},...previous.filter(image=>image.url!==asset.previewData)].slice(0,20):previous;
}
function assetImageHistoryMarkup(asset) {
  const history=(asset.imageHistory||[]).filter(image=>image.url!==asset.previewData);
  return history.length?`<h3>历史图片 · 可恢复</h3><div class="asset-image-history">${history.map((image,index)=>`<button data-action="restore-asset-image" data-id="${escapeHTML(asset.id)}" data-history-index="${index}" title="恢复这张历史图片"><img src="${escapeHTML(image.url)}" alt="历史图片 ${index+1}" /><span>恢复图片 ${index+1}</span></button>`).join('')}</div>`:'';
}
function restoreAssetImage(id,button) {
  const asset=state.assets.find(a=>a.id===id);if(!asset)return;
  if(assetImageBusy(id)){showToast('当前素材正在生成图片，请完成后再恢复版本。','warning');return;}
  const image=(asset.imageHistory||[]).filter(i=>i.url!==asset.previewData)[Number(button.dataset.historyIndex)];if(!image)return;
  saveAssetRecord({...asset,imageHistory:rememberAssetImage(asset),previewData:image.url,imagePrompt:image.prompt,status:'已恢复'});
  renderAssets();assetImageModal(state.assets.find(a=>a.id===id));showToast('历史图片已恢复，刚才的图片也已保留。');
}
function shotReferenceImages(project,shot) {
  return [...new Set(projectAssets(project).filter(a=>(shot.assetIds||[]).includes(a.id)&&a.previewData).map(a=>a.previewData))].slice(0,8);
}
function shotImageReferencesMarkup(project,shot) {
  const assets=projectAssets(project).filter(a=>(shot.assetIds||[]).includes(a.id)&&a.previewData);
  return assets.length?`<h3>视觉参考图片</h3><p class="form-help">选中的图片会发送给你配置的图片服务。批量配图默认使用前 8 张已引用图片；模型需支持参考图生图。</p><div class="shot-image-references">${assets.map((a,index)=>`<label><input type="checkbox" value="${escapeHTML(a.previewData)}" ${index<8?'checked':''}/><img src="${escapeHTML(a.previewData)}" alt=""/><span>${escapeHTML(a.name)}</span></label>`).join('')}</div>`:'<p class="form-help">当前镜头没有可用的参考图片。可先在“引用资产”中选择有图片的素材。</p>';
}
function assetBatchModal(redo) {
  const project=projectById($('#assetProjectFilter').value);
  if(!project){showToast('请先选择一个项目，再批量生成。','warning');$('#assetProjectFilter').focus();return;}
  const assets=selectedAssetImages().filter(a=>(redo||!a.previewData)&&!assetImageBusy(a.id));
  if(!assets.length){showToast('当前筛选没有需要生成的素材，或已有任务在运行。');return;}
  openModal({title:redo?'批量重绘项目素材':'批量生成缺少的素材图片',subtitle:project.title,
    body:`<p>当前筛选共 ${assets.length} 项，将逐项提交 ${assets.length} 次图片请求，按服务商规则计费。</p><p>已完成的结果保留，失败后停止，可继续剩余项。${redo?'旧图保留在历史版本；有旧图的素材使用参考图重绘。':'已有图片不重复生成。'}</p><ul class="batch-asset-list">${assets.map(a=>`<li>${escapeHTML(a.name)}</li>`).join('')}</ul>`,
    footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="start-asset-batch" data-id="${redo?'redo':'missing'}">开始生成 ${assets.length} 项</button>`});
}
async function runAssetBatch(redo) {
  const project=projectById($('#assetProjectFilter').value);if(!project)return;
  const key=`${project.id}:asset-images`;
  if(productionBatches.has(key)){showToast('本项目的素材批次正在处理。','warning');return;}
  const assets=selectedAssetImages().filter(a=>(redo||!a.previewData)&&!assetImageBusy(a.id));
  productionBatches.add(key);closeModal();let completed=0;
  try {
    await ensureImageReady();
    for(const savedAsset of assets){
      const asset=state.assets.find(a=>a.id===savedAsset.id);
      if(!asset||assetImageBusy(asset.id)||(!redo&&asset.previewData))continue;
      $('#assetBatchStatus').textContent=`${project.title}：正在生成 ${completed+1} / ${assets.length}`;
      const task=queueTask({title:`${asset.name} · AI 素材图片`,project:project.title,kind:'image',status:'running',detail:'批量生成素材图片'});
      task.request={kind:'image',asset:structuredClone(asset),existing:true,batch:true,prompt:asset.imagePrompt||asset.subtitle||`${asset.name}，独立素材设定图`,size:asset.type==='character'?'1024x1536':asset.type==='scene'?'1536x1024':'1024x1024',references:redo&&asset.previewData?[asset.previewData]:[]};persist();renderTasks();
      await runAssetImageGeneration(task);completed++;
    }
    $('#assetBatchStatus').textContent=`${project.title}：已完成 ${completed} 项`;showToast(`素材批量生成完成，共 ${completed} 项。`);
  }catch(error){$('#assetBatchStatus').textContent=`已完成 ${completed} 项，已停止：${error.message}`;showToast(error.message,'warning');}
  finally{productionBatches.delete(key);renderAssets();}
}
async function downloadAssetImages(button) {
  const assets=selectedAssetImages().filter(a=>a.previewData);
  if(!assets.length){showToast('当前筛选没有可下载的图片。','warning');return;}
  button.disabled=true;
  try {
    const response=await fetch('/api/images/archive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({images:assets.map(a=>({name:a.name,url:a.previewData}))})});
    if(!response.ok){const error=await response.json();throw new Error(error.error||'打包下载失败。');}
    const blob=await response.blob();downloadProduction(blob,'素材图片.zip','application/zip');showToast(`已打包 ${assets.length} 张图片。`);
  }catch(error){showToast(error.message,'warning');}
  finally{if(button.isConnected)button.disabled=false;}
}
function shotVideoTask(projectId,episode,shotId) {
  return state.tasks.find(t=>t.request?.kind==='video'&&t.request.projectId===projectId&&t.request.episode===episode&&t.request.shotId===shotId);
}
function shotVideoMarkup(project,shot) {
  const task=shotVideoTask(project.id,activeEpisode,shot.id), busy=task&&['queued','running'].includes(task.status);
  return `<button data-action="shot-video" data-id="${escapeHTML(shot.id)}" ${busy?'disabled':''}>${busy?'视频生成中':task?.status==='done'?'重新生成视频':'生成镜头视频'}</button>${task?.videoUrl?`<button data-action="view-task" data-id="${escapeHTML(task.id)}">播放视频</button><a href="${escapeHTML(task.videoUrl)}" download="镜头-${escapeHTML(shot.no)}.mp4">下载视频</a>`:''}`;
}
function shotVideoPrompt(project,shot) {
  return [`统一画风：${project.visualStyle||'自然电影光线'}`,shot.title,shot.desc,`景别：${shot.lens}；运镜：${shot.move}`,`声音 / 台词：${shot.voice}`, '只生成当前镜头的一段连续视频，动作自然，保持人物、服装与场景一致，不要添加字幕、片头文字或水印。'].join('\n');
}
function shotVideoFields(project,shot) {
  const seedance=aiHealth.video?.provider!=='xiangong';
  return `${seedance?'': '<p class="form-help">ComfyUI 的时长、画幅和声音由你导入的工作流决定；此处仅替换文字提示词。</p>'}<div class="provider-field-grid"><div class="form-field"><label for="shotVideoSeconds">视频时长（秒）</label><input id="shotVideoSeconds" type="number" min="4" max="30" value="${Math.max(4,Math.min(30,Number(String(shot?.duration||'5').match(/\d+/)?.[0])||5))}" ${seedance?'':'disabled'}/></div><div class="form-field"><label for="shotVideoRatio">视频画幅</label><select id="shotVideoRatio" ${seedance?'':'disabled'}>${['16:9','9:16','1:1'].map(v=>`<option ${v===(project.videoOptions?.ratio||'16:9')?'selected':''}>${v}</option>`).join('')}</select></div><div class="form-field"><label for="shotVideoResolution">视频清晰度</label><select id="shotVideoResolution" ${seedance?'':'disabled'}>${['480p','720p','1080p'].map(v=>`<option ${v===(project.videoOptions?.resolution||'720p')?'selected':''}>${v}</option>`).join('')}</select></div></div><label class="image-reference-toggle"><input id="shotVideoAudio" type="checkbox" ${project.videoOptions?.audio===false?'':'checked'} ${seedance?'':'disabled'}/>生成声音与台词</label><label class="image-reference-toggle"><input id="shotVideoFirstFrame" type="checkbox" ${seedance&&(!shot||shot.imageUrl)?'checked':''} ${!seedance||(shot&&!shot.imageUrl)?'disabled':''}/>使用镜头配图作为首帧</label><p class="form-help">提示词${seedance?'和勾选的首帧图片':''}将发送给${escapeHTML(aiHealth.video?.label||'视频服务')}，按服务商规则计费；本入口不合成整集成片。</p>`;
}
async function shotVideoModal(id) {
  try {await refreshAiHealth();}catch(error){showToast(error.message,'warning');return;}
  if(!aiHealth.video?.available){openServiceSettings();return;}
  const project=projectById(state.activeProject),shot=currentShots().find(s=>s.id===id);if(!project||!shot)return;
  openModal({title:`镜头 ${shot.no} · 视频生成`,subtitle:'先确认镜头动作、配图和台词，再提交视频任务。',wide:true,
    body:`<form id="shotVideoForm">${shot.imageUrl?`<img class="generated-asset-image" src="${escapeHTML(shot.imageUrl)}" alt="视频首帧配图"/>`:''}<div class="form-field"><label for="shotVideoPrompt">视频提示词</label><textarea id="shotVideoPrompt" maxlength="20000" required>${escapeHTML(shotVideoPrompt(project,shot))}</textarea></div>${shotVideoFields(project,shot)}<p id="shotVideoStatus" role="status" class="form-status"></p></form>`,
    footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="submit-shot-video" data-id="${id}">提交镜头视频</button>`});
  $('#shotVideoForm').dataset.projectId=project.id;$('#shotVideoForm').dataset.episode=activeEpisode;
}
function readShotVideoOptions(project) {
  const options={ratio:$('#shotVideoRatio').value,resolution:$('#shotVideoResolution').value,audio:$('#shotVideoAudio').checked};
  project.videoOptions=options;persist();return options;
}
async function createShotVideo(project,episode,shot,{options,firstFrame,prompt,seconds,provider}) {
  const prior=shotVideoTask(project.id,episode,shot.id);
  if(prior&&['queued','running'].includes(prior.status))throw new Error('此镜头的视频任务正在生成，请等待完成。');
  const task=queueTask({title:`${project.title} · EP ${episode} 镜头 ${shot.no} 视频`,project:project.title,kind:'video',status:'running',detail:'正在提交镜头视频'});
  task.request={kind:'video',projectId:project.id,episode,shotId:shot.id,prompt:prompt||shotVideoPrompt(project,shot),seconds:String(seconds||Math.max(4,Math.min(30,Number(String(shot.duration).match(/\d+/)?.[0])||5))),provider,firstFrame:firstFrame&&shot.imageUrl?shot.imageUrl:undefined,...options};persist();renderStoryboard();renderTasks();
  try {await submitVideoTask(task);await refreshVideoTask(task);if(task.status==='failed')throw new Error(task.detail);return task;}
  catch(error){task.status='failed';task.detail=error.message;persist();renderTasks();throw error;}
  finally{renderStoryboard();}
}
async function submitShotVideo(id,button) {
  const form=$('#shotVideoForm');if(!form?.reportValidity()||button.disabled)return;
  const project=projectById(form.dataset.projectId),episode=Number(form.dataset.episode),shot=currentShots(project?.id,episode).find(s=>s.id===id);if(!project||!shot)return;
  button.disabled=true;
  const options=readShotVideoOptions(project),firstFrame=$('#shotVideoFirstFrame').checked,prompt=$('#shotVideoPrompt').value.trim(),seconds=$('#shotVideoSeconds').value,provider=aiHealth.video.provider;
  try {await createShotVideo(project,episode,shot,{options,firstFrame,prompt,seconds,provider});if(form.isConnected)closeModal();showToast('镜头视频任务已提交，可在生成任务中查看。');}
  catch(error){if(form.isConnected)$('#shotVideoStatus').textContent=error.message;showToast(error.message,'warning');}
  finally{if(button.isConnected)button.disabled=false;}
}
async function batchShotVideoModal() {
  try {await refreshAiHealth();}catch(error){showToast(error.message,'warning');return;}
  if(!aiHealth.video?.available){openServiceSettings();return;}
  const project=projectById(state.activeProject),episode=activeEpisode;if(!project)return;
  const shots=currentShots(project.id,episode).filter(s=>!['done','queued','running'].includes(shotVideoTask(project.id,episode,s.id)?.status));
  if(!shots.length){showToast('当前分集没有待提交的镜头视频。');return;}
  openModal({title:'逐镜生成本集视频',subtitle:'保留已完成和正在生成的镜头，只提交缺少或失败的镜头。',
    body:`<form id="batchShotVideoForm"><p>将逐项提交 ${shots.length} 个视频任务，每镜按分镜时长（Seedance 限 4–30 秒）生成；失败后停止提交，已提交任务继续执行。</p>${shotVideoFields(project).replace(/<div class="form-field"><label for="shotVideoSeconds">[\s\S]*?<\/div>/,'')}<p class="form-help">批量使用每镜自己的时长。有配图的镜头可用首帧，无配图的镜头使用文字生成。</p></form>`,
    footer:'<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="start-shot-video-batch">提交这些视频</button>'});
  $('#batchShotVideoForm').dataset.projectId=project.id;$('#batchShotVideoForm').dataset.episode=episode;
}
async function runShotVideoBatch() {
  const form=$('#batchShotVideoForm');if(!form)return;
  const project=projectById(form.dataset.projectId),episode=Number(form.dataset.episode);if(!project)return;
  const key=`${project.id}:${episode}:shot-videos`;if(productionBatches.has(key)){showToast('该视频批次正在提交。','warning');return;}
  const options=readShotVideoOptions(project),firstFrame=$('#shotVideoFirstFrame').checked,provider=aiHealth.video.provider;
  const shots=currentShots(project.id,episode).filter(s=>!['done','queued','running'].includes(shotVideoTask(project.id,episode,s.id)?.status));
  productionBatches.add(key);closeModal();let count=0;
  try{for(const shot of shots){if(!currentShots(project.id,episode).some(s=>s.id===shot.id))continue;const prior=shotVideoTask(project.id,episode,shot.id);if(prior&&['done','queued','running'].includes(prior.status))continue;await createShotVideo(project,episode,shot,{options,firstFrame,provider});count++;}showToast(`已提交 ${count} 个镜头视频任务。`);}
  catch(error){showToast(`已提交 ${count} 项，停止提交：${error.message}`,'warning');}
  finally{productionBatches.delete(key);renderStoryboard();}
}

function projectAssets(project) {
  return state.assets.filter(asset => asset.projectId ? asset.projectId === project?.id : asset.project === project?.title);
}
function episodeText(project, episode = activeEpisode) {
  return project?.episodeScripts?.[episode] || project?.sourceText || project?.generatedStory || project?.description || '';
}
function renderProductionWorkflow(project, shots) {
  const assets = projectAssets(project);
  const images = shots.filter(shot => shot.imageUrl).length;
  $('#productionWorkflow').innerHTML = `
    <button data-action="episode-script"><span>01 · 剧本</span><b>编辑第 ${activeEpisode} 集</b><small>${project?.episodeScripts?.[activeEpisode] ? '本集正文已保存' : '确认正文与台词'}</small></button>
    <button data-action="project-style"><span>02 · 统一画风</span><b>${escapeHTML(project?.visualStyle || '设置全片画风')}</b><small>配图与视频共用</small></button>
    <button data-action="extract-project-assets"><span>03 · 资产</span><b>提取角色 / 场景 / 道具</b><small>${assets.length} 项项目资产</small></button>
    <button data-action="project-assets"><span>04 · 资产配图</span><b>上传或生成素材图片</b><small>${assets.filter(a=>a.previewData).length} 项有图片</small></button>
    <button data-action="batch-shot-images"><span>05 · 镜头配图</span><b>${images} / ${shots.length} 已配图</b><small>逐镜预览后生成视频</small></button>`;
  $('#shotImageProgress').textContent = `${images} / ${shots.length} 个镜头已有图片`;
}
function downloadProduction(content, filename, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const link = document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function episodeScriptModal() {
  const p=projectById(state.activeProject);if(!p)return;
  openModal({title:`${projectName(p.title)} · 第 ${activeEpisode} 集剧本`,subtitle:'保存本集正文后，分镜使用这份内容；原始导入文件仍保留。',wide:true,
    body:`<div class="form-field"><label for="episodeScript">本集剧本与逐字台词</label><textarea id="episodeScript" class="script-editor" maxlength="30000">${escapeHTML(episodeText(p))}</textarea></div><p id="episodeScriptStatus" role="status" class="form-status"></p>`,
    footer:'<button class="outline-button" data-action="generate-episode-script">AI 生成本集正文</button><button class="outline-button" data-action="download-episode-script">下载剧本</button><button class="primary-button" data-action="save-episode-script">保存本集</button>'});
  $('#episodeScript').dataset.projectId=p.id;$('#episodeScript').dataset.episode=activeEpisode;
}
async function generateEpisodeScript(button) {
  const field=$('#episodeScript');if(!field || button.disabled)return;
  const p=projectById(field.dataset.projectId);const episode=Number(field.dataset.episode);if(!p)return;
  if(state.tasks.some(t=>t.request?.kind==='episode'&&t.request.projectId===p.id&&t.request.episode===episode&&t.status==='running')){showToast('本集正文正在生成，请在任务中查看。','warning');return;}
  const previous=p.episodeScripts?.[episode-1]||'无';
  const input=[`故事总览：${p.generatedStory||p.sourceText||p.description}`,`第 ${episode} / ${p.episodes} 集，约 ${p.episodeLength||2} 分钟`,`前集正文：${previous}`,`本集大纲或当前草稿：${field.value}`].join('\n');
  button.disabled=true;
  const task=queueTask({title:`${p.title} · EP ${episode} 剧本正文`,project:p.title,kind:'script',status:'running',detail:'正在生成本集正文'});
  task.request={kind:'episode',projectId:p.id,episode,prompt:input};persist();
  try {
    await ensureAiReady();
    const result=await apiRequest('/api/generate',{kind:'episode',text:input,episode});
    p.episodeScripts||={};p.episodeScripts[episode]=result.text;
    task.status='done';task.progress=100;task.detail='本集正文已保存';task.textResult=result.text;persist();renderEverything();
    if(field.isConnected){field.value=result.text;$('#episodeScriptStatus').textContent='本集正文已生成并保存。';}
    showToast('本集剧本已生成并保存。');
  } catch(error){task.status='failed';task.detail=error.message;persist();renderTasks();showToast(error.message,'warning');}
  finally{if(button.isConnected)button.disabled=false;}
}
function projectStyleModal() {
  const p=projectById(state.activeProject);if(!p)return;
  openModal({title:'统一画风',subtitle:'作为本项目的分镜、素材配图、镜头配图和视频提示。',
    body:`<div class="style-preset-grid">${Object.entries(stylePresets).map(([id,text])=>`<button class="outline-button" data-action="style-preset" data-id="${id}">${escapeHTML(text.split('，')[0])}</button>`).join('')}</div><div class="form-field"><label for="projectStyle">画风、光线、色彩与构图</label><textarea id="projectStyle" maxlength="800" placeholder="例如：写实电影，冷色雨夜，暖色室内，自然光，16:9">${escapeHTML(p.visualStyle||'')}</textarea></div>`,
    footer:'<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="save-project-style">保存画风</button>'});
  $('#projectStyle').dataset.projectId=p.id;
}
async function extractProjectAssets(button) {
  const p=projectById(state.activeProject);if(!p || button.disabled)return;
  if(state.tasks.some(t=>t.request?.kind==='assets'&&t.request.projectId===p.id&&t.status==='running')){showToast('项目资产正在提取，请在任务中查看。','warning');return;}
  button.disabled=true;
  const text=`统一画风：${p.visualStyle||'按剧本设定'}\n项目剧本：${episodeText(p)}`;
  const task=queueTask({title:`${p.title} · 剧本资产提取`,project:p.title,kind:'script',status:'running',detail:'正在识别角色、场景与道具'});
  task.request={kind:'assets',projectId:p.id,prompt:text};persist();
  try {
    await ensureAiReady();
    const result=await apiRequest('/api/generate',{kind:'assets',text});
    const existing=projectAssets(p);const additions=[];
    for(const asset of result.assets){
      if([...existing,...additions].some(item=>item.type===asset.type&&item.name===asset.name.trim()))continue;
      additions.push({id:createId('a'),projectId:p.id,project:p.title,name:asset.name.trim(),type:asset.type,subtitle:asset.description,imagePrompt:asset.description,status:'待配图',look:({character:'character-a',scene:'scene-a',prop:'prop-a'})[asset.type]});
    }
    const before=state.assets;state.assets=[...state.assets,...additions];if(!persist()){state.assets=before;throw new Error('浏览器存储空间不足，请先导出项目数据。');}
    task.status='done';task.progress=100;task.detail=`已新增 ${additions.length} 项资产，已存在的同名资产保留`;persist();renderEverything();
    $('#assetProjectFilter').value=p.id;state.assetProjectFilter=p.id;persist();switchView('assets');revealSavedAsset();showToast(task.detail);
  } catch(error){task.status='failed';task.detail=error.message;persist();renderTasks();showToast(error.message,'warning');}
  finally{if(button.isConnected)button.disabled=false;}
}
function shotImageBusy(projectId,episode,shotId) {
  return state.tasks.some(task=>task.request?.kind==='shot-image'&&task.request.projectId===projectId&&task.request.episode===episode&&task.request.shotId===shotId&&task.status==='running');
}
function shotImagePrompt(project,shot) {
  const assets=state.assets.filter(asset=>(shot.assetIds||[]).includes(asset.id));
  return [`统一画风：${project.visualStyle||'电影感，清晰构图，自然光线'}`,`镜头：${shot.title}`,shot.desc,`景别：${shot.lens}；运镜：${shot.move}`,assets.length?`资产设定：\n${assets.map(asset=>`${asset.name}：${asset.imagePrompt||asset.subtitle}`).join('\n')}`:'', '仅生成当前镜头的单幅画面，不要文字、水印或多格拼图。'].filter(Boolean).join('\n');
}
function shotImageModal(id) {
  const p=projectById(state.activeProject);const shot=currentShots().find(s=>s.id===id);if(!p||!shot)return;
  openModal({title:`镜头 ${shot.no} · 配图`,subtitle:'按统一画风生成；可把已引用的素材图片发送给图片模型作为视觉参考。',wide:true,
    body:`${shot.imageUrl?`<img class="generated-asset-image" src="${escapeHTML(shot.imageUrl)}" alt="当前镜头配图" />`:''}<div class="form-field"><label for="shotImagePrompt">配图提示词</label><textarea id="shotImagePrompt" maxlength="4000">${escapeHTML(shot.imagePrompt||shotImagePrompt(p,shot))}</textarea></div>${shotImageReferencesMarkup(p,shot)}<p id="shotImageStatus" class="form-status" role="status"></p>`,
    footer:`<button class="outline-button" data-action="upload-shot-image" data-id="${id}">上传配图</button>${shot.imageUrl?`<a class="outline-button" href="${escapeHTML(shot.imageUrl)}" download="镜头-${shot.no}.png">下载配图</a>`:''}<button class="primary-button" data-action="submit-shot-image" data-id="${id}">生成配图</button>`});
  $('#shotImagePrompt').dataset.projectId=p.id;$('#shotImagePrompt').dataset.episode=activeEpisode;
}
async function runShotImageTask(task) {
  const request=task.request;
  try {
    const result=await apiRequest('/api/images/generate',{prompt:request.prompt,size:'1536x1024',references:request.references||[]});
    const shot=currentShots(request.projectId,request.episode).find(s=>s.id===request.shotId);
    if(shot){shot.imageUrl=result.url;shot.imagePrompt=request.prompt;}
    task.imageUrl=result.url;task.status='done';task.progress=100;task.detail=shot?'镜头配图已保存':'配图已生成；原镜头已移除，可在任务中下载';
    if(!persist())throw new Error('图片已生成，但浏览器存储失败；请在任务详情下载图片。');
    renderStoryboard();renderTasks();
  } catch(error){task.status='failed';task.progress=0;task.detail=error.message;persist();renderStoryboard();renderTasks();throw error;}
}
async function generateShotImage(id,button) {
  const field=$('#shotImagePrompt');if(!field||button.disabled)return;
  const projectId=field.dataset.projectId;const episode=Number(field.dataset.episode);const p=projectById(projectId);
  const shot=currentShots(projectId,episode).find(s=>s.id===id);const prompt=field.value.trim();
  if(!p||!shot||!prompt){showToast('请先填写配图提示词。','warning');return;}
  if(shotImageBusy(projectId,episode,id)){showToast('此镜头已有配图正在生成。','warning');return;}
  const references=$$('.shot-image-references input:checked').map(input=>input.value);
  if(references.length>8){showToast('最多选择 8 张参考图片。','warning');return;}
  button.disabled=true;
  try {
    await ensureImageReady();
    const task=queueTask({title:`${p.title} · EP ${episode} 镜头 ${shot.no} 配图`,project:p.title,kind:'image',status:'running',detail:'正在生成镜头配图'});
    task.request={kind:'shot-image',projectId,episode,shotId:id,prompt,references};persist();renderStoryboard();
    if(field.isConnected)$('#shotImageStatus').textContent='正在生成，关闭窗口也会继续。';
    await runShotImageTask(task);if(field.isConnected)closeModal();showToast('镜头配图已生成并保存。');
  } catch(error){if(field.isConnected)$('#shotImageStatus').textContent=error.message;showToast(error.message,'warning');}
  finally{if(button.isConnected)button.disabled=false;}
}
function shotAssetsModal(id) {
  const p=projectById(state.activeProject);const shot=currentShots().find(s=>s.id===id);if(!p||!shot)return;
  const assets=projectAssets(p);
  openModal({title:`镜头 ${shot.no} · 引用资产`,subtitle:'选定资产的文字加入提示词；有图片的资产可用于视觉参考，也可直接用作配图。',
    body:`<div class="shot-asset-options">${assets.map(a=>`<label><input type="checkbox" value="${escapeHTML(a.id)}" ${(shot.assetIds||[]).includes(a.id)?'checked':''} />${a.previewData?`<img src="${escapeHTML(a.previewData)}" alt="" />`:''}<span>${escapeHTML(a.name)}</span></label>`).join('')||'<p>当前项目尚无资产，请先提取或上传。</p>'}</div><div class="form-field"><label for="shotExistingImage">使用素材图片作为本镜配图</label><select id="shotExistingImage"><option value="">保持当前配图</option>${assets.filter(a=>a.previewData).map(a=>`<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('')}</select></div>`,
    footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="save-shot-assets" data-id="${id}">保存引用</button>`});
  $('#shotExistingImage').dataset.projectId=p.id;$('#shotExistingImage').dataset.episode=activeEpisode;
}
function productionBatchModal(kind) {
  const p=projectById(state.activeProject);if(!p)return;
  const pending=kind==='images'?currentShots().filter(s=>!s.imageUrl&&!shotImageBusy(p.id,activeEpisode,s.id)):Array.from({length:p.episodes},(_,i)=>i+1).filter(e=>!currentShots(p.id,e).length);
  if(!pending.length){showToast(kind==='images'?'当前分集的镜头都有配图，或正在生成。':'所有分集都已有分镜。');return;}
  openModal({title:kind==='images'?'批量生成缺少的镜头配图':'批量生成缺少的分集分镜',subtitle:'逐个提交；已完成的内容保留。遇到失败停止，可再次提交剩余内容。',
    body:`<p>将提交 ${pending.length} 次${kind==='images'?'图片':'文本'}生成请求，按所配置服务商规则计费。</p>`,
    footer:`<button class="outline-button" data-action="close-modal">取消</button><button class="primary-button" data-action="start-production-batch" data-id="${kind}">开始生成 ${pending.length} 项</button>`});
}
async function runProductionBatch(kind) {
  const p=projectById(state.activeProject);const episode=activeEpisode;if(!p)return;
  const key=`${p.id}:${kind}:${kind==='images'?episode:'all'}`;
  if(productionBatches.has(key)){showToast('该批次正在处理。','warning');return;}
  productionBatches.add(key);closeModal();
  try {
    if(kind==='images'){
      await ensureImageReady();
      const pending=currentShots(p.id,episode).filter(s=>!s.imageUrl&&!shotImageBusy(p.id,episode,s.id));
      for(const shot of pending){
        if(!currentShots(p.id,episode).some(s=>s.id===shot.id)||shot.imageUrl||shotImageBusy(p.id,episode,shot.id))continue;
        const task=queueTask({title:`${p.title} · EP ${episode} 镜头 ${shot.no} 配图`,project:p.title,kind:'image',status:'running',detail:'正在生成镜头配图'});
        task.request={kind:'shot-image',projectId:p.id,episode,shotId:shot.id,prompt:shotImagePrompt(p,shot),references:shotReferenceImages(p,shot)};persist();renderStoryboard();
        await runShotImageTask(task);
      }
    }else{
      await ensureAiReady();
      for(let e=1;e<=p.episodes;e++){
        if(currentShots(p.id,e).length)continue;
        const task=queueTask({title:`${p.title} · EP ${e} AI 分镜`,project:p.title,kind:'storyboard',status:'running'});
        await runStoryboardGeneration(p,task,e,state.storyboardPreset,state.storyboardPresetNote||'');
        if(task.status==='failed')throw new Error(task.detail);
      }
    }
    showToast('批量生成已完成。');
  }catch(error){showToast(`批量生成已停止：${error.message}`,'warning');}
  finally{productionBatches.delete(key);renderStoryboard();}
}
function duplicateProjectData(project) {
  const clone={...structuredClone(project),id:createId('p'),title:`${project.title}（副本）`,updated:'刚刚复制',updatedAt:new Date().toISOString()};
  const assetMap=new Map();
  for(const asset of projectAssets(project)){const id=createId('a');assetMap.set(asset.id,id);state.assets.push({...structuredClone(asset),id,projectId:clone.id,project:clone.title});}
  for(const [key,shots] of Object.entries(state.storyboards))if(key.startsWith(`${project.id}:`))state.storyboards[`${clone.id}:${key.slice(project.id.length+1)}`]=shots.map(shot=>({...structuredClone(shot),id:createId('s'),assetIds:(shot.assetIds||[]).map(id=>assetMap.get(id)).filter(Boolean)}));
  const nodeMap=new Map();
  for(const node of state.nodes.filter(n=>(n.projectId||'p1')===project.id)){const id=createId('n');nodeMap.set(node.id,id);state.nodes.push({...structuredClone(node),id,projectId:clone.id,assetId:assetMap.get(node.assetId)});}
  for(const edge of [...(state.connections||[])])if(nodeMap.has(edge.from)&&nodeMap.has(edge.to))state.connections.push({from:nodeMap.get(edge.from),to:nodeMap.get(edge.to),projectId:clone.id});
  state.projects.unshift(clone);persist();closeDrawer();renderEverything();showToast('项目、分镜、素材与画布均已复制。');
}
function enrichCanvas() {
  const nodes=state.nodes.filter(n=>(n.projectId||'p1')===state.activeProject);
  const shown=$$('.canvas-node');
  shown.forEach((element,index)=>{
    const node=nodes[index];if(!node)return;
    element.style.left=`${node.x??(40+(index%3)*280)}px`;element.style.top=`${node.y??(40+Math.floor(index/3)*200)}px`;
    $('.canvas-node-image',element)?.remove();
    if(node.imageUrl)$('.node-body',element).insertAdjacentHTML('beforeend',`<img class="canvas-node-image" src="${escapeHTML(node.imageUrl)}" alt="${escapeHTML(node.title)}" />`);
  });
  const positions=new Map(nodes.map((node,i)=>[node.id,{x:node.x??(40+(i%3)*280),y:node.y??(40+Math.floor(i/3)*200)}]));
  $('.connector-layer').innerHTML=(state.connections||[]).filter(e=>positions.has(e.from)&&positions.has(e.to)).map(edge=>{
    const from=positions.get(edge.from);const to=positions.get(edge.to);
    return `<path d="M${from.x+210} ${from.y+65} C${from.x+270} ${from.y+65},${to.x-60} ${to.y+65},${to.x} ${to.y+65}" />`;
  }).join('');
}
function addAssetToCanvas(id) {
  const a=state.assets.find(asset=>asset.id===id);if(!a)return;
  const p=projectById(a.projectId)||state.projects.find(p=>p.title===a.project)||projectById(state.activeProject);if(!p)return;
  state.activeProject=p.id;state.nodes.push({id:createId('n'),projectId:p.id,assetId:a.id,kind:'asset',label:'素材资产',title:a.name,text:a.subtitle||'',imageUrl:a.previewData,area:'asset'});persist();switchView('canvas');
}
function workflowAction(action,id,target) {
  switch(action){
    case 'project-assets':$('#assetProjectFilter').value=state.activeProject;state.assetProjectFilter=state.activeProject;persist();switchView('assets');return true;
    case 'shot-video':shotVideoModal(id);return true;
    case 'submit-shot-video':submitShotVideo(id,target);return true;
    case 'batch-shot-videos':batchShotVideoModal();return true;
    case 'start-shot-video-batch':runShotVideoBatch();return true;
    case 'batch-asset-images':assetBatchModal(false);return true;
    case 'redo-asset-images':assetBatchModal(true);return true;
    case 'start-asset-batch':runAssetBatch(id==='redo');return true;
    case 'download-asset-images':downloadAssetImages(target);return true;
    case 'restore-asset-image':restoreAssetImage(id,target);return true;
    case 'style-preset':$('#projectStyle').value=stylePresets[id];return true;
    case 'episode-script':episodeScriptModal();return true;
    case 'generate-episode-script':generateEpisodeScript(target);return true;
    case 'save-episode-script':{const field=$('#episodeScript');const p=projectById(field?.dataset.projectId);if(p){p.episodeScripts||={};p.episodeScripts[field.dataset.episode]=field.value;persist();closeModal();renderStoryboard();showToast('本集剧本已保存。');}return true;}
    case 'download-episode-script':downloadProduction($('#episodeScript').value,'分集剧本.txt');return true;
    case 'project-style':projectStyleModal();return true;
    case 'save-project-style':{const field=$('#projectStyle');const p=projectById(field?.dataset.projectId);if(p){p.visualStyle=field.value.trim();persist();closeModal();renderStoryboard();}return true;}
    case 'extract-project-assets':extractProjectAssets(target);return true;
    case 'shot-image':shotImageModal(id);return true;
    case 'submit-shot-image':generateShotImage(id,target);return true;
    case 'shot-assets':shotAssetsModal(id);return true;
    case 'save-shot-assets':{const field=$('#shotExistingImage');const shot=currentShots(field.dataset.projectId,Number(field.dataset.episode)).find(s=>s.id===id);if(shot){shot.assetIds=$$('.shot-asset-options input:checked').map(input=>input.value);const asset=state.assets.find(a=>a.id===field.value);if(asset?.previewData)shot.imageUrl=asset.previewData;persist();closeModal();renderStoryboard();}return true;}
    case 'upload-shot-image':{const field=$('#shotImagePrompt');pendingShotUpload={projectId:field.dataset.projectId,episode:Number(field.dataset.episode),shotId:id};$('#shotImageFile').click();return true;}
    case 'batch-shot-images':productionBatchModal('images');return true;
    case 'batch-storyboards':productionBatchModal('storyboards');return true;
    case 'start-production-batch':runProductionBatch(id);return true;
    case 'export-storyboard':downloadProduction(JSON.stringify({project:projectById(state.activeProject)?.title,episode:activeEpisode,shots:currentShots()},null,2),'分镜.json','application/json');return true;
    case 'duplicate-project':{const p=projectById(id||activeDrawerAction);if(p)duplicateProjectData(p);return true;}
    case 'asset-to-canvas':addAssetToCanvas(id);return true;
    case 'canvas-fit':zoom=Math.max(20,Math.floor(Math.min($('#canvasBoard').clientWidth/1100,$('#canvasBoard').clientHeight/560,1)*100));renderCanvas();return true;
    case 'canvas-select':canvasConnectionFrom=null;$$('.canvas-tool').forEach(el=>el.classList.toggle('active',el.dataset.action==='canvas-select'));return true;
    case 'canvas-connect':canvasConnectionFrom='';$$('.canvas-tool').forEach(el=>el.classList.toggle('active',el.dataset.action==='canvas-connect'));showToast('依次点击两个节点，建立连接。');return true;
    case 'select-node':if(canvasConnectionFrom!==null){if(!canvasConnectionFrom){canvasConnectionFrom=id;showToast('请选择目标节点。');}else if(id!==canvasConnectionFrom){state.connections||=[];if(!state.connections.some(e=>e.from===canvasConnectionFrom&&e.to===id))state.connections.push({from:canvasConnectionFrom,to:id,projectId:state.activeProject});canvasConnectionFrom='';persist();renderCanvas();showToast('节点已连接。');}return true;}return false;
    default:return false;
  }
}
document.addEventListener('change',async event=>{
  if(event.target.id==='assetProjectFilter'){state.assetProjectFilter=event.target.value;persist();renderAssets();return;}
  if(event.target.id!=='shotImageFile')return;
  const file=event.target.files?.[0];const ref=pendingShotUpload;event.target.value='';if(!file||!ref)return;
  try{const result=await apiRequest('/api/images/upload',{dataUrl:await readAssetImageFile(file)});const shot=currentShots(ref.projectId,ref.episode).find(s=>s.id===ref.shotId);if(!shot)throw new Error('原镜头已移除。');shot.imageUrl=result.url;persist();closeModal();renderStoryboard();showToast('镜头配图已上传。');}catch(error){showToast(error.message,'warning');}
});

let canvasDrag = null;
document.addEventListener('pointerdown',event=>{
  const head=event.target.closest('.node-head');
  if(!head || event.target.closest('button') || event.button!==0 || canvasConnectionFrom!==null)return;
  const element=head.closest('.canvas-node');const node=state.nodes.find(n=>n.id===element.dataset.id);if(!node)return;
  const scale=element.getBoundingClientRect().width/element.offsetWidth;
  canvasDrag={node,element,startX:event.clientX,startY:event.clientY,x:parseFloat(element.style.left)||0,y:parseFloat(element.style.top)||0,scale};
  element.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
  if(!canvasDrag)return;
  const {node,element,startX,startY,x,y,scale}=canvasDrag;
  node.x=Math.max(0,Math.min(880,Math.round(x+(event.clientX-startX)/scale)));
  node.y=Math.max(0,Math.min(400,Math.round(y+(event.clientY-startY)/scale)));
  element.style.left=`${node.x}px`;element.style.top=`${node.y}px`;
});
function finishCanvasDrag(){if(!canvasDrag)return;canvasDrag=null;persist();enrichCanvas();}
document.addEventListener('pointerup',finishCanvasDrag);
document.addEventListener('pointercancel',finishCanvasDrag);
