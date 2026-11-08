export type StartMode = "idea" | "script" | "long" | "novel" | "canvas";
export type AssetKind = "character" | "scene" | "prop";

export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  description: string;
  imageId?: string;
};

export type Shot = {
  id: string;
  episode: number;
  scene: string;
  framing: string;
  action: string;
  dialogue: string;
  imagePrompt: string;
  imageId?: string;
  videoId?: string;
};

export type ProjectData = {
  premise: string;
  outline: string;
  script: string;
  visualStyle: string;
  assets: Asset[];
  shots: Shot[];
  notes: string;
};

export type Project = {
  id: string;
  title: string;
  mode: StartMode;
  data: ProjectData;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export function initialData(mode: StartMode, input = ""): ProjectData {
  return {
    premise: mode === "script" ? "" : input,
    outline: "",
    script: mode === "script" ? input : "",
    visualStyle: "",
    assets: [],
    shots: [],
    notes: "",
  };
}

export function deriveTitle(input: string, mode: StartMode): string {
  const first = input.trim().split(/[\n。！？!?]/)[0]?.trim();
  if (first) return first.slice(0, 22);
  return ({ idea: "未命名想法", script: "未命名剧本", long: "未命名长篇", novel: "未命名改编", canvas: "未命名画布" } as const)[mode];
}

export function safeProjectData(value: unknown): ProjectData {
  const x = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const text = (v: unknown, max = 200000) => typeof v === "string" ? v.slice(0, max) : "";
  const assets = Array.isArray(x.assets) ? x.assets.slice(0, 250).map((a) => {
    const item = a && typeof a === "object" ? a as Record<string, unknown> : {};
    const kind: AssetKind = item.kind === "scene" || item.kind === "prop" ? item.kind : "character";
    return { id: text(item.id, 100) || crypto.randomUUID(), kind, name: text(item.name, 160), description: text(item.description, 5000), ...(typeof item.imageId === "string" ? { imageId: text(item.imageId, 100) } : {}) };
  }) : [];
  const shots = Array.isArray(x.shots) ? x.shots.slice(0, 1000).map((a) => {
    const item = a && typeof a === "object" ? a as Record<string, unknown> : {};
    return { id: text(item.id, 100) || crypto.randomUUID(), episode: Math.max(1, Math.min(999, Number(item.episode) || 1)), scene: text(item.scene, 160), framing: text(item.framing, 80), action: text(item.action, 5000), dialogue: text(item.dialogue, 5000), imagePrompt: text(item.imagePrompt, 5000), ...(typeof item.imageId === "string" ? { imageId: text(item.imageId, 100) } : {}), ...(typeof item.videoId === "string" ? { videoId: text(item.videoId, 100) } : {}) };
  }) : [];
  return { premise: text(x.premise), outline: text(x.outline), script: text(x.script), visualStyle: text(x.visualStyle, 10000), assets, shots, notes: text(x.notes, 20000) };
}
