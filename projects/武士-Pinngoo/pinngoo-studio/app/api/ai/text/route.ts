import { env } from "cloudflare:workers";
import { apiError, readJson, serverError } from "@/lib/api";
import { getOwnedProject, ownerFromRequest } from "@/lib/server-projects";
import { openAiFailure, type OpenAiErrorBody } from "@/lib/openai-error";
import { aiBaseUrl, availableModels, preferredTextModel, textApiKind, usesOfficialOpenAi } from "@/lib/ai-provider";

const prompts: Record<string, string> = {
  outline: "你是专业中文影视编剧。根据项目素材写清晰、有因果的故事总览和分集大纲，保留用户已给定的人物、事件与风格。直接输出可编辑的 Markdown 正文，不要前言。",
  script: "你是专业中文影视编剧。将给定故事写成可拍摄的分集剧本，包含集号、场号、时间、场景、人物动作和准确台词。短篇写 1–5 集；长篇或小说改编先写前 5 集并确保连续性。直接输出剧本正文，不要前言。",
  continueScript: "你是专业中文影视编剧。阅读已有剧本结尾和完整故事规划，接着已有集数续写后 5 集。保持人物性格、事件因果和已经确认的设定。包含集号、场号、时间、场景、人物动作和准确台词。直接输出新增的剧本正文，不要重复已有内容或写前言。",
  assets: "你是影视美术指导。根据故事和视觉风格识别可复用的角色、场景、道具资产。只输出 JSON 数组，每项含 kind(character/scene/prop)、name、description。最多 12 项，描述要具体到外观、服装、材质、色彩、光线和一致性特征。",
  shots: "你是电影分镜导演。根据剧本拆分为可拍摄的镜头。只输出 JSON 数组，每项含 episode(数字)、scene、framing、action、dialogue、imagePrompt。最多 16 个镜头。imagePrompt 描述构图、角色位置、动作、景别、光线、画风，不能改变剧情。",
};

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    const content = item && typeof item === "object" && "content" in item && Array.isArray(item.content) ? item.content : [];
    return (content as Record<string, unknown>[]).map((part) => part && typeof part === "object" && "text" in part ? String(part.text) : "");
  }).join("\n").trim();
}

function chatText(response: Record<string, unknown>) {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const message = choices[0] && typeof choices[0] === "object" && "message" in choices[0] ? choices[0].message : null;
  const content = message && typeof message === "object" && "content" in message ? message.content : null;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.map((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "").join("\n").trim();
}

export async function POST(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  if (!env.OPENAI_API_KEY) return apiError("尚未配置 AI 服务密钥。", 503);
  try {
    const payload = await readJson(request, 500_000);
    const projectId = typeof payload.projectId === "string" ? payload.projectId : "";
    const action = typeof payload.action === "string" ? payload.action : "";
    if (!prompts[action]) return apiError("未知生成类型。", 400);
    const project = await getOwnedProject(projectId, owner);
    if (!project || project.deletedAt) return apiError("项目不存在。", 404);
    const { premise, outline, script, visualStyle } = project.data;
    const context = [`项目：${project.title}`, `起步模式：${project.mode}`, `故事想法：${premise.slice(0, 80000)}`, `故事大纲：${outline.slice(0, 40000)}`, `已有剧本末尾：${script.slice(-50000)}`, `视觉风格：${visualStyle.slice(0, 5000)}`, action === "outline" && project.mode === "long" ? "请包含故事总览、30–100 集分阶段规划和连续的分集大纲。" : ""].join("\n\n");
    if (!premise && !outline && !script) return apiError("先输入故事或剧本内容。", 400);
    const official = usesOfficialOpenAi();
    let model = env.OPENAI_TEXT_MODEL?.trim() || (official ? "gpt-5-mini" : "");
    if (!model) {
      const listing = await availableModels();
      if (!listing.response.ok) return openAiFailure(listing.response, listing.body, "models:text");
      model = preferredTextModel(listing.ids);
    }
    if (!model) return apiError("这把密钥当前没有可用的文字模型。请在服务商控制台检查密钥分组、模型限制和可用渠道。", 503);
    const api = textApiKind();
    const instructions = prompts[action] + (action === "shots" && payload.shotStyle === "commercial" ? "镜头设计偏商业剧情：强调情绪钩子、反应镜头、角色表演与节奏转换。" : "");
    const callModel = (selectedModel: string) => fetch(`${aiBaseUrl()}/${api === "chat" ? "chat/completions" : "responses"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(api === "chat"
        ? { model: selectedModel, messages: [{ role: "system", content: instructions }, { role: "user", content: context }], max_tokens: action === "script" || action === "continueScript" ? 7000 : 4500 }
        : { model: selectedModel, instructions, input: context, ...(selectedModel === "gpt-4.1-mini" ? {} : { reasoning: { effort: "low" } }), max_output_tokens: action === "script" || action === "continueScript" ? 7000 : 4500 }),
    });
    let response = await callModel(model);
    let body = await response.json() as Record<string, unknown> & OpenAiErrorBody;
    if (!response.ok && official && api === "responses" && !env.OPENAI_TEXT_MODEL && (body.error?.code === "model_not_found" || body.error?.param === "model")) {
      response = await callModel("gpt-4.1-mini");
      body = await response.json() as Record<string, unknown> & OpenAiErrorBody;
    }
    if (!response.ok) return openAiFailure(response, body, `text:${action}`);
    const text = api === "chat" ? chatText(body) : outputText(body);
    if (!text) return apiError("生成结果为空，请重试。", 502);
    return Response.json({ text });
  } catch (error) { return serverError(error); }
}
