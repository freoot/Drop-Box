import { env } from "cloudflare:workers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { media } from "@/db/schema";

export async function saveMedia(ownerId: string, projectId: string, kind: string, data: Uint8Array, mimeType: string, filename: string) {
  if (!env.BUCKET) throw new Error("素材存储暂不可用。");
  const id = crypto.randomUUID();
  const objectKey = `${ownerId}/${projectId}/${id}`;
  await env.BUCKET.put(objectKey, data, { httpMetadata: { contentType: mimeType } });
  await getDb().insert(media).values({ id, projectId, ownerId, kind, objectKey, mimeType, filename, size: data.byteLength, createdAt: new Date().toISOString() });
  return { id, url: `/api/media/${id}`, mimeType, filename, size: data.byteLength };
}

export async function getOwnedMedia(id: string, ownerId: string) {
  const [row] = await getDb().select().from(media).where(and(eq(media.id, id), eq(media.ownerId, ownerId))).limit(1);
  return row || null;
}
