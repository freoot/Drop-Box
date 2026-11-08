import { env } from "cloudflare:workers";
import { apiError, serverError } from "@/lib/api";
import { getOwnedMedia } from "@/lib/media";
import { ownerFromRequest } from "@/lib/server-projects";

type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Ctx) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const row = await getOwnedMedia((await params).id, owner);
    if (!row) return apiError("素材不存在。", 404);
    if (!env.BUCKET) return apiError("素材存储暂不可用。", 503);
    const object = await env.BUCKET.get(row.objectKey);
    if (!object) return apiError("素材不存在。", 404);
    return new Response(object.body, { headers: { "Content-Type": row.mimeType, "Cache-Control": "private, max-age=3600", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}` } });
  } catch (error) { return serverError(error); }
}
