import { apiError, readJson, serverError } from "@/lib/api";
import { createProject, listOwnedProjects, ownerFromRequest } from "@/lib/server-projects";
import { deriveTitle, type StartMode } from "@/lib/project";

const modes = new Set<StartMode>(["idea", "script", "long", "novel", "canvas"]);

export async function GET(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const deleted = new URL(request.url).searchParams.get("deleted") === "1";
    return Response.json({ projects: await listOwnedProjects(owner, deleted) });
  } catch (error) { return serverError(error); }
}

export async function POST(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const payload = await readJson(request);
    const mode = payload.mode as StartMode;
    if (!modes.has(mode)) return apiError("请选择有效的创作模式。", 400);
    const input = typeof payload.input === "string" ? payload.input.slice(0, 200000) : "";
    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim().slice(0, 100) : deriveTitle(input, mode);
    const project = await createProject(owner, mode, title, input);
    return Response.json({ project }, { status: 201 });
  } catch (error) { return serverError(error); }
}
