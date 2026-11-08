import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { initialData, safeProjectData, type Project, type ProjectData, type StartMode } from "@/lib/project";

export function ownerFromRequest(request: Request): string | null {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (owner) return owner;
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return "local-preview";
  return null;
}

export function toProject(row: typeof projects.$inferSelect): Project {
  let parsed: unknown = {};
  try { parsed = JSON.parse(row.data); } catch { /* preserve access to the record */ }
  return { id: row.id, title: row.title, mode: row.mode as StartMode, data: safeProjectData(parsed), createdAt: row.createdAt, updatedAt: row.updatedAt, deletedAt: row.deletedAt };
}

export async function getOwnedProject(id: string, ownerId: string) {
  const db = getDb();
  const [row] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, ownerId))).limit(1);
  return row ? toProject(row) : null;
}

export async function listOwnedProjects(ownerId: string, deleted = false) {
  const db = getDb();
  const rows = await db.select().from(projects).where(and(eq(projects.ownerId, ownerId), deleted ? isNotNull(projects.deletedAt) : isNull(projects.deletedAt))).orderBy(desc(projects.updatedAt)).limit(100);
  return rows.map(toProject);
}

export async function createProject(ownerId: string, mode: StartMode, title: string, input: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const data = initialData(mode, input);
  const row = { id: crypto.randomUUID(), ownerId, title, mode, data: JSON.stringify(data), createdAt: now, updatedAt: now, deletedAt: null };
  await db.insert(projects).values(row);
  return toProject(row);
}

export async function updateProject(id: string, ownerId: string, title: string, data: ProjectData) {
  const db = getDb();
  const now = new Date().toISOString();
  const result = await db.update(projects).set({ title, data: JSON.stringify(safeProjectData(data)), updatedAt: now }).where(and(eq(projects.id, id), eq(projects.ownerId, ownerId), isNull(projects.deletedAt))).returning();
  return result[0] ? toProject(result[0]) : null;
}
