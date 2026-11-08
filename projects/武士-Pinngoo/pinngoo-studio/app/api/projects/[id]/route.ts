import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { apiError, readJson, serverError } from "@/lib/api";
import { safeProjectData } from "@/lib/project";
import { getOwnedProject, ownerFromRequest, updateProject } from "@/lib/server-projects";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const project = await getOwnedProject((await params).id, owner);
    if (!project || project.deletedAt) return apiError("项目不存在。", 404);
    return Response.json({ project });
  } catch (error) { return serverError(error); }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const id = (await params).id;
    const existing = await getOwnedProject(id, owner);
    if (!existing || existing.deletedAt) return apiError("项目不存在。", 404);
    const payload = await readJson(request, 2_000_000);
    const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 100) : existing.title;
    if (!title) return apiError("项目名称不能为空。", 400);
    const data = payload.data === undefined ? existing.data : safeProjectData(payload.data);
    const project = await updateProject(id, owner, title, data);
    return Response.json({ project });
  } catch (error) { return serverError(error); }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const id = (await params).id;
    const db = getDb();
    const rows = await db.update(projects).set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(and(eq(projects.id, id), eq(projects.ownerId, owner), isNull(projects.deletedAt))).returning({ id: projects.id });
    if (!rows.length) return apiError("项目不存在。", 404);
    return Response.json({ ok: true });
  } catch (error) { return serverError(error); }
}
