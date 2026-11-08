export function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function readJson(request: Request, maxBytes = 1_000_000): Promise<Record<string, unknown>> {
  const body = await request.text();
  if (body.length > maxBytes) throw new Error("提交内容过大，请分批保存。");
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求格式不正确。");
  return parsed as Record<string, unknown>;
}

export function serverError(error: unknown) {
  const detail = error instanceof Error ? error.message : "未知错误";
  if (detail.includes("no such table") || detail.includes("D1 binding")) {
    return apiError("项目存储暂不可用，请稍后重试。", 503);
  }
  if (error instanceof SyntaxError) return apiError("请求格式不正确。", 400);
  if (detail === "提交内容过大，请分批保存。" || detail === "请求格式不正确。") return apiError(detail, 400);
  console.error("API request failed", error);
  return apiError("服务暂时不可用，请稍后重试。", 500);
}
