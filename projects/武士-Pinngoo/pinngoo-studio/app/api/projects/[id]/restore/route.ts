import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { apiError, serverError } from "@/lib/api";
import { ownerFromRequest } from "@/lib/server-projects";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = ownerFromRequest(request);
  if (!owner) return apiError("请先登录。", 401);
  try {
    const rows = await getDb().update(projects).set({ deletedAt: null, updatedAt: new Date().toISOString() }).where(and(eq(projects.id, (await params).id), eq(projects.ownerId, owner), isNotNull(projects.deletedAt))).returning({ id: projects.id });
    if (!rows.length) return apiError("回收站中没有这个项目。", 404);
    return Response.json({ ok: true });
  } catch (error) { return serverError(error); }
}
