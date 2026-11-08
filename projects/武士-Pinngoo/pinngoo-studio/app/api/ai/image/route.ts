import { env } from "cloudflare:workers";
import { apiError, readJson, serverError } from "@/lib/api";
import { saveMedia } from "@/lib/media";
import { getOwnedProject, ownerFromRequest } from "@/lib/server-projects";
import { openAiFailure, type OpenAiErrorBody } from "@/lib/openai-error";
import { imageProvider, availableModels, preferredImageModel } from "@/lib/ai-provider";

export async function POST(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const provider = imageProvider();
    if (!provider.key) return apiError("尚未配置图片生成服务密钥。", 503);
    const payload = await readJson(request);
    const projectId = typeof payload.projectId === "string" ? payload.projectId : "";
    const prompt = typeof payload.prompt === "string" ? payload.prompt.trim().slice(0, 4000) : "";
    if (!prompt) return apiError("请填写画面描述。", 400);
    const project = await getOwnedProject(projectId, owner);
    if (!project || project.deletedAt) return apiError("项目不存在。", 404);
    const official = provider.baseUrl === "https://api.openai.com/v1";
    let model = env.AI_IMAGE_MODEL?.trim() || (official ? "gpt-image-2.5-flare" : "");
    if (!model) {
      const listing = await availableModels(provider.baseUrl, provider.key);
      if (!listing.response.ok) return openAiFailure(listing.response, listing.body, "models:image");
      model = preferredImageModel(listing.ids);
    }
    if (!model) return apiError("当前密钥没有可用的图片模型。请配置支持图片生成的服务密钥、接口地址和模型。", 503);
    const response = await fetch(`${provider.baseUrl}/images/generations`, {
      method: "POST", headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: `${prompt}\n视觉风格：${project.data.visualStyle || "电影感、统一角色设计"}`, size: "1024x1024", ...(official ? { quality: "medium" } : { response_format: "b64_json" }), n: 1 }),
    });
    const body = await response.json() as { data?: { b64_json?: string }[] } & OpenAiErrorBody;
    if (!response.ok) return openAiFailure(response, body, "image");
    const base64 = body.data?.[0]?.b64_json;
    if (!base64) return apiError("图片生成结果为空。", 502);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const media = await saveMedia(owner, projectId, "image", bytes, "image/png", "generated.png");
    return Response.json({ media });
  } catch (error) { return serverError(error); }
}
