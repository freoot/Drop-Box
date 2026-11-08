"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, FileText, Film, Images, LayoutGrid, Loader2, Plus, Save, Sparkles, Trash2, Upload } from "lucide-react";
import type { Asset, AssetKind, Project, ProjectData, Shot } from "@/lib/project";
type ApiJson = { error?: string; project: Project; text: string; media: { id: string } };

type Tab = "story" | "script" | "assets" | "shots" | "video";
const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "story", label: "故事", icon: Sparkles }, { id: "script", label: "剧本", icon: FileText },
  { id: "assets", label: "画风与资产", icon: Images }, { id: "shots", label: "分镜", icon: LayoutGrid }, { id: "video", label: "视频", icon: Film },
];
const kindName: Record<AssetKind, string> = { character: "角色", scene: "场景", prop: "道具" };

function parseArray(text: string): unknown[] {
  const raw = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = raw.indexOf("["); const end = raw.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("AI 返回格式不完整，请重试。");
  const value = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(value)) throw new Error("AI 返回格式不正确。");
  return value;
}

export default function StudioClient({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("story");
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [shotStyle, setShotStyle] = useState<"standard" | "commercial">("standard");

  useEffect(() => {
    fetch(`/api/projects/${id}`, { cache: "no-store" }).then(async (response) => {
      const json = await response.json() as ApiJson;
      if (!response.ok) throw new Error(json.error || "项目加载失败");
      setProject(json.project);
      if (json.project.mode === "script") setTab("script");
      if (json.project.mode === "canvas") setTab("assets");
    }).catch((error) => setLoadError(error.message));
  }, [id]);

  function edit(change: Partial<Project>) {
    setProject((current) => current ? { ...current, ...change } : current);
    setDirty(true);
  }
  function editData(change: Partial<ProjectData>) {
    setProject((current) => current ? { ...current, data: { ...current.data, ...change } } : current);
    setDirty(true);
  }
  async function save(value = project) {
    if (!value) return false;
    setWorking("保存中");
    try {
      const response = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: value.title, data: value.data }) });
      const json = await response.json() as ApiJson;
      if (!response.ok) throw new Error(json.error || "保存失败");
      setDirty(false); setNotice("已保存"); return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); return false; }
    finally { setWorking(""); }
  }
  useEffect(() => {
    if (!project || !dirty || working) return;
    const timer = window.setTimeout(() => { void save(project); }, 1500);
    return () => window.clearTimeout(timer);
  }, [project, dirty]);

  async function generate(action: "outline" | "script" | "continueScript" | "assets" | "shots") {
    if (!project || working) return;
    if ((action === "script" && project.data.script) || (action === "outline" && project.data.outline)) {
      if (!window.confirm("生成结果会替换当前内容。继续吗？")) return;
    }
    if (dirty && !await save(project)) return;
    setWorking(action); setNotice("");
    try {
      const response = await fetch("/api/ai/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: id, action, shotStyle }) });
      const json = await response.json() as ApiJson;
      if (!response.ok) throw new Error(json.error || "生成失败");
      if (action === "outline" || action === "script") editData({ [action]: json.text });
      if (action === "continueScript") editData({ script: `${project.data.script.trim()}\n\n${json.text}` });
      if (action === "assets") {
        const assets: Asset[] = parseArray(json.text).slice(0, 12).map((item) => {
          const a = item as Record<string, unknown>;
          return { id: crypto.randomUUID(), kind: a.kind === "scene" || a.kind === "prop" ? a.kind : "character", name: String(a.name || "未命名资产"), description: String(a.description || "") };
        });
        editData({ assets: [...project.data.assets, ...assets] });
      }
      if (action === "shots") {
        const shots: Shot[] = parseArray(json.text).slice(0, 16).map((item) => {
          const s = item as Record<string, unknown>;
          return { id: crypto.randomUUID(), episode: Math.max(1, Number(s.episode) || 1), scene: String(s.scene || ""), framing: String(s.framing || ""), action: String(s.action || ""), dialogue: String(s.dialogue || ""), imagePrompt: String(s.imagePrompt || "") };
        });
        editData({ shots: [...project.data.shots, ...shots] });
      }
      setNotice("生成完成，内容可以继续编辑。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "生成失败"); }
    finally { setWorking(""); }
  }

  async function generateImage(prompt: string, kind: "asset" | "shot", targetId: string) {
    if (!project || working) return;
    if (dirty && !await save(project)) return;
    setWorking(`image-${targetId}`); setNotice("");
    try {
      const response = await fetch("/api/ai/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: id, prompt }) });
      const json = await response.json() as ApiJson;
      if (!response.ok) throw new Error(json.error || "图片生成失败");
      if (kind === "asset") editData({ assets: project.data.assets.map((asset) => asset.id === targetId ? { ...asset, imageId: json.media.id } : asset) });
      else editData({ shots: project.data.shots.map((shot) => shot.id === targetId ? { ...shot, imageId: json.media.id } : shot) });
      setNotice("图片已生成并保存。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "图片生成失败"); }
    finally { setWorking(""); }
  }
  async function upload(file: File, shotId: string, type: "video" | "image") {
    if (!project) return;
    setWorking(`upload-${shotId}`);
    try {
      const form = new FormData(); form.set("projectId", id); form.set("file", file);
      const response = await fetch("/api/media", { method: "POST", body: form });
      const json = await response.json() as ApiJson;
      if (!response.ok) throw new Error(json.error || "上传失败");
      editData({ shots: project.data.shots.map((shot) => shot.id === shotId ? { ...shot, [type === "video" ? "videoId" : "imageId"]: json.media.id } : shot) });
      setNotice("素材已上传。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "上传失败"); }
    finally { setWorking(""); }
  }

  if (loadError) return <main className="studio-failure"><h1>项目暂时无法打开</h1><p>{loadError}</p><Link href="/">返回首页</Link></main>;
  if (!project) return <main className="studio-loading"><Loader2 className="animate-spin" /> 正在打开项目…</main>;
  const { data } = project;
  return <div className="studio-shell">
    <aside className="studio-sidebar">
      <Link className="studio-logo" href="/"><span>PG</span><strong>PINNGOO<br />AI STUDIO</strong></Link>
      <Link className="studio-back" href="/"><ArrowLeft size={16} /> 返回工作台</Link>
      <div className="studio-sidebar-label">创作流程</div>
      <nav aria-label="创作流程">{tabs.map(({ id: value, label, icon: Icon }, index) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><span className="studio-step">{String(index + 1).padStart(2, "0")}</span><Icon size={18} />{label}</button>)}</nav>
      <div className="studio-sidebar-foot"><span>一个项目，贯穿故事到成片</span><strong>{project.mode === "canvas" ? "自由画布" : "影视创作项目"}</strong></div>
    </aside>
    <div className="studio-main">
      <header className="studio-topbar"><div><span className="studio-kicker">PROJECT WORKSPACE</span><input aria-label="项目名称" value={project.title} onChange={(e) => edit({ title: e.target.value })} /></div><div className="studio-top-actions"><span className={dirty ? "unsaved" : ""}>{working || (dirty ? "有未保存修改" : "已保存")}</span><button onClick={() => void save()} disabled={!!working}><Save size={16} /> 保存</button></div></header>
      <main className="studio-content">
        <div className="studio-section-intro"><div><div className="studio-eyebrow">{String(tabs.findIndex((t) => t.id === tab) + 1).padStart(2, "0")} / 05 · 创作流程</div><h1>{tabs.find((t) => t.id === tab)?.label}</h1><p>{({ story: "从一句想法展开故事主线与分集结构。", script: "编辑每一场动作、人物和台词。", assets: "固定画风，沉淀角色、场景与道具。", shots: "把剧本拆成可执行的镜头。", video: "整理镜头视频，检查画面连续性。" } as const)[tab]}</p></div><span className="studio-mode-pill">{project.mode === "novel" ? "小说转剧" : project.mode === "long" ? "长篇创作" : project.mode === "script" ? "从剧本开始" : project.mode === "canvas" ? "画布" : "从想法开始"}</span></div>
        {notice && <div className="studio-notice" role="status" onClick={() => setNotice("")}>{notice} ×</div>}
        {tab === "story" && <div className="studio-stack"><section className="studio-panel"><div className="studio-panel-head"><div><span>01 · 故事种子</span><h2>核心想法</h2></div></div><textarea className="studio-textarea" value={data.premise} onChange={(e) => editData({ premise: e.target.value })} placeholder="故事从哪里开始？主角想得到什么？会遇到什么阻力？" /></section><section className="studio-panel"><div className="studio-panel-head"><div><span>02 · 故事结构</span><h2>总览与分集大纲</h2></div><button className="studio-primary" onClick={() => void generate("outline")} disabled={!!working}><Sparkles size={16} /> AI 生成大纲</button></div><textarea className="studio-textarea tall" value={data.outline} onChange={(e) => editData({ outline: e.target.value })} placeholder="这里会呈现故事总览、人物目标和分集大纲，也可以直接手写。" /></section><section className="studio-panel"><div className="studio-panel-head"><div><span>03 · 创作备注</span><h2>要求与约束</h2></div></div><textarea className="studio-textarea short" value={data.notes} onChange={(e) => editData({ notes: e.target.value })} placeholder="记录时长、集数、风格和不可改变的剧情设定。" /></section></div>}
        {tab === "script" && <div className="studio-stack"><section className="studio-panel"><div className="studio-panel-head"><div><span>剧本创作</span><h2>分集剧本</h2></div><div className="studio-button-row"><label className="studio-secondary"><Upload size={16} /> 导入文本<input type="file" accept=".txt,.md,.fountain" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) editData({ script: await file.text() }); }} /></label><button className="studio-primary" onClick={() => void generate("script")} disabled={!!working}><Sparkles size={16} /> AI 生成剧本</button>{(project.mode === "long" || project.mode === "novel") && !!data.script && <button className="studio-secondary" onClick={() => void generate("continueScript")} disabled={!!working}><Plus size={16} /> 续写 5 集</button>}</div></div><textarea className="studio-textarea script" value={data.script} onChange={(e) => editData({ script: e.target.value })} placeholder="第1集\n场1  日  内景\n人物、动作、台词……" /><div className="studio-panel-foot"><span>{data.script.length.toLocaleString()} 字符</span><a download={`${project.title || "剧本"}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(data.script)}`}>导出 TXT</a></div></section></div>}
        {tab === "assets" && <div className="studio-stack"><section className="studio-panel"><div className="studio-panel-head"><div><span>视觉基准</span><h2>统一画风</h2></div></div><textarea className="studio-textarea short" value={data.visualStyle} onChange={(e) => editData({ visualStyle: e.target.value })} placeholder="例如：写实国风，冷青主色，暖金边光，35mm 电影镜头，角色面部特征固定……" /></section><div className="studio-subhead"><div><span>ASSET LIBRARY</span><h2>可复用资产 <em>{data.assets.length}</em></h2></div><div className="studio-button-row"><button className="studio-secondary" onClick={() => editData({ assets: [...data.assets, { id: crypto.randomUUID(), kind: "character", name: "新资产", description: "" }] })}><Plus size={16} /> 添加资产</button><button className="studio-primary" onClick={() => void generate("assets")} disabled={!!working}><Sparkles size={16} /> AI 提取资产</button></div></div><div className="studio-asset-grid">{data.assets.map((asset) => <article className="studio-asset" key={asset.id}><div className="studio-asset-image">{asset.imageId ? <img src={`/api/media/${asset.imageId}`} alt={asset.name} /> : <Images size={30} />}</div><div className="studio-asset-body"><div className="studio-asset-top"><select aria-label="资产类型" value={asset.kind} onChange={(e) => editData({ assets: data.assets.map((a) => a.id === asset.id ? { ...a, kind: e.target.value as AssetKind } : a) })}>{Object.entries(kindName).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button aria-label="删除资产" onClick={() => editData({ assets: data.assets.filter((a) => a.id !== asset.id) })}><Trash2 size={15} /></button></div><input aria-label="资产名称" value={asset.name} onChange={(e) => editData({ assets: data.assets.map((a) => a.id === asset.id ? { ...a, name: e.target.value } : a) })} /><textarea aria-label="资产描述" value={asset.description} onChange={(e) => editData({ assets: data.assets.map((a) => a.id === asset.id ? { ...a, description: e.target.value } : a) })} placeholder="写下外观、服装、材质与一致性特征" /><button className="studio-secondary" onClick={() => void generateImage(`${kindName[asset.kind]} ${asset.name}：${asset.description}`, "asset", asset.id)} disabled={!!working}><Sparkles size={15} /> {working === `image-${asset.id}` ? "生成中…" : "生成参考图"}</button></div></article>)}</div>{!data.assets.length && <div className="studio-empty">还没有资产。可以手动添加，或从故事与剧本提取。</div>}</div>}
        {tab === "shots" && <div className="studio-stack"><div className="studio-subhead"><div><span>SHOT LIST</span><h2>镜头列表 <em>{data.shots.length}</em></h2></div><div className="studio-button-row"><button className="studio-secondary" onClick={() => editData({ shots: [...data.shots, { id: crypto.randomUUID(), episode: 1, scene: "", framing: "中景", action: "", dialogue: "", imagePrompt: "" }] })}><Plus size={16} /> 添加镜头</button><label className="studio-style-select">分镜智能体 <select value={shotStyle} onChange={(e) => setShotStyle(e.target.value as "standard" | "commercial")}><option value="standard">通用标准</option><option value="commercial">商业剧情</option></select></label><button className="studio-primary" onClick={() => void generate("shots")} disabled={!!working}><Sparkles size={16} /> AI 拆分镜</button></div></div>{data.shots.map((shot, index) => <section className="studio-shot" key={shot.id}><div className="studio-shot-head"><span>SHOT {String(index + 1).padStart(3, "0")}</span><div><label>第 <input type="number" min="1" value={shot.episode} onChange={(e) => editData({ shots: data.shots.map((s) => s.id === shot.id ? { ...s, episode: Number(e.target.value) } : s) })} /> 集</label><button aria-label="删除镜头" onClick={() => editData({ shots: data.shots.filter((s) => s.id !== shot.id) })}><Trash2 size={16} /></button></div></div><div className="studio-shot-grid"><div className="studio-shot-fields"><label>场景<input value={shot.scene} onChange={(e) => editData({ shots: data.shots.map((s) => s.id === shot.id ? { ...s, scene: e.target.value } : s) })} /></label><label>景别 / 机位<input value={shot.framing} onChange={(e) => editData({ shots: data.shots.map((s) => s.id === shot.id ? { ...s, framing: e.target.value } : s) })} /></label><label>动作与画面<textarea value={shot.action} onChange={(e) => editData({ shots: data.shots.map((s) => s.id === shot.id ? { ...s, action: e.target.value } : s) })} /></label><label>台词 / 声音<textarea value={shot.dialogue} onChange={(e) => editData({ shots: data.shots.map((s) => s.id === shot.id ? { ...s, dialogue: e.target.value } : s) })} /></label><label>画面提示词<textarea value={shot.imagePrompt} onChange={(e) => editData({ shots: data.shots.map((s) => s.id === shot.id ? { ...s, imagePrompt: e.target.value } : s) })} /></label></div><div className="studio-shot-visual">{shot.imageId ? <img src={`/api/media/${shot.imageId}`} alt={`镜头 ${index + 1}`} /> : <div className="studio-shot-placeholder"><Clapperboard size={36} /><span>镜头画面</span></div>}<button className="studio-primary" onClick={() => void generateImage(shot.imagePrompt || `${shot.scene}，${shot.framing}，${shot.action}`, "shot", shot.id)} disabled={!!working}><Sparkles size={15} /> 生成镜头图</button><label className="studio-secondary"><Upload size={15} /> 上传图片<input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, shot.id, "image"); }} /></label></div></div></section>)}{!data.shots.length && <div className="studio-empty">还没有分镜。请先完成剧本，然后点击 AI 拆分镜。</div>}</div>}
        {tab === "video" && <div className="studio-stack"><section className="studio-panel studio-video-intro"><div><span>VIDEO PRODUCTION</span><h2>镜头视频工作区</h2><p>在这里为每个镜头导入视频，预览并下载素材。自动生成视频需要另外接入视频服务 API。</p></div></section>{data.shots.map((shot, index) => <section className="studio-video-row" key={shot.id}><div className="studio-video-thumb">{shot.videoId ? <video src={`/api/media/${shot.videoId}`} controls preload="metadata" /> : shot.imageId ? <img src={`/api/media/${shot.imageId}`} alt="镜头参考" /> : <Film size={30} />}</div><div className="studio-video-details"><span>SHOT {String(index + 1).padStart(3, "0")} · 第 {shot.episode} 集</span><h3>{shot.scene || "未命名场景"}</h3><p>{shot.action || "待补充画面动作"}</p><div className="studio-button-row"><label className="studio-secondary"><Upload size={15} /> {shot.videoId ? "替换视频" : "导入视频"}<input type="file" accept="video/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, shot.id, "video"); }} /></label>{shot.videoId && <a className="studio-secondary" href={`/api/media/${shot.videoId}`} download>下载素材</a>}</div></div></section>)}{!data.shots.length && <div className="studio-empty">先到“分镜”创建镜头，再导入视频素材。</div>}</div>}
      </main>
    </div>
  </div>;
}
