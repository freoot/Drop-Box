import { env } from "cloudflare:workers";
import type { OpenAiErrorBody } from "@/lib/openai-error";

function validatedBaseUrl(configured: string) {
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("AI 服务接口地址配置无效。");
  return url.href.replace(/\/+$/, "");
}

export function aiBaseUrl() {
  return validatedBaseUrl(env.AI_API_BASE_URL?.trim() || "https://api.openai.com/v1");
}

export function imageProvider() {
  const separateKey = env.AI_IMAGE_API_KEY?.trim();
  const separateBase = env.AI_IMAGE_API_BASE_URL?.trim();
  if (separateBase && !separateKey) throw new Error("已设置图片服务地址，但尚未配置图片服务密钥。");
  return {
    key: separateKey || env.OPENAI_API_KEY?.trim() || "",
    baseUrl: separateKey ? validatedBaseUrl(separateBase || "https://api.openai.com/v1") : aiBaseUrl(),
  };
}

export function usesOfficialOpenAi() {
  return aiBaseUrl() === "https://api.openai.com/v1";
}

export function textApiKind(): "responses" | "chat" {
  if (env.AI_TEXT_API === "chat") return "chat";
  if (env.AI_TEXT_API === "responses") return "responses";
  return usesOfficialOpenAi() ? "responses" : "chat";
}

export async function availableModels(baseUrl = aiBaseUrl(), key = env.OPENAI_API_KEY || "") {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json().catch(() => ({})) as OpenAiErrorBody & { data?: unknown };
  const ids = Array.isArray(body.data)
    ? body.data.map((item) => item && typeof item === "object" && "id" in item ? item.id : null).filter((id): id is string => typeof id === "string")
    : [];
  return { response, body, ids };
}

export function preferredTextModel(ids: string[]) {
  const preferred = ["gpt-6-sol", "gpt-5.6-sol", "gpt-5.6-terra", "deepseek-v4.1-flash", "deepseek-v4-flash"];
  return preferred.find((model) => ids.includes(model)) || ids.find((model) => !/(image|video|veo|omni|audio|tts|whisper|embed|rerank)/i.test(model)) || "";
}

export function preferredImageModel(ids: string[]) {
  return ids.find((model) => model === "gpt-image-2") || ids.find((model) => /image|dall-e|flux/i.test(model)) || "";
}
