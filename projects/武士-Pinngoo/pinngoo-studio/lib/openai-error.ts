export type OpenAiErrorBody = { error?: { message?: string; code?: string | null; type?: string; param?: string | null } };

export function openAiFailure(response: Response, body: OpenAiErrorBody, feature: string) {
  const error = body.error || {};
  const code = String(error.code || "");
  const type = String(error.type || "");
  const param = String(error.param || "");
  const requestId = response.headers.get("x-request-id") || "";
  console.error("AI provider request failed", { feature, status: response.status, code, type, param, requestId });
  let message: string;
  if (response.status === 401 || code === "invalid_api_key") message = "AI 服务密钥无效或已失效，请更新站点密钥。";
  else if (code === "insufficient_quota" || code === "billing_hard_limit_reached" || code === "credit_balance_exhausted" || type === "insufficient_quota") message = "AI 服务余额已用尽。请为该项目充值，或更换有额度的密钥后重试。";
  else if (response.status === 429) message = "请求过于频繁，请稍后再试。";
  else if (response.status === 403) message = "当前 AI 服务账户没有此模型的使用权限。";
  else if (code === "model_not_found" || param === "model") message = "当前 AI 服务账户没有可用的所选模型，请检查平台控制台中的模型 ID 和账户分组。";
  else if (response.status >= 500) message = "AI 服务暂时不可用，请稍后重试。";
  else message = `AI 服务拒绝了请求${code ? `（${code}）` : `（HTTP ${response.status}）`}。${error.message ? String(error.message).slice(0, 180) : "请检查输入内容后重试。"}`;
  return Response.json({ error: message, code: code || type || `http_${response.status}`, requestId }, { status: response.status === 429 ? 429 : response.status >= 500 ? 502 : 400 });
}
