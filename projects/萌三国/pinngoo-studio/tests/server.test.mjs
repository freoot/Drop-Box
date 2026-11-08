import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createAppServer } from '../server.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcIoAAAAASUVORK5CYII=';
const postJson = (base,path,body) => fetch(`${base}${path}`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify(body) });

async function withServer(options, run) {
  const server = createAppServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('without a key the service reports disconnected and never calls upstream', async () => {
  let calls = 0;
  await withServer({ env: {}, fetchImpl: async () => { calls += 1; throw new Error('unexpected'); } }, async (base) => {
    const health = await fetch(`${base}/api/health`).then((response) => response.json());
    assert.equal(health.configured, false);
    const response = await fetch(`${base}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'story', text: '雨夜来信' }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /AI 服务设置/);
  });
  assert.equal(calls, 0);
});

test('test mode keeps its displayed model independent of saved settings', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'pinngoo-test-mode-'));
  try {
    await withServer({
      env: { PINNGOO_AI_TEST_MODE: '1', OPENAI_MODEL: 'kimi-k2.6' }, stateDir,
      fetchImpl: async () => { throw new Error('test mode should not call upstream'); },
    }, async (base) => {
      const health = await fetch(`${base}/api/health`).then(response => response.json());
      const settings = await fetch(`${base}/api/ai-settings`).then(response => response.json());
      assert.equal(health.textModel, settings.model);
      assert.equal(health.textModel, 'gpt-5-mini');
    });
  } finally { await rm(stateDir, { recursive: true, force: true }); }
});

test('story generation uses the Responses API and keeps the key out of browser output', async () => {
  const calls = [];
  const secret = 'sk-test-never-return-this';
  await withServer({
    env: { OPENAI_API_KEY: secret, OPENAI_MODEL: 'gpt-5-mini' },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '人物：沈知遥\n主线：追查来信来源。' }] }] }), { status: 200 });
    },
  }, async (base) => {
    const response = await fetch(`${base}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'story', title: '雾中来信', mode: 'idea', episodes: 3, minutes: 2, text: '女孩收到来自未来的信。' }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.text, /沈知遥/);
    assert.equal(JSON.stringify(result).includes(secret), false);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].init.headers.authorization, `Bearer ${secret}`);
  const request = JSON.parse(calls[0].init.body);
  assert.equal(request.model, 'gpt-5-mini');
  assert.match(request.input, /规划集数：3/);
  assert.match(request.input, /女孩收到来自未来的信/);
});

test('custom compatible API settings stay private and changing hosts never reuses the old key', async () => {
  const calls = [];
  const stateDir = await mkdtemp(join(tmpdir(), 'pinngoo-text-ai-'));
  try {
    await withServer({
      env:{ OPENAI_API_KEY:'official-key', OPENAI_MODEL:'gpt-5-mini' }, stateDir,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url:String(url), init });
        if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data:[{ id:'gpt-5-mini' }] }), { status:200 });
        return new Response(JSON.stringify({ output:[{ content:[{ type:'output_text', text:'自定义接口生成结果' }] }] }), { status:200 });
      },
    }, async (base) => {
      const changedHost = await fetch(`${base}/api/ai-settings`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ baseUrl:'https://gpt.gptzzz.xyz/v1', apiKey:'', model:'gpt-5-mini' }) }).then(response => response.json());
      assert.equal(changedHost.configured, false);
      const missingKey = await fetch(`${base}/api/generate`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ kind:'story', text:'测试' }) });
      assert.equal(missingKey.status, 503);
      assert.equal(calls.length, 0);

      const saved = await fetch(`${base}/api/ai-settings`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ baseUrl:'https://gpt.gptzzz.xyz/v1', apiKey:'custom-secret', model:'gpt-5-mini' }) }).then(response => response.json());
      assert.equal(saved.apiKeyConfigured, true);
      assert.equal(JSON.stringify(saved).includes('custom-secret'), false);
      const checked = await fetch(`${base}/api/check`, { method:'POST', headers:{ 'content-type':'application/json' }, body:'{}' }).then(response => response.json());
      assert.equal(checked.text.status, 'reachable');
      const generated = await fetch(`${base}/api/generate`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ kind:'story', text:'自定义入口测试' }) }).then(response => response.json());
      assert.match(generated.text, /自定义接口/);
    });
  } finally { await rm(stateDir, { recursive:true, force:true }); }
  assert.deepEqual(calls.map(call => call.url), ['https://gpt.gptzzz.xyz/v1/models','https://gpt.gptzzz.xyz/v1/responses']);
  assert.equal(calls.every(call => call.init.headers.authorization === 'Bearer custom-secret'), true);
});

test('storyboard generation requests a strict schema and returns validated shots', async () => {
  let requestBody;
  await withServer({
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ shots: [{ title: '雨夜开场', desc: '雨水落在窗台。', voice: '雨声', lens: '远景', move: '推镜', duration: '5 秒' }] }) }] }] }), { status: 200 });
    },
  }, async (base) => {
    const response = await fetch(`${base}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'storyboard', text: '项目：雨夜来信' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).shots[0].title, '雨夜开场');
  });
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.text.format.schema.properties.shots.type, 'array');
});

test('Kimi uses Chat Completions for stories and JSON mode for storyboards', async () => {
  const calls = [];
  await withServer({
    env: { OPENAI_BASE_URL:'https://api.moonshot.cn/v1', OPENAI_API_KEY:'kimi-test-secret', OPENAI_MODEL:'kimi-k2.6' },
    fetchImpl: async (url, init) => {
      calls.push({ url:String(url), init });
      const body = JSON.parse(init.body);
      const content = body.response_format ? JSON.stringify({ shots:[{ title:'雨夜', desc:'邮差走进邮局。', voice:'雨声', lens:'全景', move:'推镜', duration:'5 秒' }] }) : '故事核心：未来的来信改变了邮差的选择。';
      return new Response(JSON.stringify({ choices:[{ message:{ role:'assistant', content }, finish_reason:'stop' }] }), { status:200 });
    },
  }, async (base) => {
    const story = await fetch(`${base}/api/generate`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ kind:'story', text:'雨夜来信', title:'邮差', episodes:2 }) });
    assert.equal(story.status, 200);
    assert.match((await story.json()).text, /未来的来信/);
    const storyboard = await fetch(`${base}/api/generate`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ kind:'storyboard', text:'邮差收到来信。' }) });
    assert.equal(storyboard.status, 200);
    assert.equal((await storyboard.json()).shots[0].title, '雨夜');
  });
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.url === 'https://api.moonshot.cn/v1/chat/completions'), true);
  assert.equal(calls.every(call => call.init.headers.authorization === 'Bearer kimi-test-secret'), true);
  const storyRequest = JSON.parse(calls[0].init.body);
  assert.equal(storyRequest.model, 'kimi-k2.6');
  assert.deepEqual(storyRequest.thinking, { type:'disabled' });
  assert.match(storyRequest.messages[1].content, /规划集数：2/);
  const shotRequest = JSON.parse(calls[1].init.body);
  assert.deepEqual(shotRequest.response_format, { type:'json_object' });
  assert.deepEqual(shotRequest.thinking, { type:'disabled' });
  assert.match(shotRequest.messages[0].content, /只返回一个 JSON 对象/);
});

test('Seedance settings stay private and jobs create, poll, and proxy video', async () => {
  const calls = [];
  const stateDir = await mkdtemp(join(tmpdir(), 'pinngoo-seedance-'));
  try {
    await withServer({
      env: {}, stateDir,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url:String(url), init });
        if (String(url).endsWith('/contents/generations/tasks')) return new Response(JSON.stringify({ id:'cgt_123' }), { status:200 });
        if (String(url).endsWith('/cgt_123')) return new Response(JSON.stringify({ id:'cgt_123', status:'succeeded', duration:5, content:{ video_url:'https://media.volces.com/rendered.mp4' } }), { status:200 });
        return new Response(Buffer.from('fake-mp4'), { status:200, headers:{ 'content-type':'video/mp4' } });
      },
    }, async (base) => {
      const saved = await fetch(`${base}/api/video-settings`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ provider:'seedance', arkApiKey:'ark-secret', arkModel:'doubao-seedance-2-5-260628' }) }).then(response => response.json());
      assert.equal(saved.arkConfigured, true);
      assert.equal(JSON.stringify(saved).includes('ark-secret'), false);
      const created = await fetch(`${base}/api/videos`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ provider:'seedance', prompt:'竖屏雨夜短片。', seconds:5 }) });
      assert.equal(created.status, 202);
      assert.equal((await created.json()).id, 'seedance_cgt_123');
      const status = await fetch(`${base}/api/videos/seedance_cgt_123`).then(response => response.json());
      assert.equal(status.status, 'completed');
      const content = await fetch(`${base}/api/videos/seedance_cgt_123/content`);
      assert.equal(content.headers.get('content-type'), 'video/mp4');
      assert.equal(await content.text(), 'fake-mp4');
    });
  } finally { await rm(stateDir, { recursive:true, force:true }); }
  assert.equal(calls.length, 4);
  const createBody = JSON.parse(calls[0].init.body);
  assert.equal(createBody.model, 'doubao-seedance-2-5-260628');
  assert.equal(createBody.content[0].text, '竖屏雨夜短片。');
  assert.equal(createBody.ratio, '9:16');
  assert.equal(calls[0].init.headers.authorization, 'Bearer ark-secret');
});

test('Xiangong ComfyUI validates an API workflow and replaces only its prompt text', async () => {
  const calls = [];
  const stateDir = await mkdtemp(join(tmpdir(), 'pinngoo-comfy-'));
  try {
    await withServer({
      env:{}, stateDir,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url:String(url), init });
        if (String(url).endsWith('/system_stats')) return new Response(JSON.stringify({ system:{ os:'linux' }, devices:[] }), { status:200 });
        if (String(url).endsWith('/prompt')) return new Response(JSON.stringify({ prompt_id:'prompt_456', number:1, node_errors:{} }), { status:200 });
        if (String(url).includes('/history/')) return new Response(JSON.stringify({ prompt_456:{ status:{ completed:true, status_str:'success' }, outputs:{ 9:{ videos:[{ filename:'result.mp4', subfolder:'video', type:'output' }] } } } }), { status:200 });
        return new Response(Buffer.from('comfy-video'), { status:200, headers:{ 'content-type':'video/mp4' } });
      },
    }, async (base) => {
      const workflow = { 6:{ class_type:'CLIPTextEncode', inputs:{ text:'旧提示词', clip:['4',0] } }, 9:{ class_type:'SaveVideo', inputs:{ video:['8',0] } } };
      const saved = await fetch(`${base}/api/video-settings`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ provider:'xiangong', comfyUrl:'https://demo.container.x-gpu.com', comfyToken:'local-secret', workflow, promptNode:'6', promptInput:'text' }) }).then(response => response.json());
      assert.equal(saved.video.available, true);
      assert.equal(JSON.stringify(saved).includes('local-secret'), false);
      assert.equal((await fetch(`${base}/api/video-check`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ provider:'xiangong' }) })).status, 200);
      const created = await fetch(`${base}/api/videos`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ provider:'xiangong', prompt:'新的电影感提示词' }) }).then(response => response.json());
      assert.match(created.id, /^xiangong_[a-f\d]{12}_prompt_456$/);
      const status = await fetch(`${base}/api/videos/${created.id}`).then(response => response.json());
      assert.equal(status.status, 'completed');
      const content = await fetch(`${base}/api/videos/${created.id}/content`);
      assert.equal(await content.text(), 'comfy-video');
    });
  } finally { await rm(stateDir, { recursive:true, force:true }); }
  const promptCall = calls.find(call => call.url.endsWith('/prompt'));
  const submitted = JSON.parse(promptCall.init.body);
  assert.equal(submitted.prompt['6'].inputs.text, '新的电影感提示词');
  assert.deepEqual(submitted.prompt['6'].inputs.clip, ['4',0]);
  assert.equal(promptCall.init.headers.authorization, 'Bearer local-secret');
});

test('asset image uploads persist across restart and reject invalid or oversized files', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'pinngoo-image-upload-'));
  let url;
  let calls = 0;
  const options = { env:{}, stateDir, fetchImpl:async()=>{calls++;throw new Error('upload must stay local');} };
  try {
    await withServer(options, async base => {
      const uploaded = await postJson(base,'/api/images/upload',{dataUrl:`data:image/png;base64,${PNG}`});
      assert.equal(uploaded.status,201);
      url=(await uploaded.json()).url;
      assert.match(url,/^\/api\/images\/[a-f\d-]{36}\.png$/);
      const file=await fetch(`${base}${url}`);
      assert.equal(file.headers.get('content-type'),'image/png');
      assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.from(PNG,'base64'));
      for (const dataUrl of [
        'data:image/png;base64,aGVsbG8=',
        `data:image/jpeg;base64,${PNG}`,
        'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        `data:image/png;base64,${Buffer.alloc(8*1024*1024+1).toString('base64')}`,
      ]) {
        assert.equal((await postJson(base,'/api/images/upload',{dataUrl})).status,400);
      }
      assert.equal((await postJson(base,'/api/images/generate',{prompt:'旧邮局'})).status,503);
    });
    await withServer(options, async base => {
      const file=await fetch(`${base}${url}`);
      assert.equal(file.status,200);
      assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.from(PNG,'base64'));
      assert.equal((await fetch(`${base}/api/images/00000000-0000-0000-0000-000000000000.png`)).status,404);
    });
    assert.equal(calls,0);
  } finally { await rm(stateDir,{recursive:true,force:true}); }
});

test('image generation uses its own private settings and stores real image bytes', async () => {
  const stateDir=await mkdtemp(join(tmpdir(),'pinngoo-image-ai-'));
  const calls=[];
  const options={env:{OPENAI_API_KEY:'text-only-secret'},stateDir,fetchImpl:async(url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify(String(url).endsWith('/models')?{data:[{id:'gpt-image-1.5'}]}:{data:[{b64_json:PNG}]}),{status:200});
  }};
  try {
    let imageUrl;
    await withServer(options,async base=>{
      const initial=await fetch(`${base}/api/image-settings`).then(response=>response.json());
      assert.equal(initial.configured,false,'text credentials must not become image credentials');
      const saved=await postJson(base,'/api/image-settings',{baseUrl:'https://images.example/v1',apiKey:'image-only-secret',model:'gpt-image-1.5'}).then(response=>response.json());
      assert.equal(saved.configured,true);
      assert.equal(JSON.stringify(saved).includes('image-only-secret'),false);
      assert.equal((await postJson(base,'/api/image-check',{})).status,200);
      for (const body of [{prompt:''},{prompt:'x'.repeat(4001)},{prompt:'角色',size:'900x900'}]) {
        assert.equal((await postJson(base,'/api/images/generate',body)).status,400);
      }
      const response=await postJson(base,'/api/images/generate',{prompt:'绿色风衣的邮局值班员',size:'1024x1536'});
      assert.equal(response.status,201);
      const result=await response.json();imageUrl=result.url;
      assert.equal(JSON.stringify(result).includes('image-only-secret'),false);
      assert.equal(JSON.stringify(result).includes(PNG),false,'browser stores a local URL instead of base64 data');
      assert.deepEqual(Buffer.from(await fetch(`${base}${imageUrl}`).then(file=>file.arrayBuffer())),Buffer.from(PNG,'base64'));
    });
    await withServer(options,async base=>{
      assert.equal((await fetch(`${base}/api/image-settings`).then(response=>response.json())).configured,true);
      assert.equal((await fetch(`${base}${imageUrl}`)).status,200);
      const changed=await postJson(base,'/api/image-settings',{baseUrl:'https://another.example/v1'}).then(response=>response.json());
      assert.equal(changed.configured,false);
      assert.equal((await postJson(base,'/api/images/generate',{prompt:'场景'})).status,503);
    });
    assert.deepEqual(calls.map(call=>call.url),['https://images.example/v1/models','https://images.example/v1/images/generations']);
    assert.equal(calls.every(call=>call.init.headers.authorization==='Bearer image-only-secret'),true);
    const request=JSON.parse(calls[1].init.body);
    assert.equal(request.prompt,'绿色风衣的邮局值班员');
    assert.equal(request.size,'1024x1536');
    assert.equal(request.n,1);
    assert.equal(request.model,'gpt-image-1.5');
  } finally { await rm(stateDir,{recursive:true,force:true}); }
});

test('image service failures return clear errors without exposing upstream credentials', async () => {
  const stateDir=await mkdtemp(join(tmpdir(),'pinngoo-image-errors-'));
  try {
    for(const [status,payload,expected] of [[401,{error:{message:'secret'}},401],[200,{data:[{url:'https://untrusted.example/image.png'}]},502],[200,{data:[{b64_json:'aGVsbG8='}]},502]]) {
      await withServer({env:{IMAGE_API_KEY:'image-secret'},stateDir,fetchImpl:async()=>new Response(JSON.stringify(payload),{status})},async base=>{
        const response=await postJson(base,'/api/images/generate',{prompt:'角色'});
        assert.equal(response.status,expected);
        assert.equal((await response.text()).includes('image-secret'),false);
      });
    }
  } finally { await rm(stateDir,{recursive:true,force:true}); }
});

test('reference images use edit API with local bytes and reject external references', async () => {
  const stateDir=await mkdtemp(join(tmpdir(),'pinngoo-image-references-')), calls=[];
  try {
    await withServer({env:{IMAGE_API_KEY:'private-image-key'},stateDir,fetchImpl:async(url,init)=>{
      calls.push({url:String(url),body:JSON.parse(init.body)});
      return new Response(JSON.stringify({data:[{b64_json:PNG}]}));
    }},async base=>{
      const uploaded=await postJson(base,'/api/images/upload',{dataUrl:`data:image/png;base64,${PNG}`}).then(r=>r.json());
      const edited=await postJson(base,'/api/images/generate',{prompt:'保持角色面部，换为红色衣服',references:[uploaded.url,uploaded.url]});
      assert.equal(edited.status,201);
      assert.equal(calls.length,1);assert.match(calls[0].url,/\/images\/edits$/);
      assert.deepEqual(calls[0].body.images,[{image_url:`data:image/png;base64,${PNG}`}]);
      assert.equal(calls[0].body.prompt,'保持角色面部，换为红色衣服');
      for(const references of [['https://untrusted.example/a.png'],['/etc/passwd'],['/api/images/../../.env'],[42],Array(9).fill(uploaded.url),'image']){
        assert.equal((await postJson(base,'/api/images/generate',{prompt:'配图',references})).status,400);
      }
      assert.equal((await postJson(base,'/api/images/generate',{prompt:'配图',references:['/api/images/00000000-0000-0000-0000-000000000000.png']})).status,404);
      assert.equal(calls.length,1,'invalid references must never call upstream');
    });
    let fallbackCalls=0;
    await withServer({env:{IMAGE_API_KEY:'private-image-key'},stateDir,fetchImpl:async()=>{fallbackCalls++;return new Response('{}',{status:404});}},async base=>{
      const response=await postJson(base,'/api/images/generate',{prompt:'配图',references:[`data:image/png;base64,${PNG}`]});
      assert.equal(response.status,404);assert.match((await response.json()).error,/参考图接口/);
    });
    assert.equal(fallbackCalls,1,'unsupported edits must not silently fall back to text generation');
  }finally{await rm(stateDir,{recursive:true,force:true});}
});

test('image archive downloads valid UTF-8 ZIP with exact stored image bytes', async () => {
  const stateDir=await mkdtemp(join(tmpdir(),'pinngoo-archive-'));
  try {
    await withServer({env:{},stateDir},async base=>{
      const uploaded=await postJson(base,'/api/images/upload',{dataUrl:`data:image/png;base64,${PNG}`}).then(r=>r.json());
      const response=await postJson(base,'/api/images/archive',{images:[{name:'沈知遥',url:uploaded.url},{name:'../旧邮局',url:uploaded.url}]});
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');
      const check=spawnSync('python3',['-c','import io,json,sys,zipfile,base64; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))'],{input:Buffer.from(await response.arrayBuffer())});
      assert.equal(check.status,0,check.stderr.toString());
      assert.deepEqual(JSON.parse(check.stdout),{'001-沈知遥.png':PNG,'002-.._旧邮局.png':PNG});
      for(const images of [[],Array(101).fill({url:uploaded.url}),[{url:'https://outside.example/a.png'}],[{url:'/etc/passwd'}]]) assert.equal((await postJson(base,'/api/images/archive',{images})).status,400);
    });
  }finally{await rm(stateDir,{recursive:true,force:true});}
});

test('Seedance shot video forwards first frame, duration, ratio, resolution and audio', async () => {
  const stateDir=await mkdtemp(join(tmpdir(),'pinngoo-shot-video-')), calls=[];
  try {
    await withServer({env:{ARK_API_KEY:'video-private'},stateDir,fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'shot_123'}));}},async base=>{
      const uploaded=await postJson(base,'/api/images/upload',{dataUrl:`data:image/png;base64,${PNG}`}).then(r=>r.json());
      const options={provider:'seedance',prompt:'人物转头，保持镜头稳定',firstFrame:uploaded.url,seconds:9,ratio:'16:9',resolution:'1080p',audio:false};
      const result=await postJson(base,'/api/videos',options);assert.equal(result.status,202);
      assert.deepEqual(calls[0].content,[{type:'text',text:options.prompt},{type:'image_url',image_url:{url:`data:image/png;base64,${PNG}`},role:'first_frame'}]);
      assert.equal(calls[0].duration,9);assert.equal(calls[0].ratio,'16:9');assert.equal(calls[0].resolution,'1080p');assert.equal(calls[0].generate_audio,false);
      for(const invalid of [{ratio:'2:3'},{resolution:'4k'},{audio:'false'},{firstFrame:'https://external.example/img.png'},{seconds:60}])assert.equal((await postJson(base,'/api/videos',{...options,...invalid})).status,400);
      assert.equal(calls.length,1);
    });
  }finally{await rm(stateDir,{recursive:true,force:true});}
});

test('static server never exposes environment files or server source', async () => {
  await withServer({}, async (base) => {
    for (const path of ['/.env', '/.env.example', '/server.mjs', '/text-ai-service.mjs', '/video-providers.mjs', '/image-service.mjs', '/image-archive.mjs', '/.local/text-ai-settings.json', '/.local/video-settings.json', '/.local/image-settings.json', '/.local/images/test.png']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 404, `${path} must remain private`);
    }
    assert.equal((await fetch(`${base}/`)).status, 200);
    const crossOrigin = await fetch(`${base}/api/health`, { headers: { origin: 'https://attacker.example' } });
    assert.equal(crossOrigin.status, 403);
  });
});

test('project asset extraction validates JSON with both OpenAI and Kimi', async () => {
  for(const kimi of [false,true]){
    const calls=[];
    const output=JSON.stringify({assets:[{name:'邮差',type:'character',description:'绿色外套'},{name:'邮局',type:'scene',description:'暖色灯光'}]});
    await withServer({env:{OPENAI_API_KEY:'sk-test',OPENAI_BASE_URL:kimi?'https://api.moonshot.cn/v1':'https://api.openai.com/v1',OPENAI_MODEL:kimi?'kimi-k2.6':'gpt-5-mini'},fetchImpl:async(url,init)=>{
      calls.push({url,body:JSON.parse(init.body)});
      return new Response(JSON.stringify(kimi?{choices:[{finish_reason:'stop',message:{content:output}}]}:{output_text:output}),{status:200});
    }},async base=>{
      const result=await postJson(base,'/api/generate',{kind:'assets',text:'邮差在邮局拆信。统一画风：水彩'});
      assert.equal(result.status,200);assert.equal((await result.json()).assets.length,2);
      const payload=calls[0].body;
      if(kimi){assert.equal(payload.response_format.type,'json_object');assert.equal(payload.thinking.type,'disabled');}
      else assert.equal(payload.text.format.name,'assets');
    });
  }
  await withServer({env:{OPENAI_API_KEY:'sk-test'},fetchImpl:async()=>new Response(JSON.stringify({output_text:'{"assets":[{"name":"人物","type":"invalid","description":""}]}'}),{status:200})},async base=>{
    const response=await postJson(base,'/api/generate',{kind:'assets',text:'人物'});assert.equal(response.status,502);assert.match((await response.json()).error,/资产格式/);
  });
});

test('episode script generation preserves supplied episode context and rejects incomplete output',async()=>{
  let payload;
  await withServer({env:{OPENAI_API_KEY:'sk-test'},fetchImpl:async(url,init)=>{payload=JSON.parse(init.body);return new Response(JSON.stringify({output_text:'第2集\n邮差：来信是真的。'}),{status:200});}},async base=>{
    const response=await postJson(base,'/api/generate',{kind:'episode',episode:2,text:'第2集；前集：收到信；本集：发现邮戳'});
    assert.equal(response.status,200);assert.match((await response.json()).text,/第2集/);assert.match(payload.instructions,/逐字台词/);assert.match(payload.input,/发现邮戳/);
  });
  await withServer({env:{OPENAI_API_KEY:'sk-test'},fetchImpl:async()=>new Response(JSON.stringify({status:'incomplete',output_text:'不完整'}),{status:200})},async base=>{
    const response=await postJson(base,'/api/generate',{kind:'episode',text:'雨夜'});assert.equal(response.status,502);
  });
});
