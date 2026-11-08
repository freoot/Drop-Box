import { apiError, serverError } from "@/lib/api";
import { getOwnedProject, ownerFromRequest } from "@/lib/server-projects";
import { saveMedia } from "@/lib/media";

export async function POST(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const form = await request.formData();
    const file = form.get("file");
    const projectId = form.get("projectId");
    if (!(file instanceof File) || typeof projectId !== "string") return apiError("请上传素材文件。", 400);
    if (!await getOwnedProject(projectId, owner)) return apiError("项目不存在。", 404);
    if (file.size > 50_000_000) return apiError("文件不能超过 50MB。", 413);
    if (!/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.type)) return apiError("支持 PNG、JPEG、WebP、GIF、MP4、WebM 和 MOV 文件。", 400);
    const data = new Uint8Array(await file.arrayBuffer());
    const item = await saveMedia(owner, projectId, file.type.startsWith("video/") ? "video" : "image", data, file.type, file.name.slice(0, 200));
    return Response.json({ media: item }, { status: 201 });
  } catch (error) { return serverError(error); }
}
