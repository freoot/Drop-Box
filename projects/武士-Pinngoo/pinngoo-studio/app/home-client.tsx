"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { homeMarkup } from "./home-markup";
import type { Project, StartMode } from "@/lib/project";
type ApiJson = { error?: string; projects: Project[]; project: Project };

const copy: Record<string, [string, string]> = {
  idea: ["写下一个想法，例如：一个失忆的外卖员发现每次送餐都会改变客户的人生，2集，每集2分钟", "自动创建项目并进入“我有想法”流程"],
  script: ["粘贴完整剧本，或上传剧本文件", "创建剧本项目，继续制作画风、资产与视频"],
  long: ["描述故事设定、核心人物与预计集数", "创建长篇项目，从故事总览开始"],
  novel: ["粘贴小说原文，或上传文稿", "创建小说改编项目，继续制作分集剧本"],
};

export default function HomeClient() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<StartMode>("idea");
  const [projects, setProjects] = useState<Project[]>([]);
  const [deleted, setDeleted] = useState<Project[]>([]);
  const [trash, setTrash] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; image: string } | null>(null);
  const [membership, setMembership] = useState(false);

  async function load(deletedOnly = false) {
    const response = await fetch(`/api/projects${deletedOnly ? "?deleted=1" : ""}`, { cache: "no-store" });
    if (response.status === 401) return;
    const json = await response.json() as ApiJson;
    if (!response.ok) throw new Error(json.error || "项目加载失败");
    if (deletedOnly) setDeleted(json.projects); else setProjects(json.projects);
  }
  useEffect(() => { load().catch((e) => setNotice(e.message)); }, []);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: object, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await modelContext.registerTool({ name: "list_projects", title: "查看项目", description: "列出当前用户保存的影视项目。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, async execute() {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const json = await response.json() as ApiJson;
        if (!response.ok) throw new Error(json.error || "项目加载失败");
        return { projects: json.projects.map(({ id, title, mode, updatedAt }) => ({ id, title, mode, updatedAt })) };
      } }, { signal: lifecycle.signal });
      await modelContext.registerTool({ name: "create_project", title: "创建影视项目", description: "用一个故事想法或剧本内容创建新项目，并打开创作工作台。", inputSchema: { type: "object", properties: { mode: { type: "string", enum: ["idea", "script", "long", "novel", "canvas"] }, input: { type: "string" } }, required: ["mode", "input"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, async execute(value: unknown) {
        const x = value as { mode?: StartMode; input?: string };
        if (!x || !["idea", "script", "long", "novel", "canvas"].includes(String(x.mode)) || typeof x.input !== "string" || x.input.length > 200000) throw new Error("项目模式或输入内容无效。");
        const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: x.mode, input: x.input }) });
        const json = await response.json() as ApiJson;
        if (!response.ok) throw new Error(json.error || "创建失败");
        router.push(`/studio/${json.project.id}`);
        return { id: json.project.id, title: json.project.title, url: `/studio/${json.project.id}` };
      } }, { signal: lifecycle.signal });
    };
    void register().catch(() => {});
    return () => lifecycle.abort();
  }, [router]);

  useEffect(() => {
    const el = root.current;
    if (!el || !copy[mode]) return;
    const upload = el.querySelector<HTMLInputElement>("[data-home-file-input]");
    if (upload) upload.accept = ".txt,.md,.markdown,.fountain,.html,.htm";
    const trigger = el.querySelector<HTMLElement>("[data-home-file-trigger]");
    if (trigger) { trigger.setAttribute("data-tooltip", "支持 TXT、Markdown、Fountain 和 HTML，单个文件不超过 10MB"); trigger.setAttribute("title", "支持 TXT、Markdown、Fountain 和 HTML，单个文件不超过 10MB"); }
    const form = el.querySelector<HTMLElement>("[data-home-idea-form]");
    if (form) form.dataset.homeStartCurrentMode = mode;
    const input = el.querySelector<HTMLTextAreaElement>("[data-home-idea-input]");
    if (input) input.placeholder = copy[mode][0];
    const meta = el.querySelector<HTMLElement>("[data-home-composer-meta]");
    if (meta) meta.textContent = copy[mode][1];
    el.querySelectorAll<HTMLElement>("[data-home-start-mode]").forEach((btn) => {
      const active = btn.dataset.homeStartMode === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }, [mode]);

  useEffect(() => {
    const grid = root.current?.querySelector<HTMLElement>("[data-home-project-grid]");
    if (!grid) return;
    grid.replaceChildren();
    if (!projects.length) {
      const empty = document.createElement("div"); empty.className = "pg-home-auth-card";
      const title = document.createElement("strong"); title.textContent = "从一个想法开始";
      const body = document.createElement("p"); body.textContent = "你的项目会显示在这里。现在可以输入故事，或直接新建项目。";
      empty.appendChild(title); empty.appendChild(body); grid.appendChild(empty); return;
    }
    projects.forEach((project) => {
      const card = document.createElement("article"); card.className = "pg-project-card";
      const top = document.createElement("div"); top.className = "pg-project-card-top";
      const index = document.createElement("span"); index.className = "pg-project-index"; index.textContent = project.mode === "canvas" ? "画布" : "项目";
      const entry = document.createElement("button"); entry.className = "pg-project-entry"; entry.type = "button"; entry.textContent = "打开项目 ↗"; entry.onclick = () => router.push(`/studio/${project.id}`);
      top.appendChild(index); top.appendChild(entry);
      const name = document.createElement("strong"); name.className = "pg-project-name"; name.textContent = project.title;
      const time = document.createElement("span"); time.className = "pg-project-time"; time.textContent = `更新于 ${new Date(project.updatedAt).toLocaleString("zh-CN")}`;
      const actions = document.createElement("div"); actions.className = "pg-project-actions";
      const open = document.createElement("button"); open.type = "button"; open.textContent = "继续创作"; open.onclick = () => router.push(`/studio/${project.id}`);
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "移至回收站";
      remove.onclick = async () => {
        if (!window.confirm(`将“${project.title}”移至回收站？`)) return;
        const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
        if (response.ok) await load(); else setNotice("移至回收站失败");
      };
      actions.appendChild(open); actions.appendChild(remove); card.appendChild(top); card.appendChild(name); card.appendChild(time); card.appendChild(actions); grid.appendChild(card);
    });
  }, [projects, router]);

  async function create(startMode: StartMode, input = "") {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: startMode, input }) });
      if (response.status === 401) { window.location.href = "/signin-with-chatgpt?return_to=%2F"; return; }
      const json = await response.json() as ApiJson;
      if (!response.ok) throw new Error(json.error || "创建失败");
      router.push(`/studio/${json.project.id}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "创建失败"); setBusy(false); }
  }

  function filter(category = "all") {
    const query = root.current?.querySelector<HTMLElement>("[data-showcase-search]")?.textContent?.trim().toLowerCase() || "";
    root.current?.querySelectorAll<HTMLElement>("[data-showcase-id]").forEach((card) => {
      const tags = card.querySelector(".pg-showcase-card-tags")?.textContent || "";
      card.hidden = (category !== "all" && !tags.includes(category)) || (!!query && !(card.textContent || "").toLowerCase().includes(query));
    });
  }
  useEffect(() => {
    const input = root.current?.querySelector<HTMLElement>("[data-showcase-search]");
    if (!input) return;
    const handler = () => filter(root.current?.querySelector<HTMLElement>("[data-showcase-filter].active")?.dataset.showcaseFilter);
    input.addEventListener("input", handler); return () => input.removeEventListener("input", handler);
  }, []);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.homeStartMode) { setMode(button.dataset.homeStartMode as StartMode); return; }
    if (button.hasAttribute("data-home-new-project")) { void create("idea"); return; }
    if (button.hasAttribute("data-home-new-canvas-project")) { void create("canvas"); return; }
    if (button.hasAttribute("data-home-project-trash")) { setTrash(true); load(true).catch((e) => setNotice(e.message)); return; }
    if (button.hasAttribute("data-home-login")) { window.location.href = "/signin-with-chatgpt?return_to=%2F"; return; }
    if (button.hasAttribute("data-home-membership-promo-action")) { setMembership(true); return; }
    if (button.dataset.showcaseFilter) {
      root.current?.querySelectorAll<HTMLElement>("[data-showcase-filter]").forEach((item) => item.classList.toggle("active", item === button));
      filter(button.dataset.showcaseFilter); return;
    }
    if (button.dataset.showcaseId) {
      const title = button.querySelector<HTMLElement>(".pg-showcase-card-title")?.textContent || "作品";
      const image = button.style.getPropertyValue("--pg-showcase-bg").replace(/^\s*url\(["']?|["']?\)\s*$/g, "");
      setPreview({ title, image });
    }
  }
  async function handleFile(event: React.ChangeEvent<HTMLDivElement>) {
    const input = event.target as HTMLInputElement;
    if (!input.matches("[data-home-file-input]")) return;
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 10_000_000) { setNotice("文件不能超过 10MB"); return; }
    if (!/\.(txt|md|markdown|fountain|html|htm)$/i.test(file.name)) { setNotice("目前可直接读取 TXT、Markdown、Fountain 和 HTML；其他格式请先转换为文本。"); return; }
    const textarea = root.current?.querySelector<HTMLTextAreaElement>("[data-home-idea-input]");
    if (textarea) textarea.value = await file.text();
    const label = root.current?.querySelector<HTMLElement>("[data-home-file-label]"); if (label) label.textContent = file.name;
    setMode("script");
  }
  function handleSubmit(event: React.FormEvent<HTMLDivElement>) {
    if (!(event.target as HTMLElement).matches("[data-home-idea-form]")) return;
    event.preventDefault();
    const input = root.current?.querySelector<HTMLTextAreaElement>("[data-home-idea-input]")?.value || "";
    if (!input.trim()) { setNotice("先写下一句想法，或直接点击新建项目。"); return; }
    void create(mode, input);
  }
  return <>
    <div ref={root} onClick={handleClick} onChange={handleFile} onSubmit={handleSubmit} dangerouslySetInnerHTML={{ __html: homeMarkup }} />
    {notice && <div className="replica-toast" role="alert" onClick={() => setNotice("")}>{notice} ×</div>}
    {busy && <div className="replica-busy" role="status">正在创建项目…</div>}
    {trash && <div className="replica-modal-backdrop" onClick={() => setTrash(false)}><div className="replica-modal" onClick={(e) => e.stopPropagation()}><div className="replica-modal-head"><h2>回收站</h2><button onClick={() => setTrash(false)}>关闭</button></div>{deleted.length ? deleted.map((item) => <div className="replica-trash-row" key={item.id}><span>{item.title}</span><button onClick={async () => { const response = await fetch(`/api/projects/${item.id}/restore`, { method: "POST" }); if (response.ok) await Promise.all([load(), load(true)]); else setNotice("恢复失败"); }}>恢复项目</button></div>) : <p>回收站是空的。</p>}</div></div>}
    {preview && <div className="replica-modal-backdrop" onClick={() => setPreview(null)}><div className="replica-modal replica-preview" onClick={(e) => e.stopPropagation()}><div className="replica-modal-head"><h2>{preview.title}</h2><button onClick={() => setPreview(null)}>关闭</button></div><img src={preview.image} alt={preview.title} /></div></div>}
    {membership && <div className="replica-modal-backdrop" onClick={() => setMembership(false)}><div className="replica-modal" onClick={(e) => e.stopPropagation()}><div className="replica-modal-head"><h2>会员权益</h2><button onClick={() => setMembership(false)}>关闭</button></div><p>会员支付需接入正式账户与支付服务。</p></div></div>}
  </>;
}
